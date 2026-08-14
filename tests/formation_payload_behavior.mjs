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

console.log("formation payload behavior: canonical architecture normalization verified");
