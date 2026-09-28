import { useCallback, useEffect, useState } from "react";
import { loadOverview } from "./workApi";
import { momentum, type OverviewResponse, type WorkTarget } from "./workModel";
import { ProgressRail } from "../common/ProgressRail";
import "./overview.css";
type Props = { onSecurity: () => void; onOpenWork: (target: WorkTarget) => void };
export function Overview({ onSecurity, onOpenWork }: Props) {
  const [snapshot,setSnapshot]=useState<OverviewResponse|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{setSnapshot(await loadOverview());}catch(e){setSnapshot(null);setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  return <section className="overview" data-testid="overview-workspace">
    <header className="overviewHeading"><h1>Overview</h1><button className="btn btnGhost btnCompact" onClick={onSecurity}>System health · Security</button></header>
    {error ? <div className="panelError" role="alert">{error} · Work coverage unavailable. <button className="btn" onClick={()=>void load()}>Retry</button></div> : null}
    {loading ? <p role="status">Loading current Work…</p> : snapshot ? <>
      <p className="workCoverage" data-testid="overview-coverage">{snapshot.coverage.complete ? "All configured Work sources loaded." : "Work is temporarily read-only while private storage is prepared. Partial Work coverage; private initiative authority is unavailable."} · Revision {snapshot.revision}</p>
      <div className="overviewCounts" aria-label="Task counts">{Object.entries(snapshot.taskCounts).map(([label,count])=><span key={label}>{label}: <b>{count}</b></span>)}</div>
      <section className="overviewAttention" aria-label="What Needs You"><h2>What Needs You</h2>
        <div className="attentionRows">{snapshot.attention.map(row=><button key={`${row.kind}-${row.id}`} data-testid={`attention-${row.id}`} onClick={()=>onOpenWork(row)}><strong>{row.title}</strong><span>{row.reason}</span></button>)}</div>
        {snapshot.coverage.complete && snapshot.taskCounts.Blocked===0 ? <p className="overviewQuiet">No blocked tasks recorded.</p> : null}
        {snapshot.coverage.complete && !snapshot.initiativeCounts.proposal ? <p className="overviewQuiet">No initiative approvals awaiting review.</p> : null}
      </section>
      <section aria-label="Major initiatives"><h2>Major initiatives</h2>{snapshot.initiatives.map(row=>{const progress=momentum(row);return <article className="momentumRow" key={row.id} data-testid={`momentum-${row.id}`}>
        <div className="momentumArea">{row.area} · {row.kind}</div><div className="momentumBody"><div className="momentumTitle"><h3>{row.title}</h3><span>{row.status}</span></div>
          {progress.percent!==null ? <div className="momentumAssessment"><ProgressRail trackClassName="momentumRail" percent={progress.percent} label={`${row.title} progress`} /><strong>{progress.percent}%</strong></div> : <div className="momentumState">{progress.label}</div>}
          <div className="momentumNext"><b>Next</b><span>{row.nextMove || "Not set"}</span></div>{row.blocker ? <div className="momentumBlocker"><b>Blocked</b>{row.blocker}</div> : null}
        </div><button className="btn btnGhost btnCompact" aria-label={`Open ${row.title} in Work`} onClick={()=>onOpenWork({kind:"initiative",id:row.id})}>Open in Work</button></article>;})}</section>
      <div className="overviewLower"><section aria-label="Next Actions"><h2>Next Actions & pinned Next Moves</h2>{snapshot.next.map(row=><button className="overviewMove" key={`${row.kind}-${row.id}`} onClick={()=>onOpenWork(row)}><strong>{row.title}</strong><span>{row.reason}</span></button>)}{!snapshot.next.length ? <p>No explicit next actions in current Work.</p> : null}</section>
        <section aria-label="Recent Movement"><h2>Recent Movement</h2>{snapshot.movement.map(event=><button className="overviewEvent" data-event-id={event.id} key={event.id} onClick={()=>onOpenWork({kind:"event",id:event.id})}><time>{(event.date||event.createdAt).slice(0,10)}</time><span>{event.title}</span></button>)}</section></div>
    </> : null}
  </section>;
}
