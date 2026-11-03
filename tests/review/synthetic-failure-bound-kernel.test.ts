import {expect,it} from 'vitest';
import {createSyntheticFailureBoundKernel} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
const id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(point='analyze_timer'){
  const a=aggregate(),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z',selected=[id(1),id(2)];
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point,active_input_sys_id:id(2),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,
      instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:{...a.collection,metadata_seen:2,selected:2},coverage:{...a.coverage,analysis_complete:false},
      limits:a.limits,limitations:[...a.limitations],errors:[]},selected,inputs:selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null}))},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:selected.map(update_xml_sys_id=>({producer:'retained',outcome:{state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}}))}};
}
const points=['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'] as const;
function setup(point:typeof points[number]='analyze_timer'){
  let guard:(stage:string,n?:number)=>unknown=()=>undefined;
  const root=createSyntheticFailureBoundKernel(fixture(point),{guard:(stage:string,n?:number)=>guard(stage,n)});
  return {root,arm:(next:typeof guard)=>{guard=next;},prepared:()=>{root.prepare();root.beginClosure();if(point==='request_check_unstarted')root.confirmOldUnstarted();else root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();}};
}
it('binds the same private initial source and old frame before kernel operations, without proving transport absence',()=>{
  const root=createSyntheticFailureBoundKernel(fixture(),{guard:()=>undefined});root.prepare();root.stop('cancelled');
  expect(root.failure()).toMatchObject({notices:1,current:{first_hard:{code:'cancelled'},release:'unconfirmed',unresolved:4,
    roles:{source:{generation:'created',termination:'unknown'},old_generation:{generation:'created'},transport_group:{generation:'unknown'},new_generation:{generation:'unknown'}}},
    protected:true,bindings:{source:{bound:true},old_generation:{bound:true},new_generation:{bound:false}}});
  expect(root.inspect().supply).toMatchObject({pending:false,retained_rows:0});
});
it('keeps source closure and new-frame cleanup separate from missing source cleanup and worker termination',()=>{
  const root=createSyntheticFailureBoundKernel(fixture(),{guard:()=>undefined});root.prepare();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();
  const ticket=root.claimGeneration(),lease=root.startGeneration(ticket.start),event=root.issueReady(lease);root.acceptReady(lease,event);
  root.beginSourceClose();root.settleSourceClose('closed');root.cleanupOwned('confirmed');root.stop('deadline_exceeded');
  expect(root.failure()).toMatchObject({current:{release:'unconfirmed',unresolved:3,roles:{source:{termination:'confirmed',cleanup:'requested',resolved:false},
    old_generation:{termination:'confirmed',cleanup:'confirmed',resolved:true},new_generation:{generation:'created',termination:'unknown',cleanup:'confirmed',resolved:false},transport_group:{generation:'unknown'}}}});
});
it('retains an allocated but unpublished new-frame cleanup capsule across the claim post guard',()=>{
  let stop=false,n=0;const root=createSyntheticFailureBoundKernel(fixture(),{guard:(stage:string)=>stage==='kernel'&&stop&&++n===2?'cancelled':undefined});
  root.prepare();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();stop=true;
  expect(()=>root.claimGeneration()).toThrow('cancelled');stop=false;
  expect(root.failure()).toMatchObject({current:{roles:{new_generation:{generation:'creating',resolved:false}}},bindings:{new_generation:{bound:true,started:false,cleanup_pending:true}}});
  root.cleanupOwned('not_required');expect(root.failure()).toMatchObject({notices:1,current:{roles:{new_generation:{generation:'creating',termination:'unknown',resolved:false}}},bindings:{new_generation:{settled:true,cleanup_pending:false}}});
});
it('keeps separate old termination and cleanup facts when settle fails before returning closure evidence',()=>{
  const root=createSyntheticFailureBoundKernel(fixture(),{guard:()=>undefined});root.prepare();root.beginClosure();
  expect(()=>root.settleOld({termination:'confirmed',cleanup:'failed'})).toThrow('internal_review_error');
  expect(root.failure()).toMatchObject({notices:1,phase:'worker_closure_settle',protected:true,current:{first_hard:{stage:'cleanup'},
    roles:{old_generation:{generation:'created',termination:'confirmed',cleanup:'unconfirmed',resolved:false}}}});
  expect(root.inspect().kernel).toMatchObject({state:'failed',worker_closure:{termination:'confirmed',cleanup:'failed',evidence_pending:false}});
});
it.each(points)('creates a private consistent topology and keeps missing termination unknown for %s',point=>{
  const f=setup(point);f.prepared();const t=f.root.claimGeneration(),l=f.root.startGeneration(t.start),e=f.root.issueReady(l);f.root.acceptReady(l,e);
  f.root.stop('cancelled');f.root.cleanupOwned('confirmed');
  expect(f.root.inspect().kernel!.worker_preparation!.accounting).toEqual({requests:10,received_bytes:20,payload_bytes:30});
  expect(f.root.failure()).toMatchObject({notices:1,protected:true,protection_checks:1,binding_fault:false,current:{unresolved:3,release:'unconfirmed',
    roles:{old_generation:{generation:point==='request_check_unstarted'?'not_created':'created',resolved:true},new_generation:{generation:'created',termination:'unknown',cleanup:'confirmed',resolved:false},transport_group:{generation:'unknown'}}}});
  expect(()=>f.root.claimGeneration()).toThrow('cancelled');expect(f.root.inspect().supply).toMatchObject({pending:false,retained_rows:0});
  for(const key of ['kernel','source','seed','facts','accepted','pins','issuer','local','upper','seal','commit','finalDiscard','adopt','register'])expect(f.root).not.toHaveProperty(key);
});
// Independent table: completion requires both facts, not the kernel's success return or counters.
it.each([
  ['confirmed','complete',true,'confirmed','confirmed'],['confirmed','failed',false,'confirmed','unconfirmed'],['confirmed','unconfirmed',false,'confirmed','unconfirmed'],
  ['rejected','complete',false,'unknown','confirmed'],['unconfirmed','complete',false,'unknown','confirmed'],['rejected','failed',false,'unknown','unconfirmed'],
  ['unconfirmed','unconfirmed',false,'unknown','unconfirmed'],['PRIVATE','complete',false,'unknown','confirmed'],['confirmed','PRIVATE',false,'confirmed','unconfirmed'],
] as const)('preserves old facts for termination=%s cleanup=%s',(termination,cleanup,ok,termFact,cleanupFact)=>{
  const f=setup();f.root.prepare();f.root.beginClosure();
  if(ok){f.root.settleOld({termination,cleanup});f.root.stop('cancelled');}else expect(()=>f.root.settleOld({termination,cleanup})).toThrow('internal_review_error');
  expect(f.root.failure()).toMatchObject({notices:1,protected:true,binding_fault:false,current:{roles:{old_generation:{termination:termFact,cleanup:cleanupFact,resolved:ok}}}});
  expect(JSON.stringify(f.root.inspect())).not.toContain('PRIVATE');expect(JSON.stringify(f.root.failure())).not.toContain('PRIVATE');
});
it.each(['claim','start','issue','accept'] as const)('retains same-frame cleanup at both %s guards without publishing an absence proof',step=>{
  for(const at of [1,2]){
    const f=setup();f.prepared();const t=step==='claim'?undefined:f.root.claimGeneration(),l=step==='issue'||step==='accept'?f.root.startGeneration(t!.start):undefined,e=step==='accept'?f.root.issueReady(l!):undefined;
    let n=0;f.arm(stage=>stage==='kernel'&&++n===at?'deadline_exceeded':undefined);
    expect(()=>step==='claim'?f.root.claimGeneration():step==='start'?f.root.startGeneration(t!.start):step==='issue'?f.root.issueReady(l!):f.root.acceptReady(l!,e!)).toThrow('deadline_exceeded');
    f.arm(()=>undefined);const created=step==='issue'||step==='accept'||step==='start'&&at===2;
    expect(f.root.failure()).toMatchObject({notices:1,protected:true,protection_checks:1,binding_fault:false,current:{roles:{new_generation:{generation:created?'created':'creating',termination:'unknown',resolved:false}}}});
    if(step!=='claim'||at===2){f.root.cleanupOwned(created?'confirmed':'not_required');expect(f.root.failure().bindings.new_generation).toMatchObject({settled:true,cleanup_pending:false});}
    else expect(()=>f.root.cleanupOwned('not_required')).toThrow('deadline_exceeded');
    expect(f.root.failure().notices).toBe(1);
  }
});
it.each(['foreign','copy','summary','old_report'] as const)('rejects a %s cleanup sink and still drains only its own held capsule',kind=>{
  const a=setup(),b=setup();a.prepared();b.prepared();const at=a.root.claimGeneration(),bt=b.root.claimGeneration();a.root.startGeneration(at.start);b.root.startGeneration(bt.start);
  const before=b.root.inspect(),diagnostic=b.root.failure(),bad=kind==='foreign'?bt.cleanup:kind==='copy'?{...at.cleanup}:kind==='summary'?a.root.failure():{};
  expect(()=>a.root.beginCleanup(bad)).toThrow('internal_review_error');expect(b.root.inspect()).toEqual(before);expect(b.root.failure()).toEqual(diagnostic);
  a.root.cleanupOwned('confirmed');expect(a.root.failure()).toMatchObject({notices:1,binding_fault:false,current:{roles:{new_generation:{cleanup:'confirmed',termination:'unknown',resolved:false}}}});
  expect(()=>a.root.cleanupOwned('confirmed')).toThrow('internal_review_error');expect(a.root.failure().notices).toBe(1);
});
it.each(['confirmed','requested','not_started','failed','unconfirmed','not_required','PRIVATE'] as const)('projects only same-start accepted cleanup %s without inventing a worker exit',status=>{
  const f=setup();f.prepared();const t=f.root.claimGeneration();f.root.startGeneration(t.start);f.root.stop('cancelled');
  if(status==='confirmed')f.root.cleanupOwned(status);else expect(()=>f.root.cleanupOwned(status)).toThrow('cancelled');
  expect(f.root.failure()).toMatchObject({notices:1,current:{first_hard:{code:'cancelled'},roles:{new_generation:{generation:'created',cleanup:status==='confirmed'?'confirmed':'unconfirmed',termination:'unknown',resolved:false}}},bindings:{new_generation:{settled:true,cleanup_pending:false}}});
  expect(JSON.stringify(f.root.inspect())).not.toContain('PRIVATE');
});
it('does not accept a cleanup result before the same-sink begin claim or restore it on replay',()=>{
  const f=setup();f.prepared();const t=f.root.claimGeneration();f.root.startGeneration(t.start);
  expect(()=>f.root.settleCleanup(t.cleanup,'confirmed')).toThrow('internal_review_error');
  expect(f.root.failure()).toMatchObject({current:{roles:{new_generation:{cleanup:'not_requested',termination:'unknown',resolved:false}}},bindings:{new_generation:{settled:true,cleanup_pending:false}}});
  expect(()=>f.root.beginCleanup(t.cleanup)).toThrow('internal_review_error');expect(f.root.failure().notices).toBe(1);
});
it.each(['old','source'] as const)('protects %s accepted facts before a failing post guard clears the kernel',which=>{
  const f=setup();f.root.prepare();f.root.beginClosure();if(which==='source'){f.root.settleOld({termination:'confirmed',cleanup:'complete'});f.root.beginSourceClose();}
  let n=0;f.arm(stage=>stage==='kernel'&&++n===2?'cancelled':undefined);
  expect(()=>which==='old'?f.root.settleOld({termination:'confirmed',cleanup:'complete'}):f.root.settleSourceClose('closed')).toThrow('cancelled');
  const current=f.root.failure().current!;expect(f.root.failure()).toMatchObject({protected:true,protection_checks:1,binding_fault:false,notices:1});
  if(which==='old')expect(current.roles.old_generation).toMatchObject({termination:'confirmed',cleanup:'confirmed',resolved:true});
  else expect(current.roles.source).toMatchObject({termination:'confirmed',cleanup:'requested',resolved:false});
});
it('retains an unstarted old creator proof only on the fixed same-construction no-start branch',()=>{
  const a=setup('request_check_unstarted');a.root.prepare();a.root.beginClosure();a.root.stop('cancelled');expect(a.root.failure().current!.roles.old_generation.generation).toBe('unknown');
  const b=setup();b.root.prepare();b.root.beginClosure();expect(()=>b.root.confirmOldUnstarted()).toThrow();expect(b.root.failure().current!.roles.old_generation).toMatchObject({generation:'created',termination:'unknown'});
});
it.each(['failed','unconfirmed','PRIVATE'] as const)('does not project source completion from %s',status=>{
  const f=setup();f.root.prepare();f.root.beginClosure();f.root.beginSourceClose();expect(()=>f.root.settleSourceClose(status)).toThrow('internal_review_error');
  expect(f.root.failure()).toMatchObject({current:{roles:{source:{termination:'unknown',cleanup:'requested',resolved:false}}},protected:true});
  expect(()=>f.root.settleSourceClose('closed')).toThrow('internal_review_error');expect(JSON.stringify(f.root.inspect())).not.toContain('PRIVATE');
});
it('retains malformed construction diagnostics without calling getters, guards or creating a kernel',()=>{
  let calls=0;const touch=()=>{calls++;throw Error('PRIVATE');},proxy=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  for(const raw of [proxy,{},Object.defineProperty(fixture(),'finish',{get:touch})]){const root=createSyntheticFailureBoundKernel(raw,{guard:touch});expect(()=>root.prepare()).toThrow();expect(root.failure()).toMatchObject({notices:1,protected:false,current:{unresolved:4}});expect(root.inspect().kernel).toBe(null);}
  for(const deps of [proxy,{guard:new Proxy(()=>undefined,{apply:touch})},{guard:touch,source:{}},{}]){const root=createSyntheticFailureBoundKernel(fixture(),deps);expect(()=>root.prepare()).toThrow();expect(root.failure().current!.unresolved).toBe(4);}
  expect(calls).toBe(0);
});
it.each(['prepare','beginClosure','prepareGeneration','claimGeneration','cleanupOwned','stop'] as const)('rejects extra capabilities at %s and keeps its fixed first diagnostic',operation=>{
  const f=setup();
  expect(()=>{if(operation==='prepare')f.root.prepare({});else if(operation==='beginClosure')f.root.beginClosure({});else if(operation==='prepareGeneration')f.root.prepareGeneration({});
    else if(operation==='claimGeneration')f.root.claimGeneration({});else if(operation==='cleanupOwned')f.root.cleanupOwned('confirmed',{});else f.root.stop('cancelled',{});}).toThrow('internal_review_error');
  expect(f.root.failure()).toMatchObject({notices:1,current:{first_hard:{code:'internal_review_error'},unresolved:4}});
});
it.each(['prepare','beginClosure','claimGeneration','cleanupOwned'] as const)('rejects swallowed %s reentry without resetting birth claims or returning a route',operation=>{
  const f=setup();f.prepared();let once=false;f.arm(stage=>{if(stage==='kernel'&&!once){once=true;try{
    if(operation==='prepare')f.root.prepare();else if(operation==='beginClosure')f.root.beginClosure();else if(operation==='claimGeneration')f.root.claimGeneration();else f.root.cleanupOwned('confirmed');
  }catch{/* caller swallows nested failure */}}});
  expect(()=>f.root.claimGeneration()).toThrow('internal_review_error');f.arm(()=>undefined);
  expect(f.root.failure()).toMatchObject({notices:1,protected:true,binding_fault:false,current:{release:'unconfirmed'}});expect(f.root.inspect().supply).toMatchObject({pending:false,retained_rows:0});
});
it('synchronously revokes from a guard without returning a ticket or losing an unpublished cleanup sink',()=>{
  for(const at of [1,2]){
    const f=setup();f.prepared();let n=0;f.arm(stage=>{if(stage==='kernel'&&++n===at)f.root.stop('cancelled');});
    expect(()=>f.root.claimGeneration()).toThrow('cancelled');f.arm(()=>undefined);
    expect(f.root.failure()).toMatchObject({notices:1,protected:true,protection_checks:1,binding_fault:false,current:{first_hard:{code:'cancelled'}}});
    if(at===2)f.root.cleanupOwned('not_required');
    expect(f.root.inspect().supply).toMatchObject({pending:false,retained_rows:0});
  }
});
