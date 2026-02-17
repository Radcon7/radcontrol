use std::fs;
use std::process::{Command, Stdio};

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

fn spawn_shell(cmd: &str) -> Result<String, String> {
    Command::new("bash")
        .arg("-lc")
        .arg(cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    Ok(format!("spawned: {cmd}"))
}

/* =========================
O2 SAFE WHITELIST RUNNER (migrating dev to O2; snapshot/commit next)
========================= */

fn run_o2_key(key: &str) -> Result<String, String> {
    match key {
        // ---- TBIS ----
        "tbis.snapshot" => run_shell_output(
            "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/snapshot_repo_state.sh",
        ),
        "tbis.commit" => run_shell_output("cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_commit.sh"),
        "tbis.dev" => run_shell_output("cd ~/dev/o2 && ./scripts/o2_dev.sh tbis"),

        // ---- DQOTD ----
        "dqotd.snapshot" => run_shell_output(
            "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/snapshot_repo_state.sh",
        ),
        "dqotd.commit" => run_shell_output(
            "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_commit.sh",
        ),
        "dqotd.dev" => run_shell_output("cd ~/dev/o2 && ./scripts/o2_dev.sh dqotd"),

        // ---- OFFROAD ----
        "offroad.snapshot" => run_shell_output(
            "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/snapshot_repo_state.sh",
        ),
        "offroad.commit" => run_shell_output(
            "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_commit.sh",
        ),
        "offroad.dev" => run_shell_output("cd ~/dev/o2 && ./scripts/o2_dev.sh offroad"),

        // ---- RADSTOCK / RADCRM (dev migrated; verbs later) ----
        "radstock.dev" => run_shell_output("cd ~/dev/o2 && ./scripts/o2_dev.sh radstock"),
        "radcrm.dev" => run_shell_output("cd ~/dev/o2 && ./scripts/o2_dev.sh radcrm"),

        _ => Err(format!("Unknown O2 key: {key}")),
    }
}

#[tauri::command]
fn run_o2(key: &str) -> Result<String, String> {
    run_o2_key(key)
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
    let pid = if listening { parse_pid_from_ss(&raw) } else { None };
    let cmd = if listening { parse_prog_from_ss(&raw) } else { None };

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

#[tauri::command]
fn restart_radcontrol_dev() -> Result<String, String> {
    spawn_shell(
        "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app \
     && nohup bash -lc 'fuser -k 1420/tcp >/dev/null 2>&1 || true; cargo tauri dev' \
        >/tmp/radcontrol.restart.log 2>&1 &",
    )?;
    Ok("RadControl restart spawned".into())
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
            restart_radcontrol_dev,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}