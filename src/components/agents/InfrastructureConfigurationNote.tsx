type Props = {
  status: string;
  value: string;
  readOnly: boolean;
  placeholder: string;
  onChange: (value: string) => void;
};

export function InfrastructureConfigurationNote({
  status,
  value,
  readOnly,
  placeholder,
  onChange,
}: Props) {
  return (
    <div
      className="surfaceSummaryRow surfaceSummaryRowTall"
      data-testid="infrastructure-configuration-note"
    >
      <div className="surfaceSummaryHeader">
        <div className="surfaceLabel">Configuration Note</div>
        <div className="surfaceMutedSmall">{status}</div>
      </div>
      <textarea
        className="notesSingleArea surfaceProjectNoteArea"
        data-testid="infrastructure-configuration-note"
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
