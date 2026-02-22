use std::path::PathBuf;
use std::process::Command;

fn o2_root() -> Result<PathBuf, String> {
    // Prefer explicit env if you have one; otherwise default to ~/dev/o2.
    if let Ok(p) = std::env::var("O2_ROOT") {
        return Ok(PathBuf::from(p));
    }

    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home).join("dev").join("o2"))
}

fn script_path(o2: &PathBuf, name: &str) -> PathBuf {
    o2.join("scripts").join(name)
}

fn run_script(path: &PathBuf, args: &[String]) -> Result<String, String> {
    let out = Command::new(path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute {:?}: {}", path, e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

    if out.status.success() {
        // Prefer stdout; if empty, surface stderr for visibility.
        let t = if stdout.trim().is_empty() {
            stderr
        } else {
            stdout
        };
        Ok(t)
    } else {
        let code = out.status.code().unwrap_or(-1);
        let msg = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        Err(format!(
            "O2 script failed (code={}): {:?}\n{}",
            code, path, msg
        ))
    }
}

/// Parse a key like:
/// - "<verb>.<arg>"        e.g. "port_status.3000", "kill_port.3002"
/// - "<proj>.<verb>"       e.g. "tbis.map", "tbis.snapshot", "dqotd.dev_strict"
///
/// Returns (verb, rest_parts)
fn parse_key(key: &str) -> Result<(String, Vec<String>), String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("Empty key".to_string());
    }

    let parts: Vec<&str> = k.split('.').filter(|p| !p.trim().is_empty()).collect();
    if parts.len() < 2 {
        return Err(format!(
            "Invalid key '{k}': expected <verb>.<arg> OR <proj>.<verb>"
        ));
    }

    // Keep allowlist explicit and minimal.
    const VERBS: &[&str] = &[
        "dev",
        "dev_strict",
        "snapshot",
        "commit",
        "map",
        "proofpack",
        "truth_map",
        "port_status",
        "kill_port",
    ];

    let is_verb = |s: &str| VERBS.iter().any(|v| *v == s);

    let a = parts[0];
    let b = parts[1];

    // Canonical: <verb>.<arg...>
    if is_verb(a) {
        let rest = parts[1..].iter().map(|s| s.to_string()).collect();
        return Ok((a.to_string(), rest));
    }

    // Registry/project: <proj>.<verb> (only for exactly 2 segments)
    if parts.len() == 2 && is_verb(b) {
        return Ok((b.to_string(), vec![a.to_string()]));
    }

    Err(format!(
        "Invalid key '{k}': unknown verb '{a}' (expected one of: {})",
        VERBS.join(", ")
    ))
}

#[tauri::command]
pub fn run_o2(key: String) -> Result<String, String> {
    let (verb, rest) = parse_key(&key)?;
    let o2 = o2_root()?;

    // Canonical verb map:
    // - verb determines which O2 script is executed
    // - rest are passed as args in order
    let script = match verb.as_str() {
        // low-level verbs
        "port_status" => "o2_port_status_verb.sh",
        "kill_port" => "o2_kill_port_verb.sh",

        // project verbs (registry emits <proj>.<verb> e.g. tbis.map)
        "dev" => "o2_dev.sh",
        "dev_strict" => "o2_dev_strict.sh",
        "snapshot" => "o2_snapshot.sh",
        "commit" => "o2_commit.sh",
        "map" => "o2_map.sh",
        "proofpack" => "o2_proofpack.sh",
        "truth_map" => "o2_truth_map.sh",

        _ => return Err(format!("Unknown verb '{verb}' (not wired in O2 verb map)")),
    };

    let sp = script_path(&o2, script);

    if !sp.exists() {
        return Err(format!("O2 script missing: {:?}", sp));
    }

    run_script(&sp, &rest)
}
