use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct RunO2Result {
  pub ok: bool,
  pub code: i32,
  pub stdout: String,
  pub stderr: String,
}

fn o2_root() -> String {
  std::env::var("O2_ROOT").unwrap_or_else(|_| {
    format!(
      "{}/dev/o2",
      std::env::var("HOME").unwrap_or_else(|_| "/home/chris".to_string())
    )
  })
}

fn run_o2_command(arg: &str) -> RunO2Result {
  // We only ever call: bash <O2_ROOT>/scripts/run_o2.sh "<verb>"
  // No freeform shell; arg is treated as a single verb string.
  let root = o2_root();
  let script = format!("{}/scripts/run_o2.sh", root);

  let out = Command::new("bash").arg(script).arg(arg).output();

  match out {
    Ok(o) => RunO2Result {
      ok: o.status.success(),
      code: o.status.code().unwrap_or(1),
      stdout: String::from_utf8_lossy(&o.stdout).to_string(),
      stderr: String::from_utf8_lossy(&o.stderr).to_string(),
    },
    Err(e) => RunO2Result {
      ok: false,
      code: 1,
      stdout: "".to_string(),
      stderr: format!("failed to spawn run_o2: {}", e),
    },
  }
}

fn verb_allowed(verb: &str) -> bool {
  if matches!(
    verb,
    "list_projects"
      | "project_pattern.list"
      | "empire.map"
      | "empire.sweep"
      | "radcontrol.snapshot"
      | "radcontrol.dev_strict"
  ) {
    return true;
  }

  const PAYLOAD_PREFIXES: &[&str] = &[
    "files.list.",
    "files.read.",
    "files.write.",
    "files.rename.",
    "project_note.ensure.",
    "project_retired.set.",
    "project_launch_date.set.",
    "project_create.start.",
    "project_create.bootstrap.",
    "agent_profile.create.",
    "infrastructure_asset.create.",
    "port_status.",
    "port_suggest.",
    "kill_port.",
  ];

  if PAYLOAD_PREFIXES.iter().any(|prefix| verb.starts_with(prefix)) {
    return true;
  }

  let Some((project_key, action)) = verb.rsplit_once('.') else {
    return false;
  };

  !project_key.is_empty()
    && project_key
      .chars()
      .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    && matches!(action, "dev" | "dev_strict" | "snapshot" | "commit" | "map" | "proofpack")
}

#[tauri::command]
pub fn run_o2(verb: String) -> RunO2Result {
  // Defensive trim; keep it as one argument.
  let v = verb.trim().to_string();
  if v.is_empty() {
    return RunO2Result {
      ok: false,
      code: 1,
      stdout: "".to_string(),
      stderr: "empty verb".to_string(),
    };
  }

  if !verb_allowed(&v) {
    return RunO2Result {
      ok: false,
      code: 1,
      stdout: "".to_string(),
      stderr: format!("verb not allowed: {}", v),
    };
  }

  run_o2_command(&v)
}
