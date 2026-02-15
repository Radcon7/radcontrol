use std::fs;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

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

/* =========================
   Registry (STRUCTURED SOURCE OF TRUTH)
   ========================= */

#[tauri::command]
fn radpattern_list_projects() -> Result<String, String> {
  let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
  let path = format!("{home}/dev/rad-empire/radcontrol/projects.json");

  fs::read_to_string(&path)
    .map_err(|e| format!("Failed to read registry at {path}: {e}"))
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
   DQOTD helpers
   ========================= */

fn parse_local_url_from_log(log: &str) -> Option<String> {
  // Example:
  // - Local:         http://localhost:3000
  for line in log.lines() {
    let l = line.trim();
    if let Some(rest) = l.strip_prefix("- Local:") {
      let url = rest.trim();
      if url.starts_with("http://localhost:") {
        return Some(url.to_string());
      }
    }
  }
  None
}

fn wait_for_dqotd_url(log_path: &str, timeout: Duration) -> Result<String, String> {
  let start = Instant::now();
  while start.elapsed() < timeout {
    let content = fs::read_to_string(log_path).unwrap_or_default();
    if let Some(url) = parse_local_url_from_log(&content) {
      // Optional: quick HEAD probe to ensure it responds
      let _ = run_shell_output(&format!("curl -sS -I {url} >/dev/null || true"));
      return Ok(url);
    }
    sleep(Duration::from_millis(200));
  }
  Err(format!(
    "Timed out waiting for DQOTD Local URL in {log_path}. Check the log for errors."
  ))
}

/* =========================
   O2 SAFE WHITELIST RUNNER
   ========================= */

fn run_o2_key(key: &str) -> Result<String, String> {
  match key {
    "tbis.snapshot" =>
      run_shell_output("cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/snapshot_repo_state.sh"),
    "tbis.commit" =>
      run_shell_output("cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_commit.sh"),
    "tbis.dev" => {
      spawn_shell(
        "cd ~/dev/rad-empire/radcon/dev/tbis \
         && nohup npm run dev -- --port 3001 >/tmp/tbis.dev.log 2>&1 &",
      )?;
      Ok("TBIS dev launch requested → http://localhost:3001".into())
    }

    "dqotd.snapshot" =>
      run_shell_output("cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/snapshot_repo_state.sh"),
    "dqotd.commit" =>
      run_shell_output("cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_commit.sh"),
    "dqotd.dev" => {
      // 0) fresh log so parsing is deterministic
      run_shell_output(": > /tmp/dqotd.dev.log || true").ok();

      // 1) kill any existing DQOTD next dev / next-server for this repo (targeted)
      run_shell_output("pkill -f 'radcon/dev/charliedino.*next dev' || true").ok();
      run_shell_output("pkill -f 'radcon/dev/charliedino.*next-server' || true").ok();

      // 2) remove turbopack lock
      run_shell_output("rm -f ~/dev/rad-empire/radcon/dev/charliedino/.next/dev/lock || true").ok();

      // 3) start dev (allow Next to choose port; prefer 3000 if free)
      spawn_shell(
        "cd ~/dev/rad-empire/radcon/dev/charliedino \
         && nohup npm run dev >/tmp/dqotd.dev.log 2>&1 &",
      )?;

      // 4) parse the actual Local URL from log
      let url = wait_for_dqotd_url("/tmp/dqotd.dev.log", Duration::from_secs(15))?;
      Ok(format!("DQOTD dev ready → {url}"))
    }

    "offroad.snapshot" =>
      run_shell_output("cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/snapshot_repo_state.sh"),
    "offroad.commit" =>
      run_shell_output("cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet && ./scripts/o2_commit.sh"),
    "offroad.dev" => {
      spawn_shell(
        "cd ~/dev/rad-empire/radwolfe/dev/offroadcroquet \
         && nohup npm run dev -- --port 3002 >/tmp/offroad.dev.log 2>&1 &",
      )?;
      Ok("Offroad dev launch requested → http://localhost:3002".into())
    }

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
    run_shell_output(&format!("ss -ltnpH 'sport = :{port}' 2>/dev/null || true"))
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
     && nohup bash -lc 'fuser -k 1420/tcp >/dev/null 2>&1 || true; npm run tauri dev' \
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