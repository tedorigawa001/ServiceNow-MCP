import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticFinishPins} from '../support/review/synthetic-finish-pins.js';
import {projectSyntheticFinishPlanBinding,type SyntheticFinishPlanView} from '../support/review/synthetic-finish-plan-binding.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import type {SyntheticFinishContextEvidence} from '../support/review/synthetic-finish-context-values.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function ready(raw:unknown=fixture()){let guard:()=>string|undefined=()=>undefined;const root=createSyntheticPinnedRecoveryRoot(raw,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease);return {root,b,ticket,ready,arm:(fn:()=>string|undefined)=>{guard=fn;}};}
function sealed(raw:unknown=fixture()){const f=ready(raw),plan=f.root.sealRecoveryPlan(f.b,f.ready);return {...f,plan};}
function transferred(raw:unknown=fixture()){const f=sealed(raw),handoff=f.root.transferRecoveryPlan(f.b,f.plan);return {...f,handoff};}
function bound(raw:unknown=fixture()){const f=transferred(raw);f.root.bindRecoveryPlan(f.b,f.handoff);return f;}
function closeResources(f:ReturnType<typeof transferred>){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
function write(raw:unknown,path:string,value:unknown){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;v[keys.at(-1)!]=value;}
function view(raw=fixture()){
  const pins=createSyntheticFinishPins(raw.finish),c=pins.seed.run_context,owner={},frame={supervisor:{},worker:{},generation:{}};
  const assets=pins.outcomes.map(x=>x.state==='reviewed'?{state:x.state,update_xml_sys_id:x.update_xml_sys_id}:x.state==='result_omitted'?{state:x.state,update_xml_sys_id:x.update_xml_sys_id,reason:x.reason}:{...x});
  const consistency=raw.consistency as 'unverified'|'changed'|'stable_observation';
  const plan:SyntheticFinishPlanView={owner,frame,seed:{run:c.run,session:c.session,source:c.source,key:c.key,origin:c.origin,budget:c.budget,release:c.release,started_at:c.started_at,deadline_ms:c.deadline_ms,observed_at:c.observed_at,upper_utc:c.upper_utc},time:{...raw.finish.time},
    inputs:{context:{source:c.source,budget:c.budget,release:c.release,origin:c.origin,window:c.window,verify:null},rows:[...pins.seed.selected],assets,completed:assets.filter(x=>x.state!=='not_processed'),inputs:pins.receipts.map(x=>({receipt:x.receipt,update_xml_sys_id:x.update_xml_sys_id,retrieved_at:x.retrieved_at,state:x.state})),accounting:{...raw.accounting},collection_status:raw.finish.header.collection.status as 'complete'|'failed',consistency},
    verify:{verify_required:false,verify_calls:0,attempts:0,retry_waits:0,stage:'verified',consistency,verify_error:null,errors:consistency==='changed'?['changed_during_review']:[],limitations:consistency==='stable_observation'?[]:['provisional_results',consistency==='changed'?'changed_during_review':'consistency_unverified'],accounting:{...raw.accounting}}};
  const route={owner,frame,source:c.source,source_identity:{},cleanup_identity:{},sink:{},ready_origin:{},serial:0 as const};return {pins,plan,route};
}
function mixed(omitted=false){
  const raw=fixture(),expected={record_updated_at:S,instance_binding:raw.finish.header.target.instance_binding,instance_release:{...raw.finish.header.instance_release},requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};
  raw.finish.selected=[id(1),id(2),id(3)];raw.finish.header.collection.selected=raw.finish.header.collection.metadata_seen=3;
  write(raw,'finish.inputs',[{update_xml_sys_id:id(1),retrieved_at:O,state:'not_processed',expected_context:null,accepted:null},{update_xml_sys_id:id(2),retrieved_at:O,state:'completed',expected_context:expected,accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(2),retrieved_at:O}},{update_xml_sys_id:id(3),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}]);
  write(raw,'finish.outcomes',[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'},omitted?{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'}:{state:'reviewed',update_xml_sys_id:id(2)},{state:'not_processed',update_xml_sys_id:id(3),reason:'deadline_exceeded'}]);return raw;
}
it('binds the same private handoff/pin/live route once without issuing finish evidence',()=>{
  const f=ready(),plan=f.root.sealRecoveryPlan(f.b,f.ready),handoff=f.root.transferRecoveryPlan(f.b,plan);expect(f.root.bindRecoveryPlan(f.b,handoff)).toBeUndefined();
  f.root.checkBoundRecoveryPlan(f.b,handoff);expect(f.root.inspect()).toMatchObject({state:'plan_transferred',route_bound:true,evidence_issues:0,finish_binding:{state:'bound',started:true,bindings:1,active:true,selected:1,inputs:1,limitations:5,errors:1,errors_truncated:false,consistency:'unverified'}});
  f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
  f.root.discardBoundRecoveryPlan(f.b,handoff);f.root.close(f.b);expect(f.root.inspect()).toMatchObject({state:'closed',route_bound:false,finish_binding:{state:'discarded',bindings:1,active:false}});
});
it('consumes the binding claim before guards and publishes the slot only after the post guard',()=>{
  const f=transferred(),seen:unknown[]=[];f.arm(()=>{const b=f.root.inspect().finish_binding;seen.push([b?.state,b?.started,b?.bindings,b?.active]);return undefined;});f.root.bindRecoveryPlan(f.b,f.handoff);
  expect(seen).toEqual([['checking',true,0,false],['checking',true,0,false]]);expect(f.root.inspect().route_bound).toBe(true);
});
it('allows repeated health checks without a second bind or claim consumption',()=>{
  const f=bound();f.root.checkBoundRecoveryPlan(f.b,f.handoff);f.root.checkBoundRecoveryPlan(f.b,f.handoff);expect(f.root.inspect().finish_binding).toMatchObject({bindings:1,active:true});
});
it('rejects a second bind permanently instead of restoring the private slot',()=>{
  const f=bound();expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,route_bound:false,finish_binding:{state:'failed',started:true,bindings:1,active:false}});expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');
});
it.each(['binding','plan','handoff','ready_as_handoff','plan_as_handoff'] as const)('rejects other/copy %s at a valid boundary without mutating the other root',kind=>{
  for(const copy of [false,true]){
    const setup=()=>{
      if(kind==='plan'){const a=sealed(),b=sealed();return {a:a.root,b:b.root,run:()=>a.root.transferRecoveryPlan(a.b,copy?{...a.plan}:b.plan)};}
      const a=transferred(),b=transferred();return {a:a.root,b:b.root,run:()=>a.root.bindRecoveryPlan(kind==='binding'?(copy?{...a.b}:b.b):a.b,kind==='handoff'?(copy?{...a.handoff}:b.handoff):kind==='ready_as_handoff'?a.ready:kind==='plan_as_handoff'?a.plan:a.handoff)};
    };
    const {a,b,run}=setup(),before=b.inspect();expect(run).toThrow('internal_review_error');expect(a.inspect()).toMatchObject({state:'failed',route_bound:false});expect(b.inspect()).toEqual(before);
  }
});
it('rejects foreign bound checks and discards without touching the other receiving slot',()=>{
  for(const step of ['check','discard']){const a=bound(),b=bound();if(step==='discard')closeResources(a);const before=b.root.inspect();expect(()=>step==='check'?a.root.checkBoundRecoveryPlan(a.b,b.handoff):a.root.discardBoundRecoveryPlan(a.b,b.handoff)).toThrow('internal_review_error');expect(b.root.inspect()).toEqual(before);}
});
it('keeps summary and private transfer exclusive and does not promote a limited summary',()=>{
  const f=sealed(),s=f.root.summarizeRecoveryPlan(f.b,f.plan);expect(s).toEqual({scope:'synthetic_unbound_recovery_summary',authority:'none',selected:1,inputs:1});expect(()=>f.root.transferRecoveryPlan(f.b,f.plan)).toThrow('internal_review_error');
  const g=transferred();expect(()=>g.root.bindRecoveryPlan(g.b,{...s,authority:'private'})).toThrow('internal_review_error');
});
it('preserves the unbound discard branch but cannot bind its consumed handoff',()=>{
  const f=transferred();f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.discardUnboundRecoveryPlan(f.b,f.handoff);expect(f.root.inspect()).toMatchObject({state:'consumed',finish_binding:{started:false,bindings:0}});expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');
});
it.each(['summary','unbound_discard','transfer','reseal'] as const)('rejects competing %s after binding',step=>{
  const f=bound();if(step==='unbound_discard')closeResources(f);
  expect(()=>step==='summary'?f.root.summarizeRecoveryPlan(f.b,f.plan):step==='unbound_discard'?f.root.discardUnboundRecoveryPlan(f.b,f.handoff):step==='transfer'?f.root.transferRecoveryPlan(f.b,f.plan):f.root.sealRecoveryPlan(f.b,f.ready)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',route_bound:false,finish_binding:{bindings:1}});
});
it.each(['source','cleanup'] as const)('invalidates the binding immediately at %s start and refuses replay',step=>{
  const f=bound();if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(f.root.inspect()).toMatchObject({route_bound:false,finish_binding:{state:'invalidated',bindings:1,active:false}});expect(()=>f.root.checkBoundRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');
});
it.each(['source','cleanup'] as const)('does not bind a handoff made inactive before binding by %s',step=>{
  const f=transferred();if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_binding:{bindings:0,active:false}});
});
it.each(['none','source_only','cleanup_only'] as const)('does not discard the bound receiver with incomplete %s closure',mode=>{
  const f=bound();if(mode==='source_only'){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}if(mode==='cleanup_only'){f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
  expect(()=>f.root.discardBoundRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',route_bound:false});
});
it('consumes bound discard once and cannot hide a pending handoff in normal close',()=>{
  const f=bound();expect(()=>f.root.close(f.b)).toThrow('internal_review_error');
  const g=bound();closeResources(g);g.root.discardBoundRecoveryPlan(g.b,g.handoff);expect(()=>g.root.discardBoundRecoveryPlan(g.b,g.handoff)).toThrow('internal_review_error');
});
it.each(['seal','transfer','bind','check','discard'] as const)('guards both %s checkpoints without publishing after failure',step=>{
  for(const at of [1,2]){
    const setup=()=>{if(step==='seal'){const f=ready();return {f,run:()=>f.root.sealRecoveryPlan(f.b,f.ready)};}if(step==='transfer'){const f=sealed();return {f,run:()=>f.root.transferRecoveryPlan(f.b,f.plan)};}const f=step==='bind'?transferred():bound();if(step==='discard')closeResources(f);return {f,run:()=>step==='bind'?f.root.bindRecoveryPlan(f.b,f.handoff):step==='check'?f.root.checkBoundRecoveryPlan(f.b,f.handoff):f.root.discardBoundRecoveryPlan(f.b,f.handoff)};};
    const {f,run}=setup();let calls=0;f.arm(()=>++calls===at?'cancelled':undefined);expect(run).toThrow('cancelled');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,route_bound:false,diagnostics:{hard:{code:'cancelled'}}});if(step==='bind')expect(f.root.inspect().finish_binding).toMatchObject({started:true,bindings:0});
  }
});
it.each(['cleanup','source','summary','bind'] as const)('rejects swallowed %s reentry during the bind post guard',operation=>{
  const f=transferred();let n=0;f.arm(()=>{if(++n===2){try{if(operation==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);else if(operation==='source')f.root.beginSourceClose(f.b);else if(operation==='summary')f.root.summarizeRecoveryPlan(f.b,f.plan);else f.root.bindRecoveryPlan(f.b,f.handoff);}catch{/* cannot revive */}}return undefined;});
  expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',route_bound:false,finish_binding:{bindings:0}});
});
it('keeps the first deadline and permits diagnostic cleanup without restoring the bound route',()=>{
  const f=bound();f.root.revoke('deadline_exceeded');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');expect(()=>f.root.checkBoundRecoveryPlan(f.b,f.handoff)).toThrow('deadline_exceeded');expect(f.root.inspect()).toMatchObject({route_bound:false,finish_binding:{bindings:1},diagnostics:{hard:{code:'deadline_exceeded'}},new_generation:{cleanup:{status:'confirmed'}}});
});
it.each([false,true])('retains same reviewed/omitted origin and nonlatest active T_i/U (omitted=%s)',omitted=>{
  const raw=mixed(omitted),f=bound(raw);expect(f.root.inspect()).toMatchObject({route_bound:true,pins:{selected:3,inputs:3,accepted:1},finish_binding:{selected:3,inputs:3,bindings:1}});
  const v=view(raw),p=projectSyntheticFinishPlanBinding(v.pins,v.plan,v.route);expect(p.snapshot.run_context.upper_utc).toBe(U);expect(p.snapshot.inputs[0].retrieved_at).toBe(O);
  const outcome=p.snapshot.outcomes[1];if(outcome.state==='reviewed')expect(outcome.receipt).toBe(v.pins.receipts[1].receipt);else if(outcome.state==='result_omitted')expect(outcome.reviewed_origin?.receipt).toBe(v.pins.receipts[1].receipt);else throw Error('Expected preserved original outcome');
});
it('keeps 0.3 candidate-window constraints rather than falling back to the 0.2 header',()=>{
  const raw=fixture();write(raw,'finish.header.schema_version','bp-mcp-review-0.3');write(raw,'finish.header.selection',{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}});write(raw,'finish.header.coverage',{...raw.finish.header.coverage,analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false});raw.finish.header.limitations.push(...TARGET_LIMITATIONS);
  const f=bound(raw);expect(f.root.inspect().route_bound).toBe(true);const v=view(raw),p=projectSyntheticFinishPlanBinding(v.pins,v.plan,v.route);expect(p.snapshot.header.schema_version).toBe('bp-mcp-review-0.3');
});
it('binds a 100-record window without changing accounting or inventing new inputs',()=>{
  const raw=fixture();raw.finish.selected=Array.from({length:100},(_,n)=>id(n+1));raw.finish.header.collection.selected=raw.finish.header.collection.metadata_seen=100;raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const f=bound(raw);expect(f.root.inspect()).toMatchObject({finish_binding:{selected:100,inputs:100},preparation:{accounting:raw.accounting},evidence_issues:0});
});
it('does not adopt caller mutations or extra pin/header/callback arguments',()=>{
  const raw=fixture(),f=ready(raw);raw.finish.header.limitations.push('SECRET');raw.finish.selected.length=0;const plan=f.root.sealRecoveryPlan(f.b,f.ready),h=f.root.transferRecoveryPlan(f.b,plan);f.root.bindRecoveryPlan(f.b,h);expect(f.root.inspect().finish_binding?.limitations).toBe(5);expect(JSON.stringify(f.root.inspect())).not.toContain('SECRET');
  for(const key of ['header','pin','source','window','release','receipt','callback','route']){const g=transferred();expect(()=>g.root.bindRecoveryPlan(g.b,g.handoff,{[key]:{}})).toThrow('internal_review_error');expect(g.root.inspect().route_bound).toBe(false);}
});
it('bounds merged errors and retains error-truncation diagnostics without dropping required limitations',()=>{
  const raw=fixture();write(raw,'finish.header.errors',Array.from({length:100},()=>({stage:'metadata',code:'metadata_unavailable'})));const f=bound(raw);expect(f.root.inspect().finish_binding).toMatchObject({errors:100,errors_truncated:true,limitations:6});
});
it.each([96,97])('accepts only the merged limitation boundary with %i original values',count=>{
  const raw=fixture();raw.finish.header.limitations=['release_visible_nodes_only',...Array.from({length:count-1},(_,i)=>'fixture_'+i)];const f=transferred(raw);
  if(count===96){f.root.bindRecoveryPlan(f.b,f.handoff);expect(f.root.inspect().finish_binding?.limitations).toBe(100);}else{expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect().finish_binding).toMatchObject({started:true,bindings:0});expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');}
});
it.each(['cancelled','deadline_exceeded'])('retains post-guard %s ahead of a pure projection failure',reason=>{
  const raw=fixture();raw.finish.header.limitations=['release_visible_nodes_only',...Array.from({length:96},(_,i)=>'fixture_'+i)];const f=transferred(raw);let calls=0;f.arm(()=>++calls===2?reason:undefined);
  expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow(reason);expect(calls).toBe(2);expect(f.root.inspect()).toMatchObject({state:'failed',route_bound:false,finish_binding:{bindings:0},diagnostics:{hard:{code:reason}}});
});
it('keeps legacy runtime and static diagnostic surfaces free of binding state and methods',()=>{
  type Root=ReturnType<typeof createSyntheticSoftRecoveryIssuer>;type Snapshot=ReturnType<Root['inspect']>;type Hard=NonNullable<Snapshot['diagnostics']['hard']>;
  const field:'finish_binding' extends keyof Snapshot?true:false=false,phase:'finish_binding' extends Hard['phase']?true:false=false;expect([field,phase]).toEqual([false,false]);
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},...fixture().finish.time},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const,root=createSyntheticSoftRecoveryIssuer(seed,facts);
  for(const key of ['bindRecoveryPlan','checkBoundRecoveryPlan','discardBoundRecoveryPlan'])expect(Object.hasOwn(root,key)).toBe(false);expect(Object.hasOwn(root.inspect(),'finish_binding')).toBe(false);
});
it('does not expose private snapshots, issuance or raw identity in bound diagnostics',()=>{
  const f=bound();const text=JSON.stringify(f.root.inspect());for(const value of [S,O,U,id(1),'instance_binding','receipt','ready_origin_id'])expect(text).not.toContain(value);
  for(const key of ['snapshot','finishBound','finishPins','issueFinishContext','acceptFinishContext','source','core'])expect(Object.hasOwn(f.root,key)).toBe(false);
  type H=ReturnType<ReturnType<typeof createSyntheticPinnedRecoveryRoot>['transferRecoveryPlan']>;const notEvidence:H extends SyntheticFinishContextEvidence?true:false=false;expect(notEvidence).toBe(false);expect(f.root.inspect().evidence_issues).toBe(0);
});
it('projects original private references as value-only data, not a reconstructed frame or evidence',()=>{
  const f=view(),p=projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route);expect(p.snapshot.route.frame).toBe(f.plan.frame);expect(p.snapshot.plan).toBe(f.plan);expect(p.snapshot.inputs[0].receipt).toBe(f.pins.receipts[0].receipt);expect(Object.isFrozen(p.snapshot)).toBe(true);
  const notEvidence:typeof p extends SyntheticFinishContextEvidence?true:false=false;expect(notEvidence).toBe(false);
});
it.each(['run','session','source','key','origin','budget','release'])('pure comparison rejects a different plan seed %s',key=>{const f=view();write(f.plan,'seed.'+key,{});expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');});
it.each(['source','budget','release','origin','window'])('pure comparison rejects a different input context %s',key=>{const f=view();write(f.plan,'inputs.context.'+key,{});expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');});
it.each([
  ['owner',{}],['frame',{}],['seed.started_at',O],['seed.deadline_ms',1],['time.started_at',O],['time.deadline_ms',1],['time.observed_at',U],['time.upper_utc',O],['inputs.rows.0',id(99)],['inputs.assets.0.state','reviewed'],['inputs.assets.0.reason','other'],['inputs.inputs.0.receipt',{}],['inputs.inputs.0.update_xml_sys_id',id(99)],['inputs.inputs.0.retrieved_at',O],['inputs.inputs.0.state','completed'],['inputs.collection_status','failed'],['verify.stage','pending'],['verify.consistency','unknown'],
])('pure comparison rejects changed %s',(path,value)=>{const f=view();write(f.plan,path as string,value);expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');});
it.each(['owner','frame','source'])('pure comparison rejects mismatched route %s',key=>{const f=view();write(f.route,key,{});expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');});
it.each(['rows','assets','inputs'] as const)('pure comparison rejects missing or duplicate %s entries',key=>{for(const duplicate of [false,true]){const f=view();write(f.plan,'inputs.'+key,duplicate?[...(f.plan.inputs[key]),f.plan.inputs[key][0]]:[]);expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');}});
it.each([
  ['verify.verify_required',true],['verify.consistency','stable_observation'],['verify.verify_error','metadata_unavailable'],['verify.verify_calls',1],['verify.attempts',1],['verify.retry_waits',1],
])('pure comparison does not invent verify progress or promote no-verify %s',(path,value)=>{const f=view();write(f.plan,path as string,value);expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');});
it.each([
  ['inputs.completed',[{state:'reviewed',update_xml_sys_id:id(1)}]],['verify.limitations',[]],['verify.limitations',['provisional_results']],['verify.errors',['metadata_unavailable']],['verify.accounting.requests',11],['verify.accounting.received_bytes',21],['verify.accounting.payload_bytes',31],
])('pure comparison preserves completed state, required warnings and unchanged no-verify prefix: %s',(path,value)=>{const f=view();write(f.plan,path as string,value);expect(()=>projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route)).toThrow('internal_review_error');});
it.each(['stable_observation','changed','unverified'])('keeps the valid %s derived facts and merged header',consistency=>{
  const raw=fixture();raw.consistency=consistency;const f=view(raw),p=projectSyntheticFinishPlanBinding(f.pins,f.plan,f.route);expect(p.stats.consistency).toBe(consistency);expect(p.snapshot.header.limitations).toContain('soft_deadline_reached');expect(p.snapshot.header.limitations).toContain('deadline_exceeded');
  if(consistency==='changed'){expect(p.snapshot.header.limitations).toContain('changed_during_review');expect(p.snapshot.header.errors).toContainEqual({stage:'consistency',code:'changed_during_review'});}
  const r=bound(raw);expect(r.root.inspect().finish_binding?.consistency).toBe(consistency);
});
