import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type TabKey = "chat" | "projects" | "roadmap" | "personal";

type PortStatus = {
  port: number;
  listening: boolean;
  pid?: number | null;
  cmd?: string | null;
  err?: string | null;
};

type LogMsg = { who: "me" | "o2"; text: string };

type ProjectKey = "empire" | "tbis" | "dqotd" | "offroad" | "radstock";

type ProjectRow = {
  key: ProjectKey;
  label: string;
  repoHint?: string;
  port?: number;
  url?: string;

  // Existing O2 hooks
  o2StartKey?: string;
  o2SnapshotKey?: string;
  o2CommitKey?: string;

  // New: per-project tooling map (Codex/O2 resources + constraints)
  o2MapKey?: string;

  // New: empire-only proof pack (system-wide O2+Codex capabilities snapshot)
  o2ProofPackKey?: string;
};

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`tab ${active ? "tabActive" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="sectionTitle">{children}</div>;
}

function fmtErr(e: unknown) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message + (e.stack ? `\n${e.stack}` : "");
  try {
    return JSON.stringify(e, null, 2);
  } catch {
    return String(e);
  }
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [chat, setChat] = useState<LogMsg[]>([
    { who: "o2", text: "RadControl online. Start a session from Projects." },
  ]);

  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const appendLog = (s: string) => {
    setLog((prev) => (prev ? prev + "\n" + s : s));
  };

  function clearLogs() {
    setLog("");
  }

  // --- Projects config (single source of truth) ---
  const PROJECTS: ProjectRow[] = useMemo(
    () => [
      {
        key: "empire",
        label: "Empire",
        repoHint: "Control layer",
        o2SnapshotKey: "empire.snapshot",
        o2CommitKey: "o2.commit",
        o2MapKey: "empire.map",
        o2ProofPackKey: "empire.proofpack",
      },
      {
        key: "tbis",
        label: "TBIS",
        repoHint: "radcon/dev/tbis",
        port: 3001,
        url: "http://localhost:3001",
        o2StartKey: "tbis.dev",
        o2SnapshotKey: "tbis.snapshot",
        o2CommitKey: "tbis.commit",
        o2MapKey: "tbis.map",
      },
      {
        key: "dqotd",
        label: "DQOTD",
        repoHint: "radcon/dev/charliedino",
        port: 3000,
        url: "http://localhost:3000/dqotd",
        o2StartKey: "dqotd.dev",
        o2SnapshotKey: "dqotd.snapshot",
        o2CommitKey: "dqotd.commit",
        o2MapKey: "dqotd.map",
      },
      {
        key: "offroad",
        label: "Offroad Croquet",
        repoHint: "radwolfe/dev/offroadcroquet",
        port: 3002,
        url: "http://localhost:3002",
        o2StartKey: "offroad.dev",
        o2SnapshotKey: "offroad.snapshot",
        o2CommitKey: "offroad.commit",
        o2MapKey: "offroad.map",
      },
      {
        key: "radstock",
        label: "RadStock",
        repoHint: "TBD",
        o2MapKey: "radstock.map",
      },
    ],
    [],
  );

  // --- Port status per row ---
  const [portsBusy, setPortsBusy] = useState(false);
  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  const PORTS = useMemo(() => {
    const s = new Set<number>();
    for (const p of PROJECTS) {
      if (typeof p.port === "number") s.add(p.port);
    }
    s.add(1420);
    return Array.from(s.values()).sort((a, b) => a - b);
  }, [PROJECTS]);

  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const burstTimerRef = useRef<number | null>(null);

  async function refreshPortsOnce() {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    setPortsBusy(true);

    try {
      const results = await Promise.all(
        PORTS.map(async (p): Promise<PortStatus> => {
          try {
            return await invoke<PortStatus>("port_status", { port: p });
          } catch (e) {
            const msg = fmtErr(e);
            return {
              port: p,
              listening: false,
              pid: null,
              cmd: null,
              err: msg,
            };
          }
        }),
      );

      setPorts((prev) => {
        const next: Record<number, PortStatus | undefined> = { ...prev };
        for (const r of results) next[r.port] = r;
        return next;
      });
    } finally {
      setPortsBusy(false);
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        setTimeout(() => void refreshPortsOnce(), 150);
      }
    }
  }

  function refreshPortsBurst() {
    if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    void refreshPortsOnce();
    burstTimerRef.current = window.setTimeout(() => {
      void refreshPortsOnce();
      burstTimerRef.current = null;
    }, 700);
  }

  async function freePort(port: number) {
    if (busy || portsBusy) return;
    setPortsBusy(true);
    try {
      appendLog(`\n[ports] Freeing port ${port} (best-effort)...`);
      await invoke("kill_port", { port });
      appendLog(`[ports] kill_port(${port}) OK`);
    } catch (e) {
      appendLog("\n[ports] kill_port ERROR:\n" + fmtErr(e));
    } finally {
      setPortsBusy(false);
      refreshPortsBurst();
    }
  }

  useEffect(() => {
    refreshPortsBurst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "projects") refreshPortsBurst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // --- Logs controls ---
  async function copyLogsToClipboard() {
    try {
      await navigator.clipboard.writeText(log || "");
      setChat((prev) => [
        ...prev,
        { who: "o2", text: "Copied Logs to clipboard." },
      ]);
    } catch (e) {
      appendLog("\n[ui] Copy Logs failed:\n" + fmtErr(e));
    }
  }

  // --- O2 helpers ---
  async function runO2(title: string, key: string) {
    if (busy) return;
    setBusy(true);
    setChat((prev) => [...prev, { who: "me", text: `${title}…` }]);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await invoke<string>("run_o2", { key });
      appendLog(out ? out.trimEnd() : "(no output)");
      setChat((prev) => [
        ...prev,
        { who: "o2", text: `${title} complete. Output is in Logs.` },
      ]);
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      setChat((prev) => [
        ...prev,
        { who: "o2", text: `${title} failed. Check Logs.` },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function restartRadcontrolDev() {
    if (busy) return;
    setBusy(true);
    appendLog(`\n[radcontrol] Restart (Dev) requested…\n`);
    try {
      await invoke("restart_radcontrol_dev");
      appendLog(`[radcontrol] restart_radcontrol_dev invoked. Closing window…`);
      const win = getCurrentWindow();
      await win.close();
    } catch (e) {
      appendLog("\n[radcontrol] Restart failed:\n" + fmtErr(e));
      setChat((prev) => [
        ...prev,
        {
          who: "o2",
          text: "Restart failed. Check Logs + /tmp/radcontrol.restart.log",
        },
      ]);
      setBusy(false);
    }
  }

  // --- URL open ---
  async function openUrl(url?: string) {
    if (!url) return;
    try {
      const out = await invoke<string>("open_url", { url });
      appendLog(`\n[ui] ${out}`);
      return;
    } catch (e) {
      appendLog("\n[ui] open_url ERROR:\n" + fmtErr(e));
    }

    try {
      await navigator.clipboard.writeText(url);
      appendLog(`\n[ui] URL copied to clipboard:\n${url}`);
    } catch (e) {
      appendLog("\n[ui] Clipboard copy failed:\n" + fmtErr(e));
    }
  }

  async function workOnProject(p: ProjectRow) {
    if (busy) return;

    const port = p.port;
    const s = typeof port === "number" ? ports[port] : undefined;
    const listening = Boolean(s?.listening);

    if (!listening && p.o2StartKey) {
      await runO2(`Start ${p.label}`, p.o2StartKey);
    } else if (!listening && !p.o2StartKey && typeof port === "number") {
      appendLog(
        `\n[workon] ${p.label}: not running, but no o2StartKey configured.\n`,
      );
    }

    await openUrl(p.url);
  }

  function statusForRow(p: ProjectRow) {
    if (typeof p.port !== "number") return { pill: "pillOff", text: "READY" };
    const s = ports[p.port];
    if (!s) return { pill: "pillWarn", text: "UNKNOWN" };
    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  const titleText = useMemo(() => {
    if (tab === "projects") return "Start sessions the same way every time";
    if (tab === "chat") return "Chat";
    if (tab === "roadmap") return "Roadmap";
    return "Personal";
  }, [tab]);

  return (
    <div className="appShell">
      <header className="header">
        <div className="headerLeft">
          <div className="brand">RadControl</div>
          <div className="tagline">{titleText}</div>
        </div>

        <div className="tabs">
          <TabButton
            active={tab === "projects"}
            onClick={() => setTab("projects")}
          >
            Projects
          </TabButton>
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabButton>
          <TabButton
            active={tab === "roadmap"}
            onClick={() => setTab("roadmap")}
          >
            Roadmap
          </TabButton>
          <TabButton
            active={tab === "personal"}
            onClick={() => setTab("personal")}
          >
            Personal
          </TabButton>
        </div>

        <div className="headerRight">
          <button
            className="btn btnGhost"
            onClick={() => void refreshPortsBurst()}
            disabled={busy || portsBusy}
            title="Refresh project runtime status"
          >
            {portsBusy ? "Refreshing…" : "Refresh Status"}
          </button>
          <button
            className="btn btnDanger"
            onClick={() => void restartRadcontrolDev()}
            disabled={busy}
            title="Restart RadControl dev + close window to avoid white screen"
          >
            Restart RadControl (Dev)
          </button>
        </div>
      </header>

      <main className="mainArea">
        {tab === "projects" ? (
          <div className="projectsWrap">
            <SectionTitle>Projects</SectionTitle>

            <div className="projectsTable">
              {PROJECTS.map((p) => {
                const st = statusForRow(p);
                const port = p.port;
                const s = typeof port === "number" ? ports[port] : undefined;
                const pid = s?.pid ?? null;
                const cmd = s?.cmd ?? null;
                const canKill =
                  typeof port === "number" && Boolean(s?.listening);

                const showProofPack = p.key === "empire" && !!p.o2ProofPackKey;

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
                        onClick={() => void workOnProject(p)}
                        disabled={busy}
                        title="Start dev server if needed, then open"
                      >
                        Work on
                      </button>

                      <button
                        className="btn"
                        onClick={() =>
                          p.o2SnapshotKey
                            ? void runO2(`Snapshot ${p.label}`, p.o2SnapshotKey)
                            : appendLog(
                                `\n[snapshot] ${p.label}: no o2SnapshotKey configured.\n`,
                              )
                        }
                        disabled={busy}
                        title="Generate paste-ready snapshot into Logs"
                      >
                        Snapshot
                      </button>

                      <button
                        className="btn"
                        onClick={() =>
                          p.o2CommitKey
                            ? void runO2(`Commit ${p.label}`, p.o2CommitKey)
                            : appendLog(
                                `\n[commit] ${p.label}: no o2CommitKey configured.\n`,
                              )
                        }
                        disabled={busy}
                        title="Run pre-commit checks; commit+push if green. Output goes to Logs."
                      >
                        Commit
                      </button>

                      <button
                        className="btn btnDanger btnIcon"
                        onClick={() =>
                          typeof port === "number" ? void freePort(port) : null
                        }
                        disabled={busy || portsBusy || !canKill}
                        title={
                          typeof port !== "number"
                            ? "No port"
                            : canKill
                              ? "Kill whatever is listening on this port"
                              : "Nothing is listening"
                        }
                      >
                        Kill
                      </button>

                      <button
                        className="btn btnGhost"
                        onClick={() =>
                          p.o2MapKey
                            ? void runO2(`${p.label} O2 Map`, p.o2MapKey)
                            : appendLog(
                                `\n[map] ${p.label}: no o2MapKey configured.\n`,
                              )
                        }
                        disabled={busy}
                        title="Paste-ready map of Codex + O2 resources and constraints for this project"
                      >
                        Map
                      </button>

                      {showProofPack ? (
                        <button
                          className="btn btnGhost"
                          onClick={() =>
                            p.o2ProofPackKey
                              ? void runO2(
                                  "Empire Proof Pack",
                                  p.o2ProofPackKey,
                                )
                              : appendLog(
                                  `\n[proofpack] Empire: no o2ProofPackKey configured.\n`,
                                )
                          }
                          disabled={busy}
                          title="Paste-ready proof of O2 + Codex infrastructure and available capabilities"
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
                        {typeof port === "number" && s?.err ? (
                          <span className="meta metaWarn">check failed</span>
                        ) : null}
                      </div>

                      {p.url ? (
                        <button
                          className="linkBtn"
                          onClick={() => void openUrl(p.url)}
                          title="Open project URL"
                        >
                          {p.url}
                        </button>
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
        ) : (
          <div className="placeholderTab">
            <SectionTitle>
              {tab === "chat"
                ? "Chat"
                : tab === "roadmap"
                  ? "Roadmap"
                  : "Personal"}
            </SectionTitle>
            <div className="placeholderBody">
              This tab is unchanged in this step.
            </div>
          </div>
        )}
      </main>

      <footer className="logsBar">
        <div className="logsLeft">
          <div className="logsTitle">Logs</div>
          <div className="logsBox">
            {busy ? "Running…" : log || "No logs yet."}
          </div>
        </div>

        <div className="logsActionsRight">
          <button
            className="btn btnGhost"
            onClick={() => clearLogs()}
            disabled={busy}
          >
            Clear
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => void copyLogsToClipboard()}
            disabled={busy}
            title="Copy Logs to clipboard"
          >
            Copy
          </button>
        </div>
      </footer>
    </div>
  );
}
