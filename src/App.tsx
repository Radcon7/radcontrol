import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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

const PORTS = [1420, 3000, 3001, 3002] as const;

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`tab ${active ? "tabActive" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
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

  // If a refresh is requested while one is running, queue one more.
  const portsRefreshQueuedRef = useRef(false);

  const headerSubtitle = useMemo(() => {
    if (tab === "chat") return "Chat + Session Notes";
    if (tab === "projects") return "Start sessions the same way every time";
    if (tab === "roadmap") return "Empire dashboard (MVP placeholder)";
    if (tab === "personal") return "Personal vault (MVP placeholder)";
    return "O2 control panel: no drift, no surprises";
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
     O2 actions (whitelist runner)
     ========================= */

  async function runO2Single(key: string) {
    return await invoke<string>("run_o2", { key });
  }

  async function runO2(key: string, title: string) {
    if (busy) return;
    setBusy(true);
    resetRunLog(title);

    try {
      appendLog(`\nRunning: ${key}`);
      const out = await runO2Single(key);
      appendLog("\n--- output ---\n" + out.trim());
      appendLog(`\nDone: ${nowStamp()}`);
      setChat((c) => [
        ...c,
        { who: "o2", text: `${title} complete. Output is in Logs.` },
      ]);
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
        { who: "o2", text: `${title} failed. Check Logs.` },
      ]);
    } finally {
      setBusy(false);
      refreshPortsBurst();
    }
  }

  async function runO2Flow(keys: string[], title: string) {
    if (busy) return;
    setBusy(true);
    resetRunLog(title);

    try {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        appendLog(`\n[${i + 1}/${keys.length}] Running: ${key}`);
        const out = await runO2Single(key);
        appendLog("\n--- output ---\n" + out.trim());
      }

      appendLog(`\nDone: ${nowStamp()}`);
      setChat((c) => [
        ...c,
        { who: "o2", text: `${title} complete. Output is in Logs.` },
      ]);
    } catch (e) {
      appendLog("\nERROR:\n" + fmtErr(e));
      setChat((c) => [
        ...c,
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
    if (p === 3002) return "Offroad Croquet";
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
                    className={`chatLine ${
                      m.who === "me" ? "chatMe" : "chatO2"
                    }`}
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
                  onClick={() =>
                    void runO2("empire.snapshot", "O2: Empire snapshot")
                  }
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
                  onClick={() =>
                    void runO2Flow(
                      ["empire.snapshot", "tbis.session_start"],
                      "O2: Start TBIS session",
                    )
                  }
                >
                  <div className="cardTitle">Start TBIS Session</div>
                  <div className="cardSub">
                    Empire snapshot → TBIS session start (deterministic)
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={() =>
                    void runO2("tbis.snapshot", "O2: TBIS snapshot")
                  }
                >
                  <div className="cardTitle">TBIS Snapshot</div>
                  <div className="cardSub">
                    Runs TBIS <code>scripts/snapshot_repo_state.sh</code>
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={() =>
                    void runO2("tbis.index", "O2: TBIS repo index")
                  }
                >
                  <div className="cardTitle">TBIS Repo Index</div>
                  <div className="cardSub">
                    Runs TBIS <code>scripts/o2_index_repo.sh</code>
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={() =>
                    void runO2Flow(
                      ["empire.snapshot", "dqotd.session_start"],
                      "O2: Start DQOTD session",
                    )
                  }
                >
                  <div className="cardTitle">Start DQOTD Session</div>
                  <div className="cardSub">
                    Empire snapshot → DQOTD session start (deterministic)
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={() =>
                    void runO2("dqotd.snapshot", "O2: DQOTD snapshot")
                  }
                >
                  <div className="cardTitle">DQOTD Snapshot</div>
                  <div className="cardSub">
                    Runs DQOTD <code>scripts/snapshot_repo_state.sh</code>
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={() =>
                    void runO2("dqotd.index", "O2: DQOTD repo index")
                  }
                >
                  <div className="cardTitle">DQOTD Repo Index</div>
                  <div className="cardSub">
                    Runs DQOTD <code>scripts/o2_index_repo.sh</code>
                  </div>
                </button>
              </div>

              <div className="hint">
                Goal: everything shell-adjacent routes through{" "}
                <code>run_o2</code> keys (Rust whitelist). No drift.
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

              <div className="hint" style={{ marginBottom: 12 }}>
                Buttons only. Deterministic. If you feel drift, run one of these
                and read Logs.
              </div>

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
              </div>

              <div className="hint" style={{ marginTop: 12 }}>
                Note: Intervention uses the Rust whitelist runner{" "}
                <code>run_o2</code>. No freeform shell.
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
