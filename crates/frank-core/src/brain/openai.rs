//! OpenAI, and any server that speaks its Chat Completions API (LM Studio,
//! vLLM, OpenRouter, llama.cpp's server...), as Frank's brain.

use super::http::{self, Sse};
use super::{Brain, BrainError, BrainRequest, Detection, Role};
use crate::secrets::ApiKey;
use serde_json::{Value, json};
use tokio::sync::mpsc;

pub const OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
pub const OPENAI_DEFAULT_MODEL: &str = "gpt-5";

#[derive(Debug)]
pub struct OpenAi {
    /// `openai` or `openai-compatible`.
    pub kind: &'static str,
    /// Optional for compatible servers; many local ones don't need a key.
    pub api_key: Option<ApiKey>,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

impl OpenAi {
    /// OpenAI itself.
    pub fn official(api_key: Option<ApiKey>, model: Option<String>) -> Self {
        Self {
            kind: "openai",
            api_key,
            model: model.or_else(|| Some(OPENAI_DEFAULT_MODEL.into())),
            base_url: Some(OPENAI_BASE_URL.into()),
        }
    }

    /// Any server with an OpenAI-style `/chat/completions`.
    pub fn compatible(
        api_key: Option<ApiKey>,
        model: Option<String>,
        base_url: Option<String>,
    ) -> Self {
        Self {
            kind: "openai-compatible",
            api_key,
            model,
            base_url,
        }
    }

    fn name(&self) -> &'static str {
        if self.kind == "openai" {
            "OpenAI"
        } else {
            "Your OpenAI-compatible server"
        }
    }

    /// What's missing before this brain can run, as a fix for the developer.
    fn missing(&self) -> Option<String> {
        if self.kind == "openai" && self.api_key.is_none() {
            return Some(
                "No OpenAI API key yet. Add one in Settings, or set OPENAI_API_KEY.".into(),
            );
        }
        if self.base_url.as_deref().is_none_or(str::is_empty) {
            return Some(
                "Add your server's base URL in Settings, e.g. http://localhost:1234/v1.".into(),
            );
        }
        if self.model.as_deref().is_none_or(str::is_empty) {
            return Some("Pick which model to use in Settings.".into());
        }
        None
    }

    pub fn body(&self, request: &BrainRequest) -> Value {
        let mut messages = vec![json!({ "role": "system", "content": request.system })];
        messages.extend(request.messages.iter().map(|m| {
            let role = match m.role {
                Role::User => "user",
                Role::Assistant => "assistant",
            };
            json!({ "role": role, "content": m.content })
        }));
        json!({
            "model": self.model,
            "messages": messages,
            "stream": true,
        })
    }

    pub fn explain(&self, status: u16, message: &str) -> BrainError {
        let name = self.name();
        match status {
            401 | 403 => BrainError::NotReady(format!(
                "{name} didn't accept the API key. Check it in Settings."
            )),
            404 => BrainError::NotReady(format!(
                "{name} says: {}. Check the model and base URL in Settings.",
                message.trim().trim_end_matches('.')
            )),
            429 => BrainError::NotReady(format!(
                "{name} is rate-limiting you, or the account is out of credit. Wait a minute, or switch brain."
            )),
            _ => BrainError::Failed(format!("{name}: {}", message.trim())),
        }
    }

    /// One streamed `data:` payload: text, nothing, or an error.
    pub fn interpret(&self, data: &str) -> Result<Option<String>, BrainError> {
        if data.trim() == "[DONE]" {
            return Ok(None);
        }
        let v: Value = serde_json::from_str(data).unwrap_or_default();
        if !v["error"].is_null() {
            let message = http::error_message(data);
            return Err(BrainError::Failed(format!("{}: {message}", self.name())));
        }
        let choice = &v["choices"][0];
        if choice["finish_reason"] == "content_filter" {
            return Err(BrainError::Failed(format!(
                "{} filtered the answer. Try rephrasing, or switch brain.",
                self.name()
            )));
        }
        Ok(choice["delta"]["content"]
            .as_str()
            .filter(|t| !t.is_empty())
            .map(str::to_owned))
    }
}

#[async_trait::async_trait]
impl Brain for OpenAi {
    fn id(&self) -> &'static str {
        self.kind
    }

    async fn detect(&self) -> Detection {
        match self.missing() {
            None => Detection::Ready,
            Some(fix) => Detection::Missing { fix },
        }
    }

    async fn stream(
        &self,
        request: BrainRequest,
        out: mpsc::Sender<String>,
    ) -> Result<(), BrainError> {
        if let Some(fix) = self.missing() {
            return Err(BrainError::NotReady(fix));
        }
        let base = self.base_url.as_deref().unwrap_or_default();
        let mut post = http::client(base)?
            .post(http::join(base, "/chat/completions"))
            .json(&self.body(&request));
        if let Some(key) = &self.api_key {
            post = post.bearer_auth(key.expose());
        }
        let response = http::send(post, self.name(), |s, m| self.explain(s, m)).await?;
        let mut sse = Sse::default();
        http::read_lines(response, &out, |line| match sse.line(line) {
            Some(event) => self.interpret(&event.data),
            None => Ok(None),
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::http::mock;

    const STREAM: &str = "data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n\
data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Keep \"}}]}\n\n\
data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Postgres.\"}}]}\n\n\
data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n\
data: [DONE]\n\n";

    #[tokio::test]
    async fn streams_from_a_compatible_server() {
        let (base, mut captured) = mock::serve(200, "text/event-stream", STREAM).await;
        let brain = OpenAi::compatible(None, Some("qwen3".into()), Some(format!("{base}/v1/")));
        let (text, result) = mock::run(&brain, mock::request()).await;
        assert_eq!(result, Ok(()));
        assert_eq!(text, "Keep Postgres.");

        let req = captured.recv().await.unwrap();
        assert!(req.head.starts_with("POST /v1/chat/completions "));
        assert_eq!(req.header("authorization"), None, "no key, no header");
        assert_eq!(req.body["model"], "qwen3");
        assert_eq!(req.body["messages"][0]["role"], "system");
        assert_eq!(req.body["messages"][0]["content"], "You are Frank.");
        assert_eq!(req.body["messages"][3]["content"], "Why Redis?");
    }

    #[tokio::test]
    async fn sends_the_key_as_a_bearer_token() {
        let (base, mut captured) = mock::serve(200, "text/event-stream", STREAM).await;
        let brain = OpenAi::compatible(Some(ApiKey::new("sk-test")), Some("m".into()), Some(base));
        mock::run(&brain, mock::request()).await.1.unwrap();
        assert_eq!(
            captured.recv().await.unwrap().header("authorization"),
            Some("Bearer sk-test")
        );
    }

    #[tokio::test]
    async fn errors_say_how_to_fix_them() {
        let body =
            r#"{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}"#;
        let (base, _) = mock::serve(401, "application/json", body).await;
        let brain = OpenAi::compatible(Some(ApiKey::new("bad")), Some("m".into()), Some(base));
        let (_, result) = mock::run(&brain, mock::request()).await;
        assert!(
            matches!(result, Err(BrainError::NotReady(m)) if m.contains("didn't accept the API key"))
        );

        let openai = OpenAi::official(None, None);
        assert!(
            matches!(openai.detect().await, Detection::Missing { fix } if fix.contains("OPENAI_API_KEY"))
        );
        let unset = OpenAi::compatible(None, None, Some("http://localhost:1234/v1".into()));
        assert!(
            matches!(unset.detect().await, Detection::Missing { fix } if fix.contains("model"))
        );

        let filtered = r#"{"choices":[{"delta":{},"finish_reason":"content_filter"}]}"#;
        assert!(
            matches!(openai.interpret(filtered), Err(BrainError::Failed(m)) if m.contains("filtered"))
        );
    }
}
