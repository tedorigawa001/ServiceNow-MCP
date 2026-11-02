import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import type {SyntheticFinishContextEvidence} from '../support/review/synthetic-finish-context-values.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function prepared(check:()=>string|undefined=()=>undefined){let guard=check;const root=createSyntheticPinnedRecoveryRoot(fixture(),()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'});return {root,b,p,arm:(fn:()=>string|undefined)=>{guard=fn;}};}
function claimed(){const f=prepared(),ticket=f.root.claimRecoveryGeneration(f.b,f.p);return {...f,ticket};}
function started(){const f=claimed(),lease=f.root.startRecoveryGeneration(f.b,f.ticket.start);return {...f,lease};}
function accepted(){const f=started(),ready=f.root.acceptRecoveryReady(f.b,f.lease);return {...f,ready};}
it('keeps worker start separate from cleanup start and captures ready only after acceptance',()=>{
  const f=prepared(),ticket=f.root.claimRecoveryGeneration(f.b,f.p),lease=f.root.startRecoveryGeneration(f.b,ticket.start);
  expect(f.root.inspect().lifecycle).toMatchObject({source:'open',worker_started:true,cleanup_started:false,cleanup_serial:0,ready_origin:false,ready_usable:false});
  const ready=f.root.acceptRecoveryReady(f.b,lease);f.root.checkRecoveryReady(f.b,ready);
  expect(f.root.inspect().lifecycle).toMatchObject({ready_origin:true,ready_usable:true,cleanup_serial:0});
  f.root.beginRecoveryCleanup(ticket.cleanup);expect(f.root.inspect().lifecycle).toMatchObject({cleanup_started:true,cleanup_serial:1,ready_origin:false,ready_usable:false});
  f.root.recordRecoveryCleanup(ticket.cleanup,'confirmed');f.root.discardRecoveryGeneration(f.b,ready);f.root.close(f.b);
  expect(f.root.inspect()).toMatchObject({state:'closed',lifecycle:{source:'closed',cleanup_serial:1},route_bound:false,evidence_issues:0});
});
it('does not widen legacy diagnostic types or expose lifecycle methods on legacy roots',()=>{
  type Old=ReturnType<typeof createSyntheticSoftRecoveryIssuer>;type Snapshot=ReturnType<Old['inspect']>;type Hard=NonNullable<Snapshot['diagnostics']['hard']>;
  const noField:'lifecycle' extends keyof Snapshot?true:false=false,noPhase:'source_lifecycle' extends Hard['phase']?true:false=false;expect([noField,noPhase]).toEqual([false,false]);
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  const old=createSyntheticSoftRecoveryIssuer(seed,facts);for(const k of ['beginSourceClose','settleSourceClose','checkWorkerGenerationReady','beginWorkerGenerationCleanup'])expect(Object.hasOwn(old,k)).toBe(false);expect(Object.hasOwn(old.inspect(),'lifecycle')).toBe(false);
});
it('captures ready origin only after every issue/accept guard has returned',()=>{
  const f=started(),seen:unknown[]=[];f.arm(()=>{seen.push([f.root.inspect().lifecycle?.ready_origin,f.root.inspect().new_generation?.ready_events]);return undefined;});
  const ready=f.root.acceptRecoveryReady(f.b,f.lease);expect(seen).toEqual([[false,0],[false,0],[false,0],[false,0]]);expect(f.root.inspect().lifecycle?.ready_usable).toBe(true);f.root.checkRecoveryReady(f.b,ready);
});
it('invalidates ready before source-close guards and never reopens the source',()=>{
  const f=accepted(),seen:unknown[]=[];f.arm(()=>{const s=f.root.inspect().lifecycle;seen.push([s?.source,s?.source_close_started,s?.ready_origin,s?.ready_usable]);return undefined;});
  f.root.beginSourceClose(f.b);expect(seen).toEqual([['closing',true,false,false],['closing',true,false,false]]);
  f.root.settleSourceClose(f.b,'closed');expect(f.root.inspect().lifecycle?.source).toBe('closed');
  f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.discardRecoveryGeneration(f.b,f.ready);f.root.close(f.b);expect(f.root.inspect().state).toBe('closed');
});
it('permits source close with a held preparation only after fixed discard',()=>{
  const f=prepared();f.root.beginSourceClose(f.b);f.root.discardWorkerRecoveryPreparation(f.b,f.p);f.root.settleSourceClose(f.b,'closed');f.root.close(f.b);expect(f.root.inspect()).toMatchObject({state:'closed',pins:null,lifecycle:{source:'closed',worker_started:false}});
});
it('does not treat a ready history counter or confirmed cleanup as a live ready witness',()=>{
  const f=accepted();f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
  expect(f.root.inspect()).toMatchObject({new_generation:{ready_events:1},lifecycle:{ready_origin:false,ready_usable:false,cleanup_serial:1}});expect(()=>f.root.checkRecoveryReady(f.b,f.ready)).toThrow('internal_review_error');
  expect(()=>f.root.checkRecoveryReady(f.b,{...f.root.inspect()})).toThrow('internal_review_error');expect(f.root.inspect().lifecycle?.cleanup_serial).toBe(1);
});
it('requires a cleanup-start claim even for a confirmed result',()=>{
  const f=accepted();expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed')).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{cleanup_started:false,cleanup_serial:0,cleanup_settled:true,ready_origin:false},new_generation:{cleanup:{status:'unconfirmed'},cleanup_pending:false}});
  expect(()=>f.root.beginRecoveryCleanup(f.ticket.cleanup)).toThrow('internal_review_error');
});
it.each(['start','ready'] as const)('rejects %s after a healthy cleanup-start claim, not merely after hard stop',stage=>{
  const setup=()=>{if(stage==='start'){const f=claimed();return {...f,run:()=>f.root.startRecoveryGeneration(f.b,f.ticket.start)};}const f=started();return {...f,run:()=>f.root.acceptRecoveryReady(f.b,f.lease)};};
  const f=setup();f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(f.root.inspect().diagnostics.hard).toBeNull();
  expect(f.run).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{cleanup_serial:1,ready_origin:false},new_generation:{ready_events:0}});
  f.root.recordRecoveryCleanup(f.ticket.cleanup,stage==='start'?'not_required':'confirmed');
});
it('makes cleanup start one-shot without consuming the diagnostics sink',()=>{
  const f=accepted();f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(()=>f.root.beginRecoveryCleanup(f.ticket.cleanup)).toThrow('internal_review_error');
  f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{cleanup_serial:1,cleanup_settled:true,ready_usable:false},new_generation:{cleanup:{status:'confirmed'}}});
});
it('publishes cleanup ownership before worker startup and retains it if startup fails',()=>{
  const f=claimed();f.arm(()=> 'deadline_exceeded');expect(()=>f.root.startRecoveryGeneration(f.b,f.ticket.start)).toThrow('deadline_exceeded');
  f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'not_required');expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{worker_started:false,cleanup_serial:1,cleanup_settled:true},diagnostics:{hard:{code:'deadline_exceeded'}}});
});
it('collects cleanup after hard stop without running guards or reviving ready',()=>{
  const f=accepted();f.root.revoke('cancelled');f.arm(()=>{throw Error('SECRET guard must not run during diagnostic cleanup');});
  f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
  expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,lifecycle:{source:'failed',ready_origin:false,ready_usable:false,cleanup_serial:1},diagnostics:{hard:{code:'cancelled'}},new_generation:{cleanup:{status:'confirmed'}}});expect(()=>f.root.checkRecoveryReady(f.b,f.ready)).toThrow('cancelled');
});
it('retains a prior fake source-close outcome separately from later cleanup failure',()=>{
  const f=accepted();f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,'failed')).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{source:'failed',source_completion:'closed',ready_origin:false},new_generation:{cleanup:{status:'failed'}}});
});
it.each(['failed','unconfirmed','requested','not_started','not_required',{},null])('never promotes cleanup outcome %j to a healthy source or ready',status=>{
  const f=accepted();f.root.beginRecoveryCleanup(f.ticket.cleanup);expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,status)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{source:'failed',cleanup_serial:1,cleanup_settled:true,ready_origin:false}});expect(()=>f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed')).toThrow('internal_review_error');
});
it.each(['binding','start','lease','ready','cleanup_begin','cleanup_record'] as const)('rejects other/copy %s without mutating the other root',kind=>{
  for(const copy of [false,true]){
    const setup=()=>{
      if(kind==='start'){const a=claimed(),b=claimed();return {a:a.root,b:b.root,run:()=>a.root.startRecoveryGeneration(a.b,copy?{...a.ticket.start}:b.ticket.start)};}
      if(kind==='lease'){const a=started(),b=started();return {a:a.root,b:b.root,run:()=>a.root.acceptRecoveryReady(a.b,copy?{...a.lease}:b.lease)};}
      const a=accepted(),b=accepted();let run:()=>unknown;
      if(kind==='binding')run=()=>a.root.beginSourceClose(copy?{...a.b}:b.b);
      else if(kind==='ready')run=()=>a.root.checkRecoveryReady(a.b,copy?{...a.ready}:b.ready);
      else if(kind==='cleanup_begin')run=()=>a.root.beginRecoveryCleanup(copy?{...a.ticket.cleanup}:b.ticket.cleanup);
      else{a.root.beginRecoveryCleanup(a.ticket.cleanup);run=()=>a.root.recordRecoveryCleanup(copy?{...a.ticket.cleanup}:b.ticket.cleanup,'confirmed');}
      return {a:a.root,b:b.root,run};
    };
    const {a,b,run}=setup(),before=b.inspect();expect(run).toThrow('internal_review_error');expect(a.inspect()).toMatchObject({state:'failed',lifecycle:{ready_origin:false}});expect(b.inspect()).toEqual(before);
  }
});
it('has successful same-handle controls at each mixed-handle boundary',()=>{
  const a=claimed(),lease=a.root.startRecoveryGeneration(a.b,a.ticket.start),ready=a.root.acceptRecoveryReady(a.b,lease);a.root.checkRecoveryReady(a.b,ready);a.root.beginRecoveryCleanup(a.ticket.cleanup);a.root.recordRecoveryCleanup(a.ticket.cleanup,'confirmed');a.root.discardRecoveryGeneration(a.b,ready);a.root.close(a.b);expect(a.root.inspect().state).toBe('closed');
});
it.each(['binding','preparation'] as const)('rejects a foreign %s before claiming a generation',kind=>{
  const a=prepared(),b=prepared(),before=b.root.inspect();expect(()=>a.root.claimRecoveryGeneration(kind==='binding'?b.b:a.b,kind==='preparation'?b.p:a.p)).toThrow('internal_review_error');expect(b.root.inspect()).toEqual(before);
});
it.each(['open','failed','closing','unknown',{},null])('rejects source completion %j instead of reopening or normalizing it to closed',status=>{
  const f=accepted();f.root.beginSourceClose(f.b);expect(()=>f.root.settleSourceClose(f.b,status)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{source:'failed',source_close_started:true,ready_origin:false}});
});
it('rejects source completion before begin and a second begin even with the same owner',()=>{
  const f=prepared();expect(()=>f.root.settleSourceClose(f.b,'closed')).toThrow('internal_review_error');
  const g=prepared();g.root.beginSourceClose(g.b);expect(()=>g.root.beginSourceClose(g.b)).toThrow('internal_review_error');expect(g.root.inspect().lifecycle?.source).toBe('failed');
});
it('blocks new work after source-close begins while retaining fixed cleanup paths',()=>{
  const f=accepted();f.root.beginSourceClose(f.b);expect(()=>f.root.checkRecoveryReady(f.b,f.ready)).toThrow('internal_review_error');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');expect(f.root.inspect().lifecycle?.source).toBe('failed');
  const g=claimed();g.root.beginSourceClose(g.b);expect(()=>g.root.startRecoveryGeneration(g.b,g.ticket.start)).toThrow('internal_review_error');g.root.beginRecoveryCleanup(g.ticket.cleanup);g.root.recordRecoveryCleanup(g.ticket.cleanup,'not_required');
});
it.each([1,2,3,4])('stops generation claiming at guard %i without a started worker or reusable route',at=>{
  const f=prepared();let calls=0;f.arm(()=>++calls===at?'cancelled':undefined);expect(()=>f.root.claimRecoveryGeneration(f.b,f.p)).toThrow('cancelled');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,lifecycle:{source:'failed',worker_started:false,ready_origin:false},diagnostics:{hard:{code:'cancelled'}}});
});
it.each([1,2])('stops worker startup at guard %i and still settles owned cleanup',at=>{
  const f=claimed();let calls=0;f.arm(()=>++calls===at?'cancelled':undefined);expect(()=>f.root.startRecoveryGeneration(f.b,f.ticket.start)).toThrow('cancelled');
  expect(f.root.inspect().lifecycle?.worker_started).toBe(at===2);f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,at===2?'confirmed':'not_required');expect(f.root.inspect().diagnostics.hard?.code).toBe('cancelled');
});
it.each([1,2,3,4])('stops ready at guard %i without committing an origin',at=>{
  const f=started();let calls=0;f.arm(()=>++calls===at?'cancelled':undefined);expect(()=>f.root.acceptRecoveryReady(f.b,f.lease)).toThrow('cancelled');expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{ready_origin:false,ready_usable:false},new_generation:{ready_events:0}});f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
});
it.each(['check','source_begin','source_settle'] as const)('stops %s on each guard and retains the first reason',operation=>{
  for(const at of [1,2]){const f=accepted();if(operation==='source_settle')f.root.beginSourceClose(f.b);let calls=0;f.arm(()=>++calls===at?'deadline_exceeded':undefined);
    expect(()=>operation==='check'?f.root.checkRecoveryReady(f.b,f.ready):operation==='source_begin'?f.root.beginSourceClose(f.b):f.root.settleSourceClose(f.b,'closed')).toThrow('deadline_exceeded');
    expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{source:'failed',ready_origin:false},diagnostics:{hard:{code:'deadline_exceeded'}}});f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');expect(f.root.inspect().diagnostics.hard?.code).toBe('deadline_exceeded');
  }
});
it('rejects swallowed cleanup reentry during ready acceptance and cannot commit a late origin',()=>{
  const f=started();let n=0;f.arm(()=>{if(++n===4){try{f.root.beginRecoveryCleanup(f.ticket.cleanup);}catch{/* no revival */}}return undefined;});expect(()=>f.root.acceptRecoveryReady(f.b,f.lease)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',lifecycle:{cleanup_started:true,cleanup_serial:1,ready_origin:false},new_generation:{ready_events:0}});f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
});
it('rejects swallowed source-close reentry during ready acceptance',()=>{
  const f=started();let n=0;f.arm(()=>{if(++n===4){try{f.root.beginSourceClose(f.b);}catch{/* no revival */}}return undefined;});expect(()=>f.root.acceptRecoveryReady(f.b,f.lease)).toThrow('internal_review_error');expect(f.root.inspect().lifecycle?.ready_origin).toBe(false);
});
it('never exposes identity witnesses, handoff or finish evidence in lifecycle diagnostics',()=>{
  const f=accepted(),visible=JSON.stringify(f.root.inspect());for(const text of [S,O,U,id(1),'supervisor','ready_origin_id','source_identity','cleanup_identity'])expect(visible).not.toContain(text);
  for(const k of ['handoff','issueFinishContext','acceptFinishContext','readyOrigin','source','frame','core'])expect(Object.hasOwn(f.root,k)).toBe(false);
  type Root=ReturnType<typeof createSyntheticPinnedRecoveryRoot>;type Ticket=ReturnType<Root['claimRecoveryGeneration']>;type Ready=ReturnType<Root['acceptRecoveryReady']>;
  const noEvidence:Ready extends SyntheticFinishContextEvidence?true:false=false,noMix:Ticket['cleanup'] extends Ready?true:false=false;expect([noEvidence,noMix]).toEqual([false,false]);expect(f.root.inspect()).toMatchObject({route_bound:false,evidence_issues:0});
});
