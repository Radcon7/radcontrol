import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const production = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).app.windows[0];
const responsive = JSON.parse(await readFile(new URL('../src-tauri/tauri.e2e.conf.json', import.meta.url), 'utf8')).app.windows[0];

export function nativeWidthContract(mode) {
  assert.ok(['production', 'e2e'].includes(mode), 'explicit native width class required');
  const minimum = mode === 'production' ? production.minWidth : responsive.minWidth;
  const widths = mode === 'production' ? [production.width, production.minWidth] : [production.width, 800, 600];
  assert.ok(widths.every(width => width >= minimum));
  return { kind: mode === 'production' ? 'production-supported-width' : 'test-owned-responsive-layout', minimum, widths };
}

export function assertWidthReceipt(receipt, mode) {
  const expected = nativeWidthContract(mode);
  assert.equal(receipt?.kind, expected.kind);
  assert.equal(receipt?.minimum, expected.minimum);
  assert.deepEqual(receipt?.widths, expected.widths);
  assert.deepEqual(receipt?.observations?.map(row => row.requested), expected.widths);
  for (const row of receipt.observations) {
    assert.ok(Number.isFinite(row.observed) && Math.abs(row.observed - row.requested) <= 2, 'requested native width must actually be observed');
    assert.ok(row.observed >= expected.minimum - 2);
  }
  return receipt;
}
