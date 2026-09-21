import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeWidthContract, assertWidthReceipt } from '../scripts/native_width_contract.mjs';

test('production never requests below the unchanged product minimum', () => {
  const contract = nativeWidthContract('production');
  assert.equal(contract.minimum, 1500);
  assert.deepEqual(contract.widths, [1650, 1500]);
  assert.ok(contract.widths.every(width => width >= contract.minimum));
});
test('relaxed E2E retains actual 800 and 600 coverage', () => {
  const contract = nativeWidthContract('e2e');
  assert.equal(contract.minimum, 500);
  assert.deepEqual(contract.widths, [1650, 800, 600]);
  const receipt = { ...contract, observations: contract.widths.map(width => ({requested:width, observed:width})) };
  assertWidthReceipt(receipt, 'e2e');
  assert.throws(() => assertWidthReceipt(receipt, 'production'));
  receipt.observations[1].observed = 1500;
  assert.throws(() => assertWidthReceipt(receipt, 'e2e'));
  assert.throws(() => nativeWidthContract());
});
