import { useEffect, useMemo, useState } from "react";
import { runO2ParsedJson } from "../common/o2Files";

type HealthStatus = "healthy" | "attention" | "critical" | "inconclusive";

type CleanupCandidate = {
  id: string;
  label: string;
  ageHours: number;
};

type Checkup = {
  ok: boolean;
  checkedAt: string;
  source?: string;
  status: HealthStatus;
  summary: string;
  reasons: string[];
  sensors: {
    packageC: number | null;
    systemCpuC: number | null;
    fanRpm: number | null;
  };
  load: {
    oneMinute: number;
    fiveMinute: number;
    cpuCount: number;
  };
  memory: {
    usedGiB: number;
    availableGiB: number;
    swapUsedGiB: number;
    availablePercent: number;
  };
  disk: {
    freeGiB: number;
    freePercent: number;
  };
  pressure: {
    cpu: { someAvg10: number };
    memory: { someAvg10: number; fullAvg10: number };
    io: { someAvg10: number; fullAvg10: number };
  };
  powerProfile: string;
  topProcesses: Array<{
    pid: number;
    process: string;
    cpuPercent: number;
    rssMiB: number;
    projectKey: string;
  }>;
  devRuntimes: Array<{ projectKey: string; ageHours: number; kind: string }>;
  docker: {
    containerCount: number;
    supabaseStacks: Array<{ projectKey: string; containerCount: number }>;
    exposedContainers: string[];
  };
  vscode: {
    watchedFileCount: number;
    broadWorkspace: boolean;
  };
  zombies: { count: number };
  cleanupCandidates: CleanupCandidate[];
};

type HealthHistory = {
  ok: boolean;
  checkups: Checkup[];
  events: Array<{
    at: string;
    action: string;
    status?: HealthStatus;
    summary: string;
  }>;
};

type CleanupPreview = {
  ok: boolean;
  candidates: CleanupCandidate[];
  report: Checkup;
};

type CleanupResult = {
  ok: boolean;
  actions: Array<{ id: string; ok: boolean; summary: string }>;
  after: Checkup;
};

type CodexReview = {
  ok: boolean;
  model: string;
  reasoningEffort: string;
  analysis: string;
  report: Checkup;
};

type Props = {
  onAppendLog: (text: string) => void;
};

function formatDateTime(value?: string): string {
  if (!value) return "Not checked yet";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function metric(value: number | null | undefined, suffix: string): string {
  return typeof value === "number" ? `${value.toLocaleString()}${suffix}` : "—";
}

function statusLabel(status: HealthStatus): string {
  if (status === "healthy") return "Healthy";
  if (status === "attention") return "Needs a look";
  if (status === "critical") return "Act now";
  return "Check incomplete";
}

export function WorkstationHealthPanel({ onAppendLog }: Props) {
  const [report, setReport] = useState<Checkup | null>(null);
  const [history, setHistory] = useState<HealthHistory>({ ok: true, checkups: [], events: [] });
  const [preview, setPreview] = useState<CleanupCandidate[] | null>(null);
  const [codexReview, setCodexReview] = useState<CodexReview | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  const activeSupabase = useMemo(
    () => report?.docker.supabaseStacks.map((stack) => stack.projectKey).join(", ") || "None",
    [report],
  );

  async function refreshHistory(preferred?: Checkup | null): Promise<void> {
    const payload = await runO2ParsedJson<HealthHistory>(
      "workstation.health.history",
      "Could not load workstation history",
      "Workstation history returned invalid data",
    );
    setHistory(payload);
    setReport(preferred || payload.checkups[0] || null);
  }

  useEffect(() => {
    void refreshHistory().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);

  async function perform<T>(action: string, verb: string): Promise<T | null> {
    setBusyAction(action);
    setError("");
    try {
      return await runO2ParsedJson<T>(
        verb,
        `${action} failed`,
        `${action} returned invalid data`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function runCheck(): Promise<void> {
    const next = await perform<Checkup>("Health check", "workstation.health.check");
    if (!next) return;
    setPreview(null);
    setCodexReview(null);
    await refreshHistory(next);
    onAppendLog(`\n[workstation] ${statusLabel(next.status)} — ${next.summary}\n`);
  }

  async function previewCleanup(): Promise<void> {
    const next = await perform<CleanupPreview>(
      "Safe cleanup preview",
      "workstation.cleanup.preview",
    );
    if (!next) return;
    setPreview(next.candidates);
    setReport(next.report);
    await refreshHistory(next.report);
    onAppendLog(
      `\n[workstation] Safe cleanup preview → ${next.candidates.length} candidate(s)\n`,
    );
  }

  async function applyCleanup(): Promise<void> {
    if (!preview?.length) return;
    const targets = preview.map((candidate) => `• ${candidate.label}`).join("\n");
    if (!window.confirm(`Apply only these verified cleanup actions?\n\n${targets}`)) return;
    const next = await perform<CleanupResult>(
      "Safe cleanup",
      "workstation.cleanup.apply",
    );
    if (!next) return;
    setPreview(null);
    setReport(next.after);
    await refreshHistory(next.after);
    onAppendLog(
      `\n[workstation] Safe cleanup → ${next.actions.map((action) => action.summary).join(" ") || "Nothing needed cleanup."}\n`,
    );
  }

  async function askCodex(): Promise<void> {
    const next = await perform<CodexReview>(
      "Terra workstation review",
      "workstation.codex.review",
    );
    if (!next) return;
    setCodexReview(next);
    setReport(next.report);
    await refreshHistory(next.report);
    onAppendLog(
      `\n[workstation] Terra medium review ${next.ok ? "completed" : "did not complete"}.\n`,
    );
  }

  const busy = busyAction !== null;

  return (
    <section className="workstationHealth" data-testid="workstation-health-panel">
      <div className="workstationHealthHeader">
        <div>
          <div className="surfaceCardTitle">Workstation Health</div>
          <p className="workstationHealthIntro">
            Fast local diagnosis with no token use. Terra joins only when you ask.
          </p>
        </div>
        <span className={`workstationStatus workstationStatus-${report?.status || "inconclusive"}`}>
          {statusLabel(report?.status || "inconclusive")}
        </span>
      </div>

      <div className="workstationActions">
        <button className="btn btnPrimary" onClick={() => void runCheck()} disabled={busy}>
          {busyAction === "Health check" ? "Checking…" : "Run Health Check"}
        </button>
        <button className="btn btnSecondary" onClick={() => void previewCleanup()} disabled={busy}>
          {busyAction === "Safe cleanup preview" ? "Reviewing…" : "Preview Safe Cleanup"}
        </button>
        <button
          className="btn btnSecondary"
          onClick={() => void applyCleanup()}
          disabled={busy || !preview?.length}
          title={preview?.length ? "Apply the previewed project-owned cleanup" : "Preview cleanup first"}
        >
          Apply Safe Cleanup
        </button>
        <button className="btn workstationCodexButton" onClick={() => void askCodex()} disabled={busy}>
          {busyAction === "Terra workstation review" ? "Terra is reviewing…" : "Ask Codex"}
        </button>
      </div>

      {error ? <div className="workstationMessage workstationMessageError">{error}</div> : null}

      {report ? (
        <>
          <div className="workstationSummary">
            <strong>{report.summary}</strong>
            <span>Last checked {formatDateTime(report.checkedAt)}</span>
          </div>

          <div className="workstationMetrics">
            <div><span>CPU</span><strong>{metric(report.sensors.systemCpuC, "°C")}</strong></div>
            <div><span>Fan</span><strong>{metric(report.sensors.fanRpm, " RPM")}</strong></div>
            <div><span>Memory free</span><strong>{metric(report.memory.availableGiB, " GB")}</strong></div>
            <div><span>Disk free</span><strong>{metric(report.disk.freeGiB, " GB")}</strong></div>
            <div><span>Local containers</span><strong>{report.docker.containerCount}</strong></div>
            <div><span>Power</span><strong>{report.powerProfile}</strong></div>
          </div>

          {report.reasons.length ? (
            <div className="workstationMessage">
              {report.reasons.map((reason) => <div key={reason}>• {reason}</div>)}
            </div>
          ) : null}

          {preview ? (
            <div className="workstationPreview">
              <strong>Safe cleanup preview</strong>
              {preview.length ? preview.map((candidate) => (
                <div key={candidate.id}>• {candidate.label} · {candidate.ageHours} hours old</div>
              )) : <div>Nothing needs safe cleanup.</div>}
            </div>
          ) : null}

          <details className="workstationDetails">
            <summary>What is running?</summary>
            <div className="workstationDetailGrid">
              <div>
                <strong>Top activity</strong>
                {report.topProcesses.slice(0, 5).map((process) => (
                  <span key={process.pid}>{process.process} · {process.cpuPercent}% average CPU</span>
                ))}
              </div>
              <div>
                <strong>Development services</strong>
                <span>{report.devRuntimes.length} governed runtime(s)</span>
                <span>Supabase: {activeSupabase}</span>
                <span>VS Code watches {report.vscode.watchedFileCount.toLocaleString()} files</span>
              </div>
            </div>
          </details>
        </>
      ) : (
        <div className="workstationEmpty">Run a health check to establish the workstation baseline.</div>
      )}

      {codexReview ? (
        <div className="workstationCodexReview">
          <div className="workstationCodexReviewTitle">
            Terra review <span>{codexReview.model} · {codexReview.reasoningEffort}</span>
          </div>
          <div className="workstationCodexReviewBody">{codexReview.analysis}</div>
        </div>
      ) : null}

      <div className="workstationHistory">
        <div className="workstationHistoryTitle">Recent checkups</div>
        {history.checkups.length ? history.checkups.map((checkup) => (
          <button
            type="button"
            key={`${checkup.checkedAt}-${checkup.source || "manual"}`}
            className="workstationHistoryRow"
            onClick={() => setReport(checkup)}
          >
            <span className={`workstationHistoryDot workstationHistoryDot-${checkup.status}`} />
            <span>{formatDateTime(checkup.checkedAt)}</span>
            <strong>{statusLabel(checkup.status)}</strong>
            <small>{checkup.source === "manual" ? "Health check" : checkup.source || "Health check"}</small>
          </button>
        )) : <div className="workstationEmpty">No checkups recorded yet.</div>}
      </div>
    </section>
  );
}
