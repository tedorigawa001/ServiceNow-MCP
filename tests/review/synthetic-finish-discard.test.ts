import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import {createSyntheticLifecycleRecoveryKernel} from '../support/review/synthetic-recovery-kernel.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function setup(accept=true,raw=fixture()){let guard:()=>string|undefined=()=>undefined;const root=createSyntheticPinnedRecoveryRoot(raw,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,raw.point==='request_check_unstarted'?{termination:'not_required',cleanup:'not_required'}:{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease),plan=root.sealRecoveryPlan(b,ready),handoff=root.transferRecoveryPlan(b,plan);root.bindRecoveryPlan(b,handoff);const evidence=root.issueFinishContext(b,handoff),accepted=accept?root.acceptRecoveryFinishContext(b,handoff,evidence):{};return {raw,root,b,ticket,ready,plan,handoff,evidence,accepted,arm:(fn:()=>string|undefined)=>{guard=fn;}};}
function sourceClosed(f:ReturnType<typeof setup>){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}
function cleanupClosed(f:ReturnType<typeof setup>){f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
it('completes issue -> accept -> same-source/frame release -> one-shot discard -> normal close without issuing a capability',()=>{
  const f=setup(),before=f.root.inspect().preparation;sourceClosed(f);cleanupClosed(f);
  expect(f.root.inspect()).toMatchObject({finish_accept:{state:'invalidated',pending:false,terminal_pending:true},finish_accepted_discard:{started:false,discards:0,source_confirmed:true,cleanup_confirmed:true}});
  expect(f.root.discardAcceptedFinishContext(f.b,f.accepted)).toBeUndefined();expect(f.root.inspect()).toMatchObject({finish_accept:{state:'discarded',pending:false,terminal_pending:false},finish_accepted_discard:{started:true,discards:1,source_confirmed:false,cleanup_confirmed:false},evidence_issues:1,permissions:{formal_issuance:false,dispatch:false,recovery_route:false}});
  expect(f.root.inspect().preparation).toEqual(before);f.root.close(f.b);expect(f.root.inspect()).toMatchObject({state:'closed',finish_accept:{state:'discarded',accepts:1},finish_accepted_discard:{discards:1}});
});
it('also closes cleanup before source without borrowing confirmation from a different frame',()=>{
  const f=setup();cleanupClosed(f);expect(f.root.inspect().finish_accepted_discard).toMatchObject({source_confirmed:false,cleanup_confirmed:true});sourceClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);expect(f.root.inspect().state).toBe('closed');
});
it('consumes accepted and both private terminal receipts before guards and commits discard only after post guard',()=>{
  const f=setup();sourceClosed(f);cleanupClosed(f);const seen:unknown[]=[];f.arm(()=>{const s=f.root.inspect();seen.push({accept:s.finish_accept,discard:s.finish_accepted_discard});return undefined;});f.root.discardAcceptedFinishContext(f.b,f.accepted);
  expect(seen).toEqual([1,2].map(()=>({accept:{state:'discarding',started:true,accepts:1,route_spent:true,pending:false,terminal_pending:false},discard:{started:true,discards:0,source_confirmed:false,cleanup_confirmed:false}})));f.arm(()=>undefined);f.root.close(f.b);
});
it.each(['none','source_started','source_only','cleanup_started','cleanup_only','source_and_cleanup_started'])('rejects %s confirmation and cannot restore the spent terminal slot',mode=>{
  const f=setup();if(mode==='source_started')f.root.beginSourceClose(f.b);if(mode==='source_only'||mode==='source_and_cleanup_started')sourceClosed(f);if(mode==='cleanup_started'||mode==='source_and_cleanup_started')f.root.beginRecoveryCleanup(f.ticket.cleanup);if(mode==='cleanup_only')cleanupClosed(f);
  expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_accept:{state:'failed',terminal_pending:false},finish_accepted_discard:{started:true,discards:0,source_confirmed:false,cleanup_confirmed:false}});
  expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');if(mode!=='cleanup_only'){if(!f.root.inspect().lifecycle?.cleanup_started)f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}expect(f.root.inspect().finish_accepted_discard?.cleanup_confirmed).toBe(false);
});
it.each(['binding','copy_binding','accepted','copy_accepted','evidence','handoff','plan','ready','diagnostic','raw','getter','proxy'])('rejects mixed %s without touching another root or caller accessors',kind=>{
  const a=setup(),b=setup();sourceClosed(a);cleanupClosed(a);const before=b.root.inspect();let touched=0;const poison=Object.defineProperty({},'handle',{get(){touched++;throw Error('SECRET');}});
  const value=kind==='accepted'?b.accepted:kind==='copy_accepted'?{...a.accepted}:kind==='evidence'?a.evidence:kind==='handoff'?a.handoff:kind==='plan'?a.plan:kind==='ready'?a.ready:kind==='diagnostic'?a.root.inspect().finish_accepted_discard!:kind==='raw'?a.raw:kind==='getter'?poison:kind==='proxy'?new Proxy({},{get(){touched++;throw Error('SECRET');}}):a.accepted;
  expect(()=>a.root.discardAcceptedFinishContext(kind==='binding'?b.b:kind==='copy_binding'?{...a.b}:a.b,value)).toThrow('internal_review_error');expect(touched).toBe(0);expect(a.root.inspect().finish_accepted_discard?.discards).toBe(0);expect(b.root.inspect()).toEqual(before);b.root.revoke('cancelled');cleanupClosed(b);
});
it('does not discard issued-but-unaccepted data using an empty or forged accepted handle',()=>{
  const f=setup(false);sourceClosed(f);cleanupClosed(f);expect(()=>f.root.discardAcceptedFinishContext(f.b,{})).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({finish_accept:{accepts:0},finish_accepted_discard:{discards:0}});
});
it('spends accepted discard only once both before and after normal close',()=>{
  for(const close of [false,true]){const f=setup();sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);if(close)f.root.close(f.b);expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');expect(f.root.inspect().finish_accepted_discard?.discards).toBe(1);expect(f.root.inspect().finish_accept?.terminal_pending).toBe(false);}
});
it.each(['cancelled','deadline_exceeded'] as const)('does not complete discard after %s at either guard or restore its slot',reason=>{
  for(const point of [1,2]){const f=setup();sourceClosed(f);cleanupClosed(f);let n=0;f.arm(()=>++n===point?reason:undefined);expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow(reason);
    expect(f.root.inspect()).toMatchObject({state:'failed',finish_accepted_discard:{started:true,discards:0,source_confirmed:false,cleanup_confirmed:false},diagnostics:{hard:{code:reason,phase:'finish_accepted_discard'}}});f.arm(()=>undefined);expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow(reason);
  }
});
it.each(['cancelled','deadline_exceeded'] as const)('keeps post-guard %s over mismatched accepted identity',reason=>{
  const f=setup();sourceClosed(f);cleanupClosed(f);let n=0;f.arm(()=>++n===2?reason:undefined);expect(()=>f.root.discardAcceptedFinishContext(f.b,{})).toThrow(reason);expect(f.root.inspect().diagnostics.hard?.code).toBe(reason);
});
it.each(['discard','accept','issue','bind','bound_discard','unbound_discard','source','cleanup','close','summary'])('stops swallowed %s reentry in either guard without completing discard',step=>{
  for(const point of [1,2]){const f=setup();sourceClosed(f);cleanupClosed(f);let n=0;f.arm(()=>{if(++n===point)try{
    if(step==='discard')f.root.discardAcceptedFinishContext(f.b,f.accepted);else if(step==='accept')f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);else if(step==='issue')f.root.issueFinishContext(f.b,f.handoff);else if(step==='bind')f.root.bindRecoveryPlan(f.b,f.handoff);else if(step==='bound_discard')f.root.discardBoundRecoveryPlan(f.b,f.handoff);else if(step==='unbound_discard')f.root.discardUnboundRecoveryPlan(f.b,f.handoff);else if(step==='source')f.root.beginSourceClose(f.b);else if(step==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);else if(step==='close')f.root.close(f.b);else f.root.summarizeRecoveryPlan(f.b,f.plan);
  }catch{/* deliberately swallowed */}return undefined;});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',finish_accepted_discard:{discards:0},finish_accept:{terminal_pending:false}});}
});
it('records source completion only after its post guard, independently from same-frame cleanup',()=>{
  const f=setup();cleanupClosed(f);f.root.beginSourceClose(f.b);const seen:unknown[]=[];f.arm(()=>{seen.push(f.root.inspect().finish_accepted_discard);return undefined;});f.root.settleSourceClose(f.b,'closed');
  expect(seen).toEqual([1,2].map(()=>({started:false,discards:0,source_confirmed:false,cleanup_confirmed:true})));expect(f.root.inspect().finish_accepted_discard).toMatchObject({source_confirmed:true,cleanup_confirmed:true});f.arm(()=>undefined);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);
});
it.each(['cancelled','deadline_exceeded'] as const)('does not mint a source receipt after %s at source close post guard',reason=>{
  const f=setup();f.root.beginSourceClose(f.b);let n=0;f.arm(()=>++n===2?reason:undefined);expect(()=>f.root.settleSourceClose(f.b,'closed')).toThrow(reason);f.arm(()=>undefined);cleanupClosed(f);
  expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{source_completion:'closed'},new_generation:{cleanup:{status:'confirmed'}},finish_accepted_discard:{source_confirmed:false,cleanup_confirmed:false,discards:0},diagnostics:{hard:{code:reason}}});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow(reason);
});
it.each(['failed','unconfirmed'])('retains source %s separately from cleanup and never promotes hard-stop confirmation',status=>{
  const f=setup();f.root.beginSourceClose(f.b);expect(()=>f.root.settleSourceClose(f.b,status)).toThrow('internal_review_error');cleanupClosed(f);
  expect(f.root.inspect()).toMatchObject({lifecycle:{source_completion:status},new_generation:{cleanup:{status:'confirmed'}},finish_accepted_discard:{source_confirmed:false,cleanup_confirmed:false},diagnostics:{hard:{phase:'source_lifecycle'}}});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');
});
it.each(['not_started','requested','failed','unconfirmed'])('retains cleanup %s separately from closed source and refuses discard',status=>{
  const f=setup();sourceClosed(f);f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,status)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({lifecycle:{source_completion:'closed'},new_generation:{cleanup:{status}},finish_accepted_discard:{source_confirmed:false,cleanup_confirmed:false,discards:0},diagnostics:{hard:{phase:'generation_cleanup'}}});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');
});
it('does not accept a confirmed cleanup record without the same-frame cleanup start',()=>{
  const f=setup();sourceClosed(f);expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed')).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({new_generation:{cleanup:{status:'unconfirmed'}},finish_accepted_discard:{cleanup_confirmed:false,discards:0}});
});
it('refuses a different root cleanup sink without consuming the other pending resource',()=>{
  const a=setup(),b=setup(),before=b.root.inspect();expect(()=>a.root.beginRecoveryCleanup(b.ticket.cleanup)).toThrow('internal_review_error');expect(b.root.inspect()).toEqual(before);cleanupClosed(a);sourceClosed(b);cleanupClosed(b);b.root.discardAcceptedFinishContext(b.b,b.accepted);b.root.close(b.b);expect(a.root.inspect().finish_accepted_discard?.cleanup_confirmed).toBe(false);
});
it('does not confuse old-generation complete cleanup with confirmation of the accepted new frame',()=>{
  const f=setup();expect(f.root.inspect().closure?.cleanup).toBe('complete');sourceClosed(f);expect(f.root.inspect().finish_accepted_discard).toMatchObject({source_confirmed:true,cleanup_confirmed:false});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');cleanupClosed(f);expect(f.root.inspect().finish_accepted_discard?.discards).toBe(0);
});
it.each(['raw','diagnostic','callback'])('rejects extra %s terminal proof rather than allowing caller confirmation',kind=>{
  const f=setup();sourceClosed(f);cleanupClosed(f);let touched=0;const extra=kind==='callback'?()=>{touched++;return true;}:kind==='diagnostic'?f.root.inspect():f.raw;expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted,extra)).toThrow('internal_review_error');expect(touched).toBe(0);expect(f.root.inspect().finish_accepted_discard?.discards).toBe(0);
});
it.each(['cancelled','deadline_exceeded'] as const)('retains first %s through late cleanup confirmation without restoring receipts',reason=>{
  const f=setup();f.root.revoke(reason);cleanupClosed(f);f.root.revoke('internal_review_error');expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow(reason);expect(f.root.inspect()).toMatchObject({new_generation:{cleanup:{status:'confirmed'}},finish_accepted_discard:{source_confirmed:false,cleanup_confirmed:false,discards:0},diagnostics:{hard:{code:reason}}});
});
it('sanitizes unknown exceptions in both discard guards without completing normal close',()=>{
  for(const point of [1,2]){const f=setup();sourceClosed(f);cleanupClosed(f);let n=0;f.arm(()=>{if(++n===point)throw Error('SECRET RAW STACK');return undefined;});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow(/^internal_review_error$/);expect(JSON.stringify(f.root.inspect())).not.toContain('SECRET');expect(f.root.inspect().finish_accepted_discard?.discards).toBe(0);}
});
it('does not expose a normal-close capability or private terminal information after discard',()=>{
  const f=setup();sourceClosed(f);cleanupClosed(f);const out=f.root.discardAcceptedFinishContext(f.b,f.accepted);expect(out).toBeUndefined();const text=JSON.stringify(f.root.inspect());for(const value of [S,O,U,id(1),id(10),'snapshot','source_identity','cleanup_identity'])expect(text).not.toContain(value);for(const key of ['acceptedSourceClosed','acceptedCleanupConfirmed','acceptedTermination','issueNormalClose','issueFinishCandidate'])expect(Object.hasOwn(f.root,key)).toBe(false);expect(f.root.inspect().permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});f.root.close(f.b);
});
it('keeps the accepted-discard API, diagnostic field and phase out of legacy and lifecycle-only roots',()=>{
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},...fixture().finish.time},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  for(const root of [createSyntheticSoftRecoveryIssuer(seed,facts),createSyntheticLifecycleRecoveryKernel(seed,facts)]){expect(root).not.toHaveProperty('discardAcceptedFinishContext');expect(root.inspect()).not.toHaveProperty('finish_accepted_discard');}
  type Legacy=ReturnType<typeof createSyntheticSoftRecoveryIssuer>;type Life=ReturnType<typeof createSyntheticLifecycleRecoveryKernel>;
  const lMethod:'discardAcceptedFinishContext' extends keyof Legacy?true:false=false,fMethod:'discardAcceptedFinishContext' extends keyof Life?true:false=false,lField:'finish_accepted_discard' extends keyof ReturnType<Legacy['inspect']>?true:false=false,fField:'finish_accepted_discard' extends keyof ReturnType<Life['inspect']>?true:false=false;
  const lPhase:'finish_accepted_discard' extends NonNullable<ReturnType<Legacy['inspect']>['diagnostics']['hard']>['phase']?true:false=false,fPhase:'finish_accepted_discard' extends NonNullable<ReturnType<Life['inspect']>['diagnostics']['hard']>['phase']?true:false=false;expect([lMethod,fMethod,lField,fField,lPhase,fPhase]).toEqual([false,false,false,false,false,false]);
});
it.each(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'])('finishes the %s synthetic transcript without new accounting or state promotion',point=>{
  const raw=fixture();raw.point=point;const f=setup(true,raw),before=f.root.inspect();sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);expect(f.root.inspect().preparation).toEqual(before.preparation);expect(f.root.inspect().closure).toEqual(before.closure);f.root.close(f.b);expect(f.root.inspect()).toMatchObject({state:'closed',evidence_issues:1,finish_accept:{accepts:1,route_spent:true},finish_accepted_discard:{discards:1}});
});
