use crate::shell::run_shell_output;

fn is_safe_token(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
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

fn parse_key(key: &str) -> Result<(String, String), String> {
    // Expect exactly: <project>.<verb>
    let parts: Vec<&str> = key.split('.').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid key '{key}'. Expected '<project>.<verb>' (one dot)."
        ));
    }

    let project = parts[0].trim();
    let verb = parts[1].trim();

    if !is_safe_token(project) {
        return Err(format!("Unsafe project token: '{project}'"));
    }
    if !is_safe_token(verb) {
        return Err(format!("Unsafe verb token: '{verb}'"));
    }

    Ok((project.to_string(), verb.to_string()))
}

fn run_o2_proxy(key: &str) -> Result<String, String> {
    let (project, verb) = parse_key(key)?;
    let script = verb_to_script(&verb)?;

    // O2 remains the authority; RadControl only dispatches.
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

#[tauri::command]
pub fn run_o2(key: &str) -> Result<String, String> {
    run_o2_proxy(key)
}