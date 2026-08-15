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

export type SentinelHostState = {
  guardian: "host";
  overallStatus: SentinelEvidenceStatus;
  checkedAt: string | null;
  metrics: Record<string, SentinelObservation>;
  baselineComparison?: Record<string, unknown>;
  rules?: Array<Record<string, unknown>>;
  reason?: string;
  freshness?: string;
};

export type SentinelSecurityAsset = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  reason: string;
  lastObservedAt: string | null;
  category?: string;
  adapter?: string;
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
  liveReadOnlyAdapterCount?: number;
};

export type SentinelEvent = {
  id: string;
  timestamp: string;
  source: string;
  guardian: "host" | "security" | "correlation";
  type: string;
  severity: "informational" | "attention" | "elevated" | "critical";
  asset: string;
};

export type SentinelIncident = {
  id: string;
  title: string;
  severity: "attention" | "elevated" | "critical";
  status: string;
  hypothesis: string;
};

export type SentinelActionRecord = {
  id: string;
  requestedCapability: string;
  requestingAgent: string;
  policyResult: string;
  approvalRequirement: string;
  executionResult: string;
  requestedAt: string;
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

export type SentinelStatus = {
  ok: boolean;
  overallStatus: SentinelEvidenceStatus;
  host: SentinelHostState;
  security: SentinelSecurityState;
  recentEvents: SentinelEvent[];
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
  memoryAuthority: string;
  error?: string;
};

export function isHealthyEvidence(status: SentinelEvidenceStatus): boolean {
  return status === "healthy";
}

export function combineGuardianStatus(
  host: SentinelEvidenceStatus,
  security: SentinelEvidenceStatus,
): SentinelEvidenceStatus {
  const rank: Record<SentinelEvidenceStatus, number> = {
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
  const actionable = [host, security].filter((status) =>
    ["attention", "elevated", "critical"].includes(status),
  );
  if (actionable.length) {
    return actionable.sort((left, right) => rank[right] - rank[left])[0];
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
