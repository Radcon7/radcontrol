# RadControl - Agent Pointer

Empire law remains binding from `~/.codex/AGENTS.md`.

Read these local entry documents first:

1. `README.md`
2. `docs/REPO_STATE.md`
3. `docs/POLICY_POINTERS.md`

For O2-owned behavior, follow the explicitly scoped contracts linked from `docs/POLICY_POINTERS.md`. Ordinary RadControl UI implementation starts from this repo's local architecture; consult O2 when a change affects an O2-owned registry, runtime, project-formation, persistence, or action-capability contract, or when local governance has a real gap.

Role boundary:

- RadControl owns presentation, UI composition, local ephemeral view state, and its constrained Tauri bridge.
- O2 owns durable operational truth, governed filesystem writes, registries, runtime coordination, and project formation.
- RadControl must not duplicate O2 policy or durable data in React/local storage.

Use the current repo tools and the smallest coherent diff. Preserve unrelated dirty work, snapshot before changes, verify based on impact, and review the diff. Git checkpoints and release actions are explicit operator decisions, not automatic session-end behavior.
