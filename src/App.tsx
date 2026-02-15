import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

import { PasteAreaTab } from "./components/paste-tabs/PasteAreaTab";
import { ProjectsTab } from "./components/projects/ProjectsTab";

import { ProjectRow, PortStatus } from "./components/projects/types";

import { fmtErr, registryToProjects } from "./components/projects/helpers";

type TabKey =
  | "projects"
  | "notes"
  | "legal"
  | "templates"
  | "timeline"
  | "roadmap";

type LogMsg = { who: "me" | "o2"; text: string };

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [busy, setBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);

  const [_chat] = useState<LogMsg[]>([
    { who: "o2", text: "RadControl online. Start a session from Projects." },
  ]);

  const [log, setLog] = useState("");
  const appendLog = (s: string) =>
    setLog((prev) => (prev ? prev + "\n" + s : s));

  // --- Window sizing ---
  useEffect(() => {
    (async () => {
      try {
        const win = getCurrentWindow();
        const size = await win.innerSize();
        const targetW = 1480;
        const targetH = 900;
        if (size.width < targetW || size.height < targetH) {
          await win.setSize(
            new LogicalSize(
              Math.max(size.width, targetW),
              Math.max(size.height, targetH),
            ),
          );
        }
      } catch {}
    })();
  }, []);

  // --- Registry ---
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await invoke<string>("radpattern_list_projects");
        const reg = JSON.parse(raw);
        const rows = registryToProjects(reg);
        setProjects(rows);
      } catch (e) {
        appendLog("\n[registry] failed:\n" + fmtErr(e));
        setProjects([]);
      }
    })();
  }, []);

  // --- Ports ---
  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  const PORTS = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      if (typeof p.port === "number") s.add(p.port);
    });
    s.add(1420);
    return Array.from(s.values()).sort((a, b) => a - b);
  }, [projects]);

  async function refreshPorts() {
    if (portsBusy) return;
    setPortsBusy(true);
    try {
      const results = await Promise.all(
        PORTS.map((p) =>
          invoke<PortStatus>("port_status", { port: p }).catch((e) => ({
            port: p,
            listening: false,
            pid: null,
            cmd: null,
            err: fmtErr(e),
          })),
        ),
      );

      const next: Record<number, PortStatus> = {};
      results.forEach((r) => (next[r.port] = r));
      setPorts(next);
    } finally {
      setPortsBusy(false);
    }
  }

  useEffect(() => {
    refreshPorts();
  }, [projects]);

  function statusForRow(p: ProjectRow) {
    if (typeof p.port !== "number") return { pill: "pillOff", text: "READY" };

    const s = ports[p.port];
    if (!s) return { pill: "pillWarn", text: "UNKNOWN" };

    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  // --- O2 ---
  async function runO2(title: string, key?: string) {
    if (!key || busy) return;
    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await invoke<string>("run_o2", { key });
      appendLog(out ?? "(no output)");
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
    } finally {
      setBusy(false);
      refreshPorts();
    }
  }

  async function workOnProject(p: ProjectRow) {
    if (!p) return;
    if (p.o2StartKey) {
      await runO2(`Start ${p.label}`, p.o2StartKey);
    }
  }

  async function freePort(port: number) {
    if (busy) return;
    try {
      await invoke("kill_port", { port });
    } catch (e) {
      appendLog(fmtErr(e));
    }
    refreshPorts();
  }

  // --- Render ---
  return (
    <div className="appShell">
      <header className="header">
        <div className="brand">RadControl</div>

        <div className="tabs">
          {(
            [
              "projects",
              "notes",
              "legal",
              "templates",
              "timeline",
              "roadmap",
            ] as TabKey[]
          ).map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "tabActive" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="headerRight">
          <button
            className="btn btnGhost"
            onClick={() => refreshPorts()}
            disabled={portsBusy}
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="mainArea">
        {tab === "projects" ? (
          <ProjectsTab
            projects={projects}
            ports={ports}
            busy={busy}
            portsBusy={portsBusy}
            onWorkOn={workOnProject}
            onSnapshot={(p) => runO2(`Snapshot ${p.label}`, p.o2SnapshotKey)}
            onCommit={(p) => runO2(`Commit ${p.label}`, p.o2CommitKey)}
            onKill={freePort}
            onMap={(p) => runO2(`${p.label} Map`, p.o2MapKey)}
            onProofPack={(p) =>
              runO2(`${p.label} Proof Pack`, p.o2ProofPackKey)
            }
            statusForRow={statusForRow}
          />
        ) : (
          <PasteAreaTab
            title={tab}
            value=""
            onChange={() => {}}
            storageKey={`radcontrol.${tab}`}
            placeholder="..."
            busy={busy}
            onCopy={() => {}}
            isBundleTab={false}
            onExportBundle={() => {}}
            onImportBundle={() => {}}
          />
        )}
      </main>

      <footer className="logsBar">
        <div className="logsBox">
          {busy ? "Running…" : log || "No logs yet."}
        </div>
      </footer>
    </div>
  );
}
