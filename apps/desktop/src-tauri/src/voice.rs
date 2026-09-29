//! Talking to Frank (docs/ux.md §6): push-to-talk capture, on-device
//! transcription with Whisper, and spoken replies with the system voice.
//!
//! Audio stays on this machine and is never written to disk. The speech
//! model is downloaded once, with the developer's consent, to
//! `~/.frank/models/`.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::lock;

const MODEL_FILE: &str = "ggml-base.en.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
/// Roughly, for the consent message.
const MODEL_MEGABYTES: u32 = 142;
/// Whisper wants 16 kHz mono.
const WHISPER_RATE: u32 = 16_000;
/// Nobody talks to a duck for longer than this in one go.
const MAX_RECORDING: Duration = Duration::from_secs(90);
/// Shorter than this is a slip of the key, not speech.
const MIN_SPEECH: Duration = Duration::from_millis(300);
const LEVEL_EVERY: Duration = Duration::from_millis(50);

const MIC_DENIED: &str =
    "Frank can't hear you. Allow the microphone in System Settings, Privacy, Microphone.";
const NO_MIC: &str = "Frank can't find a microphone.";

/// What the panel hears about voice. Mirrors `VoiceEvent` in src/host.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum VoiceEvent {
    Listening,
    Level { level: f32 },
    Transcribing,
    Heard { text: String },
    Failed { message: String },
    NeedsModel { megabytes: u32 },
    Downloading { fraction: f32 },
    ModelReady,
    Spoken,
}

fn emit(app: &AppHandle, event: VoiceEvent) {
    let _ = app.emit_to("panel", "voice", event);
}

#[derive(Default)]
pub struct Voice {
    recording: Mutex<Option<Recording>>,
    whisper: Mutex<Option<Arc<whisper_rs::WhisperContext>>>,
    speaker: Mutex<Option<std::process::Child>>,
    downloading: AtomicBool,
}

struct Recording {
    stop: mpsc::Sender<()>,
    done: mpsc::Receiver<Result<Captured, String>>,
    started: Instant,
}

/// Mono samples at the device's rate.
struct Captured {
    samples: Vec<f32>,
    rate: u32,
}

pub fn model_path() -> PathBuf {
    frank_core::config::frank_home()
        .join("models")
        .join(MODEL_FILE)
}

impl Voice {
    /// Starts listening. Without the speech model, asks for it instead.
    pub fn start(&self, app: &AppHandle) {
        self.stop_speaking();
        if !model_path().exists() {
            emit(
                app,
                VoiceEvent::NeedsModel {
                    megabytes: MODEL_MEGABYTES,
                },
            );
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
            let result = record(&stop_rx, move |level| {
                emit(&levels, VoiceEvent::Level { level });
            });
            let _ = done_tx.send(result);
        });
        *slot = Some(Recording {
            stop: stop_tx,
            done: done_rx,
            started: Instant::now(),
        });
        emit(app, VoiceEvent::Listening);
    }

    /// Stops listening and transcribes, off the main thread.
    pub fn stop(&self, app: &AppHandle) {
        let Some(recording) = lock(&self.recording).take() else {
            return;
        };
        let _ = recording.stop.send(());
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let too_short = recording.started.elapsed() < MIN_SPEECH;
            let captured = match recording.done.recv() {
                Ok(Ok(c)) => c,
                Ok(Err(message)) => return emit(&app, VoiceEvent::Failed { message }),
                Err(_) => {
                    return emit(
                        &app,
                        VoiceEvent::Heard {
                            text: String::new(),
                        },
                    );
                }
            };
            if too_short {
                return emit(
                    &app,
                    VoiceEvent::Heard {
                        text: String::new(),
                    },
                );
            }
            if is_digital_silence(&captured.samples) {
                // macOS hands a denied app a stream of exact zeros.
                return emit(
                    &app,
                    VoiceEvent::Failed {
                        message: MIC_DENIED.into(),
                    },
                );
            }
            emit(&app, VoiceEvent::Transcribing);
            let voice = app.state::<Voice>();
            let event = match voice.transcribe(&captured) {
                Ok(text) => VoiceEvent::Heard { text },
                Err(message) => VoiceEvent::Failed { message },
            };
            emit(&app, event);
        });
    }

    fn transcribe(&self, captured: &Captured) -> Result<String, String> {
        let ctx = self.whisper()?;
        let audio = resample(&captured.samples, captured.rate, WHISPER_RATE);
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
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
        params.set_n_threads(threads as i32);
        state
            .full(params, &audio)
            .map_err(|e| format!("Couldn't transcribe: {e}"))?;
        let text: Vec<String> = state
            .as_iter()
            .filter_map(|s| s.to_str_lossy().ok().map(|t| t.into_owned()))
            .collect();
        Ok(clean_transcript(&text.join(" ")))
    }

    /// The Whisper model, loaded once.
    fn whisper(&self) -> Result<Arc<whisper_rs::WhisperContext>, String> {
        let mut slot = lock(&self.whisper);
        if let Some(ctx) = slot.as_ref() {
            return Ok(ctx.clone());
        }
        let path = model_path();
        let ctx = whisper_rs::WhisperContext::new_with_params(
            &path,
            whisper_rs::WhisperContextParameters::default(),
        )
        .map_err(|_| {
            // A broken download: remove it so the next try downloads again.
            let _ = std::fs::remove_file(&path);
            "The speech model didn't load. Hold to talk to download it again.".to_owned()
        })?;
        let ctx = Arc::new(ctx);
        *slot = Some(ctx.clone());
        Ok(ctx)
    }

    /// Downloads the speech model, reporting progress, then says it's ready.
    pub async fn download(&self, app: &AppHandle) {
        if self.downloading.swap(true, Ordering::SeqCst) {
            return;
        }
        let result = download_model(app).await;
        self.downloading.store(false, Ordering::SeqCst);
        match result {
            Ok(()) => emit(app, VoiceEvent::ModelReady),
            Err(e) => {
                eprintln!("frank: speech model download: {e}");
                emit(
                    app,
                    VoiceEvent::Failed {
                        message: "Couldn't download the speech model. Check your connection, then hold to talk to try again.".into(),
                    },
                );
            }
        }
    }

    /// Speaks with the system voice. Stops whatever Frank was saying.
    pub fn speak(&self, app: &AppHandle, text: &str) {
        self.stop_speaking();
        let Some(mut command) = speech_command(text) else {
            emit(app, VoiceEvent::Spoken);
            return;
        };
        let Ok(child) = command.spawn() else {
            emit(app, VoiceEvent::Spoken);
            return;
        };
        let pid = child.id();
        *lock(&self.speaker) = Some(child);
        let app = app.clone();
        std::thread::spawn(move || {
            // Wait without holding the lock, so stop_speaking can kill it.
            loop {
                std::thread::sleep(Duration::from_millis(100));
                let voice = app.state::<Voice>();
                let mut slot = lock(&voice.speaker);
                match slot.as_mut() {
                    Some(child) if child.id() == pid => {
                        if !matches!(child.try_wait(), Ok(None)) {
                            *slot = None;
                            break;
                        }
                    }
                    // Replaced or stopped.
                    _ => break,
                }
            }
            emit(&app, VoiceEvent::Spoken);
        });
    }

    pub fn stop_speaking(&self) {
        if let Some(mut child) = lock(&self.speaker).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Records from the default microphone until told to stop.
fn record(
    stop: &mpsc::Receiver<()>,
    on_level: impl Fn(f32) + Send + 'static,
) -> Result<Captured, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host.default_input_device().ok_or(NO_MIC)?;
    let config = device
        .default_input_config()
        .map_err(|_| MIC_DENIED.to_owned())?;
    let channels = usize::from(config.channels()).max(1);
    let rate = config.sample_rate();
    let samples = Arc::new(Mutex::new(Vec::<f32>::with_capacity(rate as usize * 10)));
    let meter = Arc::new(Mutex::new(Meter::new(on_level)));

    macro_rules! stream {
        ($t:ty) => {{
            let samples = samples.clone();
            let meter = meter.clone();
            device.build_input_stream(
                config.clone().into(),
                move |data: &[$t], _: &cpal::InputCallbackInfo| {
                    let mono = downmix(data, channels);
                    lock(&meter).push(&mono);
                    lock(&samples).extend_from_slice(&mono);
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
    let _ = stop.recv_timeout(MAX_RECORDING);
    drop(stream);
    let samples = std::mem::take(&mut *lock(&samples));
    Ok(Captured { samples, rate })
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
fn resample(samples: &[f32], from: u32, to: u32) -> Vec<f32> {
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

/// The system's text-to-speech, if there is one.
fn speech_command(text: &str) -> Option<std::process::Command> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    #[cfg(target_os = "macos")]
    {
        let mut c = std::process::Command::new("/usr/bin/say");
        c.arg("--").arg(text);
        Some(c)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let path = frank_core::env::search_path();
        let bin = ["espeak-ng", "espeak", "spd-say"]
            .into_iter()
            .find_map(|b| frank_core::env::which_in(b, &path))?;
        let mut c = std::process::Command::new(bin);
        c.arg(text);
        Some(c)
    }
}

async fn download_model(app: &AppHandle) -> Result<(), String> {
    let path = model_path();
    let dir = path.parent().ok_or("no models folder")?;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| e.to_string())?;
    let part = path.with_extension("bin.part");
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(MODEL_URL)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| e.to_string())?;
    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| e.to_string())?;
    let mut received = 0u64;
    let mut reported = 0.0f32;
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if total > 0 {
            let fraction = received as f32 / total as f32;
            if fraction - reported >= 0.02 {
                reported = fraction;
                emit(app, VoiceEvent::Downloading { fraction });
            }
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    if total > 0 && received != total {
        let _ = tokio::fs::remove_file(&part).await;
        return Err("the download was cut short".into());
    }
    tokio::fs::rename(&part, &path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
        let json = serde_json::to_value(VoiceEvent::NeedsModel { megabytes: 142 }).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"type": "needs-model", "megabytes": 142})
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
}
