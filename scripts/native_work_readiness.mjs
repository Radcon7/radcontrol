// Real modal/IPC/O2 checks; only the already isolated fixture is changed.
import assert from 'node:assert/strict';
import {readFile, readdir, realpath, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function assertNativeWorkReadiness({base,sessionId,request,click,eventually,mode,state}) {
  await click(base,sessionId,'button[title^="Show the installed app build"]');
  try {
    await eventually(async()=>{
      const view=await request(base,`/session/${sessionId}/execute/sync`,'POST',{script:`
        const modal=document.querySelector('.runtimeModalCard');
        return {text:modal?.innerText,state:modal?.querySelector('[data-testid=runtime-work-readiness]')?.dataset.state};`,args:[]});
      assert.equal(view.state,state,'exact Work readiness state');
      assert.doesNotMatch(view.text,/CHECKING/);
      if(state==='recovery-error') {
        assert.match(view.text,/ATTENTION REQUIRED/);
        assert.doesNotMatch(view.text,/LIVE PRODUCT READY/);
        assert.match(view.text,/recovery|work_/i);
        assert.doesNotMatch(view.text,/Legacy compatibility bridge/,'failed authority must never fall back');
      } else {
        assert.match(view.text,mode==='production'?/LIVE PRODUCT READY/:/ATTENTION REQUIRED/);
        assert.match(view.text,state==='bridge'?/Legacy compatibility bridge[\s\S]*Not activated[\s\S]*Temporarily read-only/:/Private Work store[\s\S]*Activated[\s\S]*Enabled/);
      }
    },`native Runtime Diagnostics ${state}`);
  } finally {
    await click(base,sessionId,'.runtimeModalCard .btnGhost');
  }
}

export async function readinessInventory(root) {
  const files={};
  async function visit(dir) {
    for(const row of await readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,row.name);
      assert.ok(!row.isSymbolicLink(),'readiness fixture cannot contain symlinks');
      if(row.isDirectory())await visit(file);
      else files[path.relative(path.dirname(root),file)]=createHash('sha256').update(await readFile(file)).digest('hex');
    }
  }
  await visit(root);
  const marker=path.join(path.dirname(root),'operator-work.activated');
  try {files['operator-work.activated']=createHash('sha256').update(await readFile(marker)).digest('hex');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return files;
}

export async function assertNativeWorkRecovery(options) {
  const {fixture}=options;
  const root=path.join(fixture.o2Root,'.state/radcontrol-operator/work');
  const canonical=await realpath(root),temp=await realpath(fixture.tempRoot);
  assert.equal(canonical,root);assert.ok(root.startsWith(temp+path.sep),'only the owned fixture may be damaged');
  const file=path.join(root,'work.json'),marker=path.join(path.dirname(root),'operator-work.activated');
  const original=await readFile(file),before=await readinessInventory(root);
  const checked=[];
  for(const scenario of ['active-missing-store','active-corrupt-store','store-without-activation']) {
    const target=scenario==='store-without-activation'?marker:file;
    const retained=target+'.readiness-fixture-retained';
    if(scenario==='active-corrupt-store')await writeFile(file,'{"schemaVersion":999}\n');
    else await rename(target,retained);
    try {
      const failedBefore=await readinessInventory(root);
      await assertNativeWorkReadiness({...options,state:'recovery-error'});
      assert.deepEqual(await readinessInventory(root),failedBefore,'diagnostics must not repair, import or activate');
      checked.push(scenario);
    } finally {
      if(scenario==='active-corrupt-store')await writeFile(file,original);
      else await rename(retained,target);
    }
    assert.deepEqual(await readinessInventory(root),before,'fixture restored exactly');
  }
  await assertNativeWorkReadiness({...options,state:'private'});
  return checked;
}
