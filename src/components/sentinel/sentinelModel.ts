export const SENTINEL_EVIDENCE_STATUSES = [
  "healthy",
  "attention",
  "elevated",
  "critical",
  "unknown",
  "not_configured",
  "unavailable",
  "permission_required",
  "unsupported",
  "stale",
  "learning",
] as const;

export type SentinelEvidenceStatus =
  (typeof SENTINEL_EVIDENCE_STATUSES)[number];

export type SentinelObservation = {
  status: SentinelEvidenceStatus;
  value: unknown;
  reason: string;
  observedAt: string;
};

export type SentinelHostFinding = {
  findingKey?: string;
  kind?: string;
  key: string;
  status: SentinelEvidenceStatus;
  title?: string;
  summary?: string;
  reason: string;
  evidence?: string[];
  nextStep?: string;
  repairCapability?: string | null;
  resolution?: {
    state: "unresolved" | "resolved" | "no-longer-present" | "expected-accepted";
    disposition: "none" | "action-available" | "needs-operator";
    resolvedAt?: string | null;
    reason: string;
  };
};

export type SentinelHostGuidance = {
  primaryAction: "none" | "diagnose-fix" | "review-fix";
  automaticRepairAvailable: boolean;
  advisorRecommended: boolean;
  knownRepair: string | null;
  message: string;
};

export type SentinelScanCoverage = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  reason: string;
  evidenceKeys: string[];
};

export type SentinelHostState = {
  guardian: "host";
  overallStatus: SentinelEvidenceStatus;
  checkedAt: string | null;
  metrics: Record<string, SentinelObservation>;
  baselineComparison?: Record<string, unknown>;
  rules?: Array<Record<string, unknown>>;
  scanKind?: "full" | "targeted";
  trigger?: "manual" | "automatic";
  verdictReason?: string;
  primaryFinding?: SentinelHostFinding;
  findings?: SentinelHostFinding[];
  activeFindingCount?: number;
  resolutionSummary?: {
    unresolved: number;
    resolved: number;
    "no-longer-present": number;
    "expected-accepted": number;
    actionAvailable: number;
    needsOperator: number;
  };
  guidance?: SentinelHostGuidance;
  scanDurationMs?: number;
  coverage?: SentinelScanCoverage[];
  coverageLimitations?: string[];
  findingSummary?: Record<string, number>;
  normalizedSnapshot?: { version: number; metrics: Record<string, SentinelObservation> };
  reason?: string;
  freshness?: string;
  freshnessReason?: string;
  fullScanScheduleStatus?: string;
  ageSeconds?: number;
};

export type SentinelSecurityAsset = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  reason: string;
  lastObservedAt: string | null;
  category?: string;
  adapter?: string;
  observationKinds?: string[];
  url?: string | null;
  archetype?: string;
};

export type SentinelSecurityState = {
  guardian: "security";
  overallStatus: SentinelEvidenceStatus;
  checkedAt: string | null;
  providers: SentinelSecurityAsset[];
  websites: SentinelSecurityAsset[];
  reason?: string;
  freshness?: string;
  ageSeconds?: number;
  liveReadOnlyAdapterCount?: number;
};

export type SentinelSeverity =
  | "informational"
  | "attention"
  | "elevated"
  | "critical";

export type SentinelEvent = {
  id: string;
  timestamp: string;
  source: string;
  guardian: "host" | "security" | "correlation";
  type: string;
  severity: SentinelSeverity;
  asset: string;
  observedValues?: Record<string, unknown>;
};

export type SentinelHostMeasurements = {
  cpuTemperatureC?: number | null;
  cpuTemperatureLabel?: string | null;
  gpuTemperatureC?: number | null;
  gpuName?: string | null;
  fanRpm?: number | null;
  cpuPercent?: number | null;
  loadOneMinute?: number | null;
  memoryAvailableGiB?: number | null;
  diskFreePercent?: number | null;
  failedServiceCount?: number | null;
};

export type SentinelHostObservation = SentinelEvent & {
  guardian: "host";
  observedValues?: {
    overallStatus?: SentinelEvidenceStatus;
    metricStatuses?: Record<string, SentinelEvidenceStatus>;
    keyMeasurements?: SentinelHostMeasurements;
    anomalies?: string[];
    verdictReason?: string;
    primaryFinding?: SentinelHostFinding;
    findings?: SentinelHostFinding[];
    activeFindingCount?: number;
    resolutionSummary?: SentinelHostState["resolutionSummary"];
    guidance?: SentinelHostGuidance;
    scanKind?: "full" | "targeted";
    scanDurationMs?: number;
    findingSummary?: Record<string, number>;
    coverage?: SentinelScanCoverage[];
    coverageLimitations?: string[];
    snapshot?: { version: number; metrics: Record<string, SentinelObservation> };
    knownRepairAvailable?: boolean;
    actionProposed?: string | null;
    actionOccurred?: boolean;
    repairOccurred?: boolean;
    postRepairVerificationPassed?: boolean;
    relatedActions?: string[];
  };
};

export type SentinelCurrentMeasurements = {
  ok: boolean;
  guardian: "host";
  measuredAt: string;
  metrics: Record<string, SentinelObservation>;
  rules?: Array<Record<string, unknown>>;
  summary: SentinelHostMeasurements;
  persisted: false;
  llmUsed: false;
  source: "foreground-read-only";
};

export type SentinelIncident = {
  id: string;
  title: string;
  severity: Exclude<SentinelSeverity, "informational">;
  status: string;
  hypothesis: string;
  affectedAssets?: string[];
  actionsProposed?: string[];
  actionsExecuted?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type SentinelActionRecord = {
  id: string;
  requestedCapability: string;
  requestingAgent: string;
  reason?: string;
  policyResult: string;
  approvalRequirement: string;
  executionResult: string;
  requestedAt: string;
  completedAt?: string;
  dryRun: boolean;
};

export type SentinelTrigger = {
  key: string;
  class: "event" | "schedule" | "manual";
  guardian: "host" | "security";
  label: string;
  capability: string;
  activationState: string;
  schedule?: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
};

export type SentinelCapability = {
  key: string;
  guardian: "host" | "security";
  level: number;
  riskClass: string;
  mutating: boolean;
  implemented: boolean;
  dryRunOnly: boolean;
  approvalRequirement: string;
};

export type SentinelAutomation = {
  enabled: boolean;
  active: boolean;
  frequency: "daily" | "twice-daily";
  intervalSeconds: number;
  lastSuccessfulAt: string | null;
  lastAttemptAt: string | null;
  lastResult: string;
  nextDueAt: string | null;
  graceDueAt?: string | null;
  graceSeconds?: number;
  scheduleStatus: "off" | "current" | "due" | "overdue" | "failed";
  overdue: boolean;
  systemd: { available: boolean; enabled: boolean; detail: string };
};

export type SentinelStatus = {
  ok: boolean;
  overallStatus: SentinelEvidenceStatus;
  host: SentinelHostState;
  security: SentinelSecurityState;
  recentEvents: SentinelEvent[];
  recentHostObservations: SentinelHostObservation[];
  recentIncidents: SentinelIncident[];
  pendingActions: SentinelActionRecord[];
  recentActions: SentinelActionRecord[];
  triggers: SentinelTrigger[];
  capabilities: SentinelCapability[];
  auditVerification: {
    ok: boolean;
    claim: string;
    audit: { recordCount: number };
    events: { recordCount: number };
    incidents: { recordCount: number };
  };
  executionMode: string;
  privilegedHelper: string;
  providerMutation: string;
  scheduler: string;
  automation: SentinelAutomation;
  knownIncidentState?: {
    active: boolean;
    lastDetectedAt: string | null;
    lastRemediationAt: string | null;
    lastOutcome: string | null;
    resolvedAt: string | null;
    lastIncidentId: string | null;
  };
  memoryAuthority: string;
  error?: string;
};

export type SentinelThreatState =
  | "normal"
  | "attention"
  | "elevated"
  | "critical"
  | "unknown_visibility";

export type SentinelActivityFilter =
  | "all"
  | "events"
  | "actions"
  | "incidents"
  | "host"
  | "security";

export type SentinelActivityRow = {
  id: string;
  kind: "event" | "action" | "incident";
  timestamp: string;
  guardian: "host" | "security" | "correlation";
  severity: SentinelSeverity;
  title: string;
  asset: string;
  result: string;
  policy: string;
  origin: "user-triggered" | "system-observed" | "system-proposal";
};

export const SENTINEL_LEVELS = [
  { level: 0, label: "Observation" },
  { level: 1, label: "Maintenance" },
  { level: 2, label: "Intervention" },
  { level: 3, label: "Security Containment" },
  { level: 4, label: "Emergency" },
  { level: 5, label: "Recovery" },
] as const;

const EVIDENCE_RANK: Record<SentinelEvidenceStatus, number> = {
  unknown: 0,
  healthy: 1,
  learning: 2,
  unsupported: 2,
  not_configured: 2,
  unavailable: 3,
  permission_required: 3,
  stale: 4,
  attention: 5,
  elevated: 6,
  critical: 7,
};

const SEVERITY_RANK: Record<SentinelSeverity, number> = {
  informational: 0,
  attention: 1,
  elevated: 2,
  critical: 3,
};

export function isHealthyEvidence(status: SentinelEvidenceStatus): boolean {
  return status === "healthy";
}

export function combineGuardianStatus(
  host: SentinelEvidenceStatus,
  security: SentinelEvidenceStatus,
): SentinelEvidenceStatus {
  const actionable = [host, security].filter((status) =>
    ["attention", "elevated", "critical"].includes(status),
  );
  if (actionable.length) {
    return actionable.sort(
      (left, right) => EVIDENCE_RANK[right] - EVIDENCE_RANK[left],
    )[0];
  }
  return host === "healthy" && security === "healthy" ? "healthy" : "unknown";
}

export function sentinelStatusLabel(status: SentinelEvidenceStatus): string {
  return status.replace(/_/g, " ").toUpperCase();
}

export function observationValue<T>(
  observation: SentinelObservation | undefined,
  fallback: T,
): T {
  return (observation?.value as T | undefined) ?? fallback;
}

export function lastSentinelSweepAt(status: SentinelStatus | null): string | null {
  if (!status) return null;
  const timestamps = [status.host.checkedAt, status.security.checkedAt]
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps[timestamps.length - 1] || null;
}

export function deriveThreatState(status: SentinelStatus | null): SentinelThreatState {
  if (!status) return "unknown_visibility";
  const activeIncidents = status.recentIncidents.filter(
    (incident) => !["closed", "resolved"].includes(incident.status.toLowerCase()),
  );
  if (activeIncidents.length) {
    return activeIncidents
      .map((incident) => incident.severity)
      .sort((left, right) => SEVERITY_RANK[right] - SEVERITY_RANK[left])[0];
  }
  if (["attention", "elevated", "critical"].includes(status.overallStatus)) {
    return status.overallStatus as "attention" | "elevated" | "critical";
  }
  return status.overallStatus === "healthy" ? "normal" : "unknown_visibility";
}

export function threatStateLabel(state: SentinelThreatState): string {
  return state === "unknown_visibility"
    ? "UNKNOWN VISIBILITY"
    : state === "normal"
      ? "NORMAL"
      : `ACTIVE ${state.toUpperCase()}`;
}

function actionGuardian(action: SentinelActionRecord): "host" | "security" {
  return action.requestedCapability.startsWith("security.") ? "security" : "host";
}

function actionOrigin(action: SentinelActionRecord): SentinelActivityRow["origin"] {
  if (action.requestingAgent === "deterministic-rule-engine") return "system-proposal";
  return "user-triggered";
}

function actionSeverity(action: SentinelActionRecord): SentinelSeverity {
  if (action.policyResult === "denied" || action.executionResult === "failed") return "attention";
  return action.policyResult === "unimplemented" ? "attention" : "informational";
}

export function buildSentinelActivity(status: SentinelStatus | null): SentinelActivityRow[] {
  if (!status) return [];
  const events: SentinelActivityRow[] = status.recentEvents.map((event) => ({
    id: `event:${event.id}`,
    kind: "event",
    timestamp: event.timestamp,
    guardian: event.guardian,
    severity: event.severity,
    title: event.type.replace(/[._-]+/g, " "),
    asset: event.asset,
    result: event.severity === "informational" ? "Observed" : "Needs review",
    policy: event.source,
    origin: "system-observed",
  }));
  const actions: SentinelActivityRow[] = status.recentActions.map((action) => ({
    id: `action:${action.id}`,
    kind: "action",
    timestamp: action.requestedAt,
    guardian: actionGuardian(action),
    severity: actionSeverity(action),
    title: action.requestedCapability.replace(/[._-]+/g, " "),
    asset: action.requestingAgent,
    result: action.executionResult,
    policy: `${action.policyResult} · approval ${action.approvalRequirement}`,
    origin: actionOrigin(action),
  }));
  const incidents: SentinelActivityRow[] = status.recentIncidents.map((incident) => ({
    id: `incident:${incident.id}`,
    kind: "incident",
    timestamp: incident.updatedAt || incident.createdAt || "",
    guardian: "correlation",
    severity: incident.severity,
    title: incident.title,
    asset: incident.affectedAssets?.join(", ") || "correlated estate",
    result: incident.status,
    policy: incident.hypothesis,
    origin: "system-observed",
  }));
  return [...events, ...actions, ...incidents].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );
}

export function filterSentinelActivity(
  rows: SentinelActivityRow[],
  filter: SentinelActivityFilter,
): SentinelActivityRow[] {
  if (filter === "all") return rows;
  if (filter === "host" || filter === "security") {
    return rows.filter((row) => row.guardian === filter);
  }
  return rows.filter((row) => `${row.kind}s` === filter);
}

export function sentinelCapabilityLevelState(
  level: number,
  capabilities: SentinelCapability[],
): "active" | "not-activated" {
  if (level !== 0) return "not-activated";
  const levelZero = capabilities.filter((capability) => capability.level === 0);
  return levelZero.length > 0 &&
    levelZero.every((capability) => capability.implemented && !capability.mutating)
    ? "active"
    : "not-activated";
}
