import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const agentPointer = await readFile(new URL("AGENTS.md", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
const repoState = await readFile(new URL("docs/REPO_STATE.md", root), "utf8");
const migrationManifest = await readFile(
  new URL("docs/SENTINEL_PHASE1_MIGRATION.md", root),
  "utf8",
);
const preservationManifest = JSON.parse(await readFile(
  new URL("docs/RADCONTROL_CONTENT_PRESERVATION.json", root),
  "utf8",
));
const policyPointers = await readFile(
  new URL("docs/POLICY_POINTERS.md", root),
  "utf8",
);

for (const staleInstruction of [
  "Single-response rule",
  "overwrite via VS Code Explorer",
  "use grep (assume no rg)",
]) {
  assert.doesNotMatch(agentPointer, new RegExp(staleInstruction));
}

assert.match(agentPointer, /local ephemeral view state/);
assert.match(agentPointer, /must not duplicate O2 policy or durable data/);
assert.match(agentPointer, /## RadControl launch boundary/);
assert.match(agentPointer, /Do not launch RadControl through localhost/);
assert.match(agentPointer, /current task explicitly authorizes that launch/);
assert.match(agentPointer, /General permission[\s\S]*is not launch authorization/);
assert.match(agentPointer, /no new listener remains afterward/);
assert.match(agentPointer, /product-local execution authority, not an Empire-wide rule/);
assert.match(agentPointer, /## RadControl content preservation boundary/);
assert.match(agentPointer, /Authorization to remove one asset or replace one destination is not authority/);

assert.match(repoState, /## Authority boundary/);
assert.match(repoState, /Durable writes use O2 file or producer verbs/);
assert.match(repoState, /Projects: governed registry/);
assert.match(repoState, /many visible yes\/no decisions/);
assert.match(repoState, /recommendations assist[\s\S]*explicit decisions/);
assert.match(repoState, /not an Empire-wide form-design standard/);
assert.doesNotMatch(repoState, /New Project intentionally uses an AI-only prompt/);
assert.match(repoState, /Infrastructure: governed provider\/platform assets/);
assert.match(repoState, /Agents: governed profiles/);
assert.match(repoState, /Security: the sole Radcon Sentinel command surface/);
assert.match(repoState, /Levels 1-5 remain visibly not activated/);
assert.match(repoState, /system76-workstation[\s\S]*excluded from this roster/);
assert.match(repoState, /structured Empire To-Do workspace/);
assert.match(repoState, /must not be launched through localhost/);
assert.match(repoState, /publication,[\s\S]*does not grant launch authorization/);
assert.match(repoState, /never run it under ordinary verification authorization/);
assert.match(repoState, /## Content preservation/);
assert.match(repoState, /RADCONTROL_CONTENT_PRESERVATION\.json/);

assert.match(readme, /Do not run this E2E/);
assert.match(readme, /tauri-driver[\s\S]*WebDriver TCP listeners/);
assert.match(readme, /Ordinary build or[\s\S]*authorization is not sufficient/);

assert.match(migrationManifest, /Empire Utility navigation destination \| Deleted/);
assert.match(migrationManifest, /System76 roster item[\s\S]*Security > Host Guardian/);
assert.match(migrationManifest, /Safe cleanup preview\/apply \| Deleted/);
assert.match(migrationManifest, /Unknown,[\s\S]*remains visibly non-healthy/);
assert.match(migrationManifest, /Superseded in part by the content-preservation recovery/);
assert.match(migrationManifest, /Security > Empire Operations/);
assert.match(migrationManifest, /Agents > Repository Routers/);
assert.equal(preservationManifest.goldenRadControlCommit, "b1431ac0ac5c4c0e83f794d7558d31ba0f133630");

assert.match(policyPointers, /Explicitly scoped O2 empire contracts/);
assert.match(policyPointers, /radcontrol_ui_structure_doctrine_20260725\.md/);
assert.match(policyPointers, /radcontrol_document_persistence_doctrine_20260727\.md/);
assert.match(policyPointers, /Home-level legacy procedure notes/);
assert.match(policyPointers, /are not tracked O2 authority/);
assert.doesNotMatch(policyPointers, /record UI state \(tabs\/notes\) locally/);
assert.match(policyPointers, /sentinel-security\/v1\/README\.md/);

console.log("governance pointers: current O2 and RadControl authority verified");
