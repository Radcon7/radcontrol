import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parsePortStatusBatch,
  parseProjectListEnvelope,
  registryToProjects,
} from "../src/components/projects/helpers.ts";
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
  archetype:
    key === "o2"
      ? "governance"
      : key === "radcontrol"
        ? "local-control-plane"
        : key === "radconenterprises"
          ? "portal-shell"
          : ["radstock", "radcrm", "radfamily", "radwolfe", "radcalendar"].includes(key)
            ? "portal-private-app"
            : "standalone-product",
  repoPath: `/tmp/${key}`,
  repoAvailable: true,
  retired: false,
}));
const normalizedHistorical = registryToProjects(historicalRegistryFixture);
assert.deepEqual(normalizedHistorical.map((project) => project.key), manifest.projects.historicalRegisteredKeys);
assert.deepEqual(
  filterOperatorProjects(normalizedHistorical).map((project) => project.key),
  manifest.projects.historicalVisibleKeys,
);

const futureProject = {
  key: "future-product",
  label: "Future Product",
  kind: "nextjs",
  archetype: "standalone-product",
  repoPath: "/tmp/future-product",
  repoAvailable: true,
  retired: false,
};
assert.equal(
  filterOperatorProjects(registryToProjects([...historicalRegistryFixture, futureProject]))
    .some((project) => project.key === futureProject.key),
  true,
  "new governed projects must remain visible without a copied allowlist",
);
assert.equal(
  filterOperatorProjects([
    ...normalizedHistorical,
    { key: "future-governance", label: "Future Governance", archetype: "governance" },
    { key: "future-control", label: "Future Control", archetype: "local-control-plane" },
  ]).some((project) => project.key.startsWith("future-")),
  false,
  "governance and control-plane projects must be classified by archetype, not copied keys",
);

assert.deepEqual(
  parseProjectListEnvelope({ ok: true, projects: [futureProject] }).map((project) => project.key),
  [futureProject.key],
);
assert.throws(() => parseProjectListEnvelope([futureProject]), /bare project array/);
assert.throws(() => parseProjectListEnvelope(JSON.stringify({ ok: true, projects: [futureProject] })), /double-encoded JSON/);
assert.throws(() => parseProjectListEnvelope({ ok: true }), /omitted the projects array/);
assert.throws(() => parseProjectListEnvelope({ ok: false, error: "registry_missing", message: "Registry unavailable" }), /registry_missing: Registry unavailable/);
assert.throws(
  () => parseProjectListEnvelope({ ok: true, projects: [{ ...futureProject, archetype: "mystery" }] }),
  /known archetype/,
);
assert.throws(() => registryToProjects({ projects: [] }), /must be an array/);
assert.throws(
  () => registryToProjects([{ ...futureProject, repoAvailable: false }]),
  /unavailable repository root/,
);
assert.throws(
  () => registryToProjects([{ ...futureProject, retired: "false" }]),
  /field retired must be a boolean/,
);
assert.throws(
  () => registryToProjects([{ ...futureProject, port: "3000" }]),
  /field port must be an integer/,
);
assert.throws(
  () => registryToProjects([futureProject, futureProject]),
  /duplicate key: future-product/,
);

assert.deepEqual(
  parsePortStatusBatch(
    { ok: true, ports: [{ port: 3111, listening: false }, { port: 3112, listening: true }] },
    [3111, 3112],
  ),
  {
    3111: { port: 3111, listening: false, pid: null, cmd: null, err: null },
    3112: { port: 3112, listening: true, pid: null, cmd: null, err: null },
  },
);
assert.throws(
  () => parsePortStatusBatch({ ok: true, ports: [{ port: 3111, listening: false }] }, [3111, 3112]),
  /omitted a requested port/,
);
assert.throws(
  () => parsePortStatusBatch({ ok: true, ports: [{ port: 3111.5, listening: false }] }, [3111.5]),
  /row 0 is invalid/,
);

const profiles = buildInfrastructureProfiles(normalizedHistorical);
const expectedProfileKeys = manifest.infrastructure
  .filter((entry) => entry.historicalState === "visible" && entry.key !== HOST_GUARDIAN_ASSET_KEY)
  .map((entry) => entry.key);
assert.deepEqual(profiles.map((profile) => profile.key), expectedProfileKeys);
const futureProfiles = buildInfrastructureProfiles([...normalizedHistorical, futureProject]);
assert.ok(
  futureProfiles
    .filter((profile) => !["resend", "dqotd-workspace"].includes(profile.key))
    .every((profile) => profile.relatedProjectKeys.includes(futureProject.key)),
  "new governed products must reach infrastructure starter profiles without an arbitrary cap",
);

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
