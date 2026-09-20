import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankEmpireTodo, empireTodoLane, empireTodoProgress } from '../src/components/notes/empireTodoModel.ts';
import { sentinelHealthActions, validUpdaterPreview } from '../src/components/sentinel/sentinelHealthActions.ts';
const item=createBlankEmpireTodo();
const finding=(key,extra={})=>({key,findingKey:`metric:${key}`,status:'attention',reason:`${key} needs review`,...extra});
const updater=finding('knownIncident',{repairCapability:'workstation.cleanup.pop_upgrade.preview'});
const thermal=finding('thermal');const zombie=finding('projectRuntimes',{reason:'Zombie process needs review'});
const capability={key:'host.maintenance.pop-upgrade-self-heal',level:1,mutating:true,implemented:true,dryRunOnly:false,targetScope:['pop-upgrade.service'],argumentKeys:[]};
const sample={ok:true,metrics:{thermal:{status:'healthy',reason:'CPU temperature 60°C'}}};
function status(findings=[updater]) {return {ok:true,host:{findings},recentHostObservations:[],knownIncidentState:{active:findings.includes(updater)},privilegedBoundary:{ready:true},auditVerification:{ok:true},capabilities:[capability]};}
for(const [state,lane] of [['Backlog','queued'],['Planned','queued'],['In Progress','progress'],['Blocked','progress'],['Complete','completed'],['Deferred','other'],['Legacy','other'],['','other'],[undefined,'other']]) test(`task state ${state} projects to ${lane} without rewriting`,()=>{assert.equal(empireTodoLane(state),lane);});
test('unsupported numeric/checklist/narrative fields never become percentage evidence',()=>{
 for(const state of ['In Progress','Blocked','Deferred','Legacy']) assert.equal(empireTodoProgress({...item,status:state,percent:62,checklist:[{done:true}],currentState:'62%'}).percent,null);
 assert.equal(empireTodoProgress({...item,status:'Complete'}).percent,100);assert.equal(empireTodoProgress({...item,status:'Legacy'}).label,'Unclassified');
});
test('healthy state has no repair or attention action',()=>{const view=sentinelHealthActions(status([]),sample,true);assert.equal(view.needsAttention,false);assert.equal(view.repairableCount,0);});
test('exact actionable updater finding permits only entry into preview',()=>{assert.equal(sentinelHealthActions(status(),sample,true).repairableCount,1);});
test('temperature and zombie findings do not fabricate fixes',()=>{const view=sentinelHealthActions(status([thermal,zombie]),{...sample,metrics:{thermal:{status:'attention',reason:'CPU temperature 96°C'}}},true);assert.equal(view.findings.length,2);assert.equal(view.repairableCount,0);});
test('unknown repair capability cannot expose Fix it',()=>{assert.equal(sentinelHealthActions(status([{...updater,repairCapability:'host.kill'}]),sample,true).repairableCount,0);});
test('missing or broadened capability metadata fails closed',()=>{
 for(const cap of [{...capability,implemented:false},{...capability,dryRunOnly:true},{...capability,targetScope:['pop-upgrade.service','other.service']},{...capability,argumentKeys:['pid']},{...capability,mutating:false},{...capability,level:2}]) assert.equal(sentinelHealthActions({...status(),capabilities:[cap]},sample,true).repairableCount,0);
});
test('stale current evidence, status error, bad audit or boundary cannot offer Fix it',()=>{
 assert.equal(sentinelHealthActions(status(),sample,false).repairableCount,0);assert.equal(sentinelHealthActions(status(),sample,true,'status unavailable').repairableCount,0);
 for(const patch of [{privilegedBoundary:{ready:false}},{auditVerification:{ok:false}},{ok:false}]) assert.equal(sentinelHealthActions({...status(),...patch},sample,true).repairableCount,0);
});
test('manual entry does not require the automatic scheduler',()=>{assert.equal(sentinelHealthActions({...status(),automation:{enabled:false,active:false}},sample,true).repairableCount,1);});
test('failed/unresolved repair remains attention and offers no new restart',()=>{
 const failed=sentinelHealthActions(status([]),sample,true,'',true);assert.equal(failed.needsAttention,true);assert.equal(failed.repairableCount,0);
 for(const latch of ['repairNeedsOperator','midScanNeedsOperator']){const s=status();s.knownIncidentState[latch]=true;const v=sentinelHealthActions(s,sample,true);assert.equal(v.needsAttention,true);assert.equal(v.repairableCount,0);}
});
test('one successful repair does not clear two unrelated findings',()=>{
 const current={...sample,metrics:{thermal:{status:'attention',reason:'CPU temperature 96°C'}}};
 const before=sentinelHealthActions(status([updater,thermal,zombie]),current,true);assert.equal(before.findings.length,3);assert.equal(before.repairableCount,1);
 const after=sentinelHealthActions(status([thermal,zombie]),current,true);assert.equal(after.findings.length,2);assert.equal(after.repairableCount,0);assert.equal(after.needsAttention,true);
});
test('latest resolution wins and historical thermal attention cannot replace healthy foreground',()=>{
 const resolved={...zombie,resolution:{state:'resolved'}};const s=status([thermal,resolved]);s.recentHostObservations=[{observedValues:{findings:[zombie]}}];
 assert.equal(sentinelHealthActions(s,sample,true).findings.length,0);
});
test('duplicate retained findings counted once',()=>{const s=status([zombie]);s.recentHostObservations=[{observedValues:{findings:[zombie,zombie]}}];assert.equal(sentinelHealthActions(s,sample,true).findings.length,1);});
test('exact preview still requires confirmation and OS authorization',()=>{
 const p={ok:true,candidate:{id:'service:pop-upgrade.service',service:'pop-upgrade.service'},requiresOperatorConfirmation:true,requiresOsAuthorization:true};assert.equal(validUpdaterPreview(p),true);
 for(const patch of [{ok:false},{candidate:null},{candidate:{id:'service:other',service:'other'}},{requiresOperatorConfirmation:false},{requiresOsAuthorization:false}])assert.equal(validUpdaterPreview({...p,...patch}),false);assert.equal(validUpdaterPreview(null),false);
});
