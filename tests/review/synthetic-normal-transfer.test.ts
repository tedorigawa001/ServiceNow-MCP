import {expect,it} from 'vitest';
import {createSyntheticNormalTransferRoot} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
function fixture(){
  const a=aggregate(),id='1'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,
      instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations],errors:[]},
      selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
}
function setup(raw:unknown=fixture()){
  let guard:(stage:string,n?:number)=>unknown=()=>undefined;
  const root=createSyntheticNormalTransferRoot(raw,{guard:(s:string,n?:number)=>guard(s,n)});
  return {root,arm:(fn:typeof guard)=>{guard=fn;},adopt:()=>{
    root.prepare();root.move();root.startKernel();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();
    const ticket=root.claimGeneration(),lease=root.startGeneration(ticket.start),event=root.issueReady(lease);root.acceptReady(lease,event);root.adopt();return ticket;
  }};
}
it('takes both original slots once, validates, then fixed-aborts without a seal or usable handle',()=>{
  const f=setup();f.adopt();const snapshots:ReturnType<typeof f.root.inspect>[]=[];
  f.arm(s=>{if(s==='transfer_pre'||s==='transfer_post')snapshots.push(f.root.inspect());});
  expect(()=>f.root.abortBoundTransfer()).toThrow('internal_review_error');
  for(const s of snapshots)expect(s).toMatchObject({normal_pending:false,adoption:{pending:false},transfer:{started:true,takes:1,pending:true},kernel:{finish_accept:{pending:false},finish_seal:{seals:0}}});
  expect(f.root.inspect()).toMatchObject({first_failure:'state',normal_pending:false,transfer:{takes:1,pending:false,aborts:1,successful_seals:0},adoption:{pending:false},failure_notices:1});
  expect(()=>f.root.abortBoundTransfer()).toThrow();
});
it('moves only a payload-cleared cleanup capsule to upper and consumes the matching final receipt once',()=>{
  const f=setup();f.adopt();expect(()=>f.root.abortBoundTransfer()).toThrow();const receipt=f.root.transferFailure();
  expect(f.root.custody()).toMatchObject({holder:'upper',payload_cleared:true,local_capsule:false,upper_capsule:true,discards:0});
  const report=f.root.upper.inspect().report;expect(report).toMatchObject({first_hard:{stage:'transfer'},release:'unconfirmed'});
  expect(()=>f.root.cleanupOwned('confirmed')).toThrow();f.root.finalDiscard(receipt);f.root.upper.cleanupOwned('confirmed');
  expect(f.root.custody()).toMatchObject({holder:'upper',discards:1});expect(f.root.upper.inspect().report).toEqual(report);
  expect(f.root.upper.inspect().current).toMatchObject({release:'unconfirmed',roles:{new_generation:{termination:'unknown',cleanup:'confirmed',resolved:false}}});
  expect(()=>f.root.finalDiscard(receipt)).toThrow();
});
it('cannot invalidate the upper receipt or cleanup sink from a retired local stop method',()=>{
  const f=setup();f.adopt();expect(()=>f.root.abortBoundTransfer()).toThrow();const r=f.root.transferFailure(),before=f.root.upper.inspect();
  expect(()=>f.root.stop('cancelled')).toThrow();expect(f.root.upper.inspect()).toEqual(before);
  f.root.finalDiscard(r);expect(f.root.custody().discards).toBe(1);f.root.upper.cleanupOwned('confirmed');
});
it('treats a healthy failure-transfer attempt as a hard rejection and consumes that claim',()=>{
  const f=setup();f.adopt();expect(()=>f.root.transferFailure()).toThrow();
  expect(f.root.inspect()).toMatchObject({normal_pending:false,adoption:{pending:false},failure_notices:1});expect(()=>f.root.transferFailure()).toThrow();
});
it('spends final discard even when extra arguments reject its matching receipt',()=>{
  const f=setup();f.adopt();expect(()=>f.root.abortBoundTransfer()).toThrow();const receipt=f.root.transferFailure();
  expect(()=>f.root.finalDiscard(receipt,{})).toThrow();expect(()=>f.root.finalDiscard(receipt)).toThrow();expect(f.root.custody().discards).toBe(0);
  f.root.upper.cleanupOwned('confirmed');
});
it.each(['transfer_pre','transfer_post'] as const)('gives %s cancellation/deadline priority over extra arguments and discards the pending body',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','unknown','throw']){
    const f=setup();f.adopt();f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE');return stop==='unknown'?'PRIVATE':stop;}});
    expect(()=>f.root.abortBoundTransfer({})).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:stop==='unknown'||stop==='throw'?'internal':stop,normal_pending:false,adoption:{pending:false},transfer:{takes:1,pending:false,aborts:0,successful_seals:0}});
    f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(JSON.stringify(f.root.custody())).not.toContain('PRIVATE');
  }
});
it.each(['abortBoundTransfer','adopt','prepare','move','beginSourceClose','discard','stop'] as const)('detects swallowed %s reentry in the transfer scope',method=>{
  for(const stage of ['transfer_pre','transfer_post']){
    const f=setup();f.adopt();f.arm(s=>{if(s===stage)try{if(method==='stop')f.root.stop('cancelled');else f.root[method]();}catch{/* swallowed */}});
    expect(()=>f.root.abortBoundTransfer()).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:method==='stop'?'cancelled':'reentrant',normal_pending:false,adoption:{pending:false},transfer:{pending:false,successful_seals:0}});
    f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());
  }
});
it.each(['seal','commit','discard'] as const)('keeps a single custody holder on failure_%s guard throws or swallowed reentry',operation=>{
  for(const phase of ['pre','post'])for(const kind of ['throw','unknown','reenter']){
    const f=setup();f.adopt();expect(()=>f.root.abortBoundTransfer()).toThrow();const receipt=operation==='discard'?f.root.transferFailure():undefined;
    f.arm(s=>{if(s===`failure_${operation}_${phase}`){if(kind==='throw')throw Error('PRIVATE');if(kind==='unknown')return 'PRIVATE';try{f.root.transferFailure();}catch{/* swallowed */}}});
    expect(()=>operation==='discard'?f.root.finalDiscard(receipt!):f.root.transferFailure()).toThrow();
    expect(f.root.custody()).toMatchObject({holder:operation==='discard'?'upper':'local',local_capsule:operation!=='discard',upper_capsule:operation==='discard',discards:0});
    expect(f.root.inspect().failure_notices).toBe(1);f.arm(()=>undefined);if(operation==='discard')f.root.upper.cleanupOwned('confirmed');else f.root.cleanupOwned('confirmed');
  }
});
it.each(['foreign','copy','summary'] as const)('rejects a %s final receipt without changing the other capsule',kind=>{
  const a=setup(),b=setup();a.adopt();b.adopt();expect(()=>a.root.abortBoundTransfer()).toThrow();expect(()=>b.root.abortBoundTransfer()).toThrow();const ar=a.root.transferFailure(),br=b.root.transferFailure(),before=b.root.custody();
  expect(()=>a.root.finalDiscard((kind==='foreign'?br:kind==='copy'?{...ar}:a.root.custody()) as typeof ar)).toThrow();expect(()=>a.root.finalDiscard(ar)).toThrow();
  expect(b.root.custody()).toEqual(before);b.root.finalDiscard(br);a.root.upper.cleanupOwned('confirmed');b.root.upper.cleanupOwned('confirmed');
});
it.each(['pre','post'] as const)('retains the immutable report on a late cleanup %s checkpoint failure',phase=>{
  const f=setup();f.adopt();expect(()=>f.root.abortBoundTransfer()).toThrow();f.root.finalDiscard(f.root.transferFailure());const report=f.root.upper.inspect().report;
  f.arm(s=>{if(s===`failure_cleanup_${phase}`)throw Error('PRIVATE');});expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow();
  expect(f.root.upper.inspect().report).toBe(report);expect(f.root.upper.inspect().current).toMatchObject({roles:{new_generation:{cleanup:phase==='pre'?'not_requested':'confirmed',termination:'unknown'}}});
  f.arm(()=>undefined);if(phase==='pre')f.root.upper.cleanupOwned('confirmed');else expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow();
});
it('moves unbound/unknown responsibilities without inventing an empty budget or resource absence',()=>{
  const f=setup({secret:'PRIVATE_BODY'});expect(()=>f.root.prepare()).toThrow();f.root.finalDiscard(f.root.transferFailure());
  expect(f.root.inspect()).toMatchObject({budget:{state:'unbound',accounting:null},transfer:{takes:0,successful_seals:0}});expect(f.root.upper.inspect().current).toMatchObject({unresolved:4,release:'unconfirmed'});
  expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow();expect(JSON.stringify(f.root.custody())).not.toContain('PRIVATE_BODY');
});
it.each(['transferFailure','cleanupOwned','finalDiscard'] as const)('hard-stops swallowed terminal %s reentry while content is pending',method=>{
  const f=setup();f.adopt();f.arm(s=>{if(s==='transfer_pre')try{if(method==='cleanupOwned')f.root.cleanupOwned('confirmed');else if(method==='finalDiscard')f.root.finalDiscard({} as never);else f.root.transferFailure();}catch{/* swallowed */}});
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:'reentrant',normal_pending:false,transfer:{pending:false,aborts:0}});
});
it.each(['source','cleanup'] as const)('refuses transfer after %s invalidation without restoring an accepted route',event=>{
  const f=setup(),t=f.adopt();if(event==='source')f.root.beginSourceClose();else f.root.beginCleanup(t.cleanup);
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(f.root.inspect()).toMatchObject({normal_pending:false,transfer:{takes:0,pending:false,successful_seals:0}});
  f.root.finalDiscard(f.root.transferFailure());expect(f.root.upper.inspect().current?.release).toBe('unconfirmed');
});
it('retains the original accounting and expiry while cleanup checkpoints observe a later deadline',()=>{
  const f=setup();f.adopt();expect(()=>f.root.stop('cancelled')).toThrow();const before=f.root.inspect().budget;f.arm(s=>s.startsWith('failure_')?'deadline_exceeded':undefined);
  f.root.finalDiscard(f.root.transferFailure());f.root.upper.cleanupOwned('confirmed');expect(f.root.inspect().budget).toEqual(before);
  expect(f.root.upper.inspect().current?.first_hard.code).toBe('cancelled');expect(f.root.upper.inspect().current?.release).toBe('unconfirmed');
});
it('can transfer cleanup-only ownership after every real kernel checkpoint stop, including unpublished allocations',()=>{
  const baseline=setup();let count=0;baseline.arm(s=>{if(s==='kernel')count++;});baseline.adopt();expect(count).toBeGreaterThan(20);
  for(let at=1;at<=count;at++){
    const f=setup();let seen=0;f.arm(s=>s==='kernel'&&++seen===at?'cancelled':undefined);expect(()=>f.adopt()).toThrow();f.arm(()=>undefined);
    f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody()).toMatchObject({holder:'upper',payload_cleared:true,local_capsule:false,upper_capsule:true,discards:1});
    const k=f.root.inspect().kernel;if(k?.new_generation?.cleanup_pending)f.root.upper.cleanupOwned(k.new_generation.starts?'confirmed':'not_required');
    expect(f.root.upper.inspect().current).toMatchObject({release:'unconfirmed',first_hard:{code:'cancelled'},roles:{transport_group:{generation:'unknown'}}});
  }
});
it.each(['pre','post'] as const)('detects swallowed retired-local stop during upper cleanup %s without undoing recorded facts',phase=>{
  const f=setup();f.adopt();expect(()=>f.root.abortBoundTransfer()).toThrow();const r=f.root.transferFailure(),report=f.root.upper.inspect().report;
  f.arm(s=>{if(s===`failure_cleanup_${phase}`)try{f.root.stop('cancelled');}catch{/* swallowed */}});expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow();
  expect(f.root.upper.inspect().report).toBe(report);expect(f.root.upper.inspect().current).toMatchObject({roles:{new_generation:{cleanup:phase==='pre'?'not_requested':'confirmed',termination:'unknown'}}});
  f.arm(()=>undefined);f.root.finalDiscard(r);if(phase==='pre')f.root.upper.cleanupOwned('confirmed');else expect(()=>f.root.upper.cleanupOwned('confirmed')).toThrow();
});
