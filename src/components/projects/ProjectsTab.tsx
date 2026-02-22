import React from "react";
import type { ProjectRow, PortStatus } from "./types";

export function ProjectsTab({
  projects,
  ports,
  busy,
  portsBusy,
  onWorkOn,
  onSnapshot,
  onCommit,
  onKill,
  onMap,
  onProofPack,
  statusForRow,
  killDisabledReason,
}: {
  projects: ProjectRow[];
  ports: Record<number, PortStatus | undefined>;
  busy: boolean;
  portsBusy: boolean;
  onWorkOn: (p: ProjectRow) => Promise<void> | void;
  onSnapshot: (p: ProjectRow) => Promise<void> | void;
  onCommit: (p: ProjectRow) => Promise<void> | void;
  onKill: (port: number) => Promise<void> | void;
  onMap: (p: ProjectRow) => Promise<void> | void;
  onProofPack: (p: ProjectRow) => Promise<void> | void;
  statusForRow: (p: ProjectRow) => any;

  // optional UI copy (App may pass this when kill is intentionally disabled)
  killDisabledReason?: string;
}) {
  React.useEffect(() => {
    console.log("[RadControl][ProjectsTab] projects:", projects);
  }, [projects]);

  // Proxy purity:
  // - The UI does NOT kill ports or processes.
  // - Kill is displayed for clarity, but is ALWAYS disabled.
  // - Deterministic kill-by-port happens inside O2 start/restart scripts.
  const killDisabled = true;
  const killLabel = "Kill (disabled)";

  const enhancedOnWorkOn = async (p: ProjectRow) => {
    try {
      if (onWorkOn) onWorkOn(p);
    } catch (e) {
      console.error("[RadControl][ProjectsTab] Failed Work On flow:", e);
    }
  };

  const keysLine = projects.map((p) => p.key).join(", ");
  const labelsLine = projects.map((p) => p.label).join(" | ");

  return (
    <div className="projectsWrapInner">
      {killDisabledReason ? (
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
          Kill disabled: {killDisabledReason}
        </div>
      ) : null}

      <details style={{ margin: "8px 0 12px 0" }}>
        <summary style={{ cursor: "pointer" }}>
          Debug: ProjectsTab input ({projects.length})
        </summary>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 8 }}>
          <div>
            <strong>Keys:</strong> <span>{keysLine || "—"}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Labels:</strong> <span>{labelsLine || "—"}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Raw (first 2):</strong>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
              {JSON.stringify(projects.slice(0, 2), null, 2)}
            </pre>
          </div>
        </div>
      </details>

      <div className="projectsTable">
        {projects.map((p) => {
          const st = statusForRow(p);
          const port = p.port;
          const s = typeof port === "number" ? ports[port] : undefined;
          const pid = s?.pid ?? null;
          const cmd = s?.cmd ?? null;

          return (
            <div className="projectRow" key={p.key}>
              <div className="projectLeft">
                <div className="projectLabel">{p.label}</div>
                {p.repoHint ? (
                  <div className="projectHint">{p.repoHint}</div>
                ) : null}
              </div>

              <div className="projectRight">
                <button
                  className="btn btnPrimary"
                  onClick={() => enhancedOnWorkOn(p)}
                  disabled={busy}
                >
                  Work on
                </button>

                <button
                  className="btn"
                  onClick={() => onSnapshot(p)}
                  disabled={busy}
                >
                  Snapshot
                </button>

                <button
                  className="btn"
                  onClick={() => onCommit(p)}
                  disabled={busy}
                >
                  Commit
                </button>

                <button
                  className="btn btnDanger btnIcon"
                  onClick={() => {
                    // Intentionally no-op. Keep handler to avoid accidental future enablement.
                    if (typeof port === "number") onKill(port);
                  }}
                  disabled={busy || portsBusy || killDisabled}
                  title="Disabled: proxy purity (kills happen inside O2 start/restart)"
                >
                  {killLabel}
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => onMap(p)}
                  disabled={busy}
                >
                  Map
                </button>

                {p.o2ProofPackKey ? (
                  <button
                    className="btn btnGhost"
                    onClick={() => onProofPack(p)}
                    disabled={busy}
                  >
                    Proof Pack
                  </button>
                ) : null}
              </div>

              <div className="projectMid">
                <div className="projectStatusLine">
                  <span className={`pill ${st.pill}`}>{st.text}</span>
                  {typeof port === "number" ? (
                    <span className="portMono">:{port}</span>
                  ) : (
                    <span className="portMono">—</span>
                  )}
                  {typeof port === "number" && s?.listening && pid ? (
                    <span className="meta">
                      pid {pid}
                      {cmd ? ` • ${cmd}` : ""}
                    </span>
                  ) : null}
                </div>

                {p.url ? (
                  <div className="projectUrlMuted">{p.url}</div>
                ) : (
                  <div className="projectUrlMuted">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="projectsFootnote">
        Uses <code>run_o2</code> only. No freeform shell. Kill is display-only.
      </div>
    </div>
  );
}
