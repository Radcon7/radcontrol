use std::process::Command;

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

#[tauri::command]
fn run_empire_snapshot() -> Result<String, String> {
  run_shell("cd ~/dev/o2 && bash scripts/o2_empire_snapshot.sh")
}

fn launch_dev_in_terminal(repo: &str, port: u16, url: &str) -> Result<String, String> {
  // Idempotent-ish:
  // - Best-effort free the port
  // - Start dev server
  // - Wait until port is listening
  // - Open browser
  //
  // Requires: bash, gnome-terminal, fuser, xdg-open
  let cmd = format!(
    "gnome-terminal -- bash -lc '\
      cd \"{repo}\" \
      && echo \"[radcontrol] freeing port {port} (best-effort)...\" \
      && (fuser -k {port}/tcp >/dev/null 2>&1 || true) \
      && echo \"[radcontrol] starting dev server...\" \
      && (npm run dev &) \
      && echo \"[radcontrol] waiting for localhost:{port}...\" \
      && for i in {{1..80}}; do \
           (bash -lc \"</dev/tcp/127.0.0.1/{port}\" >/dev/null 2>&1) && break; \
           sleep 0.25; \
         done \
      && echo \"[radcontrol] opening {url}\" \
      && xdg-open \"{url}\" >/dev/null 2>&1 \
      && exec bash'"
  );

  let status = Command::new("bash")
    .arg("-lc")
    .arg(cmd)
    .status()
    .map_err(|e| format!("Failed to launch terminal: {e}"))?;

  if status.success() {
    Ok(format!("Launched dev server in a new terminal window and opened {}.", url))
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

  // This will kill the current Vite listener on 1420 (which this app uses),
  // then start a fresh `npm run tauri dev` in a new terminal window.
  // Your current RadControl window may go blank afterward — close it once the new one is up.
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
    Ok("Restart launched in a new terminal. (This window may go blank after 1420 is freed.)".to_string())
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
  launch_dev_in_terminal(
    "/home/chris/dev/rad-empire/radcon/dev/charliedino",
    3000,
    "http://localhost:3000",
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
  // TBIS is pinned to 3001 in your repo now.
  launch_dev_in_terminal(
    "/home/chris/dev/rad-empire/radcon/dev/tbis",
    3001,
    "http://localhost:3001",
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
      run_empire_snapshot,

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
