import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [component, guardian, security, operations, updates, model, api, app, css, bridge, client] = await Promise.all([
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
]);

assert.match(app, /sentinel: "Security"/);
assert.match(app, /<SecurityTab/);
assert.doesNotMatch(app, /EmpireUtilityTab|Empire Utility/);
assert.doesNotMatch(css, /\.empireUtility/);
assert.equal(existsSync(new URL("../src/components/common/useArtifactStore.ts", import.meta.url)), true);

for (const label of ["Radcon Sentinel", "Empire Operations", "Security Guardian"]) assert.match(security, new RegExp(label));
for (const mode of ["sentinel", "empire_operations", "security_guardian"]) assert.match(security, new RegExp(`key: "${mode}"`));
assert.match(security, /<SecurityGuardianTab/);

assert.match(component, /RADCON SENTINEL · THIS COMPUTER/);
assert.match(component, /Is my computer okay\?/);
assert.match(component, /RECENT GUARDIAN ACTIVITY/);
assert.ok(component.indexOf("Is my computer okay?") < component.indexOf("RECENT GUARDIAN ACTIVITY"));
assert.ok(component.indexOf("RECENT GUARDIAN ACTIVITY") < component.indexOf("CURRENT MEASUREMENTS"));
assert.match(component, /latest 20 maximum/);
assert.match(component, /guardianActivityScroll/);
assert.match(component, /showOlderActivity/);
assert.match(component, /Show \$\{observations\.length - 6\} older observations/);
assert.match(css, /guardianActivityRow-attention/);
assert.match(component, /Investigate \/ Fix/);
assert.match(component, /actionable \? <button/);
assert.match(component, /diagnoseObservation/);
assert.match(component, /Legacy observation · detailed measurements not retained/);
assert.match(component, /Attention was recorded; detailed reason was not retained/);
assert.doesNotMatch(component, /No recorded anomaly/);
assert.match(component, /GPU temperature/);
assert.match(component, /Baseline learning/);
assert.match(component, /sentinelBaseline/);
assert.match(component, /primaryThermalValue/);
assert.match(component, /Temperature source requires verification/);
assert.match(component, /Number\.isFinite\(gpuTemperature\) \? `\$\{gpuTemperature\}°C`/);
assert.match(component, /Refreshes every 60 seconds/);
assert.match(component, /window\.setInterval\(\(\) => void sample\(\), 60_000\)/);
assert.match(component, /not written to durable history/);
assert.match(component, /Routine checks are deterministic and use no model tokens/);
assert.match(component, /LAST DURABLE CHECK/);
assert.match(component, /DURABLE FRESHNESS/);
assert.match(component, /Automatic Guardian/);
assert.match(component, /sentinelAutomationControl/);
assert.match(component, /sentinel-automation-toggle/);
assert.match(component, /Twice daily/);
assert.match(component, /Run Health Check/);
assert.match(component, /Investigate a Problem/);
assert.match(component, /ADVANCED SYSTEM INFORMATION/);
assert.match(component, /Technical diagnostics, maintenance, automation, governance, and system evidence/);
assert.doesNotMatch(component, /<details className="sentinelDetails sentinelAdvancedWorkspace">/);
assert.match(component, /SENSORS &amp; SYSTEM EVIDENCE/);
assert.match(component, /GOVERNANCE &amp; PERMISSIONS/);
assert.match(component, /AUTOMATION &amp; SCHEDULES/);
assert.match(component, /QUICK ANSWERS/);
assert.match(component, /Get Quick Answer/);
assert.match(component, /Technical Details/);
assert.match(component, /Sensor sources, thresholds, processes, services, and provenance/);
assert.doesNotMatch(component, /SECURITY GUARDIAN/);
assert.doesNotMatch(component, /REGISTERED WEBSITES/);
assert.match(component, /AI diagnostics cannot make privileged system changes without authorization/);
assert.match(component, /Execution permitted: NO · AI model used: NO/);
assert.match(component, /HOST_CONFIGURATION_PATH/);
assert.match(component, /HOST_NOTES_PATH/);
assert.match(component, /<HostUpdatesPanel/);
assert.match(component, /data-testid="host-maintenance-boundary"/);
assert.match(component, /Safe cleanup/);
assert.match(component, /Confirm restart/);
assert.doesNotMatch(component, /<details className="sentinelDetails" open>/);

assert.match(guardian, /WEBSITES \+ FULL TECHNOLOGY ESTATE/);
assert.match(guardian, /VISIBILITY NOW/);
assert.match(guardian, /CONTROL READINESS/);
assert.match(guardian, /Not connected yet/);
assert.match(guardian, /Lock Down RCE/);
assert.match(guardian, /server-owned, authenticated, confirmed, logged, and reversible/);
assert.match(guardian, /Hiding a tab is not security enforcement/);
assert.match(guardian, /Refresh Security Inventory/);
assert.doesNotMatch(guardian, /<button[^>]*>\s*Lock Down RCE/);

for (const label of ["SOURCE GOLDEN", "INSTALLED GOLDEN", "AUTOMATION HEALTH", "REGISTRY + TOPOLOGY", "SECURITY + AUDIT", "CI + CODEQL"]) assert.match(operations, new RegExp(label.replaceAll("+", "\\+")));
assert.match(operations, /Not connected yet/);
for (const verb of ["radcontrol.golden_state", "router.health", "sentinel.status", "empire.map", "radcontrol.snapshot", "empire.sweep"]) assert.match(operations, new RegExp(verb.replaceAll(".", "\\.")));

for (const verb of [
  "sentinel.status", "sentinel.host.current", "sentinel.host.check", "sentinel.host.deep_check",
  "sentinel.host.explain_fans", "sentinel.host.investigate", "sentinel.security.check", "sentinel.ask",
  "sentinel.host.automation.configure", "workstation.cleanup.pop_upgrade.preview", "workstation.cleanup.pop_upgrade.apply",
]) assert.match(api, new RegExp(verb.replaceAll(".", "\\.")));
assert.doesNotMatch(api, /sentinel\.action\.dry_run/);
assert.match(model, /recentHostObservations/);
assert.match(model, /SentinelCurrentMeasurements/);
assert.match(model, /level: 0, label: "Observation"/);
assert.match(model, /level: 5, label: "Recovery"/);

assert.match(updates, /workstation\.updates\.check/);
assert.match(updates, /workstation\.updates\.history/);
assert.doesNotMatch(updates, /workstation\.updates\.(refresh|open)|window\.confirm/);
assert.match(css, /\.guardianActivityScroll/);
assert.match(css, /overflow-y: auto/);
assert.match(css, /\.securityControlRoom \.sentinelShell small/);
assert.match(css, /font-size: 13px/);

for (const verb of ["radcontrol.golden_state", "sentinel.status", "sentinel.host.current", "sentinel.host.investigate.", "sentinel.host.automation.configure.", "workstation.cleanup.pop_upgrade.preview", "workstation.cleanup.pop_upgrade.apply"]) assert.match(bridge, new RegExp(`"${verb.replaceAll(".", "\\.")}`));
assert.doesNotMatch(bridge, /"sentinel\.action\.dry_run\./);
assert.doesNotMatch(bridge, /sudo|Command::new\([^)]*payload|shell\(true\)/);
for (const capability of ["radcontrol.golden_state", "sentinel.host.current", "sentinel.host.investigate"]) assert.match(client, new RegExp(capability.replaceAll(".", "\\.")));

console.log("Sentinel contract: three Security control rooms, bounded host activity, truthful estate visibility, and explicit diagnosis verified");
