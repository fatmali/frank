//! The models behind Frank's voice, downloaded once, with consent, into
//! `~/.frank`. Two packs, so each is only fetched when it's wanted:
//!
//! - listening: Whisper base.en (turns speech into text) and Silero VAD
//!   (hears when you start and stop talking);
//! - voices: Kokoro-82M and its voices, with the pronunciation dictionaries.

use crate::state::lock;
use crate::voice::VoiceEvent;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pack {
    Listening,
    Voices,
}

struct File {
    url: &'static str,
    name: &'static str,
    /// Roughly, for progress before the server says.
    bytes: u64,
}

const LISTENING: &[File] = &[
    File {
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        name: "ggml-base.en.bin",
        bytes: 147_964_211,
    },
    File {
        url: "https://raw.githubusercontent.com/snakers4/silero-vad/v5.1.2/src/silero_vad/data/silero_vad.onnx",
        name: "silero_vad.onnx",
        bytes: 2_327_524,
    },
];

const VOICES: &[File] = &[
    File {
        url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.fp16.onnx",
        name: crate::kokoro::MODEL_FILE,
        bytes: 177_464_787,
    },
    File {
        url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        name: crate::kokoro::VOICES_FILE,
        bytes: 28_214_398,
    },
    File {
        url: "https://raw.githubusercontent.com/hexgrad/misaki/main/misaki/data/us_gold.json",
        name: crate::kokoro::GOLD_FILE,
        bytes: 3_000_469,
    },
    File {
        url: "https://raw.githubusercontent.com/hexgrad/misaki/main/misaki/data/us_silver.json",
        name: crate::kokoro::SILVER_FILE,
        bytes: 3_099_517,
    },
];

impl Pack {
    pub fn parse(id: &str) -> Option<Self> {
        match id {
            "listening" => Some(Self::Listening),
            "voices" => Some(Self::Voices),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::Listening => "listening",
            Self::Voices => "voices",
        }
    }

    fn files(self) -> &'static [File] {
        match self {
            Self::Listening => LISTENING,
            Self::Voices => VOICES,
        }
    }

    pub fn dir(self) -> PathBuf {
        let home = frank_core::config::frank_home();
        match self {
            Self::Listening => home.join("models"),
            Self::Voices => home.join("voices"),
        }
    }

    pub fn path(self, name: &str) -> PathBuf {
        self.dir().join(name)
    }

    /// What's left to download, in megabytes, for the consent message.
    pub fn megabytes_missing(self) -> u32 {
        let bytes: u64 = self
            .files()
            .iter()
            .filter(|f| !self.path(f.name).exists())
            .map(|f| f.bytes)
            .sum();
        (bytes / 1_000_000) as u32
    }

    pub fn installed(self) -> bool {
        self.files().iter().all(|f| self.path(f.name).exists())
    }
}

static DOWNLOADING: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());

/// Downloads what's missing from a pack, reporting progress, then says it's
/// ready. A second call while one is running does nothing.
pub async fn download(app: &AppHandle, pack: Pack) {
    {
        let mut busy = lock(&DOWNLOADING);
        if busy.contains(&pack.id()) {
            return;
        }
        busy.push(pack.id());
    }
    let result = fetch_all(app, pack).await;
    lock(&DOWNLOADING).retain(|p| *p != pack.id());
    let event = match result {
        Ok(()) => VoiceEvent::PackReady { pack: pack.id() },
        Err(e) => {
            eprintln!("frank: {} download: {e}", pack.id());
            VoiceEvent::Failed {
                message: "Couldn't finish the download. Check your connection, then try again."
                    .into(),
            }
        }
    };
    let _ = app.emit_to("panel", "voice", event);
}

async fn fetch_all(app: &AppHandle, pack: Pack) -> Result<(), String> {
    tokio::fs::create_dir_all(pack.dir())
        .await
        .map_err(|e| e.to_string())?;
    let missing: Vec<&File> = pack
        .files()
        .iter()
        .filter(|f| !pack.path(f.name).exists())
        .collect();
    let total: u64 = missing.iter().map(|f| f.bytes).sum::<u64>().max(1);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut done = 0u64;
    let mut reported = 0.0f32;
    for file in missing {
        let path = pack.path(file.name);
        let part = path.with_extension("part");
        let mut response = client
            .get(file.url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| e.to_string())?;
        let expected = response.content_length();
        let mut out = tokio::fs::File::create(&part)
            .await
            .map_err(|e| e.to_string())?;
        let mut received = 0u64;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            out.write_all(&chunk).await.map_err(|e| e.to_string())?;
            received += chunk.len() as u64;
            let fraction = ((done + received) as f32 / total as f32).min(0.99);
            if fraction - reported >= 0.01 {
                reported = fraction;
                let _ = app.emit_to(
                    "panel",
                    "voice",
                    VoiceEvent::Downloading {
                        pack: pack.id(),
                        fraction,
                    },
                );
            }
        }
        out.flush().await.map_err(|e| e.to_string())?;
        drop(out);
        if expected.is_some_and(|n| n != received) {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(format!("{} was cut short", file.name));
        }
        tokio::fs::rename(&part, &path)
            .await
            .map_err(|e| e.to_string())?;
        done += file.bytes;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_file_has_a_home_and_a_source() {
        for pack in [Pack::Listening, Pack::Voices] {
            for f in pack.files() {
                assert!(
                    f.url.starts_with("https://") && f.url.ends_with(f.name),
                    "{}",
                    f.url
                );
            }
        }
        assert_eq!(Pack::parse("voices"), Some(Pack::Voices));
        assert_eq!(Pack::parse("nope"), None);
    }
}
