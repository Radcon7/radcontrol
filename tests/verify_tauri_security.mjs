import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url)));
const capability = JSON.parse(await readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url)));

assert.equal(config.app.withGlobalTauri, false);
assert.match(config.app.security.csp, /default-src 'self'/);
assert.doesNotMatch(config.app.security.csp, /\x27unsafe-eval\x27/);
assert.deepEqual(capability.permissions[0], "core:default");
assert.equal(capability.permissions.length, 2);
assert.equal(capability.permissions[1].identifier, "opener:allow-open-url");
assert.deepEqual(capability.permissions[1].allow, [
  { url: "https://*" },
  { url: "http://127.0.0.1:*" },
  { url: "http://localhost:*" },
]);
assert.doesNotMatch(JSON.stringify(capability.permissions), /reveal|shell:|fs:|clipboard/);
const bridge = await readFile(new URL("../src-tauri/src/commands/o2.rs", import.meta.url), "utf8");
assert.doesNotMatch(bridge, /"commit"/);
assert.doesNotMatch(bridge, /"kill_port\."/);
assert.match(bridge, /"contract_info"/);
assert.match(bridge, /"stop"/);
assert.match(bridge, /fn payload_verb_allowed/);
assert.match(bridge, /matches!\(verb, "files.write"\)/);
assert.doesNotMatch(bridge, /files\.new"\)/);
assert.match(bridge, /fn e2e_mode\(\) -> bool/);
assert.match(bridge, /if e2e_mode\(\) \{/);
assert.match(bridge, /pub fn e2e_project_roots\(\) -> Option<E2EProjectRoots>/);
assert.match(bridge, /std::env::var\("O2_E2E_HOME"\)\.ok\(\)\?/);
const app = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
assert.match(app, /RADCONTROL_E2E"\), Ok\(value\) if value == "1"/);
console.log("project action allowlist: commit excluded");
console.log("tauri security contract: ok");
