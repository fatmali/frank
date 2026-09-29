fn main() {
    link_clang_runtime();
    tauri_build::build();
}

/// Whisper's Metal code uses `@available(macOS …)`, which compiles to a call
/// into clang's runtime library. Rust doesn't link that library by default,
/// so link it from wherever this machine's clang keeps it.
fn link_clang_runtime() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let Ok(out) = std::process::Command::new("clang")
        .arg("--print-runtime-dir")
        .output()
    else {
        return;
    };
    let dir = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    if !dir.is_empty() {
        println!("cargo:rustc-link-search=native={dir}");
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
}
