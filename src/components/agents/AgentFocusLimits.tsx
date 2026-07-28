import { formatIsoDateTime, type AgentProfile } from "./agentModel";

type Props = {
  profile: AgentProfile;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="surfaceSummaryRow">
      <div className="surfaceLabel">{label}</div>
      <div className="surfaceValue">{value}</div>
    </div>
  );
}

export function AgentFocusLimits({ profile }: Props) {
  return (
    <div className="surfaceSummaryList">
      <SummaryRow label="Scope" value={profile.defaultTargetType} />
      <SummaryRow
        label="Default Target Key"
        value={profile.defaultTargetKey || "Not recorded"}
      />
      <SummaryRow label="Default Mode" value={profile.defaultMode} />
      <SummaryRow
        label="Approval Requirement"
        value={profile.approvalRequirement}
      />
      <SummaryRow
        label="Operator Intent"
        value={profile.operatorIntent || "Not recorded"}
      />
      <SummaryRow
        label="Context Artifact"
        value={profile.contextArtifact || "Not recorded"}
      />
      <SummaryRow
        label="Governed State"
        value={profile.governedState || "active"}
      />
      <SummaryRow
        label="Updated"
        value={formatIsoDateTime(profile.updatedAt || profile.createdAt)}
      />
      <SummaryRow
        label="Record Artifact"
        value={profile.artifactPath || "Not recorded"}
      />
    </div>
  );
}
