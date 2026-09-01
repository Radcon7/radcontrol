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

## RadControl launch boundary

Do not launch RadControl through localhost, Vite dev or preview, Tauri dev,
desktop E2E, or any other command that starts the app or binds a TCP listener
unless the current task explicitly authorizes that launch. General permission
to implement, test, build, publish, or merge is not launch authorization.

Before running any E2E command, inspect the harness. If it starts RadControl, a
fixture runtime, WebDriver, or another listener, the same explicit current-task
authorization is required. When a launch is authorized, record the listener
baseline first and prove that no new listener remains afterward. Do not stop or
alter a pre-existing listener without separate authorization.

Non-server checks remain allowed: contract/unit tests, lint, production builds
that do not launch the app, Rust checks, audits, and deterministic snapshots.
This is RadControl product-local execution authority, not an Empire-wide rule.

## RadControl content preservation boundary

Broad UI consolidation must preserve unrelated existing RadControl content and
capabilities. Before replacing a surface, inventory the pre-change visible
functionality from Git history and retain or migrate each capability explicitly.
Authorization to remove one asset or replace one destination is not authority
to remove unrelated Projects, Infrastructure assets, Notes modes, governance
health, utilities, or other reachable product content. Encode intentional
exceptions and preservation evidence in focused tests.

## Live product delivery boundary

RadControl is complete as a desktop product only when the normal desktop entry
launches the installed release binary without Vite, preview, Tauri dev,
WebDriver, or a new TCP listener. Production resolves O2 from the dedicated
same-repository worktree at `~/.local/share/radcontrol/o2-runtime`; debug builds
resolve `~/dev/o2`, and an absolute `O2_ROOT` override is accepted only in the
explicit E2E mode. The production runtime root must remain clean and pinned to
the installed O2 golden that matches the installed RadControl binary. It may
intentionally lag source `main`; never advance either installed half
independently. Installed updates must retain O2-owned durable data.

The visible product must distinguish loading, failed, and genuinely empty
states. A failed O2 contract or data request must never be presented as an
empty Projects, Infrastructure, To-Do, Notes, or Security collection. Source,
CI, merge, and build success do not substitute for verification through the
normal installed launcher when a task claims live product recovery.

## Task router

| Trigger | Required local first reads | Conditional shared route |
| --- | --- | --- |
| Always | `README.md`; `docs/REPO_STATE.md`; `docs/POLICY_POINTERS.md` | Query O2 before invasive work. |
| UI/UX | Local architecture in `docs/REPO_STATE.md`; UI doctrine linked by `docs/POLICY_POINTERS.md` | Retrieve active UI/quality material; RadControl owns presentation only. |
| Database/schema/migration | Persistence boundary in `docs/REPO_STATE.md` and `docs/POLICY_POINTERS.md` | O2 owns governed durable state. Use its applicable contract; do not create a RadControl-side product database or policy store. |
| Auth/security/Tauri bridge | `docs/POLICY_POINTERS.md`; bridge and execution boundaries in local code/docs | Retrieve `contracts/local-credentials/v1/README.md` plus task-matched security material; preserve the allowlisted bridge. |
| Hosted delivery/Vercel | No repo-local hosted-service authority exists; RadControl is a local desktop command center | Any hosted surface is a scope expansion requiring O2 hosted-delivery retrieval and explicit design authority. |
| Supabase/provider | `docs/POLICY_POINTERS.md` for O2-owned infrastructure actions | Provider truth and mutations remain O2-owned; use the relevant O2 data/provider contract and never duplicate credentials or state. |
| Radcon portal/operator | RadControl's boundary in `docs/REPO_STATE.md` | RadControl is not Radcon Enterprises. Retrieve O2 action/runtime contracts only for its command-center role. |
| Anomaly/roadblock | Re-anchor and classify UI, Tauri bridge, O2 action, provider, or execution boundary | Use `radcon-roadblock-triage`; search the O2 operational playbook before repeating recovery. |
| Significant implementation/review | Complete intended diff and affected local/O2 contracts | Use `radcon-quality-review` and the declared `quality.check` route. |
| Reusable lesson | Require verified recurrence, evidence, scope, and secret-free content | Use `lesson.candidate.capture`; do not write directly into O2 doctrine. |

Interactive versus unattended task routing and generic task closeout are
canonical in `~/dev/o2/docs/O2_AGENT_RULES.md#interactive-and-unattended-task-routing`
and `#task-closeout`. Follow those sections rather than restating their
completion semantics in this router.

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

_Last updated: 2026-08-15_

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
