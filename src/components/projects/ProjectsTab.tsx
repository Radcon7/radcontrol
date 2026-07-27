import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FilesListItem,
  listO2Files,
  readO2File,
  runO2PayloadParsedJson,
} from "../common/o2Files";
import { SystemStateShell } from "../common/SystemStateShell";
import type { ProjectRow, PortStatus } from "./types";

type StatusLike = {
  pill: string;
  text: string;
};

type Props = {
  projects: ProjectRow[];
  ports: Record<number, PortStatus | undefined>;
  busy: boolean;
  portsBusy: boolean;
  onOpenAddProject: () => void;
  onReloadProjects: () => Promise<unknown> | void;
  onRefreshPorts: () => Promise<void> | void;
  preferredProjectKey?: string | null;
  onPreferredProjectKeyHandled?: () => void;
  onStart: (p: ProjectRow) => Promise<void> | void;
  onOpenUrl: (p: ProjectRow) => Promise<void> | void;
  onSnapshot: (p: ProjectRow) => Promise<void> | void;
  onCommit: (p: ProjectRow) => Promise<void> | void;
  onLab: (p: ProjectRow) => Promise<void> | void;
  onKill: (port: number) => Promise<void> | void;
  onMap: (p: ProjectRow) => Promise<void> | void;
  onProofPack: (p: ProjectRow) => Promise<void> | void;
  onSetRetired: (p: ProjectRow, retired: boolean) => Promise<void> | void;
  onEnsureNotes: (p: ProjectRow) => Promise<ProjectRow> | ProjectRow;
  statusForRow: (p: ProjectRow) => StatusLike | unknown;
};

type SortMode = "name" | "start_date" | "active" | "running_status";

type NotesModalState = {
  open: boolean;
  projectLabel: string;
  projectKey: string;
  notesText: string;
};

type CreateAgentRunJson = {
  ok?: boolean;
  runId?: string;
  originArtifactPath?: string;
  error?: string;
};

type CreateAgentProfileJson = {
  ok?: boolean;
  profileKey?: string;
  profileArtifactPath?: string;
  error?: string;
};

type ProjectAuditRecord = {
  path: string;
  content: string;
  mtime: number | null;
  title: string;
  requestedTask: string;
};

type DetailSignal = {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
};

type ProjectDetail = {
  p: ProjectRow;
  st: StatusLike;
  port?: number;
  isListening: boolean;
  startDisabled: boolean;
  startUnavailableTitle: string;
  openDisabled: boolean;
  openUnavailableTitle: string;
  snapshotDisabled: boolean;
  commitDisabled: boolean;
  labDisabled: boolean;
  mapDisabled: boolean;
  proofPackDisabled: boolean;
  lifecycleToggleDisabled: boolean;
  notesDisabled: boolean;
  statusAuditDisabled: boolean;
  statusProfileDisabled: boolean;
  killDisabled: boolean;
};

const AGENT_RUNS_DIR = "docs/agent-runs";
const AGENT_PROFILES_DIR = "docs/agent-profiles";
const PROJECT_STATUS_AGENT_HANDLE = "project-status-agent";
const DEFAULT_AGENT_CONTEXT_ARTIFACT =
  "docs/radcontrol/empire_blueprint/radcontrol_transition_blueprint_20260724.md";

function sortNewest(items: FilesListItem[]): FilesListItem[] {
  return [...items].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
}

function isOriginRecord(item: FilesListItem): boolean {
  const path = item.path || "";
  return path.startsWith(`${AGENT_RUNS_DIR}/`) && path.endsWith("/00_origin.md");
}

function isProfileRecord(item: FilesListItem): boolean {
  const path = item.path || "";
  return (
    path.startsWith(`${AGENT_PROFILES_DIR}/`) && path.endsWith("/01_profile.json")
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOriginField(content: string, label: string): string {
  const pattern = new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "m");
  return content.match(pattern)?.[1]?.trim() || "";
}

function parseOriginSection(content: string, heading: string): string {
  const pattern = new RegExp(
    `## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?:\\n## |$)`,
    "m",
  );
  return content.match(pattern)?.[1]?.trim() || "";
}

function parseOriginTitle(content: string): string {
  const firstLine = content.split("\n")[0] || "";
  return firstLine.replace(/^#\s*Agent Run Origin\s*[—-]\s*/u, "").trim();
}

function isStatusAuditRecord(
  record: Pick<ProjectAuditRecord, "title" | "requestedTask">,
): boolean {
  const haystack = `${record.title}
${record.requestedTask}`.toLowerCase();
  return haystack.includes("status audit") || haystack.includes("launch readiness");
}

function projectAuditPathLooksRelevant(path: string, projectKey: string): boolean {
  const lowerPath = path.toLowerCase();
  const lowerKey = projectKey.toLowerCase();
  return (
    lowerPath.includes(`__${lowerKey}__`) ||
    lowerPath.includes(`/${lowerKey}/`) ||
    lowerPath.includes(`_${lowerKey}_`)
  );
}

function fmtArtifactTime(value?: number | null): string {
  if (!value || !Number.isFinite(value)) return "—";
  const ms = value < 1000000000000 ? value * 1000 : value;
  return new Date(ms).toLocaleString();
}

function projectStatusRank(statusText: string): number {
  const status = statusText.toUpperCase();
  if (status === "RUNNING") return 0;
  if (status === "STOPPED") return 1;
  return 2;
}

function lifecycleRank(project: ProjectRow): number {
  return project.retired ? 1 : 0;
}

function fmtStartDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function recommendAgentForProject(project: ProjectRow): string {
  if (project.state === "forming") return "Research Agent";
  if (project.retired) return "Research Agent";
  if (project.kind === "tauri") return "Builder Agent";
  if (project.kind === "docs") return "Research Agent";
  return "Builder Agent";
}

function readinessSignals(project: ProjectRow, runningText: string): DetailSignal[] {
  const signals: DetailSignal[] = [
    {
      label: "Runtime",
      value: runningText,
      tone: runningText.toUpperCase() === "RUNNING" ? "good" : "warn",
    },
    {
      label: "Lifecycle",
      value: project.retired ? "Retired" : "Active",
      tone: project.retired ? "warn" : "good",
    },
    {
      label: "Notes",
      value: project.notesAvailable ? "Governed note available" : "Needs note file",
      tone: project.notesAvailable ? "good" : "warn",
    },
    {
      label: "Repo",
      value: project.repoHint || "Repo hint not recorded",
      tone: project.repoHint ? "neutral" : "warn",
    },
    {
      label: "URL",
      value: project.url || "Not recorded",
      tone: project.url ? "good" : "warn",
    },
    {
      label: "Port",
      value: typeof project.port === "number" ? `:${project.port}` : "Not assigned",
      tone: typeof project.port === "number" ? "neutral" : "warn",
    },
    {
      label: "Kind",
      value: project.kind || "Not classified",
      tone: project.kind ? "neutral" : "warn",
    },
  ];

  if (project.state === "forming") {
    signals.push({
      label: "Formation",
      value:
        "Governed dossier exists; keep follow-up and structure decisions in O2 before deeper build work.",
      tone: "warn",
    });
  }

  if (project.runtimeContractPath) {
    signals.push({
      label: "Runtime Contract",
      value: project.runtimeContractPath,
      tone: "good",
    });
  }

  if (
    project.preferredUrl &&
    project.runtimeUrl &&
    project.preferredUrl !== project.runtimeUrl
  ) {
    signals.push({
      label: "Runtime Drift",
      value: `Preferred URL is ${project.preferredUrl}, but runtime reports ${project.runtimeUrl}.`,
      tone: "warn",
    });
  }

  return signals;
}

function projectFocus(project: ProjectRow): string[] {
  if (project.state === "forming") {
    return [
      "Keep this project in governed formation mode until the next O2 follow-up clarifies the repo shape and launch path.",
      "Use a research-oriented agent run to reduce false starts before infrastructure or scaffold changes.",
      "Capture missing launch assumptions in governed notes instead of relying on operator memory.",
    ];
  }

  if (project.retired) {
    return [
      "Keep this project in reference mode unless a governed reactivation decision is made.",
      "Use notes and audits to preserve context rather than spending runtime effort here.",
    ];
  }

  return [
    "Use Repo Snapshot, Map, and Proof Pack to keep project state visible before deeper code or infra changes.",
    "Capture missing infrastructure dependencies under Infrastructure so launch-readiness stops living in memory.",
    "Run a governed status audit whenever the current state feels assumed instead of evidenced.",
  ];
}

function buildNotesText(project: ProjectRow): string {
  if (!project.notesPath) {
    return "No notes path is available for this project yet.";
  }

  if (project.notesAvailable) {
    return `Project notes are on disk at:
${project.notesPath}

Use your normal editor flow to update this single note file.`;
  }

  return `Notes file is expected at:
${project.notesPath}

This file is not available yet.`;
}

export function ProjectsTab({
  projects,
  ports,
  busy,
  portsBusy,
  onOpenAddProject,
  onReloadProjects,
  onRefreshPorts,
  preferredProjectKey,
  onPreferredProjectKeyHandled,
  onStart,
  onOpenUrl,
  onSnapshot,
  onCommit,
  onLab,
  onKill,
  onMap,
  onProofPack,
  onSetRetired,
  onEnsureNotes,
  statusForRow,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("active");
  const [showRetired, setShowRetired] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notesBusyKey, setNotesBusyKey] = useState<string | null>(null);
  const [statusAuditBusyKey, setStatusAuditBusyKey] = useState<string | null>(null);
  const [statusProfileBusy, setStatusProfileBusy] = useState(false);
  const [statusProfilePath, setStatusProfilePath] = useState<string | null>(null);
  const [auditByProject, setAuditByProject] = useState<Record<string, ProjectAuditRecord | null>>(
    {},
  );
  const [auditErrByProject, setAuditErrByProject] = useState<Record<string, string>>({});
  const [auditLoadingKey, setAuditLoadingKey] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState<NotesModalState>({
    open: false,
    projectLabel: "",
    projectKey: "",
    notesText: "",
  });

  const safeStatusForRow = useCallback(
    (project: ProjectRow): StatusLike => {
      const status = statusForRow(project) as Partial<StatusLike> | null | undefined;
      return {
        pill: typeof status?.pill === "string" ? status.pill : "pillMuted",
        text: typeof status?.text === "string" ? status.text : "—",
      };
    },
    [statusForRow],
  );

  const projectRows = useMemo(
    () =>
      projects.filter((row) => {
        if (row.key === "o2" || row.key === "radcontrol") return false;
        const match = row.key.match(/^(.+)-lab-v1$/i);
        if (!match) return true;
        return !projects.some((candidate) => candidate.key === match[1]);
      }),
    [projects],
  );

  const sortedProjects = useMemo(() => {
    const visibleProjects = projectRows.filter((project) =>
      showRetired ? true : !project.retired,
    );

    return [...visibleProjects].sort((a, b) => {
      if (sortMode === "name") return a.label.localeCompare(b.label);

      if (sortMode === "start_date") {
        const aTime = a.startDate ? Date.parse(a.startDate) : Number.NEGATIVE_INFINITY;
        const bTime = b.startDate ? Date.parse(b.startDate) : Number.NEGATIVE_INFINITY;
        return bTime - aTime;
      }

      if (sortMode === "running_status") {
        const rank =
          projectStatusRank(safeStatusForRow(a).text) -
          projectStatusRank(safeStatusForRow(b).text);
        return rank !== 0 ? rank : a.label.localeCompare(b.label);
      }

      const lifecycle = lifecycleRank(a) - lifecycleRank(b);
      if (lifecycle !== 0) return lifecycle;

      const runtimeRank =
        projectStatusRank(safeStatusForRow(a).text) -
        projectStatusRank(safeStatusForRow(b).text);
      return runtimeRank !== 0 ? runtimeRank : a.label.localeCompare(b.label);
    });
  }, [projectRows, safeStatusForRow, showRetired, sortMode]);

  useEffect(() => {
    if (sortedProjects.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (
      preferredProjectKey &&
      sortedProjects.some((project) => project.key === preferredProjectKey)
    ) {
      setSelectedKey(preferredProjectKey);
      onPreferredProjectKeyHandled?.();
      return;
    }

    setSelectedKey((current) =>
      current && sortedProjects.some((project) => project.key === current)
        ? current
        : sortedProjects[0].key,
    );
  }, [
    onPreferredProjectKeyHandled,
    preferredProjectKey,
    sortedProjects,
  ]);

  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.key === selectedKey) || null,
    [selectedKey, sortedProjects],
  );

  const selectedAudit = selectedProject ? auditByProject[selectedProject.key] ?? null : null;
  const selectedAuditErr = selectedProject ? auditErrByProject[selectedProject.key] || "" : "";
  const auditLoading = selectedProject ? auditLoadingKey === selectedProject.key : false;

  const listArtifacts = useCallback(async (dir: string): Promise<FilesListItem[]> => {
    const parsed = await listO2Files(dir);
    return Array.isArray(parsed.items) ? parsed.items : [];
  }, []);

  const readArtifact = useCallback(
    async (path: string): Promise<{ content: string; mtime: number | null }> => {
      const parsed = await readO2File(path);

      return {
        content: parsed.content || "",
        mtime: typeof parsed.mtime === "number" ? parsed.mtime : null,
      };
    },
    [],
  );

  const refreshStatusAgentProfile = useCallback(async (): Promise<void> => {
    setStatusProfileBusy(true);
    try {
      const items = sortNewest((await listArtifacts(AGENT_PROFILES_DIR)).filter(isProfileRecord));
      for (const item of items) {
        if (!item.path) continue;
        try {
          const read = await readArtifact(item.path);
          const parsed = JSON.parse(read.content) as { handle?: string };
          if (parsed.handle === PROJECT_STATUS_AGENT_HANDLE) {
            setStatusProfilePath(item.path);
            return;
          }
        } catch {
          // Ignore malformed profile records and keep scanning.
        }
      }
      setStatusProfilePath(null);
    } catch {
      setStatusProfilePath(null);
    } finally {
      setStatusProfileBusy(false);
    }
  }, [listArtifacts, readArtifact]);

  const refreshLatestAudit = useCallback(
    async (projectKey: string, options?: { force?: boolean }): Promise<void> => {
      if (!options?.force && Object.prototype.hasOwnProperty.call(auditByProject, projectKey)) {
        return;
      }

      setAuditLoadingKey(projectKey);
      setAuditErrByProject((current) => ({ ...current, [projectKey]: "" }));

      try {
        const items = sortNewest((await listArtifacts(AGENT_RUNS_DIR)).filter(isOriginRecord));
        const preferredItems = items.filter((item) =>
          item.path ? projectAuditPathLooksRelevant(item.path, projectKey) : false,
        );
        const scanItems = preferredItems.length > 0 ? preferredItems : items;

        let fallback: ProjectAuditRecord | null = null;

        for (const item of scanItems) {
          if (!item.path) continue;
          try {
            const read = await readArtifact(item.path);
            const targetKey = parseOriginField(read.content, "Target Key");
            if (targetKey !== projectKey) continue;

            const record: ProjectAuditRecord = {
              path: item.path,
              content: read.content,
              mtime: read.mtime ?? item.mtime ?? null,
              title: parseOriginTitle(read.content),
              requestedTask: parseOriginSection(read.content, "Requested Task"),
            };

            if (isStatusAuditRecord(record)) {
              setAuditByProject((current) => ({ ...current, [projectKey]: record }));
              return;
            }

            if (!fallback) {
              fallback = record;
            }
          } catch {
            // Ignore malformed run artifacts and continue.
          }
        }

        setAuditByProject((current) => ({ ...current, [projectKey]: fallback }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAuditByProject((current) => ({ ...current, [projectKey]: null }));
        setAuditErrByProject((current) => ({ ...current, [projectKey]: message }));
      } finally {
        setAuditLoadingKey((current) => (current === projectKey ? null : current));
      }
    },
    [auditByProject, listArtifacts, readArtifact],
  );

  const createStatusAgentProfile = useCallback(
    async (project: ProjectRow): Promise<void> => {
      setStatusProfileBusy(true);
      setAuditErrByProject((current) => ({ ...current, [project.key]: "" }));
      try {
        const payload = {
          name: "Project Status Agent",
          handle: PROJECT_STATUS_AGENT_HANDLE,
          agentType: "codex",
          mission:
            "Audit one governed project at a time and produce a concise status memo grounded in repo, runtime, infrastructure, and launch-readiness evidence.",
          roleSummary:
            "Research the active project, capture current facts, identify blockers, and recommend the next professional actions.",
          strengths: [
            "Status auditing",
            "Infrastructure gap finding",
            "Launch-readiness review",
          ],
          outputs: [
            "Governed status memo",
            "Blocker list",
            "Next-step recommendation",
          ],
          assignedProjects: [project.key],
          defaultTargetType: "project",
          defaultTargetKey: project.key,
          defaultTask:
            "Audit the current status of this project, identify blockers, verify what is known versus assumed, and recommend the next governed actions.",
          defaultMode: "read-only",
          approvalRequirement: "none",
          operatorIntent:
            "Create a reusable governed agent profile so project status audits can be launched intentionally from the Projects tab.",
          contextArtifact: project.notesPath || DEFAULT_AGENT_CONTEXT_ARTIFACT,
          notes:
            "Use this profile for on-demand project audits from RadControl. Keep runs evidence-first and avoid silent background drift.",
        };

        const parsed = await runO2PayloadParsedJson<CreateAgentProfileJson>(
          "agent_profile.create",
          payload,
          "agent_profile.create failed",
          "agent_profile.create returned invalid JSON",
        );

        if (!parsed.ok) {
          throw new Error(parsed.error || "agent_profile.create returned error");
        }

        setStatusProfilePath(parsed.profileArtifactPath || statusProfilePath);
        if (!parsed.profileArtifactPath) {
          await refreshStatusAgentProfile();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAuditErrByProject((current) => ({ ...current, [project.key]: message }));
      } finally {
        setStatusProfileBusy(false);
      }
    },
    [refreshStatusAgentProfile, statusProfilePath],
  );

  const runStatusAudit = useCallback(
    async (project: ProjectRow): Promise<void> => {
      setStatusAuditBusyKey(project.key);
      setAuditErrByProject((current) => ({ ...current, [project.key]: "" }));

      try {
        const payload = {
          title: `Project Status Audit - ${project.label}`,
          targetType: "project",
          targetKey: project.key,
          requestedTask:
            "Audit the current status of this project. Review governed repo and runtime evidence, identify missing external facts such as Vercel, Supabase, domain, workspace, or release-readiness state where relevant, and produce a concise next-step memo.",
          operatorIntent:
            "Create a governed status audit record for the selected project so RadControl can track current state and next actions without relying on memory.",
          requestedBy: "chris",
          agentType: "codex",
          requestedMode: "read-only",
          approvalRequirement: "none",
          contextArtifact: project.notesPath || DEFAULT_AGENT_CONTEXT_ARTIFACT,
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

        const read = await readArtifact(parsed.originArtifactPath);
        const record: ProjectAuditRecord = {
          path: parsed.originArtifactPath,
          content: read.content,
          mtime: read.mtime,
          title: parseOriginTitle(read.content),
          requestedTask: parseOriginSection(read.content, "Requested Task"),
        };

        setAuditByProject((current) => ({ ...current, [project.key]: record }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAuditErrByProject((current) => ({ ...current, [project.key]: message }));
      } finally {
        setStatusAuditBusyKey(null);
      }
    },
    [readArtifact],
  );

  const openNotesModal = useCallback(
    async (project: ProjectRow) => {
      setNotesBusyKey(project.key);
      try {
        const latestProject = await onEnsureNotes(project);
        const resolvedProject = latestProject ?? project;
        setNotesModal({
          open: true,
          projectLabel: resolvedProject.label,
          projectKey: resolvedProject.key,
          notesText: buildNotesText(resolvedProject),
        });
      } catch {
        setNotesModal({
          open: true,
          projectLabel: project.label,
          projectKey: project.key,
          notesText: buildNotesText(project),
        });
      } finally {
        setNotesBusyKey(null);
      }
    },
    [onEnsureNotes],
  );

  useEffect(() => {
    void refreshStatusAgentProfile();
  }, [refreshStatusAgentProfile]);

  useEffect(() => {
    if (!selectedProject?.key) return;
    void refreshLatestAudit(selectedProject.key);
  }, [refreshLatestAudit, selectedProject?.key]);

  const detail = useMemo<ProjectDetail | null>(() => {
    if (!selectedProject) return null;

    const project = selectedProject;
    const isForming = project.state === "forming";
    const status = safeStatusForRow(project);
    const port = project.port;
    const portState = typeof port === "number" ? ports[port] : undefined;
    const isListening = Boolean(portState?.listening);

    return {
      p: project,
      st: status,
      port,
      isListening,
      startDisabled: busy || isForming || !project.o2StartKey,
      startUnavailableTitle: project.o2StartKey
        ? "Start project runtime through O2 and open its URL when available."
        : "Start unavailable: no O2 start key is configured for this project.",
      openDisabled:
        busy || !(typeof project.url === "string" && project.url.startsWith("http")),
      openUnavailableTitle:
        typeof project.url === "string" && project.url.startsWith("http")
          ? `Open ${project.url}`
          : "Open unavailable: no project URL is recorded.",
      snapshotDisabled: busy || isForming || !project.o2SnapshotKey,
      commitDisabled: busy || isForming || !project.o2CommitKey,
      labDisabled: busy || isForming || !project.o2LabKey,
      mapDisabled: busy || isForming || !project.o2MapKey,
      proofPackDisabled: busy || isForming || !project.o2ProofPackKey,
      lifecycleToggleDisabled: busy || isForming,
      notesDisabled: busy || isForming || notesBusyKey === project.key,
      statusAuditDisabled: busy || isForming || statusAuditBusyKey === project.key,
      statusProfileDisabled: busy || isForming || statusProfileBusy,
      killDisabled:
        busy || portsBusy || isForming || typeof port !== "number" || !isListening,
    };
  }, [
    busy,
    notesBusyKey,
    ports,
    portsBusy,
    safeStatusForRow,
    selectedProject,
    statusAuditBusyKey,
    statusProfileBusy,
  ]);

  const auditBodyText = selectedAudit?.content
    ? selectedAudit.content
    : selectedAuditErr ||
      "No governed status audit is saved for this project yet. Run Status Audit to create the first project-targeted record.";

  const actions = (
    <>
      <button
        className="btn btnPrimary"
        onClick={onOpenAddProject}
        disabled={busy}
        title="Start a governed project formation flow under O2 authority"
      >
        New Project
      </button>
      <button
        className="btn btnGhost"
        onClick={() => void onReloadProjects()}
        disabled={busy}
        title="Reload projects registry"
      >
        Reload Projects
      </button>
      <button
        className="btn btnGhost"
        onClick={() => void onRefreshPorts()}
        disabled={portsBusy}
        title="Refresh port status"
      >
        Refresh Ports
      </button>
    </>
  );

  return (
    <SystemStateShell title="Projects" actions={actions}>
      <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <div className="surfaceCard surfaceSidebarCard">
            <div className="surfaceCardTitle">PROJECTS</div>

            <label className="surfaceToggleRow">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(event) => setShowRetired(event.target.checked)}
              />
              <span>Show all projects</span>
            </label>

            <div className="surfaceControlStack">
              <label className="surfaceControlField">
                <span className="surfaceControlLabel">Sort</span>
                <select
                  className="input"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="active">Active First</option>
                  <option value="name">Name</option>
                  <option value="start_date">Newest Start</option>
                  <option value="running_status">Runtime Status</option>
                </select>
              </label>
            </div>

            <div className="surfaceList">
              {sortedProjects.length === 0 ? (
                <div className="surfaceEmptyState">
                  No projects match the current filter.
                </div>
              ) : (
                sortedProjects.map((project) => {
                  const status = safeStatusForRow(project);
                  const isActive = project.key === selectedKey;
                  return (
                    <button
                      key={project.key}
                      type="button"
                      aria-pressed={isActive}
                      className={`surfaceNavButton ${isActive ? "surfaceNavButtonActive" : ""}`}
                      onClick={() => setSelectedKey(project.key)}
                    >
                      <div className="surfaceNavTitle">{project.label}</div>
                      <div className="surfaceNavMeta">{project.key}</div>
                      <div className="surfaceNavMetaSecondary">
                        {project.repoHint || "Repo hint not recorded"}
                      </div>
                      <div className="surfaceTagRow">
                        <span className={`pill ${status.pill}`}>{status.text}</span>
                        <span className="surfaceTag">
                          {project.retired ? "Retired" : "Active"}
                        </span>
                        <span className="surfaceTag">
                          {typeof project.port === "number" ? `:${project.port}` : "No port"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="surfaceCommandMain">
          {!detail ? (
            <div className="surfaceCard surfaceEmptyState surfaceEmptyStateLarge">
              Select a project to inspect its status and actions.
            </div>
          ) : (
            <>
              <div className="surfaceCard">
                <div className="surfaceHero">
                  <div>
                    <div className="surfaceLabel">Project Command</div>
                    <div className="surfaceTitleLg">{detail.p.label}</div>
                    <div className="surfaceNavMeta">
                      {detail.p.key}
                      {detail.p.repoHint ? ` • ${detail.p.repoHint}` : ""}
                    </div>
                  </div>

                  <div className="surfaceTagRow">
                    <span className={`pill ${detail.st.pill}`}>{detail.st.text}</span>
                    <span className="surfaceTag">
                      {detail.p.retired ? "Retired" : "Active"}
                    </span>
                    {detail.p.state ? (
                      <span className="surfaceTag">{detail.p.state}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="surfaceGrid2">
                <div className="surfaceCard">
                  <div className="surfaceCardTitle">Run Controls</div>
                  <div className="surfaceCardLead">
                    Start the runtime, open the live surface, capture evidence, or stop the selected project from one governed command surface.
                  </div>
                  <div className="surfaceActionGrid">
                    <button
                      className="btn btnPrimary"
                      onClick={() => void onStart(detail.p)}
                      disabled={detail.startDisabled}
                      title={detail.startUnavailableTitle}
                    >
                      Start Runtime
                    </button>
                    <button
                      className="btn"
                      onClick={() => void onOpenUrl(detail.p)}
                      disabled={detail.openDisabled}
                      title={detail.openUnavailableTitle}
                    >
                      Open Localhost
                    </button>
                    <button
                      className="btn"
                      onClick={() => void onSnapshot(detail.p)}
                      disabled={detail.snapshotDisabled}
                    >
                      Run Repo Snapshot
                    </button>
                    <button
                      className="btn"
                      onClick={() => void onCommit(detail.p)}
                      disabled={detail.commitDisabled}
                    >
                      Run Commit
                    </button>
                    <button
                      className="btn"
                      onClick={() => void openNotesModal(detail.p)}
                      disabled={detail.notesDisabled}
                    >
                      Open Notes
                    </button>
                    <button
                      className="btn btnGhost"
                      onClick={() => void onMap(detail.p)}
                      disabled={detail.mapDisabled}
                    >
                      Open Map
                    </button>
                    <button
                      className="btn btnGhost"
                      onClick={() => void onProofPack(detail.p)}
                      disabled={detail.proofPackDisabled}
                    >
                      Build Proof Pack
                    </button>
                    <button
                      className="btn btnGhost"
                      onClick={() => void onLab(detail.p)}
                      disabled={detail.labDisabled}
                    >
                      Open Labs
                    </button>
                    <button
                      className="btn btnDanger"
                      onClick={() => {
                        if (typeof detail.port === "number") void onKill(detail.port);
                      }}
                      disabled={detail.killDisabled}
                      title={
                        typeof detail.port !== "number"
                          ? "No port"
                          : detail.isListening
                            ? "Kill listener via O2 kill_port.<port>"
                            : "Not running"
                      }
                    >
                      Stop Runtime
                    </button>
                  </div>
                </div>

                <div className="surfaceCard">
                  <div className="surfaceCardTitle">Project Brief</div>
                  <div className="surfaceCardLead">
                    Core registry facts, operator links, and lifecycle controls for the selected project.
                  </div>
                  <div className="surfaceSummaryList">
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Start Date</div>
                      <div className="surfaceValue">{fmtStartDate(detail.p.startDate)}</div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Live Port</div>
                      <div className="surfaceValue">
                        {typeof detail.port === "number" ? `:${detail.port}` : "—"}
                      </div>
                    </div>
                    {typeof detail.p.preferredPort === "number" &&
                    detail.p.preferredPort !== detail.port ? (
                      <div className="surfaceSummaryRow">
                        <div className="surfaceLabel">Preferred Port</div>
                        <div className="surfaceValue">:{detail.p.preferredPort}</div>
                      </div>
                    ) : null}
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Live URL</div>
                      <div className="surfaceValue">{detail.p.url || "Not recorded"}</div>
                    </div>
                    {detail.p.preferredUrl && detail.p.preferredUrl !== detail.p.url ? (
                      <div className="surfaceSummaryRow">
                        <div className="surfaceLabel">Preferred URL</div>
                        <div className="surfaceValue">{detail.p.preferredUrl}</div>
                      </div>
                    ) : null}
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Recommended Agent</div>
                      <div className="surfaceValue">{recommendAgentForProject(detail.p)}</div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Governed Notes</div>
                      <div className="surfaceValue">
                        {detail.p.notesPath || "No notes path configured yet"}
                      </div>
                    </div>
                    <label className="surfaceSummaryRow surfaceToggleRow">
                      <span className="surfaceLabel">Retired</span>
                      <span className="surfaceToggleControl">
                        <input
                          type="checkbox"
                          checked={Boolean(detail.p.retired)}
                          onChange={(event) =>
                            void onSetRetired(detail.p, event.target.checked)
                          }
                          disabled={detail.lifecycleToggleDisabled}
                        />
                        <span className="surfaceValue">
                          {detail.p.retired
                            ? "If checked, this project is retired in RadControl and stays out of the active operating list unless Show all projects is enabled."
                            : "If checked, this project is retired in RadControl and removed from the active operating list unless Show all projects is enabled."}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

              <div className="surfaceSignalGrid">
                {readinessSignals(detail.p, detail.st.text).map((signal) => (
                  <div className="surfaceCard surfaceSignalCard" key={signal.label}>
                    <div className="surfaceLabel">{signal.label}</div>
                    <div
                      className={`surfaceSignalValue ${
                        signal.tone === "good"
                          ? "surfaceSignalValueGood"
                          : signal.tone === "warn"
                            ? "surfaceSignalValueWarn"
                            : ""
                      }`}
                    >
                      {signal.value}
                    </div>
                  </div>
                ))}
              </div>

                <div className="surfaceCard">
                  <div className="surfaceCardTitle">Project Status Audit</div>
                  <div className="surfaceCardLead">
                    Run an on-demand governed research pass when you need current facts instead of memory.
                  </div>
                  <div className="surfaceBodyCopy">
                    Each audit behaves like a repo snapshot: it creates a reviewable artifact, records timing explicitly, and avoids silent background drift.
                  </div>
                  <div className="surfaceActionGrid surfaceActionGridCompact">
                    <button
                      className="btn btnPrimary"
                      onClick={() => void runStatusAudit(detail.p)}
                      disabled={detail.statusAuditDisabled}
                    >
                      {statusAuditBusyKey === detail.p.key ? "Creating…" : "Run Status Audit"}
                    </button>
                    <button
                      className="btn btnGhost"
                      onClick={() => void createStatusAgentProfile(detail.p)}
                      disabled={detail.statusProfileDisabled || Boolean(statusProfilePath)}
                      title={
                        statusProfilePath
                          ? "Project Status Agent profile already exists."
                          : "Seed a reusable governed profile for project status audits."
                      }
                    >
                      {statusProfileBusy
                        ? "Saving…"
                        : statusProfilePath
                          ? "Status Agent Ready"
                          : "Create Status Agent"}
                    </button>
                  </div>
                  <div className="surfaceSummaryList">
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Audit Model</div>
                      <div className="surfaceValue">Governed run artifact, reviewed on demand</div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Status Agent Profile</div>
                      <div className="surfaceValue">{statusProfilePath || "Not seeded yet"}</div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Latest Audit</div>
                      <div className="surfaceValue">
                        {auditLoading
                          ? "Loading…"
                          : selectedAudit
                            ? selectedAudit.title
                            : "No governed project audit yet"}
                      </div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Artifact</div>
                      <div className="surfaceValue">{selectedAudit?.path || "—"}</div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Updated</div>
                      <div className="surfaceValue">{fmtArtifactTime(selectedAudit?.mtime)}</div>
                    </div>
                  </div>
                  <textarea
                    className="notesSingleArea surfaceAuditBody"
                    readOnly
                    value={auditBodyText}
                  />
                </div>

                <div className="surfaceCard">
                  <div className="surfaceCardTitle">Readiness Focus</div>
                  <div className="surfaceCardLead">
                    Priority items that deserve governed follow-through before the next major milestone.
                  </div>
                  <div className="surfaceIndexedList">
                    {projectFocus(detail.p).map((item, index) => (
                      <div key={item} className="surfaceIndexedItem">
                        <span className="surfaceIndexedMark">{index + 1}.</span>
                        <span className="surfaceValue">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {notesModal.open ? (
        <div className="modalOverlay" onClick={() => setNotesModal((current) => ({ ...current, open: false }))}>
          <div className="notesModalCard" onClick={(event) => event.stopPropagation()}>
            <div className="notesModalHeader">
              <div className="notesModalTitle">Project Notes</div>
              <button
                className="btn btnGhost"
                onClick={() => setNotesModal((current) => ({ ...current, open: false }))}
              >
                Close
              </button>
            </div>

            <div className="notesModalBody">
              <div className="notesSingleMeta">
                {notesModal.projectLabel} ({notesModal.projectKey})
              </div>
              <textarea className="notesSingleArea" readOnly value={notesModal.notesText} />
            </div>
          </div>
        </div>
      ) : null}
    </SystemStateShell>
  );
}
