import assert from 'node:assert/strict';
import {createConstructionState,normalizeConstructionReason} from '../../../dist/servicenow/review-kernel/construction-state.js';
import {BoundedReadSession} from '../../../dist/servicenow/bounded-read.js';

const first=createConstructionState(),second=createConstructionState();
first.attempt('deadline_timer');first.release('deadline_timer',false,false);
first.fail('clock','invalid_observation_time');first.seal();
assert.equal(first.copy().primary.public_code,'internal_review_error');
assert.equal(first.copy().teardown,'unconfirmed');
assert.equal(second.copy().primary,null);
assert.equal(normalizeConstructionReason({code:'PRIVATE'}),'internal_review_error');
second.recordBinding('core');assert.equal(second.commit(),true);second.seal();
const sealed=second.copy();second.fail('close','cancelled');second.recordBinding('source');
assert.deepEqual(second.copy(),sealed);assert(Object.isFrozen(sealed.resources));
const control=new AbortController();
const r=BoundedReadSession.create({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE',oauth:{}},{signal:control.signal});
assert.equal(r.ok,true);
try{
  // An unsealed local state takes a failure and seals; the live session's construction copy must not move.
  const before=r.session.constructionStatus(),local=createConstructionState();
  local.attempt('admission');local.held('admission');local.fail('stop','cancelled');local.seal();
  assert.equal(local.copy().primary.code,'cancelled');assert.deepEqual(r.session.constructionStatus(),before);
  assert.equal(before.primary,null);
  control.abort();assert.equal(r.session.reviewRunStatus().primary.code,'cancelled');
  assert.equal(r.session.constructionStatus().primary,null);
}finally{r.session.close();}
assert.equal(r.session.constructionStatus().teardown,'confirmed');
console.log('EF-03A compiled pure construction kernel + existing class/run separation PASS (no network)');
