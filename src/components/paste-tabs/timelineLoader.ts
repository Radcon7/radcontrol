import { listWork, mutateWork } from "../overview/workApi";
import { compareMilestones, validEventDate, type TimelineMilestone, type NewMilestoneInput } from "./timelineModel";
export type { TimelineMilestone, NewMilestoneInput } from "./timelineModel";
// Captured by the single mounted Timeline editor. Independent views never refresh
// this revision behind an in-flight form; conflicts remain visible to the operator.
let revision = 0;
export async function listTimelineMilestones(): Promise<TimelineMilestone[]> {
  const snapshot = await listWork(); revision = snapshot.revision;
  return [...snapshot.data.events].sort(compareMilestones);
}
export async function createTimelineMilestone(input: NewMilestoneInput): Promise<TimelineMilestone> {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!validEventDate(input.date)) throw new Error("Enter a valid event date.");
  const result = await mutateWork(revision, "event.create", input);
  revision = result.revision;
  const created = result.data.events.find(event => event.id === result.recordId);
  if (!created) throw new Error("Saved milestone was not returned");
  return created;
}
