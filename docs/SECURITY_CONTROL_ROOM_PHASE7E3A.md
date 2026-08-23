# Phase 7E-3A Security Control Room Inventory

Status: Implementation evidence
Authority class: Reference
Scope: Pre-change Security surface inventory and Phase 7E-3A disposition

Current RadControl presentation authority remains `AGENTS.md`, `README.md`,
`docs/REPO_STATE.md`, and the UI doctrine named by `docs/POLICY_POINTERS.md`.
O2 owns the data and action authority through Sentinel Security Contract v2,
the Sentinel registries, the O2 dispatcher, and the matched-pair projection.

| Pre-change visible surface | Disposition | Final home | Real authority |
| --- | --- | --- | --- |
| Radcon Sentinel primary button | KEEP | Security first subtab | RadControl presentation |
| Empire Operations primary button | KEEP | Security second subtab | RadControl presentation; O2 report verbs |
| Security Guardian card inside Advanced | MOVE | Security third first-class subtab | O2 `sentinel.status` and `sentinel.security.check` |
| Is my computer okay? hero | KEEP | Radcon Sentinel first box | O2 host/automation/audit projections |
| Run Health Check | KEEP | First-box primary action | O2 `sentinel.host.check` |
| Investigate a Problem chooser | KEEP | First-box action and bounded chooser | Existing deterministic Host Guardian checks |
| Automation selector/toggle | KEEP | First-box control | O2 Sentinel v2 timer configuration |
| Current measurements before history | MOVE | Below Recent Guardian Activity | O2 current-host and durable host projections |
| CPU/GPU/fan/load/memory/disk/services facts | MERGE | One Current Measurements grid | O2 Sentinel metric observations |
| GPU hidden from primary measurements | MOVE | Primary GPU measurement with separate classification | O2 GPU observation and baseline comparison |
| Recent Incidents box | MERGE | Recent Guardian Activity anomaly rows | O2 incidents plus host events |
| Safe Cleanup action | KEEP | Exact anomaly intervention inside recent activity | Existing O2 preview/apply route |
| Full Host Guardian signal grid inside Advanced | REMOVE-AS-REDUNDANT | No second summary grid | Summary already has the same facts |
| Thermal sensor list | KEEP | Advanced evidence | O2 kernel sensor readings, sources, critical trips |
| Process/container/network/service details | KEEP | Advanced evidence | O2 deep host observer |
| Workstation identity, configuration, notes | KEEP | Advanced workstation records | Canonical O2 System76 documents |
| Maintenance Inventory | KEEP | Advanced workstation records | O2 update check/history |
| Host Maintenance Migration card | RENAME | Host Maintenance Boundary | O2 Sentinel v2 repair boundary |
| Generic Recent Activity table and filters | MERGE | Host observations in Radcon Sentinel; estate activity in Security Guardian | O2 hash-chained events/actions/incidents |
| Capability ladder | KEEP | Advanced authority details | O2 Sentinel capability registry |
| Triggers and schedules | KEEP | Advanced authority details | O2 Sentinel trigger registry and automation projection |
| Ask Sentinel | RENAME | Quick Deterministic Guidance | O2 deterministic `sentinel.ask`; no live model |
| Empire Map/Snapshot/Sweep modes | KEEP | Empire Operations artifact workspace | Existing governed O2 producer verbs |
| Missing Empire operational summary | MOVE | Empire Operations truth overview | O2 golden state, router health, Sentinel status |
| Provider/site inventory | MOVE | Security Guardian visibility | O2 Security Guardian asset/adapter/project registries |
| Future user/auth/threat/commerce controls | KEEP AS READINESS | Security Guardian, marked Not connected yet | No governed provider endpoints yet |

The redesign does not rename or replace the user-level Host Guardian timer or
service. Foreground measurements use a finite read-only projection every 60
seconds only while Radcon Sentinel is mounted; they do not write history or
invoke a model. The explicit Investigate / Fix action is rendered only for a
real anomalous observation and invokes the governed read-only diagnostic
handoff. It never performs repair automatically.
