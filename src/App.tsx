import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";

type TabKey = "chat" | "projects" | "roadmap" | "personal" | "intervention";

type PortStatus = {
  port: number;
  listening: boolean;
  pid: number | null;
  command: string | null;
  raw: string;
};

const PORTS = [1420, 3000, 3001] as const;

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

function nowStamp() {
  return new Date().toLocaleString();
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");

  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<Array<{ who: "me" | "o2"; text: string }>>([
    { who: "o2", text: "RadControl online. Start a session from Projects." },
  ]);

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("");

  const [portsBusy, setPortsBusy] = useState(false);
  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  // Intervention tab output window (now used for O2 runs, not legacy memo gen)
  const [interventionMemo, setInterventionMemo] = useState<string>("");

  // If a refresh is requested while one is running, queue one more.
  const portsRefreshQueuedRef = useRef(false);

  const headerSubtitle = useMemo(() => {
    if (tab === "chat") return "Chat + Session Notes";
    if (tab === "projects") return "Start sessions the same way every time";
    if (tab === "roadmap") return "Empire dashboard (MVP placeholder)";
    if (tab === "personal") return "Personal vault (MVP placeholder)";
    return "Stop drift. Re-anchor. Continue.";
  }, [tab]);

  function appendLog(text: string) {
    setLog((prev) => (prev ? `${prev}\n${text}` : text));
  }

  function resetRunLog(title: string) {
    setLog(`=== ${title} ===\nStarted: ${nowStamp()}\n`);
  }

  function fmtErr(e: unknown) {
    if (typeof e === "string") return e;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  async function copyTextToClipboard(text: string) {
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      setChat((c) => [...c, { who: "o2", text: "Copied to clipboard." }]);
      return;
    } catch {
      // fallback below
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setChat((c) => [
        ...c,
        {
          who: "o2",
          text: ok ? "Copied to clipboard." : "Copy failed (clipboard denied).",
        },
      ]);
    } catch {
      setChat((c) => [...c, { who: "o2", text: "Copy failed." }]);
    }
  }

  async function copyLogsToClipboard() {
    await copyTextToClipboard(log ?? "");
  }

  /* =========================
     Active Ports Panel
     ========================= */

  async function refreshPorts() {
    // If a refresh is already in-flight, queue a single follow-up refresh.
    if (portsBusy) {
      portsRefreshQueuedRef.current = true;
      return;
    }

    setPortsBusy(true);

    try {
      const results: PortStatus[] = [];

      for (const p of PORTS) {
        try {
          const r = await invoke<PortStatus>("port_status", { port: p });
          results.push(r);
        } catch (e) {
          const msg = fmtErr(e);
          // CRITICAL: don't swallow errors — log them so we can see why status is wrong.
          appendLog(`\n[ports] port_status(${p}) ERROR:\n${msg}\n`);
          results.push({
            port: p,
            listening: false,
            pid: null,
            command: null,
            raw: `ERROR: ${msg}`,
          });
        }
      }

      setPorts((prev) => {
        const next: Record<number, PortStatus | undefined> = { ...prev };
        for (const r of results) next[r.port] = r;
        return next;
      });
    } finally {
      setPortsBusy(false);

      // If something requested a refresh while we were busy, run one more immediately.
      if (portsRefreshQueuedRef.current) {
        portsRefreshQueuedRef.current = false;
        setTimeout(() => {
          void refreshPorts();
        }, 0);
      }
    }
  }

  function refreshPortsBurst() {
    // Port may not be listening immediately after we launch the dev server in a new terminal.
    // So we refresh now, then again shortly after, then once more.
    void refreshPorts();
    setTimeout(() => void refreshPorts(), 900);
    setTimeout(() => void refreshPorts(), 2500);
  }

  async function killAndRefresh(port: number) {
    if (busy || portsBusy) return;
    setPortsBusy(true);
    try {
      appendLog(`\n[ports] Freeing port ${port} (best-effort)...`);
      const out = await invoke<string>("kill_port", { port });
      appendLog(`\n--- kill_port output ---\n${out.trim()}`);
    } catch (e) {
      appendLog("\n[ports] kill_port ERROR:\n" + fmtErr(e));
    } finally {
      setPortsBusy(false);
      refreshPortsBurst();
    }
  }

  // Refresh ports on first mount, and whenever we enter Projects tab.
  useEffect(() => {
    refreshPortsBurst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "projects") refreshPortsBurst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* =========================
     O2 actions
     ========================= */

  async function runO2(key: string, title: string) {
    if (busy) return;
    setBusy(true);

    // Logs panel: keep a canonical record
    resetRunLog(title);

    try {
      appendLog(`\nRunning: run_o2("${key}")...`);
      const out = await invoke<string>("run_o2", { key });
      const trimmed = (out ?? "").trim();

      appendLog("\n--- output ---\n" + trimmed);
      appendLog(`\nDone: ${nowStamp()}`);

      // Intervention panel: show latest run output
      setInterventionMemo(
        `=== ${title} ===\nKey: ${key}\nStarted: ${nowStamp()}\n\n${trimmed || "(no output)"}\n`,
      );

      setChat((c) => [...c, { who: "o2", text: `${title} complete.` }]);
    } catch (e) {
      const msg = fmtErr(e);
      appendLog("\nERROR:\n" + msg);
      setInterventionMemo(
        `=== ${title} ===\nKey: ${key}\nStarted: ${nowStamp()}\n\nERROR:\n${msg}\n`,
      );
      setChat((c) => [
        ...c,
        { who: "o2", text: `${title} failed. Check Logs.` },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function runEmpireSnapshot(): Promise<string> {
    if (busy) return "";
    setBusy(true);
    resetRunLog("EMPIRE SNAPSHOT");
    try {
      appendLog("\n[1/1] Running empire snapshot...");
      const out = await invoke<string>("run_empire_snapshot");
      appendLog("\n--- output ---\n" + out.trim());
      appendLog(`\nDone: ${nowStamp()}`);
      setChat((c) => [
        ...c,
        { who: "o2", text: "Empire snapshot complete. Output is in Logs." },
      ]);
      return out;
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: "Snapshot failed. Check Logs for details." },
      ]);
      throw e;
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function workOnDqotd() {
    if (busy) return;
    setBusy(true);
    resetRunLog("WORK ON DQOTD");

    try {
      appendLog("\n[1/3] Empire snapshot...");
      const snap = await invoke<string>("run_empire_snapshot");
      appendLog("\n--- snapshot output ---\n" + snap.trim());

      appendLog("\n[2/3] DQOTD session start (o2_session_start.sh)...");
      const sess = await invoke<string>("run_dqotd_session_start");
      appendLog("\n--- session start output ---\n" + sess.trim());

      appendLog("\n[3/3] Launching DQOTD dev server in a new terminal...");
      const launch = await invoke<string>("launch_dqotd_dev_server_terminal");
      appendLog("\n--- launch output ---\n" + launch.trim());

      appendLog(`\nDone: ${nowStamp()}`);

      setChat((c) => [
        ...c,
        { who: "o2", text: "DQOTD session started. Dev server launched." },
      ]);

      // Important: give the ports panel multiple chances to catch the listener.
      refreshPortsBurst();
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: "DQOTD start failed. Check Logs." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function commitPushDqotdArtifacts() {
    if (busy) return;
    setBusy(true);
    resetRunLog("COMMIT + PUSH (DQOTD O2 ARTIFACTS)");

    try {
      appendLog("\nRunning git add/commit/push for DQOTD artifacts...");
      const out = await invoke<string>("commit_push_dqotd_o2_artifacts");
      appendLog("\n--- output ---\n" + out.trim());
      appendLog(`\nDone: ${nowStamp()}`);
      setChat((c) => [
        ...c,
        { who: "o2", text: "Committed + pushed DQOTD O2 artifacts." },
      ]);
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: "Commit/push failed. Check Logs." },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function workOnTbis() {
    if (busy) return;
    setBusy(true);
    resetRunLog("WORK ON TBIS");

    try {
      appendLog("\n[1/3] Empire snapshot...");
      const snap = await invoke<string>("run_empire_snapshot");
      appendLog("\n--- snapshot output ---\n" + snap.trim());

      appendLog("\n[2/3] TBIS session start (o2_session_start.sh)...");
      const sess = await invoke<string>("run_tbis_session_start");
      appendLog("\n--- session start output ---\n" + sess.trim());

      appendLog("\n[3/3] Launching TBIS dev server in a new terminal...");
      const launch = await invoke<string>("launch_tbis_dev_server_terminal");
      appendLog("\n--- launch output ---\n" + launch.trim());

      appendLog(`\nDone: ${nowStamp()}`);

      setChat((c) => [
        ...c,
        { who: "o2", text: "TBIS session started. Dev server launched." },
      ]);

      // Important: give the ports panel multiple chances to catch the listener.
      refreshPortsBurst();
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: "TBIS start failed. Check Logs." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function commitPushTbisArtifacts() {
    if (busy) return;
    setBusy(true);
    resetRunLog("COMMIT + PUSH (TBIS O2 ARTIFACTS)");

    try {
      appendLog("\nRunning git add/commit/push for TBIS artifacts...");
      const out = await invoke<string>("commit_push_tbis_o2_artifacts");
      appendLog("\n--- output ---\n" + out.trim());
      appendLog(`\nDone: ${nowStamp()}`);
      setChat((c) => [
        ...c,
        { who: "o2", text: "Committed + pushed TBIS O2 artifacts." },
      ]);
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: "Commit/push failed. Check Logs." },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function restartRadcontrolDev() {
    if (busy) return;
    setBusy(true);
    resetRunLog("RESTART RADCONTROL (DEV)");

    try {
      appendLog("\nLaunching RadControl restart in a new terminal...");
      const out = await invoke<string>("restart_radcontrol_dev");
      appendLog("\n--- output ---\n" + out.trim());
      appendLog(`\nDone: ${nowStamp()}`);

      setChat((c) => [
        ...c,
        {
          who: "o2",
          text: "Restart launched. This window may go blank after port 1420 is freed—close it once the new RadControl is up.",
        },
      ]);
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: "Restart failed. Check Logs." },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  function sendChat() {
    const t = chatInput.trim();
    if (!t) return;
    setChat((c) => [...c, { who: "me" as const, text: t }]);
    setChatInput("");
    setTimeout(() => {
      setChat((c) => [...c, { who: "o2", text: "Logged." }]);
    }, 150);
  }

  function portLabel(p: number) {
    if (p === 1420) return "RadControl (Vite)";
    if (p === 3000) return "DQOTD";
    if (p === 3001) return "TBIS";
    return `Port ${p}`;
  }

  return (
    <div className="appShell">
      <div className="topBar">
        <div className="brand">
          <div className="brandTitle">RadControl</div>
          <div className="brandSub">{headerSubtitle}</div>
        </div>

        <div className="tabs">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabButton>
          <TabButton
            active={tab === "projects"}
            onClick={() => setTab("projects")}
          >
            Projects
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
          <TabButton
            active={tab === "intervention"}
            onClick={() => setTab("intervention")}
          >
            Intervention
          </TabButton>
        </div>
      </div>

      <div className="body">
        <div className="main">
          {tab === "chat" && (
            <>
              <SectionTitle>Chat</SectionTitle>
              <div className="chatBox">
                {chat.map((m, idx) => (
                  <div
                    key={idx}
                    className={`chatLine ${m.who === "me" ? "chatMe" : "chatO2"}`}
                  >
                    <span className="chatWho">
                      {m.who === "me" ? "You" : "O2"}:
                    </span>{" "}
                    <span>{m.text}</span>
                  </div>
                ))}
              </div>

              <div className="chatInputRow">
                <input
                  className="chatInput"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type here…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendChat();
                  }}
                />
                <button className="primaryBtn" onClick={sendChat}>
                  Send
                </button>
              </div>
            </>
          )}

          {tab === "projects" && (
            <>
              <SectionTitle>Projects</SectionTitle>

              <div className="grid">
                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={() => void runEmpireSnapshot()}
                >
                  <div className="cardTitle">Empire Snapshot</div>
                  <div className="cardSub">
                    Runs <code>~/dev/o2/scripts/o2_empire_snapshot.sh</code>
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={restartRadcontrolDev}
                >
                  <div className="cardTitle">Restart RadControl (dev)</div>
                  <div className="cardSub">
                    Frees <code>1420</code> → launches{" "}
                    <code>npm run tauri dev</code> in new terminal
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={workOnTbis}
                >
                  <div className="cardTitle">Work on TBIS</div>
                  <div className="cardSub">
                    Snapshot → Session Start → Launch Dev Server (opens
                    localhost)
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={commitPushTbisArtifacts}
                >
                  <div className="cardTitle">
                    Commit + Push TBIS O2 Artifacts
                  </div>
                  <div className="cardSub">
                    Commits <code>docs/_repo_snapshot.txt</code> +{" "}
                    <code>docs/_o2_repo_index.txt</code>
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={workOnDqotd}
                >
                  <div className="cardTitle">Work on DQOTD</div>
                  <div className="cardSub">
                    Snapshot → Session Start → Launch Dev Server (opens
                    localhost)
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={commitPushDqotdArtifacts}
                >
                  <div className="cardTitle">
                    Commit + Push DQOTD O2 Artifacts
                  </div>
                  <div className="cardSub">
                    Commits <code>docs/_repo_snapshot.txt</code> +{" "}
                    <code>docs/_o2_repo_index.txt</code>
                  </div>
                </button>
              </div>

              <div className="hint">
                Goal: snapshot → session start → checks → start dev server, all
                from one click.
              </div>
            </>
          )}

          {tab === "roadmap" && (
            <>
              <SectionTitle>Roadmap</SectionTitle>
              <div className="placeholder">
                MVP placeholder. Next: cards from local DB (tech, legal,
                financial, status).
              </div>
            </>
          )}

          {tab === "personal" && (
            <>
              <SectionTitle>Personal</SectionTitle>
              <div className="placeholder">
                MVP placeholder. Next: encrypted local notes (not in git by
                default).
              </div>
            </>
          )}

          {tab === "intervention" && (
            <>
              <SectionTitle>Intervention</SectionTitle>

              <div className="interventionTop">
                <button
                  className="primaryBtn"
                  onClick={() =>
                    void runO2(
                      "radcontrol.session_start",
                      "O2: RadControl session start",
                    )
                  }
                  disabled={busy}
                  title="Run RadControl o2_session_start.sh"
                >
                  Session Start
                </button>

                <button
                  className="secondaryBtn"
                  onClick={() =>
                    void runO2("radcontrol.index", "O2: RadControl repo index")
                  }
                  disabled={busy}
                  title="Run RadControl o2_index_repo.sh"
                >
                  Repo Index
                </button>

                <button
                  className="secondaryBtn"
                  onClick={() =>
                    void runO2("radcontrol.snapshot", "O2: RadControl snapshot")
                  }
                  disabled={busy}
                  title="Run RadControl snapshot_repo_state.sh"
                >
                  Snapshot
                </button>

                <button
                  className="secondaryBtn"
                  onClick={() =>
                    void runO2("empire.snapshot", "O2: Empire snapshot")
                  }
                  disabled={busy}
                  title="Run ~/dev/o2/scripts/o2_empire_snapshot.sh"
                >
                  Empire Snapshot
                </button>

                <button
                  className="secondaryBtn"
                  onClick={() => void copyTextToClipboard(interventionMemo)}
                  disabled={!interventionMemo.trim() || busy}
                  title="Copy output to clipboard"
                >
                  Copy
                </button>

                <button
                  className="secondaryBtn"
                  onClick={() => setInterventionMemo("")}
                  disabled={busy}
                  title="Clear the output window"
                >
                  Clear
                </button>
              </div>

              <div className="interventionBox">
                {interventionMemo.trim()
                  ? interventionMemo
                  : "Run an O2 action above. Output appears here."}
              </div>

              <div className="hint" style={{ marginTop: 12 }}>
                Use this when we drift. Run the smallest O2 action needed to
                re-anchor.
              </div>
            </>
          )}
        </div>

        <div className="side">
          <SectionTitle>Active Ports</SectionTitle>

          <div className="portsBox">
            {PORTS.map((p) => {
              const s = ports[p];
              const listening = Boolean(s?.listening);
              const pid = s?.pid ?? null;
              const cmd = s?.command ?? null;

              return (
                <div key={p} className="portRow">
                  <div className="portLeft">
                    <div className="portName">{portLabel(p)}</div>
                    <div className="portMeta">
                      <span
                        className={`pill ${listening ? "pillOn" : "pillOff"}`}
                        title={s?.raw ? s.raw : ""}
                      >
                        {listening ? "LISTENING" : "FREE"}
                      </span>

                      <span className="portNum">:{p}</span>
                      {listening && pid ? (
                        <span className="portPid">pid {pid}</span>
                      ) : null}
                      {listening && cmd ? (
                        <span className="portCmd">{cmd}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="portRight">
                    <button
                      className="secondaryBtn"
                      onClick={() => void killAndRefresh(p)}
                      disabled={busy || portsBusy || !listening}
                      title={
                        listening
                          ? "Kill listener(s) on this port"
                          : "Nothing is listening on this port"
                      }
                    >
                      {listening ? "Kill" : "Free"}
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="portsActions">
              <button
                className="secondaryBtn"
                onClick={() => void refreshPortsBurst()}
                disabled={busy || portsBusy}
                title="Refresh port status"
              >
                {portsBusy ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <SectionTitle>Logs</SectionTitle>
          <div className="logBox">
            {busy ? "Running…" : log || "No logs yet."}
          </div>

          <div className="logActions">
            <button
              className="secondaryBtn"
              onClick={() => setLog("")}
              disabled={busy}
            >
              Clear
            </button>
            <button
              className="secondaryBtn"
              onClick={() => void copyLogsToClipboard()}
              disabled={busy || !log.trim()}
              title="Copies all Logs to clipboard"
            >
              Copy Logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
