// Runs against extracted npm content; all network is a local fake dependency.
import assert from 'node:assert/strict';
import * as lifecycle from '../../../dist/servicenow/review-evidence-lifecycle.js';
import { BoundedReadSession } from '../../../dist/servicenow/bounded-read.js';
for(const name of ['registerPreparedFixtureSource','claimPreparedFixtureOwner','claimPreparedTransportBudget','createPreparedFixtureWindow','claimPreparedTransfer','consumePreparedTransfer']){
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
}finally{s.close();}
console.log('Packaged fixture boundary: isolated exports + real session unchanged PASS');
