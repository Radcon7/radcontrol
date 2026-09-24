// One ordered integration path, executed unchanged by both release entrypoints.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nativeClick, assertWorkspace, settleWorkspace, assertFanResult, workspaceText, workspaceFixture } from './native_workspace.mjs';
import { assertSentinelHealth, assertSentinelDetails } from './native_sentinel_assertions.mjs';

const contract=JSON.parse(await readFile(new URL('./native_wave11_matrix.json',import.meta.url),'utf8')).orderedNavigation;
export const orderedWorkspaceRoute = contract.route;
export const workspaceRegressions = contract.regressions;

export function assertOrderedNavigation(result) {
  assert.equal(result?.ok,true,'ordered native navigation required');
  assert.deepEqual(result.route,orderedWorkspaceRoute,'candidate and installed must share the exact ordered route');
  assert.deepEqual(result.regressions,workspaceRegressions,'all wrong-workspace regressions required');
  assert.deepEqual(result.runs?.map(r=>({run:r.run,ok:r.ok})),Array.from({length:contract.runs},(_,i)=>({run:i+1,ok:true})),'five consecutive ordered passes required');
}

export async function runOrderedWorkspaceSequence({fixture,base,sessionId,request}) {
  const exec=(script,args=[])=>request(base,`/session/${sessionId}/execute/sync`,'POST',{script,args});
  const click=selector=>nativeClick(base,sessionId,selector);
  const state=path.join(fixture.o2Root,'wave11-fixture.json');
  const runs=[];
  async function sentinel() {
    await click('[data-testid="tab-sentinel"]');
    await click('[data-testid="security-mode-sentinel"]');
    await assertWorkspace(base,sessionId,'sentinel');
  }
  const decoy=async()=>exec(`const e=document.createElement('section');e.id='native-fan-decoy';
    e.innerText='DIAGNOSIS COMPLETE NO ISSUE FOUND Outcome retained in Sentinel history.';document.body.append(e);`);
  const removeDecoy=()=>exec("document.getElementById('native-fan-decoy')?.remove();");
  for(let run=1;run<=contract.runs;run++) {
    const started=new Date().toISOString(), token=`ordered-${run}`;
    workspaceFixture(base,sessionId,{phase:'ordered',fanFixture:token});
    await writeFile(state,JSON.stringify({phase:'healthy',fanFixture:token}));
    await click('[data-testid="tab-notes"]');
    await click('[data-testid="notes-mode-empire_todo"]');
    await assertWorkspace(base,sessionId,'todo');
    await click('[data-testid="notes-mode-progress"]');
    await assertWorkspace(base,sessionId,'progress');
    if(run===1) {
      await decoy();
      try {await assert.rejects(()=>assertFanResult(base,sessionId),/wrong or unsettled workspace sentinel/);}
      finally {await removeDecoy();}
    }
    await sentinel();
    if(run===1) {
      // A selected tab is insufficient until its real container is painted.
      await exec(`const e=document.querySelector('[data-testid="radcon-sentinel"]');e.hidden=true;setTimeout(()=>{e.hidden=false;},180);`);
      await settleWorkspace(base,sessionId,'sentinel',{timeoutMs:2000});
      await exec("document.querySelector('[data-testid=radcon-sentinel]').hidden=true;");
      try {await assert.rejects(()=>settleWorkspace(base,sessionId,'sentinel',{timeoutMs:250}),/navigation settle failed/);}
      finally {await exec("document.querySelector('[data-testid=radcon-sentinel]').hidden=false;");}
      await settleWorkspace(base,sessionId,'sentinel');
      await exec("document.querySelector('[data-testid=security-mode-sentinel]').setAttribute('aria-selected','false');");
      try {await assert.rejects(()=>assertFanResult(base,sessionId),/wrong or unsettled workspace sentinel/);}
      finally {await exec("document.querySelector('[data-testid=security-mode-sentinel]').setAttribute('aria-selected','true');");}
      await writeFile(state,JSON.stringify({phase:'healthy',requireFanFixture:true}));
      await click('[data-testid="sentinel-fans-loud"]');
      await decoy();
      try {await assert.rejects(()=>assertFanResult(base,sessionId,{timeoutMs:350}),/scoped Sentinel fan result missing/);}
      finally {await removeDecoy();}
      await writeFile(state,JSON.stringify({phase:'healthy',fanFixture:token}));
    }
    await click('[data-testid="sentinel-fans-loud"]');
    await assertFanResult(base,sessionId,{fixtureText:`Native fan fixture ${token}`});
    if(run===1) {
      await exec(`const e=document.querySelector('[data-testid=sentinel-fan-investigation-result]');
        window.__outsideFan={e,parent:e.parentElement,next:e.nextSibling};document.body.append(e);`);
      try {await assert.rejects(()=>assertFanResult(base,sessionId,{timeoutMs:250}),/scoped Sentinel fan result missing/);}
      finally {await exec('const f=window.__outsideFan;f.parent.insertBefore(f.e,f.next);delete window.__outsideFan;');}
      await assertFanResult(base,sessionId,{fixtureText:`Native fan fixture ${token}`});
    }
    await assertSentinelHealth(base,sessionId,{declaredCurrent:'HEALTHY',cardState:'HEALTHY',fixCount:0,reviewCount:0});
    await assertSentinelDetails(base,sessionId,false);
    await click('.sentinelAdvancedWorkspace > summary');
    await assertSentinelDetails(base,sessionId,true);
    await click('.sentinelAdvancedWorkspace > summary');
    await assertSentinelDetails(base,sessionId,false);
    await click('[data-testid="security-mode-empire_operations"]');
    assert.match(await workspaceText(base,sessionId,'empire_operations'),/OPERATIONAL TRUTH/);
    await click('[data-testid="security-mode-security_guardian"]');
    assert.match(await workspaceText(base,sessionId,'security_guardian'),/VISIBILITY NOW/);
    await click('button[title^="Show the installed app build"]');
    assert.match(await workspaceText(base,sessionId,'runtime'),/Runtime & Build/);
    await click('.runtimeModalCard .btnGhost');
    await click('[data-testid="tab-notes"]');
    await click('[data-testid="notes-mode-notes"]');
    await assertWorkspace(base,sessionId,'notes');
    if(run===1) {
      await decoy();
      try {await assert.rejects(()=>assertFanResult(base,sessionId),/wrong or unsettled workspace sentinel/);}
      finally {await removeDecoy();}
    }
    await sentinel();
    await assertSentinelHealth(base,sessionId,{declaredCurrent:'HEALTHY',cardState:'HEALTHY',fixCount:0,reviewCount:0});
    runs.push({run,ok:true,started,finished:new Date().toISOString(),fanFixture:token});
    await writeFile(path.join(fixture.tempRoot,`ordered-navigation-${run}.json`),JSON.stringify(runs.at(-1),null,2),{mode:0o600});
    console.error(`[native] ordered workspace sequence ${run}/5 passed`);
  }
  const result={ok:true,route:orderedWorkspaceRoute,regressions:workspaceRegressions,runs};
  assertOrderedNavigation(result);return result;
}
