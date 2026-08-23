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
  type SentinelHostObservation,
  type SentinelHostState,
  type SentinelObservation,
  type SentinelStatus,
  type SentinelTrigger,
} from "./sentinelModel";

const HOST_CONFIGURATION_PATH = "docs/infrastructure/assets/system76-workstation/CONFIGURATION.md";
const HOST_NOTES_PATH = "docs/infrastructure/assets/system76-workstation/NOTES.md";
const ASK_PROMPTS = [
  "Why are my fans running?",
  "Is my computer healthy?",
  "Is anything unusual happening?",
  "Check whether Codex left something running.",
  "What needs my attention?",
];

type Props = {
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type HostSignal = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  value: string;
  classification: string;
  reason: string;
  measuredAt?: string;
};

type OperatorHealthState = "HEALTHY" | "ATTENTION" | "PROBLEM" | "UNKNOWN";
type InvestigationKind = "fans" | "slow" | "network" | "suspicious" | "other";
type ThermalRow = { key?: string; label?: string; temperatureC?: number; criticalC?: number | null; source?: string };
type ProcessRow = { pid?: number; ppid?: number; ageSeconds?: number; cpuPercent?: number; memoryPercent?: number; rssMiB?: number; process?: string };
type ListenerRow = { address?: string; port?: number; exposedBeyondLoopback?: boolean; pids?: number[] };
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

function measurementClassification(host: SentinelHostState, status: SentinelEvidenceStatus, baselineKey?: string): string {
  if (["attention", "elevated", "critical", "stale"].includes(status)) return sentinelStatusLabel(status);
  if (baselineKey && baselineStatus(host, baselineKey) === "learning") return "Baseline learning";
  if (baselineKey && baselineStatus(host, baselineKey) === "available") return "Baseline available";
  if (status === "learning") return "Measurement available · safety limit incomplete";
  if (status === "healthy") return "Normal";
  if (status === "unsupported") return "Sensor unavailable";
  return sentinelStatusLabel(status);
}

function hottestThermalValue(observation: SentinelObservation | undefined): string {
  const hottest = observationValue<ThermalRow[]>(observation, [])
    .filter((row) => typeof row.temperatureC === "number")
    .sort((left, right) => (right.temperatureC || 0) - (left.temperatureC || 0))[0];
  return hottest ? `${hottest.temperatureC}°C` : "Sensor unavailable";
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
    { key: "thermal", label: "CPU temperature", status: observationStatus(metrics.thermal), value: hottestThermalValue(metrics.thermal), classification: measurementClassification(host, observationStatus(metrics.thermal), "thermal.maximumC"), reason: metrics.thermal?.reason || "No thermal evidence.", measuredAt: metrics.thermal?.observedAt },
    { key: "gpu", label: "GPU temperature", status: observationStatus(metrics.gpu), value: Number.isFinite(gpuTemperature) ? `${gpuTemperature}°C` : "Sensor unavailable", classification: measurementClassification(host, observationStatus(metrics.gpu), "gpu.temperatureC"), reason: metrics.gpu?.reason || gpuRows[0]?.name || "GPU telemetry.", measuredAt: metrics.gpu?.observedAt },
    { key: "fans", label: "Fan", status: observationStatus(metrics.fans), value: typeof fans[0]?.rpm === "number" ? `${fans[0].rpm.toLocaleString()} RPM` : "Sensor unavailable", classification: measurementClassification(host, observationStatus(metrics.fans)), reason: metrics.fans?.reason || "Kernel fan evidence.", measuredAt: metrics.fans?.observedAt },
    { key: "cpu", label: "CPU", status: observationStatus(metrics.cpu), value: typeof cpu.utilizationPercent === "number" ? `${cpu.utilizationPercent}%` : "Unavailable", classification: measurementClassification(host, observationStatus(metrics.cpu), "cpu.utilizationPercent"), reason: metrics.cpu?.reason || "Current Linux CPU sample.", measuredAt: metrics.cpu?.observedAt },
    { key: "load", label: "Load", status: observationStatus(metrics.load), value: typeof load.oneMinute === "number" ? `${load.oneMinute} / ${load.fiveMinute}` : "Unavailable", classification: measurementClassification(host, observationStatus(metrics.load), "load.oneMinute"), reason: metrics.load?.reason || "Linux load averages.", measuredAt: metrics.load?.observedAt },
    { key: "memory", label: "Memory", status: observationStatus(metrics.memory), value: typeof memory.availableGiB === "number" ? `${memory.availableGiB} GiB free` : "Unavailable", classification: measurementClassification(host, observationStatus(metrics.memory), "memory.usedGiB"), reason: metrics.memory?.reason || "Current Linux memory counters.", measuredAt: metrics.memory?.observedAt },
    { key: "storage", label: "Disk", status: observationStatus(metrics.filesystem), value: typeof filesystem.freeGiB === "number" ? `${filesystem.freeGiB} GiB free` : "Unavailable", classification: measurementClassification(host, observationStatus(metrics.filesystem), "filesystem.freePercent"), reason: metrics.filesystem?.reason || "Home filesystem capacity.", measuredAt: metrics.filesystem?.observedAt },
    { key: "services", label: "Services", status: observationStatus(metrics.services), value: `${services.length} failed`, classification: measurementClassification(host, observationStatus(metrics.services)), reason: metrics.services?.reason || "systemd failed-unit state.", measuredAt: metrics.services?.observedAt },
  ];
}

function operatorHealthState(status: SentinelStatus | null): OperatorHealthState {
  if (!status || status.host.overallStatus === "unknown") return "UNKNOWN";
  if (["critical", "elevated"].includes(status.host.overallStatus)) return "PROBLEM";
  if (["attention", "stale", "learning"].includes(status.host.overallStatus)) return "ATTENTION";
  return status.host.overallStatus === "healthy" ? "HEALTHY" : "UNKNOWN";
}

function operatorHealthMessage(state: OperatorHealthState): string {
  if (state === "HEALTHY") return "Your latest durable Host Guardian check found no current host issue that needs action.";
  if (state === "ATTENTION") return "Your computer is usable, but one or more current signals need a closer look.";
  if (state === "PROBLEM") return "Host Guardian found a current problem. Investigate before changing anything.";
  return "Host Guardian needs a fresh durable health check before it can answer confidently.";
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
  if (!measurements) return "Measurements were not retained for this earlier observation.";
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

function triggerLastRun(trigger: SentinelTrigger, status: SentinelStatus): string | null {
  return trigger.lastRunAt || status.recentActions.find((action) => action.requestedCapability === trigger.capability)?.requestedAt || null;
}

export function SentinelTab({ registerBeforeTabChangeSaver }: Props) {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [liveMeasurements, setLiveMeasurements] = useState<SentinelCurrentMeasurements | null>(null);
  const [liveMeasurementError, setLiveMeasurementError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [diagnosis, setDiagnosis] = useState<{ observationId: string; diagnosis: string; nextStep: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskSentinelResponse | null>(null);
  const [automationFrequency, setAutomationFrequency] = useState<SentinelAutomation["frequency"]>("daily");
  const [popUpgradePreview, setPopUpgradePreview] = useState<PopUpgradeCleanupPreviewResponse | null>(null);

  const hostConfiguration = useGovernedRecordNote({ recordKey: "sentinel-host-configuration", path: HOST_CONFIGURATION_PATH, missingStatus: "Canonical host configuration will be created on first save" });
  const hostNotes = useGovernedRecordNote({ recordKey: "sentinel-host-notes", path: HOST_NOTES_PATH, missingStatus: "Canonical host notes will be created on first save" });

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(async () => (await hostConfiguration.flush()) && hostNotes.flush());
    return () => registerBeforeTabChangeSaver(null);
  }, [hostConfiguration.flush, hostNotes.flush, registerBeforeTabChangeSaver]);

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
    setBusyAction("fans"); setError(""); setNotice("");
    try {
      const result = await explainFans();
      await refresh(); await refreshCurrent();
      setNotice(result.explanation);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function investigate(kind: InvestigationKind): Promise<void> {
    if (kind === "fans") return investigateFans();
    if (kind === "other") {
      setQuestion("Something else is wrong with my computer. What deterministic check should I run next?");
      setNotice("Describe the symptom below for bounded deterministic guidance. This quick guidance does not invoke a model.");
      return;
    }
    const success = kind === "network"
      ? "Fresh network and host evidence is ready to review."
      : kind === "suspicious"
        ? "Fresh local process, service, and network evidence is ready. Website and account security lives in Security Guardian."
        : "Fresh process, service, container, and thermal evidence is ready to review.";
    await perform(`investigate-${kind}`, runHostDeepCheck, success);
  }

  async function diagnoseObservation(observation: SentinelHostObservation): Promise<void> {
    if (busyAction) return;
    setBusyAction(`diagnose:${observation.id}`); setError(""); setDiagnosis(null);
    try {
      const result = await investigateHostObservation(observation.id);
      setDiagnosis({ observationId: result.observationId, diagnosis: result.diagnosis, nextStep: result.nextStep });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
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
    await perform("automation", () => configureHostAutomation(enabled, frequency), enabled ? "Automatic Host Guardian observation is enabled. It will run only when due." : "Automatic Host Guardian observation is off.");
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
      await runHostHealthCheck(); await refresh(); await refreshCurrent();
      setPopUpgradePreview(null);
      setNotice(result.ok ? "Safe Cleanup completed and post-repair evidence was refreshed." : "Safe Cleanup did not verify recovery; review current evidence.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyAction(null); }
  }

  const displayHost = useMemo<SentinelHostState | null>(() => {
    if (!status) return null;
    return liveMeasurements ? { ...status.host, checkedAt: liveMeasurements.measuredAt, metrics: liveMeasurements.metrics } : status.host;
  }, [liveMeasurements, status]);
  const signals = useMemo(() => displayHost ? hostSignals(displayHost) : [], [displayHost]);
  const healthState = operatorHealthState(status);
  const threat = useMemo(() => deriveThreatState(status), [status]);
  const observations = (status?.recentHostObservations || []).slice(0, 20);
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
  const popUpgradeIncident = status?.recentIncidents.find((incident) => incident.status.toLowerCase() === "open" && incident.actionsProposed?.includes("workstation.cleanup.pop_upgrade.preview"));

  return (
    <section className="sentinelShell" data-testid="radcon-sentinel">
      <header className={`sentinelHero sentinelThreat-${threat} sentinelOperatorHero`}>
        <div className="sentinelHeroCopy">
          <span className="sentinelEyebrow">RADCON SENTINEL · THIS COMPUTER</span>
          <h1>Is my computer okay?</h1>
          <p>{operatorHealthMessage(healthState)}</p>
        </div>
        <div className="sentinelOperatorSummary" data-testid="sentinel-status-header">
          <div className={`sentinelOperatorState sentinelOperatorState-${healthState.toLowerCase()}`}><small>CURRENT HEALTH</small><strong>{healthState}</strong></div>
          <div><small>LAST DURABLE CHECK</small><strong>{loading ? "Loading…" : formatDateTime(status?.host.checkedAt)}</strong></div>
          <div><small>NEXT SEMANTIC OBSERVATION</small><strong>{automationActive ? formatDateTime(automation?.nextDueAt) : automationRequested ? "Timer unavailable" : "Not active"}</strong></div>
          <div><small>OPERATOR ATTENTION</small><strong>{healthState === "HEALTHY" ? "Nothing current" : healthState === "UNKNOWN" ? "Fresh check needed" : "Review activity"}</strong></div>
          <div><small>AUTOMATIC GUARDIAN</small><strong>{automaticStatus}</strong></div>
        </div>
        <div className="sentinelPrimaryActions" aria-label="Host Guardian actions">
          <button className="btn btnPrimary" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("health", runHostHealthCheck, "Host health evidence refreshed.")} data-testid="sentinel-health-check">{busyAction === "health" ? "Checking…" : "Run Health Check"}</button>
          <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => setInvestigationOpen((value) => !value)} data-testid="sentinel-investigate-problem">Investigate a Problem</button>
          <span className="sentinelAutomationStatus">Automatic Guardian: <strong>{automaticStatus}</strong>
            <select aria-label="Automatic Host Guardian frequency" value={automationFrequency} disabled={Boolean(busyAction)} onChange={(event) => { const frequency = event.target.value as SentinelAutomation["frequency"]; setAutomationFrequency(frequency); if (automationRequested) void setAutomation(true, frequency); }}>
              <option value="daily">Daily</option><option value="twice-daily">Twice daily</option>
            </select>
            <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void setAutomation(!automationRequested)} data-testid="sentinel-automation-toggle">{busyAction === "automation" ? "Saving…" : automationRequested ? "Turn off" : "Turn on"}</button>
          </span>
        </div>
        <div className="sentinelVisibilityBoundary"><strong>Routine checks are deterministic and use no model tokens.</strong><span>{status?.auditVerification.ok ? "Audit/event/incident chains verified" : "Audit integrity requires attention"}</span></div>
      </header>

      <section className="guardianActivity" data-testid="recent-guardian-activity">
        <div className="sentinelActivityHeader">
          <div><span>RECENT GUARDIAN ACTIVITY</span><strong>Durable Host Guardian observations · latest 20 maximum</strong></div>
          <small>Twice-daily semantic observations are retained here; foreground readings are not.</small>
        </div>
        <div className="guardianActivityScroll">
          {observations.map((observation) => {
            const rowStatus = observationHealthStatus(observation);
            const anomalies = observation.observedValues?.anomalies || [];
            const actionable = anomalies.length > 0 || ["attention", "elevated", "critical"].includes(rowStatus);
            return (
              <article className={`guardianActivityRow guardianActivityRow-${rowStatus}`} key={observation.id} data-testid="guardian-activity-row">
                <div className="guardianActivityWhen"><strong>{formatDateTime(observation.timestamp)}</strong><StatusPill status={rowStatus} /><small>{observation.source === "systemd-user-timer" ? "Automatic observation" : "Operator check"}</small></div>
                <div className="guardianActivityEvidence"><strong>{compactObservationMeasurements(observation)}</strong>{anomalies.length ? <span>{anomalies.join(" · ")}</span> : <span>No recorded anomaly.</span>}<small>{observation.observedValues?.actionOccurred ? "Action occurred" : "No action"} · {observation.observedValues?.repairOccurred ? "Repair verified" : "No repair"}</small></div>
                {actionable ? <button className="btn btnGhost guardianInvestigateButton" type="button" disabled={Boolean(busyAction)} onClick={() => void diagnoseObservation(observation)} data-testid="guardian-investigate-fix">{busyAction === `diagnose:${observation.id}` ? "Investigating…" : "Investigate / Fix"}</button> : null}
              </article>
            );
          })}
          {!observations.length ? <div className="surfaceEmptyState">No durable Host Guardian observations yet. Run a health check to establish the first record.</div> : null}
        </div>
        {diagnosis ? <div className="guardianDiagnosis" data-testid="guardian-diagnosis"><strong>Governed diagnostic · selected observation {diagnosis.observationId}</strong><p>{diagnosis.diagnosis}</p><small>{diagnosis.nextStep}</small></div> : null}
        {popUpgradeIncident ? <div className="guardianRepair" data-testid="pop-upgrade-safe-cleanup">
          <div><strong>Safe Cleanup is available for the exact pop-upgrade.service anomaly.</strong><span>No automatic restart. A fresh preview and separate OS authorization are required.</span></div>
          {!popUpgradePreview?.ok ? <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void previewPopUpgradeRepair()}>{busyAction === "pop-upgrade-preview" ? "Checking target…" : "Fix safely"}</button> : <div><strong>{popUpgradePreview.candidate?.service}</strong><div className="sentinelActions"><button className="btn btnPrimary" type="button" disabled={Boolean(busyAction)} onClick={() => void applyPopUpgradeRepair()}>{busyAction === "pop-upgrade-apply" ? "Authorizing…" : "Confirm restart"}</button><button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => setPopUpgradePreview(null)}>Cancel</button></div></div>}
        </div> : null}
      </section>

      <section className="sentinelHealthMeasurements" data-testid="sentinel-health-measurements">
        <div className="sentinelSectionHeading"><span>CURRENT MEASUREMENTS</span><strong>{liveMeasurements ? `Foreground reading · ${formatDateTime(liveMeasurements.measuredAt)}` : `Latest durable reading · ${formatDateTime(status?.host.checkedAt)}`}</strong></div>
        <p className="sentinelSubtle">Refreshes every 60 seconds while this subtab is visible. Deterministic, token-free, and not written to durable history.</p>
        {liveMeasurementError ? <div className="surfaceInlineNotice">Live refresh unavailable: {liveMeasurementError}. The latest durable values remain visible.</div> : null}
        <div className="sentinelSignalGrid sentinelPrimaryMeasurements">
          {signals.map((signal) => <div className="sentinelSignal" key={signal.key} title={signal.reason}><span>{signal.label}</span><strong>{signal.value}</strong><small className={`sentinelMeasurementClass sentinelMeasurementClass-${signal.status}`}>{signal.classification}</small><small>{formatDateTime(signal.measuredAt || displayHost?.checkedAt)}</small></div>)}
          {!signals.length ? <div className="surfaceEmptyState">Run a Host Guardian check to collect current evidence.</div> : null}
        </div>
      </section>

      {investigationOpen ? <section className="sentinelInvestigation" data-testid="sentinel-investigation-workflow"><div><span>INVESTIGATE A PROBLEM</span><strong>Choose a symptom. Host Guardian starts with the smallest deterministic check.</strong></div><div className="sentinelInvestigationChoices"><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("fans")}>Fans / heat</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("slow")}>Computer is slow</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("network")}>Internet / network</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("suspicious")}>Something suspicious</button><button type="button" className="btn btnGhost" disabled={Boolean(busyAction)} onClick={() => void investigate("other")}>Other</button></div></section> : null}
      {error ? <div className="panelError">{error}</div> : null}
      {notice ? <div className="sentinelNotice">{notice}</div> : null}

      <details className="sentinelDetails sentinelAdvancedWorkspace">
        <summary>Advanced evidence, controls, and workstation records</summary>
        <p className="sentinelSubtle">Additional depth and provenance—not a second copy of current summary measurements. The LLM is not root.</p>
        <div className="sentinelActions" aria-label="Sentinel manual read-only checks"><button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("deep", runHostDeepCheck, "Deep host evidence refreshed.")} data-testid="sentinel-deep-check">{busyAction === "deep" ? "Checking…" : "Deep Check"}</button><button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("refresh", async () => undefined, "Sentinel status refreshed.")} data-testid="sentinel-refresh">{busyAction === "refresh" ? "Refreshing…" : "Refresh"}</button><button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void investigateFans()}>{busyAction === "fans" ? "Investigating…" : "Why are my fans running?"}</button></div>

        <section className="sentinelGuardianCard" data-testid="host-guardian">
          <div className="sentinelGuardianHeading"><div><span>HOST GUARDIAN EVIDENCE</span><strong>Sensor sources, thresholds, processes, services, and provenance</strong></div><StatusPill status={status?.host.overallStatus || "unknown"} /></div>
          <div className="sentinelEvidenceDetails">
            <details className="sentinelDetails"><summary>Thermal sensors, sources, and hardware limits</summary><div className="sentinelCompactList">{thermalRows.map((sensor, index) => <div key={sensor.key || `${sensor.label}-${index}`}><span><strong>{sensor.label || "Unclassified sensor"}</strong><small>{sensor.source || "kernel"}</small></span><span>{typeof sensor.temperatureC === "number" ? `${sensor.temperatureC}°C` : "Unknown"}{typeof sensor.criticalC === "number" ? ` · critical ${sensor.criticalC}°C · margin ${(sensor.criticalC - (sensor.temperatureC || 0)).toFixed(1)}°C` : " · hardware critical trip unavailable"}</span></div>)}{!thermalRows.length ? <p>No sensor rows are available. This is not a healthy result.</p> : null}</div></details>
            <details className="sentinelDetails"><summary>High-resource processes</summary><div className="sentinelCompactList">{processRows.slice(0, 12).map((process) => <div key={process.pid || process.process}><span><strong>{process.process || "Unknown process"}</strong><small>PID {process.pid ?? "?"} · parent {process.ppid ?? "?"} · age {process.ageSeconds ?? "?"}s</small></span><span>{process.cpuPercent ?? "?"}% CPU · {process.memoryPercent ?? "?"}% memory · {process.rssMiB ?? "?"} MiB</span></div>)}{!processRows.length ? <p>No process rows are available.</p> : null}</div></details>
            <details className="sentinelDetails"><summary>Containers + local stacks</summary><div className="sentinelCompactList">{(docker.containers || []).map((container) => <div key={container.name}><span><strong>{container.name || "Unnamed container"}{container.supabase ? " · Supabase" : ""}</strong><small>{container.image || "Unknown image"}</small></span><span>{container.state || "unknown"} · {container.statusText || "no status"}</span></div>)}{!(docker.containers || []).length ? <p>{hostMetrics.docker?.reason || "No container rows are available."}</p> : null}</div></details>
            <details className="sentinelDetails"><summary>Network + service evidence</summary><div className="sentinelCompactList">{listenerRows.slice(0, 16).map((listener, index) => <div key={`${listener.address}-${index}`}><span><strong>{listener.address || `Port ${listener.port || "?"}`}</strong><small>{listener.exposedBeyondLoopback ? "Binds beyond loopback" : "Loopback"}</small></span><span>{listener.pids?.length ? `PID ${listener.pids.join(", ")}` : "Owner not visible"}</span></div>)}{failedServices.map((service) => <div key={service}><strong>{service}</strong><span>FAILED</span></div>)}{!listenerRows.length && !failedServices.length ? <p>No listener or failed-service rows are available.</p> : null}</div></details>
          </div>
        </section>

        <div className="sentinelHostSupportGrid">
          <section className="sentinelSubCard" data-testid="host-identity-record"><div className="sentinelSubCardHeading"><div><span>WORKSTATION IDENTITY + RECORD</span><strong>Canonical O2 System76 record</strong></div><small>No duplicated RadControl data</small></div><details className="sentinelDetails"><summary>Configuration and operating model</summary><div className="sentinelRecordEditor"><small>{hostConfiguration.status}</small><textarea className="pasteArea" value={hostConfiguration.text} readOnly={!hostConfiguration.path || hostConfiguration.loading} onChange={(event) => hostConfiguration.onTextChange(event.target.value)} data-testid="host-configuration-note" /></div></details><details className="sentinelDetails"><summary>Operator notes and history</summary><div className="sentinelRecordEditor"><small>{hostNotes.status}</small><textarea className="pasteArea" value={hostNotes.text} readOnly={!hostNotes.path || hostNotes.loading} onChange={(event) => hostNotes.onTextChange(event.target.value)} data-testid="host-operator-notes" /></div></details></section>
          <HostUpdatesPanel disabled={Boolean(busyAction)} />
          <section className="sentinelSubCard" data-testid="host-maintenance-boundary"><div className="sentinelSubCardHeading"><div><span>HOST MAINTENANCE BOUNDARY</span><strong>Preserved governed capability limits</strong></div><small>No automatic executor</small></div><div className="sentinelCompactList"><div><span><strong>Safe cleanup</strong><small>Exact pop-upgrade preview/apply only</small></span><small>Explicit confirmation + OS authorization</small></div><div><span><strong>Catalog refresh + official updater</strong><small>Historical maintenance workflow</small></span><small>Not exposed here</small></div></div></section>
        </div>

        <div className="sentinelAuthorityGrid">
          <section className="sentinelSubCard" data-testid="sentinel-capability-ladder"><div className="sentinelSubCardHeading"><div><span>AUTHORITY</span><strong>Capability ladder</strong></div><small>O2 registry-derived</small></div><div className="sentinelLevelList">{SENTINEL_LEVELS.map((item) => { const levelCapabilities = status?.capabilities.filter((capability) => capability.level === item.level) || []; const levelState = sentinelCapabilityLevelState(item.level, status?.capabilities || []); return <div key={item.level}><span><strong>Level {item.level} — {item.label}</strong><small>{levelCapabilities.length} declared capabilities</small></span><span className={`sentinelLevelState sentinelLevelState-${levelState}`}>{levelState === "active" ? "ACTIVE · READ ONLY" : "NOT ACTIVATED"}</span></div>; })}</div></section>
          <section className="sentinelSubCard" data-testid="sentinel-triggers"><div className="sentinelSubCardHeading"><div><span>TRIGGERS + SCHEDULES</span><strong>Declared activation truth</strong></div><small>Scheduler {status?.scheduler || "disabled"}</small></div><div className="sentinelTriggerList">{(status?.triggers || []).map((trigger) => { const lastRun = status ? triggerLastRun(trigger, status) : null; return <div key={trigger.key}><span><strong>{trigger.label}</strong><small>{trigger.class.toUpperCase()} · {trigger.guardian.toUpperCase()}</small></span><span><strong>{trigger.activationState === "active" ? "ACTIVE" : trigger.activationState.replace(/-/g, " ").toUpperCase()}</strong>{lastRun ? <small>Last {formatDateTime(lastRun)}</small> : null}{trigger.nextRunAt ? <small>Next {formatDateTime(trigger.nextRunAt)}</small> : null}</span></div>; })}</div></section>
        </div>

        <section className="sentinelAsk"><div><span>QUICK DETERMINISTIC GUIDANCE</span><small>No live LLM · no shell or execution channel</small></div><div className="sentinelPromptRow">{ASK_PROMPTS.map((prompt) => <button className="btn btnGhost btnCompact" type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div><div className="sentinelAskControls"><textarea className="pasteArea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about health, visibility, recent activity, or an incident…" /><button className="btn btnPrimary" type="button" onClick={() => void submitQuestion()} disabled={!question.trim() || Boolean(busyAction)}>{busyAction === "ask" ? "Reviewing…" : "Ask Sentinel"}</button></div>{answer ? <div className="sentinelAnswer"><strong>{answer.intent.replace(/-/g, " ")}</strong><p>{answer.answer}</p><small>Execution permitted: NO · LLM connected: NO</small></div> : null}</section>
      </details>

      <footer className="sentinelBoundary"><span>Mode: {status?.executionMode || "observe-and-dry-run"}</span><span>Privileged helper: {status?.privilegedHelper || "not-installed"}</span><span>Scheduler: {status?.scheduler || "disabled"}</span><span>Audit: {status?.auditVerification.claim || "hash-chained-not-immutable"}</span></footer>
    </section>
  );
}
