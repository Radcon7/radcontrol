# RadControl - Repo State

Purpose: RadControl is the desktop command center for Rad Empire. It renders governed state, dispatches constrained O2 actions, and keeps operator workflows visible without becoming a second operational authority.

## Authority boundary

- RadControl owns React/Tauri presentation, UI composition, local ephemeral view state, and the constrained bridge to O2.
- O2 owns registry truth, runtime and port contracts, project formation/bootstrap, durable documents, governed notes, and filesystem mutation.
- Project repos own their product behavior, application UI, data model, and repo-specific deployment rules.
- RadControl does not contain DQOTD, TBIS, Offroad, or other project business logic.

## Current surfaces

- Projects: governed registry, runtime controls, project evidence, notes, and a
  capability-driven formation/bootstrap entry backed by O2 Modern Web
  Foundation v1. The selected website shape records an explicit repository
  archetype before bootstrap. RadControl captures answers; O2 owns the durable
  dossier, archetype definitions, and tailored repo-local blueprint.
  New Project intentionally presents many visible yes/no decisions, select
  controls, option boxes, architecture questions, and capability choices. O2
  or Codex may infer and recommend answers, but those recommendations assist
  rather than replace the explicit decisions Chris can inspect and control.
  Do not reduce this surface to an opaque AI-only prompt or minimal hidden
  wizard without a later explicit product decision. This is RadControl product
  behavior, not an Empire-wide form-design standard.
- Infrastructure: governed provider/platform assets, editable non-secret
  configuration notes, actions, and operational notes. The canonical
  `system76-workstation` record is deliberately excluded from this roster;
  computer identity, health, monitoring, maintenance inventory, and operator
  notes belong to Security's Host Guardian. Other infrastructure assets retain
  the existing roster/detail workflow.
- Agents: governed profiles, focus/scope/limits, and notes. Repository Routers
  is an adjacent O2-backed workspace that restores the cross-repository
  durability report without coupling it to the System76 host presentation.
- Security: the sole Radcon Sentinel command surface over O2-owned Host Guardian and
  Security Guardian observation, capability, trigger, event, incident, action,
  baseline, and hash-chained audit records. Sentinel never owns policy or a
  privileged executor; Phase 1 offers only manual read-only Level-0 controls,
  while Levels 1-5 remain visibly not activated. Host Guardian reuses the
  canonical O2 workstation configuration and note paths rather than cloning
  workstation state into RadControl. Security also contains the restored
  Empire Operations artifact workspace for governed Empire Map, Snapshot, and
  Empire Sweep reports; this does not recreate an Empire Utility destination.
- Notes and Legal: O2-backed authored document libraries and timeline records.
  Notes also includes an O2-backed structured Empire To-Do workspace whose
  editable records live at `docs/radcontrol/empire_todo/items.json` in O2. Its
  control appears immediately after Empire Blueprint and opens the persistent
  two-pane roadmap.

## Persistence and execution

- Durable writes use O2 file or producer verbs; React/local storage is not document truth.
- Empire To-Do writes use the validated O2 `empire.todo.save` payload route;
  Sentinel runtime state and audit use the O2 Sentinel contract rather than
  browser storage or RadControl-owned files.
- The Tauri bridge exposes an allowlist of O2 actions rather than arbitrary shell or filesystem access.
- Frontend O2 compatibility, invocation, payload encoding, and command errors
  have one boundary in `src/components/common/o2Client.ts`; domain-specific
  file-not-found handling remains in `o2Files.ts`.
- The project registry projection is strict and archetype-driven. Malformed,
  legacy-shaped, unknown-archetype, unavailable-root, or incomplete
  runtime-status responses are visible failures, not empty collections or
  guessed state. `registry/projects.json` remains the sole representation of a
  project's root and assigned archetype; RadControl owns only the local
  archetype-to-operator-visibility rule.
- Generated snapshots and reports are evidence, not authority and not implicit Git actions.
- The packaged production app reads O2 from the dedicated, same-repository
  `main` worktree at `~/.local/share/radcontrol/o2-runtime`. This stable runtime
  and data root is independent of an operator's active O2 feature branch and
  current working directory. Debug builds continue to use `~/dev/o2`; only
  explicit E2E mode may override `O2_ROOT` with an absolute fixture path.
- The normal desktop entry executes `~/.local/bin/radcontrol-launch.sh`, which
  directly replaces itself with `~/.local/bin/radcontrol-app`. It must not call
  Vite, preview, Tauri dev, WebDriver, or any O2 development launcher and must
  not bind a TCP listener.
- Runtime identity is visible from the header's Runtime control and includes
  the app version, embedded source commit, build time, installed executable,
  canonical O2 root and commit, governed paths, and live content checks.
- Data request failure, loading, and genuine zero-result states are distinct.
  Compatibility or read failures must remain visible and must not be rendered
  as an empty governed collection.
- `scripts/snapshot_repo_state.sh` produces `docs/_repo_snapshot.txt` without operational side effects.
- RadControl must not be launched through localhost, Vite dev or preview,
  Tauri dev, desktop E2E, or another TCP-listening route unless the current
  task explicitly authorizes that launch. Implementation, build, publication,
  or merge authorization alone does not grant launch authorization.
- Before an authorized E2E or launch, inspect its harness, record the listener
  baseline, and verify that no new listener remains afterward. Preserve any
  pre-existing listener unless separately authorized to change it. Contract
  tests, lint, non-launching production builds, Rust checks, audits, and
  deterministic snapshots remain the default verification path.
- A project launch opens a nonce-bearing final browser route only after its O2
  start succeeds. Embedded projects also restart their registered portal host;
  a raw listener on that port is not treated as proof of the correct host.

## Verification

Use the impact-appropriate subset of:

- `npm run lint`
- `npm run test:contracts`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run verify:production-delivery`
- focused architecture/contract tests
- explicitly launch-authorized `npm run test:tauri-e2e` for native workflow
  changes; never run it under ordinary verification authorization

The accepted Phase 1 feature disposition is recorded in
`docs/SENTINEL_PHASE1_MIGRATION.md`; that manifest is migration evidence, not a
second source of current product authority.

## Content preservation

RadControl surface replacement is selective, not destructive simplification.
Before a broad consolidation, compare the pre-change visible product from Git
history, classify every removed capability, and preserve unrelated registered
Projects, Infrastructure entries, Notes modes, primary destinations, and
operational/reference tools. A specifically authorized asset removal or tab
replacement does not authorize collateral content loss. The recovery baseline
and acceptance matrix live in `docs/RADCONTROL_CONTENT_PRESERVATION.json` and
are enforced by the content-preservation tests.
