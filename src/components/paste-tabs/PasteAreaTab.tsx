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
};

type FilesReadJson = {
  ok?: boolean;
  path?: string;
  mtime?: number;
  bytes?: number;
  content?: string;
};

type FilesNewJson = {
  ok?: boolean;
  path?: string;
};

function fmtBytes(n?: number) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function fmtTime(epochSec?: number) {
  if (!epochSec) return "";
  try {
    const d = new Date(epochSec * 1000);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function b64urlEncodeUtf8(s: string): string {
  const utf8 = new TextEncoder().encode(s);
  let bin = "";
  utf8.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeO2Path(p: string): string {
  const s = (p || "").trim();
  if (s.startsWith("docs/")) return s;
  if (s.startsWith("radcontrol/")) return `docs/${s}`;
  return s;
}

async function runO2(verb: string): Promise<RunO2Result> {
  return await invoke<RunO2Result>("run_o2", { verb });
}

function errMsg(res: RunO2Result, fallback: string) {
  const s = (res.stderr || "").trim();
  if (s) return s;
  return `${fallback} (code=${res.code})`;
}

export function PasteAreaTab(props: {
  title: string; // tab key, e.g. "notes"
  value: string; // legacy (ignored for canonical behavior)
  onChange: (v: string) => void; // legacy (called only on explicit events)
  storageKey: string; // legacy
  placeholder?: string;
  busy?: boolean;
  onCopy?: () => void;
  isBundleTab?: boolean;
  onExportBundle?: () => void;
  onImportBundle?: () => void;
}) {
  const tabKey = props.title;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  const [files, setFiles] = useState<FilesListItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedPathRef = useRef<string | null>(null);
  selectedPathRef.current = selectedPath;

  // Canonical editor state (NOT parent-controlled)
  const [draft, setDraft] = useState<string>("");
  const draftRef = useRef<string>("");
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const docsPrefix = useMemo(() => `docs/radcontrol/${tabKey}/`, [tabKey]);

  const filteredFiles = useMemo(() => {
    const want = docsPrefix.toLowerCase();
    return (files || [])
      .filter((it) => {
        const p = typeof it?.path === "string" ? normalizeO2Path(it.path) : "";
        return p.toLowerCase().startsWith(want);
      })
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  }, [files, docsPrefix]);

  async function refreshList() {
    setLoading(true);
    setErr("");
    try {
      const res = await runO2("files.list");
      if (!res.ok) {
        setFiles([]);
        setErr(errMsg(res, "files.list failed"));
        return;
      }
      const j = JSON.parse((res.stdout || "").trim()) as FilesListJson;
      setFiles(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      setFiles([]);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openFile(pathIn: string) {
    const path = normalizeO2Path(pathIn);

    setLoading(true);
    setErr("");
    try {
      const res = await runO2(`files.read.${b64urlEncodeUtf8(path)}`);
      if (!res.ok) {
        setErr(errMsg(res, "files.read failed"));
        return;
      }

      const j = JSON.parse((res.stdout || "").trim()) as FilesReadJson;
      const content = typeof j.content === "string" ? j.content : "";
      setSelectedPath(path);
      setDraft(content);
      props.onChange(content); // legacy: explicit load event
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveToSelectedOrNew() {
    const content = (draftRef.current || "").toString();
    if (content.trim().length === 0) return;

    setSaving(true);
    setErr("");
    try {
      let path = selectedPathRef.current;

      // Create new file if none selected
      if (!path) {
        const resNew = await runO2(
          `files.new.${b64urlEncodeUtf8(JSON.stringify({ tab: tabKey, ext: "md" }))}`,
        );
        if (!resNew.ok) {
          setErr(errMsg(resNew, "files.new failed"));
          return;
        }

        const jNew = JSON.parse((resNew.stdout || "").trim()) as FilesNewJson;
        const rawPath = typeof jNew.path === "string" ? jNew.path : "";
        path = rawPath ? normalizeO2Path(rawPath) : null;

        if (!path) {
          setErr("files.new returned no path");
          return;
        }
        setSelectedPath(path);
      } else {
        path = normalizeO2Path(path);
      }

      // WRITE
      const resWrite = await runO2(
        `files.write.${b64urlEncodeUtf8(JSON.stringify({ path, content }))}`,
      );
      if (!resWrite.ok) {
        setErr(errMsg(resWrite, "files.write failed"));
        return;
      }

      // VERIFY (read-back)
      const resRead = await runO2(`files.read.${b64urlEncodeUtf8(path)}`);
      if (!resRead.ok) {
        setErr(errMsg(resRead, "post-write files.read failed"));
        return;
      }

      const jRead = JSON.parse((resRead.stdout || "").trim()) as FilesReadJson;
      const got = typeof jRead.content === "string" ? jRead.content : "";
      const gotBytes = typeof jRead.bytes === "number" ? jRead.bytes : 0;

      if (gotBytes <= 0 || got !== content) {
        setErr(
          `WRITE VERIFICATION FAILED: bytes=${gotBytes}, content_match=${got === content}`,
        );
        await refreshList();
        return;
      }

      setDraft(got);
      props.onChange(got);

      await refreshList();
      await openFile(path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function newDraft() {
    setSelectedPath(null);
    setDraft("");
    props.onChange(""); // legacy explicit clear event
  }

  // On tab entry: blank editor + list refresh
  useEffect(() => {
    newDraft();
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  // Autosave on tab exit:
  // - if selectedPath exists → overwrite it
  // - else → create a new file
  useEffect(() => {
    return () => {
      const content = (draftRef.current || "").toString();
      if (content.trim().length === 0) return;

      const doAuto = async () => {
        try {
          let path = selectedPathRef.current;

          if (!path) {
            const resNew = await runO2(
              `files.new.${b64urlEncodeUtf8(
                JSON.stringify({ tab: tabKey, ext: "md" }),
              )}`,
            );
            if (!resNew.ok) return;

            const jNew = JSON.parse(
              (resNew.stdout || "").trim(),
            ) as FilesNewJson;
            const rawPath = typeof jNew.path === "string" ? jNew.path : "";
            path = rawPath ? normalizeO2Path(rawPath) : null;
            if (!path) return;
          } else {
            path = normalizeO2Path(path);
          }

          await runO2(
            `files.write.${b64urlEncodeUtf8(JSON.stringify({ path, content }))}`,
          );
        } catch {
          // ignore autosave failures
        }
      };

      void doAuto();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  return (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 0 }}>
      {/* Left: file list */}
      <div
        style={{
          width: 360,
          borderRight: "1px solid rgba(255,255,255,0.08)",
          paddingRight: 12,
          overflow: "auto",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{tabKey}</div>
          <div style={{ flex: 1 }} />
          <button
            className="btn btnGhost"
            onClick={() => void refreshList()}
            disabled={loading || saving}
            title="Refresh list"
          >
            Refresh
          </button>
        </div>

        {err ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,0,0,0.25)",
              background: "rgba(255,0,0,0.08)",
              color: "rgba(255,255,255,0.95)",
              whiteSpace: "pre-wrap",
              fontSize: 12,
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button
            className="btn btnPrimary"
            onClick={() => newDraft()}
            disabled={saving}
            title="Start a new note (blank editor)"
          >
            New
          </button>

          <button
            className="btn"
            onClick={() => void saveToSelectedOrNew()}
            disabled={saving || (draft || "").trim().length === 0}
            title={
              selectedPath
                ? "Save updates the selected file"
                : "Save creates a new file"
            }
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <button
            className="btn btnGhost"
            onClick={() => props.onCopy?.()}
            disabled={(draft || "").trim().length === 0}
            title="Copy editor text"
          >
            Copy
          </button>
        </div>

        {selectedPath ? (
          <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
            Editing:
            <div style={{ wordBreak: "break-all", marginTop: 2 }}>
              {selectedPath}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
            New draft (no file selected)
          </div>
        )}

        <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>
          {loading ? "Loading…" : `${filteredFiles.length} file(s)`}
        </div>

        <div style={{ marginTop: 8, display: "flex", flexDirection: "column" }}>
          {filteredFiles.map((f) => {
            const p = normalizeO2Path(f.path || "");
            const active = selectedPath === p;
            const label = p.toLowerCase().startsWith(docsPrefix.toLowerCase())
              ? p.slice(docsPrefix.length)
              : p;

            return (
              <button
                key={p}
                className={`btn ${active ? "btnPrimary" : "btnGhost"}`}
                style={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  marginBottom: 8,
                  whiteSpace: "normal",
                }}
                onClick={() => void openFile(p)}
                disabled={loading || saving}
                title={p}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <div style={{ fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {fmtTime(f.mtime)} • {fmtBytes(f.bytes)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: editor */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={props.placeholder || `Paste ${tabKey} notes here…`}
          disabled={saving}
          style={{
            flex: 1,
            width: "100%",
            resize: "none",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        />
      </div>
    </div>
  );
}
