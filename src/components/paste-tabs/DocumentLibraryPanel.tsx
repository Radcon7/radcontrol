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

type FilesRenameJson = {
  ok?: boolean;
  fromPath?: string;
  toPath?: string;
  mtime?: number;
  bytes?: number;
  committed?: boolean;
  commitMessage?: string | null;
  error?: string;
};

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

function ensureMdFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function isSafeLibraryFilename(name: string): boolean {
  if (!name) return false;
  if (name.includes("/")) return false;
  if (name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("..")) return false;
  return true;
}

function baseNameFromPath(path: string): string {
  const normalized = normalizeO2Path(path);
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function defaultCommitMessage(tabKey: string, op: "write" | "rename"): string {
  return `radcontrol ${tabKey}: ${op}`;
}

function formatTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

function defaultDocStem(tabKey: string): string {
  const normalized = tabKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "doc";
  if (normalized.length > 1 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function makeTimestampFilename(tabKey: string, now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = formatTimestampPart(now.getMonth() + 1);
  const dd = formatTimestampPart(now.getDate());
  const hh = formatTimestampPart(now.getHours());
  const mi = formatTimestampPart(now.getMinutes());
  const ss = formatTimestampPart(now.getSeconds());
  return `${defaultDocStem(tabKey)}_${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}.md`;
}

function hasMeaningfulContent(text: string): boolean {
  return text.trim().length > 0;
}

function isLegacyPlaceholderName(name: string): boolean {
  return name.trim().toLowerCase() === "example-note.md";
}

function lastActivePathStorageKey(tabKey: string): string {
  return `radcontrol.library.lastActivePath.${tabKey}`;
}

function loadLastActivePath(tabKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lastActivePathStorageKey(tabKey));
    if (!raw) return null;
    const normalized = normalizeO2Path(raw);
    return normalized || null;
  } catch {
    return null;
  }
}

export function DocumentLibraryPanel(props: {
  tabKey: string;
  title: string;
  placeholder?: string;
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
}) {
  const { tabKey, title, placeholder, busy, registerBeforeTabChangeSaver } =
    props;

  const dir = useMemo(() => `docs/radcontrol/${tabKey}`, [tabKey]);
  const dirPrefix = useMemo(() => `${dir}/`, [dir]);

  const [items, setItems] = useState<FilesListItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [err, setErr] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastActivePath, setLastActivePath] = useState<string | null>(() =>
    loadLastActivePath(tabKey),
  );

  const loadSeqRef = useRef(0);
  const hasAutoOpenedRef = useRef(false);
  const filenameInputRef = useRef<HTMLInputElement | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const currentNameRef = useRef("");
  const draftTextRef = useRef("");
  const isDirtyRef = useRef(false);
  const busyRef = useRef(false);
  const loadingRef = useRef(false);
  const savingRef = useRef(false);
  const renamingRef = useRef(false);
  const autosaveRef = useRef<() => Promise<void>>(async () => {});
  const autosaveInFlightRef = useRef(false);

  function rememberLastActivePath(path: string | null): void {
    const normalized = path ? normalizeO2Path(path) : "";
    const next = normalized || null;
    setLastActivePath(next);

    if (typeof window === "undefined") return;
    try {
      const key = lastActivePathStorageKey(tabKey);
      if (next) {
        window.localStorage.setItem(key, next);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore localStorage failures; in-memory state still works for this mount.
    }
  }

  async function handleCopyCurrent(): Promise<void> {
    await copyText(draftText ?? "");
  }

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    currentNameRef.current = currentName;
  }, [currentName]);

  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    busyRef.current = Boolean(busy);
  }, [busy]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    renamingRef.current = renaming;
  }, [renaming]);

  const docsInFolder = useMemo(() => {
    return items
      .filter((it) => typeof it.path === "string")
      .map((it) => ({
        path: normalizeO2Path(it.path || ""),
        mtime: typeof it.mtime === "number" ? it.mtime : 0,
        bytes: typeof it.bytes === "number" ? it.bytes : 0,
      }))
      .filter((it) => it.path.startsWith(dirPrefix))
      .sort((a, b) => b.mtime - a.mtime);
  }, [dirPrefix, items]);

  async function refreshList(): Promise<void> {
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

      if (seq !== loadSeqRef.current) return;
      setItems(Array.isArray(parsed.items) ? parsed.items : []);
    } catch (e) {
      setErr(String(e));
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }

  async function openPath(path: string): Promise<void> {
    const normalized = normalizeO2Path(path);
    rememberLastActivePath(normalized);
    setErr("");

    try {
      const res = await runO2(`files.read.${b64urlEncodeUtf8(normalized)}`);
      if (!res.ok) {
        setErr(errMsg(res, "files.read failed"));
        return;
      }

      let parsed: FilesReadJson;
      try {
        parsed = JSON.parse((res.stdout || "").trim()) as FilesReadJson;
      } catch {
        setErr("files.read returned invalid JSON");
        return;
      }

      const nextPath =
        typeof parsed.path === "string"
          ? normalizeO2Path(parsed.path)
          : normalized;
      const nextContent =
        typeof parsed.content === "string" ? parsed.content : "";

      setCurrentPath(nextPath);
      setCurrentName(baseNameFromPath(nextPath));
      setDraftText(nextContent);
      setIsCreatingNew(false);
      setIsDirty(false);
    } catch (e) {
      setErr(String(e));
    }
  }

  function startNewDoc() {
    const generated = makeTimestampFilename(tabKey);
    setCurrentPath(null);
    setCurrentName(generated);
    setDraftText("");
    setErr("");
    setIsCreatingNew(true);
    setIsDirty(false);

    window.setTimeout(() => {
      filenameInputRef.current?.focus();
    }, 0);
  }

  async function writePath(
    path: string,
    content: string,
    reportError = true,
  ): Promise<string | null> {
    const payload = {
      path,
      content,
      commit: true,
      commitMessage: defaultCommitMessage(tabKey, "write"),
    };

    const res = await runO2(
      `files.write.${b64urlEncodeUtf8(JSON.stringify(payload))}`,
    );
    if (!res.ok) {
      if (reportError) {
        setErr(errMsg(res, "files.write failed"));
      }
      return null;
    }

    let parsed: FilesWriteJson;
    try {
      parsed = JSON.parse((res.stdout || "").trim()) as FilesWriteJson;
    } catch {
      if (reportError) {
        setErr("files.write returned invalid JSON");
      }
      return null;
    }

    const confirmedPath =
      typeof parsed.path === "string"
        ? normalizeO2Path(parsed.path)
        : normalizeO2Path(path);

    return confirmedPath;
  }

  async function renamePath(
    fromPath: string,
    toPath: string,
    reportError = true,
  ): Promise<string | null> {
    const payload = {
      fromPath,
      toPath,
      commit: true,
      commitMessage: defaultCommitMessage(tabKey, "rename"),
    };

    const res = await runO2(
      `files.rename.${b64urlEncodeUtf8(JSON.stringify(payload))}`,
    );
    if (!res.ok) {
      if (reportError) {
        setErr(errMsg(res, "files.rename failed"));
      }
      return null;
    }

    let parsed: FilesRenameJson;
    try {
      parsed = JSON.parse((res.stdout || "").trim()) as FilesRenameJson;
    } catch {
      if (reportError) {
        setErr("files.rename returned invalid JSON");
      }
      return null;
    }

    const confirmedPath =
      typeof parsed.toPath === "string"
        ? normalizeO2Path(parsed.toPath)
        : normalizeO2Path(toPath);

    return confirmedPath;
  }

  async function saveCurrent(autosave = false): Promise<void> {
    if (saving || renaming) return;

    let nameCandidate = currentName;
    if (autosave) {
      const maybeSafe = ensureMdFilename(nameCandidate);
      if (
        !isSafeLibraryFilename(maybeSafe) ||
        isLegacyPlaceholderName(maybeSafe)
      ) {
        nameCandidate = makeTimestampFilename(tabKey);
      }
    }

    const safeName = ensureMdFilename(nameCandidate);
    if (!isSafeLibraryFilename(safeName)) {
      if (!autosave) {
        setErr("Enter a valid filename, for example: my-note.md");
        filenameInputRef.current?.focus();
      }
      return;
    }

    if (!autosave || currentName !== safeName) {
      setCurrentName(safeName);
    }

    if (!autosave) {
      setSaving(true);
      setErr("");
    }

    try {
      let finalPath: string;

      if (!currentPath) {
        const createdPath = await writePath(`${dir}/${safeName}`, draftText);
        if (!createdPath) return;
        finalPath = createdPath;
      } else {
        const normalizedCurrent = normalizeO2Path(currentPath);
        const desiredPath = normalizeO2Path(`${dir}/${safeName}`);

        if (normalizedCurrent !== desiredPath) {
          if (!autosave) {
            setRenaming(true);
          }
          const renamedPath = await renamePath(
            normalizedCurrent,
            desiredPath,
            !autosave,
          );
          if (!autosave) {
            setRenaming(false);
          }
          if (!renamedPath) return;
          finalPath = renamedPath;
        } else {
          finalPath = normalizedCurrent;
        }

        const writtenPath = await writePath(finalPath, draftText, !autosave);
        if (!writtenPath) return;
        finalPath = writtenPath;
      }

      const finalName = baseNameFromPath(finalPath);
      setCurrentPath(finalPath);
      setCurrentName(finalName);
      rememberLastActivePath(finalPath);
      setLastSavedAt(Date.now());
      setIsCreatingNew(false);
      setIsDirty(false);

      if (!autosave) {
        await refreshList();
      }
    } catch (e) {
      if (!autosave) {
        setErr(String(e));
      }
    } finally {
      if (!autosave) {
        setSaving(false);
        setRenaming(false);
      }
    }
  }

  async function saveIfDirtyBeforeTabChange(): Promise<boolean> {
    try {
      if (!isDirtyRef.current) return true;
      if (
        busyRef.current ||
        loadingRef.current ||
        savingRef.current ||
        renamingRef.current
      ) {
        return false;
      }

      if (
        !currentPathRef.current &&
        !hasMeaningfulContent(draftTextRef.current)
      ) {
        return true;
      }

      await saveCurrent(false);
      return !isDirtyRef.current;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    hasAutoOpenedRef.current = false;
    setLastActivePath(loadLastActivePath(tabKey));
    setCurrentPath(null);
    setCurrentName("");
    setDraftText("");
    setIsCreatingNew(false);
    setIsDirty(false);
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  useEffect(() => {
    if (isCreatingNew) return;
    if (currentPath) return;
    if (hasAutoOpenedRef.current) return;

    const rememberedStillExists =
      lastActivePath &&
      docsInFolder.some((it) => normalizeO2Path(it.path) === lastActivePath)
        ? lastActivePath
        : null;
    const fallbackLatest = docsInFolder[0]?.path ?? null;
    const nextPath = rememberedStillExists ?? fallbackLatest;
    if (!nextPath) return;

    hasAutoOpenedRef.current = true;
    void openPath(nextPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsInFolder, currentPath, isCreatingNew, lastActivePath]);

  useEffect(() => {
    if (!isCreatingNew) return;
    filenameInputRef.current?.focus();
  }, [isCreatingNew]);

  useEffect(() => {
    autosaveRef.current = async () => {
      if (autosaveInFlightRef.current) return;
      if (!isDirtyRef.current) return;
      if (!hasMeaningfulContent(draftTextRef.current)) return;
      if (
        busyRef.current ||
        loadingRef.current ||
        savingRef.current ||
        renamingRef.current
      ) {
        return;
      }

      autosaveInFlightRef.current = true;
      try {
        await saveCurrent(true);
      } finally {
        autosaveInFlightRef.current = false;
      }
    };
  });

  useEffect(() => {
    return () => {
      void autosaveRef.current();
    };
  }, []);

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(saveIfDirtyBeforeTabChange);
    return () => {
      registerBeforeTabChangeSaver(null);
    };
  });

  const canSave = !busy && !loading && !saving && !renaming;
  const canCopy = draftText.trim().length > 0;

  return (
    <section
      className="panel"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div className="panelHeader">
        <div className="panelTitle">{title}</div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btnGhost"
            onClick={() => void refreshList()}
            disabled={loading || saving || renaming}
            title="Reload file list from O2 docs"
          >
            Refresh
          </button>
          <button
            className="btn btnGhost"
            onClick={startNewDoc}
            disabled={loading || saving || renaming}
            title="Start a new named document"
          >
            New
          </button>
          <button
            className="btn"
            onClick={() => void saveCurrent()}
            disabled={!canSave}
            title="Save document through O2 files.write"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btnGhost"
            onClick={() => void handleCopyCurrent()}
            disabled={!canCopy}
            title="Copy current editor text"
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
          {currentPath ?? "(new unsaved document)"}
        </div>
        <div>
          <strong>Files found:</strong> {docsInFolder.length}
        </div>
        <div>
          <strong>Last saved:</strong>{" "}
          {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "—"}
        </div>
      </div>

      {err ? <div className="panelError">{err}</div> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 12,
          flex: 1,
          minHeight: 0,
          height: "100%",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            overflowY: "auto",
            overflowX: "hidden",
            minHeight: 0,
            height: "100%",
          }}
        >
          {docsInFolder.length === 0 ? (
            <div style={{ padding: 12, opacity: 0.8 }}>No documents yet.</div>
          ) : (
            docsInFolder.map((it) => {
              const selected = currentPath === it.path;
              return (
                <button
                  key={it.path}
                  type="button"
                  onClick={() => void openPath(it.path)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    background: selected
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                  title={it.path}
                >
                  <div style={{ fontWeight: 600, wordBreak: "break-word" }}>
                    {baseNameFromPath(it.path)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {it.mtime
                      ? new Date(it.mtime * 1000).toLocaleString()
                      : "—"}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Filename
            </label>
            <input
              ref={filenameInputRef}
              type="text"
              value={currentName}
              onChange={(e) => {
                setCurrentName(e.target.value);
                setIsDirty(true);
              }}
              placeholder={`${defaultDocStem(tabKey)}_YYYY-MM-DD_HH-MM-SS.md`}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "inherit",
              }}
            />
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <textarea
              className="pasteArea"
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value);
                setIsDirty(true);
              }}
              placeholder={placeholder ?? "Write here…"}
              spellCheck={false}
              style={{
                width: "100%",
                height: "100%",
                resize: "none",
                overflow: "auto",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
