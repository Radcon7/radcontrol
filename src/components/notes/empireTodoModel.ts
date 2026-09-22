export const EMPIRE_TODO_STATUSES = [
  "Backlog",
  "Planned",
  "In Progress",
  "Blocked",
  "Deferred",
  "Complete",
] as const;

export const EMPIRE_TODO_PRIORITIES = [
  "Critical",
  "High",
  "Important",
  "Normal",
  "Low",
] as const;

export type EmpireTodoStatus = (typeof EMPIRE_TODO_STATUSES)[number];
export type EmpireTodoPriority = (typeof EMPIRE_TODO_PRIORITIES)[number];

export const EMPIRE_TODO_GROUPS = [
  { key: "Now", label: "NOW", description: "Active or blocking work" },
  { key: "Business Foundation", label: "BUSINESS FOUNDATION", description: "Entity, banking, accounting, and provider prerequisites" },
  { key: "Control Plane", label: "CONTROL PLANE", description: "RCE and operator-control capabilities" },
  { key: "DQOTD Launch / Premium", label: "DQOTD LAUNCH / PREMIUM", description: "Launch and early premium dependencies" },
  { key: "Commercial Proof", label: "COMMERCIAL PROOF", description: "Later transaction proof" },
  { key: "Later", label: "LATER", description: "Valid work outside the current operating sequence" },
] as const;

export type EmpireTodoItem = {
  id: string;
  title: string;
  status: EmpireTodoStatus;
  priority: EmpireTodoPriority;
  category: string;
  summary: string;
  detailedContext: string;
  whyItMatters: string;
  currentState: string;
  nextActions: string;
  dependencies: string;
  acceptanceCriteria: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  progress?: { percent: number; method: "operator"; reviewedAt: string };
};

export type EmpireTodoListResponse = {
  authority?: "legacy-readonly" | "private";
  revision: number;
  ok: boolean;
  items: EmpireTodoItem[];
  seededCount: number;
  persistence: string;
  path: string;
  error?: string;
};

export type EmpireTodoSaveResponse = {
  revision: number;
  ok: boolean;
  item: EmpireTodoItem;
  itemCount: number;
  seededCount: number;
  error?: string;
};

export function selectEmpireTodoItem(
  items: EmpireTodoItem[],
  selectedId: string | null,
): EmpireTodoItem | null {
  if (!items.length) return null;
  return items.find((item) => item.id === selectedId) || items[0];
}

export function mergeSavedEmpireTodo(
  items: EmpireTodoItem[],
  saved: EmpireTodoItem,
): EmpireTodoItem[] {
  const index = items.findIndex((item) => item.id === saved.id);
  if (index === -1) return [...items, saved];
  return items.map((item) => (item.id === saved.id ? saved : item));
}

export function isEmpireTodoComplete(item: EmpireTodoItem): boolean {
  return item.status === "Complete";
}

export type EmpireTodoLane = "queued" | "progress" | "other" | "completed";

/** Presentation only. Deferred/unknown states do not establish whether work started. */
export function empireTodoLane(status: unknown): EmpireTodoLane {
  if (status === "Backlog" || status === "Planned") return "queued";
  if (status === "In Progress" || status === "Blocked") return "progress";
  if (status === "Complete") return "completed";
  return "other";
}

/** Lifecycle is independent of explicit assessment; completion is authoritative. */
export function empireTodoProgress(item: EmpireTodoItem): { label: string; percent: number | null; tone: string } {
  if (isEmpireTodoComplete(item)) return { label: "Done", percent: 100, tone: "done" };
  const percent = item.progress?.percent ?? null;
  if (item.status === "Blocked") return { label: "Blocked", percent, tone: "blocked" };
  if (item.status === "In Progress") return { label: "In Progress", percent, tone: "active" };
  if (item.status === "Deferred") return { label: "Deferred", percent, tone: "deferred" };
  if (empireTodoLane(item.status) === "queued") return { label: "Not Started", percent, tone: "planned" };
  return { label: "Unclassified", percent, tone: "unknown" };
}

function priorityRank(priority: EmpireTodoPriority): number {
  return EMPIRE_TODO_PRIORITIES.indexOf(priority);
}

function statusRank(status: EmpireTodoStatus): number {
  return EMPIRE_TODO_STATUSES.indexOf(status);
}

export function groupEmpireTodos(items: EmpireTodoItem[]): Array<{
  key: string;
  label: string;
  description: string;
  items: EmpireTodoItem[];
}> {
  const knownCategories = new Set<string>(EMPIRE_TODO_GROUPS.map((group) => group.key));
  return EMPIRE_TODO_GROUPS.map((group) => ({
    ...group,
    items: items
      .filter((item) => group.key === "Later"
        ? item.category === "Later" || !knownCategories.has(item.category)
        : item.category === group.key)
      .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority)
        || statusRank(left.status) - statusRank(right.status)
        || left.title.localeCompare(right.title)),
  })).filter((group) => group.items.length > 0);
}

export function createBlankEmpireTodo(now = new Date()): EmpireTodoItem {
  const iso = now.toISOString();
  return {
    id: `todo-${now.getTime()}`,
    title: "",
    status: "Backlog",
    priority: "Normal",
    category: "Empire",
    summary: "",
    detailedContext: "",
    whyItMatters: "",
    currentState: "",
    nextActions: "",
    dependencies: "",
    acceptanceCriteria: "",
    notes: "",
    createdAt: iso,
    updatedAt: iso,
  };
}
