import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import { SystemStateShell } from "../common/SystemStateShell";
import {
  formatMaybeUnixTime,
  type FilesListItem,
} from "../common/useArtifactStore";
import type { ProjectRow } from "../projects/types";

type RunO2Result = {
  ok?: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
};

type FilesListJson = {
  ok?: boolean;
  items?: FilesListItem[];
  error?: string;
};

type FilesReadJson = {
  ok?: boolean;
  content?: string;
  path?: string;
  error?: string;
  mtime?: number;
};

type CreateAgentRunJson = {
  ok?: boolean;
  runId?: string;
  originArtifactPath?: string;
  error?: string;
};

type Props = {
  projects: ProjectRow[];
};

const RUNS_DIR = "docs/agent-runs";
const DEFAULT_CONTEXT_ARTIFACT =
  "docs/radcontrol/notes/radcontrol_transition_blueprint_20260724.md";

function b64urlEncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function errMsg(res: RunO2Result, fallback: string): string {
  return (res.stderr || "").trim() || fallback;
}

function isOriginArtifact(item: FilesListItem): boolean {
  const path = item.path || "";
  return path.startsWith(`${RUNS_DIR}/`) && path.endsWith("/00_origin.md");
}

function sortNewest(items: FilesListItem[]) {
  return [...items].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

export function AgentRunsTab({ projects }: Props) {
  const [items, setItems] = useState<FilesListItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [currentMtime, setCurrentMtime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const [title, setTitle] = useState("Launch readiness review");
  const [targetType, setTargetType] = useState("project");
  const [targetKey, setTargetKey] = useState(projects[0]?.key || "dqotd");
  const [requestedTask, setRequestedTask] = useState(
    "Review current state, identify blockers, and produce the next recommended steps.",
  );
  const [operatorIntent, setOperatorIntent] = useState(
    "Create a governed agent run record before execution so progress is trackable in RadControl.",
  );
  const [requestedBy, setRequestedBy] = useState("chris");
  const [agentType, setAgentType] = useState("codex");
  const [requestedMode, setRequestedMode] = useState("read-only");
  const [approvalRequirement, setApprovalRequirement] = useState("none");
  const [contextArtifact, setContextArtifact] = useState(DEFAULT_CONTEXT_ARTIFACT);

  const listVerb = useMemo(
    () => `files.list.${b64urlEncodeUtf8(RUNS_DIR)}`,
    [],
  );

  const runOrigins = useMemo(
    () => sortNewest(items.filter(isOriginArtifact)),
    [items],
  );

  async function readPath(path: string): Promise<void> {
    const res = (await invoke("run_o2", {
      verb: `files.read.${b64urlEncodeUtf8(path)}`,
    })) as RunO2Result;

    if (!res.ok) {
      throw new Error(errMsg(res, "files.read failed"));
    }

    let parsed: FilesReadJson;
    try {
      parsed = JSON.parse((res.stdout || "").trim()) as FilesReadJson;
    } catch {
      throw new Error("files.read returned invalid JSON");
    }

    if (!parsed.ok) {
      throw new Error(parsed.error || "files.read returned error");
    }

    setCurrentPath(path);
    setCurrentText(parsed.content || "");
    setCurrentMtime(parsed.mtime || null);
  }

  async function refreshList(preferredPath?: string | null): Promise<void> {
    setLoading(true);
    setErr("");

    try {
      const res = (await invoke("run_o2", { verb: listVerb })) as RunO2Result;
      if (!res.ok) {
        throw new Error(errMsg(res, "files.list failed"));
      }

      let parsed: FilesListJson;
      try {
        parsed = JSON.parse((res.stdout || "").trim()) as FilesListJson;
      } catch {
        throw new Error("files.list returned invalid JSON");
      }

      if (!parsed.ok) {
        throw new Error(parsed.error || "files.list returned error");
      }

      const nextItems = parsed.items || [];
      const nextOrigins = sortNewest(nextItems.filter(isOriginArtifact));
      setItems(nextItems);

      const nextPath =
        preferredPath && nextOrigins.some((item) => item.path === preferredPath)
          ? preferredPath
          : currentPath && nextOrigins.some((item) => item.path === currentPath)
            ? currentPath
            : nextOrigins[0]?.path || null;

      if (nextPath) {
        await readPath(nextPath);
      } else {
        setCurrentPath(null);
        setCurrentText("");
        setCurrentMtime(null);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRun(): Promise<void> {
    if (!title.trim() || !targetKey.trim() || !requestedTask.trim()) {
      setErr("Title, target key, and requested task are required.");
      return;
    }

    setCreating(true);
    setErr("");

    try {
      const payload = {
        title,
        targetType,
        targetKey,
        requestedTask,
        operatorIntent,
        requestedBy,
        agentType,
        requestedMode,
        approvalRequirement,
        contextArtifact,
      };

      const verb = `agent_run.create.${b64urlEncodeUtf8(JSON.stringify(payload))}`;
      const res = (await invoke("run_o2", { verb })) as RunO2Result;
      if (!res.ok) {
        throw new Error(errMsg(res, "agent_run.create failed"));
      }

      let parsed: CreateAgentRunJson;
      try {
        parsed = JSON.parse((res.stdout || "").trim()) as CreateAgentRunJson;
      } catch {
        throw new Error("agent_run.create returned invalid JSON");
      }

      if (!parsed.ok || !parsed.originArtifactPath) {
        throw new Error(parsed.error || "agent_run.create returned error");
      }

      await refreshList(parsed.originArtifactPath);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  const actions = (
    <button
      className="btn btnGhost"
      onClick={() => void refreshList()}
      disabled={loading || creating}
    >
      {loading ? "Refreshing…" : "Refresh"}
    </button>
  );

  const meta = (
    <div className="panelMeta">
      <div>
        <strong>Record root:</strong> {RUNS_DIR}
      </div>
      <div>
        <strong>Runs found:</strong> {runOrigins.length}
      </div>
      <div>
        <strong>Current file:</strong> {currentPath ?? "(none loaded)"}
      </div>
      <div>
        <strong>Last updated:</strong>{" "}
        {currentMtime ? formatMaybeUnixTime(currentMtime) : "—"}
      </div>
    </div>
  );

  return (
    <SystemStateShell
      title="Agents"
      actions={actions}
      meta={meta}
      error={err ? <>{err}</> : null}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ display: "grid", gap: 12, minHeight: 0 }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 800 }}>Create Agent Run</div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Title</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Target Type</span>
              <select
                className="input"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
              >
                <option value="project">project</option>
                <option value="infrastructure_asset">infrastructure_asset</option>
                <option value="empire">empire</option>
                <option value="other">other</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Target Key</span>
              <input
                className="input"
                list="agent-target-keys"
                value={targetKey}
                onChange={(e) => setTargetKey(e.target.value)}
              />
              <datalist id="agent-target-keys">
                {projects.map((project) => (
                  <option key={project.key} value={project.key} />
                ))}
              </datalist>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Requested Task</span>
              <textarea
                className="pasteArea"
                style={{ minHeight: 110 }}
                value={requestedTask}
                onChange={(e) => setRequestedTask(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Operator Intent</span>
              <textarea
                className="pasteArea"
                style={{ minHeight: 90 }}
                value={operatorIntent}
                onChange={(e) => setOperatorIntent(e.target.value)}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Agent Type</span>
                <select
                  className="input"
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value)}
                >
                  <option value="codex">codex</option>
                  <option value="orion">orion</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Requested Mode</span>
                <select
                  className="input"
                  value={requestedMode}
                  onChange={(e) => setRequestedMode(e.target.value)}
                >
                  <option value="read-only">read-only</option>
                  <option value="auto">auto</option>
                  <option value="governed-write">governed-write</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Requested By</span>
                <input
                  className="input"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.76 }}>Approval Requirement</span>
                <select
                  className="input"
                  value={approvalRequirement}
                  onChange={(e) => setApprovalRequirement(e.target.value)}
                >
                  <option value="none">none</option>
                  <option value="required">required</option>
                  <option value="conditional">conditional</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.76 }}>Context Artifact</span>
              <input
                className="input"
                value={contextArtifact}
                onChange={(e) => setContextArtifact(e.target.value)}
              />
            </label>

            <button
              className="btn btnPrimary"
              onClick={() => void createRun()}
              disabled={creating || loading}
            >
              {creating ? "Creating…" : "Create Agent Run"}
            </button>
          </div>

          <ArtifactListPanel
            title="Agent Runs"
            items={runOrigins}
            currentPath={currentPath}
            emptyText="No governed agent runs yet."
            onSelect={(path) => void readPath(path)}
          />
        </div>

        <div
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: 10,
              fontSize: 13,
              opacity: 0.86,
            }}
          >
            <strong>View:</strong> governed <code>00_origin.md</code> anchor for the selected agent run
          </div>

          <textarea
            className="pasteArea"
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            placeholder="Selected agent-run origin record will appear here…"
            spellCheck={false}
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>
      </div>
    </SystemStateShell>
  );
}
