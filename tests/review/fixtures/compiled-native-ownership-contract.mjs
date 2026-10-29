// Pure NA-01 package boundary. No Response/Streams/session construction or native operations.
import assert from 'node:assert/strict';
let nativeCalls=0;const names=['fetch','Response','ReadableStream','ReadableStreamDefaultReader'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
try{
  for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:function(){nativeCalls++;throw Error('NATIVE_FORBIDDEN');}});
  const api=await import('../../../dist/servicenow/review-native-contract.js');
  assert.deepEqual(Object.keys(api),['createSyntheticNativeContractDomain']);
  const d=api.createSyntheticNativeContractDomain(),run=d.identity('run'),signal=d.identity('signal'),budget={read:()=>({remaining_ms:60000})};
  assert.deepEqual(d.createOwner({run:{},signal,budget,deadline_ms:60000}),{ok:false,code:'evidence_binding_mismatch'});
  const use=r=>{assert.equal(r.ok,true);return r.value;},ports=use(d.createOwner({run,signal,budget,deadline_ms:60000}));
  const {attempt,window}=use(ports.issuer.attempt({purpose:'parent',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000}));
  const delivery=use(ports.issuer.delivery(attempt,window,{response:d.identity('response'),stream:null})),resource=use(ports.owner.claim(attempt,window,delivery)),end=use(ports.issuer.endNoBody(resource));
  const view=use(ports.owner.consume(attempt,window,resource,end));assert.equal(view.body_eligible,false);assert.equal(view.native_operations,'unavailable');assert.equal(view.evidence_issuance,'disabled');assert.equal(view.cleanup.kind,'no_body');
  assert.equal(Reflect.has(view,'resource'),false);assert.equal(nativeCalls,0);
  console.log('NA-01 compiled contract: no native calls, raw adoption refused, formal issuance disabled PASS');
}finally{for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
