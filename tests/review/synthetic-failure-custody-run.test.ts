import {expect,it} from 'vitest';
import {createSyntheticFailureCustodyRun} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
function fixture(){
  const a=aggregate(),id='1'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,
      instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations],errors:[]},
      selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
}
function setup(){
  let healthy:(stage:string,n?:number)=>unknown=()=>undefined,cleanup:(phase:string,operation:string)=>unknown=()=>undefined;
  const root=createSyntheticFailureCustodyRun(fixture(),{guard:(s:string,n?:number)=>healthy(s,n),cleanup_guard:(p:string,o:string)=>cleanup(p,o)});
  return {root,arm:(fn:typeof cleanup)=>{cleanup=fn;},healthy:(fn:typeof healthy)=>{healthy=fn;},running:()=>{
    root.prepare();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();const t=root.claimGeneration();root.startGeneration(t.start);return t;
  }};
}
it('moves the same unresolved capsule once to upper and drains it only there after final discard',()=>{
  const root=createSyntheticFailureCustodyRun(fixture(),{guard:()=>undefined,cleanup_guard:()=>undefined});
  root.prepare();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();const ticket=root.claimGeneration();root.startGeneration(ticket.start);
  root.stop('cancelled');const receipt=root.transferFailure(),report=root.upper.inspect().report;
  expect(report).toMatchObject({release:'unconfirmed',unresolved:3,first_hard:{code:'cancelled'}});
  expect(()=>root.cleanupOwned('confirmed')).toThrow('cancelled');root.finalDiscard(receipt);
  expect(root.failure()).toMatchObject({custody:'upper',local_cleanup_refs:0,discards:1});
  root.upper.cleanupOwned('confirmed');
  expect(root.upper.inspect()).toMatchObject({current:{release:'unconfirmed',roles:{new_generation:{cleanup:'confirmed',termination:'unknown',resolved:false}}}});
  expect(root.upper.inspect().report).toEqual(report);expect(()=>root.prepare()).toThrow('cancelled');
  for(const facade of [root,root.upper])for(const key of ['register','adopt','accepted','dispatch','acceptRecoveryFinishContext','sealRecoveryFinishExpectation'])expect(facade).not.toHaveProperty(key);
  expect(root.failure().permissions).toEqual({accepted_adoption:false,destination_seal:false,formal_issuance:false});
});
it('keeps one fake budget prefix and independently counted fee owners through upper cleanup',()=>{
  const seen:string[]=[],root=createSyntheticFailureCustodyRun(fixture(),{guard:()=>undefined,cleanup_guard:(phase:string,operation:string)=>{seen.push(`${operation}_${phase}`);return 'deadline_exceeded';}});
  root.prepare();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();const ticket=root.claimGeneration();root.startGeneration(ticket.start);
  root.stop('cancelled');root.finalDiscard(root.transferFailure());root.upper.cleanupOwned('confirmed');
  expect(seen).toEqual(['seal_pre','seal_post','commit_pre','commit_post','discard_pre','discard_post','cleanup_pre','cleanup_post']);
  expect(root.upper.inspect().budget).toMatchObject({model_id:'fb03-fake-events-v1',budget_bound:true,accounting:{requests:10,received_bytes:20,payload_bytes:30},
    started_at:'2026-10-17T04:59:00.000Z',deadline_ms:60000,observed_stop:'deadline_exceeded',total:62,saturated:false,
    costs:{shell:1,budget_pin:1,entry:10,rejected_entry:0,healthy_checkpoint:24,role_reservation:3,role_fact:6,clear_checkpoint:1,notice:1,cleanup_request:2,terminal_receipt:2,cleanup_checkpoint:8,seal:1,commit:1,discard:1}});
  expect(root.upper.inspect().current!.first_hard.code).toBe('cancelled');
});
it('removes local authority immediately at commit, before final discard, without consuming the upper sink',()=>{
  const f=setup();f.running();const borrowed=f.root.cleanupOwned;f.root.stop('cancelled');const receipt=f.root.transferFailure(),before=f.root.upper.inspect().current,report=f.root.upper.inspect().report;
  for(const op of [()=>f.root.cleanupOwned('confirmed'),()=>borrowed('confirmed'),()=>f.root.stop('deadline_exceeded'),()=>f.root.beginSourceClose(),()=>f.root.prepare(),()=>f.root.transferFailure()])expect(op).toThrow('cancelled');
  expect(f.root.upper.inspect().current).toEqual(before);expect(f.root.failure()).toMatchObject({custody:'upper',local_capsule:false,upper_capsule:true,local_cleanup_refs:0,discards:0});
  f.root.upper.cleanupOwned('confirmed');f.root.finalDiscard(receipt);
  expect(f.root.upper.inspect().report).toBe(report);expect(f.root.upper.inspect().current!.roles.new_generation.cleanup).toBe('confirmed');
  expect(f.root.inspect()).toEqual({supply:null,kernel:null});
});
it('does not spend the local sink through an upper facade before acceptance',()=>{
  const f=setup();f.running();f.root.stop('cancelled');expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow('cancelled');
  expect(f.root.failure()).toMatchObject({custody:'local',local_capsule:true,upper_capsule:false,current:{roles:{new_generation:{cleanup:'not_requested'}}}});
  f.root.finalDiscard(f.root.transferFailure());f.root.upper.cleanupOwned('confirmed');expect(f.root.upper.inspect().current!.roles.new_generation.cleanup).toBe('confirmed');
});
it('moves an unpublished allocated-frame capsule after a claim post guard stop without inventing a generation',()=>{
  const f=setup();f.root.prepare();f.root.beginClosure();f.root.settleOld({termination:'confirmed',cleanup:'complete'});f.root.prepareGeneration();
  let n=0;f.healthy(stage=>stage==='kernel'&&++n===2?'cancelled':undefined);expect(()=>f.root.claimGeneration()).toThrow('cancelled');f.healthy(()=>undefined);
  f.root.finalDiscard(f.root.transferFailure());f.root.upper.cleanupOwned('not_required');
  expect(f.root.upper.inspect()).toMatchObject({capsule_pending:true,current:{roles:{new_generation:{generation:'creating',termination:'unknown',resolved:false}}},budget:{accounting:{requests:10,received_bytes:20,payload_bytes:30}}});
});
it.each(['seal','commit','discard'] as const)('keeps the capsule with exactly one owner when %s checkpoints throw',operation=>{
  for(const phase of ['pre','post']){
    const f=setup();f.running();f.root.stop('deadline_exceeded');const receipt=operation==='discard'?f.root.transferFailure():undefined;
    f.arm((p,o)=>{if(p===phase&&o===operation)throw Error('PRIVATE_GUARD');});
    expect(()=>operation==='discard'?f.root.finalDiscard(receipt!):f.root.transferFailure()).toThrow('deadline_exceeded');
    expect(f.root.failure()).toMatchObject({first_hard:{code:'deadline_exceeded'},custody:operation==='discard'?'upper':'local',local_capsule:operation!=='discard',upper_capsule:operation==='discard',discards:0});
    f.arm(()=>undefined);if(operation==='discard')f.root.upper.cleanupOwned('confirmed');else f.root.cleanupOwned('confirmed');
    expect(()=>f.root.transferFailure()).toThrow('deadline_exceeded');expect(JSON.stringify(f.root.failure())).not.toContain('PRIVATE_GUARD');
  }
});
it.each(['seal','commit','discard'] as const)('detects swallowed reentry at both %s checkpoints without partial transfer or discard',operation=>{
  for(const phase of ['pre','post'])for(const nested of ['cleanup','transfer','discard']){
    const f=setup();f.running();f.root.stop('cancelled');const receipt=operation==='discard'?f.root.transferFailure():undefined;
    f.arm((p,o)=>{if(p===phase&&o===operation)try{
      if(nested==='cleanup')f.root.cleanupOwned('confirmed');else if(nested==='transfer')f.root.transferFailure();else f.root.finalDiscard({} as never);
    }catch{/* deliberately swallowed */}});
    expect(()=>operation==='discard'?f.root.finalDiscard(receipt!):f.root.transferFailure()).toThrow('cancelled');
    expect(f.root.failure()).toMatchObject({custody:operation==='discard'?'upper':'local',local_capsule:operation!=='discard',upper_capsule:operation==='discard',discards:0,notices:1});
    f.arm(()=>undefined);if(operation==='discard')f.root.upper.cleanupOwned('confirmed');else f.root.cleanupOwned('confirmed');
  }
});
it.each(['pre','post'] as const)('retains sink state and prior facts on an upper cleanup %s guard throw',phase=>{
  const f=setup();f.running();f.root.stop('cancelled');f.root.finalDiscard(f.root.transferFailure());const report=f.root.upper.inspect().report;
  f.arm((p,o)=>{if(p===phase&&o==='cleanup')throw Error('PRIVATE');});expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow('cancelled');
  expect(f.root.upper.inspect()).toMatchObject({capsule_pending:true,current:{first_hard:{code:'cancelled'},roles:{new_generation:{cleanup:phase==='pre'?'not_requested':'confirmed',termination:'unknown',resolved:false}}}});
  f.arm(()=>undefined);if(phase==='pre')f.root.upper.cleanupOwned('confirmed');else expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow('cancelled');
  expect(f.root.upper.inspect().report).toBe(report);expect(JSON.stringify(f.root.failure())).not.toContain('PRIVATE');
});
it.each(['pre','post'] as const)('detects swallowed upper cleanup reentry in %s without reopening a sink',phase=>{
  const f=setup();f.running();f.root.stop('cancelled');f.root.finalDiscard(f.root.transferFailure());
  f.arm((p,o)=>{if(p===phase&&o==='cleanup')try{f.root.upper.cleanupOwned('confirmed');}catch{/* swallowed */}});
  expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow('cancelled');expect(f.root.failure().notices).toBe(1);
  f.arm(()=>undefined);if(phase==='pre')f.root.upper.cleanupOwned('confirmed');
  expect(f.root.upper.inspect().current!.roles.new_generation).toMatchObject({cleanup:'confirmed',termination:'unknown',resolved:false});
});
it.each(['foreign','copy','report','extra'] as const)('rejects %s final receipts without returning custody or changing the other owner',kind=>{
  const a=setup(),b=setup();a.running();b.running();a.root.stop('cancelled');b.root.stop('deadline_exceeded');const ar=a.root.transferFailure(),br=b.root.transferFailure(),before=b.root.upper.inspect();
  const bad=kind==='foreign'?br:kind==='copy'?{...ar}:kind==='report'?a.root.upper.inspect().report:ar;
  expect(()=>a.root.finalDiscard(bad as typeof ar,...(kind==='extra'?[{}]:[]))).toThrow('cancelled');
  expect(a.root.failure()).toMatchObject({custody:'upper',local_capsule:false,upper_capsule:true,discards:0,discard_started:true});expect(b.root.upper.inspect()).toEqual(before);
  expect(()=>a.root.finalDiscard(ar)).toThrow('cancelled');a.root.upper.cleanupOwned('confirmed');b.root.finalDiscard(br);
});
it('rejects transfer before hard once and retains local obligations for cleanup-only reporting',()=>{
  const f=setup();f.running();expect(()=>f.root.transferFailure()).toThrow('internal_review_error');
  expect(f.root.failure()).toMatchObject({custody:'local',local_capsule:true,upper_capsule:false,commits:0,discards:0});
  expect(()=>f.root.transferFailure()).toThrow('internal_review_error');f.root.cleanupOwned('confirmed');
});
it('never treats a missing kernel or unbound budget as proof of no resources',()=>{
  const root=createSyntheticFailureCustodyRun({private:'PRIVATE_BODY'},{guard:()=>undefined,cleanup_guard:()=> 'deadline_exceeded'});
  expect(()=>root.prepare()).toThrow('internal_review_error');root.finalDiscard(root.transferFailure());
  expect(root.upper.inspect()).toMatchObject({current:{release:'unconfirmed',unresolved:4},budget:{budget_bound:false,accounting:null,started_at:null,deadline_ms:null,costs:{shell:1,notice:1,budget_pin:0}}});
  expect(JSON.stringify(root.failure())).not.toContain('PRIVATE_BODY');
});
it('pins the same fake budget in guard views without accepting later dependency replacement or view mutation',()=>{
  const views:unknown[]=[];const deps={guard:()=>undefined,cleanup_guard:(_p:string,_o:string,view:unknown)=>{views.push(view);return undefined;}};
  const root=createSyntheticFailureCustodyRun(fixture(),deps);deps.guard=()=>{throw Error('PRIVATE');};deps.cleanup_guard=()=>{throw Error('PRIVATE');};
  root.prepare();root.stop('cancelled');root.finalDiscard(root.transferFailure());
  for(const raw of views){const v=raw as {accounting:object;costs:object};expect(Object.isFrozen(v)).toBe(true);expect(Object.isFrozen(v.costs)).toBe(true);expect(Object.isFrozen(v.accounting)).toBe(true);}
  expect(root.upper.inspect().budget).toMatchObject({budget_bound:true,accounting:{requests:10,received_bytes:20,payload_bytes:30},deadline_ms:60000});
});
it.each(['pre','post'] as const)('observes expiry on %s cleanup while keeping the original hard and fixed deadline',phase=>{
  const f=setup();f.running();f.root.stop('worker_unavailable');f.root.finalDiscard(f.root.transferFailure());f.arm((p,o)=>p===phase&&o==='cleanup'?'deadline_exceeded':undefined);
  f.root.upper.cleanupOwned('confirmed');expect(f.root.upper.inspect()).toMatchObject({current:{first_hard:{code:'worker_unavailable'},release:'unconfirmed'},budget:{observed_stop:'deadline_exceeded',deadline_ms:60000}});
});
it('records an initial cleanup stop before continuing cleanup-only, without retaining a healthy route',()=>{
  const f=setup();f.running();f.arm((p,o)=>p==='pre'&&o==='cleanup'?'deadline_exceeded':undefined);f.root.cleanupOwned('confirmed');
  expect(f.root.failure()).toMatchObject({first_hard:{code:'deadline_exceeded',stage:'cleanup'},current:{roles:{new_generation:{cleanup:'confirmed',termination:'unknown',resolved:false}}},budget:{deadline_ms:60000,observed_stop:'deadline_exceeded'}});
  expect(()=>f.root.claimGeneration()).toThrow('deadline_exceeded');f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());
});
it('bounds event telemetry without making saturation a production admission or discarding cleanup obligations',()=>{
  const f=setup();f.running();f.root.stop('cancelled');f.root.finalDiscard(f.root.transferFailure());
  for(let i=0;i<3000;i++)try{f.root.prepare();}catch{/* rejected old-owner entry */}
  f.root.upper.cleanupOwned('confirmed');expect(f.root.upper.inspect()).toMatchObject({capsule_pending:true,budget:{total:4096,saturated:true},current:{release:'unconfirmed',roles:{new_generation:{cleanup:'confirmed',termination:'unknown'}}}});
  expect(Object.keys(f.root.upper.inspect().budget!.costs)).toHaveLength(15);
});
it('does not call hostile dependencies or accept a foreign budget/owner registration',()=>{
  let calls=0;const touch=()=>{calls++;throw Error('PRIVATE');},proxy=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  for(const d of [proxy,{guard:touch,cleanup_guard:new Proxy(()=>undefined,{apply:touch})},Object.defineProperty({},'cleanup_guard',{get:touch}),{guard:touch,cleanup_guard:touch,budget:{}}]){
    const root=createSyntheticFailureCustodyRun(fixture(),d);expect(()=>root.prepare()).toThrow();expect(root.failure()).toMatchObject({notices:1,current:{unresolved:4},budget:{budget_bound:false}});
  }
  expect(calls).toBe(0);
});
it('normalizes cleanup guard exceptions before first hard instead of trusting their claimed code',()=>{
  const f=setup();f.running();f.arm(()=>{throw Object.assign(Error('PRIVATE_GUARD'),{code:'access_denied'});});
  expect(()=>f.root.cleanupOwned('confirmed')).toThrow('internal_review_error');expect(f.root.failure()).toMatchObject({first_hard:{code:'internal_review_error'},current:{roles:{new_generation:{cleanup:'not_requested'}}}});
  f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());f.root.upper.cleanupOwned('confirmed');
});
it.each(['pre','post'] as const)('fails closed on an unknown cleanup_guard return at cleanup %s, keeping the first hard',phase=>{
  const f=setup();f.running();f.root.stop('cancelled');f.root.finalDiscard(f.root.transferFailure());
  f.arm((p,o)=>o==='cleanup'&&p===phase?'caller_text':undefined);
  expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow('cancelled');
  const upper=f.root.upper.inspect();expect(upper.current?.first_hard.code).toBe('cancelled');expect(upper.budget?.observed_stop).toBeNull();
  // The pre checkpoint precedes the sink, so no cleanup fact may be recorded; post runs after the sink was already consumed.
  if(phase==='pre')expect(upper.current?.roles.new_generation.cleanup).toBe('not_requested');
});
