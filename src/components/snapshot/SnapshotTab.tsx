import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type RunO2Result = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

type FilesListItem = {
  kind?: string;
  path?: string;
  mtime?: number;
  bytes?: number;
};

type FilesListJson = {
  ok?: boolean;
  root?: string;
  docs_dir?: string;
  items?: FilesListItem[];
  error?: string;
};

type FilesReadJson = {
  ok?: boolean;
  path?: string;
  content?: string;
  bytes?: number;
  mtime?: number;
  error?: string;
};

function b64urlEncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeO2Path(p: string): string {
  const s = (p || "").trim().replace(/^\/+/, "");
  if (!s) return "";
  return s.startsWith("docs/") ? s : `docs/${s}`;
}

function joinOut(r: RunO2Result): string {
  const a = (r.stdout || "").trimEnd();
  const b = (r.stderr || "").trimEnd();
  if (a && b) return `${a}\n${b}`;
  return a || b || "";
}

function errMsg(r: RunO2Result, fallback: string): string {
  const text = joinOut(r).trim();
  return text || fallback;
}

async function runO2(verb: string): Promise<RunO2Result> {
  return (await invoke("run_o2", { verb })) as RunO2Result;
}

function latestPathForDir(
  items: FilesListItem[],
  wantedDir: string,
): string | null {
  const dir = normalizeO2Path(wantedDir).replace(/\/+$/g, "");
  const wantedPrefix = `${dir}/`;

  const matches = items
    .filter((it) => typeof it.path === "string")
    .map((it) => ({
      path: normalizeO2Path(it.path || ""),
      mtime: typeof it.mtime === "number" ? it.mtime : 0,
    }))
    .filter((it) => it.path.startsWith(wantedPrefix))
    .sort((a, b) => b.mtime - a.mtime);

  return matches[0]?.path ?? null;
}

async function copyText(text: string): Promise<void> {
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

type Props = {
  title: string;
};

export function SnapshotTab({ title }: Props) {
  const dir = useMemo(() => "docs/radcontrol/snapshot", []);
  const [content, setContent] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  async function loadLatest(): Promise<void> {
    setLoading(true);
    setErr("");

    try {
      const res = await runO2("files.list");
      if (!res.ok) {
        setErr(errMsg(res, "files.list failed"));
        return;
      }

      let parsed: FilesListJson;
      try {
        parsed = JSON.parse((res.stdout || "").trim()) as FilesListJson;
      } catch {
        setErr("files.list returned invalid JSON");
        return;
      }

      const nextItems = Array.isArray(parsed.items) ? parsed.items : [];
      const latestPath = latestPathForDir(nextItems, dir);

      if (!latestPath) {
        setSelectedPath(null);
        setContent("");
        setLastLoadedAt(Date.now());
        return;
      }

      const resRead = await runO2(`files.read.${b64urlEncodeUtf8(latestPath)}`);
      if (!resRead.ok) {
        setErr(errMsg(resRead, "files.read failed"));
        return;
      }

      let jRead: FilesReadJson;
      try {
        jRead = JSON.parse((resRead.stdout || "").trim()) as FilesReadJson;
      } catch {
        setErr("files.read returned invalid JSON");
        return;
      }

      const nextPath =
        typeof jRead.path === "string"
          ? normalizeO2Path(jRead.path)
          : latestPath;
      const nextContent =
        typeof jRead.content === "string" ? jRead.content : "";

      setSelectedPath(nextPath);
      setContent(nextContent);
      setLastLoadedAt(Date.now());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  return (
    <section
      className="panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
      }}
    >
      <div className="panelHeader">
        <div className="panelTitle">{title}</div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn btnGhost"
            onClick={() => void loadLatest()}
            disabled={loading}
            title="Reload latest generated snapshot from O2 docs"
          >
            {loading ? "Loading…" : "Reload"}
          </button>
          <button
            className="btn btnGhost"
            onClick={() => void copyText(content)}
            disabled={content.trim().length === 0}
            title="Copy current snapshot"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="panelMeta" style={{ marginBottom: 12 }}>
        <div>
          <strong>Folder:</strong> {dir}
        </div>
        <div>
          <strong>Current file:</strong> {selectedPath ?? "(none found)"}
        </div>
        <div>
          <strong>Mode:</strong> Read-only generated-state surface
        </div>
        <div>
          <strong>Last loaded:</strong>{" "}
          {lastLoadedAt ? new Date(lastLoadedAt).toLocaleString() : "—"}
        </div>
      </div>

      {err ? <div className="panelError">{err}</div> : null}

      <textarea
        className="pasteArea"
        value={content}
        readOnly
        placeholder="No snapshot file found yet."
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 420,
          width: "100%",
          resize: "none",
          boxSizing: "border-box",
        }}
      />
    </section>
  );
}
