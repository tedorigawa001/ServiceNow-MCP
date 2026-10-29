import assert from 'node:assert/strict';
import {BoundedReadSession} from '../../../dist/servicenow/bounded-read.js';
globalThis.fetch=()=>{throw Error('Network forbidden');};
let calls=0;
const s=new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE',oauth:{clientId:'unused'}},{fetch:async()=>{calls++;return new Response('{}');}});
try{
  await s.get('/api/now/table/sys_update_set?sysparm_limit=1');s.chargePayload('日本');
  assert.deepEqual(s.stats(),{requests:1,received_bytes:2,payload_bytes:6});
  for(const name of ['requests','receivedBytes','payloadBytes'])assert(!Object.hasOwn(s,name));
  s.stats=()=>({requests:0,received_bytes:0,payload_bytes:0});
  s.remainingMs=()=>60000;
  assert.deepEqual({...s.reviewRunStatus().budget,remaining_ms:0},{requests:1,received_bytes:2,payload_bytes:6,remaining_ms:0});
  assert.equal(s.reviewRunStatus().evidence_issuance,'disabled');assert.equal(calls,1);
}finally{s.close();}
console.log('CM-02 compiled legacy canonical accounting PASS');
globalThis.Response=class{constructor(){throw Error('Native acquisition forbidden');}};
globalThis.ReadableStream=class{constructor(){throw Error('Native acquisition forbidden');}};
const bound=BoundedReadSession.prepareNewReviewComposition({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE',oauth:{clientId:'unused'}},{update_set_sys_id:'a'.repeat(32)});
assert.equal(bound.state,'constructor_bound');assert.equal(bound.cleanup,'closed');assert.equal(bound.initial_source,'bound');assert.equal(bound.reserved,0);
assert.deepEqual(bound.budget,{requests:0,received_bytes:0,payload_bytes:0});assert.equal(bound.ready_generation,0);assert.equal(bound.evidence_issuance,'disabled');
assert(!JSON.stringify(bound).includes('PRIVATE'));assert(!Object.hasOwn(bound,'source'));assert(!Object.hasOwn(bound,'lease'));
console.log('CM-04-02 compiled pre-I/O composition / no authority / closed PASS');
