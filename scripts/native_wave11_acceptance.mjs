import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertWritableFixtureIsolation } from './native_acceptance_lib.mjs';
import { assertSentinelDetails } from './native_sentinel_assertions.mjs';

// All synthetic responses live behind the existing isolated E2E boundary.
// The production dispatcher and installed runtime are never replaced.
export async function runWave11Acceptance({ fixture, base, sessionId, request, click, eventually }) {
  await assertWritableFixtureIsolation(fixture);
  const execute = (script, args = []) => request(base, `/session/${sessionId}/execute/sync`, 'POST', {script, args});
  const tap = selector => click(base, sessionId, selector);
  const count = selector => execute('return document.querySelectorAll(arguments[0]).length;', [selector]);
  const text = selector => execute('return document.querySelector(arguments[0])?.innerText || "";', [selector]);
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
  const todoBefore = await readFile(fixture.empireTodoPath);
  await request(base, `/session/${sessionId}/window/rect`, 'POST', {width:1650,height:1000});
  await tap('[data-testid="notes-mode-empire_todo"]');
  await eventually(async()=> assert.ok(await count('.empireTodoRow')), 'queued tasks');
  assert.equal(await execute('return [...document.querySelectorAll(".empireTodoRow .todoProgress")].every(e=>/Not started|Planned/i.test(e.innerText));'), true);
  assert.equal(await count('[aria-label="Close task detail"]'),0,'queued master/detail has no ineffective close control');
  await screenshot('todo-queued');
  await tap('[data-testid="notes-mode-progress"]');
  await eventually(async()=> assert.ok(await count('.taskProgressRail') > 1), 'several active tasks');
  assert.ok(await count('.todoRowBlocker') > 0);
  assert.equal(await execute('return [...document.querySelectorAll(".taskProgressRail")].every(e=>!e.innerText.includes("%"));'), true);
  await screenshot('progress-state-only-blocked');
  await tap('.todoRowSelect');
  await eventually(async()=>assert.equal(await count('[data-testid="empire-todo-detail"]'),1),'inline task detail');
  assert.equal(await count('.todoDetail textarea'),8);
  await screenshot('progress-inline-detail');
  await tap('[aria-label="Close task detail"]');
  await request(base, `/session/${sessionId}/window/rect`, 'POST', {width:1500,height:820});
  await screenshot('progress-minimum-window');
  assert.deepEqual(await readFile(fixture.empireTodoPath),todoBefore,'read-only work navigation must not rewrite records');

  // Obtain complete shapes from the private fixture, then replace only its dispatcher.
  await tap('[data-testid="tab-projects"]');
  const dispatcher = path.join(fixture.o2Root,'scripts/run_o2.sh');
  for (const [verb,name] of [['sentinel.status','status'],['sentinel.host.current','current']]) {
    const result = spawnSync('bash',[dispatcher,verb], {encoding:'utf8',env:{...process.env,O2_ROOT_OVERRIDE:fixture.o2Root},timeout:60000});
    assert.equal(result.status,0,result.stderr);
    const response = JSON.parse(result.stdout);
    assert.equal(response.ok,true);
    await writeFile(path.join(fixture.o2Root,`wave11-${name}.json`),JSON.stringify(response));
  }
  const statePath = path.join(fixture.o2Root,'wave11-fixture.json');
  await writeFile(statePath,JSON.stringify({phase:'healthy'}));
  await rename(dispatcher,path.join(fixture.o2Root,'scripts/run_o2.actual.sh'));
  await cp(new URL('../tests/native_wave11_fixture.py',import.meta.url),path.join(fixture.o2Root,'scripts/native_wave11_fixture.py'));
  await writeFile(dispatcher,'#!/bin/bash\nset -euo pipefail\nexec python3 "$(dirname -- "$0")/native_wave11_fixture.py" "$@"\n',{mode:0o755});
  const calls = async()=> (await readFile(path.join(fixture.o2Root,'wave11-calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  const applyCount = async()=> (await calls()).filter(c=>c.verb.endsWith('pop_upgrade.apply')).length;
  async function scenario(phase) {
    await tap('[data-testid="tab-projects"]');
    await writeFile(statePath,JSON.stringify({phase}));
    await tap('[data-testid="tab-sentinel"]');
    await tap('[data-testid="security-mode-sentinel"]');
    await eventually(async()=>assert.match(await text('[data-testid="sentinel-current-now"]'),/Measured:/),'fresh scenario');
  }
  await scenario('healthy');
  await eventually(async()=> assert.match(await text('[data-testid="sentinel-current-now"]'),/HEALTHY/),'healthy card');
  assert.equal(await count('[data-testid="sentinel-fix-it"]'),0);
  await assertSentinelDetails(base,sessionId,false);
  await screenshot('sentinel-healthy');
  await tap('[data-testid="sentinel-open-details"]');
  await assertSentinelDetails(base,sessionId,true);
  await tap('.sentinelAdvancedWorkspace > summary');
  await assertSentinelDetails(base,sessionId,false);
  await scenario('actionable');
  await eventually(async()=>assert.equal(await count('[data-testid="sentinel-fix-it"]'),1),'exact actionable Fix it');
  await screenshot('sentinel-actionable');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'exact preview');
  assert.equal(await applyCount(),0,'entry and preview must not apply');
  await screenshot('sentinel-confirmation');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .btnGhost');
  assert.equal(await applyCount(),0,'cancel must not apply');
  await scenario('nonactionable');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-current-now"]'),/96°C/),'thermal issue');
  assert.equal(await count('[data-testid="sentinel-fix-it"]'),0);
  await tap('[data-testid="sentinel-review-current"]');
  assert.match(await text('[data-testid="sentinel-current-review"]'),/96°C/);
  await screenshot('sentinel-nonactionable');
  await scenario('multiple');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-finding-count"]'),/3 findings · 1 safely repairable/),'multiple findings');
  assert.match(await text('[data-testid="sentinel-current-now"]'),/Fix available: pop-upgrade.service/);
  await screenshot('sentinel-multiple');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'preview multiple');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .sentinelActions .btnPrimary');
  await eventually(async()=>assert.match(await text('[data-testid="sentinel-finding-count"]'),/2 findings · 0 safely repairable/),'remaining findings after simulated repair');
  assert.match(await text('[data-testid="sentinel-current-now"]'),/NEEDS ATTENTION/);
  assert.equal(await applyCount(),1);
  const afterApply=(await calls()).slice((await calls()).findIndex(c=>c.verb.endsWith('pop_upgrade.apply'))+1);
  assert.ok(afterApply.some(c=>c.verb==='sentinel.status'));
  assert.ok(afterApply.some(c=>c.verb==='sentinel.host.current'));
  await screenshot('sentinel-after-one-repair');
  await scenario('failure');
  await eventually(async()=>assert.equal(await count('[data-testid="sentinel-fix-it"]'),1),'failure fixture ready');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/),'failure preview');
  await tap('[data-testid="pop-upgrade-safe-cleanup"] .sentinelActions .btnPrimary');
  await eventually(async()=>assert.match(await text('.sentinelShell'),/did not verify recovery/),'failure remains explicit');
  assert.match(await text('[data-testid="sentinel-current-now"]'),/NEEDS ATTENTION/);
  assert.equal(await count('[data-testid="sentinel-fix-it"]'),0);
  await screenshot('sentinel-failed-authorization');
  await scenario('invalid-preview');
  await eventually(async()=>assert.equal(await count('[data-testid="sentinel-fix-it"]'),1),'invalid preview fixture ready');
  await tap('[data-testid="sentinel-fix-it"]');
  await eventually(async()=>assert.match(await text('.sentinelShell'),/no longer meets/),'invalid authorization metadata rejected');
  assert.doesNotMatch(await text('[data-testid="pop-upgrade-safe-cleanup"]'),/Authorize & fix/);
  assert.equal(await applyCount(),2);
  if(evidence) await writeFile(path.join(evidence,'native-wave11-results.json'),JSON.stringify({ok:true,numericProgress:'not applicable: no governed numeric source',realRepair:false,calls:await calls()},null,2));
  console.error('[e2e] Wave 1.1 native: queued, active/blocked rails, inline detail, healthy/actionable/nonactionable/multiple, preview/cancel/confirm, remaining findings, failed authorization, invalid preview, Details closed/open/reclosed passed');
}
