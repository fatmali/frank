//! Finding programs the way the developer's terminal would.
//!
//! Apps launched from the Dock or menu bar on macOS get a bare `PATH`
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), so `claude` or `copilot` installed by
//! Homebrew, npm or a standalone installer can't be found. Frank adds the
//! usual install locations and, once, asks the login shell for its `PATH`.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Common places developer CLIs get installed, relative to `$HOME` or absolute.
const EXTRA_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "~/.local/bin",
    "~/.claude/local",
    "~/.npm-global/bin",
    "~/.volta/bin",
    "~/.bun/bin",
    "~/.cargo/bin",
];

/// The `PATH` Frank searches and hands to the processes it starts.
pub fn search_path() -> OsString {
    static CACHE: OnceLock<OsString> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut dirs: Vec<PathBuf> = Vec::new();
            let mut push = |p: PathBuf| {
                if !p.as_os_str().is_empty() && !dirs.contains(&p) {
                    dirs.push(p);
                }
            };
            if let Some(path) = std::env::var_os("PATH") {
                std::env::split_paths(&path).for_each(&mut push);
            }
            if let Some(login) = login_shell_path() {
                std::env::split_paths(&login).for_each(&mut push);
            }
            let home = dirs::home_dir();
            for extra in EXTRA_DIRS {
                match (extra.strip_prefix("~/"), &home) {
                    (Some(rest), Some(h)) => push(h.join(rest)),
                    (None, _) => push(PathBuf::from(extra)),
                    _ => {}
                }
            }
            std::env::join_paths(dirs).unwrap_or_default()
        })
        .clone()
}

/// Finds an executable on [`search_path`].
pub fn which(program: &str) -> Option<PathBuf> {
    which_in(program, &search_path())
}

pub fn which_in(program: &str, path: &OsString) -> Option<PathBuf> {
    std::env::split_paths(path)
        .map(|dir| dir.join(program))
        .find(|candidate| is_executable(candidate))
}

fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        p.metadata()
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file() || p.with_extension("exe").is_file() || p.with_extension("cmd").is_file()
    }
}

/// Asks the developer's login shell for its `PATH`, with a short timeout.
fn login_shell_path() -> Option<OsString> {
    if cfg!(not(target_os = "macos")) {
        return None;
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let child = std::process::Command::new(shell)
        .args(["-ilc", "printf '%s' \"$PATH\""])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .ok()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    let out = rx
        .recv_timeout(std::time::Duration::from_secs(3))
        .ok()?
        .ok()?;
    let text = String::from_utf8(out.stdout).ok()?;
    let line = text.lines().last()?.trim();
    (!line.is_empty()).then(|| OsString::from(line))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn finds_executables_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("claude");
        std::fs::write(&exe, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(dir.path().join("copilot"), "not executable").unwrap();

        let path = std::env::join_paths([dir.path()]).unwrap();
        assert_eq!(which_in("claude", &path), Some(exe));
        assert_eq!(which_in("copilot", &path), None);
    }

    #[test]
    fn search_path_keeps_the_current_path() {
        let current = std::env::var_os("PATH").unwrap();
        let first = std::env::split_paths(&current).next().unwrap();
        assert!(std::env::split_paths(&search_path()).any(|p| p == first));
    }
}
