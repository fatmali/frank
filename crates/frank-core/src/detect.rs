//! What's available on this machine, for first-run setup (docs/ux.md §5.1).
//! Detection is cheap and read-only: it checks for binaries, saved or
//! exported API keys, and a running Ollama. Picking a brain then runs a tiny
//! test request.

use crate::brain::{Brain, Detection, claude_code::ClaudeCode, ollama::Ollama};
use crate::secrets::{KeySource, KeyStore, Provider, api_key};
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainOption {
    /// The `brain.kind` this option sets in the config.
    pub kind: &'static str,
    pub label: &'static str,
    /// Where the key was found, e.g. "ANTHROPIC_API_KEY", for API brains.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_from: Option<&'static str>,
    #[serde(flatten)]
    pub detection: Detection,
}

const COPILOT_FIX: &str = "The Copilot CLI isn't installed. Install it with `npm install -g @github/copilot`, sign in, then press Retry.";

pub async fn detect_all(store: Arc<dyn KeyStore>) -> Vec<BrainOption> {
    let claude_code = ClaudeCode::default();
    let ollama = Ollama::default();
    // The keychain blocks, so it gets its own thread.
    let keys = tokio::task::spawn_blocking(move || {
        [Provider::Anthropic, Provider::OpenAi].map(|p| api_key(store.as_ref(), p).map(|(_, s)| s))
    });
    let (claude, ollama, keys) = tokio::join!(claude_code.detect(), ollama.detect(), keys);
    let [anthropic, openai] = keys.unwrap_or([None, None]);
    vec![
        option("claude-code", "Claude Code", claude),
        option(
            "copilot",
            "GitHub Copilot",
            match crate::env::which("copilot") {
                Some(_) => Detection::Ready,
                None => Detection::Missing {
                    fix: COPILOT_FIX.into(),
                },
            },
        ),
        key_option("anthropic", "Anthropic API", Provider::Anthropic, anthropic),
        key_option("openai", "OpenAI API", Provider::OpenAi, openai),
        option("ollama", "Ollama", ollama),
    ]
}

fn option(kind: &'static str, label: &'static str, detection: Detection) -> BrainOption {
    BrainOption {
        kind,
        label,
        key_from: None,
        detection,
    }
}

fn key_option(
    kind: &'static str,
    label: &'static str,
    provider: Provider,
    found: Option<KeySource>,
) -> BrainOption {
    let var = provider.env_var().unwrap_or("an environment variable");
    BrainOption {
        kind,
        label,
        key_from: found.as_ref().map(|s| match s {
            KeySource::Keychain => "keychain",
            KeySource::Env(var) => var,
        }),
        detection: match found {
            Some(_) => Detection::Ready,
            None => Detection::Missing {
                fix: format!("No key yet. Paste one in Settings, or set {var}."),
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::{MemoryStore, save_api_key};

    #[tokio::test]
    async fn lists_every_brain_once() {
        let store = Arc::new(MemoryStore::default());
        save_api_key(store.as_ref(), Provider::Anthropic, "sk-ant-x").unwrap();
        let found = detect_all(store).await;
        let kinds: Vec<_> = found.iter().map(|o| o.kind).collect();
        assert_eq!(
            kinds,
            ["claude-code", "copilot", "anthropic", "openai", "ollama"]
        );
        assert_eq!(found[2].detection, Detection::Ready);
        assert_eq!(found[2].key_from, Some("keychain"));
        let json = serde_json::to_value(&found[2]).unwrap();
        assert_eq!(json["kind"], "anthropic");
        assert_eq!(json["status"], "ready", "flattened for the UI: {json}");
        assert_eq!(json["keyFrom"], "keychain");
    }
}
