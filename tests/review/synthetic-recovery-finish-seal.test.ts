import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import {createSyntheticLifecycleRecoveryKernel} from '../support/review/synthetic-recovery-kernel.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function setup(accept=true,raw=fixture()){
  let guard:()=>string|undefined=()=>undefined;
  const root=createSyntheticPinnedRecoveryRoot(raw,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,raw.point==='request_check_unstarted'?{termination:'not_required',cleanup:'not_required'}:{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease),plan=root.sealRecoveryPlan(b,ready),handoff=root.transferRecoveryPlan(b,plan);
  root.bindRecoveryPlan(b,handoff);const evidence=root.issueFinishContext(b,handoff),accepted=accept?root.acceptRecoveryFinishContext(b,handoff,evidence):{};
  return {raw,root,b,ticket,ready,plan,handoff,evidence,accepted,arm:(fn:()=>string|undefined)=>{guard=fn;}};
}
function sourceClosed(f:ReturnType<typeof setup>){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}
function cleanupClosed(f:ReturnType<typeof setup>){if(!f.root.inspect().lifecycle?.cleanup_started)f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');}
it('seals only the same accepted slot into an empty non-executable handle and preserves terminal ownership',()=>{
  const f=setup(),before=f.root.inspect(),handle=f.root.sealRecoveryFinishExpectation(f.b,f.accepted);
  expect(Object.keys(handle)).toEqual([]);expect(Object.getOwnPropertySymbols(handle)).toHaveLength(0);expect(Object.isFrozen(handle)).toBe(true);
  expect(f.root.inspect()).toMatchObject({finish_seal:{state:'sealed',started:true,seals:1,pending:true},finish_accept:{state:'sealed',pending:false,terminal_pending:true},permissions:{formal_issuance:false,dispatch:false,recovery_route:false}});
  expect(f.root.inspect().preparation).toEqual(before.preparation);expect(f.root.inspect().closure).toEqual(before.closure);
  sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);expect(f.root.inspect().state).toBe('closed');
});
it('keeps the seal API, diagnostic and phase out of legacy/lifecycle-only roots',()=>{
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},...fixture().finish.time},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  for(const root of [createSyntheticSoftRecoveryIssuer(seed,facts),createSyntheticLifecycleRecoveryKernel(seed,facts)]){expect(root).not.toHaveProperty('sealRecoveryFinishExpectation');expect(root.inspect()).not.toHaveProperty('finish_seal');}
  type L=ReturnType<typeof createSyntheticSoftRecoveryIssuer>;type F=ReturnType<typeof createSyntheticLifecycleRecoveryKernel>;
  const methodL:'sealRecoveryFinishExpectation' extends keyof L?true:false=false,methodF:'sealRecoveryFinishExpectation' extends keyof F?true:false=false;
  const fieldL:'finish_seal' extends keyof ReturnType<L['inspect']>?true:false=false,fieldF:'finish_seal' extends keyof ReturnType<F['inspect']>?true:false=false;
  const phaseL:'finish_seal' extends NonNullable<ReturnType<L['inspect']>['diagnostics']['hard']>['phase']?true:false=false,phaseF:'finish_seal' extends NonNullable<ReturnType<F['inspect']>['diagnostics']['hard']>['phase']?true:false=false;
  expect([methodL,methodF,fieldL,fieldF,phaseL,phaseF]).toEqual([false,false,false,false,false,false]);
});
it('occupies the one-shot seal and removes accepted expectations before both guards without publishing early',()=>{
  const f=setup(),seen:unknown[]=[];f.arm(()=>{const s=f.root.inspect();seen.push({seal:s.finish_seal,accept:s.finish_accept});return undefined;});
  f.root.sealRecoveryFinishExpectation(f.b,f.accepted);
  expect(seen).toEqual([1,2].map(()=>({seal:{state:'sealing',started:true,seals:0,pending:false,usage:null},accept:{state:'accepted',started:true,accepts:1,route_spent:true,pending:false,terminal_pending:true}})));
  f.arm(()=>undefined);f.root.revoke('cancelled');cleanupClosed(f);
});
it.each(['binding','copy_binding','accepted','copy_accepted','evidence','handoff','plan','ready','summary','raw','getter','proxy'])('rejects mixed %s without touching another root or caller code',kind=>{
  const a=setup(),b=setup(),before=b.root.inspect();let touched=0;
  const poison=Object.defineProperty({},'snapshot',{get(){touched++;throw Error('SECRET');}});
  const value=kind==='accepted'?b.accepted:kind==='copy_accepted'?{...a.accepted}:kind==='evidence'?a.evidence:kind==='handoff'?a.handoff:kind==='plan'?a.plan:kind==='ready'?a.ready:kind==='summary'?a.root.inspect():kind==='raw'?a.raw:kind==='getter'?poison:kind==='proxy'?new Proxy({},{get(){touched++;throw Error('SECRET');}}):a.accepted;
  expect(()=>a.root.sealRecoveryFinishExpectation(kind==='binding'?b.b:kind==='copy_binding'?{...a.b}:a.b,value)).toThrow('internal_review_error');
  expect(a.root.inspect()).toMatchObject({state:'failed',finish_seal:{seals:0,pending:false},finish_accept:{pending:false,terminal_pending:false}});expect(touched).toBe(0);expect(b.root.inspect()).toEqual(before);
  cleanupClosed(a);b.root.revoke('cancelled');cleanupClosed(b);
});
it.each(['before','after_cleanup','after_discard','after_close'])('rejects a second seal %s without restoring accepted or sealed slots',point=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);
  if(point!=='before'){sourceClosed(f);cleanupClosed(f);}
  if(point==='after_discard'||point==='after_close')f.root.discardAcceptedFinishContext(f.b,f.accepted);
  if(point==='after_close')f.root.close(f.b);
  expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');
  expect(f.root.inspect().finish_seal).toMatchObject({seals:1,pending:false});if(point==='before')cleanupClosed(f);
});
it('does not seal issued-but-unaccepted evidence or fabricate a new accepted slot',()=>{
  const f=setup(false);expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.evidence)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({finish_seal:{seals:0,pending:false},finish_accept:{accepts:0,pending:false}});cleanupClosed(f);
});
it.each(['cancelled','deadline_exceeded'] as const)('keeps %s at pre/post guard and rejects failed reuse',reason=>{
  for(const point of [1,2]){
    const f=setup();let n=0,leaked:unknown;f.arm(()=>++n===point?reason:undefined);
    try{leaked=f.root.sealRecoveryFinishExpectation(f.b,f.accepted);}catch{/* fixed diagnostic below */}
    expect(leaked).toBeUndefined();expect(f.root.inspect()).toMatchObject({state:'failed',finish_seal:{started:true,seals:0,pending:false},finish_accept:{pending:false,terminal_pending:false},diagnostics:{hard:{code:reason,phase:'finish_seal'}}});
    f.arm(()=>undefined);cleanupClosed(f);expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow(reason);
  }
});
it.each(['cancelled','deadline_exceeded'] as const)('gives post-guard %s priority over wrong accepted identity',reason=>{
  const f=setup();let n=0;f.arm(()=>++n===2?reason:undefined);expect(()=>f.root.sealRecoveryFinishExpectation(f.b,{})).toThrow(reason);
  expect(f.root.inspect().diagnostics.hard).toEqual({phase:'finish_seal',code:reason});f.arm(()=>undefined);cleanupClosed(f);
});
it.each(['seal','discard','close','source','cleanup','accept','issue','bind','summary'] as const)('refuses swallowed %s reentry at either seal guard',step=>{
  for(const point of [1,2]){
    const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
      if(step==='seal')f.root.sealRecoveryFinishExpectation(f.b,f.accepted);else if(step==='discard')f.root.discardAcceptedFinishContext(f.b,f.accepted);else if(step==='close')f.root.close(f.b);else if(step==='source')f.root.beginSourceClose(f.b);else if(step==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);else if(step==='accept')f.root.acceptRecoveryFinishContext(f.b,f.handoff,f.evidence);else if(step==='issue')f.root.issueFinishContext(f.b,f.handoff);else if(step==='bind')f.root.bindRecoveryPlan(f.b,f.handoff);else f.root.summarizeRecoveryPlan(f.b,f.plan);
    }catch{/* swallowed deliberately */}return undefined;});
    expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');
    expect(f.root.inspect()).toMatchObject({state:'failed',finish_seal:{seals:0,pending:false},finish_accept:{pending:false,terminal_pending:false}});f.arm(()=>undefined);cleanupClosed(f);
  }
});
it.each(['source','cleanup'] as const)('invalidates a sealed expectation synchronously at %s start but retains terminal responsibilities',step=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);
  if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(f.root.inspect()).toMatchObject({state:'consumed',finish_seal:{state:'invalidated',seals:1,pending:false},finish_accept:{state:'invalidated',pending:false,terminal_pending:true}});
  if(step==='source')f.root.settleSourceClose(f.b,'closed');else sourceClosed(f);cleanupClosed(f);
  f.root.discardAcceptedFinishContext(f.b,f.accepted);expect(f.root.inspect().finish_seal).toMatchObject({state:'discarded',seals:1,pending:false});f.root.close(f.b);
});
it.each(['source','cleanup'] as const)('refuses first seal after %s invalidation',step=>{
  const f=setup();if(step==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');expect(f.root.inspect().finish_seal).toMatchObject({seals:0,pending:false});cleanupClosed(f);
});
it.each(['cancelled','deadline_exceeded'] as const)('revokes sealed expectations on first hard %s while keeping late cleanup diagnostic only',reason=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);f.root.revoke(reason);cleanupClosed(f);f.root.revoke('internal_review_error');
  expect(f.root.inspect()).toMatchObject({finish_seal:{state:'failed',pending:false,seals:1},finish_accept:{terminal_pending:false},new_generation:{cleanup:{status:'confirmed'}},diagnostics:{hard:{code:reason}}});
  expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow(reason);
});
it('drops sealed state before both discard guards and commits discard only after post guard',()=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);sourceClosed(f);cleanupClosed(f);
  const seen:unknown[]=[];f.arm(()=>{seen.push(f.root.inspect().finish_seal);return undefined;});f.root.discardAcceptedFinishContext(f.b,f.accepted);
  expect(seen).toHaveLength(2);for(const s of seen)expect(s).toMatchObject({state:'discarding',pending:false,seals:1});
  expect(f.root.inspect().finish_seal?.state).toBe('discarded');f.arm(()=>undefined);f.root.close(f.b);
});
it.each(['seal','close','discard'] as const)('rejects %s competition during accepted discard without restoring sealed state',step=>{
  for(const point of [1,2]){const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);sourceClosed(f);cleanupClosed(f);let n=0;f.arm(()=>{if(++n===point)try{
    if(step==='seal')f.root.sealRecoveryFinishExpectation(f.b,f.accepted);else if(step==='close')f.root.close(f.b);else f.root.discardAcceptedFinishContext(f.b,f.accepted);
  }catch{/* swallowed */}return undefined;});expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');
    expect(f.root.inspect()).toMatchObject({finish_seal:{pending:false},finish_accepted_discard:{discards:0},finish_accept:{terminal_pending:false}});
  }
});
it('cannot normal-close sealed state or discharge terminal responsibility using the sealed handle',()=>{
  {const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);expect(()=>f.root.close(f.b)).toThrow('internal_review_error');cleanupClosed(f);}
  {const f=setup(),sealed=f.root.sealRecoveryFinishExpectation(f.b,f.accepted);sourceClosed(f);cleanupClosed(f);expect(()=>f.root.discardAcceptedFinishContext(f.b,sealed)).toThrow('internal_review_error');expect(f.root.inspect().finish_accepted_discard?.discards).toBe(0);}
});
it.each(['raw','summary','callback','getter'])('rejects extra %s input rather than registering an expectation',kind=>{
  const f=setup();let touched=0;const extra=kind==='callback'?()=>{touched++;return f.raw;}:kind==='getter'?Object.defineProperty({},'header',{get(){touched++;throw Error('SECRET');}}):kind==='summary'?f.root.inspect():f.raw;
  expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted,extra)).toThrow('internal_review_error');expect(touched).toBe(0);expect(f.root.inspect().finish_seal).toMatchObject({seals:0,pending:false});cleanupClosed(f);
});
it('rejects noncanonical selected order even if earlier structure/context stages accepted it',()=>{
  const raw=fixture();raw.finish.selected=[id(2),id(1)];raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=2;
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const f=setup(true,raw);expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');expect(f.root.inspect().finish_seal?.pending).toBe(false);cleanupClosed(f);
});
it.each(['cancelled','deadline_exceeded'] as const)('preserves post-guard %s over a held canonical projection mismatch',reason=>{
  const raw=fixture();raw.finish.selected=[id(2),id(1)];raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=2;
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const f=setup(true,raw);let n=0;f.arm(()=>++n===2?reason:undefined);expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow(reason);
  expect(f.root.inspect().diagnostics.hard).toEqual({phase:'finish_seal',code:reason});f.arm(()=>undefined);cleanupClosed(f);
});
it('pins bounded 100-row data privately without exposing header, IDs, times or an E value',()=>{
  const raw=fixture();raw.finish.selected=Array.from({length:100},(_,n)=>id(n+1));raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=100;
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const f=setup(true,raw),before=f.root.inspect();raw.finish.selected[0]=id(200);raw.finish.time.upper_utc=S;
  const handle=f.root.sealRecoveryFinishExpectation(f.b,f.accepted),s=f.root.inspect();expect(s.preparation).toEqual(before.preparation);expect(s.finish_seal).toMatchObject({pending:true,seals:1});
  expect(s.finish_seal!.usage!.nodes).toBeLessThanOrEqual(10000);expect(s.finish_seal!.usage!.character_units).toBeLessThanOrEqual(262144);
  const text=JSON.stringify({handle,state:s});for(const marker of [S,O,U,id(1),id(10),'snapshot','expected_context','raw_buildname','ended_at','accepted_origin','source_identity'])expect(text).not.toContain(marker);
  for(const key of ['sealedFinish','getSealedExpectation','compareSealedExpectation','issueFinishCandidate','sendFinish','core'])expect(Object.hasOwn(f.root,key)).toBe(false);
  sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);
});
it('keeps sealed, accepted, issued and plan handles statically distinct',()=>{
  type R=ReturnType<typeof createSyntheticPinnedRecoveryRoot>;type S=ReturnType<R['sealRecoveryFinishExpectation']>;type A=ReturnType<R['acceptRecoveryFinishContext']>;type E=ReturnType<R['issueFinishContext']>;type P=ReturnType<R['sealRecoveryPlan']>;
  const a:S extends A?true:false=false,b:S extends E?true:false=false,c:S extends P?true:false=false,d:A extends S?true:false=false;expect([a,b,c,d]).toEqual([false,false,false,false]);
});
it('sanitizes unknown guard exceptions without returning a partial handle',()=>{
  for(const point of [1,2]){const f=setup();let n=0;f.arm(()=>{if(++n===point)throw Error('SECRET RAW STACK');return undefined;});expect(()=>f.root.sealRecoveryFinishExpectation(f.b,f.accepted)).toThrow(/^internal_review_error$/);
    expect(f.root.inspect().finish_seal).toMatchObject({seals:0,pending:false});expect(JSON.stringify(f.root.inspect())).not.toContain('SECRET');f.arm(()=>undefined);cleanupClosed(f);
  }
});
it.each(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'])('seals the %s transcript without new accounting or generation activity',point=>{
  const raw=fixture();raw.point=point;const f=setup(true,raw),before=f.root.inspect();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);expect(f.root.inspect().preparation).toEqual(before.preparation);expect(f.root.inspect().closure).toEqual(before.closure);expect(f.root.inspect().new_generation).toEqual(before.new_generation);
  sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);expect(f.root.inspect()).toMatchObject({state:'closed',finish_seal:{state:'discarded',seals:1,pending:false},evidence_issues:1});
});
function set(raw:unknown,path:string,value:unknown){const keys=path.split('.');let out=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))out=out[k] as Record<string,unknown>;out[keys.at(-1)!]=value;}
it.each(['reviewed','result_omitted'] as const)('retains the original completed receipt and %s origin without issuing body evidence',state=>{
  const raw=fixture(),active='2026-11-02T00:00:03.000Z';raw.active_input_sys_id=id(2);raw.finish.time.upper_utc=active;raw.finish.selected=[id(1),id(2)];raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=2;
  const context={record_updated_at:S,instance_binding:raw.finish.header.target.instance_binding,instance_release:raw.finish.header.instance_release,requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};
  set(raw,'finish.inputs',[{update_xml_sys_id:id(1),retrieved_at:U,state:'completed',expected_context:context,accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(1),retrieved_at:U}},{update_xml_sys_id:id(2),retrieved_at:active,state:'not_processed',expected_context:null,accepted:null}]);
  set(raw,'finish.outcomes',[{state,update_xml_sys_id:id(1),...(state==='result_omitted'?{reason:'response_limit'}:{})},{state:'not_processed',update_xml_sys_id:id(2),reason:'deadline_exceeded'}]);
  const f=setup(true,raw),before=f.root.inspect();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);expect(f.root.inspect()).toMatchObject({pins:{accepted:1,inputs:2},finish_seal:{pending:true,seals:1}});expect(f.root.inspect().preparation).toEqual(before.preparation);
  sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);
});
it('seals 0.3 selection facts without weakening scope limitations or enabling candidate dispatch',()=>{
  const raw=fixture();raw.finish.header.schema_version='bp-mcp-review-0.3';raw.finish.header.limitations.push(...TARGET_LIMITATIONS);
  set(raw,'finish.header.selection',{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}});
  set(raw,'finish.header.coverage.analysis_scope','selected_candidate_window');set(raw,'finish.header.coverage.candidate_inventory_complete',false);set(raw,'finish.header.coverage.update_set_inventory_complete',false);
  const f=setup(true,raw);f.root.sealRecoveryFinishExpectation(f.b,f.accepted);expect(f.root.inspect().permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});sourceClosed(f);cleanupClosed(f);f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);
});
it('cannot use another root sealed handle as accepted input and leaves its owner unchanged',()=>{
  const a=setup(),b=setup(),sealed=a.root.sealRecoveryFinishExpectation(a.b,a.accepted),before=a.root.inspect();
  expect(()=>b.root.sealRecoveryFinishExpectation(b.b,sealed)).toThrow('internal_review_error');expect(a.root.inspect()).toEqual(before);cleanupClosed(b);
  sourceClosed(a);cleanupClosed(a);a.root.discardAcceptedFinishContext(a.b,a.accepted);a.root.close(a.b);
});
it('destroys sealed expectation on premature fixed discard instead of restoring it after failure',()=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);expect(()=>f.root.discardAcceptedFinishContext(f.b,f.accepted)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({finish_seal:{state:'failed',seals:1,pending:false},finish_accepted_discard:{started:true,discards:0},finish_accept:{terminal_pending:false}});cleanupClosed(f);
});
it.each(['failed','unconfirmed'])('keeps source %s separate from new-frame cleanup after sealing',status=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);f.root.beginSourceClose(f.b);expect(()=>f.root.settleSourceClose(f.b,status)).toThrow('internal_review_error');cleanupClosed(f);
  expect(f.root.inspect()).toMatchObject({finish_seal:{pending:false,seals:1},lifecycle:{source_completion:status},new_generation:{cleanup:{status:'confirmed'}},diagnostics:{hard:{phase:'source_lifecycle'}}});
});
it.each(['failed','unconfirmed','not_started','requested'])('keeps cleanup %s as diagnostics only after sealing and closed source',status=>{
  const f=setup();f.root.sealRecoveryFinishExpectation(f.b,f.accepted);sourceClosed(f);f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,status)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({finish_seal:{pending:false,seals:1},new_generation:{cleanup:{status}},finish_accept:{terminal_pending:false},diagnostics:{hard:{phase:'generation_cleanup'}}});
});
