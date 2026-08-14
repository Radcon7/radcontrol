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
- Infrastructure: governed provider/platform assets, editable non-secret configuration notes, actions, and operational notes. The System76 asset provides separate Health & Cleanup and Updates topics backed by O2-owned bounded history and allowlisted actions.
- Agents: governed profiles, focus/scope/limits, and notes.
- Empire Utility: generated map, snapshot, and sweep artifacts.
- Notes and Legal: O2-backed authored document libraries and timeline records.

## Persistence and execution

- Durable writes use O2 file or producer verbs; React/local storage is not document truth.
- The Tauri bridge exposes an allowlist of O2 actions rather than arbitrary shell or filesystem access.
- Generated snapshots and reports are evidence, not authority and not implicit Git actions.
- `scripts/snapshot_repo_state.sh` produces `docs/_repo_snapshot.txt` without operational side effects.
- A project launch opens a nonce-bearing final browser route only after its O2
  start succeeds. Embedded projects also restart their registered portal host;
  a raw listener on that port is not treated as proof of the correct host.

## Verification

Use the impact-appropriate subset of:

- `npm run lint`
- `npm run verify:security`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- focused architecture/contract tests
- opt-in `npm run test:tauri-e2e` for native workflow changes
