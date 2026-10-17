# Four-tab release readiness — 2026-10-16

Repo-level checkpoint on `fix/four-tab-release-readiness`. The commit containing
this receipt is local only. No installation, publication, compatibility repin,
provider change, or Sentinel configuration change is part of this task.

| Identity | Verified value |
| --- | --- |
| RadControl starting source / native debug build | `00e1253a058ed1083e324cf334f78f9e6c1b5111` |
| O2 source | `02fae7b98ed901addeec148fca08cad3505bc397` |
| Installed RadControl source pin / embedded identity | `0e08d40aeda0350add7f57b6ba0ffddbd2ddbe9f` |
| Installed O2 | `2082d799e776e37af5efce3946a71203b9b74aab` |
| Installed binary SHA-256 | `1459d9bf99bc7572a2e7c88615b560423404c5fe0f258f8c82ded453836783f5` |
| Unchanged client contract SHA-256 | `bdbe6cecb7a9690fb3e96c87f92243b0c616994bcfbdaa46ded99b6a0198437e` |

The deleted Infrastructure component and retired Overview/Work/Legal navigation
checks now target Security, Agents, Notes, Projects and Docker/MCP Local Tools.
Obsolete task-editor scenarios were retired with their product surfaces. The
receipt still requires all 33 Sentinel scenarios, five Work authority/recovery
states, width observations, five ordered navigation passes and harness digests.
Older rollback builds retain their original Work/Overview visibility checks.
No product component, bridge implementation, dependency or client contract changed.

Pre-installation checks: TypeScript, Vite build, O2's five required significant
quality gates, the complete repository contract suite, 22 Rust tests, Cargo
check/clippy, 51 transaction tests and eight release-evidence tests passed.
The contract suite includes navigation/content preservation, isolation, receipt
negative cases and Sentinel/security checks. Production dependency audit found
zero vulnerabilities. Snapshot, changed-file secret and diff checks passed for
all 26 changed files. No new product correction was introduced; this applies
existing product authority. No O2 learning or doctrine files were written.

Native acceptance passed in actual isolated Tauri: exact four-tab order; all
retained workspaces and controls; My Notes persistence/restart; Agent, Local Tools
and Project Notes saves; fixture-only bootstrap; real Rust bridge; five private
authority/recovery states; 1650/800/600 debug widths; all 33 Sentinel scenarios
and five ordered navigation passes. Simulated repairs stayed in the fixture.
The separate current-registry session proved the exact expanded O2 roster,
RadCloud once beside RadCalendar/DQOTD/RadStock, and bridge paths equal to an
independent O2 query. Its read-only registry hash was unchanged. No navigation
runtime errors occurred. The starter's browser result is explicitly a fixture
adapter, not a hosted/browser acceptance claim.

All test-owned windows, drivers, listeners and fixtures were removed. Port 1420
remained free; installed binary, installed O2 tree/To-Do and real private Work
passed before/after integrity checks. The pre-existing VS Code-owned preview
(PID 2493199, fixture `radcontrol-tauri-e2e-2JwdUj`) was left running. Sentinel's
timer remained enabled/active with service `NRestarts=0`; normal scheduled wakes
were not interrupted. O2's pre-existing dirty `registry/learning-candidates.json`
was preserved. Sandbox-restricted cleanup tests passed on the scoped host retry;
their two earlier hung test runners and disposable signal markers were removed.

Compatibility: both installed and source O2 report contract version 1 and supply
every required current client capability. There is no new protocol requirement.
Installed O2 nevertheless omits RadCloud, and both compatibility manifests still
pin the older RadControl identity above. Installing RadControl alone would be an
unsupported pair and would not provide the required registry discovery. The
current source registry supplies RadCloud at
`/home/chris/dev/rad-empire/radcon/dev/radcloud`, alongside RadCalendar, DQOTD and
RadStock. No duplicate project or repository was created.

Installation status: local pre-installation readiness passed. The source is ready
for authorized OP-014 release preparation; installation remains gated on this
separately authorized work:

1. Publish the reviewed RadControl source through protected PR/CI, verify its
   accepted exact SHA/tree, then publish O2 with the registry-bearing source and
   `contracts/o2-radcontrol/v1/compatibility.json` pinned to that accepted SHA and
   the unchanged client digest above. The future paired O2 SHA follows that PR;
   this receipt does not invent it. Fetch/provider verification was not performed.
2. From clean protected source, pass golden-state/release-doctor checks; build via
   the canonical O2 release workflow; independently admit the exact artifact,
   manifests and dependency evidence, including Linux ABI ceiling 2.35. Pass
   candidate-native acceptance against those exact bytes before live mutation.
3. Prepare the existing schema-v2 transaction with immutable candidate and old
   pair recovery files; stop RadControl through the authorized operator route;
   verify listeners, helper/policy hashes, private Work and recovery identity.
   The coordinator pauses the existing timer, waits for natural service idle
   (bounded 180 seconds, unchanged invocation, zero restarts), rechecks preflight,
   and captures the fresh private metadata/hash baseline before promotion.
4. Preserve the complete cycle: promote and paired helper/policy install → first
   installed native acceptance → actual rollback and old helper/policy restoration
   → restored-pair/private verification and native rollback proof → identical-byte
   reinstall → final native/private acceptance → `new-live-final`, timer rearmed,
   exactly one current recovery authority. Do not rebuild/redownload mid-cycle.

Admitted-artifact, first-installed, real rollback and final-installed acceptance
are outstanding future gates, not passes claimed by this local debug review.
The retained recovery authority is
`~/.local/share/radcontrol/.release-sentinel-border-20261005-11349953669`;
it was classified valid/current and was not modified.

Safe launch-authorized native review (builds and closes disposable Tauri sessions;
current registry mounted read-only, no Vite server):

```bash
cd /home/chris/dev/rad-empire/radcontrol/dev/radcontrol-app
npm run test:tauri-e2e
```

Exact changed files:

```text
README.md
docs/FOUR_TAB_RELEASE_READINESS.md
docs/REPO_STATE.md
docs/SUPPLY_CHAIN.md
docs/_repo_snapshot.txt
package.json
scripts/matched_pair_transaction.py
scripts/native_acceptance_lib.mjs
scripts/native_four_tab_assertions.mjs
scripts/native_wave11_acceptance.mjs
scripts/native_wave11_matrix.json
scripts/native_wave11_receipt.mjs
scripts/native_wave11_release.mjs
scripts/native_wave2a_acceptance.mjs
scripts/native_workspace.mjs
scripts/native_workspace_sequence.mjs
scripts/tauri_candidate_precheck.mjs
scripts/tauri_e2e.mjs
scripts/tauri_production_readonly.mjs
tests/matched_pair_transaction_test.py
tests/native_four_tab_test.mjs
tests/native_wave11_receipt_test.mjs
tests/native_work_authority_test.mjs
tests/native_workspace_test.mjs
tests/verify_production_delivery_contract.mjs
tests/verify_tauri_e2e_contract.mjs
```
