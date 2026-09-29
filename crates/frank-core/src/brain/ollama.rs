//! Ollama as Frank's brain: a model running on the developer's own machine.
//! Nothing leaves it.
//!
//! Uses Ollama's native `/api/chat`, which streams one JSON object per line,
//! so the context size can be set explicitly. Ollama's default window is
//! small, and it silently drops the start of longer prompts: that would cut
//! the plan, which comes first.

use super::http;
use super::{Brain, BrainError, BrainRequest, Detection, Role};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::sync::mpsc;

pub const DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
/// Tokens of context to ask for. The engine's budget for Ollama fits in it.
pub const NUM_CTX: u32 = 16_384;

const NOT_RUNNING_FIX: &str = "Ollama isn't running. Start it, then press Retry.";
const NO_MODELS_FIX: &str =
    "Ollama has no models yet. Pull one with `ollama pull <model>`, then press Retry.";

#[derive(Debug)]
pub struct Ollama {
    /// When not set, Frank uses the first model Ollama lists.
    pub model: Option<String>,
    pub base_url: String,
}

impl Default for Ollama {
    fn default() -> Self {
        Self::new(None, None)
    }
}

impl Ollama {
    pub fn new(model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            model: model.filter(|m| !m.is_empty()),
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.into()),
        }
    }

    /// The installed models, or why they couldn't be listed.
    pub async fn models(&self) -> Result<Vec<String>, BrainError> {
        let get = http::client(&self.base_url)?
            .get(http::join(&self.base_url, "/api/tags"))
            .timeout(Duration::from_secs(2));
        let response = http::send(get, "Ollama", |_, m| {
            BrainError::Failed(format!("Ollama: {m}"))
        })
        .await
        .map_err(|e| match e {
            BrainError::NotReady(_) => BrainError::NotReady(NOT_RUNNING_FIX.into()),
            e => e,
        })?;
        let tags: Value = response
            .json()
            .await
            .map_err(|e| BrainError::Failed(format!("Ollama: {e}")))?;
        Ok(tags["models"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|m| m["name"].as_str().map(str::to_owned))
            .collect())
    }

    /// The configured model, if Ollama has it, or the first one it lists.
    async fn pick_model(&self) -> Result<String, BrainError> {
        let models = self.models().await?;
        match &self.model {
            Some(want) if has_model(&models, want) => Ok(want.clone()),
            Some(want) => Err(BrainError::NotReady(format!(
                "Ollama doesn't have `{want}`. Run `ollama pull {want}`, then press Retry."
            ))),
            None => models
                .into_iter()
                .next()
                .ok_or_else(|| BrainError::NotReady(NO_MODELS_FIX.into())),
        }
    }

    pub fn body(&self, model: &str, request: &BrainRequest) -> Value {
        let mut messages = vec![json!({ "role": "system", "content": request.system })];
        messages.extend(request.messages.iter().map(|m| {
            let role = match m.role {
                Role::User => "user",
                Role::Assistant => "assistant",
            };
            json!({ "role": role, "content": m.content })
        }));
        json!({
            "model": model,
            "messages": messages,
            "stream": true,
            "options": { "num_ctx": NUM_CTX },
        })
    }
}

/// `llama3` matches `llama3:latest`, as it does on Ollama's command line.
fn has_model(models: &[String], want: &str) -> bool {
    models
        .iter()
        .any(|m| m == want || (!want.contains(':') && *m == format!("{want}:latest")))
}

/// One streamed line: text, nothing, or an error.
pub fn interpret(line: &str) -> Result<Option<String>, BrainError> {
    if line.trim().is_empty() {
        return Ok(None);
    }
    let v: Value = serde_json::from_str(line)
        .map_err(|_| BrainError::Failed(format!("Ollama sent something unexpected: {line}")))?;
    if let Some(error) = v["error"].as_str() {
        return Err(BrainError::Failed(format!("Ollama: {error}")));
    }
    Ok(v["message"]["content"]
        .as_str()
        .filter(|t| !t.is_empty())
        .map(str::to_owned))
}

#[async_trait::async_trait]
impl Brain for Ollama {
    fn id(&self) -> &'static str {
        "ollama"
    }

    async fn detect(&self) -> Detection {
        match self.pick_model().await {
            Ok(_) => Detection::Ready,
            Err(BrainError::NotReady(fix)) if fix == NOT_RUNNING_FIX => {
                Detection::NotRunning { fix }
            }
            Err(e) => Detection::Missing { fix: e.to_string() },
        }
    }

    async fn stream(
        &self,
        request: BrainRequest,
        out: mpsc::Sender<String>,
    ) -> Result<(), BrainError> {
        let model = self.pick_model().await?;
        let post = http::client(&self.base_url)?
            .post(http::join(&self.base_url, "/api/chat"))
            .json(&self.body(&model, &request));
        let response = http::send(post, "Ollama", |status, m| match status {
            404 => BrainError::NotReady(format!(
                "Ollama doesn't have `{model}`. Run `ollama pull {model}`, then press Retry."
            )),
            _ => BrainError::Failed(format!("Ollama: {m}")),
        })
        .await?;
        http::read_lines(response, &out, interpret).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::http::mock;

    #[test]
    fn reads_streamed_lines() {
        assert_eq!(
            interpret(
                r#"{"model":"m","message":{"role":"assistant","content":"Drop "},"done":false}"#
            ),
            Ok(Some("Drop ".into()))
        );
        assert_eq!(
            interpret(
                r#"{"model":"m","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop"}"#
            ),
            Ok(None)
        );
        assert_eq!(
            interpret(r#"{"error":"model requires more system memory"}"#),
            Err(BrainError::Failed(
                "Ollama: model requires more system memory".into()
            ))
        );
    }

    #[test]
    fn asks_for_a_big_enough_context() {
        let body = Ollama::default().body("qwen3", &mock::request());
        assert_eq!(body["options"]["num_ctx"], NUM_CTX);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["model"], "qwen3");
    }

    #[test]
    fn matches_models_like_the_cli() {
        let models = vec!["llama3:latest".to_owned(), "qwen3:8b".to_owned()];
        assert!(has_model(&models, "llama3"));
        assert!(has_model(&models, "qwen3:8b"));
        assert!(!has_model(&models, "qwen3"));
    }

    #[tokio::test]
    async fn streams_from_the_first_installed_model() {
        let tags = r#"{"models":[{"name":"qwen3:8b"},{"name":"llama3:latest"}]}"#;
        let chat = "{\"message\":{\"role\":\"assistant\",\"content\":\"Keep \"},\"done\":false}\n\
{\"message\":{\"role\":\"assistant\",\"content\":\"it.\"},\"done\":false}\n\
{\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}";
        let (base, mut captured) = mock::serve_all(&[
            (200, "application/json", tags),
            (200, "application/x-ndjson", chat),
        ])
        .await;
        let (text, result) = mock::run(&Ollama::new(None, Some(base)), mock::request()).await;
        assert_eq!(result, Ok(()));
        assert_eq!(text, "Keep it.");
        assert!(
            captured
                .recv()
                .await
                .unwrap()
                .head
                .starts_with("GET /api/tags ")
        );
        let chat = captured.recv().await.unwrap();
        assert!(chat.head.starts_with("POST /api/chat "));
        assert_eq!(chat.body["model"], "qwen3:8b");
    }

    #[tokio::test]
    async fn not_running_is_a_fixable_state() {
        // Nothing listens on port 9 (discard) on loopback.
        let brain = Ollama::new(None, Some("http://127.0.0.1:9".into()));
        assert_eq!(
            brain.detect().await,
            Detection::NotRunning {
                fix: NOT_RUNNING_FIX.into()
            }
        );
    }

    #[tokio::test]
    async fn a_missing_model_says_how_to_get_it() {
        let tags = r#"{"models":[{"name":"llama3:latest","size":1}]}"#;
        let (base, _) = mock::serve(200, "application/json", tags).await;
        let brain = Ollama::new(Some("qwen3".into()), Some(base));
        assert!(
            matches!(brain.detect().await, Detection::Missing { fix } if fix.contains("ollama pull qwen3"))
        );

        let (base, _) = mock::serve(200, "application/json", r#"{"models":[]}"#).await;
        let brain = Ollama::new(None, Some(base));
        assert_eq!(
            brain.detect().await,
            Detection::Missing {
                fix: NO_MODELS_FIX.into()
            }
        );
    }
}
