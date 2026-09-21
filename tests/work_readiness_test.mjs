import assert from 'node:assert/strict';
import test from 'node:test';
import {workReadiness} from '../src/components/runtime/workReadiness.ts';

const work=(authority,revision)=>({ok:true,authority,revision,data:{tasks:[],events:[],projectNotes:[],initiatives:[]}});
test('bridge is ready only from validated legacy-readonly authority with no private file',()=>{
  const source=work('legacy-readonly',0),before=JSON.stringify(source);
  assert.deepEqual(workReadiness(source,false),{state:'bridge',ready:true,authority:'Legacy compatibility bridge',activation:'Not activated',editing:'Temporarily read-only until activation',error:''});
  assert.equal(JSON.stringify(source),before,'readiness never transitions authority');
  assert.equal(workReadiness(source,true).ready,false,'a competing file is not bridge-ready');
  assert.equal(workReadiness({...source,revision:1},false).ready,false);
  assert.equal(workReadiness({...source,data:{...source.data,initiatives:[{id:'unexpected'}]}},false).ready,false);
});
test('active readiness requires a validated private response and a present file',()=>{
  const source=work('private',1);
  assert.equal(workReadiness(source,true).state,'private');
  assert.equal(workReadiness(source,true).editing,'Enabled');
  for(const revision of [0,-1,NaN,1.5])assert.equal(workReadiness(work('private',revision),true).ready,false);
  assert.equal(workReadiness(source,false).ready,false);
});
test('missing, corrupt or incomplete private authority never falls back to legacy readiness',()=>{
  for(const error of ['work_current_missing_recovery_required','work_store_malformed','work_activation_incomplete_recovery_required','work_file_unsafe']) {
    const result=workReadiness(null,true,error);
    assert.equal(result.state,'recovery-error');assert.equal(result.ready,false);assert.equal(result.editing,'Unavailable');
  }
  assert.equal(workReadiness(null,false,'transport unavailable').state,'unavailable');
  assert.equal(workReadiness(null,false).ready,false);
});
