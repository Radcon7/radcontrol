use std::collections::BTreeMap;
use std::fs;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
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

fn read_json_array(path: &str) -> Result<Vec<Value>, String> {
  let s = fs::read_to_string(path)
    .map_err(|e| format!("Failed to read {path}: {e}"))?;

  let v: Value =
    serde_json::from_str(&s).map_err(|e| format!("Invalid JSON in {path}: {e}"))?;

  match v {
    Value::Array(arr) => Ok(arr),
    _ => Err(format!("Registry at {path} is not a JSON array")),
  }
}

fn get_key(v: &Value) -> Option<String> {
  v.get("key")?.as_str().map(|s| s.to_string()).filter(|s| !s.trim().is_empty())
}

fn merge_registries(o2: Vec<Value>, fallback: Vec<Value>) -> Vec<Value> {
  // Merge by `key`.
  //
  // Policy:
  // - Start with fallback (so UI always gets the full set of projects)
  // - Overlay O2 entries on top (so canonical can override fields when present)
  //
  // If you want fallback to override O2 instead, swap insertion order.
  let mut map: BTreeMap<String, Value> = BTreeMap::new();

  for item in fallback {
    if let Some(k) = get_key(&item) {
      map.insert(k, item);
    }
  }

  for item in o2 {
    if let Some(k) = get_key(&item) {
      map.insert(k, item); // O2 overrides same key
    }
  }

  map.into_values().collect()
}

#[tauri::command]
fn radpattern_list_projects() -> Result<String, String> {
  let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;

  // Canonical registry is O2. RadControl keeps a fallback registry for resilience.
  let primary = format!("{home}/dev/o2/registry/projects.json");
  let fallback = format!("{home}/dev/rad-empire/radcontrol/projects.json");

  let primary_exists = std::path::Path::new(&primary).is_file();
  let fallback_exists = std::path::Path::new(&fallback).is_file();

  if !primary_exists && !fallback_exists {
    return Err(format!(
      "No registry found. Missing:\n- {primary}\n- {fallback}"
    ));
  }

  let o2_arr = if primary_exists {
    match read_json_array(&primary) {
      Ok(arr) => {
        println!("[registry] loaded O2: {} entries ({})", arr.len(), primary);
        arr
      }
      Err(e) => {
        println!("[registry] O2 registry error: {e}");
        vec![]
      }
    }
  } else {
    vec![]
  };

  let fb_arr = if fallback_exists {
    match read_json_array(&fallback) {
      Ok(arr) => {
        println!(
          "[registry] loaded fallback: {} entries ({})",
          arr.len(),
          fallback
        );
        arr
      }
      Err(e) => {
        println!("[registry] fallback registry error: {e}");
        vec![]
      }
    }
  } else {
    vec![]
  };

  // Merge so UI gets the complete list.
  let merged = merge_registries(o2_arr, fb_arr);
  println!("[registry] merged: {} entries", merged.len());

  // Return as JSON string to the UI.
  serde_json::to_string_pretty(&Value::Array(merged))
    .map_err(|e| format!("Failed to serialize merged registry: {e}"))
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
      run_shell_output(": > /tmp/dqotd.dev.log || true").ok();

      run_shell_output("pkill -f 'radcon/dev/charliedino.*next dev' || true").ok();
      run_shell_output("pkill -f 'radcon/dev/charliedino.*next-server' || true").ok();
      run_shell_output("pkill -f 'radcon/dev/charliedino.*next' || true").ok();

      run_shell_output("rm -f ~/dev/rad-empire/radcon/dev/charliedino/.next/dev/lock || true").ok();

      spawn_shell(
        "cd ~/dev/rad-empire/radcon/dev/charliedino \
         && nohup npm run dev >/tmp/dqotd.dev.log 2>&1 &",
      )?;

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