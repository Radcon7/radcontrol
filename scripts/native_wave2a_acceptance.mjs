// Retained private Work bridge/recovery checks now protect Project Notes.
// Work/Overview editors migrated to RadCloud; they are not RadControl gates.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {nativeWidthContract,assertWidthReceipt} from './native_width_contract.mjs';
import {assertNativeWorkReadiness,assertNativeWorkRecovery,readinessInventory} from './native_work_readiness.mjs';
import {assertFourTabApplication} from './native_four_tab_assertions.mjs';
export async function runWave2aAcceptance({fixture,base,sessionId,request,click,eventually,mode,expectBridge=false}) {
  assert.equal(expectBridge,true,'native bridge must be checked before activation');
  const root=path.join(fixture.o2Root,'.state/radcontrol-operator/work');
  const legacy=await readFile(fixture.empireTodoPath);
  const options={fixture,base,sessionId,request,click,eventually,mode};
  const before=await readinessInventory(root);
  await assertNativeWorkReadiness({...options,state:'bridge'});
  await click(base,sessionId,'[data-testid="tab-projects"]');
  await click(base,sessionId,'[aria-label="Projects workspaces"] button:nth-child(1)');
  const exec=(script,args=[])=>request(base,`/session/${sessionId}/execute/sync`,'POST',{script,args});
  await eventually(async()=>assert.equal(await exec('return document.querySelector("[data-testid=project-notes]")?.readOnly;'),true),'legacy bridge Project Notes read-only');
  assert.deepEqual(await readinessInventory(root),before,'bridge diagnostics cannot activate authority');
  const result=spawnSync('python3',['-c','from o2_operator_work import store,import_legacy; store().activate(import_legacy)'],{
    encoding:'utf8',env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root,PYTHONPATH:path.join(fixture.o2Root,'scripts'),PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stderr);
  const active=await readinessInventory(root);
  await assertNativeWorkReadiness({...options,state:'private'});
  assert.deepEqual(await readinessInventory(root),active,'diagnostics must not mutate private authority');
  const readiness=['bridge-ready','private-ready',...await assertNativeWorkRecovery(options)];
  const width={...nativeWidthContract(mode),observations:[]};
  await click(base,sessionId,'[data-testid="tab-notes"]');
  await click(base,sessionId,'[data-testid="notes-mode-notes"]');
  for(const requested of width.widths) {
    await request(base,`/session/${sessionId}/window/rect`,'POST',{width:requested,height:1000});
    const observed=await eventually(async()=>{
      const value=await exec('return window.innerWidth;');assert.ok(Math.abs(value-requested)<=2);return value;
    },'native window width');
    width.observations.push({requested,observed});
    assert.equal(await exec('const e=document.querySelector("[data-testid=my-notes-input]");return !!e&&e.getBoundingClientRect().width>0;'),true);
  }
  assertWidthReceipt(width,mode);
  await request(base,`/session/${sessionId}/window/rect`,'POST',{width:1650,height:1000});
  const fourTab=await assertFourTabApplication({base,sessionId,eventually});
  assert.deepEqual(await readFile(fixture.empireTodoPath),legacy,'native retained controls must preserve legacy task data');
  return {ok:true,bridgeReadOnly:true,readiness,width,fourTab};
}
