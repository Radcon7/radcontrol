export function CodexUsagePanel() {
  return (
    <section
      className="surfaceSummaryRow"
      data-testid="codex-usage-panel"
      style={{
        display: "grid",
        gap: 8,
        margin: 0,
        borderColor: "rgba(112, 74, 170, 0.35)",
        background: "linear-gradient(135deg, rgba(247, 241, 255, 0.96), rgba(255, 255, 255, 0.96))",
      }}
    >
      <div className="surfaceCardTitleRow">
        <div>
          <div className="surfaceCardTitle">Codex / ChatGPT usage</div>
          <div className="surfaceMutedSmall">Phase 1 · live data not connected</div>
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
          NOT LIVE
        </span>
      </div>

      <div
        aria-label="Codex usage status unavailable to RadControl"
        title="Live Codex usage is not connected"
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
      <p className="surfaceMutedSmall" style={{ color: "#3f2a63", opacity: 1, fontWeight: 700 }}>
        Live percentage unavailable here. RadControl does not collect ChatGPT credentials or
        invent a usage value.
      </p>
      <p className="surfaceMutedSmall" style={{ color: "#4b3b5f", opacity: 1 }}>
        Check the live balance in <strong>Codex Settings → Usage Dashboard</strong>.
      </p>
      <p className="surfaceMutedSmall" style={{ color: "#4b3b5f", opacity: 1 }}>
        Phase 2 candidate: the local Codex app-server exposes rate-limit and usage-read methods;
        RadControl would query that local service without storing your ChatGPT session.
      </p>
      <a
        className="btn btnSecondary"
        href="https://chatgpt.com/codex/settings/usage"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open ChatGPT
      </a>
    </section>
  );
}
