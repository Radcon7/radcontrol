import { useEffect, useMemo, useState } from "react";
import { ArtifactListPanel } from "../common/ArtifactListPanel";
import {
  type FilesListItem,
  type FilesReadJson,
  listO2Files,
  readO2File,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import { SystemStateShell } from "../common/SystemStateShell";
import type { ProjectRow } from "../projects/types";

type CreateAgentRunJson = {
  ok?: boolean;
  runId?: string;
  originArtifactPath?: string;
  error?: string;
};

type CreateAgentProfileJson = {
  ok?: boolean;
  profileKey?: string;
  originArtifactPath?: string;
  profileArtifactPath?: string;
  error?: string;
};

type Props = {
  projects: ProjectRow[];
};

type AgentProfile = {
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
  governedState?: string;
  createdAt?: string;
  updatedAt?: string;
  artifactPath?: string;
  artifactMtime?: number;
};

type AgentProfileDraft = {
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

const RUNS_DIR = "docs/agent-runs";
const PROFILES_DIR = "docs/agent-profiles";
const DEFAULT_CONTEXT_ARTIFACT =
  "docs/radcontrol/empire_blueprint/radcontrol_transition_blueprint_20260724.md";

function isRunOriginArtifact(item: FilesListItem): boolean {
  const path = item.path || "";
  return path.startsWith(`${RUNS_DIR}/`) && path.endsWith("/00_origin.md");
}

function isProfileArtifact(item: FilesListItem): boolean {
  const path = item.path || "";
  return path.startsWith(`${PROFILES_DIR}/`) && path.endsWith("/01_profile.json");
}

function sortNewest(items: FilesListItem[]) {
  return [...items].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

function labelForProject(projects: ProjectRow[], key: string): string {
  const project = projects.find((item) => item.key === key);
  return project ? `${project.label} (${project.key})` : key;
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineList(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLineList(value: string[]): string {
  return value.join("\n");
}

function makeBlankDraft(defaultProjectKey: string): AgentProfileDraft {
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
      "Describe the exact job this new agent should perform before you create the first run.",
    defaultMode: "read-only",
    approvalRequirement: "none",
    operatorIntent:
      "Define a governed specialist so future work can be assigned consistently inside RadControl.",
    contextArtifact: DEFAULT_CONTEXT_ARTIFACT,
    notes:
      "Use this draft to capture the doctrine you want before the first governed run is created.",
  };
}

function draftFromProfile(profile: AgentProfile): AgentProfileDraft {
  return {
    name: profile.name,
    handle: profile.handle,
    agentType: profile.agentType,
    mission: profile.mission,
    roleSummary: profile.roleSummary,
    strengthsText: joinLineList(profile.strengths),
    outputsText: joinLineList(profile.outputs),
    assignedProjectsText: profile.assignedProjects.join(", "),
    defaultTargetType: profile.defaultTargetType,
    defaultTargetKey: profile.defaultTargetKey,
    defaultTask: profile.defaultTask,
    defaultMode: profile.defaultMode,
    approvalRequirement: profile.approvalRequirement,
    operatorIntent: profile.operatorIntent,
    contextArtifact: profile.contextArtifact,
    notes: profile.notes,
  };
}

export function AgentRunsTab({ projects }: Props) {
  const defaultProjectKey = projects[0]?.key || "dqotd";

  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<AgentProfileDraft>(
    makeBlankDraft(defaultProjectKey),
  );
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  const [runItems, setRunItems] = useState<FilesListItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [err, setErr] = useState("");

  const [title, setTitle] = useState("Launch readiness review");
  const [targetType, setTargetType] = useState("project");
  const [targetKey, setTargetKey] = useState(defaultProjectKey);
  const [requestedTask, setRequestedTask] = useState(
    "Review current state, identify blockers, and produce the next recommended steps.",
  );
  const [operatorIntent, setOperatorIntent] = useState(
    "Create a governed agent run record before execution so progress is trackable in RadControl.",
  );
  const [requestedBy, setRequestedBy] = useState("chris");
  const [agentType, setAgentType] = useState("codex");
  const [requestedMode, setRequestedMode] = useState("read-only");
  const [approvalRequirement, setApprovalRequirement] = useState("none");
  const [contextArtifact, setContextArtifact] = useState(DEFAULT_CONTEXT_ARTIFACT);

  const runOrigins = useMemo(
    () => sortNewest(runItems.filter(isRunOriginArtifact)),
    [runItems],
  );

  const selectedProfile =
    profiles.find((profile) => profile.profileKey === selectedProfileKey) ||
    profiles[0] ||
    null;

  useEffect(() => {
    if (targetKey) return;
    setTargetKey(defaultProjectKey);
  }, [defaultProjectKey, targetKey]);

  useEffect(() => {
    setProfileDraft((current) => ({
      ...current,
      assignedProjectsText: current.assignedProjectsText || defaultProjectKey,
      defaultTargetKey: current.defaultTargetKey || defaultProjectKey,
    }));
  }, [defaultProjectKey]);

  async function readJsonPath(path: string): Promise<FilesReadJson> {
    return readO2File(path);
  }

  async function readRunPath(path: string): Promise<void> {
    const parsed = await readJsonPath(path);
    setCurrentPath(path);
    setCurrentText(parsed.content || "");
  }

  async function refreshRuns(preferredPath?: string | null): Promise<void> {
    setLoadingRuns(true);
    setErr("");

    try {
      const parsed = await listO2Files(RUNS_DIR);

      const nextItems = parsed.items || [];
      const nextOrigins = sortNewest(nextItems.filter(isRunOriginArtifact));
      setRunItems(nextItems);

      const nextPath =
        preferredPath && nextOrigins.some((item) => item.path === preferredPath)
          ? preferredPath
          : currentPath && nextOrigins.some((item) => item.path === currentPath)
            ? currentPath
            : nextOrigins[0]?.path || null;

      if (nextPath) {
        await readRunPath(nextPath);
      } else {
        setCurrentPath(null);
        setCurrentText("");
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingRuns(false);
    }
  }

  async function refreshProfiles(preferredKey?: string | null): Promise<void> {
    setProfilesLoading(true);
    setErr("");

    try {
      const parsed = await listO2Files(PROFILES_DIR);

      const nextItems = sortNewest((parsed.items || []).filter(isProfileArtifact));
      const loadedProfiles = await Promise.all(
        nextItems.map(async (item) => {
          const filePath = item.path || "";
          const read = await readJsonPath(filePath);
          let profile = {} as AgentProfile;
          try {
            profile = JSON.parse(read.content || "{}") as AgentProfile;
          } catch {
            throw new Error(`Invalid agent profile JSON: ${filePath}`);
          }
          return {
            ...profile,
            artifactPath: filePath,
            artifactMtime: read.mtime || item.mtime || null,
            operatorIntent: profile.operatorIntent || "",
            contextArtifact: profile.contextArtifact || "",
            notes: profile.notes || "",
            assignedProjects: Array.isArray(profile.assignedProjects)
              ? profile.assignedProjects
              : [],
            strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
            outputs: Array.isArray(profile.outputs) ? profile.outputs : [],
          } as AgentProfile;
        }),
      );

      loadedProfiles.sort((a, b) => a.name.localeCompare(b.name));
      setProfiles(loadedProfiles);

      const nextSelected =
        preferredKey && loadedProfiles.some((profile) => profile.profileKey === preferredKey)
          ? preferredKey
          : selectedProfileKey &&
              loadedProfiles.some((profile) => profile.profileKey === selectedProfileKey)
            ? selectedProfileKey
            : loadedProfiles[0]?.profileKey || null;

      setSelectedProfileKey(nextSelected);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([refreshProfiles(), refreshRuns()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyProfileToRun(profile: AgentProfile): void {
    setTitle(`${profile.name} :: ${profile.mission.split(".")[0]}`);
    setTargetType(profile.defaultTargetType);
    setTargetKey(profile.defaultTargetKey || defaultProjectKey);
    setRequestedTask(profile.defaultTask);
    setOperatorIntent(profile.operatorIntent);
    setAgentType(profile.agentType);
    setRequestedMode(profile.defaultMode);
    setApprovalRequirement(profile.approvalRequirement);
    setContextArtifact(profile.contextArtifact || DEFAULT_CONTEXT_ARTIFACT);
  }

  function startNewProfileDraft(): void {
    setProfileDraft(makeBlankDraft(defaultProjectKey));
  }

  function loadSelectedIntoBuilder(): void {
    if (!selectedProfile) return;
    setProfileDraft(draftFromProfile(selectedProfile));
  }

  async function createProfile(): Promise<void> {
    if (!profileDraft.name.trim() || !profileDraft.handle.trim()) {
      setErr("Agent profile name and handle are required.");
      return;
    }

    const strengths = parseLineList(profileDraft.strengthsText);
    const outputs = parseLineList(profileDraft.outputsText);
    if (strengths.length === 0 || outputs.length === 0) {
      setErr("Agent profiles need at least one strength and one expected output.");
      return;
    }

    setCreatingProfile(true);
    setErr("");

    try {
      const payload = {
        name: profileDraft.name,
        handle: profileDraft.handle,
        agentType: profileDraft.agentType,
        mission: profileDraft.mission,
        roleSummary: profileDraft.roleSummary,
        strengths,
        outputs,
        assignedProjects: parseCsvList(profileDraft.assignedProjectsText),
        defaultTargetType: profileDraft.defaultTargetType,
        defaultTargetKey: profileDraft.defaultTargetKey,
        defaultTask: profileDraft.defaultTask,
        defaultMode: profileDraft.defaultMode,
        approvalRequirement: profileDraft.approvalRequirement,
        operatorIntent: profileDraft.operatorIntent,
        contextArtifact: profileDraft.contextArtifact,
        notes: profileDraft.notes,
      };

      const parsed = await runO2PayloadParsedJson<CreateAgentProfileJson>(
        "agent_profile.create",
        payload,
        "agent_profile.create failed",
        "agent_profile.create returned invalid JSON",
      );

      if (!parsed.ok || !parsed.profileKey) {
        throw new Error(parsed.error || "agent_profile.create returned error");
      }

      await refreshProfiles(parsed.profileKey);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingProfile(false);
    }
  }

  async function createRun(): Promise<void> {
    if (!title.trim() || !targetKey.trim() || !requestedTask.trim()) {
      setErr("Title, target key, and requested task are required.");
      return;
    }

    setCreatingRun(true);
    setErr("");

    try {
      const payload = {
        title,
        targetType,
        targetKey,
        requestedTask,
        operatorIntent,
        requestedBy,
        agentType,
        requestedMode,
        approvalRequirement,
        contextArtifact,
      };

      const parsed = await runO2PayloadParsedJson<CreateAgentRunJson>(
        "agent_run.create",
        payload,
        "agent_run.create failed",
        "agent_run.create returned invalid JSON",
      );

      if (!parsed.ok || !parsed.originArtifactPath) {
        throw new Error(parsed.error || "agent_run.create returned error");
      }

      await refreshRuns(parsed.originArtifactPath);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingRun(false);
    }
  }

  const actions = (
    <>
      <button className="btn btnGhost" onClick={startNewProfileDraft}>
        Create New Agent
      </button>
      <button
        className="btn btnGhost"
        onClick={() => void Promise.all([refreshProfiles(), refreshRuns()])}
        disabled={profilesLoading || loadingRuns || creatingRun || creatingProfile}
      >
        {profilesLoading || loadingRuns ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );


  return (
    <SystemStateShell
      title="Agents"
      actions={actions}
      error={err ? <>{err}</> : null}
    >
      <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <div className="surfaceCard">
            <div className="surfaceCardTitle">Agent Roster</div>

            <div className="surfaceList">
              {profiles.length === 0 ? (
                <div className="surfaceMutedSmall">
                  No governed profiles found yet.
                </div>
              ) : (
                profiles.map((profile) => {
                  const active = profile.profileKey === selectedProfileKey;
                  return (
                    <button
                      key={profile.profileKey}
                      type="button"
                      onClick={() => setSelectedProfileKey(profile.profileKey)}
                      className={`surfaceNavButton ${active ? "surfaceNavButtonActive" : ""}`}
                    >
                      <div className="surfaceNavTitle">{profile.name}</div>
                      <div className="surfaceNavMeta">
                        {profile.roleSummary}
                      </div>
                      <div className="surfaceNavMetaSecondary">
                        {profile.assignedProjects.length > 0
                          ? profile.assignedProjects.join(" • ")
                          : "No project assignments yet"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <ArtifactListPanel
            title="Governed Agent Runs"
            items={runOrigins}
            currentPath={currentPath}
            emptyText="No governed agent runs yet."
            onSelect={(path) => void readRunPath(path)}
          />
        </div>

        <div className="surfaceCommandMain">
          {selectedProfile ? (
            <div className="surfaceCard">
              <div className="surfaceHero">
                <div>
                  <div className="surfaceTitleLg">{selectedProfile.name}</div>
                  <div className="surfaceCardLead">
                    {selectedProfile.mission}
                  </div>
                </div>
                <div className="surfaceTagRow">
                  <span className="surfaceTag">
                    {selectedProfile.agentType}
                  </span>
                  <span className="surfaceTag">
                    {selectedProfile.defaultMode}
                  </span>
                  <button
                    className="btn btnGhost"
                    onClick={loadSelectedIntoBuilder}
                    disabled={creatingProfile}
                  >
                    Clone To Builder
                  </button>
                  <button
                    className="btn btnPrimary"
                    onClick={() => applyProfileToRun(selectedProfile)}
                    disabled={creatingRun || loadingRuns}
                  >
                    Use For New Run
                  </button>
                </div>
              </div>

              <div className="surfaceGrid3">
                <div className="surfaceSection">
                  <div className="surfaceLabel">
                    Role
                  </div>
                  <div className="surfaceValue">{selectedProfile.roleSummary}</div>
                </div>

                <div className="surfaceSection">
                  <div className="surfaceLabel">
                    Strengths
                  </div>
                  <div className="surfaceBulletList">
                    {selectedProfile.strengths.map((strength) => (
                      <div key={strength} className="surfaceBullet">
                        • {strength}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surfaceSection">
                  <div className="surfaceLabel">
                    Assigned Projects
                  </div>
                  <div className="surfaceTagRow">
                    {selectedProfile.assignedProjects.map((key) => (
                      <span key={key} className="surfaceTag">
                        {labelForProject(projects, key)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="surfaceGrid2">
                <div className="surfaceSection">
                  <div className="surfaceLabel">
                    Expected Outputs
                  </div>
                  <div className="surfaceBulletList">
                    {selectedProfile.outputs.map((output) => (
                      <div key={output} className="surfaceBullet">
                        • {output}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="surfaceSection">
                  <div className="surfaceLabel">
                    Notes
                  </div>
                  <div className="surfaceValue">{selectedProfile.notes || "No notes recorded."}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="surfaceTwoPane">
            <div className="surfaceFormRows">
              <div className="surfaceCard surfaceFormGrid surfaceScrollCard">
                <div className="surfaceCardTitleRow">
                  <div className="surfaceCardTitle">Create Governed Profile</div>
                  <button className="btn btnGhost" onClick={startNewProfileDraft}>
                    Reset Draft
                  </button>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Name</span>
                  <input
                    className="input"
                    value={profileDraft.name}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, name: e.target.value }))}
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Handle</span>
                    <input
                      className="input"
                      value={profileDraft.handle}
                      onChange={(e) => setProfileDraft((current) => ({ ...current, handle: e.target.value }))}
                    />
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Agent Type</span>
                    <select
                      className="input"
                      value={profileDraft.agentType}
                      onChange={(e) => setProfileDraft((current) => ({ ...current, agentType: e.target.value }))}
                    >
                      <option value="codex">codex</option>
                      <option value="orion">orion</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Mission</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.mission}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, mission: e.target.value }))}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Role Summary</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.roleSummary}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, roleSummary: e.target.value }))}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Strengths</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.strengthsText}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, strengthsText: e.target.value }))}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Expected Outputs</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.outputsText}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, outputsText: e.target.value }))}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Assigned Projects</span>
                  <input
                    className="input"
                    value={profileDraft.assignedProjectsText}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, assignedProjectsText: e.target.value }))}
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Default Target Type</span>
                    <select
                      className="input"
                      value={profileDraft.defaultTargetType}
                      onChange={(e) => setProfileDraft((current) => ({ ...current, defaultTargetType: e.target.value }))}
                    >
                      <option value="project">project</option>
                      <option value="infrastructure_asset">infrastructure_asset</option>
                      <option value="empire">empire</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Default Target Key</span>
                    <input
                      className="input"
                      list="agent-profile-target-keys"
                      value={profileDraft.defaultTargetKey}
                      onChange={(e) => setProfileDraft((current) => ({ ...current, defaultTargetKey: e.target.value }))}
                    />
                    <datalist id="agent-profile-target-keys">
                      {projects.map((project) => (
                        <option key={project.key} value={project.key} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Default Task</span>
                  <textarea
                    className="pasteArea surfaceTextAreaLg"
                    value={profileDraft.defaultTask}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, defaultTask: e.target.value }))}
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Default Mode</span>
                    <select
                      className="input"
                      value={profileDraft.defaultMode}
                      onChange={(e) => setProfileDraft((current) => ({ ...current, defaultMode: e.target.value }))}
                    >
                      <option value="read-only">read-only</option>
                      <option value="auto">auto</option>
                      <option value="governed-write">governed-write</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Approval Requirement</span>
                    <select
                      className="input"
                      value={profileDraft.approvalRequirement}
                      onChange={(e) => setProfileDraft((current) => ({ ...current, approvalRequirement: e.target.value }))}
                    >
                      <option value="none">none</option>
                      <option value="required">required</option>
                      <option value="conditional">conditional</option>
                    </select>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Operator Intent</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.operatorIntent}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, operatorIntent: e.target.value }))}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Context Artifact</span>
                  <input
                    className="input"
                    value={profileDraft.contextArtifact}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, contextArtifact: e.target.value }))}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Notes</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.notes}
                    onChange={(e) => setProfileDraft((current) => ({ ...current, notes: e.target.value }))}
                  />
                </label>

                <button
                  className="btn btnPrimary"
                  onClick={() => void createProfile()}
                  disabled={creatingProfile || profilesLoading}
                >
                  {creatingProfile ? "Saving…" : "Create Governed Profile"}
                </button>
              </div>

              <div className="surfaceCard surfaceFormGrid surfaceScrollCard">
                <div className="surfaceCardTitle">Create Agent Run</div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Title</span>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Target Type</span>
                    <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
                      <option value="project">project</option>
                      <option value="infrastructure_asset">infrastructure_asset</option>
                      <option value="empire">empire</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Target Key</span>
                    <input
                      className="input"
                      list="agent-target-keys"
                      value={targetKey}
                      onChange={(e) => setTargetKey(e.target.value)}
                    />
                    <datalist id="agent-target-keys">
                      {projects.map((project) => (
                        <option key={project.key} value={project.key} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Requested Task</span>
                  <textarea
                    className="pasteArea surfaceTextAreaXl"
                    value={requestedTask}
                    onChange={(e) => setRequestedTask(e.target.value)}
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Operator Intent</span>
                  <textarea
                    className="pasteArea surfaceTextAreaLg"
                    value={operatorIntent}
                    onChange={(e) => setOperatorIntent(e.target.value)}
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Agent Type</span>
                    <select className="input" value={agentType} onChange={(e) => setAgentType(e.target.value)}>
                      <option value="codex">codex</option>
                      <option value="orion">orion</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Requested Mode</span>
                    <select className="input" value={requestedMode} onChange={(e) => setRequestedMode(e.target.value)}>
                      <option value="read-only">read-only</option>
                      <option value="auto">auto</option>
                      <option value="governed-write">governed-write</option>
                      <option value="other">other</option>
                    </select>
                  </label>
                </div>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Requested By</span>
                    <input className="input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Approval Requirement</span>
                    <select
                      className="input"
                      value={approvalRequirement}
                      onChange={(e) => setApprovalRequirement(e.target.value)}
                    >
                      <option value="none">none</option>
                      <option value="required">required</option>
                      <option value="conditional">conditional</option>
                    </select>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Context Artifact</span>
                  <input
                    className="input"
                    value={contextArtifact}
                    onChange={(e) => setContextArtifact(e.target.value)}
                  />
                </label>

                <button
                  className="btn btnPrimary"
                  onClick={() => void createRun()}
                  disabled={creatingRun || loadingRuns}
                >
                  {creatingRun ? "Creating…" : "Create Governed Agent Run"}
                </button>
              </div>
            </div>

            <div className="surfaceCard surfaceViewer">
              <div className="surfaceCardTitle">Governed Run Record</div>
              <textarea
                className="pasteArea surfaceTextareaFill"
                value={currentText}
                placeholder="Selected agent-run origin record will appear here…"
                spellCheck={false}
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </SystemStateShell>
  );
}
