# RadControl App (Tauri + React + TypeScript)

## What to run (Local Dev)

Run from this directory only:

`/home/chris/dev/rad-empire/radcontrol/dev/radcontrol-app`

Golden path (single command):

`node scripts/tauri_dev.mjs`

What it does:

- infers package manager from lockfile
- enforces the canonical local dev URL `http://127.0.0.1:1420`
- starts Vite if needed, waits with a bounded timeout, validates it is the RadControl app (not just any server)
- launches Tauri only after preflight passes
- exits fast with actionable errors (no indefinite waiting)

Sanity checklist (non-zero on failure):

`node scripts/dev_sanity_check.mjs`

If you run from the wrong directory, the scripts print the exact `cd` command to use.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
