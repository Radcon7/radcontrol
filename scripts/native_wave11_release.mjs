// Synthetic scenarios run in a separate, test-owned native session. The real
// candidate/installed identity and read-only probes remain in their entrypoints.
import assert from 'node:assert/strict';
import { cp, chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { runWave11Acceptance } from './native_wave11_acceptance.mjs';
import { bindWave11Receipt } from './native_wave11_receipt.mjs';
import { request } from './native_sentinel_assertions.mjs';
import { INSTALLED_O2_ROOT, E2E_TEMP_PREFIX, assertWritableFixtureIsolation,
  createBubblewrapApplication, snapshotInstalledO2, assertInstalledO2Unchanged,
  sha256File, tcpListeners, assertNoNewTcpListeners, assertProcessNotRunning,
  installNativeAcceptanceSignalCleanup } from './native_acceptance_lib.mjs';

function command(argv, options = {}) {
  const r = spawnSync(argv[0], argv.slice(1), {encoding:'utf8', maxBuffer:64*1024*1024, ...options});
  assert.equal(r.status, 0, r.stderr || String(r.error || argv[0]));
  return r.stdout.trim();
}
async function port() {
  const server=net.createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const value=server.address().port; await new Promise(resolve=>server.close(resolve)); return value;
}
async function eventually(fn, label, timeout=30000) {
  const deadline=Date.now()+timeout; let error;
  do { try { return await fn(); } catch(e) { error=e; await delay(200); } } while(Date.now()<deadline);
  throw new Error(`${label}: ${error?.message}`, {cause:error});
}

export async function runReleaseWave11({app, o2Source, identities, entrypoint, mode='production'}) {
  assert.ok(['production','e2e'].includes(mode));
  assertProcessNotRunning('radcontrol-app');
  assert.equal(await sha256File(app), identities.artifactSha256);
  assert.equal(command(['git','-C',o2Source,'rev-parse','HEAD']),identities.o2Sha);
  const before=await snapshotInstalledO2(), listeners=tcpListeners();
  const tempRoot=await mkdtemp(path.join(os.tmpdir(),E2E_TEMP_PREFIX));
  console.error(`[native] Wave 1.1 isolated fixture: ${tempRoot}`);
  const fixture={tempRoot,o2Root:path.join(tempRoot,'o2'),e2eHome:path.join(tempRoot,'home'),
    xdgCacheHome:path.join(tempRoot,'cache'),xdgConfigHome:path.join(tempRoot,'config'),xdgDataHome:path.join(tempRoot,'data')};
  for(const d of [fixture.o2Root,fixture.e2eHome,fixture.xdgCacheHome,fixture.xdgConfigHome,fixture.xdgDataHome,path.join(tempRoot,'dconf')]) await mkdir(d,{mode:0o700});
  const archive=spawnSync('git',['-C',o2Source,'archive',identities.o2Sha],{maxBuffer:64*1024*1024});
  assert.equal(archive.status,0,'exact O2 fixture archive');
  command(['tar','-xf','-','-C',fixture.o2Root],{input:archive.stdout});
  await writeFile(path.join(fixture.o2Root,'.git'),`gitdir: ${command(['git','-C',o2Source,'rev-parse','--absolute-git-dir'])}\n`,{mode:0o600});
  await cp(path.join(INSTALLED_O2_ROOT,'.state'),path.join(fixture.o2Root,'.state'),{recursive:true});
  const registryPath=path.join(fixture.o2Root,'registry/projects.json');
  const projects=JSON.parse(await readFile(registryPath,'utf8'));
  for(const [i,row] of projects.entries()) {
    row.repoPath=path.join(tempRoot,`project-${i}`); await mkdir(row.repoPath,{mode:0o700});
  }
  await writeFile(registryPath,JSON.stringify(projects));
  fixture.empireTodoPath=path.join(fixture.o2Root,'docs/radcontrol/empire_todo/items.json');
  await cp(path.join(fixture.o2Root,'registry/empire-todo-seeds.json'),fixture.empireTodoPath);
  await assertWritableFixtureIsolation(fixture);
  // The actual installed executable is used in installed acceptance. Downloads
  // are non-executable evidence, so only a hash-identical test-owned copy runs.
  let executable=app;
  if(entrypoint==='tauri_candidate_precheck.mjs') {
    executable=path.join(tempRoot,'radcontrol-app');await cp(app,executable);await chmod(executable,0o700);
    assert.equal(await sha256File(executable),identities.artifactSha256);
  }
  const sandboxed=await createBubblewrapApplication({app:executable,tempRoot,home:fixture.e2eHome,
    xdgCacheHome:fixture.xdgCacheHome,xdgConfigHome:fixture.xdgConfigHome,xdgDataHome:fixture.xdgDataHome,
    overlays:[...(mode==='production'?[{source:fixture.o2Root,destination:INSTALLED_O2_ROOT}]:[]),
      {source:path.join(tempRoot,'dconf'),destination:`/run/user/${process.getuid()}/dconf`}],
    environment:mode==='e2e'?{RADCONTROL_E2E:'1',O2_ROOT:fixture.o2Root,O2_E2E_HOME:fixture.e2eHome}:{}
  });
  const driverPort=await port(), nativePort=await port(),base=`http://127.0.0.1:${driverPort}`;
  const driver=spawn('tauri-driver',['--port',String(driverPort),'--native-port',String(nativePort)],{stdio:'inherit',detached:true});
  let sessionId;
  const cleanup=installNativeAcceptanceSignalCleanup(async()=>{
    if(sessionId) await request(base,`/session/${sessionId}`,'DELETE').catch(()=>{});
    try { process.kill(-driver.pid,'SIGTERM'); } catch(e) { if(e.code!=='ESRCH') throw e; }
    await delay(1000);
    try { process.kill(-driver.pid,'SIGKILL'); } catch(e) { if(e.code!=='ESRCH') throw e; }
    await assertInstalledO2Unchanged(before); assertNoNewTcpListeners(listeners,tcpListeners());
  });
  let matrix;
  try {
    await eventually(()=>request(base,'/status'),'native driver');
    const session=await request(base,'/session','POST',{capabilities:{alwaysMatch:{browserName:'wry','tauri:options':{application:sandboxed}}}});
    sessionId=session.sessionId;
    await eventually(async()=>assert.match(await request(base,`/session/${sessionId}/execute/sync`,'POST',{script:'return document.body.innerText;',args:[]}),/Projects/),'fixture launch');
    const click=async(b,s,selector)=>{
      const element=await eventually(()=>request(b,`/session/${s}/element`,'POST',{using:'css selector',value:selector}),selector);
      const id=element['element-6066-11e4-a52e-4f735466cecf'];
      await request(b,`/session/${s}/execute/sync`,'POST',{script:'arguments[0].scrollIntoView({block:"center"});',args:[element]});
      await request(b,`/session/${s}/element/${id}/click`,'POST',{});await delay(250);
    };
    matrix=await runWave11Acceptance({fixture,base,sessionId,request,click,eventually});
  } catch(error) {
    if(sessionId) {
      const body=await request(base,`/session/${sessionId}/execute/sync`,'POST',{script:'return document.body.innerText;',args:[]}).catch(()=>'<unavailable>');
      console.error('[native] fixture body at failure:',body.slice(0,6000));
      const shot=await request(base,`/session/${sessionId}/screenshot`).catch(()=>null);
      if(shot) await writeFile(path.join(tempRoot,'failure.png'),Buffer.from(shot,'base64'));
    }
    throw error;
  } finally { await cleanup(); }
  assert.equal(await sha256File(app),identities.artifactSha256);
  const receipt=await bindWave11Receipt(matrix,identities,entrypoint);
  await writeFile(path.join(tempRoot,'wave11-receipt.json'),JSON.stringify(receipt)+'\n',{mode:0o600});
  return receipt;
}
