# RadControl

RadControl is the Rad Empire desktop control panel. It is a thin Tauri and React UI over O2; it presents governed state and dispatches only allowed O2 actions.

## Authority

RadControl owns UI layout, local presentation state, document viewing and editing, and Tauri bridge calls. O2 owns registry truth, lifecycle and port contracts, project formation/bootstrap, durable documents, and governed filesystem mutations. Repo-local documentation remains primary when working inside a project repository.

## Current Surfaces

- **Projects**: governed project registry, runtime controls, repo snapshots/maps, original formation requests when available, and New Project.
- **Infrastructure**: governed provider and platform assets and notes. The
  canonical workstation record is intentionally presented through Security's
  Host Guardian rather than as a duplicate Infrastructure destination.
- **Agents**: governed agent roster, attributes, scopes, and notes, plus the
  restored repository-router durability workspace backed by O2 `router.health`.
- **Security**: the sole Radcon Sentinel destination, with governed Host
  Guardian and Security Guardian observation, truthful evidence status,
  recent activity, the capability ladder, triggers, workstation records, and
  audit state. Its adjacent Empire Operations workspace preserves Empire Map,
  Snapshot, and Empire Sweep artifact history and governed report controls
  without restoring a separate Empire Utility tab. Phase 1 exposes read-only
  Level-0 Sentinel checks only.
- **Notes**: My Notes (operator-authored scratchpad documents), Timeline, the
  living Empire Blueprint, a read-only O2 Knowledge workspace, then the
  persistent Empire To-Do workspace. O2 Knowledge projects canonical sources;
  it is not a second knowledge database.
- **Legal**: legal notes, documents, and entity structure records.

## Runtime Model

The desktop app invokes the Tauri command `run_o2` with a constrained verb
allowlist. The bridge applies fixed executables and environment, per-operation
timeouts, bounded stdin/stdout/stderr, a four-process ceiling, process-group
cleanup, typed failures, and O2-owned audit records for mutations and privileged
operations. Child output is structurally redacted before IPC, and child temp
files are directed to a validated private O2 runtime directory. The complete
bridge threat model and limits are in
[`docs/RUNTIME_TRUST_BOUNDARY.md`](docs/RUNTIME_TRUST_BOUNDARY.md). The installed production app calls
`~/.local/share/radcontrol/o2-runtime/scripts/run_o2.sh`; that path is a
dedicated worktree of the canonical O2 repository pinned to the O2 commit that
matches the installed RadControl binary. The installed pair may intentionally
lag source `main` until native/install acceptance advances both halves together,
so the live product remains independent of active development branches and
working directories. Debug builds use `~/dev/o2`, and only explicit E2E mode accepts an
absolute fixture `O2_ROOT`. RadControl does not own shell execution, arbitrary
filesystem access, Git commits, or project-formation policy.

Browser launches also cross the Rust boundary. The renderer has no Tauri
opener capability: a backend command permits only the fixed provider consoles
and O2-registry-governed project URLs/loopback ports documented in
[`docs/RUNTIME_TRUST_BOUNDARY.md`](docs/RUNTIME_TRUST_BOUNDARY.md).

Source-to-artifact controls, exact toolchains, reviewed Action pins,
dependency evidence, non-deploying release candidates, provenance, external
audit anchors, and the 5D release boundary are defined in
[`docs/SUPPLY_CHAIN.md`](docs/SUPPLY_CHAIN.md).

O2's Local Filesystem and Credential Boundary v1 owns the shared secret and
credential rule: configuration may point to an external credential mechanism,
but neither O2 nor RadControl becomes the credential store. The current desktop
uses the user account as its security boundary; same-UID malicious software is
not contained and privilege separation remains future Guardian/provider work.

`src/components/common/o2Client.ts` is the single frontend compatibility,
invocation, payload, and command-error boundary. File semantics remain in
`o2Files.ts`. The Projects surface accepts only O2's versioned
`{ ok: true, projects: [] }` response, requires each row's canonical
archetype, repository root, and root-availability signal, and reports malformed
registry or port responses as failures rather than silently converting them
into empty, stopped, healthy, or valid state. O2 `registry/projects.json` is the
single representation of each project's identity, repository root, and assigned
archetype. RadControl's product-local visibility rule consumes that archetype;
it is not an O2 product-presentation rule.

The normal desktop entry calls `~/.local/bin/radcontrol-launch.sh`, which
directly executes the installed `~/.local/bin/radcontrol-app` release binary.
It does not start Vite, preview, Tauri dev, WebDriver, or a TCP listener. The
header Runtime control shows the exact app/O2 build identity and live content
checks; data failures are reported as unavailable rather than as empty state.

## New Project

New Project captures explicit purpose, users or operators, problem, value,
success, constraints, placement, and capability decisions. `REVIEW PROJECT`
calls O2's read-only canonical Project Intent projection and displays its exact
eight sections with project identity. The operator may return to editing.
`BUILD PROJECT` submits the reviewed projection digest, records the governed
intake in O2, and then bootstraps the approved local starter repository. The
form defaults to O2 Modern Web Foundation v1 and may name an additional real
project as reference evidence. The formation record is durable under
`docs/project-formation/records/<project>/`; repo-local intake and project-
blueprint documents are created during bootstrap.

Governed Infrastructure identity is stored once in O2 under
`docs/infrastructure/records/<asset>/01_inventory.json`, with durable notes under
`docs/infrastructure/assets/<asset>/`. RadControl's built-in Infrastructure
profiles are presentation templates, not a second identity registry; new asset
records appear without adding a copied product constant.

## Development Checks

```bash
npm run lint
npm run test:contracts
npm run verify:production-delivery
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
bash scripts/snapshot_repo_state.sh --check
```

## Native acceptance

Native acceptance is intentionally split into two classes:

- `npm run test:tauri-production-readonly -- --expected-o2-sha <sha> --expected-radcontrol-sha <sha> --expected-artifact-sha <sha>` runs the exact production artifact. It mounts installed O2 read-only, replaces `.state` with a test-owned overlay, records installed Git/To-Do/listener evidence, exercises only read paths, and proves installed state is unchanged afterward.
- `npm run test:tauri-e2e` builds a debug/test-capable native artifact and exercises persistence only after canonical fixture, home/state, seed, installed-cleanliness, and in-app runtime-identity checks succeed.

The writable desktop test exercises tab switching, submits `BUILD PROJECT` into a temporary governed root, verifies the resulting starter and formation dossier, and autosaves deterministic fixture records. It is opt-in because it launches a native desktop session. Project runtime lifecycle is a separate product/runtime concern and is not part of this isolation-focused acceptance class.

Do not run this E2E, `npm run dev`, `npm run preview`, `npm run tauri:dev`, or
another RadControl/localhost listener unless the current task explicitly
authorizes that launch. The E2E starts `tauri-driver`, WebDriver TCP listeners,
and the native RadControl app. Ordinary build or
test authorization is not sufficient. The non-server checks above remain the
default verification route.

Linux prerequisite, once per machine:

```bash
sudo apt-get install webkit2gtk-driver
```

Then run:

```bash
npm run test:tauri-e2e
```

The writable E2E harness copies only O2 scripts and deterministic seeds into a temporary root, creates a temporary static fixture and a temporary submitted project starter, then removes all fixture/runtime/root data in `finally`. Installed and development O2 are read-only in its mount namespace. It aborts before launch for missing, overlapping, or symlinked fixture paths, and aborts before the first edit when the app does not attest the exact fixture root.
The `O2_ROOT` override and duplicate-instance bypass are accepted only while
`RADCONTROL_E2E=1`; normal desktop launches use the production O2 worktree at
`~/.local/share/radcontrol/o2-runtime`.

Both tests use the official `tauri-driver` executable and, when explicitly
authorized, must leave their app, driver, and fixture listeners stopped. Port
1420 must remain free. The writable test proves fixture-only persistence; the
production test proves installed O2 cleanliness and Empire To-Do hash integrity.
