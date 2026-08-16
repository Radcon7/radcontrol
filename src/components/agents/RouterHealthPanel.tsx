import { useCallback, useEffect, useState } from "react";
import { runO2ParsedJson } from "../common/o2Client";

type RouterHealth = {
  ok: boolean;
  contractVersion: string;
  repositoryCount: number;
  summary: Record<string, number>;
  repositories: Array<{
    projectKey: string;
    archetype: string;
    routerStatus: string;
    contractVersion: string | null;
    defaultBranch: string | null;
    defaultBranchDurable: boolean;
    activeBranchDrift: boolean;
    missingLocalAuthority: string[];
    recommendedNextAction: string;
  }>;
};

export function RouterHealthPanel() {
  const [report, setReport] = useState<RouterHealth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await runO2ParsedJson<RouterHealth>(
        "router.health",
        "Could not load repository router health",
        "Repository router health returned invalid data",
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="surfaceCard routerHealthPanel" data-testid="router-health-panel">
      <div className="surfaceCardTitleRow">
        <div>
          <div className="surfaceCardTitle">Repository Router Durability</div>
          <p className="surfaceCardLead">
            Safe O2 status for fresh default-branch Codex sessions. RadControl keeps no duplicate registry.
          </p>
        </div>
        <div className="routerHealthActions">
          <span className={`routerHealthState routerHealthState-${report?.ok ? "healthy" : "attention"}`}>
            {report ? (report.ok ? "Durable" : "Needs review") : loading ? "Checking…" : "Unknown"}
          </span>
          <button className="btn btnGhost btnCompact" type="button" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="panelError">{error}</div> : null}
      {report ? (
        <>
          <div className="routerHealthSummary">
            <strong>{report.repositoryCount} active repositories · contract v{report.contractVersion}</strong>
            <span>{Object.entries(report.summary).map(([status, count]) => `${status}: ${count}`).join(" · ")}</span>
          </div>
          <div className="routerHealthList">
            {report.repositories.map((repository) => (
              <article key={repository.projectKey} data-status={repository.routerStatus}>
                <span>
                  <strong>{repository.projectKey}</strong>
                  <small>{repository.archetype} · {repository.defaultBranch || "unknown default"}</small>
                </span>
                <span>
                  <strong>{repository.routerStatus}</strong>
                  {!repository.defaultBranchDurable ? <small>{repository.recommendedNextAction}</small> : null}
                  {repository.missingLocalAuthority.length ? <small>Missing: {repository.missingLocalAuthority.join(", ")}</small> : null}
                  {repository.activeBranchDrift ? <small>Active branch differs from durable default</small> : null}
                </span>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
