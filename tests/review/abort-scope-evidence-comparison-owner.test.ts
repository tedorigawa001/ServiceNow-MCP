import { expect, it, vi } from 'vitest';
import { createSyntheticScopeOwnerIssuer as issuer } from '../../src/review/abort-scope-evidence-owner.js';
import type { SyntheticScopeComparisonReceipt } from '../../src/review/abort-scope-evidence-owner.js';
import { compareScopeEvidence } from '../../src/review/abort-scope-evidence.js';
import * as comparator from '../../src/review/abort-scope-evidence.js';
function get<T>(r:{ok:true;value:T}|{ok:false;reason:string}):T {if(!r.ok)throw Error(r.reason);return r.value;}
const asset='a'.repeat(32),hash='c'.repeat(64),time='2026-10-25T00:00:00Z';
const context=()=>({instance_binding:hash,update_set_sys_id:'b'.repeat(32),update_xml_sys_id:'c'.repeat(32),
  asset_sys_id:asset,payload_hash:hash,code_hash:hash,started_at:time,deadline_ms:60000});
const payload=()=>({source:'sys_update_xml.payload',target_version:'update_set_payload',asset_table:'sys_script',
  asset_sys_id:asset,payload_hash:hash,code_hash:hash,retrieved_at:'2026-10-25T00:00:01Z',collection:'incident',sys_scope:'global'});
const observation=(phase:'initial'|'final')=>({source:'sys_db_object.current',visibility_scope:'caller_acl',phase,
  observed_at:phase==='initial'?'2026-10-25T00:00:02Z':'2026-10-25T00:00:03Z',state:'rows',
  rows:[{sys_id:'d'.repeat(32),name:'incident',sys_scope:'global',sys_updated_on:time,sys_mod_count:'0'}]});
const at='2026-10-25T00:00:04Z';
function setup(){const i=issuer(),s=i.issueSession(),w=get(i.issueWorker(s)),o=get(i.createOwner(s,w)),
  j=get(i.issueJob(s,w,asset)),u=get(i.reserve(o,j));return {i,s,w,o,j,u};}
function prepare(x:ReturnType<typeof setup>){get(x.i.finishPrepareEvidence(x.o,get(x.i.beginPrepare(x.o,x.u,x.j)),x.j,context(),payload()));}
function ready(initial:unknown=observation('initial'),final:unknown=observation('final')){
  const x=setup();prepare(x);
  get(x.i.finishInitialEvidence(x.o,get(x.i.beginInitial(x.o,x.u,x.j)),x.j,initial));
  get(x.i.finishFinalEvidence(x.o,get(x.i.beginFinal(x.o,x.u,x.j)),x.j,final));return x;
}
it('creates internal evidence and compares/accepts only once',()=>{
  const x=ready(),r=get(x.i.compareAndConsume(x.o,x.u,x.j,at));
  expect(JSON.stringify(r)).toBe('{}');
  const out=get(x.i.acceptComparison(x.o,r));expect(out).toMatchObject({status:'compared',comparison:'same_literal'});
  expect(Object.isFrozen(out)).toBe(true);expect(JSON.stringify(out)).not.toContain(asset);
  expect(x.i.acceptComparison(x.o,r)).toEqual({ok:false,reason:'invalid_state'});
});
it('rejects a second comparison and revokes its pending receipt',()=>{
  const spy=vi.spyOn(comparator,'compareScopeEvidence');
  try {
  const x=ready(),r=get(x.i.compareAndConsume(x.o,x.u,x.j,at));
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at)).toEqual({ok:false,reason:'invalid_state'});
  expect(x.i.acceptComparison(x.o,r)).toEqual({ok:false,reason:'invalid_state'});
  expect(spy).toHaveBeenCalledTimes(1);
  } finally {spy.mockRestore();}
});
it.each(['initial','final'] as const)('retains %s unavailable without converting it to known',phase=>{
  const raw={...observation(phase),state:'unavailable',reason:'final_recheck_unavailable'} as Record<string,unknown>;delete raw.rows;
  const x=ready(phase==='initial'?raw:observation('initial'),phase==='final'?raw:observation('final'));
  const out=get(x.i.acceptComparison(x.o,get(x.i.compareAndConsume(x.o,x.u,x.j,at))));
  expect(out).toMatchObject({status:'insufficient',comparison:'unknown',evidence_phase:phase});
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at).ok).toBe(false);
});
it('retains changed as unknown, not a retryable failed attempt',()=>{
  const final=observation('final');final.rows[0].sys_mod_count='1';const x=ready(observation('initial'),final);
  const out=get(x.i.acceptComparison(x.o,get(x.i.compareAndConsume(x.o,x.u,x.j,at))));
  expect(out).toMatchObject({status:'changed',comparison:'unknown',reason:'table_changed'});
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at).ok).toBe(false);
});
it.each(['asset','hash','context'] as const)('stops on prepare evidence mismatch: %s',kind=>{
  const x=setup(),p=payload(),c=context();if(kind==='asset')c.asset_sys_id='f'.repeat(32);
  if(kind==='hash')p.payload_hash='f'.repeat(64);
  const ticket=get(x.i.beginPrepare(x.o,x.u,x.j));
  const out=x.i.finishPrepareEvidence(x.o,ticket,x.j,kind==='context'?{}:c,p);
  expect(out.ok).toBe(false);expect(x.i.finishPrepareEvidence(x.o,ticket,x.j,context(),payload())).toEqual(out);
  expect(x.i.createOwner(x.s,x.w)).toEqual({ok:false,reason:'session_claimed'});
});
it.each(['initial','final'] as const)('rejects wrong raw phase: %s',phase=>{
  const x=setup();prepare(x);
  if(phase==='final')get(x.i.finishInitialEvidence(x.o,get(x.i.beginInitial(x.o,x.u,x.j)),x.j,observation('initial')));
  const ticket=get(phase==='initial'?x.i.beginInitial(x.o,x.u,x.j):x.i.beginFinal(x.o,x.u,x.j));
  expect((phase==='initial'?x.i.finishInitialEvidence:x.i.finishFinalEvidence)(x.o,ticket,x.j,
    observation(phase==='initial'?'final':'initial'))).toEqual({ok:false,reason:'invalid_phase_order'});
});
it.each(['access_denied','authentication_failed','cancelled','deadline_exceeded'])('does not downgrade %s to unavailable',reason=>{
  const x=setup();prepare(x);const raw={...observation('initial'),state:'unavailable',reason} as Record<string,unknown>;delete raw.rows;
  expect(x.i.finishInitialEvidence(x.o,get(x.i.beginInitial(x.o,x.u,x.j)),x.j,raw)).toEqual({ok:false,reason:'evidence_invalid'});
});
it.each([['invalid','invalid_observation_time'],['2026-10-25T00:01:00Z','comparison_deadline_exceeded']] as const)
('preserves comparison rejection and refuses a corrected retry: %s',(when,reason)=>{
  const x=ready();expect(x.i.compareAndConsume(x.o,x.u,x.j,when)).toEqual({ok:false,reason});
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at)).toEqual({ok:false,reason});
});
it('stops on a table binding rejection instead of issuing a receipt',()=>{
  const raw=observation('final');raw.rows[0].name='task';const x=ready(observation('initial'),raw);
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at)).toEqual({ok:false,reason:'table_binding_mismatch'});
});
it('requires every evidence phase, even when lifecycle-only finishes were accepted',()=>{
  const x=setup();get(x.i.finishPrepare(x.o,get(x.i.beginPrepare(x.o,x.u,x.j)),x.j));
  get(x.i.finishInitial(x.o,get(x.i.beginInitial(x.o,x.u,x.j)),x.j));
  get(x.i.finishFinal(x.o,get(x.i.beginFinal(x.o,x.u,x.j)),x.j));
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at)).toEqual({ok:false,reason:'evidence_missing'});
});
it.each(['initial','final'] as const)('rejects missing %s evidence despite a completed lifecycle',missing=>{
  const x=setup();prepare(x);
  const initial=get(x.i.beginInitial(x.o,x.u,x.j));
  if(missing==='initial')get(x.i.finishInitial(x.o,initial,x.j));
  else get(x.i.finishInitialEvidence(x.o,initial,x.j,observation('initial')));
  const final=get(x.i.beginFinal(x.o,x.u,x.j));
  if(missing==='final')get(x.i.finishFinal(x.o,final,x.j));
  else get(x.i.finishFinalEvidence(x.o,final,x.j,observation('final')));
  expect(x.i.compareAndConsume(x.o,x.u,x.j,at)).toEqual({ok:false,reason:'evidence_missing'});
});
it('stops other jobs and preserves comparison rejection through close',()=>{
  const x=ready(),j=get(x.i.issueJob(x.s,x.w,'b'.repeat(32))),u=get(x.i.reserve(x.o,j));
  expect(x.i.compareAndConsume(x.o,x.u,x.j,'invalid')).toEqual({ok:false,reason:'invalid_observation_time'});
  expect(x.i.beginPrepare(x.o,u,j)).toEqual({ok:false,reason:'invalid_observation_time'});
  x.i.closeOwner(x.o);expect(x.i.compareAndConsume(x.o,x.u,x.j,at)).toEqual({ok:false,reason:'invalid_observation_time'});
});
it.each(['cancel','close','worker'] as const)('revokes comparison receipt after %s',kind=>{
  const x=ready(),r=get(x.i.compareAndConsume(x.o,x.u,x.j,at));
  if(kind==='cancel')x.i.cancel(x.o);if(kind==='close')x.i.closeOwner(x.o);if(kind==='worker')x.i.exitWorker(x.w);
  expect(x.i.acceptComparison(x.o,r).ok).toBe(false);
});
it('rejects copied, cross-owner, lifecycle and raw comparison outputs as receipts',()=>{
  for(const kind of ['clone','other','raw','lifecycle']){
    const x=ready(),r=get(x.i.compareAndConsume(x.o,x.u,x.j,at)),y=ready();
    const bad=kind==='clone'?structuredClone(r):kind==='other'?get(y.i.compareAndConsume(y.o,y.u,y.j,at)):
      kind==='lifecycle'?get(y.i.consume(y.o,y.u,y.j)):
      compareScopeEvidence({} as never,{} as never,{} as never,{} as never,at);
    expect(x.i.acceptComparison(x.o,bad as SyntheticScopeComparisonReceipt)).toEqual({ok:false,reason:'binding_mismatch'});
  }
});
it('snapshots mutable raw fixtures and has no network/clock/timer output',()=>{
  const forbidden=vi.fn(()=>{throw Error('PRIVATE_SECRET');});vi.stubGlobal('fetch',forbidden);
  const clock=vi.spyOn(Date,'now').mockImplementation(forbidden),timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(forbidden);
  const log=vi.spyOn(console,'log').mockImplementation(forbidden);
  try{const raw=observation('initial'),x=ready(raw);raw.rows[0].name='PRIVATE_SECRET';
    const out=get(x.i.acceptComparison(x.o,get(x.i.compareAndConsume(x.o,x.u,x.j,at))));
    expect(out.status).toBe('compared');expect(JSON.stringify(out)).not.toContain('PRIVATE_SECRET');expect(forbidden).not.toHaveBeenCalled();
  }finally{clock.mockRestore();timer.mockRestore();log.mockRestore();vi.unstubAllGlobals();}
});
