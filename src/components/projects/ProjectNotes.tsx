type Props = {
  path: string | null;
  text: string;
  status: string;
  loading: boolean;
  onChange: (value: string) => void;
  onReload?: () => void;
};

export function ProjectNotes({ path, text, status, loading, onChange, onReload }: Props) {
  return (
    <div className="surfaceSummaryRow surfaceSummaryRowTall">
      <div className="surfaceSummaryHeader">
        <div className="surfaceLabel">Project Notes</div>
        <div className="surfaceMutedSmall">{status}</div>
      </div>
      {onReload ? <button className="btn btnGhost btnCompact" onClick={onReload}>Discard draft & reload</button> : null}
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
