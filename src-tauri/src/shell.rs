use std::process::Command;

pub fn run_shell_output(cmd: &str) -> Result<String, String> {
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