import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [component, guardian, security, operations, updates, model, api, app, css, bridge, client, repoState] = await Promise.all([
  read("src/components/sentinel/SentinelTab.tsx"),
  read("src/components/sentinel/SecurityGuardianTab.tsx"),
  read("src/components/security/SecurityTab.tsx"),
  read("src/components/security/EmpireOperationsWorkspace.tsx"),
  read("src/components/sentinel/HostUpdatesPanel.tsx"),
  read("src/components/sentinel/sentinelModel.ts"),
  read("src/components/sentinel/sentinelApi.ts"),
  read("src/App.tsx"),
  read("src/App.css"),
  read("src-tauri/src/commands/o2.rs"),
  read("contracts/o2-radcontrol/v1/client.json"),
  read("docs/REPO_STATE.md"),
]);

assert.match(app, /sentinel: "Security"/);
assert.match(app, /<SecurityTab/);
assert.doesNotMatch(app, /EmpireUtilityTab|Empire Utility/);
assert.doesNotMatch(css, /\.empireUtility/);
assert.equal(existsSync(new URL("../src/components/common/useArtifactStore.ts", import.meta.url)), true);

for (const label of ["Radcon Sentinel", "Empire Operations", "Security Guardian"]) assert.match(security, new RegExp(label));
for (const mode of ["sentinel", "empire_operations", "security_guardian"]) assert.match(security, new RegExp(`key: "${mode}"`));
for (const purpose of [
  "This computer — health, loud fans, resources, services and maintenance.",
  "Development-system integrity — O2/RadControl pair, repositories, release, audit and reports.",
  "Online technology estate — websites, apps, providers and connected security coverage.",
]) assert.match(security, new RegExp(purpose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(security, /aria-selected=\{mode === item\.key\}/);

assert.match(component, /RADCON SENTINEL · THIS COMPUTER/);
assert.match(component, /Is my computer okay\?/);
assert.ok(component.indexOf("Is my computer okay?") < component.indexOf("CURRENT MEASUREMENTS"));
assert.ok(component.indexOf("CURRENT MEASUREMENTS") < component.indexOf("RECENT GUARDIAN ACTIVITY"));
assert.ok(component.indexOf("RECENT GUARDIAN ACTIVITY") < component.indexOf("ADVANCED SYSTEM INFORMATION"));

for (const measurement of ["CPU temperature", "GPU temperature", "Fan", "CPU", "Load", "Memory", "Disk", "Services"]) {
  assert.match(component, new RegExp(`label: "${measurement}"`));
}
assert.match(component, /sentinelMeasurementColumns/);
assert.match(component, /sentinelMeasurementList securityInsetScroll/);
assert.match(component, /data-testid="sentinel-measurement-row"/);
assert.doesNotMatch(component, /sentinelSignalGrid sentinelPrimaryMeasurements/);
assert.doesNotMatch(css, /\.securityControlRoom \.sentinelPrimaryMeasurements\s*\{[^}]*repeat\(4/s);
assert.match(component, /Refreshes every 60 seconds/);
assert.match(component, /window\.setInterval\(\(\) => void sample\(\), 60_000\)/);
assert.match(component, /not written to durable history/);
assert.match(component, /materiallyDifferentTimestamp/);

assert.match(component, /latest 20 maximum/);
assert.match(component, /guardianActivityColumns/);
assert.match(component, /guardianActivityScroll securityInsetScroll/);
assert.match(component, /showOlderActivity/);
assert.match(component, /Show \$\{observations\.length - 6\} older observations/);
assert.match(component, /Legacy observation · detailed measurements not retained/);
assert.match(component, /Attention was recorded; detailed reason was not retained/);
assert.match(component, /verdictReason/);
assert.match(component, /View scan evidence/);
assert.match(component, /scanDurationMs/);
assert.match(component, /coverageLimitations/);
assert.match(component, /normalized snapshot was not retained/);
assert.doesNotMatch(component, /No recorded anomaly/);

assert.equal((component.match(/Fans are loud/g) || []).length, 1, "the primary loud-fan action must render exactly once");
assert.match(component, /data-testid="sentinel-fans-loud"/);
assert.match(component, /data-testid="sentinel-diagnose-fix"/);
assert.match(component, /primaryActionLabel = repairAvailable \? "Review & Fix" : "Diagnose"/);
assert.match(component, /data-testid="sentinel-current-now"/);
assert.match(component, /CURRENT NOW/);
assert.match(component, /data-testid="sentinel-last-full-scan"/);
assert.match(component, /unresolved finding/);
assert.match(component, /FULL-SCAN FINDING/);
assert.match(component, /data-testid="sentinel-diagnosis-result"/);
assert.match(component, /DIAGNOSING/);
assert.match(component, /DIAGNOSIS COMPLETE/);
for (const outcome of ["NO ISSUE FOUND", "FIX AVAILABLE", "NEEDS YOUR HELP", "FIXED", "STILL PRESENT"]) assert.match(component, new RegExp(outcome));
for (const resultField of ["PRIMARY FINDING", "SUPPORTING EVIDENCE", "NEXT STEP", "Repair ran:"]) assert.match(component, new RegExp(resultField));
assert.match(component, /sentinelFullScanAction/);
assert.doesNotMatch(component, /"Review \/ Fix"/);
assert.doesNotMatch(component, /high-CPU process, stale test browser, or zombie process/);
assert.match(component, /knownIncidentState\?\.active\) return "ATTENTION"/);
assert.match(component, /exact sustained Pop updater incident signature is active/);
assert.match(component, /Last full scan \{formatDateTime\(status\?\.host\.checkedAt\)\}/);
assert.match(component, /Review &amp; Fix|"Review & Fix"/);
assert.match(component, /Run Full Scan/);
assert.match(component, /primaryAttentionReason/);
assert.match(component, /fanInvestigationNeedsDeepCheck/);
assert.match(component, /await runHostDeepCheck\(\)/);
assert.match(component, /FIX AVAILABLE/);
assert.match(component, /FIXED/);
assert.match(component, /STILL PRESENT/);
assert.match(component, /NO FIX NEEDED/);
assert.match(component, /"Fix now"/);
assert.match(component, /"Authorize & fix"/);
assert.match(component, /Outcome retained in Sentinel history/);
assert.doesNotMatch(component, /appendWorkstationHistory|hostNotes\.onTextChange|hostConfiguration\.onTextChange|hostNotes\.flush|hostConfiguration\.flush/);
assert.doesNotMatch(component, /Why are my fans running\?/);
assert.doesNotMatch(component, /aria-label="Diagnostics"|>DIAGNOSTICS<|QUICK ANSWERS|Get Quick Answer/);

for (const choice of [
  "Computer is slow",
  "Network problem",
  "Something suspicious is happening",
  "Check whether Codex left something running",
  "Other problem",
]) assert.match(component, new RegExp(choice));
assert.doesNotMatch(component, /Is my computer healthy\?|What needs my attention\?/);

for (const area of [
  "SYSTEM EVIDENCE",
  "SCAN COVERAGE",
  "MAINTENANCE &amp; UPDATES",
  "AUTOMATION",
  "WORKSTATION RECORD &amp; NOTES",
  "SAFETY &amp; PERMISSIONS",
]) assert.match(component, new RegExp(area));
for (const testId of [
  "advanced-system-evidence",
  "advanced-scan-coverage",
  "advanced-maintenance-updates",
  "advanced-automation",
  "advanced-workstation-record",
  "advanced-safety-permissions",
]) assert.match(component, new RegExp(`data-testid="${testId}"`));
assert.match(component, /data-testid="sentinel-deep-check"/);
assert.match(component, /HOST_CONFIGURATION_PATH/);
assert.match(component, /HOST_NOTES_PATH/);
assert.match(component, /Canonical source · read-only here/);
assert.equal((component.match(/readOnly data-testid="host-(?:configuration-note|operator-notes)"/g) || []).length, 2, "tracked workstation source records must be read-only in RadControl");
assert.match(component, /<HostUpdatesPanel/);
assert.match(component, /data-testid="host-maintenance-boundary"/);
assert.match(component, /sentinel-capability-ladder/);
assert.match(component, /ACTIVE · READ ONLY/);
assert.match(component, /NOT ACTIVATED/);
assert.match(component, /Privileged helper/);

assert.match(component, /sentinelAutomationControl/);
assert.match(component, /sentinel-automation-toggle/);
assert.match(component, /Automatic Full Scans ·/);
assert.match(component, /Last full scan \{formatDateTime/);
assert.match(component, /Next full scan/);
assert.match(component, /Full scans deterministic · no model tokens/);
assert.match(component, /15-minute wake: due check \+ exact known-incident probe only/);
assert.equal((component.match(/sentinelAutomationControl/g) || []).length, 1);

assert.match(css, /--security-meta-size:\s*14px/);
assert.match(css, /--security-body-size:\s*15px/);
assert.match(css, /--security-heading-size:\s*16px/);
assert.match(css, /--security-value-size:\s*19px/);
assert.match(css, /\.securityInsetScroll\s*\{[^}]*margin-inline:\s*18px[^}]*overscroll-behavior:\s*auto/s);
assert.match(css, /\.sentinelMeasurementRow\s*\{[^}]*min-height:\s*62px/s);
assert.match(css, /\.guardianActivityRow\s*\{[^}]*min-height:\s*62px/s);
assert.match(css, /\.empireOperationsSignalGrid,[\s\S]*\.securityGuardianControlGrid\s*\{\s*grid-template-columns:\s*1fr/);

for (const label of ["SOURCE GOLDEN", "INSTALLED GOLDEN", "AUTOMATION HEALTH", "REGISTRY + TOPOLOGY", "SECURITY + AUDIT", "CI + CODEQL"]) assert.match(operations, new RegExp(label.replaceAll("+", "\\+")));
for (const verb of ["radcontrol.golden_state", "router.health", "sentinel.status", "empire.map", "radcontrol.snapshot", "empire.sweep"]) assert.match(operations, new RegExp(verb.replaceAll(".", "\\.")));
assert.match(operations, /Development-system integrity/);

assert.match(guardian, /Online technology estate/);
assert.match(guardian, /PROVIDERS \+ SECURITY SYSTEMS/);
assert.match(guardian, /REGISTERED WEBSITES \+ APPS/);
assert.match(guardian, /Not connected yet/);
assert.match(guardian, /Lock Down RCE/);
assert.match(guardian, /server-owned, authenticated, confirmed, logged, and reversible/);
assert.match(guardian, /Hiding a tab is not security enforcement/);
assert.match(guardian, /Refresh Security Inventory/);
assert.doesNotMatch(guardian, /<button[^>]*>\s*Lock Down RCE/);

for (const verb of [
  "sentinel.status", "sentinel.host.current", "sentinel.host.check", "sentinel.host.deep_check",
  "sentinel.host.explain_fans", "sentinel.host.investigate", "sentinel.security.check", "sentinel.ask",
  "sentinel.host.automation.configure", "workstation.cleanup.pop_upgrade.preview", "workstation.cleanup.pop_upgrade.apply",
]) assert.match(api, new RegExp(verb.replaceAll(".", "\\.")));
assert.doesNotMatch(api, /sentinel\.action\.dry_run/);
assert.match(model, /recentHostObservations/);
assert.match(model, /SentinelScanCoverage/);
assert.match(model, /no-longer-present/);
assert.match(model, /action-available/);
assert.match(model, /resolutionSummary/);
assert.match(model, /fullScanScheduleStatus/);
assert.match(model, /knownIncidentState/);
assert.match(model, /SentinelCurrentMeasurements/);
assert.match(model, /level: 0, label: "Observation"/);
assert.match(model, /level: 5, label: "Recovery"/);

assert.match(updates, /workstation\.updates\.check/);
assert.match(updates, /workstation\.updates\.history/);
assert.doesNotMatch(updates, /workstation\.updates\.(refresh|open)|window\.confirm/);

for (const verb of ["radcontrol.golden_state", "sentinel.status", "sentinel.host.current", "sentinel.host.investigate.", "sentinel.host.automation.configure.", "workstation.cleanup.pop_upgrade.preview", "workstation.cleanup.pop_upgrade.apply"]) assert.match(bridge, new RegExp(`"${verb.replaceAll(".", "\\.")}`));
assert.doesNotMatch(bridge, /"sentinel\.action\.dry_run\./);
assert.doesNotMatch(bridge, /sudo|Command::new\([^)]*payload|shell\(true\)/);
for (const capability of ["radcontrol.golden_state", "sentinel.host.current", "sentinel.host.investigate"]) assert.match(client, new RegExp(capability.replaceAll(".", "\\.")));

assert.match(repoState, /Current Measurements”, “Recent Guardian Activity”/);
assert.match(repoState, /standalone Diagnostics and Quick Answers are intentionally/);

console.log("Sentinel contract: readable three-workspace control room, consolidated fan workflow, wide inset lists, durable truth, and unchanged capability boundaries verified");
