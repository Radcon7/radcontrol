import type { ProjectRow } from "../projects/types";

export type AgentProfile = {
  profileKey: string;
  name: string;
  handle: string;
  agentType: string;
  mission: string;
  roleSummary: string;
  strengths: string[];
  outputs: string[];
  assignedProjects: string[];
  defaultTargetType: string;
  defaultTargetKey: string;
  defaultTask: string;
  defaultMode: string;
  approvalRequirement: string;
  operatorIntent: string;
  contextArtifact: string;
  notes: string;
  canonicalNotesPath?: string | null;
  governedState?: string;
  createdAt?: string;
  updatedAt?: string;
  artifactPath?: string;
  artifactMtime?: number | null;
};

export type AgentProfileDraft = {
  name: string;
  handle: string;
  agentType: string;
  mission: string;
  roleSummary: string;
  strengthsText: string;
  outputsText: string;
  assignedProjectsText: string;
  defaultTargetType: string;
  defaultTargetKey: string;
  defaultTask: string;
  defaultMode: string;
  approvalRequirement: string;
  operatorIntent: string;
  contextArtifact: string;
  notes: string;
};

export const PROFILES_DIR = "docs/agent-profiles";
export const DEFAULT_CONTEXT_ARTIFACT =
  "docs/radcontrol/empire_blueprint/empire_blueprint_20260822.md";

export function isProfileArtifact(path: string): boolean {
  return path.startsWith(`${PROFILES_DIR}/`) && path.endsWith("/01_profile.json");
}

export function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseLineList(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatIsoDateTime(value?: string): string {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function joinProjectLabels(projects: ProjectRow[], keys: string[]): string {
  if (keys.length === 0) return "No projects assigned";
  const labelsByKey = new Map(projects.map((project) => [project.key, project.label]));
  return keys.map((key) => labelsByKey.get(key) || key).join(", ");
}

export function notePathForProfile(profile: AgentProfile): string {
  const explicit = profile.canonicalNotesPath?.trim();
  return explicit || `${PROFILES_DIR}/${profile.profileKey}/NOTES.md`;
}

export function makeBlankDraft(defaultProjectKey: string): AgentProfileDraft {
  return {
    name: "New Agent",
    handle: "new-agent",
    agentType: "codex",
    mission: "Define this agent's mission and the exact kind of work it should own.",
    roleSummary:
      "State the narrow responsibility this agent should carry inside the empire.",
    strengthsText: "Clear briefs\nScoped analysis\nGoverned execution",
    outputsText: "Decision memo\nImplementation artifact\nNext-step handoff",
    assignedProjectsText: defaultProjectKey,
    defaultTargetType: "project",
    defaultTargetKey: defaultProjectKey,
    defaultTask:
      "Describe the exact job this agent should perform when it is selected for concurrent work.",
    defaultMode: "read-only",
    approvalRequirement: "none",
    operatorIntent:
      "Define a governed specialist so future work can be assigned consistently inside RadControl.",
    contextArtifact: DEFAULT_CONTEXT_ARTIFACT,
    notes:
      "Use this profile to capture the agent's operating boundaries, specialty, and future areas of expertise.",
  };
}

export function normalizeAgentProfile(
  raw: unknown,
  artifactPath: string,
  artifactMtime: number | null,
): AgentProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid agent profile JSON: ${artifactPath}`);
  }

  const profile = raw as Partial<AgentProfile>;
  if (
    typeof profile.profileKey !== "string" ||
    !profile.profileKey.trim() ||
    typeof profile.name !== "string" ||
    !profile.name.trim()
  ) {
    throw new Error(`Agent profile is missing profileKey or name: ${artifactPath}`);
  }

  return {
    profileKey: profile.profileKey,
    name: profile.name,
    handle: typeof profile.handle === "string" ? profile.handle : profile.profileKey,
    agentType: typeof profile.agentType === "string" ? profile.agentType : "other",
    mission: typeof profile.mission === "string" ? profile.mission : "",
    roleSummary: typeof profile.roleSummary === "string" ? profile.roleSummary : "",
    strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
    outputs: Array.isArray(profile.outputs) ? profile.outputs : [],
    assignedProjects: Array.isArray(profile.assignedProjects)
      ? profile.assignedProjects
      : [],
    defaultTargetType:
      typeof profile.defaultTargetType === "string" ? profile.defaultTargetType : "other",
    defaultTargetKey:
      typeof profile.defaultTargetKey === "string" ? profile.defaultTargetKey : "",
    defaultTask: typeof profile.defaultTask === "string" ? profile.defaultTask : "",
    defaultMode: typeof profile.defaultMode === "string" ? profile.defaultMode : "read-only",
    approvalRequirement:
      typeof profile.approvalRequirement === "string"
        ? profile.approvalRequirement
        : "none",
    operatorIntent: typeof profile.operatorIntent === "string" ? profile.operatorIntent : "",
    contextArtifact: typeof profile.contextArtifact === "string" ? profile.contextArtifact : "",
    notes: typeof profile.notes === "string" ? profile.notes : "",
    canonicalNotesPath:
      typeof profile.canonicalNotesPath === "string" ? profile.canonicalNotesPath : null,
    governedState:
      typeof profile.governedState === "string" ? profile.governedState : undefined,
    createdAt: typeof profile.createdAt === "string" ? profile.createdAt : undefined,
    updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : undefined,
    artifactPath,
    artifactMtime,
  };
}

export function sortAgentProfiles(profiles: AgentProfile[]): AgentProfile[] {
  return [...profiles].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;
    return (right.artifactMtime || 0) - (left.artifactMtime || 0);
  });
}
