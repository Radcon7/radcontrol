# RadControl

RadControl is the desktop control panel for the Rad Empire.

It is a thin proxy UI over O2:

- RadControl renders state, tabs, logs, and artifact/document views
- O2 owns operational authority, project verbs, lifecycle control, and filesystem mutation rules
- RadControl should not become a second governance engine

## Purpose

RadControl exists to:

- load project state from O2
- trigger O2 verbs from a controlled desktop UI
- view and manage governed document/artifact surfaces
- expose high-signal empire and repo status in one place

It is a cockpit, not the constitution.

## Core boundary

RadControl must remain thin.

### RadControl owns

- UI layout and interaction flow
- local presentation state
- tab structure
- artifact/document viewing surfaces
- Tauri bridge calls that dispatch to O2

### O2 owns

- project registry truth
- lifecycle verbs
- start / stop / restart authority
- port and readiness checks
- snapshot / map / proofpack / truth surfaces
- governed filesystem mutations through `files.*` verbs
- Codex execution routing

## Current major surfaces

- **Projects**  
  Loads project registry data from O2 and triggers project verbs like start, snapshot, commit, map, and proof pack.

- **Codex Chat**  
  Sends prompt input to O2 `codex.chat`.

- **Codex Build**  
  Sends build/audit style input to O2 `codex.build`.

- **Empire Map**  
  Reads governed empire map artifacts through O2 artifact flows.

- **Empire Sweep**  
  Reads governed empire sweep artifacts through O2 artifact flows.

- **Governance**  
  Displays governance inventory/document visibility information derived from O2 docs inventory plus policy expectations.

- **Document Library / Timeline / Snapshot**  
  Repo-facing document and artifact surfaces backed by O2 verbs.

## Runtime model

RadControl uses Tauri + React + TypeScript.

The desktop app calls Tauri commands which dispatch to O2:

- `run_o2`
- `run_o2_with_input`

Those commands call the canonical O2 dispatcher:

- `~/dev/o2/scripts/run_o2.sh`

## Repo truth

Primary repo docs:

- `docs/REPO_STATE.md`
- `docs/POLICY_POINTERS.md`

Generated evidence:

- `docs/_repo_snapshot.txt`
- `docs/_o2_repo_index.txt`

## Development notes

Common commands:

```bash
npm run dev
npm run tauri:dev
npx tsc --noEmit --pretty false
bash scripts/snapshot_repo_state.sh
```
