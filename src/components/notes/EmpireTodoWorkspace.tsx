import { useCallback, useEffect, useRef, useState } from "react";
import { completeEmpireTodo, listEmpireTodos, saveEmpireTodo } from "./empireTodoApi";
import { createTodoDrafts, type TodoTextField } from "./empireTodoDrafts";
import { EMPIRE_TODO_STATUSES, empireTodoLane, groupEmpireTodos, isEmpireTodoComplete, type EmpireTodoItem } from "./empireTodoModel";

import { TaskProgress } from "./TaskProgress";

type Props = { mode?: "queued" | "progress"; busy?: boolean; registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void };
const detailFields: [TodoTextField, string][] = [
  ["currentState", "Current state"], ["nextActions", "Next Action"], ["dependencies", "Dependencies / blockers"],
  ["acceptanceCriteria", "Acceptance / done condition"], ["summary", "Summary"], ["detailedContext", "Context"],
  ["whyItMatters", "Why it matters"], ["notes", "Notes"],
];
export function EmpireTodoWorkspace({ mode = "queued", busy, registerBeforeTabChangeSaver }: Props) {
  const [, refresh] = useState(0);
  const [store] = useState(() => createTodoDrafts({ save: saveEmpireTodo, complete: completeEmpireTodo }, () => refresh((n) => n + 1)));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"primary" | "other" | "completed">("primary");
  const showCompleted = view === "completed";
  const lane = view === "primary" ? mode : view;
  const progressWorkspace = mode === "progress";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<EmpireTodoItem | null>(null);
  const timer = useRef<number | null>(null);
  const cancelTimer = useCallback(() => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; }, []);
  const flush = useCallback(() => { cancelTimer(); return store.flush(); }, [cancelTimer, store]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await listEmpireTodos();
      if (!response.ok || !Array.isArray(response.items)) throw new Error(response.error || "Empire To-Do unavailable");
      store.load(response.items);
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [store]);
  useEffect(() => { void load(); return cancelTimer; }, [load, cancelTimer]);
  useEffect(() => { registerBeforeTabChangeSaver?.(flush); return () => registerBeforeTabChangeSaver?.(null); }, [flush, registerBeforeTabChangeSaver]);
  const items = store.rows();
  const { saving, error, completing } = store.state();
  const visible = items.filter((item) => empireTodoLane(item.status) === lane &&
    (`${item.title} ${item.currentState} ${item.nextActions} ${item.dependencies}`.toLowerCase().includes(query.toLowerCase()) || (progressWorkspace && item.id === selectedId)));
  const groups = groupEmpireTodos(visible);
  const selected = items.find((item) => item.id === selectedId && empireTodoLane(item.status) === lane) || (!progressWorkspace ? groups[0]?.items[0] : undefined);
  const otherCount = items.filter((item) => empireTodoLane(item.status) === "other").length;
  const disabled = Boolean(busy || saving || loading || loadError);
  const editorDisabled = Boolean(busy || completing || loading || loadError || (selected && !EMPIRE_TODO_STATUSES.includes(selected.status)));
  function update(field: TodoTextField, value: string) {
    if (!selected) return;
    setSelectedId(selected.id);
    store.update(selected.id, field, value); cancelTimer();
    timer.current = window.setTimeout(() => { void store.flush(); timer.current = null; }, 700);
  }
  async function complete(withTimeline: boolean) {
    if (!candidate) return;
    cancelTimer();
    if (await store.complete(candidate.id, withTimeline)) setCandidate(null);
  }
  const detail = selected ? <aside className="todoDetail" data-testid="empire-todo-detail" aria-label="Selected task detail">
        <div className="todoDetailHeading"><TaskProgress item={selected} />{progressWorkspace ? <button className="btn btnGhost btnCompact" type="button" onClick={() => setSelectedId(null)} aria-label="Close task detail">Close</button> : null}<span role="status">{saving === selected.id ? "Saving…" : store.dirty(selected.id) ? "Unsaved" : "Saved"}</span></div>
        <label className="empireTodoField"><span>Task</span><input className="input" aria-label="Task title" value={selected.title} disabled={editorDisabled} onChange={(event) => update("title", event.target.value)} onBlur={() => void flush()} /></label>
        <div className="todoDetailMeta">{selected.status} · {selected.priority} · {selected.category}</div>
        {detailFields.map(([field, label]) => <label className="empireTodoField" key={field}><span>{label}</span><textarea className="pasteArea todoDetailText" aria-label={field === "notes" ? `Notes for ${selected.title}` : label} value={selected[field]} disabled={editorDisabled} onChange={(event) => update(field, event.target.value)} onBlur={() => void flush()} /></label>)}
        <div className="todoDetailMeta">Created {selected.createdAt || "Unknown"}<br />Updated {selected.updatedAt || "Unknown"}<br />{selected.id}</div>
        {store.dirty(selected.id) ? <button className="btn btnGhost btnCompact" disabled={disabled} onClick={() => { cancelTimer(); store.discard(selected.id); }}> {store.isNew(selected.id) ? "Cancel new task" : "Discard unsaved changes"}</button> : null}
      </aside> : null;
  return <section className={`empireTodoShell empireTodoCompact ${progressWorkspace ? "empireProgressWorkspace" : ""}`} data-testid="empire-todo-workspace" data-task-workspace={mode}>
    <div className="empireTodoToolbar">
      <div className="todoFilterRow">
        <input className="input todoSearch" aria-label="Find tasks" placeholder="Find tasks" value={query} onChange={(event) => { setQuery(event.target.value); if (progressWorkspace) setSelectedId(null); }} />
        <div className="empireTodoViewButtons">
          <button className={`btn btnCompact ${view === "primary" ? "btnPrimary" : "btnGhost"}`} type="button" onClick={() => setView("primary")} aria-pressed={view === "primary"} data-testid="empire-todo-active-view">{progressWorkspace ? "Underway" : "Queued"}</button>
          {!progressWorkspace && otherCount > 0 ? <button className={`btn btnCompact ${view === "other" ? "btnPrimary" : "btnGhost"}`} type="button" onClick={() => setView("other")} aria-pressed={view === "other"} data-testid="empire-todo-other-view">Deferred / unclassified · {otherCount}</button> : null}
          <button className={`btn btnCompact ${showCompleted ? "btnPrimary" : "btnGhost"}`} type="button" onClick={() => setView("completed")} aria-pressed={showCompleted} data-testid="empire-todo-completed-view">Completed</button>
        </div>
        {!loading && !loadError ? <span className="todoCount">{visible.length} tasks</span> : null}
      </div>
      {!progressWorkspace ? <button className="btn btnGhost btnCompact" type="button" disabled={disabled} onClick={() => { setView("primary"); setQuery(""); setSelectedId(store.add()); }}>Add item</button> : null}
    </div>
    {loadError || error ? <div className="panelError" role="alert">{loadError || error}{loadError ? <button className="btn btnGhost btnCompact" onClick={() => void load()}>Retry</button> : null}</div> : null}
    {loading ? <div className="timelineStatus">Loading Empire To-Do…</div> : !loadError ? <div className={progressWorkspace ? "progressTaskList" : "todoMasterDetail"}>
      <div className="empireTodoList" aria-label="Tasks">
        {groups.map((group) => <section className="empireTodoGroup" key={group.key}>
          <div className="empireTodoGroupHeading"><strong>{group.label}</strong><span>{group.items.length}</span></div>
          {group.items.map((item) => <div className="taskRowWithDetail" key={item.id}><article className={`empireTodoRow ${selected?.id === item.id ? "isSelected" : ""}`} data-testid={`empire-todo-item-${item.id}`}>
            <input aria-label={`Complete ${item.title}`} type="checkbox" checked={isEmpireTodoComplete(item)} disabled={disabled || isEmpireTodoComplete(item) || store.isNew(item.id) || !EMPIRE_TODO_STATUSES.includes(item.status)} onChange={() => setCandidate(item)} />
            <button className="todoRowSelect" data-testid={`empire-todo-select-${item.id}`} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(progressWorkspace && selectedId === item.id ? null : item.id)}>
              <span className="todoRowTitle"><strong>{item.title || "New task"}</strong>{!progressWorkspace ? <TaskProgress item={item} /> : null}</span>
              {progressWorkspace ? <TaskProgress item={item} rail /> : null}
              {empireTodoLane(item.status) === "other" ? <span className="todoRowState">State: {item.status || "Not recorded"}</span> : null}
              {item.currentState ? <span className="todoRowState" title={item.currentState}>{item.currentState}</span> : null}
              <span className="todoRowNext" title={item.nextActions}><b>Next</b> {item.nextActions || "Not recorded"}</span>
              {item.status === "Blocked" ? <span className="todoRowBlocker" title={item.dependencies || item.currentState}><b>Blocked by</b> {item.dependencies || item.currentState || "Not recorded"}</span> : null}
              {item.acceptanceCriteria ? <span className="todoRowAcceptance" title={item.acceptanceCriteria}><b>Done when</b> {item.acceptanceCriteria}</span> : null}
            </button>
          </article>{progressWorkspace && selected?.id === item.id ? detail : null}</div>)}
        </section>)}
        {!visible.length ? <div className="surfaceEmptyState">{query ? "No matching tasks." : `No ${showCompleted ? "completed" : progressWorkspace ? "underway" : view === "other" ? "deferred or unclassified" : "queued"} tasks.`}</div> : null}
      </div>
      {!progressWorkspace ? detail : null}
    </div> : null}
    {candidate ? <div className="modalOverlay"><div className="notesModalCard" role="dialog" aria-modal="true" aria-labelledby="todo-completion-title"><div className="notesModalHeader"><div className="notesModalTitle" id="todo-completion-title">Complete “{candidate.title}”?</div></div><div className="notesModalBody"><p>Add a Timeline milestone?</p><div className="timelineModalActions"><button className="btn btnGhost" type="button" disabled={Boolean(saving)} onClick={() => setCandidate(null)}>Cancel</button><button className="btn btnGhost" type="button" disabled={Boolean(saving)} onClick={() => void complete(false)} data-testid="empire-todo-complete-without-timeline">Complete without Timeline</button><button className="btn btnPrimary" type="button" disabled={Boolean(saving)} onClick={() => void complete(true)} data-testid="empire-todo-complete-with-timeline">Add to Timeline</button></div></div></div></div> : null}
  </section>;
}
