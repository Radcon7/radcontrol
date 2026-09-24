import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [component, guardian, security, operations, updates, model, api, app, css, bridge, client, repoState, productionAcceptance, nativeAssertions] = await Promise.all([
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
  read("scripts/tauri_production_readonly.mjs"),
  read("scripts/native_sentinel_assertions.mjs"),
]);

assert.match(app, /sentinel: "Security"/);
assert.match(app, /<SecurityTab/);
assert.doesNotMatch(app, /EmpireUtilityTab|Empire Utility/);
assert.doesNotMatch(css, /\.empireUtility/);
assert.equal(existsSync(new URL("../src/components/common/useArtifactStore.ts", import.meta.url)), true);

for (const label of ["Radcon Sentinel", "Empire Operations", "Security Guardian"]) assert.match(security, new RegExp(label));
for (const mode of ["sentinel", "empire_operations", "security_guardian"]) assert.match(security, new RegExp(`key: "${mode}"`));
assert.doesNotMatch(security, /description:|<small>/, "Security workspace navigation must render title-only controls");
assert.match(security, /aria-selected=\{mode === item\.key\}/);
assert.match(css, /\.securityControlRoom > \.workspaceModeRow \.workspaceModeButton strong\s*\{[^}]*font-size:\s*var\(--security-value-size\)/s);

assert.match(component, /RADCON SENTINEL · THIS COMPUTER/);
assert.match(component, /Is my computer okay\?/);
assert.ok(!component.includes("deriveThreatState"), "the current-health hero must not consume the durable global threat state");
assert.match(component, /function operatorHeroThreat[\s\S]*HEALTHY[\s\S]*normal[\s\S]*ATTENTION[\s\S]*attention[\s\S]*PROBLEM[\s\S]*critical[\s\S]*unknown_visibility/);
assert.match(component, /sentinelThreat-\$\{heroThreat\}/);
assert.match(component, /data-current-health=\{healthState\}/);
assert.match(component, /sentinelOperatorSummary[\s\S]*CURRENT NOW/);
assert.doesNotMatch(component, /data-testid="sentinel-last-full-scan"|<small>LAST FULL SCAN<\/small>|<small>NEXT FULL SCAN<\/small>|<small>FULL-SCAN FINDING<\/small>/);
assert.doesNotMatch(css, /\.sentinelDurableReview/);
assert.match(css, /\.sentinelThreat-attention\s*\{[\s\S]*255, 205, 92/);
assert.match(css, /\.sentinelThreat-elevated,[\s\S]*\.sentinelThreat-critical\s*\{[\s\S]*255, 95, 115/);
assert.ok(component.indexOf("sentinel-current-now") < component.indexOf("sentinel-current-signals"));
assert.ok(component.indexOf("sentinel-current-signals") < component.indexOf("<SentinelEpisodes"));
assert.ok(component.indexOf("<SentinelEpisodes") < component.indexOf('<details className="sentinelAdvancedWorkspace"'));
assert.equal((component.match(/data-testid="sentinel-current-now"/g) || []).length, 1);
assert.match(component, /currentMeasurementFresh\(liveMeasurements, liveMeasurementError, now\)/);
assert.match(component, /automaticUpdaterReady\(status\)/);
assert.match(component, /operatorRecentEvents\(observations\)/);
assert.match(component, /document.visibilityState === "hidden"/);

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

assert.match(component, /slice\(0, 20\)/);
assert.match(component, /guardianActivityColumns/);
assert.match(component, /guardianActivityScroll securityInsetScroll/);
for (const label of ["Time", "State", "Source", "Action / context"]) {
  assert.match(component, new RegExp(`data-activity-label="${label.replace("/", "\\/")}"`));
}
assert.match(component, /showOlderActivity/);
assert.match(component, /Show \$\{observations\.length - 6\} older observations/);
assert.match(component, /Legacy observation · detailed measurements not retained/);
assert.match(component, /Attention was recorded; detailed reason was not retained/);
assert.match(component, /verdictReason/);
assert.match(component, /View evidence/);
assert.match(component, /scanDurationMs/);
assert.match(component, /coverageLimitations/);
assert.match(component, /normalized snapshot was not retained/);
assert.doesNotMatch(component, /No recorded anomaly/);

assert.equal((component.match(/Fans are loud/g) || []).length, 1, "the primary loud-fan action must render exactly once");
assert.match(component, /data-testid="sentinel-fans-loud"/);
assert.match(component, /"sentinel-diagnose-fix"/);
assert.match(component, /healthActions.repairableCount > 0/);
assert.match(component, /data-testid="sentinel-fix-it"/);
assert.match(component, /validUpdaterPreview\(popUpgradePreview\)/);
assert.match(component, /data-testid="sentinel-current-now"/);
assert.match(component, /CURRENT NOW/);
assert.match(css, /\.sentinelOperatorSummary small,\s*\.sentinelOperatorSummary strong\s*\{[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;/s);
assert.match(component, /data-testid="sentinel-diagnosis-result"/);
assert.match(component, /DIAGNOSING/);
assert.match(component, /DIAGNOSIS COMPLETE/);
for (const outcome of ["NO ISSUE FOUND", "FIX AVAILABLE", "NEEDS YOUR HELP", "FIXED", "STILL PRESENT"]) assert.match(component, new RegExp(outcome));
for (const resultField of ["SentinelProcessContext", "Diagnostic supporting evidence", "NEXT STEP", "Repair ran:"]) assert.match(component, new RegExp(resultField));
assert.match(component, /data-testid="sentinel-health-check"/);
assert.doesNotMatch(component, /"Review \/ Fix"/);
assert.doesNotMatch(component, /high-CPU process, stale test browser, or zombie process/);
assert.match(component, /function exactProcessEvidence/);
assert.match(component, /function exactAvailableFinding/);
assert.match(component, /function exactAvailableFindingEvidence/);
assert.match(component, /PID \$\{row\.pid \?\? "unknown"\}/);
assert.match(component, /parent evidence:/);
assert.match(component, /exactAvailableReason\(row\.reason, status\?\.host\.metrics\)/);
assert.match(component, /anomalies\.map\(\(value\) => exactAvailableReason\(value, metrics\)\)/);
assert.match(component, /exactAvailableFinding\(finding, observation\.observedValues\?\.snapshot\?\.metrics\)/);
assert.match(productionAcceptance, /visible: visible\.join\('\ \|\ '\), retained: retained\.join\('\ \|\ '\)/);
assert.match(productionAcceptance, /from "\.\/native_sentinel_assertions\.mjs"/);
assert.match(nativeAssertions, /function assertGuardianActivityGeometry/);
assert.match(nativeAssertions, /getBoundingClientRect\(\)/);
assert.match(nativeAssertions, /escapingDescendants/);
assert.match(nativeAssertions, /ancestor instanceof HTMLDetailsElement && !ancestor\.open/);
assert.match(nativeAssertions, /ancestor\.querySelector\(':scope > summary'\)\?\.contains\(node\)/);
assert.match(nativeAssertions, /rowCrossings/);
assert.match(productionAcceptance, /desktop Guardian Activity/);
assert.match(nativeAssertions, /headerColumnCount/);
assert.match(component, /interpretation\?\.state/);
assert.match(component, /interpretation\?\.message/);
assert.match(component, /Last full scan \{formatDateTime\(status\?\.host\.checkedAt\)\}/);
assert.match(component, /Review &amp; Fix|"Review & Fix"/);
assert.match(component, /Run Full Scan/);
assert.doesNotMatch(component, /function primaryAttentionReason/);
assert.match(component, /await diagnoseAndFix\("fans"\)/);
assert.doesNotMatch(component, /fanInvestigationNeedsDeepCheck|setReviewingFindings|Investigate another problem/);
assert.match(component, /await runHostDeepCheck\(\)/);
assert.match(component, /FIX AVAILABLE/);
assert.match(component, /FIXED/);
assert.match(component, /STILL PRESENT/);
assert.match(component, /No automatic repair is available/);
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
assert.match(component, /ACTIVE · EXACT ALLOWLIST/);
assert.match(component, /NOT ACTIVATED/);
assert.match(component, /Privileged helper/);
assert.match(component, /Scheduled thermal follow-up · exact pop-upgrade\.service final guard only/);
assert.match(component, /Active · one restart \+ cooldown/);
assert.doesNotMatch(component, />No automatic executor</);

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
assert.match(css, /\.guardianActivityScroll\s*\{[^}]*grid-auto-rows:\s*max-content/s);
assert.match(css, /\.guardianActivityColumns,\s*\.guardianActivityRow\s*\{[^}]*grid-template-columns:\s*minmax\(145px, 0\.72fr\)[^}]*minmax\(360px, 1\.8fr\)[^}]*align-items:\s*start/s);
assert.match(css, /@media \(max-width: 1100px\)[\s\S]*\.guardianActivityColumns\s*\{\s*display:\s*none;[\s\S]*\.guardianActivityRow\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.guardianActivityRow\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/s);
assert.match(css, /\.empireOperationsSignalGrid,[\s\S]*\.securityGuardianControlGrid\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(css, /\.empireOperationsSignalGrid\s*\{[^}]*max-height:\s*360px;[^}]*overflow-y:\s*scroll;[^}]*scrollbar-gutter:\s*stable;/s);

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

assert.match(repoState, /Concerns.*episodes|concerns.*episodes/);
assert.match(repoState, /standalone Diagnostics and Quick Answers are intentionally/);

console.log("Sentinel contract: readable three-workspace control room, consolidated fan workflow, wide inset lists, durable truth, and unchanged capability boundaries verified");
