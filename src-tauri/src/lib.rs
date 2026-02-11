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
   O2 SCRIPT RUNNER (safe, centralized)
   ========================= */

fn run_o2_script(script_rel: &str, args: &[&str]) -> Result<String, String> {
  let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
  let o2_root = std::env::var("O2_ROOT").unwrap_or(format!("{home}/dev/o2"));
  let script_path = format!("{o2_root}/{script_rel}");

  // Build a safely-quoted bash command:
  // bash -lc 'bash "<script_path>" "<arg1>" "<arg2>" ...'
  let mut cmd = String::new();
  cmd.push_str("bash ");
  cmd.push('"');
  cmd.push_str(&script_path.replace('"', "\\\""));
  cmd.push('"');

  for a in args {
    cmd.push(' ');
    cmd.push('"');
    cmd.push_str(&a.replace('"', "\\\""));
    cmd.push('"');
  }

  let out = Command::new("bash")
    .arg("-lc")
    .arg(cmd)
    .output()
    .map_err(|e| format!("Failed to run bash: {e}"))?;

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
    Ok(combined.trim_end().to_string())
  } else {
    Err(format!(
      "Script failed (exit {}).\n{}",
      out.status.code().unwrap_or(-1),
      combined.trim_end()
    ))
  }
}

fn run_o2_key(key: &str) -> Result<String, String> {
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
    "empire.snapshot" => run_shell_output("cd ~/dev/o2 && bash scripts/o2_empire_snapshot.sh"),
    "empire.map" => run_o2_script("scripts/o2_map.sh", &["empire"]),
    "empire.proofpack" => run_o2_script("scripts/o2_proofpack.sh", &[]),

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
    "tbis.commit" => run_o2_script("scripts/o2_commit.sh", &["~/dev/rad-empire/radcon/dev/tbis"]),
    "tbis.map" => run_o2_script("scripts/o2_map.sh", &["tbis"]),
    "tbis.dev" => {
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
    "dqotd.commit" => run_o2_script("scripts/o2_commit.sh", &["~/dev/rad-empire/radcon/dev/charliedino"]),
    "dqotd.map" => run_o2_script("scripts/o2_map.sh", &["dqotd"]),
    "dqotd.dev" => {
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
    "offroad.index" => run_sh_