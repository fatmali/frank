//! Kokoro-82M (Apache 2.0): Frank's natural voice, on this Mac.
//!
//! Text becomes phonemes (g2p.rs), phonemes become token ids, and the model
//! turns tokens plus a voice's style vector into 24 kHz audio. Runs on ONNX
//! Runtime; a sentence takes a fraction of its own length to make.

use crate::g2p::Lexicon;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;

pub const SAMPLE_RATE: u32 = 24_000;
pub const MODEL_FILE: &str = "kokoro-v1.0.fp16.onnx";
pub const VOICES_FILE: &str = "voices-v1.0.bin";
pub const GOLD_FILE: &str = "us_gold.json";
pub const SILVER_FILE: &str = "us_silver.json";
/// Kokoro reads at most this many tokens at once.
const MAX_TOKENS: usize = 510;
const STYLE: usize = 256;

/// The voices Frank offers: (Kokoro id, name, description).
pub const VOICES: &[(&str, &str, &str)] = &[
    ("am_michael", "Michael", "American, calm"),
    ("af_heart", "Heart", "American, warm"),
    ("bm_george", "George", "British, dry"),
    ("bf_emma", "Emma", "British, clear"),
    ("am_fenrir", "Fenrir", "American, deep"),
    ("af_bella", "Bella", "American, bright"),
];
pub const DEFAULT_VOICE: &str = "am_michael";

pub struct Kokoro {
    session: Mutex<ort::session::Session>,
    /// Each voice: one 256-wide style row per input length.
    voices: HashMap<String, Vec<f32>>,
    lexicon: Lexicon,
}

impl Kokoro {
    /// Loads the model, voices and dictionaries from `dir`.
    pub fn load(dir: &Path) -> Result<Self, String> {
        let read = |name: &str| std::fs::read(dir.join(name)).map_err(|e| format!("{name}: {e}"));
        let gold = String::from_utf8_lossy(&read(GOLD_FILE)?).into_owned();
        let silver = String::from_utf8_lossy(&read(SILVER_FILE)?).into_owned();
        let lexicon = Lexicon::load(&gold, &silver)?;
        let voices = read_voices(&read(VOICES_FILE)?)?;
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
        let session = ort::session::Session::builder()
            .map_err(|e| e.to_string())?
            .with_intra_threads(threads)
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join(MODEL_FILE))
            .map_err(|e| format!("the voice model didn't load: {e}"))?;
        Ok(Self {
            session: Mutex::new(session),
            voices,
            lexicon,
        })
    }

    /// Says `text` in `voice`: mono samples at 24 kHz.
    pub fn speak(&self, text: &str, voice: &str, speed: f32) -> Result<Vec<f32>, String> {
        let phonemes = self.lexicon.phonemes(text);
        let mut ids = tokens(&phonemes);
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        ids.truncate(MAX_TOKENS - 2);
        let styles = self
            .voices
            .get(voice)
            .or_else(|| self.voices.get(DEFAULT_VOICE))
            .ok_or("no voices loaded")?;
        // The style row depends on how long the input is.
        let row = ids.len().min(styles.len() / STYLE - 1);
        let style = styles[row * STYLE..(row + 1) * STYLE].to_vec();
        let n = ids.len() + 2;
        let mut padded = Vec::with_capacity(n);
        padded.push(0i64);
        padded.extend(ids);
        padded.push(0);

        use ort::value::Tensor;
        let inputs = ort::inputs![
            "tokens" => Tensor::from_array(([1usize, n], padded)).map_err(|e| e.to_string())?,
            "style" => Tensor::from_array(([1usize, STYLE], style)).map_err(|e| e.to_string())?,
            "speed" => Tensor::from_array(([1usize], vec![speed])).map_err(|e| e.to_string())?,
        ];
        let mut session = crate::state::lock(&self.session);
        let outputs = session.run(inputs).map_err(|e| e.to_string())?;
        let (_, audio) = outputs["audio"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        Ok(audio.to_vec())
    }
}

/// Kokoro's phoneme alphabet: symbol to token id.
const VOCAB: &[(char, i64)] = &[
    (';', 1),
    (':', 2),
    (',', 3),
    ('.', 4),
    ('!', 5),
    ('?', 6),
    ('—', 9),
    ('…', 10),
    ('"', 11),
    ('(', 12),
    (')', 13),
    ('“', 14),
    ('”', 15),
    (' ', 16),
    ('\u{303}', 17),
    ('ʣ', 18),
    ('ʥ', 19),
    ('ʦ', 20),
    ('ʨ', 21),
    ('ᵝ', 22),
    ('\u{ab67}', 23),
    ('A', 24),
    ('I', 25),
    ('O', 31),
    ('Q', 33),
    ('S', 35),
    ('T', 36),
    ('W', 39),
    ('Y', 41),
    ('ᵊ', 42),
    ('a', 43),
    ('b', 44),
    ('c', 45),
    ('d', 46),
    ('e', 47),
    ('f', 48),
    ('h', 50),
    ('i', 51),
    ('j', 52),
    ('k', 53),
    ('l', 54),
    ('m', 55),
    ('n', 56),
    ('o', 57),
    ('p', 58),
    ('q', 59),
    ('r', 60),
    ('s', 61),
    ('t', 62),
    ('u', 63),
    ('v', 64),
    ('w', 65),
    ('x', 66),
    ('y', 67),
    ('z', 68),
    ('ɑ', 69),
    ('ɐ', 70),
    ('ɒ', 71),
    ('æ', 72),
    ('β', 75),
    ('ɔ', 76),
    ('ɕ', 77),
    ('ç', 78),
    ('ɖ', 80),
    ('ð', 81),
    ('ʤ', 82),
    ('ə', 83),
    ('ɚ', 85),
    ('ɛ', 86),
    ('ɜ', 87),
    ('ɟ', 90),
    ('ɡ', 92),
    ('ɥ', 99),
    ('ɨ', 101),
    ('ɪ', 102),
    ('ʝ', 103),
    ('ɯ', 110),
    ('ɰ', 111),
    ('ŋ', 112),
    ('ɳ', 113),
    ('ɲ', 114),
    ('ɴ', 115),
    ('ø', 116),
    ('ɸ', 118),
    ('θ', 119),
    ('œ', 120),
    ('ɹ', 123),
    ('ɾ', 125),
    ('ɻ', 126),
    ('ʁ', 128),
    ('ɽ', 129),
    ('ʂ', 130),
    ('ʃ', 131),
    ('ʈ', 132),
    ('ʧ', 133),
    ('ʊ', 135),
    ('ʋ', 136),
    ('ʌ', 138),
    ('ɣ', 139),
    ('ɤ', 140),
    ('χ', 142),
    ('ʎ', 143),
    ('ʒ', 147),
    ('ʔ', 148),
    ('ˈ', 156),
    ('ˌ', 157),
    ('ː', 158),
    ('ʰ', 162),
    ('ʲ', 164),
    ('↓', 169),
    ('→', 171),
    ('↗', 172),
    ('↘', 173),
    ('ᵻ', 177),
];

fn tokens(phonemes: &str) -> Vec<i64> {
    phonemes
        .chars()
        .filter_map(|c| VOCAB.iter().find(|(v, _)| *v == c).map(|(_, id)| *id))
        .collect()
}

/// Reads Kokoro's voices file: an uncompressed .npz of float32 arrays.
fn read_voices(bytes: &[u8]) -> Result<HashMap<String, Vec<f32>>, String> {
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("voices: {e}"))?;
    let mut voices = HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("voices: {e}"))?;
        let Some(name) = file.name().strip_suffix(".npy").map(str::to_owned) else {
            continue;
        };
        let mut data = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut data).map_err(|e| e.to_string())?;
        voices.insert(name, read_npy_f32(&data)?);
    }
    Ok(voices)
}

/// The float32 payload of a .npy file.
fn read_npy_f32(data: &[u8]) -> Result<Vec<f32>, String> {
    if data.len() < 10 || &data[..6] != b"\x93NUMPY" {
        return Err("not a .npy array".into());
    }
    let (header_len, start) = match data[6] {
        1 => (u16::from_le_bytes([data[8], data[9]]) as usize, 10),
        _ => (
            u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize,
            12,
        ),
    };
    let header = String::from_utf8_lossy(&data[start..start + header_len]);
    if !header.contains("'<f4'") {
        return Err(format!("unexpected voice format: {header}"));
    }
    Ok(data[start + header_len..]
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_phonemes_to_kokoro_tokens() {
        // "ði plˈæn." as the Python reference produces it.
        assert_eq!(tokens("ði plˈæn."), [81, 51, 16, 58, 54, 156, 72, 56, 4]);
        assert!(
            tokens("\u{1F986}").is_empty(),
            "unknown symbols are dropped"
        );
    }

    #[test]
    fn reads_npy_arrays() {
        let header = "{'descr': '<f4', 'fortran_order': False, 'shape': (2,), }";
        let mut npy = b"\x93NUMPY\x01\x00".to_vec();
        npy.extend((header.len() as u16).to_le_bytes());
        npy.extend(header.as_bytes());
        npy.extend(1.5f32.to_le_bytes());
        npy.extend((-2.0f32).to_le_bytes());
        assert_eq!(read_npy_f32(&npy).unwrap(), [1.5, -2.0]);
    }

    /// With FRANK_VOICE_DIR set to a folder holding the voice pack, speaks a
    /// sentence and writes it to FRANK_VOICE_DIR/test-<voice>.wav.
    #[test]
    fn speaks_with_the_real_model() {
        let Ok(dir) = std::env::var("FRANK_VOICE_DIR") else {
            return;
        };
        let dir = std::path::PathBuf::from(dir);
        let started = std::time::Instant::now();
        let kokoro = Kokoro::load(&dir).expect("voice pack loads");
        eprintln!("loaded in {} ms", started.elapsed().as_millis());
        for (voice, _, _) in VOICES.iter().take(2) {
            let started = std::time::Instant::now();
            let audio = kokoro
                .speak(
                    "The plan adds Redis. You run one instance, so you don't need it yet.",
                    voice,
                    1.0,
                )
                .unwrap();
            let seconds = audio.len() as f32 / SAMPLE_RATE as f32;
            eprintln!(
                "{voice}: {seconds:.1} s of speech in {} ms",
                started.elapsed().as_millis()
            );
            assert!(seconds > 2.0 && seconds < 10.0, "{seconds}");
            write_wav(&dir.join(format!("test-{voice}.wav")), &audio);
        }
    }

    fn write_wav(path: &Path, samples: &[f32]) {
        let mut out = Vec::new();
        let data_len = (samples.len() * 2) as u32;
        out.extend(b"RIFF");
        out.extend((36 + data_len).to_le_bytes());
        out.extend(b"WAVEfmt ");
        out.extend(16u32.to_le_bytes());
        out.extend(1u16.to_le_bytes());
        out.extend(1u16.to_le_bytes());
        out.extend(SAMPLE_RATE.to_le_bytes());
        out.extend((SAMPLE_RATE * 2).to_le_bytes());
        out.extend(2u16.to_le_bytes());
        out.extend(16u16.to_le_bytes());
        out.extend(b"data");
        out.extend(data_len.to_le_bytes());
        for s in samples {
            out.extend(((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
        }
        std::fs::write(path, out).unwrap();
    }
}
