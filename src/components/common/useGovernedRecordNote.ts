import { useCallback, useEffect, useRef, useState } from "react";
import { persistGovernedRecordNote } from "./governedRecordNote";
import { readO2File } from "./o2Files";

type ResolvePath = () => Promise<string | null> | string | null;

type Options = {
  recordKey: string | null;
  recordVersion?: string | number | null;
  path?: string | null;
  resolvePath?: ResolvePath;
  fallbackText?: string;
  reportLoadError?: boolean;
  missingStatus?: string;
  debounceMs?: number;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
};

type Result = {
  path: string | null;
  text: string;
  loading: boolean;
  saving: boolean;
  error: string;
  exists: boolean;
  dirty: boolean;
  status: string;
  onTextChange: (value: string) => void;
  flush: () => Promise<boolean>;
};

export function useGovernedRecordNote({
  recordKey,
  recordVersion = null,
  path: directPath = null,
  resolvePath,
  fallbackText = "",
  reportLoadError = false,
  missingStatus = "Note will be created on first save",
  debounceMs = 700,
  registerBeforeTabChangeSaver,
}: Options): Result {
  const [path, setPath] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [exists, setExists] = useState(false);

  const revisionRef = useRef(0);
  const pathRef = useRef<string | null>(null);
  const textRef = useRef("");
  const loadingRef = useRef(false);
  const resolvePathRef = useRef<ResolvePath | undefined>(resolvePath);
  const fallbackTextRef = useRef(fallbackText);
  const reportLoadErrorRef = useRef(reportLoadError);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  pathRef.current = path;
  textRef.current = text;
  loadingRef.current = loading;
  resolvePathRef.current = resolvePath;
  fallbackTextRef.current = fallbackText;
  reportLoadErrorRef.current = reportLoadError;

  const saveCurrentRevision = useCallback(async (): Promise<boolean> => {
    if (revisionRef.current === 0) return true;
    if (savePromiseRef.current) return savePromiseRef.current;

    const notePath = pathRef.current;
    if (!notePath || loadingRef.current) return false;

    const revision = revisionRef.current;
    const content = textRef.current;
    const savePromise = (async () => {
      setSaving(true);
      setError("");
      try {
        const nextSavedAt = await persistGovernedRecordNote(notePath, content);
        if (
          revisionRef.current === revision &&
          pathRef.current === notePath
        ) {
          revisionRef.current = 0;
        }
        setSavedAt(nextSavedAt);
        setExists(true);
        return true;
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : String(saveError),
        );
        return false;
      } finally {
        setSaving(false);
        savePromiseRef.current = null;
      }
    })();

    savePromiseRef.current = savePromise;
    return savePromise;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) {
      const saved = await savePromiseRef.current;
      if (!saved) return false;
    }
    return saveCurrentRevision();
  }, [saveCurrentRevision]);

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(flush);
    return () => registerBeforeTabChangeSaver(null);
  }, [flush, registerBeforeTabChangeSaver]);

  useEffect(() => {
    let cancelled = false;

    async function loadNote(): Promise<void> {
      if (revisionRef.current > 0) {
        const saved = await flush();
        if (!saved || cancelled) return;
      }

      if (!recordKey) {
        revisionRef.current = 0;
        setPath(null);
        setText("");
        setError("");
        setSavedAt(null);
        setExists(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const nextPath = resolvePathRef.current
          ? await resolvePathRef.current()
          : directPath;
        if (cancelled) return;

        const normalizedPath = nextPath?.trim() || null;
        setPath(normalizedPath);
        if (!normalizedPath) {
          revisionRef.current = 0;
          setText(fallbackTextRef.current);
          setSavedAt(null);
          setExists(false);
          return;
        }

        try {
          const parsed = await readO2File(normalizedPath);
          if (cancelled) return;

          revisionRef.current = 0;
          setText(parsed.content || "");
          setSavedAt(typeof parsed.mtime === "number" ? parsed.mtime : null);
          setExists(true);
        } catch (loadError) {
          if (cancelled) return;

          revisionRef.current = 0;
          setText(fallbackTextRef.current);
          setSavedAt(null);
          setExists(false);
          if (reportLoadErrorRef.current) {
            setError(
              loadError instanceof Error ? loadError.message : String(loadError),
            );
          }
        }
      } catch (resolveError) {
        if (cancelled) return;

        setPath(directPath?.trim() || null);
        setText(fallbackTextRef.current);
        setSavedAt(null);
        setExists(false);
        setError(
          resolveError instanceof Error
            ? resolveError.message
            : String(resolveError),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNote();
    return () => {
      cancelled = true;
    };
  }, [directPath, flush, recordKey, recordVersion]);

  useEffect(() => {
    if (!recordKey || !path || loading || revisionRef.current === 0) return;

    const revision = revisionRef.current;
    const timeoutId = window.setTimeout(() => {
      if (revisionRef.current === revision) void saveCurrentRevision();
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, loading, path, recordKey, saveCurrentRevision, text]);

  const onTextChange = useCallback((value: string): void => {
    revisionRef.current += 1;
    textRef.current = value;
    setText(value);
  }, []);

  const dirty = revisionRef.current > 0;
  const status = loading
    ? "Loading note..."
    : saving
      ? "Saving..."
      : error
        ? error
        : dirty
          ? "Unsaved changes"
          : savedAt
            ? `Saved ${new Date(savedAt).toLocaleString()}`
            : exists
              ? "Governed note"
              : missingStatus;

  return {
    path,
    text,
    loading,
    saving,
    error,
    exists,
    dirty,
    status,
    onTextChange,
    flush,
  };
}
