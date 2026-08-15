import { useEffect, useMemo, useState } from "react";
import {
  listO2Files,
  readO2File,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import { SystemStateShell } from "../common/SystemStateShell";
import { useGovernedRecordNote } from "../common/useGovernedRecordNote";
import type { ProjectRow } from "../projects/types";
import { AgentBrief } from "./AgentBrief";
import { AgentFocusLimits } from "./AgentFocusLimits";
import { AgentNotes } from "./AgentNotes";
import { AgentRoster } from "./AgentRoster";
import { CreateAgentModal } from "./CreateAgentModal";
import { RouterHealthPanel } from "./RouterHealthPanel";
import {
  PROFILES_DIR,
  isProfileArtifact,
  makeBlankDraft,
  normalizeAgentProfile,
  notePathForProfile,
  parseCsvList,
  parseLineList,
  sortAgentProfiles,
  type AgentProfile,
  type AgentProfileDraft,
} from "./agentModel";

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

type AgentsMode = "profiles" | "repository_routers";

export function AgentsTab({
  projects,
  registerBeforeTabChangeSaver,
}: Props) {
  const [mode, setMode] = useState<AgentsMode>("profiles");
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
  const selectedProfile = useMemo(
    () =>
      profiles.find((profile) => profile.profileKey === selectedProfileKey) ||
      profiles[0] ||
      null,
    [profiles, selectedProfileKey],
  );

  const governedNote = useGovernedRecordNote({
    recordKey: selectedProfile?.profileKey || null,
    recordVersion: selectedProfile?.updatedAt || null,
    path: selectedProfile ? notePathForProfile(selectedProfile) : null,
    fallbackText: selectedProfile?.notes || "",
    registerBeforeTabChangeSaver,
  });

  async function selectProfile(profileKey: string): Promise<void> {
    if (await governedNote.flush()) setSelectedProfileKey(profileKey);
  }

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
          const read = await readO2File(filePath);
          let rawProfile: unknown;
          try {
            rawProfile = JSON.parse(read.content || "{}");
          } catch {
            throw new Error(`Invalid agent profile JSON: ${filePath}`);
          }

          return normalizeAgentProfile(
            rawProfile,
            filePath,
            read.mtime || item.mtime || null,
          );
        }),
      );

      const nextProfiles = sortAgentProfiles(loadedProfiles);
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

  const actions = (
    <button
      className="btn btnPrimary"
      data-testid="new-agent"
      onClick={openCreateModal}
      disabled={creatingProfile || profilesLoading}
      title="Create a governed agent profile under O2 authority"
    >
      New Agent
    </button>
  );

  return (
    <SystemStateShell title="Agents" actions={actions} error={err ? <>{err}</> : null}>
      <div className="workspaceModeRow" role="tablist" aria-label="Agent workspaces">
        <button
          type="button"
          className={`workspaceModeButton ${mode === "profiles" ? "workspaceModeButtonActive" : ""}`}
          onClick={() => setMode("profiles")}
          data-testid="agents-mode-profiles"
        >
          Agent Profiles
        </button>
        <button
          type="button"
          className={`workspaceModeButton ${mode === "repository_routers" ? "workspaceModeButtonActive" : ""}`}
          onClick={() => setMode("repository_routers")}
          data-testid="agents-mode-repository-routers"
        >
          Repository Routers
        </button>
      </div>

      {mode === "profiles" ? (
        <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <AgentRoster
            profiles={profiles}
            selectedProfileKey={selectedProfileKey}
            onSelect={(profileKey) => void selectProfile(profileKey)}
          />
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
                  <AgentBrief profile={selectedProfile} projects={projects} />
                  <AgentNotes
                    status={governedNote.status}
                    value={governedNote.text}
                    readOnly={!governedNote.path || governedNote.loading}
                    placeholder={
                      governedNote.path
                        ? "Agent note"
                        : "No governed note path available."
                    }
                    onChange={governedNote.onTextChange}
                  />
                </div>
              </div>

              <div className="surfaceCard">
                <div className="surfaceCardTitle">Focus & Limits</div>
                <AgentFocusLimits profile={selectedProfile} />
              </div>
            </div>
          )}
        </div>
        </div>
      ) : (
        <RouterHealthPanel />
      )}

      {showCreateModal ? (
        <CreateAgentModal
          draft={profileDraft}
          projects={projects}
          creating={creatingProfile}
          loading={profilesLoading}
          onClose={closeCreateModal}
          onDraftChange={(patch) =>
            setProfileDraft((current) => ({ ...current, ...patch }))
          }
          onCreate={createProfile}
        />
      ) : null}
    </SystemStateShell>
  );
}
