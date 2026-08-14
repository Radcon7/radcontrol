import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const agentPointer = await readFile(new URL("AGENTS.md", root), "utf8");
const repoState = await readFile(new URL("docs/REPO_STATE.md", root), "utf8");
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

assert.match(repoState, /## Authority boundary/);
assert.match(repoState, /Durable writes use O2 file or producer verbs/);
assert.match(repoState, /Projects: governed registry/);
assert.match(repoState, /many visible yes\/no decisions/);
assert.match(repoState, /recommendations assist[\s\S]*explicit decisions/);
assert.match(repoState, /not an Empire-wide form-design standard/);
assert.doesNotMatch(repoState, /New Project intentionally uses an AI-only prompt/);
assert.match(repoState, /Infrastructure: governed provider\/platform assets/);
assert.match(repoState, /Agents: governed profiles/);

assert.match(policyPointers, /Explicitly scoped O2 empire contracts/);
assert.match(policyPointers, /radcontrol_ui_structure_doctrine_20260725\.md/);
assert.match(policyPointers, /radcontrol_document_persistence_doctrine_20260727\.md/);
assert.match(policyPointers, /Home-level legacy procedure notes/);
assert.match(policyPointers, /are not tracked O2 authority/);
assert.doesNotMatch(policyPointers, /record UI state \(tabs\/notes\) locally/);

console.log("governance pointers: current O2 and RadControl authority verified");
