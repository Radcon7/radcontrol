import { createBlankEmpireTodo, type EmpireTodoItem, type EmpireTodoSaveResponse } from "./empireTodoModel.ts";

export const TODO_TEXT_FIELDS = ["title", "summary", "detailedContext", "whyItMatters", "currentState", "nextActions", "dependencies", "acceptanceCriteria", "notes"] as const;
export type TodoTextField = typeof TODO_TEXT_FIELDS[number];
const sameContent = (a: EmpireTodoItem, b: EmpireTodoItem) =>
  TODO_TEXT_FIELDS.every((field) => a[field] === b[field]) && a.status === b.status && a.priority === b.priority && a.category === b.category
  && a.progress?.percent === b.progress?.percent && a.progress?.method === b.progress?.method && a.progress?.reviewedAt === b.progress?.reviewedAt;

/** One editor's write queue, not concurrency control for independent O2 writers. */
export function createTodoDrafts(api: {
  save: (item: EmpireTodoItem, expectedRevision: number) => Promise<EmpireTodoSaveResponse>;
  complete: (id: string, timeline: { title: string; notes: string } | null, expectedRevision: number) => Promise<EmpireTodoSaveResponse>;
}, changed: () => void) {
  const saved = new Map<string, EmpireTodoItem>();
  const drafts = new Map<string, EmpireTodoItem>();
  const added = new Set<string>();
  let tail: Promise<boolean> = Promise.resolve(true);
  let saving: string | null = null;
  let completing = false;
  let revision = 0;
  let error = "";
  const rows = () => [...saved.keys()].map((id) => drafts.get(id) || saved.get(id)!);
  const notify = () => changed();
  const enqueue = (work: () => Promise<boolean>) => {
    const next = tail.then(work, work);
    tail = next;
    return next;
  };
  const accept = (response: EmpireTodoSaveResponse) => {
    if (!response.ok || !response.item) throw new Error(response.error || "Task save failed");
    if (Number.isInteger(response.revision)) revision = response.revision;
    return response.item;
  };
  async function drain(id: string): Promise<boolean> {
    while (drafts.has(id)) {
      const draft = drafts.get(id)!;
      if (added.has(id) && sameContent(draft, saved.get(id)!)) {
        drafts.delete(id); saved.delete(id); added.delete(id); notify(); return true;
      }
      if (!added.has(id) && sameContent(draft, saved.get(id)!)) { drafts.delete(id); notify(); return true; }
      if (!draft.title.trim()) { error = "A task title is required. Your draft is retained."; notify(); return false; }
      saving = id; error = ""; notify();
      try {
        const result = accept(await api.save({ ...draft }, revision));
        saved.set(id, result); added.delete(id);
        // An older reply must not erase edits made while it was in flight.
        if (drafts.get(id) === draft) drafts.delete(id);
        else if (drafts.has(id)) drafts.set(id, { ...drafts.get(id)!, createdAt: result.createdAt, updatedAt: result.updatedAt });
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
        return false;
      } finally { saving = null; notify(); }
    }
    return true;
  }
  return {
    rows,
    state: () => ({ saving, error, completing }),
    dirty: (id: string) => drafts.has(id),
    isNew: (id: string) => added.has(id),
    load(items: EmpireTodoItem[], loadedRevision = 0) { revision = loadedRevision; saved.clear(); drafts.clear(); added.clear(); for (const item of items) saved.set(item.id, item); notify(); },
    update(id: string, field: TodoTextField, value: string) {
      const baseline = saved.get(id); if (!baseline) return;
      const draft = { ...(drafts.get(id) || baseline), [field]: value };
      if (!added.has(id) && saving !== id && sameContent(draft, baseline)) drafts.delete(id);
      else drafts.set(id, draft);
      notify();
    },
    assessProgress(id: string, percent: number) {
      const baseline = saved.get(id); if (!baseline) return;
      if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Enter a whole percentage from 0 to 100.");
      const current = drafts.get(id) || baseline;
      if (!["In Progress", "Blocked"].includes(current.status)) return;
      drafts.set(id, { ...current, progress: { percent, method: "operator", reviewedAt: "" } });
      notify();
    },
    add() { const item = createBlankEmpireTodo(); saved.set(item.id, item); drafts.set(item.id, item); added.add(item.id); notify(); return item.id; },
    discard(id: string) { if (saving) return; drafts.delete(id); if (added.delete(id)) saved.delete(id); error = ""; notify(); },
    flush: () => enqueue(async () => { for (const id of [...drafts.keys()]) if (!await drain(id)) return false; return true; }),
    complete: (id: string, withTimeline: boolean) => enqueue(async () => {
      completing = true; notify();
      try {
        // Serialize collection writes before completion; never restore an old status afterward.
        for (const dirty of [...drafts.keys()]) if (!await drain(dirty)) return false;
        const item = saved.get(id); if (!item) return false;
        saving = id; error = ""; notify();
        const result = accept(await api.complete(id, withTimeline ? { title: `${item.title} completed`, notes: "Completed from Empire To-Do." } : null, revision));
        saved.set(id, result); return true;
      } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); return false; }
      finally { saving = null; completing = false; notify(); }
    }),
  };
}
