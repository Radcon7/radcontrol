use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
pub struct RunO2Result {
    pub ok: bool,
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

fn error_result(msg: impl Into<String>) -> RunO2Result {
    RunO2Result {
        ok: false,
        code: 1,
        stdout: String::new(),
        stderr: msg.into(),
    }
}

fn o2_root() -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("O2_ROOT") {
        let trimmed = root.trim();
        if trimmed.is_empty() {
            return Err("O2_ROOT is set but empty".to_string());
        }
        return Ok(PathBuf::from(trimmed));
    }

    let home =
        std::env::var("HOME").map_err(|_| "HOME not set and O2_ROOT not provided".to_string())?;
    let trimmed = home.trim();
    if trimmed.is_empty() {
        return Err("HOME is empty and O2_ROOT not provided".to_string());
    }
    Ok(PathBuf::from(trimmed).join("dev").join("o2"))
}

fn run_o2_script() -> Result<PathBuf, String> {
    let script = o2_root()?.join("scripts").join("run_o2.sh");
    if !script.is_file() {
        return Err(format!("run_o2.sh not found at {}", script.display()));
    }
    Ok(script)
}

fn is_safe_verb(v: &str) -> bool {
    !v.is_empty()
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn run_o2_command(arg: &str) -> RunO2Result {
    // We only ever call: bash <O2_ROOT>/scripts/run_o2.sh "<verb>"
    // No freeform shell; arg is treated as a single verb string.
    let script = match run_o2_script() {
        Ok(p) => p,
        Err(e) => return error_result(e),
    };

    let out = Command::new("bash").arg(&script).arg(arg).output();

    match out {
        Ok(o) => RunO2Result {
            ok: o.status.success(),
            code: o.status.code().unwrap_or(1),
            stdout: String::from_utf8_lossy(&o.stdout).to_string(),
            stderr: String::from_utf8_lossy(&o.stderr).to_string(),
        },
        Err(e) => RunO2Result {
            ok: false,
            code: 1,
            stdout: String::new(),
            stderr: format!("failed to spawn run_o2: {}", e),
        },
    }
}

#[tauri::command]
pub fn run_o2(verb: String) -> RunO2Result {
    // Defensive trim; keep it as one argument.
    let v = verb.trim().to_string();
    if v.is_empty() {
        return error_result("empty verb");
    }
    if !is_safe_verb(&v) {
        return error_result("invalid verb: allowed chars are [A-Za-z0-9._-]");
    }
    run_o2_command(&v)
}
