use crate::shell::run_shell_output;

fn is_safe_token(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn is_port_token(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())
}

fn verb_to_script(verb: &str) -> Result<&'static str, String> {
    match verb {
        "dev" => Ok("o2_dev.sh"),
        "dev_strict" => Ok("o2_dev_strict.sh"),
        "snapshot" => Ok("o2_snapshot.sh"),
        "commit" => Ok("o2_commit.sh"),
        "map" => Ok("o2_map.sh"),
        "proofpack" => Ok("o2_proofpack.sh"),
        "truth_map" => Ok("o2_truth_map.sh"),
        _ => Err(format!("Unknown verb '{verb}' (not wired in O2 verb map)")),
    }
}

enum O2Key {
    ProjectVerb { project: String, verb: String },
    PortStatus { port: String },
}

fn parse_o2_key(key: &str) -> Result<O2Key, String> {
    let parts: Vec<&str> = key.split('.').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid key '{key}'. Expected '<project>.<verb>' OR 'port_status.<port>' (one dot)."
        ));
    }

    let left = parts[0].trim();
    let right = parts[1].trim();

    // Special-case: port_status.<port>
    if left == "port_status" {
        if !is_port_token(right) {
            return Err(format!("Invalid port token: '{right}'"));
        }
        return Ok(O2Key::PortStatus {
            port: right.to_string(),
        });
    }

    // Default: <project>.<verb>
    if !is_safe_token(left) {
        return Err(format!("Unsafe project token: '{left}'"));
    }
    if !is_safe_token(right) {
        return Err(format!("Unsafe verb token: '{right}'"));
    }

    Ok(O2Key::ProjectVerb {
        project: left.to_string(),
        verb: right.to_string(),
    })
}

fn run_o2_proxy(key: &str) -> Result<String, String> {
    match parse_o2_key(key)? {
        O2Key::ProjectVerb { project, verb } => {
            let script = verb_to_script(&verb)?;

            let cmd = format!(
                r#"
set -euo pipefail
O2_ROOT="${{O2_ROOT:-$HOME/dev/o2}}"
cd "${{O2_ROOT}}"
bash "scripts/{script}" "{project}"
"#,
                script = script,
                project = project
            );

            run_shell_output(&cmd)
        }

        O2Key::PortStatus { port } => {
            let cmd = format!(
                r#"
set -euo pipefail
O2_ROOT="${{O2_ROOT:-$HOME/dev/o2}}"
cd "${{O2_ROOT}}"
bash "scripts/o2_port_status_verb.sh" "{port}"
"#,
                port = port
            );

            run_shell_output(&cmd)
        }
    }
}

#[tauri::command]
pub fn run_o2(key: &str) -> Result<String, String> {
    run_o2_proxy(key)
}