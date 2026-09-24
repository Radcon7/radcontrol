import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectWork, assertWorkDiagnostics, assertWorkRows, snapshotWork, assertWorkUnchanged,
  taskLane, workReceipt } from '../scripts/native_work_authority.mjs';
import { empireTodoLane } from '../src/components/notes/empireTodoModel.ts';

const statuses = ['Backlog','Planned','In Progress','Blocked','Complete','Deferred','Historical state'];
function fixture(count, revision=2) {
  return {revision,data:{tasks:Array.from({length:count},(_,i)=>({id:`synthetic-${i}`,title:`Synthetic task ${i}`,status:statuses[i%statuses.length]})),
    events:[{id:'not-a-task'}],initiatives:[],projectNotes:[]},changes:[{id:'also-not-a-task'}]};
}
function diagnostics(expected) {
  return {state:'private',ready:true,label:`Empire To-Do · ${expected.tasks.length} durable items`,
    detail:expected.tasks.map(t=>t.title).join(' · ') || 'To-Do data unavailable'};
}
for (const count of [0,1,34,35]) test(`authoritative ${count} tasks pass without counting events or history`,()=>{
  const source=fixture(count),before=JSON.stringify(source),expected=projectWork(source);
  assertWorkDiagnostics(diagnostics(expected),expected);
  for (const lane of ['queued','progress','other','completed'])
    assertWorkRows(expected.tasks.filter(t=>taskLane(t.status)===lane).map(t=>({id:t.id,title:t.title})),expected,lane);
  assert.equal(JSON.stringify(source),before,'projection must not mutate authority');
});
test('a legitimate added task is accepted only when displayed',()=>{
  const value=fixture(34),old=projectWork(value);value.revision++;
  value.data.tasks.push({id:'synthetic-new',title:'Additional synthetic task',status:'Planned'});
  const current=projectWork(value);assertWorkDiagnostics(diagnostics(current),current);
  assert.throws(()=>assertWorkDiagnostics(diagnostics(old),current),/count/);
});
test('wrong count, missing or extra title, wrong authority, and failed readiness reject without private values',()=>{
  const expected=projectWork(fixture(35)),view=diagnostics(expected);
  for (const bad of [{...view,label:'Empire To-Do · 34 durable items'},
    {...view,detail:view.detail.replace('Synthetic task 3 · ','')}, {...view,detail:view.detail+' · unexpected'},
    {...view,state:'bridge'}, {...view,ready:false}]) {
    assert.throws(()=>assertWorkDiagnostics(bad,expected),error=>!String(error).includes('Synthetic task'));
  }
});
test('missing, wrong, duplicate, or renamed rendered task fails even when diagnostics are correct',()=>{
  const expected=projectWork(fixture(35)),rows=expected.tasks.filter(t=>taskLane(t.status)==='queued');
  for (const bad of [rows.slice(1),rows.map((r,i)=>i? r:{...r,id:'wrong'}),
    rows.map((r,i)=>i? r:{...r,title:'wrong'}), [...rows.slice(1),rows[1]]])
    assert.throws(()=>assertWorkRows(bad,expected,'queued'),/Work acceptance/);
});
test('all accepted and legacy statuses match the application lane definition',()=>{
  for (const status of [...statuses,'',null]) assert.equal(taskLane(status),empireTodoLane(status));
});
test('missing or ambiguous authority never invents an expectation',()=>{
  for (const value of [null,{}, {...fixture(1),revision:-1}, {...fixture(1),data:{tasks:[]}},fixture(2)]) {
    if(value?.data?.tasks.length===2)value.data.tasks[1].id=value.data.tasks[0].id;
    assert.throws(()=>projectWork(value),/Work acceptance/);
  }
});
test('snapshot and assertions preserve isolated store bytes; drift and unavailable evidence fail explicitly',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'work-authority-test-')),store=path.join(root,'operator-work');
  try {
    await mkdir(store,{mode:0o700});
    const file=path.join(store,'work.json'),marker=path.join(root,'operator-work.activated');
    const value=fixture(35);await writeFile(file,JSON.stringify(value),{mode:0o600});await writeFile(marker,'synthetic',{mode:0o600});
    const bytes=await readFile(file),reader=()=>JSON.parse(bytes);
    const before=await snapshotWork(root,store,reader);
    assertWorkDiagnostics(diagnostics(before),before);
    assertWorkUnchanged(before,await snapshotWork(root,store,reader));
    assert.equal((await readFile(file)).equals(bytes),true);
    assert.equal(await readFile(marker,'utf8'),'synthetic');
    assert.equal(JSON.stringify(workReceipt(before)).includes('Synthetic'),false);
    assert.ok(workReceipt(before).storeSha256);
    assert.throws(()=>assertWorkUnchanged(before,{...before,revision:3}),/state drift/);
    assert.throws(()=>assertWorkUnchanged(before,{...before,contentSha256:'changed'}),/state drift/);
    await writeFile(file,JSON.stringify(fixture(34)));
    await assert.rejects(async()=>assertWorkUnchanged(before,await snapshotWork(root,store,reader)),/state drift/);
    await assert.rejects(()=>snapshotWork(root,store),/authoritative evidence unavailable/);
    await rm(file);
    await assert.rejects(()=>snapshotWork(root,store),/authoritative evidence unavailable/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('both release entrypoints bind the shared authority before rendering and preserve it afterward',async()=>{
  for (const name of ['tauri_candidate_precheck.mjs','tauri_production_readonly.mjs']) {
    const source=await readFile(new URL(`../scripts/${name}`,import.meta.url),'utf8');
    assert.match(source,/copyWorkSnapshot/);assert.match(source,/assertNativeWorkDiagnostics/);
    assert.match(source,/assertNativeWorkRows/);assert.match(source,/assertWorkUnchanged/);
    assert.doesNotMatch(source,/Empire To-Do · (34|35) durable items/);
  }
  const modal=await readFile(new URL('../src/components/runtime/RuntimeDiagnosticsModal.tsx',import.meta.url),'utf8');
  assert.match(modal,/todoResult\.value\.data\.tasks\.map\(\(item\) => item\.title\)/);
});
