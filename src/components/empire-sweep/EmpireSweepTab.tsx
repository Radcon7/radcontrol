import { useEffect } from "react";
import { SystemStateShell } from "../common/SystemStateShell";
import { copyText } from "../common/copyText";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import {
  formatMaybeUnixTime,
  useArtifactStore,
} from "../common/useArtifactStore";

export function EmpireSweepTab() {
  const verb = "empire.sweep";

  const {
    dir,
    docsInFolder,
    currentPath,
    currentText,
    loading,
    saving,
    running,
    err,
    lastSavedAt,
    setCurrentText,
    readPath,
    refreshList,
    runProducerAndSave,
    saveCurrent,
  } = useArtifactStore({
    dir: "docs/radcontrol/empire_sweep",
    latestFileName: "latest.txt",
    timestampStem: "empire_sweep",
    extension: "txt",
    producerVerb: verb,
    producerErrorFallback: "empire.sweep failed",
  });

  useEffect(() => {
    void refreshList({ autoReadPreferred: true });
  }, [refreshList]);

  const actions = (
    <>
      <button
        className="btn btnGhost"
        onClick={() =>
          void runProducerAndSave({
            timestampCommitMessage:
              "radcontrol empire_sweep: save timestamped artifact",
            latestCommitMessage:
              "radcontrol empire_sweep: update latest artifact",
          })
        }
        disabled={running || saving || loading}
      >
        {running ? "Running…" : "Run"}
      </button>
      <button
        className="btn btnGhost"
        onClick={() =>
          void saveCurrent({
            timestampCommitMessage:
              "radcontrol empire_sweep: save timestamped artifact",
            latestCommitMessage:
              "radcontrol empire_sweep: update latest artifact",
            preferSavedTimestamp: true,
          })
        }
        disabled={saving || running}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        className="btn btnGhost"
        onClick={() => void copyText(currentText)}
        disabled={!currentText.trim()}
      >
        Copy
      </button>
    </>
  );

  const meta = (
    <div className="panelMeta">
      <div>
        <strong>Source:</strong> run_o2(verb={verb})
      </div>
      <div>
        <strong>Folder:</strong> {dir}
      </div>
      <div>
        <strong>Saved entries:</strong> {docsInFolder.length}
      </div>
      <div>
        <strong>Selected file:</strong> {currentPath ?? "(none loaded)"}
      </div>
      <div>
        <strong>Last saved:</strong>{" "}
        {lastSavedAt ? formatMaybeUnixTime(lastSavedAt) : "—"}
      </div>
      {loading ? (
        <div>
          <strong>Status:</strong> loading…
        </div>
      ) : null}
    </div>
  );

  return (
    <SystemStateShell
      title="Empire Sweep"
      actions={actions}
      meta={meta}
      error={err ? <>{err}</> : null}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        <ArtifactListPanel
          title="Runs"
          items={docsInFolder}
          currentPath={currentPath}
          emptyText="No saved runs yet."
          onSelect={(path) => void readPath(path)}
        />

        <div
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              padding: 10,
              fontSize: 13,
              opacity: 0.86,
            }}
          >
            <strong>Command:</strong> run_o2(verb=empire.sweep)
          </div>

          <textarea
            className="pasteArea"
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            placeholder="Empire sweep report will appear here…"
            spellCheck={false}
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>
      </div>
    </SystemStateShell>
  );
}
