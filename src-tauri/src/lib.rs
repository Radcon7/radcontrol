use std::process::{Command, Stdio};

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

/// Blocking helper ONLY for commands where we truly want the output
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

/// Non-blocking helper: spawn and return immediately (no UI freezes)
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
   Open URL (host browser) — NON-BLOCKING
   ========================= */

#[tauri::command]
fn open_url(url: String) -> Result<String, String> {
  // Use xdg-open directly and DO NOT wait.
  // This is the key change vs output(): it returns immediately.
  Command::new("xdg-open")
    .arg(&url)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("Failed to launch browser (xdg-open): {e}"))?;

  Ok(format!("open_url spawned: {url}"))
}

/* =========================
   O2 SAFE WHITELIST RUNNER
   ========================= */

fn run_o2_key(key: &str) -> Result<String, String> {
  // Anything that starts a dev server MUST be non-blocking (spawn_shell).
  // Snapshot/index/smoke/commit can be blocking (run_shell_output).
use std::process::Command;

fn run_o2_script(script_rel: &str, args: &[&str]) -> Result<String, String> {
  let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
  let o2_root = std::env::var("O2_ROOT").unwrap_or(format!("{home}/dev/o2"));
  let script_path = format!("{o2_root}/{script_rel}");

  let out = Command::new("bash")
    .arg(script_path)
    .args(args)
    .output()
    .map_err(|e| format!("Failed to run bash: {e}"))?;

  let stdout = String::from_utf8_lossy(&out.stdout).to_string();
  let stderr = String::from_utf8_lossy(&out.stderr).to_string();

  if out.status.success() {
    Ok(stdout.trim_end().to_string())
  } else {
    Err(format!(
      "Script failed (exit={:?}).\nSTDOUT:\n{}\n\nSTDERR:\n{}",
      out.status.code(),
      stdout.trim_end(),
      stderr.trim_end()
    ))
  }
}
  match key {
    // RadControl
    "radcontrol.session_start" => run_shell_output(
      "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/o2_session_start.sh",
    ),
    "radcontrol.snapshot" => run_shell_output(
      "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/snapshot_repo_state.sh",
    ),
    "radcontrol.index" => run_shell_output(
      "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/o2_index_repo.sh",
    ),

    // Empire
    "empire.snapshot" => {
      run_shell_output("cd ~/dev/o2 && bash scripts/o2_empire_snapshot.sh")
    }

    // TBIS
    "tbis.snapshot" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/snapshot_repo_state.sh",
    ),
    "tbis.index" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_index_repo.sh",
    ),
    "tbis.smoke" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_smoke_local.sh",
    ),
    "tbis.commit" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_commit.sh",
    ),
    "tbis.dev" => {
      // Non-blocking launch
      spawn_shell(
        "cd ~/dev/rad-empire/radcon/dev/tbis \
         && nohup npm run dev -- --port 3001 >/tmp/tbis.dev.log 2>&1 &",
      )?;
      Ok("TBIS dev launch requested → http://localhost:3001 (log: /tmp/tbis.dev.log)".into())
    }

    // DQOTD
    "dqotd.snapshot" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/snapshot_repo_state.sh",
    ),
    "dqotd.index" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_index_repo.sh",
    ),
    "dqotd.smoke" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_smoke_local.sh",
    ),
    "dqotd.commit" => run_shell_output(
      "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_commit.sh",
    ),
    "dqotd.dev" => {
      // Non-blocking launch
      spawn_shell(
        "cd ~/dev/rad-empire/radcon/dev/charliedino \
         && nohup npm run dev -- --port 3000 >/tmp/dqotd.dev.log 2>&1 &",
      )?;
      Ok("DQOTD dev launch requested → http://localhost:3000/dqotd (log: /tmp/dqotd.dev.log)".into())
    }

    // Offroad Croquet
    "offroad.snapshot" => run_shell_output(
      "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/snapshot_repo_state.sh",
    ),
    "offroad.index" => run_shell_output(
      "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_index_repo.sh",
    ),
    "offroad.smoke" => run_shell_output(
      "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_smoke_local.sh",
    ),
    "offroad.commit" => run_shell_output(
      "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_commit.sh",
    ),
    "offroad.dev" => {
      spawn_shell(
        "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet \
         && nohup npm run dev -- --port 3002 >/tmp/offroad.dev.log 2>&1 &",
      )?;
      Ok("Offroad dev launch requested → http://localhost:3002 (log: /tmp/offroad.dev.log)".into())
    }
    "empire.map" => run_o2_script("scripts/o2_map.sh", &["empire"]),
    "tbis.map" => run_o2_script("scripts/o2_map.sh", &["tbis"]),
    "dqotd.map" => run_o2_script("scripts/o2_map.sh", &["dqotd"]),
    "offroad.map" => run_o2_script("scripts/o2_map.sh", &["offroad"]),
    "radstock.map" => run_o2_script("scripts/o2_map.sh", &["radstock"]),
    "empire.proofpack" => run_o2_script("scripts/o2_proofpack.sh", &[]),
    _ => Err(format!(
  "Unknown O2 key: {key}\n\
   [radcontrol build probe]\n\
   - this build knows: empire.map, tbis.map, dqotd.map, offroad.map, radstock.map, empire.proofpack\n\
   - o2_root default: $HOME/dev/o2\n\
   - if you still see the OLD message without this probe block, you are running an OLD backend binary"
)),
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
  let raw = run_shell_output(&format!(
    "ss -ltnpH 'sport = :{port}' 2>/dev/null || true"
  ))
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

/* =========================
   RADCONTROL — NON-BLOCKING RESTART
   ========================= */

#[tauri::command]
fn restart_radcontrol_dev() -> Result<String, String> {
  // Spawn a new dev instance and return immediately.
  // The UI closes its window after invoke returns.
  spawn_shell(
    "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app \
     && nohup bash -lc 'fuser -k 1420/tcp >/dev/null 2>&1 || true; npm run tauri dev' \
        >/tmp/radcontrol.restart.log 2>&1 &",
  )?;
  Ok("RadControl restart spawned (log: /tmp/radcontrol.restart.log)".into())
}

/* =========================
   ENTRY POINT
   ========================= */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(single_instance(|app, _args, _cwd| {
      if let Some((_label, w)) = app.webview_windows().into_iter().next() {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        let _ = w.set_always_on_top(true);
        let _ = w.set_always_on_top(false);
      }
    }))
    .invoke_handler(tauri::generate_handler![
      greet,
      run_o2,
      open_url,
      port_status,
      kill_port,
      restart_radcontrol_dev,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}