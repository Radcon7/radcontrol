import { useCallback, useEffect, useState } from "react";
import { listWork, mutateWork } from "./workApi";
import { momentum, needsYou, nextMoves, recentMovement, unassessed, type Initiative, type WorkResponse } from "./workModel";
import "./overview.css";
type Props = { onSecurity: () => void; registerBeforeTabChangeSaver: (fn: (() => Promise<boolean>) | null) => void };
export function Overview({ onSecurity, registerBeforeTabChangeSaver }: Props) {
  const [snapshot, setSnapshot] = useState<WorkResponse | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [draft, setDraft] = useState<Initiative | null>(null), [saving, setSaving] = useState(false);
  const [reference, setReference] = useState<{ title: string; text: string } | null>(null);
  const [movementId, setMovementId] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSnapshot(await listWork()); } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
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
  const attention = needsYou(rows), moves = nextMoves(rows), recent = recentMovement(snapshot?.data.events || []);
  const proposals = rows.filter(r => r.status === "proposal");
  return <section className="overview" data-testid="overview-workspace">
    <header className="overviewHeading"><h1>Overview</h1><button className="btn btnGhost btnCompact" onClick={onSecurity}>System health · Security</button></header>
    {error ? <div className="panelError" role="alert">{error} {!draft ? <button className="btn btnGhost btnCompact" onClick={() => void load()}>Reload</button> : null}</div> : null}
    {loading ? <p role="status">Loading current work…</p> : !snapshot ? <p>Operational work unavailable.</p> : <>
      <section className="overviewAttention" aria-label="What Needs You"><div className="overviewSectionTitle"><h2>What Needs You</h2>{proposals.length ? <button className="btn btnGhost btnCompact" disabled={!!draft} onClick={() => edit(proposals[0])}>Review {proposals.length} {proposals.length === 1 ? "proposal" : "proposals"}</button> : null}</div>
        {attention.length ? <div className="attentionRows">{attention.map(a => <button key={a.id} disabled={!!draft} onClick={() => edit(rows.find(r => r.id === a.id)!)}><strong>{rows.find(r => r.id === a.id)!.title}</strong><span>{a.reason}</span></button>)}</div> : <span className="overviewQuiet">No recorded action needs attention.</span>}
      </section>
      <section className="momentum" aria-label="Momentum"><div className="overviewSectionTitle"><h2>Momentum</h2><span>{rows.length} initiatives</span></div>
        {!rows.length ? <p className="overviewQuiet">No initiatives recorded.</p> : rows.map(row => {
          const progress = momentum(row);
          return <article className={`momentumRow ${row.blocker ? "isBlocked" : ""}`} key={row.id} data-testid={`momentum-${row.id}`}>
            <div className="momentumArea">{row.area}</div>
            <div className="momentumBody"><div className="momentumTitle"><h3>{row.title}</h3><span className="momentumStatus">{row.status === "proposal" ? "For review" : row.blocker ? "Blocked" : row.status}</span></div>
              {row.phase ? <div className="momentumPhase">{row.phase}</div> : null}
              {progress.percent !== null ? <div className="momentumAssessment"><span>0</span><div className="momentumRail" role="progressbar" aria-label={`${row.title} progress`} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress.percent}%` }} /><i style={{ left: `${progress.percent}%` }} /></div><span>100</span><strong>{progress.percent}%</strong></div> : <div className="momentumState" data-testid="momentum-nonnumeric">{progress.label}</div>}
              {progress.percent !== null ? <span className="momentumProvenance" title={`${row.progress.basis} · ${row.progress.assessedAt}`}>{progress.label}</span> : null}
              <div className="momentumNext"><b>Next</b><span>{row.nextMove || "Not set"}</span></div>
              {row.blocker ? <div className="momentumBlocker"><b>Blocked</b><span>{row.blocker}</span></div> : null}
              <div className="momentumRefs">{row.taskIds.map(id => { const task = snapshot.data.tasks.find(t => t.id === id); return task ? <button key={id} onClick={() => setReference({ title: task.title, text: `${task.status}\n\nNext Action: ${task.nextActions || "Not recorded"}\n\n${task.dependencies}` })}>{task.title}</button> : null; })}
              {row.eventIds.map(id => { const event = snapshot.data.events.find(e => e.id === id); return event ? <button key={id} onClick={() => setReference({ title: event.title, text: `${event.date}\n\n${event.notes}` })}>{event.title}</button> : null; })}</div>
              {row.lastMovementAt ? <div className="momentumDate">Moved {row.lastMovementAt.slice(0,10)}</div> : null}
            </div><button className="btn btnGhost btnCompact momentumReview" disabled={!!draft || saving} onClick={() => edit(row)} aria-label={`Review ${row.title}`}>Review</button>
          </article>;
        })}
      </section>
      <div className="overviewLower"><section aria-label="Next Moves"><h2>Next Moves</h2>{moves.length ? moves.map(row => <button className="overviewMove" key={row.id} disabled={!!draft} onClick={() => edit(row)}><strong>{row.title}</strong><span>{row.nextMove}</span></button>) : <p className="overviewQuiet">No Next Moves pinned.</p>}</section>
      <section aria-label="Recent Movement"><h2>Recent Movement</h2>{recent.length ? recent.map(event => <button className="overviewEvent" data-event-id={event.id} key={event.id} onClick={() => setReference({ title:event.title, text:`${event.date}\n\n${event.notes}` })}><time>{(event.date || event.createdAt).slice(0,10)}</time><span>{event.title}</span></button>) : <p className="overviewQuiet">No movement recorded.</p>}</section></div>
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
        <details><summary>Linked work</summary><fieldset disabled={saving}><legend>Tasks</legend>{snapshot.data.tasks.map(task => <label className="initiativeCheck" key={task.id}><input type="checkbox" checked={draft.taskIds.includes(task.id)} onChange={e => update({taskIds:e.target.checked?[...draft.taskIds,task.id]:draft.taskIds.filter(id=>id!==task.id)})} />{task.title}</label>)}</fieldset>
          <fieldset disabled={saving}><legend>Timeline</legend>{snapshot.data.events.map(event => <label className="initiativeCheck" key={event.id}><input type="checkbox" checked={draft.eventIds.includes(event.id)} onChange={e => update({eventIds:e.target.checked?[...draft.eventIds,event.id]:draft.eventIds.filter(id=>id!==event.id)})} />{event.title}</label>)}</fieldset></details>
        <label>Record meaningful movement<select className="input" value={movementId} disabled={saving} onChange={e => setMovementId(e.target.value)}><option value="">No new movement</option>{snapshot.data.events.map(event => <option value={event.id} key={event.id}>{event.date} · {event.title}</option>)}</select></label>
        <div className="momentumDate">Reviewed {draft.reviewedAt?.slice(0,10)||'Not yet'} · Moved {draft.lastMovementAt?.slice(0,10)||'Not recorded'}</div>
      </div><div className="initiativeActions"><button type="button" className="btn btnGhost" disabled={saving} onClick={() => {setDraft(null);setError('');}}>Cancel</button>{draft.status==='proposal' ? <button type="button" className="btn btnPrimary" disabled={saving} onClick={() => void save(true)}>Accept initiative</button> : null}<button className="btn btnPrimary" type="submit" disabled={saving}>{saving?'Saving…':'Save review'}</button></div>
    </form></div> : null}
    {reference ? <div className="modalOverlay"><div className="notesModalCard" role="dialog" aria-modal="true" aria-label={reference.title}><div className="notesModalHeader"><h2>{reference.title}</h2></div><div className="notesModalBody"><p className="workReferenceText">{reference.text}</p><button className="btn" onClick={() => setReference(null)}>Close</button></div></div></div> : null}
  </section>;
}
