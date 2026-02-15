import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

import { PasteAreaTab } from "./components/paste-tabs/PasteAreaTab";
import { ProjectsTab } from "./components/projects/ProjectsTab";
import { AddProjectModal } from "./components/projects/AddProjectModal";

import type {
  AddProjectPayload,
  ProjectRow,
  PortStatus,
} from "./components/projects/types";
import {
  fmtErr,
  registryToProjects,
  validateAdd,
  nextPortSuggestion,
} from "./components/projects/helpers";

type TabKey =
  | "projects"
  | "notes"
  | "legal"
  | "templates"
  | "timeline"
  | "roadmap";

function readLS(key: string, fallback = ""): string {
  try {
    const v = localStorage.getItem(key);
    return typeof v === "string" ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fallback
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
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    // ignore
  }
}

function parseRegistryMaybeDoubleEncoded(raw: string): any[] {
  const first = JSON.parse(raw);
  const reg = typeof first === "string" ? JSON.parse(first) : first;

  if (!Array.isArray(reg)) {
    throw new Error(
      `Registry parsed but was not an array (type=${typeof reg}).`,
    );
  }
  return reg;
}

function extractFirstHttpUrl(s: string): string | null {
  if (!s) return null;
  const m = s.match(/https?:\/\/localhost:\d+(?:\/[^\s]*)?/);
  return m ? m[0] : null;
}

function openByAnchor(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function tryAutoOpen(url: string) {
  // Best-effort only (may fail in browser / blocked popups)
  try {
    if (isTauri()) {
      await openUrl(url);
      return;
    }
  } catch {
    // fall through
  }

  try {
    openByAnchor(url);
  } catch {
    // ignore
  }
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [busy, setBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);

  const [log, setLog] = useState("");
  const appendLog = (s: string) =>
    setLog((prev) => (prev ? prev + "\n" + s : s));

  // 🔥 last URL (so user can click Open with a real gesture)
  const [lastUrl, setLastUrl] = useState<string | null>(null);

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
      } catch {
        // ignore
      }
    })();
  }, []);

  // --- Paste tabs persistence ---
  const storageKey = `radcontrol.${tab}`;
  const [tabValue, setTabValue] = useState<string>(() =>
    readLS(storageKey, ""),
  );

  useEffect(() => {
    setTabValue(readLS(`radcontrol.${tab}`, ""));
  }, [tab]);

  useEffect(() => {
    writeLS(storageKey, tabValue);
  }, [storageKey, tabValue]);

  // --- Registry ---
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [rawRegistry, setRawRegistry] = useState<any[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);

  async function loadRegistry() {
    try {
      const raw = await invoke<string>("radpattern_list_projects");
      const reg = parseRegistryMaybeDoubleEncoded(raw);
      setRawRegistry(reg);
      const rows = registryToProjects(reg);
      setProjects(rows);
      appendLog(`[registry] loaded ${rows.length} project(s)`);
    } catch (e) {
      appendLog("\n[registry] failed:\n" + fmtErr(e));
      setRawRegistry([]);
      setProjects([]);
    }
  }

  useEffect(() => {
    void loadRegistry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usedPorts = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      if (typeof p.port === "number") s.add(p.port);
    });
    s.add(1420);
    return s;
  }, [projects]);

  const suggestedPort = useMemo(
    () => nextPortSuggestion(usedPorts),
    [usedPorts],
  );

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
      results.forEach((r: any) => (next[r.port] = r));
      setPorts(next);
    } finally {
      setPortsBusy(false);
    }
  }

  useEffect(() => {
    void refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  async function runO2(title: string, key?: string): Promise<string | null> {
    if (!key || busy) return null;
    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await invoke<string>("run_o2", { key });
      const text = (out ?? "(no output)").toString();
      appendLog(text);
      return text;
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      return null;
    } finally {
      setBusy(false);
      void refreshPorts();
    }
  }

  async function workOnProject(p: ProjectRow) {
    if (!p || !p.o2StartKey) return;

    const out = await runO2(`Start ${p.label}`, p.o2StartKey);

    const urlFromOut = out ? extractFirstHttpUrl(out) : null;
    const fallbackUrl =
      typeof p.url === "string" && p.url.startsWith("http") ? p.url : null;

    const finalUrl = urlFromOut ?? fallbackUrl;
    if (!finalUrl) return;

    setLastUrl(finalUrl);
    void copyText(finalUrl);

    // best-effort auto open (may fail depending on context)
    try {
      await tryAutoOpen(finalUrl);
    } catch (e) {
      appendLog(`\n[opener] failed: ${fmtErr(e)}\n`);
      appendLog(`[opener] URL copied. Use "Open Last URL" button.`);
    }
  }

  async function freePort(port: number) {
    if (busy) return;
    try {
      await invoke("kill_port", { port });
    } catch (e) {
      appendLog(fmtErr(e));
    }
    void refreshPorts();
  }

  async function restartRadcontrol() {
    if (busy) return;
    setBusy(true);
    appendLog("\n[radcontrol] restart requested…");
    try {
      const out = await invoke<string>("restart_radcontrol_dev");
      appendLog(out ?? "(no output)");
    } catch (e) {
      appendLog("\n[radcontrol] restart ERROR:\n" + fmtErr(e));
    } finally {
      setBusy(false);
    }
  }

  // --- Add Project flow (UI-only; does NOT write to disk yet) ---
  async function createProject(payload: AddProjectPayload) {
    const err = validateAdd(payload, usedPorts);
    if (err) {
      appendLog(`[projects] add rejected: ${err}`);
      return;
    }

    const entry: any = {
      key: payload.key,
      label: payload.label,
      repoHint: payload.repoPath,
    };

    if (typeof payload.port === "number") entry.port = payload.port;
    if (payload.url) entry.url = payload.url;

    if (payload.o2StartKey) entry.o2StartKey = payload.o2StartKey;
    if (payload.o2SnapshotKey) entry.o2SnapshotKey = payload.o2SnapshotKey;
    if (payload.o2CommitKey) entry.o2CommitKey = payload.o2CommitKey;
    if (payload.o2MapKey) entry.o2MapKey = payload.o2MapKey;
    if (payload.o2ProofPackKey) entry.o2ProofPackKey = payload.o2ProofPackKey;

    const nextReg = Array.isArray(rawRegistry)
      ? [...rawRegistry, entry]
      : [entry];
    setRawRegistry(nextReg);
    setProjects(registryToProjects(nextReg));

    const json = JSON.stringify(entry, null, 2);
    appendLog(
      "\n[projects] NEW REGISTRY ENTRY (paste into projects.json):\n" + json,
    );
    void copyText(json);
  }

  // --- Logs controls ---
  const logsLabel = "Logs";
  const logText = (busy ? "Running…" : log || "No logs yet.").toString();

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
          {lastUrl ? (
            <button
              className="btn btnGhost"
              onClick={() => {
                // user gesture click -> guaranteed open path
                try {
                  if (isTauri()) {
                    void openUrl(lastUrl);
                  } else {
                    openByAnchor(lastUrl);
                  }
                } catch (e) {
                  appendLog(`\n[opener] failed: ${fmtErr(e)}\n`);
                  appendLog(`[opener] URL copied: ${lastUrl}`);
                  void copyText(lastUrl);
                }
              }}
              title={lastUrl}
            >
              Open Last URL
            </button>
          ) : null}

          <button
            className="btn btnGhost"
            onClick={() => refreshPorts()}
            disabled={portsBusy}
            title="Refresh port status"
          >
            Refresh
          </button>

          <button
            className="btn"
            onClick={() => restartRadcontrol()}
            disabled={busy}
            title="Restart RadControl dev (non-blocking)"
          >
            Restart RadControl
          </button>
        </div>
      </header>

      <main className="mainArea">
        {tab === "projects" ? (
          <div className="projectsWrap">
            <div className="projectsHeaderRow">
              <div className="sectionTitle">Projects</div>

              <div className="projectsHeaderRight">
                <button
                  className="btn btnPrimary"
                  onClick={() => setShowAddProject(true)}
                  disabled={busy}
                  title="Add a project (UI-only; copies JSON to clipboard)"
                >
                  New Project
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => loadRegistry()}
                  disabled={busy}
                  title="Reload projects registry"
                >
                  Reload Projects
                </button>
              </div>
            </div>

            <ProjectsTab
              projects={projects}
              ports={ports}
              busy={busy}
              portsBusy={portsBusy}
              onWorkOn={workOnProject}
              onSnapshot={(p) =>
                void runO2(`Snapshot ${p.label}`, p.o2SnapshotKey)
              }
              onCommit={(p) => void runO2(`Commit ${p.label}`, p.o2CommitKey)}
              onKill={freePort}
              onMap={(p) => void runO2(`${p.label} Map`, p.o2MapKey)}
              onProofPack={(p) =>
                void runO2(`${p.label} Proof Pack`, p.o2ProofPackKey)
              }
              statusForRow={statusForRow}
            />

            <AddProjectModal
              open={showAddProject}
              onClose={() => setShowAddProject(false)}
              onCreate={createProject}
              defaultSuggestedPort={suggestedPort}
            />
          </div>
        ) : (
          <PasteAreaTab
            title={tab}
            value={tabValue}
            onChange={setTabValue}
            storageKey={`radcontrol.${tab}`}
            placeholder={`Paste ${tab} notes here…`}
            busy={busy}
            onCopy={() => void copyText(tabValue)}
            isBundleTab={false}
            onExportBundle={() => {}}
            onImportBundle={() => {}}
          />
        )}
      </main>

      <footer className="logsBar">
        <div className="logsHeader">
          <div className="logsTitle">{logsLabel}</div>
          <div />
        </div>

        <div className="logsBoxRow">
          <div className="logsBox">{logText}</div>
          <div className="logsActionsStack">
            <button
              className="btn btnGhost"
              onClick={() => void copyText(logText)}
              disabled={logText.trim().length === 0}
            >
              Copy
            </button>
            <button
              className="btn btnGhost"
              onClick={() => setLog("")}
              disabled={busy || !log}
            >
              Clear
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
