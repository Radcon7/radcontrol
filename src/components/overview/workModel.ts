import type { EmpireTodoItem } from "../notes/empireTodoModel";
import type { TimelineMilestone } from "../paste-tabs/timelineModel";
export type WorkEvent = TimelineMilestone & { id: string };
export type Initiative = {
  id: string; title: string; area: string; kind: "finite" | "ongoing";
  status: "proposal" | "active" | "paused" | "complete" | "maintenance" | "attention" | "healthy";
  phase: string; nextMove: string; blocker: string;
  progress: { method: "unassessed" | "operator-assessed"; percent: number | null; basis: string; assessedAt: string };
  reviewedAt: string; lastMovementAt: string; targetDate: string; taskIds: string[]; eventIds: string[];
  projectKeys?: string[];
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
export type WorkTarget = { kind: "task" | "initiative" | "event"; id: string; view?: string; nonce?: number };
export type OverviewReference = WorkTarget & { title: string; reason: string; source: string; revision: number };
export type OverviewResponse = {
  ok: boolean; authority: WorkResponse["authority"]; revision: number; capability: "operator.work.overview-v1";
  taskCounts: Record<string, number>; initiativeCounts: Record<string, number>;
  attention: OverviewReference[]; next: OverviewReference[]; movement: WorkEvent[]; initiatives: Initiative[];
  taskInitiatives: Record<string, string[]>;
  coverage: { complete: boolean; sources: { source: string; loaded: boolean; authority: string }[] };
};

/** Reject incomplete summary shapes before rendering any reassuring empty state. */
export function checkedOverview(value: OverviewResponse): OverviewResponse {
  const counts = value?.taskCounts;
  const statuses = ["Backlog", "Planned", "In Progress", "Blocked", "Deferred", "Complete", "Unclassified"];
  const number = (v: unknown) => Number.isInteger(v) && Number(v) >= 0;
  const privateAuthority = value?.authority === "private";
  const sources = value?.coverage?.sources;
  if (!value?.ok || value.capability !== "operator.work.overview-v1" || !number(value.revision)
    || !["private", "legacy-readonly"].includes(value.authority) || privateAuthority !== (value.revision > 0)
    || !counts || ![...statuses,"total","assessed","unassessed"].every(key=>number(counts[key]))
    || statuses.reduce((sum,key)=>sum+counts[key],0) !== counts.total || counts.assessed+counts.unassessed !== counts.total
    || !value.initiativeCounts || !Object.values(value.initiativeCounts).every(number)
    || ![value.attention,value.next,value.movement,value.initiatives].every(Array.isArray)
    || !Array.isArray(sources) || sources.length !== 4
    || !["tasks","initiatives","events","projectNotes"].every(key=>sources.filter(s=>s.source===key && typeof s.loaded==="boolean" && s.authority===value.authority).length===1)
    || value.coverage.complete !== (privateAuthority && sources.every(s=>s.loaded))
    || Object.values(value.initiativeCounts).reduce((sum,count)=>sum+count,0)!==value.initiatives.length
    || [...value.attention,...value.next].some(r=>!["task","initiative"].includes(r.kind)||!r.id||!r.title||typeof r.reason!=="string"||r.source!=="operator.work"||r.revision!==value.revision)) {
    throw new Error("Overview coverage unavailable");
  }
  return value;
}
