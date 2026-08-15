use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn git_output(root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let source_root = Path::new(&manifest_dir).parent().unwrap_or(Path::new("."));
    let git_sha =
        git_output(source_root, &["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".to_string());
    if let Some(head_path) = git_output(
        source_root,
        &["rev-parse", "--path-format=absolute", "--git-path", "HEAD"],
    ) {
        println!("cargo:rerun-if-changed={head_path}");
    }
    if let Some(head_ref) = git_output(source_root, &["symbolic-ref", "HEAD"]) {
        if let Some(ref_path) = git_output(
            source_root,
            &[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                &head_ref,
            ],
        ) {
            println!("cargo:rerun-if-changed={ref_path}");
        }
    }
    let built_at_epoch_seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    println!("cargo:rustc-env=RADCONTROL_GIT_SHA={git_sha}");
    println!("cargo:rustc-env=RADCONTROL_BUILD_EPOCH={built_at_epoch_seconds}");
    println!(
        "cargo:rustc-env=RADCONTROL_SOURCE_ROOT={}",
        source_root.display()
    );

    tauri_build::build()
}
