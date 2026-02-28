use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

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
    let o2_root_env = std::env::var("O2_ROOT").ok();
    if let Some(root) = o2_root_env.as_deref() {
        let trimmed = root.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    let home_env = std::env::var("HOME").ok();
    if let Some(home) = home_env.as_deref() {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed).join("dev").join("o2"));
        }
    }

    if let Some(home) = dirs::home_dir() {
        return Ok(home.join("dev").join("o2"));
    }

    let o2_root_state = match o2_root_env {
        Some(v) if v.trim().is_empty() => "set but empty",
        Some(_) => "set",
        None => "missing",
    };
    let home_state = match home_env {
        Some(v) if v.trim().is_empty() => "set but empty",
        Some(_) => "set",
        None => "missing",
    };

    Err(format!(
        "Unable to resolve O2 root: O2_ROOT={}, HOME={}, dirs::home_dir() returned None",
        o2_root_state, home_state
    ))
}

fn run_o2_script() -> Result<PathBuf, String> {
    let root = o2_root()?;
    let script = root.join("scripts").join("run_o2.sh");

    if !script.is_file() {
        let o2_root_env = std::env::var("O2_ROOT").ok();
        let home_env = std::env::var("HOME").ok();

        return Err(format!(
            "run_o2.sh not found at {} (resolved_o2_root={}, O2_ROOT={:?}, HOME={:?})",
            script.display(),
            root.display(),
            o2_root_env,
            home_env
        ));
    }

    Ok(script)
}

fn is_safe_verb(v: &str) -> bool {
    !v.is_empty()
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn run_o2_command(arg: &str, stdin_payload: Option<&str>) -> RunO2Result {
    // We only ever call: bash <O2_ROOT>/scripts/run_o2.sh "<verb>"
    // No freeform shell; arg is treated as a single verb string.
    let script = match run_o2_script() {
        Ok(p) => p,
        Err(e) => return error_result(e),
    };

    let mut cmd = Command::new("bash");
    cmd.arg(&script).arg(arg);
    if stdin_payload.is_some() {
        cmd.stdin(Stdio::piped());
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return error_result(format!("failed to spawn run_o2: {}", e)),
    };

    if let Some(input) = stdin_payload {
        if let Some(mut stdin) = child.stdin.take() {
            if let Err(e) = stdin.write_all(input.as_bytes()) {
                return error_result(format!("failed writing run_o2 stdin: {}", e));
            }
        }
    }

    match child.wait_with_output() {
        Ok(o) => RunO2Result {
            ok: o.status.success(),
            code: o.status.code().unwrap_or(1),
            stdout: String::from_utf8_lossy(&o.stdout).to_string(),
            stderr: String::from_utf8_lossy(&o.stderr).to_string(),
        },
        Err(e) => error_result(format!("failed waiting for run_o2: {}", e)),
    }
}

#[tauri::command]
pub fn run_o2(verb: String, stdin: Option<String>) -> RunO2Result {
    // Defensive trim; keep it as one argument.
    let v = verb.trim().to_string();
    if v.is_empty() {
        return error_result("empty verb");
    }
    if !is_safe_verb(&v) {
        return error_result("invalid verb: allowed chars are [A-Za-z0-9._-]");
    }
    run_o2_command(&v, stdin.as_deref())
}
