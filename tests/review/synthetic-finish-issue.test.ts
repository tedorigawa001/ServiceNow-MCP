import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import {createSyntheticLifecycleRecoveryKernel} from '../support/review/synthetic-recovery-kernel.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function setup(bind=true,raw=fixture()){let guard:()=>string|undefined=()=>undefined;const root=createSyntheticPinnedRecoveryRoot(raw,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,raw.point==='request_check_unstarted'?{termination:'not_required',cleanup:'not_required'}:{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease),plan=root.sealRecoveryPlan(b,ready),handoff=root.transferRecoveryPlan(b,plan);if(bind)root.bindRecoveryPlan(b,handoff);return {raw,root,b,ticket,ready,plan,handoff,arm:(fn:()=>string|undefined)=>{guard=fn;}};}
function closeResources(f:ReturnType<typeof setup>){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
it('issues only an empty frozen synthetic handle while leaving the receiver and execution gates closed',()=>{
  const f=setup(),e=f.root.issueFinishContext(f.b,f.handoff);
  expect(Object.getPrototypeOf(e)).toBeNull();expect(Object.isFrozen(e)).toBe(true);expect(Reflect.ownKeys(e)).toEqual([]);
  expect(f.root.inspect()).toMatchObject({state:'plan_transferred',route_bound:true,evidence_issues:1,finish_issue:{state:'issued',started:true,issues:1,pending:true},permissions:{formal_issuance:false,dispatch:false,recovery_route:false}});
  f.root.checkBoundRecoveryPlan(f.b,f.handoff);
  closeResources(f);f.root.discardBoundRecoveryPlan(f.b,f.handoff);f.root.close(f.b);
  expect(f.root.inspect()).toMatchObject({state:'closed',evidence_issues:1,finish_issue:{state:'discarded',pending:false}});
});
it('occupies its claim before both guards and commits the handle only after post guard',()=>{
  const f=setup(),seen:unknown[]=[];f.arm(()=>{seen.push(f.root.inspect().finish_issue);return undefined;});f.root.issueFinishContext(f.b,f.handoff);
  expect(seen).toEqual([{state:'issuing',started:true,issues:0,pending:false},{state:'issuing',started:true,issues:0,pending:false}]);expect(f.root.inspect().finish_issue).toEqual({state:'issued',started:true,issues:1,pending:true});
});
it('rejects repeated issuance permanently and never restores its pending handle',()=>{
  const f=setup(),e=f.root.issueFinishContext(f.b,f.handoff);expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,route_bound:false,evidence_issues:1,finish_issue:{state:'failed',started:true,issues:1,pending:false}});
  expect(()=>f.root.issueFinishContext(f.b,e)).toThrow('internal_review_error');expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');
});
it.each(['source','cleanup'] as const)('invalidates the issued slot synchronously at %s start without consuming the receiver',step=>{
  const f=setup();f.root.issueFinishContext(f.b,f.handoff);
  if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(f.root.inspect()).toMatchObject({state:'plan_transferred',route_bound:false,evidence_issues:1,finish_issue:{state:'invalidated',pending:false}});
  if(step==='source'){f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);}else{f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}
  f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.discardBoundRecoveryPlan(f.b,f.handoff);expect(f.root.inspect()).toMatchObject({state:'consumed',finish_issue:{state:'discarded',pending:false,issues:1}});f.root.close(f.b);
});
it.each(['binding','handoff','plan','ready','copy_binding','copy_handoff','summary'] as const)('rejects mixed %s without changing the other root',kind=>{
  const a=setup(),b=setup(),before=b.root.inspect();const arg=kind==='handoff'?b.handoff:kind==='plan'?a.plan:kind==='ready'?a.ready:kind==='copy_handoff'?{...a.handoff}:kind==='summary'?{scope:'synthetic_unbound_recovery_summary',authority:'none',selected:1,inputs:1}:a.handoff;
  expect(()=>a.root.issueFinishContext(kind==='binding'?b.b:kind==='copy_binding'?{...a.b}:a.b,arg)).toThrow('internal_review_error');expect(b.root.inspect()).toEqual(before);expect(a.root.inspect()).toMatchObject({state:'failed',evidence_issues:0,finish_issue:{pending:false}});
});
it('refuses issuance before binding and after fixed discard rather than restoring preparation',()=>{
  const f=setup(false);expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect().finish_issue).toMatchObject({started:true,issues:0,pending:false});
  const g=setup();closeResources(g);g.root.discardBoundRecoveryPlan(g.b,g.handoff);expect(()=>g.root.issueFinishContext(g.b,g.handoff)).toThrow('internal_review_error');expect(g.root.inspect().evidence_issues).toBe(0);
});
it.each(['cancelled','deadline_exceeded'] as const)('does not publish or retry when a guard reports %s',reason=>{
  for(const point of [1,2]){const f=setup();let n=0,leaked:unknown;f.arm(()=>++n===point?reason:undefined);try{leaked=f.root.issueFinishContext(f.b,f.handoff);}catch{/* inspect fixed reason below */}
    expect(leaked).toBeUndefined();expect(f.root.inspect()).toMatchObject({state:'failed',evidence_issues:0,finish_issue:{state:'failed',started:true,pending:false},diagnostics:{hard:{code:reason,phase:'finish_issue'}}});
    f.arm(()=>undefined);expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow(reason);f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');expect(f.root.inspect().diagnostics.hard?.code).toBe(reason);expect(f.root.inspect().finish_issue?.pending).toBe(false);
  }
});
it.each(['issue','bind','check','discard','source','cleanup','close','summary'] as const)('stops caught %s reentry in either guard without committing an evidence',step=>{
  for(const point of [1,2]){const f=setup();let n=0;f.arm(()=>{if(++n===point){try{
    if(step==='issue')f.root.issueFinishContext(f.b,f.handoff);else if(step==='bind')f.root.bindRecoveryPlan(f.b,f.handoff);else if(step==='check')f.root.checkBoundRecoveryPlan(f.b,f.handoff);else if(step==='discard')f.root.discardBoundRecoveryPlan(f.b,f.handoff);else if(step==='source')f.root.beginSourceClose(f.b);else if(step==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);else if(step==='close')f.root.close(f.b);else f.root.summarizeRecoveryPlan(f.b,f.plan);
  }catch{/* the guard deliberately swallows the nested failure */}}return undefined;});expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',evidence_issues:0,finish_issue:{state:'failed',pending:false}});}
});
it.each(['none','source_only','cleanup_only'] as const)('refuses issued receiver discard with %s closure and retains cleanup diagnostics',mode=>{
  const f=setup();f.root.issueFinishContext(f.b,f.handoff);if(mode==='source_only'){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}if(mode==='cleanup_only'){f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
  expect(()=>f.root.discardBoundRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_issue:{state:'failed',issues:1,pending:false}});
  if(mode!=='cleanup_only'){f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}expect(f.root.inspect().new_generation?.cleanup?.status).toBe('confirmed');
});
it.each(['cancelled','deadline_exceeded'] as const)('retains first %s after issuance and rejects renewal after cleanup',reason=>{
  const f=setup();f.root.issueFinishContext(f.b,f.handoff);f.root.revoke(reason);f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.revoke('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',evidence_issues:1,finish_issue:{state:'failed',pending:false},diagnostics:{hard:{code:reason}}});expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow(reason);
});
it('does not hide an issued receiver under normal close or use the unbound discard branch',()=>{
  for(const step of ['close','unbound']){const f=setup();f.root.issueFinishContext(f.b,f.handoff);if(step==='unbound')closeResources(f);expect(()=>step==='close'?f.root.close(f.b):f.root.discardUnboundRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect().finish_issue).toMatchObject({state:'failed',pending:false});}
});
it('does not accept merely by issuing, and keeps UTC/identity/body out of diagnostics',()=>{
  const f=setup(),before=f.root.inspect().preparation?.accounting,e=f.root.issueFinishContext(f.b,f.handoff);expect(f.root.inspect().finish_accept).toMatchObject({started:false,accepts:0,route_spent:false,pending:false});
  expect(f.root.inspect().preparation?.accounting).toEqual(before);const text=JSON.stringify({e,state:f.root.inspect()});for(const value of [S,O,U,id(1),id(10),'raw_buildname','snapshot','ready_origin_identity'])expect(text).not.toContain(value);expect(f.root.inspect().permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});
});
it.each(['pin','header','route','source','callback'])('refuses extra %s injection without invoking caller code',kind=>{
  const f=setup();let calls=0;expect(()=>f.root.issueFinishContext(f.b,f.handoff,kind==='callback'?()=>{calls++;return f.raw;}:f.raw)).toThrow('internal_review_error');expect(calls).toBe(0);expect(f.root.inspect().evidence_issues).toBe(0);
});
it('does not add an issuer, issue diagnostics or phase to legacy and lifecycle-only roots',()=>{
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},...fixture().finish.time},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  for(const root of [createSyntheticSoftRecoveryIssuer(seed,facts),createSyntheticLifecycleRecoveryKernel(seed,facts)]){expect(root).not.toHaveProperty('issueFinishContext');expect(root.inspect()).not.toHaveProperty('finish_issue');}
  type Legacy=ReturnType<typeof createSyntheticSoftRecoveryIssuer>;type Life=ReturnType<typeof createSyntheticLifecycleRecoveryKernel>;
  const legacyMethod:'issueFinishContext' extends keyof Legacy?true:false=false,lifeMethod:'issueFinishContext' extends keyof Life?true:false=false;
  const legacyField:'finish_issue' extends keyof ReturnType<Legacy['inspect']>?true:false=false,lifeField:'finish_issue' extends keyof ReturnType<Life['inspect']>?true:false=false;
  const legacyPhase:'finish_issue' extends NonNullable<ReturnType<Legacy['inspect']>['diagnostics']['hard']>['phase']?true:false=false;
  const lifePhase:'finish_issue' extends NonNullable<ReturnType<Life['inspect']>['diagnostics']['hard']>['phase']?true:false=false;expect([legacyMethod,lifeMethod,legacyField,lifeField,legacyPhase,lifePhase]).toEqual([false,false,false,false,false,false]);
});
it.each(['source','cleanup'] as const)('refuses an inactive %s route before issuance and cannot rebind it',step=>{
  const f=setup();if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_issue:{state:'failed',started:true,issues:0,pending:false}});expect(()=>f.root.bindRecoveryPlan(f.b,f.handoff)).toThrow('internal_review_error');
});
it.each(['cancelled','deadline_exceeded'] as const)('does not complete receiver discard after a %s guard failure',reason=>{
  for(const point of [1,2]){const f=setup();f.root.issueFinishContext(f.b,f.handoff);closeResources(f);let n=0;f.arm(()=>++n===point?reason:undefined);expect(()=>f.root.discardBoundRecoveryPlan(f.b,f.handoff)).toThrow(reason);
    expect(f.root.inspect()).toMatchObject({state:'failed',finish_issue:{state:'failed',issues:1,pending:false},diagnostics:{hard:{code:reason,phase:'finish_discard'}}});
  }
});
it('does not mutate pinned values or recharge the accounting prefix during revalidation',()=>{
  const f=setup(),before=f.root.inspect().preparation;f.raw.finish.header.target.instance_binding='e'.repeat(64);f.raw.finish.selected[0]=id(100);f.raw.finish.time.upper_utc=S;
  f.root.issueFinishContext(f.b,f.handoff);expect(f.root.inspect().preparation).toEqual(before);expect(f.root.inspect()).toMatchObject({route_bound:true,finish_issue:{state:'issued',issues:1}});
});
it('keeps bounded 100-row issuance private and preserves the original prefix',()=>{
  const raw=fixture();raw.finish.selected=Array.from({length:100},(_,n)=>id(n+1));raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=100;
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const root=createSyntheticPinnedRecoveryRoot(raw),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'}),t=root.claimRecoveryGeneration(b,p),ready=root.acceptRecoveryReady(b,root.startRecoveryGeneration(b,t.start)),h=root.transferRecoveryPlan(b,root.sealRecoveryPlan(b,ready));root.bindRecoveryPlan(b,h);const before=root.inspect().preparation;root.issueFinishContext(b,h);
  expect(root.inspect().preparation).toEqual(before);expect(root.inspect()).toMatchObject({finish_binding:{selected:100,inputs:100},finish_issue:{issues:1,pending:true}});
});
it('sanitizes guard exceptions and never commits the work-local candidate',()=>{
  for(const point of [1,2]){const f=setup();let n=0;f.arm(()=>{if(++n===point)throw Error('secret injected raw stack');return undefined;});expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow(/^internal_review_error$/);expect(JSON.stringify(f.root.inspect())).not.toContain('secret');expect(f.root.inspect().finish_issue).toMatchObject({issues:0,pending:false});}
});
it('keeps an issue mismatch in its own diagnostic phase rather than a past binding operation',()=>{
  const f=setup();expect(()=>f.root.issueFinishContext(f.b,{})).toThrow('internal_review_error');expect(f.root.inspect().diagnostics.hard).toEqual({code:'internal_review_error',phase:'finish_issue'});
});
it.each(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'])('keeps the %s old-closure origin separate from the new ready route when issuing',point=>{
  const raw=fixture();raw.point=point;const f=setup(true,raw),before=f.root.inspect();expect(before.finish_issue).toEqual({state:'unused',started:false,issues:0,pending:false});f.root.issueFinishContext(f.b,f.handoff);
  expect(f.root.inspect().closure).toEqual(before.closure);expect(f.root.inspect().preparation).toEqual(before.preparation);expect(f.root.inspect().finish_issue).toMatchObject({issues:1,pending:true});
  closeResources(f);f.root.discardBoundRecoveryPlan(f.b,f.handoff);f.root.close(f.b);
});
it('holds a mismatched handoff until the post guard so a cancellation there keeps priority',()=>{
  const f=setup();let n=0;f.arm(()=>++n===2?'cancelled':undefined);
  expect(()=>f.root.issueFinishContext(f.b,{})).toThrow('cancelled');expect(f.root.inspect()).toMatchObject({state:'failed',evidence_issues:0,diagnostics:{hard:{code:'cancelled'}},finish_issue:{issues:0,pending:false}});
});
it('rejects the same mismatched handoff at commit when no guard stops',()=>{
  const f=setup();expect(()=>f.root.issueFinishContext(f.b,{})).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',evidence_issues:0,diagnostics:{hard:{code:'internal_review_error',phase:'finish_issue'}}});
});
