import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";

import { PasteAreaTab } from "./components/paste-tabs/PasteAreaTab";
import type { ProjectRow } from "./components/projects/types";
import { fmtErr, registryToProjects } from "./components/projects/helpers";

type TabKey = "roadmap" | "notes" | "codex_chat" | "codex_build" | "snapshot";
type TextTabKey = Exclude<TabKey, "snapshot">;

type RunO2Result = {
  ok: boolean;
  stdout: string;
  stderr?: string;
  code?: number;
};

const TAB_ORDER: TabKey[] = [
  "roadmap",
  "notes",
  "codex_chat",
  "codex_build",
  "snapshot",
];

const TAB_LABELS: Record<TabKey, string> = {
  roadmap: "Road Map",
  notes: "Notes",
  codex_chat: "Codex Chat",
  codex_build: "Codex Build",
  snapshot: "Snapshot",
};

const TEXT_TAB_CONFIG: Record<
  TextTabKey,
  { docsKey: string; placeholder: string }
> = {
  roadmap: {
    docsKey: "roadmap",
    placeholder: "Road map content (saved via O2 docs)",
  },
  notes: {
    docsKey: "notes",
    placeholder: "Notes content (saved via O2 docs)",
  },
  codex_chat: {
    docsKey: "codex_chat",
    placeholder: "Codex chat content (saved via O2 docs)",
  },
  codex_build: {
    docsKey: "codex_build",
    placeholder: "Codex build content (saved via O2 docs)",
  },
};

function parseRegistryMaybeDoubleEncoded(raw: string): unknown[] {
  let first: unknown;
  try {
    first = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Registry response was not valid JSON: ${String(e)}`);
  }

  let parsed: unknown = first;
  if (typeof first === "string") {
    try {
      parsed = JSON.parse(first);
    } catch (e) {
      throw new Error(`Registry double-encoded JSON parse failed: ${String(e)}`);
    }
  }

  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.projects)) return obj.projects as unknown[];
    if (obj.ok === false) {
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        "list_projects returned error";
      throw new Error(msg);
    }
  }

  throw new Error("Registry payload had no array");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

async function invokeRunO2(verb: string, stdin?: string): Promise<RunO2Result> {
  const raw = (await invoke("run_o2", {
    verb,
    stdin: stdin ?? null,
  })) as unknown;
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

async function runO2Text(verb: string): Promise<string> {
  const r = await invokeRunO2(verb);
  if (!r.ok) {
    throw new Error(r.stderr?.trim() || `run_o2 failed for verb=${verb}`);
  }
  return r.stdout;
}

function nowStamp(): string {
  return new Date().toISOString();
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("roadmap");

  const [textBusy, setTextBusy] = useState(false);
  const [textValues, setTextValues] = useState<Record<TextTabKey, string>>({
    roadmap: "",
    notes: "",
    codex_chat: "",
    codex_build: "",
  });
  const [textLoaded, setTextLoaded] = useState<Record<TextTabKey, boolean>>({
    roadmap: false,
    notes: false,
    codex_chat: false,
    codex_build: false,
  });
  const [textStatus, setTextStatus] = useState<Record<TextTabKey, string>>({
    roadmap: "",
    notes: "",
    codex_chat: "",
    codex_build: "",
  });

  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProjectKey, setSelectedProjectKey] = useState("");
  const [snapshotOutput, setSnapshotOutput] = useState("");
  const [snapshotStatus, setSnapshotStatus] = useState("");

  const [log, setLog] = useState("");
  const appendLog = (s: string) => {
    setLog((prev) => (prev ? `${prev}\n${s}` : s));
  };

  const selectedProject = useMemo(
    () => projects.find((p) => p.key === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  );

  async function loadDoc(tabKey: TextTabKey) {
    const cfg = TEXT_TAB_CONFIG[tabKey];
    setTextBusy(true);
    try {
      const value = await runO2Text(`o2.docs_get.${cfg.docsKey}`);
      setTextValues((prev) => ({ ...prev, [tabKey]: value }));
      setTextLoaded((prev) => ({ ...prev, [tabKey]: true }));
      setTextStatus((prev) => ({ ...prev, [tabKey]: `Loaded ${nowStamp()}` }));
      appendLog(`[docs_get] ${cfg.docsKey} loaded`);
    } catch (e) {
      setTextStatus((prev) => ({
        ...prev,
        [tabKey]: `Load failed: ${fmtErr(e)}`,
      }));
      appendLog(`[docs_get] ${cfg.docsKey} failed: ${fmtErr(e)}`);
    } finally {
      setTextBusy(false);
    }
  }

  async function saveDoc(tabKey: TextTabKey) {
    const cfg = TEXT_TAB_CONFIG[tabKey];
    setTextBusy(true);
    try {
      const r = await invokeRunO2(
        `o2.docs_set.${cfg.docsKey}`,
        textValues[tabKey] ?? "",
      );
      if (!r.ok) {
        throw new Error(r.stderr?.trim() || `docs_set failed: ${cfg.docsKey}`);
      }
      setTextStatus((prev) => ({ ...prev, [tabKey]: `Saved ${nowStamp()}` }));
      appendLog(`[docs_set] ${cfg.docsKey} saved`);
    } catch (e) {
      setTextStatus((prev) => ({
        ...prev,
        [tabKey]: `Save failed: ${fmtErr(e)}`,
      }));
      appendLog(`[docs_set] ${cfg.docsKey} failed: ${fmtErr(e)}`);
    } finally {
      setTextBusy(false);
    }
  }

  async function loadProjects() {
    setSnapshotBusy(true);
    try {
      const raw = await runO2Text("list_projects");
      const reg = parseRegistryMaybeDoubleEncoded(raw);
      const rows = registryToProjects(reg);
      setProjects(rows);

      if (!selectedProjectKey || !rows.find((r) => r.key === selectedProjectKey)) {
        setSelectedProjectKey(rows[0]?.key ?? "");
      }
      setSnapshotStatus(`Projects loaded ${nowStamp()}`);
      appendLog(`[snapshot] loaded ${rows.length} project(s)`);
    } catch (e) {
      setSnapshotStatus(`Project load failed: ${fmtErr(e)}`);
      appendLog(`[snapshot] project load failed: ${fmtErr(e)}`);
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function runSnapshotVerb(label: string, verb?: string) {
    if (!verb) return;
    setSnapshotBusy(true);
    appendLog(`[snapshot] run_o2("${verb}")`);
    try {
      const r = await invokeRunO2(verb);
      const out = [
        `[${label}] verb=${verb}`,
        "",
        "[stdout]",
        (r.stdout ?? "").trimEnd() || "(empty)",
        "",
        "[stderr]",
        (r.stderr ?? "").trimEnd() || "(empty)",
        "",
        `[exit] ok=${String(r.ok)} code=${String(r.code ?? "")}`,
      ].join("\n");

      setSnapshotOutput(out);
      setSnapshotStatus(`${label} finished ${nowStamp()}`);
      appendLog(out);
      if (!r.ok) {
        throw new Error(r.stderr?.trim() || `${label} failed`);
      }
    } catch (e) {
      setSnapshotStatus(`${label} failed: ${fmtErr(e)}`);
      appendLog(`[snapshot] ${label} failed: ${fmtErr(e)}`);
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function appendOutputToSnapshotLog() {
    if (!snapshotOutput.trim()) {
      setSnapshotStatus("No output to append");
      return;
    }

    setSnapshotBusy(true);
    try {
      const current = await runO2Text("o2.docs_get.snapshot_log");
      const headerProject = selectedProject?.key ?? "unknown";
      const entry =
        `## ${nowStamp()} [${headerProject}]\n\n` +
        "```text\n" +
        `${snapshotOutput.trimEnd()}\n` +
        "```\n";

      const next = current.trim().length > 0
        ? `${current.trimEnd()}\n\n${entry}`
        : entry;

      const r = await invokeRunO2("o2.docs_set.snapshot_log", next);
      if (!r.ok) {
        throw new Error(r.stderr?.trim() || "snapshot_log append failed");
      }

      setSnapshotStatus(`Snapshot Log updated ${nowStamp()}`);
      appendLog("[snapshot_log] append complete");
    } catch (e) {
      setSnapshotStatus(`Snapshot Log append failed: ${fmtErr(e)}`);
      appendLog(`[snapshot_log] append failed: ${fmtErr(e)}`);
    } finally {
      setSnapshotBusy(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (tab === "snapshot") return;
    const t = tab as TextTabKey;
    if (!textLoaded[t]) {
      void loadDoc(t);
    }
  }, [tab, textLoaded]);

  const snapshotActions = selectedProject
    ? [
        { label: "Snapshot", verb: selectedProject.o2SnapshotKey },
        { label: "Map", verb: selectedProject.o2MapKey },
        { label: "ProofPack", verb: selectedProject.o2ProofPackKey },
      ].filter((a) => typeof a.verb === "string" && a.verb.length > 0)
    : [];

  return (
    <div className="appShell">
      <header className="header">
        <div className="brand">RadControl</div>

        <div className="tabs">
          {TAB_ORDER.map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "tabActive" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </header>

      <main className="mainArea">
        {tab === "snapshot" ? (
          <div className="placeholderTab">
            <div className="sectionTitle">Snapshot</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="btn btnGhost"
                onClick={() => void loadProjects()}
                disabled={snapshotBusy}
              >
                Reload Projects
              </button>

              <select
                value={selectedProjectKey}
                onChange={(e) => setSelectedProjectKey(e.target.value)}
                disabled={snapshotBusy || projects.length === 0}
                className="btn btnGhost"
                style={{ minWidth: 240 }}
              >
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>

              {snapshotActions.map((a) => (
                <button
                  key={a.label}
                  className="btn btnPrimary"
                  onClick={() => void runSnapshotVerb(a.label, a.verb)}
                  disabled={snapshotBusy}
                >
                  {a.label}
                </button>
              ))}

              <button
                className="btn btnGhost"
                onClick={() => void appendOutputToSnapshotLog()}
                disabled={snapshotBusy || snapshotOutput.trim().length === 0}
                title="Append current output to O2 docs/snapshot log"
              >
                Append output to Snapshot Log
              </button>

              <button
                className="btn btnGhost"
                onClick={() => void copyText(snapshotOutput)}
                disabled={snapshotOutput.trim().length === 0}
              >
                Copy Output
              </button>
            </div>

            <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>{snapshotStatus}</div>

            <div style={{ marginTop: 12 }}>
              <textarea
                value={snapshotOutput}
                onChange={(e) => setSnapshotOutput(e.target.value)}
                placeholder="Snapshot/Map/ProofPack output appears here"
                style={{
                  width: "100%",
                  minHeight: "52vh",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.92)",
                  resize: "vertical",
                  outline: "none",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  lineHeight: 1.4,
                }}
                disabled={snapshotBusy}
              />
            </div>
          </div>
        ) : (
          <PasteAreaTab
            title={TAB_LABELS[tab]}
            value={textValues[tab as TextTabKey]}
            onChange={(v) =>
              setTextValues((prev) => ({ ...prev, [tab as TextTabKey]: v }))
            }
            placeholder={TEXT_TAB_CONFIG[tab as TextTabKey].placeholder}
            busy={textBusy}
            onCopy={(text) => void copyText(text)}
            onSave={() => void saveDoc(tab as TextTabKey)}
            statusText={textStatus[tab as TextTabKey]}
          />
        )}
      </main>

      <footer className="logsBar">
        <div className="logsHeader">
          <div className="logsTitle">Logs</div>
          <div />
        </div>

        <div className="logsBoxRow">
          <div className="logsBox">{log || "No logs yet."}</div>
          <div className="logsActionsStack">
            <button
              className="btn btnGhost"
              onClick={() => void copyText(log)}
              disabled={log.trim().length === 0}
            >
              Copy
            </button>
            <button className="btn btnGhost" onClick={() => setLog("")}>
              Clear
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
