import test from 'node:test';
import assert from 'node:assert/strict';
import { TASK_VIEWS, inTaskView } from '../src/components/work/taskViews.ts';
import { createTodoDrafts } from '../src/components/notes/empireTodoDrafts.ts';
import { createBlankEmpireTodo, empireTodoProgress } from '../src/components/notes/empireTodoModel.ts';
test('one task collection has lifecycle views and complete progress in every view',()=>{
 assert.deepEqual(TASK_VIEWS,['All','Now','Planned','Backlog','Blocked','Deferred','Completed']);
 const base=createBlankEmpireTodo();
 for(const status of ['Backlog','Planned','In Progress','Blocked','Deferred','Complete','Legacy']){
  const task={...base,status};assert.ok(inTaskView(task,'All'));
  assert.equal(inTaskView(task,'Now'),['In Progress','Blocked'].includes(status));
  assert.equal(inTaskView(task,'Completed'),status==='Complete');
  for(const percent of [0,45,100])assert.equal(empireTodoProgress({...task,progress:{percent,method:'operator',reviewedAt:'date'}}).percent,status==='Complete'?100:percent);
 }
});
test('dedicated relationship save serializes behind drafts and advances CAS without changing lifecycle',async()=>{
 const task={...createBlankEmpireTodo(),title:'Task',status:'Blocked'},calls=[];
 const store=createTodoDrafts({save:async(value,revision)=>{calls.push(['save',revision]);return {ok:true,item:value,revision:revision+1};},complete:async()=>{throw Error('unexpected')},relationships:async(id,projectKeys,dependsOnTaskIds,revision)=>{calls.push(['relationships',revision]);return {ok:true,item:{...store.rows()[0],id,projectKeys,dependsOnTaskIds},revision:revision+1};}},()=>{});
 store.load([task],4);store.update(task.id,'notes','Preserve full draft');
 assert.equal(await store.relationships(task.id,['o2','radcontrol'],['dependency']),true);
 assert.deepEqual(calls,[['save',4],['relationships',5]]);assert.equal(store.state().revision,6);
 assert.deepEqual(store.rows()[0].projectKeys,['o2','radcontrol']);assert.equal(store.rows()[0].status,'Blocked');assert.equal(store.rows()[0].notes,'Preserve full draft');
});

test('exact accepted Round 2 client draft queue preserves additive relationships', {skip:!process.env.RADCONTROL_ROUND2_SOURCE_SHA},async()=>{
 const {spawnSync}=await import('node:child_process');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');
 const sha=process.env.RADCONTROL_ROUND2_SOURCE_SHA;assert.match(sha,/^[a-f0-9]{40}$/);
 const root=await mkdtemp(join(tmpdir(),'round2-client-'));
 try {
  for(const name of ['empireTodoDrafts.ts','empireTodoModel.ts']) {
   const source=spawnSync('git',['show',`${sha}:src/components/notes/${name}`],{encoding:'utf8'});assert.equal(source.status,0,source.stderr);await writeFile(join(root,name),source.stdout,{mode:0o600});
  }
  const {createTodoDrafts:oldDrafts}=await import(pathToFileURL(join(root,'empireTodoDrafts.ts')));
  const record={...createBlankEmpireTodo(),title:'Cross-version fixture',projectKeys:['o2','radcontrol'],dependsOnTaskIds:['other'],unknownImported:{retained:true}};let submitted;
  const queue=oldDrafts({save:async(value,revision)=>{submitted=value;return {ok:true,item:value,revision:revision+1};},complete:async()=>{throw Error('unexpected')}},()=>{});
  queue.load([record],3);queue.update(record.id,'notes','Older client edit');assert.equal(await queue.flush(),true);
  for(const key of ['projectKeys','dependsOnTaskIds','unknownImported'])assert.deepEqual(submitted[key],record[key]);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('incomplete Overview responses cannot produce an all-clear',async()=>{
 const {checkedOverview}=await import('../src/components/overview/workModel.ts');
 const response={ok:true,authority:'private',revision:1,capability:'operator.work.overview-v1',taskCounts:{Backlog:0,Planned:0,'In Progress':0,Blocked:0,Deferred:0,Complete:0,Unclassified:0,total:0,assessed:0,unassessed:0},initiativeCounts:{},attention:[],next:[],movement:[],initiatives:[],coverage:{complete:true,sources:['tasks','initiatives','events','projectNotes'].map(source=>({source,loaded:true,authority:'private'}))}};
 assert.equal(checkedOverview(response),response);
 for(const corrupt of [r=>delete r.taskCounts.Blocked,r=>delete r.initiativeCounts,r=>r.coverage.sources.pop(),r=>r.coverage.sources[0].loaded=false,r=>r.taskCounts.total=1]){const invalid=structuredClone(response);corrupt(invalid);assert.throws(()=>checkedOverview(invalid),/coverage unavailable/);}
});

test('explicit reload clears a rejected relationship error and keeps server authority',async()=>{
 const task={...createBlankEmpireTodo(),title:'Task'};
 const queue=createTodoDrafts({save:async()=>{throw Error('unexpected')},complete:async()=>{throw Error('unexpected')},relationships:async()=>{throw Error('dependency cycle')}},()=>{});
 queue.load([task],4);assert.equal(await queue.relationships(task.id,[],['cycle']),false);assert.match(queue.state().error,/cycle/);
 queue.load([task],5);assert.equal(queue.state().error,'');assert.equal(queue.state().revision,5);assert.deepEqual(queue.rows(),[task]);
});
