type Props = {
  title?: string;

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

  const hasStandaloneHeader =
    Boolean(title) || Boolean(onRun) || Boolean(onCopy) || Boolean(onClear);
  const hasActions = Boolean(onRun) || Boolean(onCopy) || Boolean(onClear);

  return (
    <div className="splitTextPanel">
      {hasStandaloneHeader ? (
        <div className="splitTextPanelHeader">
          {title ? <div className="splitTextPanelTitle">{title}</div> : null}

          {hasActions ? (
            <div className="splitTextPanelActions">
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

              {onCopy ? (
                <button
                  className="btn btnGhost"
                  onClick={onCopy}
                  disabled={(bottomValue || "").trim().length === 0}
                >
                  Copy
                </button>
              ) : null}

              {onClear ? (
                <button
                  className="btn btnGhost"
                  onClick={onClear}
                  disabled={Boolean(busy)}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="splitTextPanelBody">
        <div className="splitTextPanelSection">
          <div className="splitTextPanelLabel">{topLabel}</div>
          <textarea
            value={topValue}
            onChange={(e) => onTopChange(e.target.value)}
            placeholder={topPlaceholder}
            disabled={Boolean(busy)}
            spellCheck={false}
            className="pasteArea splitTextPanelTopArea"
          />
        </div>

        <div className="splitTextPanelSection splitTextPanelSectionFill">
          <div className="splitTextPanelLabel">{bottomLabel}</div>
          <textarea
            readOnly
            value={bottomValue}
            placeholder={bottomPlaceholder}
            spellCheck={false}
            className="pasteArea splitTextPanelBottomArea"
          />
        </div>
      </div>
    </div>
  );
}
