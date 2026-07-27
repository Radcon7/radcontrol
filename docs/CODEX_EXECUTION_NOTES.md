# Codex Execution Notes

## Purpose

This file records practical execution constraints for Codex sessions in this repo.

## Preferred Session Setup

- Start Codex with this repo as the active workspace root when possible.
- Prefer one Codex session per active repo.
- Avoid cross-repo editing from a sibling repo session unless the task is explicitly empire-level.

## Known Constraint

- `apply_patch` and some normal file read/write flows can fail when this repo is being edited from a Codex session rooted somewhere else.
- In this environment, that failure often appears as a sandbox/runtime error rather than a code error.

## Practical Rule

- First choice: work from a session rooted directly in this repo.
- Second choice: if the active session is rooted elsewhere and normal patching fails, use an escalated scripted edit on a review branch.
- After any fallback edit, immediately run repo verification commands so the branch stays deterministic.

## Verification Reminder

- Keep changes small and grouped.
- Verify before merge.
- Merge back to `main` only after the branch represents a trusted state.
