import {expect,it} from 'vitest';
import {createSyntheticNormalAdoptionRoot} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
const S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
function fixture(){
  const a=aggregate(),id='1'.repeat(32);
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,
      instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:{...a.limits,max_records:100},limitations:[...a.limitations],errors:[]},
      selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
}
function setup(raw:unknown=fixture()){
  let guard:(stage:string,n?:number)=>unknown=()=>undefined;
  const root=createSyntheticNormalAdoptionRoot(raw,{guard:(s:string,n?:number)=>guard(s,n)});
  return {root,arm:(fn:typeof guard)=>{guard=fn;},ready:()=>{
    root.prepare();root.move();root.startKernel();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();
    const ticket=root.claimGeneration(),lease=root.startGeneration(ticket.start),event=root.issueReady(lease);root.acceptReady(lease,event);return ticket;
  }};
}
it('adopts its same-pins accepted plan once without sealing or transferring content',()=>{
  const f=setup();f.ready();expect(f.root.adopt()).toBeUndefined();
  expect(f.root.inspect()).toMatchObject({normal_pending:true,supply:{pin_builds:1,pins_created:1},binding:{same_origin:true},
    adoption:{kernel_builds:1,content_completions:1,adoptions:1,pending:true,same_origin:true,window_bound:true,content_rows:1},
    permissions:{accepted_adoption:true,destination_seal:false,formal_issuance:false}});
  for(const name of ['transfer','sealBoundMixedExpectation','compare','pins','accepted','plan','register'])expect(f.root).not.toHaveProperty(name);
});
it.each(['source','cleanup'] as const)('invalidates adopted content synchronously on %s without reporting a hard failure or release',event=>{
  const f=setup(),t=f.ready();f.root.adopt();
  if(event==='source')f.root.beginSourceClose();else f.root.beginCleanup(t.cleanup);
  expect(f.root.inspect()).toMatchObject({state:'invalidated',normal_pending:false,binding:null,first_failure:null,budget:{state:'bound'},adoption:{pending:false,content_rows:0},failure:null});
  expect(()=>f.root.adopt()).toThrow();expect(f.root.inspect().adoption.adoptions).toBe(1);
});
it.each(['startKernel','adopt'] as const)('spends %s only once and clears both owners on duplicate',action=>{
  const f=setup();f.ready();if(action==='adopt')f.root.adopt();expect(()=>f.root[action]()).toThrow();
  expect(f.root.inspect()).toMatchObject({normal_pending:false,binding:null,failure_notices:1,adoption:{pending:false,content_rows:0,kernel_builds:1},kernel:{finish_accept:{pending:false},finish_seal:{seals:0},diagnostics:{hard:{code:'internal_review_error'}}}});
  expect(()=>f.root[action]()).toThrow();
});
it.each(['content_pre','content_post','adoption_pre','adoption_post'] as const)('preserves stop precedence at %s with no normal adoption publication',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','unknown','throw']){
    const f=setup();if(stage.startsWith('adoption'))f.ready();else{f.root.prepare();f.root.move();}
    f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE');return stop==='unknown'?'PRIVATE':stop;}});
    expect(()=>stage.startsWith('adoption')?f.root.adopt():f.root.startKernel()).toThrow();
    expect(f.root.inspect()).toMatchObject({first_failure:stop==='throw'||stop==='unknown'?'internal':stop,normal_pending:false,binding:null,adoption:{adoptions:0,pending:false,content_rows:0}});
    expect(JSON.stringify(f.root.inspect())).not.toContain('PRIVATE');f.arm(()=>undefined);expect(()=>f.root.adopt()).toThrow();
  }
});
it.each(['startKernel','adopt','prepare','move','beginSourceClose','discard','stop'] as const)('rejects swallowed %s reentry through completion and adoption guards',action=>{
  for(const stage of ['content_pre','content_post','adoption_pre','adoption_post']){
    const f=setup();if(stage.startsWith('adoption'))f.ready();else{f.root.prepare();f.root.move();}
    f.arm(s=>{if(s===stage)try{if(action==='stop')f.root.stop('cancelled');else f.root[action]();}catch{/* swallowed */}});
    expect(()=>stage.startsWith('adoption')?f.root.adopt():f.root.startKernel()).toThrow();
    expect(f.root.inspect()).toMatchObject({first_failure:action==='stop'?'cancelled':'reentrant',normal_pending:false,adoption:{adoptions:0,pending:false,content_rows:0}});
  }
});
it('does not publish completion or adoption before its post guard has returned',()=>{
  const f=setup(),snapshots:ReturnType<typeof f.root.inspect>[]=[];
  f.root.prepare();f.root.move();f.arm(s=>{if(s==='content_post')snapshots.push(f.root.inspect());});f.root.startKernel();
  expect(snapshots[0].adoption).toMatchObject({content_completions:0,content_rows:0,kernel_builds:0,pending:false});
  f.arm(()=>undefined);f.root.beginClosure();f.root.settleOld({termination:'confirmed',cleanup:'complete'});f.root.prepareGeneration();const t=f.root.claimGeneration(),lease=f.root.startGeneration(t.start),e=f.root.issueReady(lease);f.root.acceptReady(lease,e);
  f.arm(s=>{if(s==='adoption_post')snapshots.push(f.root.inspect());});f.root.adopt();
  expect(snapshots[1].adoption).toMatchObject({adoptions:0,pending:false});expect(f.root.inspect().adoption).toMatchObject({adoptions:1,pending:true});
});
it.each(['start','ready','cleanup','adopt'] as const)('rejects foreign %s values without changing the other root',kind=>{
  const a=setup(),b=setup(),claim=(f:ReturnType<typeof setup>)=>{
    f.root.prepare();f.root.move();f.root.startKernel();f.root.beginClosure();f.root.settleOld({termination:'confirmed',cleanup:'complete'});f.root.prepareGeneration();return f.root.claimGeneration();
  };
  const at=kind==='start'||kind==='ready'?claim(a):a.ready(),bt=kind==='start'||kind==='ready'?claim(b):b.ready();
  let foreignLease:object|undefined,foreignEvent:object|undefined;
  if(kind==='ready'){
    const ownLease=a.root.startGeneration(at.start);a.root.issueReady(ownLease);foreignLease=b.root.startGeneration(bt.start);foreignEvent=b.root.issueReady(foreignLease);
  }
  const before=b.root.inspect();
  expect(()=>{if(kind==='start')a.root.startGeneration(bt.start);else if(kind==='ready')a.root.acceptReady(foreignLease!,foreignEvent!);else if(kind==='cleanup')a.root.beginCleanup(bt.cleanup);else a.root.adopt(b.root);}).toThrow();
  expect(b.root.inspect()).toEqual(before);expect(a.root.inspect()).toMatchObject({normal_pending:false,adoption:{pending:false,adoptions:0},kernel:{finish_seal:{seals:0}}});
  expect(Reflect.ownKeys(at.start)).toEqual([]);
});
it.each(['move','startKernel','prepareGeneration','claimGeneration','adopt'] as const)('rejects %s before its prerequisite without creating authority',action=>{
  const f=setup();expect(()=>f.root[action]()).toThrow();expect(f.root.inspect()).toMatchObject({normal_pending:false,adoption:{adoptions:0,pending:false},permissions:{destination_seal:false,formal_issuance:false}});
});
it.each(['ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check','request_check_existing','request_check_unstarted'])('keeps the fixed no-verify profile and original budget through %s',point=>{
  const raw=fixture();raw.recovery.point=point;const f=setup(raw);f.root.prepare();f.root.move();f.root.startKernel();f.root.beginClosure();
  if(point==='request_check_unstarted')f.root.confirmOldUnstarted();else f.root.settleOld({termination:'confirmed',cleanup:'complete'});
  f.root.prepareGeneration();const t=f.root.claimGeneration(),lease=f.root.startGeneration(t.start),e=f.root.issueReady(lease);f.root.acceptReady(lease,e);f.root.adopt();
  expect(f.root.inspect()).toMatchObject({budget:{accounting:{requests:10,received_bytes:20,payload_bytes:30},started_at:S,deadline_ms:60000},adoption:{same_origin:true,window_bound:true},kernel:{worker_preparation:{verify_attempts:0},finish_seal:{seals:0}}});
});
it('blocks normal discard after resource creation and keeps cleanup responsibilities and first diagnostics',()=>{
  const f=setup();f.ready();f.root.adopt();expect(()=>f.root.discard()).toThrow();
  expect(f.root.inspect()).toMatchObject({normal_pending:false,adoption:{pending:false},failure:{release:'unconfirmed',roles:{new_generation:{generation:'created',termination:'unknown',cleanup:'not_requested'}}}});
});
it('keeps original reviewed, parent-omitted and worker-omitted rows in the same completed content',()=>{
  const f=fixture(),asset=(n:number,count:number)=>{
    const a=aggregate().assets[0];a.update_xml_sys_id=a.result.target.update_xml_sys_id=n.toString().repeat(32);a.result.reviewed_at=a.result.target.retrieved_at=O;
    a.result.target.record_updated_at='2026-10-17T04:58:00Z';a.result.findings=Array.from({length:count},()=>structuredClone(a.result.findings[0]));return a;
  },a=asset(1,99),b=asset(2,2),r=a.result;
  const context={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  const tail='4'.repeat(32);f.recovery.active_input_sys_id=tail;f.finish.inputs[0].update_xml_sys_id=tail;f.mixed.rows[0].outcome.update_xml_sys_id=tail;
  const raw={...f,finish:{...f.finish,header:{...f.finish.header,collection:{...f.finish.header.collection,metadata_seen:4,selected:4}},selected:['1','2','3','4'].map(x=>x.repeat(32)),
    inputs:[...[a,b].map(x=>({update_xml_sys_id:x.update_xml_sys_id,retrieved_at:O,state:'completed',expected_context:context})),{update_xml_sys_id:'3'.repeat(32),retrieved_at:O,state:'completed',expected_context:context},...f.finish.inputs]},
    mixed:{...f.mixed,rows:[{producer:'analysis',outcome:a},{producer:'analysis',outcome:b},{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:'3'.repeat(32),reason:'response_limit'}},...f.mixed.rows]}};
  const x=setup(raw);x.ready();x.root.adopt();expect(x.root.inspect()).toMatchObject({supply:{pins_created:1,parent_omitted:1,original_worker_omitted:1,original_reviewed_pins:2},adoption:{content_rows:4,same_origin:true,window_bound:true},kernel:{finish_seal:{seals:0}}});
});
it.each([1,100])('supports %i entirely retained rows including reviewed-zero without a forged empty proof',count=>{
  const raw=fixture();raw.finish.selected=Array.from({length:count},(_,n)=>(n+1).toString(16).padStart(32,'0'));
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null}));
  raw.mixed.rows=raw.finish.selected.map(update_xml_sys_id=>({producer:'retained',outcome:{state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}}));
  raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=count;raw.recovery.active_input_sys_id=raw.finish.selected.at(-1)!;
  const f=setup(raw);f.ready();f.root.adopt();expect(f.root.inspect()).toMatchObject({supply:{original_reviewed_pins:0},adoption:{content_rows:count,adoptions:1,same_origin:true}});
});
it('preserves 0.3 selection and seals no destination or finish candidate',()=>{
  const raw=fixture();Object.assign(raw.finish.header,{schema_version:'bp-mcp-review-0.3',
    selection:{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}},
    coverage:{...raw.finish.header.coverage,analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false}});
  raw.finish.header.limitations.push(...TARGET_LIMITATIONS);raw.mixed.initial_prefix.limitations.push(...TARGET_LIMITATIONS);
  const f=setup(raw);f.ready();f.root.adopt();expect(f.root.inspect()).toMatchObject({adoption:{pending:true},kernel:{finish_seal:{seals:0,pending:false}},permissions:{formal_issuance:false,destination_seal:false}});
});
it('keeps readonly diagnostics free of opaque refs, bodies, IDs and raw exceptions',()=>{
  const f=setup();f.ready();f.root.adopt();const json=JSON.stringify(f.root.inspect());
  for(const marker of ['1'.repeat(32),'"findings":','"result":','"receipt":','"accepted_outcome":'])expect(json).not.toContain(marker);
  expect(Object.isFrozen(f.root.inspect().adoption)).toBe(true);
});
it('rejects external binding/adoption fields at DATA construction and never consumes the other root',()=>{
  const a=setup();a.ready();a.root.adopt();const before=a.root.inspect();
  for(const key of ['pins','accepted','plan','owner','window','verify']){
    const raw=Object.assign(fixture(),{[key]:a.root}),b=setup(raw);expect(()=>b.root.prepare()).toThrow();expect(b.root.inspect().adoption.kernel_builds).toBe(0);
  }
  expect(a.root.inspect()).toEqual(before);
});
it('fails at every actual kernel checkpoint without publishing an adoption or recreating pins',()=>{
  const baseline=setup();let checkpoints=0;baseline.arm(s=>{if(s==='kernel')checkpoints++;});baseline.ready();baseline.root.adopt();expect(checkpoints).toBeGreaterThan(20);
  for(let point=1;point<=checkpoints;point++){
    const f=setup();let seen=0;f.arm(s=>s==='kernel'&&++seen===point?'cancelled':undefined);
    expect(()=>{f.ready();f.root.adopt();}).toThrow();expect(seen).toBeGreaterThanOrEqual(point);
    expect(f.root.inspect()).toMatchObject({first_failure:'cancelled',failure_notices:1,normal_pending:false,supply:{pins_created:1,pin_builds:1},adoption:{pending:false,adoptions:0,content_rows:0}});
    f.arm(()=>undefined);expect(()=>f.root.adopt()).toThrow();
  }
});
function failureStage(f:ReturnType<typeof setup>){return (f.root.inspect() as unknown as {failure:{first_hard:{code:string;stage:string}}|null}).failure?.first_hard;}
it.each([
  ['closure kernel checkpoint','cleanup'],['adoption_pre','transfer'],
] as const)('records a root-detected stop at %s with the operation stage, not the kernel revoke phase',(where,stage)=>{
  const f=setup();
  if(where==='adoption_pre'){f.ready();f.arm(s=>s==='adoption_pre'?'cancelled':undefined);expect(()=>f.root.adopt()).toThrow();}
  else{f.root.prepare();f.root.move();f.root.startKernel();f.arm(s=>s==='kernel'?'cancelled':undefined);expect(()=>f.root.beginClosure()).toThrow();}
  expect(failureStage(f)).toEqual({code:'cancelled',stage});expect(f.root.inspect()).toMatchObject({first_failure:'cancelled',failure_notices:1});
});
it('keeps the kernel phase stage for a failure the kernel detects itself',()=>{
  const f=setup();f.root.prepare();f.root.move();f.root.startKernel();f.root.beginClosure();f.root.settleOld({termination:'confirmed',cleanup:'complete'});f.root.prepareGeneration();f.root.claimGeneration();
  // A foreign start ticket is rejected inside the kernel's generation_start phase (prepare), not the root's generation stage (transfer).
  expect(()=>f.root.startGeneration({})).toThrow();
  expect(failureStage(f)).toEqual({code:'internal_review_error',stage:'prepare'});expect(f.root.inspect().failure_notices).toBe(1);
});
it('rejects extra startKernel arguments and lets content_post and adoption_post stops outrank mismatches',()=>{
  const a=setup();a.root.prepare();a.root.move();expect(()=>(a.root.startKernel as (...x:unknown[])=>void)({})).toThrow('internal_review_error');
  expect(a.root.inspect()).toMatchObject({first_failure:'binding',adoption:{kernel_builds:0}});
  const b=setup();b.root.prepare();b.root.move();b.arm(s=>s==='content_post'?'deadline_exceeded':undefined);
  expect(()=>(b.root.startKernel as (...x:unknown[])=>void)({})).toThrow();expect(b.root.inspect().first_failure).toBe('deadline_exceeded');
  const c=setup();c.ready();c.arm(s=>s==='adoption_post'?'deadline_exceeded':undefined);
  expect(()=>(c.root.adopt as (...x:unknown[])=>void)({})).toThrow();expect(c.root.inspect()).toMatchObject({first_failure:'deadline_exceeded',adoption:{pending:false,adoptions:0}});
});
