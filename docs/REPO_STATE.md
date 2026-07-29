# RadControl - Repo State

Purpose: RadControl is the desktop command center for Rad Empire. It renders governed state, dispatches constrained O2 actions, and keeps operator workflows visible without becoming a second operational authority.

## Authority boundary

- RadControl owns React/Tauri presentation, UI composition, local ephemeral view state, and the constrained bridge to O2.
- O2 owns registry truth, runtime and port contracts, project formation/bootstrap, durable documents, governed notes, and filesystem mutation.
- Project repos own their product behavior, application UI, data model, and repo-specific deployment rules.
- RadControl does not contain DQOTD, TBIS, Offroad, or other project business logic.

## Current surfaces

- Projects: governed registry, runtime controls, project evidence, notes, formation intake, and bootstrap entry.
- Infrastructure: governed provider/platform assets, editable non-secret configuration notes, actions, and operational notes.
- Agents: governed profiles, focus/scope/limits, and notes.
- Empire Utility: generated map, snapshot, and sweep artifacts.
- Notes and Legal: O2-backed authored document libraries and timeline records.

## Persistence and execution

- Durable writes use O2 file or producer verbs; React/local storage is not document truth.
- The Tauri bridge exposes an allowlist of O2 actions rather than arbitrary shell or filesystem access.
- Generated snapshots and reports are evidence, not authority and not implicit Git actions.
- `scripts/snapshot_repo_state.sh` produces `docs/_repo_snapshot.txt` without operational side effects.

## Verification

Use the impact-appropriate subset of:

- `npm run lint`
- `npm run verify:security`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- focused architecture/contract tests
- opt-in `npm run test:tauri-e2e` for native workflow changes
