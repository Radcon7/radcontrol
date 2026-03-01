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

fn run_o2_command_with_input(arg: &str, input: &str) -> RunO2Result {
  // We only ever call: bash <O2_ROOT>/scripts/run_o2.sh "<verb>"
  // No freeform shell; arg is treated as a single verb string.
  // Input is written to stdin (EOF after write).
  let root = o2_root();
  let script = format!("{}/scripts/run_o2.sh", root);

  let mut child = match Command::new("bash")
    .arg(script)
    .arg(arg)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
  {
    Ok(c) => c,
    Err(e) => {
      return RunO2Result {
        ok: false,
        code: 1,
        stdout: "".to_string(),
        stderr: format!("failed to spawn run_o2: {}", e),
      };
    }
  };

  if let Some(mut stdin) = child.stdin.take() {
    // Best-effort write, then close stdin (drop) to signal EOF.
    let _ = stdin.write_all(input.as_bytes());
  }

  let output = match child.wait_with_output() {
    Ok(o) => o,
    Err(e) => {
      return RunO2Result {
        ok: false,
        code: 1,
        stdout: "".to_string(),
        stderr: format!("failed to read run_o2 output: {}", e),
      };
    }
  };

  RunO2Result {
    ok: output.status.success(),
    code: output.status.code().unwrap_or(1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  }
}

// Optional: strict allowlist. If you want this ON, uncomment the check below.
// fn verb_allowed(v: &str) -> bool {
//   matches!(
//     v,
//     "files.list"
//       | "list_projects"
//       | "codex.chat"
//       | "codex.build"
//   )
// }

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

  // If you enable allowlisting, enforce it here:
  // if !verb_allowed(&v) {
  //   return RunO2Result {
  //     ok: false,
  //     code: 1,
  //     stdout: "".to_string(),
  //     stderr: format!("verb not allowed: {}", v),
  //   };
  // }

  run_o2_command(&v)
}

#[tauri::command]
pub fn run_o2_with_input(verb: String, input: String) -> RunO2Result {
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

  // If you enable allowlisting, enforce it here:
  // if !verb_allowed(&v) {
  //   return RunO2Result {
  //     ok: false,
  //     code: 1,
  //     stdout: "".to_string(),
  //     stderr: format!("verb not allowed: {}", v),
  //   };
  // }

  run_o2_command_with_input(&v, &input)
}