import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertFourTabState,assertRepositoryRows,assertRepositoryPaths,fourTabIds,fourTabLabels,fourTabChecks} from '../scripts/native_four_tab_assertions.mjs';
import {readOnlyFileBindings} from '../scripts/native_acceptance_lib.mjs';
import {wave11Matrix} from '../scripts/native_wave11_receipt.mjs';
const tabs=()=>fourTabIds.map((id,i)=>({id,label:fourTabLabels[i]}));
test('four-tab acceptance rejects retired, duplicate, missing, reordered and mislabeled tabs',()=>{
 assertFourTabState(tabs());
 for(const id of ['tab-overview','tab-work','tab-legal','tab-infrastructure'])assert.throws(()=>assertFourTabState([...tabs(),{id,label:id}]));
 for(const change of [t=>t.pop(),t=>t.reverse(),t=>t[2]=t[1],t=>t[0].label='Sentinel']){const t=tabs();change(t);assert.throws(()=>assertFourTabState(t));}
 assert.deepEqual(fourTabChecks,wave11Matrix.fourTabChecks);
});
test('registry projection rejects missing, duplicate or fabricated RadCloud',()=>{
 const projects=['radcloud','radcalendar','dqotd','radstock'].map(key=>({key}));
 const rows=projects.map(p=>'project-row-'+p.key);
 assertRepositoryRows(rows,projects);
 for(const wrong of [rows.slice(1),[...rows,rows[0]],[...rows,'project-row-fake']])assert.throws(()=>assertRepositoryRows(wrong,projects));
 const paths=projects.map(p=>({...p,repoPath:`/registered/${p.key}`}));
 assertRepositoryPaths(paths,paths);
 assert.throws(()=>assertRepositoryPaths(paths.map(p=>p.key==='radcloud'?{...p,repoPath:'/fabricated/radcloud'}:p),paths));
});
test('current-registry mount is read-only and only overlays a test-owned regular file',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'radcontrol-registry-mount-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const temp=path.join(root,'private');await mkdir(temp,{mode:0o700});
 const source=path.join(root,'registry.json'),destination=path.join(temp,'projects.json');
 await writeFile(source,'[]');await writeFile(destination,'[]');
 const bindings=await readOnlyFileBindings(temp,[{source,destination}]);
 assert.deepEqual(bindings,['--ro-bind',source,destination]);
 await assert.rejects(readOnlyFileBindings(temp,[{source,destination:source}]),/test-owned/);
 const link=path.join(temp,'link');await symlink(source,link);
 await assert.rejects(readOnlyFileBindings(temp,[{source:link,destination}]),/regular file/);
 assert.equal(await readFile(source,'utf8'),'[]');
});
