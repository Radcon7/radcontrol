import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/projects/AddProjectModal.tsx", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(source, /kind: "static"/);
assert.match(source, /bootstrapNow: true/);
assert.match(source, /repoPath,/);
assert.match(source, /launchLocalFirst: true/);
assert.doesNotMatch(source, /AddProjectModalPrefill|prefill\?/);
assert.doesNotMatch(appSource, /patternHint|reference_pattern/);
assert.match(source, /reference_project/);
console.log("project builder contract: governed localhost starter defaults verified");
