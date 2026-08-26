import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/components/agents/", import.meta.url);
const parent = await readFile(new URL("AgentsTab.tsx", root), "utf8");
const routerHealth = await readFile(new URL("RouterHealthPanel.tsx", root), "utf8");
const model = await readFile(new URL("agentModel.ts", root), "utf8");

for (const component of [
  "AgentRoster",
  "AgentBrief",
  "AgentNotes",
  "AgentFocusLimits",
  "CreateAgentModal",
]) {
  assert.ok(parent.includes(`import { ${component} }`));
  assert.ok(parent.includes(`<${component}`));
}

assert.doesNotMatch(parent, /className="modalOverlay"/);
assert.doesNotMatch(parent, /className="surfaceSummaryRow"/);
assert.doesNotMatch(parent, /className=\{`surfaceNavButton/);
assert.match(parent, /useGovernedRecordNote/);
assert.match(parent, /export function AgentsTab/);
assert.match(parent, /data-testid="new-agent"/);
assert.match(parent, /Repository Routers/);
assert.match(parent, /<RouterHealthPanel/);
assert.match(routerHealth, /"router\.health"/);
assert.match(routerHealth, /data-testid="router-health-panel"/);
assert.doesNotMatch(parent, /persistGovernedRecordNote/);
assert.match(parent, /runO2PayloadParsedJson<CreateAgentProfileJson>/);

assert.match(model, /export type AgentProfile =/);
assert.match(model, /export type AgentProfileDraft =/);
assert.match(model, /export function normalizeAgentProfile/);
assert.match(model, /export function sortAgentProfiles/);
assert.match(model, /export function notePathForProfile/);
assert.match(
  model,
  /DEFAULT_CONTEXT_ARTIFACT =\s*\n\s*"docs\/radcontrol\/empire_blueprint\/empire_blueprint_20260822\.md"/,
);
assert.match(model, /contextArtifact: DEFAULT_CONTEXT_ARTIFACT/);
assert.doesNotMatch(model, /radcontrol_transition_blueprint_20260724\.md/);

console.log("agents architecture contract: typed model/view boundary verified");
