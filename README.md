# RadControl

RadControl is the desktop control panel for the Rad Empire.

It is a thin proxy UI over O2.

## Purpose

RadControl exists to:

- load governed project state from O2
- dispatch canonical O2 verbs from a desktop UI
- display logs, artifact lists, and governed document surfaces
- provide a controlled entry surface for project formation, runtime actions, and project status review
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
- deeper agent, infrastructure, and formation truth records

RadControl must not become a second governance engine.

## Current major surfaces

- **Projects**  
  Loads governed project registry data from O2, triggers project verbs such as start, snapshot, commit, map, proof pack, and lab, and hosts the governed New Project formation entry.

- **Infrastructure**  
  Displays governed infrastructure records and project-linked infrastructure context sourced through O2.

- **Agents**  
  Displays governed agent profiles, recent agent runs, and project-level status-audit entry points.

- **Empire Utility**  
  Displays governed empire map, empire snapshot, and empire sweep artifacts through the shared artifact-list surface.

- **Notes**  
  Hosts governed note libraries, dev updates, timeline entries, and empire blueprint records through the shared document surface.

- **Legal**  
  Hosts governed legal notes, legal documents, and legal structure records through the shared document surface.

## Runtime model

RadControl uses Tauri + React + TypeScript.

The desktop app invokes Tauri commands such as:

- `run_o2`
- `run_o2_with_input`

These dispatch into the canonical O2 runner:

- `~/dev/o2/scripts/run_o2.sh`

RadControl does not own lifecycle logic, filesystem mutation logic, or project formation policy.

## New Project doctrine

New Project is not an instant repo generator.

It is a governed intake-and-formation flow.

Current doctrine:

- RadControl collects initial project truth
- RadControl normalizes and dispatches the formation payload to O2
- O2 creates the first durable formation artifact
- O2 bootstrap seeds both the starter repo surface and repo-local formation mirrors under `docs/project-formation/`
- O2 owns the state transition into `forming` and then `bootstrapped`
- RadControl currently surfaces the governed `start` step plus optional localhost starter bootstrap; deeper formation stages remain O2-owned follow-up work

Current canonical primary project types:

- `new_website`
- `lab_from_existing`
- `website_successor`

## Labs doctrine

Labs remains the governed experiment umbrella, not production repo logic.

- project rows may expose a Lab action when the registry defines an O2 lab relationship
- O2 dispatches `<project>.lab`
- shared lab material should live outside live production repos by default

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
