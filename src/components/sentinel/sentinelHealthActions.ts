import type { SentinelCurrentMeasurements, SentinelHostFinding, SentinelStatus } from "./sentinelModel.ts";
import type { PopUpgradeCleanupPreviewResponse } from "./sentinelApi";

const PREVIEW = "workstation.cleanup.pop_upgrade.preview";
const attention = (value: string) => ["attention", "elevated", "critical"].includes(value);
const identity = (finding: SentinelHostFinding) => finding.findingKey || `${finding.key}:${finding.reason}`;

export function validUpdaterPreview(preview: PopUpgradeCleanupPreviewResponse | null): boolean {
  return Boolean(preview?.ok && preview.candidate?.id === "service:pop-upgrade.service"
    && preview.candidate.service === "pop-upgrade.service"
    && preview.requiresOperatorConfirmation === true && preview.requiresOsAuthorization === true);
}

/** Operator projection only. A visible action grants no repair authorization. */
export function sentinelHealthActions(status: SentinelStatus | null, current: SentinelCurrentMeasurements | null,
  fresh: boolean, statusError = "", repairFailed = false) {
  const retained = new Map<string, SentinelHostFinding>();
  // Latest resolution wins, including resolved records. Never resurrect an older open copy.
  for (const finding of [...(status?.host.findings || []), ...(status?.recentHostObservations || []).flatMap(row => row.observedValues?.findings || [])]) {
    if (!retained.has(identity(finding))) retained.set(identity(finding), finding);
  }
  const findings = new Map<string, SentinelHostFinding>();
  for (const finding of retained.values()) {
    if (finding.resolution && finding.resolution.state !== "unresolved") continue;
    if (!attention(finding.status)) continue;
    // A historical thermal/load/etc. verdict never replaces its foreground measurement.
    if (current?.metrics[finding.key]) continue;
    if (finding.key === "knownIncident" && !status?.knownIncidentState?.active) continue;
    findings.set(identity(finding), finding);
  }
  if (fresh) for (const [key, metric] of Object.entries(current?.metrics || {})) {
    if (attention(metric.status)) findings.set(`current:${key}`, {
      findingKey: `current:${key}`, key, status: metric.status, reason: metric.reason,
      repairCapability: null,
    });
  }
  const operatorRequired = Boolean(status?.knownIncidentState?.repairNeedsOperator || status?.knownIncidentState?.midScanNeedsOperator);
  if (operatorRequired || repairFailed) findings.set("updater-recovery", {
    key: "updater-recovery", status: "attention", reason: operatorRequired
      ? "Updater recovery requires review; automatic retries are blocked."
      : "Updater recovery has not been verified. Review the retained result.",
  });
  const boundary = Boolean(fresh && !statusError && status?.ok && status.privilegedBoundary?.ready && status.auditVerification.ok
    && status.capabilities.some(row => row.key === "host.maintenance.pop-upgrade-self-heal"
      && row.level === 1 && row.mutating && row.implemented && !row.dryRunOnly
      && row.targetScope?.length === 1 && row.targetScope[0] === "pop-upgrade.service"
      && row.argumentKeys?.length === 0));
  const rows = [...findings.values()].map(finding => ({ ...finding,
    repairable: Boolean(boundary && !operatorRequired && !repairFailed && status?.knownIncidentState?.active
      && finding.key === "knownIncident" && finding.repairCapability === PREVIEW),
  }));
  return { findings: rows, repairableCount: rows.filter(row => row.repairable).length, needsAttention: rows.length > 0 };
}
