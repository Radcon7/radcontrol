import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseCandidateListSummary,
  parseSafeMemoryStatus,
} from "../src/components/agents/governanceLearningModel.ts";

const root = new URL("../src/components/agents/", import.meta.url);
const parent = await readFile(new URL("InfrastructureTab.tsx", root), "utf8");
const reports = await readFile(new URL("infrastructureReports.ts", root), "utf8");
const model = await readFile(new URL("infrastructureModel.ts", root), "utf8");
const detail = await readFile(new URL("InfrastructureDetail.tsx", root), "utf8");
const workstation = await readFile(new URL("WorkstationHealthPanel.tsx", root), "utf8");
const governanceLearning = await readFile(new URL("GovernanceLearningStatus.tsx", root), "utf8");
const workstationOperations = await readFile(new URL("WorkstationOperationsPanel.tsx", root), "utf8");
const workstationUpdates = await readFile(new URL("WorkstationUpdatesPanel.tsx", root), "utf8");
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
assert.match(detail, /<WorkstationOperationsPanel/);
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
assert.match(workstation, /LearningCandidateResult/);
assert.match(workstation, /learningCandidateLabel/);
assert.match(workstation, /doctrine was not changed/);
assert.match(workstation, /Governed learning queue/);
assert.match(workstation, /legacy candidate result was withheld/);
assert.match(workstation, /<GovernanceLearningStatus/);
assert.match(governanceLearning, /lesson\.candidate\.list/);
assert.match(governanceLearning, /codex\.memory\.status/);
assert.match(governanceLearning, /Proposed and accepted candidates remain non-authoritative/);
assert.match(governanceLearning, /raw content hidden/);
assert.match(governanceLearning, /No promotion was inferred/);
assert.match(workstation, /current CPU/);
assert.match(workstation, /system authorization popup/);
assert.match(workstation, /Likely cause right now/);
assert.match(workstation, /VS Code workspace contains/);
assert.match(workstation, /requiresUserFollowup/);
assert.match(workstationOperations, /Health & cleanup/);
assert.match(workstationOperations, /Updates/);
for (const verb of [
  "workstation.updates.check",
  "workstation.updates.history",
  "workstation.updates.refresh",
  "workstation.updates.open",
]) {
  assert.match(workstationUpdates, new RegExp(verb.replaceAll(".", "\\.")));
}
assert.match(workstationUpdates, /Open Official Updater/);
assert.match(workstationUpdates, /does not install updates/);

const candidateSummary = parseCandidateListSummary({
  ok: true,
  outcome: "listed",
  totalMatched: 1,
  candidates: [{
    id: "lesson-82f3663ea79ae19a",
    title: "Keep credential scans secret-safe",
    status: "promoted",
    relatedCatalogIds: ["o2.credential-hygiene"],
    promotionState: "authority-linked",
    authorityLinked: true,
    authorityLinks: [{
      id: "playbook.command-approval-credential-hygiene",
      title: "OP-013 Command-Approval Credential Hygiene",
      repository: "o2",
      path: "docs/O2_OPERATIONAL_PLAYBOOK.md#op-013",
      authorityClass: "global-default",
      lifecycleStatus: "active",
    }],
    verifiedResolution: "This lesson body must not cross the UI model boundary.",
  }],
}, "promoted");
assert.equal(candidateSummary.totalMatched, 1);
assert.equal(candidateSummary.candidates[0].status, "promoted");
assert.equal("verifiedResolution" in candidateSummary.candidates[0], false);
assert.throws(
  () => parseCandidateListSummary({
    ok: true,
    outcome: "listed",
    totalMatched: 1,
    candidates: [{
      id: "lesson-82f3663ea79ae19a",
      title: "Still proposed",
      status: "proposed",
      relatedCatalogIds: [],
      promotionState: null,
      authorityLinked: false,
      authorityLinks: [],
    }],
  }, "promoted"),
  /status filter/,
);

const memoryStatus = parseSafeMemoryStatus({
  ok: true,
  enabled: true,
  useMemories: true,
  generateMemories: true,
  disableOnExternalContext: true,
  minimumRateLimitRemainingPercent: 35,
  memoryFileCount: 0,
  rawMemoryContentIncluded: false,
  store: {
    integrity: "ok",
    jobCount: 0,
    failedJobCount: 0,
    generatedInputCount: 0,
    lastSuccessfulGeneration: null,
  },
  extensionHost: { available: true, supportsMemories: true, version: "codex-cli test" },
  shellCli: { available: true, supportsMemories: false, version: "codex-cli old" },
  memoryContent: "This raw memory must not cross the UI model boundary.",
});
assert.equal(memoryStatus.store.integrity, "ok");
assert.equal("memoryContent" in memoryStatus, false);
assert.throws(
  () => parseSafeMemoryStatus({ ...memoryStatus, ok: true, rawMemoryContentIncluded: true }),
  /not safe/,
);

console.log(
  "infrastructure architecture contract: controller, views, and pure reports verified",
);
