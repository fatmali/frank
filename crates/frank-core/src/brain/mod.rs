//! The AIs Frank can think with. Every brain is answer-only: Frank gathers
//! context himself and never lets a brain edit files, run commands or use
//! tools.
//!
//! A brain streams text into an `mpsc` channel. To cancel, drop the receiver:
//! the brain notices on its next send and stops (child processes are killed).

pub mod anthropic;
pub mod claude_code;
#[cfg(feature = "copilot")]
pub mod copilot;
pub mod http;
pub mod ollama;
pub mod openai;

use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

/// Mirrors `BrainRequest` in the TypeScript engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainRequest {
    pub system: String,
    pub messages: Vec<Message>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub json_schema: Option<serde_json::Value>,
}

/// What first-run setup and the brain status line show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum Detection {
    /// Installed or configured. A tiny test request confirms it really works.
    Ready,
    SignedOut {
        fix: String,
    },
    Missing {
        fix: String,
    },
    NotRunning {
        fix: String,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum BrainError {
    /// Something the developer can fix: not installed, signed out, out of quota.
    #[error("{0}")]
    NotReady(String),
    /// The brain ran and failed.
    #[error("{0}")]
    Failed(String),
    /// The receiver was dropped.
    #[error("cancelled")]
    Cancelled,
}

#[async_trait::async_trait]
pub trait Brain: Send + Sync {
    fn id(&self) -> &'static str;
    async fn detect(&self) -> Detection;
    /// Streams the reply as text chunks into `out`.
    async fn stream(
        &self,
        request: BrainRequest,
        out: mpsc::Sender<String>,
    ) -> Result<(), BrainError>;
}

/// The brain `config` picks, or `None` if it names none Frank knows. API keys
/// come from `store`, which may block on the keychain: call from a blocking
/// task. A brain that isn't set up still comes back; its `detect` says what's
/// missing.
pub fn from_config(
    config: &crate::config::BrainConfig,
    store: &dyn crate::secrets::KeyStore,
) -> Option<Box<dyn Brain>> {
    use crate::secrets::{Provider, api_key};
    let model = config.model.clone().filter(|m| !m.is_empty());
    let base_url = config.base_url.clone().filter(|u| !u.is_empty());
    let key = |p| api_key(store, p).map(|(key, _)| key);
    Some(match config.kind.as_str() {
        "claude-code" => Box::new(claude_code::ClaudeCode {
            model,
            ..Default::default()
        }),
        #[cfg(feature = "copilot")]
        "copilot" => Box::new(copilot::Copilot::new(model)),
        "anthropic" => Box::new(anthropic::Anthropic::new(
            key(Provider::Anthropic),
            model,
            base_url,
        )),
        "openai" => Box::new(openai::OpenAi::official(key(Provider::OpenAi), model)),
        "openai-compatible" => Box::new(openai::OpenAi::compatible(
            key(Provider::OpenAiCompatible),
            model,
            base_url,
        )),
        "ollama" => Box::new(ollama::Ollama::new(model, base_url)),
        _ => return None,
    })
}

/// Flattens a conversation into one prompt, for brains that take a single
/// prompt (agent CLIs in headless mode). The system prompt is passed separately.
pub fn render_transcript(messages: &[Message]) -> String {
    if let [only] = messages {
        return only.content.clone();
    }
    let mut out = String::from("The conversation so far, oldest first:\n");
    for m in messages {
        let tag = match m.role {
            Role::User => "developer",
            Role::Assistant => "frank",
        };
        out.push_str(&format!("\n<{tag}>\n{}\n</{tag}>\n", m.content.trim()));
    }
    out.push_str("\nReply as Frank to the developer's last message.");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_the_engine_request() {
        let json = r#"{"system":"You are Frank","messages":[{"role":"user","content":"hi"}],"jsonSchema":{"type":"object"}}"#;
        let req: BrainRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.messages[0].role, Role::User);
        assert!(req.json_schema.is_some());
    }

    #[test]
    fn builds_the_configured_brain() {
        use crate::config::BrainConfig;
        use crate::secrets::MemoryStore;
        let store = MemoryStore::default();
        for kind in [
            "claude-code",
            "anthropic",
            "openai",
            "openai-compatible",
            "ollama",
        ] {
            let config = BrainConfig {
                kind: kind.into(),
                ..Default::default()
            };
            let brain = from_config(&config, &store).expect(kind);
            assert_eq!(brain.id(), kind);
        }
        let unknown = BrainConfig {
            kind: "carrier-pigeon".into(),
            ..Default::default()
        };
        assert!(from_config(&unknown, &store).is_none());
    }

    #[test]
    fn single_message_prompts_pass_through() {
        let m = vec![Message {
            role: Role::User,
            content: "just this".into(),
        }];
        assert_eq!(render_transcript(&m), "just this");
    }

    #[test]
    fn conversations_are_labelled_and_end_on_the_developer() {
        let m = vec![
            Message {
                role: Role::User,
                content: "context".into(),
            },
            Message {
                role: Role::Assistant,
                content: "The plan adds Redis.".into(),
            },
            Message {
                role: Role::User,
                content: "One instance.".into(),
            },
        ];
        let p = render_transcript(&m);
        assert!(p.contains("<frank>\nThe plan adds Redis.\n</frank>"));
        assert!(
            p.trim_end()
                .ends_with("Reply as Frank to the developer's last message.")
        );
        assert!(p.find("One instance.").unwrap() > p.find("The plan adds Redis.").unwrap());
    }

    #[test]
    fn detection_serializes_for_the_ui() {
        let d = Detection::Missing {
            fix: "Install it".into(),
        };
        assert_eq!(
            serde_json::to_string(&d).unwrap(),
            r#"{"status":"missing","fix":"Install it"}"#
        );
    }
}
