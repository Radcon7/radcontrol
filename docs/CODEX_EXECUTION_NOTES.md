# Codex Execution Notes

Status: Non-authoritative, environment-specific troubleshooting guidance.

Authority and execution rules live in `AGENTS.md`, `docs/POLICY_POINTERS.md`,
and O2's `docs/O2_AGENT_RULES.md`.

## Purpose

This file records practical execution constraints for Codex sessions in this repo.

## Preferred Session Setup

- Start Codex with this repo as the active workspace root when possible.
- Prefer one Codex session per active repo.
- Avoid cross-repo editing from a sibling repo session unless the task is explicitly empire-level.

## Known Constraint

- `apply_patch` and some normal file read/write flows can fail when this repo is being edited from a Codex session rooted somewhere else.
- In this environment, that failure often appears as a sandbox/runtime error rather than a code error.

## Practical rule

- First choice: work from a session rooted directly in this repo.
- If a patch or command fails because the active session is rooted elsewhere,
  re-anchor in this repo before changing the editing method.
- Use direct commands and `apply_patch` first. If an authorized capability is
  denied, retry the exact command once with a scoped escalation; do not use a
  broad scripted edit, shell bypass, or sandbox-policy change as a workaround.
- After any successful fallback, review the narrow diff and run the
  impact-appropriate repo verification.

## Verification Reminder

- Keep changes small and grouped.
- Verify before an explicitly authorized checkpoint or merge.
- After the required snapshot, verification, diff review, and explicit user
  authorization, Codex may perform the scoped branch, merge, commit, or push
  action; never rewrite history without separate explicit authorization.
