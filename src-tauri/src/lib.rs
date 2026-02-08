use std::process::Command;

use serde::Serialize;
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
  command: Option<String>,
  raw: String,
}

/* =========================
   Basics
   ========================= */

#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

fn run_shell(cmd: &str) -> Result<String, String> {
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
   O2 SAFE WHITELIST RUNNER
   ========================= */

fn run_o2_key(key: &str) -> Result<String, String> {
  let cmd = match key {
    // RadControl
    "radcontrol.session_start" => "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/o2_session_start.sh",
    "radcontrol.snapshot" => "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/snapshot_repo_state.sh",
    "radcontrol.index" => "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/o2_index_repo.sh",

    // Empire
    "empire.snapshot" => "cd ~/dev/o2 && bash scripts/o2_empire_snapshot.sh",

    // TBIS
    "tbis.session_start" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_session_start.sh",
    "tbis.snapshot" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/snapshot_repo_state.sh",
    "tbis.index" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_index_repo.sh",
    "tbis.smoke" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_smoke_local.sh",

    // DQOTD
    "dqotd.session_start" => "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_session_start.sh",
    "dqotd.snapshot" => "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/snapshot_repo_state.sh",
    "dqotd.index" => "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_index_repo.sh",
    "dqotd.smoke" => "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_smoke_local.sh",

    // Offroad Croquet
    "offroadcroquet.session_start" => "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_session_start.sh",
    "offroadcroquet.snapshot" => "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/snapshot_repo_state.sh",
    "offroadcroquet.index" => "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_index_repo.sh",
    "offroadcroquet.smoke" => "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_smoke_local.sh",

    _ => return Err(format!("Unknown O2 key: {key}")),
  };

  run_shell(cmd)
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
  rest
    .chars()
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
  let raw =
    run_shell(&format!("ss -ltnpH 'sport = :{port}' 2>/dev/null || true")).unwrap_or_default();

  let listening = raw.lines().any(|l| !l.trim().is_empty());
  let pid = if listening { parse_pid_from_ss(&raw) } else { None };
  let command = if listening { parse_prog_from_ss(&raw) } else { None };

  Ok(PortStatus {
    port,
    listening,
    pid,
    command,
    raw: if raw.trim().is_empty() {
      "(no listener)".into()
    } else {
      raw
    },
  })
}

#[tauri::command]
fn kill_port(port: u16) -> Result<String, String> {
  run_shell(&format!("fuser -k {port}/tcp || true"))
}

/* =========================
   RADCONTROL
   ========================= */

#[tauri::command]
fn restart_radcontrol_dev() -> Result<String, String> {
  run_shell(
    "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app \
     && fuser -k 1420/tcp || true \
     && npm run tauri dev",
  )
}

/* =========================
   ENTRY POINT
   ========================= */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // SINGLE INSTANCE — focus existing window instead of spawning a new one
    .plugin(single_instance(|app, _args, _cwd| {
      // Focus whatever window exists (don’t assume label names).
      if let Some((_label, w)) = app.webview_windows().into_iter().next() {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();

        // GNOME: make it "raise" reliably.
        let _ = w.set_always_on_top(true);
        let _ = w.set_always_on_top(false);
      }
    }))
    .invoke_handler(tauri::generate_handler![
      greet,
      run_o2,
      port_status,
      kill_port,
      restart_radcontrol_dev,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}