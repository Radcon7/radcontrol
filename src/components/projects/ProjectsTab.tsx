import { useCallback, useEffect, useMemo, useState } from "react";
import { SystemStateShell } from "../common/SystemStateShell";
import { useGovernedRecordNote } from "../common/useGovernedRecordNote";
import { ProjectBrief } from "./ProjectBrief";
import { ProjectLaunchDateModal } from "./ProjectLaunchDateModal";
import {
  buildProjectDetail,
  filterOperatorProjects,
  normalizeDateInput,
  normalizeProjectStatus,
  sortProjectRows,
  type SortMode,
  type StatusLike,
} from "./projectModel";
import { ProjectRoster } from "./ProjectRoster";
import { ProjectRunControls } from "./ProjectRunControls";
import type { ProjectRow, PortStatus } from "./types";

type Props = {
  projects: ProjectRow[];
  ports: Record<number, PortStatus | undefined>;
  busy: boolean;
  portsBusy: boolean;
  onOpenAddProject: () => void;
  preferredProjectKey?: string | null;
  onPreferredProjectKeyHandled?: () => void;
  onStart: (project: ProjectRow) => Promise<void> | void;
  onSnapshot: (project: ProjectRow) => Promise<void> | void;
  onStop: (project: ProjectRow) => Promise<void> | void;
  onMap: (project: ProjectRow) => Promise<void> | void;
  onShowOriginalRequest: (project: ProjectRow) => Promise<void> | void;
  onProofPack: (project: ProjectRow) => Promise<void> | void;
  onSetRetired: (project: ProjectRow, retired: boolean) => Promise<void> | void;
  onSetLaunchDate: (project: ProjectRow, startDate: string) => Promise<void> | void;
  onEnsureNotes: (project: ProjectRow) => Promise<ProjectRow> | ProjectRow;
  registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void;
  statusForRow: (project: ProjectRow) => StatusLike | unknown;
};

type LaunchDateModalState = {
  open: boolean;
  value: string;
};

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
  onStop,
  onMap,
  onShowOriginalRequest,
  onProofPack,
  onSetRetired,
  onSetLaunchDate,
  onEnsureNotes,
  registerBeforeTabChangeSaver,
  statusForRow,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("active");
  const [showRetired, setShowRetired] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [launchDateModal, setLaunchDateModal] = useState<LaunchDateModalState>({
    open: false,
    value: "",
  });

  const safeStatusForRow = useCallback(
    (project: ProjectRow): StatusLike =>
      normalizeProjectStatus(statusForRow(project)),
    [statusForRow],
  );
  const projectRows = useMemo(() => filterOperatorProjects(projects), [projects]);
  const sortedProjects = useMemo(
    () => sortProjectRows(projectRows, showRetired, sortMode, safeStatusForRow),
    [projectRows, safeStatusForRow, showRetired, sortMode],
  );

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
  }, [onPreferredProjectKeyHandled, preferredProjectKey, sortedProjects]);

  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.key === selectedKey) || null,
    [selectedKey, sortedProjects],
  );
  const governedNote = useGovernedRecordNote({
    recordKey: selectedProject?.key || null,
    path: selectedProject?.notesPath || null,
    resolvePath: selectedProject
      ? async () => {
          const latestProject = await onEnsureNotes(selectedProject);
          return (latestProject || selectedProject).notesPath?.trim() || null;
        }
      : undefined,
    reportLoadError: true,
    missingStatus: "Governed note",
    registerBeforeTabChangeSaver,
  });

  async function selectProject(projectKey: string): Promise<void> {
    if (await governedNote.flush()) setSelectedKey(projectKey);
  }

  async function setRetiredVisibility(showAll: boolean): Promise<void> {
    if (await governedNote.flush()) setShowRetired(showAll);
  }

  const detail = useMemo(
    () =>
      selectedProject
        ? buildProjectDetail(
            selectedProject,
            ports,
            safeStatusForRow(selectedProject),
            busy,
            portsBusy,
          )
        : null,
    [busy, ports, portsBusy, safeStatusForRow, selectedProject],
  );
  const selectedLaunchDate = normalizeDateInput(selectedProject?.startDate);
  const launchDateDisplay = selectedLaunchDate || "Not recorded";
  const actions = (
    <button
      className="btn btnPrimary"
      data-testid="new-project"
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
          <ProjectRoster
            projects={sortedProjects}
            selectedProjectKey={selectedKey}
            showRetired={showRetired}
            sortMode={sortMode}
            statusForRow={safeStatusForRow}
            onSelect={(projectKey) => void selectProject(projectKey)}
            onShowRetiredChange={(showAll) => void setRetiredVisibility(showAll)}
            onSortModeChange={setSortMode}
          />
        </div>

        <div className="surfaceCommandMain">
          {!detail ? (
            <div className="surfaceCard surfaceEmptyState surfaceEmptyStateLarge">
              Select a project to inspect its status and actions.
            </div>
          ) : (
            <div className="surfaceGridProjectTop">
              <ProjectBrief
                detail={detail}
                busy={busy}
                launchDateDisplay={launchDateDisplay}
                notePath={governedNote.path}
                noteText={governedNote.text}
                noteStatus={governedNote.status}
                noteLoading={governedNote.loading}
                onNoteChange={governedNote.onTextChange}
                onEditLaunchDate={() =>
                  setLaunchDateModal({ open: true, value: selectedLaunchDate })
                }
                onSetRetired={(retired) => {
                  void (async () => {
                    if (await governedNote.flush()) {
                      await onSetRetired(detail.project, retired);
                    }
                  })();
                }}
              />
              <ProjectRunControls
                detail={detail}
                busy={busy}
                onLaunch={() => void onStart(detail.project)}
                onSnapshot={() => void onSnapshot(detail.project)}
                onMap={() => void onMap(detail.project)}
                onShowOriginalRequest={() =>
                  void onShowOriginalRequest(detail.project)
                }
                onProofPack={() => void onProofPack(detail.project)}
                onStop={() => void onStop(detail.project)}
              />
            </div>
          )}
        </div>
      </div>

      <ProjectLaunchDateModal
        open={launchDateModal.open}
        value={launchDateModal.value}
        currentValue={selectedLaunchDate}
        busy={busy}
        onClose={() =>
          setLaunchDateModal((current) => ({ ...current, open: false }))
        }
        onValueChange={(value) =>
          setLaunchDateModal((current) => ({ ...current, value }))
        }
        onSave={() => {
          if (!detail) return;
          void (async () => {
            await onSetLaunchDate(detail.project, launchDateModal.value);
            setLaunchDateModal((current) => ({ ...current, open: false }));
          })();
        }}
      />
    </SystemStateShell>
  );
}
