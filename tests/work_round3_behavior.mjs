import test from 'node:test';
import assert from 'node:assert/strict';
import './verify_empire_todo_contract.mjs';
test('incomplete Overview responses cannot produce an all-clear',async()=>{
 const {checkedOverview}=await import('../src/components/overview/workModel.ts');
 const response={ok:true,authority:'private',revision:1,capability:'operator.work.overview-v1',taskCounts:{Backlog:0,Planned:0,'In Progress':0,Blocked:0,Deferred:0,Complete:0,Unclassified:0,total:0,assessed:0,unassessed:0},initiativeCounts:{},attention:[],next:[],movement:[],initiatives:[],coverage:{complete:true,sources:['tasks','initiatives','events','projectNotes'].map(source=>({source,loaded:true,authority:'private'}))}};
 assert.equal(checkedOverview(response),response);
 for(const corrupt of [r=>delete r.taskCounts.Blocked,r=>delete r.initiativeCounts,r=>r.coverage.sources.pop(),r=>r.coverage.sources[0].loaded=false,r=>r.taskCounts.total=1]){const invalid=structuredClone(response);corrupt(invalid);assert.throws(()=>checkedOverview(invalid),/coverage unavailable/);}
});
