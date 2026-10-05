import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWorkTabs, computedRgbAlpha } from '../scripts/native_work_tabs.mjs';

function tabs(active, color='rgba(255, 255, 255, 0)') {
  return ['tasks','initiatives','timeline'].map(mode=>({id:`work-mode-${mode}`,selected:String(mode===active),
    tabIndex:mode===active?0:-1,activeClass:mode===active,borderColor:mode===active?color:'rgba(255, 255, 255, 0.16)',
    borderStyle:'solid',borderWidth:'1px',transitioning:false}));
}
test('Tasks and Timeline accept equivalent fully transparent RGB forms',()=>{
  for(const active of ['tasks','timeline'])for(const color of ['rgba(0, 0, 0, 0)','rgba(255, 255, 255, 0)','rgb(40 80 120 / 0)','rgb(100% 20% 0% / 0%)'])assertWorkTabs(tabs(active,color),active);
});
test('any nonzero alpha fails active border acceptance, including tiny alpha',()=>{
  for(const color of ['rgba(0,0,0,0.001)','rgb(255 255 255 / 0.00001)','rgba(255,255,255,1)','rgb(0 0 0)','rgb(0 0 0 / 0.1%)'])assert.throws(()=>assertWorkTabs(tabs('tasks',color),'tasks'),/fully transparent/);
});
test('malformed and unsupported computed colors fail closed',()=>{
  for(const color of ['transparent','rgba(1,2,3,)','rgba(1,2,3,-1)','rgb(256 0 0 / 0)','rgba(NaN,2,3,0)','rgb(1 2 / 0)','rgb(1 2 3 / 0 / 0)','color(srgb 0 0 0 / 0)'])assert.throws(()=>computedRgbAlpha(color));
});
test('settled state, border geometry and inactive distinction remain mandatory',()=>{
  for(const patch of [{transitioning:true},{borderStyle:'none'},{borderWidth:'0px'},{borderWidth:'2px'},{selected:'false'},{activeClass:false},{tabIndex:-1}]){
    const state=tabs('tasks');Object.assign(state[0],patch);assert.throws(()=>assertWorkTabs(state,'tasks'));
  }
  const invisibleInactive=tabs('tasks');invisibleInactive[2].borderColor='rgba(255,255,255,0)';assert.throws(()=>assertWorkTabs(invisibleInactive,'tasks'),/inactive/);
});
test('a different card or duplicate tab cannot satisfy Work tab acceptance',()=>{
  assert.throws(()=>assertWorkTabs(tabs('tasks').slice(1),'tasks'));
  const extra=tabs('tasks');extra.push({...extra[0]});assert.throws(()=>assertWorkTabs(extra,'tasks'));
  const wrong=tabs('tasks');wrong[0].id='security-mode-tasks';assert.throws(()=>assertWorkTabs(wrong,'tasks'));
  assert.throws(()=>assertWorkTabs(tabs('tasks'),'timeline'));
});
