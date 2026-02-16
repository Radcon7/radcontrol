# RadControl App — Repo Agent Pointers (Codex Entrypoint)

Empire-wide law:

- ~/.codex/AGENTS.md
- Also accessible via: ~/dev/rad-empire/codex (symlink)

Role boundary (binding):

- RadControl is a UI/control panel only.
- RadControl resources, UI state, and RadControl logs live in this repo.
- O2 owns governing rules/logic/scripts that RadControl invokes.
- Codex is the worker/executor (analysis + code assistance), not the rules source.

This repo’s authoritative documents:

- docs/REPO_STATE.md (architecture + behavior authority), if present
- docs/POLICY_POINTERS.md (policy pointers), if present

Workflow discipline (binding):

- Single-response rule
- O2 discipline:
  - step-by-step
  - specify terminal (dev-server vs command)
  - no long heredocs
  - create files via terminal
  - overwrite via VS Code Explorer
  - quote paths with parentheses
  - use grep (assume no rg)

This file is a pointer only.
Do not duplicate governance here.
