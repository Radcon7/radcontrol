// Native acceptance reads O2's validated authority independently of the UI.
// Private records stay in memory or an ephemeral private namespace, never receipts.
import { cp, mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { readinessInventory } from './native_work_readiness.mjs';
import { request } from './native_workspace.mjs';
import { empireTodoLane as taskLane } from '../src/components/notes/empireTodoModel.ts';
export { taskLane };

const digest = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();
const requireWork = (ok, message) => { if (!ok) throw new Error(`Work acceptance: ${message}`); };

export function projectWork(value) {
  requireWork(value && Number.isInteger(value.revision) && value.revision >= 0 &&
    value.data && ['tasks','events','initiatives','projectNotes'].every(k => Array.isArray(value.data[k])),
  'authoritative evidence unavailable or invalid');
  const tasks = value.data.tasks.map(row => {
    requireWork(row && typeof row.id === 'string' && row.id && typeof row.title === 'string' && row.title.trim() &&
      typeof row.status === 'string', 'authoritative task invalid');
    return {id:row.id, title:row.title, status:row.status};
  });
  requireWork(new Set(tasks.map(row => row.id)).size === tasks.length, 'duplicate authoritative task identity');
  // RuntimeDiagnosticsModal maps listWork().data.tasks to titles, without a
  // lifecycle filter. Events, initiatives and history are not durable tasks.
  return {authority:value.revision > 0 ? 'private' : 'legacy-readonly', revision:value.revision,
    tasks, initiativeIds:value.data.initiatives.map(row => row.id)};
}

function validatedWork(o2Root, workRoot) {
  const env = {...process.env, PYTHONDONTWRITEBYTECODE:'1'};
  delete env.O2_ROOT; delete env.O2_ROOT_OVERRIDE;
  const result = spawnSync('python3', ['-B','-c', `
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1])/'scripts'))
from o2_operator_work import WorkStore, validate_domain, import_legacy
try:
    value=WorkStore(Path(sys.argv[2]),validate=validate_domain).read(lambda:import_legacy(Path(sys.argv[1])))
    print(json.dumps(value))
except Exception:
    sys.exit(1)
`, o2Root, workRoot], {env,encoding:'utf8',timeout:10000,maxBuffer:5*1024*1024});
  requireWork(!result.error && result.status === 0, 'authoritative evidence unavailable; O2 validation failed');
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('Work acceptance: authoritative evidence unavailable; invalid response'); }
}

async function inventory(root) {
  try { return await readinessInventory(root); }
  catch (error) {
    // Only a genuinely never-activated absent store may use O2's legacy reader.
    if (error.code !== 'ENOENT') throw new Error('Work acceptance: authority inventory unavailable');
    try { await readFile(path.join(path.dirname(root),'operator-work.activated')); }
    catch (markerError) { if (markerError.code === 'ENOENT') return {}; }
    throw new Error('Work acceptance: activated authority unavailable');
  }
}

export async function snapshotWork(o2Root, workRoot, reader = validatedWork) {
  const before = await inventory(workRoot);
  const value = reader(o2Root, workRoot);
  const projection = projectWork(value);
  const after = await inventory(workRoot);
  requireWork(isDeepStrictEqual(before,after), 'state drift during snapshot; retry with a fresh baseline');
  return {...projection, contentSha256:digest(JSON.stringify(value)), files:after};
}

export function assertWorkUnchanged(before, after) {
  requireWork(before.revision === after.revision && before.contentSha256 === after.contentSha256 &&
    isDeepStrictEqual(before.files,after.files), 'state drift since snapshot; fresh acceptance required');
}

export function workReceipt(snapshot) {
  return {authority:snapshot.authority, revision:snapshot.revision, taskCount:snapshot.tasks.length,
    initiativeCount:snapshot.initiativeIds.length, contentSha256:snapshot.contentSha256,
    storeSha256:snapshot.files['operator-work/work.json'] || null};
}

export async function copyWorkSnapshot(o2Root, source, destination) {
  const before = await snapshotWork(o2Root,source);
  await mkdir(destination,{mode:0o700});
  if (Object.keys(before.files).length) {
    await cp(source,destination,{recursive:true});
    await cp(path.join(path.dirname(source),'operator-work.activated'),path.join(path.dirname(destination),'operator-work.activated'));
  }
  const copy = await snapshotWork(o2Root,destination);
  assertWorkUnchanged(before,copy);
  assertWorkUnchanged(before,await snapshotWork(o2Root,source));
  return before;
}

export function assertWorkDiagnostics(view, expected) {
  requireWork(view?.state === (expected.authority === 'private' ? 'private' : 'bridge'), 'wrong displayed authority');
  requireWork(view.ready === true, 'durable tasks not ready');
  requireWork(view.label === `Empire To-Do · ${expected.tasks.length} durable items`, 'incorrect displayed durable-task count');
  const titles = expected.tasks.map(task => task.title).join(' · ') || 'To-Do data unavailable';
  requireWork(typeof view.detail === 'string' && normalize(view.detail) === normalize(titles), 'displayed durable-task set differs from authority');
}

export async function assertNativeWorkDiagnostics(base, session, expected) {
  const view = await request(base,`/session/${session}/execute/sync`,'POST',{script:`
    const modal=document.querySelector('.runtimeModalCard');
    const row=[...(modal?.querySelectorAll('.runtimeCheckRow') || [])].find(e=>e.querySelector('strong')?.innerText.startsWith('Empire To-Do · '));
    return {state:modal?.querySelector('[data-testid=runtime-work-readiness]')?.dataset.state,
      ready:row?.querySelector('.pill')?.innerText==='READY',label:row?.querySelector('strong')?.innerText,detail:row?.querySelector('small')?.innerText};`,args:[]});
  assertWorkDiagnostics(view,expected);
}

export function assertWorkRows(rows, expected, lane) {
  const tasks = expected.tasks.filter(row => taskLane(row.status) === lane);
  requireWork(Array.isArray(rows) && rows.length === tasks.length &&
    new Set(rows.map(row => row.id)).size === tasks.length, 'displayed task count or identities differ from authority');
  requireWork(tasks.every(task => rows.some(row => row.id === task.id && normalize(row.title) === normalize(task.title))),
    'expected task missing or title changed');
}

export async function assertNativeWorkRows(base, session, expected, click, until) {
  await click('[data-testid="tab-notes"]');
  const routes = [['empire_todo','active','queued'],['empire_todo','completed','completed'],
    ...(expected.tasks.some(row=>taskLane(row.status)==='other') ? [['empire_todo','other','other']] : []),
    ['progress','active','progress']];
  for (const [mode,view,lane] of routes) {
    await click(`[data-testid="notes-mode-${mode}"]`);
    await click(`[data-testid="empire-todo-${view}-view"]`);
    await until(async () => {
      const state = await request(base,`/session/${session}/execute/sync`,'POST',{script:`
        const root=document.querySelector('[data-testid=empire-todo-workspace]');
        return {ready:!!root?.querySelector('.todoCount'),rows:[...(root?.querySelectorAll('.todoRowSelect') || [])].map(e=>({id:e.dataset.testid.replace('empire-todo-select-',''),title:e.querySelector('.todoRowTitle strong')?.innerText}))};`,args:[]});
      requireWork(state.ready, 'task workspace unavailable');
      assertWorkRows(state.rows,expected,lane);
    });
  }
  return ['authoritative-durable-count','authoritative-task-identities-titles','all-task-lanes'];
}
