//! Reading the files a plan mentions, so Frank's checks rest on real code.
//!
//! Plan text is written by an agent, so every path in it is untrusted:
//! - only relative paths inside the repo are read; `..`, absolute paths and
//!   symlinks that point outside the repo are refused;
//! - secret files (`.env`, keys, credentials) are never opened;
//! - common secret patterns are stripped from whatever is read;
//! - there are limits on file count, per-file size and total size.

use crate::types::FileContext;
use regex::Regex;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

pub const MAX_FILES: usize = 12;
pub const MAX_FILE_BYTES: usize = 64 * 1024;

/// Repo-relative paths mentioned in a plan, in the order they first appear.
pub fn extract_paths(plan: &str) -> Vec<String> {
    static RES: OnceLock<[Regex; 3]> = OnceLock::new();
    let [code, slashed, bare] = RES.get_or_init(|| {
        [
            // `src/server.ts`, `docker-compose.yml`
            Regex::new(r"`([^`\s]+)`").unwrap(),
            // src/middleware/rateLimit.ts, ./lib/x.go
            Regex::new(r"(?:^|[\s(\[\x22'])((?:\.{1,2}/)?[\w@.+-]+(?:/[\w@.+-]+)+\.[A-Za-z0-9]{1,10})").unwrap(),
            // docker-compose.yml, package.json (known extensions only, to avoid "e.g.")
            Regex::new(r"(?:^|[\s(\[\x22'])([\w.+-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|py|rs|go|rb|java|kt|swift|sql|sh|md|css|scss|html|vue|svelte|prisma|graphql|proto|tf|dockerfile|gradle|xml|ini|cfg|conf|lock))\b").unwrap(),
        ]
    });

    let mut out: Vec<String> = Vec::new();
    let mut add = |raw: &str| {
        let p = raw
            .trim_end_matches(|c: char| ".,;:)]'\"".contains(c))
            .trim_start_matches("./");
        let looks_like_path = p.contains('/') || p.contains('.');
        if looks_like_path && !p.contains("://") && !p.is_empty() && !out.iter().any(|o| o == p) {
            out.push(p.to_owned());
        }
    };
    for re in [code, slashed, bare] {
        for cap in re.captures_iter(plan) {
            add(cap.get(1).map_or("", |m| m.as_str()));
        }
    }
    out
}

/// Reads the mentioned files that exist inside `root`, within the limits.
/// Returns the files read and the mentioned paths that were skipped, with why.
pub fn read_touched(
    root: &Path,
    plan: &str,
    max_total_bytes: usize,
) -> (Vec<FileContext>, Vec<(String, Skip)>) {
    let mut read = Vec::new();
    let mut skipped = Vec::new();
    let mut total = 0usize;
    let Ok(root) = root.canonicalize() else {
        return (read, skipped);
    };

    for rel in extract_paths(plan) {
        let outcome = resolve_inside(&root, &rel).and_then(|full| {
            if read.len() >= MAX_FILES {
                return Err(Skip::TooMany);
            }
            if total >= max_total_bytes {
                return Err(Skip::TotalLimit);
            }
            load(&full, MAX_FILE_BYTES.min(max_total_bytes - total))
        });
        match outcome {
            Ok((content, truncated)) => {
                total += content.len();
                read.push(FileContext {
                    path: rel,
                    content,
                    truncated,
                });
            }
            // Mentions that aren't files in this repo are normal (new files, prose); don't report them.
            Err(Skip::NotFound) => {}
            Err(why) => skipped.push((rel, why)),
        }
    }
    (read, skipped)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Skip {
    NotFound,
    OutsideRepo,
    Secret,
    Binary,
    TooMany,
    TotalLimit,
}

/// Resolves a plan-supplied path to a real file inside `root` (already canonical).
fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, Skip> {
    let rel_path = Path::new(rel);
    if rel.starts_with('~')
        || rel_path.is_absolute()
        || rel_path.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(Skip::OutsideRepo);
    }
    if is_secret_path(rel_path) {
        return Err(Skip::Secret);
    }
    let full = root
        .join(rel_path)
        .canonicalize()
        .map_err(|_| Skip::NotFound)?;
    if !full.starts_with(root) {
        // A symlink that points out of the repo.
        return Err(Skip::OutsideRepo);
    }
    if !full.is_file() {
        return Err(Skip::NotFound);
    }
    // Check again after following symlinks, e.g. config.yml -> ../.env
    if is_secret_path(&full) {
        return Err(Skip::Secret);
    }
    Ok(full)
}

/// Files Frank never opens, whatever the plan says.
pub fn is_secret_path(p: &Path) -> bool {
    let in_secret_dir = p.components().any(|c| {
        matches!(
            c.as_os_str().to_str(),
            Some(".ssh" | ".aws" | ".gnupg" | ".git" | ".docker" | ".kube")
        )
    });
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let secret_name = name == ".env"
        || name.starts_with(".env.")
        || name.ends_with(".env")
        || name.starts_with("id_rsa")
        || name.starts_with("id_ed25519")
        || name.starts_with("id_ecdsa")
        || matches!(
            name.as_str(),
            ".npmrc" | ".pypirc" | ".netrc" | ".htpasswd" | "credentials" | "credentials.json"
        )
        || name.starts_with("secrets.")
        || name.starts_with("secret.")
        || [
            ".pem",
            ".key",
            ".p12",
            ".pfx",
            ".keystore",
            ".jks",
            ".asc",
            ".tfvars",
            ".tfstate",
        ]
        .iter()
        .any(|ext| name.ends_with(ext));
    in_secret_dir || secret_name
}

fn load(path: &Path, limit: usize) -> Result<(String, bool), Skip> {
    let bytes = std::fs::read(path).map_err(|_| Skip::NotFound)?;
    if bytes.iter().take(8 * 1024).any(|&b| b == 0) {
        return Err(Skip::Binary);
    }
    let text = String::from_utf8_lossy(&bytes);
    let (cut, truncated) = if text.len() > limit {
        let mut end = limit;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        (&text[..end], true)
    } else {
        (&text[..], false)
    };
    Ok((redact_secrets(cut), truncated))
}

/// Replaces common secret patterns. Best-effort: it catches keys and tokens
/// that look like keys and tokens, not every sensitive value.
pub fn redact_secrets(text: &str) -> String {
    static RES: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    let rules = RES.get_or_init(|| {
        vec![
            (Regex::new(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----").unwrap(), "[private key removed by Frank]"),
            (Regex::new(r"\bsk-ant-[A-Za-z0-9_-]{20,}").unwrap(), "[key removed by Frank]"),
            (Regex::new(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}").unwrap(), "[key removed by Frank]"),
            (Regex::new(r"\bgh[pousr]_[A-Za-z0-9]{30,}").unwrap(), "[token removed by Frank]"),
            (Regex::new(r"\bgithub_pat_[A-Za-z0-9_]{22,}").unwrap(), "[token removed by Frank]"),
            (Regex::new(r"\bAKIA[0-9A-Z]{16}\b").unwrap(), "[key removed by Frank]"),
            (Regex::new(r"\bxox[abprs]-[A-Za-z0-9-]{10,}").unwrap(), "[token removed by Frank]"),
            (Regex::new(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}").unwrap(), "[token removed by Frank]"),
            // .env style: API_KEY=value, DB_PASSWORD="value"
            (Regex::new(r#"(?m)^(\s*(?:export\s+)?[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*=\s*)["']?[^\s"'#]{6,}["']?"#).unwrap(), "${1}[removed by Frank]"),
            // Quoted literals assigned to secret-looking names: apiKey: "value"
            (Regex::new(r#"(?i)\b((?:api[_-]?key|secret|token|password|passwd)["']?\s*[:=]\s*)["'][^"'\s]{8,}["']"#).unwrap(), "${1}\"[removed by Frank]\""),
        ]
    });
    let mut out = text.to_owned();
    for (re, with) in rules {
        out = re.replace_all(&out, *with).into_owned();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    #[test]
    fn extracts_paths_from_a_real_plan() {
        let plan = "1. Add `express-rate-limit` as a dependency.\n\
                    2. Create `src/middleware/rateLimit.ts`.\n\
                    3. Apply it in src/server.ts and check docker-compose.yml.\n\
                    4. See https://example.com/docs/x.html, e.g. the docs.";
        assert_eq!(
            extract_paths(plan),
            [
                "src/middleware/rateLimit.ts",
                "src/server.ts",
                "docker-compose.yml"
            ]
        );
    }

    #[test]
    fn reads_mentioned_files_inside_the_repo() {
        let repo = tempfile::tempdir().unwrap();
        write(repo.path(), "src/server.ts", "app.get('/health')");
        let (read, skipped) = read_touched(
            repo.path(),
            "Edit `src/server.ts` and `src/new.ts`",
            1 << 20,
        );
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].path, "src/server.ts");
        assert_eq!(read[0].content, "app.get('/health')");
        assert!(
            skipped.is_empty(),
            "new files the plan will create aren't worth reporting"
        );
    }

    #[test]
    fn refuses_paths_outside_the_repo() {
        let outer = tempfile::tempdir().unwrap();
        let repo = outer.path().join("repo");
        write(&repo, "ok.ts", "fine");
        write(outer.path(), "private.txt", "secret stuff");
        let plan = "Read `../private.txt`, `/etc/passwd`, `~/.ssh/config` and `ok.ts`";
        let (read, skipped) = read_touched(&repo, plan, 1 << 20);
        assert_eq!(
            read.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(),
            ["ok.ts"]
        );
        assert!(
            skipped.iter().all(|(_, why)| *why == Skip::OutsideRepo),
            "{skipped:?}"
        );
        assert_eq!(skipped.len(), 3);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_that_leave_the_repo_or_hide_secrets() {
        let outer = tempfile::tempdir().unwrap();
        let repo = outer.path().join("repo");
        write(outer.path(), "outside.txt", "nope");
        write(&repo, ".env", "API_KEY=abc123456");
        std::os::unix::fs::symlink(outer.path().join("outside.txt"), repo.join("escape.txt"))
            .unwrap();
        std::os::unix::fs::symlink(repo.join(".env"), repo.join("config.yml")).unwrap();
        let (read, skipped) = read_touched(&repo, "`escape.txt` and `config.yml`", 1 << 20);
        assert!(read.is_empty());
        assert_eq!(
            skipped,
            [
                ("escape.txt".into(), Skip::OutsideRepo),
                ("config.yml".into(), Skip::Secret)
            ]
        );
    }

    #[test]
    fn never_opens_secret_files() {
        for p in [
            ".env",
            ".env.local",
            "config/prod.env",
            "certs/server.pem",
            "id_rsa",
            ".aws/credentials",
            "secrets.yml",
            ".git/config",
        ] {
            assert!(is_secret_path(Path::new(p)), "{p} should be secret");
        }
        for p in [
            "src/env.ts",
            "environment.md",
            "keyboard.ts",
            "src/tokens.css",
        ] {
            assert!(!is_secret_path(Path::new(p)), "{p} is fine");
        }
    }

    #[test]
    fn strips_secret_patterns() {
        let text = "ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz\n\
                    const token = \"ghp_abcdefghijklmnopqrstuvwxyz0123456789\";\n\
                    password: \"hunter2hunter2\"\n\
                    const password = getPassword(); // code, not a secret\n\
                    -----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----";
        let out = redact_secrets(text);
        assert!(!out.contains("sk-ant-api03"), "{out}");
        assert!(!out.contains("ghp_"), "{out}");
        assert!(!out.contains("hunter2"), "{out}");
        assert!(!out.contains("MIIE"), "{out}");
        assert!(
            out.contains("ANTHROPIC_API_KEY=[key removed by Frank]"),
            "{out}"
        );
        assert_eq!(
            redact_secrets("DB_PASSWORD=\"s3cretvalue\""),
            "DB_PASSWORD=[removed by Frank]"
        );
        assert!(
            out.contains("getPassword()"),
            "ordinary code survives: {out}"
        );
    }

    #[test]
    fn respects_size_limits_and_skips_binaries() {
        let repo = tempfile::tempdir().unwrap();
        write(repo.path(), "big.ts", &"x".repeat(MAX_FILE_BYTES + 10));
        std::fs::write(
            repo.path().join("logo.png"),
            [0x89, b'P', b'N', b'G', 0, 0, 1],
        )
        .unwrap();
        write(repo.path(), "small.ts", "ok");
        let plan = "`big.ts`, `logo.png`, `small.ts`";
        let (read, skipped) = read_touched(repo.path(), plan, 1 << 20);
        assert_eq!(read[0].path, "big.ts");
        assert!(read[0].truncated);
        assert_eq!(read[0].content.len(), MAX_FILE_BYTES);
        assert_eq!(read[1].path, "small.ts");
        assert_eq!(skipped, [("logo.png".into(), Skip::Binary)]);

        // A tight total budget stops reading.
        let (read, skipped) = read_touched(repo.path(), plan, 100);
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].content.len(), 100);
        assert!(skipped.contains(&("small.ts".into(), Skip::TotalLimit)));
    }
}
