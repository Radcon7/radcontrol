import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { EmpireMapTab } from "./components/empire-map/EmpireMapTab";

import { DocumentLibraryPanel } from "./components/paste-tabs/DocumentLibraryPanel";
import { TimelineTab } from "./components/paste-tabs/TimelineTab";
import { ProjectsTab } from "./components/projects/ProjectsTab";
import { AddProjectModal } from "./components/projects/AddProjectModal";

import { CodexChatTab } from "./components/codex/CodexChatTab";
import { CodexBuildTab } from "./components/codex/CodexBuildTab";

import { SnapshotTab } from "./components/snapshot/SnapshotTab";
import { EmpireSweepTab } from "./components/empire-sweep/EmpireSweepTab";
import GovernanceInventoryInspector from "./components/dev/GovernanceInventoryInspector";

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

type LibraryTabKey = "notes" | "legal" | "templates" | "orion_handoff";
type StreamTabKey = "timeline" | "snapshot";
type DocTabKey = LibraryTabKey | StreamTabKey;

type TabKey =
  | "projects"
  | "codex_chat"
  | "codex_build"
  | "empire_map"
  | "empire_sweep"
  | "governance"
  | DocTabKey;

type DocTabMeta = {
  key: DocTabKey;
  label: string;
  mode: "library" | "stream";
};

const DOC_TABS: DocTabMeta[] = [
  { key: "notes", label: "Notes", mode: "library" },
  { key: "legal", label: "Legal", mode: "library" },
  { key: "templates", label: "Templates", mode: "library" },
  { key: "orion_handoff", label: "Orion Handoff", mode: "library" },
  { key: "timeline", label: "Timeline", mode: "stream" },
  { key: "snapshot", label: "Snapshot", mode: "stream" },
];

const ALL_TABS: TabKey[] = [
  "projects",
  "codex_chat",
  "codex_build",
  "empire_map",
  "snapshot",
  "empire_sweep",
  "governance",
  ...DOC_TABS.filter((t) => t.key !== "snapshot").map((t) => t.key),
];

function isDocTab(t: TabKey): t is DocTabKey {
  return DOC_TABS.some((d) => d.key === t);
}

function isLibraryTab(t: TabKey): t is LibraryTabKey {
  return DOC_TABS.some((d) => d.key === t && d.mode === "library");
}

function docTabMeta(t: DocTabKey): DocTabMeta {
  const found = DOC_TABS.find((d) => d.key === t);
  if (!found) {
    throw new Error(`Unknown doc tab: ${t}`);
  }
  return found;
}

function tabLabel(t: TabKey): string {
  if (isDocTab(t)) return docTabMeta(t).label;

  const m: Record<Exclude<TabKey, DocTabKey>, string> = {
    projects: "Projects",
    codex_chat: "O2 Chat",
    codex_build: "Codex Build",
    empire_map: "Empire Map",
    empire_sweep: "Empire Sweep",
    governance: "Governance",
  };

  return m[t] ?? t.replace(/_/g, " ");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
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

function parseRegistryMaybeDoubleEncoded(raw: string): unknown[] {
  let first: unknown;
  try {
    first = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Registry response was not valid JSON: ${String(e)}`);
  }

  let reg: unknown = first;
  if (typeof first === "string") {
    try {
      reg = JSON.parse(first);
    } catch (e) {
      throw new Error(
        `Registry double-encoded JSON could not be parsed: ${String(e)}`,
      );
    }
  }

  if (!Array.isArray(reg)) {
    throw new Error(
      `Registry parsed but was not an array (type=${typeof reg}).`,
    );
  }

  return reg as unknown[];
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

type O2PortStatusJson = { port?: number; listening?: boolean };

function parsePortStatusJson(out: string, port: number): PortStatus {
  try {
    const obj = JSON.parse((out || "").trim()) as O2PortStatusJson;
    const listening = Boolean(obj?.listening);
    return { port, listening, pid: null, cmd: null, err: null };
  } catch {
    return {
      port,
      listening: false,
      pid: null,
      cmd: null,
      err: "invalid json",
    };
  }
}

function registryPortForKey(reg: unknown, key: string): number | null {
  if (!Array.isArray(reg)) return null;

  const row = reg.find(
    (r) =>
      r && typeof r === "object" && (r as Record<string, unknown>).key === key,
  ) as Record<string, unknown> | undefined;

  const port = row?.port;
  return typeof port === "number" && Number.isFinite(port) && port > 0
    ? port
    : null;
}

async function invokeText(cmd: string, payload?: Record<string, unknown>) {
  const out = (await invoke(cmd, payload ? payload : undefined)) as unknown;

  if (typeof out === "string") return out;

  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;

    if (typeof o.stdout === "string") return o.stdout;
    if (typeof o.output === "string") return o.output;

    try {
      return JSON.stringify(o);
    } catch {
      return "[unstringifiable object]";
    }
  }

  return (out ?? "").toString();
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [busy, setBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);

  const [log, setLog] = useState("");
  const appendLog = (s: string) =>
    setLog((prev) => (prev ? prev + "\n" + s : s));

  const [lastUrl, setLastUrl] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [rawRegistry, setRawRegistry] = useState<unknown[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);
  const beforeTabChangeSaverRef = useRef<(() => Promise<boolean>) | null>(null);

  const loadRegistryOnceRef = useRef(false);
  const loadRegistryInFlightRef = useRef<Promise<void> | null>(null);

  async function loadRegistry(): Promise<void> {
    if (loadRegistryInFlightRef.current) return loadRegistryInFlightRef.current;

    loadRegistryInFlightRef.current = (async () => {
      try {
        const res = (await invoke("run_o2", { verb: "list_projects" })) as {
          stdout?: string;
        };
        let raw = res?.stdout ?? "";

        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start !== -1 && end !== -1) {
          raw = raw.slice(start, end + 1);
        }
        const reg = parseRegistryMaybeDoubleEncoded(raw);

        setRawRegistry(reg);
        const rows = registryToProjects(reg);
        setProjects(rows);

        appendLog(`[registry] loaded ${rows.length} project(s)`);
      } catch (e) {
        appendLog("\n[registry] failed:\n" + fmtErr(e));
        setRawRegistry([]);
        setProjects([]);
      } finally {
        loadRegistryInFlightRef.current = null;
      }
    })();

    return loadRegistryInFlightRef.current;
  }

  useEffect(() => {
    if (loadRegistryOnceRef.current) return;
    loadRegistryOnceRef.current = true;
    void loadRegistry();
  }, []);

  const usedPorts = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      if (typeof p.port === "number") s.add(p.port);
    });

    const rcPort = registryPortForKey(rawRegistry, "radcontrol");
    if (rcPort) s.add(rcPort);

    return s;
  }, [projects, rawRegistry]);

  const suggestedPort = useMemo(
    () => nextPortSuggestion(Array.from(usedPorts)),
    [usedPorts],
  );

  const [ports, setPorts] = useState<Record<number, PortStatus | undefined>>(
    {},
  );

  const PORTS = useMemo(() => {
    const s = new Set<number>();
    projects.forEach((p) => {
      if (typeof p.port === "number") s.add(p.port);
    });

    const rcPort = registryPortForKey(rawRegistry, "radcontrol");
    if (rcPort) s.add(rcPort);

    return Array.from(s.values()).sort((a, b) => a - b);
  }, [projects, rawRegistry]);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  async function refreshPorts(): Promise<void> {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    if (portsBusy) return Promise.resolve();

    refreshInFlightRef.current = (async () => {
      setPortsBusy(true);
      try {
        const results = await Promise.all(
          PORTS.map(async (p) => {
            try {
              const out = await invokeText("run_o2", {
                verb: `port_status.${p}`,
              });
              return parsePortStatusJson(out, p);
            } catch (e) {
              return {
                port: p,
                listening: false,
                pid: null,
                cmd: null,
                err: fmtErr(e),
              } as PortStatus;
            }
          }),
        );

        const next: Record<number, PortStatus> = {};
        results.forEach((r) => {
          if (typeof r.port === "number") next[r.port] = r;
        });
        setPorts(next);
      } finally {
        setPortsBusy(false);
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }

  useEffect(() => {
    void refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, rawRegistry]);

  function statusForRow(p: ProjectRow) {
    if (typeof p.port !== "number") {
      return { pill: "pillWarn", text: "NO PORT" };
    }

    const s = ports[p.port];
    if (!s) return { pill: "pillWarn", text: "UNKNOWN" };

    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  async function runO2(title: string, key?: string): Promise<string | null> {
    if (!key || busy) return null;

    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const out = await invokeText("run_o2", { verb: key });
      const text = (out ?? "(no output)").toString();
      appendLog(text);
      return text;
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      return null;
    } finally {
      setBusy(false);
      try {
        await refreshPorts();
      } catch {
        // ignore
      }
    }
  }

  async function restartRadcontrol() {
    void runO2("Restart RadControl + Refresh Status", "radcontrol.dev_strict");
  }

  const startRecheckTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (startRecheckTimerRef.current !== null) {
        window.clearTimeout(startRecheckTimerRef.current);
      }
    };
  }, []);

  async function workOnProject(p: ProjectRow) {
    if (!p?.o2StartKey) return;

    const out = await runO2(`Start ${p.label}`, p.o2StartKey);

    const urlFromOut = out ? extractFirstHttpUrl(out) : null;
    const fallbackUrl =
      typeof p.url === "string" && p.url.startsWith("http") ? p.url : null;

    const finalUrl = urlFromOut ?? fallbackUrl;
    if (!finalUrl) return;

    setLastUrl(finalUrl);
    void copyText(finalUrl);

    if (startRecheckTimerRef.current !== null) {
      window.clearTimeout(startRecheckTimerRef.current);
    }
    startRecheckTimerRef.current = window.setTimeout(() => {
      void refreshPorts();
    }, 1200);

    try {
      await tryAutoOpen(finalUrl);
    } catch (e) {
      appendLog(`\n[opener] failed: ${fmtErr(e)}\n`);
      appendLog(`[opener] URL copied. Use "Open Last URL" button.`);
    }
  }

  async function freePort(port: number) {
    void runO2("Kill requested", `kill_port.${port}`);
  }

  async function createProject(payload: AddProjectPayload) {
    const validation = validateAdd({
      org: payload.org,
      key: payload.key,
      port: payload.port,
      url: payload.url,
      repo: payload.repoPath,
    });
    if (!validation.ok) {
      appendLog(`[projects] add rejected: ${validation.errors.join(" ")}`);
      return;
    }

    const entry: Record<string, unknown> = {
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
      "\n[projects] NEW REGISTRY ENTRY (paste into O2 projects.json):\n" + json,
    );
    void copyText(json);
  }

  const logText = (busy ? "Running…" : log || "No logs yet.").toString();

  const tabPlaceholder = (t: DocTabKey) => {
    if (t === "templates") return "Write or edit templates here…";
    if (t === "timeline") return "Timeline milestones surface...";
    if (isLibraryTab(t)) return `Write or edit ${tabLabel(t)} here…`;
    return `Type ${tabLabel(t)} here… (auto-loads latest, autosaves+commits on tab change)`;
  };

  function registerBeforeTabChangeSaver(fn: (() => Promise<boolean>) | null) {
    beforeTabChangeSaverRef.current = fn;
  }

  async function requestTabChange(nextTab: TabKey): Promise<void> {
    if (nextTab === tab) return;

    if (isLibraryTab(tab)) {
      const saver = beforeTabChangeSaverRef.current;
      if (saver) {
        try {
          const ok = await saver();
          if (!ok) return;
        } catch {
          return;
        }
      }
    }

    setTab(nextTab);
  }

  function renderDocTab(activeTab: DocTabKey) {
    if (isLibraryTab(activeTab)) {
      return (
        <DocumentLibraryPanel
          tabKey={activeTab}
          title={tabLabel(activeTab)}
          placeholder={tabPlaceholder(activeTab)}
          busy={busy}
          registerBeforeTabChangeSaver={registerBeforeTabChangeSaver}
        />
      );
    }

    if (activeTab === "timeline") {
      return <TimelineTab />;
    }

    if (activeTab === "snapshot") {
      return <SnapshotTab title={tabLabel(activeTab)} />;
    }

    return null;
  }

  return (
    <div className="appShell">
      <header className="header">
        <div className="brand">RadControl</div>

        <div className="tabs" style={{ flex: 1, minWidth: 0 }}>
          {ALL_TABS.map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "tabActive" : ""}`}
              onClick={() => void requestTabChange(t)}
              title={tabLabel(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        <div className="headerRight">
          {lastUrl ? (
            <button
              className="btn btnGhost"
              onClick={() => {
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
            className="btn"
            onClick={() => void restartRadcontrol()}
            disabled={busy}
            title="Restart RadControl (dev_strict) and refresh project status. Does not start/open projects."
          >
            Restart + Refresh Status
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
                  onClick={() => void loadRegistry()}
                  disabled={busy}
                  title="Reload projects registry"
                >
                  Reload Projects
                </button>
                <button
                  className="btn btnGhost"
                  onClick={() => void refreshPorts()}
                  disabled={portsBusy}
                  title="Refresh port status"
                >
                  Refresh Ports
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
        ) : tab === "codex_chat" ? (
          <CodexChatTab />
        ) : tab === "codex_build" ? (
          <CodexBuildTab />
        ) : tab === "empire_map" ? (
          <EmpireMapTab />
        ) : tab === "empire_sweep" ? (
          <EmpireSweepTab />
        ) : tab === "governance" ? (
          <GovernanceInventoryInspector />
        ) : isDocTab(tab) ? (
          renderDocTab(tab)
        ) : null}
      </main>

      <footer className="logsBar">
        <div className="logsHeader">
          <div className="logsTitle">Logs</div>
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
