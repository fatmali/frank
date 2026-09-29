//! The Anthropic API as Frank's brain, with the developer's own API key.
//! Plain HTTPS and server-sent events; Rust has no official Anthropic SDK.
//!
//! On the models that support it, requests opt into server-side fallbacks:
//! if a safety classifier declines a request, Anthropic retries it on a
//! fallback model instead of returning a refusal.

use super::http::{self, Sse, SseEvent};
use super::{Brain, BrainError, BrainRequest, Detection, Role};
use crate::secrets::ApiKey;
use serde_json::{Value, json};
use tokio::sync::mpsc;

pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
pub const DEFAULT_MODEL: &str = "claude-opus-5-5";
const API_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 16_000;
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
/// Models that accept `"fallbacks": "default"`.
const FALLBACK_MODELS: &[&str] = &[
    "claude-fable-5-1",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-sonnet-5-5",
];

const NO_KEY_FIX: &str = "No Anthropic API key yet. Add one in Settings, or set ANTHROPIC_API_KEY.";
const BAD_KEY_FIX: &str = "Anthropic didn't accept your API key. Check it in Settings.";
const CREDIT_FIX: &str = "Your Anthropic credit balance is too low. Top it up, or switch brain.";
const RATE_FIX: &str = "Anthropic is rate-limiting your key. Wait a minute, or switch brain.";
const BUSY: &str = "Anthropic is overloaded right now. Try again in a moment.";
const REFUSED: &str = "Claude declined to answer this one. Try rephrasing, or switch brain.";

#[derive(Debug)]
pub struct Anthropic {
    pub api_key: Option<ApiKey>,
    pub model: String,
    pub base_url: String,
}

impl Anthropic {
    pub fn new(api_key: Option<ApiKey>, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            api_key,
            model: model.unwrap_or_else(|| DEFAULT_MODEL.into()),
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.into()),
        }
    }

    fn fallbacks(&self) -> bool {
        FALLBACK_MODELS.contains(&self.model.as_str())
    }

    pub fn body(&self, request: &BrainRequest) -> Value {
        let messages: Vec<Value> = request
            .messages
            .iter()
            .map(|m| {
                let role = match m.role {
                    Role::User => "user",
                    Role::Assistant => "assistant",
                };
                json!({ "role": role, "content": m.content })
            })
            .collect();
        let mut body = json!({
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "system": request.system,
            "messages": messages,
            "stream": true,
        });
        if self.fallbacks() {
            body["fallbacks"] = json!("default");
        }
        body
    }

    pub fn explain(&self, status: u16, message: &str) -> BrainError {
        let m = message.to_ascii_lowercase();
        match status {
            401 => BrainError::NotReady(BAD_KEY_FIX.into()),
            400 if m.contains("credit balance") => BrainError::NotReady(CREDIT_FIX.into()),
            404 if m.contains("model") => BrainError::NotReady(format!(
                "Anthropic doesn't offer the model `{}`. Pick another in Settings.",
                self.model
            )),
            429 => BrainError::NotReady(RATE_FIX.into()),
            503 | 529 => BrainError::Failed(BUSY.into()),
            _ => BrainError::Failed(format!("Anthropic: {}", message.trim())),
        }
    }
}

/// What one streamed event means: text for the developer, nothing, or an error.
pub fn interpret(event: &SseEvent) -> Result<Option<String>, BrainError> {
    let data: Value = serde_json::from_str(&event.data).unwrap_or_default();
    match data["type"].as_str().unwrap_or(&event.event) {
        "content_block_delta" if data["delta"]["type"] == "text_delta" => Ok(data["delta"]["text"]
            .as_str()
            .filter(|t| !t.is_empty())
            .map(str::to_owned)),
        "message_delta" if data["delta"]["stop_reason"] == "refusal" => {
            Err(BrainError::Failed(REFUSED.into()))
        }
        "error" => {
            let message = data["error"]["message"].as_str().unwrap_or("stream error");
            Err(match data["error"]["type"].as_str() {
                Some("overloaded_error") => BrainError::Failed(BUSY.into()),
                Some("rate_limit_error") => BrainError::NotReady(RATE_FIX.into()),
                _ => BrainError::Failed(format!("Anthropic: {message}")),
            })
        }
        _ => Ok(None),
    }
}

#[async_trait::async_trait]
impl Brain for Anthropic {
    fn id(&self) -> &'static str {
        "anthropic"
    }

    async fn detect(&self) -> Detection {
        match self.api_key {
            Some(_) => Detection::Ready,
            None => Detection::Missing {
                fix: NO_KEY_FIX.into(),
            },
        }
    }

    async fn stream(
        &self,
        request: BrainRequest,
        out: mpsc::Sender<String>,
    ) -> Result<(), BrainError> {
        let key = self
            .api_key
            .as_ref()
            .ok_or_else(|| BrainError::NotReady(NO_KEY_FIX.into()))?;
        let mut post = http::client(&self.base_url)?
            .post(http::join(&self.base_url, "/v1/messages"))
            .header("x-api-key", key.expose())
            .header("anthropic-version", API_VERSION)
            .json(&self.body(&request));
        if self.fallbacks() {
            post = post.header("anthropic-beta", FALLBACK_BETA);
        }
        let response = http::send(post, "Anthropic", |s, m| self.explain(s, m)).await?;
        let mut sse = Sse::default();
        http::read_lines(response, &out, |line| match sse.line(line) {
            Some(event) => interpret(&event),
            None => Ok(None),
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::http::mock;

    const STREAM: &str = "event: message_start\n\
data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_0\",\"role\":\"assistant\",\"content\":[]}}\n\n\
event: ping\ndata: {\"type\":\"ping\"}\n\n\
event: content_block_start\n\
data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Redis is \"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"a new service.\"}}\n\n\
event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n\
event: message_delta\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":6}}\n\n\
event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

    fn brain(base: String) -> Anthropic {
        Anthropic::new(Some(ApiKey::new("sk-ant-test")), None, Some(base))
    }

    #[tokio::test]
    async fn streams_text_with_the_right_request() {
        let (base, mut captured) = mock::serve(200, "text/event-stream", STREAM).await;
        let (text, result) = mock::run(&brain(base), mock::request()).await;
        assert_eq!(result, Ok(()));
        assert_eq!(text, "Redis is a new service.");

        let req = captured.recv().await.unwrap();
        assert!(req.head.starts_with("POST /v1/messages "));
        assert_eq!(req.header("x-api-key"), Some("sk-ant-test"));
        assert_eq!(req.header("anthropic-version"), Some(API_VERSION));
        assert_eq!(req.header("anthropic-beta"), Some(FALLBACK_BETA));
        assert_eq!(req.body["model"], DEFAULT_MODEL);
        assert_eq!(req.body["fallbacks"], "default");
        assert_eq!(req.body["stream"], true);
        assert_eq!(req.body["system"], "You are Frank.");
        assert_eq!(req.body["messages"][1]["role"], "assistant");
        assert_eq!(req.body["messages"][2]["content"], "Why Redis?");
    }

    #[tokio::test]
    async fn other_models_skip_fallbacks() {
        let (base, mut captured) = mock::serve(200, "text/event-stream", STREAM).await;
        let brain = Anthropic::new(
            Some(ApiKey::new("k")),
            Some("claude-haiku-4-5".into()),
            Some(base),
        );
        mock::run(&brain, mock::request()).await.1.unwrap();
        let req = captured.recv().await.unwrap();
        assert_eq!(req.header("anthropic-beta"), None);
        assert!(req.body.get("fallbacks").is_none());
    }

    #[tokio::test]
    async fn http_errors_say_how_to_fix_them() {
        let body = r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#;
        let (base, _) = mock::serve(401, "application/json", body).await;
        let (_, result) = mock::run(&brain(base), mock::request()).await;
        assert_eq!(result, Err(BrainError::NotReady(BAD_KEY_FIX.into())));

        let b = brain(String::new());
        let credit = b.explain(
            400,
            "Your credit balance is too low to access the Anthropic API.",
        );
        assert_eq!(credit, BrainError::NotReady(CREDIT_FIX.into()));
        assert_eq!(
            b.explain(529, "Overloaded"),
            BrainError::Failed(BUSY.into())
        );
    }

    #[tokio::test]
    async fn refusals_and_stream_errors_stop_the_reply() {
        let refusal = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hm\"}}\n\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"refusal\"}}\n\n";
        let (base, _) = mock::serve(200, "text/event-stream", refusal).await;
        let (text, result) = mock::run(&brain(base), mock::request()).await;
        assert_eq!(text, "Hm");
        assert_eq!(result, Err(BrainError::Failed(REFUSED.into())));

        let overloaded = SseEvent {
            event: "error".into(),
            data: r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#
                .into(),
        };
        assert_eq!(interpret(&overloaded), Err(BrainError::Failed(BUSY.into())));
    }

    #[tokio::test]
    async fn no_key_is_a_fixable_state() {
        let brain = Anthropic::new(None, None, None);
        assert!(matches!(brain.detect().await, Detection::Missing { .. }));
        let (_, result) = mock::run(&brain, mock::request()).await;
        assert_eq!(result, Err(BrainError::NotReady(NO_KEY_FIX.into())));
        assert!(
            !format!(
                "{:?}",
                Anthropic::new(Some(ApiKey::new("sk-ant-x")), None, None)
            )
            .contains("sk-ant-x")
        );
    }
}
