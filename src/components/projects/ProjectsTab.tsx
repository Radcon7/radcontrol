import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readO2File, writeO2File } from "../common/o2Files";
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
  preferredProjectKey?: string | null;
  onPreferredProjectKeyHandled?: () => void;
  onStart: (p: ProjectRow) => Promise<void> | void;
  onSnapshot: (p: ProjectRow) => Promise<void> | void;
  onCommit: (p: ProjectRow) => Promise<void> | void;
  onKill: (port: number) => Promise<void> | void;
  onMap: (p: ProjectRow) => Promise<void> | void;
  onProofPack: (p: ProjectRow) => Promise<void> | void;
  onSetRetired: (p: ProjectRow, retired: boolean) => Promise<void> | void;
  onSetLaunchDate: (p: ProjectRow, startDate: string) => Promise<void> | void;
  onEnsureNotes: (p: ProjectRow) => Promise<ProjectRow> | ProjectRow;
  statusForRow: (p: ProjectRow) => StatusLike | unknown;
};

type SortMode = "name" | "start_date" | "active" | "running_status";

type LaunchDateModalState = {
  open: boolean;
  value: string;
};

type ProjectDetail = {
  p: ProjectRow;
  st: StatusLike;
  port?: number;
  isListening: boolean;
  launchDisabled: boolean;
  launchTitle: string;
  snapshotDisabled: boolean;
  commitDisabled: boolean;
  mapDisabled: boolean;
  proofPackDisabled: boolean;
  lifecycleToggleDisabled: boolean;
  killDisabled: boolean;
};

function projectStatusRank(statusText: string): number {
  const status = statusText.toUpperCase();
  if (status === "RUNNING") return 0;
  if (status === "STOPPED") return 1;
  return 2;
}

function lifecycleRank(project: ProjectRow): number {
  return project.retired ? 1 : 0;
}

function normalizeDateInput(value?: string): string {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function recommendAgentForProject(project: ProjectRow): string {
  if (project.state === "forming") return "Research Agent";
  if (project.retired) return "Research Agent";
  if (project.kind === "tauri") return "Builder Agent";
  if (project.kind === "docs") return "Research Agent";
  return "Builder Agent";
}

export function ProjectsTab({
  projects,
  ports,
  busy,
  portsBusy,
  onOpenAddProject,
  preferredProjectKey,
  onPreferredProjectKeyHandled,
  onStart,
  onSnapshot,
  onCommit,
  onKill,
  onMap,
  onProofPack,
  onSetRetired,
  onSetLaunchDate,
  onEnsureNotes,
  statusForRow,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("active");
  const [showRetired, setShowRetired] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [launchDateModal, setLaunchDateModal] = useState<LaunchDateModalState>({
    open: false,
    value: "",
  });
  const [projectNotesPath, setProjectNotesPath] = useState<string | null>(null);
  const [projectNotesText, setProjectNotesText] = useState("");
  const [projectNotesLoading, setProjectNotesLoading] = useState(false);
  const [projectNotesSaving, setProjectNotesSaving] = useState(false);
  const [projectNotesError, setProjectNotesError] = useState("");
  const [projectNotesSavedAt, setProjectNotesSavedAt] = useState<number | null>(null);
  const projectNotesRevisionRef = useRef(0);

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

  useEffect(() => {
    let cancelled = false;

    async function loadProjectNotes() {
      if (!selectedProject) {
        setProjectNotesPath(null);
        setProjectNotesText("");
        setProjectNotesError("");
        setProjectNotesSavedAt(null);
        setProjectNotesLoading(false);
        return;
      }

      setProjectNotesLoading(true);
      setProjectNotesError("");

      try {
        const latestProject = await onEnsureNotes(selectedProject);
        if (cancelled) return;

        const resolvedProject = latestProject ?? selectedProject;
        const nextPath = resolvedProject.notesPath?.trim() || null;
        setProjectNotesPath(nextPath);

        if (!nextPath) {
          setProjectNotesText("");
          setProjectNotesSavedAt(null);
          return;
        }

        const parsed = await readO2File(nextPath);
        if (cancelled) return;

        projectNotesRevisionRef.current = 0;
        setProjectNotesText(parsed.content || "");
        setProjectNotesSavedAt(typeof parsed.mtime === "number" ? parsed.mtime : null);
      } catch (error) {
        if (cancelled) return;
        setProjectNotesPath(selectedProject.notesPath?.trim() || null);
        setProjectNotesText("");
        setProjectNotesSavedAt(null);
        setProjectNotesError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setProjectNotesLoading(false);
        }
      }
    }

    void loadProjectNotes();

    return () => {
      cancelled = true;
    };
  }, [selectedProject?.key]);

  useEffect(() => {
    if (!selectedProject?.key || !projectNotesPath || projectNotesLoading) return;
    if (projectNotesRevisionRef.current === 0) return;

    const revisionAtSchedule = projectNotesRevisionRef.current;
    const timeoutId = window.setTimeout(async () => {
      setProjectNotesSaving(true);
      setProjectNotesError("");

      try {
        const parsed = await writeO2File({
          path: projectNotesPath,
          content: projectNotesText,
        });

        if (projectNotesRevisionRef.current === revisionAtSchedule) {
          projectNotesRevisionRef.current = 0;
        }

        setProjectNotesSavedAt(typeof parsed.mtime === "number" ? parsed.mtime : Date.now());
      } catch (error) {
        setProjectNotesError(error instanceof Error ? error.message : String(error));
      } finally {
        setProjectNotesSaving(false);
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [projectNotesLoading, projectNotesPath, projectNotesText, selectedProject?.key]);

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
      launchDisabled: busy || isForming || isListening || !project.o2StartKey,
      launchTitle: isListening
        ? "Runtime is already running."
        : project.o2StartKey
          ? "Start project runtime through O2 and open its URL when available."
          : "Launch unavailable: no runtime command is recorded.",
      snapshotDisabled: busy || isForming || !project.o2SnapshotKey,
      commitDisabled: busy || isForming || !project.o2CommitKey,
      mapDisabled: busy || isForming || !project.o2MapKey,
      proofPackDisabled: busy || isForming || !project.o2ProofPackKey,
      lifecycleToggleDisabled: busy || isForming,
      killDisabled:
        busy || portsBusy || isForming || typeof port !== "number" || !isListening,
    };
  }, [
    busy,
    ports,
    portsBusy,
    safeStatusForRow,
    selectedProject,
  ]);

  const selectedLaunchDate = normalizeDateInput(selectedProject?.startDate);
  const launchDateDisplay = selectedLaunchDate || "Not recorded";
  const projectNotesDirty = projectNotesRevisionRef.current > 0;
  const projectNotesStatus = projectNotesLoading
    ? "Loading note..."
    : projectNotesSaving
      ? "Saving..."
      : projectNotesError
        ? projectNotesError
        : projectNotesDirty
          ? "Unsaved changes"
          : projectNotesSavedAt
            ? `Saved ${new Date(projectNotesSavedAt).toLocaleString()}`
            : "Governed note";

  const actions = (
    <button
      className="btn btnPrimary"
      onClick={onOpenAddProject}
      disabled={busy}
      title="Start a governed project formation flow under O2 authority"
    >
      New Project
    </button>
  );

  return (
    <SystemStateShell title="Projects" actions={actions}>
      <div className="surfaceLayout">
        <div className="surfaceSidebarStack">
          <div className="surfaceCard surfaceSidebarCard">
            <div className="surfaceCardTitleRow surfaceSidebarHeaderRow">
              <div className="surfaceCardTitle">PROJECTS</div>
              <label className="surfaceToggleInlineSmall">
                <input
                  type="checkbox"
                  checked={showRetired}
                  onChange={(event) => setShowRetired(event.target.checked)}
                />
                <span>Show all</span>
              </label>
            </div>

            <div className="surfaceControlStack">
              <div className="surfaceSelectWrap">
                <select
                  className="input"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="active">Active First</option>
                  <option value="start_date">Launch Date</option>
                  <option value="name">Name</option>
                  <option value="running_status">Runtime Status</option>
                </select>
              </div>
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
                      <div className="surfaceTagRow">
                        <span className={`pill ${status.pill}`}>{status.text}</span>
                        {project.retired ? <span className="surfaceTag">Retired</span> : null}
                        <span className="surfaceTag">
                          {typeof project.port === "number" ? `Port: ${project.port}` : "Port: —"}
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
              <div className="surfaceGridProjectTop">
                <div className="surfaceCard surfaceProjectBriefCard">
                  <div className="surfaceCardTitle">Project Brief</div>
                  <div className="surfaceSummaryList">
                    <div className="surfaceSummaryRow">
                      <div className="surfaceSummaryHeader">
                        <div className="surfaceLabel">Project Launch Date</div>
                        <button
                          className="btn btnPrimary btnCompact"
                          onClick={() =>
                            setLaunchDateModal({
                              open: true,
                              value: selectedLaunchDate,
                            })
                          }
                          disabled={busy}
                        >
                          Edit Date
                        </button>
                      </div>
                      <div className="surfaceValue">{launchDateDisplay}</div>
                    </div>
                    <div className="surfaceSummaryRow">
                      <div className="surfaceLabel">Runtime Status</div>
                      <div className="surfaceValue">{detail.st.text}</div>
                    </div>
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
                    <div className="surfaceSummaryRow surfaceSummaryRowTall">
                      <div className="surfaceSummaryHeader">
                        <div className="surfaceLabel">Project Notes</div>
                        <div className="surfaceMutedSmall">{projectNotesStatus}</div>
                      </div>
                      <textarea
                        className="notesSingleArea surfaceProjectNoteArea"
                        value={projectNotesText}
                        readOnly={!projectNotesPath || projectNotesLoading}
                        placeholder={projectNotesPath ? "Project note" : "No governed note file available yet."}
                        onChange={(event) => {
                          projectNotesRevisionRef.current += 1;
                          setProjectNotesText(event.target.value);
                        }}
                      />
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
                          If checked, this project is retired in RadControl and hidden from the active operating list unless Show all is enabled.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="surfaceCard">
                  <div className="surfaceCardTitle">Run Controls</div>
                  <div className="surfaceActionStack">
                    <button
                      className="btn btnPrimary"
                      onClick={() => void onStart(detail.p)}
                      disabled={detail.launchDisabled}
                      title={detail.launchTitle}
                    >
                      Launch
                    </button>
                    <button
                      className="btn btnPrimary"
                      onClick={() => void onSnapshot(detail.p)}
                      disabled={detail.snapshotDisabled}
                    >
                      Run Repo Snapshot
                    </button>
                    <button
                      className="btn btnPrimary"
                      onClick={() => void onCommit(detail.p)}
                      disabled={detail.commitDisabled}
                    >
                      Run Commit
                    </button>
                    <button
                      className="btn btnPrimary"
                      onClick={() => void onMap(detail.p)}
                      disabled={detail.mapDisabled}
                    >
                      Open Map
                    </button>
                    <button
                      className="btn btnPrimary"
                      onClick={() => void onProofPack(detail.p)}
                      disabled={detail.proofPackDisabled}
                    >
                      Build Proof Pack
                    </button>
                    <button
                      className="btn btnPrimary"
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
              </div>
            </>
          )}
        </div>
      </div>

      {launchDateModal.open ? (
        <div
          className="modalOverlay"
          onClick={() => setLaunchDateModal((current) => ({ ...current, open: false }))}
        >
          <div className="notesModalCard" onClick={(event) => event.stopPropagation()}>
            <div className="notesModalHeader">
              <div className="notesModalTitle">Edit Launch Date</div>
              <button
                className="btn btnGhost"
                onClick={() => setLaunchDateModal((current) => ({ ...current, open: false }))}
              >
                Close
              </button>
            </div>

            <div className="notesModalBody">
              <label className="surfaceFormField">
                <span className="surfaceFormLabel">Project launch date</span>
                <input
                  className="input"
                  type="date"
                  value={launchDateModal.value}
                  onChange={(event) =>
                    setLaunchDateModal((current) => ({
                      ...current,
                      value: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="surfaceSummaryHeader">
                <div className="surfaceMutedSmall">
                  Save updates the governed project record through O2.
                </div>
                <button
                  className="btn btnPrimary btnCompact"
                  disabled={!launchDateModal.value || launchDateModal.value === selectedLaunchDate || busy}
                  onClick={async () => {
                    if (!detail) return;
                    await onSetLaunchDate(detail.p, launchDateModal.value);
                    setLaunchDateModal({ open: false, value: launchDateModal.value });
                  }}
                >
                  Save Date
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SystemStateShell>
  );
}
