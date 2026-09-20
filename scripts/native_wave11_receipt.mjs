import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256File } from './native_acceptance_lib.mjs';

export const wave11Matrix = JSON.parse(await readFile(new URL('./native_wave11_matrix.json', import.meta.url), 'utf8'));

export function assertWave11Scenarios(result) {
  assert.equal(result?.ok, true, 'complete Wave 1.1 matrix receipt required');
  assert.equal(result?.realRepair, false, 'Wave 1.1 scenarios must be synthetic');
  assert.deepEqual(result?.scenarios, wave11Matrix.scenarios, 'complete Wave 1.1 scenario matrix required');
  assert.equal(result?.simulatedApplyCount, 2, 'confirmation and failure simulations required');
  return result;
}

export async function bindWave11Receipt(result, identities, entrypoint) {
  assertWave11Scenarios(result);
  for (const key of ['o2Sha', 'radcontrolSha']) assert.match(identities[key], /^[a-f0-9]{40}$/);
  assert.match(identities.artifactSha256, /^[a-f0-9]{64}$/);
  assert.ok(['tauri_candidate_precheck.mjs', 'tauri_production_readonly.mjs'].includes(entrypoint));
  const harnessDigests = {};
  for (const name of [...wave11Matrix.harnessFiles, `scripts/${entrypoint}`]) {
    harnessDigests[name] = await sha256File(new URL(`../${name}`, import.meta.url));
  }
  return { ...result, ...identities, schema: wave11Matrix.schema,
    kind: 'synthetic-ui-contract', harnessDigests };
}
