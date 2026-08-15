import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(
  new URL("../src/components/sentinel/SentinelTab.tsx", import.meta.url),
  "utf8",
);
const api = await readFile(
  new URL("../src/components/sentinel/sentinelApi.ts", import.meta.url),
  "utf8",
);
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const bridge = await readFile(
  new URL("../src-tauri/src/commands/o2.rs", import.meta.url),
  "utf8",
);

assert.match(app, /sentinel: "Sentinel"/);
assert.doesNotMatch(app, /EmpireUtilityTab/);
assert.match(component, /RADCON SENTINEL/);
assert.match(component, /HOST GUARDIAN/);
assert.match(component, /SECURITY GUARDIAN/);
assert.match(component, /Prepare Lockdown · Dry Run/);
assert.match(component, /The LLM is not root/);
assert.match(component, /Registry presence never counts as live health/);
assert.match(component, /Execution permitted: NO · LLM connected: NO/);
for (const verb of [
  "sentinel.status", "sentinel.host.check", "sentinel.host.deep_check",
  "sentinel.host.explain_fans", "sentinel.security.check",
  "sentinel.action.dry_run", "sentinel.ask",
]) {
  assert.match(api, new RegExp(verb.replaceAll(".", "\\.")));
}
assert.match(bridge, /"sentinel.action.dry_run."/);
assert.doesNotMatch(bridge, /sudo|Command::new\([^)]*payload|shell\(true\)/);

console.log("Sentinel contract: bounded observation, dry-run, and UI trust boundary verified");
