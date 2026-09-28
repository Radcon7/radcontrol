import { useCallback, useEffect, useRef, useState } from "react";
import { completeEmpireTodo, saveEmpireTodo, saveTaskRelationships } from "./empireTodoApi";
import { createTodoDrafts, type TodoTextField, type TodoEditField } from "./empireTodoDrafts";
import { EMPIRE_TODO_PRIORITIES, EMPIRE_TODO_STATUSES, isEmpireTodoComplete, type EmpireTodoItem } from "./empireTodoModel";
import { listWork } from "../overview/workApi";
import { WORK_BRIDGE_NOTICE, type WorkTarget, type Initiative } from "../overview/workModel";
import { TaskProgress } from "./TaskProgress";
import { Relationships, type ProjectOption, type RelationshipDraft } from "../work/Relationships";
import { TASK_VIEWS, inTaskView, type TaskView } from "../work/taskViews";
type Props = { active: boolean; target?: WorkTarget | null; busy?: boolean; projects: ProjectOption[]; projectError: string; onOpen: (target: WorkTarget) => void; registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void };
const detailFields: [TodoTextField, string][] = [
  ["currentState", "Current state"], ["nextActions", "Next Action"], ["dependencies", "Dependencies / blockers"],
  ["acceptanceCriteria", "Acceptance / done condition"], ["summary", "Summary"], ["detailedContext", "Context"],
  ["whyItMatters", "Why it matters"], ["notes", "Notes"],
];
export function EmpireTodoWorkspace({ active, target, busy, projects, projectError, onOpen, registerBeforeTabChangeSaver }: Props) {
  const relationshipDrafts=useRef(new Map<string,RelationshipDraft>());
  const [relationshipReset,setRelationshipReset]=useState(0);
  const [, refresh] = useState(0);
  const [store] = useState(() => createTodoDrafts({ save: saveEmpireTodo, complete: completeEmpireTodo, relationships: saveTaskRelationships }, () => refresh(n => n + 1)));
  const [readOnly, setReadOnly] = useState(true), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [view, setView] = useState<TaskView>("All"), [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null), [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<EmpireTodoItem | null>(null), [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const timer = useRef<number | null>(null);
  const shownTarget = useRef<WorkTarget | null>(null);
  const cancelTimer = useCallback(() => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; }, []);
  const flush = useCallback(() => { cancelTimer(); return store.flush(); }, [cancelTimer, store]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { const response = await listWork(); setReadOnly(response.authority !== "private"); store.load(response.data.tasks, response.revision); setInitiatives(response.data.initiatives); }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [store]);
  useEffect(() => { if (active && !relationshipDrafts.current.size && !store.rows().some(r => store.dirty(r.id))) void load(); return cancelTimer; }, [active, load, store, cancelTimer]);
  useEffect(() => { registerBeforeTabChangeSaver?.(flush); return () => registerBeforeTabChangeSaver?.(null); }, [flush, registerBeforeTabChangeSaver]);
  useEffect(() => { if (target?.kind === "task") { setSelectedId(target.id); setQuery(""); setView(TASK_VIEWS.includes(target.view as TaskView) ? target.view as TaskView : "All"); } }, [target]);
  useEffect(() => {
    if (active && !loading && target?.kind === "task" && shownTarget.current !== target) {
      const row=document.querySelector(`[data-testid="empire-todo-item-${CSS.escape(target.id)}"]`);
      if(row){shownTarget.current=target;requestAnimationFrame(()=>requestAnimationFrame(()=>row.scrollIntoView({block:"center"})));}
    }
  },[active,loading,target]);
  const items = store.rows(), { saving, error, completing } = store.state();
  const visible = items.filter(item => item.id === justCompleted || (item.id === selectedId && store.dirty(item.id)) || (inTaskView(item, view) && `${item.title} ${item.currentState} ${item.nextActions} ${item.dependencies} ${item.projectKeys?.join(" ") || ""}`.toLowerCase().includes(query.toLowerCase()) || (inTaskView(item, view) && item.id === selectedId)));
  const selected = items.find(item => item.id === selectedId);
  const disabled = Boolean(readOnly || busy || saving || loading || loadError || completing);
  const editorDisabled = disabled || Boolean(selected && !EMPIRE_TODO_STATUSES.includes(selected.status));
  function update(field: TodoEditField, value: string) {
    if (!selected || readOnly) return;
    store.update(selected.id, field, value); cancelTimer(); timer.current = window.setTimeout(() => { void store.flush(); timer.current = null; }, 700);
  }
  async function complete(withTimeline: boolean) {
    if (!candidate || readOnly) return;
    cancelTimer();
    if (await store.complete(candidate.id, withTimeline)) { setJustCompleted(candidate.id); setSelectedId(candidate.id); setCandidate(null); }
  }
  return <section className="empireTodoShell workTasks" data-testid="empire-todo-workspace" data-task-workspace="tasks">
    <div className="empireTodoToolbar"><div className="todoFilterRow">
      <input className="input todoSearch" aria-label="Find tasks" placeholder="Find tasks" value={query} onChange={e => { setQuery(e.target.value); setSelectedId(null); }} />
      <div className="empireTodoViewButtons" aria-label="Task views">{TASK_VIEWS.map(v => <button key={v} className={`btn btnCompact ${view === v ? "btnPrimary" : "btnGhost"}`} aria-pressed={view === v} data-testid={`task-view-${v.toLowerCase()}`} onClick={() => { setView(v); setJustCompleted(null); }}>{v}</button>)}</div>
      <span className="todoCount">{visible.length} tasks</span>
    </div><button className="btn btnGhost btnCompact" disabled={disabled} onClick={() => { setView("All"); setQuery(""); setSelectedId(store.add()); }}>Add task</button></div>
    {view === "Now" ? <p className="workViewHint">In Progress + Blocked · task lifecycle, not running agents.</p> : null}
    {justCompleted ? <div className="workConfirmation" role="status">Just completed · {items.find(r => r.id === justCompleted)?.title} · 100% <button className="btn btnGhost btnCompact" onClick={() => { setView("Completed"); setJustCompleted(null); }}>View Completed</button></div> : null}
    {readOnly && !loading && !loadError ? <div data-testid="work-bridge-notice">{WORK_BRIDGE_NOTICE}</div> : null}
    {loadError || error ? <div className="panelError" role="alert">{loadError || error}<button className="btn btnGhost btnCompact" disabled={!!saving} onClick={() => { cancelTimer(); relationshipDrafts.current.clear(); setRelationshipReset(n=>n+1); void load(); }}>{error ? "Discard drafts & reload" : "Retry"}</button></div> : null}
    <div className="workRecordScroller" data-testid="tasks-scroller" tabIndex={0} aria-label="Task records">
      {loading && !items.length ? <p role="status">Loading tasks…</p> : !loadError ? <div className="empireTodoList" aria-label="Tasks">
        {visible.map(item => <div className="taskRowWithDetail" key={item.id}><article className={`empireTodoRow ${selectedId === item.id ? "isSelected" : ""}`} data-testid={`empire-todo-item-${item.id}`}>
          <input aria-label={`Complete ${item.title}`} type="checkbox" checked={isEmpireTodoComplete(item)} disabled={disabled || isEmpireTodoComplete(item) || store.isNew(item.id) || !EMPIRE_TODO_STATUSES.includes(item.status)} onChange={() => setCandidate(item)} />
          <div className="taskProgressContent"><TaskProgress item={item} rail title={<button className="todoRowSelect" data-testid={`empire-todo-select-${item.id}`} aria-expanded={selectedId === item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}><strong>{item.title || "New task"}</strong><span>{item.status} · {item.priority} · {item.category} · {item.projectKeys?.length ? item.projectKeys.join(", ") : "Unassigned"}</span></button>} disabled={disabled || !!error} onAssess={readOnly ? undefined : async percent => { cancelTimer(); store.assessProgress(item.id, percent); return store.flush(); }} />
            <div className="todoRowContext">{item.currentState ? <span><b>Current</b> {item.currentState}</span> : null}<span className="todoRowNext"><b>Next</b> {item.nextActions || "Not recorded"}</span>{item.status === "Blocked" ? <span className="todoRowBlocker"><b>Blocked by</b> {item.dependencies || item.currentState || "Not recorded"}</span> : null}{item.acceptanceCriteria ? <span><b>Done when</b> {item.acceptanceCriteria}</span> : null}</div>
            {initiatives.filter(r => r.taskIds.includes(item.id)).map(r => <button className="workTextLink" key={r.id} onClick={() => onOpen({kind:"initiative",id:r.id})}>{r.title}</button>)}
          </div></article>
          {selected?.id === item.id ? <aside className="todoDetail" data-testid="empire-todo-detail" aria-label="Selected task detail">
            <div className="todoDetailHeading"><TaskProgress item={selected} /><span role="status">{saving === selected.id ? "Saving…" : store.dirty(selected.id) ? "Unsaved" : "Saved"}</span><button className="btn btnGhost btnCompact" onClick={() => setSelectedId(null)} aria-label="Close task detail">Close</button></div>
            <label className="empireTodoField"><span>Task</span><input className="input" aria-label="Task title" value={selected.title} disabled={editorDisabled} onChange={e => update("title",e.target.value)} onBlur={() => void flush()} /></label>
            <div className="workEditorMeta"><label>Status<select className="input" aria-label="Task status" value={selected.status} disabled={editorDisabled} onChange={e => e.target.value === "Complete" ? setCandidate(selected) : update("status",e.target.value)}>{EMPIRE_TODO_STATUSES.map(v => <option key={v}>{v}</option>)}</select></label><label>Priority<select className="input" aria-label="Task priority" value={selected.priority} disabled={editorDisabled} onChange={e => update("priority",e.target.value)}>{EMPIRE_TODO_PRIORITIES.map(v => <option key={v}>{v}</option>)}</select></label><label>Category<input className="input" aria-label="Task category" value={selected.category} disabled={editorDisabled} onChange={e => update("category",e.target.value)} onBlur={() => void flush()} /></label></div>
            {detailFields.map(([field,label]) => <label className="empireTodoField" key={field}><span>{label}</span><textarea className="pasteArea todoDetailText" aria-label={field === "notes" ? `Notes for ${selected.title}` : label} value={selected[field]} disabled={editorDisabled} onChange={e => update(field,e.target.value)} onBlur={() => void flush()} /></label>)}
            <Relationships draftCache={relationshipDrafts.current} recordKey={selected.id} key={selected.id + relationshipReset + JSON.stringify([selected.projectKeys,selected.dependsOnTaskIds])} projects={projects} projectError={projectError} projectKeys={selected.projectKeys} references={items.filter(r => r.id !== selected.id)} referenceIds={selected.dependsOnTaskIds} referenceLabel="Dependencies" disabled={disabled || store.isNew(selected.id)} onSave={(p,r) => { cancelTimer(); return store.relationships(selected.id,p,r); }} />
            <div className="todoDetailMeta">Created {selected.createdAt || "Unknown"}<br />Updated {selected.updatedAt || "Unknown"}<br />{selected.id}</div>
            {store.dirty(selected.id) ? <button className="btn btnGhost btnCompact" disabled={disabled} onClick={() => { cancelTimer(); store.discard(selected.id); }}>{store.isNew(selected.id) ? "Cancel new task" : "Discard unsaved changes"}</button> : null}
          </aside> : null}
        </div>)}
        {!visible.length ? <p className="surfaceEmptyState">{query ? "No matching tasks." : `No ${view.toLowerCase()} tasks recorded.`}</p> : null}
      </div> : null}
    </div>
    {candidate ? <div className="modalOverlay"><div className="notesModalCard" role="dialog" aria-modal="true" aria-labelledby="todo-completion-title"><div className="notesModalHeader"><div className="notesModalTitle" id="todo-completion-title">Complete “{candidate.title}”?</div></div><div className="notesModalBody"><p>Add a Timeline milestone?</p><div className="timelineModalActions"><button className="btn btnGhost" type="button" disabled={Boolean(saving)} onClick={() => setCandidate(null)}>Cancel</button><button className="btn btnGhost" type="button" disabled={Boolean(saving)} onClick={() => void complete(false)} data-testid="empire-todo-complete-without-timeline">Complete without Timeline</button><button className="btn btnPrimary" type="button" disabled={Boolean(saving)} onClick={() => void complete(true)} data-testid="empire-todo-complete-with-timeline">Add to Timeline</button></div></div></div></div> : null}
  </section>;
}
