//! GitHub Copilot as Frank's brain, through GitHub's official Copilot SDK.
//! The SDK talks JSON-RPC to the developer's own `copilot` CLI, signed in with
//! their own GitHub account; each prompt counts toward their Copilot allowance.
//!
//! Answer-only: an empty tool allowlist, every permission request denied, and
//! Frank's own system prompt in place of Copilot's agent persona.

use super::{Brain, BrainError, BrainRequest, Detection, render_transcript};
use github_copilot_sdk::{Client, ClientOptions, SessionConfig, types::SystemMessageConfig};
use serde_json::Value;
use std::path::PathBuf;
use tokio::sync::{Mutex, mpsc};

const INSTALL_FIX: &str = "The Copilot CLI isn't installed. Install it with `npm install -g @github/copilot`, sign in, then press Retry.";
const SIGN_IN_FIX: &str =
    "GitHub Copilot isn't signed in. Run `copilot`, sign in with /login, then press Retry.";
const QUOTA_FIX: &str =
    "Your Copilot allowance is used up for now. Switch brain, or try again later.";

pub struct Copilot {
    /// The `copilot` binary. Found on the search path when not set; the SDK
    /// itself doesn't search `PATH`.
    pub binary: Option<PathBuf>,
    pub model: Option<String>,
    /// A neutral working directory, so no repo's Copilot config applies.
    pub workdir: PathBuf,
    /// One warm CLI process, reused across requests.
    client: Mutex<Option<Client>>,
}

impl Default for Copilot {
    fn default() -> Self {
        Self {
            binary: None,
            model: None,
            workdir: crate::config::frank_home().join("run"),
            client: Mutex::new(None),
        }
    }
}

impl Copilot {
    pub fn new(model: Option<String>) -> Self {
        Self {
            model,
            ..Self::default()
        }
    }

    fn binary(&self) -> Option<PathBuf> {
        self.binary.clone().or_else(|| crate::env::which("copilot"))
    }

    /// Starts the CLI on first use; call early (when the panel opens) to hide the start-up time.
    pub async fn warm_up(&self) -> Result<Client, BrainError> {
        let mut slot = self.client.lock().await;
        if let Some(client) = slot.as_ref() {
            return Ok(client.clone());
        }
        let bin = self
            .binary()
            .ok_or_else(|| BrainError::NotReady(INSTALL_FIX.into()))?;
        std::fs::create_dir_all(&self.workdir).ok();
        let mut options = ClientOptions::new().with_program(bin);
        options.working_directory = self.workdir.clone();
        options.env.push(("PATH".into(), crate::env::search_path()));
        let client = Client::start(options)
            .await
            .map_err(|e| BrainError::Failed(format!("Couldn't start the Copilot CLI: {e}")))?;
        *slot = Some(client.clone());
        Ok(client)
    }

    /// The session settings that keep Copilot answer-only and speaking as Frank.
    pub fn session_config(&self, request: &BrainRequest) -> SessionConfig {
        let mut config = SessionConfig::default().deny_all_permissions();
        config.model = self.model.clone();
        config.streaming = Some(true);
        // An empty allowlist: no built-in tools at all.
        config.available_tools = Some(Vec::new());
        config.enable_config_discovery = Some(false);
        config.working_directory = Some(self.workdir.clone());
        let mut system = SystemMessageConfig::new().with_mode("replace");
        system.content = Some(request.system.clone());
        config.system_message = Some(system);
        config
    }
}

/// What one session event means for the stream.
#[derive(Debug, PartialEq)]
pub enum Step {
    Text(String),
    Done,
    Error(BrainError),
    Ignore,
}

pub fn interpret(event_type: &str, data: &Value) -> Step {
    match event_type {
        "assistant.message_delta" => match data.get("deltaContent").and_then(Value::as_str) {
            Some(t) if !t.is_empty() => Step::Text(t.to_owned()),
            _ => Step::Ignore,
        },
        "session.idle" => Step::Done,
        "session.error" => {
            let kind = data.get("errorType").and_then(Value::as_str).unwrap_or("");
            let message = data
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Copilot reported an error.");
            Step::Error(explain(kind, message))
        }
        _ => Step::Ignore,
    }
}

pub fn explain(error_type: &str, message: &str) -> BrainError {
    let m = message.to_ascii_lowercase();
    match error_type {
        "authentication" | "authorization" => BrainError::NotReady(SIGN_IN_FIX.into()),
        "quota" | "rate_limit" => BrainError::NotReady(QUOTA_FIX.into()),
        _ if m.contains("not authenticated")
            || m.contains("/login")
            || m.contains("not logged in") =>
        {
            BrainError::NotReady(SIGN_IN_FIX.into())
        }
        _ => BrainError::Failed(format!("Copilot: {}", message.trim())),
    }
}

#[async_trait::async_trait]
impl Brain for Copilot {
    fn id(&self) -> &'static str {
        "copilot"
    }

    async fn detect(&self) -> Detection {
        if self.binary().is_none() {
            return Detection::Missing {
                fix: INSTALL_FIX.into(),
            };
        }
        let Ok(client) = self.warm_up().await else {
            return Detection::Missing {
                fix: INSTALL_FIX.into(),
            };
        };
        match client.get_auth_status().await {
            Ok(status) if status.is_authenticated => Detection::Ready,
            _ => Detection::SignedOut {
                fix: SIGN_IN_FIX.into(),
            },
        }
    }

    async fn stream(
        &self,
        request: BrainRequest,
        out: mpsc::Sender<String>,
    ) -> Result<(), BrainError> {
        let client = self.warm_up().await?;
        let session = client
            .create_session(self.session_config(&request))
            .await
            .map_err(|e| explain("", &e.to_string()))?;
        let mut events = session.subscribe();
        session
            .send(render_transcript(&request.messages))
            .await
            .map_err(|e| explain("", &e.to_string()))?;

        let result = loop {
            let event = match events.recv().await {
                Ok(event) => event,
                Err(_) => break Err(BrainError::Failed("Copilot stopped responding.".into())),
            };
            match interpret(&event.event_type, &event.data) {
                Step::Text(t) => {
                    if out.send(t).await.is_err() {
                        let _ = session.abort().await;
                        break Err(BrainError::Cancelled);
                    }
                }
                Step::Done => break Ok(()),
                Step::Error(e) => break Err(e),
                Step::Ignore => {}
            }
        };
        let _ = session.disconnect().await;
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::{Message, Role};
    use serde_json::json;

    fn request() -> BrainRequest {
        BrainRequest {
            system: "You are Frank.".into(),
            messages: vec![Message {
                role: Role::User,
                content: "Look at this plan".into(),
            }],
            json_schema: None,
        }
    }

    #[test]
    fn sessions_are_answer_only_and_speak_as_frank() {
        let brain = Copilot::new(Some("gpt-5".into()));
        let config = brain.session_config(&request());
        assert_eq!(config.available_tools, Some(vec![]), "no built-in tools");
        assert_eq!(config.streaming, Some(true));
        assert_eq!(config.model.as_deref(), Some("gpt-5"));
        assert_eq!(config.enable_config_discovery, Some(false));
        let system = config.system_message.expect("system message set");
        assert_eq!(system.mode.as_deref(), Some("replace"));
        assert_eq!(system.content.as_deref(), Some("You are Frank."));
    }

    #[test]
    fn streams_deltas_and_stops_on_idle() {
        assert_eq!(
            interpret(
                "assistant.message_delta",
                &json!({"deltaContent": "The plan ", "messageId": "m1"})
            ),
            Step::Text("The plan ".into())
        );
        assert_eq!(
            interpret("assistant.message_delta", &json!({"deltaContent": ""})),
            Step::Ignore
        );
        assert_eq!(
            interpret(
                "assistant.message",
                &json!({"content": "The plan adds Redis."})
            ),
            Step::Ignore
        );
        assert_eq!(interpret("session.idle", &json!({})), Step::Done);
    }

    #[test]
    fn errors_say_how_to_fix_them() {
        let signed_out = interpret(
            "session.error",
            &json!({"errorType": "authentication", "message": "Bad credentials"}),
        );
        assert_eq!(
            signed_out,
            Step::Error(BrainError::NotReady(SIGN_IN_FIX.into()))
        );
        let quota = interpret(
            "session.error",
            &json!({"errorType": "quota", "message": "quota_exceeded"}),
        );
        assert_eq!(quota, Step::Error(BrainError::NotReady(QUOTA_FIX.into())));
        assert_eq!(
            explain("", "Not authenticated. Run /login"),
            BrainError::NotReady(SIGN_IN_FIX.into())
        );
        assert_eq!(
            explain("query", "context too long"),
            BrainError::Failed("Copilot: context too long".into())
        );
    }

    #[tokio::test]
    async fn missing_copilot_is_a_fixable_state() {
        let brain = Copilot {
            binary: Some(PathBuf::from("/definitely/not/here/copilot")),
            ..Copilot::default()
        };
        // The binary path is set but doesn't exist: starting fails, which reads as "not installed".
        assert!(matches!(brain.detect().await, Detection::Missing { .. }));
    }
}
