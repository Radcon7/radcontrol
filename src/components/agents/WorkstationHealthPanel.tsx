import { useEffect, useMemo, useState } from "react";
import { runO2ParsedJson } from "../common/o2Files";

type HealthStatus = "healthy" | "attention" | "critical" | "inconclusive";

type CleanupCandidate = {
  id: string;
  kind?: string;
  label: string;
  ageHours: number;
  requiresAuthorization?: boolean;
  requiresUserFollowup?: boolean;
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
    averageCpuPercent?: number;
    rssMiB: number;
    projectKey: string;
    role?: string;
  }>;
  devRuntimes: Array<{ projectKey: string; ageHours: number; kind: string }>;
  docker: {
    containerCount: number;
    supabaseStacks: Array<{ projectKey: string; containerCount: number }>;
    exposedContainers: string[];
  };
  vscode: {
    workspaceFileCount?: number;
    watchedFileCount?: number;
    broadWorkspace: boolean;
  };
  zombies: { count: number };
  cleanupCandidates: CleanupCandidate[];
};

type HealthHistory = {
  ok: boolean;
  checkups: Checkup[];
  reviews: CodexReview[];
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
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  model: string;
  reasoningEffort: string;
  analysis: string;
  preparedCandidates?: CleanupCandidate[];
  learningCandidate?: string;
  report?: Checkup;
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

function workstationLog(message: string): string {
  return `\n[workstation · ${new Date().toLocaleString()}] ${message}\n`;
}

export function WorkstationHealthPanel({ onAppendLog }: Props) {
  const [report, setReport] = useState<Checkup | null>(null);
  const [history, setHistory] = useState<HealthHistory>({ ok: true, checkups: [], events: [], reviews: [] });
  const [preview, setPreview] = useState<CleanupCandidate[] | null>(null);
  const [codexReview, setCodexReview] = useState<CodexReview | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [codexElapsedSeconds, setCodexElapsedSeconds] = useState(0);
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
    setCodexReview((current) => current || payload.reviews?.[0] || null);
  }

  useEffect(() => {
    void refreshHistory().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);

  useEffect(() => {
    if (busyAction !== "Terra workstation review") return;
    const started = Date.now();
    setCodexElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setCodexElapsedSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busyAction]);

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
    onAppendLog(workstationLog(`${statusLabel(next.status)} — ${next.summary}`));
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
    onAppendLog(workstationLog(`Safe cleanup preview → ${next.candidates.length} candidate(s)`));
  }

  async function applyCleanup(): Promise<void> {
    if (!preview?.length) return;
    const targets = preview.map((candidate) => `• ${candidate.label}`).join("\n");
    const authorizationNote = preview.some((candidate) => candidate.requiresAuthorization)
      ? "\n\nA system authorization popup will appear for the allowlisted service repair."
      : "";
    if (!window.confirm(`Apply only these verified cleanup actions?\n\n${targets}${authorizationNote}`)) return;
    const next = await perform<CleanupResult>(
      "Safe cleanup",
      "workstation.cleanup.apply",
    );
    if (!next) return;
    setPreview(null);
    setReport(next.after);
    await refreshHistory(next.after);
    onAppendLog(workstationLog(
      `Safe cleanup → ${next.actions.map((action) => action.summary).join(" ") || "Nothing needed cleanup."}`,
    ));
  }

  async function askCodex(): Promise<void> {
    const next = await perform<CodexReview>(
      "Terra workstation review",
      "workstation.codex.review",
    );
    if (!next) return;
    setCodexReview(next);
    if (next.report) setReport(next.report);
    setPreview(next.preparedCandidates?.length ? next.preparedCandidates : null);
    await refreshHistory(next.report);
    onAppendLog(workstationLog(
      `Terra medium review ${next.ok ? "completed" : "failed"} in ${next.durationSeconds}s — ${next.analysis}`,
    ));
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

      {busyAction === "Terra workstation review" ? (
        <div className="workstationCodexProgress" role="status">
          <strong>Terra is reviewing the latest checkup</strong>
          <span>{codexElapsedSeconds}s elapsed · usually under 2 minutes · hard stop at 5 minutes</span>
          <div><i style={{ width: `${Math.min(100, (codexElapsedSeconds / 300) * 100)}%` }} /></div>
        </div>
      ) : null}

      {busyAction === "Safe cleanup" && preview?.some((candidate) => candidate.requiresAuthorization) ? (
        <div className="workstationRepairProgress" role="status">
          <strong>Waiting for system authorization</strong>
          <span>Approve the operating-system popup to restart only the verified stuck updater.</span>
        </div>
      ) : null}

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

          <div className="workstationCause">
            <span>Likely cause right now</span>
            {report.topProcesses[0]?.cpuPercent >= 80 ? (
              <strong>{report.topProcesses[0].role || report.topProcesses[0].process} · {report.topProcesses[0].cpuPercent}% current CPU</strong>
            ) : (
              <strong>No process sustained high CPU during the sample</strong>
            )}
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
                <div key={candidate.id}>
                  • {candidate.label}{candidate.ageHours > 0 ? ` · ${candidate.ageHours} hours old` : ""}
                  {candidate.requiresAuthorization ? " · system approval required" : ""}
                  {candidate.requiresUserFollowup ? " · close the old home-folder window after checking saved work" : ""}
                </div>
              )) : <div>Nothing needs safe cleanup.</div>}
            </div>
          ) : null}

          <details className="workstationDetails">
            <summary>What is running?</summary>
            <div className="workstationDetailGrid">
              <div>
                <strong>Top activity</strong>
                {report.topProcesses.slice(0, 5).map((process) => (
                  <span key={process.pid}>{process.role || process.process} · {process.cpuPercent}% current CPU</span>
                ))}
              </div>
              <div>
                <strong>Development services</strong>
                <span>{report.devRuntimes.length} governed runtime(s)</span>
                <span>Supabase: {activeSupabase}</span>
                <span>
                  VS Code workspace contains {(report.vscode.workspaceFileCount ?? report.vscode.watchedFileCount ?? 0).toLocaleString()} files
                </span>
              </div>
            </div>
          </details>
        </>
      ) : (
        <div className="workstationEmpty">Run a health check to establish the workstation baseline.</div>
      )}

      {codexReview ? (
        <div className={`workstationCodexReview ${codexReview.ok ? "" : "workstationCodexReviewFailed"}`}>
          <div className="workstationCodexReviewTitle">
            Latest Terra result
            <span>
              {codexReview.ok ? "Completed" : "Failed"} {formatDateTime(codexReview.completedAt)} · {codexReview.durationSeconds}s
            </span>
          </div>
          <div className="workstationCodexReviewBody">{codexReview.analysis}</div>
          {codexReview.preparedCandidates?.length ? (
            <div className="workstationCodexPrepared">
              Prepared for your approval: {codexReview.preparedCandidates.map((candidate) => candidate.label).join(", ")}
            </div>
          ) : null}
          {codexReview.learningCandidate ? (
            <div className="workstationCodexLearning">
              <strong>Possible reusable lesson</strong>
              <span>{codexReview.learningCandidate}</span>
            </div>
          ) : null}
          <div className="workstationCodexMeta">{codexReview.model} · {codexReview.reasoningEffort} reasoning</div>
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
