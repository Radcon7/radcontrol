// Shared current-product acceptance. All interactions here are navigation/read only.
import assert from 'node:assert/strict';
import { request, nativeClick, assertWorkspace } from './native_workspace.mjs';
export const fourTabIds = ['tab-sentinel', 'tab-agents', 'tab-notes', 'tab-projects'];
export const fourTabLabels = ['Security', 'Agents', 'Notes', 'Projects'];
export const fourTabChecks = ['exact-tab-order','repositories','local-tools','agents','notes','security','runtime','no-retired-tabs','no-runtime-errors'];
export function assertFourTabState(tabs) {
  assert.deepEqual(tabs.map(t=>t.id),fourTabIds,'exact four top-level tabs and order required');
  assert.deepEqual(tabs.map(t=>t.label),fourTabLabels,'four top-level labels required');
}
export function assertRepositoryRows(rows, expected) {
  assert.deepEqual([...rows].sort(),expected.map(p=>`project-row-${p.key}`).sort(),'registry-backed repositories must appear exactly once');
}
export function assertRepositoryPaths(projects, expected) {
  const paths=rows=>rows.filter(p=>!['governance','local-control-plane'].includes(p.archetype))
    .map(p=>({key:p.key,repoPath:p.repoPath})).sort((a,b)=>a.key.localeCompare(b.key));
  assert.deepEqual(paths(projects),paths(expected),'native bridge repository paths must match the independent O2 roster');
}
export async function assertFourTabApplication({base,sessionId,eventually,projects=null}) {
  const exec=(script,args=[])=>request(base,`/session/${sessionId}/execute/sync`,'POST',{script,args});
  const click=selector=>nativeClick(base,sessionId,selector);
  await exec(`if(!window.__fourTabErrors){window.__fourTabErrors=[];
    window.addEventListener('error',()=>window.__fourTabErrors.push('error'));
    window.addEventListener('unhandledrejection',()=>window.__fourTabErrors.push('unhandledrejection'));}`);
  const tabs=()=>exec('return [...document.querySelectorAll(".header .tabs [data-testid]")].map(e=>({id:e.dataset.testid,label:e.textContent.trim()}));');
  await eventually(async()=>assertFourTabState(await tabs()),'four-tab shell');
  await click('[data-testid="tab-projects"]');
  await click('[aria-label="Projects workspaces"] button:nth-child(1)');
  await assertWorkspace(base,sessionId,'repositories');
  if(projects) {
    await eventually(async()=>assertRepositoryRows(await exec('return [...document.querySelectorAll("[data-testid^=project-row-]")].map(e=>e.dataset.testid);'),projects),'exact registry roster');
    const bridge=await request(base,`/session/${sessionId}/execute/async`,'POST',{
      script:`const done=arguments[arguments.length-1];
        window.__TAURI_INTERNALS__.invoke('run_o2',{verb:'list_projects'})
          .then(result=>done(result),()=>done({ok:false}));`,args:[]});
    assert.equal(bridge.ok,true,'native list_projects bridge must succeed');
    const payload=JSON.parse(bridge.stdout);
    assert.equal(payload.ok,true);
    assertRepositoryPaths(payload.projects,projects);
    for(const project of projects.filter(p=>['radcloud','radcalendar','dqotd','radstock'].includes(p.key))) {
      await click(`[data-testid="project-row-${project.key}"]`);
      await eventually(async()=>assert.equal(await exec('return document.querySelector(arguments[0])?.getAttribute("aria-pressed");',
        [`[data-testid="project-row-${project.key}"]`]),'true'),'registered repository opens');
    }
  }
  for(const selector of ['[data-testid="new-project"]','[data-testid="launch-runtime"]','[data-testid="project-notes"]']) {
    await eventually(async()=>assert.equal(await exec('return !!document.querySelector(arguments[0]);',[selector]),true),'retained project control');
  }
  await click('[aria-label="Projects workspaces"] button:nth-child(2)');
  await assertWorkspace(base,sessionId,'tools');
  for(const key of ['docker','agent-mcp-surfaces']) {
    await click(`[data-testid="infrastructure-row-${key}"]`);
    await eventually(async()=>{
      const view=await exec(`const root=document.querySelector('.systemShell');return {text:root.innerText,notes:!!root.querySelector('[data-testid="infrastructure-notes"]'),newTool:!!root.querySelector('[data-testid="new-infrastructure"]')};`);
      assert.equal(view.notes,true);assert.equal(view.newTool,true);
      for(const label of ['Run Snapshot','Run Status Audit','Open Console','Open Governed Evidence'])assert.ok(view.text.includes(label),`retained local tool control ${label}`);
      assert.doesNotMatch(view.text,/System76 Workstation/);
    },'Docker and MCP retained controls');
  }
  await click('[data-testid="tab-agents"]');
  await eventually(async()=>assert.equal(await exec('return !!document.querySelector("[data-testid=new-agent]") && !!document.querySelector("[data-testid=agents-mode-repository-routers]") && !!document.querySelector("[data-testid=agent-notes]");'),true),'Agents controls and router workspace');
  await click('[data-testid="tab-notes"]');
  await click('[data-testid="notes-mode-notes"]');
  await assertWorkspace(base,sessionId,'notes');
  for(const mode of ['empire_blueprint','o2_knowledge']) {
    await click(`[data-testid="notes-mode-${mode}"]`);
    await eventually(async()=>assert.equal(await exec('return !!document.querySelector("[data-testid=notes-mode-"+arguments[0]+"].workspaceModeButtonActive");',[mode]),true),'retained Notes mode');
  }
  await click('[data-testid="tab-sentinel"]');
  for(const mode of ['sentinel','empire_operations','security_guardian']) {
    await click(`[data-testid="security-mode-${mode}"]`);
    await assertWorkspace(base,sessionId,mode);
  }
  await click('[data-testid="security-mode-sentinel"]');
  await click('button[title^="Show the installed app build"]');
  await eventually(async()=>{
    const text=await exec('return document.querySelector(".runtimeModalCard").innerText;');
    assert.match(text,/Local Tools · 2 governed profiles/);
    assert.match(text,/Docker[\s\S]*Agent \/ MCP Surfaces/);
    assert.doesNotMatch(text,/CHECKING/);
  },'native bridge Runtime Diagnostics');
  await click('.runtimeModalCard .btnGhost');
  assertFourTabState(await tabs());
  assert.deepEqual(await exec('return window.__fourTabErrors;'),[],'native navigation must not raise runtime exceptions');
  return {ok:true,checks:fourTabChecks};
}
