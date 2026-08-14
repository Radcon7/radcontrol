<!-- o2-router: {"contractVersion":"1","projectKey":"radcontrol","archetype":"local-control-plane","requiredLocalAuthorities":["README.md","docs/REPO_STATE.md","docs/POLICY_POINTERS.md"]} -->
# RadControl — Codex Entrypoint

## Instruction loading

Codex automatically loads this file only when the session starts within this
repository's instruction scope. Empire law from `~/.codex/AGENTS.md` remains
binding. Linked documents and O2 contracts are not automatically loaded.

## Required start

1. Re-anchor with `pwd` and `git rev-parse --show-toplevel`.
2. Read `README.md`, `docs/REPO_STATE.md`, and `docs/POLICY_POINTERS.md`.
3. Before invasive work, classify the task and run:
   `bash ~/dev/o2/scripts/run_o2.sh knowledge.explain.<base64url-json>` with a
   secret-free payload containing `repository: "radcontrol"`, task, category,
   and a small result limit.

If O2 is unavailable, use local presentation authority only, report degraded
governance, and do not invent or duplicate O2 behavior. After moving here from
another repository, re-anchor, read this file, and run the RadControl query
before editing.

## Task router

| Trigger | Required local first reads | Conditional shared route |
| --- | --- | --- |
| Always | `README.md`; `docs/REPO_STATE.md`; `docs/POLICY_POINTERS.md` | Query O2 before invasive work. |
| UI/UX | Local architecture in `docs/REPO_STATE.md`; UI doctrine linked by `docs/POLICY_POINTERS.md` | Retrieve active UI/quality material; RadControl owns presentation only. |
| Database/schema/migration | Persistence boundary in `docs/REPO_STATE.md` and `docs/POLICY_POINTERS.md` | O2 owns governed durable state. Use its applicable contract; do not create a RadControl-side product database or policy store. |
| Auth/security/Tauri bridge | `docs/POLICY_POINTERS.md`; bridge and execution boundaries in local code/docs | Retrieve active security and O2/RadControl contract material; preserve the allowlisted bridge. |
| Hosted delivery/Vercel | No repo-local hosted-service authority exists; RadControl is a local desktop command center | Any hosted surface is a scope expansion requiring O2 hosted-delivery retrieval and explicit design authority. |
| Supabase/provider | `docs/POLICY_POINTERS.md` for O2-owned infrastructure actions | Provider truth and mutations remain O2-owned; use the relevant O2 data/provider contract and never duplicate credentials or state. |
| Radcon portal/operator | RadControl's boundary in `docs/REPO_STATE.md` | RadControl is not Radcon Enterprises. Retrieve O2 action/runtime contracts only for its command-center role. |
| Anomaly/roadblock | Re-anchor and classify UI, Tauri bridge, O2 action, provider, or execution boundary | Use `radcon-roadblock-triage`; search the O2 operational playbook before repeating recovery. |
| Significant implementation/review | Complete intended diff and affected local/O2 contracts | Use `radcon-quality-review` and the declared `quality.check` route. |
| Reusable lesson | Require verified recurrence, evidence, scope, and secret-free content | Use `lesson.candidate.capture`; do not write directly into O2 doctrine. |

## Authority and lifecycle

- Local documents govern RadControl presentation and implementation. Explicitly
  scoped O2 contracts govern O2-owned actions, registries, and durable state.
- `docs/CODEX_EXECUTION_NOTES.md` is non-authoritative troubleshooting context.
- Generated `docs/_repo_snapshot.txt`, build output, caches, notes, and handoffs
  are historical evidence or context; they never override current authority.

RadControl-specific constraints are binding: it is the local builder,
development, governance, and infrastructure command center. O2 remains the
governing knowledge/runtime layer, and Radcon Enterprises remains the separate
future business operator portal. RadControl owns local ephemeral view state but
must not duplicate O2 policy or durable data in React/local storage; it must not
become a second O2 registry, document store, or policy engine.

_Last updated: 2026-08-12_

## Router identity and safety

This contract-v1 router identifies O2 project key `radcontrol`, expected root
`/home/chris/dev/rad-empire/radcontrol/dev/radcontrol-app`, and archetype `local-control-plane`. O2's
`registry/projects.json` remains the only Empire repository map.

Codex automatically loads the machine-global law and this root `AGENTS.md` for
a fresh session in this scope. Linked authorities remain conditional reads.
Current authority governs; candidate material, historical notes, snapshots,
handoffs, generated indexes, and future plans are context or evidence only.

Never put secrets, credentials, or privileged values in prompts, approval rules,
documentation, logs, or browser code. Do not weaken trust or sandbox boundaries
for convenience.
