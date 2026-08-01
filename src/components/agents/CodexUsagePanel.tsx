export function CodexUsagePanel() {
  return (
    <section
      className="surfaceCard"
      data-testid="codex-usage-panel"
      style={{
        display: "grid",
        gap: 10,
        marginBottom: 8,
        borderColor: "rgba(112, 74, 170, 0.35)",
        background: "linear-gradient(135deg, rgba(247, 241, 255, 0.96), rgba(255, 255, 255, 0.96))",
      }}
    >
      <div className="surfaceCardTitleRow">
        <div>
          <div className="surfaceCardTitle">Codex / ChatGPT usage</div>
          <div className="surfaceMutedSmall">Phase 1 visibility panel</div>
        </div>
        <span
          style={{
            border: "1px solid rgba(112, 74, 170, 0.35)",
            borderRadius: 999,
            padding: "3px 9px",
            color: "#5b378f",
            fontSize: "0.72rem",
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Manual
        </span>
      </div>

      <div
        aria-label="Codex usage data unavailable to RadControl"
        style={{
          height: 12,
          overflow: "hidden",
          border: "1px solid rgba(112, 74, 170, 0.28)",
          borderRadius: 999,
          background: "rgba(112, 74, 170, 0.08)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "repeating-linear-gradient(-45deg, rgba(112, 74, 170, 0.4) 0, rgba(112, 74, 170, 0.4) 8px, rgba(112, 74, 170, 0.16) 8px, rgba(112, 74, 170, 0.16) 16px)",
          }}
        />
      </div>
      <p className="surfaceMutedSmall">
        RadControl cannot read personal ChatGPT or Codex token balances through a documented
        public API, so this bar intentionally does not invent a percentage or collect credentials.
      </p>
      <p className="surfaceMutedSmall">
        Check the live balance in ChatGPT under <strong>Codex Settings → Usage Dashboard</strong>.
      </p>
      <a
        className="btn btnSecondary"
        href="https://chatgpt.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open ChatGPT
      </a>
    </section>
  );
}
