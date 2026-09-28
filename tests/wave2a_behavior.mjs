import test from 'node:test';
import assert from 'node:assert/strict';
import {momentum,unassessed} from '../src/components/overview/workModel.ts';
import {createTodoDrafts} from '../src/components/notes/empireTodoDrafts.ts';
import {createBlankEmpireTodo,empireTodoProgress,empireTodoLane} from '../src/components/notes/empireTodoModel.ts';
const row={id:'one',title:'Outcome',area:'RCE',kind:'finite',status:'active',phase:'Prepare',nextMove:'Review result',blocker:'',progress:unassessed(),reviewedAt:'2026-09-20T00:00:00Z',lastMovementAt:'',pinned:false};
test('assessed progress requires operator basis and date, never task counts',()=>{
 assert.equal(momentum({...row,progress:{method:'operator-assessed',percent:42,basis:'Chris reviewed milestones',assessedAt:'2026-09-20'}}).percent,42);
 for(const patch of [{},{progress:{method:'operator-assessed',percent:42,basis:'',assessedAt:'2026-09-20'}},{percent:78,taskIds:['a','b']}]) assert.equal(momentum({...row,...patch}).percent,null);
});
test('ongoing responsibility never displays numeric percentage',()=>{assert.deepEqual(momentum({...row,kind:'ongoing',progress:{method:'operator-assessed',percent:90,basis:'old',assessedAt:'then'}}),{percent:null,label:'Ongoing'});});
test('task editors carry their own loaded revision, retain conflicts, advance only after accepted saves',async()=>{
 const item={...createBlankEmpireTodo(),title:'Task'},calls=[];let conflict=true;
 const store=createTodoDrafts({save:async(value,revision)=>{calls.push(revision);if(conflict)throw Error('work_revision_conflict_reload');return {ok:true,item:value,revision:9};},complete:async()=>{throw Error('unexpected');}},()=>{});
 store.load([item],7);store.update(item.id,'notes','My draft');assert.equal(await store.flush(),false);assert.equal(store.rows()[0].notes,'My draft');assert.equal(store.dirty(item.id),true);assert.deepEqual(calls,[7]);
 // An explicit reload (UI labels the discard) is required; no hidden refresh retries.
 conflict=false;store.load([item],8);store.update(item.id,'notes','Reviewed again');assert.equal(await store.flush(),true);store.update(item.id,'notes','Next edit');await store.flush();assert.deepEqual(calls,[7,8,9]);
});
test('optional task assessment distinguishes zero and unassessed, retains Blocked, and completion wins',()=>{
 const task={...createBlankEmpireTodo(),status:'In Progress'};
 assert.equal(empireTodoProgress(task).percent,null);
 for(const percent of [0,15,45,72,100]) {
  const assessed={...task,progress:{percent,method:'operator',reviewedAt:'2026-09-22T00:00:00Z'}};
  assert.equal(empireTodoProgress(assessed).percent,percent);
  assert.equal(empireTodoProgress({...assessed,status:'Blocked'}).percent,percent);
  assert.equal(empireTodoProgress({...assessed,status:'Complete'}).percent,100);
  assert.equal(empireTodoLane(assessed.status),'progress');
 }
});
test('assessment waits for interaction flush, roundtrips revision, and retains rejected drafts',async()=>{
 const task={...createBlankEmpireTodo(),title:'Assessed task',status:'Blocked'}, calls=[];let conflict=false;
 const api={save:async(value,revision)=>{calls.push({value,revision});if(conflict)throw Error('work_revision_conflict_reload');return {ok:true,item:{...value,progress:{...value.progress,reviewedAt:'2026-09-22T00:00:00Z'}},revision:revision+1};},complete:async()=>{throw Error('unexpected');}};
 const store=createTodoDrafts(api,()=>{});store.load([task],4);
 for(const percent of [-1,101,0.5,NaN,'45'])assert.throws(()=>store.assessProgress(task.id,percent));
 store.assessProgress(task.id,15);store.assessProgress(task.id,45);assert.equal(calls.length,0);
 assert.equal(await store.flush(),true);assert.equal(calls.length,1);assert.equal(calls[0].value.progress.percent,45);assert.equal(calls[0].revision,4);
 const reloaded=createTodoDrafts(api,()=>{});reloaded.load(store.rows(),5);assert.equal(reloaded.rows()[0].progress.percent,45);
 reloaded.update(task.id,'notes','Preserve assessment');await reloaded.flush();assert.equal(calls[1].value.progress.percent,45);
 conflict=true;reloaded.assessProgress(task.id,72);assert.equal(await reloaded.flush(),false);
 assert.equal(reloaded.rows()[0].progress.percent,72);assert.equal(reloaded.rows()[0].status,'Blocked');assert.equal(reloaded.dirty(task.id),true);
 assert.match(reloaded.state().error,/work_revision_conflict_reload/);assert.equal(calls.length,3);
});
