import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts,type SyntheticRecoverySeed} from '../support/review/synthetic-soft-recovery.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z';
const seed=()=>({run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U});
const phase=()=>({kind:'phase_deadline' as const,phase:'payload' as const,point:'phase_guard' as const,worker_state:'none' as const});
const worker=(point:string):SyntheticSoftFacts=>{
  const base={kind:'worker_deadline',phase:'analysis',input:{},request:{},supervisor:{},point};
  if(point==='request_check_unstarted')return {...base,worker_state:'none'} as SyntheticSoftFacts;
  const refs={worker:{},generation:{}};
  if(point==='ready_timer'||point==='ready_reply_check')return {...base,...refs,worker_state:'starting'} as SyntheticSoftFacts;
  if(point==='request_check_existing')return {...base,...refs,worker_state:'ready'} as SyntheticSoftFacts;
  return {...base,...refs,worker_state:'ready',id:7,...(point==='send_check'?{allocation:{}}:{job:{}})} as SyntheticSoftFacts;
};
const points=['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'];
function fixture(facts:SyntheticSoftFacts=phase()){
  const s=seed();let action:()=>string|undefined=()=>undefined;
  const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>action()),b=owner.bind(s);
  return {s,facts,owner,b,arm:(fn:()=>string|undefined)=>{action=fn;},observe:()=>owner.observe(b,{...facts})};
}
it('issues an opaque same-owner observation and keeps soft separate from hard/cleanup',()=>{
  const s=seed(),facts=phase(),owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s),observation=owner.observe(b,facts);
  expect(Object.keys(observation)).toEqual([]);expect(owner.inspect()).toMatchObject({state:'observed',diagnostics:{soft:{kind:'phase_deadline',phase:'payload',point:'phase_guard'},hard:null,cleanup:null}});
});
it('spends observation issuance once and does not erase the soft diagnostic on duplicate failure',()=>{
  const s=seed(),facts=phase(),owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s);owner.observe(b,facts);
  expect(()=>owner.observe(b,facts)).toThrow('internal_review_error');expect(owner.inspect()).toMatchObject({state:'failed',diagnostics:{soft:{kind:'phase_deadline'},hard:{code:'internal_review_error'},cleanup:null}});
});
it('refuses a changed canonical budget even when facts and original binding are reused',()=>{
  const s=seed(),facts=phase(),owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s);s.budget={};
  expect(()=>owner.observe(b,facts)).toThrow('internal_review_error');expect(owner.inspect()).toMatchObject({state:'failed',diagnostics:{soft:null}});
});
it('consumes one observation into one recovery slot and returns no executable route',()=>{
  const s=seed(),facts=phase(),owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s),o=owner.observe(b,facts),claim=owner.claimRecovery(b,o);
  expect(owner.consumeRecovery(b,claim)).toEqual({scope:'synthetic_recovery_consumption',kind:'phase_deadline',phase:'payload',point:'phase_guard',authority:'none'});
  expect(owner.inspect()).toMatchObject({state:'consumed',observation_pending:false,recovery_pending:false,permissions:{recovery_route:false}});
  expect(()=>owner.consumeRecovery(b,claim)).toThrow('internal_review_error');
});
it('records cleanup after cancellation without restoring recovery authority or erasing soft/hard facts',()=>{
  const s=seed(),facts=phase(),owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s),lease=owner.cleanupLease(b),o=owner.observe(b,facts),c=owner.claimRecovery(b,o);
  owner.revoke('cancelled');owner.recordCleanup(lease,'not_required');
  expect(owner.inspect()).toMatchObject({state:'failed',recovery_pending:false,diagnostics:{soft:{kind:'phase_deadline'},hard:{code:'cancelled'},cleanup:{status:'not_required'}}});
  expect(()=>owner.consumeRecovery(b,c)).toThrow('cancelled');
});
it.each(points)('accepts the exact %s origin without inventing another job or generation',point=>{
  const f=fixture(worker(point)),o=f.observe(),c=f.owner.claimRecovery(f.b,o);expect(f.owner.consumeRecovery(f.b,c)).toMatchObject({kind:'worker_deadline',point,authority:'none'});
  expect(f.owner.inspect()).toMatchObject({time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},diagnostics:{hard:null,cleanup:null}});
});
it.each(['metadata','payload','consistency'] as const)('preserves the phase %s with and without a ready worker',p=>{
  for(const ready of [false,true]){const f=fixture(ready?{...phase(),phase:p,worker_state:'ready',supervisor:{},worker:{},generation:{}}:{...phase(),phase:p}),o=f.observe(),c=f.owner.claimRecovery(f.b,o);
    expect(f.owner.consumeRecovery(f.b,c)).toMatchObject({phase:p,point:'phase_guard'});}
});
it.each(['run','session','source','key','origin','budget','release','started_at','deadline_ms','observed_at','upper_utc'] as const)('rejects changed root binding %s at the next operation',key=>{
  const f=fixture();Object.assign(f.s,{[key]:key==='deadline_ms'?59000:key==='started_at'?O:key==='observed_at'?U:key==='upper_utc'?O:{}});
  expect(f.observe).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',observation_pending:false});
});
it.each(['input','request','supervisor','generation','worker','job','id','point','phase','kind','worker_state'] as const)('rejects a foreign observation field %s',key=>{
  const f=fixture(worker('analyze_timer')),v={...f.facts,[key]:key==='id'?8:key==='point'?'analyze_reply_check':key==='phase'?'payload':key==='kind'?'phase_deadline':key==='worker_state'?'starting':{}};
  expect(()=>f.owner.observe(f.b,v)).toThrow('internal_review_error');expect(f.owner.inspect().diagnostics.soft).toBeNull();
});
it('rejects an allocation identity mixed into the unsent-id observation',()=>{
  const f=fixture(worker('send_check'));expect(()=>f.owner.observe(f.b,{...f.facts,allocation:{}})).toThrow('internal_review_error');
});
it.each(['binding','observation','recovery'] as const)('rejects another owner’s %s and leaves that owner usable',kind=>{
  const a=fixture(),b=fixture(),ao=a.observe(),bo=b.observe();
  if(kind==='binding')expect(()=>a.owner.claimRecovery(b.b,ao)).toThrow('internal_review_error');
  if(kind==='observation')expect(()=>a.owner.claimRecovery(a.b,bo)).toThrow('internal_review_error');
  if(kind==='recovery'){a.owner.claimRecovery(a.b,ao);const bc=b.owner.claimRecovery(b.b,bo);expect(()=>a.owner.consumeRecovery(a.b,bc)).toThrow('internal_review_error');expect(b.owner.consumeRecovery(b.b,bc).authority).toBe('none');}
  else expect(b.owner.consumeRecovery(b.b,b.owner.claimRecovery(b.b,bo)).authority).toBe('none');
});
it.each(['observation','recovery'] as const)('rejects a copied %s handle',kind=>{
  const f=fixture(),o=f.observe();if(kind==='observation')expect(()=>f.owner.claimRecovery(f.b,{...o})).toThrow('internal_review_error');
  else{const c=f.owner.claimRecovery(f.b,o);expect(()=>f.owner.consumeRecovery(f.b,{...c})).toThrow('internal_review_error');}
});
it('spends the recovery start claim before failed correlation and never permits reprepare',()=>{
  const f=fixture(),o=f.observe();expect(()=>f.owner.claimRecovery(f.b,{})).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({claims:{recovery_started:true},observation_pending:false,recovery_pending:false});expect(()=>f.owner.claimRecovery(f.b,o)).toThrow('internal_review_error');
});
it('rejects duplicate recovery allocation and preserves the first accepted soft fact',()=>{
  const f=fixture(),o=f.observe();f.owner.claimRecovery(f.b,o);expect(()=>f.owner.claimRecovery(f.b,o)).toThrow('internal_review_error');expect(f.owner.inspect().diagnostics.soft?.kind).toBe('phase_deadline');
});
it.each(['observe','claim','consume'] as const)('blocks %s after synchronous revoke and preserves its reason',step=>{
  const f=fixture(),o=step==='observe'?undefined:f.observe(),c=step==='consume'?f.owner.claimRecovery(f.b,o!):undefined;f.owner.revoke('cancelled');
  expect(()=>step==='observe'?f.observe():step==='claim'?f.owner.claimRecovery(f.b,o!):f.owner.consumeRecovery(f.b,c!)).toThrow('cancelled');
  f.owner.revoke('deadline_exceeded');expect(f.owner.inspect()).toMatchObject({state:'failed',diagnostics:{hard:{code:'cancelled'}},observation_pending:false,recovery_pending:false});
});
it.each(['observe','claim','consume'] as const)('occupies or removes the relevant slot before %s guards',step=>{
  const f=fixture(),o=step==='observe'?undefined:f.observe(),c=step==='consume'?f.owner.claimRecovery(f.b,o!):undefined,seen:unknown[]=[];
  f.arm(()=>{const s=f.owner.inspect();seen.push([s.state,s.observation_pending,s.recovery_pending,s.claims.observation_started,s.claims.recovery_started]);return undefined;});
  if(step==='observe')f.observe();else if(step==='claim')f.owner.claimRecovery(f.b,o!);else f.owner.consumeRecovery(f.b,c!);
  const expected=step==='observe'?['observing',false,false,true,false]:step==='claim'?['claiming',false,false,true,true]:['consuming',false,false,true,true];expect(seen).toEqual([expected,expected]);
});
it.each(Array.from({length:8},(_,i)=>i+1))('independent lifecycle oracle stops at guard %i without route authority',at=>{
  const s=seed(),facts=phase();let n=0;const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>++n===at?'deadline_exceeded':undefined);
  expect(()=>{const b=owner.bind(s),o=owner.observe(b,facts),c=owner.claimRecovery(b,o);owner.consumeRecovery(b,c);}).toThrow('deadline_exceeded');
  expect(owner.inspect()).toMatchObject({state:'failed',observation_pending:false,recovery_pending:false,diagnostics:{hard:{code:'deadline_exceeded'}},permissions:{dispatch:false,recovery_route:false}});
});
it.each(['observe','claim','consume'] as const)('checks identity mutation in the final %s post-guard',step=>{
  const f=fixture(),o=step==='observe'?undefined:f.observe(),c=step==='consume'?f.owner.claimRecovery(f.b,o!):undefined;let n=0;
  f.arm(()=>{if(++n===2)f.s.source={};return undefined;});expect(()=>step==='observe'?f.observe():step==='claim'?f.owner.claimRecovery(f.b,o!):f.owner.consumeRecovery(f.b,c!)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',recovery_pending:false});
});
it('rejects otherwise-valid reentry into cleanup lease allocation, even if its exception is caught',()=>{
  const f=fixture();let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.cleanupLease(f.b);}catch{}}return undefined;});expect(f.observe).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',cleanup_pending:false,observation_pending:false});
});
it('does not disclose raw thrown exceptions, getters or a proxy error',()=>{
  const f=fixture();let calls=0;const e=Object.defineProperty(Error('SECRET_SOURCE_AND_TOKEN'),'code',{get(){calls++;return 'cancelled';}});f.arm(()=>{throw e;});expect(f.observe).toThrow('internal_review_error');expect(calls).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
  const other=fixture();other.owner.revoke(new Proxy(e,{get(){calls++;throw Error();}}));expect(other.owner.inspect().diagnostics.hard?.code).toBe('internal_review_error');expect(calls).toBe(0);
});
it.each(['seed','facts','observed'] as const)('rejects %s accessor/proxy data without executing it',kind=>{
  for(const proxy of [false,true]){let calls=0;const s=seed(),facts=phase(),raw=kind==='seed'?s:facts;
    const bad=proxy?new Proxy(raw,{get(){calls++;throw Error();}}):Object.defineProperty({...raw},kind==='seed'?'budget':'kind',{get(){calls++;throw Error();}});
    const owner=createSyntheticSoftRecoveryIssuer((kind==='seed'?bad:s) as SyntheticRecoverySeed,(kind==='facts'?bad:facts) as SyntheticSoftFacts);
    expect(()=>{const b=owner.bind(s);owner.observe(b,kind==='observed'?bad:facts);}).toThrow('internal_review_error');expect(calls).toBe(0);}
});
it.each([
  {...phase(),job:{},id:1},{...phase(),worker_state:'starting'},worker('unknown'),{...worker('request_check_unstarted'),generation:{}},
  {...worker('ready_timer'),id:1},{...worker('send_check'),job:{}},{...worker('analyze_timer'),allocation:{}},{...worker('analyze_timer'),id:0},
  {...worker('analyze_timer'),id:Number.MAX_SAFE_INTEGER+1},{...phase(),extra:true},'deadline_exceeded',
])('refuses incoherent/unknown fake facts %j before issuing a binding',raw=>{
  const s=seed(),owner=createSyntheticSoftRecoveryIssuer(s,raw as SyntheticSoftFacts);expect(()=>owner.bind(s)).toThrow('internal_review_error');expect(owner.inspect().diagnostics.soft).toBeNull();
});
it.each(['not_started','requested','failed','unconfirmed'] as const)('keeps cleanup=%s separately and blocks further recovery',status=>{
  const f=fixture(worker('analyze_timer')),lease=f.owner.cleanupLease(f.b),o=f.observe();
  expect(()=>f.owner.recordCleanup(lease,status)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({diagnostics:{soft:{kind:'worker_deadline'},hard:{code:'internal_review_error'},cleanup:{status}}});expect(()=>f.owner.claimRecovery(f.b,o)).toThrow('internal_review_error');
});
it('does not let successful cleanup after a hard stop reopen the owner or clear that hard reason',()=>{
  const f=fixture(worker('analyze_timer')),lease=f.owner.cleanupLease(f.b);f.observe();f.owner.revoke('cancelled');f.arm(()=>{throw Error('run guard must not execute');});f.owner.recordCleanup(lease,'confirmed');
  expect(f.owner.inspect()).toMatchObject({state:'failed',diagnostics:{hard:{code:'cancelled'},cleanup:{status:'confirmed'}}});
});
it('keeps cleanup failure alongside an earlier cancellation and never replaces either fact',()=>{
  const f=fixture(worker('ready_timer')),lease=f.owner.cleanupLease(f.b);f.observe();f.owner.revoke('cancelled');expect(()=>f.owner.recordCleanup(lease,'failed')).toThrow('cancelled');
  expect(()=>f.owner.recordCleanup(lease,'confirmed')).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({diagnostics:{hard:{code:'cancelled'},cleanup:{status:'failed'}}});
});
it('refuses cleanup success for a worker that never existed',()=>{
  const f=fixture(),lease=f.owner.cleanupLease(f.b);expect(()=>f.owner.recordCleanup(lease,'confirmed')).toThrow('internal_review_error');expect(f.owner.inspect().diagnostics.cleanup?.status).toBe('unconfirmed');
});
it('refuses cleanup lease duplication, copied/foreign leases, and post-failure lease issuance',()=>{
  const a=fixture(),b=fixture(),al=a.owner.cleanupLease(a.b),bl=b.owner.cleanupLease(b.b);expect(()=>a.owner.recordCleanup(bl,'not_required')).toThrow('internal_review_error');
  a.owner.recordCleanup(al,'not_required');b.owner.recordCleanup(bl,'not_required');expect(()=>b.owner.cleanupLease(b.b)).toThrow('internal_review_error');
  const c=fixture(),cl=c.owner.cleanupLease(c.b);expect(()=>c.owner.recordCleanup({...cl},'not_required')).toThrow('internal_review_error');c.owner.recordCleanup(cl,'not_required');
  const d=fixture();d.owner.revoke('cancelled');expect(()=>d.owner.cleanupLease(d.b)).toThrow('cancelled');
});
it('releases claims and UTC on normal close, retains frozen diagnostic copies, and never reopens',()=>{
  const f=fixture(),o=f.observe(),c=f.owner.claimRecovery(f.b,o),snapshot=f.owner.inspect();f.owner.consumeRecovery(f.b,c);f.owner.close(f.b);f.owner.revoke('cancelled');
  expect(f.owner.inspect()).toMatchObject({state:'closed',time:null,diagnostics:{hard:null},observation_pending:false,recovery_pending:false});expect(snapshot.state).toBe('claimed');expect(Object.isFrozen(snapshot.diagnostics.soft)).toBe(true);
  expect(()=>f.owner.claimRecovery(f.b,o)).toThrow('internal_review_error');expect(f.owner.inspect().state).toBe('closed');
});
it('does not close over a pending cleanup sink and allows its fixed diagnostic to finish after failure',()=>{
  const f=fixture(),lease=f.owner.cleanupLease(f.b);expect(()=>f.owner.close(f.b)).toThrow('internal_review_error');f.owner.recordCleanup(lease,'not_required');expect(f.owner.inspect().diagnostics.cleanup?.status).toBe('not_required');
});
it('discards terminal time only after failure and never permits a second run',()=>{
  const f=fixture();f.observe();f.owner.revoke('cancelled');f.owner.discardTerminalTime();expect(f.owner.inspect()).toMatchObject({time:null,state:'failed'});expect(()=>f.owner.bind(f.s)).toThrow('cancelled');
  const other=fixture();expect(()=>other.owner.discardTerminalTime()).toThrow('internal_review_error');
});
it('matches independent bounded lifecycle counts for all origin cases without creating workers/routes',()=>{
  const variants:SyntheticSoftFacts[]=[phase(),{...phase(),worker_state:'ready',supervisor:{},worker:{},generation:{}},...points.map(worker)];
  for(const facts of variants){const s=seed();let guards=0;const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>{guards++;return undefined;}),b=owner.bind(s),cleanup=owner.cleanupLease(b),o=owner.observe(b,facts),c=owner.claimRecovery(b,o);owner.consumeRecovery(b,c);owner.recordCleanup(cleanup,facts.worker_state==='none'?'not_required':'confirmed');owner.close(b);
    expect(guards).toBe(12);expect(owner.inspect()).toMatchObject({state:'closed',claims:{observation_started:true,recovery_started:true,cleanup_started:true},permissions:{dispatch:false,recovery_route:false,formal_issuance:false}});}
});
it('rejects a copied seed and duplicate binding without reusing an existing root slot',()=>{
  const s=seed(),owner=createSyntheticSoftRecoveryIssuer(s,phase());expect(()=>owner.bind({...s})).toThrow('internal_review_error');
  const f=fixture();expect(()=>f.owner.bind(f.s)).toThrow('internal_review_error');expect(f.owner.inspect().state).toBe('failed');
});
it.each([0,-1,60001,1.5,NaN])('refuses invalid fixed deadline %s',deadline=>{
  const s={...seed(),deadline_ms:deadline},owner=createSyntheticSoftRecoveryIssuer(s,phase());expect(()=>owner.bind(s)).toThrow('internal_review_error');
});
it.each([{observed_at:'2026-11-01T23:59:59.999Z'},{upper_utc:S},{upper_utc:'2026-11-02T00:01:00.001Z'},{started_at:'invalid'}])('refuses invalid fixed UTC order %j',change=>{
  const s={...seed(),...change},owner=createSyntheticSoftRecoveryIssuer(s,phase());expect(()=>owner.bind(s)).toThrow('internal_review_error');
});
it.each(['claim','consume'] as const)('rejects changed expected generation during %s, not only changed observed facts',step=>{
  const expected=worker('analyze_timer'),f=fixture(expected),o=f.observe(),c=step==='consume'?f.owner.claimRecovery(f.b,o):undefined;Object.assign(expected,{generation:{}});
  expect(()=>step==='claim'?f.owner.claimRecovery(f.b,o):f.owner.consumeRecovery(f.b,c!)).toThrow('internal_review_error');
});
it.each(['claim','consume'] as const)('rejects otherwise-valid cleanup allocation reentry during %s',step=>{
  const f=fixture(),o=f.observe(),c=step==='consume'?f.owner.claimRecovery(f.b,o):undefined;let once=false;
  f.arm(()=>{if(!once){once=true;try{f.owner.cleanupLease(f.b);}catch{}}return undefined;});
  expect(()=>step==='claim'?f.owner.claimRecovery(f.b,o):f.owner.consumeRecovery(f.b,c!)).toThrow('internal_review_error');expect(f.owner.inspect().cleanup_pending).toBe(false);
});
it.each([1,2])('does not publish a cleanup diagnostics lease when guard %i cancels',at=>{
  const f=fixture();let n=0;f.arm(()=>++n===at?'cancelled':undefined);expect(()=>f.owner.cleanupLease(f.b)).toThrow('cancelled');
  expect(f.owner.inspect()).toMatchObject({cleanup_pending:false,claims:{cleanup_started:true},diagnostics:{cleanup:null,hard:{code:'cancelled'}}});
});
it.each([1,2])('does not report closed when final close guard %i cancels',at=>{
  const f=fixture();let n=0;f.arm(()=>++n===at?'cancelled':undefined);expect(()=>f.owner.close(f.b)).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({state:'failed',time:{upper_utc:U}});
});
it('records one unconfirmed cleanup snapshot for invalid data without running its getters',()=>{
  const f=fixture(worker('ready_timer')),lease=f.owner.cleanupLease(f.b);let calls=0;const raw={get status(){calls++;return 'confirmed';}};
  expect(()=>f.owner.recordCleanup(lease,raw)).toThrow('internal_review_error');expect(calls).toBe(0);expect(f.owner.inspect().diagnostics.cleanup?.status).toBe('unconfirmed');expect(()=>f.owner.recordCleanup(lease,'confirmed')).toThrow('internal_review_error');
});
it('never reads operations from fake worker/supervisor identities',()=>{
  let calls=0;const identity=Object.defineProperty({},'terminate',{get(){calls++;throw Error('SECRET');}}),facts={...worker('analyze_timer'),worker:identity,supervisor:identity} as SyntheticSoftFacts;
  const f=fixture(facts),o=f.observe(),c=f.owner.claimRecovery(f.b,o);f.owner.consumeRecovery(f.b,c);expect(calls).toBe(0);
});
it('does not accept post-close UTC discard or rewrite the frozen diagnostics snapshot',()=>{
  const f=fixture();f.owner.close(f.b);expect(()=>f.owner.discardTerminalTime()).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'closed',time:null,diagnostics:{hard:null}});
});
it.each(['observe','claim','consume'] as const)('rechecks expected generation at the final %s post-guard',step=>{
  const facts=worker('analyze_timer'),f=fixture(facts),o=step==='observe'?undefined:f.observe(),c=step==='consume'?f.owner.claimRecovery(f.b,o!):undefined;let n=0;
  f.arm(()=>{if(++n===2)Object.assign(facts,{generation:{}});return undefined;});
  expect(()=>step==='observe'?f.observe():step==='claim'?f.owner.claimRecovery(f.b,o!):f.owner.consumeRecovery(f.b,c!)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',recovery_pending:false});
});
it.each([['worker_unavailable','worker_unavailable'],['phase_deadline_exceeded','internal_review_error']] as const)('keeps health-stop %s hard, never promotes it to soft observation',(reason,expected)=>{
  const f=fixture();f.arm(()=>reason);expect(f.observe).toThrow(expected);expect(f.owner.inspect()).toMatchObject({diagnostics:{soft:null,hard:{code:expected}}});
});
it.each([S,O,'2026-11-02T00:01:00.000Z'])('accepts the fixed UTC equality boundary %s without resampling',upper=>{
  const s={...seed(),observed_at:upper===S?S:O,upper_utc:upper},facts=phase(),owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s),o=owner.observe(b,facts),c=owner.claimRecovery(b,o);owner.consumeRecovery(b,c);
  expect(owner.inspect().time).toEqual({started_at:S,deadline_ms:60000,observed_at:s.observed_at,upper_utc:upper});
});
