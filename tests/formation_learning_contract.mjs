import assert from "node:assert/strict";
import { assertFormationLearningInheritance } from "../src/components/projects/formationLearning.ts";

const valid = {
  routerContractVersion: "1",
  projectKey: "fixture",
  projectArchetype: "standalone-product",
  qualityProfile: "initial-standalone-product-static-v1",
  productAuthorityPath: "docs/REPO_STATE.md",
  correctionLearningContractVersion: "1",
  boundedQueryRouting: true,
  correctionReviewAvailable: true,
  roadblockReviewAvailable: true,
  qualityReviewAvailable: true,
  correctionCloseoutRequired: true,
  promotionMode: "human-reviewed-only",
  memory: {
    hostLocal: true,
    optional: true,
    authority: false,
    inherited: false,
    projectFilesCreated: false,
    projectConfigurationCreated: false,
  },
  sourceOwnership: {
    productBehavior: "repository-local-authority",
    reusableLearning: "o2-candidate-lifecycle",
    runtimeMemory: "host-local-optional-context",
  },
  conformance: { ok: true, status: "conformant", errors: [] },
};

assert.equal(
  assertFormationLearningInheritance(valid, {
    projectKey: "fixture",
    projectArchetype: "standalone-product",
  }).productAuthorityPath,
  "docs/REPO_STATE.md",
);

for (const [label, mutation] of [
  ["missing evidence", null],
  ["wrong project", { ...valid, projectKey: "other" }],
  ["missing correction route", { ...valid, correctionReviewAvailable: false }],
  ["missing product authority", { ...valid, productAuthorityPath: undefined }],
  ["memory inherited", { ...valid, memory: { ...valid.memory, inherited: true } }],
  ["missing source ownership", { ...valid, sourceOwnership: undefined }],
  ["failed conformance", { ...valid, conformance: { ok: false, status: "failed" } }],
]) {
  assert.throws(
    () => assertFormationLearningInheritance(mutation, {
      projectKey: "fixture",
      projectArchetype: "standalone-product",
    }),
    /learning inheritance/i,
    label,
  );
}

console.log("formation learning contract: governed inheritance fails closed");
