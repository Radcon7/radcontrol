import React, { useEffect, useMemo, useRef, useState } from "react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="sectionTitle">{children}</div>;
}

type HistoryEntry = {
  id: string;
  ts: number;
  text: string;
};

function historyKeyFor(storageKey: string) {
  return `${storageKey}.history`;
}

function safeReadHistory(key: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as { id?: unknown; ts?: unknown; text?: unknown };
        if (typeof o.id !== "string") return null;
        if (typeof o.ts !== "number") return null;
        if (typeof o.text !== "string") return null;
        return { id: o.id, ts: o.ts, text: o.text } satisfies HistoryEntry;
      })
      .filter((x): x is HistoryEntry => Boolean(x));
  } catch {
    return [];
  }
}

function safeWriteHistory(key: string, entries: HistoryEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // ignore (quota / blocked storage) — UI still works as a simple paste area
  }
}

function fmtTs(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function preview(text: string) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(empty)";
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

/**
 * IMPORTANT: Must be defined OUTSIDE App().
 * Defining inside App() can cause remounts on every keystroke in Tauri/WebView.
 */
export function PasteAreaTab({
  title,
  value,
  onChange,
  storageKey,
  placeholder,
  busy,
  onCopy,
  isBundleTab,
  onExportBundle,
  onImportBundle,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  storageKey: string;
  placeholder: string;
  busy: boolean;
  onCopy: (text: string) => void;
  isBundleTab: boolean;
  onExportBundle: () => void;
  onImportBundle: () => void;
}) {
  const histKey = useMemo(() => historyKeyFor(storageKey), [storageKey]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Edit-session tracker: archive the pre-edit value once per "pause gap",
  // instead of on every keystroke.
  const lastEditAtRef = useRef<number>(0);

  useEffect(() => {
    const h = safeReadHistory(histKey);
    setHistory(h);
    setSelectedId((prev) => {
      if (!prev) return null;
      return h.some((e) => e.id === prev) ? prev : null;
    });
  }, [histKey]);

  const selected = useMemo(
    () => history.find((e) => e.id === selectedId) ?? null,
    [history, selectedId],
  );

  function archiveText(
    textToArchive: string,
    reason: "clear" | "restore" | "edit",
  ) {
    const t = textToArchive ?? "";
    const trimmed = t.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      const last = prev[0]; // newest-first
      if (last && last.text === t) return prev;

      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ts: Date.now(),
        text: t,
      };

      // newest-first, cap size to keep localStorage sane
      const next = [entry, ...prev].slice(0, 50);
      safeWriteHistory(histKey, next);
      return next;
    });

    // if nothing selected, keep it simple and auto-select newest after archive
    if (!selectedId && reason !== "edit") {
      setSelectedId((_) => null); // leave null; user can click
    }
  }

  function handleClear() {
    archiveText(value, "clear");
    onChange("");
  }

  function handleRestoreSelected() {
    if (!selected) return;
    archiveText(value, "restore");
    onChange(selected.text);
  }

  function handleDeleteSelected() {
    if (!selected) return;

    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== selected.id);
      safeWriteHistory(histKey, next);
      return next;
    });
    setSelectedId(null);
  }

  function handleChange(nextText: string) {
    const now = Date.now();
    const gapMs = now - (lastEditAtRef.current || 0);

    // If the user paused typing (or just started), archive the pre-edit value once.
    if (gapMs > 2000) {
      archiveText(value, "edit");
    }

    lastEditAtRef.current = now;
    onChange(nextText);
  }

  return (
    <div className="placeholderTab">
      <SectionTitle>{title}</SectionTitle>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="btn btnPrimary"
          onClick={() => onCopy(value)}
          disabled={busy}
          title="Copy to clipboard"
        >
          Copy
        </button>

        <button
          className="btn btnGhost"
          onClick={handleClear}
          disabled={busy}
          title="Clear this page (archives current text)"
        >
          Clear
        </button>

        <button
          className="btn btnGhost"
          onClick={handleRestoreSelected}
          disabled={busy || !selected}
          title="Restore the selected historical version (archives current text)"
        >
          Restore selected
        </button>

        <button
          className="btn btnGhost"
          onClick={handleDeleteSelected}
          disabled={busy || !selected}
          title="Delete the selected historical version"
        >
          Delete selected
        </button>

        {isBundleTab ? (
          <>
            <button
              className="btn btnGhost"
              onClick={() => onExportBundle()}
              disabled={busy}
              title="Copy a JSON bundle containing both Notes + Roadmap"
            >
              Export (Notes+Roadmap)
            </button>

            <button
              className="btn btnGhost"
              onClick={() => onImportBundle()}
              disabled={busy}
              title="Restore Notes + Roadmap from a JSON bundle in clipboard"
            >
              Import (Notes+Roadmap)
            </button>
          </>
        ) : null}

        <div style={{ opacity: 0.7, fontSize: 12 }}>
          Autosaves locally: <code>{storageKey}</code> • History:{" "}
          <code>{histKey}</code>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {/* Left: history panel */}
        <div
          style={{
            width: 340,
            minWidth: 280,
            maxWidth: 420,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "10px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.10)",
              fontSize: 12,
              opacity: 0.85,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>Version history</div>
            <div style={{ opacity: 0.75 }}>{history.length} saved</div>
          </div>

          <div
            style={{
              padding: 6,
              overflowY: "auto",
              maxHeight: "56vh",
            }}
          >
            {history.length === 0 ? (
              <div style={{ padding: 8, opacity: 0.7, fontSize: 12 }}>
                No history yet. Versions are saved when you clear, restore, or
                when you start editing after a short pause.
              </div>
            ) : (
              history.map((h) => {
                const active = h.id === selectedId;
                return (
                  <button
                    key={h.id}
                    onClick={() => setSelectedId(h.id)}
                    disabled={busy}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 10px",
                      marginBottom: 6,
                      borderRadius: 10,
                      border: active
                        ? "1px solid rgba(255,255,255,0.26)"
                        : "1px solid rgba(255,255,255,0.10)",
                      background: active
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.12)",
                      color: "rgba(255,255,255,0.92)",
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                    title={fmtTs(h.ts)}
                  >
                    <div
                      style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}
                    >
                      {fmtTs(h.ts)}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.25 }}>
                      {preview(h.text)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            style={{
              ...inputStyle,
              minHeight: "52vh",
              resize: "vertical",
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              lineHeight: 1.4,
            }}
            disabled={busy}
          />
        </div>
      </div>
    </div>
  );
}
