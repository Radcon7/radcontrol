import type { PortStatus, ProjectRow } from "./types";

export type StatusLike = {
  pill: string;
  text: string;
};

export type SortMode = "name" | "start_date" | "active" | "running_status";

export type ProjectDetail = {
  project: ProjectRow;
  status: StatusLike;
  port?: number;
  isListening: boolean;
  launchDisabled: boolean;
  launchLabel: "Launch Localhost" | "Launch Radcon Portal";
  launchTitle: string;
  snapshotDisabled: boolean;
  mapDisabled: boolean;
  proofPackDisabled: boolean;
  lifecycleToggleDisabled: boolean;
  stopDisabled: boolean;
};

function projectStatusRank(statusText: string): number {
  const status = statusText.toUpperCase();
  if (status === "READY" || status === "RUNNING") return 0;
  if (status === "DEGRADED") return 1;
  if (status === "STOPPED") return 2;
  return 3;
}

function lifecycleRank(project: ProjectRow): number {
  return project.retired ? 1 : 0;
}

export function normalizeProjectStatus(status: unknown): StatusLike {
  const candidate = status as Partial<StatusLike> | null | undefined;
  return {
    pill: typeof candidate?.pill === "string" ? candidate.pill : "pillMuted",
    text: typeof candidate?.text === "string" ? candidate.text : "—",
  };
}

export function isOperatorVisibleProject(project: ProjectRow): boolean {
  return (
    project.archetype !== "governance" &&
    project.archetype !== "local-control-plane"
  );
}

export function filterOperatorProjects(projects: ProjectRow[]): ProjectRow[] {
  return projects.filter(isOperatorVisibleProject);
}

export function sortProjectRows(
  projects: ProjectRow[],
  showRetired: boolean,
  sortMode: SortMode,
  statusForRow: (project: ProjectRow) => StatusLike,
): ProjectRow[] {
  const visibleProjects = projects.filter((project) => showRetired || !project.retired);

  return [...visibleProjects].sort((left, right) => {
    if (sortMode === "name") return left.label.localeCompare(right.label);

    if (sortMode === "start_date") {
      const leftTime = left.startDate
        ? Date.parse(left.startDate)
        : Number.NEGATIVE_INFINITY;
      const rightTime = right.startDate
        ? Date.parse(right.startDate)
        : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime;
    }

    if (sortMode === "running_status") {
      const rank =
        projectStatusRank(statusForRow(left).text) -
        projectStatusRank(statusForRow(right).text);
      return rank !== 0 ? rank : left.label.localeCompare(right.label);
    }

    const lifecycle = lifecycleRank(left) - lifecycleRank(right);
    return lifecycle !== 0 ? lifecycle : left.label.localeCompare(right.label);
  });
}

export function buildProjectDetail(
  project: ProjectRow,
  ports: Record<number, PortStatus | undefined>,
  status: StatusLike,
  busy: boolean,
  portsBusy: boolean,
): ProjectDetail {
  const isForming = project.state === "forming";
  const port = project.runtimePort ?? project.port;
  const portState = typeof port === "number" ? ports[port] : undefined;
  const isListening = Boolean(portState?.listening);
  const hasLaunchTarget = [project.operatorUrl, project.launchUrl, project.runtimeUrl, project.url].some(
    (value) => typeof value === "string" && value.startsWith("http"),
  );

  return {
    project,
    status,
    port,
    isListening,
    launchDisabled:
      busy || isForming || !project.o2StartKey || !hasLaunchTarget,
    launchLabel: project.operatorUrl ? "Launch Radcon Portal" : "Launch Localhost",
    launchTitle: project.operatorUrl
      ? "Restart this project's local service through O2, ensure Radcon Enterprises is available, and open only its role-scoped portal tab."
      : project.o2StartKey
        ? "Restart this project's governed localhost runtime through O2 and open a fresh local URL."
        : "Launch unavailable: no runtime command is recorded.",
    snapshotDisabled: busy || isForming || !project.o2SnapshotKey,
    mapDisabled: busy || isForming || !project.o2MapKey,
    proofPackDisabled: busy || isForming || !project.o2ProofPackKey,
    lifecycleToggleDisabled: busy || isForming || Boolean(project.logicalSurface),
    stopDisabled:
      busy || portsBusy || isForming || typeof port !== "number" || !isListening,
  };
}

export function normalizeDateInput(value?: string): string {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function recommendAgentForProject(project: ProjectRow): string {
  if (project.state === "forming" || project.retired || project.kind === "docs") {
    return "Research Agent";
  }
  return "Builder Agent";
}
