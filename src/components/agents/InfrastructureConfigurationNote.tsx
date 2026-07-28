type Props = {
  status: string;
  value: string;
  loading: boolean;
};

export function InfrastructureConfigurationNote({
  status,
  value,
  loading,
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
      <div className="surfaceConfigurationNoteText">
        {loading ? "Loading configuration..." : value}
      </div>
    </div>
  );
}
