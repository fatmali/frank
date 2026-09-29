//! Frank's voice (docs/ux.md §6).
//!
//! Frank speaks with natural voices (Kokoro, on this Mac, from the voice
//! pack) or not at all. Sentences arrive one at a time, often while the brain
//! is still writing, so speech is a queue: each sentence is made while the
//! one before it plays, and the panel hears when each one starts, so it can
//! show what Frank is talking about.
//!
//! A voice setting is `natural:<id>`; empty means Frank's own voice.

use crate::audio_out::Player;
use crate::kokoro::{self, Kokoro};
use crate::packs::Pack;
use crate::state::{AppState, lock};
use crate::voice::VoiceEvent;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Speech {
    inner: Mutex<Queue>,
    kokoro: Mutex<Option<Arc<Kokoro>>>,
}

#[derive(Default)]
struct Queue {
    lines: VecDeque<Line>,
    /// Bumped by stop, so a worker from before knows to quit.
    generation: u64,
    running: bool,
}

struct Line {
    text: String,
    /// What the sentence is about, echoed back when it starts playing.
    id: Option<String>,
    /// A voice for this line only (trying voices).
    voice: Option<String>,
}

/// A voice Frank can speak with, for the picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceChoice {
    /// What goes in the config: `natural:am_michael`.
    pub id: String,
    pub name: String,
    pub description: String,
    /// The voice pack is downloaded.
    pub installed: bool,
}

/// Every voice Frank can speak with.
pub fn choices() -> Vec<VoiceChoice> {
    let installed = Pack::Voices.installed();
    kokoro::VOICES
        .iter()
        .map(|(id, name, description)| VoiceChoice {
            id: format!("natural:{id}"),
            name: (*name).to_owned(),
            description: (*description).to_owned(),
            installed,
        })
        .collect()
}

/// The Kokoro voice a setting means. Anything unknown, including the macOS
/// voices Frank used to have, is Frank's own voice.
fn resolve(setting: &str) -> &'static str {
    let id = setting.strip_prefix("natural:").unwrap_or(setting);
    kokoro::VOICES
        .iter()
        .find(|(known, _, _)| *known == id)
        .map_or(kokoro::DEFAULT_VOICE, |(known, _, _)| known)
}

/// Splits a sentence so the first sound comes sooner: a long sentence is
/// made in two, at its first comma, when the first part is a phrase in its
/// own right. Kokoro's time grows with the length of what it says.
fn first_chunks(text: &str) -> Vec<&str> {
    if text.split_whitespace().count() < 14 {
        return vec![text];
    }
    match text.find(", ") {
        Some(at) if text[..at].split_whitespace().count() >= 4 => {
            vec![&text[..=at], text[at + 2..].trim_start()]
        }
        _ => vec![text],
    }
}

impl Speech {
    /// Adds a sentence to what Frank is saying. `id` comes back in a
    /// `speaking` event when the sentence starts playing.
    pub fn say(&self, app: &AppHandle, text: &str, id: Option<String>) {
        self.enqueue(app, text, id, None);
    }

    /// Says a line in a particular voice, for trying voices.
    pub fn preview(&self, app: &AppHandle, voice: &str) {
        self.stop();
        self.enqueue(
            app,
            "The plan adds Redis. You run one instance, so you don't need it yet.",
            None,
            Some(voice.to_owned()),
        );
    }

    /// Loads the voice and opens the speaker ahead of time, so the first
    /// sentence is quick.
    pub fn warm_up(&self) {
        if Pack::Voices.installed() {
            let _ = self.kokoro();
            let _ = Player::get();
        }
    }

    fn kokoro(&self) -> Result<Arc<Kokoro>, String> {
        let mut slot = lock(&self.kokoro);
        if let Some(k) = slot.as_ref() {
            return Ok(k.clone());
        }
        let k = Arc::new(Kokoro::load(&Pack::Voices.dir())?);
        *slot = Some(k.clone());
        Ok(k)
    }

    fn enqueue(&self, app: &AppHandle, text: &str, id: Option<String>, voice: Option<String>) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        if !Pack::Voices.installed() {
            // Nothing to speak with yet. Say so, and let the conversation go on.
            emit(
                app,
                VoiceEvent::NeedsPack {
                    pack: Pack::Voices.id(),
                    megabytes: Pack::Voices.megabytes_missing().max(1),
                },
            );
            emit(app, VoiceEvent::Spoken);
            return;
        }
        let mut q = lock(&self.inner);
        q.lines.push_back(Line {
            text: text.to_owned(),
            id,
            voice,
        });
        if q.running {
            return;
        }
        q.running = true;
        let generation = q.generation;
        let app = app.clone();
        std::thread::spawn(move || speak_queue(&app, generation));
    }

    /// Stops Frank mid-sentence and forgets the rest.
    pub fn stop(&self) {
        let mut q = lock(&self.inner);
        q.generation += 1;
        q.lines.clear();
        q.running = false;
        if let Some(player) = Player::get_if_started() {
            player.stop();
        }
    }

    fn current(&self, generation: u64) -> bool {
        lock(&self.inner).generation == generation
    }
}

fn emit(app: &AppHandle, event: VoiceEvent) {
    let _ = app.emit_to("panel", "voice", event);
}

/// Speaks queued sentences one after another until the queue is empty or
/// Frank is stopped. Each sentence is made while the one before it plays.
fn speak_queue(app: &AppHandle, generation: u64) {
    let speech = app.state::<Speech>();
    let setting = app.state::<AppState>().config().voice.name;
    let Some(player) = Player::get() else {
        eprintln!("frank: no speaker to talk through");
        lock(&speech.inner).running = false;
        emit(app, VoiceEvent::Spoken);
        return;
    };
    loop {
        let line = {
            let mut q = lock(&speech.inner);
            if q.generation != generation {
                return;
            }
            match q.lines.pop_front() {
                Some(line) => line,
                None => {
                    q.running = false;
                    break;
                }
            }
        };
        let voice = resolve(line.voice.as_deref().unwrap_or(&setting));
        // Only split when nothing is playing: then the first sound waits on it.
        let chunks = if player.pending_seconds() < 0.1 {
            first_chunks(&line.text)
        } else {
            vec![line.text.as_str()]
        };
        let mut id = line.id;
        for chunk in chunks {
            match speech.kokoro().and_then(|k| k.speak(chunk, voice, 1.0)) {
                Ok(audio) if speech.current(generation) => {
                    let mark = id.take().map(|id| {
                        let app = app.clone();
                        Box::new(move || emit(&app, VoiceEvent::Speaking { id }))
                            as crate::audio_out::Mark
                    });
                    player.play(&audio, kokoro::SAMPLE_RATE, mark);
                }
                Ok(_) => return,
                Err(e) => eprintln!("frank: voice: {e}"),
            }
        }
    }
    // Wait for the last sentence to finish playing.
    while player.pending_seconds() > 0.0 && speech.current(generation) {
        std::thread::sleep(Duration::from_millis(40));
    }
    if speech.current(generation) {
        emit(app, VoiceEvent::Spoken);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_setting_means_a_natural_voice() {
        assert_eq!(resolve(""), "am_michael");
        assert_eq!(resolve("natural:af_heart"), "af_heart");
        assert_eq!(resolve("bf_emma"), "bf_emma");
        // The macOS voices are gone; whoever chose one hears Frank's own.
        assert_eq!(resolve("system:Ava (Premium)"), "am_michael");
        assert_eq!(resolve("Samantha"), "am_michael");
        assert_eq!(resolve("natural:nobody"), "am_michael");
    }

    #[test]
    fn offers_only_natural_voices() {
        let ids: Vec<_> = choices().into_iter().map(|v| v.id).collect();
        assert_eq!(ids.len(), kokoro::VOICES.len());
        assert!(ids.iter().all(|id| id.starts_with("natural:")));
        assert_eq!(ids[0], "natural:am_michael");
    }

    #[test]
    fn a_long_first_sentence_starts_sooner() {
        let long = "Claude Code's plan adds a per-key limit of 100 requests a minute, so one noisy key can't slow the API for everyone.";
        assert_eq!(
            first_chunks(long),
            [
                "Claude Code's plan adds a per-key limit of 100 requests a minute,",
                "so one noisy key can't slow the API for everyone."
            ]
        );
        // Short sentences, and ones whose first comma comes too early, stay whole.
        assert_eq!(first_chunks("Keeping Redis."), ["Keeping Redis."]);
        let early = "First, where the counters live: Redis like the plan says, or in memory, which is simpler.";
        assert_eq!(first_chunks(early), [early]);
    }
}
