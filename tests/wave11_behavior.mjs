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
const projected = (rows) => ({...sample, interpretation:{concerns: rows.map(f => ({
  concernKey:f.findingKey, kind:f.key, title:f.reason, finding:f, presence:'present', significance:'attention',
  actionability:f.repairCapability ? 'governed-action-available' : 'operator-investigation-required', repairCapability:f.repairCapability,
}))}});
test('healthy projection has no repair or attention action',()=>{const view=sentinelHealthActions(status([]),projected([]),true);assert.equal(view.needsAttention,false);assert.equal(view.repairableCount,0);});
test('exact projected updater permits only preview entry',()=>assert.equal(sentinelHealthActions(status(),projected([updater]),true).repairableCount,1));
test('temperature and zombie concerns do not fabricate fixes',()=>{const view=sentinelHealthActions(status([thermal,zombie]),projected([thermal,zombie]),true);assert.equal(view.findings.length,2);assert.equal(view.repairableCount,0);});
test('unknown repair capability cannot expose Fix it',()=>assert.equal(sentinelHealthActions(status(),projected([{...updater,repairCapability:'host.kill'}]),true).repairableCount,0));
test('missing or broadened metadata fails closed',()=>{
 for(const cap of [{...capability,implemented:false},{...capability,dryRunOnly:true},{...capability,targetScope:['pop-upgrade.service','other.service']},{...capability,argumentKeys:['pid']},{...capability,mutating:false},{...capability,level:2}]) assert.equal(sentinelHealthActions({...status(),capabilities:[cap]},projected([updater]),true).repairableCount,0);
});
test('stale evidence, status errors, bad audit and boundary deny repair',()=>{
 assert.equal(sentinelHealthActions(status(),projected([updater]),false).repairableCount,0);
 assert.equal(sentinelHealthActions(status(),projected([updater]),true,'unavailable').repairableCount,0);
 for(const patch of [{privilegedBoundary:{ready:false}},{auditVerification:{ok:false}},{ok:false}]) assert.equal(sentinelHealthActions({...status(),...patch},projected([updater]),true).repairableCount,0);
});
test('manual preview does not require automatic scheduler',()=>assert.equal(sentinelHealthActions({...status(),automation:{enabled:false,active:false}},projected([updater]),true).repairableCount,1));
test('failed/unresolved repairs offer no restart',()=>{
 const failed=sentinelHealthActions(status([]),projected([]),true,'',true);assert.equal(failed.needsAttention,true);assert.equal(failed.repairableCount,0);
 for(const latch of ['repairNeedsOperator','midScanNeedsOperator']){const s=status();s.knownIncidentState[latch]=true;const v=sentinelHealthActions(s,projected([updater]),true);assert.equal(v.needsAttention,true);assert.equal(v.repairableCount,0);assert.equal(v.findings.length,1,'one updater incident retains its recovery blocker');}
});
test('one verified repair leaves unrelated concerns visible',()=>{
 const before=sentinelHealthActions(status([updater,thermal,zombie]),projected([updater,thermal,zombie]),true);assert.equal(before.findings.length,3);assert.equal(before.repairableCount,1);
 const after=sentinelHealthActions(status([thermal,zombie]),projected([thermal,zombie]),true);assert.equal(after.findings.length,2);assert.equal(after.repairableCount,0);
});
test('Watching and observed-clear project no attention action',()=>{
 const input=projected([thermal,zombie]);input.interpretation.concerns[0].presence='observed-clear';input.interpretation.concerns[1].significance='watching';
 assert.equal(sentinelHealthActions(status([thermal,zombie]),input,true).findings.length,0);
});
test('raw historic rows cannot override authoritative projection',()=>{
 const s=status([updater,zombie]);s.recentHostObservations=[{observedValues:{findings:[updater,zombie]}}];
 assert.equal(sentinelHealthActions(s,projected([]),true).findings.length,0);
 assert.equal(sentinelHealthActions(s,sample,true).repairableCount,0);
});
test('exact preview still requires confirmation and OS authorization',()=>{
 const p={ok:true,candidate:{id:'service:pop-upgrade.service',service:'pop-upgrade.service'},requiresOperatorConfirmation:true,requiresOsAuthorization:true};assert.equal(validUpdaterPreview(p),true);
 for(const patch of [{ok:false},{candidate:null},{candidate:{id:'service:other',service:'other'}},{requiresOperatorConfirmation:false},{requiresOsAuthorization:false}])assert.equal(validUpdaterPreview({...p,...patch}),false);assert.equal(validUpdaterPreview(null),false);
});
