//! Hearing when the developer starts and stops talking, for hands-free
//! conversation (docs/ux.md §6).
//!
//! Silero VAD (MIT) scores each 32 ms of audio for speech. `Turns` turns
//! those scores into a conversation: speech starts, pauses, resumes, ends.
//! A pause only ends the turn when what was said sounds finished; "we could
//! use Redis because..." gets more time than "keep it."

use std::path::Path;
use std::sync::Mutex;

/// Silero works on 512 samples at 16 kHz.
pub const CHUNK: usize = 512;
pub const RATE: u32 = 16_000;
const CONTEXT: usize = 64;
const CHUNK_MS: u32 = 32;

pub struct Silero {
    session: Mutex<ort::session::Session>,
    state: Vec<f32>,
    context: Vec<f32>,
}

impl Silero {
    pub fn load(path: &Path) -> Result<Self, String> {
        let session = ort::session::Session::builder()
            .map_err(|e| e.to_string())?
            .with_intra_threads(1)
            .map_err(|e| e.to_string())?
            .commit_from_file(path)
            .map_err(|e| format!("the listening model didn't load: {e}"))?;
        Ok(Self {
            session: Mutex::new(session),
            state: vec![0.0; 2 * 128],
            context: vec![0.0; CONTEXT],
        })
    }

    pub fn reset(&mut self) {
        self.state.iter_mut().for_each(|x| *x = 0.0);
        self.context.iter_mut().for_each(|x| *x = 0.0);
    }

    /// How likely `chunk` (512 samples, 16 kHz) is speech, 0 to 1.
    pub fn speech(&mut self, chunk: &[f32]) -> Result<f32, String> {
        use ort::value::Tensor;
        // Silero v5 needs the end of the previous chunk in front of this one.
        let mut input = Vec::with_capacity(CONTEXT + CHUNK);
        input.extend_from_slice(&self.context);
        input.extend_from_slice(chunk);
        let inputs = ort::inputs![
            "input" => Tensor::from_array(([1usize, CONTEXT + CHUNK], input)).map_err(|e| e.to_string())?,
            "state" => Tensor::from_array(([2usize, 1, 128], self.state.clone())).map_err(|e| e.to_string())?,
            "sr" => Tensor::from_array(((), vec![i64::from(RATE)])).map_err(|e| e.to_string())?,
        ];
        let mut session = crate::state::lock(&self.session);
        let out = session.run(inputs).map_err(|e| e.to_string())?;
        let (_, prob) = out["output"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        let (_, state) = out["stateN"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        let prob = prob.first().copied().unwrap_or(0.0);
        let n = self.state.len();
        self.state.copy_from_slice(&state[..n]);
        self.context
            .copy_from_slice(&chunk[chunk.len() - CONTEXT..]);
        Ok(prob)
    }
}

/// Above this, a chunk counts as speech; below `QUIET`, as silence.
const SPEECH: f32 = 0.5;
const QUIET: f32 = 0.35;
/// Speech must last this long to start a turn (a cough doesn't).
const START_MS: u32 = 96;
/// After this much silence, look at what was said.
pub const PAUSE_MS: u32 = 700;
/// After this much, the turn is over whatever was said.
pub const END_MS: u32 = 1_600;

/// What happened in the conversation on this chunk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Turn {
    /// Nothing new.
    Nothing,
    /// The developer started talking.
    Started,
    /// They went quiet long enough to check whether they've finished.
    Paused,
    /// They carried on after a pause.
    Resumed,
    /// Quiet for so long the turn is over.
    Ended,
}

#[derive(Debug, Default)]
pub struct Turns {
    talking: bool,
    speech_ms: u32,
    silence_ms: u32,
    paused: bool,
}

impl Turns {
    pub fn talking(&self) -> bool {
        self.talking
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Feeds one chunk's speech probability.
    pub fn feed(&mut self, prob: f32) -> Turn {
        if !self.talking {
            self.speech_ms = if prob >= SPEECH {
                self.speech_ms + CHUNK_MS
            } else {
                0
            };
            if self.speech_ms >= START_MS {
                self.talking = true;
                self.silence_ms = 0;
                return Turn::Started;
            }
            return Turn::Nothing;
        }
        if prob >= SPEECH {
            self.speech_ms += CHUNK_MS;
            if self.speech_ms >= START_MS {
                self.silence_ms = 0;
                if std::mem::take(&mut self.paused) {
                    return Turn::Resumed;
                }
            }
            return Turn::Nothing;
        }
        if prob < QUIET {
            self.speech_ms = 0;
            self.silence_ms += CHUNK_MS;
        }
        if self.silence_ms >= END_MS {
            *self = Self::default();
            return Turn::Ended;
        }
        if self.silence_ms >= PAUSE_MS && !self.paused {
            self.paused = true;
            return Turn::Paused;
        }
        Turn::Nothing
    }
}

/// Words people trail off on when they haven't finished the thought.
const TRAILING: &[&str] = &[
    "and", "but", "so", "or", "because", "cause", "like", "um", "uh", "erm", "the", "a", "an",
    "to", "if", "then", "with", "of", "for", "that", "which", "is", "are", "was", "i", "we", "my",
    "your", "our", "maybe", "also", "just", "since", "when", "while", "than", "about",
];

/// Whether a transcript sounds like a finished thought.
pub fn sounds_finished(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    if t.ends_with(',')
        || t.ends_with('-')
        || t.ends_with('—')
        || t.ends_with("...")
        || t.ends_with('…')
    {
        return false;
    }
    let last = t
        .trim_end_matches(|c: char| !c.is_alphanumeric())
        .rsplit(|c: char| !c.is_alphanumeric() && c != '\'')
        .next()
        .unwrap_or("")
        .to_lowercase();
    !TRAILING.contains(&last.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(turns: &mut Turns, prob: f32, ms: u32) -> Vec<Turn> {
        (0..ms / CHUNK_MS)
            .map(|_| turns.feed(prob))
            .filter(|t| *t != Turn::Nothing)
            .collect()
    }

    #[test]
    fn a_cough_is_not_a_turn() {
        let mut t = Turns::default();
        assert_eq!(feed(&mut t, 0.9, 64), []);
        assert_eq!(feed(&mut t, 0.0, 500), []);
        assert!(!t.talking());
    }

    #[test]
    fn talking_pausing_resuming_and_ending() {
        let mut t = Turns::default();
        assert_eq!(feed(&mut t, 0.9, 1_000), [Turn::Started]);
        assert_eq!(feed(&mut t, 0.1, 800), [Turn::Paused]);
        assert_eq!(feed(&mut t, 0.9, 300), [Turn::Resumed]);
        assert_eq!(feed(&mut t, 0.1, 1_700), [Turn::Paused, Turn::Ended]);
        assert!(!t.talking());
    }

    #[test]
    fn uncertain_chunks_neither_start_nor_end_silence() {
        let mut t = Turns::default();
        feed(&mut t, 0.9, 200);
        // Between the thresholds: not speech, not silence.
        assert_eq!(feed(&mut t, 0.4, 2_000), []);
        assert!(t.talking());
    }

    #[test]
    fn knows_a_trailing_thought_from_a_finished_one() {
        assert!(sounds_finished("Keep it."));
        assert!(sounds_finished("go with in memory"));
        assert!(sounds_finished("Why not Redis?"));
        assert!(!sounds_finished("We could use Redis because"));
        assert!(!sounds_finished("We could use Redis because."));
        assert!(!sounds_finished("I think, um,"));
        assert!(!sounds_finished("and the"));
        assert!(!sounds_finished("so..."));
        assert!(!sounds_finished(""));
    }

    /// With FRANK_VOICE_DIR holding silero_vad.onnx and a test-af_heart.wav
    /// (24 kHz speech), checks Silero hears the speech and the silence.
    #[test]
    fn hears_real_speech() {
        let Ok(dir) = std::env::var("FRANK_VOICE_DIR") else {
            return;
        };
        let dir = std::path::PathBuf::from(dir);
        let wav = std::fs::read(dir.join("test-af_heart.wav")).unwrap();
        let speech: Vec<f32> = wav[44..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| i16::from_le_bytes(*b) as f32 / 32768.0)
            .collect();
        let speech = crate::voice::resample(&speech, 24_000, RATE);
        let mut clip = vec![0.0; RATE as usize];
        clip.extend(&speech);
        clip.extend(vec![0.0; 2 * RATE as usize]);

        let mut silero = Silero::load(&dir.join("silero_vad.onnx")).unwrap();
        let mut turns = Turns::default();
        let events: Vec<(usize, Turn)> = clip
            .as_chunks::<CHUNK>()
            .0
            .iter()
            .enumerate()
            .map(|(i, c)| (i, turns.feed(silero.speech(c.as_slice()).unwrap())))
            .filter(|(_, t)| *t != Turn::Nothing)
            .collect();
        eprintln!("{events:?}");
        let ms = |i: usize| i as u32 * CHUNK_MS;
        let started = events.iter().find(|(_, t)| *t == Turn::Started).unwrap().0;
        assert!(
            (1_000..1_600).contains(&ms(started)),
            "starts with the speech: {} ms",
            ms(started)
        );
        assert!(
            events.iter().any(|(_, t)| *t == Turn::Ended),
            "ends in the silence after"
        );
    }
}
