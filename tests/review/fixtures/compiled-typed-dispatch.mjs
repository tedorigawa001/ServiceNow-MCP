import assert from 'node:assert/strict';
import {createCanonicalBootstrapBudget} from '../../../dist/servicenow/review-canonical-bootstrap-budget.js';
import {createInjectedNativeReaderOwner} from '../../../dist/servicenow/review-native-adapter.js';
import {createInjectedNativeBodyLane} from '../../../dist/servicenow/review-native-body.js';
globalThis.fetch=()=>{throw Error('Network forbidden');};
const window={purpose:'parent',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000};
const schedule=(ms,wake)=>{const t=setTimeout(wake,ms);return()=>clearTimeout(t);};
for(const mode of ['shape','throw','reject']){
  const b=createCanonicalBootstrapBudget({clock:{remainingMs:()=>60000}});b.accounting.reserve();let calls=0;
  const owner=createInjectedNativeReaderOwner({fake_io:true,deadline_ms:60000,budget:b.lease,beforeDispatch:r=>{b.accounting.dispatch(r.io_floor_ms);},dispatch(){calls++;assert.equal(b.lease.read().requests,1);if(mode==='throw')throw Error('PRIVATE');return Promise.reject(Error('PRIVATE'));},schedule});
  const result=await owner.acquire(mode==='shape'?{...window,extra:true}:window);
  assert.equal(result.ok,false);assert.equal(calls,mode==='shape'?0:1);assert.equal(b.lease.read().requests,calls);b.accounting.release();
}
const b=createCanonicalBootstrapBudget({clock:{remainingMs:()=>60000}});b.accounting.reserve();
const lane=createInjectedNativeBodyLane({fake_io:true,deadline_ms:60000,budget:b.lease,beforeDispatch:r=>{b.accounting.dispatch(r.io_floor_ms);},dispatch:()=>new Response('{}'),schedule},{check(){},charge:n=>b.accounting.chunk(n),stop(){},responseLimit:4194304});
assert.deepEqual((await lane.read(window)).value,{});
assert.deepEqual({...b.lease.read(),remaining_ms:0},{requests:1,received_bytes:2,payload_bytes:0,remaining_ms:0});
assert.equal(lane.diagnostic().evidence_issuance,'disabled');b.accounting.release();
console.log('CM-03 compiled C=0 / C=1 and same-budget G PASS');
