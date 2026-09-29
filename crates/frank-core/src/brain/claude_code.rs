//! Claude Code as Frank's brain: the developer's own installed `claude`,
//! unmodified, in headless mode, signed in however they signed in. Frank never
//! reads or passes on their credentials.
//!
//! Answer-only: `--disallowedTools "*"` removes every tool. That also removes
//! the tool Claude Code uses for `--json-schema` structured output, so Frank
//! doesn't pass a schema here; the engine validates and repairs JSON itself.

use super::{Brain, BrainError, BrainRequest, Detection, render_transcript};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

pub struct ClaudeCode {
    /// The `claude` binary. Found on the search path when not set.
    pub binary: Option<PathBuf>,
    pub model: Option<String>,
    /// Where `claude` runs: a neutral directory, so no project's settings,
    /// hooks or CLAUDE.md apply. Frank supplies the context himself.
    pub workdir: PathBuf,
}

impl Default for ClaudeCode {
    fn default() -> Self {
        Self {
            binary: None,
            model: None,
            workdir: crate::config::frank_home().join("run"),
        }
    }
}

const INSTALL_FIX: &str = "Claude Code isn't installed. Install it from https://claude.com/claude-code, sign in, then press Retry.";
const SIGN_IN_FIX: &str = "Claude Code isn't signed in. Open it, log in, then press Retry.";

impl ClaudeCode {
    fn binary(&self) -> Option<PathBuf> {
        self.binary.clone().or_else(|| crate::env::which("claude"))
    }

    /// The command-line arguments for a request. The prompt goes on stdin.
    pub fn args(&self, request: &BrainRequest) -> Vec<String> {
        let mut args: Vec<String> = [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--disallowedTools",
            "*",
            "--no-session-persistence",
            "--system-prompt",
        ]
        .map(String::from)
        .into();
        args.push(request.system.clone());
        if let Some(model) = &self.model {
            args.extend(["--model".into(), model.clone()]);
        }
        args
    }
}

/// One line of `--output-format stream-json`, reduced to what Frank needs.
#[derive(Debug, PartialEq)]
pub enum Event {
    /// Streamed text.
    Text(String),
    /// A complete assistant message's text (used when no partial text arrived).
    Message(String),
    /// The run finished. `Err` carries the error text Claude Code reported.
    Result(Result<(), String>),
    Ignore,
}

pub fn parse_line(line: &str) -> Event {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
        return Event::Ignore;
    };
    match v.get("type").and_then(|t| t.as_str()) {
        Some("stream_event") => {
            let delta = &v["event"]["delta"];
            if v["event"]["type"] == "content_block_delta"
                && delta["type"] == "text_delta"
                && let Some(t) = delta["text"].as_str()
            {
                return Event::Text(t.to_owned());
            }
            Event::Ignore
        }
        Some("assistant") => {
            let text: String = v["message"]["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|c| c["type"] == "text")
                .filter_map(|c| c["text"].as_str())
                .collect();
            if text.is_empty() {
                Event::Ignore
            } else {
                Event::Message(text)
            }
        }
        Some("result") => {
            if v["is_error"].as_bool() == Some(true) {
                let msg = v["result"]
                    .as_str()
                    .unwrap_or("Claude Code reported an error.");
                Event::Result(Err(msg.to_owned()))
            } else {
                Event::Result(Ok(()))
            }
        }
        _ => Event::Ignore,
    }
}

/// Turns Claude Code's error text into something the developer can act on.
pub fn explain(error: &str) -> BrainError {
    let e = error.to_ascii_lowercase();
    if e.contains("not logged in")
        || e.contains("/login")
        || e.contains("invalid api key")
        || e.contains("please log in")
    {
        BrainError::NotReady(SIGN_IN_FIX.into())
    } else if e.contains("usage limit") || e.contains("rate limit") || e.contains("quota") {
        BrainError::NotReady(
            "Your Claude usage limit is used up for now. Switch brain, or try again later.".into(),
        )
    } else {
        BrainError::Failed(format!("Claude Code: {}", error.trim()))
    }
}

#[async_trait::async_trait]
impl Brain for ClaudeCode {
    fn id(&self) -> &'static str {
        "claude-code"
    }

    async fn detect(&self) -> Detection {
        let Some(bin) = self.binary() else {
            return Detection::Missing {
                fix: INSTALL_FIX.into(),
            };
        };
        let ran = Command::new(bin)
            .arg("--version")
            .env("PATH", crate::env::search_path())
            .stdin(Stdio::null())
            .output()
            .await;
        match ran {
            Ok(out) if out.status.success() => Detection::Ready,
            _ => Detection::Missing {
                fix: INSTALL_FIX.into(),
            },
        }
    }

    async fn stream(
        &self,
        request: BrainRequest,
        out: mpsc::Sender<String>,
    ) -> Result<(), BrainError> {
        let bin = self
            .binary()
            .ok_or_else(|| BrainError::NotReady(INSTALL_FIX.into()))?;
        std::fs::create_dir_all(&self.workdir).ok();
        let mut child = Command::new(bin)
            .args(self.args(&request))
            .current_dir(&self.workdir)
            .env("PATH", crate::env::search_path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| match e.kind() {
                std::io::ErrorKind::NotFound => BrainError::NotReady(INSTALL_FIX.into()),
                _ => BrainError::Failed(format!("Couldn't start Claude Code: {e}")),
            })?;

        let prompt = render_transcript(&request.messages);
        let mut stdin = child.stdin.take().expect("stdin is piped");
        let writer = tokio::spawn(async move {
            let _ = stdin.write_all(prompt.as_bytes()).await;
            // Dropping stdin closes it, which tells `claude -p` the prompt is complete.
        });

        let mut stderr = child.stderr.take().expect("stderr is piped");
        let stderr_task = tokio::spawn(async move {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s).await;
            s
        });

        let mut lines = BufReader::new(child.stdout.take().expect("stdout is piped")).lines();
        let mut streamed = false;
        let mut result: Option<Result<(), String>> = None;
        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|e| BrainError::Failed(e.to_string()))?
        {
            let chunk = match parse_line(&line) {
                Event::Text(t) => {
                    streamed = true;
                    Some(t)
                }
                Event::Message(t) if !streamed => Some(t),
                Event::Result(r) => {
                    result = Some(r);
                    None
                }
                _ => None,
            };
            if let Some(chunk) = chunk
                && out.send(chunk).await.is_err()
            {
                // The receiver is gone: cancelled. `kill_on_drop` stops claude.
                return Err(BrainError::Cancelled);
            }
        }

        let _ = writer.await;
        let status = child
            .wait()
            .await
            .map_err(|e| BrainError::Failed(e.to_string()))?;
        let stderr = stderr_task.await.unwrap_or_default();
        match result {
            Some(Ok(())) => Ok(()),
            Some(Err(msg)) => Err(explain(&msg)),
            None if status.success() => Ok(()),
            None => Err(explain(if stderr.trim().is_empty() {
                "exited without an answer"
            } else {
                &stderr
            })),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::{Message, Role};

    const RECORDED: &str = include_str!("../../tests/fixtures/claude-code-stream.jsonl");

    fn request() -> BrainRequest {
        BrainRequest {
            system: "You are Frank.".into(),
            messages: vec![Message {
                role: Role::User,
                content: "Look at this plan".into(),
            }],
            json_schema: Some(serde_json::json!({"type": "object"})),
        }
    }

    #[test]
    fn parses_a_recorded_run() {
        let events: Vec<Event> = RECORDED
            .lines()
            .map(parse_line)
            .filter(|e| *e != Event::Ignore)
            .collect();
        assert_eq!(
            events,
            [
                Event::Text("quack.".into()),
                Event::Message("quack.".into()),
                Event::Result(Ok(())),
            ]
        );
    }

    #[test]
    fn ignores_tool_input_deltas() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{"}}}"#;
        assert_eq!(parse_line(line), Event::Ignore);
        assert_eq!(parse_line("not json"), Event::Ignore);
    }

    #[test]
    fn reports_errors_the_developer_can_fix() {
        let line = r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}"#;
        let Event::Result(Err(msg)) = parse_line(line) else {
            panic!("expected an error result")
        };
        assert_eq!(explain(&msg), BrainError::NotReady(SIGN_IN_FIX.into()));
        assert!(matches!(
            explain("Claude AI usage limit reached"),
            BrainError::NotReady(_)
        ));
        assert!(
            matches!(explain("something odd"), BrainError::Failed(m) if m == "Claude Code: something odd")
        );
    }

    #[test]
    fn arguments_keep_it_answer_only() {
        let brain = ClaudeCode {
            model: Some("sonnet".into()),
            ..ClaudeCode::default()
        };
        let args = brain.args(&request());
        let pos = args.iter().position(|a| a == "--disallowedTools").unwrap();
        assert_eq!(args[pos + 1], "*");
        assert!(args.contains(&"--no-session-persistence".into()));
        assert!(
            !args.iter().any(|a| a == "--json-schema"),
            "schemas need a tool; see module docs"
        );
        assert!(
            args.windows(2)
                .any(|w| w == ["--system-prompt", "You are Frank."])
        );
        assert!(args.windows(2).any(|w| w == ["--model", "sonnet"]));
    }

    /// Runs a fake `claude` that records its stdin and replays the recorded stream.
    #[cfg(unix)]
    #[tokio::test]
    async fn streams_from_a_real_process() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let fixture = dir.path().join("stream.jsonl");
        std::fs::write(&fixture, RECORDED).unwrap();
        let got_stdin = dir.path().join("stdin.txt");
        let script = dir.path().join("claude");
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\ncat > {}\ncat {}\n",
                got_stdin.display(),
                fixture.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let brain = ClaudeCode {
            binary: Some(script),
            model: None,
            workdir: dir.path().join("run"),
        };
        let (tx, mut rx) = mpsc::channel(16);
        let run = tokio::spawn(async move { brain.stream(request(), tx).await });
        let mut text = String::new();
        while let Some(chunk) = rx.recv().await {
            text.push_str(&chunk);
        }
        assert_eq!(run.await.unwrap(), Ok(()));
        assert_eq!(
            text, "quack.",
            "streamed text only, not repeated by the final message"
        );
        assert_eq!(
            std::fs::read_to_string(got_stdin).unwrap(),
            "Look at this plan"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn signed_out_claude_says_how_to_fix_it() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("claude");
        std::fs::write(
            &script,
            "#!/bin/sh\ncat >/dev/null\necho 'Invalid API key · Please run /login' >&2\nexit 1\n",
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let brain = ClaudeCode {
            binary: Some(script),
            model: None,
            workdir: dir.path().to_path_buf(),
        };
        let (tx, _rx) = mpsc::channel(16);
        assert_eq!(
            brain.stream(request(), tx).await,
            Err(BrainError::NotReady(SIGN_IN_FIX.into()))
        );
    }

    #[tokio::test]
    async fn missing_claude_is_a_fixable_state() {
        let brain = ClaudeCode {
            binary: Some(PathBuf::from("/definitely/not/here/claude")),
            model: None,
            workdir: std::env::temp_dir(),
        };
        assert_eq!(
            brain.detect().await,
            Detection::Missing {
                fix: INSTALL_FIX.into()
            }
        );
        let (tx, _rx) = mpsc::channel(1);
        assert_eq!(
            brain.stream(request(), tx).await,
            Err(BrainError::NotReady(INSTALL_FIX.into()))
        );
    }
}
