import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/components/projects/", import.meta.url);
const parent = await readFile(new URL("ProjectsTab.tsx", root), "utf8");
const model = await readFile(new URL("projectModel.ts", root), "utf8");
const controls = await readFile(new URL("ProjectRunControls.tsx", root), "utf8");
const helpers = await readFile(new URL("helpers.ts", root), "utf8");
const types = await readFile(new URL("types.ts", root), "utf8");
const app = await readFile(new URL("../../App.tsx", root), "utf8");

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
assert.match(model, /launchLabel: project\.operatorUrl \? "Launch Radcon Portal" : "Launch Localhost"/);
assert.match(controls, /\{detail\.launchLabel\}/);
assert.match(controls, /Launch Website/);
assert.match(app, /const out = await runO2\(`Start \$\{p\.label\}`, p\.o2StartKey\)/);
assert.match(app, /if \(out === null\)/);
assert.match(app, /return \(await runO2\(`Start \$\{host\.label\}`, host\.o2StartKey\)\) !== null/);
assert.match(app, /await openProjectUrl\(\{ \.\.\.latest, url: finalUrl \}\)/);
assert.match(app, /export function cacheFreshLocalUrl/);
assert.match(app, /url\.searchParams\.set\("_radcontrol_open"/);
assert.match(app, /await tryAutoOpen\(openUrl\)/);
assert.match(app, /p\?\.operatorUrl/);
assert.match(app, /if \(!\(await ensureLaunchHost\(latest\)\)\)/);
assert.match(helpers, /launchUrl: asNonEmptyString\(r\.launchUrl\)/);
assert.match(helpers, /operatorUrl: asNonEmptyString\(r\.operatorUrl\)/);
assert.match(helpers, /websiteUrl: asNonEmptyString\(r\.websiteUrl\)/);
assert.match(helpers, /launchHostKey: asNonEmptyString\(r\.launchHostKey\)/);
assert.match(types, /launchUrl\?: string/);
assert.match(types, /operatorUrl\?: string/);
assert.match(types, /websiteUrl\?: string/);
assert.match(types, /launchHostKey\?: string/);

console.log("projects architecture contract: typed model/view boundary verified");
