import type { SentinelCurrentMeasurements, SentinelHostFinding, SentinelStatus } from "./sentinelModel.ts";
import type { PopUpgradeCleanupPreviewResponse, PopUpgradeCleanupResult } from "./sentinelApi";

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
  const workflow = status?.updaterWorkflow;
  if (workflow?.active && ![...findings.values()].some(row => row.key === "knownIncident")) {
    findings.set("knownIncident", { key: "knownIncident", status: "attention",
      reason: "Sustained updater high CPU", nextStep: workflow.reason,
      repairCapability: workflow.phase === "detected" ? PREVIEW : null });
  }
  const operatorRequired = Boolean(status?.knownIncidentState?.repairNeedsOperator || status?.knownIncidentState?.midScanNeedsOperator);
  if ((operatorRequired && workflow?.active) || repairFailed) {
    const existing = [...findings.entries()].find(([, row]) => row.key === "knownIncident");
    findings.set(existing?.[0] || "updater-recovery", {
      ...existing?.[1], key: existing ? "knownIncident" : "updater-recovery", status: "attention",
      repairCapability: null, reason: operatorRequired
        ? "Updater recovery requires review; automatic retries are blocked."
        : "Updater recovery has not been verified. Review the retained result.",
    });
  }
  const boundary = Boolean(fresh && !statusError && status?.ok && status.privilegedBoundary?.ready && status.auditVerification.ok
    && status.capabilities.some(row => row.key === "host.maintenance.pop-upgrade-self-heal"
      && row.level === 1 && row.mutating && row.implemented && !row.dryRunOnly
      && row.targetScope?.length === 1 && row.targetScope[0] === "pop-upgrade.service"
      && row.argumentKeys?.length === 0));
  const rows = [...findings.values()].map(finding => ({ ...finding,
    repairable: Boolean(boundary && (!workflow || workflow.phase === "detected") && !operatorRequired && !repairFailed && status?.knownIncidentState?.active
      && finding.key === "knownIncident" && finding.repairCapability === PREVIEW),
  }));
  return { findings: rows, repairableCount: rows.filter(row => row.repairable).length, needsAttention: rows.length > 0 };
}

/** Keep the completed operator attempt visible until the next explicit investigation. */
export function updaterWorkflowVisible(workflow: SentinelStatus["updaterWorkflow"],
  diagnosis: { phase: string; origin?: string; capturedAt?: string } | null): boolean {
  return Boolean(workflow && !["idle", "recovered"].includes(workflow.phase)
    && diagnosis?.phase !== "diagnosing" && diagnosis?.origin !== "repair"
    && (!diagnosis || Date.parse(workflow.checkedAt || "") > Date.parse(diagnosis.capturedAt || "1970-01-01")));
}

export function updaterRepairDiagnosis(result: PopUpgradeCleanupResult, capturedAt: string) {
  const evidence = (result.actions || []).flatMap(action => [
    [action.outcome, action.summary].filter(Boolean).join(": "),
    ...(action.postRepairVerification?.verificationBlockers || []),
  ]).filter(Boolean);
  if (result.error) evidence.push(result.error);
  return {
    phase: "complete" as const, origin: "repair" as const, capturedAt,
    outcome: result.actions?.some(action => action.actionUncertain) ? "UNKNOWN" as const : result.ok ? "FIXED" as const : "NEEDS YOUR HELP" as const,
    scanKind: "targeted", evidence,
    finding: evidence[0] || (result.ok ? "Updater recovery verified." : "Updater recovery was not verified."),
    repairRan: result.actions?.some(action => action.actionOccurred === true) || false,
    nextStep: result.ok
      ? "Updater recovery passed. Heat and other host concerns remain separate; review current measurements."
      : "Review the attempt outcome and blocker above. An unresolved prior attempt permits verification only; automatic retries remain blocked.",
  };
}
