import { useCallback, useEffect, useMemo, useState } from "react";
import {
  askSentinel,
  explainFans,
  loadSentinelStatus,
  prepareLockdownDryRun,
  runHostDeepCheck,
  runHostHealthCheck,
  runSecurityCheck,
  type AskSentinelResponse,
} from "./sentinelApi";
import {
  observationValue,
  sentinelStatusLabel,
  type SentinelEvidenceStatus,
  type SentinelHostState,
  type SentinelObservation,
  type SentinelStatus,
} from "./sentinelModel";

type HostSignal = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  value: string;
  reason: string;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function observationStatus(
  observation: SentinelObservation | undefined,
): SentinelEvidenceStatus {
  return observation?.status || "unknown";
}

function highestTemperature(observation: SentinelObservation | undefined): string {
  const rows = observationValue<Array<{ temperatureC?: number; label?: string }>>(
    observation,
    [],
  );
  const hottest = rows
    .filter((row) => typeof row.temperatureC === "number")
    .sort((left, right) => (right.temperatureC || 0) - (left.temperatureC || 0))[0];
  return hottest ? `${hottest.temperatureC}°C · ${hottest.label || "sensor"}` : "No sensor reading";
}

function hostSignals(host: SentinelHostState): HostSignal[] {
  const metrics = host.metrics || {};
  const cpu = observationValue<{ utilizationPercent?: number }>(metrics.cpu, {});
  const memory = observationValue<{ availableGiB?: number; swapUsedGiB?: number }>(metrics.memory, {});
  const filesystem = observationValue<{ freeGiB?: number; freePercent?: number }>(metrics.filesystem, {});
  const processes = observationValue<unknown[]>(metrics.processes, []);
  const listeners = observationValue<unknown[]>(metrics.listeners, []);
  const services = observationValue<unknown[]>(metrics.services, []);
  const docker = observationValue<{ containerCount?: number; supabaseContainerCount?: number }>(metrics.docker, {});
  const fans = observationValue<Array<{ rpm?: number }>>(metrics.fans, []);
  return [
    { key: "thermal", label: "Thermal", status: observationStatus(metrics.thermal), value: highestTemperature(metrics.thermal), reason: metrics.thermal?.reason || "No thermal evidence." },
    { key: "cpu", label: "CPU", status: observationStatus(metrics.cpu), value: typeof cpu.utilizationPercent === "number" ? `${cpu.utilizationPercent}% utilization` : "No sample", reason: metrics.cpu?.reason || "Current Linux CPU sample." },
    { key: "fans", label: "Fans", status: observationStatus(metrics.fans), value: typeof fans[0]?.rpm === "number" ? `${fans[0].rpm} RPM` : "No RPM sensor", reason: metrics.fans?.reason || "Kernel fan evidence." },
    { key: "memory", label: "Memory", status: observationStatus(metrics.memory), value: typeof memory.availableGiB === "number" ? `${memory.availableGiB} GiB available · ${memory.swapUsedGiB || 0} GiB swap used` : "No sample", reason: metrics.memory?.reason || "Current Linux memory counters." },
    { key: "storage", label: "Storage", status: observationStatus(metrics.filesystem), value: typeof filesystem.freeGiB === "number" ? `${filesystem.freeGiB} GiB free · ${filesystem.freePercent}%` : "No sample", reason: metrics.filesystem?.reason || "Filesystem capacity evidence." },
    { key: "processes", label: "Processes", status: observationStatus(metrics.processes), value: `${processes.length} top process rows`, reason: metrics.processes?.reason || "Bounded process metadata with ancestry." },
    { key: "network", label: "Network", status: observationStatus(metrics.listeners), value: `${listeners.length} listening socket rows`, reason: metrics.listeners?.reason || "Listening-port metadata." },
    { key: "services", label: "Services", status: observationStatus(metrics.services), value: metrics.services ? `${services.length} failed units` : "Not checked", reason: metrics.services?.reason || "systemd state." },
    { key: "docker", label: "Docker / Supabase", status: observationStatus(metrics.docker), value: typeof docker.containerCount === "number" ? `${docker.containerCount} containers · ${docker.supabaseContainerCount || 0} Supabase` : "No daemon evidence", reason: metrics.docker?.reason || "Local container metadata." },
  ];
}

function StatusPill({ status }: { status: SentinelEvidenceStatus }) {
  return <span className={`sentinelStatus sentinelStatus-${status}`}>{sentinelStatusLabel(status)}</span>;
}

export function SentinelTab() {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskSentinelResponse | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadSentinelStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadSentinelStatus()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function perform(label: string, action: () => Promise<unknown>, success: string): Promise<void> {
    if (busyAction) return;
    setBusyAction(label);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function investigateFans(): Promise<void> {
    if (busyAction) return;
    setBusyAction("fans");
    setError("");
    setNotice("");
    try {
      const result = await explainFans();
      await refresh();
      setNotice(result.explanation);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function submitQuestion(): Promise<void> {
    if (!question.trim() || busyAction) return;
    setBusyAction("ask");
    setError("");
    try {
      const result = await askSentinel(question.trim());
      setAnswer(result);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  const signals = useMemo(
    () => (status ? hostSignals(status.host) : []),
    [status],
  );
  const overall = status?.overallStatus || "unknown";
  const scheduled = status?.triggers.filter((trigger) => trigger.class === "schedule") || [];

  return (
    <section className="sentinelShell" data-testid="radcon-sentinel">
      <header className="sentinelHero">
        <div>
          <span className="sentinelEyebrow">RADCON SENTINEL</span>
          <h1>Host + Empire Security</h1>
          <p>Measured evidence, finite capabilities, and human-controlled response. The LLM is not root.</p>
        </div>
        <div className="sentinelOverall">
          <small>OVERALL</small>
          <StatusPill status={overall} />
          <span>{loading ? "Loading evidence…" : status?.auditVerification.ok ? "Audit chain verified" : "Audit chain requires attention"}</span>
        </div>
      </header>

      <div className="sentinelActions" aria-label="Sentinel manual checks">
        <button className="btn btnPrimary" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("health", runHostHealthCheck, "Host health evidence refreshed.")}>
          {busyAction === "health" ? "Checking…" : "Run Health Check"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("deep", runHostDeepCheck, "Deep host evidence refreshed.")}>
          {busyAction === "deep" ? "Checking…" : "Deep Check"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void investigateFans()}>
          {busyAction === "fans" ? "Investigating…" : "Why are my fans running?"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("security", runSecurityCheck, "Security inventory refreshed; unconnected sources remain unknown.")}>
          {busyAction === "security" ? "Checking…" : "Check My Websites"}
        </button>
        <button className="btn btnDanger" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("lockdown", prepareLockdownDryRun, "Lockdown proposal recorded as unimplemented dry-run. Nothing executed.")}>
          {busyAction === "lockdown" ? "Recording…" : "Prepare Lockdown · Dry Run"}
        </button>
      </div>

      {error ? <div className="panelError">{error}</div> : null}
      {notice ? <div className="sentinelNotice">{notice}</div> : null}

      <div className="sentinelGuardianGrid">
        <article className="sentinelGuardianCard">
          <div className="sentinelGuardianHeading">
            <div>
              <span>HOST GUARDIAN</span>
              <strong>Pop!_OS development machine</strong>
            </div>
            <StatusPill status={status?.host.overallStatus || "unknown"} />
          </div>
          <div className="sentinelSignalGrid">
            {signals.length ? signals.map((signal) => (
              <div className="sentinelSignal" key={signal.key} title={signal.reason}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <StatusPill status={signal.status} />
              </div>
            )) : <div className="surfaceEmptyState">Run a Host Guardian check to collect current evidence.</div>}
          </div>
          <div className="sentinelLastCheck">Last check: {formatDateTime(status?.host.checkedAt)} · Baselines remain separate from hardware safety limits.</div>
        </article>

        <article className="sentinelGuardianCard">
          <div className="sentinelGuardianHeading">
            <div>
              <span>SECURITY GUARDIAN</span>
              <strong>Websites + technology stack</strong>
            </div>
            <StatusPill status={status?.security.overallStatus || "unknown"} />
          </div>
          <div className="sentinelProviderList">
            {(status?.security.providers || []).map((provider) => (
              <div key={provider.key} title={provider.reason}>
                <span>{provider.label}</span>
                <StatusPill status={provider.status} />
              </div>
            ))}
            {!status?.security.providers.length ? <div className="surfaceEmptyState">Run Check My Websites to load the governed inventory.</div> : null}
          </div>
          <div className="sentinelWebsiteSummary">
            <span>Websites</span>
            <strong>{status?.security.websites.length || 0} inventoried · {status?.security.liveReadOnlyAdapterCount || 0} live provider adapters</strong>
          </div>
          <div className="sentinelLastCheck">Last check: {formatDateTime(status?.security.checkedAt)} · Registry presence never counts as live health.</div>
        </article>
      </div>

      <div className="sentinelRecordsGrid">
        <article>
          <h2>Recent Events</h2>
          {(status?.recentEvents || []).slice(0, 6).map((event) => (
            <div className="sentinelRecordRow" key={event.id}>
              <span className={`sentinelRecordDot sentinelRecordDot-${event.severity}`} />
              <span><strong>{event.type}</strong><small>{event.asset} · {formatDateTime(event.timestamp)}</small></span>
            </div>
          ))}
          {!status?.recentEvents.length ? <p>No events recorded yet.</p> : null}
        </article>

        <article>
          <h2>Recent Incidents</h2>
          {(status?.recentIncidents || []).slice(0, 5).map((incident) => (
            <div className="sentinelRecordRow" key={incident.id}>
              <span className={`sentinelRecordDot sentinelRecordDot-${incident.severity}`} />
              <span><strong>{incident.title}</strong><small>{incident.status} · {incident.hypothesis}</small></span>
            </div>
          ))}
          {!status?.recentIncidents.length ? <p>No correlated incidents recorded.</p> : null}
        </article>

        <article>
          <h2>Pending Actions</h2>
          {(status?.pendingActions || []).slice(0, 5).map((action) => (
            <div className="sentinelRecordRow" key={action.id}>
              <span className="sentinelRecordDot sentinelRecordDot-attention" />
              <span><strong>{action.requestedCapability}</strong><small>{action.policyResult} · {action.executionResult}</small></span>
            </div>
          ))}
          {!status?.pendingActions.length ? <p>No simulated or unimplemented action proposals.</p> : null}
        </article>

        <article>
          <h2>Scheduled Checks</h2>
          {scheduled.map((trigger) => (
            <div className="sentinelRecordRow" key={trigger.key}>
              <span className="sentinelRecordDot sentinelRecordDot-informational" />
              <span><strong>{trigger.label}</strong><small>{trigger.activationState} · no scheduler active</small></span>
            </div>
          ))}
          {!scheduled.length ? <p>No schedule definitions loaded.</p> : null}
        </article>
      </div>

      <section className="sentinelAsk">
        <div>
          <span>ASK SENTINEL</span>
          <small>Deterministic service boundary · no live LLM · no execution channel</small>
        </div>
        <div className="sentinelAskControls">
          <textarea className="pasteArea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Check whether Codex left something running, explain an incident, or prepare a containment plan…" />
          <button className="btn btnPrimary" type="button" onClick={() => void submitQuestion()} disabled={!question.trim() || Boolean(busyAction)}>
            {busyAction === "ask" ? "Reviewing…" : "Ask Sentinel"}
          </button>
        </div>
        {answer ? <div className="sentinelAnswer"><strong>{answer.intent.replace(/-/g, " ")}</strong><p>{answer.answer}</p><small>Execution permitted: NO · LLM connected: NO</small></div> : null}
      </section>

      <footer className="sentinelBoundary">
        <span>Mode: {status?.executionMode || "observe-and-dry-run"}</span>
        <span>Privileged helper: {status?.privilegedHelper || "not-installed"}</span>
        <span>Provider mutation: {status?.providerMutation || "disabled"}</span>
        <span>Scheduler: {status?.scheduler || "disabled"}</span>
        <span>Audit: {status?.auditVerification.claim || "hash-chained-not-immutable"}</span>
      </footer>
    </section>
  );
}
