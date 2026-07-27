import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../common/copyText";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import {
  type FilesListItem,
  listO2Files,
  normalizeO2Path,
  readO2File,
  renameO2File,
  writeO2File,
} from "../common/o2Files";

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
  const special: Record<string, string> = {
    notes: "note",
    legal: "legal_note",
    orion_handoff: "dev_update",
  };
  if (special[tabKey]) return special[tabKey];

  const normalized = tabKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized || "document";
}

function makeTimestampFilename(tabKey: string, now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = formatTimestampPart(now.getMonth() + 1);
  const dd = formatTimestampPart(now.getDate());
  const hh = formatTimestampPart(now.getHours());
  const mi = formatTimestampPart(now.getMinutes());
  const ss = formatTimestampPart(now.getSeconds());

  return `${defaultDocStem(tabKey)}_${yyyy}${mm}${dd}_${hh}${mi}${ss}.md`;
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

// Legacy UI-state migration only. These helpers preserve old localStorage keys and
// historical tab path selections after tab/folder renames. They do not govern
// document storage; O2 files.* verbs remain the source of truth for documents.
function legacyUiStateStorageKey(tabKey: string): string | null {
  if (tabKey === "orion_handoff") {
    return "radcontrol.library.lastActivePath.roadmap";
  }
  return null;
}

function migrateLegacyUiStatePathToCanonical(tabKey: string, path: string): string {
  let normalized = normalizeO2Path(path);
  if (!normalized) return "";

  if (
    tabKey === "orion_handoff" &&
    normalized.startsWith("docs/radcontrol/roadmap/")
  ) {
    normalized = normalized.replace(
      "docs/radcontrol/roadmap/",
      "docs/radcontrol/orion_handoff/",
    );
  }

  if (normalized.startsWith("docs/radcontrol/Notes/")) {
    normalized = normalized.replace(
      "docs/radcontrol/Notes/",
      "docs/radcontrol/notes/",
    );
  }


  return normalized;
}

function loadLastActivePath(tabKey: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    const canonicalKey = lastActivePathStorageKey(tabKey);
    const canonicalRaw = window.localStorage.getItem(canonicalKey);
    if (canonicalRaw) {
      const normalized = migrateLegacyUiStatePathToCanonical(tabKey, canonicalRaw);
      if (normalized && normalized !== canonicalRaw) {
        window.localStorage.setItem(canonicalKey, normalized);
      }
      return normalized || null;
    }

    const legacyKey = legacyUiStateStorageKey(tabKey);
    if (!legacyKey) return null;

    const legacyRaw = window.localStorage.getItem(legacyKey);
    if (!legacyRaw) return null;

    const migrated = migrateLegacyUiStatePathToCanonical(tabKey, legacyRaw);
    if (migrated) {
      window.localStorage.setItem(canonicalKey, migrated);
    }
    window.localStorage.removeItem(legacyKey);

    return migrated || null;
  } catch {
    return null;
  }
}

type Props = {
  tabKey: string;
  title: string;
  placeholder?: string;
  busy?: boolean;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

export function DocumentLibraryPanel({
  tabKey,
  title,
  placeholder,
  busy,
  registerBeforeTabChangeSaver,
}: Props) {
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
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastActivePath, setLastActivePath] = useState<string | null>(() =>
    loadLastActivePath(tabKey),
  );

  const loadSeqRef = useRef(0);
  const hasAutoOpenedRef = useRef(false);
  const currentPathRef = useRef<string | null>(null);
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
      const parsed = await listO2Files(dir);
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
      const parsed = await readO2File(normalized);
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

    try {
      const parsed = await writeO2File(payload);
      return typeof parsed.path === "string"
        ? normalizeO2Path(parsed.path)
        : normalizeO2Path(path);
    } catch (error) {
      if (reportError) {
        setErr(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
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

    try {
      const parsed = await renameO2File(payload);
      return typeof parsed.toPath === "string"
        ? normalizeO2Path(parsed.toPath)
        : normalizeO2Path(toPath);
    } catch (error) {
      if (reportError) {
        setErr(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }

  async function saveCurrent(autosave = false): Promise<void> {
    if (saving || renaming) return;

    let nameCandidate = currentName;
    const maybeSafe = ensureMdFilename(nameCandidate);
    if (!isSafeLibraryFilename(maybeSafe) || isLegacyPlaceholderName(maybeSafe)) {
      nameCandidate = makeTimestampFilename(tabKey);
    }

    const safeName = ensureMdFilename(nameCandidate);
    if (!isSafeLibraryFilename(safeName)) {
      if (!autosave) {
        setErr("Unable to derive a valid filename for this entry.");
      }
      return;
    }

    if (currentName !== safeName) {
      setCurrentName(safeName);
    }

    if (!autosave) {
      setSaving(true);
      setErr("");
    }

    try {
      let finalPath: string;

      if (!currentPath) {
        const createdPath = await writePath(`${dir}/${safeName}`, draftText, !autosave);
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

      if (!currentPathRef.current && !hasMeaningfulContent(draftTextRef.current)) {
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
    <section className="workspaceShell workspacePanelShell">
      <div className="workspaceActionRow">
        <button
          className="btn btnGhost btnCompact"
          onClick={startNewDoc}
          disabled={loading || saving || renaming}
          title="Start a new named document"
        >
          New Entry
        </button>
        <button
          className="btn btnCompact"
          onClick={() => void saveCurrent()}
          disabled={!canSave}
          title="Save document through O2 files.write"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="btn btnGhost btnCompact"
          onClick={() => void handleCopyCurrent()}
          disabled={!canCopy}
          title="Copy current editor text"
        >
          Copy
        </button>
      </div>

      {err ? <div className="panelError">{err}</div> : null}

      <div className="workspaceContentGrid">
        <ArtifactListPanel
          title={title}
          items={docsInFolder}
          currentPath={currentPath}
          emptyText="No entries yet."
          onSelect={(path) => void openPath(path)}
        />

        <div className="workspaceEditorColumn">
          <div className="workspaceEditorFill">
            <textarea
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value);
                setIsDirty(true);
              }}
              placeholder={placeholder ?? "Write here..."}
              spellCheck={false}
              className="pasteArea workspaceTextAreaFill"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
