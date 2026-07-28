import type { ProjectRow } from "../projects/types";
import {
  formatIsoDateTime,
  projectLabelsForKeys,
  type InfrastructureEntry,
} from "./infrastructureModel";

type Props = {
  entry: InfrastructureEntry;
  projects: ProjectRow[];
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="surfaceSummaryRow">
      <div className="surfaceLabel">{label}</div>
      <div className="surfaceValue">{value}</div>
    </div>
  );
}

export function InfrastructureBrief({ entry, projects }: Props) {
  const coverage =
    entry.linkedAssets.length === 0
      ? "Starter profile only"
      : `${entry.linkedAssets.length} linked governed record(s)`;
  const records =
    entry.linkedAssets.length === 0
      ? "No linked governed records yet."
      : entry.linkedAssets
          .map(
            (asset) =>
              `${asset.label} (${asset.assetType}, ${asset.governedState})`,
          )
          .join("; ");

  return (
    <>
      <SummaryRow label="Platform" value={entry.label} />
      <SummaryRow label="Category" value={entry.category} />
      <SummaryRow label="Provider" value={entry.provider} />
      <SummaryRow label="Owning Org" value={entry.owningOrg} />
      <SummaryRow label="Coverage Scope" value={entry.environmentScope} />
      <SummaryRow label="Governed Coverage" value={coverage} />
      <SummaryRow
        label="Related Projects"
        value={projectLabelsForKeys(entry.relatedProjectKeys, projects)}
      />
      <SummaryRow
        label="Primary Domains"
        value={entry.canonicalDomains.join(", ") || "Not recorded"}
      />
      <SummaryRow
        label="Console URL"
        value={entry.primaryConsoleUrl || "Not recorded"}
      />
      <SummaryRow label="MCP / API Status" value={entry.mcpApiPosture} />
      <SummaryRow label="Billing / Cost Focus" value={entry.billingFocus} />
      <SummaryRow label="Platform Focus" value={entry.focusSummary} />
      <SummaryRow label="Linked Governed Records" value={records} />
      <SummaryRow
        label="Latest Record Update"
        value={formatIsoDateTime(entry.updatedAt)}
      />
    </>
  );
}
