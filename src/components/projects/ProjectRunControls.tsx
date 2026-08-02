import type { ProjectDetail } from "./projectModel";

type Props = {
  detail: ProjectDetail;
  busy: boolean;
  onLaunch: () => void;
  onSnapshot: () => void;
  onMap: () => void;
  onShowOriginalRequest: () => void;
  onProofPack: () => void;
  onStop: () => void;
};

export function ProjectRunControls({
  detail,
  busy,
  onLaunch,
  onSnapshot,
  onMap,
  onShowOriginalRequest,
  onProofPack,
  onStop,
}: Props) {
  return (
    <div className="surfaceCard">
      <div className="surfaceCardTitle">Run Controls</div>
      <div className="surfaceActionStack">
        <button
          className="btn btnPrimary"
          data-testid="launch-runtime"
          onClick={onLaunch}
          disabled={detail.launchDisabled}
          title={detail.launchTitle}
        >
          {detail.launchLabel}
        </button>
        <button
          className="btn btnPrimary"
          onClick={onSnapshot}
          disabled={detail.snapshotDisabled}
        >
          Run Repo Snapshot
        </button>
        <button
          className="btn btnPrimary"
          onClick={onMap}
          disabled={detail.mapDisabled}
        >
          Run Project Map
        </button>
        {detail.project.intakeAvailable ? (
          <button
            className="btn btnPrimary"
            onClick={onShowOriginalRequest}
            disabled={busy}
          >
            Show Original Request
          </button>
        ) : null}
        <button
          className="btn btnPrimary"
          onClick={onProofPack}
          disabled={detail.proofPackDisabled}
        >
          Build Proof Pack
        </button>
        <button
          className="btn btnPrimary"
          data-testid="stop-runtime"
          onClick={onStop}
          disabled={detail.stopDisabled}
          title={
            typeof detail.port !== "number"
              ? "No port"
              : detail.isListening
                ? "Stop this project's governed runtime"
                : "Not running"
          }
        >
          Stop Runtime
        </button>
      </div>
    </div>
  );
}
