//! Shared plumbing for the brains that speak HTTP: a client, a line splitter
//! for streamed bodies, a server-sent events parser, and status-code errors.

use super::BrainError;
use std::time::Duration;
use tokio::sync::mpsc;

/// How long to wait between streamed chunks before giving up. Servers send
/// keep-alives while the model thinks, so silence this long means trouble.
const READ_TIMEOUT: Duration = Duration::from_secs(180);

/// An HTTP client for `base_url`. Local servers (Ollama, LM Studio) skip the
/// system proxy, which would otherwise swallow `localhost`.
pub fn client(base_url: &str) -> Result<reqwest::Client, BrainError> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(READ_TIMEOUT)
        .user_agent(concat!("frank/", env!("CARGO_PKG_VERSION")));
    if is_local(base_url) {
        builder = builder.no_proxy();
    }
    builder
        .build()
        .map_err(|e| BrainError::Failed(format!("Couldn't set up HTTP: {e}")))
}

fn is_local(base_url: &str) -> bool {
    reqwest::Url::parse(base_url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .is_some_and(|h| {
            let h = h.trim_start_matches('[').trim_end_matches(']');
            h == "localhost"
                || h.parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        })
}

/// Joins a base URL and a path with exactly one slash between them.
pub fn join(base: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

/// Splits a byte stream into lines. Handles `\r\n`, and lines split across
/// chunks, including inside a multi-byte character.
#[derive(Default)]
pub struct Lines {
    buf: Vec<u8>,
}

impl Lines {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(i) = self.buf.iter().position(|&b| b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=i).collect();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            lines.push(String::from_utf8_lossy(&line).into_owned());
        }
        lines
    }

    /// Whatever is left when the stream ends without a final newline.
    pub fn finish(&mut self) -> Option<String> {
        let rest = std::mem::take(&mut self.buf);
        let rest = String::from_utf8_lossy(&rest).trim().to_owned();
        (!rest.is_empty()).then_some(rest)
    }
}

/// One server-sent event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
}

/// Turns lines into server-sent events (the subset APIs use: `event:`,
/// `data:`, comments, blank-line dispatch).
#[derive(Default)]
pub struct Sse {
    event: String,
    data: Vec<String>,
}

impl Sse {
    pub fn line(&mut self, line: &str) -> Option<SseEvent> {
        if line.is_empty() {
            return self.dispatch();
        }
        if line.starts_with(':') {
            return None;
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => self.event = value.to_owned(),
            "data" => self.data.push(value.to_owned()),
            _ => {}
        }
        None
    }

    /// Flushes an event the server didn't end with a blank line.
    pub fn finish(&mut self) -> Option<SseEvent> {
        self.dispatch()
    }

    fn dispatch(&mut self) -> Option<SseEvent> {
        let event = std::mem::take(&mut self.event);
        if self.data.is_empty() {
            return None;
        }
        let data = std::mem::take(&mut self.data).join("\n");
        Some(SseEvent {
            event: if event.is_empty() {
                "message".into()
            } else {
                event
            },
            data,
        })
    }
}

/// Reads a streamed response line by line. `on_line` returns text for the
/// developer, or `Err` to stop. Stops with `Cancelled` when `out` is dropped;
/// dropping the response closes the connection.
pub async fn read_lines(
    mut response: reqwest::Response,
    out: &mpsc::Sender<String>,
    mut on_line: impl FnMut(&str) -> Result<Option<String>, BrainError>,
) -> Result<(), BrainError> {
    let mut lines = Lines::default();
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|e| BrainError::Failed(format!("The connection dropped: {e}")))?;
        let done = chunk.is_none();
        let batch = match chunk {
            Some(bytes) => lines.push(&bytes),
            // End of body: flush a last unterminated line, then a blank line
            // so a pending server-sent event is dispatched.
            None => lines.finish().into_iter().chain([String::new()]).collect(),
        };
        for line in &batch {
            if let Some(text) = on_line(line)? {
                out.send(text).await.map_err(|_| BrainError::Cancelled)?;
            }
        }
        if done {
            return Ok(());
        }
    }
}

/// The `message` from an error body: `{"error": {"message": ...}}` (Anthropic,
/// OpenAI) or `{"error": "..."}` (Ollama). Falls back to the raw text.
pub fn error_message(body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    let error = &v["error"];
    error["message"]
        .as_str()
        .or_else(|| error.as_str())
        .or_else(|| v["message"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| body.trim().chars().take(300).collect())
}

/// Sends a request and checks the status. On failure, `explain` turns the
/// status and the server's message into an error the developer can act on.
pub async fn send(
    request: reqwest::RequestBuilder,
    name: &str,
    explain: impl FnOnce(u16, &str) -> BrainError,
) -> Result<reqwest::Response, BrainError> {
    let response = request.send().await.map_err(|e| {
        if e.is_connect() {
            BrainError::NotReady(format!("Couldn't reach {name}. Check your connection."))
        } else if e.is_timeout() {
            BrainError::Failed(format!("{name} took too long to answer."))
        } else {
            BrainError::Failed(format!("{name}: {e}"))
        }
    })?;
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    Err(explain(status.as_u16(), &error_message(&body)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_lines_across_chunks() {
        let mut lines = Lines::default();
        assert!(lines.push(b"data: {\"a\"").is_empty());
        assert_eq!(
            lines.push(b":1}\r\n\r\ndata: x\n"),
            ["data: {\"a\":1}", "", "data: x"]
        );
        // A multi-byte character split between chunks survives.
        let duck = "🦆".as_bytes();
        assert!(lines.push(&duck[..2]).is_empty());
        assert_eq!(lines.push(&[&duck[2..], b"\n"].concat()), ["🦆"]);
        assert!(lines.push(b"tail").is_empty());
        assert_eq!(lines.finish().as_deref(), Some("tail"));
        assert_eq!(lines.finish(), None);
    }

    #[test]
    fn parses_server_sent_events() {
        let mut sse = Sse::default();
        let mut events = Vec::new();
        for line in [
            ": keep-alive",
            "event: content_block_delta",
            "data: {\"x\":1}",
            "",
            "data: first",
            "data: second",
            "",
            "",
            "data:[DONE]",
        ] {
            events.extend(sse.line(line));
        }
        events.extend(sse.finish());
        assert_eq!(
            events,
            [
                SseEvent {
                    event: "content_block_delta".into(),
                    data: "{\"x\":1}".into()
                },
                SseEvent {
                    event: "message".into(),
                    data: "first\nsecond".into()
                },
                SseEvent {
                    event: "message".into(),
                    data: "[DONE]".into()
                },
            ]
        );
    }

    #[test]
    fn reads_error_messages_from_any_api() {
        assert_eq!(
            error_message(
                r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#
            ),
            "invalid x-api-key"
        );
        assert_eq!(
            error_message(r#"{"error":"model 'x' not found"}"#),
            "model 'x' not found"
        );
        assert_eq!(error_message("Bad Gateway"), "Bad Gateway");
    }

    #[test]
    fn local_servers_skip_the_proxy() {
        assert!(is_local("http://127.0.0.1:11434"));
        assert!(is_local("http://localhost:1234/v1"));
        assert!(is_local("http://[::1]:8080"));
        assert!(!is_local("https://api.anthropic.com"));
        assert_eq!(
            join("http://h/v1/", "/chat/completions"),
            "http://h/v1/chat/completions"
        );
    }
}

/// A one-shot HTTP server for brain tests.
#[cfg(test)]
pub mod mock {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::sync::mpsc;

    /// The request the server received.
    #[derive(Debug)]
    pub struct Captured {
        /// Request line and headers, header names lowercased.
        pub head: String,
        pub body: serde_json::Value,
    }

    impl Captured {
        pub fn header(&self, name: &str) -> Option<&str> {
            self.head.lines().find_map(|l| {
                let (k, v) = l.split_once(':')?;
                (k == name).then(|| v.trim())
            })
        }
    }

    /// Serves one response and returns the base URL and the captured request.
    pub async fn serve(
        status: u16,
        content_type: &str,
        body: &str,
    ) -> (String, mpsc::UnboundedReceiver<Captured>) {
        serve_all(&[(status, content_type, body)]).await
    }

    /// Serves the responses in order, one per connection.
    pub async fn serve_all(
        responses: &[(u16, &str, &str)],
    ) -> (String, mpsc::UnboundedReceiver<Captured>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = mpsc::unbounded_channel();
        let responses: Vec<String> = responses
            .iter()
            .map(|(status, content_type, body)| {
                format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: {content_type}\r\nConnection: close\r\n\r\n{body}"
                )
            })
            .collect();
        tokio::spawn(async move {
            for response in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let captured = read_request(&mut socket).await;
                let _ = tx.send(captured);
                socket.write_all(response.as_bytes()).await.unwrap();
                socket.shutdown().await.ok();
            }
        });
        (base, rx)
    }

    async fn read_request(socket: &mut tokio::net::TcpStream) -> Captured {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        let head_end = loop {
            let n = socket.read(&mut chunk).await.unwrap();
            buf.extend_from_slice(&chunk[..n]);
            if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                break i + 4;
            }
        };
        let head = String::from_utf8_lossy(&buf[..head_end])
            .lines()
            .map(|l| match l.split_once(':') {
                Some((k, v)) => format!("{}:{v}", k.to_ascii_lowercase()),
                None => l.to_owned(),
            })
            .collect::<Vec<_>>()
            .join("\n");
        let len: usize = head
            .lines()
            .find_map(|l| l.strip_prefix("content-length:"))
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or(0);
        while buf.len() < head_end + len {
            let n = socket.read(&mut chunk).await.unwrap();
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
        }
        let body = serde_json::from_slice(&buf[head_end..]).unwrap_or_default();
        Captured { head, body }
    }

    /// Collects everything a brain streams.
    pub async fn run(
        brain: &dyn crate::brain::Brain,
        request: crate::brain::BrainRequest,
    ) -> (String, Result<(), crate::brain::BrainError>) {
        let (tx, mut rx) = tokio::sync::mpsc::channel(64);
        let (result, text) = tokio::join!(brain.stream(request, tx), async {
            let mut text = String::new();
            while let Some(t) = rx.recv().await {
                text.push_str(&t);
            }
            text
        });
        (text, result)
    }

    pub fn request() -> crate::brain::BrainRequest {
        use crate::brain::{Message, Role};
        crate::brain::BrainRequest {
            system: "You are Frank.".into(),
            messages: vec![
                Message {
                    role: Role::User,
                    content: "Look at this plan".into(),
                },
                Message {
                    role: Role::Assistant,
                    content: "One call.".into(),
                },
                Message {
                    role: Role::User,
                    content: "Why Redis?".into(),
                },
            ],
            json_schema: None,
        }
    }
}
