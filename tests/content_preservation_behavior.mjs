import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registryToProjects } from "../src/components/projects/helpers.ts";
import { filterOperatorProjects } from "../src/components/projects/projectModel.ts";
import {
  HOST_GUARDIAN_ASSET_KEY,
  buildInfrastructureEntries,
  buildInfrastructureProfiles,
} from "../src/components/agents/infrastructureModel.ts";

const manifest = JSON.parse(
  await readFile(new URL("../docs/RADCONTROL_CONTENT_PRESERVATION.json", import.meta.url)),
);

assert.deepEqual(manifest.projects.finalRegisteredKeys, manifest.projects.historicalRegisteredKeys);
assert.deepEqual(manifest.projects.finalVisibleKeys, manifest.projects.historicalVisibleKeys);

const historicalRegistryFixture = manifest.projects.historicalRegisteredKeys.map((key) => ({
  key,
  label: key,
  kind: key === "o2" ? "ops" : key === "radcontrol" ? "tauri" : "nextjs",
  retired: false,
}));
const normalizedHistorical = registryToProjects(historicalRegistryFixture);
assert.deepEqual(normalizedHistorical.map((project) => project.key), manifest.projects.historicalRegisteredKeys);
assert.deepEqual(
  filterOperatorProjects(normalizedHistorical).map((project) => project.key),
  manifest.projects.historicalVisibleKeys,
);

const futureProject = { key: "future-product", label: "Future Product", kind: "nextjs", retired: false };
assert.equal(
  filterOperatorProjects(registryToProjects([...historicalRegistryFixture, futureProject]))
    .some((project) => project.key === futureProject.key),
  true,
  "new governed projects must remain visible without a copied allowlist",
);

const profiles = buildInfrastructureProfiles(normalizedHistorical);
const expectedProfileKeys = manifest.infrastructure
  .filter((entry) => entry.historicalState === "visible" && entry.key !== HOST_GUARDIAN_ASSET_KEY)
  .map((entry) => entry.key);
assert.deepEqual(profiles.map((profile) => profile.key), expectedProfileKeys);

const baseAsset = {
  assetType: "api_surface",
  provider: "custom",
  owningOrg: "radcon",
  environmentScope: "local",
  governedState: "active",
  relatedProjectKeys: [],
  primaryConsoleUrl: "",
  canonicalDomain: "",
  notesPath: "",
  inventoryArtifactPath: "",
  originArtifactPath: "",
  updatedAt: "2026-08-15T00:00:00Z",
  mtime: 1,
};
const entries = buildInfrastructureEntries([
  { ...baseAsset, assetKey: HOST_GUARDIAN_ASSET_KEY, label: "System76 Workstation", provider: "system76", assetType: "workstation" },
  { ...baseAsset, assetKey: "future-provider", label: "Future Provider" },
], profiles);
assert.equal(entries.some((entry) => entry.key === HOST_GUARDIAN_ASSET_KEY), false);
assert.equal(entries.some((entry) => entry.key === "future-provider"), true);
for (const expectedKey of expectedProfileKeys) {
  assert.equal(entries.some((entry) => entry.key === expectedKey), true, `${expectedKey} must remain visible`);
}

console.log("content preservation behavior: registry-driven Projects and Infrastructure invariants verified");
