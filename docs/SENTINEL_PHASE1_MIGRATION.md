# RadControl Sentinel Phase 1 Migration Manifest

Status: Superseded in part by the content-preservation recovery
Authority class: Reference
Reviewed: 2026-08-15

This manifest records how the superseded Empire Utility destination and the
System76 Infrastructure presentation were resolved. Current behavior remains
governed by `AGENTS.md`, `docs/REPO_STATE.md`, and the O2 Sentinel Security
Contract v1.

The initial Phase 1 closeout over-classified several unrelated capabilities as
deletable. The accepted recovery in `docs/RADCONTROL_CONTENT_PRESERVATION.json`
preserves this record while correcting those dispositions.

## Empire Utility disposition

| Previous feature | Phase 1 disposition | Current home or boundary |
| --- | --- | --- |
| Empire Utility navigation destination | Deleted | Security is the sole Radcon Sentinel destination. |
| Empire Map and repository snapshot controls | Initially removed with the old destination; restored after correction | Project-specific controls remain in Projects. Empire-wide Map and Snapshot artifacts live in Security > Empire Operations. |
| Empire Sweep report UI | Initially deleted; restored after correction | Security > Empire Operations exposes the governed report and artifact history without recreating the old destination. |
| Empire Utility artifact producer/store hook | Initially deleted; selectively restored after correction | The history-backed shared artifact hook now serves Security > Empire Operations and no standalone Empire Utility component. |
| Empire Utility-only styling | Deleted | No hidden or duplicate utility presentation remains. |

## System76 feature disposition

| Previous Infrastructure feature | Phase 1 disposition | Current home or boundary |
| --- | --- | --- |
| System76 roster item and workstation detail destination | Migrated | Security > Host Guardian, using the same canonical O2 `system76-workstation` configuration and notes paths. Infrastructure filters only this canonical host item and preserves unrelated assets. |
| CPU, load, thermal, fan, memory, swap, storage, disk I/O, process, listener, connection, service, Docker/Supabase, startup, and redacted login observations | Replaced | Sentinel Level-0 Host Guardian checks and status records. Classified summaries have priority; raw sensor and bounded detail rows are collapsed by default. |
| Workstation checkup history | Replaced | Real Sentinel events, actions, incidents, and audit-chain status appear in Recent Activity. |
| Update check and history | Migrated | Host Guardian Maintenance Inventory retains read-only `workstation.updates.check` and `.history`. |
| Catalog refresh and official-updater launch | Deleted from RadControl | These mutating or external-launch controls are outside Phase 1. |
| Safe cleanup preview/apply | Deleted from RadControl | No Level-1 maintenance executor is activated. Future maintenance requires separate authorization and contract work. |
| Terra/Codex workstation review | Deleted | Ask Sentinel is deterministic, has no live LLM, and has no execution channel. |
| Repository router health panel nested under workstation operations | Initially deleted; restored after correction | Agents > Repository Routers keeps governance health visible without coupling it to Host Guardian. |
| Workstation-specific React panels, routes, and CSS | Deleted | `SentinelTab` and `HostUpdatesPanel` are the only current host presentation components. |

## Preserved data and safety boundary

- The canonical O2 System76 configuration, notes, recovery references, and
  historical records were preserved; only their duplicate RadControl
  Infrastructure presentation was removed.
- No root helper, sudo path, cleanup executor, catalog refresh, updater launch,
  provider mutation, scheduler, or Level 1-5 capability was activated.
- Unknown, unavailable, stale, unsupported, permission-required, learning, or
  unconfigured evidence remains visibly non-healthy.
