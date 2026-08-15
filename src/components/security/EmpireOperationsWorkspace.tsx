import { useEffect, useMemo, useState } from "react";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import { copyText } from "../common/copyText";
import { useArtifactStore } from "../common/useArtifactStore";

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

export function EmpireOperationsWorkspace() {
  const [mode, setMode] = useState<OperationMode>("map");
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

  return (
    <section className="workspaceShell" data-testid="empire-operations-workspace">
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
