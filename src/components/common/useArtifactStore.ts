import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type RunO2Result = {
  ok?: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
};

export type FilesListItem = {
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

type RefreshListOptions = {
  autoReadPreferred?: boolean;
};

type RunProducerOptions = {
  refreshArtifacts?: boolean;
};

type SaveCurrentOptions = {
  latestFileName?: string;
  timestampCommitMessage: string;
  latestCommitMessage: string;
};

type UseArtifactStoreArgs = {
  dir: string;
  latestFileName: string;
  timestampStem: string;
  extension: string;
  producerVerb?: string;
  producerErrorFallback?: string;
};

function errMsg(res: RunO2Result, fallback: string): string {
  return (res.stderr || "").trim() || fallback;
}

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

function formatTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatMaybeUnixTime(value?: number): string {
  if (!value || !Number.isFinite(value)) return "—";
  const ms = value < 1000000000000 ? value * 1000 : value;
  return new Date(ms).toLocaleString();
}

function makeTimestampFilename(
  stem: string,
  extension: string,
  now = new Date(),
): string {
  const yyyy = String(now.getFullYear());
  const mm = formatTimestampPart(now.getMonth() + 1);
  const dd = formatTimestampPart(now.getDate());
  const hh = formatTimestampPart(now.getHours());
  const mi = formatTimestampPart(now.getMinutes());
  const ss = formatTimestampPart(now.getSeconds());
  return `${stem}_${yyyy}${mm}${dd}_${hh}${mi}${ss}.${extension}`;
}

function sortArtifactItems(items: FilesListItem[], dirPrefix: string) {
  return items
    .filter(
      (item) => typeof item.path === "string" && item.path.trim().length > 0,
    )
    .filter((item) => (item.path || "").startsWith(dirPrefix))
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

function getPreferredArtifactPath(
  items: FilesListItem[],
  dir: string,
  latestFileName: string,
): string | null {
  const preferredLatest = items.find(
    (item) =>
      (item.path || "").toLowerCase() ===
      `${dir}/${latestFileName}`.toLowerCase(),
  );

  return preferredLatest?.path || items[0]?.path || null;
}

export function useArtifactStore({
  dir,
  latestFileName,
  timestampStem,
  extension,
  producerVerb,
  producerErrorFallback,
}: UseArtifactStoreArgs) {
  const dirPrefix = useMemo(() => `${dir}/`, [dir]);

  const [items, setItems] = useState<FilesListItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const loadSeqRef = useRef(0);
  const producerInFlightRef = useRef(false);

  const docsInFolder = useMemo(
    () => sortArtifactItems(items, dirPrefix),
    [dirPrefix, items],
  );

  const readPath = useCallback(async (path: string) => {
    const encoded = b64urlEncodeUtf8(path);
    const res = (await invoke("run_o2", {
      verb: `files.read.${encoded}`,
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
  }, []);

  const refreshList = useCallback(
    async (options?: RefreshListOptions) => {
      const seq = ++loadSeqRef.current;
      const autoReadPreferred = options?.autoReadPreferred ?? false;

      setLoading(true);
      setErr("");

      try {
        const res = (await invoke("run_o2", {
          verb: "files.list",
        })) as RunO2Result;

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

        if (seq !== loadSeqRef.current) return;

        const nextItems = Array.isArray(parsed.items) ? parsed.items : [];
        setItems(nextItems);

        if (!autoReadPreferred) return;

        const files = sortArtifactItems(nextItems, dirPrefix);
        const nextPath = getPreferredArtifactPath(files, dir, latestFileName);

        if (nextPath) {
          await readPath(nextPath);
        } else {
          setCurrentPath(null);
          setCurrentText("");
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [dir, dirPrefix, latestFileName, readPath],
  );

  const runProducer = useCallback(
    async (options?: RunProducerOptions) => {
      if (!producerVerb) {
        throw new Error("No producer verb configured.");
      }

      if (producerInFlightRef.current) return;

      producerInFlightRef.current = true;
      setRunning(true);
      setErr("");

      try {
        const res = (await invoke("run_o2", {
          verb: producerVerb,
        })) as RunO2Result;

        if (!res.ok) {
          throw new Error(
            errMsg(res, producerErrorFallback || `${producerVerb} failed`),
          );
        }

        setCurrentText(res.stdout || "");
        setCurrentPath(null);

        if (options?.refreshArtifacts) {
          await refreshList({ autoReadPreferred: false });
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        producerInFlightRef.current = false;
        setRunning(false);
      }
    },
    [producerVerb, producerErrorFallback, refreshList],
  );

  const saveCurrent = useCallback(
    async ({
      latestFileName: latestOverride,
      timestampCommitMessage,
      latestCommitMessage,
    }: SaveCurrentOptions) => {
      if (saving) return;

      if (!currentText.trim()) {
        setErr("Nothing to save.");
        return;
      }

      const finalLatestFileName = latestOverride || latestFileName;

      setSaving(true);
      setErr("");

      try {
        const timestampName = makeTimestampFilename(timestampStem, extension);

        const writes = [
          {
            path: `${dir}/${timestampName}`,
            content: currentText,
            commit: true,
            commitMessage: timestampCommitMessage,
          },
          {
            path: `${dir}/${finalLatestFileName}`,
            content: currentText,
            commit: true,
            commitMessage: latestCommitMessage,
          },
        ];

        for (const payload of writes) {
          const encoded = b64urlEncodeUtf8(JSON.stringify(payload));
          const res = (await invoke("run_o2", {
            verb: `files.write.${encoded}`,
          })) as RunO2Result;

          if (!res.ok) {
            throw new Error(errMsg(res, "files.write failed"));
          }

          let parsed: FilesWriteJson;
          try {
            parsed = JSON.parse((res.stdout || "").trim()) as FilesWriteJson;
          } catch {
            throw new Error("files.write returned invalid JSON");
          }

          if (!parsed.ok) {
            throw new Error(parsed.error || "files.write returned error");
          }

          if (payload.path.endsWith(`/${finalLatestFileName}`)) {
            setCurrentPath(parsed.path || payload.path);
            setLastSavedAt(parsed.mtime || Date.now());
          }
        }

        await refreshList({ autoReadPreferred: false });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [
      currentText,
      dir,
      extension,
      latestFileName,
      refreshList,
      saving,
      timestampStem,
    ],
  );

  return {
    dir,
    dirPrefix,
    items,
    docsInFolder,
    currentPath,
    currentText,
    loading,
    saving,
    running,
    err,
    lastSavedAt,
    setCurrentPath,
    setCurrentText,
    setErr,
    readPath,
    refreshList,
    runProducer,
    saveCurrent,
  };
}
