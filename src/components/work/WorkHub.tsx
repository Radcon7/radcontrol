import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EmpireTodoWorkspace } from "../notes/EmpireTodoWorkspace";
import { TimelineTab } from "../paste-tabs/TimelineTab";
import { InitiativesWorkspace } from "./InitiativesWorkspace";
import { runO2ParsedJson } from "../common/o2Client";
import type { WorkTarget } from "../overview/workModel";
import type { ProjectOption } from "./Relationships";
import "./work.css";
type Mode = "tasks" | "initiatives" | "timeline";
const MODES: Mode[] = ["tasks","initiatives","timeline"];
type Props = { active: boolean; target: WorkTarget | null; busy: boolean; registerBeforeTabChangeSaver: (fn: (() => Promise<boolean>) | null) => void };
export function WorkHub({ active,target,busy,registerBeforeTabChangeSaver }:Props) {
  const [mode,setMode]=useState<Mode>("tasks"),[visited,setVisited]=useState<Mode[]>(["tasks"]),[selection,setSelection]=useState<WorkTarget|null>(target);
  const [projects,setProjects]=useState<ProjectOption[]>([]),[projectError,setProjectError]=useState("");
  const savers=useRef<Partial<Record<Mode,()=>Promise<boolean>>>>({});
  const panels=useRef<Partial<Record<Mode,HTMLDivElement|null>>>({}),scroll=useRef<Partial<Record<Mode,number>>>({});
  const tasksSaver=useCallback((fn:(()=>Promise<boolean>)|null)=>{savers.current.tasks=fn||undefined;},[]);
  const initiativesSaver=useCallback((fn:(()=>Promise<boolean>)|null)=>{savers.current.initiatives=fn||undefined;},[]);
  const timelineSaver=useCallback((fn:(()=>Promise<boolean>)|null)=>{savers.current.timeline=fn||undefined;},[]);
  const save=useCallback(async()=>{
    const ok=await savers.current[mode]?.()??true;
    const node=panels.current[mode]?.querySelector<HTMLElement>(".workRecordScroller,.workspaceShell");
    if(ok&&node&&node.clientHeight)scroll.current[mode]=node.scrollTop;
    return ok;
  },[mode]);
  useEffect(()=>{if(active)registerBeforeTabChangeSaver(save);return()=>{if(active)registerBeforeTabChangeSaver(null);};},[active,save,registerBeforeTabChangeSaver]);
  useEffect(()=>{if(!active)return;void runO2ParsedJson<{ok:boolean;projects:ProjectOption[]}>("list_projects","Projects unavailable","Invalid project registry").then(r=>{if(!r.ok||!Array.isArray(r.projects))throw Error("Project registry unavailable");setProjects(r.projects);setProjectError("");}).catch(e=>setProjectError(String(e)));},[active]);
  function select(next:Mode){setVisited(v=>v.includes(next)?v:[...v,next]);setMode(next);}
  useEffect(()=>{if(target){setSelection(target);const next=target.kind==="task"?"tasks":target.kind==="initiative"?"initiatives":"timeline";setVisited(v=>v.includes(next)?v:[...v,next]);setMode(next);}},[target]);
  useLayoutEffect(()=>{
    if(active){
      const desired=scroll.current[mode]||0;
      const restore=()=>{const node=panels.current[mode]?.querySelector<HTMLElement>(".workRecordScroller,.workspaceShell");if(node)node.scrollTop=desired;};
      restore();const frame=requestAnimationFrame(restore);return()=>cancelAnimationFrame(frame);
    }
  },[active,mode]);
  async function change(next:Mode){if(next===mode)return true;if(await save()){select(next);return true;}return false;}
  async function open(next:WorkTarget){if(await save()){setSelection({...next,nonce:Date.now()});select(next.kind==="task"?"tasks":next.kind==="initiative"?"initiatives":"timeline");}}
  return <section className="workspaceHubWrap workHub" data-testid="work-workspace">
    <div className="workspaceModeRow" role="tablist" aria-label="Work workspaces">{MODES.map((m,i)=><button key={m} role="tab" id={`work-tab-${m}`} aria-controls={`work-panel-${m}`} aria-selected={mode===m} tabIndex={mode===m?0:-1} className={`workspaceModeButton ${mode===m?"workspaceModeButtonActive":""}`} data-testid={`work-mode-${m}`} onClick={()=>void change(m)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const index=e.key==="Home"?0:e.key==="End"?2:(i+(e.key==="ArrowRight"?1:2))%3;void change(MODES[index]).then(changed=>{if(changed)document.getElementById(`work-tab-${MODES[index]}`)?.focus();});}}}>{m[0].toUpperCase()+m.slice(1)}</button>)}</div>
    <div className="workspaceHubBody workHubBody">{visited.map(m=><div key={m} hidden={mode!==m} role="tabpanel" id={`work-panel-${m}`} aria-labelledby={`work-tab-${m}`} className="workPanel" ref={el=>{panels.current[m]=el;}} onScrollCapture={e=>{const node=e.target as HTMLElement;if(node.matches(".workRecordScroller,.workspaceShell")&&active&&mode===m&&node.clientHeight>0)scroll.current[m]=node.scrollTop;}}>
      {m==="tasks"?<EmpireTodoWorkspace active={active&&mode===m} target={selection} busy={busy} projects={projects} projectError={projectError} onOpen={t=>void open(t)} registerBeforeTabChangeSaver={tasksSaver}/>:m==="initiatives"?<InitiativesWorkspace active={active&&mode===m} target={selection} projects={projects} projectError={projectError} onOpen={t=>void open(t)} registerBeforeTabChangeSaver={initiativesSaver}/>:<TimelineTab selectedEventNonce={selection?.nonce} active={active&&mode===m} selectedEventId={selection?.kind==="event"?selection.id:undefined} registerBeforeTabChangeSaver={timelineSaver}/>}
    </div>)}</div>
  </section>;
}
