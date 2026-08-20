import assert from "node:assert/strict";
import {
  buildSentinelActivity,
  combineGuardianStatus,
  deriveThreatState,
  filterSentinelActivity,
  isHealthyEvidence,
  lastSentinelSweepAt,
  sentinelCapabilityLevelState,
  sentinelStatusLabel,
  threatStateLabel,
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

const levelZero = {
  key: "host.inspect.health",
  guardian: "host",
  level: 0,
  riskClass: "observe",
  mutating: false,
  implemented: true,
  dryRunOnly: false,
  approvalRequirement: "none",
};
const levelOne = {
  ...levelZero,
  key: "host.maintenance.cleanup",
  level: 1,
  riskClass: "maintenance",
  mutating: true,
  implemented: false,
  dryRunOnly: true,
  approvalRequirement: "human",
};

const baseStatus = {
  ok: true,
  overallStatus: "unknown",
  host: { guardian: "host", overallStatus: "healthy", checkedAt: "2026-08-15T14:00:00Z", metrics: {} },
  security: { guardian: "security", overallStatus: "unknown", checkedAt: "2026-08-15T14:01:00Z", providers: [], websites: [] },
  recentEvents: [{ id: "event-1", timestamp: "2026-08-15T14:02:00Z", source: "linux-local-observer", guardian: "host", type: "host.health-check", severity: "informational", asset: "system76-workstation" }],
  recentIncidents: [],
  pendingActions: [],
  recentActions: [{ id: "action-1", requestedCapability: "host.inspect.health", requestingAgent: "host-guardian", policyResult: "allowed-read-only", approvalRequirement: "none", executionResult: "observed", requestedAt: "2026-08-15T14:02:01Z", dryRun: false }],
  triggers: [],
  capabilities: [levelZero, levelOne],
  auditVerification: { ok: true, claim: "hash-chained-not-immutable", audit: { recordCount: 1 }, events: { recordCount: 1 }, incidents: { recordCount: 0 } },
  executionMode: "observe-and-dry-run",
  privilegedHelper: "not-installed",
  providerMutation: "disabled",
  scheduler: "disabled",
  automation: {
    enabled: false,
    active: false,
    frequency: "daily",
    intervalSeconds: 86400,
    lastSuccessfulAt: null,
    lastAttemptAt: null,
    lastResult: "not-configured",
    nextDueAt: null,
    overdue: false,
    systemd: { available: true, enabled: false, detail: "disabled" },
  },
  memoryAuthority: "non-authoritative",
};

assert.equal(deriveThreatState(baseStatus), "unknown_visibility");
assert.equal(threatStateLabel("unknown_visibility"), "UNKNOWN VISIBILITY");
assert.equal(lastSentinelSweepAt(baseStatus), "2026-08-15T14:01:00Z");
assert.equal(sentinelCapabilityLevelState(0, baseStatus.capabilities), "active");
for (const level of [1, 2, 3, 4, 5]) {
  assert.equal(sentinelCapabilityLevelState(level, baseStatus.capabilities), "not-activated");
}

const activity = buildSentinelActivity(baseStatus);
assert.equal(activity.length, 2);
assert.equal(activity[0].kind, "action");
assert.equal(activity[0].origin, "user-triggered");
assert.equal(filterSentinelActivity(activity, "events").length, 1);
assert.equal(filterSentinelActivity(activity, "actions").length, 1);
assert.equal(filterSentinelActivity(activity, "security").length, 0);

const activeIncident = {
  ...baseStatus,
  recentIncidents: [{ id: "incident-1", title: "Verified anomaly", severity: "elevated", status: "open", hypothesis: "Correlated current evidence", updatedAt: "2026-08-15T14:03:00Z" }],
};
assert.equal(deriveThreatState(activeIncident), "elevated");
assert.equal(threatStateLabel("elevated"), "ACTIVE ELEVATED");
assert.equal(filterSentinelActivity(buildSentinelActivity(activeIncident), "incidents").length, 1);

const unsafeLevelZero = [{ ...levelZero, mutating: true }];
assert.equal(sentinelCapabilityLevelState(0, unsafeLevelZero), "not-activated");

console.log("Sentinel behavior: threat visibility, real activity, and authority ladder verified");
