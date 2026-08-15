import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
assert.match(workflow, /permissions:\s+contents: read/);
assert.match(workflow, /npm run verify:ci-contract/);
assert.match(workflow, /npm run verify:repo-index/);
assert.match(workflow, /npm run test:formation-payload/);
assert.match(workflow, /npm run verify:formation-learning/);
assert.match(workflow, /npm run test:empire-todo/);
assert.match(workflow, /npm run verify:empire-todo/);
assert.match(workflow, /npm run test:sentinel/);
assert.match(workflow, /npm run verify:sentinel/);
assert.match(workflow, /npm run test:content-preservation/);
assert.match(workflow, /npm run verify:content-preservation/);
assert.match(workflow, /npm audit --omit=dev/);
assert.match(workflow, /cargo clippy --manifest-path src-tauri\/Cargo\.toml -- -D warnings/);
assert.doesNotMatch(workflow, /npm run (?:dev|preview|tauri:dev|test:tauri-e2e)(?:\s|$)/);
assert.doesNotMatch(workflow, /(?:vite|tauri) (?:dev|preview)(?:\s|$)/);

console.log("CI workflow contract: immutable, complete, and non-launching");
