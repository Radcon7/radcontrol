import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, chmod, realpath, lstat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createBubblewrapApplication, snapshotInstalledO2, assertInstalledO2Unchanged,
  tcpListeners, assertNoNewTcpListeners, assertProcessNotRunning, assertPortAbsent,
  sha256File, installNativeAcceptanceSignalCleanup } from './native_acceptance_lib.mjs';
import { assertWave1Work, assertSentinelDetails, guardianActivityGeometry, assertGuardianActivityGeometry } from './native_sentinel_assertions.mjs';

function arg(name) {
  const i=process.argv.indexOf(name), value=i < 0 ? null : process.argv[i+1];
  assert.ok(value && !value.startsWith('--'), `${name} is required`); return value;
}
function command(argv, options={}) {
  const result=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',maxBuffer:64*1024*1024,...options});
  assert.equal(result.status,0,`${argv[0]} failed: ${result.stderr || result.error || ''}`);
  return result.stdout.trim();
}
async function canonical(value) { assert.equal(await realpath(value),value); return value; }
const artifact=await canonical(arg('--artifact'));
const o2=await canonical(arg('--o2-source'));
const rad=await canonical(arg('--radcontrol-source'));
const evidence=await canonical(arg('--output'));
assert.equal((await lstat(evidence)).mode & 0o077,0,'output must be private');
const releasePath=path.join(path.dirname(artifact),'evidence/release-manifest.json');
const manifest=JSON.parse(await readFile(releasePath,'utf8'));
const manifestHash=await sha256File(releasePath);
const o2Sha=manifest.compatibleO2SourceSha,radSha=manifest.radcontrolSourceSha;
for (const [repository,sha] of [[o2,o2Sha],[rad,radSha]]) {
  assert.equal(command(['/usr/bin/git','-C',repository,'rev-parse','HEAD']),sha);
  assert.equal(command(['/usr/bin/git','-C',repository,'status','--porcelain']),'');
}
command(['python3',path.join(rad,'scripts/release_candidate.py'),'verify','--artifact',artifact,
  '--evidence',path.dirname(releasePath),'--radcontrol-sha',radSha,'--o2-sha',o2Sha]);
command(['python3',path.join(o2,'scripts/o2_radcontrol_linux_abi.py'),artifact,'2.35']);
const hash=await sha256File(artifact);
const before=await snapshotInstalledO2(); const listeners=tcpListeners();
assertProcessNotRunning('radcontrol-app'); assertPortAbsent(listeners,1420);
const root=await mkdtemp(path.join(evidence,'candidate-native-'));await chmod(root,0o700);
for(const d of ['home','cache','config','data','dconf','o2'])await mkdir(path.join(root,d),{mode:0o700});
const archive=spawnSync('/usr/bin/git',['-C',o2,'archive','HEAD'],{maxBuffer:64*1024*1024});
assert.equal(archive.status,0,'exact O2 archive failed');
command(['tar','-xf','-','-C',path.join(root,'o2')],{input:archive.stdout});
const gitdir=command(['/usr/bin/git','-C',o2,'rev-parse','--absolute-git-dir']);
await writeFile(path.join(root,'o2/.git'),`gitdir: ${gitdir}\n`,{mode:0o600});
await cp(path.join(before.root,'.state'),path.join(root,'o2/.state'),{recursive:true,preserveTimestamps:true});
await cp(artifact,path.join(root,'radcontrol-app'));await chmod(path.join(root,'radcontrol-app'),0o700);
assert.equal(await sha256File(path.join(root,'radcontrol-app')),hash);
const app=await createBubblewrapApplication({app:path.join(root,'radcontrol-app'),tempRoot:root,
 home:path.join(root,'home'),xdgCacheHome:path.join(root,'cache'),xdgConfigHome:path.join(root,'config'),xdgDataHome:path.join(root,'data'),
 overlays:[{source:path.join(root,'o2'),destination:before.root},{source:path.join(root,'dconf'),destination:`/run/user/${process.getuid()}/dconf`}],
 environment:{RADCONTROL_ACCEPTANCE_READ_ONLY:'1'}});
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const driverPort=await port(),nativePort=await port();
const driver=spawn('tauri-driver',['--port',String(driverPort),'--native-port',String(nativePort)],{stdio:'inherit',detached:true});
const base=`http://127.0.0.1:${driverPort}`;let session;
async function request(route,method='GET',body){const r=await fetch(base+route,{method,signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok||j.value?.error)throw Error(JSON.stringify(j));return j.value;}
async function until(fn){let error;for(let n=0;n<120;n++){try{return await fn();}catch(e){error=e;await delay(250);}}throw error;}
async function exec(script,args=[]){return request(`/session/${session}/execute/sync`,'POST',{script,args});}
async function element(selector){return (await request(`/session/${session}/element`,'POST',{using:'css selector',value:selector}))['element-6066-11e4-a52e-4f735466cecf'];}
async function click(selector){const id=await until(()=>element(selector));await exec('arguments[0].scrollIntoView({block:"center"});',[{'element-6066-11e4-a52e-4f735466cecf':id}]);await request(`/session/${session}/element/${id}/click`,'POST',{});await delay(300);}

let cleaned=false;
async function cleanup(){
 if(cleaned)return;cleaned=true;
 if(session)await request(`/session/${session}`,'DELETE').catch(()=>{});
 try{process.kill(-driver.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
 await delay(1000);
 try{process.kill(-driver.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
 await assertInstalledO2Unchanged(before);assertNoNewTcpListeners(listeners,tcpListeners());
}
const signals=installNativeAcceptanceSignalCleanup(cleanup);
try {
 await until(()=>request('/status'));
 const s=await request('/session','POST',{capabilities:{alwaysMatch:{browserName:'wry','tauri:options':{application:app}}}});session=s.sessionId;
 await until(async()=>assert.match(await exec('return document.body.innerText;'),/Projects/));
 await assertWave1Work(base,session,click,until);
 await click('[data-testid="tab-sentinel"]');
 await until(async()=>assert.match(await exec('return document.body.innerText;'),/RECENT EVENTS/));
 const text=await exec('return document.body.innerText;');
 assert.match(text,/Radcon Sentinel[\s\S]*Empire Operations[\s\S]*Security Guardian/i);
 assert.match(text,/Is my computer okay\?[\s\S]*CURRENT NOW[\s\S]*RECENT EVENTS[\s\S]*Details/);
 assert.equal((text.match(/CURRENT NOW/g)||[]).length,1);
 assertGuardianActivityGeometry(await guardianActivityGeometry(base,session),'candidate activity',{desktop:true});
 await assertSentinelDetails(base,session,false);
 await click('.sentinelAdvancedWorkspace > summary');await assertSentinelDetails(base,session,true);
 await click('.sentinelAdvancedWorkspace > summary');await assertSentinelDetails(base,session,false);
 for (const heading of ['MEASUREMENT DETAILS','ADVANCED SYSTEM INFORMATION','SYSTEM EVIDENCE','SCAN COVERAGE','SAFETY & PERMISSIONS']) {
  await exec("const leak=document.createElement('button');leak.id='test-technical-leak';leak.innerText=arguments[0];leak.style.cssText='position:fixed;top:250px;left:100px;z-index:99999';document.body.append(leak);",[heading]);
  const exposed=await exec("const p=document.getElementById('test-technical-leak');const r=p.getBoundingClientRect();return {text:document.body.innerText.includes(arguments[0]),hit:document.elementFromPoint(r.left+5,r.top+5)===p};",[heading]);
  assert.equal(exposed.text,true);assert.equal(exposed.hit,true);
  await assert.rejects(()=>assertSentinelDetails(base,session,false),/Technical measurement text|Technical panels must not dominate/);
  await exec("document.getElementById('test-technical-leak').remove();");
  await assertSentinelDetails(base,session,false);
  console.log('Native exposed-heading fixture rejected:',heading);
 }
 await click('.sentinelAdvancedWorkspace > summary');
 await exec("document.querySelector('[data-testid=sentinel-health-measurements]').style.visibility='hidden';");
 await assert.rejects(()=>assertSentinelDetails(base,session,true),/Technical measurements must be visible/);
 await exec("document.querySelector('[data-testid=sentinel-health-measurements]').style.visibility='';");
 await assertSentinelDetails(base,session,true);
 await click('.sentinelAdvancedWorkspace > summary');
 await exec("window.testPanel=document.querySelector('[data-testid=sentinel-health-measurements]');window.testPanel.remove();");
 await assert.rejects(()=>assertSentinelDetails(base,session,false),/Technical measurements must remain/);
 await exec("document.querySelector('details.sentinelAdvancedWorkspace').append(window.testPanel);delete window.testPanel;");
 await assertSentinelDetails(base,session,false);

}finally{ await signals(); }
assert.equal(await sha256File(artifact),hash,'candidate changed during native precheck');
assert.equal(await sha256File(releasePath),manifestHash,'admission changed during native precheck');
const result={ok:true,acceptance:'candidate-native-precheck',o2Sha,radcontrolSha:radSha,
 artifactSha256:hash,releaseManifestSha256:manifestHash,
 harnessSha256:await sha256File(fileURLToPath(import.meta.url)),
 assertionsSha256:await sha256File(new URL('./native_sentinel_assertions.mjs',import.meta.url)),
 checks:['wave1-work-surfaces','native-launch','current-now','grouped-activity','details-closed-open-reclosed','rendered-text','hit-testing','five-leakage-fixtures','hidden-open-panel','missing-panel','installed-preserved','listeners-preserved']};
await writeFile(path.join(evidence,'candidate-native.json'),JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(result));
