# RadControl — Policy Pointers (Single Source of Truth)

This repo (**RadControl**) is the **control panel**. It orchestrates actions, but it is **not** the governance source.

If you catch yourself copying “rules” into this repo: stop and link back to the canonical sources below.

---

## Canonical hierarchy

### Level 0 — Empire law (single source)

**Canonical:** `~/.codex/AGENTS.md`  
**Also reachable as symlink:** `~/dev/rad-empire/codex/AGENTS.md`

Purpose:

- global operating rules
- workflow discipline
- boundaries (no drift, no surprise refactors, smallest safe step, etc.)

### Level 1 — Empire procedures/contracts

**Canonical:**

- `~/.codex/O2_CONTROL.md`
- `~/.codex/SNAPSHOT_CONTRACT.md`

Purpose:

- defines how O2 and Codex cooperate
- defines what “snapshot”, “truth”, “evidence” mean
- defines the allowed boundaries of automation

### Level 2 — O2 implementation details

**Canonical:** `~/dev/o2/`

Key locations:

- `~/dev/o2/docs/` (documentation for O2 behavior)
- `~/dev/o2/scripts/` (the actual orchestrator scripts)
- `~/dev/o2/registry/projects.json` (project registry, if chosen canonical)
- `~/dev/o2/workspaces/` (workspace definitions)

Rule:

- O2 docs can expand procedures, but **must not fork** Level 0/1 policy.

### Level 3 — Repo-local constraints only

Repo-local docs may exist to describe **repo-specific** behavior, never global governance.

Examples:

- `<repo>/docs/REPO_STATE.md` (authoritative for that repo)
- `<repo>/docs/o2/*` (repo-specific O2 notes, not empire policy)

---

## Drift hazards (what to avoid)

1. **Do not duplicate policy**

- No copying Codex/O2 rules into RadControl.
- Link back to `~/.codex/*` or `~/dev/o2/*`.

2. **Do not fork registries**

- Avoid multiple “source of truth” project registries.
- If multiple files exist, one must be canonical and the other generated.

3. **Avoid cloned scripts**

- `snapshot_repo_state.sh`, `o2_session_start.sh`, `o2_commit.sh` should converge:
  - one canonical implementation
  - repo stubs/wrappers only when truly repo-specific

4. **Generated artifacts are not policy**

- `_repo_snapshot.txt`, `_o2_repo_index.txt`, `.next/`, `node_modules/`, `src-tauri/target/`
  are outputs/caches, not authority.

---

## RadControl-specific rule

RadControl may:

- display links/pointers to the canonical sources
- run whitelisted commands that call O2 scripts
- record UI state (tabs/notes) locally

RadControl must not:

- become the place where “how the empire works” is defined
- accumulate parallel rule docs that drift from `~/.codex`

---

## Quick pointers

- Codex canonical rules:
  - `~/.codex/AGENTS.md`
  - `~/.codex/O2_CONTROL.md`
  - `~/.codex/SNAPSHOT_CONTRACT.md`

- O2 canonical implementation:
  - `~/dev/o2/docs/`
  - `~/dev/o2/scripts/`
  - `~/dev/o2/registry/projects.json`

- This repo (RadControl) repo-local authority:
  - `docs/REPO_STATE.md`
  - `docs/_repo_snapshot.txt`
  - `docs/_o2_repo_index.txt`
