//! Frank's spoken replies (docs/ux.md §6.1).
//!
//! Replies arrive a sentence at a time while the brain is still writing, so
//! speech is a queue: each sentence starts as soon as the previous one ends.
//!
//! Two kinds of voice. Natural voices are Kokoro, on this Mac, once the
//! voice pack is downloaded; they are the default when installed. System
//! voices are macOS's own (`say`), best installed first. A voice setting is
//! `natural:<id>` or `system:<name>`; empty means the best available.

use crate::audio_out::Player;
use crate::kokoro::{self, Kokoro};
use crate::packs::Pack;
use crate::state::{AppState, lock};
use crate::voice::VoiceEvent;
use serde::Serialize;
use std::collections::VecDeque;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Speech {
    inner: Mutex<Queue>,
    kokoro: Mutex<Option<Arc<Kokoro>>>,
}

#[derive(Default)]
struct Queue {
    /// Sentences to say, each with a voice override (for previews).
    lines: VecDeque<(String, Option<String>)>,
    child: Option<Child>,
    /// Bumped by stop, so a worker from before knows to quit.
    generation: u64,
    running: bool,
}

/// A voice Frank can speak with, for the picker in Settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceChoice {
    /// What goes in the config: `natural:am_michael`, `system:Ava (Premium)`.
    pub id: String,
    pub name: String,
    pub description: String,
    /// "natural" or "system".
    pub kind: &'static str,
    /// Natural voices need the voice pack first.
    pub installed: bool,
}

/// An installed system voice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemVoice {
    pub name: String,
    pub language: String,
    /// "premium", "enhanced" or "standard".
    pub quality: &'static str,
}

/// Every voice to offer: natural ones first, then the system's.
pub fn choices() -> Vec<VoiceChoice> {
    let installed = Pack::Voices.installed();
    let natural = kokoro::VOICES
        .iter()
        .map(|(id, name, description)| VoiceChoice {
            id: format!("natural:{id}"),
            name: (*name).to_owned(),
            description: (*description).to_owned(),
            kind: "natural",
            installed,
        });
    let system = voices().iter().map(|v| VoiceChoice {
        id: format!("system:{}", v.name),
        name: v.name.clone(),
        description: match v.quality {
            "premium" => "macOS, premium".into(),
            "enhanced" => "macOS, enhanced".into(),
            _ => "macOS".into(),
        },
        kind: "system",
        installed: true,
    });
    natural.chain(system).collect()
}

/// A voice setting, resolved to what can actually speak now.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Resolved {
    Natural(String),
    System(Option<String>),
}

fn resolve(setting: &str, pack_installed: bool, best_system: Option<&str>) -> Resolved {
    if let Some(id) = setting.strip_prefix("natural:") {
        if pack_installed {
            return Resolved::Natural(id.to_owned());
        }
    } else if let Some(name) = setting.strip_prefix("system:") {
        return Resolved::System(Some(name.to_owned()));
    } else if !setting.is_empty() {
        // A plain name, from before natural voices existed.
        return Resolved::System(Some(setting.to_owned()));
    }
    if pack_installed {
        Resolved::Natural(kokoro::DEFAULT_VOICE.to_owned())
    } else {
        Resolved::System(best_system.map(str::to_owned))
    }
}

impl Speech {
    /// Adds a sentence to what Frank is saying.
    pub fn say(&self, app: &AppHandle, text: &str) {
        self.enqueue(app, text, None);
    }

    /// Says a line in a particular voice, for trying voices in Settings.
    pub fn preview(&self, app: &AppHandle, voice: &str) {
        self.stop();
        self.enqueue(
            app,
            "The plan adds Redis. You run one instance, so you don't need it yet.",
            Some(voice.to_owned()),
        );
    }

    /// Loads the natural voice ahead of time, so the first sentence is quick.
    pub fn warm_up(&self) {
        if Pack::Voices.installed() {
            let _ = self.kokoro();
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

    fn enqueue(&self, app: &AppHandle, text: &str, voice: Option<String>) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        let mut q = lock(&self.inner);
        q.lines.push_back((text.to_owned(), voice));
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
        if let Some(mut child) = q.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(player) = Player::get_if_started() {
            player.stop();
        }
    }

    fn current(&self, generation: u64) -> bool {
        lock(&self.inner).generation == generation
    }
}

/// Speaks queued sentences one after another until the queue is empty or
/// Frank is stopped.
fn speak_queue(app: &AppHandle, generation: u64) {
    let speech = app.state::<Speech>();
    let setting = app.state::<AppState>().config().voice.name;
    let best = voices().first().map(|v| v.name.clone());
    loop {
        let (line, only_this) = {
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
        let voice = resolve(
            only_this.as_deref().unwrap_or(&setting),
            Pack::Voices.installed(),
            best.as_deref(),
        );
        match voice {
            Resolved::Natural(id) => {
                // Make the next sentence while this one plays.
                let audio = speech.kokoro().and_then(|k| k.speak(&line, &id, 1.0));
                match (audio, Player::get()) {
                    (Ok(audio), Some(player)) if speech.current(generation) => {
                        player.play(&audio, kokoro::SAMPLE_RATE);
                    }
                    (Err(e), _) => eprintln!("frank: natural voice: {e}"),
                    _ => {}
                }
            }
            Resolved::System(name) => say_with_system(&speech, &line, name.as_deref(), generation),
        }
    }
    // Wait for the last natural sentence to finish playing.
    if let Some(player) = Player::get_if_started() {
        while player.pending_seconds() > 0.0 && speech.current(generation) {
            std::thread::sleep(Duration::from_millis(40));
        }
    }
    if speech.current(generation) {
        let _ = app.emit_to("panel", "voice", VoiceEvent::Spoken);
    }
}

fn say_with_system(speech: &Speech, line: &str, voice: Option<&str>, generation: u64) {
    let Some(mut command) = speech_command(line, voice) else {
        return;
    };
    let Ok(child) = command.spawn() else {
        return;
    };
    let pid = child.id();
    lock(&speech.inner).child = Some(child);
    // Wait without holding the lock, so stop() can kill it.
    loop {
        std::thread::sleep(Duration::from_millis(40));
        let mut q = lock(&speech.inner);
        if q.generation != generation {
            return;
        }
        match q.child.as_mut() {
            Some(c) if c.id() == pid => {
                if !matches!(c.try_wait(), Ok(None)) {
                    q.child = None;
                    return;
                }
            }
            _ => return,
        }
    }
}

/// English voices worth hearing, best first. Cached: listing is slow-ish.
pub fn voices() -> &'static [SystemVoice] {
    static VOICES: OnceLock<Vec<SystemVoice>> = OnceLock::new();
    VOICES.get_or_init(|| {
        #[cfg(target_os = "macos")]
        {
            Command::new("/usr/bin/say")
                .args(["-v", "?"])
                .output()
                .map(|o| rank_voices(&String::from_utf8_lossy(&o.stdout)))
                .unwrap_or_default()
        }
        #[cfg(not(target_os = "macos"))]
        {
            Vec::new()
        }
    })
}

// Only macOS lists voices this way; elsewhere this is used by tests.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
/// Novelty voices that ship with macOS. Frank is blunt, not a pipe organ.
const NOVELTY: &[&str] = &[
    "Albert",
    "Bad News",
    "Bahh",
    "Bells",
    "Boing",
    "Bubbles",
    "Cellos",
    "Deranged",
    "Good News",
    "Hysterical",
    "Jester",
    "Organ",
    "Pipe Organ",
    "Superstar",
    "Trinoids",
    "Whisper",
    "Wobble",
    "Zarvox",
    "Fred",
    "Junior",
    "Ralph",
    "Kathy",
    "Princess",
    "Bruce",
    "Agnes",
    "Vicki",
    "Victoria",
];

// Only macOS lists voices this way; elsewhere this is used by tests.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
/// Voices that sound acceptable even in their compact form.
const DECENT: &[&str] = &[
    "Samantha", "Daniel", "Karen", "Moira", "Tessa", "Rishi", "Alex",
];

// Only macOS lists voices this way; elsewhere this is used by tests.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
/// Parses `say -v '?'` and ranks English voices: Premium, then Enhanced,
/// then decent standard ones, then the rest. Novelty voices are left out.
pub fn rank_voices(listing: &str) -> Vec<SystemVoice> {
    let mut voices: Vec<(u8, SystemVoice)> = listing
        .lines()
        .filter_map(|line| {
            let (head, _) = line.split_once('#')?;
            let head = head.trim_end();
            let (name, language) = head.rsplit_once(char::is_whitespace)?;
            let name = name.trim();
            if !language.starts_with("en") || name.is_empty() {
                return None;
            }
            let base = name.split(" (").next().unwrap_or(name);
            if NOVELTY.contains(&base) {
                return None;
            }
            let (quality, rank) = if name.contains("(Premium)") {
                ("premium", 0)
            } else if name.contains("(Enhanced)") {
                ("enhanced", 1)
            } else if DECENT.contains(&base) {
                ("standard", 2)
            } else {
                ("standard", 3)
            };
            Some((
                rank,
                SystemVoice {
                    name: name.to_owned(),
                    language: language.replace('_', "-"),
                    quality,
                },
            ))
        })
        .collect();
    // US English first within a rank; otherwise keep the system's order.
    voices.sort_by_key(|(rank, v)| (*rank, !v.language.starts_with("en-US")));
    voices.into_iter().map(|(_, v)| v).collect()
}

/// The system's text-to-speech for one sentence, if there is one.
fn speech_command(text: &str, voice: Option<&str>) -> Option<Command> {
    #[cfg(target_os = "macos")]
    {
        let mut c = Command::new("/usr/bin/say");
        if let Some(v) = voice {
            c.args(["-v", v]);
        }
        c.arg("--").arg(text);
        Some(c)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = voice;
        let path = frank_core::env::search_path();
        let bin = ["espeak-ng", "espeak", "spd-say"]
            .into_iter()
            .find_map(|b| frank_core::env::which_in(b, &path))?;
        let mut c = Command::new(bin);
        c.arg(text);
        Some(c)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LISTING: &str = "\
Albert              en_US    # Hello! My name is Albert.
Alice               it_IT    # Ciao! Mi chiamo Alice.
Ava (Premium)       en_US    # Hello! My name is Ava.
Daniel              en_GB    # Hello! My name is Daniel.
Eddy (English (US)) en_US    # Hello! My name is Eddy.
Samantha            en_US    # Hello! My name is Samantha.
Zoe (Enhanced)      en_US    # Hello! My name is Zoe.
Bad News            en_US    # The light you see at the end of the tunnel is the headlamp of a fast approaching train.
";

    #[test]
    fn natural_voices_win_once_installed() {
        assert_eq!(
            resolve("", true, Some("Ava (Premium)")),
            Resolved::Natural("am_michael".into())
        );
        assert_eq!(
            resolve("", false, Some("Ava (Premium)")),
            Resolved::System(Some("Ava (Premium)".into()))
        );
        assert_eq!(
            resolve("natural:af_heart", true, None),
            Resolved::Natural("af_heart".into())
        );
        // Chose a natural voice, but the pack is gone: the best system voice.
        assert_eq!(
            resolve("natural:af_heart", false, Some("Samantha")),
            Resolved::System(Some("Samantha".into()))
        );
        assert_eq!(
            resolve("system:Zoe (Enhanced)", true, None),
            Resolved::System(Some("Zoe (Enhanced)".into()))
        );
        assert_eq!(
            resolve("Daniel", true, None),
            Resolved::System(Some("Daniel".into()))
        );
    }

    #[test]
    fn prefers_premium_then_enhanced_then_decent_voices() {
        let names: Vec<_> = rank_voices(LISTING).into_iter().map(|v| v.name).collect();
        assert_eq!(
            names,
            [
                "Ava (Premium)",
                "Zoe (Enhanced)",
                "Samantha",
                "Daniel",
                "Eddy (English (US))"
            ]
        );
    }

    #[test]
    fn describes_each_voice_for_settings() {
        let voices = rank_voices(LISTING);
        assert_eq!(
            voices[0],
            SystemVoice {
                name: "Ava (Premium)".into(),
                language: "en-US".into(),
                quality: "premium"
            }
        );
        assert!(voices.iter().all(|v| v.language.starts_with("en")));
    }
}
