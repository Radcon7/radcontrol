import { useEffect, useMemo, useState } from "react";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import { copyText } from "../common/copyText";
import { useArtifactStore } from "../common/useArtifactStore";
import { runO2ParsedJson } from "../common/o2Client";
import type { SentinelStatus } from "../sentinel/sentinelModel";

type OperationMode = "map" | "snapshot" | "sweep";

type OperationConfig = {
  key: OperationMode;
  label: string;
  dir: string;
  latestFileName: string;
  timestampStem: string;
  extension: string;
  producerVerb: string;
  producerErrorFallback: string;
  runLabel: string;
  listTitle: string;
  emptyText: string;
  placeholder: string;
};

const OPERATION_CONFIGS: OperationConfig[] = [
  {
    key: "map",
    label: "Empire Map",
    dir: "docs/radcontrol/empire_map",
    latestFileName: "latest.txt",
    timestampStem: "empire_map",
    extension: "txt",
    producerVerb: "empire.map",
    producerErrorFallback: "empire.map failed",
    runLabel: "Run Empire Map",
    listTitle: "Map Runs",
    emptyText: "No empire map runs yet.",
    placeholder: "Empire map output will appear here…",
  },
  {
    key: "snapshot",
    label: "Snapshot",
    dir: "docs/radcontrol/snapshot",
    latestFileName: "latest.md",
    timestampStem: "snapshot",
    extension: "md",
    producerVerb: "radcontrol.snapshot",
    producerErrorFallback: "radcontrol.snapshot failed",
    runLabel: "Run Empire Snapshot",
    listTitle: "Snapshots",
    emptyText: "No snapshot artifacts found.",
    placeholder: "Snapshot content will appear here when saved artifacts exist…",
  },
  {
    key: "sweep",
    label: "Empire Sweep",
    dir: "docs/radcontrol/empire_sweep",
    latestFileName: "latest.txt",
    timestampStem: "empire_sweep",
    extension: "txt",
    producerVerb: "empire.sweep",
    producerErrorFallback: "empire.sweep failed",
    runLabel: "Run Empire Sweep",
    listTitle: "Sweep Runs",
    emptyText: "No empire sweep runs yet.",
    placeholder: "Empire sweep report will appear here…",
  },
];

type GoldenState = {
  ok: boolean;
  sourceGolden: { o2: { sha: string }; radcontrol: { sha: string }; pinMatchesRadcontrolRef: boolean };
  installedGolden: { o2Sha: string; o2Clean: boolean; radcontrolSourceSha: string; binaryEmbedsSourceSha: boolean };
  errors: string[];
};

type RouterHealth = {
  ok: boolean;
  repositoryCount: number;
  summary: Record<string, number>;
};

type OperationsTruth = {
  golden?: GoldenState;
  routers?: RouterHealth;
  sentinel?: SentinelStatus;
  unavailable: string[];
};

function shortSha(value: string | undefined): string {
  return value ? value.slice(0, 9) : "Unavailable";
}

async function loadOperationsTruth(): Promise<OperationsTruth> {
  const [golden, routers, sentinel] = await Promise.allSettled([
    runO2ParsedJson<GoldenState>("radcontrol.golden_state", "Golden-state projection unavailable", "Golden-state projection was malformed"),
    runO2ParsedJson<RouterHealth>("router.health", "Router health unavailable", "Router health was malformed"),
    runO2ParsedJson<SentinelStatus>("sentinel.status", "Sentinel status unavailable", "Sentinel status was malformed"),
  ]);
  const unavailable: string[] = [];
  if (golden.status === "rejected") unavailable.push("source / installed golden");
  if (routers.status === "rejected") unavailable.push("registry / topology");
  if (sentinel.status === "rejected") unavailable.push("security automation");
  return {
    golden: golden.status === "fulfilled" ? golden.value : undefined,
    routers: routers.status === "fulfilled" ? routers.value : undefined,
    sentinel: sentinel.status === "fulfilled" ? sentinel.value : undefined,
    unavailable,
  };
}

export function EmpireOperationsWorkspace() {
  const [mode, setMode] = useState<OperationMode>("map");
  const [truth, setTruth] = useState<OperationsTruth | null>(null);
  const [truthLoading, setTruthLoading] = useState(true);
  const config = useMemo(
    () => OPERATION_CONFIGS.find((item) => item.key === mode) || OPERATION_CONFIGS[0],
    [mode],
  );
  const {
    docsInFolder,
    currentPath,
    currentText,
    loading,
    saving,
    running,
    err,
    readPath,
    refreshList,
    runProducer,
  } = useArtifactStore({
    dir: config.dir,
    latestFileName: config.latestFileName,
    timestampStem: config.timestampStem,
    extension: config.extension,
    producerVerb: config.producerVerb,
    producerErrorFallback: config.producerErrorFallback,
  });

  useEffect(() => {
    void refreshList({ autoReadPreferred: true });
  }, [refreshList]);

  useEffect(() => {
    let active = true;
    void loadOperationsTruth()
      .then((next) => { if (active) setTruth(next); })
      .finally(() => { if (active) setTruthLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="workspaceShell" data-testid="empire-operations-workspace">
      <header className="securityWorkspaceIntro">
        <span>EMPIRE OPERATIONS</span>
        <h1>Development-system integrity</h1>
        <p>O2/RadControl pair, repositories, release and audit truth, plus governed Map, Snapshot, and Sweep reports.</p>
      </header>
      <section className="empireOperationsOverview" data-testid="empire-operations-overview">
        <div className="sentinelSectionHeading"><span>OPERATIONAL TRUTH</span><strong>Is the Empire machinery functioning?</strong></div>
        <div className="empireOperationsSignalGrid securityInsetScroll">
          <article><span>SOURCE GOLDEN</span><strong>{truthLoading ? "Loading…" : truth?.golden ? `O2 ${shortSha(truth.golden.sourceGolden.o2.sha)} · RadControl ${shortSha(truth.golden.sourceGolden.radcontrol.sha)}` : "Unavailable"}</strong><small>{truth?.golden?.sourceGolden.pinMatchesRadcontrolRef ? "Compatibility pin matches source" : "Compatibility proof unavailable"}</small></article>
          <article><span>INSTALLED GOLDEN</span><strong>{truthLoading ? "Loading…" : truth?.golden ? `O2 ${shortSha(truth.golden.installedGolden.o2Sha)} · RadControl ${shortSha(truth.golden.installedGolden.radcontrolSourceSha)}` : "Unavailable"}</strong><small>{truth?.golden?.ok && truth.golden.installedGolden.o2Clean && truth.golden.installedGolden.binaryEmbedsSourceSha ? "Matched-pair integrity verified" : "Integrity requires evidence"}</small></article>
          <article><span>AUTOMATION HEALTH</span><strong>{truthLoading ? "Loading…" : truth?.sentinel?.automation.active ? `Active · ${truth.sentinel.automation.frequency}` : truth?.sentinel?.automation.enabled ? "Configured · timer unavailable" : "Off"}</strong><small>{truth?.sentinel?.automation.nextDueAt ? `Next semantic observation ${new Date(truth.sentinel.automation.nextDueAt).toLocaleString()}` : "No next due time"}</small></article>
          <article><span>REGISTRY + TOPOLOGY</span><strong>{truthLoading ? "Loading…" : truth?.routers?.ok ? `${truth.routers.repositoryCount} registered · ${truth.routers.summary["conformant-durable"] || 0} conformant` : "Unavailable"}</strong><small>{truth?.routers?.ok ? "Canonical router health projection" : "Topology truth unavailable"}</small></article>
          <article><span>SECURITY + AUDIT</span><strong>{truthLoading ? "Loading…" : truth?.sentinel?.auditVerification.ok ? "Audit chains verified" : "Requires attention"}</strong><small>Host {truth?.sentinel?.host.overallStatus || "unknown"} · Estate {truth?.sentinel?.security.overallStatus || "unknown"}</small></article>
          <article><span>CI + CODEQL</span><strong>Not connected yet</strong><small>No provider-backed workflow status is projected into RadControl.</small></article>
        </div>
        {truth?.unavailable.length ? <div className="surfaceInlineNotice">Unavailable projections: {truth.unavailable.join(", ")}.</div> : null}
      </section>

      <div className="workspaceModeRow" role="tablist" aria-label="Empire operations">
        {OPERATION_CONFIGS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`workspaceModeButton ${mode === item.key ? "workspaceModeButtonActive" : ""}`}
            onClick={() => setMode(item.key)}
            data-testid={`empire-operation-${item.key}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="workspaceActionRow">
        <span className="workspaceActionHint">
          Governed O2 evidence and visibility reports. This workspace exposes no runtime launch.
        </span>
        <button
          className="btn btnGhost btnCompact"
          type="button"
          onClick={() => void runProducer({ refreshArtifacts: true, autoReadPreferred: true })}
          disabled={running || saving || loading}
        >
          {running ? "Running…" : config.runLabel}
        </button>
        <button
          className="btn btnGhost btnCompact"
          type="button"
          onClick={() => void copyText(currentText)}
          disabled={!currentText.trim()}
        >
          Copy
        </button>
      </div>

      {err ? <div className="panelError">{err}</div> : null}

      <div className="workspaceContentGrid">
        <ArtifactListPanel
          title={config.listTitle}
          items={docsInFolder}
          currentPath={currentPath}
          emptyText={config.emptyText}
          onSelect={(path) => void readPath(path)}
        />
        <textarea
          value={currentText}
          readOnly
          placeholder={config.placeholder}
          spellCheck={false}
          className="pasteArea workspaceTextAreaFill"
          data-testid="empire-operation-output"
        />
      </div>
    </section>
  );
}
