import { useCallback, useEffect, useState } from "react";
import { runO2ParsedJson, runO2PayloadParsedJson } from "../common/o2Files";
import {
  LEARNING_CANDIDATE_STATUSES,
  parseCandidateListSummary,
  parseSafeMemoryStatus,
  type LearningCandidateStatus,
  type SafeCandidateSummary,
  type SafeMemoryStatus,
} from "./governanceLearningModel";

type LearningSnapshot = {
  counts: Record<LearningCandidateStatus, number>;
  promoted: SafeCandidateSummary[];
};

function blankCounts(): Record<LearningCandidateStatus, number> {
  return Object.fromEntries(
    LEARNING_CANDIDATE_STATUSES.map((status) => [status, 0]),
  ) as Record<LearningCandidateStatus, number>;
}

async function loadLearningSnapshot(): Promise<LearningSnapshot> {
  const rows = await Promise.all(
    LEARNING_CANDIDATE_STATUSES.map(async (status) => {
      const response = await runO2PayloadParsedJson<unknown>(
        "lesson.candidate.list",
        { status, limit: status === "promoted" ? 5 : 1 },
        "Learning queue unavailable",
        "Learning queue returned invalid data",
      );
      return [status, parseCandidateListSummary(response, status)] as const;
    }),
  );
  const counts = blankCounts();
  let promoted: SafeCandidateSummary[] = [];
  rows.forEach(([status, summary]) => {
    counts[status] = summary.totalMatched;
    if (status === "promoted") promoted = summary.candidates;
  });
  return { counts, promoted };
}

function formatTimestamp(value: string | null): string {
  if (!value) return "None yet";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "Recorded";
}

export function GovernanceLearningStatus() {
  const [learning, setLearning] = useState<LearningSnapshot | null>(null);
  const [memory, setMemory] = useState<SafeMemoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [learningDegraded, setLearningDegraded] = useState(false);
  const [memoryDegraded, setMemoryDegraded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [learningResult, memoryResult] = await Promise.allSettled([
      loadLearningSnapshot(),
      runO2ParsedJson<unknown>(
        "codex.memory.status",
        "Memory status unavailable",
        "Memory status returned invalid data",
      ).then(parseSafeMemoryStatus),
    ]);

    if (learningResult.status === "fulfilled") {
      setLearning(learningResult.value);
      setLearningDegraded(false);
    } else {
      setLearning(null);
      setLearningDegraded(true);
    }
    if (memoryResult.status === "fulfilled") {
      setMemory(memoryResult.value);
      setMemoryDegraded(false);
    } else {
      setMemory(null);
      setMemoryDegraded(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const total = learning
    ? Object.values(learning.counts).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <section className="governanceLearningStatus" data-testid="governance-learning-status">
      <div className="governanceLearningHeader">
        <div>
          <strong>Institutional learning</strong>
          <span>Read-only O2 lifecycle and local Codex memory metadata</span>
        </div>
        <button
          type="button"
          className="btn btnGhost"
          onClick={() => void refresh()}
          disabled={loading}
          data-testid="governance-learning-refresh"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {learning ? (
        <div data-testid="learning-queue-summary">
          <div className="governanceLearningCounts">
            <div><span>All candidates</span><strong>{total}</strong></div>
            <div><span>Proposed</span><strong>{learning.counts.proposed}</strong></div>
            <div><span>Needs evidence</span><strong>{learning.counts["needs-evidence"]}</strong></div>
            <div><span>Accepted</span><strong>{learning.counts.accepted}</strong></div>
            <div><span>Promoted</span><strong>{learning.counts.promoted}</strong></div>
          </div>
          <div className="governanceLearningBoundary">
            Proposed and accepted candidates remain non-authoritative. Only a completed,
            catalog-linked promotion becomes durable guidance.
          </div>
          <div className="governanceLearningPromoted" data-testid="promoted-learning-list">
            <strong>Latest promoted</strong>
            {learning.promoted.length ? learning.promoted.map((candidate) => (
              <article key={candidate.id} data-testid={`promoted-candidate-${candidate.id}`}>
                <span>{candidate.title}</span>
                <small>
                  {candidate.id} · {candidate.status}
                  {candidate.promotionState ? ` · Lifecycle: ${candidate.promotionState}` : ""}
                </small>
                {candidate.authorityLinked ? candidate.authorityLinks.map((link) => (
                  <small key={link.id}>
                    Authority: {link.title} · {link.id} · {link.lifecycleStatus}
                  </small>
                )) : (
                  <small>Authority linkage is not complete.</small>
                )}
              </article>
            )) : <span>No promoted candidates are recorded.</span>}
          </div>
        </div>
      ) : null}

      {learningDegraded ? (
        <div className="governanceLearningDegraded" role="status" data-testid="learning-status-degraded">
          Learning queue metadata is unavailable or malformed. No promotion was inferred.
        </div>
      ) : null}

      {memory ? (
        <div className="governanceMemoryStatus" data-testid="memory-safe-metadata">
          <div>
            <span>Memory feature</span>
            <strong>{memory.enabled ? "Enabled" : "Disabled"}</strong>
            <small>{memory.useMemories ? "Recall on" : "Recall off"} · {memory.generateMemories ? "Generation on" : "Generation off"}</small>
          </div>
          <div>
            <span>Local store</span>
            <strong>{memory.store.integrity}</strong>
            <small>{memory.store.jobCount ?? "—"} job(s) · {memory.store.generatedInputCount ?? "—"} generated input(s)</small>
          </div>
          <div>
            <span>Last generation</span>
            <strong>{formatTimestamp(memory.store.lastSuccessfulGeneration)}</strong>
            <small>{memory.memoryFileCount} generated file(s); raw content hidden</small>
          </div>
          <div>
            <span>Runtime support</span>
            <strong>{memory.extensionHost.supportsMemories ? "IDE supported" : "IDE unsupported"}</strong>
            <small>{memory.shellCli.supportsMemories ? "Shell supported" : "Shell does not advertise memories"}</small>
          </div>
        </div>
      ) : null}

      {memoryDegraded ? (
        <div className="governanceLearningDegraded" role="status" data-testid="memory-status-degraded">
          Memory metadata is unavailable or malformed. No raw memory content was requested or shown.
        </div>
      ) : null}
    </section>
  );
}
