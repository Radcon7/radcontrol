import type { EmpireTodoItem } from "../notes/empireTodoModel";
import type { TimelineMilestone } from "../paste-tabs/timelineModel";
export type WorkEvent = TimelineMilestone & { id: string };
export type Initiative = {
  id: string; title: string; area: string; kind: "finite" | "ongoing";
  status: "proposal" | "active" | "paused" | "complete" | "maintenance" | "attention" | "healthy";
  phase: string; nextMove: string; blocker: string;
  progress: { method: "unassessed" | "operator-assessed"; percent: number | null; basis: string; assessedAt: string };
  reviewedAt: string; lastMovementAt: string; targetDate: string; taskIds: string[]; eventIds: string[];
  pinned: boolean; createdAt: string; updatedAt: string;
};
export type WorkData = { tasks: EmpireTodoItem[]; events: WorkEvent[]; initiatives: Initiative[]; projectNotes: { id: string; content: string; updatedAt?: string }[] };
export const WORK_BRIDGE_NOTICE = "Work is temporarily read-only while private storage is prepared.";
export type WorkResponse = { authority: "legacy-readonly" | "private"; ok: boolean; revision: number; data: WorkData; recordId?: string; error?: string };
export const unassessed = () => ({ method: "unassessed" as const, percent: null, basis: "", assessedAt: "" });
export function momentum(row: Initiative): { percent: number | null; label: string } {
  if (row.kind === "ongoing") return { percent: null, label: row.status === "active" || row.status === "proposal" ? "Ongoing" : row.status[0].toUpperCase() + row.status.slice(1) };
  const p = row.progress;
  return p.method === "operator-assessed" && p.percent !== null && p.basis.trim() && p.assessedAt
    ? { percent: p.percent, label: "Operator-assessed" } : { percent: null, label: "Unassessed" };
}
export function needsYou(rows: Initiative[], now = Date.now()): { id: string; reason: string }[] {
  return rows.filter(r => !["proposal", "paused", "complete"].includes(r.status)).flatMap(row => {
    const reason = row.blocker.trim() ? row.blocker : !row.nextMove.trim() ? "Set a Next Move" :
      !row.reviewedAt || (Number.isFinite(Date.parse(row.reviewedAt)) && now - Date.parse(row.reviewedAt) > 30 * 86400000) ? "Review current assessment" : row.status === "attention" ? "Review ongoing responsibility" : "";
    return reason ? [{ id: row.id, reason }] : [];
  }).slice(0, 5);
}
export function nextMoves(rows: Initiative[]): Initiative[] {
  return rows.filter(r => r.pinned && r.nextMove.trim() && !["proposal", "paused", "complete"].includes(r.status)).slice(0, 5);
}
export function recentMovement(events: WorkEvent[]): WorkEvent[] {
  return [...events].filter(r => r.date || r.createdAt).sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt) || b.id.localeCompare(a.id)).slice(0, 5);
}
