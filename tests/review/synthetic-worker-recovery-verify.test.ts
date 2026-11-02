import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts} from '../support/review/synthetic-soft-recovery.js';
function fixture(verify:object|null={}){
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:'2026-11-02T00:00:00.000Z',deadline_ms:60000,observed_at:'2026-11-02T00:00:01.000Z',upper_utc:'2026-11-02T00:00:02.000Z'};
  const facts={kind:'worker_deadline',phase:'analysis',point:'analyze_timer',worker_state:'ready',supervisor:{},worker:{},generation:{},request:{},input:{},job:{},id:7} as const satisfies SyntheticSoftFacts;
  let check:()=>string|undefined=()=>undefined;
  const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>check()),b=owner.bind(s),r=owner.claimRecovery(b,owner.observe(b,facts));
  const proof=owner.settleWorkerClosure(b,owner.beginWorkerClosure(b,r),{context:facts,termination:'confirmed',cleanup:'complete'});
  const raw={source:s.source,budget:s.budget,release:s.release,origin:s.origin,window:{},verify,accounting:{requests:10,received_bytes:20,payload_bytes:30},rows:['1'.repeat(32)],completed:[],inputs:[{receipt:facts.input,update_xml_sys_id:'1'.repeat(32),retrieved_at:s.upper_utc,state:'retained'}],collection_status:'complete',consistency:'unverified'};
  return {owner,b,raw,s,proof,arm:(fn:()=>string|undefined)=>{check=fn;},prepare:()=>owner.prepareWorkerRecovery(b,proof,raw)};
}
it('inherits the same prefix once and charges only the dispatched parent attempt',()=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);
  const a=f.owner.workerVerifyAttempt(f.b,p,'parent');expect(a).not.toBeNull();
  expect(f.owner.inspect()).toMatchObject({worker_preparation:{held:true,verify_attempts:1,accounting:{requests:11,received_bytes:20,payload_bytes:30},verify:{verify_calls:1,attempts:1}},permissions:{formal_issuance:false,dispatch:false,recovery_route:false}});
});
it('verifies parent then metadata, preserving P and the held closure without generation use',()=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);
  for(const role of ['parent','metadata']){const a=f.owner.workerVerifyAttempt(f.b,p,role)!;f.owner.workerVerifyChunk(f.b,p,a,{},7);f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});}
  expect(f.owner.inspect()).toMatchObject({worker_preparation:{held:true,generation_uses:0,new_generations:0,verify:{stage:'verified',consistency:'stable_observation',attempts:2,verify_calls:1,accounting:{requests:12,received_bytes:34,payload_bytes:30}}}});
  f.owner.discardWorkerRecoveryPreparation(f.b,p);f.owner.close(f.b);
});
it('counts one logical verify and four physical attempts using only two retry events',()=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const events:number[]=[];
  for(const role of ['parent','metadata']){
    let a=f.owner.workerVerifyAttempt(f.b,p,role)!;events.push(3);f.owner.workerVerifyChunk(f.b,p,a,{},3);f.owner.workerVerifyOutcome(f.b,p,a,{kind:'failure',type:'bounded',code:'upstream_unavailable'});
    f.owner.workerVerifyRetry(f.b,p);a=f.owner.workerVerifyAttempt(f.b,p,role)!;events.push(5);f.owner.workerVerifyChunk(f.b,p,a,{},5);f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:role==='parent'});
  }
  expect(f.owner.inspect().worker_preparation?.verify).toMatchObject({verify_calls:1,attempts:events.length,retry_waits:2,stage:'verified',consistency:'changed',errors:['changed_during_review'],accounting:{requests:10+events.length,received_bytes:20+events.reduce((a,b)=>a+b,0),payload_bytes:30}});
});
it.each(['unverified','changed','stable_observation'] as const)('keeps %s without a private verify continuation and emits no attempts',consistency=>{
  const f=fixture(null);f.raw.consistency=consistency;const p=f.prepare();f.owner.beginWorkerVerify(f.b,p);
  expect(f.owner.inspect().worker_preparation?.verify).toMatchObject({verify_required:false,verify_calls:0,attempts:0,consistency,accounting:f.raw.accounting});
  f.owner.discardWorkerRecoveryPreparation(f.b,p);f.owner.close(f.b);
});
it.each([208,209,210])('never dispatches above the C cap from prefix %i',requests=>{
  const f=fixture();f.raw.accounting.requests=requests;const p=f.prepare();f.owner.beginWorkerVerify(f.b,p);
  let dispatched=0;for(const role of ['parent','metadata']){const a=f.owner.workerVerifyAttempt(f.b,p,role);if(!a)break;dispatched++;f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});}
  expect(dispatched).toBe(Math.min(2,210-requests));expect(f.owner.inspect().worker_preparation?.verify).toMatchObject({verify_calls:1,attempts:dispatched,stage:'verified',accounting:{...f.raw.accounting,requests:requests+dispatched},verify_error:requests===208?null:'request_budget_exceeded'});
});
it.each([0,1])('charges the equality/over-limit response chunk before stopping (extra=%i)',extra=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
  const run=()=>f.owner.workerVerifyChunk(f.b,p,a,{},4194304+extra);if(extra)expect(run).toThrow('receive_budget_exceeded');else run();
  expect(f.owner.inspect()).toMatchObject({state:extra?'failed':'worker_prepared',worker_preparation:{accounting:{requests:11,received_bytes:20+4194304+extra,payload_bytes:30},held:!extra}});
});
it.each([16777215,16777216])('preserves total receive prefix and refuses exhausted dispatch at %i',prefix=>{
  const f=fixture();f.raw.accounting.received_bytes=prefix;const p=f.prepare();f.owner.beginWorkerVerify(f.b,p);
  if(prefix===16777216)expect(()=>f.owner.workerVerifyAttempt(f.b,p,'parent')).toThrow('receive_budget_exceeded');
  else{const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;f.owner.workerVerifyChunk(f.b,p,a,{},1);expect(()=>f.owner.workerVerifyChunk(f.b,p,a,{},1)).toThrow('receive_budget_exceeded');}
  expect(f.owner.inspect().worker_preparation?.accounting).toEqual({requests:prefix===16777216?10:11,received_bytes:prefix===16777216?prefix:prefix+2,payload_bytes:30});
});
it('keeps exact payload cap with zero additional P through retry and verification',()=>{
  const f=fixture();f.raw.accounting.payload_bytes=8388608;const p=f.prepare();f.owner.beginWorkerVerify(f.b,p);
  for(const role of ['parent','metadata']){const a=f.owner.workerVerifyAttempt(f.b,p,role)!;f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});}
  expect(f.owner.inspect().worker_preparation?.accounting).toEqual({...f.raw.accounting,requests:12});
});
const bounded=[['phase_deadline_exceeded','deadline_exceeded'],['invalid_response','metadata_unavailable'],...['not_found_or_not_visible','authentication_failed','access_denied','upstream_unavailable','request_budget_exceeded','payload_budget_exceeded','candidate_filter_violation'].map(x=>[x,x] as const)] as const;
it.each(bounded)('keeps bounded %s as unverified %s without hard revocation',(code,mapped)=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);let a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
  const event={kind:'failure',type:'bounded',code};f.owner.workerVerifyOutcome(f.b,p,a,event);
  if(code==='upstream_unavailable'){f.owner.workerVerifyRetry(f.b,p);a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;f.owner.workerVerifyOutcome(f.b,p,a,event);}
  expect(f.owner.inspect()).toMatchObject({state:'worker_prepared',diagnostics:{hard:null},worker_preparation:{held:true,verify:{stage:'verified',consistency:'unverified',verify_error:mapped,limitations:['provisional_results','consistency_unverified']}}});
});
it.each(['receive_budget_exceeded','cancelled','deadline_exceeded','SECRET_UNKNOWN'])('hard-stops on verify outcome %s and never restores held proof',code=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
  const expected=code==='SECRET_UNKNOWN'?'internal_review_error':code;
  expect(()=>f.owner.workerVerifyOutcome(f.b,p,a,{kind:'failure',type:'bounded',code})).toThrow(expected);expect(()=>f.owner.beginWorkerVerify(f.b,p)).toThrow(expected);
  expect(f.owner.inspect()).toMatchObject({state:'failed',worker_preparation:{held:false,handle_pending:false,verify_attempts:1,new_generations:0},diagnostics:{soft:{kind:'worker_deadline'},hard:{code:expected}}});expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET_UNKNOWN');
});
it.each(['begin','dispatch','chunk','outcome','retry'] as const)('rejects duplicate %s without a second charge',kind=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);let repeat:()=>unknown;
  if(kind==='begin')repeat=()=>f.owner.beginWorkerVerify(f.b,p);
  else{const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
    if(kind==='dispatch')repeat=()=>f.owner.workerVerifyAttempt(f.b,p,'parent');
    else if(kind==='chunk'){const chunk={};f.owner.workerVerifyChunk(f.b,p,a,chunk,7);repeat=()=>f.owner.workerVerifyChunk(f.b,p,a,chunk,7);}
    else if(kind==='outcome'){f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});repeat=()=>f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});}
    else{f.owner.workerVerifyOutcome(f.b,p,a,{kind:'failure',type:'bounded',code:'upstream_unavailable'});f.owner.workerVerifyRetry(f.b,p);repeat=()=>f.owner.workerVerifyRetry(f.b,p);}
  }
  const before=f.owner.inspect().worker_preparation!.verify!;expect(repeat).toThrow('internal_review_error');const after=f.owner.inspect().worker_preparation!.verify!;
  expect(after.accounting).toEqual(before.accounting);expect(after.retry_waits).toBe(before.retry_waits);expect(after.attempts).toBe(before.attempts);expect(f.owner.inspect().worker_preparation?.held).toBe(false);
});
it.each(['binding','plan','attempt','copied_attempt','inspect'] as const)('rejects mixed or copied %s without spending another owner',kind=>{
  const f=fixture(),other=fixture(),p=f.prepare(),q=other.prepare();f.owner.beginWorkerVerify(f.b,p);other.owner.beginWorkerVerify(other.b,q);
  const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!,b=other.owner.workerVerifyAttempt(other.b,q,'parent')!;
  expect(()=>kind==='binding'?f.owner.workerVerifyAttempt(other.b,p,'parent'):kind==='plan'?f.owner.workerVerifyAttempt(f.b,q,'parent'):f.owner.workerVerifyChunk(f.b,p,kind==='attempt'?b:kind==='inspect'?f.owner.inspect():{...a},{},1)).toThrow('internal_review_error');
  expect(other.owner.inspect()).toMatchObject({state:'worker_prepared',worker_preparation:{held:true,verify_attempts:1,accounting:{requests:11,received_bytes:20,payload_bytes:30}}});
});
it.each(['pending','retry_wait'])('refuses discard or normal close while verify is %s',stage=>{
  for(const close of [false,true]){const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
    if(stage==='retry_wait')f.owner.workerVerifyOutcome(f.b,p,a,{kind:'failure',type:'bounded',code:'upstream_unavailable'});
    expect(()=>close?f.owner.close(f.b):f.owner.discardWorkerRecoveryPreparation(f.b,p)).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.held).toBe(false);
  }
});
it.each(Array.from({length:18},(_,i)=>i+1))('retains exact fake event prefix when cancelled at guard %i',at=>{
  const f=fixture(),p=f.prepare();let n=0;f.arm(()=>++n===at?'cancelled':undefined);
  // begin, parent dispatch, chunk, failure, retry, dispatch, success, metadata dispatch, success: 18 guards.
  const run=()=>{f.owner.beginWorkerVerify(f.b,p);let a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;f.owner.workerVerifyChunk(f.b,p,a,{},7);f.owner.workerVerifyOutcome(f.b,p,a,{kind:'failure',type:'bounded',code:'upstream_unavailable'});f.owner.workerVerifyRetry(f.b,p);a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});a=f.owner.workerVerifyAttempt(f.b,p,'metadata')!;f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});};
  expect(run).toThrow('cancelled');const dispatches=[4,12,16].filter(post=>at>=post).length,bytes=at>=6?7:0,retries=at>=10?1:0;
  expect(f.owner.inspect()).toMatchObject({state:'failed',diagnostics:{hard:{code:'cancelled'}},worker_preparation:{held:false,accounting:{requests:10+dispatches,received_bytes:20+bytes,payload_bytes:30},verify_attempts:dispatches,generation_uses:0,new_generations:0}});
  if(at>=2)expect(f.owner.inspect().worker_preparation?.verify?.retry_waits).toBe(retries);
});
it.each([NaN,Infinity,-1,0.5,16777218])('rejects invalid chunk size %s without charging',size=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;expect(()=>f.owner.workerVerifyChunk(f.b,p,a,{},size)).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.accounting?.received_bytes).toBe(20);
});
it.each(['getter','proxy','nonbounded','extra','wrong_kind'] as const)('rejects unsafe outcome %s without leaking raw values',kind=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;let calls=0;
  let raw:unknown={kind:'failure',type:'bounded',code:'SECRET'};
  if(kind==='getter')Object.defineProperty(raw,'code',{get(){calls++;throw Error('SECRET');}});
  if(kind==='proxy')raw=new Proxy(raw as object,{get(){calls++;throw Error('SECRET');}});
  if(kind==='nonbounded')raw={kind:'failure',type:'unknown',code:'cancelled'};if(kind==='extra')raw={kind:'success',changed:false,extra:'SECRET'};if(kind==='wrong_kind')raw={kind:'wrong',changed:false};
  expect(()=>f.owner.workerVerifyOutcome(f.b,p,a,raw)).toThrow('internal_review_error');expect(calls).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('exhausts the existing C prefix on a retry without recharging or dispatching it',()=>{
  const f=fixture();f.raw.accounting.requests=209;const p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
  f.owner.workerVerifyOutcome(f.b,p,a,{kind:'failure',type:'bounded',code:'upstream_unavailable'});f.owner.workerVerifyRetry(f.b,p);expect(f.owner.workerVerifyAttempt(f.b,p,'parent')).toBeNull();
  expect(f.owner.inspect().worker_preparation?.verify).toMatchObject({attempts:1,retry_waits:1,verify_error:'request_budget_exceeded',accounting:{requests:210,received_bytes:20,payload_bytes:30}});
});
it.each(['no_continuation','before_begin','wrong_order','old_attempt','no_retry','closed'] as const)('rejects invalid verify order %s before further charging',kind=>{
  const f=fixture(kind==='no_continuation'?null:{}),p=f.prepare();if(kind!=='before_begin')f.owner.beginWorkerVerify(f.b,p);
  let run:()=>unknown=()=>f.owner.workerVerifyAttempt(f.b,p,'parent');
  if(kind==='wrong_order')run=()=>f.owner.workerVerifyAttempt(f.b,p,'metadata');
  if(kind==='old_attempt'){const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:false});f.owner.workerVerifyAttempt(f.b,p,'metadata');run=()=>f.owner.workerVerifyChunk(f.b,p,a,{},1);}
  if(kind==='no_retry')run=()=>f.owner.workerVerifyRetry(f.b,p);
  if(kind==='closed'){f.owner.discardWorkerRecoveryPreparation(f.b,p);f.owner.close(f.b);}
  const before=f.owner.inspect().worker_preparation?.accounting;expect(run).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.accounting).toEqual(before);
});
it.each(['cancelled','deadline_exceeded','internal_review_error'])('keeps first hard %s after revocation and permits no retry or re-prepare',code=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);f.owner.workerVerifyAttempt(f.b,p,'parent');f.owner.revoke(code);
  for(const run of [()=>f.owner.workerVerifyRetry(f.b,p),()=>f.owner.beginWorkerVerify(f.b,p),()=>f.prepare()])expect(run).toThrow(code);
  expect(f.owner.inspect()).toMatchObject({diagnostics:{soft:{kind:'worker_deadline'},hard:{code}},worker_preparation:{held:false,verify_attempts:1,accounting:{requests:11,received_bytes:20,payload_bytes:30}}});
});
it.each(['run','session','source','key','origin','budget','release'] as const)('checks same %s identity on verify continuation without C charge',key=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);f.s[key]={};expect(()=>f.owner.workerVerifyAttempt(f.b,p,'parent')).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.verify_attempts).toBe(0);
});
it('never invokes operations on the supplied verify/budget references and pins the accounting prefix',()=>{
  const f=fixture();let calls=0;for(const o of [f.raw.verify!,f.raw.budget])Object.defineProperty(o,'dispatch',{get(){calls++;throw Error('SECRET');}});
  const p=f.prepare();f.raw.accounting.requests=200;f.raw.accounting.received_bytes=100;f.owner.beginWorkerVerify(f.b,p);f.owner.workerVerifyAttempt(f.b,p,'parent');
  expect(f.owner.inspect().worker_preparation?.accounting).toEqual({requests:11,received_bytes:20,payload_bytes:30});expect(calls).toBe(0);
});
it('cannot recover from synchronous guard reentry and does not spend C twice',()=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.workerVerifyAttempt(f.b,p,'parent');}catch{/* outer must still stop */}}return undefined;});
  expect(()=>f.owner.workerVerifyAttempt(f.b,p,'parent')).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.accounting?.requests).toBe(10);
});
it('hard-stops on a non-boolean verify change flag instead of treating it as changed',()=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
  expect(()=>f.owner.workerVerifyOutcome(f.b,p,a,{kind:'success',changed:'no'})).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',diagnostics:{hard:{code:'internal_review_error'}},worker_preparation:{held:false}});
});
// Chunk identities are WeakSet keys; reject primitives/proxies deliberately rather than via a WeakSet TypeError.
it.each(['string','proxy'] as const)('rejects a %s chunk identity without charging',kind=>{
  const f=fixture(),p=f.prepare();f.owner.beginWorkerVerify(f.b,p);const a=f.owner.workerVerifyAttempt(f.b,p,'parent')!;
  const identity=(kind==='string'?'chunk-1':new Proxy({},{})) as object;
  expect(()=>f.owner.workerVerifyChunk(f.b,p,a,identity,7)).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.accounting?.received_bytes).toBe(20);
});
