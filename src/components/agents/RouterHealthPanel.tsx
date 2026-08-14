import { useEffect, useState } from "react";
import { runO2ParsedJson } from "../common/o2Files";

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

  useEffect(() => {
    void runO2ParsedJson<RouterHealth>(
      "router.health",
      "Could not load repository router health",
      "Repository router health returned invalid data",
    ).then(setReport).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, []);

  return (
    <section className="workstationHealth" data-testid="router-health-panel">
      <div className="workstationHealthHeader">
        <div>
          <div className="surfaceCardTitle">Repository Router Durability</div>
          <p className="workstationHealthIntro">
            Safe O2 status for fresh default-branch Codex sessions. RadControl keeps no duplicate registry.
          </p>
        </div>
        <span className={`workstationStatus workstationStatus-${report?.ok ? "healthy" : "attention"}`}>
          {report ? (report.ok ? "Durable" : "Needs review") : "Checking…"}
        </span>
      </div>

      {error ? <div className="workstationMessage workstationMessageError">{error}</div> : null}
      {report ? (
        <>
          <div className="workstationSummary">
            <strong>{report.repositoryCount} active repositories · contract v{report.contractVersion}</strong>
            <span>{Object.entries(report.summary).map(([status, count]) => `${status}: ${count}`).join(" · ")}</span>
          </div>
          <div className="workstationMessage">
            {report.repositories.map((repository) => (
              <div key={repository.projectKey}>
                <strong>{repository.projectKey}</strong> · {repository.routerStatus} · {repository.defaultBranch || "unknown default"}
                {!repository.defaultBranchDurable ? ` · ${repository.recommendedNextAction}` : ""}
                {repository.missingLocalAuthority.length ? ` · missing: ${repository.missingLocalAuthority.join(", ")}` : ""}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
