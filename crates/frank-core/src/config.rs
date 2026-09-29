//! `~/.frank/config.toml`. Missing keys fall back to defaults, and unknown
//! keys are ignored, so older and newer versions of Frank can share a file.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub brain: BrainConfig,
    pub hotkey: String,
    pub sticky: StickyConfig,
    pub plans: PlansConfig,
    pub context: ContextConfig,
    pub voice: VoiceConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct VoiceConfig {
    /// `voice`: Frank talks you through plans and listens (the default).
    /// `chat`: the panel, typed, and Frank speaks only when spoken to.
    /// Empty in configs from before modes: see `talk_back`.
    pub mode: String,
    /// Before modes: `never` meant chat; anything else means voice.
    pub talk_back: String,
    /// The voice Frank speaks with, `natural:<id>`. Empty: his own.
    pub name: String,
}

impl VoiceConfig {
    /// `voice` or `chat`, for configs old and new.
    pub fn mode(&self) -> &str {
        match self.mode.as_str() {
            "voice" | "chat" => &self.mode,
            _ if self.talk_back == "never" => "chat",
            _ => "voice",
        }
    }
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            mode: String::new(),
            talk_back: "when-spoken".into(),
            name: String::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct BrainConfig {
    /// `claude-code`, `copilot`, `cursor`, `anthropic`, `openai`,
    /// `openai-compatible` or `ollama`. Empty until first-run setup picks one.
    pub kind: String,
    /// Optional model override, where the brain supports one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// For OpenAI-compatible endpoints and Ollama.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[derive(Default)]
pub struct StickyConfig {
    pub enabled: bool,
    /// Last dragged position, in logical points from the top-left.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<(f64, f64)>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PlansConfig {
    pub window_minutes: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ContextConfig {
    /// Most bytes of touched files read per session.
    pub max_file_kb: u32,
    /// Projects whose context the developer has said not to confirm again.
    pub trusted_projects: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            brain: BrainConfig::default(),
            hotkey: "Alt+Shift+Space".into(),
            sticky: StickyConfig::default(),
            plans: PlansConfig::default(),
            context: ContextConfig::default(),
            voice: VoiceConfig::default(),
        }
    }
}

impl Default for PlansConfig {
    fn default() -> Self {
        Self { window_minutes: 30 }
    }
}

impl Default for ContextConfig {
    fn default() -> Self {
        Self {
            max_file_kb: 200,
            trusted_projects: Vec::new(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("couldn't read {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("{path} isn't valid TOML: {source}")]
    Parse {
        path: PathBuf,
        source: toml::de::Error,
    },
    #[error("couldn't write {path}: {source}")]
    Write {
        path: PathBuf,
        source: std::io::Error,
    },
}

/// `~/.frank`, or `$FRANK_HOME` when set (used by tests and portable installs).
pub fn frank_home() -> PathBuf {
    if let Some(p) = std::env::var_os("FRANK_HOME") {
        return PathBuf::from(p);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".frank")
}

pub fn config_path() -> PathBuf {
    frank_home().join("config.toml")
}

impl Config {
    /// Loads the config, or the defaults if the file doesn't exist yet.
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        match std::fs::read_to_string(path) {
            Ok(text) => toml::from_str(&text).map_err(|source| ConfigError::Parse {
                path: path.into(),
                source,
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(source) => Err(ConfigError::Read {
                path: path.into(),
                source,
            }),
        }
    }

    /// Writes the config atomically: a temp file, then a rename.
    pub fn save(&self, path: &Path) -> Result<(), ConfigError> {
        let write_err = |source| ConfigError::Write {
            path: path.into(),
            source,
        };
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(write_err)?;
        }
        let text = toml::to_string_pretty(self).expect("config always serializes");
        let tmp = path.with_extension("toml.tmp");
        std::fs::write(&tmp, text).map_err(write_err)?;
        std::fs::rename(&tmp, path).map_err(write_err)
    }

    pub fn trusts(&self, project: &str) -> bool {
        self.context.trusted_projects.iter().any(|p| p == project)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_gives_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = Config::load(&dir.path().join("config.toml")).unwrap();
        assert_eq!(cfg, Config::default());
        assert!(!cfg.sticky.enabled, "sticky mode is off by default");
        assert_eq!(cfg.hotkey, "Alt+Shift+Space");
        assert_eq!(cfg.plans.window_minutes, 30);
        assert_eq!(cfg.voice.mode(), "voice", "Frank talks by default");
    }

    #[test]
    fn voice_mode_from_old_and_new_configs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "[voice]\ntalk_back = \"never\"\n").unwrap();
        assert_eq!(Config::load(&path).unwrap().voice.mode(), "chat");
        std::fs::write(&path, "[voice]\ntalk_back = \"always\"\n").unwrap();
        assert_eq!(Config::load(&path).unwrap().voice.mode(), "voice");
        std::fs::write(&path, "[voice]\nmode = \"chat\"\ntalk_back = \"always\"\n").unwrap();
        assert_eq!(Config::load(&path).unwrap().voice.mode(), "chat");
    }

    #[test]
    fn round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/config.toml");
        let mut cfg = Config::default();
        cfg.brain.kind = "claude-code".into();
        cfg.sticky.enabled = true;
        cfg.sticky.position = Some((1200.0, 40.0));
        cfg.context.trusted_projects.push("/Users/me/my-app".into());
        cfg.save(&path).unwrap();
        let back = Config::load(&path).unwrap();
        assert_eq!(back, cfg);
        assert!(back.trusts("/Users/me/my-app"));
        assert!(!path.with_extension("toml.tmp").exists());
    }

    #[test]
    fn partial_files_fill_in_defaults_and_ignore_unknown_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(
            &path,
            "hotkey = \"Ctrl+Alt+D\"\nfuture_setting = 1\n[brain]\nkind = \"ollama\"\n",
        )
        .unwrap();
        let cfg = Config::load(&path).unwrap();
        assert_eq!(cfg.hotkey, "Ctrl+Alt+D");
        assert_eq!(cfg.brain.kind, "ollama");
        assert_eq!(cfg.context.max_file_kb, 200);
    }

    #[test]
    fn broken_toml_says_where() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "hotkey = ").unwrap();
        let err = Config::load(&path).unwrap_err().to_string();
        assert!(err.contains("config.toml isn't valid TOML"), "{err}");
    }
}
