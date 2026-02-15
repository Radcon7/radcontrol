import React from "react";
import type { ProjectRow, PortStatus } from "./types";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="sectionTitle">{children}</div>;
}

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
}: {
  projects: ProjectRow[];
  ports: Record<number, PortStatus | undefined>;
  busy: boolean;
  portsBusy: boolean;

  onWorkOn: (p: ProjectRow) => void;
  onSnapshot: (p: ProjectRow) => void;
  onCommit: (p: ProjectRow) => void;
  onKill: (port: number) => void;
  onMap: (p: ProjectRow) => void;
  onProofPack: (p: ProjectRow) => void;

  statusForRow: (p: ProjectRow) => { pill: string; text: string };
}) {
  return (
    <div className="projectsWrap">
      <SectionTitle>Projects</SectionTitle>

      <div className="projectsTable">
        {projects.map((p) => {
          const st = statusForRow(p);
          const port = p.port;
          const s = typeof port === "number" ? ports[port] : undefined;
          const pid = s?.pid ?? null;
          const cmd = s?.cmd ?? null;
          const canKill = typeof port === "number" && Boolean(s?.listening);

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
                  onClick={() => onWorkOn(p)}
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
                  onClick={() =>
                    typeof port === "number" ? onKill(port) : null
                  }
                  disabled={busy || portsBusy || !canKill}
                >
                  Kill
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
        Uses <code>run_o2</code> only. No freeform shell.
      </div>
    </div>
  );
}
