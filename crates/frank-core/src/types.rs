//! Shapes shared with the TypeScript engine (`packages/engine/src/types.ts`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlanSource {
    ClaudeCode,
    Copilot,
    Cursor,
    Codex,
    Pasted,
    File,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub source: PlanSource,
    /// The plan's own title: its first heading or first line.
    pub title: String,
    /// The plan text, as Markdown.
    pub body: String,
    /// Absolute path of the repo the plan belongs to, if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    /// RFC 3339 timestamp of when the plan was written.
    pub modified_at: String,
    /// File the plan was read from, or a label such as "clipboard".
    pub origin: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContext {
    /// Path relative to the repo root, with forward slashes.
    pub path: String,
    pub content: String,
    /// True when the content was cut to fit the size limit.
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSummary {
    pub root: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    pub changed_files: Vec<String>,
    pub rules: Vec<RulesFile>,
}

/// Formats a time as RFC 3339 in UTC, e.g. `2026-09-28T10:00:00Z`.
pub fn rfc3339(t: std::time::SystemTime) -> String {
    let secs = t
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (days, rem) = ((secs / 86_400) as i64, secs % 86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3_600,
        rem % 3_600 / 60,
        rem % 60
    )
}

/// The first Markdown heading, or else the first non-empty line, trimmed.
pub fn title_of(body: &str) -> String {
    let heading = body.lines().find_map(|l| {
        l.trim_start()
            .strip_prefix('#')
            .map(|h| h.trim_start_matches('#').trim())
    });
    let title = heading
        .filter(|h| !h.is_empty())
        .or_else(|| body.lines().map(str::trim).find(|l| !l.is_empty()))
        .unwrap_or("Untitled plan");
    title.chars().take(120).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_rfc3339() {
        use std::time::{Duration, UNIX_EPOCH};
        assert_eq!(rfc3339(UNIX_EPOCH), "1970-01-01T00:00:00Z");
        // 2026-09-28T10:00:00Z
        assert_eq!(
            rfc3339(UNIX_EPOCH + Duration::from_secs(1_790_589_600)),
            "2026-09-28T10:00:00Z"
        );
        // Leap day.
        assert_eq!(
            rfc3339(UNIX_EPOCH + Duration::from_secs(1_709_164_800)),
            "2024-02-29T00:00:00Z"
        );
    }

    #[test]
    fn title_prefers_the_first_heading() {
        assert_eq!(
            title_of("intro\n## Add rate limiting\n"),
            "Add rate limiting"
        );
        assert_eq!(title_of("\n\nJust a line\nmore"), "Just a line");
        assert_eq!(title_of(""), "Untitled plan");
    }

    #[test]
    fn serializes_like_the_typescript_engine() {
        let plan = Plan {
            source: PlanSource::ClaudeCode,
            title: "t".into(),
            body: "b".into(),
            project: None,
            modified_at: "2026-09-28T10:00:00Z".into(),
            origin: "o".into(),
        };
        let json = serde_json::to_string(&plan).unwrap();
        assert_eq!(
            json,
            r#"{"source":"claude-code","title":"t","body":"b","modifiedAt":"2026-09-28T10:00:00Z","origin":"o"}"#
        );
    }
}
