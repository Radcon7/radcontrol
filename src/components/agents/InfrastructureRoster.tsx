import type { InfrastructureEntry } from "./infrastructureModel";

type Props = {
  entries: InfrastructureEntry[];
  loading: boolean;
  loadError: string;
  selectedEntryKey: string | null;
  onSelect: (entryKey: string) => void;
};

export function InfrastructureRoster({
  entries,
  loading,
  loadError,
  selectedEntryKey,
  onSelect,
}: Props) {
  return (
    <div className="surfaceCard surfaceSidebarCard">
      <div className="surfaceCardTitleRow surfaceSidebarHeaderRow">
        <div className="surfaceCardTitle">INFRASTRUCTURE ASSETS</div>
      </div>

      <div className="surfaceList">
        {entries.length === 0 ? (
          <div className="surfaceEmptyState">
            {loading
              ? "Loading governed infrastructure data…"
              : loadError
                ? "Infrastructure data unavailable. See the error above."
                : "No infrastructure items are configured."}
          </div>
        ) : (
          entries.map((entry) => {
            const active = entry.key === selectedEntryKey;
            return (
              <button
                key={entry.key}
                type="button"
                data-testid={`infrastructure-row-${entry.key}`}
                aria-pressed={active}
                className={`surfaceNavButton ${active ? "surfaceNavButtonActive" : ""}`}
                onClick={() => onSelect(entry.key)}
              >
                <div className="surfaceNavTitle">{entry.label}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
