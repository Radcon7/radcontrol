import type { ProjectRow } from "../projects/types";
import { InfrastructureBrief } from "./InfrastructureBrief";
import { InfrastructureConfigurationNote } from "./InfrastructureConfigurationNote";
import { CodexUsagePanel } from "./CodexUsagePanel";
import type { InfrastructureEntry } from "./infrastructureModel";
import { InfrastructureNotes } from "./InfrastructureNotes";

type Props = {
  entry: InfrastructureEntry;
  projects: ProjectRow[];
  notePath: string | null;
  noteText: string;
  noteStatus: string;
  noteLoading: boolean;
  configurationText: string;
  configurationStatus: string;
  configurationLoading: boolean;
  configurationPath: string | null;
  onNoteChange: (value: string) => void;
  onConfigurationChange: (value: string) => void;
};

export function InfrastructureDetail({
  entry,
  projects,
  notePath,
  noteText,
  noteStatus,
  noteLoading,
  configurationText,
  configurationStatus,
  configurationLoading,
  configurationPath,
  onNoteChange,
  onConfigurationChange,
}: Props) {
  return (
    <div className="surfaceCard surfaceDetailBriefCard">
      <div className="surfaceCardTitle">Infrastructure Brief</div>
      <div className="surfaceSummaryList">
        {entry.key === "openai-codex" ? <CodexUsagePanel /> : null}
        <InfrastructureBrief entry={entry} projects={projects} />
        <InfrastructureConfigurationNote
          status={configurationStatus}
          value={configurationText}
          readOnly={!configurationPath || configurationLoading}
          placeholder={
            configurationPath
              ? "Paste a concise, non-secret setup or material-change summary."
              : "No governed configuration path available."
          }
          onChange={onConfigurationChange}
        />
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
