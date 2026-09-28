import type { EmpireTodoItem } from "../notes/empireTodoModel.ts";
export const TASK_VIEWS = ["All", "Now", "Planned", "Backlog", "Blocked", "Deferred", "Completed"] as const;
export type TaskView = typeof TASK_VIEWS[number];
export function inTaskView(task: EmpireTodoItem, view: TaskView): boolean {
  if (view === "All") return true;
  if (view === "Now") return ["In Progress", "Blocked"].includes(task.status);
  if (view === "Completed") return task.status === "Complete";
  if (view === "Deferred") return !["Backlog", "Planned", "In Progress", "Blocked", "Complete"].includes(task.status);
  return task.status === view;
}
