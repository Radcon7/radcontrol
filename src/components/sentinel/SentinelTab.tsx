import { useCallback, useEffect, useMemo, useState } from "react";
import { useGovernedRecordNote } from "../common/useGovernedRecordNote";
import { HostUpdatesPanel } from "./HostUpdatesPanel";
import {
  applyPopUpgradeCleanup,
  askSentinel,
  configureHostAutomation,
  explainFans,
  investigateHostObservation,
  loadCurrentHostMeasurements,
  loadSentinelStatus,
  previewPopUpgradeCleanup,
  runHostDeepCheck,
  runHostHealthCheck,
  type AskSentinelResponse,
  type HostCheckResponse,
  type PopUpgradeCleanupPreviewResponse,
} from "./sentinelApi";
import {
  SENTINEL_LEVELS,
  deriveThreatState,
  observationValue,
  sentinelCapabilityLevelState,
  sentinelStatusLabel,
  type SentinelAutomation,
  type SentinelCurrentMeasurements,
  type SentinelEvidenceStatus,
  type SentinelHostFinding,
  type SentinelHostObservation,
  type SentinelHostState,
  type SentinelObservation,
  type SentinelStatus,
} from "./sentinelModel";

const HOST_CONFIGURATION_PATH = "docs/infrastructure/assets/system76-workstation/CONFIGURATION.md";
const HOST_NOTES_PATH = "docs/infrastructure/assets/system76-workstation/NOTES.md";

type HostSignal = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  value: string;
  classification: string;
  reason: string;
  measuredAt?: string;
  baseline?: string;
};

type OperatorHealthState = "HEALTHY" | "ATTENTION" | "PROBLEM" | "UNKNOWN";
type InvestigationKind = "slow" | "network" | "suspicious" | "codex" | "other";
type FanInvestigationOutcome = "NO FIX NEEDED" | "FIX AVAILABLE" | "FIXED" | "STILL PRESENT";
type FanInvestigation = {
  diagnosis: string;
  evidence: string;
  outcome: FanInvestigationOutcome;
  deepCheckUsed: boolean;
};
type DiagnosisOutcome = "NO ISSUE FOUND" | "FIX AVAILABLE" | "NEEDS YOUR HELP" | "FIXED" | "STILL PRESENT";
type DiagnosisResult = {
  phase: "diagnosing" | "complete";
  outcome?: DiagnosisOutcome;
  observationId?: string;
  scanKind?: string;
  durationMs?: number;
  finding: string;
  evidence: string[];
  repairRan: boolean;
  nextStep: string;
};
type ThermalRow = { key?: string; label?: string; temperatureC?: number; criticalC?: number | null; source?: string; path?: string; primary?: boolean; thresholdEligible?: boolean };
type ProcessRow = { pid?: number; ppid?: number; ageSeconds?: number; cpuPercent?: number; averageCpuPercent?: number; memoryPercent?: number; rssMiB?: number; process?: string; projectKey?: string };
type ListenerRow = { address?: string; port?: number; exposedBeyondLoopback?: boolean; pids?: number[]; owner?: string; projectKey?: string; expectedGovernedDevelopment?: boolean };
type ContainerRow = { name?: string; image?: string; state?: string; statusText?: string; supabase?: boolean };

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function observationStatus(observation: SentinelObservation | undefined): SentinelEvidenceStatus {
  return observation?.status || "unknown";
}

function StatusPill({ status }: { status: SentinelEvidenceStatus }) {
  return <span className={`sentinelStatus sentinelStatus-${status}`}>{sentinelStatusLabel(status)}</span>;
}

function baselineStatus(host: SentinelHostState, key: string): string | undefined {
  const row = host.baselineComparison?.[key];
  return row && typeof row === "object" && "status" in row
    ? String((row as { status?: unknown }).status || "")
    : undefined;
}

function baselineClassification(host: SentinelHostState, baselineKey?: string): string | undefined {
  if (!baselineKey) return undefined;
  const status = baselineStatus(host, baselineKey);
  return status === "available" ? "Baseline available" : status === "learning" ? "Baseline learning" : undefined;
}

function measurementClassification(status: SentinelEvidenceStatus, baselineKey?: string): string {
  if (["attention", "elevated", "critical", "stale"].includes(status)) return sentinelStatusLabel(status);
  if (status === "learning") return baselineKey?.startsWith("thermal") ? "Temperature source requires verification" : "Measurement available · safety limit incomplete";
  if (status === "healthy") return "Normal";
  if (status === "unsupported") return "Sensor unavailable";
  return sentinelStatusLabel(status);
}

function primaryThermalValue(observation: SentinelObservation | undefined): string {
  const primary = observationValue<ThermalRow[]>(observation, []).find((row) => row.primary);
  return primary && typeof primary.temperatureC === "number" ? `${primary.temperatureC}°C` : "Temperature source requires verification";
}

function compactHostEvidence(metrics: Record<string, unknown> | undefined): string {
  const typed = (metrics || {}) as Record<string, SentinelObservation>;
  const thermal = primaryThermalValue(typed.thermal);
  const fans = observationValue<Array<{ rpm?: number }>>(typed.fans, []);
  const cpu = observationValue<{ utilizationPercent?: number }>(typed.cpu, {});
  const load = observationValue<{ oneMinute?: number }>(typed.load, {});
  const processes = observationValue<ProcessRow[]>(typed.processes, []);
  const services = observationValue<string[]>(typed.services, []);
  const top = processes[0];
  return [
    `CPU temperature ${thermal}`,
    typeof fans[0]?.rpm === "number" ? `Fan ${fans[0].rpm.toLocaleString()} RPM` : "Fan sensor unavailable",
    typeof cpu.utilizationPercent === "number" ? `CPU ${cpu.utilizationPercent}%` : "CPU unavailable",
    typeof load.oneMinute === "number" ? `Load ${load.oneMinute}` : "Load unavailable",
    top ? `${top.process || "Top process"} ${top.cpuPercent ?? "?"}% CPU` : "Process evidence unavailable",
    services.length ? `${services.length} failed service${services.length === 1 ? "" : "s"}` : "Services OK",
  ].join(" · ");
}

function exactFindingText(finding: SentinelHostFinding | undefined): string {
  return finding?.summary || finding?.reason || "No current host issue needs action.";
}

function findingEvidence(finding: SentinelHostFinding | undefined): string[] {
  if (finding?.evidence?.length) return [...finding.evidence];
  return finding?.reason ? [finding.reason] : [];
}

function diagnosisFromReport(report: HostCheckResponse): DiagnosisResult {
  const finding = report.primaryFinding;
  const repairFinding = report.findings?.find((row) => Boolean(row.repairCapability));
  const repairAvailable = Boolean(repairFinding || finding?.repairCapability || report.guidance?.knownRepair);
  const healthy = report.overallStatus === "healthy" && !(report.findings || []).length;
  const trend = observationValue<{
    conclusion?: string;
    detail?: string;
  }>(report.metrics?.thermalTrend, {});
  const evidence = findingEvidence(finding);
  if (trend.conclusion) evidence.push(`${trend.conclusion}${trend.detail ? ` · ${trend.detail}` : ""}`);
  return {
    phase: "complete",
    outcome: healthy ? "NO ISSUE FOUND" : repairAvailable ? "FIX AVAILABLE" : "NEEDS YOUR HELP",
    observationId: report.eventId,
    scanKind: report.scanKind || "full",
    durationMs: report.scanDurationMs,
    finding: healthy ? "No issue found in the deterministic deep check." : exactFindingText(finding),
    evidence,
    repairRan: false,
    nextStep: healthy
      ? "No fix is needed. Current-now measurements will continue to refresh independently."
      : repairFinding?.nextStep || finding?.nextStep || report.guidance?.message || "Review the exact retained evidence and use only a matching governed route.",
  };
}

function resolutionLabel(finding: SentinelHostFinding | undefined): string {
  const resolution = finding?.resolution;
  if (!resolution) return "UNRESOLVED";
  const state = resolution.state === "no-longer-present"
    ? "NO LONGER PRESENT"
    : resolution.state === "expected-accepted"
      ? "EXPECTED / ACCEPTED"
      : resolution.state.toUpperCase();
  return resolution.resolvedAt ? `${state} · ${formatDateTime(resolution.resolvedAt)}` : state;
}

function fanInvestigationNeedsDeepCheck(result: { explanation: string; report: HostCheckResponse }): boolean {
  const statuses = Object.values((result.report.metrics || {}) as Record<string, SentinelObservation>).map(observationStatus);
  return result.explanation.toLowerCase().includes("insufficient")
    || statuses.some((value) => ["attention", "elevated", "critical", "unknown", "unavailable", "unsupported"].includes(value));
}

function materiallyDifferentTimestamp(value: string | undefined, sample: string | undefined): boolean {
  if (!value || !sample) return false;
  const rowTime = Date.parse(value);
  const sampleTime = Date.parse(sample);
  return Number.isFinite(rowTime) && Number.isFinite(sampleTime) && Math.abs(rowTime - sampleTime) > 10_000;
}

function hostSignals(host: SentinelHostState): HostSignal[] {
  const metrics = host.metrics || {};
  const cpu = observationValue<{ utilizationPercent?: number }>(metrics.cpu, {});
  const load = observationValue<{ oneMinute?: number; fiveMinute?: number }>(metrics.load, {});
  const memory = observationValue<{ availableGiB?: number }>(metrics.memory, {});
  const filesystem = observationValue<{ freeGiB?: number }>(metrics.filesystem, {});
  const fans = observationValue<Array<{ rpm?: number }>>(metrics.fans, []);
  const gpuRows = observationValue<Array<{ temperatureC?: number | string; name?: string }>>(metrics.gpu, []);
  const gpuTemperature = Number(gpuRows[0]?.temperatureC);
  const services = observationValue<string[]>(metrics.services, []);
  return [
    { key: "thermal", label: "CPU temperature", status: observationStatus(metrics.thermal), value: primaryThermalValue(metrics.thermal), classification: measurementClassification(observationStatus(metrics.thermal), "thermal.maximumC"), baseline: baselineClassification(host, "thermal.maximumC"), reason: metrics.thermal?.reason || "No thermal evidence.", measuredAt: metrics.thermal?.observedAt },
    { key: "gpu", label: "GPU temperature", status: observationStatus(metrics.gpu), value: Number.isFinite(gpuTemperature) ? `${gpuTemperature}°C` : "Sensor unavailable", classification: measurementClassification(observationStatus(metrics.gpu), "gpu.temperatureC"), baseline: baselineClassification(host, "gpu.temperatureC"), reason: metrics.gpu?.reason || gpuRows[0]?.name || "GPU telemetry.", measuredAt: metrics.gpu?.observedAt },
    { key: "fans", label: "Fan", status: observationStatus(metrics.fans), value: typeof fans[0]?.rpm === "number" ? `${fans[0].rpm.toLocaleString()} RPM` : "Sensor unavailable", classification: measurementClassification(observationStatus(metrics.fans)), reason: metrics.fans?.reason || "Kernel fan evidence.", measuredAt: metrics.fans?.observedAt },
    { key: "cpu", label: "CPU", status: observationStatus(metrics.cpu), value: typeof cpu.utilizationPercent === "number" ? `${cpu.utilizationPercent}%` : "Unavailable", classification: measurementClassification(observationStatus(metrics.cpu), "cpu.utilizationPercent"), baseline: baselineClassification(host, "cpu.utilizationPercent"), reason: metrics.cpu?.reason || "Current Linux CPU sample.", measuredAt: metrics.cpu?.observedAt },
    { key: "load", label: "Load", status: observationStatus(metrics.load), value: typeof load.oneMinute === "number" ? `${load.oneMinute} / ${load.fiveMinute}` : "Unavailable", classification: measurementClassification(observationStatus(metrics.load), "load.oneMinute"), baseline: baselineClassification(host, "load.oneMinute"), reason: metrics.load?.reason || "Linux load averages.", measuredAt: metrics.load?.observedAt },
    { key: "memory", label: "Memory", status: observationStatus(metrics.memory), value: typeof memory.availableGiB === "number" ? `${memory.availableGiB} GiB free` : "Unavailable", classification: measurementClassification(observationStatus(metrics.memory), "memory.usedGiB"), baseline: baselineClassification(host, "memory.usedGiB"), reason: metrics.memory?.reason || "Current Linux memory counters.", measuredAt: metrics.memory?.observedAt },
    { key: "storage", label: "Disk", status: observationStatus(metrics.filesystem), value: typeof filesystem.freeGiB === "number" ? `${filesystem.freeGiB} GiB free` : "Unavailable", classification: measurementClassification(observationStatus(metrics.filesystem), "filesystem.freePercent"), baseline: baselineClassification(host, "filesystem.freePercent"), reason: metrics.filesystem?.reason || "Home filesystem capacity.", measuredAt: metrics.filesystem?.observedAt },
    { key: "services", label: "Services", status: observationStatus(metrics.services), value: `${services.length} failed`, classification: measurementClassification(observationStatus(metrics.services)), reason: metrics.services?.reason || "systemd failed-unit state.", measuredAt: metrics.services?.observedAt },
  ];
}

function operatorHealthState(status: SentinelStatus | null, currentHost: SentinelHostState | null, hasForeground: boolean): OperatorHealthState {
  const currentStatuses = Object.values(currentHost?.metrics || {}).map(observationStatus);
  if (currentStatuses.some((value) => ["critical", "elevated"].includes(value))) return "PROBLEM";
  if (currentStatuses.some((value) => value === "attention")) return "ATTENTION";
  if (hasForeground) {
    const required = ["cpu", "load", "thermal", "memory", "filesystem", "services"];
    return required.every((key) => observationStatus(currentHost?.metrics[key]) === "healthy") ? "HEALTHY" : "UNKNOWN";
  }
  if (status?.knownIncidentState?.active) return "ATTENTION";
  if (!status || status.host.overallStatus === "unknown") return "UNKNOWN";
  if (["critical", "elevated"].includes(status.host.overallStatus)) return "PROBLEM";
  if (["attention", "stale", "learning"].includes(status.host.overallStatus)) return "ATTENTION";
  return status.host.overallStatus === "healthy" ? "HEALTHY" : "UNKNOWN";
}

function primaryAttentionReason(status: SentinelStatus | null, currentHost: SentinelHostState | null): string {
  const priority = ["thermal", "knownIncident", "resourcePressure", "thermalThrottle", "fans", "cpu", "load", "memory", "filesystem", "processes", "listeners", "services", "docker"];
  for (const key of priority) {
    const metric = currentHost?.metrics[key];
    if (metric && ["critical", "elevated", "attention"].includes(metric.status)) return metric.reason;
  }
  if (status?.knownIncidentState?.active) return "The exact sustained Pop updater incident signature is active; Review & Fix opens the governed Safe Cleanup path.";
  return status?.host.primaryFinding?.reason || status?.host.verdictReason || status?.host.freshnessReason || "A fresh deterministic full scan is needed.";
}

function operatorHealthMessage(state: OperatorHealthState, status: SentinelStatus | null, currentHost: SentinelHostState | null): string {
  if (state === "HEALTHY") return "Your current foreground measurements are healthy; no current host issue needs action.";
  if (state === "ATTENTION" || state === "PROBLEM") return primaryAttentionReason(status, currentHost);
  return status?.host.freshness === "current"
    ? status.host.verdictReason || "The latest full scan is current, but required evidence is incomplete."
    : status?.host.freshnessReason || "Host Guardian needs a fresh full scan before it can answer confidently.";
}

function observationHealthStatus(observation: SentinelHostObservation): SentinelEvidenceStatus {
  if (observation.observedValues?.overallStatus) return observation.observedValues.overallStatus;
  if (observation.severity === "critical") return "critical";
  if (observation.severity === "elevated") return "elevated";
  if (observation.severity === "attention") return "attention";
  return "healthy";
}

function compactObservationMeasurements(observation: SentinelHostObservation): string {
  const measurements = observation.observedValues?.keyMeasurements;
  if (!measurements) return "Legacy observation · detailed measurements not retained";
  const values = [
    typeof measurements.cpuTemperatureC === "number" ? `CPU ${measurements.cpuTemperatureC}°C` : null,
    typeof measurements.gpuTemperatureC === "number" ? `GPU ${measurements.gpuTemperatureC}°C` : null,
    typeof measurements.fanRpm === "number" ? `Fan ${measurements.fanRpm.toLocaleString()} RPM` : null,
    typeof measurements.cpuPercent === "number" ? `CPU ${measurements.cpuPercent}%` : null,
    typeof measurements.loadOneMinute === "number" ? `Load ${measurements.loadOneMinute}` : null,
    typeof measurements.failedServiceCount === "number" ? (measurements.failedServiceCount ? `${measurements.failedServiceCount} failed services` : "Services OK") : null,
  ].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" · ") : "No concise measurement values were available.";
}

function observationExplanation(observation: SentinelHostObservation, status: SentinelEvidenceStatus): string | null {
  const finding = observation.observedValues?.findings?.[0] || observation.observedValues?.primaryFinding;
  if (finding) return exactFindingText(finding);
  const anomalies = observation.observedValues?.anomalies || [];
  if (anomalies.length) return anomalies.join(" · ");
  if (observation.observedValues?.verdictReason) return observation.observedValues.verdictReason;
  if (status === "attention") return "Attention was recorded; detailed reason was not retained.";
  if (status === "unknown") return "Result was unknown; detailed reason was not retained.";
  return null;
}

export function SentinelTab() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [liveMeasurements, setLiveMeasurements] = useState<SentinelCurrentMeasurements | null>(null);
  const [liveMeasurementError, setLiveMeasurementError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskSentinelResponse | null>(null);
  const [automationFrequency, setAutomationFrequency] = useState<SentinelAutomation["frequency"]>("twice-daily");
  const [popUpgradePreview, setPopUpgradePreview] = useState<PopUpgradeCleanupPreviewResponse | null>(null);
  const [fanInvestigation, setFanInvestigation] = useState<FanInvestigation | null>(null);
  const [showOlderActivity, setShowOlderActivity] = useState(false);

  const hostConfiguration = useGovernedRecordNote({ recordKey: "sentinel-host-configuration", path: HOST_CONFIGURATION_PATH, missingStatus: "Canonical host configuration is unavailable" });
  const hostNotes = useGovernedRecordNote({ recordKey: "sentinel-host-notes", path: HOST_NOTES_PATH, missingStatus: "Canonical host notes are unavailable" });

  const refresh = useCallback(async () => {
    const next = await loadSentinelStatus();
    setStatus(next);
    return next;
  }, []);

  const refreshCurrent = useCallback(async () => {
    const next = await loadCurrentHostMeasurements();
    setLiveMeasurements(next);
    setLiveMeasurementError("");
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    void loadSentinelStatus()
      .then((next) => { if (active) { setStatus(next); setAutomationFrequency(next.automation.frequency); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const sample = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await loadCurrentHostMeasurements();
        if (active) { setLiveMeasurements(next); setLiveMeasurementError(""); }
      } catch (reason) {
        if (active) setLiveMeasurementError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        inFlight = false;
      }
    };
    void sample();
    const interval = window.setInterval(() => void sample(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function perform(key: string, action: () => Promise<unknown>, success: string): Promise<void> {
    if (busyAction) return;
    setBusyAction(key); setError(""); setNotice("");
    try {
      await action();
      await refresh();
      await refreshCurrent();
      setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function investigateFans(): Promise<void> {
    if (busyAction) return;
    setBusyAction("fans"); setError(""); setNotice(""); setFanInvestigation(null); setPopUpgradePreview(null);
    try {
      const result = await explainFans();
      const deepCheckUsed = fanInvestigationNeedsDeepCheck(result);
      if (deepCheckUsed) await runHostDeepCheck();
      const [nextStatus, nextMeasurements] = await Promise.all([refresh(), refreshCurrent()]);
      const repairAvailable = Boolean(nextStatus.knownIncidentState?.active && nextStatus.recentIncidents.some((incident) => incident.id === nextStatus.knownIncidentState?.lastIncidentId && incident.actionsProposed?.includes("workstation.cleanup.pop_upgrade.preview")));
      const evidence = compactHostEvidence(deepCheckUsed ? nextStatus.host.metrics : result.report.metrics || nextMeasurements.metrics);
      const outcome: FanInvestigationOutcome = repairAvailable ? "FIX AVAILABLE" : "NO FIX NEEDED";
      setFanInvestigation({ diagnosis: result.explanation, evidence, outcome, deepCheckUsed });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function investigate(kind: InvestigationKind): Promise<void> {
    if (kind === "other") {
      setQuestion("Something else is wrong with my computer. What deterministic check should I run next?");
      setNotice("Describe the symptom below for bounded deterministic guidance. This quick guidance does not invoke a model.");
      return;
    }
    const success = kind === "network"
      ? "Fresh network and host evidence is ready to review."
      : kind === "suspicious"
        ? "Fresh local process, service, and network evidence is ready. Website and account security lives in Security Guardian."
        : kind === "codex"
          ? "Fresh process ancestry and CPU evidence is ready. Sentinel did not stop any process."
          : "Fresh process, service, container, and thermal evidence is ready to review.";
    await perform(`investigate-${kind}`, runHostDeepCheck, success);
  }

  async function diagnoseObservation(observation: SentinelHostObservation): Promise<void> {
    if (busyAction) return;
    const finding = observation.observedValues?.findings?.[0] || observation.observedValues?.primaryFinding;
    setBusyAction(`diagnose:${observation.id}`); setError("");
    setDiagnosis({ phase: "diagnosing", observationId: observation.id, scanKind: observation.observedValues?.scanKind || "full", durationMs: observation.observedValues?.scanDurationMs, finding: exactFindingText(finding), evidence: findingEvidence(finding), repairRan: false, nextStep: "The bounded read-only diagnostic advisor is reviewing this genuinely unknown result." });
    try {
      const result = await investigateHostObservation(observation.id);
      setDiagnosis({ phase: "complete", outcome: "NEEDS YOUR HELP", observationId: result.observationId, scanKind: observation.observedValues?.scanKind || "full", durationMs: observation.observedValues?.scanDurationMs, finding: result.diagnosis, evidence: findingEvidence(finding), repairRan: false, nextStep: result.nextStep });
      await refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setDiagnosis({ phase: "complete", outcome: "NEEDS YOUR HELP", observationId: observation.id, scanKind: observation.observedValues?.scanKind || "full", durationMs: observation.observedValues?.scanDurationMs, finding: "The governed diagnostic did not complete.", evidence: findingEvidence(finding), repairRan: false, nextStep: `${message} No repair ran.` });
    } finally {
      setBusyAction(null);
    }
  }

  async function reviewObservation(observation: SentinelHostObservation): Promise<void> {
    const guidance = observation.observedValues?.guidance;
    const unresolvedFindings = (observation.observedValues?.findings || []).filter((finding) => !finding.resolution || finding.resolution.state === "unresolved");
    const repairFinding = unresolvedFindings.find((finding) => Boolean(finding.repairCapability));
    if (guidance?.knownRepair || repairFinding) {
      const finding = repairFinding || observation.observedValues?.primaryFinding;
      const message = guidance?.message || repairFinding?.nextStep || "Review the exact governed repair before requesting authorization.";
      setDiagnosis({ phase: "complete", outcome: "FIX AVAILABLE", observationId: observation.id, scanKind: observation.observedValues?.scanKind || "full", durationMs: observation.observedValues?.scanDurationMs, finding: exactFindingText(finding), evidence: findingEvidence(finding), repairRan: false, nextStep: message });
      setFanInvestigation({
        diagnosis: message,
        evidence: compactObservationMeasurements(observation),
        outcome: "FIX AVAILABLE",
        deepCheckUsed: true,
      });
      setNotice("The exact known repair is ready for a fresh Safe Cleanup preview. No repair has run.");
      return;
    }
    if (observationHealthStatus(observation) === "unknown" && guidance?.advisorRecommended !== false) {
      await diagnoseObservation(observation);
      return;
    }
    setDiagnosis({
      phase: "complete",
      outcome: "NEEDS YOUR HELP",
      observationId: observation.id,
      scanKind: observation.observedValues?.scanKind || "full",
      durationMs: observation.observedValues?.scanDurationMs,
      finding: exactFindingText(observation.observedValues?.findings?.[0] || observation.observedValues?.primaryFinding),
      evidence: findingEvidence(observation.observedValues?.findings?.[0] || observation.observedValues?.primaryFinding),
      repairRan: false,
      nextStep: "No automatic repair qualifies. Use only an existing governed action whose target matches the evidence exactly.",
    });
  }

  async function diagnoseAndFix(): Promise<void> {
    if (busyAction) return;
    setBusyAction("diagnose-fix"); setError(""); setNotice(""); setPopUpgradePreview(null);
    setDiagnosis({ phase: "diagnosing", finding: "Collecting current deterministic host evidence…", evidence: [], repairRan: false, nextStep: "One bounded deep check is running. No repair has run." });
    try {
      const report = await runHostDeepCheck();
      const result = diagnosisFromReport(report);
      setDiagnosis(result);
      const [nextStatus, nextMeasurements] = await Promise.all([refresh(), refreshCurrent()]);
      if (result.outcome === "FIX AVAILABLE" && nextStatus.knownIncidentState?.active) {
        setFanInvestigation({ diagnosis: report.guidance?.message || result.finding, evidence: compactHostEvidence(report.metrics), outcome: "FIX AVAILABLE", deepCheckUsed: true });
        setNotice("A known issue matched. Review the exact Safe Cleanup preview before requesting OS authorization.");
      } else {
        setFanInvestigation(null);
      }
      setNotice(`Deterministic full scan completed · ${compactHostEvidence(nextMeasurements.metrics)}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setDiagnosis({ phase: "complete", outcome: "NEEDS YOUR HELP", scanKind: "deep", finding: "The deterministic deep check did not complete.", evidence: [], repairRan: false, nextStep: `${message} No repair ran.` });
    } finally {
      setBusyAction(null);
    }
  }

  async function submitQuestion(): Promise<void> {
    if (!question.trim() || busyAction) return;
    setBusyAction("ask"); setError("");
    try { setAnswer(await askSentinel(question.trim())); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyAction(null); }
  }

  async function setAutomation(enabled: boolean, frequency = automationFrequency): Promise<void> {
    await perform("automation", () => configureHostAutomation(enabled, frequency), enabled ? "Automatic full host scans are enabled. The 15-minute timer wake runs a full scan only when due." : "Automatic full host scans are off.");
  }

  async function previewPopUpgradeRepair(): Promise<void> {
    if (busyAction) return;
    setBusyAction("pop-upgrade-preview"); setError(""); setNotice("");
    try {
      const preview = await previewPopUpgradeCleanup();
      setPopUpgradePreview(preview); await refresh();
      setNotice(preview.ok ? "Review the exact updater target before requesting operating-system authorization." : "The updater no longer meets the exact Safe Cleanup signature.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyAction(null); }
  }

  async function applyPopUpgradeRepair(): Promise<void> {
    if (busyAction || !popUpgradePreview?.ok || !popUpgradePreview.candidate) return;
    setBusyAction("pop-upgrade-apply"); setError(""); setNotice("");
    try {
      const result = await applyPopUpgradeCleanup();
      await runHostHealthCheck();
      const [, nextMeasurements] = await Promise.all([refresh(), refreshCurrent()]);
      setPopUpgradePreview(null);
      const outcome: FanInvestigationOutcome = result.ok ? "FIXED" : "STILL PRESENT";
      const evidence = compactHostEvidence(nextMeasurements.metrics);
      const diagnosis = result.ok
        ? "The exact governed pop-upgrade.service repair completed and post-repair verification passed."
        : "The exact governed repair did not verify recovery. No broader process or service action was attempted.";
      setFanInvestigation({ diagnosis, evidence, outcome, deepCheckUsed: true });
      setDiagnosis({
        phase: "complete",
        outcome,
        observationId: status?.recentHostObservations[0]?.id,
        scanKind: "full",
        finding: diagnosis,
        evidence: [evidence],
        repairRan: true,
        nextStep: result.ok ? "Post-repair verification passed; continue normal monitoring." : "The finding is still present. No broader repair was attempted; review the retained evidence.",
      });
      setNotice(result.ok ? "Safe Cleanup completed and post-repair evidence was refreshed." : "Safe Cleanup did not verify recovery; review current evidence.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyAction(null); }
  }

  const displayHost = useMemo<SentinelHostState | null>(() => {
    if (!status) return null;
    return liveMeasurements ? { ...status.host, checkedAt: liveMeasurements.measuredAt, metrics: liveMeasurements.metrics } : status.host;
  }, [liveMeasurements, status]);
  const signals = useMemo(() => displayHost ? hostSignals(displayHost) : [], [displayHost]);
  const healthState = operatorHealthState(status, displayHost, Boolean(liveMeasurements));
  const threat = useMemo(() => deriveThreatState(status), [status]);
  const observations = (status?.recentHostObservations || []).slice(0, 20);
  const visibleObservations = showOlderActivity ? observations : observations.slice(0, 6);
  const hostMetrics = status?.host.metrics || {};
  const thermalRows = observationValue<ThermalRow[]>(hostMetrics.thermal, []);
  const processRows = observationValue<ProcessRow[]>(hostMetrics.processes, []);
  const listenerRows = observationValue<ListenerRow[]>(hostMetrics.listeners, []);
  const failedServices = observationValue<string[]>(hostMetrics.services, []);
  const docker = observationValue<{ containers?: ContainerRow[] }>(hostMetrics.docker, {});
  const automation = status?.automation;
  const automationActive = Boolean(automation?.active);
  const automationRequested = Boolean(automation?.enabled);
  const automaticStatus = automationActive ? `ON · ${automation?.frequency === "twice-daily" ? "Twice daily" : "Daily"}` : automationRequested ? "Timer unavailable" : "OFF";
  const scheduleStatus = automation?.scheduleStatus || "off";
  const popUpgradeIncident = status?.knownIncidentState?.active
    ? status.recentIncidents.find((incident) => incident.id === status.knownIncidentState?.lastIncidentId && incident.actionsProposed?.includes("workstation.cleanup.pop_upgrade.preview"))
    : undefined;
  const durableFinding = status?.host.findings?.find((finding) => finding.resolution?.state === "unresolved")
    || status?.host.findings?.[0]
    || (status?.host.primaryFinding?.status !== "healthy" ? status?.host.primaryFinding : undefined);
  const unresolvedCount = status?.host.resolutionSummary?.unresolved ?? status?.host.activeFindingCount ?? (status?.host.overallStatus === "healthy" ? 0 : durableFinding ? 1 : 0);
  const repairAvailable = Boolean(status?.knownIncidentState?.active && (status?.host.findings?.some((finding) => Boolean(finding.repairCapability)) || status?.host.guidance?.knownRepair));
  const primaryActionLabel = repairAvailable ? "Review & Fix" : "Diagnose";
  const attentionReason = primaryAttentionReason(status, displayHost);
  const currentTemperature = liveMeasurements?.summary.cpuTemperatureC;
  const currentNowDetail = healthState === "HEALTHY"
    ? `${typeof currentTemperature === "number" ? `CPU ${currentTemperature}°C · ` : ""}no current issue`
    : attentionReason;
  const lastFullStatus = status?.host.overallStatus ? sentinelStatusLabel(status.host.overallStatus) : "UNKNOWN";
  const lastFullFinding = unresolvedCount
    ? exactFindingText(durableFinding)
    : status?.host.checkedAt
      ? "No unresolved finding"
      : "No full scan recorded";

  return (
    <section className="sentinelShell" data-testid="radcon-sentinel">
      <header className={`sentinelHero sentinelThreat-${threat} sentinelOperatorHero`}>
        <div className="sentinelHeroCopy">
          <span className="sentinelEyebrow">RADCON SENTINEL · THIS COMPUTER</span>
          <h1>Is my computer okay?</h1>
          <p>{operatorHealthMessage(healthState, status, displayHost)}</p>
        </div>
          <div className="sentinelOperatorSummary" data-testid="sentinel-status-header">
          <div className={`sentinelOperatorState sentinelOperatorState-${healthState.toLowerCase()}`} data-testid="sentinel-current-now"><small>CURRENT NOW</small><strong>{healthState}</strong><span>{currentNowDetail}</span></div>
          <div data-testid="sentinel-last-full-scan"><small>LAST FULL SCAN</small><strong>{loading ? "Loading…" : `${lastFullStatus} · ${unresolvedCount} unresolved finding${unresolvedCount === 1 ? "" : "s"}`}</strong><span>{formatDateTime(status?.host.checkedAt)}</span></div>
          <div><small>NEXT FULL SCAN</small><strong>{automationRequested ? formatDateTime(automation?.nextDueAt) : "Automatic scans off"}</strong></div>
          <div title={lastFullFinding}><small>FULL-SCAN FINDING</small><strong>{lastFullFinding}</strong><span>{durableFinding ? resolutionLabel(durableFinding) : "CURRENT STATUS · CLEAR"}</span></div>
        </div>
        <div className="sentinelPrimaryActions" aria-label="Host Guardian actions">
          <button className="btn btnPrimary sentinelResolveAction" type="button" disabled={Boolean(busyAction)} onClick={() => void diagnoseAndFix()} data-testid="sentinel-diagnose-fix">{busyAction === "diagnose-fix" ? "Diagnosing…" : primaryActionLabel}</button>
          <button className="btn btnGhost sentinelFullScanAction" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("health", runHostHealthCheck, "Full host scan evidence refreshed.")} data-testid="sentinel-health-check">{busyAction === "health" ? "Scanning…" : "Run Full Scan"}</button>
          <button className="btn btnPrimary sentinelFanAction" type="button" disabled={Boolean(busyAction)} onClick={() => void investigateFans()} data-testid="sentinel-fans-loud">{busyAction === "fans" ? "Investigating…" : "Fans are loud"}</button>
          <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => setInvestigationOpen((value) => !value)} data-testid="sentinel-investigate-problem">Investigate another problem</button>
          <span className="sentinelAutomationControl"><strong>Automatic Full Scans · {automaticStatus}</strong>
            <select aria-label="Automatic Host Guardian frequency" value={automationFrequency} disabled={Boolean(busyAction)} onChange={(event) => { const frequency = event.target.value as SentinelAutomation["frequency"]; setAutomationFrequency(frequency); if (automationRequested) void setAutomation(true, frequency); }}>
              <option value="daily">Daily</option><option value="twice-daily">Twice daily</option>
            </select>
            <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void setAutomation(!automationRequested)} data-testid="sentinel-automation-toggle">{busyAction === "automation" ? "Saving…" : automationRequested ? "Turn off" : "Turn on"}</button>
          </span>
        </div>
        <div className="sentinelGuardianStrip" data-testid="host-guardian-status-strip">
          <strong>Full-scan schedule · {scheduleStatus.toUpperCase()}</strong>
          <span>Last full scan {formatDateTime(status?.host.checkedAt)}</span>
          <span>Next full scan {automationRequested ? formatDateTime(automation?.nextDueAt) : "Automatic scans off"}</span>
          <span>Full scans deterministic · no model tokens</span>
          <span>15-minute wake: due check + exact known-incident probe only</span>
          <span>{status?.auditVerification.ok ? "Audit/event/incident chains verified" : "Audit integrity requires attention"}</span>
        </div>

        {diagnosis ? <section className={`sentinelDiagnosisResult sentinelDiagnosisResult-${diagnosis.phase}`} data-testid="sentinel-diagnosis-result" aria-live="polite">
          <div className="sentinelDiagnosisResultHeading"><span>{diagnosis.phase === "diagnosing" ? "DIAGNOSING" : "DIAGNOSIS COMPLETE"}</span><strong>{diagnosis.phase === "diagnosing" ? "IN PROGRESS" : diagnosis.outcome}</strong></div>
          <div className="sentinelDiagnosisResultMeta"><span>Scan: {diagnosis.scanKind ? `${diagnosis.scanKind} deterministic check` : "deep deterministic check"}</span><span>Duration: {typeof diagnosis.durationMs === "number" ? `${(diagnosis.durationMs / 1000).toFixed(1)}s` : diagnosis.phase === "diagnosing" ? "measuring…" : "not retained"}</span><span>Repair ran: {diagnosis.repairRan ? "YES" : "NO"}</span></div>
          <div><small>PRIMARY FINDING</small><strong>{diagnosis.finding}</strong></div>
          <div><small>SUPPORTING EVIDENCE</small>{diagnosis.evidence.length ? <ul>{diagnosis.evidence.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Evidence collection is still in progress.</p>}</div>
          <div><small>NEXT STEP</small><p>{diagnosis.nextStep}</p></div>
        </section> : null}

        {fanInvestigation ? <section className={`sentinelFanResult sentinelFanResult-${fanInvestigation.outcome.toLowerCase().replace(/ /g, "-")}`} data-testid="sentinel-fan-investigation-result">
          <div className="sentinelFanResultHeading"><span>FAN INVESTIGATION</span><strong>{fanInvestigation.outcome}</strong></div>
          <p>{fanInvestigation.diagnosis}</p>
          <small>{fanInvestigation.evidence}</small>
          <div className="sentinelFanResultMeta"><span>{fanInvestigation.deepCheckUsed ? "Deeper deterministic evidence was collected automatically." : "The normal governed fan explanation was sufficient."}</span><span>Outcome retained in Sentinel history.</span></div>
          {popUpgradeIncident && fanInvestigation.outcome === "FIX AVAILABLE" ? <div className="guardianRepair" data-testid="pop-upgrade-safe-cleanup">
            <div><strong>Safe Cleanup matches the exact pop-upgrade.service signature.</strong><span>No automatic restart. A fresh preview, explicit confirmation, and OS authorization remain required.</span></div>
            {!popUpgradePreview?.ok ? <button className="btn btnPrimary" type="button" disabled={Boolean(busyAction)} onClick={() => void previewPopUpgradeRepair()}>{busyAction === "pop-upgrade-preview" ? "Checking target…" : "Fix now"}</button> : <div><strong>{popUpgradePreview.candidate?.service}</strong><div className="sentinelActions"><button className="btn btnPrimary" type="button" disabled={Boolean(busyAction)} onClick={() => void applyPopUpgradeRepair()}>{busyAction === "pop-upgrade-apply" ? "Authorizing…" : "Authorize & fix"}</button><button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => setPopUpgradePreview(null)}>Cancel</button></div></div>}
          </div> : null}
        </section> : null}

        {investigationOpen ? <section className="sentinelInvestigation" data-testid="sentinel-investigation-workflow"><div><span>INVESTIGATE ANOTHER PROBLEM</span><strong>Choose a symptom. Host Guardian starts with the smallest deterministic check.</strong></div><div className="sentinelInvestigationChoices"><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("slow")}>Computer is slow</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("network")}>Network problem</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("suspicious")}>Something suspicious is happening</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("codex")}>Check whether Codex left something running</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("other")}>Other problem</button></div>{question ? <div className="sentinelGuidanceInline"><textarea className="pasteArea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Describe the workstation symptom…" /><button className="btn btnPrimary" type="button" onClick={() => void submitQuestion()} disabled={!question.trim() || Boolean(busyAction)}>{busyAction === "ask" ? "Reviewing…" : "Get deterministic guidance"}</button>{answer ? <div className="sentinelAnswer"><strong>{answer.intent.replace(/-/g, " ")}</strong><p>{answer.answer}</p><small>Execution permitted: NO · AI model used: NO</small></div> : null}</div> : null}</section> : null}
      </header>

      <section className="sentinelHealthMeasurements" data-testid="sentinel-health-measurements">
        <div className="sentinelSectionHeading"><span>CURRENT MEASUREMENTS</span><strong>{liveMeasurements ? `Foreground reading · ${formatDateTime(liveMeasurements.measuredAt)}` : `Latest durable reading · ${formatDateTime(status?.host.checkedAt)}`}</strong></div>
        <p className="sentinelSubtle">Refreshes every 60 seconds while this subtab is visible. Deterministic, token-free, and not written to durable history.</p>
        {liveMeasurementError ? <div className="surfaceInlineNotice">Live refresh unavailable: {liveMeasurementError}. The latest durable values remain visible.</div> : null}
        <div className="sentinelMeasurementColumns" aria-hidden="true"><span>Measurement</span><span>Current value</span><span>State</span><span>Context</span></div>
        <div className="sentinelMeasurementList securityInsetScroll" data-testid="sentinel-measurement-list">
          {signals.map((signal) => <div className="sentinelMeasurementRow" key={signal.key} title={signal.reason} data-testid="sentinel-measurement-row"><span>{signal.label}</span><strong>{signal.value}</strong><span><span className={`sentinelMeasurementClass sentinelMeasurementClass-${signal.status}`}>{signal.classification}</span>{signal.baseline ? <small className="sentinelBaseline">{signal.baseline}</small> : null}</span><span>{signal.reason}{materiallyDifferentTimestamp(signal.measuredAt, liveMeasurements?.measuredAt || status?.host.checkedAt || undefined) ? <small>Measured {formatDateTime(signal.measuredAt)}</small> : null}</span></div>)}
          {!signals.length ? <div className="surfaceEmptyState">Run a Host Guardian check to collect current evidence.</div> : null}
        </div>
      </section>

      <section className="guardianActivity" data-testid="recent-guardian-activity">
        <div className="sentinelActivityHeader">
          <div><span>RECENT GUARDIAN ACTIVITY</span><strong>Durable Host Guardian observations · latest 20 maximum</strong></div>
          <small>Twice-daily semantic observations are retained here; foreground readings are not.</small>
        </div>
        <div className="guardianActivityColumns" aria-hidden="true"><span>Time</span><span>State</span><span>Source</span><span>Key measurements</span><span>Action / context</span></div>
        <div className="guardianActivityScroll securityInsetScroll">
          {visibleObservations.map((observation) => {
            const rowStatus = observationHealthStatus(observation);
            const explanation = observationExplanation(observation, rowStatus);
            const coverage = observation.observedValues?.coverage || [];
            const limitations = observation.observedValues?.coverageLimitations || [];
            const findings = observation.observedValues?.findings || (observation.observedValues?.primaryFinding ? [observation.observedValues.primaryFinding] : []);
            const actionableFinding = findings.find((finding) => !finding.resolution || finding.resolution.state === "unresolved");
            const repairFinding = findings.find((finding) => (!finding.resolution || finding.resolution.state === "unresolved") && Boolean(finding.repairCapability));
            const resolution = actionableFinding?.resolution;
            const reviewable = Boolean(actionableFinding);
            const reviewLabel = repairFinding || observation.observedValues?.knownRepairAvailable
              ? "Review & Fix"
              : rowStatus === "unknown"
                ? "Diagnose"
                : resolution?.disposition === "needs-operator"
                  ? "Show Resolution Steps"
                  : "Review Finding";
            return (
              <article className={`guardianActivityRow guardianActivityRow-${rowStatus}`} key={observation.id} data-testid="guardian-activity-row">
                <strong>{formatDateTime(observation.timestamp)}</strong>
                <StatusPill status={rowStatus} />
                <span>{observation.source === "systemd-user-timer" ? "Automatic" : "Operator"}</span>
                <strong>{compactObservationMeasurements(observation)}</strong>
                <div className="guardianActivityContext">
                  {findings.length ? <div className="guardianFindingList">{findings.map((finding, index) => <div key={finding.findingKey || `${observation.id}-${index}`}><strong>{exactFindingText(finding)}</strong><small>Current status: {resolutionLabel(finding)}</small></div>)}</div> : explanation ? <small>{explanation}</small> : <small>No action needed.</small>}
                  <small>{typeof observation.observedValues?.scanDurationMs === "number" ? `Full scan ${(observation.observedValues.scanDurationMs / 1000).toFixed(1)}s` : "Legacy duration not retained"} · {observation.observedValues?.scanKind || "legacy scan"}</small>
                  {observation.observedValues?.actionProposed ? <small>Proposed: {observation.observedValues.actionProposed}</small> : null}
                  {observation.observedValues?.actionOccurred || observation.observedValues?.repairOccurred ? <small>{observation.observedValues?.actionOccurred ? "Action occurred" : ""}{observation.observedValues?.actionOccurred && observation.observedValues?.repairOccurred ? " · " : ""}{observation.observedValues?.repairOccurred ? "Repair verified" : ""}{observation.observedValues?.postRepairVerificationPassed ? " · post-proof passed" : ""}</small> : null}
                  {reviewable ? <button className="btn btnGhost guardianInvestigateButton" type="button" disabled={Boolean(busyAction)} onClick={() => void reviewObservation(observation)} data-testid="guardian-review-finding">{busyAction === `diagnose:${observation.id}` ? "Investigating…" : reviewLabel}</button> : null}
                  <details className="guardianScanEvidence">
                    <summary>View scan evidence</summary>
                    {coverage.length ? <div className="guardianCoverageMini">{coverage.map((row) => <span key={row.key}><strong>{row.label}</strong><StatusPill status={row.status} /></span>)}</div> : <p>Legacy observation · scan coverage was not retained.</p>}
                    {limitations.length ? <div><strong>Coverage limitations</strong><ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div> : null}
                    {observation.observedValues?.snapshot ? <pre>{JSON.stringify(observation.observedValues.snapshot, null, 2)}</pre> : <p>Legacy observation · normalized snapshot was not retained.</p>}
                  </details>
                </div>
              </article>
            );
          })}
          {!observations.length ? <div className="surfaceEmptyState">No durable Host Guardian observations yet. Run a health check to establish the first record.</div> : null}
        </div>
        {observations.length > 6 ? <button className="btn btnGhost btnCompact guardianActivityToggle" type="button" onClick={() => setShowOlderActivity((value) => !value)}>{showOlderActivity ? "Show recent activity" : `Show ${observations.length - 6} older observations`}</button> : null}
      </section>

      {error ? <div className="panelError">{error}</div> : null}
      {notice ? <div className="sentinelNotice">{notice}</div> : null}

      <section className="sentinelAdvancedWorkspace">
        <header className="sentinelAdvancedHeading"><span>ADVANCED SYSTEM INFORMATION</span><strong>Distinct system evidence, maintenance, automation, records, and safety boundaries</strong></header>
        <p className="sentinelSubtle">Additional depth and provenance—not a second copy of Current Measurements. AI diagnostics cannot make privileged system changes without authorization.</p>

        <section className="sentinelAdvancedSection" data-testid="advanced-system-evidence">
          <div className="sentinelSubCardHeading"><div><span>SYSTEM EVIDENCE</span><strong>Sensors, process evidence, containers, network, and services</strong></div><div className="sentinelAdvancedHeadingActions"><StatusPill status={status?.host.overallStatus || "unknown"} /><button className="btn btnGhost btnCompact" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("deep", runHostDeepCheck, "Deep host evidence refreshed.")} data-testid="sentinel-deep-check">{busyAction === "deep" ? "Checking…" : "Deep Check"}</button></div></div>
          <div className="sentinelEvidenceDetails">
            <details className="sentinelDetails"><summary>Thermal sensors, sources, and hardware limits</summary><div className="sentinelCompactList securityInsetScroll">{thermalRows.map((sensor, index) => <div key={sensor.key || `${sensor.label}-${index}`}><span><strong>{sensor.label || "Unclassified sensor"}{sensor.primary ? " · primary CPU health source" : ""}</strong><small>{sensor.source || "kernel"}{sensor.path ? ` · ${sensor.path}` : ""}</small></span><span>{typeof sensor.temperatureC === "number" ? `${sensor.temperatureC}°C` : "Unknown"}{typeof sensor.criticalC === "number" && sensor.thresholdEligible ? ` · hardware critical ${sensor.criticalC}°C · governed safety margin applied` : " · threshold unavailable; evidence only"}</span></div>)}{!thermalRows.length ? <p>No sensor rows are available. This is not a healthy result.</p> : null}</div></details>
            <details className="sentinelDetails"><summary>High-resource processes</summary><div className="sentinelCompactList securityInsetScroll">{processRows.slice(0, 12).map((process) => <div key={process.pid || process.process}><span><strong>{process.process || "Unknown process"}{process.projectKey ? ` · ${process.projectKey}` : ""}</strong><small>PID {process.pid ?? "?"} · parent {process.ppid ?? "?"} · age {process.ageSeconds ?? "?"}s</small></span><span>{process.cpuPercent ?? "?"}% current CPU · {process.memoryPercent ?? "?"}% memory · {process.rssMiB ?? "?"} MiB</span></div>)}{!processRows.length ? <p>No process rows are available.</p> : null}</div></details>
            <details className="sentinelDetails"><summary>Containers + local stacks</summary><div className="sentinelCompactList securityInsetScroll">{(docker.containers || []).map((container) => <div key={container.name}><span><strong>{container.name || "Unnamed container"}{container.supabase ? " · Supabase" : ""}</strong><small>{container.image || "Unknown image"}</small></span><span>{container.state || "unknown"} · {container.statusText || "no status"}</span></div>)}{!(docker.containers || []).length ? <p>{hostMetrics.docker?.reason || "No container rows are available."}</p> : null}</div></details>
            <details className="sentinelDetails"><summary>Network + service evidence</summary><div className="sentinelCompactList securityInsetScroll">{listenerRows.slice(0, 16).map((listener, index) => <div key={`${listener.address}-${index}`}><span><strong>{listener.address || `Port ${listener.port || "?"}`}{listener.projectKey ? ` · ${listener.projectKey}` : ""}</strong><small>{listener.exposedBeyondLoopback ? "Binds beyond loopback" : "Loopback"} · {listener.expectedGovernedDevelopment ? "expected governed development port" : listener.owner || "owner unavailable"}</small></span><span>{listener.pids?.length ? `PID ${listener.pids.join(", ")}` : "Owner not visible"}</span></div>)}{failedServices.map((service) => <div key={service}><strong>{service}</strong><span>FAILED</span></div>)}{!listenerRows.length && !failedServices.length ? <p>No listener or failed-service rows are available.</p> : null}</div></details>
          </div>
        </section>

        <section className="sentinelAdvancedSection" data-testid="advanced-scan-coverage">
          <div className="sentinelSubCardHeading"><div><span>SCAN COVERAGE</span><strong>Exactly what the last full scan watched—and what remained limited</strong></div><small>{status?.host.scanDurationMs ? `${(status.host.scanDurationMs / 1000).toFixed(1)}s last run` : "No retained duration"}</small></div>
          <p className="sentinelSubtle">Twice-daily full scans cover current workstation evidence. The 15-minute timer wake does not repeat this scan; it checks due state and the one exact Pop updater incident signature only.</p>
          <div className="sentinelCoverageGrid securityInsetScroll">
            {(status?.host.coverage || []).map((row) => <div key={row.key}><span><strong>{row.label}</strong><small>{row.reason}</small></span><StatusPill status={row.status} /></div>)}
            {!status?.host.coverage?.length ? <div><span><strong>Coverage unavailable</strong><small>Run a full scan to establish the first versioned coverage record.</small></span><StatusPill status="unknown" /></div> : null}
          </div>
          {status?.host.coverageLimitations?.length ? <details className="sentinelDetails"><summary>Unsupported, unavailable, or historical-only evidence</summary><ul className="sentinelCoverageLimitations">{status.host.coverageLimitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details> : null}
        </section>

        <section className="sentinelAdvancedSection" data-testid="advanced-maintenance-updates">
          <div className="sentinelSubCardHeading"><div><span>MAINTENANCE &amp; UPDATES</span><strong>Update inventory and the one exact governed Safe Cleanup boundary</strong></div><small>No automatic executor</small></div>
          <HostUpdatesPanel disabled={Boolean(busyAction)} />
          <div className="sentinelCompactList sentinelBoundaryList securityInsetScroll" data-testid="host-maintenance-boundary"><div><span><strong>Safe Cleanup</strong><small>Exact pop-upgrade.service preview/apply only</small></span><small>Explicit confirmation + OS authorization</small></div><div><span><strong>Catalog refresh + official updater</strong><small>Historical maintenance workflow</small></span><small>Not exposed here</small></div></div>
        </section>

        <section className="sentinelAdvancedSection" data-testid="advanced-automation">
          <div className="sentinelSubCardHeading"><div><span>AUTOMATION</span><strong>Host Guardian configuration and inactive security, dependency, and backup schedules</strong></div><small>Scheduler {status?.scheduler || "disabled"}</small></div>
          <div className="sentinelTriggerList securityInsetScroll" data-testid="sentinel-triggers">{(status?.triggers || []).filter((trigger) => trigger.class === "schedule").map((trigger) => <div key={trigger.key}><span><strong>{trigger.key === "schedule.light-health" ? "Host Guardian" : trigger.label}</strong><small>{trigger.key === "schedule.light-health" && automationActive ? `Configured · ${automation?.frequency === "twice-daily" ? "Twice daily" : "Daily"}` : trigger.activationState === "inactive" ? "Not enabled" : trigger.activationState.replace(/-/g, " ")}</small></span><span>{trigger.key === "schedule.light-health" ? "Controlled in the health box above" : "No active schedule"}</span></div>)}</div>
        </section>

        <section className="sentinelAdvancedSection" data-testid="advanced-workstation-record">
          <div className="sentinelSubCardHeading"><div><span>WORKSTATION RECORD &amp; NOTES</span><strong>Canonical source records and local Sentinel history remain separate</strong></div></div>
          <div className="sentinelRecordColumns" data-testid="host-identity-record"><details className="sentinelDetails"><summary>Configuration and operating model</summary><div className="sentinelRecordEditor"><small>{hostConfiguration.loading ? "Loading canonical source…" : hostConfiguration.error || "Canonical source · read-only here"}</small><textarea className="pasteArea" value={hostConfiguration.text} readOnly data-testid="host-configuration-note" /></div></details><details className="sentinelDetails"><summary>Operator notes and history</summary><div className="sentinelRecordEditor"><small>{hostNotes.loading ? "Loading canonical source…" : hostNotes.error || "Canonical source · read-only here · routine activity appears in Sentinel history above"}</small><textarea className="pasteArea" value={hostNotes.text} readOnly data-testid="host-operator-notes" /></div></details></div>
        </section>

        <section className="sentinelAdvancedSection" data-testid="advanced-safety-permissions">
          <div className="sentinelSubCardHeading"><div><span>SAFETY &amp; PERMISSIONS</span><strong>Observation, maintenance, intervention, containment, emergency, and recovery</strong></div><small>O2 registry-derived</small></div>
          <div className="sentinelLevelList securityInsetScroll" data-testid="sentinel-capability-ladder">{SENTINEL_LEVELS.map((item) => { const levelCapabilities = status?.capabilities.filter((capability) => capability.level === item.level) || []; const levelState = sentinelCapabilityLevelState(item.level, status?.capabilities || []); return <div key={item.level}><span><strong>{item.label}</strong><small>{levelCapabilities.length} declared capabilities</small></span><span className={`sentinelLevelState sentinelLevelState-${levelState}`}>{levelState === "active" ? "ACTIVE · READ ONLY" : "NOT ACTIVATED"}</span></div>; })}</div>
          <div className="sentinelBoundary"><span>Mode: {status?.executionMode || "observe-and-dry-run"}</span><span>Privileged helper: {status?.privilegedHelper || "not-installed"}</span><span>Scheduler: {status?.scheduler || "disabled"}</span><span>Audit: {status?.auditVerification.claim || "hash-chained-not-immutable"}</span></div>
        </section>
      </section>

    </section>
  );
}
