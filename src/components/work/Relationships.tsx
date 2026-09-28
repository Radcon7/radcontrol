import { useEffect, useState } from "react";
export type RelationshipDraft = { projects: string[]; references: string[] };
export type ProjectOption = { key: string; label: string };
type Props = {
  draftCache: Map<string,RelationshipDraft>; recordKey: string;
  projects: ProjectOption[]; projectError: string; projectKeys?: string[];
  references: { id: string; title: string }[]; referenceIds?: string[]; referenceLabel: string;
  disabled?: boolean; onSave: (projects: string[], references: string[]) => Promise<boolean>;
};
export function Relationships({ draftCache, recordKey, projects, projectError, projectKeys = [], references, referenceIds = [], referenceLabel, disabled, onSave }: Props) {
  const [selectedProjects, setProjects] = useState(draftCache.get(recordKey)?.projects || projectKeys);
  const [selectedRefs, setRefs] = useState(draftCache.get(recordKey)?.references || referenceIds);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const toggle = (values: string[], key: string) => values.includes(key) ? values.filter(v => v !== key) : [...values, key];
  const dirty = JSON.stringify(selectedProjects) !== JSON.stringify(projectKeys) || JSON.stringify(selectedRefs) !== JSON.stringify(referenceIds);
  useEffect(() => { if(dirty) draftCache.set(recordKey,{projects:selectedProjects,references:selectedRefs}); else draftCache.delete(recordKey); },[dirty,draftCache,recordKey,selectedProjects,selectedRefs]);
  return <details className="workRelationships" data-testid="work-relationships">
    <summary>Relationships · {projectKeys.length ? projectKeys.join(", ") : "Unassigned"}</summary>
    {projectError ? <p role="alert">Projects unavailable: {projectError}</p> : null}
    <fieldset disabled={disabled || pending || !!projectError}><legend>Projects · explicit assignment</legend>
      <div className="workChoiceList">{projects.map(p => <label key={p.key}><input type="checkbox" aria-label={`Project ${p.label}`} checked={selectedProjects.includes(p.key)} onChange={() => setProjects(toggle(selectedProjects,p.key))} />{p.label}</label>)}</div>
      {!selectedProjects.length ? <span>Unassigned</span> : null}
    </fieldset>
    <fieldset disabled={disabled || pending}><legend>{referenceLabel}</legend>
      <input className="input" aria-label={`Find ${referenceLabel.toLowerCase()}`} placeholder="Find tasks" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="workChoiceList">{references.filter(r => selectedRefs.includes(r.id) || r.title.toLowerCase().includes(search.toLowerCase())).map(r => <label key={r.id}><input type="checkbox" aria-label={`${referenceLabel}: ${r.title}`} checked={selectedRefs.includes(r.id)} onChange={() => setRefs(toggle(selectedRefs,r.id))} />{r.title}</label>)}</div>
      {!selectedRefs.length ? <span>None recorded</span> : null}
    </fieldset>
    <button type="button" className="btn btnPrimary btnCompact" disabled={!dirty || disabled || pending || !!projectError} onClick={async () => {
      setPending(true); setMessage("");
      try { const ok=await onSave(selectedProjects, selectedRefs); if(ok)draftCache.delete(recordKey); setMessage(ok ? "Relationships saved" : "Relationships not saved. Review the error; your selections are retained."); }
      catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      finally { setPending(false); }
    }}>Save relationships</button>
    {dirty ? <button type="button" className="btn btnGhost btnCompact" disabled={pending} onClick={()=>{setProjects(projectKeys);setRefs(referenceIds);draftCache.delete(recordKey);}}>Discard relationship draft</button> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
