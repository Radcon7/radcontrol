import { useEffect, useMemo, useRef, useState } from "react";
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

type FilesWriteJson = {
  ok?: boolean;
  path?: string;
  mtime?: number;
  bytes?: number;
  committed?: boolean;
  commitMessage?: string | null;
  error?: string;
};

type FilesNewJson = {
  ok?: boolean;
  path?: string;
  mtime?: number;
  bytes?: number;
  committed?: boolean;
  commitMessage?: string | null;
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

function itemsForDir(
  items: FilesListItem[],
  wantedDir: string,
): FilesListItem[] {
  const dir = normalizeO2Path(wantedDir).replace(/\/+$/g, "");
  const wantedPrefix = `${dir}/`;

  return items.filter((it) => {
    const p = typeof it.path === "string" ? normalizeO2Path(it.path) : "";
    return p.startsWith(wantedPrefix);
  });
}

function defaultCommitMessage(tabKey: string, op: "new" | "write"): string {
  return `radcontrol ${tabKey}: ${op}`;
}

type Props = {
  tabKey: string;
  title: string;
  placeholder?: string;
  busy?: boolean;
  onCopy?: () => void;
};

export function PasteAreaTab(props: Props) {
  const { tabKey, title, placeholder, busy, onCopy } = props;

  const dir = useMemo(() => `docs/radcontrol/${tabKey}`, [tabKey]);

  const [content, setContent] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [items, setItems] = useState<FilesListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const dirtyRef = useRef(false);
  const loadSeqRef = useRef(0);

  const folderItems = useMemo(() => itemsForDir(items, dir), [items, dir]);

  async function loadLatest(): Promise<void> {
    const seq = ++loadSeqRef.current;
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
      if (seq !== loadSeqRef.current) return;

      setItems(nextItems);

      const latestPath = latestPathForDir(nextItems, dir);
      if (!latestPath) {
        setSelectedPath(null);
        setContent("");
        dirtyRef.current = false;
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

      if (seq !== loadSeqRef.current) return;

      const nextPath =
        typeof jRead.path === "string"
          ? normalizeO2Path(jRead.path)
          : latestPath;
      const nextContent =
        typeof jRead.content === "string" ? jRead.content : "";

      setSelectedPath(nextPath);
      setContent(nextContent);
      dirtyRef.current = false;
    } catch (e) {
      setErr(String(e));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  async function saveCurrent(): Promise<void> {
    if (saving) return;

    setSaving(true);
    setErr("");

    try {
      let path = selectedPath;

      if (!path) {
        const payload = {
          dir,
          content,
          ext: "md",
          commit: true,
          commitMessage: defaultCommitMessage(tabKey, "new"),
        };

        const resNew = await runO2(
          `files.new.${b64urlEncodeUtf8(JSON.stringify(payload))}`,
        );
        if (!resNew.ok) {
          setErr(errMsg(resNew, "files.new failed"));
          return;
        }

        let jNew: FilesNewJson;
        try {
          jNew = JSON.parse((resNew.stdout || "").trim()) as FilesNewJson;
        } catch {
          setErr("files.new returned invalid JSON");
          return;
        }

        const rawPath = typeof jNew.path === "string" ? jNew.path : "";
        path = rawPath ? normalizeO2Path(rawPath) : null;

        if (!path) {
          setErr("files.new returned no path");
          return;
        }

        setSelectedPath(path);
      } else {
        path = normalizeO2Path(path);

        const payload = {
          path,
          content,
          commit: true,
          commitMessage: defaultCommitMessage(tabKey, "write"),
        };

        const resWrite = await runO2(
          `files.write.${b64urlEncodeUtf8(JSON.stringify(payload))}`,
        );
        if (!resWrite.ok) {
          setErr(errMsg(resWrite, "files.write failed"));
          return;
        }

        let jWrite: FilesWriteJson;
        try {
          jWrite = JSON.parse((resWrite.stdout || "").trim()) as FilesWriteJson;
        } catch {
          setErr("files.write returned invalid JSON");
          return;
        }

        const rawPath = typeof jWrite.path === "string" ? jWrite.path : path;
        path = normalizeO2Path(rawPath);
        setSelectedPath(path);
      }

      const resRead = await runO2(`files.read.${b64urlEncodeUtf8(path)}`);
      if (!resRead.ok) {
        setErr(errMsg(resRead, "post-write files.read failed"));
        return;
      }

      let jRead: FilesReadJson;
      try {
        jRead = JSON.parse((resRead.stdout || "").trim()) as FilesReadJson;
      } catch {
        setErr("post-write files.read returned invalid JSON");
        return;
      }

      const confirmedContent =
        typeof jRead.content === "string" ? jRead.content : content;
      const confirmedPath =
        typeof jRead.path === "string" ? normalizeO2Path(jRead.path) : path;

      setContent(confirmedContent);
      setSelectedPath(confirmedPath);
      setLastSavedAt(Date.now());
      dirtyRef.current = false;

      await loadLatest();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitle">{title}</div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btnGhost"
            onClick={() => void loadLatest()}
            disabled={loading || saving}
            title="Reload latest file from O2 docs"
          >
            Reload
          </button>
          <button
            className="btn"
            onClick={() => void saveCurrent()}
            disabled={Boolean(busy) || loading || saving}
            title="Save through O2 files.* verbs"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className="btn btnGhost"
            onClick={() => {
              if (onCopy) {
                onCopy();
                return;
              }
              void navigator.clipboard.writeText(content);
            }}
            disabled={content.trim().length === 0}
            title="Copy current contents"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="panelMeta">
        <div>
          <strong>Folder:</strong> {dir}
        </div>
        <div>
          <strong>Current file:</strong>{" "}
          {selectedPath ?? "(new file on first save)"}
        </div>
        <div>
          <strong>Files found:</strong> {folderItems.length}
        </div>
        <div>
          <strong>Last saved:</strong>{" "}
          {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "—"}
        </div>
      </div>

      {err ? <div className="panelError">{err}</div> : null}

      <textarea
        className="pasteArea"
        value={content}
        onChange={(e) => {
          const next = e.target.value;
          setContent(next);
          dirtyRef.current = true;
        }}
        placeholder={placeholder}
        spellCheck={false}
      />
    </section>
  );
}
