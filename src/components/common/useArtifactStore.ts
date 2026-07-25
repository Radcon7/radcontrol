import { useCallback, useMemo, useRef, useState } from "react";
import {
  type FilesListItem,
  errMsg,
  listO2Files,
  readO2File,
  runO2,
  writeO2File,
} from "./o2Files";

export type { FilesListItem } from "./o2Files";

type RefreshListOptions = {
  autoReadPreferred?: boolean;
};

type RunProducerOptions = {
  refreshArtifacts?: boolean;
  autoReadPreferred?: boolean;
};

type SaveCurrentOptions = {
  latestFileName?: string;
  timestampCommitMessage: string;
  latestCommitMessage: string;
  autoReadPreferred?: boolean;
  preferSavedTimestamp?: boolean;
};

type UseArtifactStoreArgs = {
  dir: string;
  latestFileName: string;
  timestampStem: string;
  extension: string;
  producerVerb?: string;
  producerErrorFallback?: string;
};

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
  const latestPath = `${dir}/${latestFileName}`.toLowerCase();

  const newestSavedRun = items.find(
    (item) => (item.path || "").toLowerCase() !== latestPath,
  );

  if (newestSavedRun?.path) {
    return newestSavedRun.path;
  }

  const preferredLatest = items.find(
    (item) => (item.path || "").toLowerCase() === latestPath,
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
  const latestArtifactPath = useMemo(
    () => `${dir}/${latestFileName}`.toLowerCase(),
    [dir, latestFileName],
  );
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
    () =>
      sortArtifactItems(items, dirPrefix).filter(
        (item) => (item.path || "").toLowerCase() !== latestArtifactPath,
      ),
    [dirPrefix, items, latestArtifactPath],
  );

  const readPath = useCallback(async (path: string) => {
    const parsed = await readO2File(path);

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
        const parsed = await listO2Files(dir);

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
        return null;
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [dir, dirPrefix, latestFileName, readPath],
  );

  const runProducer = useCallback(
    async (options?: RunProducerOptions): Promise<string | null> => {
      if (!producerVerb) {
        throw new Error("No producer verb configured.");
      }

      if (producerInFlightRef.current) return null;

      producerInFlightRef.current = true;
      setRunning(true);
      setErr("");

      try {
        const res = await runO2(producerVerb);

        if (!res.ok) {
          throw new Error(
            errMsg(res, producerErrorFallback || `${producerVerb} failed`),
          );
        }

        setCurrentText(res.stdout || "");
        setCurrentPath(null);

        if (options?.refreshArtifacts) {
          await refreshList({
            autoReadPreferred: options.autoReadPreferred ?? false,
          });
        }

        return res.stdout || "";
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return null;
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
      autoReadPreferred = false,
      preferSavedTimestamp = false,
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

        let timestampSavedPath: string | null = null;

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
          const parsed = await writeO2File(payload);

          const resolvedPath = parsed.path || payload.path;

          if (payload.path.endsWith(`/${timestampName}`)) {
            timestampSavedPath = resolvedPath;
          }

          if (payload.path.endsWith(`/${finalLatestFileName}`)) {
            setCurrentPath(resolvedPath);
            setLastSavedAt(parsed.mtime || Date.now());
          }
        }

        await refreshList({
          autoReadPreferred: autoReadPreferred && !preferSavedTimestamp,
        });

        if (preferSavedTimestamp && timestampSavedPath) {
          await readPath(timestampSavedPath);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [
      currentText,
      dir,
      extension,
      latestFileName,
      readPath,
      refreshList,
      saving,
      timestampStem,
    ],
  );

  const runProducerAndSave = useCallback(
    async (options: SaveCurrentOptions) => {
      const out = await runProducer({ refreshArtifacts: false });
      if (!out || !out.trim()) return;

      await saveCurrent({
        ...options,
        preferSavedTimestamp: true,
      });
    },
    [runProducer, saveCurrent],
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
    runProducerAndSave,
    saveCurrent,
  };
}
