import { recommendAgentForProject, type ProjectDetail } from "./projectModel";
import { ProjectNotes } from "./ProjectNotes";

type Props = {
  detail: ProjectDetail;
  busy: boolean;
  launchDateDisplay: string;
  notePath: string | null;
  noteText: string;
  noteStatus: string;
  noteLoading: boolean;
  onNoteChange: (value: string) => void;
  onEditLaunchDate: () => void;
  onSetRetired: (retired: boolean) => void;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="surfaceSummaryRow">
      <div className="surfaceLabel">{label}</div>
      <div className="surfaceValue">{value}</div>
    </div>
  );
}

export function ProjectBrief({
  detail,
  busy,
  launchDateDisplay,
  notePath,
  noteText,
  noteStatus,
  noteLoading,
  onNoteChange,
  onEditLaunchDate,
  onSetRetired,
}: Props) {
  const { project, status } = detail;

  return (
    <div className="surfaceCard surfaceProjectBriefCard">
      <div className="surfaceCardTitle">Project Brief</div>
      <div className="surfaceSummaryList">
        <div className="surfaceSummaryRow">
          <div className="surfaceSummaryHeader">
            <div className="surfaceLabel">Project Launch Date</div>
            <button
              className="btn btnPrimary btnCompact"
              onClick={onEditLaunchDate}
              disabled={busy}
            >
              Edit Date
            </button>
          </div>
          <div className="surfaceValue">{launchDateDisplay}</div>
        </div>
        <SummaryRow label="Runtime Status" value={status.text} />
        <SummaryRow
          label="Live URL"
          value={project.runtimeUrl || project.url || "Not recorded"}
        />
        {project.preferredUrl && project.preferredUrl !== project.url ? (
          <SummaryRow label="Preferred URL" value={project.preferredUrl} />
        ) : null}
        <SummaryRow
          label="Recommended Agent"
          value={recommendAgentForProject(project)}
        />
        <ProjectNotes
          path={notePath}
          text={noteText}
          status={noteStatus}
          loading={noteLoading}
          onChange={onNoteChange}
        />
        <label className="surfaceSummaryRow surfaceToggleRow">
          <span className="surfaceLabel">Retired</span>
          <span className="surfaceToggleControl">
            <input
              type="checkbox"
              checked={Boolean(project.retired)}
              onChange={(event) => onSetRetired(event.target.checked)}
              disabled={detail.lifecycleToggleDisabled}
            />
            <span className="surfaceValue">
              If checked, this project is retired in RadControl and hidden from the
              active operating list unless Show all is enabled.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
