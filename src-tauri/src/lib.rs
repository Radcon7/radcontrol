use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
struct PortStatus {
  port: u16,
  listening: bool,
  pid: Option<u32>,
  command: Option<String>,
  raw: String,
}

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
  // Whitelist only. No freeform shell.
  // Keys map to fixed, known-safe commands.
  let cmd = match key {
    // RadControl (this repo)
    "radcontrol.session_start" => "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/o2_session_start.sh",
    "radcontrol.snapshot" => "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/snapshot_repo_state.sh",
    "radcontrol.index" => "cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app && ./scripts/o2_index_repo.sh",

    // Empire O2
    "empire.snapshot" => "cd ~/dev/o2 && bash scripts/o2_empire_snapshot.sh",

    // TBIS
    "tbis.session_start" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_session_start.sh",
    "tbis.snapshot" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/snapshot_repo_state.sh",
    "tbis.index" => "cd ~/dev/rad-empire/radcon/dev/tbis && ./scripts/o2_index_repo.sh",

    // DQOTD
    "dqotd.session_start" => "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/o2_session_start.sh",
    "dqotd.snapshot" => "cd ~/dev/rad-empire/radcon/dev/charliedino && ./scripts/snapshot_repo_state.sh",
    "dqotd.index" => "cd ~/dev/rad-empire/radcon/dev/charliedino && (test -x ./scripts/o2_index_repo.sh && ./scripts/o2_index_repo.sh || echo \"(no dqotd index script yet)\")",

    _ => return Err(format!("Unknown O2 key: {key}")),
  };

  run_shell(cmd)
}

#[tauri::command]
fn run_o2(key: &str) -> Result<String, String> {
  run_o2_key(key)
}

/* =========================
   Existing commands
   ========================= */

#[tauri::command]
fn run_empire_snapshot() -> Result<String, String> {
  run_shell("cd ~/dev/o2 && bash scripts/o2_empire_snapshot.sh")
}

#[tauri::command]
fn gather_radcontrol_intel() -> Result<String, String> {
  // Keep output bounded so Logs stay usable.
  // Also write to /tmp so you can paste/share later.
  run_shell(
    r#"
set -e
OUT=/tmp/radcontrol_intel.txt
: > "$OUT"

{
  echo "=== DATE ==="
  date
  echo

  echo "=== O2 (scripts) ==="
  tree -a -L 3 ~/dev/o2/scripts || true
  echo

  echo "=== TBIS (scripts + docs) ==="
  tree -a -L 3 \
    ~/dev/rad-empire/radcon/dev/tbis/scripts \
    ~/dev/rad-empire/radcon/dev/tbis/docs || true
  echo

  echo "=== DQOTD (scripts + docs) ==="
  tree -a -L 3 \
    ~/dev/rad-empire/radcon/dev/charliedino/scripts \
    ~/dev/rad-empire/radcon/dev/charliedino/docs || true
  echo

  echo "=== RADCONTROL (repo structure) ==="
  cd ~/dev/rad-empire/radcontrol/dev/radcontrol-app || exit 1
  tree -a -L 3 --dirsfirst src src-tauri 2>/dev/null || true
  echo

  echo "=== QUICK GREP: entrypoints (session/snapshot/index/smoke) ==="
  grep -RIn --line-number -E "o2_|snapshot|session_start|repo_snapshot|repo_index|smoke" \
    ~/dev/o2/scripts \
    ~/dev/rad-empire/radcon/dev/tbis/scripts \
    ~/dev/rad-empire/radcon/dev/charliedino/scripts \
    2>/dev/null | head -n 200 || true
  echo

  echo "=== NOTE TO SELF (RadControl assumptions) ==="
  echo "- DQOTD expected: http://127.0.0.1:3000/dqotd"
  echo "- TBIS expected:  http://127.0.0.1:3001/tbis"
  echo "- RadControl UI:  http://127.0.0.1:1420"
  echo "- If 1420 busy: kill_port(1420) or Restart RadControl (dev)"
  echo

  echo "Wrote: $OUT"
} | tee "$OUT"
"#,
  )
}

/* =========================
   Active Ports helpers
   ========================= */

// Parse pid=1234 from ss output like:
// users:(("node",pid=1234,fd=23))
fn parse_pid_from_ss(s: &str) -> Option<u32> {
  let idx = s.find("pid=")?;
  let rest = &s[idx + 4..];
  let mut digits = String::new();
  for ch in rest.chars() {
    if ch.is_ascii_digit() {
      digits.push(ch);
    } else {
      break;
    }
  }
  digits.parse::<u32>().ok()
}

// Parse program name from ss output like: users:(("node",pid=1234,fd=23))
fn parse_prog_from_ss(s: &str) -> Option<String> {
  // find first ("NAME"
  let start = s.find("((")?;
  let rest = &s[start + 2..];
  let q1 = rest.find('"')?;
  let rest2 = &rest[q1 + 1..];
  let q2 = rest2.find('"')?;
  let name = &rest2[..q2];
  if name.trim().is_empty() {
    None
  } else {
    Some(name.to_string())
  }
}

#[tauri::command]
fn port_status(port: u16) -> Result<PortStatus, String> {
  let raw =
    run_shell(&format!("ss -ltnpH 'sport = :{port}' 2>/dev/null || true")).unwrap_or_default();

  let listening = raw.lines().any(|ln| !ln.trim().is_empty());

  let pid = if listening { parse_pid_from_ss(&raw) } else { None };
  let command = if listening { parse_prog_from_ss(&raw) } else { None };

  Ok(PortStatus {
    port,
    listening,
    pid,
    command,
    raw: if raw.trim().is_empty() {
      "(no ss listener lines)".to_string()
    } else {
      raw
    },
  })
}

#[tauri::command]
fn kill_port(port: u16) -> Result<String, String> {
  run_shell(&format!(
    "(fuser -k {port}/tcp >/dev/null 2>&1 || true); echo \"done\""
  ))
}

/* =========================
   Dev server launcher (smart)
   ========================= */

fn launch_dev_in_terminal_smart(
  repo: &str,
  display_name: &str,
  candidates: &[&str],
) -> Result<String, String> {
  let list = candidates.join(" ");

  let cmd = format!(
    "gnome-terminal -- bash -lc '\
      set -e; \
      echo \"\"; \
      echo \"========================================\"; \
      echo \"[radcontrol] project: {display_name}\"; \
      echo \"[radcontrol] repo: {repo}\"; \
      echo \"[radcontrol] probing: {list}\"; \
      echo \"========================================\"; \
      echo \"\"; \
      cd \"{repo}\"; \
      echo \"[radcontrol] starting dev server (background)...\"; \
      (npm run dev) & \
      DEV_PID=$!; \
      echo \"[radcontrol] dev pid: $DEV_PID\"; \
      echo \"[radcontrol] waiting for HTTP...\"; \
      FOUND=\"\"; \
      for i in $(seq 1 320); do \
        for u in {list}; do \
          if curl -sS -o /dev/null -I \"$u\"; then \
            FOUND=\"$u\"; \
            break; \
          fi; \
        done; \
        if [ -n \"$FOUND\" ]; then \
          echo \"[radcontrol] http OK — opening $FOUND\"; \
          xdg-open \"$FOUND\" >/dev/null 2>&1 || true; \
          break; \
        fi; \
        sleep 0.25; \
      done; \
      if [ -z \"$FOUND\" ]; then \
        echo \"[radcontrol] WARNING: none of the probe URLs became ready.\"; \
      fi; \
      echo \"\"; \
      echo \"[radcontrol] dev server is running (pid $DEV_PID). Close this terminal to stop it.\"; \
      echo \"\"; \
      wait $DEV_PID; \
      exec bash'"
  );

  let status = Command::new("bash")
    .arg("-lc")
    .arg(cmd)
    .status()
    .map_err(|e| format!("Failed to launch terminal: {e}"))?;

  if status.success() {
    Ok(format!(
      "Launched {} dev server in a new terminal and will open the first responding URL.",
      display_name
    ))
  } else {
    Err(format!(
      "Terminal launch failed (exit {}). Is gnome-terminal installed?",
      status.code().unwrap_or(-1)
    ))
  }
}

/* =========================
   RADCONTROL (self)
   ========================= */

#[tauri::command]
fn restart_radcontrol_dev() -> Result<String, String> {
  let repo = "/home/chris/dev/rad-empire/radcontrol/dev/radcontrol-app";

  let cmd = format!(
    "gnome-terminal -- bash -lc '\
      cd \"{repo}\" \
      && echo \"[radcontrol] restarting radcontrol dev...\" \
      && echo \"[radcontrol] freeing port 1420 (best-effort)...\" \
      && (fuser -k 1420/tcp >/dev/null 2>&1 || true) \
      && echo \"[radcontrol] launching: npm run tauri dev\" \
      && npm run tauri dev \
      && exec bash'"
  );

  let status = Command::new("bash")
    .arg("-lc")
    .arg(cmd)
    .status()
    .map_err(|e| format!("Failed to launch terminal: {e}"))?;

  if status.success() {
    Ok(
      "Restart launched in a new terminal. (This window may go blank after 1420 is freed.)"
        .to_string(),
    )
  } else {
    Err(format!(
      "Restart launch failed (exit {}). Is gnome-terminal installed?",
      status.code().unwrap_or(-1)
    ))
  }
}

/* =========================
   DQOTD
   ========================= */

#[tauri::command]
fn run_dqotd_session_start() -> Result<String, String> {
  run_shell("cd ~/dev/rad-empire/radcon/dev/charliedino && bash scripts/o2_session_start.sh")
}

#[tauri::command]
fn launch_dqotd_dev_server_terminal() -> Result<String, String> {
  launch_dev_in_terminal_smart(
    "/home/chris/dev/rad-empire/radcon/dev/charliedino",
    "DQOTD",
    &[
      "http://127.0.0.1:3000/dqotd",
      "http://127.0.0.1:3001/dqotd",
      "http://127.0.0.1:3000/",
      "http://127.0.0.1:3001/",
    ],
  )
}

#[tauri::command]
fn commit_push_dqotd_o2_artifacts() -> Result<String, String> {
  run_shell(
    "cd ~/dev/rad-empire/radcon/dev/charliedino \
     && git add docs/_repo_snapshot.txt docs/_o2_repo_index.txt \
     && git commit -m \"o2: snapshot + index\" \
     && git push",
  )
}

/* =========================
   TBIS
   ========================= */

#[tauri::command]
fn run_tbis_session_start() -> Result<String, String> {
  run_shell("cd ~/dev/rad-empire/radcon/dev/tbis && bash scripts/o2_session_start.sh")
}

#[tauri::command]
fn launch_tbis_dev_server_terminal() -> Result<String, String> {
  launch_dev_in_terminal_smart(
    "/home/chris/dev/rad-empire/radcon/dev/tbis",
    "TBIS",
    &[
      "http://127.0.0.1:3001/tbis",
      "http://127.0.0.1:3000/tbis",
      "http://127.0.0.1:3001/",
      "http://127.0.0.1:3000/",
    ],
  )
}

#[tauri::command]
fn commit_push_tbis_o2_artifacts() -> Result<String, String> {
  run_shell(
    "cd ~/dev/rad-empire/radcon/dev/tbis \
     && git add docs/_repo_snapshot.txt docs/_o2_repo_index.txt \
     && git commit -m \"o2: snapshot + index\" \
     && git push",
  )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      greet,
      // new safe whitelist runner
      run_o2,
      // empire
      run_empire_snapshot,
      gather_radcontrol_intel,
      // ports
      port_status,
      kill_port,
      // self
      restart_radcontrol_dev,
      // dqotd
      run_dqotd_session_start,
      launch_dqotd_dev_server_terminal,
      commit_push_dqotd_o2_artifacts,
      // tbis
      run_tbis_session_start,
      launch_tbis_dev_server_terminal,
      commit_push_tbis_o2_artifacts
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}