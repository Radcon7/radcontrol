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
assert.match(source, /O2 Modern Web Foundation v1/);
assert.match(source, /foundationBlueprint: "o2_web_foundation_v1"/);
assert.match(source, /productSurface,/);
assert.match(source, /operatorSurface,/);
assert.match(source, /Embedded in Radcon Enterprises\?/);
for (const capability of [
  "needsAuthentication",
  "needsAdminSurface",
  "needsPersistentData",
  "needsFileUploads",
  "needsEmailDelivery",
  "needsCommerceSurface",
  "needsOperatorSurface",
  "needsHostedDelivery",
]) {
  assert.match(source, new RegExp(capability));
  assert.match(appSource, new RegExp(capability));
}
assert.match(source, /None — use the O2 blueprint/);
console.log("project builder contract: governed blueprint and capability intake verified");
