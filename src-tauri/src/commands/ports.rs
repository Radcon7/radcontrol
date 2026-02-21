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

fn parse_pid_from_ss(s: &str) -> Option<u32> {
    let idx = s.find("pid=")?;
    let rest = &s[idx + 4..];
    rest.chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()
}

fn parse_prog_from_ss(s: &str) -> Option<String> {
    let start = s.find("((")?;
    let rest = &s[start + 2..];
    let q1 = rest.find('"')?;
    let rest2 = &rest[q1 + 1..];
    let q2 = rest2.find('"')?;
    Some(rest2[..q2].to_string())
}

#[tauri::command]
pub fn port_status(port: u16) -> Result<PortStatus, String> {
    let raw =
        run_shell_output(&format!("ss -ltnpH 'sport = :{port}' 2>/dev/null || true")).unwrap_or_default();

    let listening = raw.lines().any(|l| !l.trim().is_empty());
    let pid = if listening { parse_pid_from_ss(&raw) } else { None };
    let cmd = if listening { parse_prog_from_ss(&raw) } else { None };

    Ok(PortStatus {
        port,
        listening,
        pid,
        cmd,
        err: None,
    })
}

#[tauri::command]
pub fn kill_port(port: u16) -> Result<String, String> {
    run_shell_output(&format!("fuser -k {port}/tcp || true"))
}