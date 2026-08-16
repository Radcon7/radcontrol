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
- **Notes**: authored notes, timeline, Empire Blueprint, then the persistent
  Empire To-Do workspace as adjacent first-class controls.
- **Legal**: legal notes, documents, and entity structure records.

## Runtime Model

The desktop app invokes the Tauri command `run_o2` with a constrained verb
allowlist. The installed production app calls
`~/.local/share/radcontrol/o2-runtime/scripts/run_o2.sh`; that path is a
dedicated worktree of the canonical O2 repository on current `main`, so the
live product is independent of an operator's active feature branch and working
directory. Debug builds use `~/dev/o2`, and only explicit E2E mode accepts an
absolute fixture `O2_ROOT`. RadControl does not own shell execution, arbitrary
filesystem access, Git commits, or project-formation policy.

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

`BUILD PROJECT` records the governed intake in O2, then bootstraps the approved local starter repository. The form defaults to O2 Modern Web Foundation v1, captures compact capability decisions, and may name an additional real project as reference evidence. The formation record is durable under `docs/project-formation/records/<project>/`; repo-local intake and project-blueprint documents are created during bootstrap.

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
cargo test --manifest-path src-tauri/Cargo.toml
bash scripts/snapshot_repo_state.sh --check
```

## Desktop E2E

The real desktop test exercises tab switching, submits `BUILD PROJECT` into a temporary governed root, verifies the resulting starter and formation dossier, autosaves a fixture note, and runs the temporary fixture lifecycle. It is opt-in because it launches a native desktop session.

Do not run this E2E, `npm run dev`, `npm run preview`, `npm run tauri:dev`, or
another RadControl/localhost listener unless the current task explicitly
authorizes that launch. The E2E starts `tauri-driver`, WebDriver TCP listeners,
the native RadControl app, and a temporary fixture runtime. Ordinary build or
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

The E2E harness copies only O2 scripts into a temporary root, creates a temporary static fixture and a temporary submitted project starter, then removes all fixture/runtime/root data in `finally`. It does not modify the real O2 registry, notes, or project repos.
The `O2_ROOT` override and duplicate-instance bypass are accepted only while
`RADCONTROL_E2E=1`; normal desktop launches use the production O2 worktree at
`~/.local/share/radcontrol/o2-runtime`.

The test uses the official `tauri-driver` executable and, when explicitly
authorized, must leave its app, driver, and fixture listeners stopped with the
fixture's original note restored.
