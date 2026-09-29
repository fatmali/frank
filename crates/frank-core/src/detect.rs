//! What's available on this machine, for first-run setup (docs/ux.md §5.1).
//! Detection is cheap and read-only: it checks for binaries, environment
//! variables and a local port. Picking a brain then runs a tiny test request.

use crate::brain::{Brain, Detection, claude_code::ClaudeCode};
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainOption {
    /// The `brain.kind` this option sets in the config.
    pub kind: &'static str,
    pub label: &'static str,
    #[serde(flatten)]
    pub detection: Detection,
}

pub async fn detect_all() -> Vec<BrainOption> {
    let claude_code = ClaudeCode::default();
    let (claude, ollama) = tokio::join!(claude_code.detect(), ollama_running());
    vec![
        BrainOption { kind: "claude-code", label: "Claude Code", detection: claude },
        BrainOption {
            kind: "copilot",
            label: "GitHub Copilot",
            detection: match crate::env::which("copilot") {
                Some(_) => Detection::Ready,
                None => Detection::Missing {
                    fix: "The Copilot CLI isn't installed. Install it with `npm install -g @github/copilot`, sign in, then press Retry.".into(),
                },
            },
        },
        env_key("anthropic", "ANTHROPIC_API_KEY"),
        env_key("openai", "OPENAI_API_KEY"),
        BrainOption {
            kind: "ollama",
            label: "Ollama",
            detection: if ollama {
                Detection::Ready
            } else {
                Detection::NotRunning { fix: "Ollama isn't running. Start it, then press Retry.".into() }
            },
        },
    ]
}

fn env_key(kind: &'static str, var: &'static str) -> BrainOption {
    let set = std::env::var_os(var).is_some_and(|v| !v.is_empty());
    BrainOption {
        kind,
        label: var,
        detection: if set {
            Detection::Ready
        } else {
            Detection::Missing {
                fix: format!("{var} isn't set. Add a key in Settings instead."),
            }
        },
    }
}

async fn ollama_running() -> bool {
    let connect = tokio::net::TcpStream::connect(("127.0.0.1", 11434));
    matches!(
        tokio::time::timeout(Duration::from_millis(300), connect).await,
        Ok(Ok(_))
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn lists_every_brain_once() {
        let found = detect_all().await;
        let kinds: Vec<_> = found.iter().map(|o| o.kind).collect();
        assert_eq!(
            kinds,
            ["claude-code", "copilot", "anthropic", "openai", "ollama"]
        );
        let json = serde_json::to_value(&found[0]).unwrap();
        assert_eq!(json["kind"], "claude-code");
        assert!(json["status"].is_string(), "flattened for the UI: {json}");
    }
}
