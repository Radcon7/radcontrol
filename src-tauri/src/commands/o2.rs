use super::o2_process::{
    apply_child_environment, run_bounded, terminate_active_processes as terminate_processes,
    ExecutionLimits, InvocationLimiter, ProcessFailure, ProcessOutcome,
};
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const BASH_EXECUTABLE: &str = "/usr/bin/bash";
const GIT_EXECUTABLE: &str = "/usr/bin/git";
const DEVELOPMENT_O2_ROOT: &str = "/home/chris/dev/o2";
const PRODUCTION_O2_ROOT: &str = "/home/chris/.local/share/radcontrol/o2-runtime";
const RUNTIME_HOME: &str = "/home/chris";
const STDIN_PAYLOAD_MAX_BYTES: usize = 1024 * 1024;
const VERB_MAX_BYTES: usize = 256 * 1024;
const STDOUT_MAX_BYTES: usize = 4 * 1024 * 1024;
const STDERR_MAX_BYTES: usize = 512 * 1024;
const CONCURRENT_INVOCATION_LIMIT: usize = 4;
const TERMINATION_GRACE: Duration = Duration::from_millis(1500);

static INVOCATIONS: InvocationLimiter = InvocationLimiter::new(CONCURRENT_INVOCATION_LIMIT);
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BridgeFailureKind {
    InvalidRequest,
    UnsupportedVerb,
    ExecutableUnavailable,
    SpawnFailure,
    StdinFailure,
    Timeout,
    OutputLimitExceeded,
    O2ProcessFailure,
    ConcurrencyLimit,
    AuditFailure,
    InternalBridgeFailure,
}

impl BridgeFailureKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "INVALID_REQUEST",
            Self::UnsupportedVerb => "UNSUPPORTED_VERB",
            Self::ExecutableUnavailable => "EXECUTABLE_UNAVAILABLE",
            Self::SpawnFailure => "SPAWN_FAILURE",
            Self::StdinFailure => "STDIN_FAILURE",
            Self::Timeout => "TIMEOUT",
            Self::OutputLimitExceeded => "OUTPUT_LIMIT_EXCEEDED",
            Self::O2ProcessFailure => "O2_PROCESS_FAILURE",
            Self::ConcurrencyLimit => "CONCURRENCY_LIMIT",
            Self::AuditFailure => "AUDIT_FAILURE",
            Self::InternalBridgeFailure => "INTERNAL_BRIDGE_FAILURE",
        }
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunO2Result {
    pub ok: bool,
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub failure_kind: Option<BridgeFailureKind>,
    pub request_id: String,
    pub duration_ms: u64,
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
    pub audit_transport_available: bool,
    pub empire_todo_seed_available: bool,
    pub empire_todo_store_available: bool,
    pub bridge_failure: Option<BridgeFailureKind>,
}

#[derive(Clone, Debug)]
struct RuntimeContext {
    root: PathBuf,
    e2e_home: Option<PathBuf>,
}

#[derive(Clone, Debug)]
struct O2Paths {
    root: PathBuf,
    dispatcher: PathBuf,
    temp_dir: PathBuf,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TimeoutClass {
    Read,
    Governed,
    Extended,
}

impl TimeoutClass {
    fn duration(self) -> Duration {
        match self {
            Self::Read => Duration::from_secs(20),
            Self::Governed => Duration::from_secs(60),
            Self::Extended => Duration::from_secs(120),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AuditClass {
    Mutation,
    Privileged,
}

impl AuditClass {
    fn as_str(self) -> &'static str {
        match self {
            Self::Mutation => "mutation",
            Self::Privileged => "privileged",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ProjectAction {
    Dev,
    DevStrict,
    Stop,
    Snapshot,
    Map,
    Proofpack,
}

impl ProjectAction {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "dev" => Some(Self::Dev),
            "dev_strict" => Some(Self::DevStrict),
            "stop" => Some(Self::Stop),
            "snapshot" => Some(Self::Snapshot),
            "map" => Some(Self::Map),
            "proofpack" => Some(Self::Proofpack),
            _ => None,
        }
    }

    fn operation(self) -> &'static str {
        match self {
            Self::Dev => "project.dev",
            Self::DevStrict => "project.dev_strict",
            Self::Stop => "project.stop",
            Self::Snapshot => "project.snapshot",
            Self::Map => "project.map",
            Self::Proofpack => "project.proofpack",
        }
    }

    fn timeout(self) -> TimeoutClass {
        match self {
            Self::Stop => TimeoutClass::Governed,
            _ => TimeoutClass::Extended,
        }
    }

    fn is_runtime_lifecycle(self) -> bool {
        matches!(self, Self::Dev | Self::DevStrict | Self::Stop)
    }
}

#[derive(Clone, Debug)]
struct InvocationSpec {
    dispatch_verb: String,
    operation: String,
    target: String,
    timeout: TimeoutClass,
    audit: Option<AuditClass>,
}

pub(crate) fn e2e_mode() -> bool {
    cfg!(debug_assertions) && matches!(std::env::var("RADCONTROL_E2E"), Ok(value) if value == "1")
}

fn resolved_o2_root(e2e: bool, e2e_override: Option<&str>, debug: bool) -> PathBuf {
    if e2e {
        if let Some(root) = e2e_override.filter(|root| Path::new(root).is_absolute()) {
            return PathBuf::from(root);
        }
    }
    if debug {
        PathBuf::from(DEVELOPMENT_O2_ROOT)
    } else {
        PathBuf::from(PRODUCTION_O2_ROOT)
    }
}

fn runtime_context() -> Result<RuntimeContext, BridgeFailureKind> {
    let e2e = e2e_mode();
    let override_root = if e2e {
        Some(std::env::var("O2_ROOT").map_err(|_| BridgeFailureKind::InvalidRequest)?)
    } else {
        None
    };
    let root = resolved_o2_root(e2e, override_root.as_deref(), cfg!(debug_assertions));
    let e2e_home = if e2e {
        let raw = std::env::var("O2_E2E_HOME").map_err(|_| BridgeFailureKind::InvalidRequest)?;
        let home = PathBuf::from(raw);
        if !home.is_absolute() {
            return Err(BridgeFailureKind::InvalidRequest);
        }
        Some(home)
    } else {
        None
    };
    Ok(RuntimeContext { root, e2e_home })
}

fn path_is_lexically_canonical(path: &Path) -> bool {
    path.is_absolute()
        && path
            .components()
            .all(|component| !matches!(component, Component::CurDir | Component::ParentDir))
}

fn validate_regular_file(path: &Path) -> Result<PathBuf, BridgeFailureKind> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    if canonical != path {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    Ok(canonical)
}

fn validate_directory(path: &Path) -> Result<PathBuf, BridgeFailureKind> {
    if !path_is_lexically_canonical(path) {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    let metadata =
        fs::symlink_metadata(path).map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    (canonical == path)
        .then_some(canonical)
        .ok_or(BridgeFailureKind::ExecutableUnavailable)
}

fn ensure_private_directory(path: &Path) -> Result<PathBuf, BridgeFailureKind> {
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err(BridgeFailureKind::ExecutableUnavailable),
    }
    let canonical = validate_directory(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&canonical, fs::Permissions::from_mode(0o700))
            .map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    }
    Ok(canonical)
}

fn validate_runtime_paths(context: &RuntimeContext) -> Result<O2Paths, BridgeFailureKind> {
    if !path_is_lexically_canonical(&context.root) {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    let root_metadata = fs::symlink_metadata(&context.root)
        .map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    let canonical_root = context
        .root
        .canonicalize()
        .map_err(|_| BridgeFailureKind::ExecutableUnavailable)?;
    if canonical_root != context.root {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }
    let runtime_home = context
        .e2e_home
        .as_deref()
        .unwrap_or_else(|| Path::new(RUNTIME_HOME));
    validate_directory(runtime_home)?;
    if !Path::new(BASH_EXECUTABLE).is_file() || !Path::new(GIT_EXECUTABLE).is_file() {
        return Err(BridgeFailureKind::ExecutableUnavailable);
    }

    let dispatcher = context.root.join("scripts/run_o2.sh");
    let registry = context.root.join("registry/projects.json");
    let audit_transport = context.root.join("scripts/o2_radcontrol_audit.py");
    let canonical_dispatcher = validate_regular_file(&dispatcher)?;
    let canonical_registry = validate_regular_file(&registry)?;
    let canonical_audit = validate_regular_file(&audit_transport)?;
    for candidate in [&canonical_dispatcher, &canonical_registry, &canonical_audit] {
        if !candidate.starts_with(&canonical_root) {
            return Err(BridgeFailureKind::ExecutableUnavailable);
        }
    }

    let state_dir = ensure_private_directory(&canonical_root.join(".state"))?;
    let bridge_state = ensure_private_directory(&state_dir.join("radcontrol-runtime"))?;
    let temp_dir = ensure_private_directory(&bridge_state.join("tmp"))?;

    Ok(O2Paths {
        root: canonical_root,
        dispatcher: canonical_dispatcher,
        temp_dir,
    })
}

fn new_request_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let sequence = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("rc-{}-{millis}-{sequence}", std::process::id())
}

fn duration_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn failed_result(
    failure_kind: BridgeFailureKind,
    message: impl Into<String>,
    request_id: String,
    started: Instant,
) -> RunO2Result {
    RunO2Result {
        ok: false,
        code: 1,
        stdout: String::new(),
        stderr: message.into(),
        failure_kind: Some(failure_kind),
        request_id,
        duration_ms: duration_ms(started),
    }
}

fn process_limits(timeout: Duration) -> ExecutionLimits {
    ExecutionLimits {
        timeout,
        stdout_bytes: STDOUT_MAX_BYTES,
        stderr_bytes: STDERR_MAX_BYTES,
        termination_grace: TERMINATION_GRACE,
    }
}

fn audit_limits() -> ExecutionLimits {
    ExecutionLimits {
        timeout: Duration::from_secs(5),
        stdout_bytes: 64 * 1024,
        stderr_bytes: 64 * 1024,
        termination_grace: Duration::from_millis(500),
    }
}

fn dispatcher_command(paths: &O2Paths, context: &RuntimeContext, verb: &str) -> Command {
    let mut command = Command::new(BASH_EXECUTABLE);
    apply_child_environment(
        &mut command,
        &paths.root,
        &paths.temp_dir,
        context.e2e_home.as_deref(),
    );
    command.arg(&paths.dispatcher).arg(verb);
    command
}

fn git_command(paths: &O2Paths, context: &RuntimeContext, args: &[&str]) -> Command {
    let mut command = Command::new(GIT_EXECUTABLE);
    apply_child_environment(
        &mut command,
        &paths.root,
        &paths.temp_dir,
        context.e2e_home.as_deref(),
    );
    command.arg("-C").arg(&paths.root).args(args);
    command
}

fn process_failure_kind(failure: ProcessFailure) -> BridgeFailureKind {
    match failure {
        ProcessFailure::Spawn => BridgeFailureKind::SpawnFailure,
        ProcessFailure::Stdin => BridgeFailureKind::StdinFailure,
        ProcessFailure::Timeout => BridgeFailureKind::Timeout,
        ProcessFailure::StdoutLimit | ProcessFailure::StderrLimit => {
            BridgeFailureKind::OutputLimitExceeded
        }
        ProcessFailure::MissingPipe | ProcessFailure::Stream | ProcessFailure::Wait => {
            BridgeFailureKind::InternalBridgeFailure
        }
    }
}

fn process_result(outcome: ProcessOutcome, request_id: String) -> RunO2Result {
    let failure_kind = outcome
        .failure
        .map(process_failure_kind)
        .or_else(|| (outcome.code != 0).then_some(BridgeFailureKind::O2ProcessFailure));
    RunO2Result {
        ok: failure_kind.is_none(),
        code: outcome.code,
        stdout: redact_sensitive_text(&outcome.stdout),
        stderr: redact_sensitive_text(&outcome.stderr),
        failure_kind,
        request_id,
        duration_ms: u64::try_from(outcome.duration.as_millis()).unwrap_or(u64::MAX),
    }
}

fn redact_sensitive_text(value: &str) -> String {
    static TOKEN: OnceLock<Regex> = OnceLock::new();
    static BEARER: OnceLock<Regex> = OnceLock::new();
    static ASSIGNMENT: OnceLock<Regex> = OnceLock::new();
    static PRIVATE_KEY: OnceLock<Regex> = OnceLock::new();
    static QUERY: OnceLock<Regex> = OnceLock::new();
    static USERINFO: OnceLock<Regex> = OnceLock::new();
    let mut redacted = TOKEN
        .get_or_init(|| {
            Regex::new(
                r"(?x)\b(?:gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|re_[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,})\b",
            )
            .expect("static token redaction pattern")
        })
        .replace_all(value, "<redacted-secret>")
        .into_owned();
    redacted = BEARER
        .get_or_init(|| {
            Regex::new(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]{16,}")
                .expect("static bearer redaction pattern")
        })
        .replace_all(&redacted, "Bearer <redacted-secret>")
        .into_owned();
    redacted = ASSIGNMENT
        .get_or_init(|| {
            Regex::new(
                r"(?i)\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE_KEY))\s*=\s*[^\s]+",
            )
            .expect("static assignment redaction pattern")
        })
        .replace_all(&redacted, "$1=<redacted-secret>")
        .into_owned();
    redacted = PRIVATE_KEY
        .get_or_init(|| {
            Regex::new(
                r"(?s)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
            )
            .expect("static private-key redaction pattern")
        })
        .replace_all(&redacted, "<redacted-private-key>")
        .into_owned();
    redacted = QUERY
        .get_or_init(|| {
            Regex::new(r"(?i)([?&](?:access_token|api_key|token|secret|password)=)[^&#\s]+")
                .expect("static query redaction pattern")
        })
        .replace_all(&redacted, "$1<redacted-secret>")
        .into_owned();
    USERINFO
        .get_or_init(|| {
            Regex::new(r"(?i)(://[^:/\s]+:)[^@/\s]+@")
                .expect("static URL userinfo redaction pattern")
        })
        .replace_all(&redacted, "$1<redacted-secret>@")
        .into_owned()
}

fn valid_project_key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || (byte == b'-' && index > 0)
        })
        && !value.ends_with('-')
}

fn valid_base64url(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= VERB_MAX_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn encoded_spec(
    verb: &str,
    prefix: &str,
    operation: &str,
    target: &str,
    timeout: TimeoutClass,
    audit: Option<AuditClass>,
) -> Option<InvocationSpec> {
    let payload = verb.strip_prefix(prefix)?;
    valid_base64url(payload).then(|| InvocationSpec {
        dispatch_verb: verb.to_string(),
        operation: operation.to_string(),
        target: target.to_string(),
        timeout,
        audit,
    })
}

fn parse_verb(verb: &str) -> Result<InvocationSpec, BridgeFailureKind> {
    if verb.is_empty() || verb != verb.trim() || verb.len() > VERB_MAX_BYTES {
        return Err(BridgeFailureKind::InvalidRequest);
    }

    let read = |operation: &str, target: &str| InvocationSpec {
        dispatch_verb: verb.to_string(),
        operation: operation.to_string(),
        target: target.to_string(),
        timeout: TimeoutClass::Read,
        audit: None,
    };
    match verb {
        "contract_info" => return Ok(read("contract.info", "o2-runtime")),
        "list_projects" => return Ok(read("project.list", "project-registry")),
        "empire.todo.list" => return Ok(read("empire-todo.list", "empire-todo")),
        "radcontrol.scratchpad.read" => {
            return Ok(read("radcontrol-scratchpad.read", "radcontrol-scratchpad"))
        }
        "knowledge.operator_workspace" => {
            return Ok(read("knowledge.operator-workspace", "o2-knowledge"))
        }
        "router.health" => return Ok(read("router.health", "registered-routers")),
        "radcontrol.golden_state" => return Ok(read("radcontrol.golden-state", "matched-pair")),
        "sentinel.status" => return Ok(read("sentinel.status", "sentinel")),
        "sentinel.host.current" => return Ok(read("sentinel.host.current", "workstation")),
        "workstation.updates.history" => {
            return Ok(read("workstation-updates.history", "workstation"))
        }
        "files.list" => return Ok(read("files.list", "o2-documents")),
        "empire.map" => {
            return Ok(InvocationSpec {
                dispatch_verb: verb.to_string(),
                operation: "empire.map".to_string(),
                target: "empire-map".to_string(),
                timeout: TimeoutClass::Extended,
                audit: Some(AuditClass::Mutation),
            })
        }
        "empire.sweep" => {
            return Ok(InvocationSpec {
                dispatch_verb: verb.to_string(),
                operation: "empire.sweep".to_string(),
                target: "workstation-processes".to_string(),
                timeout: TimeoutClass::Extended,
                audit: Some(AuditClass::Privileged),
            })
        }
        "sentinel.host.check" | "sentinel.security.check" | "workstation.updates.check" => {
            return Ok(InvocationSpec {
                dispatch_verb: verb.to_string(),
                operation: verb.replace('.', "-"),
                target: "workstation".to_string(),
                timeout: TimeoutClass::Governed,
                audit: Some(AuditClass::Privileged),
            })
        }
        "sentinel.host.deep_check" | "sentinel.host.explain_fans" => {
            return Ok(InvocationSpec {
                dispatch_verb: verb.to_string(),
                operation: verb.replace('.', "-"),
                target: "workstation".to_string(),
                timeout: TimeoutClass::Extended,
                audit: Some(AuditClass::Privileged),
            })
        }
        "workstation.cleanup.pop_upgrade.preview" => {
            return Ok(InvocationSpec {
                dispatch_verb: verb.to_string(),
                operation: "workstation-cleanup.pop-upgrade.preview".to_string(),
                target: "pop-upgrade.service".to_string(),
                timeout: TimeoutClass::Governed,
                audit: Some(AuditClass::Privileged),
            })
        }
        "workstation.cleanup.pop_upgrade.apply" => {
            return Ok(InvocationSpec {
                dispatch_verb: verb.to_string(),
                operation: "workstation-cleanup.pop-upgrade.apply".to_string(),
                target: "pop-upgrade.service".to_string(),
                timeout: TimeoutClass::Extended,
                audit: Some(AuditClass::Privileged),
            })
        }
        _ => {}
    }

    let encoded = [
        (
            "files.list.",
            "files.list",
            "o2-documents",
            TimeoutClass::Read,
            None,
        ),
        (
            "files.read.",
            "files.read",
            "o2-documents",
            TimeoutClass::Read,
            None,
        ),
        (
            "files.rename.",
            "files.rename",
            "o2-documents",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "files.delete.",
            "files.delete",
            "o2-documents",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "project_note.ensure.",
            "project-note.ensure",
            "project-notes",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "project_retired.set.",
            "project-retired.set",
            "project-registry",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "project_launch_date.set.",
            "project-launch-date.set",
            "project-registry",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "project_create.preview.",
            "project-create.preview",
            "project-formation",
            TimeoutClass::Extended,
            None,
        ),
        (
            "project_create.start.",
            "project-create.start",
            "project-formation",
            TimeoutClass::Extended,
            Some(AuditClass::Mutation),
        ),
        (
            "project_create.bootstrap.",
            "project-create.bootstrap",
            "project-formation",
            TimeoutClass::Extended,
            Some(AuditClass::Mutation),
        ),
        (
            "agent_profile.create.",
            "agent-profile.create",
            "agent-profiles",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "infrastructure_asset.create.",
            "infrastructure-asset.create",
            "infrastructure-assets",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "sentinel.host.automation.configure.",
            "sentinel.host.automation.configure",
            "host-guardian-scheduler",
            TimeoutClass::Governed,
            Some(AuditClass::Mutation),
        ),
        (
            "sentinel.ask.",
            "sentinel.ask",
            "sentinel",
            TimeoutClass::Governed,
            Some(AuditClass::Privileged),
        ),
        (
            "sentinel.host.investigate.",
            "sentinel.host.investigate",
            "bounded-host-evidence",
            TimeoutClass::Extended,
            Some(AuditClass::Privileged),
        ),
        (
            "port_status.batch.",
            "port-status.batch",
            "governed-ports",
            TimeoutClass::Read,
            None,
        ),
    ];
    for (prefix, operation, target, timeout, audit) in encoded {
        if verb.starts_with(prefix) {
            return encoded_spec(verb, prefix, operation, target, timeout, audit)
                .ok_or(BridgeFailureKind::InvalidRequest);
        }
    }

    if let Some(port) = verb.strip_prefix("port_status.") {
        let valid = port.parse::<u16>().is_ok_and(|value| value > 0);
        return valid
            .then(|| read("port-status", "governed-port"))
            .ok_or(BridgeFailureKind::InvalidRequest);
    }
    if let Some(kind) = verb.strip_prefix("port_suggest.") {
        return matches!(
            kind,
            "nextjs" | "tauri" | "python" | "static" | "docs" | "other"
        )
        .then(|| read("port-suggest", "governed-ports"))
        .ok_or(BridgeFailureKind::InvalidRequest);
    }

    let Some((project_key, raw_action)) = verb.rsplit_once('.') else {
        return Err(BridgeFailureKind::UnsupportedVerb);
    };
    if !valid_project_key(project_key) {
        return Err(BridgeFailureKind::InvalidRequest);
    }
    let action = ProjectAction::parse(raw_action).ok_or(BridgeFailureKind::UnsupportedVerb)?;
    if project_key == "radcontrol" && action.is_runtime_lifecycle() {
        return Err(BridgeFailureKind::UnsupportedVerb);
    }
    Ok(InvocationSpec {
        dispatch_verb: verb.to_string(),
        operation: action.operation().to_string(),
        target: project_key.to_string(),
        timeout: action.timeout(),
        audit: Some(AuditClass::Mutation),
    })
}

fn payload_spec(verb: &str) -> Result<InvocationSpec, BridgeFailureKind> {
    let (dispatch, operation, target) = match verb {
        "files.write" => ("files.write.stdin", "files.write", "o2-documents"),
        "empire.todo.save" => ("empire.todo.save.stdin", "empire-todo.save", "empire-todo"),
        "empire.todo.complete" => (
            "empire.todo.complete.stdin",
            "empire-todo.complete",
            "empire-todo",
        ),
        "radcontrol.scratchpad.write" => (
            "radcontrol.scratchpad.write.stdin",
            "radcontrol.scratchpad.write",
            "radcontrol-scratchpad",
        ),
        _ => return Err(BridgeFailureKind::UnsupportedVerb),
    };
    Ok(InvocationSpec {
        dispatch_verb: dispatch.to_string(),
        operation: operation.to_string(),
        target: target.to_string(),
        timeout: TimeoutClass::Governed,
        audit: Some(AuditClass::Mutation),
    })
}

fn validate_stdin_payload(payload: &str) -> Result<(), BridgeFailureKind> {
    if payload.len() > STDIN_PAYLOAD_MAX_BYTES || payload.is_empty() {
        return Err(BridgeFailureKind::InvalidRequest);
    }
    let value: Value =
        serde_json::from_str(payload).map_err(|_| BridgeFailureKind::InvalidRequest)?;
    if !value.is_object() {
        return Err(BridgeFailureKind::InvalidRequest);
    }
    Ok(())
}

fn audit_append(
    paths: &O2Paths,
    context: &RuntimeContext,
    spec: &InvocationSpec,
    result: &RunO2Result,
) -> bool {
    let Some(audit_class) = spec.audit else {
        return true;
    };
    let payload = json!({
        "requestId": result.request_id,
        "operation": spec.operation,
        "operationClass": audit_class.as_str(),
        "target": spec.target,
        "caller": "radcontrol-tauri",
        "success": result.ok,
        "failureCategory": result.failure_kind.map(BridgeFailureKind::as_str),
        "durationMs": result.duration_ms,
    });
    let command = dispatcher_command(paths, context, "radcontrol.audit.append.stdin");
    let outcome = run_bounded(command, serde_json::to_vec(&payload).ok(), audit_limits());
    if outcome.failure.is_some() || outcome.code != 0 {
        return false;
    }
    serde_json::from_str::<Value>(&outcome.stdout)
        .ok()
        .and_then(|value| value.get("ok").and_then(Value::as_bool))
        == Some(true)
}

fn execute(
    context: RuntimeContext,
    spec: InvocationSpec,
    stdin_payload: Option<Vec<u8>>,
) -> RunO2Result {
    let request_id = new_request_id();
    let started = Instant::now();
    let Some(_permit) = INVOCATIONS.try_acquire() else {
        return failed_result(
            BridgeFailureKind::ConcurrencyLimit,
            "the governed O2 invocation limit is busy",
            request_id,
            started,
        );
    };
    let paths = match validate_runtime_paths(&context) {
        Ok(paths) => paths,
        Err(kind) => {
            return failed_result(
                kind,
                "the canonical O2 runtime or dispatcher is unavailable",
                request_id,
                started,
            )
        }
    };
    let command = dispatcher_command(&paths, &context, &spec.dispatch_verb);
    let outcome = run_bounded(
        command,
        stdin_payload,
        process_limits(spec.timeout.duration()),
    );
    let mut result = process_result(outcome, request_id);
    if !audit_append(&paths, &context, &spec, &result) {
        if result.ok {
            result.ok = false;
            result.code = 1;
            result.failure_kind = Some(BridgeFailureKind::AuditFailure);
            result.stderr = "the governed operation may have completed, but its O2 audit record failed; verify before retrying".to_string();
        } else if result.stderr.len() < 32 * 1024 {
            if !result.stderr.is_empty() && !result.stderr.ends_with('\n') {
                result.stderr.push('\n');
            }
            result.stderr.push_str("the O2 audit append also failed");
        }
    }
    result
}

fn git_value(
    paths: &O2Paths,
    context: &RuntimeContext,
    args: &[&str],
) -> Result<Option<String>, BridgeFailureKind> {
    let command = git_command(paths, context, args);
    let outcome = run_bounded(
        command,
        None,
        ExecutionLimits {
            timeout: Duration::from_secs(3),
            stdout_bytes: 64 * 1024,
            stderr_bytes: 16 * 1024,
            termination_grace: Duration::from_millis(300),
        },
    );
    if let Some(failure) = outcome.failure {
        return Err(process_failure_kind(failure));
    }
    if outcome.code != 0 {
        return Err(BridgeFailureKind::O2ProcessFailure);
    }
    let trimmed = outcome.stdout.trim();
    Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
}

#[tauri::command]
pub fn runtime_diagnostics() -> RuntimeDiagnostics {
    let configured = runtime_context();
    let fallback_root = resolved_o2_root(false, None, cfg!(debug_assertions));
    let root = configured
        .as_ref()
        .map(|context| context.root.clone())
        .unwrap_or(fallback_root);
    let dispatcher_path = root.join("scripts/run_o2.sh");
    let project_registry_path = root.join("registry/projects.json");
    let audit_transport_path = root.join("scripts/o2_radcontrol_audit.py");
    let empire_todo_seed_path = root.join("registry/empire-todo-seeds.json");
    let empire_todo_store_path = root.join("docs/radcontrol/empire_todo/items.json");
    let runtime_mode = if e2e_mode() {
        "e2e"
    } else if cfg!(debug_assertions) {
        "debug"
    } else {
        "production"
    };

    let mut bridge_failure = configured.as_ref().err().copied();
    let mut o2_git_sha = None;
    let mut o2_git_branch = None;
    if let Ok(context) = &configured {
        match INVOCATIONS.try_acquire() {
            Some(_permit) => match validate_runtime_paths(context) {
                Ok(paths) => {
                    match git_value(&paths, context, &["rev-parse", "HEAD"]) {
                        Ok(value) => o2_git_sha = value,
                        Err(kind) => bridge_failure = Some(kind),
                    }
                    match git_value(&paths, context, &["branch", "--show-current"]) {
                        Ok(value) => o2_git_branch = value,
                        Err(kind) => bridge_failure = Some(kind),
                    }
                }
                Err(kind) => bridge_failure = Some(kind),
            },
            None => bridge_failure = Some(BridgeFailureKind::ConcurrencyLimit),
        }
    }

    RuntimeDiagnostics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        git_sha: env!("RADCONTROL_GIT_SHA").to_string(),
        built_at_epoch_seconds: env!("RADCONTROL_BUILD_EPOCH").parse().unwrap_or(0),
        runtime_mode: runtime_mode.to_string(),
        executable_path: std::env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
        radcontrol_root: env!("RADCONTROL_SOURCE_ROOT").to_string(),
        o2_root: root.display().to_string(),
        o2_git_sha,
        o2_git_branch,
        dispatcher_path: dispatcher_path.display().to_string(),
        project_registry_path: project_registry_path.display().to_string(),
        empire_todo_seed_path: empire_todo_seed_path.display().to_string(),
        empire_todo_store_path: empire_todo_store_path.display().to_string(),
        dispatcher_available: validate_regular_file(&dispatcher_path).is_ok(),
        project_registry_available: validate_regular_file(&project_registry_path).is_ok(),
        audit_transport_available: validate_regular_file(&audit_transport_path).is_ok(),
        empire_todo_seed_available: validate_regular_file(&empire_todo_seed_path).is_ok(),
        empire_todo_store_available: validate_regular_file(&empire_todo_store_path).is_ok(),
        bridge_failure,
    }
}

#[tauri::command]
pub fn e2e_project_roots() -> Option<E2EProjectRoots> {
    if !e2e_mode() {
        return None;
    }
    let home = runtime_context().ok()?.e2e_home?;
    let metadata = fs::symlink_metadata(&home).ok()?;
    let canonical = home.canonicalize().ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() || canonical != home {
        return None;
    }
    Some(E2EProjectRoots {
        radcon: home.join("dev/rad-empire/radcon/dev").display().to_string(),
        radwolfe: home
            .join("dev/rad-empire/radwolfe/dev")
            .display()
            .to_string(),
        other: home.join("dev/playground").display().to_string(),
    })
}

#[tauri::command]
pub fn run_o2_payload(verb: String, payload_json: String) -> RunO2Result {
    let request_id = new_request_id();
    let started = Instant::now();
    let spec = match payload_spec(&verb) {
        Ok(spec) => spec,
        Err(kind) => {
            return failed_result(
                kind,
                "the stdin operation is not supported",
                request_id,
                started,
            )
        }
    };
    if let Err(kind) = validate_stdin_payload(&payload_json) {
        return failed_result(
            kind,
            format!("stdin payload must be a JSON object no larger than {STDIN_PAYLOAD_MAX_BYTES} bytes"),
            request_id,
            started,
        );
    }
    let context = match runtime_context() {
        Ok(context) => context,
        Err(kind) => {
            return failed_result(kind, "the runtime context is invalid", request_id, started)
        }
    };
    execute(context, spec, Some(payload_json.into_bytes()))
}

#[tauri::command]
pub fn run_o2(verb: String) -> RunO2Result {
    let request_id = new_request_id();
    let started = Instant::now();
    let spec = match parse_verb(&verb) {
        Ok(spec) => spec,
        Err(kind) => {
            return failed_result(
                kind,
                "the requested O2 verb is invalid or unsupported",
                request_id,
                started,
            )
        }
    };
    let context = match runtime_context() {
        Ok(context) => context,
        Err(kind) => {
            return failed_result(kind, "the runtime context is invalid", request_id, started)
        }
    };
    execute(context, spec, None)
}

pub(crate) fn terminate_active_processes() {
    terminate_processes();
}

pub(crate) fn opener_registry_json() -> Result<String, String> {
    let context =
        runtime_context().map_err(|_| "governed O2 runtime is unavailable".to_string())?;
    let paths = validate_runtime_paths(&context)
        .map_err(|_| "governed O2 runtime is unavailable".to_string())?;
    let path = paths.root.join("registry/projects.json");
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&path)
        .map_err(|_| "governed project registry is unavailable".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "governed project registry is unavailable".to_string())?;
    const REGISTRY_MAX_BYTES: u64 = 2 * 1024 * 1024;
    if !metadata.is_file() || metadata.len() > REGISTRY_MAX_BYTES {
        return Err("governed project registry is unavailable".to_string());
    }
    let mut content = String::new();
    file.take(REGISTRY_MAX_BYTES + 1)
        .read_to_string(&mut content)
        .map_err(|_| "governed project registry is unavailable".to_string())?;
    if content.len() as u64 > REGISTRY_MAX_BYTES {
        return Err("governed project registry is unavailable".to_string());
    }
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::{
        execute, parse_verb, payload_spec, redact_sensitive_text, resolved_o2_root,
        validate_runtime_paths, validate_stdin_payload, AuditClass, BridgeFailureKind,
        InvocationSpec, ProjectAction, RuntimeContext, TimeoutClass, STDIN_PAYLOAD_MAX_BYTES,
    };
    use std::fs;
    use std::path::PathBuf;

    fn fixture_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "radcontrol-runtime-boundary-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("scripts")).expect("create fixture scripts");
        fs::create_dir_all(root.join("registry")).expect("create fixture registry");
        fs::create_dir(root.join("home")).expect("create fixture home");
        fs::write(
            root.join("scripts/run_o2.sh"),
            "#!/usr/bin/env bash\nexit 0\n",
        )
        .expect("write dispatcher");
        fs::write(root.join("scripts/o2_radcontrol_audit.py"), "# fixture\n")
            .expect("write audit transport");
        fs::write(root.join("registry/projects.json"), "[]\n").expect("write registry");
        root
    }

    #[test]
    fn production_and_debug_roots_ignore_ambient_home_and_o2_root() {
        assert_eq!(
            resolved_o2_root(false, Some("/tmp/ignored"), false),
            PathBuf::from("/home/chris/.local/share/radcontrol/o2-runtime")
        );
        assert_eq!(
            resolved_o2_root(false, Some("/tmp/ignored"), true),
            PathBuf::from("/home/chris/dev/o2")
        );
        assert_eq!(
            resolved_o2_root(true, Some("/tmp/o2-fixture"), false),
            PathBuf::from("/tmp/o2-fixture")
        );
        assert_eq!(
            resolved_o2_root(true, Some("relative/o2"), false),
            PathBuf::from("/home/chris/.local/share/radcontrol/o2-runtime")
        );
    }

    #[test]
    fn invalid_explicit_runtime_home_fails_closed() {
        let root = fixture_root("invalid-home");
        let missing = root.join("missing-home");
        let missing_context = RuntimeContext {
            root: root.clone(),
            e2e_home: Some(missing),
        };
        assert_eq!(
            validate_runtime_paths(&missing_context).unwrap_err(),
            BridgeFailureKind::ExecutableUnavailable
        );

        let real_home = root.join("real-home");
        fs::create_dir(&real_home).expect("create real fixture home");
        let linked_home = root.join("linked-home");
        std::os::unix::fs::symlink(&real_home, &linked_home).expect("create fixture home symlink");
        let linked_context = RuntimeContext {
            root: root.clone(),
            e2e_home: Some(linked_home),
        };
        assert_eq!(
            validate_runtime_paths(&linked_context).unwrap_err(),
            BridgeFailureKind::ExecutableUnavailable
        );
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn process_output_redaction_removes_tokens_urls_and_assignments() {
        let token = "ghp_".to_string() + "FixtureOnlyValue1234567890";
        let jwt = "eyJ".to_string() + "FixtureHeader12.FixturePayload12.FixtureSignature8";
        let private_key = [
            "-----BEGIN ",
            "PRIVATE KEY-----\nFixturePrivateMaterial\n-----END PRIVATE KEY-----",
        ]
        .concat();
        let raw = format!(
            "Bearer {token}\nAPI_TOKEN={token}\nhttps://user:{token}@example.test/path?access_token={token}\n{jwt}\n{private_key}"
        );
        let redacted = redact_sensitive_text(&raw);
        assert!(!redacted.contains(&token));
        assert!(!redacted.contains(&jwt));
        assert!(!redacted.contains("FixturePrivateMaterial"));
        assert!(redacted.contains("Bearer <redacted-secret>"));
        assert!(redacted.contains("API_TOKEN=<redacted-secret>"));
        assert!(redacted.contains("access_token=<redacted-secret>"));
    }

    #[test]
    fn renderer_payload_cannot_escape_through_result_or_audit_storage() {
        let root = fixture_root("renderer-secret-boundary");
        fs::write(
            root.join("scripts/run_o2.sh"),
            "#!/usr/bin/bash\nif [[ \"$1\" == radcontrol.audit.append.stdin ]]; then /usr/bin/cat > \"$O2_ROOT/audit-capture.json\"; printf '{\"ok\":true}\\n'; exit 0; fi\n/usr/bin/cat\n",
        )
        .expect("write echoing dispatcher");
        let token = "ghp_".to_string() + "RendererFixtureValue1234567890";
        let payload = format!(r#"{{"note":"Bearer {token}","API_TOKEN":"{token}"}}"#);
        assert!(validate_stdin_payload(&payload).is_ok());

        let result = execute(
            RuntimeContext {
                root: root.clone(),
                e2e_home: Some(root.join("home")),
            },
            payload_spec("files.write").expect("supported payload operation"),
            Some(payload.into_bytes()),
        );

        assert!(result.ok);
        assert!(!result.stdout.contains(&token));
        assert!(!result.stderr.contains(&token));
        assert!(result.stdout.contains("<redacted-secret>"));
        let audit = fs::read_to_string(root.join("audit-capture.json"))
            .expect("read captured audit payload");
        assert!(!audit.contains(&token));
        assert!(!audit.contains("note"));
        assert!(!audit.contains("API_TOKEN"));
        assert!(root
            .join(".state/radcontrol-runtime/tmp")
            .read_dir()
            .expect("read private temp directory")
            .next()
            .is_none());
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn closed_action_parser_rejects_injection_and_self_runtime_loops() {
        for allowed in [
            "dqotd.dev_strict",
            "radcontrol.snapshot",
            "future-product.snapshot",
            "future-product.stop",
            "future-product.proofpack",
            "files.read.ZG9jcy9ub3Rlcy5tZA",
            "project_create.preview.e30",
            "port_status.3000",
            "sentinel.host.automation.configure.e30",
            "workstation.cleanup.pop_upgrade.preview",
            "workstation.cleanup.pop_upgrade.apply",
            "knowledge.operator_workspace",
        ] {
            assert!(parse_verb(allowed).is_ok(), "expected allowed: {allowed}");
        }
        for denied in [
            "radcontrol.dev",
            "radcontrol.dev_strict",
            "radcontrol.stop",
            "o2.shell",
            "../snapshot",
            "/tmp/project.snapshot",
            "Project.snapshot",
            "fïxture.snapshot",
            "alpha.snapshot;touch-pwned",
            "files.write.ZXNjYXBl",
            "port_status.0",
            "port_status.65536",
        ] {
            assert!(parse_verb(denied).is_err(), "expected denied: {denied}");
        }
        assert!(ProjectAction::parse("commit").is_none());
    }

    #[test]
    fn project_intent_preview_is_read_only_at_the_bridge_boundary() {
        let spec = parse_verb("project_create.preview.e30").expect("preview is allowlisted");
        assert_eq!(spec.operation, "project-create.preview");
        assert_eq!(spec.target, "project-formation");
        assert_eq!(spec.audit, None);
    }

    #[test]
    fn stdin_json_is_object_shaped_and_exactly_bounded() {
        assert_eq!(
            validate_stdin_payload(""),
            Err(BridgeFailureKind::InvalidRequest)
        );
        assert_eq!(
            validate_stdin_payload("[]"),
            Err(BridgeFailureKind::InvalidRequest)
        );
        assert_eq!(
            validate_stdin_payload("not-json"),
            Err(BridgeFailureKind::InvalidRequest)
        );
        assert!(validate_stdin_payload("{}").is_ok());
        let exact = format!("{{\"x\":\"{}\"}}", "x".repeat(STDIN_PAYLOAD_MAX_BYTES - 8));
        assert_eq!(exact.len(), STDIN_PAYLOAD_MAX_BYTES);
        assert!(validate_stdin_payload(&exact).is_ok());
        let too_large = format!("{{\"x\":\"{}\"}}", "x".repeat(STDIN_PAYLOAD_MAX_BYTES - 7));
        assert_eq!(too_large.len(), STDIN_PAYLOAD_MAX_BYTES + 1);
        assert_eq!(
            validate_stdin_payload(&too_large),
            Err(BridgeFailureKind::InvalidRequest)
        );
    }

    #[test]
    fn runtime_root_and_required_files_must_not_be_symlinks() {
        let root = fixture_root("paths");
        let context = RuntimeContext {
            root: root.clone(),
            e2e_home: Some(root.join("home")),
        };
        assert!(validate_runtime_paths(&context).is_ok());

        let real_dispatcher = root.join("scripts/real-run-o2.sh");
        fs::rename(root.join("scripts/run_o2.sh"), &real_dispatcher).expect("move dispatcher");
        std::os::unix::fs::symlink(&real_dispatcher, root.join("scripts/run_o2.sh"))
            .expect("symlink dispatcher");
        assert_eq!(
            validate_runtime_paths(&context).unwrap_err(),
            BridgeFailureKind::ExecutableUnavailable
        );
        fs::remove_dir_all(root).expect("remove fixture");

        let root = fixture_root("parent-symlink");
        fs::rename(root.join("scripts"), root.join("real-scripts"))
            .expect("move scripts directory");
        std::os::unix::fs::symlink(root.join("real-scripts"), root.join("scripts"))
            .expect("symlink scripts directory");
        let context = RuntimeContext {
            root: root.clone(),
            e2e_home: Some(root.join("home")),
        };
        assert_eq!(
            validate_runtime_paths(&context).unwrap_err(),
            BridgeFailureKind::ExecutableUnavailable
        );
        fs::remove_dir_all(root).expect("remove parent symlink fixture");
    }

    #[test]
    fn successful_mutation_becomes_audit_failure_when_append_fails() {
        let root = fixture_root("audit-failure");
        fs::write(
            root.join("scripts/run_o2.sh"),
            "#!/usr/bin/bash\nif [[ \"$1\" == radcontrol.audit.append.stdin ]]; then exit 19; fi\nprintf '{\"ok\":true}\\n'\n",
        )
        .expect("write failing audit dispatcher");
        let result = execute(
            RuntimeContext {
                root: root.clone(),
                e2e_home: Some(root.join("home")),
            },
            InvocationSpec {
                dispatch_verb: "fixture.snapshot".to_string(),
                operation: "project.snapshot".to_string(),
                target: "fixture".to_string(),
                timeout: TimeoutClass::Governed,
                audit: Some(AuditClass::Mutation),
            },
            None,
        );
        assert!(!result.ok);
        assert_eq!(result.failure_kind, Some(BridgeFailureKind::AuditFailure));
        assert!(result.stderr.contains("may have completed"));
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn failed_o2_process_is_not_translated_into_empty_success() {
        let root = fixture_root("o2-failure");
        fs::write(
            root.join("scripts/run_o2.sh"),
            "#!/usr/bin/bash\nprintf 'governed rejection\\n' >&2\nexit 23\n",
        )
        .expect("write failing dispatcher");
        let result = execute(
            RuntimeContext {
                root: root.clone(),
                e2e_home: Some(root.join("home")),
            },
            InvocationSpec {
                dispatch_verb: "contract_info".to_string(),
                operation: "contract.info".to_string(),
                target: "o2-runtime".to_string(),
                timeout: TimeoutClass::Read,
                audit: None,
            },
            None,
        );
        assert!(!result.ok);
        assert_eq!(result.code, 23);
        assert_eq!(
            result.failure_kind,
            Some(BridgeFailureKind::O2ProcessFailure)
        );
        assert!(result.stderr.contains("governed rejection"));
        fs::remove_dir_all(root).expect("remove fixture");
    }
}
