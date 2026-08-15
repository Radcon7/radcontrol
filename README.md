# RadControl

RadControl is the Rad Empire desktop control panel. It is a thin Tauri and React UI over O2; it presents governed state and dispatches only allowed O2 actions.

## Authority

RadControl owns UI layout, local presentation state, document viewing and editing, and Tauri bridge calls. O2 owns registry truth, lifecycle and port contracts, project formation/bootstrap, durable documents, and governed filesystem mutations. Repo-local documentation remains primary when working inside a project repository.

## Current Surfaces

- **Projects**: governed project registry, runtime controls, repo snapshots/maps, original formation requests when available, and New Project.
- **Infrastructure**: governed provider and platform assets and notes. The
  canonical workstation record is intentionally presented through Security's
  Host Guardian rather than as a duplicate Infrastructure destination.
- **Agents**: governed agent roster, attributes, scopes, and notes.
- **Security**: the sole Radcon Sentinel destination, with governed Host
  Guardian and Security Guardian observation, truthful evidence status,
  recent activity, the capability ladder, triggers, workstation records, and
  audit state. Phase 1 exposes read-only Level-0 checks only.
- **Notes**: authored notes, timeline, Empire Blueprint, then the persistent
  Empire To-Do workspace as adjacent first-class controls.
- **Legal**: legal notes, documents, and entity structure records.

## Runtime Model

The desktop app invokes the Tauri command `run_o2`, which calls `~/dev/o2/scripts/run_o2.sh` with a constrained verb allowlist. RadControl does not own shell execution, arbitrary filesystem access, Git commits, or project-formation policy.

## New Project

`BUILD PROJECT` records the governed intake in O2, then bootstraps the approved local starter repository. The form defaults to O2 Modern Web Foundation v1, captures compact capability decisions, and may name an additional real project as reference evidence. The formation record is durable under `docs/project-formation/records/<project>/`; repo-local intake and project-blueprint documents are created during bootstrap.

## Development Checks

```bash
npm run lint
npm run verify:security
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
bash scripts/snapshot_repo_state.sh
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
The `O2_ROOT` override and duplicate-instance bypass are accepted only while `RADCONTROL_E2E=1`; normal desktop launches use the canonical `~/dev/o2` root.

The test uses the official `tauri-driver` executable and, when explicitly
authorized, must leave its app, driver, and fixture listeners stopped with the
fixture's original note restored.
