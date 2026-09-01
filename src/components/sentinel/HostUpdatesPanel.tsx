import { useEffect, useState } from "react";
import { runO2ParsedJson } from "../common/o2Client";

type UpdateStatus = "current" | "routine" | "attention" | "stale";

type HostUpdateReport = {
  checkedAt: string;
  status: UpdateStatus;
  summary: string;
  apt: {
    updateCount: number;
    securityCount: number;
    catalogAgeHours: number | null;
    rebootLikely: boolean;
  };
  firmware: { available: boolean; updateCount: number };
  flatpak: { available: boolean; updateCount: number };
  tools: Array<{
    key: string;
    label: string;
    currentVersion: string;
    availableVersion: string | null;
    updateAvailable: boolean | null;
  }>;
};

type HostUpdateHistory = {
  ok: boolean;
  checks: HostUpdateReport[];
};

type Props = {
  disabled: boolean;
};

function formatDateTime(value?: string): string {
  if (!value) return "Not checked";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function updateStatusLabel(status?: UpdateStatus): string {
  if (status === "current") return "CURRENT";
  if (status === "routine") return "ROUTINE";
  if (status === "attention") return "ATTENTION";
  if (status === "stale") return "STALE";
  return "UNKNOWN";
}

export function HostUpdatesPanel({ disabled }: Props) {
  const [report, setReport] = useState<HostUpdateReport | null>(null);
  const [history, setHistory] = useState<HostUpdateReport[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory(preferred?: HostUpdateReport): Promise<void> {
    const result = await runO2ParsedJson<HostUpdateHistory>(
      "workstation.updates.history",
      "Could not load host update history",
      "Host update history returned invalid data",
    );
    setHistory(result.checks || []);
    setReport(preferred || result.checks?.[0] || null);
  }

  useEffect(() => {
    void loadHistory().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);

  async function checkUpdates(): Promise<void> {
    setChecking(true);
    setError("");
    try {
      const result = await runO2ParsedJson<HostUpdateReport>(
        "workstation.updates.check",
        "Read-only host update check failed",
        "Host update check returned invalid data",
      );
      await loadHistory(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="sentinelMaintenancePanel" data-testid="host-updates-panel">
      <div className="sentinelSubCardHeading">
        <div>
          <span>UPDATE INVENTORY</span>
          <strong>System, firmware, Flatpak + shared tools</strong>
        </div>
        <span className={`sentinelMaintenanceState sentinelMaintenanceState-${report?.status || "unknown"}`}>
          {updateStatusLabel(report?.status)}
        </span>
      </div>
      <div className="sentinelInlineAction">
        <p>Read-only catalog inspection. It refreshes no catalogs and installs nothing.</p>
        <button
          className="btn btnGhost btnCompact"
          type="button"
          onClick={() => void checkUpdates()}
          disabled={disabled || checking}
          data-testid="sentinel-check-updates"
        >
          {checking ? "Checking…" : "Check Updates"}
        </button>
      </div>
      {error ? <div className="panelError">{error}</div> : null}
      {report ? (
        <>
          <div className="sentinelMaintenanceMetrics">
            <div><span>Security</span><strong>{report.apt.securityCount}</strong></div>
            <div><span>Packages</span><strong>{report.apt.updateCount}</strong></div>
            <div><span>Firmware</span><strong>{report.firmware.updateCount}</strong></div>
            <div><span>Flatpak</span><strong>{report.flatpak.updateCount}</strong></div>
          </div>
          <p className="sentinelSubtle">{report.summary} · checked {formatDateTime(report.checkedAt)}{report.apt.rebootLikely ? " · restart may be required after operator-approved installation" : ""}</p>
          <details className="sentinelDetails">
            <summary>Shared tool inventory</summary>
            <div className="sentinelCompactList securityInsetScroll">
              {report.tools.map((tool) => (
                <div key={tool.key}>
                  <span><strong>{tool.label}</strong><small>{tool.currentVersion}</small></span>
                  <small>{tool.updateAvailable ? `Update ${tool.availableVersion || "available"}` : tool.updateAvailable === false ? "Current" : "Catalog unknown"}</small>
                </div>
              ))}
            </div>
          </details>
          {history.length > 1 ? <small className="sentinelSubtle">{history.length} bounded update checks retained by O2.</small> : null}
        </>
      ) : (
        <p className="sentinelSubtle">No update inventory has been recorded yet.</p>
      )}
    </div>
  );
}
