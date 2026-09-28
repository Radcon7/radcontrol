// Real native controls backed by the O2 private owner; all data belongs to this fixture.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import { nativeWidthContract, assertWidthReceipt } from './native_width_contract.mjs';
import { assertNativeWorkReadiness, assertNativeWorkRecovery, readinessInventory } from './native_work_readiness.mjs';
export async function runWave2aAcceptance({fixture,base,sessionId,request,click,eventually,mode,expectBridge=false}) {
  const width = {...nativeWidthContract(mode), observations:[]};
  const workFile=path.join(fixture.o2Root,'.state/radcontrol-operator/work/work.json');
  const legacy=await readFile(fixture.empireTodoPath);
  const command=(operation,value,revision)=>{
    const args=operation?['mutate-stdin']:['list'];
    const result=spawnSync('python3',[path.join(fixture.o2Root,'scripts/o2_operator_work.py'),...args],{encoding:'utf8',timeout:20000,
      env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root,PYTHONDONTWRITEBYTECODE:'1'},
      input:operation?JSON.stringify({expectedRevision:revision,operation,value}):undefined});
    assert.equal(result.status,0,result.stdout+result.stderr);return JSON.parse(result.stdout);
  };
  const exec=(script,args=[])=>request(base,`/session/${sessionId}/execute/sync`,'POST',{script,args});
  const tap=selector=>click(base,sessionId,selector);
  let state=command();
  const readiness=[];
  const runtimeOptions={fixture,base,sessionId,request,click,eventually,mode};
  if (expectBridge) {
    const before=await readinessInventory(path.dirname(workFile));
    await assertNativeWorkReadiness({...runtimeOptions,state:'bridge'});
    assert.deepEqual(await readinessInventory(path.dirname(workFile)),before,'bridge diagnostics cannot create private authority');
    readiness.push('bridge-ready');
    assert.equal(state.authority,'legacy-readonly'); assert.equal(state.revision,0);
    assert.equal(state.data.initiatives.length,0);
    await tap('[data-testid="tab-overview"]');
    await eventually(async()=>assert.match(await exec('return document.body.innerText;'),/Work is temporarily read-only/),'bridge notice');
    assert.equal(await exec('return document.querySelectorAll(".overview .momentumRow").length;'),0);
    await tap('[data-testid="tab-work"]');
    for (const mode of ['tasks','initiatives','timeline']) {
      await tap(`[data-testid="work-mode-${mode}"]`);
      await eventually(async()=>assert.ok(await exec('return !!document.querySelector("[data-testid=work-bridge-notice]");')),'readable bridge work');
      assert.equal(await exec('return [...document.querySelectorAll(".empireTodoShell textarea,.empireTodoShell input[type=checkbox]")].filter(e=>!e.disabled&&!e.readOnly).length;'),0);
    }
    await tap('[data-testid="tab-projects"]');
    await eventually(async()=>assert.equal(await exec('return document.querySelector("[data-testid=project-notes]")?.readOnly;'),true),'bridge notes read-only');
    assert.equal(command().revision,0,'listing never activates');
  }
  if (state.authority === 'legacy-readonly') {
    const activated=spawnSync('python3',['-c','from o2_operator_work import store,import_legacy; store().activate(import_legacy)'],{
      encoding:'utf8',env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root,PYTHONPATH:path.join(fixture.o2Root,'scripts'),PYTHONDONTWRITEBYTECODE:'1'}});
    assert.equal(activated.status,0,activated.stdout+activated.stderr); state=command();
  }
  assert.equal(state.authority,'private');
  const activeBefore=await readinessInventory(path.dirname(workFile));
  await assertNativeWorkReadiness({...runtimeOptions,state:'private'});
  assert.deepEqual(await readinessInventory(path.dirname(workFile)),activeBefore,'active diagnostics cannot mutate private authority');
  readiness.push('private-ready');
  await tap('[data-testid="tab-projects"]');
  assert.equal(state.data.initiatives.length,6,'only six explicit proposals, never a repo-derived portfolio');
  state=command('event.create',{title:'Wave 2A fixture accepted',date:'2026-09-20',category:'Acceptance fixture',notes:'Test-owned meaningful movement'},state.revision);
  const event=state.data.events.find(e=>e.id===state.recordId);
  for(const [i,original] of [...state.data.initiatives].entries()) {
    const row={...original,status:i===4?'proposal':i===5?'paused':i===1?'maintenance':'active',
      nextMove:i===3?'':i===2?'Review the content base':i===0?'Review the next acceptance slice':'Review the next proven pattern',
      blocker:i===2?'Content review with Charlie':'',pinned:i===0||i===2,
      progress:i===0?{method:'operator-assessed',percent:42,basis:'Explicit test operator assessment',assessedAt:''}:{method:'unassessed',percent:null,basis:'',assessedAt:''},
      movementEventId:i===0?event.id:''};
    state=command('initiative.save',row,state.revision);
  }
  const evidence=process.env.RADCONTROL_WAVE2A_EVIDENCE_DIR || path.join(fixture.tempRoot,'wave2a');
  await mkdir(evidence,{recursive:true,mode:0o700});
  async function shot(name) {
    await new Promise(resolve=>setTimeout(resolve,350));
    await exec('return document.documentElement.getBoundingClientRect().width;');
    await writeFile(path.join(evidence,name+'.png'),Buffer.from(await request(base,`/session/${sessionId}/screenshot`),'base64'),{mode:0o600});
  }
  async function set(selector,value) {
    await eventually(async()=>assert.ok(await exec('const e=document.querySelector(arguments[0]);return !!e&&!e.disabled;',[selector])),`control ready: ${selector}`);
    await exec(`const e=document.querySelector(arguments[0]);if(!e)throw Error('control missing');const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,arguments[1]);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));`,[selector,value]);
  }
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1100});
  await tap('[data-testid="tab-overview"]');
  await eventually(async()=>assert.equal(await exec('return document.querySelectorAll(".overview .momentumRow").length;'),6),'six native Momentum rows');
  const view=await exec(`return {text:document.querySelector('.overview').innerText,rails:[...document.querySelectorAll('.overview .momentumRail')].map(e=>({value:e.getAttribute('aria-valuenow'),width:e.getBoundingClientRect().width,available:e.closest('.momentumBody').getBoundingClientRect().width})),ongoing:document.querySelector('[data-testid=momentum-o2-automation]').innerText,unassessed:document.querySelector('[data-testid=momentum-dqotd-launch]').innerText};`);
  assert.equal(view.rails.length,1);assert.equal(view.rails[0].value,'42');assert.ok(view.rails[0].width>view.rails[0].available*.7);
  assert.match(view.text,/What Needs You[\s\S]*Set a Next Move/);assert.match(view.text,/Next Moves[\s\S]*Recent Movement/);
  assert.match(view.text,/Wave 2A fixture accepted/);assert.match(view.text,/System health · Security/);
  assert.match(view.unassessed,/Unassessed[\s\S]*Blocked/);assert.doesNotMatch(view.unassessed,/%/);assert.doesNotMatch(view.ongoing,/%/);
  width.observations.push({requested:width.widths[0],observed:await exec('return innerWidth;')});
  await shot('overview-normal');
  await exec("document.querySelector('.overviewLower').scrollIntoView({block:'end'});");await shot('overview-movement-and-next');
  await exec("document.querySelector('.overview').scrollTop=0;");
  await tap('[aria-label="Open RadControl command center in Work"]');
  await set('[aria-label="Initiative title"]','Command center fixture reviewed');
  await set('[aria-label="Initiative Next Move"]','Review the governed candidate');
  await set('[aria-label="Assessed percent"]','47');
  await set('[aria-label="Assessment basis"]','Operator explicitly reviewed the native fixture');
  await tap('.initiativeActions button[type=submit]');
  await eventually(async()=>{
    const saved=JSON.parse(await readFile(workFile,'utf8')).data.initiatives[0];
    assert.equal(saved.title,'Command center fixture reviewed');assert.equal(saved.progress.percent,47);assert.equal(saved.nextMove,'Review the governed candidate');assert.equal(saved.lastMovementAt,'2026-09-20');
    assert.equal(await exec('return document.querySelectorAll(".initiativeEditor").length;'),0);
  },'native review saved through the private CAS owner');
  // Proposal acceptance is an explicit control, not an import side effect.
  await tap('[aria-label="Review Company foundation"]');
  await tap('.initiativeActions button[type=button].btnPrimary');
  await eventually(async()=>assert.equal(JSON.parse(await readFile(workFile,'utf8')).data.initiatives[4].status,'active'),'explicit proposal acceptance');
  await tap('[data-testid="momentum-radcontrol-evolution"] .momentumRefs button');
  await eventually(async()=>assert.ok(await exec('return !!document.querySelector(".todoDetail");')),'task reference selects actual Work task');
  await tap('[data-testid="tab-overview"]');
  await tap(`.overviewEvent[data-event-id="${event.id}"]`);
  await eventually(async()=>assert.ok(await exec('return !!document.querySelector(arguments[0]);',[`.timelineEntryRow[data-event-id="${event.id}"]`])),'Timeline reference selects event');
  await tap('[data-testid="tab-overview"]');
  for(const requested of width.widths.slice(1)) {
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:requested,height:1000});
    await exec("document.querySelector('.overview').scrollTop=0;");
    const geometry=await exec(`const e=document.querySelector('.overview');return {width:innerWidth,scroll:e.scrollWidth,client:e.clientWidth,rows:[...document.querySelectorAll('.overview .momentumRow')].map(r=>({right:r.getBoundingClientRect().right,left:r.getBoundingClientRect().left}))};`);
    width.observations.push({requested,observed:geometry.width});assert.ok(geometry.scroll<=geometry.client+1,'Overview has no horizontal overflow');
    assert.ok(geometry.rows.every(r=>r.left>=0&&r.right<=geometry.width));await shot('overview-'+requested);
  }
  assertWidthReceipt(width,mode);
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1000});
  await tap('[data-testid="tab-work"]');
  for(const [mode,name,selector] of [['tasks','tasks-private','.empireTodoRow'],['initiatives','initiatives-private','.workInitiatives'],['timeline','timeline-private','.timelineFeed']]) {
    await tap(`[data-testid="work-mode-${mode}"]`);
    await eventually(async()=>assert.ok(await exec('return !!document.querySelector(arguments[0]);',[selector])),name);
    await shot(name);
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:width.widths[1],height:1000});await shot(name+'-'+width.widths[1]);
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1000});
  }
  assert.deepEqual(await readFile(fixture.empireTodoPath),legacy,'native work edits must not touch tracked legacy records');
  console.error("[native Work] projection, initiative review and responsive surfaces passed");
  const taskProgress = await runTaskProgressAcceptance({command,exec,tap,set,shot,request,base,sessionId,eventually,width,workFile});
  assert.deepEqual(await readFile(fixture.empireTodoPath),legacy,'task assessment never writes legacy records');
  console.error("[native Work] task progress, native keyboard/drag and conflict recovery passed");
  const round3 = await runRound3Acceptance({command,exec,tap,set,shot,request,base,sessionId,eventually,width,workFile});
  console.error("[native Work] Round 3 relationships, deep links and context passed");
  readiness.push(...await assertNativeWorkRecovery(runtimeOptions));
  const result={ok:true,width,bridgeReadOnly:expectBridge,readiness,taskProgress,round3,checks:['overview','six-momentum-rows','assessed-unassessed-ongoing','blocked-missing-next','needs-you','explicit-pins','meaningful-events','native-review-save','explicit-proposal-acceptance','task-reference','timeline-reference',width.kind,'migrated-work-surfaces','legacy-unchanged'],evidence};
  await writeFile(path.join(evidence,'acceptance.json'),JSON.stringify(result)+'\n',{mode:0o600});return result;
}

async function runTaskProgressAcceptance({command,exec,tap,set,shot,request,base,sessionId,eventually,width,workFile}) {
  let state=command(); const initiatives=structuredClone(state.data.initiatives);
  const {progress:ignored,...template}=state.data.tasks[0];
  const fixtures=[['15','In Progress',15],['45','In Progress',45],['72','In Progress',72],['blocked','Blocked',72],['unassessed','In Progress',null],['done','Complete',100]];
  for(const [id,status,percent] of fixtures) {
    const task={...template,id:`wave2b-${id}`,title:`Wave 2B ${id}`,status,category:'Now',currentState:'',nextActions:'Review the next proven result',dependencies:status==='Blocked'?'Await fixture approval':'',acceptanceCriteria:''};
    if(percent!==null)task.progress={percent,method:'operator',reviewedAt:''};
    state=command('task.save',task,state.revision);
  }
  const read=async()=>JSON.parse(await readFile(workFile,'utf8'));
  const task=async id=>(await read()).data.tasks.find(r=>r.id===`wave2b-${id}`);
  const row=id=>`[data-testid="empire-todo-item-wave2b-${id}"]`;
  async function open() {
    await tap('[data-testid="tab-projects"]');await tap('[data-testid="tab-work"]');await tap('[data-testid="work-mode-tasks"]');await tap('[data-testid="task-view-now"]');
    await eventually(async()=>assert.ok(await exec('return !!document.querySelector(arguments[0]);',[row('15')])),'task progress reload');
    await set('[aria-label="Find tasks"]','Wave 2B');
  }
  await open();
  for(const [id,status,percent] of fixtures.filter(r=>r[0]!=='done')) {
    const observed=await exec('const r=document.querySelector(arguments[0]);return {text:r.innerText,range:r.querySelector("input[type=range]")?.value??null};',[row(id)]);
    assert.match(observed.text,new RegExp(status==='Blocked'?'Blocked':'In Progress','i'));
    if(percent===null) {assert.match(observed.text,/Unassessed/);assert.doesNotMatch(observed.text,/%/);assert.equal(observed.range,null);}
    else {assert.match(observed.text,new RegExp(`${percent}%`));assert.equal(Number(observed.range),percent);}
  }
  const observations=[];
  for(const requested of width.widths) {
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:requested,height:1100});
    const geometry=await exec(`return {width:innerWidth,rows:[...document.querySelectorAll('.empireTodoRow')].map(r=>({left:r.getBoundingClientRect().left,right:r.getBoundingClientRect().right,available:r.querySelector('.taskProgressContent').clientWidth,track:r.querySelector('.progressRailTrack')?.clientWidth,scroll:r.scrollWidth,client:r.clientWidth}))};`);
    observations.push({requested,observed:geometry.width});assert.equal(geometry.rows.length,5);
    for(const r of geometry.rows){assert.ok(r.left>=0&&r.right<=geometry.width);assert.ok(r.scroll<=r.client+1);if(r.track)assert.ok(r.track>r.available*.7,'dominant full-width task rail');}
    await shot(`wave2b-progress-${requested}`);
  }
  assertWidthReceipt({...width,observations},width.kind==='production-supported-width'?'production':'e2e');
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1100});
  await exec('document.querySelector(arguments[0]).scrollIntoView({block:"end"});',[row('blocked')]);
  await shot('wave2b-blocked-and-unassessed');
  await tap('[data-testid="task-view-completed"]');
  await eventually(async()=>assert.match(await exec('return document.querySelector(arguments[0])?.innerText;',[row('done')]),/100%/),'Done is 100');
  assert.equal(await exec('return document.querySelector(arguments[0]).querySelectorAll("input[type=range]").length;',[row('done')]),0);
  await shot('wave2b-done-100');await tap('[data-testid="task-view-now"]');
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1100});
  await tap('[aria-label="Set progress for Wave 2B unassessed"]');
  const number='[aria-label="Percent for Wave 2B unassessed"]', range='[aria-label="Progress for Wave 2B unassessed"]';
  assert.equal(await exec('return document.querySelector(arguments[0]).value;',[number]),'');
  const before=(await read()).revision;
  await set(number,'0');assert.equal((await read()).revision,before,'typing previews without saving');
  await exec('document.querySelector(arguments[0]).dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));',[number]);
  await eventually(async()=>assert.equal((await task('unassessed')).progress?.percent,0),'explicit zero saved');
  assert.equal((await read()).revision,before+1);
  await exec('document.querySelector(arguments[0]).focus();',[range]);
  const element=await request(base,`/session/${sessionId}/element`,'POST',{using:'css selector',value:range});
  await request(base,`/session/${sessionId}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/value`,'POST',{text:'\uE014',value:['\uE014']});
  await eventually(async()=>assert.equal((await task('unassessed')).progress.percent,1),'native keyboard assessment');
  const dragBefore=(await read()).revision;
  const rect=await exec('const r=document.querySelector(arguments[0]);r.scrollIntoView({block:"center"});const b=r.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};',[range]);
  const actions=async actions=>request(base,`/session/${sessionId}/actions`,'POST',{actions:[{type:'pointer',id:'progress-pointer',parameters:{pointerType:'mouse'},actions}]});
  await actions([{type:'pointerMove',duration:0,x:Math.round(rect.x+10+(rect.width-20)*.01),y:Math.round(rect.y+rect.height/2)},{type:'pointerDown',button:0},{type:'pointerMove',duration:200,x:Math.round(rect.x+10+(rect.width-20)*.72),y:Math.round(rect.y+rect.height/2)}]);
  assert.equal((await read()).revision,dragBefore,'dragging never continuously writes');
  await actions([{type:'pointerUp',button:0}]);
  await eventually(async()=>assert.equal((await read()).revision,dragBefore+1),'pointer release commits once');
  const dragged=(await task('unassessed')).progress.percent;assert.ok(dragged>=70&&dragged<=74);
  await open();assert.equal(await exec('return Number(document.querySelector(arguments[0]).value);',[range]),dragged);
  state=command();command('task.save',{...state.data.tasks.find(r=>r.id==='wave2b-15'),notes:'Independent fixture writer'},state.revision);
  const conflictBefore=await read();await set(number,'33');
  await exec('document.querySelector(arguments[0]).dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));',[number]);
  await eventually(async()=>assert.match(await exec('return document.querySelector(".panelError")?.innerText;'),/Work changed in another editor[\s\S]*draft is retained/),'stale assessment rejected');
  assert.deepEqual(await read(),conflictBefore);assert.equal(await exec('return document.querySelector(arguments[0]).value;',[number]),'33','conflicting draft retained');
  await tap('.panelError button');await eventually(async()=>assert.equal(await exec('return Number(document.querySelector(arguments[0])?.value);',[range]),dragged),'explicit conflict reload');
  assert.deepEqual((await read()).data.initiatives,initiatives,'task assessments never change initiatives');
  return {ok:true,checks:['15-45-72','blocked-72','unassessed','done-100','full-width','native-keyboard','drag-commit-on-release','explicit-zero','save-reload','revision-conflict','separate-initiatives'],width:{...width,observations}};
}

async function runRound3Acceptance({command,exec,tap,set,shot,request,base,sessionId,eventually,width,workFile}) {
  const read=async()=>JSON.parse(await readFile(workFile,'utf8'));
  const task=async id=>(await read()).data.tasks.find(r=>r.id===id);
  const a='wave2b-15', b='wave2b-45';
  await tap('[data-testid="tab-overview"]');
  await eventually(async()=>assert.match(await exec('return document.querySelector("[data-testid=attention-wave2b-blocked]")?.innerText;'),/Wave 2B blocked/),'blocked task always in Overview');
  assert.doesNotMatch(await exec('return document.querySelector(".overview").innerText;'),/No recorded action needs attention|No blocked (?:Work|tasks) recorded/);
  await tap('[data-testid="attention-wave2b-blocked"]');
  await eventually(async()=>assert.equal(await exec('return document.querySelector("[aria-label=\\\"Task title\\\"]")?.value;'),'Wave 2B blocked'),'blocked deep link selects detail');
  assert.equal(await exec('return document.querySelector("[data-testid=task-view-blocked]").getAttribute("aria-pressed");'),'true');
  await tap('[data-testid="task-view-all"]');await set('[aria-label="Find tasks"]','Wave 2B');
  await tap(`[data-testid="empire-todo-select-${a}"]`);
  async function relationships(){await exec('const e=document.querySelector(".workPanel:not([hidden]) .workRelationships");e.open=true;');}
  await relationships();
  const projects=await exec('return [...document.querySelectorAll(".todoDetail .workRelationships input[aria-label^=\\\"Project \\\"]")].map(e=>e.getAttribute("aria-label"));');
  assert.ok(projects.length>=2,'registered fixture projects available');
  const saveSelector='.todoDetail .workRelationships .btnPrimary';
  async function saveTask(count){await tap(saveSelector);await eventually(async()=>assert.equal((await task(a)).projectKeys?.length,count),'explicit project assignment');await relationships();}
  await tap(`.workPanel:not([hidden]) [aria-label="${projects[0]}"]`);await saveTask(1);
  await tap(`.workPanel:not([hidden]) [aria-label="${projects[1]}"]`);await saveTask(2);
  await tap('[aria-label="Dependencies: Wave 2B 45"]');await tap(saveSelector);
  await eventually(async()=>assert.deepEqual((await task(a)).dependsOnTaskIds,[b]),'explicit dependency');await relationships();
  assert.equal(await exec('return document.querySelectorAll("[aria-label=\\\"Dependencies: Wave 2B 15\\\"]").length;'),0,'self dependency is not offered');
  await tap(`.workPanel:not([hidden]) [aria-label="${projects[0]}"]`);await tap(`.workPanel:not([hidden]) [aria-label="${projects[1]}"]`);await saveTask(0);
  assert.deepEqual((await task(a)).dependsOnTaskIds,[b]);
  // A relationship draft survives normal navigation without an implicit write.
  const beforeDraft=(await read()).revision;await tap(`.workPanel:not([hidden]) [aria-label="${projects[0]}"]`);
  await tap('[data-testid="work-mode-timeline"]');await tap('[data-testid="work-mode-tasks"]');
  await eventually(async()=>assert.equal(await exec('return document.querySelector("[aria-label=\\\"Task title\\\"]")?.value;'),'Wave 2B 15'),'selection retained');await relationships();
  assert.equal(await exec('return document.querySelector(arguments[0]).checked;',[`[aria-label="${projects[0]}"]`]),true);assert.equal((await read()).revision,beforeDraft);
  await tap('.todoDetail .workRelationships .btnGhost');
  await tap(`[data-testid="empire-todo-select-${b}"]`);await relationships();
  await tap('[aria-label="Dependencies: Wave 2B 15"]');const beforeCycle=await read();await tap(saveSelector);
  await eventually(async()=>assert.match(await exec('return document.querySelector(".workTasks .panelError")?.innerText;'),/cycle/i),'cycle rejected visibly');assert.deepEqual(await read(),beforeCycle);
  assert.equal(await exec('return document.querySelector("[aria-label=\\\"Dependencies: Wave 2B 15\\\"]").checked;'),true,'rejected draft retained');
  await tap('.workTasks .panelError button');await eventually(async()=>assert.equal(await exec('return document.querySelectorAll(".workTasks .panelError").length;'),0),'explicit reload');
  await tap('[data-testid="work-mode-initiatives"]');
  const initial=(await read()).data.initiatives[0];
  await tap(`[aria-label="Review ${initial.title}"]`);await relationships();
  await tap(`.workPanel:not([hidden]) [aria-label="${projects[0]}"]`);
  const relation='[aria-label="Related tasks: Wave 2B 15"]';
  if(!await exec('return document.querySelector(arguments[0]).checked;',[relation]))await tap(relation);
  await tap('.initiativeEditor .workRelationships .btnPrimary');
  await eventually(async()=>assert.ok((await read()).data.initiatives[0].taskIds.includes(a)),'initiative owns membership');
  await set('[aria-label="Initiative title"]','Round 3 explicit initiative review');await tap('.initiativeActions button[type=submit]');
  await eventually(async()=>assert.equal((await read()).data.initiatives[0].title,'Round 3 explicit initiative review'),'ordinary initiative review');
  const saved=(await read()).data.initiatives[0];assert.equal(saved.projectKeys.length,1);assert.deepEqual(saved.eventIds,initial.eventIds);
  assert.ok((await read()).data.tasks.every(t=>!Object.hasOwn(t,'initiativeIds')));
  await tap('[data-testid="work-mode-tasks"]');await tap('[data-testid="task-view-now"]');await set('[aria-label="Find tasks"]','Wave 2B 15');
  await tap('[aria-label="Complete Wave 2B 15"]');await tap('[data-testid="empire-todo-complete-without-timeline"]');
  await eventually(async()=>assert.match(await exec('return document.querySelector(".workConfirmation")?.innerText;'),/Just completed[\s\S]*100%/),'just completed stays visible');
  await eventually(async()=>assert.equal(await exec('return document.querySelector("[data-testid=empire-todo-item-wave2b-15] [role=progressbar]")?.getAttribute("aria-valuenow");'),'100'),'completed rail remains 100');
  await tap('[data-testid="task-view-all"]');await set('[aria-label="Find tasks"]','');
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:width.widths[1],height:800});
  const scrollBefore=await exec('const e=document.querySelector("[data-testid=tasks-scroller]");e.scrollTop=500;return e.scrollTop;');assert.ok(scrollBefore>0);
  await tap('[data-testid="work-mode-timeline"]');await tap('[data-testid="work-mode-tasks"]');
  await eventually(async()=>assert.ok(await exec('return document.querySelector("[data-testid=tasks-scroller]").scrollTop;')>=scrollBefore-2),'task scroll restored');
  const geometry=await exec('const t=document.querySelector("[data-testid=work-mode-tasks]"),s=document.querySelector("[data-testid=tasks-scroller]"),f=document.querySelector(".todoFilterRow");return {tab:t.getBoundingClientRect().top,filter:f.getBoundingClientRect().top,scroller:s.getBoundingClientRect().top,activeBorder:getComputedStyle(t).borderBottomColor};');
  assert.ok(geometry.tab>=0&&geometry.filter>=0&&geometry.scroller>geometry.filter);assert.equal(geometry.activeBorder,'rgba(0, 0, 0, 0)');
  for(const requested of [...new Set([...width.widths,1500])]) {
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:requested,height:1000});
    for(const view of ['all','now','blocked','completed']) {await tap(`[data-testid="task-view-${view}"]`);await shot(`round3-tasks-${view}-${requested}`);assert.ok(await exec('const e=document.querySelector(".workTasks");return e.scrollWidth<=e.clientWidth+1;'));}
    await tap('[data-testid="work-mode-initiatives"]');await shot(`round3-initiatives-${requested}`);await tap('[data-testid="work-mode-timeline"]');await shot(`round3-timeline-${requested}`);await tap('[data-testid="work-mode-tasks"]');
  }
  await exec('document.querySelector("[data-testid=work-mode-tasks]").focus();');
  const button=await request(base,`/session/${sessionId}/element`,'POST',{using:'css selector',value:'[data-testid=work-mode-tasks]'});
  await request(base,`/session/${sessionId}/element/${button['element-6066-11e4-a52e-4f735466cecf']}/value`,'POST',{text:'\uE014',value:['\uE014']});
  await eventually(async()=>assert.equal(await exec('return document.activeElement?.getAttribute("data-testid");'),'work-mode-initiatives'),'native keyboard tab focus');
  await tap('[data-testid="tab-notes"]');
  assert.deepEqual(await exec('return [...document.querySelectorAll("[data-testid^=notes-mode-]")].map(e=>e.textContent.trim());'),['My Notes','Empire Blueprint','O2 Knowledge']);
  for(const mode of ['notes','empire_blueprint','o2_knowledge']){await tap(`[data-testid="notes-mode-${mode}"]`);await shot(`round3-notes-${mode}`);}
  return {ok:true,checks:['blocked-overview-deep-link','no-false-all-clear','one-many-clear-projects','dependency-cycle-rejected','relationship-draft-retained','initiative-membership-preserved','just-completed-100','scroll-context','joined-tabs','native-keyboard','notes-preserved'],widths:[...new Set([...width.widths,1500])]};
}
