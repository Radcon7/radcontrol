import { useEffect, useMemo, useRef, useState } from "react";
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

function parseRegistryMaybeDoubleEncoded(raw: string): unknown[] {
  let first: unknown;
  try {
    first = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Registry response was not valid JSON: ${String(e)}`);
  }

  // Handle double-encoded JSON string.
  let parsed: unknown = first;
  if (typeof first === "string") {
    try {
      parsed = JSON.parse(first);
    } catch (e) {
      throw new Error(
        `Registry double-encoded JSON could not be parsed: ${String(e)}`,
      );
    }
  }

  // Accept direct array.
  if (Array.isArray(parsed)) return parsed as unknown[];

  // Accept envelope: { ok:true, projects:[...] } or { ok:false, ... }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const ok = obj.ok;

    if (ok === false) {
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        "list_projects returned error";
      throw new Error(msg);
    }

    const projects = obj.projects;
    if (Array.isArray(projects)) return projects as unknown[];

    if (ok === true) {
      throw new Error("Registry parsed but had no projects array.");
    }
  }

  throw new Error(
    `Registry parsed but was not an array (type=${typeof parsed}).`,
  );
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

// O2 port_status.<port> returns JSON like: {"port":3000,"listening":true}
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
    (r): r is { key?: unknown; port?: unknown } =>
      Boolean(r) && typeof r === "object" && (r as { key?: unknown }).key === key,
  );
  const port = row?.port;
  return typeof port === "number" && Number.isFinite(port) && port > 0
    ? port
    : null;
}

async function invokeText(cmd: string, payload?: Record<string, unknown>) {
  const out = (await invoke(cmd, payload ? payload : undefined)) as unknown;

  // Most commands return plain string. run_o2 returns RunO2Result object.
  if (typeof out === "string") return out;

  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;

    // Prefer stdout when present (RunO2Result)
    if (typeof o.stdout === "string") return o.stdout;

    // Some commands may return { output: "..." } or similar
    if (typeof o.output === "string") return o.output;

    // Last resort: stringify objects so callers can parse deterministically
    try {
      return JSON.stringify(o);
    } catch {
      return "[unstringifiable object]";
    }
  }

  return (out ?? "").toString();
}

type RunO2Result = {
  ok: boolean;
  stdout: string;
  stderr?: string;
  code?: number;
};

async function invokeRunO2(verb: string): Promise<RunO2Result> {
  const raw = (await invoke("run_o2", { verb })) as unknown;
  const r = raw as Partial<RunO2Result>;

  if (!r || typeof r.ok !== "boolean" || typeof r.stdout !== "string") {
    throw new Error(`run_o2 returned unexpected shape for verb=${verb}`);
  }

  return {
    ok: r.ok,
    stdout: r.stdout,
    stderr: typeof r.stderr === "string" ? r.stderr : "",
    code: typeof r.code === "number" ? r.code : undefined,
  };
}

function encodeBase64UrlJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function runO2Text(verb: string): Promise<string> {
  const r = await invokeRunO2(verb);

  if (!r.ok) {
    const msg = (r.stderr && r.stderr.trim()) || `run_o2 failed for verb=${verb}`;
    throw new Error(msg);
  }

  return r.stdout;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("projects");
  const [busy, setBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);

  const [log, setLog] = useState("");
  const appendLog = (s: string) =>
    setLog((prev) => (prev ? prev + "\n" + s : s));

  const [lastUrl, setLastUrl] = useState<string | null>(null);

  // --- Window sizing ---
  useEffect(() => {
    void (async () => {
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
  const [tabValue, setTabValue] = useState<string>(() =>
    readLS(`radcontrol.${tab}`, ""),
  );

  useEffect(() => {
    setTabValue(readLS(`radcontrol.${tab}`, ""));
  }, [tab]);

  useEffect(() => {
    writeLS(`radcontrol.${tab}`, tabValue);
  }, [tab, tabValue]);

  // --- Registry ---
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [rawRegistry, setRawRegistry] = useState<unknown[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);

  const loadRegistryOnceRef = useRef(false);
  const loadRegistryInFlightRef = useRef<Promise<void> | null>(null);

  async function loadRegistry(): Promise<void> {
    if (loadRegistryInFlightRef.current) return loadRegistryInFlightRef.current;

    loadRegistryInFlightRef.current = (async () => {
      try {
        const raw = await runO2Text("list_projects");
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

  // --- Ports ---
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

  // Coalesce refresh calls deterministically.
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
    if (typeof p.port !== "number")
      return { pill: "pillWarn", text: "NO PORT" };

    const s = ports[p.port];
    if (!s) return { pill: "pillWarn", text: "UNKNOWN" };

    return s.listening
      ? { pill: "pillOn", text: "RUNNING" }
      : { pill: "pillOff", text: "STOPPED" };
  }

  // --- O2 ---
  async function runO2(
    title: string,
    key?: string,
    opts?: { rethrow?: boolean; refreshPorts?: boolean },
  ): Promise<string | null> {
    if (!key || busy) return null;

    setBusy(true);
    appendLog(`\n[o2] ${title} → run_o2("${key}")\n`);
    try {
      const r = await invokeRunO2(key);
      const text = (r.stdout ?? "").toString();
      appendLog(text || "(no output)");
      if (r.stderr) appendLog(r.stderr);
      if (!r.ok) {
        throw new Error(r.stderr?.trim() || `run_o2 failed for verb=${key}`);
      }
      return text;
    } catch (e) {
      appendLog("\n[o2] ERROR:\n" + fmtErr(e));
      if (opts?.rethrow) throw e;
      return null;
    } finally {
      setBusy(false);
      if (opts?.refreshPorts !== false) {
        try {
          await refreshPorts();
        } catch {
          // ignore
        }
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

    // Post-start recheck: the port may begin listening shortly AFTER the start returns.
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
    const body: Record<string, unknown> = {
      name: payload.name,
      slug: payload.slug,
      essay: payload.essay,
    };
    if (payload.templateHint) body.templateHint = payload.templateHint;

    const token = encodeBase64UrlJson(body);
    const verb = `project_create.plan.${token}`;
    await runO2("Project Create Plan", verb, {
      rethrow: true,
      refreshPorts: false,
    });
  }

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
            onClick={() => void refreshPorts()}
            disabled={portsBusy}
            title="Refresh port status"
          >
            Refresh
          </button>

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
                  title="Send a project-create plan request to O2 (no local writes)"
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
