type Props = {
  status: string;
  value: string;
  readOnly: boolean;
  placeholder: string;
  onChange: (value: string) => void;
};

export function InfrastructureNotes({
  status,
  value,
  readOnly,
  placeholder,
  onChange,
}: Props) {
  return (
    <div className="surfaceSummaryRow surfaceSummaryRowTall">
      <div className="surfaceSummaryHeader">
        <div className="surfaceLabel">Infrastructure Notes</div>
        <div className="surfaceMutedSmall">{status}</div>
      </div>
      <textarea
        className="notesSingleArea surfaceProjectNoteArea"
        data-testid="infrastructure-notes"
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
