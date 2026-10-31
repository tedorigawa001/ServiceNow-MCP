import assert from 'node:assert/strict';
import {runSyntheticSourceStatusAcceptanceFixture as run} from '../../../dist/review/abort-scope-evidence-source-status-acceptance.js';
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
globalThis.setTimeout=()=>{throw Error('TIMER_FORBIDDEN');};
const r=run({scenario:'release_403_body'});assert.equal(r.ok,true);
assert.equal(r.diagnostic.first_terminal,'AcceptedClosedGate');assert.equal(r.diagnostic.counts.accepts,1);
assert(r.diagnostic.events.indexOf('accept_closed_gate')<r.diagnostic.events.indexOf('close'));
assert.equal(r.diagnostic.live_terminal,false);assert.equal(r.diagnostic.draft_held,false);
assert(Object.values(r.permissions).every(v=>v===false));assert.deepEqual(r.diagnostic.budget,{requests:0,received_bytes:0,payload_bytes:0});
for(const scenario of ['foreign_token_then_retry','pre_cancel','post_close','body_then_status','unconfirmed','upstream_exhausted']){
 const negative=run({scenario});assert.equal(negative.ok,true);assert.equal(negative.diagnostic.counts.accepts,0);assert.equal(negative.foreign_unchanged,true);
}
assert.equal(run({scenario:'release_403_body',consumer:{}}).ok,false);
console.log('compiled SA-01: synthetic issuer + one-shot close-before-return acceptance; no I/O/authority PASS');
