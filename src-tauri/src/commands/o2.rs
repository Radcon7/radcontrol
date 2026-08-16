use serde::Serialize;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Output, Stdio};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostics {
    pub app_version: String,
    pub git_sha: String,
    pub built_at_epoch_seconds: u64,
    pub runtime_mode: String,
    pub executable_path: String,
    pub radcontrol_root: String,
    pub o2_root: String,
    pub o2_git_sha: Option<String>,
    pub o2_git_branch: Option<String>,
    pub dispatcher_path: String,
    pub project_registry_path: String,
    pub empire_todo_seed_path: String,
    pub empire_todo_store_path: String,
    pub dispatcher_available: bool,
    pub project_registry_available: bool,
    pub empire_todo_seed_available: bool,
    pub empire_todo_store_available: bool,
}

fn e2e_mode() -> bool {
    matches!(std::env::var("RADCONTROL_E2E"), Ok(value) if value == "1")
}

fn failed_result(message: impl Into<String>) -> RunO2Result {
    RunO2Result {
        ok: false,
        code: 1,
        stdout: String::new(),
        stderr: message.into(),
    }
}

fn output_result(output: Output) -> RunO2Result {
    RunO2Result {
        ok: output.status.success(),
        code: output.status.code().unwrap_or(1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    }
}

fn dispatcher_command(root: &str, verb: &str) -> Command {
    let mut command = Command::new("bash");
    command
        .env("O2_ROOT", root)
        .arg(format!("{root}/scripts/run_o2.sh"))
        .arg(verb);
    command
}

fn resolved_o2_root(home: &str, e2e: bool, e2e_override: Option<&str>, debug: bool) -> String {
    if e2e {
        if let Some(root) = e2e_override.filter(|root| root.starts_with('/')) {
            return root.to_string();
        }
    }
    if debug {
        format!("{home}/dev/o2")
    } else {
        format!("{home}/.local/share/radcontrol/o2-runtime")
    }
}

fn o2_root() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/chris".to_string());
    let e2e = e2e_mode();
    let e2e_override = e2e.then(|| std::env::var("O2_ROOT").ok()).flatten();
    resolved_o2_root(&home, e2e, e2e_override.as_deref(), cfg!(debug_assertions))
}

fn git_value(root: &str, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

#[tauri::command]
pub fn runtime_diagnostics() -> RuntimeDiagnostics {
    let root = o2_root();
    let dispatcher_path = format!("{root}/scripts/run_o2.sh");
    let project_registry_path = format!("{root}/registry/projects.json");
    let empire_todo_seed_path = format!("{root}/registry/empire-todo-seeds.json");
    let empire_todo_store_path = format!("{root}/docs/radcontrol/empire_todo/items.json");
    let runtime_mode = if e2e_mode() {
        "e2e"
    } else if cfg!(debug_assertions) {
        "debug"
    } else {
        "production"
    };

    RuntimeDiagnostics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        git_sha: env!("RADCONTROL_GIT_SHA").to_string(),
        built_at_epoch_seconds: env!("RADCONTROL_BUILD_EPOCH").parse().unwrap_or(0),
        runtime_mode: runtime_mode.to_string(),
        executable_path: std::env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
        radcontrol_root: env!("RADCONTROL_SOURCE_ROOT").to_string(),
        o2_git_sha: git_value(&root, &["rev-parse", "HEAD"]),
        o2_git_branch: git_value(&root, &["branch", "--show-current"]),
        o2_root: root,
        dispatcher_available: Path::new(&dispatcher_path).is_file(),
        project_registry_available: Path::new(&project_registry_path).is_file(),
        empire_todo_seed_available: Path::new(&empire_todo_seed_path).is_file(),
        empire_todo_store_available: Path::new(&empire_todo_store_path).is_file(),
        dispatcher_path,
        project_registry_path,
        empire_todo_seed_path,
        empire_todo_store_path,
    }
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
    match dispatcher_command(&root, arg).output() {
        Ok(output) => output_result(output),
        Err(error) => failed_result(format!("failed to spawn run_o2: {error}")),
    }
}

fn verb_allowed(verb: &str) -> bool {
    if matches!(
        verb,
        "contract_info"
            | "list_projects"
            | "empire.map"
            | "empire.sweep"
            | "empire.todo.list"
            | "router.health"
            | "sentinel.status"
            | "sentinel.host.check"
            | "sentinel.host.deep_check"
            | "sentinel.host.explain_fans"
            | "sentinel.security.check"
            | "workstation.updates.check"
            | "workstation.updates.history"
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
        "sentinel.ask.",
        "port_status.",
        "port_suggest.",
    ];

    if PAYLOAD_PREFIXES
        .iter()
        .any(|prefix| verb.starts_with(prefix))
    {
        return true;
    }

    let Some((project_key, action)) = verb.rsplit_once('.') else {
        return false;
    };

    !project_key.is_empty()
        && project_key
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
        && matches!(
            action,
            "dev" | "dev_strict" | "stop" | "snapshot" | "map" | "proofpack"
        )
}

fn payload_verb_command(verb: &str) -> Option<&'static str> {
    match verb {
        "files.write" => Some("files.write.stdin"),
        "empire.todo.save" => Some("empire.todo.save.stdin"),
        _ => None,
    }
}

#[tauri::command]
pub fn run_o2_payload(verb: String, payload_json: String) -> RunO2Result {
    let verb = verb.trim();
    let Some(dispatch_verb) = payload_verb_command(verb) else {
        return failed_result(format!("payload verb not allowed: {verb}"));
    };
    if payload_json.len() > 1024 * 1024 {
        return failed_result("payload exceeds 1 MiB limit");
    }
    let root = o2_root();
    let child = dispatcher_command(&root, dispatch_verb)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let Ok(mut child) = child else {
        return failed_result("failed to spawn stdin O2 command");
    };
    let Some(mut stdin) = child.stdin.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return failed_result("stdin O2 command did not expose a payload pipe");
    };
    if let Err(error) = stdin.write_all(payload_json.as_bytes()) {
        drop(stdin);
        let _ = child.kill();
        let _ = child.wait();
        return failed_result(format!("failed to write stdin O2 payload: {error}"));
    }
    drop(stdin);
    match child.wait_with_output() {
        Ok(output) => output_result(output),
        Err(error) => failed_result(format!("failed to complete stdin O2 command: {error}")),
    }
}

#[tauri::command]
pub fn run_o2(verb: String) -> RunO2Result {
    // Defensive trim; keep it as one argument.
    let v = verb.trim().to_string();
    if v.is_empty() {
        return failed_result("empty verb");
    }

    if !verb_allowed(&v) {
        return failed_result(format!("verb not allowed: {v}"));
    }

    run_o2_command(&v)
}

#[cfg(test)]
mod tests {
    use super::{payload_verb_command, resolved_o2_root, run_o2, run_o2_payload, verb_allowed};
    use std::fs;

    #[test]
    fn production_root_is_stable_and_independent_of_the_working_directory() {
        assert_eq!(
            resolved_o2_root("/home/chris", false, Some("/tmp/ignored"), false),
            "/home/chris/.local/share/radcontrol/o2-runtime",
        );
    }

    #[test]
    fn debug_root_uses_the_canonical_development_checkout() {
        assert_eq!(
            resolved_o2_root("/home/chris", false, None, true),
            "/home/chris/dev/o2",
        );
    }

    #[test]
    fn only_e2e_accepts_an_absolute_override() {
        assert_eq!(
            resolved_o2_root("/home/chris", true, Some("/tmp/o2-fixture"), false),
            "/tmp/o2-fixture",
        );
        assert_eq!(
            resolved_o2_root("/home/chris", true, Some("relative/o2"), false),
            "/home/chris/.local/share/radcontrol/o2-runtime",
        );
    }

    #[test]
    fn project_actions_use_one_validated_allowlist_shape() {
        for verb in [
            "radcontrol.dev_strict",
            "radcontrol.snapshot",
            "future-product.stop",
            "future-product.proofpack",
        ] {
            assert!(verb_allowed(verb), "expected project verb to be allowed: {verb}");
        }
        for verb in ["RadControl.snapshot", "rad_control.snapshot", ".snapshot", "o2.shell"] {
            assert!(!verb_allowed(verb), "expected project verb to be denied: {verb}");
        }
    }

    #[test]
    fn stdin_transport_maps_only_explicit_payload_verbs() {
        assert_eq!(payload_verb_command("files.write"), Some("files.write.stdin"));
        assert_eq!(
            payload_verb_command("empire.todo.save"),
            Some("empire.todo.save.stdin")
        );
        assert_eq!(payload_verb_command("files.read"), None);
    }

    #[test]
    fn process_and_stdin_failures_are_reported_without_becoming_success() {
        let fixture_root = std::env::temp_dir().join(format!(
            "radcontrol-stdin-write-failure-{}",
            std::process::id(),
        ));
        let scripts_dir = fixture_root.join("scripts");
        fs::create_dir_all(&scripts_dir).expect("create isolated O2 fixture scripts directory");
        fs::write(
            scripts_dir.join("run_o2.sh"),
            "#!/usr/bin/env bash\necho 'fixture O2 failure' >&2\nexit 23\n",
        )
        .expect("write isolated O2 fixture dispatcher");

        let previous_e2e = std::env::var_os("RADCONTROL_E2E");
        let previous_root = std::env::var_os("O2_ROOT");
        std::env::set_var("RADCONTROL_E2E", "1");
        std::env::set_var("O2_ROOT", &fixture_root);
        let process_result = run_o2("router.health".to_string());
        fs::write(
            scripts_dir.join("run_o2.sh"),
            "#!/usr/bin/env bash\nexec 0<&-\nsleep 0.1\nexit 0\n",
        )
        .expect("replace fixture dispatcher for stdin failure");
        let stdin_result = run_o2_payload("files.write".to_string(), "x".repeat(512 * 1024));
        match previous_e2e {
            Some(value) => std::env::set_var("RADCONTROL_E2E", value),
            None => std::env::remove_var("RADCONTROL_E2E"),
        }
        match previous_root {
            Some(value) => std::env::set_var("O2_ROOT", value),
            None => std::env::remove_var("O2_ROOT"),
        }
        fs::remove_dir_all(&fixture_root).expect("remove isolated O2 fixture");

        assert!(!process_result.ok);
        assert_eq!(process_result.code, 23);
        assert!(process_result.stderr.contains("fixture O2 failure"));
        assert!(!stdin_result.ok);
        assert!(
            stdin_result.stderr.contains("failed to write stdin O2 payload"),
            "unexpected failure: {}",
            stdin_result.stderr,
        );
    }
}
