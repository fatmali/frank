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

/// How far back the plans home looks, and how many plans it shows.
pub const HISTORY_DAYS: u64 = 14;
pub const HISTORY_LIMIT: usize = 40;
/// Older plans need more sessions searched to find the one that wrote them.
const HISTORY_TRANSCRIPTS: usize = 80;

/// Recent Claude Code plans, newest first. A plan no session mentions is
/// credited to the most recent session's project: it was written moments ago.
pub fn recent_claude_plans(claude_dir: &Path, window: Duration) -> Vec<Plan> {
    claude_plans(claude_dir, window, usize::MAX, MAX_TRANSCRIPTS, true)
}

/// The plans home: Claude Code plans from the last two weeks, newest first.
/// A plan no session mentions has no project, rather than a guessed one.
pub fn plan_history(claude_dir: &Path) -> Vec<Plan> {
    claude_plans(
        claude_dir,
        Duration::from_secs(HISTORY_DAYS * 24 * 60 * 60),
        HISTORY_LIMIT,
        HISTORY_TRANSCRIPTS,
        false,
    )
}

fn claude_plans(
    claude_dir: &Path,
    window: Duration,
    limit: usize,
    transcripts: usize,
    guess_project: bool,
) -> Vec<Plan> {
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
    files.sort_by_key(|f| std::cmp::Reverse(f.0));
    files.truncate(limit);

    let mut sessions = Sessions::new(recent_transcripts(claude_dir, window, transcripts));
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
                project: sessions.project_for(&name, guess_project),
                modified_at: rfc3339(modified),
                origin: path.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

/// Session transcripts modified within the window, newest first.
fn recent_transcripts(claude_dir: &Path, window: Duration, max: usize) -> Vec<PathBuf> {
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
    found.sort_by_key(|f| std::cmp::Reverse(f.0));
    found.into_iter().take(max).map(|(_, p)| p).collect()
}

/// Session transcripts, each tail read at most once and only when needed:
/// the newest plans are usually in the newest sessions.
struct Sessions {
    paths: Vec<PathBuf>,
    /// Tails read so far, in order: the text and its last `cwd`.
    read: Vec<(String, Option<String>)>,
}

impl Sessions {
    fn new(paths: Vec<PathBuf>) -> Self {
        Self {
            paths,
            read: Vec::new(),
        }
    }

    /// The `i`th transcript's tail, reading it if it hasn't been.
    fn get(&mut self, i: usize) -> Option<&(String, Option<String>)> {
        while self.read.len() <= i {
            let path = self.paths.get(self.read.len())?;
            let text = tail(path).unwrap_or_default();
            let cwd = last_cwd(&text);
            self.read.push((text, cwd));
        }
        self.read.get(i)
    }

    /// The working directory of the session that wrote the plan, or, when
    /// `guess` is set and no session mentions it, of the most recent session.
    fn project_for(&mut self, plan_file: &str, guess: bool) -> Option<String> {
        let mut i = 0;
        while let Some((text, cwd)) = self.get(i) {
            if text.contains(plan_file) {
                return cwd.clone();
            }
            i += 1;
        }
        if !guess {
            return None;
        }
        self.get(0).and_then(|(_, cwd)| cwd.clone())
    }
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
    static CWD: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = CWD.get_or_init(|| {
        regex::Regex::new(r#""cwd"\s*:\s*("(?:[^"\\]|\\.)*")"#).expect("valid regex")
    });
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
    fn the_history_never_guesses_a_project() {
        let claude = tempfile::tempdir().unwrap();
        write(
            &claude.path().join("plans/old-quiet-owl.md"),
            "# Tidy the logger\n1. Rename things",
        );
        write(
            &claude.path().join("plans/jaunty-petting-nebula.md"),
            "# Add rate limiting\n1. Use Redis",
        );
        write(
            &claude.path().join("projects/-Users-me-my-app/abc.jsonl"),
            "{\"cwd\":\"/Users/me/my-app\",\"message\":\"wrote plans/jaunty-petting-nebula.md\"}\n",
        );
        let history = plan_history(claude.path());
        let by_title = |t: &str| history.iter().find(|p| p.title == t).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(
            by_title("Add rate limiting").project.as_deref(),
            Some("/Users/me/my-app")
        );
        assert_eq!(by_title("Tidy the logger").project, None);
        // Just written, a plan no session mentions still gets the latest project.
        let recent = recent_claude_plans(claude.path(), Duration::from_secs(600));
        assert!(recent.iter().all(|p| p.project.is_some()));
    }

    #[test]
    fn reads_each_session_once_and_only_as_far_as_needed() {
        let claude = tempfile::tempdir().unwrap();
        let paths: Vec<PathBuf> = ["new", "mid", "old"]
            .iter()
            .map(|name| {
                let path = claude.path().join(format!("{name}.jsonl"));
                write(
                    &path,
                    &format!("{{\"cwd\":\"/p/{name}\",\"message\":\"plans/{name}-plan.md\"}}\n"),
                );
                path
            })
            .collect();
        let mut sessions = Sessions::new(paths);
        assert_eq!(
            sessions.project_for("new-plan.md", false).as_deref(),
            Some("/p/new")
        );
        assert_eq!(sessions.read.len(), 1, "the newest session was enough");
        assert_eq!(
            sessions.project_for("old-plan.md", false).as_deref(),
            Some("/p/old")
        );
        assert_eq!(sessions.project_for("nobody.md", false), None);
        assert_eq!(
            sessions.project_for("nobody.md", true).as_deref(),
            Some("/p/new")
        );
        assert_eq!(sessions.read.len(), 3, "each session read once");
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
