# RadControl

RadControl is the desktop control panel for the Rad Empire.

It is a thin proxy UI over O2.

## Purpose

RadControl exists to:

- load governed project state from O2
- dispatch canonical O2 verbs from a desktop UI
- display logs, artifact lists, and document surfaces
- provide a controlled entry surface for project formation and governed Codex workflows
- keep empire-facing operational visibility in one place

It is a cockpit, not the constitution.

## Authority boundary

RadControl must remain thin.

### RadControl owns

- UI layout and interaction flow
- local presentation state
- tab structure
- artifact and document viewing/editing surfaces
- Tauri bridge calls that dispatch to O2
- intake/display flows for governed actions such as Start Formation

### O2 owns

- project registry truth
- lifecycle verbs
- start / stop / restart authority
- readiness checks
- port status / lifecycle ownership
- snapshot / map / proof pack / truth surfaces
- governed filesystem mutation through `files.*` verbs
- lab dispatch
- project formation state transitions
- Codex execution routing and governance

RadControl must not become a second governance engine.

## Current major surfaces

- **Projects**  
  Loads project registry data from O2 and triggers project verbs such as start, snapshot, commit, map, proof pack, lab, and governed New Project formation entry.

- **Codex Chat**  
  Dispatches governed prompt-style Codex work through O2 `codex.chat`.

- **Codex Build**  
  Dispatches governed build/audit Codex work through O2 `codex.build`.

- **Empire Map**  
  Displays governed empire map artifacts through the shared artifact-list surface.

- **Empire Sweep**  
  Displays governed empire sweep artifacts through the shared artifact-list surface.

- **Governance**  
  Displays governance inventory and document visibility information aligned to repo governance expectations.

- **Notes / Legal / Labs / Orion Handoff**  
  Document-library surfaces backed by O2 filesystem verbs.

- **Timeline**  
  Timeline surface for governed project/empire tracking.

- **Snapshot**  
  Empire snapshot artifact viewer/editor surface backed by O2 artifact flows.

## Runtime model

RadControl uses Tauri + React + TypeScript.

The desktop app invokes Tauri commands such as:

- `run_o2`
- `run_o2_with_input`

These dispatch into the canonical O2 runner:

- `~/dev/o2/scripts/run_o2.sh`

RadControl does not own lifecycle logic, filesystem mutation logic, or Codex execution policy.

## New Project doctrine

New Project is not an instant repo generator.

It is a governed intake-and-formation flow.

Current doctrine:

- RadControl collects initial project truth
- RadControl normalizes and dispatches the formation payload to O2
- O2 creates the first durable formation artifact
- O2 bootstrap seeds both the starter repo surface and repo-local formation mirrors under `docs/project-formation/`
- O2 owns the state transition into `forming` and then `bootstrapped`
- further questioning and scaffold readiness remain governed steps, not hidden UI side effects

Current canonical primary project types:

- `new_website`
- `lab_from_existing`
- `website_successor`

## Labs doctrine

Labs is the governed experiment umbrella, not production repo logic.

Current direction:

- project rows may expose a Lab action when the registry defines an O2 lab relationship
- O2 dispatches `<project>.lab`
- shared lab material lives under the central Labs repo/path, not inside live production repos by default
- promotion from Labs into a live repo should remain deliberate and governed

## Repo truth

Primary repo docs:

- `docs/REPO_STATE.md`
- `docs/POLICY_POINTERS.md`

Generated evidence:

- `docs/_repo_snapshot.txt`
- `docs/_o2_repo_index.txt`

## Development checks

Common commands:

```bash
npx tsc --noEmit --pretty false
npm run dev
npm run tauri:dev
bash scripts/snapshot_repo_state.sh
```
