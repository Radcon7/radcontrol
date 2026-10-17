import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_OPERATOR_PROJECT_KEYS } from '../src/components/common/o2Contract.ts';
import { parseProjectListEnvelope } from '../src/components/projects/helpers.ts';
import { filterOperatorProjects } from '../src/components/projects/projectModel.ts';
import { hasRequiredProjectKeys, runtimeProductReady } from '../src/components/runtime/runtimeReadiness.ts';

const project = key => ({key, label: key, archetype: 'portal-private-app', repoPath: `/tmp/${key}`, repoAvailable: true, retired: false});
const legacy = REQUIRED_OPERATOR_PROJECT_KEYS.map(project);
const current = [...legacy, project('radcloud')];
const healthy = {
  runtimeMode: 'production', runtimeFilesReady: true, workReady: true,
  registryState: 'ready', requiredProjectKeys: REQUIRED_OPERATOR_PROJECT_KEYS,
  todoAvailable: true, localToolsCount: 2, sentinelAvailable: true,
};
function ready(envelope, overrides = {}) {
  let projects;
  try { projects = parseProjectListEnvelope(envelope); }
  catch { return false; } // App keeps registryState=error when this same parser rejects.
  return runtimeProductReady({...healthy, projectKeys: filterOperatorProjects(projects).map(row => row.key), ...overrides});
}
const response = projects => ({ok: true, projects});

test('original valid 12-project registry remains ready for compatibility', () => {
  assert.equal(legacy.length, 12);
  assert.equal(ready(response(legacy)), true);
});
test('current 13-project registry and future registered projects remain ready', () => {
  assert.equal(current.length, 13);
  assert.equal(ready(response(current)), true);
  assert.equal(ready(response([...current, project('future-product')])), true);
  assert.equal(ready(response([...current, {...project('o2'), archetype: 'governance'}])), true);
});
test('every required legacy project must remain operator-visible', () => {
  for (const key of REQUIRED_OPERATOR_PROJECT_KEYS) {
    assert.equal(ready(response(current.filter(row => row.key !== key))), false, key);
    assert.equal(ready(response(current.map(row => row.key === key ? {...row, archetype: 'governance'} : row))), false, key);
  }
});
test('duplicate required or additional project keys cannot become ready', () => {
  for (const duplicate of [current[0], project('radcloud'), project('future-product')]) {
    assert.equal(ready(response([...current, project('future-product'), duplicate])), false);
  }
  assert.equal(hasRequiredProjectKeys([...REQUIRED_OPERATOR_PROJECT_KEYS, REQUIRED_OPERATOR_PROJECT_KEYS[0]], REQUIRED_OPERATOR_PROJECT_KEYS), false);
});
test('unavailable, loading, or malformed registry data cannot become ready', () => {
  for (const envelope of [null, [], {ok: false, projects: current}, {ok: true}, response(null), response([null])]) {
    assert.equal(ready(envelope), false);
  }
  for (const bad of [null, {key: 'broken'}, {...project('broken'), repoAvailable: false}, {...project('broken'), repoPath: 'relative'}, {...project('broken'), archetype: 'unknown'}, {...project('broken'), retired: 'false'}]) {
    assert.equal(ready(response([...current, bad])), false);
  }
  for (const registryState of ['loading', 'error']) assert.equal(ready(response(current), {registryState}), false);
  for (const key of ['', ' ', ' padded ', null, 12]) assert.equal(hasRequiredProjectKeys([...REQUIRED_OPERATOR_PROJECT_KEYS, key], REQUIRED_OPERATOR_PROJECT_KEYS), false);
});
test('Work, Sentinel, bridge, production mode, To-Do and Local Tools still gate readiness', () => {
  for (const overrides of [
    {workReady: false}, {sentinelAvailable: false}, {runtimeFilesReady: false},
    {runtimeMode: 'development'}, {runtimeMode: undefined}, {todoAvailable: false},
    {localToolsCount: 1}, {localToolsCount: 3},
  ]) assert.equal(ready(response(current), overrides), false, JSON.stringify(overrides));
});
