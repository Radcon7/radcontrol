import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSentinelDetailsState, assertSentinelHealthState } from '../scripts/native_sentinel_assertions.mjs';
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
