// Runs against extracted npm content; all network is a local fake dependency.
import assert from 'node:assert/strict';
import * as lifecycle from '../../../dist/servicenow/review-evidence-lifecycle.js';
import { BoundedReadSession } from '../../../dist/servicenow/bounded-read.js';
import { BoundedUpdateSetSource } from '../../../dist/review/bounded-source.js';
for(const name of ['registerPreparedFixtureSource','claimPreparedFixtureOwner','claimPreparedTransportBudget','createPreparedFixtureWindow','claimPreparedTransfer','consumePreparedTransfer','markReviewEvidenceAuthReady','revokeReviewEvidenceSession']){
  assert.equal(Reflect.has(lifecycle,name),false,`fixture export shipped: ${name}`);
}
let calls=0;
const s=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'SYNTHETIC_ONLY',oauth:{clientId:'',clientSecret:''}},
  {fetch:async()=>{calls++;return new Response('{}');}});
try{
  assert.equal(Reflect.has(s,'claimTransportBudget'),false);
  const path='/api/now/table/sys_update_set?sysparm_limit=1';await s.get(path);await s.get(path);
  s.chargePayload('<a/>');s.setPhaseReserve(0);
  assert.deepEqual(s.stats(),{requests:2,received_bytes:4,payload_bytes:4});assert.equal(calls,2);
  const status=s.reviewRunStatus();assert.equal(status.state,'ready');assert.equal(status.ready_generation,1);
  assert.equal(status.evidence_issuance,'disabled');assert.equal(Object.isFrozen(status.budget),true);
  assert.throws(()=>lifecycle.registerReviewEvidenceSession(s,{},{}),/invalid_state/);
}finally{s.close();}
const parent='a'.repeat(32);
const bound=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'SYNTHETIC_BINDING_ONLY',oauth:{clientId:'',clientSecret:''}},
  {fetch:async url=>Response.json({result:String(url).includes('sys_cluster_state')?[{build_name:'Australia'}]:
    {sys_id:parent,state:'in progress',application:'global',sys_updated_on:'2026-10-27',sys_mod_count:'0'}})});
try{
  const source=new BoundedUpdateSetSource(bound,{update_set_sys_id:parent,max_records:20});await source.readParent();const d=await source.resolveRelease();
  assert.equal(d.release_match,'matched');d.instance_release.raw_buildname='Zurich';
  const status=source.reviewReleaseStatus(d.permit);assert.equal(status.instance_release.raw_buildname,'Australia');
  assert.equal(status.evidence_issuance,'disabled');assert.equal(Object.isFrozen(status.instance_release),true);
  assert.throws(()=>source.reviewReleaseStatus({}),/internal_review_error/);
  assert.equal(bound.reviewRunStatus().primary.code,'evidence_binding_mismatch');
}finally{bound.close();}
console.log('Packaged fixture boundary: isolated exports + private release binding PASS');
