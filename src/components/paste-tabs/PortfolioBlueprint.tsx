import { useCallback, useEffect, useState } from "react";
import { readO2File } from "../common/o2Files";
import {
  parsePortfolioBlueprint,
  portfolioStatusLabel,
  PORTFOLIO_BLUEPRINT_PATH,
  type PortfolioBlueprint,
  type PortfolioRecordStatus,
} from "./portfolioBlueprintModel";

const statusClass: Record<PortfolioRecordStatus, string> = {
  confirmed: "portfolioStatus portfolioStatusConfirmed",
  planned: "portfolioStatus portfolioStatusPlanned",
  needs_verification: "portfolioStatus portfolioStatusNeedsVerification",
};

export function PortfolioBlueprint() {
  const [blueprint, setBlueprint] = useState<PortfolioBlueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await readO2File(PORTFOLIO_BLUEPRINT_PATH);
      setBlueprint(parsePortfolioBlueprint(JSON.parse(response.content || "")));
    } catch (reason) {
      setBlueprint(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !blueprint) {
    return <div className="portfolioLoading">Loading the O2 portfolio blueprint…</div>;
  }

  if (error || !blueprint) {
    return (
      <section className="portfolioError" aria-live="polite">
        <div>
          <strong>Portfolio Blueprint unavailable</strong>
          <p>{error || "O2 did not return a portfolio blueprint."}</p>
        </div>
        <button type="button" className="btn btnGhost" onClick={() => void refresh()}>
          Retry
        </button>
      </section>
    );
  }

  const labels = new Map(blueprint.records.map((record) => [record.key, record.label]));

  return (
    <section className="portfolioBlueprint" aria-label="Portfolio blueprint">
      <header className="portfolioHeader">
        <div>
          <div className="portfolioEyebrow">O2 GOVERNED REFERENCE · LEGAL PLANNING</div>
          <h2>{blueprint.title}</h2>
          <p>{blueprint.purpose}</p>
        </div>
        <div className="portfolioHeaderActions">
          <span className="portfolioMeta">Reviewed {blueprint.reviewedAt}</span>
          <button type="button" className="btn btnGhost" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="portfolioCallout">
        <strong>Planning boundary</strong>
        <span>This is an internal planning map, not legal advice or proof of formation, ownership, or partner rights.</span>
      </div>

      <section className="portfolioSection">
        <div className="portfolioSectionHeader">
          <h3>Portfolio map</h3>
          <span>{blueprint.records.length} records · statuses are explicit</span>
        </div>
        <div className="portfolioGrid">
          {blueprint.records.map((record) => (
            <article className="portfolioCard" key={record.key}>
              <div className="portfolioCardTopline">
                <span className="portfolioKind">{record.kind.replace(/-/g, " ")}</span>
                <span className={statusClass[record.status]}>
                  {portfolioStatusLabel(record.status)}
                </span>
              </div>
              <h4>{record.label}</h4>
              <p className="portfolioRole">{record.role}</p>
              <dl className="portfolioFacts">
                <div>
                  <dt>Planning relationship</dt>
                  <dd>{record.parentKey ? labels.get(record.parentKey) : "Independent boundary"}</dd>
                </div>
                <div>
                  <dt>Relationship status</dt>
                  <dd>{portfolioStatusLabel(record.relationshipStatus)}</dd>
                </div>
              </dl>
              <p className="portfolioNotes">{record.notes}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="portfolioLowerGrid">
        <section className="portfolioSection portfolioListCard">
          <h3>Operating guardrails</h3>
          <ul>{blueprint.guardrails.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section className="portfolioSection portfolioListCard">
          <h3>Next decisions</h3>
          <ol>{blueprint.nextDecisions.map((item) => <li key={item}>{item}</li>)}</ol>
        </section>
      </div>
    </section>
  );
}
