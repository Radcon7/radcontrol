type Props = {
  title: string;

  topLabel: string;
  topValue: string;
  onTopChange: (v: string) => void;
  topPlaceholder?: string;

  bottomLabel: string;
  bottomValue: string;
  bottomPlaceholder?: string;

  busy?: boolean;

  onRun?: () => void | Promise<void>;
  runLabel?: string;

  onCopy?: () => void;
  onClear?: () => void;
};

export function SplitTextPanel(props: Props) {
  const {
    title,
    topLabel,
    topValue,
    onTopChange,
    topPlaceholder,
    bottomLabel,
    bottomValue,
    bottomPlaceholder,
    busy,
    onRun,
    runLabel,
    onCopy,
    onClear,
  } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {onRun ? (
            <button
              className="btn btnPrimary"
              onClick={() => void onRun()}
              disabled={Boolean(busy)}
              title={runLabel || "Run"}
            >
              {busy ? "Running…" : runLabel || "Run"}
            </button>
          ) : null}

          <button
            className="btn btnGhost"
            onClick={onCopy}
            disabled={!onCopy || (bottomValue || "").trim().length === 0}
          >
            Copy
          </button>

          <button
            className="btn btnGhost"
            onClick={onClear}
            disabled={!onClear || Boolean(busy)}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{topLabel}</div>
        <textarea
          value={topValue}
          onChange={(e) => onTopChange(e.target.value)}
          placeholder={topPlaceholder}
          style={{
            width: "100%",
            minHeight: 220,
            resize: "vertical",
            padding: 10,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.25)",
            color: "inherit",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            lineHeight: 1.35,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{bottomLabel}</div>
        <textarea
          readOnly
          value={bottomValue}
          placeholder={bottomPlaceholder}
          style={{
            width: "100%",
            minHeight: 260,
            resize: "vertical",
            padding: 10,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.35)",
            color: "inherit",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            lineHeight: 1.35,
            whiteSpace: "pre",
          }}
        />
      </div>
    </div>
  );
}