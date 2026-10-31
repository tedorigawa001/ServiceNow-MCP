import assert from 'node:assert/strict';
import {createSyntheticBoundStatusWorkflow} from '../../../dist/review/abort-scope-evidence-status-bound-workflow.js';
let network=0;
globalThis.fetch=()=>{network++;throw Error('NETWORK_FORBIDDEN');};
const owner=createSyntheticBoundStatusWorkflow({fake_io:true,clock:{remainingMs:()=>60000},
 schedule(ms,wake){const timer=setTimeout(wake,ms);return ()=>clearTimeout(timer);}});
const result=await owner.run(new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('PRIVATE_BODY'));}}),{status:403}),
 {purpose:'release',ordinal:1,window_origin_ms:60000,cleanup_floor_ms:50000});
assert.equal(result.outcome,'consumed');assert.equal(result.cleanup.disposition,'confirmed');
assert.deepEqual(result.budget,{requests:1,received_bytes:0,payload_bytes:0});
assert.deepEqual(result.native.operations,{get_reader:1,read:0,cancel:1,closed:1,release_lock:1});
assert.equal(result.native.workflow.counts.consumed,1);
assert(Object.values(result.permissions).every(v=>v===false));assert.equal(result.fallback,'disabled');
assert.equal(result.formal_issuance,'disabled');assert(!JSON.stringify(result).includes('PRIVATE'));
const replay=await owner.run(new Response(null,{status:403}),{purpose:'release',ordinal:1,window_origin_ms:60000,cleanup_floor_ms:50000});
assert.equal(replay.budget.requests,1);assert.equal(replay.native.workflow.counts.consumed,1);assert.equal(network,0);
console.log('compiled bound status workflow: same attempt/cleanup/one-shot + canonical budget; no authority PASS');
