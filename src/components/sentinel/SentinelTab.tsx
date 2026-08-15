import { useCallback, useEffect, useMemo, useState } from "react";
import { useGovernedRecordNote } from "../common/useGovernedRecordNote";
import { HostUpdatesPanel } from "./HostUpdatesPanel";
import {
  askSentinel,
  explainFans,
  loadSentinelStatus,
  runHostDeepCheck,
  runHostHealthCheck,
  runSecurityCheck,
  type AskSentinelResponse,
} from "./sentinelApi";
import {
  SENTINEL_LEVELS,
  buildSentinelActivity,
  deriveThreatState,
  filterSentinelActivity,
  lastSentinelSweepAt,
  observationValue,
  sentinelCapabilityLevelState,
  sentinelStatusLabel,
  threatStateLabel,
  type SentinelActivityFilter,
  type SentinelEvidenceStatus,
  type SentinelHostState,
  type SentinelObservation,
  type SentinelStatus,
  type SentinelTrigger,
} from "./sentinelModel";

const HOST_CONFIGURATION_PATH =
  "docs/infrastructure/assets/system76-workstation/CONFIGURATION.md";
const HOST_NOTES_PATH =
  "docs/infrastructure/assets/system76-workstation/NOTES.md";

const ACTIVITY_FILTERS: Array<{ key: SentinelActivityFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "events", label: "Events" },
  { key: "actions", label: "Actions" },
  { key: "incidents", label: "Incidents" },
  { key: "host", label: "Host" },
  { key: "security", label: "Security" },
];

const ASK_PROMPTS = [
  "Why are my fans running?",
  "Is my computer healthy?",
  "Is anything unusual happening?",
  "Check whether Codex left something running.",
  "What needs my attention?",
  "Which security systems are not configured?",
];

type Props = {
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type HostSignal = {
  key: string;
  label: string;
  status: SentinelEvidenceStatus;
  value: string;
  reason: string;
};

type ThermalRow = {
  key?: string;
  label?: string;
  temperatureC?: number;
  criticalC?: number | null;
  source?: string;
};

type ProcessRow = {
  pid?: number;
  ppid?: number;
  ageSeconds?: number;
  cpuPercent?: number;
  memoryPercent?: number;
  rssMiB?: number;
  process?: string;
};

type ListenerRow = {
  address?: string;
  port?: number;
  exposedBeyondLoopback?: boolean;
  pids?: number[];
};

type ContainerRow = {
  name?: string;
  image?: string;
  state?: string;
  statusText?: string;
  ports?: string;
  supabase?: boolean;
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

function StatusPill({ status }: { status: SentinelEvidenceStatus }) {
  return (
    <span className={`sentinelStatus sentinelStatus-${status}`}>
      {sentinelStatusLabel(status)}
    </span>
  );
}

function hottestThermalSummary(observation: SentinelObservation | undefined): string {
  const hottest = observationValue<ThermalRow[]>(observation, [])
    .filter((row) => typeof row.temperatureC === "number")
    .sort((left, right) => (right.temperatureC || 0) - (left.temperatureC || 0))[0];
  if (!hottest) return "No classified sensor reading";
  const margin =
    typeof hottest.criticalC === "number" && typeof hottest.temperatureC === "number"
      ? ` · ${(hottest.criticalC - hottest.temperatureC).toFixed(1)}°C to critical`
      : " · critical trip unknown";
  return `${hottest.temperatureC}°C · ${hottest.label || "sensor"}${margin}`;
}

function hostSignals(host: SentinelHostState): HostSignal[] {
  const metrics = host.metrics || {};
  const cpu = observationValue<{ utilizationPercent?: number; logicalCpuCount?: number }>(metrics.cpu, {});
  const load = observationValue<{ oneMinute?: number; fiveMinute?: number; logicalCpuCount?: number }>(metrics.load, {});
  const memory = observationValue<{ usedGiB?: number; availableGiB?: number; swapUsedGiB?: number }>(metrics.memory, {});
  const filesystem = observationValue<{ totalGiB?: number; freeGiB?: number; freePercent?: number }>(metrics.filesystem, {});
  const diskIo = observationValue<{ readSectors?: number; writeSectors?: number }>(metrics.diskIo, {});
  const processes = observationValue<ProcessRow[]>(metrics.processes, []);
  const listeners = observationValue<ListenerRow[]>(metrics.listeners, []);
  const connections = observationValue<{ establishedCount?: number | null }>(metrics.connections, {});
  const services = observationValue<string[]>(metrics.services, []);
  const startup = observationValue<string[]>(metrics.startupServices, []);
  const docker = observationValue<{ containerCount?: number; supabaseContainerCount?: number }>(metrics.docker, {});
  const fans = observationValue<Array<{ rpm?: number }>>(metrics.fans, []);
  const auth = observationValue<{ recentRecordCount?: number }>(metrics.authenticationEvents, {});
  return [
    { key: "thermal", label: "Thermal", status: observationStatus(metrics.thermal), value: hottestThermalSummary(metrics.thermal), reason: metrics.thermal?.reason || "No thermal evidence." },
    { key: "cpu", label: "CPU", status: observationStatus(metrics.cpu), value: typeof cpu.utilizationPercent === "number" ? `${cpu.utilizationPercent}% · ${cpu.logicalCpuCount || "?"} logical CPUs` : "No utilization sample", reason: metrics.cpu?.reason || "Current Linux CPU sample." },
    { key: "load", label: "Load", status: observationStatus(metrics.load), value: typeof load.oneMinute === "number" ? `${load.oneMinute} / ${load.fiveMinute} · ${load.logicalCpuCount || "?"} CPUs` : "No load sample", reason: metrics.load?.reason || "Linux load averages." },
    { key: "fans", label: "Fans", status: observationStatus(metrics.fans), value: typeof fans[0]?.rpm === "number" ? `${fans[0].rpm.toLocaleString()} RPM` : "No RPM sensor", reason: metrics.fans?.reason || "Kernel fan evidence." },
    { key: "memory", label: "Memory", status: observationStatus(metrics.memory), value: typeof memory.availableGiB === "number" ? `${memory.usedGiB || 0} GiB used · ${memory.availableGiB} GiB free · ${memory.swapUsedGiB || 0} GiB swap` : "No memory sample", reason: metrics.memory?.reason || "Current Linux memory counters." },
    { key: "storage", label: "Storage", status: observationStatus(metrics.filesystem), value: typeof filesystem.freeGiB === "number" ? `${filesystem.freeGiB} / ${filesystem.totalGiB} GiB free · ${filesystem.freePercent}%` : "No capacity sample", reason: metrics.filesystem?.reason || "Home filesystem capacity." },
    { key: "disk-health", label: "Disk Health", status: observationStatus(metrics.diskHealth), value: metrics.diskHealth ? "Device metadata collected · SMART not connected" : "Not checked", reason: metrics.diskHealth?.reason || "Disk-health evidence." },
    { key: "disk-io", label: "Disk I/O", status: observationStatus(metrics.diskIo), value: typeof diskIo.readSectors === "number" ? `${diskIo.readSectors.toLocaleString()} read · ${(diskIo.writeSectors || 0).toLocaleString()} write sectors` : "No I/O counters", reason: metrics.diskIo?.reason || "Cumulative Linux disk counters." },
    { key: "processes", label: "Processes", status: observationStatus(metrics.processes), value: `${processes.length} bounded high-CPU rows`, reason: metrics.processes?.reason || "Process metadata with ancestry." },
    { key: "network", label: "Network", status: observationStatus(metrics.listeners), value: `${listeners.length} listeners · ${connections.establishedCount ?? "?"} established`, reason: metrics.listeners?.reason || "Listening and established connection metadata." },
    { key: "services", label: "Services", status: observationStatus(metrics.services), value: `${services.length} failed · ${startup.length} enabled sampled`, reason: metrics.services?.reason || "systemd state." },
    { key: "containers", label: "Docker / Supabase", status: observationStatus(metrics.docker), value: typeof docker.containerCount === "number" ? `${docker.containerCount} containers · ${docker.supabaseContainerCount || 0} Supabase` : "No daemon evidence", reason: metrics.docker?.reason || "Local container metadata." },
    { key: "auth", label: "Login Visibility", status: observationStatus(metrics.authenticationEvents), value: typeof auth.recentRecordCount === "number" ? `${auth.recentRecordCount} recent redacted records` : "No login evidence", reason: metrics.authenticationEvents?.reason || "Redacted local login count." },
  ];
}

function triggerLastRun(trigger: SentinelTrigger, status: SentinelStatus): string | null {
  if (trigger.lastRunAt) return trigger.lastRunAt;
  return status.recentActions.find(
    (action) => action.requestedCapability === trigger.capability,
  )?.requestedAt || null;
}

export function SentinelTab({ registerBeforeTabChangeSaver }: Props) {
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskSentinelResponse | null>(null);
  const [activityFilter, setActivityFilter] = useState<SentinelActivityFilter>("all");

  const hostConfiguration = useGovernedRecordNote({
    recordKey: "sentinel-host-configuration",
    path: HOST_CONFIGURATION_PATH,
    missingStatus: "Canonical host configuration will be created on first save",
  });
  const hostNotes = useGovernedRecordNote({
    recordKey: "sentinel-host-notes",
    path: HOST_NOTES_PATH,
    missingStatus: "Canonical host notes will be created on first save",
  });

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(async () => {
      const configurationSaved = await hostConfiguration.flush();
      return configurationSaved && hostNotes.flush();
    });
    return () => registerBeforeTabChangeSaver(null);
  }, [hostConfiguration.flush, hostNotes.flush, registerBeforeTabChangeSaver]);

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

  async function perform(
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ): Promise<void> {
    if (busyAction) return;
    setBusyAction(key);
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

  const signals = useMemo(() => (status ? hostSignals(status.host) : []), [status]);
  const threat = useMemo(() => deriveThreatState(status), [status]);
  const activity = useMemo(
    () => filterSentinelActivity(buildSentinelActivity(status), activityFilter),
    [activityFilter, status],
  );
  const openIncidents = status?.recentIncidents.filter(
    (incident) => !["closed", "resolved"].includes(incident.status.toLowerCase()),
  ).length || 0;
  const hostMetrics = status?.host.metrics || {};
  const thermalRows = observationValue<ThermalRow[]>(hostMetrics.thermal, []);
  const processRows = observationValue<ProcessRow[]>(hostMetrics.processes, []);
  const listenerRows = observationValue<ListenerRow[]>(hostMetrics.listeners, []);
  const failedServices = observationValue<string[]>(hostMetrics.services, []);
  const docker = observationValue<{ containers?: ContainerRow[]; resourceRows?: Array<Record<string, string>> }>(hostMetrics.docker, {});

  return (
    <section className="sentinelShell" data-testid="radcon-sentinel">
      <header className={`sentinelHero sentinelThreat-${threat}`}>
        <div className="sentinelHeroCopy">
          <span className="sentinelEyebrow">RADCON SENTINEL</span>
          <h1>Empire Security Command Center</h1>
          <p>Host Guardian + Security Guardian · measured evidence · human-controlled authority · the LLM is not root.</p>
        </div>
        <div className="sentinelCommandSummary" data-testid="sentinel-status-header">
          <div><small>OVERALL</small><StatusPill status={status?.overallStatus || "unknown"} /></div>
          <div><small>HOST</small><StatusPill status={status?.host.overallStatus || "unknown"} /></div>
          <div><small>SECURITY</small><StatusPill status={status?.security.overallStatus || "unknown"} /></div>
          <div><small>THREAT</small><strong>{threatStateLabel(threat)}</strong></div>
          <div><small>LAST SWEEP</small><strong>{loading ? "Loading…" : formatDateTime(lastSentinelSweepAt(status))}</strong></div>
          <div><small>OPEN INCIDENTS</small><strong>{openIncidents}</strong></div>
          <div><small>PENDING ACTIONS</small><strong>{status?.pendingActions.length || 0}</strong></div>
        </div>
        <div className="sentinelVisibilityBoundary">
          <strong>{threat === "unknown_visibility" ? "Visibility is incomplete; no active threat is inferred." : threatStateLabel(threat)}</strong>
          <span>{status?.auditVerification.ok ? "Audit/event/incident chains verified" : "Audit integrity requires attention"}</span>
        </div>
      </header>

      <div className="sentinelActions" aria-label="Sentinel manual read-only checks">
        <button className="btn btnPrimary" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("health", runHostHealthCheck, "Host health evidence refreshed.")} data-testid="sentinel-health-check">
          {busyAction === "health" ? "Checking…" : "Run Health Check"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("deep", runHostDeepCheck, "Deep host evidence refreshed.")} data-testid="sentinel-deep-check">
          {busyAction === "deep" ? "Checking…" : "Deep Check"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("security", runSecurityCheck, "Security inventory refreshed; disconnected sources remain explicit.")} data-testid="sentinel-security-check">
          {busyAction === "security" ? "Checking…" : "Check Security"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("refresh", async () => undefined, "Sentinel status refreshed.")} data-testid="sentinel-refresh">
          {busyAction === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("docker", runHostDeepCheck, "Docker evidence refreshed through the read-only deep observer.")} data-testid="sentinel-docker-check">
          {busyAction === "docker" ? "Checking…" : "Check Docker"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void perform("network", runHostDeepCheck, "Network evidence refreshed through the read-only deep observer.")} data-testid="sentinel-network-check">
          {busyAction === "network" ? "Checking…" : "Check Network"}
        </button>
        <button className="btn btnGhost" type="button" disabled={Boolean(busyAction)} onClick={() => void investigateFans()}>
          {busyAction === "fans" ? "Investigating…" : "Why are my fans running?"}
        </button>
      </div>

      {error ? <div className="panelError">{error}</div> : null}
      {notice ? <div className="sentinelNotice">{notice}</div> : null}

      <div className="sentinelGuardianGrid">
        <article className="sentinelGuardianCard" data-testid="host-guardian">
          <div className="sentinelGuardianHeading">
            <div><span>HOST GUARDIAN</span><strong>System76 · Pop!_OS development workstation</strong></div>
            <StatusPill status={status?.host.overallStatus || "unknown"} />
          </div>
          <div className="sentinelSignalGrid">
            {signals.length ? signals.map((signal) => (
              <div className="sentinelSignal" key={signal.key} title={signal.reason}>
                <span>{signal.label}</span><strong>{signal.value}</strong><StatusPill status={signal.status} />
              </div>
            )) : <div className="surfaceEmptyState">Run a Host Guardian check to collect current evidence.</div>}
          </div>
          <div className="sentinelLastCheck">Last check: {formatDateTime(status?.host.checkedAt)} · Baselines remain separate from hardware safety limits.</div>

          <div className="sentinelEvidenceDetails">
            <details className="sentinelDetails" open>
              <summary>Thermal + sensor truth</summary>
              <div className="sentinelCompactList">
                {thermalRows.map((sensor, index) => (
                  <div key={sensor.key || `${sensor.label}-${index}`}>
                    <span><strong>{sensor.label || "Unclassified sensor"}</strong><small>{sensor.source || "kernel"}</small></span>
                    <span>{typeof sensor.temperatureC === "number" ? `${sensor.temperatureC}°C` : "Unknown"}{typeof sensor.criticalC === "number" ? ` · critical ${sensor.criticalC}°C · margin ${(sensor.criticalC - (sensor.temperatureC || 0)).toFixed(1)}°C` : " · critical trip unknown"}</span>
                  </div>
                ))}
                {!thermalRows.length ? <p>No sensor rows are available. This is not a healthy result.</p> : null}
              </div>
            </details>
            <details className="sentinelDetails">
              <summary>High-resource processes</summary>
              <div className="sentinelCompactList">
                {processRows.slice(0, 12).map((process) => (
                  <div key={process.pid || process.process}>
                    <span><strong>{process.process || "Unknown process"}</strong><small>PID {process.pid ?? "?"} · parent {process.ppid ?? "?"}</small></span>
                    <span>{process.cpuPercent ?? "?"}% CPU · {process.memoryPercent ?? "?"}% memory · {process.rssMiB ?? "?"} MiB</span>
                  </div>
                ))}
                {!processRows.length ? <p>No process rows are available.</p> : null}
              </div>
            </details>
            <details className="sentinelDetails">
              <summary>Containers + local stacks</summary>
              <div className="sentinelCompactList">
                {(docker.containers || []).map((container) => (
                  <div key={container.name}>
                    <span><strong>{container.name || "Unnamed container"}{container.supabase ? " · Supabase" : ""}</strong><small>{container.image || "Unknown image"}</small></span>
                    <span>{container.state || "unknown"} · {container.statusText || "no status"}</span>
                  </div>
                ))}
                {!(docker.containers || []).length ? <p>{hostMetrics.docker?.reason || "No container rows are available."}</p> : null}
              </div>
            </details>
            <details className="sentinelDetails">
              <summary>Network + service evidence</summary>
              <div className="sentinelCompactList">
                {listenerRows.slice(0, 16).map((listener, index) => (
                  <div key={`${listener.address}-${index}`}>
                    <span><strong>{listener.address || `Port ${listener.port || "?"}`}</strong><small>{listener.exposedBeyondLoopback ? "Binds beyond loopback" : "Loopback"}</small></span>
                    <span>{listener.pids?.length ? `PID ${listener.pids.join(", ")}` : "Owner not visible"}</span>
                  </div>
                ))}
                {failedServices.map((service) => <div key={service}><strong>{service}</strong><span>FAILED</span></div>)}
                {!listenerRows.length && !failedServices.length ? <p>No listener or failed-service rows are available.</p> : null}
              </div>
            </details>
          </div>
        </article>

        <article className="sentinelGuardianCard" data-testid="security-guardian">
          <div className="sentinelGuardianHeading">
            <div><span>SECURITY GUARDIAN</span><strong>Websites + full technology estate</strong></div>
            <StatusPill status={status?.security.overallStatus || "unknown"} />
          </div>
          <div className="sentinelProviderList">
            {(status?.security.providers || []).map((provider) => (
              <div key={provider.key} title={provider.reason}>
                <span><strong>{provider.label}</strong><small>{provider.adapter || provider.category || "adapter"} · READ ONLY</small></span>
                <StatusPill status={provider.status} />
              </div>
            ))}
            {!status?.security.providers.length ? <div className="surfaceEmptyState">Run Check Security to load the governed adapter inventory.</div> : null}
          </div>
          <div className="sentinelWebsiteList">
            <div className="sentinelSectionHeading"><span>REGISTERED WEBSITES</span><strong>{status?.security.websites.length || 0}</strong></div>
            {(status?.security.websites || []).map((website) => (
              <div key={website.key} title={website.reason}>
                <span><strong>{website.label}</strong><small>{website.url || website.key}</small></span>
                <StatusPill status={website.status} />
              </div>
            ))}
            {!status?.security.websites.length ? <p>No website inventory has been loaded.</p> : null}
          </div>
          <div className="sentinelLastCheck">Last check: {formatDateTime(status?.security.checkedAt)} · {status?.security.liveReadOnlyAdapterCount || 0} live read-only adapters · registry presence never counts as live health.</div>
        </article>
      </div>

      <div className="sentinelHostSupportGrid">
        <section className="sentinelSubCard" data-testid="host-identity-record">
          <div className="sentinelSubCardHeading">
            <div><span>WORKSTATION IDENTITY + RECORD</span><strong>Canonical O2 System76 record, now owned by Host Guardian</strong></div>
            <small>No duplicated RadControl data</small>
          </div>
          <details className="sentinelDetails">
            <summary>Configuration and operating model</summary>
            <div className="sentinelRecordEditor">
              <small>{hostConfiguration.status}</small>
              <textarea className="pasteArea" value={hostConfiguration.text} readOnly={!hostConfiguration.path || hostConfiguration.loading} onChange={(event) => hostConfiguration.onTextChange(event.target.value)} data-testid="host-configuration-note" />
            </div>
          </details>
          <details className="sentinelDetails">
            <summary>Operator notes and history</summary>
            <div className="sentinelRecordEditor">
              <small>{hostNotes.status}</small>
              <textarea className="pasteArea" value={hostNotes.text} readOnly={!hostNotes.path || hostNotes.loading} onChange={(event) => hostNotes.onTextChange(event.target.value)} data-testid="host-operator-notes" />
            </div>
          </details>
        </section>
        <HostUpdatesPanel disabled={Boolean(busyAction)} />
      </div>

      <section className="sentinelActivity" data-testid="sentinel-activity">
        <div className="sentinelActivityHeader">
          <div><span>RECENT ACTIVITY</span><strong>Events, actions + incidents from real Sentinel records</strong></div>
          <div className="sentinelFilterRow" role="tablist" aria-label="Sentinel activity filters">
            {ACTIVITY_FILTERS.map((filter) => (
              <button key={filter.key} type="button" className={activityFilter === filter.key ? "isActive" : ""} onClick={() => setActivityFilter(filter.key)} aria-pressed={activityFilter === filter.key}>{filter.label}</button>
            ))}
          </div>
        </div>
        <div className="sentinelActivityTable">
          <div className="sentinelActivityColumns"><span>Time / Guardian</span><span>Event or action</span><span>Asset / origin</span><span>Result / policy</span></div>
          {activity.slice(0, 18).map((row) => (
            <div className="sentinelActivityRow" key={row.id} data-kind={row.kind}>
              <span><i className={`sentinelRecordDot sentinelRecordDot-${row.severity}`} /><strong>{formatDateTime(row.timestamp)}</strong><small>{row.guardian.toUpperCase()} · {row.kind.toUpperCase()}</small></span>
              <span><strong>{row.title}</strong><small>{row.severity.toUpperCase()}</small></span>
              <span><strong>{row.asset}</strong><small>{row.origin.replace(/-/g, " ")}</small></span>
              <span><strong>{row.result}</strong><small>{row.policy}</small></span>
            </div>
          ))}
          {!activity.length ? <div className="surfaceEmptyState">No real records match this filter. Run a read-only check to create evidence.</div> : null}
        </div>
      </section>

      <div className="sentinelAuthorityGrid">
        <section className="sentinelSubCard" data-testid="sentinel-capability-ladder">
          <div className="sentinelSubCardHeading"><div><span>AUTHORITY</span><strong>Capability ladder</strong></div><small>Registry-derived</small></div>
          <div className="sentinelLevelList">
            {SENTINEL_LEVELS.map((item) => {
              const levelCapabilities = status?.capabilities.filter((capability) => capability.level === item.level) || [];
              const levelState = sentinelCapabilityLevelState(item.level, status?.capabilities || []);
              return (
                <div key={item.level}>
                  <span><strong>Level {item.level} — {item.label}</strong><small>{levelCapabilities.length} declared capabilit{levelCapabilities.length === 1 ? "y" : "ies"}</small></span>
                  <span className={`sentinelLevelState sentinelLevelState-${levelState}`}>{levelState === "active" ? "ACTIVE · READ ONLY" : "NOT ACTIVATED"}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="sentinelSubCard" data-testid="sentinel-triggers">
          <div className="sentinelSubCardHeading"><div><span>TRIGGERS + SCHEDULES</span><strong>Declared activation truth</strong></div><small>Scheduler {status?.scheduler || "disabled"}</small></div>
          <div className="sentinelTriggerList">
            {(status?.triggers || []).map((trigger) => {
              const lastRun = status ? triggerLastRun(trigger, status) : null;
              return (
                <div key={trigger.key}>
                  <span><strong>{trigger.label}</strong><small>{trigger.class.toUpperCase()} · {trigger.guardian.toUpperCase()}</small></span>
                  <span><strong>{trigger.activationState === "active-manual" ? "ACTIVE MANUAL" : "NOT ACTIVATED"}</strong>{lastRun ? <small>Last {formatDateTime(lastRun)}</small> : null}{trigger.nextRunAt ? <small>Next {formatDateTime(trigger.nextRunAt)}</small> : null}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="sentinelAsk">
        <div><span>ASK SENTINEL</span><small>Deterministic classification · no live LLM · no shell or execution channel</small></div>
        <div className="sentinelPromptRow">
          {ASK_PROMPTS.map((prompt) => <button className="btn btnGhost btnCompact" type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}
        </div>
        <div className="sentinelAskControls">
          <textarea className="pasteArea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about health, visibility, recent activity, or an incident…" />
          <button className="btn btnPrimary" type="button" onClick={() => void submitQuestion()} disabled={!question.trim() || Boolean(busyAction)}>{busyAction === "ask" ? "Reviewing…" : "Ask Sentinel"}</button>
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
