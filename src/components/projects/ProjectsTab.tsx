import { useEffect, useMemo, useState } from "react";
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
  onStart: (p: ProjectRow) => Promise<void> | void;
  onSnapshot: (p: ProjectRow) => Promise<void> | void;
  onCommit: (p: ProjectRow) => Promise<void> | void;
  onLab: (p: ProjectRow) => Promise<void> | void;
  onKill: (port: number) => Promise<void> | void;
  onMap: (p: ProjectRow) => Promise<void> | void;
  onProofPack: (p: ProjectRow) => Promise<void> | void;
  onSetRetired: (p: ProjectRow, retired: boolean) => Promise<void> | void;
  onEnsureNotes: (p: ProjectRow) => Promise<ProjectRow> | ProjectRow;
  statusForRow: (p: ProjectRow) => StatusLike | unknown;
  killDisabledReason?: string;
};

type SortMode = "name" | "start_date" | "active" | "running_status";
type SortDirection = "asc" | "desc";

type NotesModalState = {
  open: boolean;
  projectLabel: string;
  projectKey: string;
  notesText: string;
};

export function ProjectsTab({
  projects,
  ports,
  busy,
  portsBusy,
  onStart,
  onSnapshot,
  onCommit,
  onLab,
  onKill,
  onMap,
  onProofPack,
  onSetRetired,
  onEnsureNotes,
  statusForRow,
  killDisabledReason,
}: Props) {
  const [sort, setSort] = useState<{ mode: SortMode; direction: SortDirection }>({
    mode: "name",
    direction: "asc",
  });
  const [notesBusyKey, setNotesBusyKey] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState<NotesModalState>({
    open: false,
    projectLabel: "",
    projectKey: "",
    notesText: "",
  });

  const safeStatusForRow = (p: ProjectRow): StatusLike => {
    const st = statusForRow(p) as Partial<StatusLike> | null | undefined;
    return {
      pill: typeof st?.pill === "string" ? st.pill : "pillMuted",
      text: typeof st?.text === "string" ? st.text : "—",
    };
  };

  const enhancedOnStart = (p: ProjectRow) => {
    try {
      void onStart(p);
    } catch {
      // no console spam; failures should surface via UI/toast elsewhere if needed
    }
  };

  const projectStatusRank = (p: ProjectRow): number => {
    const st = safeStatusForRow(p).text.toUpperCase();
    if (st === "RUNNING") return 0;
    if (st === "STOPPED") return 1;
    return 2;
  };

  const lifecycleRank = (p: ProjectRow): number => (p.retired ? 1 : 0);

  const projectRows = useMemo(() => {
    return projects.filter((row) => {
      const match = row.key.match(/^(.+)-lab-v1$/i);
      if (!match) return true;
      return !projects.some((candidate) => candidate.key === match[1]);
    });
  }, [projects]);

  const projectsByKey = useMemo(
    () => new Map(projectRows.map((row) => [row.key, row])),
    [projectRows],
  );

  const [displayOrder, setDisplayOrder] = useState<string[]>([]);

  useEffect(() => {
    const incomingKeys = projectRows.map((row) => row.key);
    setDisplayOrder((prev) => {
      if (prev.length === 0) return incomingKeys;

      const incomingSet = new Set(incomingKeys);
      const kept = prev.filter((key) => incomingSet.has(key));
      const keptSet = new Set(kept);
      const appended = incomingKeys.filter((key) => !keptSet.has(key));
      return [...kept, ...appended];
    });
  }, [projectRows]);

  const displayedProjects = useMemo(() => {
    const rows: ProjectRow[] = [];
    const seen = new Set<string>();

    for (const key of displayOrder) {
      const row = projectsByKey.get(key);
      if (!row) continue;
      rows.push(row);
      seen.add(key);
    }

    for (const row of projectRows) {
      if (seen.has(row.key)) continue;
      rows.push(row);
    }

    return rows;
  }, [displayOrder, projectRows, projectsByKey]);

  const sortRows = (
    rows: ProjectRow[],
    mode: SortMode,
    direction: SortDirection,
  ): ProjectRow[] => {
    return [...rows].sort((a, b) => {
      const asc = direction === "asc";
      if (mode === "name") {
        const base = a.label.localeCompare(b.label);
        return asc ? base : -base;
      }

      if (mode === "start_date") {
        const aTime = a.startDate ? Date.parse(a.startDate) : Number.NEGATIVE_INFINITY;
        const bTime = b.startDate ? Date.parse(b.startDate) : Number.NEGATIVE_INFINITY;
        const base = bTime - aTime;
        return asc ? -base : base;
      }

      if (mode === "active") {
        const lifecycleCmp = lifecycleRank(a) - lifecycleRank(b);
        if (lifecycleCmp !== 0) {
          return asc ? lifecycleCmp : -lifecycleCmp;
        }
        const base = a.label.localeCompare(b.label);
        return asc ? base : -base;
      }

      const runningCmp = projectStatusRank(a) - projectStatusRank(b);
      if (runningCmp !== 0) {
        return asc ? runningCmp : -runningCmp;
      }
      const base = a.label.localeCompare(b.label);
      return asc ? base : -base;
    });
  };

  const nextSortDirection = (mode: SortMode): SortDirection => {
    if (mode === "name") return "asc";
    if (mode === "start_date") return "desc";
    return "asc";
  };

  const onSortHeaderClick = (mode: SortMode) => {
    setSort((prev) => {
      const nextDirection =
        prev.mode === mode
          ? prev.direction === "asc"
            ? "desc"
            : "asc"
          : nextSortDirection(mode);
      const sorted = sortRows(displayedProjects, mode, nextDirection).map(
        (row) => row.key,
      );
      setDisplayOrder(sorted);

      if (prev.mode === mode) {
        return {
          mode,
          direction: nextDirection,
        };
      }
      return { mode, direction: nextDirection };
    });
  };

  const fmtStartDate = (value?: string): string => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  };

  const notesTextFor = (p: ProjectRow): string => {
    if (!p.notesPath) {
      return "No notes path is available for this project yet.";
    }

    if (p.notesAvailable) {
      return `Project notes are on disk at:\n${p.notesPath}\n\nUse your normal editor flow to update this single note file.`;
    }

    return `Notes file is expected at:\n${p.notesPath}\n\nThis file is not available yet.`;
  };

  const openNotesModal = async (p: ProjectRow) => {
    setNotesBusyKey(p.key);
    try {
      const latest = await onEnsureNotes(p);
      const resolved = latest ?? p;
      setNotesModal({
        open: true,
        projectLabel: resolved.label,
        projectKey: resolved.key,
        notesText: notesTextFor(resolved),
      });
    } catch {
      setNotesModal({
        open: true,
        projectLabel: p.label,
        projectKey: p.key,
        notesText: notesTextFor(p),
      });
    } finally {
      setNotesBusyKey(null);
    }
  };

  return (
    <div className="projectsWrapInner">
      {killDisabledReason ? (
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
          {killDisabledReason}
        </div>
      ) : null}

      <div className="projectsTable">
        <div className="projectsTableHeader">
          <button
            className={`projectHeaderBtn ${sort.mode === "name" ? "projectHeaderBtnActive" : ""}`}
            onClick={() => onSortHeaderClick("name")}
            type="button"
          >
            Name
          </button>
          <button
            className={`projectHeaderBtn ${sort.mode === "start_date" ? "projectHeaderBtnActive" : ""}`}
            onClick={() => onSortHeaderClick("start_date")}
            type="button"
          >
            Start Date
          </button>
          <button
            className={`projectHeaderBtn ${sort.mode === "active" ? "projectHeaderBtnActive" : ""}`}
            onClick={() => onSortHeaderClick("active")}
            type="button"
          >
            Active?
          </button>
          <button
            className={`projectHeaderBtn ${sort.mode === "running_status" ? "projectHeaderBtnActive" : ""}`}
            onClick={() => onSortHeaderClick("running_status")}
            type="button"
          >
            Running Status
          </button>
          <div className="projectHeaderCell">Port</div>
          <div className="projectHeaderCell projectHeaderCellActions" aria-hidden="true" />
        </div>

        {displayedProjects.map((p) => {
          const isForming = p.state === "forming";
          const st = safeStatusForRow(p);

          const port = p.port;
          const s = typeof port === "number" ? ports[port] : undefined;
          const startDisabled = busy || isForming || !p.o2StartKey;
          const startUnavailableTitle = p.o2StartKey
            ? "Start project"
            : "Start unavailable: no O2 start key is configured for this project.";
          const snapshotDisabled = busy || isForming;
          const commitDisabled = busy || isForming;
          const labDisabled = busy || isForming || !p.o2LabKey;
          const mapDisabled = busy || isForming;
          const proofPackDisabled = busy || isForming || !p.o2ProofPackKey;
          const lifecycleToggleDisabled = busy || isForming;
          const notesDisabled = busy || isForming || notesBusyKey === p.key;

          const isListening = Boolean(s?.listening);
          const killDisabled =
            busy || portsBusy || isForming || typeof port !== "number" || !isListening;

          return (
            <div className="projectRow" key={p.key}>
              <div className="projectCell projectCellName">
                <div className="projectLabel">{p.label}</div>
                {p.repoHint ? (
                  <div className="projectHint">{p.repoHint}</div>
                ) : null}
              </div>

              <div className="projectCell projectCellStartDate">
                {fmtStartDate(p.startDate)}
              </div>

              <div className="projectCell projectCellLifecycle">
                <button
                  type="button"
                  className="projectLifecycleBtn"
                  onClick={() => onSetRetired(p, !p.retired)}
                  disabled={lifecycleToggleDisabled}
                  title={p.retired ? "Set Active" : "Set Retired"}
                >
                  {p.retired ? "Retired" : "Active"}
                </button>
              </div>

              <div className="projectCell projectCellRunning">
                <span className={`pill ${st.pill}`}>{st.text}</span>
              </div>

              <div className="projectCell projectCellPort">
                {typeof port === "number" ? (
                  <span className="portMono">:{port}</span>
                ) : (
                  <span className="portMono">—</span>
                )}
              </div>

              <div className="projectRight">
                <button
                  className="btn btnPrimary"
                  onClick={() => enhancedOnStart(p)}
                  disabled={startDisabled}
                  title={startUnavailableTitle}
                >
                  Start
                </button>

                <button
                  className="btn"
                  onClick={() => onSnapshot(p)}
                  disabled={snapshotDisabled}
                >
                  Snapshot
                </button>

                <button
                  className="btn"
                  onClick={() => onCommit(p)}
                  disabled={commitDisabled}
                >
                  Commit
                </button>

                <button
                  className="btn"
                  onClick={() => onLab(p)}
                  disabled={labDisabled}
                >
                  Labs
                </button>

                <button
                  className="btn btnDanger btnIcon"
                  onClick={() => {
                    if (typeof port === "number") void onKill(port);
                  }}
                  disabled={killDisabled}
                  title={
                    typeof port !== "number"
                      ? "No port"
                      : isListening
                        ? "Kill listener via O2 kill_port.<port>"
                        : "Not running"
                  }
                >
                  Kill
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => onMap(p)}
                  disabled={mapDisabled}
                >
                  Map
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => onProofPack(p)}
                  disabled={proofPackDisabled}
                >
                  Proof Pack
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => onSetRetired(p, !p.retired)}
                  disabled={lifecycleToggleDisabled}
                >
                  {p.retired ? "Set Active" : "Set Retired"}
                </button>

                <button
                  className="btn btnGhost"
                  onClick={() => void openNotesModal(p)}
                  disabled={notesDisabled}
                >
                  Notes
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {notesModal.open ? (
        <div
          className="modalOverlay"
          onClick={() =>
            setNotesModal((prev) => ({ ...prev, open: false }))
          }
        >
          <div className="notesModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="notesModalHeader">
              <div className="notesModalTitle">Project Notes</div>
              <button
                className="btn btnGhost"
                onClick={() =>
                  setNotesModal((prev) => ({ ...prev, open: false }))
                }
              >
                Close
              </button>
            </div>

            <div className="notesModalBody">
              <div className="notesSingleMeta">
                {notesModal.projectLabel} ({notesModal.projectKey})
              </div>
              <textarea
                className="notesSingleArea"
                readOnly
                value={notesModal.notesText}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
