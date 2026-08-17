import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/projects/AddProjectModal.tsx", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const formationSource = await readFile(new URL("../src/components/projects/formationPayload.ts", import.meta.url), "utf8");
assert.match(source, /kind: "static"/);
assert.match(source, /bootstrapNow: true/);
assert.match(source, /repoPath,/);
assert.match(source, /launchLocalFirst: true/);
assert.doesNotMatch(source, /AddProjectModalPrefill|prefill\?/);
assert.doesNotMatch(appSource, /patternHint|reference_pattern/);
assert.match(source, /reference_project/);
assert.match(source, /O2 Modern Web Foundation v1/);
assert.match(source, /foundationBlueprint: "o2_web_foundation_v1"/);
assert.match(source, /What are you building\?/);
assert.match(source, /Who are the users or customers\?/);
assert.match(source, /Who will operate this\?/);
assert.match(source, /What problem or need does it address\?/);
assert.match(source, /What value will it create\?/);
assert.match(source, /What will success look like\?/);
assert.match(source, /modal-project-review/);
assert.match(source, /Back to Edit/);
assert.match(source, /REVIEW PROJECT/);
assert.match(source, /approvedProjectIntentDigest: preview\.projectionDigest/);
assert.match(appSource, /project_create\.preview/);
assert.match(appSource, /assertFormationPreviewResult/);
assert.match(appSource, /Review the O2 Project Intent before building/);
assert.doesNotMatch(source + formationSource, /shellPreference|initialSectionSet|needsKnowledgeSurface|needsTimelineSurface|operatorBrief/);
assert.doesNotMatch(source, /Create a governed localhost website starter and preserve this request/);
assert.match(source, /productSurface,/);
assert.match(source, /operatorSurface,/);
assert.match(source, /projectArchetype,/);
assert.match(source, /Architecture role/);
assert.match(source, /standalone-product/);
assert.match(formationSource, /portal-private-app/);
assert.match(formationSource, /local-control-plane/);
assert.match(source, /prototype/);
assert.match(source, /Embedded in Radcon Enterprises\?/);
assert.match(source, /Where will this tool operate\?/);
assert.match(source, /On this development machine as a local builder or control system/);
assert.match(source, /As a private application accessed through Radcon Enterprises/);
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
  assert.match(appSource + formationSource, new RegExp(capability));
}
assert.match(source, /None — use the O2 blueprint/);
console.log("project builder contract: governed blueprint and capability intake verified");
