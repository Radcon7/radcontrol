import type { ProjectRow } from "../projects/types";
import { InfrastructureBrief } from "./InfrastructureBrief";
import { InfrastructureConfigurationNote } from "./InfrastructureConfigurationNote";
import { CodexUsagePanel } from "./CodexUsagePanel";
import type { InfrastructureEntry } from "./infrastructureModel";
import { InfrastructureNotes } from "./InfrastructureNotes";
import { WorkstationOperationsPanel } from "./WorkstationOperationsPanel";

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
  onAppendLog: (text: string) => void;
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
  onAppendLog,
}: Props) {
  const isWorkstation = entry.key === "system76-workstation";
  return (
    <div className="surfaceCard surfaceDetailBriefCard">
      {!isWorkstation ? <div className="surfaceCardTitle">Infrastructure Brief</div> : null}
      <div className="surfaceSummaryList">
        {entry.key === "openai-codex" ? <CodexUsagePanel /> : null}
        {isWorkstation ? (
          <WorkstationOperationsPanel onAppendLog={onAppendLog} />
        ) : (
          <InfrastructureBrief entry={entry} projects={projects} />
        )}
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
