import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertWritableFixtureIsolation } from './native_acceptance_lib.mjs';
import { assertSentinelDetails, assertSentinelHealth } from './native_sentinel_assertions.mjs';
import { assertWave11Scenarios, wave11Matrix } from './native_wave11_receipt.mjs';

// All synthetic responses live behind the existing isolated E2E boundary.
// The production dispatcher and installed runtime are never replaced.
export async function runWave11Acceptance({ fixture, base, sessionId, request, click, eventually }) {
  await assertWritableFixtureIsolation(fixture);
  const execute = (script, args = []) => request(base, `/session/${sessionId}/execute/sync`, 'POST', {script, args});
  const tap = selector => click(base, sessionId, selector);
  const count = selector => execute('return document.querySelectorAll(arguments[0]).length;', [selector]);
  const text = selector => execute('return document.querySelector(arguments[0])?.innerText || "";', [selector]);
  const health = (declaredCurrent, cardState, fixCount, reviewCount) => eventually(
    () => assertSentinelHealth(base, sessionId, {declaredCurrent, cardState, fixCount, reviewCount}),
    'semantic measurement health, operator presentation and governed actions');
  const evidence = process.env.RADCONTROL_WAVE11_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, {recursive:true});
  async function screenshot(name) {
    if (!evidence) return;
    await request(base, `/session/${sessionId}/execute/async`, 'POST', {
      script: 'const done=arguments[arguments.length-1]; requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(done,250)));', args: [],
    });
    const data = await request(base, `/session/${sessionId}/screenshot`);
    await writeFile(path.join(evidence, `${name}.png`), Buffer.from(data, 'base64'));
  }
  // Obtain complete shapes from the private fixture, then replace only its dispatcher.
  await tap('[data-testid="tab-projects"]');
  const dispatcher = path.join(fixture.o2Root,'scripts/run_o2.sh');
  for (const [verb,name] of [['sentinel.status','status'],['sentinel.host.current','current'],['empire.todo.list','tasks']]) {
    const result = spawnSync('bash',[dispatcher,verb], {encoding:'utf8',env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root},timeout:60000,maxBuffer:4*1024*1024});
    assert.equal(result.status,0,`${verb}: ${result.error?.code || result.signal || result.stderr}`);
    const response = JSON.parse(result.stdout);
    assert.equal(response.ok,true);
    await writeFile(path.join(fixture.o2Root,`wave11-${name}.json`),JSON.stringify(response));
  }
  const statePath = path.join(fixture.o2Root,'wave11-fixture.json');
  await writeFile(statePath,JSON.stringify({phase:'healthy'}));
  await rename(dispatcher,path.join(fixture.o2Root,'scripts/run_o2.actual.sh'));
  await cp(new URL('../tests/native_wave11_fixture.py',import.meta.url),path.join(fixture.o2Root,'scripts/native_wave11_fixture.py'));
  // Use the canonical host fixture path even when mounted at the production root.
  const fixtureScript = path.join(fixture.o2Root,'scripts/native_wave11_fixture.py');
  const quoted = "'" + fixtureScript.replaceAll("'", "'\"'\"'") + "'";
  await writeFile(dispatcher, `#!/bin/bash\nset -euo pipefail\nexec python3 ${quoted} "$@"\n`, {mode:0o755});
  const calls = async()=> (await readFile(path.join(fixture.o2Root,'wave11-calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  const applyCount = async()=> (await calls()).filter(c=>c.verb.endsWith('pop_upgrade.apply')).length;
  const tasksPath = path.join(fixture.o2Root, 'wave11-tasks.json');
  const tasks = JSON.parse(await readFile(tasksPath, 'utf8'));
  assert.ok(tasks.items.length > 0);
  const {progress:priorAssessment,...unassessedTemplate}=tasks.items[0];
  tasks.items = ['Backlog', 'Planned', 'In Progress', 'Blocked', 'Deferred', 'Legacy'].map((status, index) => ({
    ...unassessedTemplate, id: `wave11-${index}`, title: `Wave 1.1 ${status}`, status,
    currentState: `Synthetic ${status}`, nextActions: 'Verify next action',
    dependencies: status === 'Blocked' ? 'Wait for fixture dependency' : '',
  }));
  await writeFile(tasksPath, JSON.stringify(tasks));
  const passed = new Set();
  const pass = (...names) => names.forEach(name => passed.add(name));
  const todoBefore = await readFile(fixture.empireTodoPath);
  await request(base, `/session/${sessionId}/window/rect`, 'POST', {width:1650,height:1000});
  await tap('[data-testid="tab-projects"]');
  await tap('[data-testid="tab-notes"]');
  await tap('[data-testid="notes-mode-empire_todo"]');
  await eventually(async()=> assert.ok(await count('.empireTodoRow')), 'queued tasks');
  assert.equal(await execute('return [...document.querySelectorAll(".empireTodoRow .todoProgress")].every(e=>/Not started|Planned/i.test(e.innerText));'), true);
  assert.equal(await count('[aria-label="Close task detail"]'),0,'queued master/detail has no ineffective close control');
  assert.equal(await count('.empireTodoRow'), 2);
  assert.match(await text('.empireTodoList'), /Wave 1.1 Backlog[\s\S]*Wave 1.1 Planned|Wave 1.1 Planned[\s\S]*Wave 1.1 Backlog/);
  pass('queued-planned-backlog');
  const tabs = await execute('return [...document.querySelectorAll("[data-testid^=notes-mode-]")].map(e=>e.dataset.testid);');
  assert.equal(tabs.indexOf('notes-mode-progress'), tabs.indexOf('notes-mode-empire_todo') + 1);
  pass('progress-navigation');
  await tap('[data-testid="empire-todo-other-view"]');
  await eventually(async()=>assert.equal(await count('.empireTodoRow'),2),'Deferred and legacy remain accessible');
  assert.match(await text('.empireTodoList'), /Wave 1.1 Deferred/);
  assert.match(await text('.empireTodoList'), /Wave 1.1 Legacy/);
  pass('deferred-legacy');
  await screenshot('todo-queued');
  await tap('[data-testid="notes-mode-progress"]');
  await eventually(async()=> assert.ok(await count('.taskProgressRail') > 1), 'several active tasks');
  assert.ok(await count('.todoRowBlocker') > 0);
  assert.equal(await execute('return [...document.querySelectorAll(".taskProgressRail")].every(e=>!e.innerText.includes("%"));'), true);
  assert.equal(await count('.empireTodoRow'), 2);
  assert.match(await text('.empireTodoList'), /Wave 1.1 In Progress/);
  assert.match(await text('.empireTodoList'), /Wave 1.1 Blocked/);
  const rows = await execute(`return [...document.querySelectorAll('.empireTodoRow')].map(row=>({
    width: row.querySelector('.taskProgressRail').getBoundingClientRect().width,
    available: row.querySelector('.taskProgressContent').getBoundingClientRect().width,
    next: row.querySelector('.todoRowNext')?.innerText
  }));`);
  for (const row of rows) { assert.ok(row.width > row.available * .9); assert.match(row.next,/Verify next action/); }
  pass('active-blocked','full-width-rails-next-action-blocker','no-invented-percentage');
  await screenshot('progress-state-only-blocked');
  await tap('.todoRowSelect');
  await eventually(async()=>assert.equal(await count('[data-testid="empire-todo-detail"]'),1),'inline task detail');
  assert.equal(await count('.todoDetail textarea'),8);
  assert.equal(await count('.empireTodoRow'), 2);
  pass('detail-preserves-rows');
  await screenshot('progress-inline-detail');
  await tap('[aria-label="Close task detail"]');
  await request(base, `/session/${sessionId}/window/rect`, 'POST', {width:1500,height:820});
  await screenshot('progress-minimum-window');
  assert.deepEqual(await readFile(fixture.empireTodoPath),todoBefore,'read-only work navigation must not rewrite records');

  async function scenario(phase) {
    await tap('[data-testid="tab-projects"]');
    await writeFile(statePath,JSON.stringify({phase}));
    await tap('[data-testid="tab-sentinel"]');
    await tap('[data-testid="security-mode-sentinel"]');
    await eventually(async()=>assert.match(await text('[data-testid="sentinel-current-now"]'),/Measured:/),'fresh scenario');
  }
  await scenario('healthy');
  await health('HEALTHY', 'HEALTHY', 0, 0);
  assert.equal(await count('[data-testid="sentinel-fix-it"]'),0);
  await assertSentinelDetails(base,sessionId,false);
  pass('healthy-no-fix');
  assert.equal(await count('[data-testid=sentinel-current-now]'),1);
  assert.match(await text('.sentinelShell'), /RECENT EVENTS/);
  pass('current-now-history');
  await screenshot('sentinel-healthy');
  await tap('[data-testid="sentinel-open-details"]');
  await assertSentinelDetails(base,sessionId,true);
  await tap('.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base,sessionId,false);
  pass('details-rendered-text-hit-testing');
  await scenario('actionable');
  await eventually(async()=>assert.equal(await count('[data-testid="sentinel-fix-it"]'),1),'exact actionable Fix it');
  await health('HEALTHY', 'ATTENTION', 1, 0);
  assert.equal(await count('[data-testid="sentinel-review-current"]'),0,'one safely repairable finding needs only Fix it and Details');
  await screenshot('sentinel-actionable');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'exact preview');
  assert.equal(await applyCount(),0,'entry and preview must not apply');
  await screenshot('sentinel-confirmation');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .btnGhost');
  assert.equal(await applyCount(),0,'cancel must not apply');
  pass('actionable-preview-cancel');
  await scenario('nonactionable');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-current-now"]'),/96°C/),'thermal issue');
  assert.equal(await count('[data-testid="sentinel-fix-it"]'),0);
  await tap('[data-testid="sentinel-review-current"]');
  assert.match(await text('[data-testid="sentinel-current-review"]'),/96°C/);
  await health('ATTENTION', 'ATTENTION', 0, 1);
  pass('nonactionable-review');
  await screenshot('sentinel-nonactionable');
  await scenario('multiple');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-finding-count"]'),/3 findings · 1 safely repairable/),'multiple findings');
  await health('ATTENTION', 'ATTENTION', 1, 1);
  assert.match(await text('[data-testid="sentinel-current-now"]'),/Fix available: pop-upgrade.service/);
  await screenshot('sentinel-multiple');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'preview multiple');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .sentinelActions .btnPrimary');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-finding-count"]'),/2 findings · 0 safely repairable/),'remaining findings after simulated repair');
  await health('ATTENTION', 'ATTENTION', 0, 1);
  assert.equal(await applyCount(),1);
  const afterApply=(await calls()).slice((await calls()).findIndex(c=>c.verb.endsWith('pop_upgrade.apply'))+1);
  assert.ok(afterApply.some(c=>c.verb==='sentinel.status'));
  assert.ok(afterApply.some(c=>c.verb==='sentinel.host.current'));
  pass('confirmation-simulated-repair','multiple-findings-remain');
  await screenshot('sentinel-after-one-repair');
  await scenario('failure');
  await eventually(async()=>assert.equal(await count('[data-testid="sentinel-fix-it"]'),1),'failure fixture ready');
  await health('HEALTHY', 'ATTENTION', 1, 0);
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'failure preview');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .sentinelActions .btnPrimary');
  await eventually(async()=>assert.match(await text('.sentinelShell'),/did not verify recovery/),'failure remains explicit');
  await health('HEALTHY', 'ATTENTION', 0, 1);
  assert.equal(await count('[data-testid="sentinel-fix-it"]'),0);
  pass('repair-failure');
  await screenshot('sentinel-failed-authorization');
  await scenario('invalid-preview');
  await eventually(async()=>assert.equal(await count('[data-testid="sentinel-fix-it"]'),1),'invalid preview fixture ready');
  await health('HEALTHY', 'ATTENTION', 1, 0);
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('.sentinelShell'),/no longer meets/),'invalid authorization metadata rejected');
  assert.doesNotMatch(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/);
  assert.equal(await applyCount(),2);
  pass('invalid-preview');
  await tap('[data-testid="security-mode-empire_operations"]');
  await eventually(async()=>assert.match(await text('.securityControlRoom'), /OPERATIONAL TRUTH/),'Empire Operations');
  await tap('[data-testid="security-mode-security_guardian"]');
  await eventually(async()=>assert.match(await text('.securityControlRoom'), /VISIBILITY NOW/),'Security Guardian');
  pass('three-security-workspaces');
  await tap('button[title^="Show the installed app build"]');
  await eventually(async()=>assert.match(await text('.runtimeModalCard'), /Runtime & Build/),'Runtime Diagnostics');
  assert.ok(await count('.runtimeModalCard'));
  await tap('.runtimeModalCard .btnGhost');
  pass('runtime-diagnostics');
  assert.deepEqual(await readFile(fixture.empireTodoPath),todoBefore,'scenarios must not write task data');
  const result = {ok:true, realRepair:false, scenarios: wave11Matrix.scenarios.filter(name=>passed.has(name)), simulatedApplyCount:await applyCount()};
  assertWave11Scenarios(result);
  if(evidence) await writeFile(path.join(evidence,'native-wave11-results.json'),JSON.stringify({...result,calls:await calls()},null,2));
  console.error('[native] complete shared Wave 1.1 synthetic scenario matrix passed');
  return result;
}
