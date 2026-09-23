import assert from 'node:assert/strict';
import test from 'node:test';
import {processContextState,strongestProcessContext} from '../src/components/sentinel/sentinelEpisodes.ts';
const now=Date.parse('2026-09-23T12:00:00Z');
const diagnostic={capturedAt:'2026-09-23T11:59:30Z',source:'completed-diagnostic',coverage:'available',processes:[{pid:123,process:'fixture'}]};
test('lightweight refresh cannot erase stronger completed context',()=>assert.equal(strongestProcessContext(diagnostic,{source:'foreground',coverage:'unavailable',processes:[]}),diagnostic));
test('process capture time and provenance are unchanged',()=>{const result=strongestProcessContext(diagnostic);assert.equal(result.capturedAt,diagnostic.capturedAt);assert.equal(result.source,'completed-diagnostic');});
test('available retained stale and missing evidence stay distinct',()=>{
 assert.equal(processContextState(diagnostic,now),'Available');
 assert.equal(processContextState(diagnostic,now+90_000),'Stale · retained context');
 assert.equal(processContextState(undefined,now),'Unknown');
 assert.equal(processContextState({...diagnostic,capturedAt:'not a date'},now),'Unknown capture time');
});
