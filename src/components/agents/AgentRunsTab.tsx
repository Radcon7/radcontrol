import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FilesReadJson,
  listO2Files,
  readO2File,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import { persistGovernedRecordNote } from "../common/governedRecordNote";
import { SystemStateShell } from "../common/SystemStateShell";
import type { ProjectRow } from "../projects/types";

type CreateAgentProfileJson = {
  ok?: boolean;
  profileKey?: string;
  originArtifactPath?: string;
  profileArtifactPath?: string;
  error?: string;
};

type Props = {
  projects: ProjectRow[];
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
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
  canonicalNotesPath?: string | null;
  governedState?: string;
  createdAt?: string;
  updatedAt?: string;
  artifactPath?: string;
  artifactMtime?: number | null;
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

const PROFILES_DIR = "docs/agent-profiles";
const DEFAULT_CONTEXT_ARTIFACT =
  "docs/radcontrol/empire_blueprint/radcontrol_transition_blueprint_20260724.md";

function isProfileArtifact(path: string): boolean {
  return path.startsWith(`${PROFILES_DIR}/`) && path.endsWith("/01_profile.json");
}

function sortNewest<T extends { artifactMtime?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.artifactMtime || 0) - (a.artifactMtime || 0));
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

function formatIsoDateTime(value?: string): string {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function labelForProject(projects: ProjectRow[], key: string): string {
  const project = projects.find((item) => item.key === key);
  return project ? project.label : key;
}

function joinProjectLabels(projects: ProjectRow[], keys: string[]): string {
  if (keys.length === 0) return "No projects assigned";
  return keys.map((key) => labelForProject(projects, key)).join(", ");
}

function notePathForProfile(profile: AgentProfile): string {
  const explicit = profile.canonicalNotesPath?.trim();
  if (explicit) return explicit;
  return `${PROFILES_DIR}/${profile.profileKey}/NOTES.md`;
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

async function readJsonPath(path: string): Promise<FilesReadJson> {
  return readO2File(path);
}

export function AgentRunsTab({
  projects,
  registerBeforeTabChangeSaver,
}: Props) {
  const defaultProjectKey = projects[0]?.key || "dqotd";

  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<AgentProfileDraft>(
    makeBlankDraft(defaultProjectKey),
  );
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [err, setErr] = useState("");
  const [notesText, setNotesText] = useState("");
  const [notesPath, setNotesPath] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const [notesFileExists, setNotesFileExists] = useState(false);
  const notesRevisionRef = useRef(0);
  const notesPathRef = useRef<string | null>(null);
  const notesTextRef = useRef("");
  const notesLoadingRef = useRef(false);

  useEffect(() => {
    notesPathRef.current = notesPath;
  }, [notesPath]);

  useEffect(() => {
    notesTextRef.current = notesText;
  }, [notesText]);

  useEffect(() => {
    notesLoadingRef.current = notesLoading;
  }, [notesLoading]);

  async function flushGovernedNotes(): Promise<boolean> {
    if (notesRevisionRef.current === 0) return true;

    const path = notesPathRef.current;
    if (!path || notesLoadingRef.current) return false;

    setNotesSaving(true);
    setNotesError("");
    try {
      const savedAt = await persistGovernedRecordNote(
        path,
        notesTextRef.current,
      );
      notesRevisionRef.current = 0;
      setNotesSavedAt(savedAt);
      return true;
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setNotesSaving(false);
    }
  }

  useEffect(() => {
    if (!registerBeforeTabChangeSaver) return;
    registerBeforeTabChangeSaver(flushGovernedNotes);
    return () => registerBeforeTabChangeSaver(null);
  });

  const selectedProfile = useMemo(
    () =>
      profiles.find((profile) => profile.profileKey === selectedProfileKey) ||
      profiles[0] ||
      null,
    [profiles, selectedProfileKey],
  );

  useEffect(() => {
    setProfileDraft((current) => ({
      ...current,
      assignedProjectsText: current.assignedProjectsText || defaultProjectKey,
      defaultTargetKey: current.defaultTargetKey || defaultProjectKey,
    }));
  }, [defaultProjectKey]);

  async function refreshProfiles(preferredKey?: string | null): Promise<void> {
    setProfilesLoading(true);
    setErr("");

    try {
      const parsed = await listO2Files(PROFILES_DIR);
      const profileItems = (parsed.items || [])
        .filter((item) => typeof item.path === "string")
        .filter((item) => isProfileArtifact(item.path || ""));

      const loadedProfiles = await Promise.all(
        profileItems.map(async (item) => {
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
            canonicalNotesPath:
              typeof profile.canonicalNotesPath === "string"
                ? profile.canonicalNotesPath
                : null,
            assignedProjects: Array.isArray(profile.assignedProjects)
              ? profile.assignedProjects
              : [],
            strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
            outputs: Array.isArray(profile.outputs) ? profile.outputs : [],
          } as AgentProfile;
        }),
      );

      const nextProfiles = sortNewest(loadedProfiles).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setProfiles(nextProfiles);

      const nextSelected =
        preferredKey && nextProfiles.some((profile) => profile.profileKey === preferredKey)
          ? preferredKey
          : selectedProfileKey &&
              nextProfiles.some((profile) => profile.profileKey === selectedProfileKey)
            ? selectedProfileKey
            : nextProfiles[0]?.profileKey || null;

      setSelectedProfileKey(nextSelected);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    void refreshProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotes() {
      if (!selectedProfile) {
        setNotesPath(null);
        setNotesText("");
        setNotesError("");
        setNotesSavedAt(null);
        setNotesFileExists(false);
        setNotesLoading(false);
        return;
      }

      const nextPath = notePathForProfile(selectedProfile);
      setNotesPath(nextPath);
      setNotesLoading(true);
      setNotesError("");

      try {
        const parsed = await readO2File(nextPath);
        if (cancelled) return;

        notesRevisionRef.current = 0;
        setNotesText(parsed.content || "");
        setNotesSavedAt(typeof parsed.mtime === "number" ? parsed.mtime : null);
        setNotesFileExists(true);
      } catch {
        if (cancelled) return;

        notesRevisionRef.current = 0;
        setNotesText(selectedProfile.notes || "");
        setNotesSavedAt(null);
        setNotesFileExists(false);
      } finally {
        if (!cancelled) {
          setNotesLoading(false);
        }
      }
    }

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [selectedProfile?.profileKey, selectedProfile?.updatedAt]);

  useEffect(() => {
    if (!selectedProfile?.profileKey || !notesPath || notesLoading) return;
    if (notesRevisionRef.current === 0) return;

    const revisionAtSchedule = notesRevisionRef.current;
    const timeoutId = window.setTimeout(async () => {
      if (notesRevisionRef.current !== revisionAtSchedule) return;
      setNotesSaving(true);
      setNotesError("");

      try {
        const savedAt = await persistGovernedRecordNote(
          notesPath,
          notesText,
        );

        if (notesRevisionRef.current === revisionAtSchedule) {
          notesRevisionRef.current = 0;
        }

        setNotesSavedAt(savedAt);
        setNotesFileExists(true);
      } catch (error) {
        setNotesError(error instanceof Error ? error.message : String(error));
      } finally {
        setNotesSaving(false);
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notesLoading, notesPath, notesText, selectedProfile?.profileKey]);

  function openCreateModal(): void {
    setProfileDraft(makeBlankDraft(defaultProjectKey));
    setShowCreateModal(true);
    setErr("");
  }

  function closeCreateModal(): void {
    if (creatingProfile) return;
    setShowCreateModal(false);
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
      setShowCreateModal(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingProfile(false);
    }
  }

  const notesDirty = notesRevisionRef.current > 0;
  const notesStatus = notesLoading
    ? "Loading note..."
    : notesSaving
      ? "Saving..."
      : notesError
        ? notesError
        : notesDirty
          ? "Unsaved changes"
          : notesSavedAt
            ? `Saved ${new Date(notesSavedAt).toLocaleString()}`
            : notesFileExists
              ? "Governed note"
              : "Note will be created on first save";

  const actions = (
    <button
      className="btn btnPrimary"
      onClick={openCreateModal}
      disabled={creatingProfile || profilesLoading}
      title="Create a governed agent profile under O2 authority"
    >
      New Agent
    </button>
  );

  return (
    <SystemStateShell title="Agents" actions={actions} error={err ? <>{err}</> : null}>
      <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <div className="surfaceCard surfaceSidebarCard">
            <div className="surfaceCardTitleRow surfaceSidebarHeaderRow">
              <div className="surfaceCardTitle">AGENT ROSTER</div>
            </div>

            <div className="surfaceList">
              {profiles.length === 0 ? (
                <div className="surfaceEmptyState">No governed agents available yet.</div>
              ) : (
                profiles.map((profile) => {
                  const active = profile.profileKey === selectedProfileKey;
                  return (
                    <button
                      key={profile.profileKey}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedProfileKey(profile.profileKey)}
                      className={`surfaceNavButton ${active ? "surfaceNavButtonActive" : ""}`}
                    >
                      <div className="surfaceNavTitle">{profile.name}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="surfaceCommandMain">
          {!selectedProfile ? (
            <div className="surfaceCard surfaceEmptyState surfaceEmptyStateLarge">
              Select an agent to inspect its focus, governed limits, and operating scope.
            </div>
          ) : (
            <div className="surfaceGridProjectTop">
              <div className="surfaceCard surfaceDetailBriefCard">
                <div className="surfaceCardTitle">Agent Brief</div>
                <div className="surfaceSummaryList">
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Agent</div>
                    <div className="surfaceValue">{selectedProfile.name}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Handle</div>
                    <div className="surfaceValue">{selectedProfile.handle}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Agent Type</div>
                    <div className="surfaceValue">{selectedProfile.agentType}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Mission</div>
                    <div className="surfaceValue">{selectedProfile.mission}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Role Summary</div>
                    <div className="surfaceValue">{selectedProfile.roleSummary}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Assigned Projects</div>
                    <div className="surfaceValue">
                      {joinProjectLabels(projects, selectedProfile.assignedProjects)}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Default Task</div>
                    <div className="surfaceValue">{selectedProfile.defaultTask}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Expected Outputs</div>
                    <div className="surfaceValue">
                      {selectedProfile.outputs.length
                        ? selectedProfile.outputs.join(", ")
                        : "No outputs recorded"}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Strengths</div>
                    <div className="surfaceValue">
                      {selectedProfile.strengths.length
                        ? selectedProfile.strengths.join(", ")
                        : "No strengths recorded"}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow surfaceSummaryRowTall">
                    <div className="surfaceSummaryHeader">
                      <div className="surfaceLabel">Agent Notes</div>
                      <div className="surfaceMutedSmall">{notesStatus}</div>
                    </div>
                    <textarea
                      className="notesSingleArea surfaceProjectNoteArea"
                      value={notesText}
                      readOnly={!notesPath || notesLoading}
                      placeholder={notesPath ? "Agent note" : "No governed note path available."}
                      onChange={(event) => {
                        notesRevisionRef.current += 1;
                        setNotesText(event.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="surfaceCard">
                <div className="surfaceCardTitle">Focus & Limits</div>
                <div className="surfaceSummaryList">
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Scope</div>
                    <div className="surfaceValue">{selectedProfile.defaultTargetType}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Default Target Key</div>
                    <div className="surfaceValue">
                      {selectedProfile.defaultTargetKey || "Not recorded"}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Default Mode</div>
                    <div className="surfaceValue">{selectedProfile.defaultMode}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Approval Requirement</div>
                    <div className="surfaceValue">{selectedProfile.approvalRequirement}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Operator Intent</div>
                    <div className="surfaceValue">{selectedProfile.operatorIntent || "Not recorded"}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Context Artifact</div>
                    <div className="surfaceValue">{selectedProfile.contextArtifact || "Not recorded"}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Governed State</div>
                    <div className="surfaceValue">{selectedProfile.governedState || "active"}</div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Updated</div>
                    <div className="surfaceValue">
                      {formatIsoDateTime(selectedProfile.updatedAt || selectedProfile.createdAt)}
                    </div>
                  </div>
                  <div className="surfaceSummaryRow">
                    <div className="surfaceLabel">Record Artifact</div>
                    <div className="surfaceValue">
                      {selectedProfile.artifactPath || "Not recorded"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateModal ? (
        <div className="modalOverlay" onClick={closeCreateModal}>
          <div
            className="modalCard infrastructureModalCard"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div className="modalTitle">New Agent</div>
              <button className="btn btnGhost" onClick={closeCreateModal} disabled={creatingProfile}>
                Close
              </button>
            </div>

            <div className="modalBody modalBodySingle">
              <div className="surfaceFormGrid">
                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Name</span>
                  <input
                    className="input"
                    value={profileDraft.name}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Handle</span>
                    <input
                      className="input"
                      value={profileDraft.handle}
                      onChange={(event) =>
                        setProfileDraft((current) => ({ ...current, handle: event.target.value }))
                      }
                    />
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Agent Type</span>
                    <div className="surfaceSelectWrap">
                      <select
                        className="input"
                        value={profileDraft.agentType}
                        onChange={(event) =>
                          setProfileDraft((current) => ({ ...current, agentType: event.target.value }))
                        }
                      >
                        <option value="codex">codex</option>
                        <option value="orion">orion</option>
                        <option value="other">other</option>
                      </select>
                    </div>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Mission</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.mission}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, mission: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Role Summary</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.roleSummary}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, roleSummary: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Strengths</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.strengthsText}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, strengthsText: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Expected Outputs</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.outputsText}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, outputsText: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Assigned Projects</span>
                  <input
                    className="input"
                    value={profileDraft.assignedProjectsText}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, assignedProjectsText: event.target.value }))
                    }
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Default Target Type</span>
                    <div className="surfaceSelectWrap">
                      <select
                        className="input"
                        value={profileDraft.defaultTargetType}
                        onChange={(event) =>
                          setProfileDraft((current) => ({ ...current, defaultTargetType: event.target.value }))
                        }
                      >
                        <option value="project">project</option>
                        <option value="infrastructure_asset">infrastructure_asset</option>
                        <option value="empire">empire</option>
                        <option value="other">other</option>
                      </select>
                    </div>
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Default Target Key</span>
                    <input
                      className="input"
                      list="agent-profile-target-keys"
                      value={profileDraft.defaultTargetKey}
                      onChange={(event) =>
                        setProfileDraft((current) => ({ ...current, defaultTargetKey: event.target.value }))
                      }
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
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, defaultTask: event.target.value }))
                    }
                  />
                </label>

                <div className="surfaceFormRow2">
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Default Mode</span>
                    <div className="surfaceSelectWrap">
                      <select
                        className="input"
                        value={profileDraft.defaultMode}
                        onChange={(event) =>
                          setProfileDraft((current) => ({ ...current, defaultMode: event.target.value }))
                        }
                      >
                        <option value="read-only">read-only</option>
                        <option value="auto">auto</option>
                        <option value="governed-write">governed-write</option>
                        <option value="other">other</option>
                      </select>
                    </div>
                  </label>
                  <label className="surfaceFormField">
                    <span className="surfaceFormLabel">Approval Requirement</span>
                    <div className="surfaceSelectWrap">
                      <select
                        className="input"
                        value={profileDraft.approvalRequirement}
                        onChange={(event) =>
                          setProfileDraft((current) => ({ ...current, approvalRequirement: event.target.value }))
                        }
                      >
                        <option value="none">none</option>
                        <option value="required">required</option>
                        <option value="conditional">conditional</option>
                      </select>
                    </div>
                  </label>
                </div>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Operator Intent</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.operatorIntent}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, operatorIntent: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Context Artifact</span>
                  <input
                    className="input"
                    value={profileDraft.contextArtifact}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, contextArtifact: event.target.value }))
                    }
                  />
                </label>

                <label className="surfaceFormField">
                  <span className="surfaceFormLabel">Notes</span>
                  <textarea
                    className="pasteArea surfaceTextAreaMd"
                    value={profileDraft.notes}
                    onChange={(event) =>
                      setProfileDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                  />
                </label>

                <div className="surfaceSummaryHeader">
                  <div className="surfaceMutedSmall">
                    Create governed agent profiles here. Concurrent agent execution and run history will be handled elsewhere.
                  </div>
                  <button
                    className="btn btnPrimary"
                    onClick={() => void createProfile()}
                    disabled={creatingProfile || profilesLoading}
                  >
                    {creatingProfile ? "Saving…" : "Create Agent"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SystemStateShell>
  );
}
