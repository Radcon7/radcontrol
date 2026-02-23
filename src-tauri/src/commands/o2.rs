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
  std::env::var("O2_ROOT").unwrap_or_else(|_| format!("{}/dev/o2", std::env::var("HOME").unwrap_or_else(|_| "/home/chris".to_string())))
}

fn run_o2_command(arg: &str) -> RunO2Result {
  // We only ever call: bash <O2_ROOT>/scripts/run_o2.sh "<verb>"
  // No freeform shell; arg is treated as a single verb string.
  let root = o2_root();
  let script = format!("{}/scripts/run_o2.sh", root);

  let out = Command::new("bash")
    .arg(script)
    .arg(arg)
    .output();

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
  run_o2_command(&v)
}