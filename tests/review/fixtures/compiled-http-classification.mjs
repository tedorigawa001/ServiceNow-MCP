import assert from 'node:assert/strict';
globalThis.fetch=()=>{throw Error('Network forbidden');};
globalThis.Response=class{constructor(){throw Error('Response forbidden');}};
globalThis.ReadableStream=class{constructor(){throw Error('Streams forbidden');}};
globalThis.setTimeout=()=>{throw Error('Timer forbidden');};
const {classifyHttpObservation}=await import('../../../dist/review/abort-scope-evidence-http-classification.js');
for(const purpose of ['authentication','parent','release'])for(let status=100;status<=599;status++)for(const body_present of [false,true]){
 const r=classifyHttpObservation({purpose,status,body_present});assert.equal(r.ok,true);assert.equal(r.kind,'classification_only');assert.equal(r.observation_source,'unverified_input');
 assert.deepEqual(Object.values(r.permissions),Array(7).fill(false));assert(Object.isFrozen(r));assert(Object.isFrozen(r.proposal.approvals));
}
assert.equal(classifyHttpObservation({purpose:'release',status:503,body_present:false}).legacy.code,'invalid_response');
assert.equal(classifyHttpObservation({purpose:'release',status:503,body_present:false}).proposal.category,'retry_status_candidate');
assert.equal(classifyHttpObservation({purpose:'release',status:403,body_present:false,enabled:true}).code,'invalid_input');
console.log('HTTP classification compiled: 3000 tuples; no I/O/timer/authority PASS');
