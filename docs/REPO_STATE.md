# RadControl — REPO STATE

Purpose:
RadControl is the cockpit / command-center app for the Rad Empire.
It surfaces state, runs O2 rituals, and provides intervention / panic tooling.

Scope rules:

- No business logic from TBIS / DQOTD lives here
- No repo-crossing mutations
- This app observes, triggers, and reports

Snapshot:

- `scripts/snapshot_repo_state.sh` produces `docs/_repo_snapshot.txt`
- Snapshots are evidence only; no side effects

Status:

- Snapshot contract: implemented
- O2 session start: implemented
- UI work: intentionally out of scope for this step
