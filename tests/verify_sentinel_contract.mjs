import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/components/sentinel/SentinelTab.tsx", import.meta.url), "utf8");
const updates = await readFile(new URL("../src/components/sentinel/HostUpdatesPanel.tsx", import.meta.url), "utf8");
const model = await readFile(new URL("../src/components/sentinel/sentinelModel.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../src/components/sentinel/sentinelApi.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
const bridge = await readFile(new URL("../src-tauri/src/commands/o2.rs", import.meta.url), "utf8");

assert.match(app, /sentinel: "Security"/);
assert.match(app, /data-testid=\{`tab-\$\{t\}`\}/);
assert.doesNotMatch(app, /EmpireUtilityTab|Empire Utility/);
assert.match(component, /RADCON SENTINEL/);
assert.match(component, /Empire Security Command Center/);
assert.match(component, /HOST GUARDIAN/);
assert.match(component, /SECURITY GUARDIAN/);
assert.match(model, /UNKNOWN VISIBILITY/);
assert.match(component, /RECENT ACTIVITY/);
assert.match(component, /AUTHORITY/);
assert.match(component, /TRIGGERS \+ SCHEDULES/);
assert.match(component, /The LLM is not root/i);
assert.match(component, /Registry presence never counts as live health/i);
assert.match(component, /Execution permitted: NO · LLM connected: NO/);
assert.match(component, /HOST_CONFIGURATION_PATH/);
assert.match(component, /HOST_NOTES_PATH/);
assert.match(component, /registerBeforeTabChangeSaver/);
assert.match(component, /<HostUpdatesPanel/);
for (const label of [
  "Run Health Check",
  "Deep Check",
  "Check Security",
  "Refresh",
  "Check Docker",
  "Check Network",
]) {
  assert.match(component, new RegExp(label));
}
for (const filter of ["All", "Events", "Actions", "Incidents", "Host", "Security"]) {
  assert.match(component, new RegExp(`label: "${filter}"`));
}
for (const verb of [
  "sentinel.status",
  "sentinel.host.check",
  "sentinel.host.deep_check",
  "sentinel.host.explain_fans",
  "sentinel.security.check",
  "sentinel.ask",
]) {
  assert.match(api, new RegExp(verb.replaceAll(".", "\\.")));
}
assert.doesNotMatch(api, /sentinel\.action\.dry_run/);
assert.doesNotMatch(component, /Prepare Lockdown|sentinel\.action\.dry_run/);
assert.match(updates, /workstation\.updates\.check/);
assert.match(updates, /workstation\.updates\.history/);
assert.match(updates, /refreshes no catalogs and installs nothing/);
assert.doesNotMatch(updates, /workstation\.updates\.(refresh|open)|window\.confirm/);
assert.match(model, /level: 0, label: "Observation"/);
assert.match(model, /level: 5, label: "Recovery"/);
assert.match(model, /deriveThreatState/);
assert.match(model, /buildSentinelActivity/);
assert.match(model, /sentinelCapabilityLevelState/);
assert.doesNotMatch(css, /\.workstation[A-Z]/);
assert.match(css, /\.sentinelActivity/);
assert.match(css, /\.sentinelLevelList/);
assert.doesNotMatch(bridge, /"workstation\.(health|cleanup|codex)/);
assert.doesNotMatch(bridge, /"workstation\.updates\.(refresh|open)"/);
assert.doesNotMatch(bridge, /"sentinel\.action\.dry_run\./);
assert.match(bridge, /"workstation\.updates\.check"/);
assert.match(bridge, /"workstation\.updates\.history"/);
assert.doesNotMatch(bridge, /sudo|Command::new\([^)]*payload|shell\(true\)/);

console.log("Sentinel contract: Security command center, read-only Phase 1, and migrated host record verified");
