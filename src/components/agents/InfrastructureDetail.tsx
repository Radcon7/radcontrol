import type { ProjectRow } from "../projects/types";
import { InfrastructureBrief } from "./InfrastructureBrief";
import type { InfrastructureEntry } from "./infrastructureModel";
import { InfrastructureNotes } from "./InfrastructureNotes";

type Props = {
  entry: InfrastructureEntry;
  projects: ProjectRow[];
  notePath: string | null;
  noteText: string;
  noteStatus: string;
  noteLoading: boolean;
  onNoteChange: (value: string) => void;
};

export function InfrastructureDetail({
  entry,
  projects,
  notePath,
  noteText,
  noteStatus,
  noteLoading,
  onNoteChange,
}: Props) {
  return (
    <div className="surfaceCard surfaceDetailBriefCard">
      <div className="surfaceCardTitle">Infrastructure Brief</div>
      <div className="surfaceSummaryList">
        <InfrastructureBrief entry={entry} projects={projects} />
        <InfrastructureNotes
          status={noteStatus}
          value={noteText}
          readOnly={!notePath || noteLoading}
          placeholder={
            notePath
              ? "Infrastructure note"
              : "No governed note path available."
          }
          onChange={onNoteChange}
        />
      </div>
    </div>
  );
}
