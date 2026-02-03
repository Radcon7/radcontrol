import { useMemo, useState } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";

type TabKey = "chat" | "projects" | "roadmap" | "personal";

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

  const headerSubtitle = useMemo(() => {
    if (tab === "chat") return "Chat + Session Notes";
    if (tab === "projects") return "Start sessions the same way every time";
    if (tab === "roadmap") return "Empire dashboard (MVP placeholder)";
    return "Personal vault (MVP placeholder)";
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
        {
          who: "o2",
          text: "DQOTD session started. Dev server launched in a new terminal.",
        },
      ]);
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
        {
          who: "o2",
          text: "TBIS session started. Dev server launched in a new terminal.",
        },
      ]);
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
    }
  }

  async function copyLogsToClipboard() {
    const text = log ?? "";
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      setChat((c) => [...c, { who: "o2", text: "Logs copied to clipboard." }]);
    } catch {
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
            text: ok
              ? "Logs copied to clipboard."
              : "Copy failed (clipboard denied).",
          },
        ]);
      } catch {
        setChat((c) => [
          ...c,
          { who: "o2", text: "Copy failed (clipboard denied)." },
        ]);
      }
    }
  }

  function sendChat() {
    const t = chatInput.trim();
    if (!t) return;
    setChat((c) => [...c, { who: "me" as const, text: t }]);
    setChatInput("");
    setTimeout(() => {
      setChat((c) => [
        ...c,
        {
          who: "o2",
          text: "Logged. Next: Projects buttons will run O2 routines and dev servers.",
        },
      ]);
    }, 150);
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
                {/* Row 1 */}
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
                  disabled
                  title="Reserved for a future empire-level button"
                >
                  <div className="cardTitle">Reserved Slot</div>
                  <div className="cardSub">Future button (TBD)</div>
                </button>

                {/* Row 2 */}
                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={workOnTbis}
                >
                  <div className="cardTitle">Work on TBIS</div>
                  <div className="cardSub">
                    Snapshot → Session Start → Launch Dev Server
                  </div>
                </button>

                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={commitPushTbisArtifacts}
                >
                  <div className="cardTitle">Commit + Push TBIS Artifacts</div>
                  <div className="cardSub">
                    Commits <code>docs/_repo_snapshot.txt</code> +{" "}
                    <code>docs/_o2_repo_index.txt</code>
                  </div>
                </button>

                {/* Row 3 */}
                <button
                  className="cardBtn"
                  disabled={busy}
                  onClick={workOnDqotd}
                >
                  <div className="cardTitle">Work on DQOTD</div>
                  <div className="cardSub">
                    Snapshot → Session Start → Launch Dev Server
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
        </div>

        <div className="side">
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
