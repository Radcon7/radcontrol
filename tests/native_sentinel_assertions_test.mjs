import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSentinelDetailsState, assertSentinelHealthState, assertGuardianActivityGeometry, assertSentinelRawEvidenceState } from '../scripts/native_sentinel_assertions.mjs';
import { transactionReceiptContext, writeTransactionReceipt } from '../scripts/native_transaction_receipt.mjs';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const healthy = {
  heroCount: 1, currentCount: 1, declaredCurrent: 'HEALTHY', cardState: 'HEALTHY',
  current: 'HEALTHY', heroClass: 'sentinelHero sentinelThreat-normal sentinelOperatorHero',
  fixCount: 0, reviewCount: 0, summaryCardCount: 1, removedCardCount: 0,
  summaryText: 'CURRENT NOW HEALTHY Measured: fixture',
};
const attention = {
  ...healthy, declaredCurrent: 'ATTENTION', cardState: 'ATTENTION', current: 'NEEDS ATTENTION',
  heroClass: 'sentinelHero sentinelThreat-attention sentinelOperatorHero', reviewCount: 1,
};
test('healthy, attention, critical and unknown retain their exact semantic presentation', () => {
  assertSentinelHealthState(healthy, {declaredCurrent: 'HEALTHY', cardState: 'HEALTHY', fixCount: 0, reviewCount: 0});
  assertSentinelHealthState(attention, {declaredCurrent: 'ATTENTION', cardState: 'ATTENTION', fixCount: 0, reviewCount: 1});
  assertSentinelHealthState({...attention, declaredCurrent: 'PROBLEM', cardState: 'PROBLEM', heroClass: 'sentinelThreat-critical'});
  assertSentinelHealthState({...healthy, declaredCurrent: 'UNKNOWN', cardState: 'UNKNOWN', current: 'UNKNOWN', heroClass: 'sentinelThreat-unknown_visibility', reviewCount: 1});
});
test('retained actionable finding leaves healthy measurement identity intact', () => {
  const state = {...attention, declaredCurrent: 'HEALTHY', fixCount: 1, reviewCount: 0};
  assertSentinelHealthState(state, {declaredCurrent: 'HEALTHY', cardState: 'ATTENTION', fixCount: 1, reviewCount: 0});
  assert.throws(() => assertSentinelHealthState({...state, current: 'HEALTHY'}), /health display/);
});
test('non-actionable, mixed, surviving and failed-repair findings remain attention', () => {
  for (const [name, state, expected] of [
    ['non-actionable', attention, {declaredCurrent: 'ATTENTION', cardState: 'ATTENTION', fixCount: 0, reviewCount: 1}],
    ['mixed', {...attention, fixCount: 1}, {declaredCurrent: 'ATTENTION', cardState: 'ATTENTION', fixCount: 1, reviewCount: 1}],
    ['survivors', attention, {declaredCurrent: 'ATTENTION', cardState: 'ATTENTION', fixCount: 0, reviewCount: 1}],
    ['failed repair', {...attention, declaredCurrent: 'HEALTHY'}, {declaredCurrent: 'HEALTHY', cardState: 'ATTENTION', fixCount: 0, reviewCount: 1}],
  ]) {
    assertSentinelHealthState(state, expected);
    assert.throws(() => assertSentinelHealthState({...state, fixCount: 1 - expected.fixCount}, expected), undefined, name);
    assert.throws(() => assertSentinelHealthState(healthy, expected), undefined, `${name} cannot be silently cleared`);
  }
});
test('partial measurement coverage can still require review of known findings', () => {
  assertSentinelHealthState({...attention, declaredCurrent: 'UNKNOWN'});
});
for (const [name, state] of [
  ['arbitrary label', {...attention, current: 'Everything is fine'}],
  ['raw enum used as display', {...attention, current: 'ATTENTION'}],
  ['attention mislabeled healthy', {...attention, current: 'HEALTHY'}],
  ['healthy mislabeled attention', {...healthy, current: 'NEEDS ATTENTION'}],
  ['unknown raw value', {...attention, declaredCurrent: 'FINE'}],
  ['unknown card value', {...attention, cardState: 'FINE'}],
  ['downgraded raw attention', {...healthy, declaredCurrent: 'ATTENTION'}],
  ['downgraded raw critical', {...attention, declaredCurrent: 'PROBLEM'}],
  ['unexplained critical card', {...attention, declaredCurrent: 'HEALTHY', cardState: 'PROBLEM', heroClass: 'sentinelThreat-critical'}],
  ['wrong severity', {...attention, heroClass: 'sentinelThreat-normal'}],
  ['conflicting severity classes', {...attention, heroClass: 'sentinelThreat-attention sentinelThreat-critical'}],
  ['attention without action or review', {...attention, reviewCount: 0}],
  ['healthy with false repair', {...healthy, fixCount: 1}],
  ['healthy with unresolved review', {...healthy, reviewCount: 1}],
  ['duplicate Current Now', {...healthy, currentCount: 2}],
]) test(`semantic health rejects ${name}`, () => assert.throws(() => assertSentinelHealthState(state)));

const closed={count:1,open:false,retainedContent:true,measurementVisible:false,
  measurementTextExposed:false,technicalTextExposed:false,measurementHit:false};
test('closed/open/reclosed uses rendered exposure and hit testing',()=>{
  assertSentinelDetailsState(closed,false);
  assertSentinelDetailsState({...closed,open:true,measurementVisible:true,measurementTextExposed:true,measurementHit:true},true);
  assertSentinelDetailsState(closed,false);
});

const episodeRow = {
  identity:'Thermal activity',state:'WATCHING',observed:'Sep 23, 2026\nLast Sep 23, 2026',
  evidence:'3 observations\n1 proven recurrences\nPeak 102°C',resolution:'Observed clear',
  action:'No automatic repair available',findingCount:0,trendCount:1,actionCount:1,
  bounds:{height:100,top:0,bottom:100},directChildCount:4,escapingDescendants:[],
  columnRects:[{left:0},{left:200},{left:400},{left:600}],
};
const episodeLayout = {
  rowCount:1,rows:[episodeRow],overflowY:'auto',scrollHeight:100,clientHeight:100,contentBottom:100,
  rowCrossings:[],headerDisplay:'grid',headerColumnCount:4,headerColumnRects:episodeRow.columnRects,
};
const rawEvidence = {retained:true,visible:true,exposed:true,hit:true,rows:[94,102].map(temperature=>({
  findings:[`CPU ${temperature}°C`, 'Supporting fan measurement'],evidenceControl:'View evidence',
  snapshot:JSON.stringify({metrics:{thermal:{value:[{temperatureC:temperature}]}}}),
}))};
test('new episode contract passes without legacy multi-finding lists and preserves them in Details',()=>{
  assert.equal(episodeLayout.rows.some(row=>row.findingCount>=2),false,'old multi-finding requirement would fail');
  assertGuardianActivityGeometry(episodeLayout,'thermal',{desktop:true});
  assertSentinelRawEvidenceState(rawEvidence,true,{minRows:2,minFindings:2});
  assertSentinelRawEvidenceState({...rawEvidence,visible:false,exposed:false,hit:false},false,{minRows:2,minFindings:2});
  assertGuardianActivityGeometry({...episodeLayout,rows:[{...episodeRow,identity:'Zombie process',evidence:'8 observations\n0 proven recurrences',resolution:'Present at last observation'}]},'zombie',{desktop:true});
});
for(const [name,patch] of Object.entries({
  identity:{identity:''},state:{state:'HEALTHY'},counts:{evidence:'No evidence'},resolution:{resolution:''},
  actionTruth:{action:''},rawSpam:{findingCount:2},missingTrend:{trendCount:0},missingAction:{actionCount:0},
  cells:{directChildCount:3},clipping:{escapingDescendants:['button']},collapsed:{bounds:{height:20}},
  alignment:{columnRects:[{left:90},{left:200},{left:400},{left:600}]},
})) test(`episode geometry rejects ${name}`,()=>assert.throws(()=>assertGuardianActivityGeometry({...episodeLayout,rows:[{...episodeRow,...patch}]},name,{desktop:true})));
test('episode geometry still rejects missing rows, overlap, overflow and wrong header',()=>{
  for(const patch of [{rowCount:0,rows:[]},{rowCrossings:[10]},{overflowY:'hidden'},{contentBottom:200},{headerColumnCount:3}])
    assert.throws(()=>assertGuardianActivityGeometry({...episodeLayout,...patch},'invalid',{desktop:true}));
});
test('raw evidence rejects loss, leaked hidden content, missing findings and damaged snapshots',()=>{
  for(const patch of [{retained:false},{visible:false},{exposed:false},{hit:false},{rows:rawEvidence.rows.slice(0,1)},
    {rows:rawEvidence.rows.map(row=>({...row,findings:[]}))},{rows:rawEvidence.rows.map(row=>({...row,snapshot:'{}'}))}])
    assert.throws(()=>assertSentinelRawEvidenceState({...rawEvidence,...patch},true,{minRows:2,minFindings:2}));
  for(const key of ['visible','exposed','hit'])
    assert.throws(()=>assertSentinelRawEvidenceState({...rawEvidence,visible:false,exposed:false,hit:false,[key]:true},false));
});
test('debug, candidate and installed paths exercise the same two-layer contract',async()=>{
  for(const file of ['tauri_e2e.mjs','tauri_candidate_precheck.mjs','tauri_production_readonly.mjs']) {
    const source=await readFile(new URL(`../scripts/${file}`,import.meta.url),'utf8');
    assert.match(source,/assertGuardianActivityGeometry\(await guardianActivityGeometry|assertGuardianActivityGeometry\(desktopActivityGeometry/);
    assert.match(source,/await assertSentinelRawEvidence\(/);
  }
});
for (const [key,value] of Object.entries({count:2,open:true,retainedContent:false,measurementVisible:true,
 measurementTextExposed:true,technicalTextExposed:true,measurementHit:true})) {
  test(`closed fixture rejects ${key}`,()=>assert.throws(()=>assertSentinelDetailsState({...closed,[key]:value},false)));
}
test('transaction receipt cannot reuse first acceptance as final or cross manifest bytes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'radcontrol-receipt-test-'));
  await mkdir(path.join(root,'evidence'),{mode:0o700});
  const manifest=path.join(root,'transaction-manifest.json'),state=path.join(root,'transaction-state');
  const identities={o2Sha:'a'.repeat(40),radcontrolSha:'b'.repeat(40),artifactSha256:'c'.repeat(64)};
  await writeFile(manifest,JSON.stringify({schemaVersion:2,transactionId:'fixture',stage:{root,stateFile:state},
    newPair:{o2Commit:identities.o2Sha,radcontrolSourceSha:identities.radcontrolSha,binarySha256:identities.artifactSha256}}));
  await writeFile(state,'new-live\n');
  const context=await transactionReceiptContext(['--transaction-manifest',manifest,'--phase','first'],identities);
  await assert.rejects(()=>transactionReceiptContext(['--transaction-manifest',manifest,'--phase','final'],identities));
  await writeFile(manifest,(await readFile(manifest,'utf8'))+' ');
  await assert.rejects(()=>writeTransactionReceipt(context,{ok:true}));
});
