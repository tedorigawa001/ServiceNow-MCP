import assert from 'node:assert/strict';
const forbidden=()=>{throw Error('native/network/timer forbidden');};
for(const key of ['fetch','Response','ReadableStream','setTimeout','setInterval'])globalThis[key]=forbidden;
const module=await import('../../../dist/review/abort-scope-evidence-status-context.js');
assert.deepEqual(Object.keys(module),['runSyntheticStatusContextFixture']);
const run=module.runSyntheticStatusContextFixture;
for(const scenario of ['body','release_404','no_body']){
 const r=run({scenario});assert(r.ok);assert.equal(r.diagnostic.scope,'synthetic_contract_only');assert.equal(r.diagnostic.phase,'draft_held');
 assert.equal(r.diagnostic.counts.drafts,1);assert.equal(r.diagnostic.consumer_implemented,true);assert.equal(r.diagnostic.claims.consume,'available');assert(Object.values(r.permissions).every(v=>v===false));
 assert(!('context' in r));assert(!('token' in r));assert(!('consume' in r));assert(!run(r).ok);
}
for(const scenario of ['foreign_record','external_diagnostic','duplicate_issue','issue_reentry','stop_after_issue','clock_rewind']){
 const r=run({scenario});assert(r.ok);assert.equal(r.diagnostic.draft_held,false);assert(r.foreign_unchanged);assert(r.diagnostic.counts.drafts<=1);
 assert(Object.values(r.permissions).every(v=>v===false));assert(!JSON.stringify(r).includes('PRIVATE'));
}
assert(!run({scenario:'body',record:{cleanup:{disposition:'confirmed'}}}).ok);
for(const scenario of ['consume_body','consume_404','consume_no_body']){
 const r=run({scenario});assert(r.ok);assert.equal(r.diagnostic.phase,'consumed');assert.equal(r.diagnostic.first_terminal,'consumed');
 assert.equal(r.diagnostic.counts.consumes,1);assert.equal(r.diagnostic.claims.consume,'spent');assert(Object.values(r.diagnostic.consumption.permissions).every(v=>v===false));
 assert(!run(r.diagnostic.consumption).ok);
}
for(const scenario of ['consume_post_reentry','consume_pre_cancel','consume_post_expired','consume_foreign_then_retry']){
 const r=run({scenario});assert(r.ok);assert.equal(r.diagnostic.counts.consumes,0);assert.equal(r.diagnostic.consumption,null);assert(r.foreign_unchanged);
}
const replay=run({scenario:'consume_duplicate'});assert(replay.ok);assert.equal(replay.diagnostic.first_terminal,'consumed');assert.equal(replay.diagnostic.phase,'failed');assert.equal(replay.diagnostic.counts.consumes,1);
console.log('compiled ST-03A/B: private claims/one-shot consumer/guards; no native/adoption/continuation authority PASS');
