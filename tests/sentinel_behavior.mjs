import assert from "node:assert/strict";
import {
  buildSentinelActivity,
  currentMeasurementFresh,
  automaticUpdaterReady,
  operatorRecentEvents,
  operatorEventSummary,
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
const exactAutomaticSelfHeal = {
  ...levelOne,
  key: "host.maintenance.pop-upgrade-self-heal",
  implemented: true,
  dryRunOnly: false,
  autonomousAuthority: "due-scheduled-exact-final-guard",
  approvalRequirement: "preauthorized-exact-machine-scope",
  protectedTargets: ["all-other-services", "operator-applications", "arbitrary-processes"],
  targetScope: ["pop-upgrade.service"],
  requiredEvidence: ["mandatory-post-repair-verification"],
  argumentKeys: [],
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
assert.equal(sentinelCapabilityLevelState(1, [levelZero, exactAutomaticSelfHeal, levelOne]), "active");
assert.equal(sentinelCapabilityLevelState(1, [levelZero, { ...exactAutomaticSelfHeal, argumentKeys: ["service"] }]), "not-activated");
assert.equal(sentinelCapabilityLevelState(1, [levelZero, { ...exactAutomaticSelfHeal, targetScope: ["another.service"] }]), "not-activated");

const activity = buildSentinelActivity(baseStatus);
assert.equal(activity.length, 2);
assert.equal(activity[0].kind, "action");
assert.equal(activity[0].origin, "user-triggered");
assert.equal(filterSentinelActivity(activity, "events").length, 1);
assert.equal(filterSentinelActivity(activity, "actions").length, 1);
assert.equal(filterSentinelActivity(activity, "security").length, 0);

const automaticRepairActivity = buildSentinelActivity({
  ...baseStatus,
  recentEvents: [],
  recentActions: [{
    ...baseStatus.recentActions[0],
    requestedCapability: "host.maintenance.pop-upgrade-self-heal",
    requestingAgent: "root-owned-pop-upgrade-helper",
    executionResult: "repaired",
  }],
});
assert.equal(automaticRepairActivity[0].origin, "system-observed");

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

const now = Date.parse("2026-09-17T12:00:00Z");
const current = { ok: true, measuredAt: "2026-09-17T11:59:30Z" };
assert.equal(currentMeasurementFresh(current, "", now), true);
assert.equal(currentMeasurementFresh(current, "refresh failed", now), false);
assert.equal(currentMeasurementFresh(current, "", now + 90_000), false);
assert.equal(currentMeasurementFresh(null, "", now), false);
assert.equal(currentMeasurementFresh({ ...current, measuredAt: "invalid" }, "", now), false);
assert.equal(currentMeasurementFresh({ ...current, measuredAt: "2027-01-01" }, "", now), false);
const ready = { ...baseStatus, automation: { enabled: true, active: true }, privilegedBoundary: { ready: true },
  auditVerification: { ok: true }, capabilities: [exactAutomaticSelfHeal] };
assert.equal(automaticUpdaterReady(ready), true);
for (const unavailable of [
  { ...ready, automation: { enabled: false, active: true } },
  { ...ready, automation: { enabled: true, active: false } },
  { ...ready, privilegedBoundary: { ready: false } },
  { ...ready, privilegedBoundary: undefined },
  { ...ready, auditVerification: { ok: false } },
  { ...ready, knownIncidentState: { repairNeedsOperator: true } },
]) assert.equal(automaticUpdaterReady(unavailable), false);
const repaired = { id: "repair", type: "host.automatic-pop-upgrade-self-heal", observedValues: {
  outcome: "verified", actionOccurred: true, postRepairVerificationPassed: true } };
assert.match(operatorEventSummary(repaired), /service restarted → recovery verified/);
assert.match(operatorEventSummary({ ...repaired, observedValues: { ...repaired.observedValues, actionOccurred: false } }), /no restart performed/);
assert.doesNotMatch(operatorEventSummary({ ...repaired, observedValues: { outcome: "improved" } }), /recovery verified/);
const finding = { findingKey: "services:fixture", reason: "Service failed", resolution: { state: "unresolved" } };
const scan = { id: "new", type: "host.health-check", observedValues: { findings: [finding] } };
const duplicate = { ...scan, id: "old" };
const resolved = { ...scan, id: "resolved", observedValues: { findings: [{ ...finding, resolution: { state: "resolved" } }] } };
const records = [repaired, scan, duplicate, resolved];
const original = JSON.stringify(records);
assert.deepEqual(operatorRecentEvents(records).map((row) => row.id), ["repair", "new", "resolved"]);
assert.equal(JSON.stringify(records), original, "grouping must not rewrite retained evidence");
console.log("Sentinel convergence: freshness, readiness, repair outcomes and grouped history verified");

const helperEvent = { ...repaired, evidence: ["sentinel-host:probe"] };
const stageEvent = { id: "stage", type: "host.updater-mid-scan.verified", evidence: ["sentinel-host:probe"], observedValues: { stage: "verified" } };
assert.deepEqual(operatorRecentEvents([stageEvent, helperEvent]).map((row) => row.id), ["repair"]);
