import type { AgentProfile } from "./agentModel";

type Props = {
  profiles: AgentProfile[];
  selectedProfileKey: string | null;
  onSelect: (profileKey: string) => void;
};

export function AgentRoster({
  profiles,
  selectedProfileKey,
  onSelect,
}: Props) {
  return (
    <div className="surfaceCard surfaceSidebarCard">
      <div className="surfaceCardTitleRow surfaceSidebarHeaderRow">
        <div className="surfaceCardTitle">AGENT ROSTER</div>
      </div>

      <div className="surfaceList">
        {profiles.length === 0 ? (
          <div className="surfaceEmptyState">No governed agents available yet.</div>
        ) : (
          profiles.map((profile) => {
            const active = profile.profileKey === selectedProfileKey;
            return (
              <button
                key={profile.profileKey}
                type="button"
                data-testid={`agent-row-${profile.profileKey}`}
                aria-pressed={active}
                onClick={() => onSelect(profile.profileKey)}
                className={`surfaceNavButton ${active ? "surfaceNavButtonActive" : ""}`}
              >
                <div className="surfaceNavTitle">{profile.name}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
