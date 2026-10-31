import assert from 'node:assert/strict';
import {BoundedReadSession} from '../../../dist/servicenow/bounded-read.js';

const snapshot=()=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_COMPILED_TOKEN',oauth:{}});
const now=Object.getOwnPropertyDescriptor(performance,'now');
try{
  Object.defineProperty(performance,'now',{configurable:true,value(){throw Error('PRIVATE_COMPILED_CLOCK');}});
  const failed=BoundedReadSession.create(snapshot());
  assert.equal(failed.ok,false);
  assert.equal(failed.code,'internal_review_error');
  assert.equal(failed.construction.primary.stage,'clock');
  assert.equal(failed.construction.teardown,'confirmed');
  assert.equal(failed.construction.resources.admission.state,'absent');
  assert(!JSON.stringify(failed).includes('PRIVATE'));
  assert(Object.isFrozen(failed.construction.resources));
}finally{
  if(now)Object.defineProperty(performance,'now',now);else delete performance.now;
}
const original=snapshot(),result=BoundedReadSession.create(original,{fetch(){throw Error('network must not run');}});
assert.equal(result.ok,true);
assert.equal(result.construction.core_bound,true);
result.session.close();
const closed=result.session.constructionStatus();
result.session.close();
assert.deepEqual(result.session.constructionStatus(),closed);
assert.equal(closed.teardown,'confirmed');
assert.equal(closed.resources.admission.releases,1);
assert.equal(original.perUserBearerToken,'PRIVATE_COMPILED_TOKEN');
const next=BoundedReadSession.create(snapshot());
assert.equal(next.ok,true);next.session.close();
console.log('EF-02 compiled construction/rollback/failure copy PASS (no network)');
