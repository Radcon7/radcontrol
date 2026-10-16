import type { LocalToolsEntry } from "./localToolsModel";

type Props = {
  entry: LocalToolsEntry;
  disabled: boolean;
  onSnapshot: () => void;
  onAudit: () => void;
  onOpenConsole: () => void;
  onOpenEvidence: () => void;
};

export function LocalToolsRunControls({
  entry,
  disabled,
  onSnapshot,
  onAudit,
  onOpenConsole,
  onOpenEvidence,
}: Props) {
  return (
    <div className="surfaceCard">
      <div className="surfaceCardTitle">Run Controls</div>
      <div className="surfaceActionStack">
        <button
          className="btn btnPrimary"
          onClick={onSnapshot}
          disabled={disabled}
          title="Send a concise local tool snapshot to the logs surface"
        >
          Run Snapshot
        </button>
        <button
          className="btn btnPrimary"
          onClick={onAudit}
          disabled={disabled}
          title="Send a provider-focused audit checklist to the logs surface"
        >
          Run Status Audit
        </button>
        <button
          className="btn btnPrimary"
          onClick={onOpenConsole}
          disabled={disabled || !entry.primaryConsoleUrl}
          title="Open the provider console in a new browser tab"
        >
          Open Console
        </button>
        <button
          className="btn btnPrimary"
          onClick={onOpenEvidence}
          disabled={disabled}
          title="Send linked governed record evidence to the logs surface"
        >
          Open Governed Evidence
        </button>
      </div>
    </div>
  );
}
