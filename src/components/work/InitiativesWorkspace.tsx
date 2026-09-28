import { useCallback, useEffect, useRef, useState } from "react";
import { listWork, mutateWork } from "../overview/workApi";
import { WORK_BRIDGE_NOTICE, momentum, unassessed, type Initiative, type WorkResponse, type WorkTarget } from "../overview/workModel";
import "../overview/overview.css";
import { ProgressRail } from "../common/ProgressRail";
import { Relationships, type ProjectOption, type RelationshipDraft } from "./Relationships";
type Props = { active: boolean; target?: WorkTarget | null; projects: ProjectOption[]; projectError: string; onOpen: (target: WorkTarget) => void; registerBeforeTabChangeSaver: (fn: (() => Promise<boolean>) | null) => void };
export function InitiativesWorkspace({ active, target, projects, projectError, onOpen, registerBeforeTabChangeSaver }: Props) {
  const relationshipDrafts=useRef(new Map<string,RelationshipDraft>());
  const [snapshot, setSnapshot] = useState<WorkResponse | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [draft, setDraft] = useState<Initiative | null>(null), [saving, setSaving] = useState(false);
  const handledTarget = useRef<WorkTarget | null>(null);
  const [movementId, setMovementId] = useState("");
  const load = useCallback(async (nextTarget?: WorkTarget | null) => {
    setLoading(true); setError("");
    try {
      const response=await listWork(); setSnapshot(response);
      if(nextTarget?.kind === "initiative" && nextTarget!==handledTarget.current && response.authority === "private") {
        const row=response.data.initiatives.find(r=>r.id===nextTarget.id);
        if(row){handledTarget.current=nextTarget;setDraft(structuredClone(row));setMovementId("");}
      }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (active) void load(target); }, [active, target, load]);
  useEffect(() => {
    registerBeforeTabChangeSaver(async () => {
      if (draft) { setError("Save or cancel the initiative review before leaving."); return false; }
      return !saving;
    });
    return () => registerBeforeTabChangeSaver(null);
  }, [draft, saving, registerBeforeTabChangeSaver]);
  const edit = (row: Initiative) => { if (draft || saving) return; setDraft(structuredClone(row)); setMovementId(""); setError(""); };
  async function save(accept = false) {
    if (!draft || !snapshot) return;
    setSaving(true); setError("");
    try {
      const result = await mutateWork(snapshot.revision, "initiative.save", { ...draft, ...(accept ? { status: "active" } : {}), movementEventId: movementId });
      setSnapshot(result); setDraft(null); setMovementId("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }
  function update(patch: Partial<Initiative>) { setDraft(row => row ? { ...row, ...patch } : row); }
  const rows = snapshot?.data.initiatives || [];

  return <section className="workInitiatives" data-testid="initiatives-workspace">
    <header className="workSectionHeading"><h2>Initiatives</h2><span>{rows.length} recorded · proposals require explicit review</span></header>
    {error ? <div className="panelError" role="alert">{error} {!draft ? <button className="btn btnGhost btnCompact" onClick={() => void load()}>Reload</button> : null}</div> : null}
    {loading && !snapshot ? <p role="status">Loading current work…</p> : !snapshot ? <p>Operational work unavailable.</p> : snapshot.authority === "legacy-readonly" ? <p data-testid="work-bridge-notice">{WORK_BRIDGE_NOTICE}</p> : <>
      <section className="workRecordScroller momentum" aria-label="Initiative records" tabIndex={0}>
        {!rows.length ? <p className="overviewQuiet">No initiatives recorded.</p> : rows.map(row => {
          const progress = momentum(row);
          return <article className={`momentumRow ${row.blocker ? "isBlocked" : ""}`} key={row.id} data-testid={`momentum-${row.id}`}>
            <div className="momentumArea">{row.area}<br />{row.kind}<br />{row.projectKeys?.length ? row.projectKeys.join(", ") : "Unassigned"}</div>
            <div className="momentumBody"><div className="momentumTitle"><h3>{row.title}</h3><span className="momentumStatus">{row.status === "proposal" ? "For review" : row.blocker ? "Blocked" : row.status}</span></div>
              {row.phase ? <div className="momentumPhase">{row.phase}</div> : null}
              {progress.percent !== null ? <div className="momentumAssessment"><ProgressRail percent={progress.percent} label={`${row.title} progress`} trackClassName="momentumRail" /><strong>{progress.percent}%</strong></div> : <div className="momentumState" data-testid="momentum-nonnumeric">{progress.label}</div>}
              {progress.percent !== null ? <span className="momentumProvenance" title={`${row.progress.basis} · ${row.progress.assessedAt}`}>{progress.label}</span> : null}
              <div className="momentumNext"><b>Next</b><span>{row.nextMove || "Not set"}</span></div>
              {row.blocker ? <div className="momentumBlocker"><b>Blocked</b><span>{row.blocker}</span></div> : null}
              <div className="momentumRefs">{row.taskIds.map(id => { const task = snapshot.data.tasks.find(t => t.id === id); return task ? <button key={id} onClick={() => onOpen({kind:"task",id:task.id})}>{task.title}</button> : null; })}
              {row.eventIds.map(id => { const event = snapshot.data.events.find(e => e.id === id); return event ? <button key={id} onClick={() => onOpen({kind:"event",id:event.id})}>{event.title}</button> : null; })}</div>
              {row.lastMovementAt ? <div className="momentumDate">Moved {row.lastMovementAt.slice(0,10)}</div> : null}
            </div><button className="btn btnGhost btnCompact momentumReview" disabled={!!draft || saving} onClick={() => edit(row)} aria-label={`Review ${row.title}`}>Review</button>
          </article>;
        })}
      </section>
    </>}
    {draft && snapshot ? <div className="modalOverlay"><form className="notesModalCard initiativeEditor" role="dialog" aria-modal="true" aria-labelledby="initiative-review-title" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="notesModalHeader"><h2 id="initiative-review-title">Review initiative</h2></div><div className="notesModalBody">
        {error ? <div role="alert" className="panelError">{error}</div> : null}
        <label>Title<input className="input" aria-label="Initiative title" autoFocus value={draft.title} disabled={saving} onChange={e => update({ title:e.target.value })} required /></label>
        <div className="initiativeFormRow"><label>Area<input className="input" value={draft.area} disabled={saving} onChange={e => update({ area:e.target.value })} required /></label><label>Kind<select className="input" aria-label="Initiative kind" value={draft.kind} disabled={saving} onChange={e => update({kind:e.target.value as Initiative['kind'],status:draft.status==='proposal'?'proposal':'active',progress:unassessed()})}><option value="finite">Finite outcome</option><option value="ongoing">Ongoing responsibility</option></select></label></div>
        <div className="initiativeFormRow"><label>Status<select className="input" value={draft.status} disabled={saving} onChange={e => update({status:e.target.value as Initiative['status']})}>{(draft.kind==='finite' ? ['proposal','active','paused','complete'] : ['proposal','active','maintenance','healthy','attention','paused']).map(status => <option key={status}>{status}</option>)}</select></label><label>Phase<input className="input" value={draft.phase} disabled={saving} onChange={e => update({phase:e.target.value})} /></label></div>
        <label>Next Move<input className="input" aria-label="Initiative Next Move" value={draft.nextMove} disabled={saving} onChange={e => update({nextMove:e.target.value})} /></label>
        <label>Blocker<input className="input" value={draft.blocker} disabled={saving} onChange={e => update({blocker:e.target.value})} /></label>
        <label className="initiativeCheck"><input type="checkbox" checked={draft.pinned} disabled={saving} onChange={e => update({pinned:e.target.checked})} />Pin Next Move</label>
        {draft.kind==='finite' ? <><label>Progress<select className="input" aria-label="Progress method" value={draft.progress.method} disabled={saving} onChange={e => update({progress:e.target.value==='unassessed'?unassessed():{method:'operator-assessed',percent:null,basis:'',assessedAt:''}})}><option value="unassessed">Unassessed</option><option value="operator-assessed">Operator-assessed</option></select></label>{draft.progress.method==='operator-assessed' ? <div className="initiativeFormRow"><label>Percent<input className="input" aria-label="Assessed percent" type="number" min="0" max="100" step="1" required disabled={saving} value={draft.progress.percent??''} onChange={e => update({progress:{...draft.progress,percent:e.target.value===''?null:Number(e.target.value)}})} /></label><label>Assessment basis<input className="input" aria-label="Assessment basis" required value={draft.progress.basis} disabled={saving} onChange={e => update({progress:{...draft.progress,basis:e.target.value}})} /></label></div> : null}</> : null}
        <label>Target date<input className="input" type="date" value={draft.targetDate} disabled={saving} onChange={e => update({targetDate:e.target.value})} /></label>
        <details><summary>Timeline references</summary>
          <fieldset disabled={saving}><legend>Timeline</legend>{snapshot.data.events.map(event => <label className="initiativeCheck" key={event.id}><input type="checkbox" checked={draft.eventIds.includes(event.id)} onChange={e => update({eventIds:e.target.checked?[...draft.eventIds,event.id]:draft.eventIds.filter(id=>id!==event.id)})} />{event.title}</label>)}</fieldset></details>
        <Relationships draftCache={relationshipDrafts.current} recordKey={draft.id} key={draft.id + JSON.stringify([draft.projectKeys,draft.taskIds])} projects={projects} projectError={projectError} projectKeys={draft.projectKeys} references={snapshot.data.tasks} referenceIds={draft.taskIds} referenceLabel="Related tasks" disabled={saving} onSave={async (projectKeys,taskIds) => {
          setSaving(true); setError("");
          try { const response=await mutateWork(snapshot.revision,"initiative.relationships",{id:draft.id,projectKeys,taskIds}); setSnapshot(response); const row=response.data.initiatives.find(r=>r.id===draft.id)!; setDraft(current=>current?{...current,projectKeys:row.projectKeys,taskIds:row.taskIds}:current); return true; }
          catch(e) { setError(e instanceof Error?e.message:String(e)); return false; }
          finally { setSaving(false); }
        }} />
        <label>Record meaningful movement<select className="input" value={movementId} disabled={saving} onChange={e => setMovementId(e.target.value)}><option value="">No new movement</option>{snapshot.data.events.map(event => <option value={event.id} key={event.id}>{event.date} · {event.title}</option>)}</select></label>
        <div className="momentumDate">Reviewed {draft.reviewedAt?.slice(0,10)||'Not yet'} · Moved {draft.lastMovementAt?.slice(0,10)||'Not recorded'}</div>
      </div><div className="initiativeActions"><button type="button" className="btn btnGhost" disabled={saving} onClick={() => {relationshipDrafts.current.delete(draft.id);setDraft(null);setError('');}}>Cancel</button>{draft.status==='proposal' ? <button type="button" className="btn btnPrimary" disabled={saving} onClick={() => void save(true)}>Accept initiative</button> : null}<button className="btn btnPrimary" type="submit" disabled={saving}>{saving?'Saving…':'Save review'}</button></div>
    </form></div> : null}

  </section>;
}
