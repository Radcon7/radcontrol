use serde::Serialize;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Serialize)]
pub struct RunO2Result {
  pub ok: bool,
  pub code: i32,
  pub stdout: String,
  pub stderr: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct E2EProjectRoots {
  pub radcon: String,
  pub radwolfe: String,
  pub other: String,
}

fn e2e_mode() -> bool {
  matches!(std::env::var("RADCONTROL_E2E"), Ok(value) if value == "1")
}

fn canonical_o2_root() -> String {
  format!(
    "{}/dev/o2",
    std::env::var("HOME").unwrap_or_else(|_| "/home/chris".to_string())
  )
}

fn o2_root() -> String {
  // Alternate roots are allowed only for the isolated desktop E2E harness.
  if e2e_mode() {
    if let Ok(root) = std::env::var("O2_ROOT") {
      return root;
    }
  }
  canonical_o2_root()
}

#[tauri::command]
pub fn e2e_project_roots() -> Option<E2EProjectRoots> {
  if !e2e_mode() {
    return None;
  }
  let home = std::env::var("O2_E2E_HOME").ok()?;
  if !home.starts_with('/') {
    return None;
  }
  Some(E2EProjectRoots {
    radcon: format!("{home}/dev/rad-empire/radcon/dev"),
    radwolfe: format!("{home}/dev/rad-empire/radwolfe/dev"),
    other: format!("{home}/dev/playground"),
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
    "contract_info"
      | "list_projects"
      | "empire.map"
      | "empire.sweep"
      | "radcontrol.snapshot"
      | "radcontrol.dev_strict"
      | "router.health"
      | "workstation.health.check"
      | "workstation.health.history"
      | "workstation.cleanup.preview"
      | "workstation.cleanup.apply"
      | "workstation.codex.review"
      | "workstation.updates.check"
      | "workstation.updates.history"
      | "workstation.updates.refresh"
      | "workstation.updates.open"
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
    && matches!(action, "dev" | "dev_strict" | "stop" | "snapshot" | "map" | "proofpack")
}

fn payload_verb_allowed(verb: &str) -> bool {
  matches!(verb, "files.write")
}

#[tauri::command]
pub fn run_o2_payload(verb: String, payload_json: String) -> RunO2Result {
  let verb = verb.trim();
  if !payload_verb_allowed(verb) {
    return RunO2Result { ok: false, code: 1, stdout: "".to_string(), stderr: format!("payload verb not allowed: {verb}") };
  }
  if payload_json.len() > 1024 * 1024 {
    return RunO2Result { ok: false, code: 1, stdout: "".to_string(), stderr: "payload exceeds 1 MiB limit".to_string() };
  }
  let script = format!("{}/scripts/run_o2.sh", o2_root());
  let child = Command::new("bash").arg(script).arg("files.write.stdin").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn();
  let Ok(mut child) = child else { return RunO2Result { ok: false, code: 1, stdout: "".to_string(), stderr: "failed to spawn stdin O2 write".to_string() }; };
  if child.stdin.as_mut().and_then(|stdin| stdin.write_all(payload_json.as_bytes()).ok()).is_none() {
    return RunO2Result { ok: false, code: 1, stdout: "".to_string(), stderr: "failed to write stdin O2 payload".to_string() };
  }
  match child.wait_with_output() {
    Ok(out) => RunO2Result { ok: out.status.success(), code: out.status.code().unwrap_or(1), stdout: String::from_utf8_lossy(&out.stdout).to_string(), stderr: String::from_utf8_lossy(&out.stderr).to_string() },
    Err(error) => RunO2Result { ok: false, code: 1, stdout: "".to_string(), stderr: format!("failed to complete stdin O2 write: {error}") },
  }
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
