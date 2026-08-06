import { useEffect, useState } from "react";
import { runO2ParsedJson } from "../common/o2Files";

type UpdateStatus = "current" | "routine" | "attention" | "stale";

type UpdateItem = {
  name: string;
  currentVersion?: string;
  availableVersion?: string;
  security?: boolean;
};

type ToolStatus = {
  key: string;
  label: string;
  currentVersion: string;
  availableVersion: string | null;
  owner: string;
  updateAvailable: boolean | null;
};

type UpdateReport = {
  ok: boolean;
  checkedAt: string;
  status: UpdateStatus;
  summary: string;
  catalogStale: boolean;
  apt: {
    catalogAgeHours: number | null;
    updateCount: number;
    securityCount: number;
    priorityCount: number;
    routineCount: number;
    rebootLikely: boolean;
    priorityItems: UpdateItem[];
  };
  firmware: { available: boolean; updateCount: number; items: UpdateItem[] };
  flatpak: { available: boolean; updateCount: number; items: UpdateItem[] };
  tools: ToolStatus[];
  recommendations: Array<{ priority: string; title: string; detail: string }>;
  source?: string;
};

type UpdateHistory = {
  ok: boolean;
  checks: UpdateReport[];
};

type RefreshResult = {
  ok: boolean;
  steps: Array<{ key: string; ok: boolean; summary: string }>;
  report: UpdateReport;
};

type OpenResult = { ok: boolean; summary: string };

type Props = {
  onAppendLog: (text: string) => void;
  onSummaryChange?: (summary: { securityCount: number; updateCount: number }) => void;
};

function formatDateTime(value?: string): string {
  if (!value) return "Not checked yet";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function statusLabel(status?: UpdateStatus): string {
  if (status === "current") return "Current";
  if (status === "routine") return "Routine";
  if (status === "attention") return "Review now";
  if (status === "stale") return "Refresh needed";
  return "Not checked";
}

function updateLog(message: string): string {
  return `\n[workstation updates · ${new Date().toLocaleString()}] ${message}\n`;
}

function versionSummary(tool: ToolStatus): string {
  if (tool.updateAvailable === true && tool.availableVersion) return `Update → ${tool.availableVersion}`;
  if (tool.updateAvailable === false && tool.availableVersion) return "Current";
  if (tool.owner === "Project-pinned") return tool.availableVersion ? `Latest catalog: ${tool.availableVersion}` : "Reviewed per project";
  return "Latest catalog not refreshed";
}

export function WorkstationUpdatesPanel({ onAppendLog, onSummaryChange }: Props) {
  const [report, setReport] = useState<UpdateReport | null>(null);
  const [history, setHistory] = useState<UpdateReport[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadHistory(preferred?: UpdateReport): Promise<void> {
    const next = await runO2ParsedJson<UpdateHistory>(
      "workstation.updates.history",
      "Could not load update history",
      "Update history returned invalid data",
    );
    setHistory(next.checks || []);
    const selected = preferred || next.checks?.[0] || null;
    setReport(selected);
    if (selected) {
      onSummaryChange?.({
        securityCount: selected.apt.securityCount,
        updateCount: selected.apt.updateCount,
      });
    }
  }

  useEffect(() => {
    void loadHistory().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);

  async function runCheck(): Promise<void> {
    setBusyAction("check");
    setError("");
    setMessage("");
    try {
      const next = await runO2ParsedJson<UpdateReport>(
        "workstation.updates.check",
        "Update check failed",
        "Update check returned invalid data",
      );
      await loadHistory(next);
      onAppendLog(updateLog(`${statusLabel(next.status)} — ${next.summary}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshCatalogs(): Promise<void> {
    if (!window.confirm(
      "Refresh Pop!_OS, firmware, Flatpak, and developer-tool catalogs?\n\nThis downloads metadata only. It does not install updates. A system authorization popup will appear.",
    )) return;
    setBusyAction("refresh");
    setError("");
    setMessage("");
    try {
      const next = await runO2ParsedJson<RefreshResult>(
        "workstation.updates.refresh",
        "Catalog refresh failed",
        "Catalog refresh returned invalid data",
      );
      await loadHistory(next.report);
      const summary = next.steps.map((step) => step.summary).join(" ");
      setMessage(summary);
      onAppendLog(updateLog(summary));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function openUpdater(): Promise<void> {
    setBusyAction("open");
    setError("");
    try {
      const next = await runO2ParsedJson<OpenResult>(
        "workstation.updates.open",
        "Could not open Pop!_Shop",
        "Pop!_Shop action returned invalid data",
      );
      setMessage(next.summary);
      onAppendLog(updateLog(next.summary));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;

  return (
    <section className="workstationUpdates" data-testid="workstation-updates-panel">
      <div className="workstationHealthHeader">
        <div>
          <div className="surfaceCardTitle">Workstation Updates</div>
          <p className="workstationHealthIntro">
            One review center for system, firmware, editor, container, and developer-tool updates.
          </p>
        </div>
        <span className={`workstationStatus workstationUpdateStatus-${report?.status || "unknown"}`}>
          {statusLabel(report?.status)}
        </span>
      </div>

      <div className="workstationUpdateActions">
        <button className="btn btnPrimary" onClick={() => void runCheck()} disabled={busy}>
          {busyAction === "check" ? "Checking…" : "Check Current Catalogs"}
        </button>
        <button className="btn btnSecondary" onClick={() => void refreshCatalogs()} disabled={busy}>
          {busyAction === "refresh" ? "Waiting for authorization…" : "Refresh Catalogs"}
        </button>
        <button className="btn btnSecondary" onClick={() => void openUpdater()} disabled={busy}>
          {busyAction === "open" ? "Opening…" : "Open Official Updater"}
        </button>
      </div>

      <div className="workstationUpdateBoundary">
        RadControl checks, prioritizes, and remembers. The official Pop!_OS updater performs installation after your review.
      </div>
      {error ? <div className="workstationMessage workstationMessageError">{error}</div> : null}
      {message ? <div className="workstationMessage">{message}</div> : null}

      {report ? (
        <>
          <div className="workstationSummary">
            <strong>{report.summary}</strong>
            <span>Checked {formatDateTime(report.checkedAt)}</span>
          </div>

          <div className="workstationUpdateMetrics">
            <div><span>Security</span><strong>{report.apt.securityCount}</strong></div>
            <div><span>Total packages</span><strong>{report.apt.updateCount}</strong></div>
            <div><span>Firmware</span><strong>{report.firmware.updateCount}</strong></div>
            <div>
              <span>Catalog age</span>
              <strong>{report.apt.catalogAgeHours === null ? "Unknown" : `${report.apt.catalogAgeHours}h`}</strong>
            </div>
          </div>

          {report.recommendations.length ? (
            <div className="workstationRecommendations">
              {report.recommendations.map((item) => (
                <article key={`${item.priority}-${item.title}`}>
                  <span>{item.priority}</span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="workstationToolGrid">
            {report.tools.map((tool) => (
              <article key={tool.key} className={tool.updateAvailable ? "hasUpdate" : ""}>
                <div>
                  <strong>{tool.label}</strong>
                  <span>{tool.owner}</span>
                </div>
                <p>{tool.currentVersion}</p>
                <small>{versionSummary(tool)}</small>
              </article>
            ))}
          </div>

          <details className="workstationDetails">
            <summary>Important package details</summary>
            <div className="workstationUpdateItems">
              {report.apt.priorityItems.map((item) => (
                <div key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{item.currentVersion} → {item.availableVersion}</span>
                  {item.security ? <small>Security</small> : <small>Priority tool</small>}
                </div>
              ))}
            </div>
          </details>
        </>
      ) : (
        <div className="workstationEmpty">Run an update check to establish the current maintenance picture.</div>
      )}

      <div className="workstationHistory">
        <div className="workstationHistoryTitle">Recent update checks</div>
        {history.length ? history.map((check) => (
          <button
            type="button"
            key={`${check.checkedAt}-${check.source || "manual"}`}
            className="workstationHistoryRow"
            onClick={() => setReport(check)}
          >
            <span className={`workstationHistoryDot workstationUpdateDot-${check.status}`} />
            <span>{formatDateTime(check.checkedAt)}</span>
            <strong>{statusLabel(check.status)}</strong>
            <small>{check.apt.updateCount} package(s)</small>
          </button>
        )) : <div className="workstationEmpty">No update checks recorded yet.</div>}
      </div>
    </section>
  );
}
