import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts} from '../support/review/synthetic-soft-recovery.js';
const points=['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'] as const;
type Point=typeof points[number];
function fixture(point:Point='analyze_timer'){
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:'2026-11-02T00:00:00.000Z',deadline_ms:60000,observed_at:'2026-11-02T00:00:01.000Z',upper_utc:'2026-11-02T00:00:02.000Z'};
  const base={kind:'worker_deadline',phase:'analysis',supervisor:{},request:{},input:{},point},refs={worker:{},generation:{}};
  const facts=(point==='request_check_unstarted'?{...base,worker_state:'none'}:point==='ready_timer'||point==='ready_reply_check'?{...base,...refs,worker_state:'starting'}:point==='request_check_existing'?{...base,...refs,worker_state:'ready'}:{...base,...refs,worker_state:'ready',id:7,...(point==='send_check'?{allocation:{}}:{job:{}})}) as Extract<SyntheticSoftFacts,{kind:'worker_deadline'}>;
  let check:()=>string|undefined=()=>undefined;const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>check()),b=owner.bind(s),o=owner.observe(b,facts),r=owner.claimRecovery(b,o);
  return {s,facts,owner,b,r,arm:(fn:()=>string|undefined)=>{check=fn;},begin:()=>owner.beginWorkerClosure(b,r)};
}
it('occupies the same recovery slot and marks a sent job terminal before requesting old closure',()=>{
  const f=fixture(),lease=f.begin();expect(Object.keys(lease)).toEqual([]);
  expect(f.owner.inspect()).toMatchObject({recovery_pending:false,worker_closure:{close_requests:1,input_state:'sent_terminal',id_state:'sent_terminal',evidence_pending:false}});
});
it('issues same-generation closure evidence only after termination and fixed cleanup confirmation',()=>{
  const f=fixture(),lease=f.begin(),e=f.owner.settleWorkerClosure(f.b,lease,{context:f.facts,termination:'confirmed',cleanup:'complete'});
  expect(Object.keys(e)).toEqual([]);expect(f.owner.inspect()).toMatchObject({state:'worker_closed',worker_closure:{lease_pending:false,evidence_pending:true,termination:'confirmed',cleanup:'complete'}});
});
it('records no generation without pretending that a close promise confirmed termination',()=>{
  const f=fixture('request_check_unstarted'),lease=f.begin(),e=f.owner.confirmWorkerUnstarted(f.b,lease,f.facts);
  expect(f.owner.inspect()).toMatchObject({worker_closure:{close_requests:0,termination:'not_required',cleanup:'not_required',evidence_pending:true}});expect(Object.keys(e)).toEqual([]);
});
it('consumes the opaque closure once without issuing a new generation or finish authority',()=>{
  const f=fixture(),lease=f.begin(),e=f.owner.settleWorkerClosure(f.b,lease,{context:f.facts,termination:'confirmed',cleanup:'complete'});
  expect(f.owner.consumeWorkerClosure(f.b,e)).toEqual({scope:'synthetic_worker_closure_consumption',authority:'none',closure_kind:'closed_generation',point:'analyze_timer',input_state:'sent_terminal',id_state:'sent_terminal'});
  expect(()=>f.owner.consumeWorkerClosure(f.b,e)).toThrow('internal_review_error');expect(f.owner.inspect().permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});
});
it('does not treat an unfinished old generation as normally closed',()=>{
  const f=fixture();f.begin();expect(()=>f.owner.close(f.b)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{lease_pending:false,evidence_pending:false,termination:'requested'}});
});
type F=ReturnType<typeof fixture>;
function confirm(f:F,lease:object){return f.facts.worker_state==='none'?f.owner.confirmWorkerUnstarted(f.b,lease,{...f.facts}):f.owner.settleWorkerClosure(f.b,lease,{context:{...f.facts},termination:'confirmed',cleanup:'complete'});}
const oracle={request_check_unstarted:[0,'unsent','absent','no_generation'],request_check_existing:[1,'unsent','absent','closed_generation'],ready_timer:[1,'unsent','absent','closed_generation'],ready_reply_check:[1,'unsent','absent','closed_generation'],send_check:[1,'unsent','allocated_unsent','closed_generation'],analyze_timer:[1,'sent_terminal','sent_terminal','closed_generation'],analyze_reply_check:[1,'sent_terminal','sent_terminal','closed_generation']} as const;
it.each(points)('preserves the fixed origin and input/id disposition for %s',point=>{
  const f=fixture(point);let guards=0;f.arm(()=>{guards++;return undefined;});const e=confirm(f,f.begin()),r=f.owner.consumeWorkerClosure(f.b,e),[close_requests,input_state,id_state,closure_kind]=oracle[point];expect(guards).toBe(6);
  expect(r).toEqual({scope:'synthetic_worker_closure_consumption',authority:'none',point,input_state,id_state,closure_kind});
  expect(f.owner.inspect()).toMatchObject({state:'consumed',worker_closure:{close_requests,input_state,id_state,lease_pending:false,evidence_pending:false},time:{started_at:f.s.started_at,deadline_ms:60000,observed_at:f.s.observed_at,upper_utc:f.s.upper_utc},permissions:{recovery_route:false}});
  f.owner.close(f.b);expect(f.owner.inspect().time).toBeNull();
});
it.each(['rejected','unconfirmed','requested','not_started','bogus'])('refuses termination %s even if cleanup is complete',termination=>{
  const f=fixture(),lease=f.begin();expect(()=>f.owner.settleWorkerClosure(f.b,lease,{context:f.facts,termination,cleanup:'complete'})).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{evidence_pending:false,lease_pending:false,termination:['rejected','unconfirmed'].includes(termination)?termination:'unconfirmed',cleanup:'complete'},diagnostics:{soft:{kind:'worker_deadline'},hard:{code:'internal_review_error'}}});
  expect(()=>f.owner.consumeWorkerClosure(f.b,{})).toThrow();
});
it.each(['failed','unconfirmed','requested','not_started','bogus'])('refuses cleanup %s even after confirmed termination',cleanup=>{
  const f=fixture(),lease=f.begin();expect(()=>f.owner.settleWorkerClosure(f.b,lease,{context:f.facts,termination:'confirmed',cleanup})).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({worker_closure:{evidence_pending:false,termination:'confirmed',cleanup:['failed','unconfirmed'].includes(cleanup)?cleanup:'unconfirmed'}});
});
it.each(points.filter(p=>p!=='request_check_unstarted'))('does not accept absence for started origin %s',point=>{
  const f=fixture(point),lease=f.begin();expect(()=>f.owner.confirmWorkerUnstarted(f.b,lease,f.facts)).toThrow('internal_review_error');expect(f.owner.inspect().worker_closure?.evidence_pending).toBe(false);
});
it('does not accept a resolved close as evidence for an unstarted worker',()=>{
  const f=fixture('request_check_unstarted'),lease=f.begin();expect(()=>f.owner.settleWorkerClosure(f.b,lease,{context:f.facts,termination:'confirmed',cleanup:'complete'})).toThrow('internal_review_error');
  expect(f.owner.inspect().worker_closure?.close_requests).toBe(0);
});
it.each(['supervisor','request','input','worker','generation','job','id','point'] as const)('rejects mixed closure context %s despite equal other fields',key=>{
  const f=fixture(),lease=f.begin(),context={...f.facts,[key]:key==='id'?8:key==='point'?'analyze_reply_check':{}};
  expect(()=>f.owner.settleWorkerClosure(f.b,lease,{context,termination:'confirmed',cleanup:'complete'})).toThrow('internal_review_error');expect(f.owner.inspect().worker_closure?.termination).toBe('requested');
});
it.each(['lease','evidence','binding'] as const)('rejects foreign %s without consuming the other owner',kind=>{
  const a=fixture(),b=fixture(),x=a.begin(),y=b.begin();
  if(kind==='lease')expect(()=>a.owner.settleWorkerClosure(a.b,y,{context:a.facts,termination:'confirmed',cleanup:'complete'})).toThrow();
  else if(kind==='binding')expect(()=>a.owner.settleWorkerClosure(b.b,x,{context:a.facts,termination:'confirmed',cleanup:'complete'})).toThrow();
  else{const foreign=confirm(b,y);confirm(a,x);expect(()=>a.owner.consumeWorkerClosure(a.b,foreign)).toThrow();expect(b.owner.consumeWorkerClosure(b.b,foreign).authority).toBe('none');return;}
  expect(b.owner.consumeWorkerClosure(b.b,confirm(b,y)).authority).toBe('none');
});
it.each(['begin','settle','premature_consume','copy_evidence','pending_close','proof_close'] as const)('refuses replay/invalid order %s',step=>{
  const f=fixture(),lease=f.begin();expect(()=>{
    if(step==='begin'){f.begin();return;}if(step==='premature_consume'){f.owner.consumeWorkerClosure(f.b,lease);return;}if(step==='pending_close'){f.owner.close(f.b);return;}
    const proof=confirm(f,lease);if(step==='settle')confirm(f,lease);else if(step==='copy_evidence')f.owner.consumeWorkerClosure(f.b,{...proof});else f.owner.close(f.b);
  }).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{lease_pending:false,evidence_pending:false}});expect(f.begin).toThrow();
});
it.each(points.flatMap(point=>Array.from({length:6},(_,i)=>[point,i+1] as const)))('guard interruption at %s/%i preserves counts and revokes all closure claims',(point,at)=>{
  const f=fixture(point);let n=0;f.arm(()=>++n===at?'cancelled':undefined);expect(()=>f.owner.consumeWorkerClosure(f.b,confirm(f,f.begin()))).toThrow('cancelled');
  const s=f.owner.inspect();expect(s).toMatchObject({state:'failed',diagnostics:{soft:{kind:'worker_deadline',point},hard:{code:'cancelled'}},permissions:{formal_issuance:false,dispatch:false,recovery_route:false}});
  expect(s.worker_closure?.close_requests??0).toBe(at>=2?oracle[point][0]:0);expect(s.worker_closure?.evidence_pending??false).toBe(false);expect(s.worker_closure?.lease_pending??false).toBe(false);expect(n).toBe(at);
});
it.each(['cancelled','deadline_exceeded','worker_unavailable'] as const)('does not consume issued closure after run stop %s',reason=>{
  const f=fixture(),e=confirm(f,f.begin());f.owner.revoke(reason);expect(()=>f.owner.consumeWorkerClosure(f.b,e)).toThrow(reason);
  expect(f.owner.inspect()).toMatchObject({worker_closure:{termination:'confirmed',cleanup:'complete',evidence_pending:false},diagnostics:{hard:{code:reason}}});
});
it.each(['begin','settle','consume'] as const)('rejects captured reentry during %s even for an otherwise valid cleanup lease',step=>{
  const f=fixture();let lease:object|undefined,evidence:object|undefined;if(step!=='begin')lease=f.begin();if(step==='consume')evidence=confirm(f,lease!);
  let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.cleanupLease(f.b);}catch{}}return undefined;});
  expect(()=>step==='begin'?f.begin():step==='settle'?confirm(f,lease!):f.owner.consumeWorkerClosure(f.b,evidence!)).toThrow('internal_review_error');expect(f.owner.inspect().cleanup_pending).toBe(false);
});
it('takes the settle lease and consumption proof before invoking either guard',()=>{
  const f=fixture(),lease=f.begin(),seen:unknown[]=[];f.arm(()=>{const s=f.owner.inspect().worker_closure;seen.push([s?.lease_pending,s?.evidence_pending]);return undefined;});const e=confirm(f,lease);f.owner.consumeWorkerClosure(f.b,e);
  expect(seen).toEqual([[false,false],[false,false],[false,false],[false,false]]);
});
it('does not promote the diagnostic cleanup sink into closure authority',()=>{
  const f=fixture(),sink=f.owner.cleanupLease(f.b);f.owner.recordCleanup(sink,'confirmed');const lease=f.begin();expect(()=>f.owner.consumeWorkerClosure(f.b,lease)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({diagnostics:{cleanup:{status:'confirmed'}},worker_closure:{termination:'requested',evidence_pending:false}});
});
it.each(['event','context','termination'] as const)('refuses proxy/getter input %s without exposing secrets',kind=>{
  const f=fixture(),lease=f.begin();let n=0;const v={context:f.facts,termination:'confirmed',cleanup:'complete'};
  const event=kind==='event'?new Proxy(v,{get(){n++;throw Error('SECRET');}}):kind==='context'?{...v,context:new Proxy(f.facts,{get(){n++;throw Error('SECRET');}})}:Object.defineProperty({...v},'termination',{get(){n++;throw Error('SECRET');}});
  expect(()=>f.owner.settleWorkerClosure(f.b,lease,event)).toThrow('internal_review_error');expect(n).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('does not call terminate/close methods or mutate root time while producing fake evidence',()=>{
  const f=fixture();let n=0;for(const obj of [f.facts.supervisor,(f.facts as {worker:object}).worker])for(const key of ['terminate','close'])Object.defineProperty(obj,key,{get(){n++;throw Error('SECRET');}});
  const before=f.owner.inspect().time;f.owner.consumeWorkerClosure(f.b,confirm(f,f.begin()));expect(n).toBe(0);expect(f.owner.inspect().time).toEqual(before);
});
it('rejects phase origins instead of treating an absent phase worker as worker-timeout evidence',()=>{
  const s=fixture().s,facts={kind:'phase_deadline',phase:'payload',point:'phase_guard',worker_state:'none'} as const,owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s),r=owner.claimRecovery(b,owner.observe(b,facts));
  expect(()=>owner.beginWorkerClosure(b,r)).toThrow('internal_review_error');expect(owner.inspect().worker_closure).toBeNull();
});
it('cannot promote already consumed public recovery data into old-generation evidence',()=>{
  const f=fixture(),data=f.owner.consumeRecovery(f.b,f.r);expect(()=>f.owner.beginWorkerClosure(f.b,data)).toThrow('internal_review_error');expect(f.owner.inspect().worker_closure).toBeNull();
});
it.each(['run','session','source','key','origin','budget','release'] as const)('invalidates closure proof on original %s replacement',key=>{
  const f=fixture(),proof=confirm(f,f.begin());f.s[key]={};expect(()=>f.owner.consumeWorkerClosure(f.b,proof)).toThrow('internal_review_error');expect(f.owner.inspect().worker_closure?.evidence_pending).toBe(false);
});
it('rejects same numeric id with a replacement generation at the final consumption guard',()=>{
  const f=fixture(),proof=confirm(f,f.begin());let n=0;f.arm(()=>{if(++n===2)(f.facts as {generation:object}).generation={};return undefined;});
  expect(()=>f.owner.consumeWorkerClosure(f.b,proof)).toThrow('internal_review_error');expect(f.owner.inspect().worker_closure?.evidence_pending).toBe(false);
});
it('retains a prior cancellation and later diagnostic cleanup failure without restoring evidence',()=>{
  const f=fixture(),sink=f.owner.cleanupLease(f.b),proof=confirm(f,f.begin());f.owner.revoke('cancelled');expect(()=>f.owner.recordCleanup(sink,'failed')).toThrow('cancelled');
  expect(f.owner.inspect()).toMatchObject({diagnostics:{hard:{code:'cancelled'},cleanup:{status:'failed'}},worker_closure:{termination:'confirmed',evidence_pending:false}});expect(()=>f.owner.consumeWorkerClosure(f.b,proof)).toThrow('cancelled');
});
it.each(['supervisor','request','input','point'] as const)('rejects a mixed unstarted context %s before issuing no-generation evidence',key=>{
  const f=fixture('request_check_unstarted'),lease=f.begin(),context={...f.facts,[key]:key==='point'?'request_check_existing':{}};
  expect(()=>f.owner.confirmWorkerUnstarted(f.b,lease,context)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{evidence_pending:false,lease_pending:false}});
});
it('rejects an extra closure event field instead of issuing closed-generation evidence',()=>{
  const f=fixture(),lease=f.begin();expect(()=>f.owner.settleWorkerClosure(f.b,lease,{context:f.facts,termination:'confirmed',cleanup:'complete',extra:true})).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{evidence_pending:false,termination:'requested'}});
});
