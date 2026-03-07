import { useEffect } from "react";
import { SystemStateShell } from "../common/SystemStateShell";
import { copyText } from "../common/copyText";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import {
  formatMaybeUnixTime,
  useArtifactStore,
} from "../common/useArtifactStore";

type Props = {
  title: string;
};

export function SnapshotTab({ title }: Props) {
  const {
    dir,
    docsInFolder,
    currentPath,
    currentText,
    loading,
    saving,
    err,
    lastSavedAt,
    setCurrentText,
    readPath,
    refreshList,
    saveCurrent,
  } = useArtifactStore({
    dir: "docs/radcontrol/snapshot",
    latestFileName: "latest.md",
    timestampStem: "snapshot",
    extension: "md",
  });

  useEffect(() => {
    void refreshList({ autoReadPreferred: true });
  }, [refreshList]);

  const actions = (
    <>
      <button
        className="btn btnGhost"
        onClick={() => void refreshList({ autoReadPreferred: true })}
        disabled={loading}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>
      <button
        className="btn btnGhost"
        onClick={() =>
          void saveCurrent({
            timestampCommitMessage:
              "radcontrol snapshot: save timestamped artifact",
            latestCommitMessage: "radcontrol snapshot: update latest artifact",
          })
        }
        disabled={saving || loading}
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
        <strong>Source:</strong> saved artifacts in {dir}
      </div>
      <div>
        <strong>Folder:</strong> {dir}
      </div>
      <div>
        <strong>Files found:</strong> {docsInFolder.length}
      </div>
      <div>
        <strong>Current file:</strong> {currentPath ?? "(none loaded)"}
      </div>
      <div>
        <strong>Last saved:</strong>{" "}
        {lastSavedAt ? formatMaybeUnixTime(lastSavedAt) : "—"}
      </div>
      {loading ? (
        <div>
          <strong>Status:</strong> loading list…
        </div>
      ) : null}
    </div>
  );

  return (
    <SystemStateShell
      title={title}
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
          title="Artifacts"
          items={docsInFolder}
          currentPath={currentPath}
          emptyText="No snapshot artifacts found."
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
            <strong>View:</strong> snapshot artifact content
          </div>

          <textarea
            className="pasteArea"
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            placeholder="Snapshot content will appear here when saved artifacts exist…"
            spellCheck={false}
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>
      </div>
    </SystemStateShell>
  );
}
