# RadControl - Policy Pointers

RadControl is the control panel, not the source of empire operational truth.

## Authority order

1. Empire law: `~/.codex/AGENTS.md`
2. Explicitly scoped O2 empire contracts for O2-owned behavior
3. RadControl local docs for RadControl implementation and presentation
4. O2 global defaults when RadControl is silent or explicitly defers upward

O2 documents override RadControl only when they declare `Authority class: Empire contract` and their scope includes RadControl and the topic. Historical documents, generated artifacts, notes, snapshots, and handoffs are not authority.

## Canonical O2 contracts used by RadControl

- Operating and authority model: `~/dev/o2/docs/O2_EMPIRE_OPERATING_RULES.md`
- Agent execution defaults: `~/dev/o2/docs/O2_AGENT_RULES.md`
- UI structure: `~/dev/o2/docs/radcontrol/empire_blueprint/radcontrol_ui_structure_doctrine_20260725.md`
- Document persistence: `~/dev/o2/docs/radcontrol/empire_blueprint/radcontrol_document_persistence_doctrine_20260727.md`
- Project formation: `~/dev/o2/docs/project-formation/PROJECT_CREATE_START.md`
- Project archetypes: `~/dev/o2/contracts/project-archetypes/v1/README.md`
- User correction learning:
  `~/dev/o2/contracts/user-correction-learning/v1/README.md`
- Local Codex memory verification and non-authoritative boundary:
  `~/dev/o2/contracts/codex-memory-verification/v1/README.md`
- Sentinel trust, capability, evidence, audit, and activation boundary:
  `~/dev/o2/contracts/sentinel-security/v1/README.md`
- Local filesystem, credential, secret-flow, runtime-identity, and redaction
  boundary: `~/dev/o2/contracts/local-credentials/v1/README.md`
- Build Me a Business maturity path:
  `~/dev/o2/docs/project-formation/BUILD_ME_A_BUSINESS_ROADMAP.md`
- O2 implementation: `~/dev/o2/scripts/`, `~/dev/o2/registry/projects.json`, and `~/dev/o2/workspaces/`

Home-level legacy procedure notes such as `~/.codex/O2_CONTROL.md` and `~/.codex/SNAPSHOT_CONTRACT.md` are not tracked O2 authority. Current tracked O2 and repo-local doctrine supersede conflicting instructions in those files.

## RadControl local authority

- `README.md`: onboarding, current surfaces, runtime model, and developer commands
- `docs/REPO_STATE.md`: architecture and behavior boundary
- `docs/RUNTIME_TRUST_BOUNDARY.md`: frontend-to-O2 threat model, execution
  limits, capability inventory, audit contract, and residual-risk ownership
- `AGENTS.md`: short agent entry pointer
- `docs/CODEX_EXECUTION_NOTES.md`: non-authoritative environment troubleshooting
  that must not override the documents above or O2 policy

## Drift controls

- Do not copy O2 rules into React components or create a parallel registry.
- Do not store governed notes or documents in browser/local state; use the approved O2 persistence path.
- Repo-local scripts may wrap O2 only when the behavior is genuinely RadControl-specific.
- Generated `_repo_snapshot.txt`, `.next/`, `dist/`, and `src-tauri/target/` output is evidence/cache, never policy.
- Add or change an O2-owned record, verb, persistence model, or action capability in O2 first, then render it in RadControl.
