// Real native controls backed by the O2 private owner; all data belongs to this fixture.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
export async function runWave2aAcceptance({fixture,base,sessionId,request,click,eventually}) {
  const workFile=path.join(fixture.o2Root,'.state/radcontrol-operator/work/work.json');
  const legacy=await readFile(fixture.empireTodoPath);
  const command=(operation,value,revision)=>{
    const args=operation?['mutate-stdin']:['list'];
    const result=spawnSync('python3',[path.join(fixture.o2Root,'scripts/o2_operator_work.py'),...args],{encoding:'utf8',timeout:20000,
      env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root,PYTHONDONTWRITEBYTECODE:'1'},
      input:operation?JSON.stringify({expectedRevision:revision,operation,value}):undefined});
    assert.equal(result.status,0,result.stdout+result.stderr);return JSON.parse(result.stdout);
  };
  await click(base,sessionId,'[data-testid="tab-projects"]');
  let state=command();
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
  const exec=(script,args=[])=>request(base,`/session/${sessionId}/execute/sync`,'POST',{script,args});
  const tap=selector=>click(base,sessionId,selector);
  const evidence=process.env.RADCONTROL_WAVE2A_EVIDENCE_DIR || path.join(fixture.tempRoot,'wave2a');
  await mkdir(evidence,{recursive:true,mode:0o700});
  async function shot(name) {
    await request(base,`/session/${sessionId}/execute/async`,'POST',{script:'const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(done,300)));',args:[]});
    await writeFile(path.join(evidence,name+'.png'),Buffer.from(await request(base,`/session/${sessionId}/screenshot`),'base64'),{mode:0o600});
  }
  async function set(selector,value) {
    await exec(`const e=document.querySelector(arguments[0]);if(!e)throw Error('control missing');const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,arguments[1]);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));`,[selector,value]);
  }
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1100});
  await tap('[data-testid="tab-overview"]');
  await eventually(async()=>assert.equal(await exec('return document.querySelectorAll(".momentumRow").length;'),6),'six native Momentum rows');
  const view=await exec(`return {text:document.querySelector('.overview').innerText,rails:[...document.querySelectorAll('.momentumRail')].map(e=>({value:e.getAttribute('aria-valuenow'),width:e.getBoundingClientRect().width,available:e.closest('.momentumBody').getBoundingClientRect().width})),ongoing:document.querySelector('[data-testid=momentum-o2-automation]').innerText,unassessed:document.querySelector('[data-testid=momentum-dqotd-launch]').innerText};`);
  assert.equal(view.rails.length,1);assert.equal(view.rails[0].value,'42');assert.ok(view.rails[0].width>view.rails[0].available*.7);
  assert.match(view.text,/What Needs You[\s\S]*Set a Next Move/);assert.match(view.text,/Next Moves[\s\S]*Recent Movement/);
  assert.match(view.text,/Wave 2A fixture accepted/);assert.match(view.text,/System health · Security/);
  assert.match(view.unassessed,/Unassessed[\s\S]*Blocked/);assert.doesNotMatch(view.unassessed,/%/);assert.doesNotMatch(view.ongoing,/%/);
  await shot('overview-normal');
  await exec("document.querySelector('.overviewLower').scrollIntoView({block:'end'});");await shot('overview-movement-and-next');
  await exec("document.querySelector('.overview').scrollTop=0;");
  await tap('[aria-label="Review RadControl command center"]');
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
  await eventually(async()=>assert.match(await exec('return document.querySelector("[role=dialog]").innerText;'),/Next Action/),'task reference opens actual task');
  await tap('[role=dialog] .notesModalBody button');
  await tap(`.overviewEvent[data-event-id="${event.id}"]`);await eventually(async()=>assert.match(await exec('return document.querySelector("[role=dialog]").innerText;'),/fixture accepted/),'Timeline reference opens event');await tap('[role=dialog] .notesModalBody button');
  for(const [width,name] of [[800,'overview-narrow'],[600,'overview-small']]) {
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width,height:1000});
    await exec("document.querySelector('.overview').scrollTop=0;");
    const geometry=await exec(`const e=document.querySelector('.overview');return {width:innerWidth,scroll:e.scrollWidth,client:e.clientWidth,rows:[...document.querySelectorAll('.momentumRow')].map(r=>({right:r.getBoundingClientRect().right,left:r.getBoundingClientRect().left}))};`);
    assert.ok(geometry.width<=width+2,'requested native narrow window');assert.ok(geometry.scroll<=geometry.client+1,'Overview has no horizontal overflow');
    assert.ok(geometry.rows.every(r=>r.left>=0&&r.right<=geometry.width));await shot(name);
  }
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1000});
  await tap('[data-testid="tab-notes"]');
  for(const [mode,name,selector] of [['empire_todo','todo-private','.empireTodoRow'],['progress','progress-private','.progressTaskList'],['timeline','timeline-private','.timelineFeed']]) {
    await tap(`[data-testid="notes-mode-${mode}"]`);
    await eventually(async()=>assert.ok(await exec('return !!document.querySelector(arguments[0]);',[selector])),name);
    await shot(name);
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:800,height:1000});await shot(name+'-narrow');
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1000});
  }
  assert.deepEqual(await readFile(fixture.empireTodoPath),legacy,'native work edits must not touch tracked legacy records');
  const result={ok:true,checks:['overview','six-momentum-rows','assessed-unassessed-ongoing','blocked-missing-next','needs-you','explicit-pins','meaningful-events','native-review-save','explicit-proposal-acceptance','task-reference','timeline-reference','narrow-800-600','migrated-work-surfaces','legacy-unchanged'],evidence};
  await writeFile(path.join(evidence,'acceptance.json'),JSON.stringify(result)+'\n',{mode:0o600});return result;
}
