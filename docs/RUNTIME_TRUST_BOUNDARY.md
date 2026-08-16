# RadControl Runtime Trust Boundary

Status: Active implementation authority
Scope: RadControl frontend to Tauri/Rust to O2 runtime execution
Owner: RadControl (bridge) and O2 (dispatcher/audit transport)
Reviewed: 2026-08-16
Next review: before Round 5B implementation or 2026-11-16, whichever comes first

## Purpose and authority

RadControl owns this bridge implementation and its product-facing failure
contract. O2 owns the dispatcher, registered project/resource identity,
governed operations, and durable state. This boundary does not grant the
frontend arbitrary process, shell, environment, repository-path, or filesystem
authority.

This threat model was written against O2 commit
`c7ec863831c6cf062c4d1af7313f8c97aacf6132` and RadControl commit
`178f222475b4900e57da979afbac61303c7e4c12` before Round 5A implementation.

## Threat model

| Threat | Current defense at the golden baseline | Remaining exposure | Round 5A defense | Deterministic test |
| --- | --- | --- | --- | --- |
| Compromised frontend JavaScript | Four Tauri commands and one scoped URL capability; no shell/filesystem plugin | It can repeatedly invoke every allowed bridge operation | Global process ceiling, typed busy failure, fixed action classes, request IDs and privileged-operation audit | Saturate the ceiling and verify rejection plus recovery |
| Malformed frontend parameters | Verb allowlist and O2 validators | Prefix matching accepts malformed suffixes; errors are strings | Closed verb parser, byte limit, strict base64url shape, JSON-object validation for stdin | Empty, malformed, path-like, Unicode and oversized requests |
| Accidental agent invocation loops | UI-local busy flags and some in-flight reuse | Independent components can still spawn concurrently | Rust-wide ceiling plus port-refresh coalescing; self-runtime lifecycle is denied | Concurrent and repeated-call tests |
| Malicious project/action identifiers | Project action syntax and O2 registry lookup | Generic strings reach O2 before all semantic checks | Closed project-action enum and lowercase project-key grammar; O2 resolves exact registered row | Unknown key, unknown action, traversal and absolute-path forms |
| Malformed or hostile O2 output | Domain parsers reject known bad envelopes | Rust buffers without a ceiling; JSON depth/size is not checked first | Independent output ceilings and frontend size/depth validation before JSON parsing | Invalid, incomplete, double-encoded, deeply nested and oversized output |
| O2 subprocess hangs | None | A call can run forever | 20/60/120 second execution classes with deterministic fixture overrides | Fixture that never exits |
| Extreme stdout/stderr | None | `output()` and `wait_with_output()` accumulate without bound | 4 MiB stdout, 512 KiB stderr; limit breach terminates the lineage and fails typed | Separate stdout and stderr flood fixtures |
| Oversized stdin | 1 MiB frontend and Rust check | Write can block; JSON validity is not checked in Rust | Exact byte check, JSON-object validation, concurrent writer, closed stdin | Zero, normal, exact limit, limit plus one and non-consuming child |
| Excessive concurrent O2 children | Component-local flags only | Calls from different surfaces are unbounded | Four active invocations maximum; excess is rejected as `CONCURRENCY_LIMIT` | Pressure, saturation recovery and active-count assertions |
| Unexpected environment variables | `O2_ROOT` is overwritten for the child | Most parent variables are inherited | Intentional clean environment with only documented canonical values | Child prints its effective environment |
| Manipulated `PATH` | None | `bash`, `git`, Python and O2 tools resolve through ambient `PATH` | `/usr/bin/bash` and `/usr/bin/git`; fixed system-only child `PATH` | Poisoned executable directory cannot intercept execution |
| Loader/module option poisoning | None | `LD_*`, Python, Node and npm options are inherited | Clear environment; do not pass loader/module/runtime option variables | Poisoned variables are absent in fixture output |
| Repository-root replacement | Production/debug paths are product-fixed except E2E | `HOME` chooses the root and paths are not canonicalized before spawn | Fixed `/home/chris` packaging root; canonical non-symlink root, dispatcher and registry checks | HOME/O2_ROOT poisoning, missing/replaced dispatcher and root tests |
| Symlink/path traversal | File verbs resolve beneath O2 `docs/` | Registered repo roots are not centrally constrained for every project action | O2 requires canonical non-symlink repository roots beneath the governed development topology | Symlink escape and out-of-topology registry fixtures |
| Repository deleted after validation | Individual O2 scripts generally check existence | A race can still remove it between checks and use | Validate per invocation/action and fail explicitly; no fallback path | Missing and removed-root fixtures |
| Executable replacement | Dispatcher path is fixed relative to the selected root | `bash` is ambient and dispatcher symlinks are accepted | Canonical `/usr/bin/bash`; dispatcher must be a regular non-symlink file under the validated root | Symlinked and missing dispatcher fixtures |
| Shell metacharacter/argument injection | Verb is one process argument; no `bash -c` in Rust | O2 static-site launch contains registry-derived `bash -lc` text | Preserve discrete argv and remove that registry-derived shell string | Metacharacter verbs/paths and static-launch source/behavior tests |
| Process-tree cleanup failure | Failed stdin kills only the immediate child | Timeout does not exist; descendants can survive | Dedicated process group, bounded TERM/KILL cleanup, active-group shutdown hook, O2 lifecycle TERM cleanup | Hanging child and descendant PID disappearance |
| Child survives RadControl exit | None | Normal application shutdown can leave active calls | Track only process groups created by the bridge and terminate them on normal Tauri exit | Explicit active-lineage cleanup test |
| Sensitive data in logs/errors | Payload is not logged by the frontend | Raw output is unbounded and audit design is absent | Bounded diagnostics; audit metadata excludes payload and environment values | Secret-marker payload is absent from audit record |
| Allowed operation becomes general execution | Finite top-level allowlist and O2 dispatcher | Broad prefixes and generic action strings are brittle | Typed operation classification, exact stdin map, finite project action enum, registry resolution | Deny arbitrary shell, executable, environment, path and unsupported verbs |

## Exposed Tauri commands

| Command | Caller | Purpose | Inputs | Effect | Authority and validation |
| --- | --- | --- | --- | --- | --- |
| `run_o2` | `o2Client.ts` and product API wrappers | Invoke a finite O2 verb | One verb string | Read-only, mutating or privileged depending on the classified operation | Rust closed parser, bounded supervisor, then canonical O2 dispatcher and O2 validators |
| `run_o2_payload` | `o2Client.ts` only | Carry large document or To-Do JSON over stdin | Exact payload operation plus JSON string | Mutating | Two exact mappings, 1 MiB limit, JSON-object validation, closed stdin and O2 validation |
| `runtime_diagnostics` | Runtime header/modal | Show installed app and O2 identity | None | Read-only | Fixed paths and bounded canonical Git inspection; no frontend-selected argv |
| `e2e_project_roots` | App initialization in the opt-in desktop harness | Supply isolated formation roots | None; reads E2E-only process state | Read-only | Returns nothing outside explicit E2E mode; canonical absolute fixture home only |

No command accepts an executable, shell, environment map, working directory,
repository path, or arbitrary filesystem target from the frontend.

## Tauri capabilities

| Permission | Consumer and purpose | Scope | Compromised-frontend consequence | Decision |
| --- | --- | --- | --- | --- |
| `core:default` | Main-window lifecycle and IPC required by Tauri | Main window only | Finite Tauri core defaults; no shell or filesystem permission | Retain |
| `opener:allow-open-url` | Project localhost/operator URLs and registered public website URLs | `https://*`, `http://127.0.0.1:*`, `http://localhost:*` | Can open an arbitrary HTTPS or loopback URL, but not a file, shell, program path, or custom scheme | Retain as the minimum current product scope; revisit registry-bound opening in Round 5C |

No shell, filesystem, reveal, clipboard, process, or unrestricted opener
permission is enabled.

## Process envelope

- Read/status operations: 20 seconds.
- Bounded mutations and privileged observations: 60 seconds.
- Lifecycle, formation/bootstrap, deep observation, and report generation: 120 seconds.
- Standard output: 4 MiB maximum.
- Standard error: 512 KiB maximum.
- Failure diagnostic returned after any bridge-supervision failure: at most 16 KiB per stream.
- Standard input: 1 MiB maximum, measured as UTF-8 bytes.
- Verb transport: 256 KiB maximum, measured as UTF-8 bytes.
- Concurrent governed invocations: four; excess calls fail busy and are not queued.
- Cleanup: a new process group per invocation, TERM followed by a 1.5 second
  grace period and KILL, plus cleanup of active groups during normal app exit.

The limits are implementation constants and regression-tested. Tests use
short injected time budgets; production limits are not weakened for test speed.

## Child environment contract

| Class | Variables | Reason |
| --- | --- | --- |
| Required/overridden | `HOME=/home/chris`, `O2_ROOT=<validated root>`, `PWD=<validated root>` | Preserve the current single-user packaging contract and pin O2 identity |
| Required/overridden | `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` | Provide the known system toolchain without ambient path injection |
| Required/overridden | `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`, `TMPDIR=/tmp`, `TERM=dumb`, `NO_COLOR=1` | Deterministic text, temporary-file and noninteractive behavior |
| E2E-only | `RADCONTROL_E2E=1`, canonical `O2_E2E_HOME` | Preserve the explicitly isolated harness; never accepted in production/debug |
| Removed | `SHELL`, `CDPATH`, `BASH_ENV`, `ENV`, `PROMPT_COMMAND` | Prevent shell startup/path influence |
| Removed | `LD_PRELOAD`, `LD_LIBRARY_PATH` and other `LD_*` | Prevent loader influence |
| Removed | `PYTHONPATH`, `PYTHONHOME`, `PYTHONSTARTUP`, `PYTHONINSPECT` | Prevent Python module/startup influence |
| Removed | `NODE_OPTIONS`, `NODE_PATH`, npm lifecycle/config variables | Prevent Node/npm module and execution-option influence |
| Removed | `GIT_DIR`, `GIT_WORK_TREE`, `GIT_CONFIG*`, `GIT_SSH*`, `GIT_ASKPASS` | Prevent Git repository/config/helper redirection |
| Removed | `SSH_AUTH_SOCK`, `DOCKER_HOST`, proxy and provider variables | No exposed operation requires remote credentials or remote daemon selection |
| Removed | all other ambient variables | The allowed O2 bridge does not require them; complete gates prove compatibility |

The `/home/chris` packaging identity is intentional in Round 5A. General
multi-user portability is a Round 5B concern, not an excuse to trust ambient
`HOME` now.

## Filesystem and symlink policy

The frontend supplies project keys, never paths. O2 resolves a key through its
single canonical registry. A repository execution root must be absolute,
lexically canonical, beneath the canonical development topology, and not a
symlink. The registered repository directory itself may not traverse symlinked
components. Symlinks inside a repository are not categorically forbidden;
operation-specific containment still governs any path they touch. O2 document
operations remain confined to the canonical O2 `docs/` tree and reject symlink
escape.

Same-user replacement between final validation and kernel path lookup cannot be
eliminated by string validation. Round 5A minimizes that window and fails on
observable replacement; descriptor-pinned execution or a separately installed
service boundary belongs to Round 5B if the local same-user attacker model is
expanded.

## Audit foundation

Mutating and privileged bridge operations append an O2-owned, hash-chained JSON
Lines record under `.state/radcontrol-runtime/`. Each record contains timestamp,
operation class, governed target, fixed caller class, success/failure,
failure category, duration and request ID. It never records request payloads,
environment values, stdout or stderr. A successful privileged operation whose
audit append fails is reported as `AUDIT_FAILURE` rather than unaudited success.

This is a local execution audit foundation, not a SOC, Guardian, autonomous
remediation, provider-monitoring or immutable-log system.

## Maximum compromised-frontend authority

A fully attacker-controlled frontend can invoke only the finite Tauri commands,
HTTP(S) URL opener scope, and governed O2 operations listed above. O2 operations
remain restricted to registry-resolved resources and O2-owned document paths,
with bounded request size, runtime, output, concurrency, environment and process
cleanup. It cannot select a shell, executable, script, environment, working
directory, repository path or arbitrary filesystem target. It can still cause
the intended finite mutations and start/stop registered project runtimes; those
are real product authorities, now bounded and audited rather than harmless.

## Residual risks and follow-up ownership

| Classification | Residual risk | Owner | Trigger or review condition |
| --- | --- | --- | --- |
| Round 5B | A hostile same-user process can race validated pathname components between validation and kernel lookup. Process groups cannot contain a descendant that deliberately creates a new session; O2's known detached lifecycle path instead has targeted PID cleanup. | RadControl runtime + O2 execution | Evaluate descriptor-pinned execution, a dedicated service boundary, or cgroup/session containment before expanding the local attacker model or adding a new detached operation. |
| Round 5B | The fixed `/home/chris` runtime identity is secure against ambient `HOME` poisoning but is not multi-user portable. | RadControl packaging | Replace only alongside a reviewed installer/runtime identity contract. |
| Round 5C | The retained opener permission lets compromised frontend code open arbitrary HTTPS and loopback HTTP URLs, though not files, programs, shells, or custom schemes. | RadControl product/capability policy | Reassess registry-bound URL opening before broadening URL schemes or introducing remote operator actions. |
| Round 5C | The local hash chain makes accidental removal/reordering visible but is not immutable against the same workstation user. | O2 audit policy | Define retention, external anchoring, and operator review only if the audit becomes compliance or incident-response evidence. |
| Round 5D | Native installed-app and abrupt-app-exit adversarial tests were not run because this round did not authorize launching a second app/runtime/listener. Deterministic Rust subprocess fixtures cover the supervisor without launching RadControl. | Release verification | Run the bounded native acceptance procedure only under explicit launch authorization and preserve the listener/runtime baseline. |
| Accepted design risk | Tauri materializes command strings before the Rust handler can enforce its byte ceilings. A compromised renderer can still denial-of-service its own application process; the implemented limits prevent oversized input from reaching O2 but do not claim availability against a fully hostile renderer. | RadControl/Tauri boundary | Revisit only if Tauri exposes a practical pre-deserialization IPC quota or the local availability threat model expands. |

Round 5A adds no schema or migration, no provider authority, no autonomous
remediation, and no Guardian/SOC capability.
