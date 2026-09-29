//! A short summary of the repo a plan is about: branch, changed files, and
//! rules files such as `AGENTS.md`. Uses the `git` CLI; no git library.

use crate::files::redact_secrets;
use crate::types::{RepoSummary, RulesFile};
use std::path::{Path, PathBuf};
use std::process::Command;

const RULES_FILES: &[&str] = &["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
const MAX_RULES_BYTES: usize = 16 * 1024;
const MAX_CHANGED_FILES: usize = 50;

/// The top of the git repo containing `dir`, if it's in one.
pub fn repo_root(dir: &Path) -> Option<PathBuf> {
    let out = git(dir, &["rev-parse", "--show-toplevel"])?;
    Some(PathBuf::from(out.trim()))
}

pub fn summarize(root: &Path) -> RepoSummary {
    let branch = git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|b| b.trim().to_owned())
        .filter(|b| !b.is_empty() && b != "HEAD");
    let changed_files = git(
        root,
        &["status", "--porcelain=v1", "--untracked-files=normal"],
    )
    .map(|s| parse_porcelain(&s))
    .unwrap_or_default();
    let rules = RULES_FILES
        .iter()
        .filter_map(|rel| {
            let text = std::fs::read_to_string(root.join(rel)).ok()?;
            let mut end = text.len().min(MAX_RULES_BYTES);
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            Some(RulesFile {
                path: (*rel).to_owned(),
                content: redact_secrets(&text[..end]),
            })
        })
        .collect();
    RepoSummary {
        root: root.to_string_lossy().into_owned(),
        branch,
        changed_files,
        rules,
    }
}

fn parse_porcelain(status: &str) -> Vec<String> {
    status
        .lines()
        .filter(|l| l.len() > 3)
        .map(|l| {
            let path = &l[3..];
            // Renames look like "old -> new"; keep the new name.
            path.rsplit(" -> ")
                .next()
                .unwrap_or(path)
                .trim_matches('"')
                .to_owned()
        })
        .take(MAX_CHANGED_FILES)
        .collect()
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("PATH", crate::env::search_path())
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "git {args:?} failed");
    }

    #[test]
    fn summarizes_a_repo() {
        let repo = tempfile::tempdir().unwrap();
        let root = repo.path();
        run(root, &["init", "-q", "-b", "feature/rate-limit"]);
        run(root, &["config", "user.email", "t@example.com"]);
        run(root, &["config", "user.name", "Test"]);
        std::fs::write(
            root.join("AGENTS.md"),
            "Use pnpm. Never add Redis without asking.",
        )
        .unwrap();
        std::fs::write(root.join("server.ts"), "v1").unwrap();
        run(root, &["add", "."]);
        run(root, &["commit", "-q", "-m", "init"]);
        std::fs::write(root.join("server.ts"), "v2").unwrap();
        std::fs::write(root.join("new.ts"), "new").unwrap();

        let found = repo_root(&root.join(".")).unwrap();
        assert_eq!(found.canonicalize().unwrap(), root.canonicalize().unwrap());

        let s = summarize(root);
        assert_eq!(s.branch.as_deref(), Some("feature/rate-limit"));
        let mut changed = s.changed_files.clone();
        changed.sort();
        assert_eq!(changed, ["new.ts", "server.ts"]);
        assert_eq!(s.rules.len(), 1);
        assert_eq!(s.rules[0].path, "AGENTS.md");
    }

    #[test]
    fn not_a_repo() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(repo_root(dir.path()), None);
    }

    #[test]
    fn keeps_the_new_name_of_renames() {
        assert_eq!(
            parse_porcelain("R  old.ts -> new.ts\n M a.ts\n"),
            ["new.ts", "a.ts"]
        );
    }
}
