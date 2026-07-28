import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/components/projects/", import.meta.url);
const parent = await readFile(new URL("ProjectsTab.tsx", root), "utf8");
const model = await readFile(new URL("projectModel.ts", root), "utf8");

for (const component of [
  "ProjectRoster",
  "ProjectBrief",
  "ProjectRunControls",
  "ProjectLaunchDateModal",
]) {
  assert.ok(parent.includes(`import { ${component} }`));
  assert.ok(parent.includes(`<${component}`));
}

assert.doesNotMatch(parent, /className="modalOverlay"/);
assert.doesNotMatch(parent, /className="surfaceSummaryRow"/);
assert.doesNotMatch(parent, /className="surfaceActionStack"/);
assert.doesNotMatch(parent, /className=\{`surfaceNavButton/);
assert.doesNotMatch(parent, /persistGovernedRecordNote/);
assert.match(parent, /useGovernedRecordNote/);
assert.match(parent, /await governedNote\.flush\(\)/);
assert.match(parent, /const latestProject = await onEnsureNotes\(selectedProject\)/);

assert.match(model, /export type ProjectDetail =/);
assert.match(model, /export type SortMode =/);
assert.match(model, /export function normalizeProjectStatus/);
assert.match(model, /export function filterOperatorProjects/);
assert.match(model, /export function sortProjectRows/);
assert.match(model, /export function buildProjectDetail/);
assert.match(model, /export function normalizeDateInput/);
assert.match(model, /export function recommendAgentForProject/);

console.log("projects architecture contract: typed model/view boundary verified");
