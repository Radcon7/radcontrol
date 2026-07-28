import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/components/agents/", import.meta.url);
const parent = await readFile(new URL("InfrastructureTab.tsx", root), "utf8");
const reports = await readFile(new URL("infrastructureReports.ts", root), "utf8");
const detail = await readFile(new URL("InfrastructureDetail.tsx", root), "utf8");
const roster = await readFile(new URL("InfrastructureRoster.tsx", root), "utf8");
const notes = await readFile(new URL("InfrastructureNotes.tsx", root), "utf8");
const modal = await readFile(
  new URL("CreateInfrastructureModal.tsx", root),
  "utf8",
);

for (const component of [
  "InfrastructureRoster",
  "InfrastructureDetail",
  "InfrastructureRunControls",
  "CreateInfrastructureModal",
]) {
  assert.ok(parent.includes(`import { ${component} }`));
  assert.ok(parent.includes(`<${component}`));
}

assert.doesNotMatch(parent, /className=\{`surfaceNavButton/);
assert.doesNotMatch(parent, /className="surfaceSummaryRow"/);
assert.doesNotMatch(parent, /className="surfaceActionStack"/);
assert.doesNotMatch(parent, /linkedRecordLines/);
assert.doesNotMatch(parent, /persistGovernedRecordNote/);
assert.match(parent, /useGovernedRecordNote/);
assert.match(parent, /listO2Files/);
assert.match(parent, /runO2PayloadParsedJson<CreateInfrastructureJson>/);
assert.match(parent, /buildInfrastructureSnapshotLog/);
assert.match(parent, /buildInfrastructureAuditLog/);
assert.match(parent, /buildGovernedEvidenceLog/);
assert.match(parent, /canonicalNotesPath: matchingProfile/);
assert.match(parent, /notePathForKey\(matchingProfile\.key\)/);

assert.match(detail, /<InfrastructureBrief/);
assert.match(detail, /<InfrastructureNotes/);
assert.match(roster, /infrastructure-row-\$\{entry\.key\}/);
assert.match(notes, /data-testid="infrastructure-notes"/);
assert.match(modal, /data-testid="modal-infrastructure-label"/);
assert.match(modal, /data-testid="modal-create-infrastructure"/);
assert.match(reports, /export function buildInfrastructureSnapshotLog/);
assert.match(reports, /export function buildInfrastructureAuditLog/);
assert.match(reports, /export function buildGovernedEvidenceLog/);
assert.doesNotMatch(reports, /onAppendLog/);

console.log(
  "infrastructure architecture contract: controller, views, and pure reports verified",
);
