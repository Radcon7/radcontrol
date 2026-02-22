use crate::shell::run_shell_output;
use serde::Serialize;

#[derive(Serialize)]
pub struct PortStatus {
    pub port: u16,
    pub listening: bool,
    pub pid: Option<u32>,
    pub cmd: Option<String>,
    pub err: Option<String>,
}

fn parse_pid_and_cmd_from_ss(s: &str) -> (Option<u32>, Option<String>) {
    // Typical snippet: users:(("node",pid=12345,fd=20))
    let pid = s
        .split("pid=")
        .nth(1)
        .and_then(|rest| {
            rest.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u32>()
                .ok()
        });

    // Extract first quoted process name if present
    let cmd = s
        .split('"')
        .nth(1)
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty());

    (pid, cmd)
}

#[tauri::command]
pub fn port_status(port: u16) -> Result<PortStatus, String> {
    // Read-only probe. No killing.
    // `ss` is preferred on Linux; keep output bounded.
    let cmdline = format!("ss -ltnp 'sport = :{port}' 2>/dev/null || true");
    let out = run_shell_output(&cmdline).unwrap_or_else(|e| format!("ERROR: {e}"));

    if out.trim().is_empty() {
        return Ok(PortStatus {
            port,
            listening: false,
            pid: None,
            cmd: None,
            err: None,
        });
    }

    if out.contains("not found") || out.contains("ERROR:") {
        return Ok(PortStatus {
            port,
            listening: false,
            pid: None,
            cmd: None,
            err: Some(out.trim().to_string()),
        });
    }

    let listening = out.lines().any(|l| l.contains("LISTEN"));
    let (pid, pname) = parse_pid_and_cmd_from_ss(&out);

    Ok(PortStatus {
        port,
        listening,
        pid,
        cmd: pname,
        err: None,
    })
}