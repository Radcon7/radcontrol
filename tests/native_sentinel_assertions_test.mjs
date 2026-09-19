import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSentinelDetailsState } from '../scripts/native_sentinel_assertions.mjs';
import { transactionReceiptContext, writeTransactionReceipt } from '../scripts/native_transaction_receipt.mjs';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
