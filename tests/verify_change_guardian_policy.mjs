import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(
  await readFile(new URL("../contracts/change-guardian/v1/policy.json", import.meta.url)),
);

const expectedClasses = [
  "product/ui",
  "product/model",
  "product/test",
  "o2-client/protocol",
  "tauri/native/security",
  "contracts/governance",
  "workflow/release",
  "dependency/build-config",
  "migration/data-authority",
  "generated/snapshot",
  "unknown",
];
const declaredClasses = policy.pathClasses.map((entry) => entry.class);
assert.equal(policy.contractVersion, "1");
assert.equal(policy.policyId, "radcontrol-change-guardian-v1");
assert.deepEqual(new Set(declaredClasses), new Set(expectedClasses));
assert.equal(declaredClasses.at(-1), "unknown");
assert.deepEqual(policy.allowedClasses, ["product/ui", "product/model", "product/test"]);
assert.deepEqual(new Set(policy.escalateClasses), new Set(expectedClasses.slice(3, 9).concat("unknown")));
assert.deepEqual(policy.failClasses, ["generated/snapshot"]);
assert.deepEqual(policy.profiles["product/ui"].surfaceGateKinds, ["contract"]);
assert.deepEqual(policy.profiles["product/model"].surfaceGateKinds, ["behavior", "contract"]);
assert.ok(policy.surfaces.some((surface) => surface.id === "projects"));
assert.deepEqual(policy.securityRelevantIgnoredGlobs, [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  ".npmrc",
  "**/.npmrc",
]);
assert.ok(policy.contentTriggers.length >= 8);
for (const trigger of policy.contentTriggers) new RegExp(trigger.regex, trigger.flags ?? "");

console.log("Change Guardian policy: versioned classes, triggers, surfaces, and bounded profiles verified");
