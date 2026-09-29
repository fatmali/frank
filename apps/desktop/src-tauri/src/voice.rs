//! Talking to Frank (docs/ux.md §6): push-to-talk and hands-free
//! conversation, transcribed on this Mac with Whisper.
//!
//! Audio stays on this machine and is never written to disk. The listening
//! models are downloaded once, with consent (packs.rs).

use crate::packs::Pack;
use crate::state::lock;
use crate::vad::{self, Silero, Turn, Turns};
use serde::Serialize;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const WHISPER_FILE: &str = "ggml-base.en.bin";
const VAD_FILE: &str = "silero_vad.onnx";
/// Whisper wants 16 kHz mono.
const WHISPER_RATE: u32 = 16_000;
/// Nobody talks to a duck for longer than this in one go.
const MAX_RECORDING: Duration = Duration::from_secs(90);
/// Shorter than this is a slip of the key, not speech.
const MIN_SPEECH: Duration = Duration::from_millis(300);
const LEVEL_EVERY: Duration = Duration::from_millis(50);
/// Hands-free stops listening after this long with nobody talking.
const HANDS_FREE_IDLE: Duration = Duration::from_secs(45);
/// Speech kept from just before a turn starts, so first words aren't clipped.
const PRE_ROLL_CHUNKS: usize = 10;

const MIC_DENIED: &str =
    "Frank can't hear you. Allow the microphone in System Settings, Privacy, Microphone.";
const NO_MIC: &str = "Frank can't find a microphone.";

/// What the panel hears about voice. Mirrors `VoiceEvent` in src/host.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum VoiceEvent {
    /// Push-to-talk is recording.
    Listening,
    Level {
        level: f32,
    },
    Transcribing,
    Heard {
        text: String,
    },
    Failed {
        message: String,
    },
    /// A pack has to be downloaded first; nothing was recorded.
    NeedsPack {
        pack: &'static str,
        megabytes: u32,
    },
    Downloading {
        pack: &'static str,
        fraction: f32,
    },
    PackReady {
        pack: &'static str,
    },
    /// A sentence started playing; `id` is what it's about.
    Speaking {
        id: String,
    },
    /// Frank finished (or stopped) speaking.
    Spoken,
    /// Hands-free: "waiting" for you, "hearing" you, "checking" whether you've
    /// finished, "paused" while Frank answers, or "off".
    HandsFree {
        state: &'static str,
    },
}

fn emit(app: &AppHandle, event: VoiceEvent) {
    let _ = app.emit_to("panel", "voice", event);
}

#[derive(Default)]
pub struct Voice {
    recording: Mutex<Option<Recording>>,
    whisper: Mutex<Option<Arc<whisper_rs::WhisperContext>>>,
    hands_free: Mutex<Option<HandsFree>>,
}

struct Recording {
    stop: mpsc::Sender<()>,
    done: mpsc::Receiver<Result<Vec<f32>, String>>,
    started: Instant,
}

struct HandsFree {
    stop: mpsc::Sender<()>,
    /// While Frank answers, what the microphone hears is ignored, so he
    /// never mistakes his own voice for the developer's.
    paused: Arc<AtomicBool>,
}

fn whisper_path() -> PathBuf {
    Pack::Listening.path(WHISPER_FILE)
}

fn vad_path() -> PathBuf {
    Pack::Listening.path(VAD_FILE)
}

fn needs_pack(app: &AppHandle, pack: Pack) {
    emit(
        app,
        VoiceEvent::NeedsPack {
            pack: pack.id(),
            megabytes: pack.megabytes_missing().max(1),
        },
    );
}

impl Voice {
    /// Push-to-talk: starts recording. Without Whisper, asks for it instead.
    pub fn start(&self, app: &AppHandle) {
        app.state::<crate::speech::Speech>().stop();
        if !whisper_path().exists() {
            return needs_pack(app, Pack::Listening);
        }
        if lock(&self.hands_free).is_some() {
            // Already listening hands-free; holding the key changes nothing.
            return;
        }
        let mut slot = lock(&self.recording);
        if slot.is_some() {
            return;
        }
        let (stop_tx, stop_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let levels = app.clone();
        std::thread::spawn(move || {
            let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
            let sink = samples.clone();
            let mut meter = Meter::new(move |level| emit(&levels, VoiceEvent::Level { level }));
            let result = open_microphone(move |mono, rate| {
                meter.push(mono);
                lock(&sink).extend(resample(mono, rate, WHISPER_RATE));
            })
            .map(|stream| {
                let _ = stop_rx.recv_timeout(MAX_RECORDING);
                drop(stream);
                std::mem::take(&mut *lock(&samples))
            });
            let _ = done_tx.send(result);
        });
        *slot = Some(Recording {
            stop: stop_tx,
            done: done_rx,
            started: Instant::now(),
        });
        emit(app, VoiceEvent::Listening);
        self.warm_up(app);
    }

    /// Push-to-talk: stops recording and transcribes, off the main thread.
    pub fn stop(&self, app: &AppHandle) {
        let Some(recording) = lock(&self.recording).take() else {
            return;
        };
        let _ = recording.stop.send(());
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let too_short = recording.started.elapsed() < MIN_SPEECH;
            let heard_nothing = |app: &AppHandle| {
                emit(
                    app,
                    VoiceEvent::Heard {
                        text: String::new(),
                    },
                )
            };
            let samples = match recording.done.recv() {
                Ok(Ok(s)) => s,
                Ok(Err(message)) => return emit(&app, VoiceEvent::Failed { message }),
                Err(_) => return heard_nothing(&app),
            };
            if too_short {
                return heard_nothing(&app);
            }
            if is_digital_silence(&samples) {
                // macOS hands a denied app a stream of exact zeros.
                return emit(
                    &app,
                    VoiceEvent::Failed {
                        message: MIC_DENIED.into(),
                    },
                );
            }
            emit(&app, VoiceEvent::Transcribing);
            let event = match app.state::<Voice>().transcribe(&samples) {
                Ok(text) => VoiceEvent::Heard { text },
                Err(message) => VoiceEvent::Failed { message },
            };
            emit(&app, event);
        });
    }

    /// Hands-free: listens until told to stop, turning each thing the
    /// developer says into a "heard" event when they've finished saying it.
    pub fn hands_free_start(&self, app: &AppHandle) {
        app.state::<crate::speech::Speech>().stop();
        if !Pack::Listening.installed() {
            return needs_pack(app, Pack::Listening);
        }
        let mut slot = lock(&self.hands_free);
        if slot.is_some() {
            return;
        }
        let (stop_tx, stop_rx) = mpsc::channel();
        let paused = Arc::new(AtomicBool::new(false));
        let flag = paused.clone();
        let app2 = app.clone();
        std::thread::spawn(move || {
            if let Err(message) = hands_free(&app2, &stop_rx, &flag) {
                emit(&app2, VoiceEvent::Failed { message });
            }
            *lock(&app2.state::<Voice>().hands_free) = None;
            emit(&app2, VoiceEvent::HandsFree { state: "off" });
        });
        *slot = Some(HandsFree {
            stop: stop_tx,
            paused,
        });
        emit(app, VoiceEvent::HandsFree { state: "waiting" });
        self.warm_up(app);
    }

    /// Hands-free: Frank has answered; listen for the developer again.
    pub fn hands_free_resume(&self, app: &AppHandle) {
        if let Some(h) = lock(&self.hands_free).as_ref()
            && h.paused.swap(false, Ordering::SeqCst)
        {
            emit(app, VoiceEvent::HandsFree { state: "waiting" });
        }
    }

    pub fn hands_free_stop(&self) {
        if let Some(h) = lock(&self.hands_free).as_ref() {
            let _ = h.stop.send(());
        }
    }

    /// Loads Whisper (and the natural voice) while the developer talks.
    fn warm_up(&self, app: &AppHandle) {
        let warm = app.clone();
        std::thread::spawn(move || {
            let _ = warm.state::<Voice>().whisper();
            warm.state::<crate::speech::Speech>().warm_up();
        });
    }

    /// 16 kHz mono speech to text.
    fn transcribe(&self, audio: &[f32]) -> Result<String, String> {
        let ctx = self.whisper()?;
        let started = Instant::now();
        let seconds = audio.len() as f32 / WHISPER_RATE as f32;
        let mut state = ctx
            .create_state()
            .map_err(|e| format!("Couldn't start transcribing: {e}"))?;
        let mut params =
            whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_no_context(true);
        params.set_suppress_blank(true);
        params.set_single_segment(true);
        // Whisper pads everything to 30 seconds; a window sized to what was
        // said is several times faster for a sentence or two.
        params.set_audio_ctx(audio_ctx(seconds));
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
        params.set_n_threads(threads as i32);
        state
            .full(params, audio)
            .map_err(|e| format!("Couldn't transcribe: {e}"))?;
        let text: Vec<String> = state
            .as_iter()
            .filter_map(|s| s.to_str_lossy().ok().map(|t| t.into_owned()))
            .collect();
        eprintln!(
            "frank: transcribed {seconds:.1} s of speech in {} ms",
            started.elapsed().as_millis()
        );
        Ok(clean_transcript(&text.join(" ")))
    }

    /// The Whisper model, loaded once.
    fn whisper(&self) -> Result<Arc<whisper_rs::WhisperContext>, String> {
        let mut slot = lock(&self.whisper);
        if let Some(ctx) = slot.as_ref() {
            return Ok(ctx.clone());
        }
        let path = whisper_path();
        let ctx = whisper_rs::WhisperContext::new_with_params(
            &path,
            whisper_rs::WhisperContextParameters::default(),
        )
        .map_err(|_| {
            // A broken download: remove it so the next try downloads again.
            let _ = std::fs::remove_file(&path);
            "The speech model didn't load. Try talking again to download it again.".to_owned()
        })?;
        let ctx = Arc::new(ctx);
        *slot = Some(ctx.clone());
        Ok(ctx)
    }
}

/// The hands-free loop: listen, hand each finished thought to the panel,
/// then wait while Frank answers.
fn hands_free(
    app: &AppHandle,
    stop: &mpsc::Receiver<()>,
    paused: &AtomicBool,
) -> Result<(), String> {
    let mut ear = Ear::new(Silero::load(&vad_path())?);
    let (tx, rx) = mpsc::channel::<Vec<f32>>();
    let _stream = open_microphone(move |mono, rate| {
        let _ = tx.send(resample(mono, rate, vad::RATE));
    })?;

    let levels = app.clone();
    let mut meter = Meter::new(move |level| emit(&levels, VoiceEvent::Level { level }));
    let mut pending: Vec<f32> = Vec::new();
    let mut last_speech = Instant::now();
    let mut heard_anything = false;
    let started = Instant::now();
    let voice = app.state::<Voice>();
    let mut transcribe = |audio: &[f32]| voice.transcribe(audio);
    let mut heard = Vec::new();

    loop {
        if stop.try_recv().is_ok() {
            return Ok(());
        }
        let Ok(samples) = rx.recv_timeout(Duration::from_millis(100)) else {
            continue;
        };
        if paused.load(Ordering::SeqCst) {
            // Frank is answering: don't listen to him, or to the room.
            pending.clear();
            ear.reset();
            last_speech = Instant::now();
            continue;
        }
        heard_anything |= !is_digital_silence(&samples);
        if !heard_anything && started.elapsed() > Duration::from_secs(2) {
            return Err(MIC_DENIED.into());
        }
        pending.extend(samples);
        while pending.len() >= vad::CHUNK {
            let chunk: Vec<f32> = pending.drain(..vad::CHUNK).collect();
            meter.push(&chunk);
            ear.hear(&chunk, &mut transcribe, &mut heard)?;
            if ear.talking() {
                last_speech = Instant::now();
            }
            for h in heard.drain(..) {
                match h {
                    Heard::State(state) => emit(app, VoiceEvent::HandsFree { state }),
                    Heard::Said(text) => {
                        paused.store(true, Ordering::SeqCst);
                        emit(app, VoiceEvent::HandsFree { state: "paused" });
                        emit(app, VoiceEvent::Heard { text });
                        pending.clear();
                    }
                }
            }
        }
        if !ear.talking() && last_speech.elapsed() > HANDS_FREE_IDLE {
            return Ok(());
        }
    }
}

/// What hands-free made of a chunk of audio.
#[derive(Debug, Clone, PartialEq)]
enum Heard {
    /// "hearing", "checking" or "waiting", for the panel.
    State(&'static str),
    /// The developer finished a thought.
    Said(String),
}

/// Follows the developer's turns: when they start, pause, carry on, and
/// finish, keeping what they said.
struct Ear {
    silero: Silero,
    turns: Turns,
    /// The last moments before a turn starts, so the first word isn't lost.
    pre_roll: VecDeque<Vec<f32>>,
    utterance: Vec<f32>,
}

impl Ear {
    fn new(silero: Silero) -> Self {
        Self {
            silero,
            turns: Turns::default(),
            pre_roll: VecDeque::new(),
            utterance: Vec::new(),
        }
    }

    fn reset(&mut self) {
        self.silero.reset();
        self.turns.reset();
        self.pre_roll.clear();
        self.utterance.clear();
    }

    fn talking(&self) -> bool {
        self.turns.talking()
    }

    /// Hears one `vad::CHUNK` of 16 kHz audio. When the developer goes
    /// quiet, `transcribe` shows whether the thought sounds finished.
    fn hear(
        &mut self,
        chunk: &[f32],
        transcribe: &mut impl FnMut(&[f32]) -> Result<String, String>,
        out: &mut Vec<Heard>,
    ) -> Result<(), String> {
        let turn = self.turns.feed(self.silero.speech(chunk)?);
        match turn {
            Turn::Nothing if self.turns.talking() => self.utterance.extend(chunk),
            Turn::Nothing => {
                self.pre_roll.push_back(chunk.to_vec());
                if self.pre_roll.len() > PRE_ROLL_CHUNKS {
                    self.pre_roll.pop_front();
                }
            }
            Turn::Started => {
                self.utterance = self.pre_roll.drain(..).flatten().collect();
                self.utterance.extend(chunk);
                out.push(Heard::State("hearing"));
            }
            Turn::Resumed => {
                self.utterance.extend(chunk);
                out.push(Heard::State("hearing"));
            }
            Turn::Paused => {
                self.utterance.extend(chunk);
                // Gone quiet: has the developer finished the thought, or are
                // they mid-sentence ("we could use Redis because...")?
                out.push(Heard::State("checking"));
                let text = transcribe(&self.utterance)?;
                if vad::sounds_finished(&text) {
                    self.said(text, out);
                } else {
                    out.push(Heard::State("hearing"));
                }
            }
            Turn::Ended => {
                // Quiet for long enough that the turn is over, finished or not.
                let text = transcribe(&self.utterance)?;
                self.said(text, out);
            }
        }
        Ok(())
    }

    fn said(&mut self, text: String, out: &mut Vec<Heard>) {
        self.turns.reset();
        self.pre_roll.clear();
        self.utterance.clear();
        if text.trim().is_empty() {
            out.push(Heard::State("waiting"));
        } else {
            out.push(Heard::Said(text));
        }
    }
}

/// Opens the default microphone. `on_audio` gets mono samples and their
/// rate; the microphone stays open until the returned stream is dropped.
fn open_microphone(
    mut on_audio: impl FnMut(&[f32], u32) + Send + 'static,
) -> Result<cpal::Stream, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host.default_input_device().ok_or(NO_MIC)?;
    let config = device
        .default_input_config()
        .map_err(|_| MIC_DENIED.to_owned())?;
    let channels = usize::from(config.channels()).max(1);
    let rate = config.sample_rate();

    macro_rules! stream {
        ($t:ty) => {{
            device.build_input_stream(
                config.clone().into(),
                move |data: &[$t], _: &cpal::InputCallbackInfo| {
                    on_audio(&downmix(data, channels), rate);
                },
                |e| eprintln!("frank: microphone: {e}"),
                None,
            )
        }};
    }
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => stream!(f32),
        cpal::SampleFormat::I16 => stream!(i16),
        cpal::SampleFormat::I32 => stream!(i32),
        cpal::SampleFormat::U16 => stream!(u16),
        cpal::SampleFormat::U8 => stream!(u8),
        other => {
            return Err(format!(
                "Frank can't read this microphone's format ({other})."
            ));
        }
    }
    .map_err(|_| MIC_DENIED.to_owned())?;
    stream.play().map_err(|_| MIC_DENIED.to_owned())?;
    Ok(stream)
}

/// Averages interleaved channels into mono f32.
fn downmix<T>(data: &[T], channels: usize) -> Vec<f32>
where
    T: cpal::Sample,
    f32: cpal::FromSample<T>,
{
    data.chunks(channels)
        .map(|frame| frame.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / frame.len() as f32)
        .collect()
}

/// Turns raw audio into a gentle 0–1 level, a few times a second.
struct Meter<F: Fn(f32)> {
    on_level: F,
    sum: f32,
    count: usize,
    last: Instant,
}

impl<F: Fn(f32)> Meter<F> {
    fn new(on_level: F) -> Self {
        Self {
            on_level,
            sum: 0.0,
            count: 0,
            last: Instant::now(),
        }
    }

    fn push(&mut self, samples: &[f32]) {
        self.sum += samples.iter().map(|s| s * s).sum::<f32>();
        self.count += samples.len();
        if self.last.elapsed() >= LEVEL_EVERY && self.count > 0 {
            (self.on_level)(level(self.sum / self.count as f32));
            self.sum = 0.0;
            self.count = 0;
            self.last = Instant::now();
        }
    }
}

/// Mean square to a 0–1 level on a log scale: -60 dB is 0, 0 dB is 1.
fn level(mean_square: f32) -> f32 {
    let db = 10.0 * mean_square.max(1e-12).log10();
    ((db + 60.0) / 60.0).clamp(0.0, 1.0)
}

fn is_digital_silence(samples: &[f32]) -> bool {
    samples.iter().all(|s| s.abs() < 1e-7)
}

/// Linear resampling. Good enough for speech into Whisper.
pub fn resample(samples: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = f64::from(from) / f64::from(to);
    let len = (samples.len() as f64 / ratio).floor() as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let at = pos.floor() as usize;
            let frac = (pos - at as f64) as f32;
            let a = samples[at];
            let b = *samples.get(at + 1).unwrap_or(&a);
            a + (b - a) * frac
        })
        .collect()
}

/// Whisper marks non-speech as "[BLANK_AUDIO]" or "(wind blowing)"; drop it.
fn clean_transcript(text: &str) -> String {
    let spoken = strip_bracketed(text);
    spoken.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_bracketed(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0usize;
    for ch in text.chars() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' if depth > 0 => depth -= 1,
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    out
}

/// Whisper's encoder context for a clip: 50 frames a second, with a little
/// headroom, never below what keeps short clips accurate.
fn audio_ctx(seconds: f32) -> i32 {
    ((seconds * 50.0).ceil() as i32 + 64).clamp(384, 1500)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmixes_interleaved_channels() {
        let stereo: [f32; 6] = [1.0, 0.0, 0.5, 0.5, -1.0, 1.0];
        assert_eq!(downmix(&stereo, 2), [0.5, 0.5, 0.0]);
        let ints: [i16; 2] = [i16::MAX, 0];
        let mono = downmix(&ints, 1);
        assert!((mono[0] - 1.0).abs() < 1e-3 && mono[1].abs() < 1e-6);
    }

    #[test]
    fn resamples_to_whisper_rate() {
        let one_second: Vec<f32> = (0..48_000).map(|i| i as f32 / 48_000.0).collect();
        let out = resample(&one_second, 48_000, WHISPER_RATE);
        assert_eq!(out.len(), 16_000);
        assert!(
            (out[8_000] - 0.5).abs() < 1e-3,
            "values follow the original"
        );
        assert_eq!(resample(&[0.1, 0.2], 16_000, 16_000), [0.1, 0.2]);
    }

    #[test]
    fn levels_are_gentle_and_bounded() {
        assert_eq!(level(0.0), 0.0);
        assert_eq!(level(1.0), 1.0);
        let speech = level(0.01); // -20 dB
        assert!(speech > 0.6 && speech < 0.7, "{speech}");
    }

    #[test]
    fn meters_a_few_times_a_second() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut meter = Meter::new(move |l| lock(&sink).push(l));
        meter.push(&[0.1; 480]);
        assert!(lock(&seen).is_empty(), "not before the interval");
        std::thread::sleep(LEVEL_EVERY);
        meter.push(&[0.1; 480]);
        assert_eq!(lock(&seen).len(), 1);
    }

    #[test]
    fn sizes_the_audio_window_to_the_clip() {
        assert_eq!(audio_ctx(2.0), 384, "short clips keep a floor");
        assert_eq!(audio_ctx(10.0), 564);
        assert_eq!(audio_ctx(45.0), 1500, "never past Whisper's 30 seconds");
    }

    #[test]
    fn tells_a_denied_microphone_from_a_quiet_room() {
        assert!(is_digital_silence(&[0.0; 1000]));
        assert!(!is_digital_silence(&[0.0, 0.0001, -0.0002]));
    }

    #[test]
    fn drops_what_whisper_marks_as_not_speech() {
        assert_eq!(
            clean_transcript(" [BLANK_AUDIO] Just one instance, (wind blowing) honestly. "),
            "Just one instance, honestly."
        );
        assert_eq!(clean_transcript("[BLANK_AUDIO]"), "");
    }

    #[test]
    fn events_match_the_panel() {
        let json = serde_json::to_value(VoiceEvent::NeedsPack {
            pack: "voices",
            megabytes: 212,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({"type": "needs-pack", "pack": "voices", "megabytes": 212})
        );
        let json = serde_json::to_value(VoiceEvent::HandsFree { state: "hearing" }).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"type": "hands-free", "state": "hearing"})
        );
        let json = serde_json::to_value(VoiceEvent::Heard {
            text: "keep it".into(),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({"type": "heard", "text": "keep it"})
        );
    }

    /// With FRANK_VOICE_DIR holding silero_vad.onnx and test-af_heart.wav,
    /// follows a real spoken turn: a finished thought goes as soon as the
    /// developer pauses; a trailing one waits for the end of the turn.
    #[test]
    fn hands_free_hears_a_turn() {
        let Ok(dir) = std::env::var("FRANK_VOICE_DIR") else {
            return;
        };
        let dir = PathBuf::from(dir);
        let wav = std::fs::read(dir.join("test-af_heart.wav")).unwrap();
        let speech: Vec<f32> = wav[44..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| i16::from_le_bytes(*b) as f32 / 32768.0)
            .collect();
        let mut clip = vec![0.0; vad::RATE as usize];
        clip.extend(resample(&speech, 24_000, vad::RATE));
        clip.extend(vec![0.0; 2 * vad::RATE as usize]);

        let run = |reply: &str| {
            let mut ear = Ear::new(Silero::load(&dir.join(VAD_FILE)).unwrap());
            let mut heard = Vec::new();
            let mut sent = 0;
            let mut transcribe = |audio: &[f32]| {
                sent = audio.len();
                Ok(reply.to_owned())
            };
            for chunk in clip.as_chunks::<{ vad::CHUNK }>().0 {
                ear.hear(chunk, &mut transcribe, &mut heard).unwrap();
            }
            (heard, sent)
        };

        let (heard, sent) = run("Keep it.");
        assert_eq!(
            heard,
            [
                Heard::State("hearing"),
                Heard::State("checking"),
                Heard::Said("Keep it.".into())
            ]
        );
        // All the speech, with a little from before it started.
        assert!(sent > speech.len() * 2 / 3 * 9 / 10, "{sent}");

        let (heard, _) = run("We could use Redis because");
        assert_eq!(
            heard,
            [
                Heard::State("hearing"),
                Heard::State("checking"),
                Heard::State("hearing"),
                Heard::Said("We could use Redis because".into())
            ]
        );
    }
}
