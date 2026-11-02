import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import {createSyntheticLifecycleRecoveryKernel} from '../support/review/synthetic-recovery-kernel.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function setup(issue=true,raw=fixture()){let guard:()=>string|undefined=()=>undefined;const root=createSyntheticPinnedRecoveryRoot(raw,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,raw.point==='request_check_unstarted'?{termination:'not_required',cleanup:'not_required'}:{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease),plan=root.sealRecoveryPlan(b,ready),handoff=root.transferRecoveryPlan(b,plan);root.bindRecoveryPlan(b,handoff);const evidence=issue?root.issueFinishContext(b,handoff):{};return {raw,root,b,ticket,ready,plan,handoff,evidence,arm:(fn:()=>string|undefined)=>{guard=fn;}};}
function cleanupAfterFailure(f:ReturnType<typeof setup>){f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
function closeResources(f:ReturnType<typeof setup>){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
it('accepts the same issued context once into a private non-executable expectation, not a finish route',()=>{
  const f=setup(),before=f.root.inspect().preparation,accepted=f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);
  expect(Object.getPrototypeOf(accepted)).toBeNull();expect(Object.isFrozen(accepted)).toBe(true);expect(Reflect.ownKeys(accepted)).toEqual([]);expect(accepted).not.toBe(f.evidence);
  expect(f.root.inspect()).toMatchObject({state:'consumed',route_bound:false,evidence_issues:1,finish_issue:{state:'consumed',pending:false},finish_accept:{state:'accepted',started:true,accepts:1,route_spent:true,pending:true,terminal_pending:true},permissions:{formal_issuance:false,dispatch:false,recovery_route:false}});
  expect(f.root.inspect().preparation).toEqual(before);f.root.revoke('cancelled');cleanupAfterFailure(f);
});
it('removes receiver, evidence and route use together before either external guard without publishing acceptance',()=>{
  const f=setup(),seen:unknown[]=[];f.arm(()=>{const s=f.root.inspect();seen.push({accept:s.finish_accept,issue:s.finish_issue,bound:s.route_bound});return undefined;});f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);
  expect(seen).toEqual([1,2].map(()=>({accept:{state:'accepting',started:true,accepts:0,route_spent:true,pending:false,terminal_pending:false},issue:{state:'consumed',started:true,issues:1,pending:false},bound:false})));f.arm(()=>undefined);f.root.revoke('cancelled');cleanupAfterFailure(f);
});
it('refuses repeat acceptance permanently instead of restoring any consumed slot',()=>{
  const f=setup();f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',route_bound:false,finish_issue:{pending:false,issues:1},finish_accept:{state:'failed',accepts:1,route_spent:true,pending:false,terminal_pending:false}});expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow('internal_review_error');cleanupAfterFailure(f);
});
it.each(['binding','handoff','evidence','copy_binding','copy_handoff','copy_evidence','plan','ready','summary','raw','getter','proxy'] as const)('rejects %s mixing and leaves the other root unchanged',kind=>{
  const a=setup(),b=setup(),before=b.root.inspect();let touched=0;const poison=Object.defineProperty({},'snapshot',{get(){touched++;throw Error('secret');}});
  const e=kind==='evidence'?b.evidence:kind==='copy_evidence'?{...a.evidence}:kind==='plan'?a.plan:kind==='ready'?a.ready:kind==='summary'?{scope:'synthetic_finish_values',authority:'none'}:kind==='raw'?a.raw:kind==='getter'?poison:kind==='proxy'?new Proxy({},{get(){touched++;throw Error('secret');}}):a.evidence;
  expect(()=>a.root.acceptRecoveryFinishContext(kind==='binding'?b.b:kind==='copy_binding'?{...a.b}:a.b,kind==='handoff'?b.handoff:kind==='copy_handoff'?{...a.handoff}:a.handoff,e)).toThrow('internal_review_error');
  expect(touched).toBe(0);expect(b.root.inspect()).toEqual(before);expect(a.root.inspect()).toMatchObject({state:'failed',finish_accept:{accepts:0,pending:false,terminal_pending:false},finish_issue:{pending:false}});cleanupAfterFailure(a);b.root.revoke('cancelled');cleanupAfterFailure(b);
});
it('does not accept a handoff without issuance or create evidence from a lookalike',()=>{
  const f=setup(false);expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,{})).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({evidence_issues:0,finish_accept:{started:true,route_spent:true,accepts:0,pending:false}});expect(()=>f.root.issueFinishContext(f.b,f.handoff)).toThrow('internal_review_error');cleanupAfterFailure(f);
});
it.each(['cancelled','deadline_exceeded'] as const)('preserves %s at either guard and never publishes acceptance',reason=>{
  for(const point of [1,2]){const f=setup();let n=0,leaked:unknown;f.arm(()=>++n===point?reason:undefined);try{leaked=f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);}catch{/* fixed reason below */}
    expect(leaked).toBeUndefined();expect(f.root.inspect()).toMatchObject({state:'failed',finish_accept:{state:'failed',started:true,route_spent:true,accepts:0,pending:false},diagnostics:{hard:{code:reason,phase:'finish_accept'}}});f.arm(()=>undefined);cleanupAfterFailure(f);expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence)).toThrow(reason);
  }
});
it.each(['cancelled','deadline_exceeded'] as const)('gives post-guard %s priority over a pending mismatched evidence',reason=>{
  const f=setup();let n=0;f.arm(()=>++n===2?reason:undefined);expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,{})).toThrow(reason);expect(f.root.inspect().diagnostics.hard).toEqual({code:reason,phase:'finish_accept'});f.arm(()=>undefined);cleanupAfterFailure(f);
});
it.each(['accept','issue','bind','check','discard','source','cleanup','close','summary'] as const)('refuses swallowed %s reentry at either guard without a partial commit',step=>{
  for(const point of [1,2]){const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
    if(step==='accept')f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);else if(step==='issue')f.root.issueFinishContext(f.b,f.handoff);else if(step==='bind')f.root.bindRecoveryPlan(f.b,f.handoff);else if(step==='check')f.root.checkBoundRecoveryPlan(f.b,f.handoff);else if(step==='discard')f.root.discardBoundRecoveryPlan(f.b,f.handoff);else if(step==='source')f.root.beginSourceClose(f.b);else if(step==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);else if(step==='close')f.root.close(f.b);else f.root.summarizeRecoveryPlan(f.b,f.plan);
  }catch{/* deliberately swallowed */}return undefined;});expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_issue:{pending:false},finish_accept:{accepts:0,pending:false,terminal_pending:false}});f.arm(()=>undefined);if(!f.root.inspect().lifecycle?.cleanup_started)f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
});
it.each(['source','cleanup'] as const)('rejects %s invalidation between issuance and acceptance',step=>{
  const f=setup();if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(f.root.inspect().finish_issue?.pending).toBe(false);
  expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_accept:{accepts:0,pending:false,route_spent:true}});if(step==='source')f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
});
it.each(['source','cleanup'] as const)('drops accepted expectations at %s start but retains terminal-only ownership',step=>{
  const f=setup();f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(f.root.inspect()).toMatchObject({state:'consumed',finish_issue:{state:'consumed',pending:false},finish_accept:{state:'invalidated',pending:false,terminal_pending:true,accepts:1,route_spent:true}});
  if(step==='source'){f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);}else{f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
  expect(f.root.inspect().finish_accept?.terminal_pending).toBe(true);expect(()=>f.root.close(f.b)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_accept:{pending:false,terminal_pending:false,accepts:1}});
});
it.each(['bind','issue','summary','transfer','bound_discard','unbound_discard','check'] as const)('refuses old %s after acceptance rather than consuming the plan a second time',step=>{
  const f=setup();f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);if(step.includes('discard'))closeResources(f);
  expect(()=>{if(step==='bind')f.root.bindRecoveryPlan(f.b,f.handoff);else if(step==='issue')f.root.issueFinishContext(f.b,f.handoff);else if(step==='summary')f.root.summarizeRecoveryPlan(f.b,f.plan);else if(step==='transfer')f.root.transferRecoveryPlan(f.b,f.plan);else if(step==='bound_discard')f.root.discardBoundRecoveryPlan(f.b,f.handoff);else if(step==='unbound_discard')f.root.discardUnboundRecoveryPlan(f.b,f.handoff);else f.root.checkBoundRecoveryPlan(f.b,f.handoff);}).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',finish_accept:{accepts:1,pending:false}});if(!step.includes('discard'))cleanupAfterFailure(f);
});
it.each(['source_only','cleanup_only','neither'] as const)('cannot normal-close accepted ownership with %s terminal confirmation',mode=>{
  const f=setup();f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);if(mode==='source_only'){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}if(mode==='cleanup_only'){f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
  expect(()=>f.root.close(f.b)).toThrow('internal_review_error');expect(f.root.inspect().finish_accept).toMatchObject({state:'failed',accepts:1,pending:false,terminal_pending:false});if(mode!=='cleanup_only')cleanupAfterFailure(f);
});
it('keeps accepted, issued and handoff brands distinct and cannot promote the accepted handle in a different root',()=>{
  const f=setup(),accepted=f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence),g=setup();type Root=ReturnType<typeof createSyntheticPinnedRecoveryRoot>;type A=ReturnType<Root['acceptRecoveryFinishContext']>;type E=ReturnType<Root['issueFinishContext']>;type H=ReturnType<Root['transferRecoveryPlan']>;
  const aIsE:A extends E?true:false=false,aIsH:A extends H?true:false=false,eIsA:E extends A?true:false=false;expect([aIsE,aIsH,eIsA]).toEqual([false,false,false]);const before=f.root.inspect();expect(()=>g.root.acceptRecoveryFinishContext(g.b,g.handoff,accepted)).toThrow('internal_review_error');expect(f.root.inspect()).toEqual(before);f.root.revoke('cancelled');cleanupAfterFailure(f);cleanupAfterFailure(g);
});
it('does not disclose expectation, frame, UTC or identifiers through its handle or diagnostic fields',()=>{
  const f=setup(),a=f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence),text=JSON.stringify({a,state:f.root.inspect()});for(const value of [S,O,U,id(1),id(10),'snapshot','expected_context','raw_buildname','source_identity'])expect(text).not.toContain(value);
  for(const key of ['acceptedFinish','acceptedTermination','finishPins','frame','core'])expect(Object.hasOwn(f.root,key)).toBe(false);expect(f.root.inspect().permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});f.root.revoke('cancelled');cleanupAfterFailure(f);
});
it('does not add accept methods, diagnostic fields or phases to legacy and lifecycle-only roots',()=>{
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},...fixture().finish.time},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  for(const root of [createSyntheticSoftRecoveryIssuer(seed,facts),createSyntheticLifecycleRecoveryKernel(seed,facts)]){expect(root).not.toHaveProperty('acceptRecoveryFinishContext');expect(root.inspect()).not.toHaveProperty('finish_accept');}
  type Legacy=ReturnType<typeof createSyntheticSoftRecoveryIssuer>;type Life=ReturnType<typeof createSyntheticLifecycleRecoveryKernel>;
  const lMethod:'acceptRecoveryFinishContext' extends keyof Legacy?true:false=false,fMethod:'acceptRecoveryFinishContext' extends keyof Life?true:false=false,lField:'finish_accept' extends keyof ReturnType<Legacy['inspect']>?true:false=false,fField:'finish_accept' extends keyof ReturnType<Life['inspect']>?true:false=false;
  const lPhase:'finish_accept' extends NonNullable<ReturnType<Legacy['inspect']>['diagnostics']['hard']>['phase']?true:false=false,fPhase:'finish_accept' extends NonNullable<ReturnType<Life['inspect']>['diagnostics']['hard']>['phase']?true:false=false;expect([lMethod,fMethod,lField,fField,lPhase,fPhase]).toEqual([false,false,false,false,false,false]);
});
it.each(['raw','callback'] as const)('rejects additional %s rather than registering caller expectations',kind=>{
  const f=setup();let calls=0;expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence,kind==='callback'?()=>{calls++;return f.raw;}:f.raw)).toThrow('internal_review_error');expect(calls).toBe(0);expect(f.root.inspect().finish_accept).toMatchObject({accepts:0,pending:false});cleanupAfterFailure(f);
});
it.each(['cancelled','deadline_exceeded'] as const)('keeps first %s after accepted revocation and cleanup without restoring capabilities',reason=>{
  const f=setup();f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);f.root.revoke(reason);cleanupAfterFailure(f);f.root.revoke('internal_review_error');expect(f.root.inspect().diagnostics.hard?.code).toBe(reason);expect(f.root.inspect()).toMatchObject({finish_accept:{accepts:1,pending:false,terminal_pending:false},evidence_issues:1});expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence)).toThrow(reason);
});
it('sanitizes unknown guard exceptions in pre and post without exposing a partial accepted value',()=>{
  for(const point of [1,2]){const f=setup();let n=0;f.arm(()=>{if(++n===point)throw Error('SECRET RAW STACK');return undefined;});expect(()=>f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence)).toThrow(/^internal_review_error$/);expect(JSON.stringify(f.root.inspect())).not.toContain('SECRET');expect(f.root.inspect().finish_accept).toMatchObject({accepts:0,pending:false});f.arm(()=>undefined);cleanupAfterFailure(f);}
});
it.each(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'])('retains %s closure facts and accounting prefix while consuming the new route',point=>{
  const raw=fixture();raw.point=point;const f=setup(true,raw),before=f.root.inspect();f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);expect(f.root.inspect().preparation).toEqual(before.preparation);expect(f.root.inspect().closure).toEqual(before.closure);expect(f.root.inspect().finish_accept?.accepts).toBe(1);f.root.revoke('cancelled');cleanupAfterFailure(f);
});
it('accepts bounded 100-row expectations without replacing the original pinned values',()=>{
  const raw=fixture();raw.finish.selected=Array.from({length:100},(_,n)=>id(n+1));raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=100;
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const f=setup(true,raw),before=f.root.inspect().preparation;f.raw.finish.time.upper_utc=S;f.raw.finish.selected[0]=id(200);f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);expect(f.root.inspect().preparation).toEqual(before);expect(f.root.inspect().finish_accept).toMatchObject({accepts:1,pending:true});f.root.revoke('cancelled');cleanupAfterFailure(f);
});
