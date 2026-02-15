import React from "react";

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
          onClick={() => onChange("")}
          disabled={busy}
          title="Clear this page"
        >
          Clear
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
          Autosaves locally: <code>{storageKey}</code>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
  );
}
