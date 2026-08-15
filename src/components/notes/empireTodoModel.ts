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
};

export type EmpireTodoListResponse = {
  ok: boolean;
  items: EmpireTodoItem[];
  seededCount: number;
  persistence: string;
  path: string;
  error?: string;
};

export type EmpireTodoSaveResponse = {
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
