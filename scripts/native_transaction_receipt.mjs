// Evidence belongs to the existing transaction stage; it is never source authority.
import { assertWave11Scenarios } from './native_wave11_receipt.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { sha256File } from './native_acceptance_lib.mjs';

export async function transactionReceiptContext(argv, identities) {
  const index = argv.indexOf('--transaction-manifest');
  if (index < 0) return null;
  const manifestPath = argv[index + 1];
  assert.equal(await realpath(manifestPath), manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const phase = argv[argv.indexOf('--phase') + 1];
  assert.ok(['first', 'final', 'rollback'].includes(phase));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifestPath, path.join(manifest.stage.root, 'transaction-manifest.json'));
  const pair = phase === 'rollback' ? manifest.oldPair : manifest.newPair;
  assert.equal(pair.o2Commit, identities.o2Sha);
  if (phase !== 'rollback') assert.equal(pair.radcontrolSourceSha, identities.radcontrolSha);
  assert.equal(pair.binarySha256, identities.artifactSha256);
  const state = (await readFile(manifest.stage.stateFile, 'utf8')).trim();
  assert.equal(state, phase === 'rollback' ? 'old-live' : phase === 'first' ? 'new-live' : 'new-live-awaiting-final');
  const directory = path.join(manifest.stage.root, 'evidence');
  assert.equal(await realpath(directory), directory);
  assert.equal((await lstat(directory)).mode & 0o077, 0);
  return { manifestPath, stateFile: manifest.stage.stateFile,
    output: path.join(directory, `native-${phase}.json`),
    binding: { phase, transactionId: manifest.transactionId,
      manifestSha256: await sha256File(manifestPath), transactionState: state } };
}

export async function writeTransactionReceipt(context, result) {
  if (context?.binding.phase === 'rollback') {
    assert.equal(result?.acceptance, 'rollback-native-smoke');
    assert.equal(result?.ok, true);
    assert.equal(result?.diagnosticsVerified, true);
  } else {
    assertWave11Scenarios(result?.wave11);
  }
  if (!context) return;
  assert.equal(await sha256File(context.manifestPath), context.binding.manifestSha256);
  assert.equal((await readFile(context.stateFile, 'utf8')).trim(), context.binding.transactionState);
  await writeFile(context.output, JSON.stringify({ ...result, ...context.binding }) + '\n', { flag: 'wx', mode: 0o600 });
}
