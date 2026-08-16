use std::collections::HashSet;
use std::io::{Read, Write};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

pub const SAFE_PATH: &str = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const POLL_INTERVAL: Duration = Duration::from_millis(10);
const EXIT_PIPE_GRACE: Duration = Duration::from_millis(100);
const FAILURE_DIAGNOSTIC_BYTES: usize = 16 * 1024;

static ACTIVE_GROUPS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();

#[derive(Clone, Copy, Debug)]
pub struct ExecutionLimits {
    pub timeout: Duration,
    pub stdout_bytes: usize,
    pub stderr_bytes: usize,
    pub termination_grace: Duration,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProcessFailure {
    Spawn,
    MissingPipe,
    Stdin,
    Timeout,
    StdoutLimit,
    StderrLimit,
    Stream,
    Wait,
}

#[derive(Debug)]
pub struct ProcessOutcome {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration: Duration,
    pub failure: Option<ProcessFailure>,
}

pub struct InvocationLimiter {
    active: AtomicUsize,
    maximum: usize,
}

pub struct InvocationPermit<'a> {
    limiter: &'a InvocationLimiter,
}

impl InvocationLimiter {
    pub const fn new(maximum: usize) -> Self {
        Self {
            active: AtomicUsize::new(0),
            maximum,
        }
    }

    pub fn try_acquire(&self) -> Option<InvocationPermit<'_>> {
        let mut observed = self.active.load(Ordering::Acquire);
        loop {
            if observed >= self.maximum {
                return None;
            }
            match self.active.compare_exchange_weak(
                observed,
                observed + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return Some(InvocationPermit { limiter: self }),
                Err(next) => observed = next,
            }
        }
    }

    #[cfg(test)]
    fn active(&self) -> usize {
        self.active.load(Ordering::Acquire)
    }
}

impl Drop for InvocationPermit<'_> {
    fn drop(&mut self) {
        self.limiter.active.fetch_sub(1, Ordering::AcqRel);
    }
}

struct ActiveGroupGuard {
    pid: u32,
}

impl ActiveGroupGuard {
    fn register(pid: u32) -> Self {
        active_groups()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(pid);
        Self { pid }
    }
}

impl Drop for ActiveGroupGuard {
    fn drop(&mut self) {
        active_groups()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.pid);
    }
}

fn active_groups() -> &'static Mutex<HashSet<u32>> {
    ACTIVE_GROUPS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn signal_group(pid: u32, signal: i32) {
    if let Ok(group) = i32::try_from(pid) {
        // The bridge creates this process group and never signals arbitrary or
        // discovered PIDs. ESRCH is expected when the lineage already exited.
        unsafe {
            libc::kill(-group, signal);
        }
    }
}

fn terminate_child_group(child: &mut Child, pid: u32, grace: Duration) -> Option<ExitStatus> {
    signal_group(pid, libc::SIGTERM);
    let deadline = Instant::now() + grace;
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(status)) => {
                signal_group(pid, libc::SIGKILL);
                return Some(status);
            }
            Ok(None) => thread::sleep(POLL_INTERVAL),
            Err(_) => break,
        }
    }
    signal_group(pid, libc::SIGKILL);
    child.wait().ok()
}

pub fn terminate_active_processes() {
    let initial: Vec<u32> = active_groups()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .iter()
        .copied()
        .collect();
    for pid in &initial {
        signal_group(*pid, libc::SIGTERM);
    }
    thread::sleep(Duration::from_millis(1500));
    let remaining: Vec<u32> = active_groups()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .iter()
        .copied()
        .collect();
    for pid in remaining {
        signal_group(pid, libc::SIGKILL);
    }
}

pub fn apply_child_environment(
    command: &mut Command,
    root: &Path,
    temp_dir: &Path,
    e2e_home: Option<&Path>,
) {
    command
        .env_clear()
        .env("HOME", e2e_home.unwrap_or_else(|| Path::new("/home/chris")))
        .env("O2_ROOT", root)
        .env("PWD", root)
        .env("PATH", SAFE_PATH)
        .env("LANG", "C.UTF-8")
        .env("LC_ALL", "C.UTF-8")
        .env("TMPDIR", temp_dir)
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .current_dir(root);
    if let Some(home) = e2e_home {
        command.env("RADCONTROL_E2E", "1").env("O2_E2E_HOME", home);
    }
}

struct StreamCapture {
    bytes: Vec<u8>,
    exceeded: bool,
    read_failed: bool,
}

fn capture_stream<R: Read>(
    mut reader: R,
    limit: usize,
    exceeded_flag: Arc<AtomicBool>,
    done_flag: Arc<AtomicBool>,
) -> StreamCapture {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut chunk = [0_u8; 8192];
    let mut exceeded = false;
    let mut read_failed = false;
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                if bytes.len().saturating_add(count) > limit {
                    let remaining = limit.saturating_sub(bytes.len());
                    bytes.extend_from_slice(&chunk[..remaining]);
                    exceeded = true;
                    exceeded_flag.store(true, Ordering::Release);
                    break;
                }
                bytes.extend_from_slice(&chunk[..count]);
            }
            Err(_) => {
                read_failed = true;
                break;
            }
        }
    }
    done_flag.store(true, Ordering::Release);
    StreamCapture {
        bytes,
        exceeded,
        read_failed,
    }
}

fn append_failure_message(stderr: &mut String, message: &str) {
    if !stderr.is_empty() && !stderr.ends_with('\n') {
        stderr.push('\n');
    }
    stderr.push_str(message);
}

fn truncate_utf8(value: &mut String, maximum_bytes: usize) {
    if value.len() <= maximum_bytes {
        return;
    }
    let mut end = maximum_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    value.truncate(end);
}

pub fn run_bounded(
    mut command: Command,
    stdin_payload: Option<Vec<u8>>,
    limits: ExecutionLimits,
) -> ProcessOutcome {
    let started = Instant::now();
    command
        .stdin(if stdin_payload.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            return ProcessOutcome {
                code: 1,
                stdout: String::new(),
                stderr: "failed to spawn the governed process".to_string(),
                duration: started.elapsed(),
                failure: Some(ProcessFailure::Spawn),
            }
        }
    };
    let pid = child.id();
    let _group_guard = ActiveGroupGuard::register(pid);

    let Some(stdout_pipe) = child.stdout.take() else {
        let _ = terminate_child_group(&mut child, pid, limits.termination_grace);
        return ProcessOutcome {
            code: 1,
            stdout: String::new(),
            stderr: "governed process did not expose stdout".to_string(),
            duration: started.elapsed(),
            failure: Some(ProcessFailure::MissingPipe),
        };
    };
    let Some(stderr_pipe) = child.stderr.take() else {
        let _ = terminate_child_group(&mut child, pid, limits.termination_grace);
        return ProcessOutcome {
            code: 1,
            stdout: String::new(),
            stderr: "governed process did not expose stderr".to_string(),
            duration: started.elapsed(),
            failure: Some(ProcessFailure::MissingPipe),
        };
    };

    let stdout_exceeded = Arc::new(AtomicBool::new(false));
    let stderr_exceeded = Arc::new(AtomicBool::new(false));
    let stdout_done = Arc::new(AtomicBool::new(false));
    let stderr_done = Arc::new(AtomicBool::new(false));
    let stdout_handle = {
        let exceeded = Arc::clone(&stdout_exceeded);
        let done = Arc::clone(&stdout_done);
        thread::spawn(move || capture_stream(stdout_pipe, limits.stdout_bytes, exceeded, done))
    };
    let stderr_handle = {
        let exceeded = Arc::clone(&stderr_exceeded);
        let done = Arc::clone(&stderr_done);
        thread::spawn(move || capture_stream(stderr_pipe, limits.stderr_bytes, exceeded, done))
    };

    let stdin_failed = Arc::new(AtomicBool::new(false));
    let stdin_done = Arc::new(AtomicBool::new(stdin_payload.is_none()));
    let stdin_handle = stdin_payload.map(|payload| {
        let failed = Arc::clone(&stdin_failed);
        let done = Arc::clone(&stdin_done);
        let mut pipe = child.stdin.take();
        thread::spawn(move || {
            let result = match pipe.as_mut() {
                Some(stdin) => stdin.write_all(&payload),
                None => Err(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "stdin pipe unavailable",
                )),
            };
            drop(pipe);
            if result.is_err() {
                failed.store(true, Ordering::Release);
            }
            done.store(true, Ordering::Release);
        })
    });

    let mut status: Option<ExitStatus> = None;
    let mut exited_at: Option<Instant> = None;
    let mut failure = None;
    loop {
        if stdin_failed.load(Ordering::Acquire) {
            failure = Some(ProcessFailure::Stdin);
            break;
        }
        if stdout_exceeded.load(Ordering::Acquire) {
            failure = Some(ProcessFailure::StdoutLimit);
            break;
        }
        if stderr_exceeded.load(Ordering::Acquire) {
            failure = Some(ProcessFailure::StderrLimit);
            break;
        }
        if started.elapsed() >= limits.timeout {
            failure = Some(ProcessFailure::Timeout);
            break;
        }

        if status.is_none() {
            match child.try_wait() {
                Ok(Some(exit_status)) => {
                    status = Some(exit_status);
                    exited_at = Some(Instant::now());
                }
                Ok(None) => {}
                Err(_) => {
                    failure = Some(ProcessFailure::Wait);
                    break;
                }
            }
        }

        let streams_done = stdout_done.load(Ordering::Acquire)
            && stderr_done.load(Ordering::Acquire)
            && stdin_done.load(Ordering::Acquire);
        if status.is_some() && streams_done {
            break;
        }
        if status.is_some() && exited_at.is_some_and(|instant| instant.elapsed() >= EXIT_PIPE_GRACE)
        {
            failure = Some(ProcessFailure::Wait);
            break;
        }
        thread::sleep(POLL_INTERVAL);
    }

    if failure.is_some() {
        status = terminate_child_group(&mut child, pid, limits.termination_grace).or(status);
    } else {
        // Clean up any same-group descendant that outlived a successful leader.
        signal_group(pid, libc::SIGTERM);
        thread::sleep(Duration::from_millis(20));
        signal_group(pid, libc::SIGKILL);
    }

    if let Some(handle) = stdin_handle {
        let _ = handle.join();
    }
    let stdout_capture = stdout_handle.join().unwrap_or(StreamCapture {
        bytes: Vec::new(),
        exceeded: false,
        read_failed: true,
    });
    let stderr_capture = stderr_handle.join().unwrap_or(StreamCapture {
        bytes: Vec::new(),
        exceeded: false,
        read_failed: true,
    });

    if failure.is_none() {
        if stdout_capture.exceeded {
            failure = Some(ProcessFailure::StdoutLimit);
        } else if stderr_capture.exceeded {
            failure = Some(ProcessFailure::StderrLimit);
        } else if stdout_capture.read_failed || stderr_capture.read_failed {
            failure = Some(ProcessFailure::Stream);
        }
    }

    let mut stdout = String::from_utf8_lossy(&stdout_capture.bytes).into_owned();
    let mut stderr = String::from_utf8_lossy(&stderr_capture.bytes).into_owned();
    if failure.is_some() {
        truncate_utf8(&mut stdout, FAILURE_DIAGNOSTIC_BYTES);
        truncate_utf8(&mut stderr, FAILURE_DIAGNOSTIC_BYTES);
    }
    match failure {
        Some(ProcessFailure::Stdin) => {
            append_failure_message(&mut stderr, "failed to write the governed stdin payload")
        }
        Some(ProcessFailure::Timeout) => {
            append_failure_message(&mut stderr, "governed process timed out and was terminated")
        }
        Some(ProcessFailure::StdoutLimit) => append_failure_message(
            &mut stderr,
            "governed process exceeded the stdout limit and was terminated",
        ),
        Some(ProcessFailure::StderrLimit) => append_failure_message(
            &mut stderr,
            "governed process exceeded the stderr limit and was terminated",
        ),
        Some(ProcessFailure::Wait) => append_failure_message(
            &mut stderr,
            "governed process cleanup or output completion failed",
        ),
        Some(ProcessFailure::Stream) => {
            append_failure_message(&mut stderr, "failed to read governed process output")
        }
        _ => {}
    }

    ProcessOutcome {
        code: status.and_then(|value| value.code()).unwrap_or(1),
        stdout,
        stderr,
        duration: started.elapsed(),
        failure,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_child_environment, run_bounded, ExecutionLimits, InvocationLimiter, ProcessFailure,
        SAFE_PATH,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::{Duration, Instant};

    fn fixture_script(name: &str, body: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "radcontrol-process-fixture-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        fs::create_dir_all(&root).expect("create process fixture");
        let script = root.join("fixture.sh");
        fs::write(&script, format!("#!/usr/bin/bash\nset -eu\n{body}\n"))
            .expect("write process fixture");
        script
    }

    fn fixture_command(name: &str, body: &str) -> Command {
        let mut command = Command::new("/usr/bin/bash");
        command.arg(fixture_script(name, body));
        command
    }

    fn limits(timeout_ms: u64, stdout_bytes: usize, stderr_bytes: usize) -> ExecutionLimits {
        ExecutionLimits {
            timeout: Duration::from_millis(timeout_ms),
            stdout_bytes,
            stderr_bytes,
            termination_grace: Duration::from_millis(75),
        }
    }

    fn process_disappears_within(pid: u32, timeout: Duration) -> bool {
        let process = PathBuf::from(format!("/proc/{pid}"));
        let deadline = Instant::now() + timeout;
        while process.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        !process.exists()
    }

    #[test]
    fn limiter_rejects_saturation_and_recovers_after_release() {
        let limiter = InvocationLimiter::new(2);
        let first = limiter.try_acquire().expect("first permit");
        let second = limiter.try_acquire().expect("second permit");
        assert!(limiter.try_acquire().is_none());
        assert_eq!(limiter.active(), 2);
        drop(first);
        assert!(limiter.try_acquire().is_some());
        drop(second);
    }

    #[test]
    fn limiter_holds_under_simultaneous_pressure() {
        let limiter = Arc::new(InvocationLimiter::new(2));
        let acquired = Arc::new(Barrier::new(3));
        let release = Arc::new(Barrier::new(3));
        let workers: Vec<_> = (0..2)
            .map(|_| {
                let limiter = Arc::clone(&limiter);
                let acquired = Arc::clone(&acquired);
                let release = Arc::clone(&release);
                std::thread::spawn(move || {
                    let _permit = limiter.try_acquire().expect("worker permit");
                    acquired.wait();
                    release.wait();
                })
            })
            .collect();

        acquired.wait();
        assert!(limiter.try_acquire().is_none());
        assert_eq!(limiter.active(), 2);
        release.wait();
        for worker in workers {
            worker.join().expect("worker completed");
        }
        assert_eq!(limiter.active(), 0);
        assert!(limiter.try_acquire().is_some());
    }

    #[test]
    fn environment_poisoning_is_removed_before_spawn() {
        let root = Path::new("/tmp");
        let temp_dir = Path::new("/tmp/radcontrol-private-fixture");
        let mut command = Command::new("/usr/bin/env");
        command
            .env("PATH", "/tmp/evil")
            .env("LD_PRELOAD", "/tmp/evil.so")
            .env("PYTHONPATH", "/tmp/evil-python")
            .env("NODE_OPTIONS", "--require=/tmp/evil.js")
            .env("GIT_DIR", "/tmp/evil-git")
            .env("O2_ROOT", "/tmp/evil-o2");
        apply_child_environment(&mut command, root, temp_dir, None);
        let output = command.output().expect("run canonical env utility");
        assert!(output.status.success());
        let environment = String::from_utf8(output.stdout).expect("UTF-8 environment");
        assert!(environment.contains(&format!("PATH={SAFE_PATH}")));
        assert!(environment.contains("O2_ROOT=/tmp"));
        assert!(environment.contains("HOME=/home/chris"));
        assert!(environment.contains("TMPDIR=/tmp/radcontrol-private-fixture"));
        for forbidden in [
            "SHELL=",
            "LD_PRELOAD=",
            "PYTHONPATH=",
            "NODE_OPTIONS=",
            "GIT_DIR=",
        ] {
            assert!(!environment.contains(forbidden), "found {forbidden}");
        }
    }

    #[test]
    fn bounded_process_reports_success_and_nonzero_exit_truthfully() {
        let success = run_bounded(
            fixture_command("success", "printf 'ready\\n'"),
            None,
            limits(500, 1024, 1024),
        );
        assert_eq!(success.failure, None);
        assert_eq!(success.code, 0);
        assert_eq!(success.stdout, "ready\n");

        let failure = run_bounded(
            fixture_command("nonzero", "printf 'specific failure\\n' >&2; exit 23"),
            None,
            limits(500, 1024, 1024),
        );
        assert_eq!(failure.failure, None);
        assert_eq!(failure.code, 23);
        assert_eq!(failure.stderr, "specific failure\n");

        let missing = run_bounded(
            Command::new("/definitely/missing/radcontrol-fixture"),
            None,
            limits(500, 1024, 1024),
        );
        assert_eq!(missing.failure, Some(ProcessFailure::Spawn));
        assert!(missing.stderr.contains("failed to spawn"));
    }

    #[test]
    fn stdin_is_closed_for_zero_normal_and_exact_limit_payloads() {
        for (name, payload) in [
            ("zero", Vec::new()),
            ("normal", b"governed-input".to_vec()),
            ("exact", vec![b'x'; 1024 * 1024]),
        ] {
            let outcome = run_bounded(
                fixture_command(name, "wc -c"),
                Some(payload.clone()),
                limits(1500, 1024, 1024),
            );
            assert_eq!(outcome.failure, None, "{name}: {}", outcome.stderr);
            assert_eq!(outcome.code, 0);
            assert_eq!(outcome.stdout.trim(), payload.len().to_string());
        }
    }

    #[test]
    fn timeout_and_blocked_stdin_terminate_the_process_group() {
        let outcome = run_bounded(
            fixture_command("blocked-stdin", "sleep 60"),
            Some(vec![b'x'; 1024 * 1024]),
            limits(100, 1024, 1024),
        );
        assert_eq!(outcome.failure, Some(ProcessFailure::Timeout));
        assert!(outcome.stderr.contains("timed out"));
        assert!(outcome.duration < Duration::from_secs(2));
    }

    #[test]
    fn broken_stdin_is_a_specific_failure() {
        let outcome = run_bounded(
            fixture_command("broken-stdin", "exec 0<&-; sleep 1"),
            Some(vec![b'x'; 1024 * 1024]),
            limits(1500, 1024, 1024),
        );
        assert_eq!(outcome.failure, Some(ProcessFailure::Stdin));
        assert!(outcome.stderr.contains("stdin payload"));
    }

    #[test]
    fn stdout_and_stderr_limits_fail_without_unbounded_capture() {
        let stdout = run_bounded(
            fixture_command("stdout-limit", "/usr/bin/head -c 4096 /dev/zero"),
            None,
            limits(500, 1024, 1024),
        );
        assert_eq!(stdout.failure, Some(ProcessFailure::StdoutLimit));
        assert!(stdout.stdout.len() <= 1024);

        let stderr = run_bounded(
            fixture_command("stderr-limit", "/usr/bin/head -c 4096 /dev/zero >&2"),
            None,
            limits(500, 1024, 1024),
        );
        assert_eq!(stderr.failure, Some(ProcessFailure::StderrLimit));
        assert!(stderr.stderr.len() <= 2048);
    }

    #[test]
    fn descendant_cannot_hold_the_invocation_open() {
        let outcome = run_bounded(
            fixture_command(
                "descendant",
                "sleep 60 & child=$!; printf '%s\\n' \"$child\"",
            ),
            None,
            limits(1000, 1024, 1024),
        );
        assert_eq!(outcome.failure, Some(ProcessFailure::Wait));
        let pid = outcome
            .stdout
            .trim()
            .parse::<u32>()
            .expect("descendant pid");
        assert!(process_disappears_within(pid, Duration::from_secs(1)));
    }
}
