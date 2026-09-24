import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWorkspaceState, workAnchorPresent } from '../scripts/native_workspace.mjs';
import { assertOrderedNavigation, orderedWorkspaceRoute, workspaceRegressions } from '../scripts/native_workspace_sequence.mjs';

const selected=()=>({selected:{top:['tab-sentinel'],security:['security-mode-sentinel'],notes:[]},
  aria:['sentinel','empire_operations','security_guardian'].map(x=>({id:`security-mode-${x}`,selected:x==='sentinel'?'true':'false'})),
  containers:{sentinel:{count:1},empire_operations:{count:0},security_guardian:{count:0},runtime:{count:0}},
  workPresent:false,targetVisible:true,anchorPresent:true,ready:true,busy:false});
test('workspace proof binds selected top/subtab, container, readiness and mutually exclusive surface',()=>{
  assertWorkspaceState(selected(),'sentinel');
  for(const patch of [
    {selected:{top:['tab-notes'],security:[],notes:['notes-mode-progress']}},
    {selected:{top:['tab-sentinel'],security:['security-mode-security_guardian'],notes:[]}},
    {workPresent:true},{targetVisible:false},{anchorPresent:false},{ready:false},{busy:true},
    {aria:[]},{aria:selected().aria.map(x=>({...x,selected:'true'}))},
    {containers:{...selected().containers,sentinel:{count:2}}},
    {containers:{...selected().containers,runtime:{count:1}}},
    {containers:{...selected().containers,security_guardian:{count:1}}},
  ]) assert.throws(()=>assertWorkspaceState({...selected(),...patch},'sentinel'),/wrong or unsettled workspace/);
});
test('release proof cannot omit or reduce ordered runs or negative workspace coverage',()=>{
  const complete=()=>({ok:true,route:orderedWorkspaceRoute,regressions:workspaceRegressions,runs:[1,2,3,4,5].map(run=>({run,ok:true}))});
  assertOrderedNavigation(complete());
  assert.throws(()=>assertOrderedNavigation(undefined));
  for(const key of ['route','regressions','runs']) {
    const r=complete();r[key]=r[key].slice(1);assert.throws(()=>assertOrderedNavigation(r));
  }
  const failed=complete();failed.runs[4].ok=false;assert.throws(()=>assertOrderedNavigation(failed));
});

test('empty mutable Work lanes require explicit loaded zero state, never a missing row alone',()=>{
  const valid={anchorPresent:false,emptyWork:{visible:true,count:'0 tasks',loading:false,error:false}};
  for(const lane of ['todo','progress'])assert.equal(workAnchorPresent(valid,lane),true);
  assert.equal(workAnchorPresent(valid,'sentinel'),false);
  for(const emptyWork of [undefined,{...valid.emptyWork,count:'1 tasks'},{...valid.emptyWork,visible:false},
    {...valid.emptyWork,loading:true},{...valid.emptyWork,error:true}])
    assert.equal(Boolean(workAnchorPresent({...valid,emptyWork},'todo')),false);
});
