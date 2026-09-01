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
  dossier, archetype definitions, canonical Project Intent projection, and
  tailored repo-local blueprint. Review displays O2's exact projection and
  identity; Back to Edit returns to the questionnaire; Build is available only
  from Review and binds the accepted projection digest before O2 writes.
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
- Security: three first-class workspaces over O2-owned truth, each explained in
  the compact Security navigation. Radcon Sentinel is this computer's control
  room; Empire Operations is development-system integrity; Security Guardian is
  the online technology estate. Security uses 14px-minimum supporting text,
  15–16px body and control text, 16px-minimum section headings, and approximately
  18–20px important values. Density comes from wide horizontal rows and
  hierarchy rather than small type or tall card grids. Every bounded child list
  leaves an inset outer-scroll gutter and does not trap overscroll.

  Radcon Sentinel presents health first, one token-free foreground measurement
  home second, bounded durable Guardian activity third, and Advanced System
  Information fourth.
  Its top answer distinguishes the latest durable result and its governed
  freshness from foreground measurements; missing or learning evidence does not
  make a recent durable result stale. O2 owns health severity and sensor
  authority, while RadControl presents baseline maturity only as secondary
  comparison metadata. The Sentinel order is fixed as “Is my computer okay?”,
  “Current Measurements”, “Recent Guardian Activity”, then “Advanced System
  Information”. The eight measurements and durable activity use compact wide
  rows rather than card grids. Activity is bounded to 20 durable records but initially shows a
  compact recent set; legacy records and retained Attention/UNKNOWN states must
  state exactly what evidence is absent. “Fans are loud” is one primary top-box
  workflow composed from the existing governed fan explanation, conditional
  deterministic deep check, exact Safe Cleanup preview/apply when eligible,
  remeasurement, and existing Sentinel event, action, incident, and remediation
  evidence. Routine runtime outcomes never append to tracked workstation source.
  It never broadens process or service authority. Other workstation symptoms
  remain reachable through one secondary chooser. Automatic Guardian has one
  compact authoritative control and one top status strip, rather than repeated
  status/control copies. Advanced information has exactly five full-width areas:
  System Evidence, Maintenance & Updates, Automation, Workstation Record &
  Notes, and Safety & Permissions. A manual Deep Check remains only within
  System Evidence; standalone Diagnostics and Quick Answers are intentionally
  removed. The tracked workstation configuration and notes remain readable
  canonical source references in the installed app; deliberate edits use the
  normal governed source workflow, while routine observations and operator
  actions stay in existing Sentinel history.
  Empire Operations combines deterministic matched-pair, automation, audit, and
  topology truth with governed Map, Snapshot, and Sweep artifacts in the same
  wide-row presentation system. Security Guardian owns websites and full
  technology-estate visibility, promotes the
  existing provider/site inventory, and labels unwired user/auth/threat/commerce
  sources and controls as not connected. Sentinel never owns policy or a
  privileged executor; only an explicit anomalous-observation investigation may
  invoke the read-only diagnostic advisor, and repair remains separately
  previewed and confirmed. Levels 1-5 remain visibly not activated. Host records
  and all durable Sentinel state remain O2-owned.
- Notes and Legal: Notes distinguishes My Notes (one private persistent O2
  runtime scratchpad, explicitly not Empire authority), Timeline, one living
  Empire Blueprint owner manual, read-only O2 Knowledge, and the O2-backed
  structured Empire To-Do workspace. My Notes use
  `.state/radcontrol-operator/my-notes.md`; Blueprint uses its single canonical
  `docs/radcontrol/empire_blueprint/empire_blueprint_20260822.md`; To-Do records
  live at `docs/radcontrol/empire_todo/items.json`. O2 Knowledge
  reads a deterministic O2 projection at request time and owns no RadControl
  knowledge cache, registry, or database. Legal is a six-view executive
  workspace over the single O2 portfolio blueprint: Structure is first and
  default, followed by Formation, Addresses & Agent, Brands & Ventures,
  Business Accounts, and Documents & Compliance. Its legal diagram keeps
  Radcon Enterprises and the separate RadWolfe partnership parallel, while a
  visually distinct portal panel explains least-privilege operating access as
  not ownership. Structure opens directly into a first-screen connected graph:
  Radcon Enterprises and RadWolfe are equal, parallel top-level lanes; solid
  wires denote ownership/containment, dashed wires denote Radcon support,
  service, and address relationships, and no ownership wire may cross between
  the two lanes. The smaller RCE access diagram remains below that graph and
  must never be mistaken for ownership. The three existing legal document libraries remain available
  as governed archive subviews inside Documents & Compliance rather than as
  competing top-level truth surfaces.

## Persistence and execution

- Durable writes use O2 file or producer verbs; React/local storage is not document truth.
  My Notes use a dedicated private O2 runtime producer and must survive source
  checkout plus matched-pair promotion, rollback, and reinstall without a commit.
  Blueprint is one intentionally edited O2 document, not a library; O2 Knowledge is
  read-only through `knowledge.operator_workspace`. Legal reads the validated
  O2 `docs/portfolio/PORTFOLIO_BLUEPRINT.json` projection. It owns no browser
  legal registry and preserves existing archive writes through O2 file verbs.
- Empire To-Do writes use the validated O2 `empire.todo.save` payload route;
  completion offers exactly one governed Timeline milestone or an explicit
  no-Timeline completion choice before marking the item complete.
  Sentinel runtime state and audit use the O2 Sentinel contract rather than
  browser storage or RadControl-owned files. Installed runtime actions never
  append routine history to tracked workstation documentation.
- The Tauri bridge exposes an allowlist of O2 actions rather than arbitrary
  shell or filesystem access. Its fixed executable/environment contract,
  resource limits, typed failures, process cleanup, audit behavior, and
  residual risks are governed by `docs/RUNTIME_TRUST_BOUNDARY.md`.
- The frontend has no raw opener capability. Browser destinations pass through
  Rust validation: exact fixed provider hosts, exact registered HTTPS project
  URLs, or canonical localhost/127.0.0.1 routes on a registry-declared port.
- CI/action pins, exact release toolchains, dependency evidence, compatibility
  pins, release-candidate manifests/external artifacts, and audit anchoring are
  governed by `docs/SUPPLY_CHAIN.md`.
- Shared secret exclusion, credential metadata, private temp/state modes,
  filesystem-write rules, redaction, and the explicit same-user limitation are
  governed once by O2 `contracts/local-credentials/v1/README.md`; RadControl
  owns only its bridge and packaging implementation of that contract.
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
  worktree at `~/.local/share/radcontrol/o2-runtime`. This stable runtime and
  data root is pinned to the installed O2 golden matching the installed
  RadControl binary, not automatically to source `main`. Debug builds continue
  to use `~/dev/o2`; only explicit E2E mode may override `O2_ROOT` with an
  absolute fixture path.
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
- Exact production-artifact acceptance is read-only with respect to installed
  O2. `scripts/tauri_production_readonly.mjs` mounts the installed O2 worktree
  read-only, overlays `.state` with test-owned storage, invokes no mutating
  bridge verb, and compares Git identity/cleanliness, the Empire To-Do digest,
  and TCP listeners before and after.
- Writable native E2E uses a debug/test-capable artifact only. Its fixture root,
  E2E home, XDG paths, required scripts/registries, deterministic To-Do store,
  and installed-root exclusion are canonical-path preconditions. Runtime
  diagnostics must attest `e2e` mode and the exact fixture root before the first
  edit. Missing files, ignored overrides, overlap, and symlink escape fail closed.
- A project launch opens a nonce-bearing final browser route only after its O2
  start succeeds. Embedded projects also restart their registered portal host;
  a raw listener on that port is not treated as proof of the correct host.

## Source and installed goldens

`SOURCE_GOLDEN` and `INSTALLED_GOLDEN` are deliberately separate facts.

- `SOURCE_GOLDEN` is the accepted O2 main commit plus the exact accepted
  RadControl source commit in O2's canonical
  `contracts/o2-radcontrol/v1/compatibility.json` manifest. Current source-main
  identities are Git facts; this document does not copy their changing hashes.
- `INSTALLED_GOLDEN` is the clean installed O2 runtime commit, that runtime's
  compatibility pin, and the RadControl source identity embedded in the
  installed binary. It advances only through the matched-pair transaction and
  may intentionally lag source.

Run `bash ~/dev/o2/scripts/run_o2.sh radcontrol.golden_state` after fetching the
source repositories to project both states and fail if a source pin, installed
runtime, or binary identity disagrees. The Runtime control provides the same
installed identities in the product. Release transaction evidence remains the
rollback record; neither this document nor a generated snapshot is another
golden-state registry.

Never independently update the installed O2 runtime or installed RadControl
binary. Advance both only through one native/install acceptance that proves the
matched pair together.

## Verification

Use the impact-appropriate subset of:

- `npm run lint`
- `npm run test:contracts`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`
- `npm run verify:production-delivery`
- focused architecture/contract tests
- explicitly launch-authorized `npm run test:tauri-e2e` for native workflow
  changes; never run it under ordinary verification authorization
- explicitly launch-authorized `npm run test:tauri-production-readonly --
  --expected-o2-sha <sha> --expected-radcontrol-sha <sha>
  --expected-artifact-sha <sha>` for an exact production artifact

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
