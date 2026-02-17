use std::fs;
use std::process::Command;

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
use tauri_plugin_single_instance::init as single_instance;

/* =========================
Types
========================= */

#[derive(Serialize)]
struct PortStatus {
    port: u16,
    listening: bool,
    pid: Option<u32>,
    cmd: Option<String>,
    err: Option<String>,
}

/* =========================
Basics
========================= */

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/* =========================
Registry (O2 ONLY — single source of truth)
========================= */

fn read_json_array(path: &str) -> Result<Vec<Value>, String> {
    let s = fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let v: Value = serde_json::from_str(&s).map_err(|e| format!("Invalid JSON in {path}: {e}"))?;

    match v {
        Value::Array(arr) => Ok(arr),
        _ => Err(format!("Registry at {path} is not a JSON array")),
    }
}

#[tauri::command]
fn radpattern_list_projects() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;

    let primary = format!("{home}/dev/o2/registry/projects.json");
    if !std::path::Path::new(&primary).is_file() {
        return Err(format!("O2 registry missing: {primary}"));
    }

    let arr = read_json_array(&primary)?;
    println!("[registry] loaded O2: {} entries ({})", arr.len(), primary);

    serde_json::to_string_pretty(&Value::Array(arr))
        .map_err(|e| format!("Failed to serialize registry: {e}"))
}

/* =========================
Shell Helpers
========================= */

fn run_shell_output(cmd: &str) -> Result<String, String> {
    let out = Command::new("bash")
        .arg("-lc")
        .arg(cmd)
        .output()
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

    let combined = if stderr.trim().is_empty() {
        stdout
    } else if stdout.trim().is_empty() {
        stderr
    } else {
        format!("{stdout}\n{stderr}")
    };

    if out.status.success() {
        Ok(combined)
    } else {
        Err(format!(
            "Command failed (exit {}):\n{}",
            out.status.code().unwrap_or(-1),
            combined
        ))
    }
}

/* =========================
O2 PURE PROXY (Phase 1)
- Parse "<project>.<verb>"
- Forward to: cd ~/dev/o2 && ./scripts/o2_<verb>.sh <project>
- No repo paths, no per-project logic
========================= */

fn is_safe_token(s: &str) -> bool {
    // conservative: only allow [a-z0-9_-]
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn parse_project_verb(key: &str) -> Result<(String, String), String> {
    let (project, verb) = key
        .split_once('.')
        .ok_or_else(|| format!("Bad key '{key}'. Expected '<project>.<verb>'"))?;

    let project = project.trim().to_string();
    let verb = verb.trim().to_string();

    if !is_safe_token(&project) {
        return Err(format!("Unsafe project token: '{project}'"));
    }
    if !is_safe_token(&verb) {
        return Err(format!("Unsafe verb token: '{verb}'"));
    }

    Ok((project, verb))
}

fn verb_to_script(verb: &str) -> Result<&'static str, String> {
    match verb {
        "dev" => Ok("o2_dev.sh"),
        "snapshot" => Ok("o2_snapshot.sh"),
        "commit" => Ok("o2_commit.sh"),
        "map" => Ok("o2_map.sh"),
        "proofpack" => Ok("o2_proofpack.sh"),
        "truth_map" => Ok("o2_truth_map.sh"),
        _ => Err(format!("Verb '{verb}' is not allowed")),
    }
}

fn run_o2_proxy(key: &str) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let (project, verb) = parse_project_verb(key)?;
    let script = verb_to_script(&verb)?;

    let script_path = format!("{home}/dev/o2/scripts/{script}");
    if !std::path::Path::new(&script_path).is_file() {
        return Err(format!(
            "O2 script missing (not wired yet): {script_path}\n\
             Expected O2 to own this verb. Create it later in O2; RadControl will not implement it."
        ));
    }

    let cmd = format!("cd ~/dev/o2 && ./scripts/{script} {project}");
    run_shell_output(&cmd)
}

#[tauri::command]
fn run_o2(key: &str) -> Result<String, String> {
    run_o2_proxy(key)
}

/* =========================
Ports
========================= */

fn parse_pid_from_ss(s: &str) -> Option<u32> {
    let idx = s.find("pid=")?;
    let rest = &s[idx + 4..];
    rest.chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()
}

fn parse_prog_from_ss(s: &str) -> Option<String> {
    let start = s.find("((")?;
    let rest = &s[start + 2..];
    let q1 = rest.find('"')?;
    let rest2 = &rest[q1 + 1..];
    let q2 = rest2.find('"')?;
    Some(rest2[..q2].to_string())
}

#[tauri::command]
fn port_status(port: u16) -> Result<PortStatus, String> {
    let raw = run_shell_output(&format!("ss -ltnpH 'sport = :{port}' 2>/dev/null || true"))
        .unwrap_or_default();

    let listening = raw.lines().any(|l| !l.trim().is_empty());
    let pid = if listening {
        parse_pid_from_ss(&raw)
    } else {
        None
    };
    let cmd = if listening {
        parse_prog_from_ss(&raw)
    } else {
        None
    };

    Ok(PortStatus {
        port,
        listening,
        pid,
        cmd,
        err: None,
    })
}

#[tauri::command]
fn kill_port(port: u16) -> Result<String, String> {
    run_shell_output(&format!("fuser -k {port}/tcp || true"))
}

/* =========================
ENTRY
========================= */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(single_instance(|app, _args, _cwd| {
            if let Some((_label, w)) = app.webview_windows().into_iter().next() {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            greet,
            run_o2,
            radpattern_list_projects,
            port_status,
            kill_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
