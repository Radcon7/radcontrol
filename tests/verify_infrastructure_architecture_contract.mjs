import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  HOST_GUARDIAN_ASSET_KEY,
  buildInfrastructureEntries,
  buildInfrastructureProfiles,
} from "../src/components/agents/infrastructureModel.ts";

const root = new URL("../src/components/agents/", import.meta.url);
const parent = await readFile(new URL("InfrastructureTab.tsx", root), "utf8");
const reports = await readFile(new URL("infrastructureReports.ts", root), "utf8");
const model = await readFile(new URL("infrastructureModel.ts", root), "utf8");
const detail = await readFile(new URL("InfrastructureDetail.tsx", root), "utf8");
const roster = await readFile(new URL("InfrastructureRoster.tsx", root), "utf8");
const notes = await readFile(new URL("InfrastructureNotes.tsx", root), "utf8");
const configuration = await readFile(new URL("InfrastructureConfigurationNote.tsx", root), "utf8");
const modal = await readFile(new URL("CreateInfrastructureModal.tsx", root), "utf8");

for (const component of [
  "InfrastructureRoster",
  "InfrastructureDetail",
  "InfrastructureRunControls",
  "CreateInfrastructureModal",
]) {
  assert.ok(parent.includes(`import { ${component} }`));
  assert.ok(parent.includes(`<${component}`));
}

assert.doesNotMatch(parent, /system76|WorkstationOperationsPanel/);
assert.doesNotMatch(detail, /system76|Workstation/);
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
assert.ok(detail.indexOf("<InfrastructureConfigurationNote") < detail.indexOf("<InfrastructureNotes"));
assert.match(model, /export const HOST_GUARDIAN_ASSET_KEY/);
assert.match(model, /visibleAssets/);
assert.doesNotMatch(model, /assetType: "workstation"/);
assert.doesNotMatch(model, /label: "System76 Workstation"/);
assert.match(model, /export function configurationPathForKey/);
assert.match(model, /configurationPathForKey\(profile\.key\)/);
assert.match(model, /configurationPathForKey\(asset\.assetKey\)/);
assert.match(model, /key: "resend"/);
assert.match(model, /key: "dqotd-workspace"/);
assert.match(model, /providerProfileCounts/);
assert.match(roster, /infrastructure-row-\$\{entry\.key\}/);
assert.match(notes, /data-testid="infrastructure-notes"/);
assert.match(configuration, /data-testid="infrastructure-configuration-note"/);
assert.match(modal, /data-testid="modal-infrastructure-label"/);
assert.match(modal, /data-testid="modal-create-infrastructure"/);
assert.match(reports, /export function buildInfrastructureSnapshotLog/);
assert.match(reports, /export function buildInfrastructureAuditLog/);
assert.match(reports, /export function buildGovernedEvidenceLog/);

for (const deadComponent of [
  "WorkstationHealthPanel.tsx",
  "WorkstationOperationsPanel.tsx",
  "WorkstationUpdatesPanel.tsx",
  "RouterHealthPanel.tsx",
]) {
  assert.equal(existsSync(new URL(deadComponent, root)), false, `${deadComponent} must be removed`);
}

const profiles = buildInfrastructureProfiles([]);
assert.equal(profiles.some((profile) => profile.key === HOST_GUARDIAN_ASSET_KEY), false);
const fixtureAsset = {
  assetKey: HOST_GUARDIAN_ASSET_KEY,
  label: "System76 Workstation",
  assetType: "workstation",
  provider: "system76",
  owningOrg: "radcon",
  environmentScope: "local",
  governedState: "active",
  relatedProjectKeys: ["radcontrol"],
  primaryConsoleUrl: "",
  canonicalDomain: "",
  notesPath: "docs/infrastructure/assets/system76-workstation/NOTES.md",
  inventoryArtifactPath: "docs/infrastructure/records/system76-workstation/01_inventory.json",
  originArtifactPath: "docs/infrastructure/records/system76-workstation/00_origin.md",
  updatedAt: "2026-08-15T00:00:00Z",
  mtime: 1,
};
const unrelatedAsset = {
  ...fixtureAsset,
  assetKey: "custom-provider",
  label: "Custom Provider",
  assetType: "api_surface",
  provider: "custom",
};
const entries = buildInfrastructureEntries([fixtureAsset, unrelatedAsset], profiles);
assert.equal(entries.some((entry) => entry.key === HOST_GUARDIAN_ASSET_KEY), false);
assert.equal(entries.some((entry) => entry.key === "custom-provider"), true);
assert.equal(entries.some((entry) => entry.key === "github"), true);

console.log("infrastructure architecture: workstation hidden, dead UI removed, unrelated assets preserved");
