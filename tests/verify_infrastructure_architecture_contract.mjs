import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/components/agents/", import.meta.url);
const parent = await readFile(new URL("InfrastructureTab.tsx", root), "utf8");
const reports = await readFile(new URL("infrastructureReports.ts", root), "utf8");
const model = await readFile(new URL("infrastructureModel.ts", root), "utf8");
const detail = await readFile(new URL("InfrastructureDetail.tsx", root), "utf8");
const workstation = await readFile(new URL("WorkstationHealthPanel.tsx", root), "utf8");
const roster = await readFile(new URL("InfrastructureRoster.tsx", root), "utf8");
const notes = await readFile(new URL("InfrastructureNotes.tsx", root), "utf8");
const configuration = await readFile(
  new URL("InfrastructureConfigurationNote.tsx", root),
  "utf8",
);
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
assert.match(detail, /<InfrastructureConfigurationNote/);
assert.match(detail, /<InfrastructureNotes/);
assert.match(detail, /<WorkstationHealthPanel/);
assert.ok(
  detail.indexOf("<InfrastructureConfigurationNote") <
    detail.indexOf("<InfrastructureNotes"),
);
assert.match(model, /export function configurationPathForKey/);
assert.match(model, /configurationPathForKey\(profile\.key\)/);
assert.match(model, /configurationPathForKey\(asset\.assetKey\)/);
assert.doesNotMatch(model, /profile\.configurationPath/);
assert.match(model, /key: "resend"/);
assert.match(model, /key: "dqotd-workspace"/);
assert.match(model, /providerProfileCounts/);
assert.match(roster, /infrastructure-row-\$\{entry\.key\}/);
assert.match(notes, /data-testid="infrastructure-notes"/);
assert.match(
  configuration,
  /data-testid="infrastructure-configuration-note"/,
);
assert.match(configuration, /<textarea/);
assert.match(configuration, /onChange=/);
assert.match(parent, /recordKey: selectedEntry \? `configuration:\$\{selectedEntry\.key\}`/);
assert.match(parent, /configurationNote\.flush/);
assert.match(parent, /onConfigurationChange=\{configurationNote\.onTextChange\}/);
assert.match(modal, /data-testid="modal-infrastructure-label"/);
assert.match(modal, /data-testid="modal-create-infrastructure"/);
assert.match(reports, /export function buildInfrastructureSnapshotLog/);
assert.match(reports, /export function buildInfrastructureAuditLog/);
assert.match(reports, /export function buildGovernedEvidenceLog/);
assert.doesNotMatch(reports, /onAppendLog/);
for (const verb of [
  "workstation.health.check",
  "workstation.health.history",
  "workstation.cleanup.preview",
  "workstation.cleanup.apply",
  "workstation.codex.review",
]) {
  assert.match(workstation, new RegExp(verb.replaceAll(".", "\\.")));
}
assert.match(workstation, /Preview Safe Cleanup/);
assert.match(workstation, /window\.confirm/);
assert.match(workstation, /Ask Codex/);
assert.match(workstation, /usually under 2 minutes/);
assert.match(workstation, /Latest Terra result/);
assert.match(workstation, /workstationLog/);
assert.match(workstation, /preparedCandidates/);
assert.match(workstation, /current CPU/);
assert.match(workstation, /system authorization popup/);
assert.match(workstation, /Likely cause right now/);
assert.match(workstation, /VS Code workspace contains/);

console.log(
  "infrastructure architecture contract: controller, views, and pure reports verified",
);
