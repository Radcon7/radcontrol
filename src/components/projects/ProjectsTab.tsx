import React from "react";
import type { ProjectRow, PortStatus } from "./types";

type StatusLike = {
  pill: string;
  text: string;
};

type Props = {
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
  statusForRow: (p: ProjectRow) => StatusLike | unknown;
  killDisabledReason?: string;
};

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
}: Props) {
  const safeStatusForRow = (p: ProjectRow): StatusLike => {
    const st = statusForRow(p) as Partial<StatusLike> | null | undefined;
    return {
      pill: typeof st?.pill === "string" ? st.pill : "pillMuted",
      text: typeof st?.text === "string" ? st.text : "—",
    };
  };

  const enhancedOnWorkOn = (p: ProjectRow) => {
    try {
      void onWorkOn(p);
    } catch {
      // no console spam; failures should surface via UI/toast elsewhere if needed
    }
  };

  return (
    <div className="projectsWrapInner">
      {killDisabledReason ? (
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
          {killDisabledReason}
        </div>
      ) : null}

      <div className="projectsTable">
        {projects.map((p) => {
          const st = safeStatusForRow(p);

          const port = p.port;
          const s = typeof port === "number" ? ports[port] : undefined;

          const isListening = Boolean(s?.listening);
          const killDisabled =
            busy || portsBusy || typeof port !== "number" || !isListening;

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
                    if (typeof port === "number") void onKill(port);
                  }}
                  disabled={killDisabled}
                  title={
                    typeof port !== "number"
                      ? "No port"
                      : isListening
                        ? "Kill listener via O2 kill_port.<port>"
                        : "Not running"
                  }
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

                  {typeof port === "number" && s?.listening && s?.pid ? (
                    <span className="meta">
                      pid {s.pid}
                      {s.cmd ? ` • ${s.cmd}` : ""}
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
