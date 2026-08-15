import assert from "node:assert/strict";
import {
  combineGuardianStatus,
  isHealthyEvidence,
  sentinelStatusLabel,
} from "../src/components/sentinel/sentinelModel.ts";

for (const status of [
  "unknown",
  "not_configured",
  "unavailable",
  "permission_required",
  "unsupported",
  "stale",
  "learning",
]) {
  assert.equal(isHealthyEvidence(status), false, `${status} must not count as healthy`);
}

assert.equal(isHealthyEvidence("healthy"), true);
assert.equal(combineGuardianStatus("healthy", "unknown"), "unknown");
assert.equal(combineGuardianStatus("healthy", "not_configured"), "unknown");
assert.equal(combineGuardianStatus("healthy", "healthy"), "healthy");
assert.equal(combineGuardianStatus("attention", "unknown"), "attention");
assert.equal(combineGuardianStatus("critical", "healthy"), "critical");
assert.equal(sentinelStatusLabel("permission_required"), "PERMISSION REQUIRED");

console.log("Sentinel behavior: unknown and disconnected evidence never project healthy");
