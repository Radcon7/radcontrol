import type { ProjectRow } from "./types";
import type { SortMode, StatusLike } from "./projectModel";

type Props = {
  projects: ProjectRow[];
  selectedProjectKey: string | null;
  showRetired: boolean;
  sortMode: SortMode;
  statusForRow: (project: ProjectRow) => StatusLike;
  onSelect: (projectKey: string) => void;
  onShowRetiredChange: (showRetired: boolean) => void;
  onSortModeChange: (sortMode: SortMode) => void;
};

export function ProjectRoster({
  projects,
  selectedProjectKey,
  showRetired,
  sortMode,
  statusForRow,
  onSelect,
  onShowRetiredChange,
  onSortModeChange,
}: Props) {
  return (
    <div className="surfaceCard surfaceSidebarCard">
      <div className="surfaceCardTitleRow surfaceSidebarHeaderRow">
        <div className="surfaceCardTitle">PROJECTS</div>
        <label className="surfaceToggleInlineSmall">
          <input
            type="checkbox"
            data-testid="show-all-projects"
            checked={showRetired}
            onChange={(event) => onShowRetiredChange(event.target.checked)}
          />
          <span>Show all</span>
        </label>
      </div>

      <div className="surfaceControlStack">
        <div className="surfaceSelectWrap">
          <select
            className="input"
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          >
            <option value="active">Active First</option>
            <option value="start_date">Launch Date</option>
            <option value="name">Name</option>
            <option value="running_status">Runtime Status</option>
          </select>
        </div>
      </div>

      <div className="surfaceList">
        {projects.length === 0 ? (
          <div className="surfaceEmptyState">No projects match the current filter.</div>
        ) : (
          projects.map((project) => {
            const status = statusForRow(project);
            const active = project.key === selectedProjectKey;
            const port = project.runtimePort ?? project.port;

            return (
              <button
                key={project.key}
                type="button"
                data-testid={`project-row-${project.key}`}
                aria-pressed={active}
                className={`surfaceNavButton ${active ? "surfaceNavButtonActive" : ""}`}
                onClick={() => onSelect(project.key)}
              >
                <div className="surfaceNavTitle">{project.label}</div>
                <div className="surfaceTagRow">
                  <span className={`pill ${status.pill}`}>{status.text}</span>
                  {project.retired ? <span className="surfaceTag">Retired</span> : null}
                  <span className="surfaceTag">
                    {typeof port === "number" ? `Port: ${port}` : "Port: —"}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
