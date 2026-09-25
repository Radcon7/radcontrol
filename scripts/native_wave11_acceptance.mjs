import { runOrderedWorkspaceSequence } from './native_workspace_sequence.mjs';
import { assertWorkspace, workspaceText, workspaceFixture } from './native_workspace.mjs';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertWritableFixtureIsolation } from './native_acceptance_lib.mjs';
import { assertSentinelDetails, assertSentinelHealth, guardianActivityGeometry, assertGuardianActivityGeometry, assertSentinelRawEvidence } from './native_sentinel_assertions.mjs';
import { assertWave11Scenarios, wave11Matrix } from './native_wave11_receipt.mjs';

// All synthetic responses live behind the existing isolated E2E boundary.
// The production dispatcher and installed runtime are never replaced.
export async function runWave11Acceptance({ fixture, base, sessionId, request, click, eventually }) {
  await assertWritableFixtureIsolation(fixture);
  let activeWorkspace=null;
  const execute = async (script, args = []) => {
    if(activeWorkspace) await assertWorkspace(base,sessionId,activeWorkspace);
    return request(base, `/session/${sessionId}/execute/sync`, 'POST', {script, args});
  };
  const tap = selector => click(base, sessionId, selector);
  const count = selector => execute('return (arguments[1] ? document.querySelector(arguments[1]) : document).querySelectorAll(arguments[0]).length;', [selector, activeWorkspace === 'sentinel' ? '[data-testid="radcon-sentinel"]' : null]);
  const text = selector => activeWorkspace ? workspaceText(base,sessionId,activeWorkspace,selector) : execute('return document.querySelector(arguments[0])?.innerText || "";', [selector]);
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
    activeWorkspace=null;
    workspaceFixture(base,sessionId,{phase});
    await tap('[data-testid="tab-projects"]');
    await writeFile(statePath,JSON.stringify({phase}));
    await tap('[data-testid="tab-sentinel"]');
    await tap('[data-testid="security-mode-sentinel"]');
    activeWorkspace='sentinel';
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
  assert.match(await text('[data-testid="host-guardian-status-strip"]'), /30-second wake/);
  assert.doesNotMatch(await text('[data-testid="advanced-scan-coverage"]'), /15-minute wake/);
  await screenshot("sentinel-details-expanded");
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
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-diagnosis-result"]'),/96°C/),'one diagnostic result');
  await health('ATTENTION', 'ATTENTION', 0, 1);
  pass('nonactionable-review');
  await screenshot('sentinel-nonactionable');
  await scenario('multiple');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-finding-count"]'),/3 current concerns · 1 safe governed action available/),'multiple findings');
  await health('ATTENTION', 'ATTENTION', 1, 0);
  assertGuardianActivityGeometry(await guardianActivityGeometry(base,sessionId), 'multiple concern fixture', {desktop:true});
  const multiRaw = await assertSentinelRawEvidence(base,sessionId,tap,{minRows:1,minFindings:3});
  assert.equal(multiRaw.rows[0].findings.length,3,'all three raw findings remain under Details');
  assert.match(await text('[data-testid="sentinel-current-now"]'),/Fix available: pop-upgrade.service/);
  await screenshot('sentinel-multiple');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'preview multiple');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .sentinelActions .btnPrimary');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-finding-count"]'),/2 current concerns · no automatic repair/),'remaining findings after simulated repair');
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
  for (const [phase, label] of [['updater-checking','CHECKING UPDATER'],['updater-recovering','RECOVERING UPDATER'],['updater-blocked','RECOVERY BLOCKED'],['updater-recovered','Previous updater recovery'],['updater-history','Previous updater recovery'],['updater-manual','YOUR ACTION NEEDED']]) {
    await scenario(phase);
    await eventually(async()=>assert.match(await text('[data-testid="sentinel-updater-workflow"]'),new RegExp(label)),phase);
    assert.equal(await count('[data-testid="sentinel-updater-workflow"]'),1);
    if(['updater-blocked','updater-manual'].includes(phase)) await health('HEALTHY','ATTENTION',0,1);
    if(phase==='updater-checking') await health('HEALTHY','WATCHING',0,1);
    if(phase==='updater-recovering') assert.doesNotMatch(await text('[data-testid="sentinel-current-now"]'),/no automatic repair/,'an active recovery must not be labelled absent');
    assert.equal(await count('[data-testid="recent-guardian-activity"] button:not(.guardianActivityToggle)'),0,'history must not offer recursive Investigate actions');
    assert.equal(await execute(`return document.querySelector('[data-testid="sentinel-current-now"]').querySelectorAll('button:not([data-testid="sentinel-open-details"])').length;`),1,'one primary action');
    if(phase==='updater-history') {
      await health('HEALTHY','HEALTHY',0,0);
      assert.match(await text('[data-testid="sentinel-updater-workflow"]'),/9\/15\/2026[\s\S]*Historical result/);
      assert.equal(await count('[data-testid="sentinel-updater-workflow"] button'),0,'historical result has no action');
    }
    if(phase==='updater-recovered') {
      assert.match(await text('[data-testid="sentinel-updater-workflow"]'),/9\/15\/2026/,'retained recovery is dated');
      assert.match(await text('[data-testid="sentinel-current-now"]'),/NEEDS ATTENTION[\s\S]*96°C/,'updater recovery cannot clear heat');
    }
    await screenshot(phase);
    pass(phase);
  }
  for(const phase of ['productive-load','user-application-load']) {
    await scenario(phase);
    await eventually(async()=>assert.match(await text('[data-testid="sentinel-current-now"]'),/WATCHING/),phase);
    await tap('[data-testid="sentinel-fans-loud"]');
    await eventually(async()=>assert.match(await text('[data-testid="sentinel-workload-attribution"]'),phase==='productive-load'?/Recognized build\/test/:/User application CPU/),phase+' attribution');
    assert.equal(await count('[data-testid="sentinel-fix-it"]'),0,'workload attribution grants no repair');
    await screenshot(phase);pass(phase);
  }
  for (const [phase, currentCount, expectedState] of [
    ['context-zombies', 1, 'WATCHING'], ['context-growth', 1, 'NEEDS ATTENTION'],
    ['context-impact', 1, 'NEEDS ATTENTION'], ['context-history', 0, 'WATCHING'],
    ['context-three', 3, 'NEEDS ATTENTION'], ['context-updater', 2, 'NEEDS ATTENTION'],
  ]) {
    await scenario(phase);
    await eventually(async()=> {
      assert.match(await text('[data-testid="sentinel-current-now"]'), new RegExp(expectedState));
      assert.match(await text('[data-testid="sentinel-finding-count"]'), new RegExp(`^${currentCount} current concern`));
    }, phase);
    if (phase === 'context-zombies') {
      assert.match(await text('[data-testid="sentinel-current-now"]'), /3 zombie child processes detected[\s\S]*Parents are alive; no current impact observed[\s\S]*No automatic action is needed/);
      assert.doesNotMatch(await text('[data-testid="sentinel-current-now"]'), /NEEDS ATTENTION|needs your help/i);
    }
    assert.equal(await count('[data-testid="sentinel-fix-it"]'), phase === 'context-updater' ? 1 : 0);
    await tap('[data-testid="sentinel-open-details"]');
    assert.match(await text('.sentinelShell'), /Historical fixture/, 'history remains available under Details');
    await tap('.sentinelAdvancedWorkspace > summary');
    await execute(`document.querySelector('[data-testid="sentinel-current-now"]').scrollIntoView({block:'start'});`);
    await screenshot(phase);
    pass(phase);
  }
  for (const phase of ['watching', 'recurrent', 'zombie', 'unknown', 'diagnosis']) {
    await scenario(phase);
    await health(phase === 'unknown' ? 'UNKNOWN' : 'HEALTHY', phase === 'unknown' ? 'UNKNOWN' : 'WATCHING', 0, 1);
    await screenshot(`sentinel-wave2a-${phase}-current`);
    if (phase !== 'unknown') {
      assert.equal(await count('[data-testid="recent-guardian-activity"] [data-testid="guardian-activity-row"]'), 1);
      const layout = await guardianActivityGeometry(base,sessionId);
      assertGuardianActivityGeometry(layout, `${phase} episode fixture`, {desktop:true});
      assert.equal(layout.rows[0].identity,phase === 'zombie' ? '1 zombie child processes detected' : 'Thermal activity');
      assert.equal(layout.rows[0].state,'WATCHING');
      const raw = await assertSentinelRawEvidence(base,sessionId,tap,{minRows:phase === 'zombie' ? 8 : phase === 'recurrent' ? 5 : 2});
      if (phase === 'recurrent') {
        // The compact concern summarizes the latest recurrence (96°C); the
        // earlier 94→102°C occurrence remains separately inspectable evidence.
        assert.match(layout.rows[0].evidence,/3 observations[\s\S]*1 proven recurrences[\s\S]*Peak 96°C/);
        assert.deepEqual(raw.rows.map(row=>JSON.parse(row.snapshot).metrics.thermal.value[0].temperatureC).sort((a,b)=>a-b),[60,60,94,96,102]);
      }
      if (phase === 'zombie') {
        assert.match(layout.rows[0].evidence,/8 observations[\s\S]*0 proven recurrences/);
        assert.equal(raw.rows.length,8);
        for(const row of raw.rows) assert.equal(JSON.parse(row.snapshot).metrics.projectRuntimes.value.zombies.count,1);
      }
      await tap('[data-testid="sentinel-episode-details"] > summary');
      assert.equal(await execute(`return document.querySelector('[data-testid="sentinel-episode-details"]').open;`), true);
      assert.match(await text('[data-testid="recent-guardian-activity"]'), /actual duration unknown/);
      if (phase === 'recurrent') assert.match(await text('[data-testid="recent-guardian-activity"]'), /1 proven recurrences/);
      if (phase === 'zombie') assert.match(await text('[data-testid="recent-guardian-activity"]'), /8 observations[\s\S]*process birth identity/);
    }
    if (phase === 'diagnosis') {
      await tap('[data-testid="sentinel-review-current"], [data-testid="sentinel-diagnose-fix"]');
      await eventually(async()=>assert.match(await text('[data-testid="sentinel-diagnosis-result"]'), /DIAGNOSIS COMPLETE[\s\S]*WATCHING[\s\S]*fixture-worker/), 'dated diagnosis with retained process context');
      assert.equal(await count('[data-testid="sentinel-diagnosis-result"]'), 1);
      const contextBefore = await text('[data-testid="sentinel-diagnosis-result"] [data-testid="sentinel-process-context"]');
      await execute('document.dispatchEvent(new Event("visibilitychange"));');
      await eventually(async()=>assert.equal(await text('[data-testid="sentinel-diagnosis-result"] [data-testid="sentinel-process-context"]'), contextBefore), 'foreground cannot erase completed process context');
      pass('sentinel-process-provenance', 'sentinel-concise-diagnosis');
    }
    await screenshot(`sentinel-wave2a-${phase}`);
    pass(`sentinel-${phase}`);
  }
  pass('sentinel-episode-history');
  await tap('[data-testid="security-mode-empire_operations"]');
  activeWorkspace='empire_operations';
  await eventually(async()=>assert.match(await text('[data-testid=empire-operations-workspace]'), /OPERATIONAL TRUTH/),'Empire Operations');
  await tap('[data-testid="security-mode-security_guardian"]');
  activeWorkspace='security_guardian';
  await eventually(async()=>assert.match(await text('[data-testid=security-guardian-workspace]'), /VISIBILITY NOW/),'Security Guardian');
  pass('three-security-workspaces');
  await tap('button[title^="Show the installed app build"]');
  activeWorkspace='runtime';
  await eventually(async()=>assert.match(await text('.runtimeModalCard'), /Runtime & Build/),'Runtime Diagnostics');
  assert.ok(await count('.runtimeModalCard'));
  await tap('.runtimeModalCard .btnGhost');
  pass('runtime-diagnostics');
  assert.deepEqual(await readFile(fixture.empireTodoPath),todoBefore,'scenarios must not write task data');
  activeWorkspace=null;
  const orderedNavigation=await runOrderedWorkspaceSequence({fixture,base,sessionId,request});
  const result = {ok:true, realRepair:false,orderedNavigation, scenarios: wave11Matrix.scenarios.filter(name=>passed.has(name)), simulatedApplyCount:await applyCount()};
  assertWave11Scenarios(result);
  if(evidence) await writeFile(path.join(evidence,'native-wave11-results.json'),JSON.stringify({...result,calls:await calls()},null,2));
  console.error('[native] complete shared Wave 1.1 synthetic scenario matrix passed');
  return result;
}
