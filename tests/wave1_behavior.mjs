import assert from 'node:assert/strict';
import test from 'node:test';
import { createTodoDrafts } from '../src/components/notes/empireTodoDrafts.ts';
import { createBlankEmpireTodo, empireTodoProgress, EMPIRE_TODO_STATUSES } from '../src/components/notes/empireTodoModel.ts';
import { fileTimestamp } from '../src/components/common/fileTimestamp.ts';
import { logStatus } from '../src/components/common/logStatus.ts';
import { buildMilestoneFromContent, buildMilestoneFileContent, validEventDate, timelinePresentation } from '../src/components/paste-tabs/timelineModel.ts';

const item = { ...createBlankEmpireTodo(new Date('2026-09-19T12:00:00Z')), title:'A meaningful task', currentState:'50% mentioned in prose', nextActions:'Get acceptance', dependencies:'Operator review', acceptanceCriteria:'Accepted proof', summary:'Summary', detailedContext:'Context', whyItMatters:'Purpose', notes:'Notes' };
const response = (value) => ({ok:true,item:{...value,updatedAt:'2026-09-20T00:00:00Z'},itemCount:1,seededCount:0});
function fixture(override={}) {
 const calls=[];
 const api={save:async value=>{calls.push(['save',value]);return response(value);}, complete:async(id,timeline)=>{calls.push(['complete',id,timeline]);return response({...item,id,status:'Complete'});},...override};
 const store=createTodoDrafts(api,()=>{});store.load([item]);return {store,calls};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('opening, selection reads, navigation flush and unchanged edits do not write',async()=>{
 const {store,calls}=fixture();store.rows();await store.flush();store.update(item.id,'notes',item.notes);await store.flush();assert.deepEqual(calls,[]);
});
test('edit then undo is clean',async()=>{const {store,calls}=fixture();store.update(item.id,'title','Draft');store.update(item.id,'title',item.title);assert.equal(store.dirty(item.id),false);await store.flush();assert.equal(calls.length,0);});
test('save preserves every existing task field',async()=>{const {store,calls}=fixture();store.update(item.id,'notes','Updated');assert.equal(await store.flush(),true);assert.deepEqual(calls[0][1],{...item,notes:'Updated'});assert.equal(store.dirty(item.id),false);});
test('old response cannot clear or overwrite a newer draft; duplicate flushes serialize',async()=>{
 const first=deferred();const calls=[];const {store}=fixture({save:async value=>{calls.push(value);if(calls.length===1)await first.promise;return response(value);}});
 store.update(item.id,'notes','First');const saving=store.flush();await Promise.resolve();store.update(item.id,'notes','Second');const second=store.flush();first.resolve();assert.equal(await saving,true);assert.equal(await second,true);assert.equal(calls.length,2);assert.equal(store.rows()[0].notes,'Second');assert.equal(store.dirty(item.id),false);
});
test('save error retains draft and blocks navigation; explicit retry works',async()=>{
 let fail=true;const {store}=fixture({save:async value=>{if(fail)throw Error('Fixture save rejected');return response(value);}});
 store.update(item.id,'notes','Retain me');assert.equal(await store.flush(),false);assert.equal(store.dirty(item.id),true);assert.equal(store.rows()[0].notes,'Retain me');assert.match(store.state().error,/rejected/);fail=false;assert.equal(await store.flush(),true);
});
test('pending save completes before completion; old status cannot win',async()=>{
 const hold=deferred(),calls=[];const {store}=fixture({save:async value=>{calls.push('save');await hold.promise;return response(value);},complete:async()=>{calls.push('complete');return response({...item,status:'Complete'});}});
 store.update(item.id,'notes','Changed');const save=store.flush();await Promise.resolve();const done=store.complete(item.id,false);hold.resolve();await save;assert.equal(await done,true);await store.flush();assert.deepEqual(calls,['save','complete']);assert.equal(store.rows()[0].status,'Complete');
});
test('failed draft save prevents completion',async()=>{const {store,calls}=fixture({save:async()=>{throw Error('failure');}});store.update(item.id,'notes','Change');assert.equal(await store.complete(item.id,true),false);assert.deepEqual(calls,[]);assert.equal(store.rows()[0].status,'Backlog');});
test('completion choice supplies task title, never private notes',async()=>{const {store,calls}=fixture();await store.complete(item.id,true);assert.deepEqual(calls[0],['complete',item.id,{title:'A meaningful task completed',notes:'Completed from Empire To-Do.'}]);});
test('pristine Add can navigate without creating a record; cancellation never writes',async()=>{const {store,calls}=fixture();store.add();await store.flush();assert.equal(store.rows().length,1);const id=store.add();store.update(id,'notes','Draft');store.discard(id);await store.flush();assert.equal(store.rows().length,1);assert.equal(calls.length,0);});
test('edited new task without title retains draft and reports error',async()=>{const {store,calls}=fixture();const id=store.add();store.update(id,'notes','Unfinished');assert.equal(await store.flush(),false);assert.equal(store.dirty(id),true);assert.equal(calls.length,0);});
test('progress is lifecycle only, except authoritative Complete = 100%',()=>{
 for(const status of EMPIRE_TODO_STATUSES){const p=empireTodoProgress({...item,status});assert.equal(p.percent,status==='Complete'?100:null);}
 assert.equal(empireTodoProgress({...item,status:'Blocked'}).label,'Blocked');assert.equal(empireTodoProgress(item).label,'Not Started');
});
test('seconds and milliseconds normalize once to a modern Saved date',()=>{const ms=Date.parse('2026-09-19T12:00:00Z');assert.equal(fileTimestamp(ms/1000),ms);assert.equal(fileTimestamp(ms),ms);assert.equal(fileTimestamp(ms/1000,'seconds'),ms);assert.equal(fileTimestamp(ms,'milliseconds'),ms);assert.equal(new Date(fileTimestamp(ms/1000)).getUTCFullYear(),2026);});
test('explicit units preserve legitimate older dates',()=>{const ms=Date.parse('1990-01-01T12:00:00Z');assert.equal(fileTimestamp(ms,'milliseconds'),ms);assert.equal(fileTimestamp(ms/1000,'seconds'),ms);});
test('missing or invalid file timestamp never fabricates epoch/current time',()=>{for(const value of [undefined,null,0,-1,'1750000000',NaN,Infinity,1e30])assert.equal(fileTimestamp(value),null);});
test('Timeline task-specific title dominates generic completion notes',()=>{const m=buildMilestoneFromContent('docs/radcontrol/timeline/old.md','---\ntitle: "Task accepted"\ndate: "2026-08-22"\nnotes: "Completed from Empire To-Do."\ncreated: "2026-09-19T12:00:00Z"\n---\n');assert.equal(timelinePresentation(m).title,'Task accepted');assert.equal(timelinePresentation(m).body,'Completed from Empire To-Do.');});
test('event date is independent of creation date and old records remain readable',()=>{
 const now=new Date('2026-09-20T12:00:00Z');const text=buildMilestoneFileContent({title:'Earlier "milestone"',date:'2026-01-07',category:'Work',notes:'Recorded later'},now);const m=buildMilestoneFromContent('docs/radcontrol/timeline/event.md',text);assert.equal(m.date,'2026-01-07');assert.equal(m.createdAt,now.toISOString());assert.equal(m.title,'Earlier "milestone"');assert.equal(buildMilestoneFromContent('docs/radcontrol/timeline/legacy.md','Legacy body').title,'legacy');
});
test('invalid event dates stay undated rather than rollover to a different day',()=>{for(const value of ['2026-02-30','2026-13-01','0','', '2026-01-01\ncreated: false'])assert.equal(validEventDate(value),false);assert.equal(validEventDate('2024-02-29'),true);});
test('duplicate title/body is quiet; context remains separate',()=>{const m=buildMilestoneFromContent('event.md','---\ntitle: "Milestone"\nnotes: "Milestone"\ncategory: "Release"\n---\n');assert.equal(timelinePresentation(m).body,'');assert.equal(m.category,'Release');});
test('collapsed log status distinguishes output, work, warning and error',()=>{assert.equal(logStatus('',false).tone,'normal');assert.equal(logStatus('registry loaded',true).tone,'running');assert.equal(logStatus('[WARN] attention',false).tone,'warning');assert.equal(logStatus('[registry] ERROR: unavailable',false).tone,'error');assert.equal(logStatus('{"ok":false}',false).tone,'error');});

test('successful diagnostic JSON and zero errors do not invent an error',()=>{assert.equal(logStatus('{"ok":true,"error":null,"failure":null}',false).tone,'normal');assert.equal(logStatus('0 errors; failure examples documented',false).tone,'normal');});

test('typing back to the in-flight value does not create a duplicate save',async()=>{
 const hold=deferred(),calls=[];const {store}=fixture({save:async value=>{calls.push(value);await hold.promise;return response(value);}});
 store.update(item.id,'notes','Sent');const pending=store.flush();await Promise.resolve();store.update(item.id,'notes','Intermediate');store.update(item.id,'notes','Sent');hold.resolve();await pending;assert.equal(calls.length,1);assert.equal(store.dirty(item.id),false);
});
