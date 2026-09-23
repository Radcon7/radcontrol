import type { SentinelCurrentMeasurements, SentinelHostFinding, SentinelStatus } from "./sentinelModel.ts";
import type { PopUpgradeCleanupPreviewResponse } from "./sentinelApi";

const PREVIEW = "workstation.cleanup.pop_upgrade.preview";

export function validUpdaterPreview(preview: PopUpgradeCleanupPreviewResponse | null): boolean {
  return Boolean(preview?.ok && preview.candidate?.id === "service:pop-upgrade.service"
    && preview.candidate.service === "pop-upgrade.service"
    && preview.requiresOperatorConfirmation === true && preview.requiresOsAuthorization === true);
}

/** Operator projection only. A visible action grants no repair authorization. */
export function sentinelHealthActions(status: SentinelStatus | null, current: SentinelCurrentMeasurements | null,
  fresh: boolean, statusError = "", repairFailed = false) {
  const findings = new Map<string, SentinelHostFinding>();
  for (const concern of current?.interpretation?.concerns || []) {
    if (!["attention", "critical"].includes(concern.significance) || concern.presence === "observed-clear") continue;
    const finding = concern.finding;
    findings.set(concern.concernKey, {
      ...finding, findingKey: concern.concernKey, key: finding?.key || concern.kind,
      status: concern.significance === "critical" ? "critical" : "attention",
      reason: concern.kind === "thermal" && typeof concern.currentTemperatureC === "number"
        ? `CPU unusually hot · ${concern.currentTemperatureC}°C` : concern.title,
      repairCapability: concern.actionability === "governed-action-available" ? concern.repairCapability : null,
      nextStep: concern.presence === "unknown" ? "Current domain evidence is unavailable. Investigate before acting." : finding?.nextStep,
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
