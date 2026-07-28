type Props = {
  path: string | null;
  text: string;
  status: string;
  loading: boolean;
  onChange: (value: string) => void;
};

export function ProjectNotes({ path, text, status, loading, onChange }: Props) {
  return (
    <div className="surfaceSummaryRow surfaceSummaryRowTall">
      <div className="surfaceSummaryHeader">
        <div className="surfaceLabel">Project Notes</div>
        <div className="surfaceMutedSmall">{status}</div>
      </div>
      <textarea
        className="notesSingleArea surfaceProjectNoteArea"
        data-testid="project-notes"
        value={text}
        readOnly={!path || loading}
        placeholder={path ? "Project note" : "No governed note file available yet."}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
