//! Finding the plan an agent just wrote.
//!
//! M1 supports Claude Code: plan mode writes each plan to `~/.claude/plans/`
//! (or `plansDirectory` in the user's settings). Plan files don't record which
//! project they belong to, so Frank reads it from the Claude Code session that
//! wrote the plan.

use crate::types::{Plan, PlanSource, rfc3339, title_of};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// How much of the end of a session transcript to scan for the plan and `cwd`.
const TRANSCRIPT_TAIL_BYTES: u64 = 512 * 1024;
/// How many recent transcripts to look through.
const MAX_TRANSCRIPTS: usize = 12;

/// Where Claude Code keeps its data: `$CLAUDE_CONFIG_DIR`, or `~/.claude`.
pub fn claude_dir() -> PathBuf {
    std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".claude")))
        .unwrap_or_else(|| PathBuf::from(".claude"))
}

/// The plans directory: `plansDirectory` from the user settings if it's an
/// absolute or `~` path, otherwise `<claude dir>/plans`.
pub fn claude_plans_dir(claude_dir: &Path) -> PathBuf {
    let configured = std::fs::read_to_string(claude_dir.join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("plansDirectory")?.as_str().map(str::to_owned));
    match configured.as_deref() {
        Some(p) if p.starts_with("~/") => dirs::home_dir()
            .map(|h| h.join(&p[2..]))
            .unwrap_or_else(|| PathBuf::from(p)),
        Some(p) if Path::new(p).is_absolute() => PathBuf::from(p),
        _ => claude_dir.join("plans"),
    }
}

/// Recent Claude Code plans, newest first.
pub fn recent_claude_plans(claude_dir: &Path, window: Duration) -> Vec<Plan> {
    let dir = claude_plans_dir(claude_dir);
    let cutoff = SystemTime::now()
        .checked_sub(window)
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let mut files: Vec<(SystemTime, PathBuf)> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .filter_map(|p| Some((p.metadata().ok()?.modified().ok()?, p)))
        .filter(|(m, _)| *m >= cutoff)
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));

    let transcripts = recent_transcripts(claude_dir, window);
    files
        .into_iter()
        .filter_map(|(modified, path)| {
            let body = std::fs::read_to_string(&path).ok()?;
            if body.trim().is_empty() {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().into_owned();
            Some(Plan {
                source: PlanSource::ClaudeCode,
                title: title_of(&body),
                body,
                project: project_for_plan(&transcripts, &name),
                modified_at: rfc3339(modified),
                origin: path.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

/// Session transcripts modified within the window, newest first.
fn recent_transcripts(claude_dir: &Path, window: Duration) -> Vec<PathBuf> {
    let cutoff = SystemTime::now()
        .checked_sub(window)
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let mut found: Vec<(SystemTime, PathBuf)> = std::fs::read_dir(claude_dir.join("projects"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .flat_map(|project| {
            std::fs::read_dir(project.path())
                .into_iter()
                .flatten()
                .flatten()
        })
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
        .filter_map(|p| Some((p.metadata().ok()?.modified().ok()?, p)))
        .filter(|(m, _)| *m >= cutoff)
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found
        .into_iter()
        .take(MAX_TRANSCRIPTS)
        .map(|(_, p)| p)
        .collect()
}

/// The working directory of the session that wrote the plan, or of the most
/// recent session if none mentions it.
fn project_for_plan(transcripts: &[PathBuf], plan_file: &str) -> Option<String> {
    let tails: Vec<String> = transcripts.iter().filter_map(|t| tail(t).ok()).collect();
    tails
        .iter()
        .find(|t| t.contains(plan_file))
        .and_then(|t| last_cwd(t))
        .or_else(|| tails.first().and_then(|t| last_cwd(t)))
}

fn tail(path: &Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(TRANSCRIPT_TAIL_BYTES)))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// The last `"cwd": "..."` value in a chunk of JSON lines.
fn last_cwd(text: &str) -> Option<String> {
    let re = regex::Regex::new(r#""cwd"\s*:\s*("(?:[^"\\]|\\.)*")"#).expect("valid regex");
    let raw = re.captures_iter(text).last()?.get(1)?.as_str();
    serde_json::from_str::<String>(raw)
        .ok()
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn finds_recent_plans_newest_first_with_their_project() {
        let claude = tempfile::tempdir().unwrap();
        let plans = claude.path().join("plans");
        write(
            &plans.join("calm-silver-fox.md"),
            "# Older plan\n1. Do a thing",
        );
        std::thread::sleep(Duration::from_millis(20));
        write(
            &plans.join("jaunty-petting-nebula.md"),
            "# Add rate limiting\n1. Use Redis",
        );
        write(&plans.join("notes.txt"), "not a plan");
        write(
            &claude.path().join("projects/-Users-me-my-app/abc.jsonl"),
            "{\"cwd\":\"/Users/me/my-app\",\"type\":\"user\"}\n\
             {\"cwd\":\"/Users/me/my-app\",\"message\":\"wrote ~/.claude/plans/jaunty-petting-nebula.md\"}\n",
        );
        write(
            &claude.path().join("projects/-Users-me-other/def.jsonl"),
            "{\"cwd\":\"/Users/me/other\",\"type\":\"user\"}\n",
        );

        let found = recent_claude_plans(claude.path(), Duration::from_secs(600));
        let titles: Vec<_> = found.iter().map(|p| p.title.as_str()).collect();
        assert_eq!(titles, ["Add rate limiting", "Older plan"]);
        assert_eq!(found[0].project.as_deref(), Some("/Users/me/my-app"));
        assert_eq!(found[0].source, PlanSource::ClaudeCode);
        assert!(found[0].origin.ends_with("jaunty-petting-nebula.md"));
    }

    #[test]
    fn honours_plans_directory_from_settings() {
        let claude = tempfile::tempdir().unwrap();
        let custom = tempfile::tempdir().unwrap();
        write(
            &claude.path().join("settings.json"),
            &format!(
                "{{\"plansDirectory\": {:?}}}",
                custom.path().to_string_lossy()
            ),
        );
        write(&custom.path().join("p.md"), "# Custom location plan");
        let found = recent_claude_plans(claude.path(), Duration::from_secs(600));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Custom location plan");
    }

    #[test]
    fn nothing_recent_means_nothing_found() {
        let claude = tempfile::tempdir().unwrap();
        assert!(recent_claude_plans(claude.path(), Duration::from_secs(600)).is_empty());
        write(&claude.path().join("plans/empty.md"), "   \n");
        assert!(recent_claude_plans(claude.path(), Duration::from_secs(600)).is_empty());
    }

    #[test]
    fn reads_escaped_cwd_values() {
        let text = r#"{"cwd":"C:\\Users\\me\\app"}"#;
        assert_eq!(last_cwd(text).as_deref(), Some(r"C:\Users\me\app"));
        assert_eq!(last_cwd("{}"), None);
    }
}
