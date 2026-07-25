import { useEffect, useMemo, useState } from "react";
import { copyText } from "../common/copyText";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import { useArtifactStore } from "../common/useArtifactStore";

type UtilityMode = "map" | "snapshot" | "sweep";

type UtilityConfig = {
  key: UtilityMode;
  label: string;
  title: string;
  dir: string;
  latestFileName: string;
  timestampStem: string;
  extension: string;
  producerVerb: string;
  producerErrorFallback: string;
  listTitle: string;
  emptyText: string;
  placeholder: string;
};

const CONFIGS: UtilityConfig[] = [
  {
    key: "map",
    label: "Empire Map",
    title: "Empire Utility",
    dir: "docs/radcontrol/empire_map",
    latestFileName: "latest.txt",
    timestampStem: "empire_map",
    extension: "txt",
    producerVerb: "empire.map",
    producerErrorFallback: "empire.map failed",
    listTitle: "Map Runs",
    emptyText: "No empire map runs yet.",
    placeholder: "Empire map output will appear here…",
  },
  {
    key: "snapshot",
    label: "Snapshot",
    title: "Empire Utility",
    dir: "docs/radcontrol/snapshot",
    latestFileName: "latest.md",
    timestampStem: "snapshot",
    extension: "md",
    producerVerb: "radcontrol.snapshot",
    producerErrorFallback: "radcontrol.snapshot failed",
    listTitle: "Snapshots",
    emptyText: "No snapshot artifacts found.",
    placeholder: "Snapshot content will appear here when saved artifacts exist…",
  },
  {
    key: "sweep",
    label: "Empire Sweep",
    title: "Empire Utility",
    dir: "docs/radcontrol/empire_sweep",
    latestFileName: "latest.txt",
    timestampStem: "empire_sweep",
    extension: "txt",
    producerVerb: "empire.sweep",
    producerErrorFallback: "empire.sweep failed",
    listTitle: "Sweep Runs",
    emptyText: "No empire sweep runs yet.",
    placeholder: "Empire sweep report will appear here…",
  },
];

export function EmpireUtilityTab() {
  const [mode, setMode] = useState<UtilityMode>("map");
  const config = useMemo(
    () => CONFIGS.find((item) => item.key === mode) || CONFIGS[0],
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
    setCurrentText,
    readPath,
    refreshList,
    runProducerAndSave,
    runProducer,
    saveCurrent,
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

  const canRunAndSave = config.key !== "snapshot";

  return (
    <section className="workspaceShell">
      <div className="workspaceModeRow">
        {CONFIGS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`workspaceModeButton ${mode === item.key ? "workspaceModeButtonActive" : ""}`}
            onClick={() => setMode(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="workspaceActionRow">
        <button
          className="btn btnGhost btnCompact"
          onClick={() =>
            void (canRunAndSave
              ? runProducerAndSave({
                  timestampCommitMessage: `radcontrol ${config.timestampStem}: save timestamped artifact`,
                  latestCommitMessage: `radcontrol ${config.timestampStem}: update latest artifact`,
                })
              : runProducer({
                  refreshArtifacts: true,
                  autoReadPreferred: true,
                }))
          }
          disabled={running || saving || loading}
        >
          {running ? "Running…" : config.key === "snapshot" ? "Run Snapshot" : "Run Report"}
        </button>
        <button
          className="btn btnGhost btnCompact"
          onClick={() =>
            void saveCurrent({
              timestampCommitMessage: `radcontrol ${config.timestampStem}: save timestamped artifact`,
              latestCommitMessage: `radcontrol ${config.timestampStem}: update latest artifact`,
              preferSavedTimestamp: true,
            })
          }
          disabled={saving || running || loading}
        >
          {saving ? "Saving…" : "Save Copy"}
        </button>
        <button
          className="btn btnGhost btnCompact"
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
          onChange={(event) => setCurrentText(event.target.value)}
          placeholder={config.placeholder}
          spellCheck={false}
          className="pasteArea workspaceTextAreaFill"
        />
      </div>
    </section>
  );
}
