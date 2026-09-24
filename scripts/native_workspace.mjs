// Native acceptance only. Product state is read, never used as test authority.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function request(base, route, method = 'GET', body) {
  const response = await fetch(`${base}${route}`, {signal:AbortSignal.timeout(30_000), method,
    headers:body ? {'content-type':'application/json'} : undefined, body:body ? JSON.stringify(body) : undefined});
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || payload.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(payload)}`);
  return payload.value;
}

const roots = {
  sentinel:'[data-testid="radcon-sentinel"]',
  empire_operations:'[data-testid="empire-operations-workspace"]',
  security_guardian:'[data-testid="security-guardian-workspace"]',
  progress:'[data-testid="empire-todo-workspace"][data-task-workspace="progress"]',
  todo:'[data-testid="empire-todo-workspace"][data-task-workspace="queued"]',
  notes:'[data-testid="my-notes-scratchpad"]', runtime:'.runtimeModalCard',
};
const anchors = {sentinel:'[data-testid="sentinel-current-now"]',empire_operations:'[data-testid="empire-operations-overview"]',
  security_guardian:'[data-testid="security-guardian-sources"]',progress:'.taskProgressRail',todo:'.empireTodoRow',
  notes:'textarea',runtime:'.btnGhost'};
const security = ['sentinel','empire_operations','security_guardian'];
const contexts = new Map();
const key = (base,id)=>`${base}/${id}`;
export function configureWorkspace(base,id,{evidenceDir,fixture={}}) {
  assert.ok(path.isAbsolute(evidenceDir));
  // Callers supply only bounded synthetic identity/phase labels, never payloads.
  for(const value of Object.values(fixture)) assert.match(String(value),/^[a-zA-Z0-9._:-]{1,100}$/);
  const context={evidenceDir,fixture,lastAction:null,previous:null,settled:null};
  contexts.set(key(base,id),context);return context;
}
function context(base,id) { const c=contexts.get(key(base,id));assert.ok(c,'native workspace evidence context required');return c; }
export function workspaceFixture(base,id,labels) {
  for(const value of Object.values(labels))assert.match(String(value),/^[a-zA-Z0-9._:-]{1,100}$/);
  Object.assign(context(base,id).fixture,labels);
}
const execute=(base,id,script,args=[])=>request(base,`/session/${id}/execute/sync`,'POST',{script,args});

// No arbitrary element text, values, URLs, outerHTML or operator record bodies.
const probeScript = `
  const roots=arguments[0], anchors=arguments[1], destination=arguments[2];
  const identity=e=>e ? {tag:e.tagName,id:e.dataset?.testid || null,role:e.getAttribute?.('role')} : null;
  const visible=e=>{if(!e)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);
    if(n.hidden||s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)return false;
    if(n instanceof HTMLDetailsElement&&!n.open&&!n.querySelector(':scope > summary')?.contains(e))return false;}
    const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const selected=()=>({top:[...document.querySelectorAll('.tabActive[data-testid]')].map(e=>e.dataset.testid),
    security:[...document.querySelectorAll('[data-testid="security-workspace"] [aria-selected="true"]')].map(e=>e.dataset.testid),
    notes:[...document.querySelectorAll('[data-testid^="notes-mode-"].workspaceModeButtonActive')].map(e=>e.dataset.testid)});
  if(!window.__nativeWorkspaceTrace){window.__nativeWorkspaceTrace={events:[],pointer:null};
    for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{
      const t=window.__nativeWorkspaceTrace;t.pointer={x:e.clientX,y:e.clientY};
      t.events.push({type,at:performance.now(),target:identity(e.target.closest('[data-testid],button,summary')||e.target),selected:selected()});
      t.events=t.events.slice(-32);
    },true);
  }
  const target=document.querySelector(roots[destination]);const rect=target?.getBoundingClientRect();
  const trace=window.__nativeWorkspaceTrace;const pointer=trace.pointer;
  const known=['CURRENT NOW','RECENT EVENTS','FAN INVESTIGATION','NO AUTOMATIC REPAIR AVAILABLE','FIX AVAILABLE','Outcome retained in Sentinel history.','OPERATIONAL TRUTH','VISIBILITY NOW','Runtime & Build'];
  return {destination,selected:selected(),retainedSecurityMode:sessionStorage.getItem('radcontrol.security.mode'),aria:[...document.querySelectorAll('[data-testid="security-workspace"] [role="tab"]')].map(e=>({id:e.dataset.testid,selected:e.getAttribute('aria-selected')})),
    containers:Object.fromEntries(Object.entries(roots).map(([name,selector])=>[name,{count:document.querySelectorAll(selector).length,visible:visible(document.querySelector(selector))}])),
    workPresent:!!document.querySelector('[data-testid="empire-todo-workspace"]'),
    targetVisible:visible(target),anchorPresent:visible(target?.querySelector(anchors[destination])),
    emptyWork: {visible:visible(target?.querySelector('.empireTodoList > .surfaceEmptyState')),
      count:target?.querySelector('.todoCount')?.innerText,
      loading:!!target?.querySelector('.timelineStatus'),error:!!target?.querySelector('[role=alert]')},
    ready:document.readyState==='complete',busy:!!target?.closest('[aria-busy="true"]')||!!target?.querySelector('[aria-busy="true"]'),
    bounds:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,
    focused:identity(document.activeElement),pointer,underPointer:pointer?identity(document.elementFromPoint(pointer.x,pointer.y)):null,
    events:trace.events,targetExcerpt:{labels:known.filter(s=>target?.innerText.includes(s)),
      nodes:target?[...target.querySelectorAll('[data-testid],h1,h2,h3,summary')].slice(0,32).map(identity):[],textRedacted:true}};
`;
export async function workspaceState(base,id,destination) {
  assert.ok(Object.hasOwn(roots,destination),'unsupported workspace');
  return execute(base,id,probeScript,[roots,anchors,destination]);
}
export function workAnchorPresent(state,destination) {
  if (state.anchorPresent) return true;
  const empty=state.emptyWork;
  return ['todo','progress'].includes(destination) && empty?.visible === true &&
    empty.count === '0 tasks' && empty.loading === false && empty.error === false;
}
export function workspaceConditions(state,destination) {
  const isSecurity=security.includes(destination), isWork=['todo','progress','notes'].includes(destination);
  const selected=state.selected;
  return {
    topSelected:destination==='runtime'||JSON.stringify(selected.top)===JSON.stringify([isSecurity?'tab-sentinel':'tab-notes']),
    subSelected:destination==='runtime'||(isSecurity?JSON.stringify(selected.security)===JSON.stringify([`security-mode-${destination}`]):
      JSON.stringify(selected.notes)===JSON.stringify([`notes-mode-${destination==='todo'?'empire_todo':destination}`])),
    consistentAria:!isSecurity||state.aria.length===3&&state.aria.every(row=>row.selected===(row.id===`security-mode-${destination}`?'true':'false')),
    uniqueContainer:state.containers[destination]?.count===1,
    targetVisible:state.targetVisible,anchorPresent:workAnchorPresent(state,destination),ready:state.ready,notBusy:!state.busy,
    noWorkSurface:!isSecurity||!state.workPresent,
    noOtherSecurity:!isSecurity||security.filter(s=>s!==destination).every(s=>state.containers[s]?.count===0),
    noSecuritySurface:!isWork||security.every(s=>state.containers[s]?.count===0),
    noOverlay:destination==='runtime'||state.containers.runtime?.count===0,
  };
}
export function assertWorkspaceState(state,destination) {
  const conditions=workspaceConditions(state,destination);
  assert.ok(Object.values(conditions).every(Boolean),`wrong or unsettled workspace ${destination}: ${JSON.stringify(conditions)}`);
  return conditions;
}
export async function captureWorkspaceFailure(base,id,destination,reason,state) {
  const c=context(base,id);
  destination ||= c.lastAction?.destination || c.settled || 'sentinel';
  await mkdir(c.evidenceDir,{recursive:true,mode:0o700});
  assert.equal(await realpath(c.evidenceDir),c.evidenceDir);
  assert.equal((await lstat(c.evidenceDir)).mode&0o077,0,'navigation evidence must be private');
  const directory=await mkdtemp(path.join(c.evidenceDir,'failure-'));
  state ||= await workspaceState(base,id,destination).catch(()=>null);
  const packet={timestamp:new Date().toISOString(),intendedDestination:destination,previous:c.previous,
    navigationAction:c.lastAction,fixture:c.fixture,reason,state,conditions:state?workspaceConditions(state,destination):null,
    screenshot:'redacted-layout.png'};
  // Preserve actual layout while masking all rendered text/media, including
  // arbitrary operator input. The packet above retains only stable UI labels.
  try {
    await execute(base,id,`const s=document.createElement('style');s.id='native-evidence-redaction';
      s.textContent='*,*::before,*::after {color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;background-image:none!important} img,video,canvas,svg {visibility:hidden!important}';document.head.append(s);`);
    await request(base,`/session/${id}/actions`,'POST',{actions:[{type:'pointer',id:'evidence-pointer',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:0,y:0,origin:'viewport'}]}]});
    const data=await request(base,`/session/${id}/screenshot`);
    await writeFile(path.join(directory,packet.screenshot),Buffer.from(data,'base64'),{flag:'wx',mode:0o600});
  } catch {packet.screenshot=null;packet.screenshotError='native screenshot unavailable';}
  finally {await execute(base,id,"document.getElementById('native-evidence-redaction')?.remove();").catch(()=>{});}
  await writeFile(path.join(directory,'navigation.json'),JSON.stringify(packet,null,2),{flag:'wx',mode:0o600});
  console.error(`[native] navigation evidence: ${directory}`);return directory;
}
export async function assertWorkspace(base,id,destination) {
  context(base,id);
  let state;
  try {
    state=await workspaceState(base,id,destination);assertWorkspaceState(state,destination);
    const selectedBefore=state.selected;
    await request(base,`/session/${id}/execute/async`,'POST',{script:'const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>done()));',args:[]});
    state=await workspaceState(base,id,destination);assertWorkspaceState(state,destination);
    assert.deepEqual(state.selected,selectedBefore,'workspace changed during assertion');return state;
  }
  catch(error){await captureWorkspaceFailure(base,id,destination,'workspace-proof',state).catch(()=>{});throw error;}
}
export async function settleWorkspace(base,id,destination,{timeoutMs=10_000}={}) {
  const c=context(base,id), deadline=Date.now()+timeoutMs;let previous,state;
  try {
  do {
    state=await workspaceState(base,id,destination);
    const conditions=workspaceConditions(state,destination);
    const signature=JSON.stringify({selected:state.selected,bounds:state.bounds});
    if(Object.values(conditions).every(Boolean)&&previous===signature){c.settled=destination;return state;}
    previous=Object.values(conditions).every(Boolean)?signature:null;
    await delay(50); // Bounded readiness polling, never a substitute for predicates.
  }while(Date.now()<deadline);
  } catch(error) {
    await captureWorkspaceFailure(base,id,destination,'navigation-probe-failed',state).catch(()=>{});throw error;
  }
  await captureWorkspaceFailure(base,id,destination,'navigation-settle-timeout',state);
  throw new Error(`navigation settle failed for ${destination}: ${JSON.stringify(workspaceConditions(state,destination))}`);
}
export async function workspaceText(base,id,destination,selector=roots[destination]) {
  await assertWorkspace(base,id,destination);
  return execute(base,id,`const root=document.querySelector(arguments[0]);
    const node=root?.matches(arguments[1])?root:root?.querySelector(arguments[1]);return node?.innerText||'';`,[roots[destination],selector]);
}
export async function assertFanResult(base,id,{fixtureText,timeoutMs=20_000}={}) {
  const deadline=Date.now()+timeoutMs;
  do {
    // Wrong workspace fails immediately, before reading or retrying content.
    const text=await workspaceText(base,id,'sentinel','[data-testid="sentinel-fan-investigation-result"]');
    if(/DIAGNOSIS COMPLETE[\s\S]*(NO ISSUE FOUND|WATCHING|NEEDS YOUR HELP|FIX AVAILABLE)[\s\S]*Outcome retained in Sentinel history/.test(text)
      &&(!fixtureText||text.includes(fixtureText)))return;
    await delay(100);
  }while(Date.now()<deadline);
  await captureWorkspaceFailure(base,id,'sentinel','scoped-fan-result-missing');
  throw new Error('scoped Sentinel fan result missing or does not match its fixture');
}
function destinationFor(selector,state) {
  for(const name of security)if(selector===`[data-testid="security-mode-${name}"]`)return name;
  if(selector==='[data-testid="tab-sentinel"]')return state.selected.security[0]?.replace('security-mode-','')||(security.includes(state.retainedSecurityMode)?state.retainedSecurityMode:'sentinel');
  for(const [mode,name] of [['empire_todo','todo'],['progress','progress'],['notes','notes']])if(selector===`[data-testid="notes-mode-${mode}"]`)return name;
  if(selector==='button[title^="Show the installed app build"]')return 'runtime';
  return null;
}
export async function nativeClick(base,id,selector) {
  const c=context(base,id),before=await workspaceState(base,id,'sentinel');
  const destination=destinationFor(selector,before);c.previous=before.selected;
  c.lastAction={selector,timestamp:new Date().toISOString(),destination};
  try {
    if(selector.includes('sentinel-')&&!selector.includes('tab-sentinel')&&!selector.includes('security-mode-'))await assertWorkspace(base,id,'sentinel');
    const deadline=Date.now()+10_000;let element;
    do {try {element=await request(base,`/session/${id}/element`,'POST',{using:'css selector',value:selector});break;}catch {await delay(50);}}while(Date.now()<deadline);
    assert.ok(element,'native click target missing');
    while(!await request(base,`/session/${id}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/enabled`)) {
      assert.ok(Date.now()<deadline,'native click target remains disabled');await delay(50);
    }
    await execute(base,id,'arguments[0].scrollIntoView({block:"center",inline:"center"});',[element]);
    await request(base,`/session/${id}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,'POST',{});
    if(destination)await settleWorkspace(base,id,destination);
  }catch(error){await captureWorkspaceFailure(base,id,destination||c.settled||'sentinel','native-click-or-navigation').catch(()=>{});throw error;}
}
