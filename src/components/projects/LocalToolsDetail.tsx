import type { ProjectRow } from "./types";
import { LocalToolsBrief } from "./LocalToolsBrief";
import { LocalToolsConfigurationNote } from "./LocalToolsConfigurationNote";
import type { LocalToolsEntry } from "./localToolsModel";
import { LocalToolsNotes } from "./LocalToolsNotes";

type Props = {
  entry: LocalToolsEntry;
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

export function LocalToolsDetail({
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
      <div className="surfaceCardTitle">Local Tool Brief</div>
      <div className="surfaceSummaryList">
        <LocalToolsBrief entry={entry} projects={projects} />
        <LocalToolsConfigurationNote
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
        <LocalToolsNotes
          status={noteStatus}
          value={noteText}
          readOnly={!notePath || noteLoading}
          placeholder={
            notePath
              ? "Local tool note"
              : "No governed note path available."
          }
          onChange={onNoteChange}
        />
      </div>
    </div>
  );
}
