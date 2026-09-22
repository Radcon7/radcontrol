import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeWidthContract } from '../scripts/native_width_contract.mjs';
import { assertWave2aReceipt, assertWave11Scenarios, bindWave11Receipt, wave11Matrix } from '../scripts/native_wave11_receipt.mjs';
import { transactionReceiptContext, writeTransactionReceipt } from '../scripts/native_transaction_receipt.mjs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const width=()=>({...nativeWidthContract('production'),observations:[{requested:1650,observed:1650},{requested:1500,observed:1500}]});
const complete=()=>({ok:true,realRepair:false,scenarios:[...wave11Matrix.scenarios],simulatedApplyCount:2,wave2a:{ok:true,bridgeReadOnly:true,readiness:[...wave11Matrix.workReadinessScenarios],width:width(),taskProgress:{ok:true,checks:[...wave11Matrix.taskProgressScenarios],width:width()}}});
for(const entrypoint of ['tauri_candidate_precheck.mjs','tauri_production_readonly.mjs']) {
  test(`${entrypoint}: missing or incomplete matrix cannot become release acceptance`,async()=>{
    const ids={o2Sha:'a'.repeat(40),radcontrolSha:'b'.repeat(40),artifactSha256:'c'.repeat(64)};
    await assert.rejects(bindWave11Receipt(undefined,ids,entrypoint),/matrix receipt required/);
    for(const scenario of wave11Matrix.scenarios) {
      const result=complete();result.scenarios=result.scenarios.filter(s=>s!==scenario);
      await assert.rejects(bindWave11Receipt(result,ids,entrypoint),/complete Wave 1.1 scenario matrix/);
    }
    const receipt=await bindWave11Receipt(complete(),ids,entrypoint);
    assert.equal(receipt.artifactSha256,ids.artifactSha256);
    assert.equal(receipt.kind,'synthetic-ui-contract');
    assert.match(receipt.harnessDigests[`scripts/${entrypoint}`],/^[a-f0-9]{64}$/);
    for (const file of ['scripts/native_sentinel_assertions.mjs', 'scripts/native_wave11_acceptance.mjs', 'scripts/native_wave11_matrix.json', `scripts/${entrypoint}`]) {
      const bytes = await readFile(new URL(`../${file}`, import.meta.url));
      assert.equal(receipt.harnessDigests[file], createHash('sha256').update(bytes).digest('hex'), `${file} must bind the executed semantics`);
    }
    const entry = await readFile(new URL(`../scripts/${entrypoint}`, import.meta.url), 'utf8');
    assert.match(entry, /await assertSentinelHealth\(base,\s*session(?:Id)?\)/, 'real release surface must use shared health assertions');
  });
}
test('production transaction writer rejects a generic narrower result',async()=>{
  await assert.rejects(writeTransactionReceipt(null,{ok:true}),/matrix receipt required/);
});
test('rollback receipt context binds explicit old source and retains legacy shapes',async(t)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'radcontrol-rollback-receipt-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'evidence'),{mode:0o700});
  const state=path.join(root,'transaction-state'),manifest=path.join(root,'transaction-manifest.json');
  await writeFile(state,'old-live\n');
  const identities={o2Sha:'a'.repeat(40),radcontrolSha:'b'.repeat(40),artifactSha256:'c'.repeat(64)};
  const value={schemaVersion:2,transactionId:'fixture',stage:{root,stateFile:state},oldPair:{o2Commit:identities.o2Sha,binarySha256:identities.artifactSha256}};
  const argv=['--transaction-manifest',manifest,'--phase','rollback'];
  for(const source of [undefined,identities.radcontrolSha]) {
    value.oldPair.radcontrolSourceSha=source;await writeFile(manifest,JSON.stringify(value));
    assert.equal((await transactionReceiptContext(argv,identities)).binding.phase,'rollback');
  }
  value.oldPair.radcontrolSourceSha='d'.repeat(40);await writeFile(manifest,JSON.stringify(value));
  await assert.rejects(transactionReceiptContext(argv,identities));
});
test('real repair or unexecuted confirmation cannot be a synthetic receipt',()=>{
  assert.throws(()=>assertWave11Scenarios({...complete(),realRepair:true}),/synthetic/);
  assert.throws(()=>assertWave11Scenarios({...complete(),simulatedApplyCount:0}),/simulations required/);
});

test('release receipt rejects missing bridge or false width evidence',()=>{
 const result=complete(); delete result.wave2a; assert.throws(()=>assertWave2aReceipt(result),/Wave 2A native/);
 const bad=complete(); bad.wave2a.width.observations[1].observed=800; assert.throws(()=>assertWave2aReceipt(bad));
});

test('release receipt requires every real Work readiness scenario',()=>{
 for(const scenario of wave11Matrix.workReadinessScenarios) {
  const result=complete();result.wave2a.readiness=result.wave2a.readiness.filter(s=>s!==scenario);
  assert.throws(()=>assertWave2aReceipt(result),/Work readiness matrix/);
 }
});
test('release receipt requires every task progress scenario and observed width',()=>{
 for(const scenario of wave11Matrix.taskProgressScenarios) {
  const result=complete();result.wave2a.taskProgress.checks=result.wave2a.taskProgress.checks.filter(s=>s!==scenario);
  assert.throws(()=>assertWave2aReceipt(result),/task progress matrix/);
 }
 const missing=complete();delete missing.wave2a.taskProgress;assert.throws(()=>assertWave2aReceipt(missing),/task progress native/);
 const wrong=complete();wrong.wave2a.taskProgress.width.observations[1].observed=800;assert.throws(()=>assertWave2aReceipt(wrong));
});
