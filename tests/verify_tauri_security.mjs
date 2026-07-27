import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url)));
const capability = JSON.parse(await readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url)));

assert.equal(config.app.withGlobalTauri, false);
assert.match(config.app.security.csp, /default-src 'self'/);
assert.doesNotMatch(config.app.security.csp, /\x27unsafe-eval\x27/);
assert.deepEqual(capability.permissions[0], "core:default");
assert.equal(capability.permissions[1].identifier, "opener:allow-open-url");
assert.doesNotMatch(JSON.stringify(capability.permissions), /reveal/);
console.log("tauri security contract: ok");
