import type { ProjectRow } from "../projects/types";
import { joinProjectLabels, type AgentProfile } from "./agentModel";

type Props = {
  profile: AgentProfile;
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

export function AgentBrief({ profile, projects }: Props) {
  return (
    <>
      <SummaryRow label="Agent" value={profile.name} />
      <SummaryRow label="Handle" value={profile.handle} />
      <SummaryRow label="Agent Type" value={profile.agentType} />
      <SummaryRow label="Mission" value={profile.mission} />
      <SummaryRow label="Role Summary" value={profile.roleSummary} />
      <SummaryRow
        label="Assigned Projects"
        value={joinProjectLabels(projects, profile.assignedProjects)}
      />
      <SummaryRow label="Default Task" value={profile.defaultTask} />
      <SummaryRow
        label="Expected Outputs"
        value={profile.outputs.join(", ") || "No outputs recorded"}
      />
      <SummaryRow
        label="Strengths"
        value={profile.strengths.join(", ") || "No strengths recorded"}
      />
    </>
  );
}
