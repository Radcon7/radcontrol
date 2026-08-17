import assert from "node:assert/strict";
import {
  architectureForOperationsPlacement,
  normalizeFormationStartPayload,
} from "../src/components/projects/formationPayload.ts";

const base = {
  key: "fixture", label: "Fixture", org: "radcon", kind: "static",
  repoPath: "/tmp/fixture", mission: "Test classification", launchLocalFirst: true,
};

function normalize(overrides) {
  return normalizeFormationStartPayload({ ...base, ...overrides });
}

for (const deliverySurface of ["public_website", "private_portal"]) {
  const result = normalize({ deliverySurface, accessModel: deliverySurface === "public_website" ? "mixed" : "role_based_private" });
  assert.equal(result.productSurface, "standalone");
  assert.equal(result.projectArchetype, "standalone-product");
}

const portal = architectureForOperationsPlacement("portal");
assert.deepEqual(
  [portal.projectArchetype, portal.productSurface, portal.operatorSurface],
  ["portal-private-app", "none", "embedded"],
);
assert.equal(normalize({ projectClass: "internal_operations", ...portal }).projectArchetype, "portal-private-app");

const local = architectureForOperationsPlacement("local");
assert.deepEqual(
  [local.projectArchetype, local.deliverySurface, local.operatorSurface],
  ["local-control-plane", "local_dashboard", "none"],
);
assert.equal(normalize({ projectClass: "internal_operations", ...local }).projectArchetype, "local-control-plane");

assert.equal(normalize({ deliverySurface: "local_dashboard", accessModel: "local_only" }).projectArchetype, "prototype");

// Legacy/direct callers may omit productSurface and both architecture fields.
assert.equal(normalize({ deliverySurface: "private_portal", accessModel: "role_based_private" }).projectArchetype, "standalone-product");
assert.equal(normalize({ projectClass: "internal_operations", needsOperatorSurface: true }).projectArchetype, "portal-private-app");

// An explicit advanced role is honored only when its surfaces agree.
assert.equal(normalize({ projectArchetype: "local-control-plane", deliverySurface: "operations_workspace", operatorSurface: "none" }).projectArchetype, "local-control-plane");
assert.throws(
  () => normalize({ projectArchetype: "local-control-plane", productSurface: "none", operatorSurface: "embedded" }),
  /Contradictory project architecture/,
);
assert.throws(
  () => normalize({ projectArchetype: "portal-private-app", productSurface: "standalone", operatorSurface: "embedded" }),
  /Contradictory project architecture/,
);

const intentCases = [
  {
    name: "public",
    overrides: {
      mission: "Publish a creek restoration guide.",
      intendedUsers: "landowners and volunteer crews",
      problemStatement: "Safe guidance is fragmented.",
      valueProposition: "Make the correct first action understandable.",
      goalSummary: "A landowner can schedule the right first step.",
      deliverySurface: "public_website",
      productSurface: "standalone",
      projectArchetype: "standalone-product",
    },
  },
  {
    name: "internal",
    overrides: {
      mission: "Coordinate equipment inspections.",
      intendedUsers: "shop operators and the maintenance lead",
      problemStatement: "Inspection status is split across paper and memory.",
      valueProposition: "Give operators one current queue.",
      goalSummary: "Every due inspection has one visible owner.",
      projectClass: "internal_operations",
      ...architectureForOperationsPlacement("portal"),
    },
  },
  {
    name: "minimal",
    overrides: {
      mission: "Keep a local seed inventory.",
      intendedUsers: "the household gardener",
      problemStatement: "Seed age and planting notes are easy to lose.",
      valueProposition: "Make the next planting choice visible.",
      goalSummary: "A viable packet can be chosen without searching notes.",
      deliverySurface: "local_dashboard",
      productSurface: "none",
      projectArchetype: "prototype",
    },
  },
];

for (const fixture of intentCases) {
  const reviewPayload = normalize(fixture.overrides);
  assert.equal(reviewPayload.mission, fixture.overrides.mission, fixture.name);
  assert.equal(reviewPayload.intendedUsers, fixture.overrides.intendedUsers, fixture.name);
  assert.equal(reviewPayload.problemStatement, fixture.overrides.problemStatement, fixture.name);
  assert.equal(reviewPayload.valueProposition, fixture.overrides.valueProposition, fixture.name);
  assert.equal(reviewPayload.goalSummary, fixture.overrides.goalSummary, fixture.name);
  for (const removed of [
    "shellPreference",
    "initialSectionSet",
    "needsKnowledgeSurface",
    "needsTimelineSurface",
    "operatorBrief",
  ]) {
    assert.equal(removed in reviewPayload, false, `${fixture.name}: ${removed} must stay removed`);
  }

  const digest = "a".repeat(64);
  const buildPayload = normalize({ ...fixture.overrides, approvedProjectIntentDigest: digest });
  assert.equal(buildPayload.approvedProjectIntentDigest, digest);
  const { approvedProjectIntentDigest: _approved, ...buildWithoutApproval } = buildPayload;
  assert.deepEqual(buildWithoutApproval, reviewPayload, `${fixture.name}: Review and Build payloads diverged`);
}

const reviewed = normalize({ ...intentCases[0].overrides, approvedProjectIntentDigest: "b".repeat(64) });
const edited = normalize({
  ...intentCases[0].overrides,
  mission: "Purpose edited after Review.",
  approvedProjectIntentDigest: "b".repeat(64),
});
assert.notEqual(reviewed.mission, edited.mission);

console.log("formation payload behavior: canonical architecture normalization verified");
