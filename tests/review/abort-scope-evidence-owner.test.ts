import { expect, it, vi } from 'vitest';
import { createSyntheticScopeOwnerIssuer as issuer } from '../../src/review/abort-scope-evidence-owner.js';
import type { SyntheticScopeOwner, SyntheticScopeUse, SyntheticScopeJob } from '../../src/review/abort-scope-evidence-owner.js';
function ready(i:ReturnType<typeof issuer>,o:SyntheticScopeOwner,u:SyntheticScopeUse,j:SyntheticScopeJob) {
  unwrap(i.finishPrepare(o,unwrap(i.beginPrepare(o,u,j)),j));
  unwrap(i.finishInitial(o,unwrap(i.beginInitial(o,u,j)),j));
  unwrap(i.finishFinal(o,unwrap(i.beginFinal(o,u,j)),j));
  return u;
}
function unwrap<T>(r: {ok:true;value:T}|{ok:false;reason:string}):T {
  if (!r.ok) throw Error(r.reason); return r.value;
}
function setup() {
  const i=issuer(), s=i.issueSession(), w=unwrap(i.issueWorker(s));
  const j=unwrap(i.issueJob(s,w,'a'.repeat(32))),o=unwrap(i.createOwner(s,w));
  return {i,s,w,j,o};
}
it('consumes a synthetic job and receipt once, without serializing identities',()=>{
  const {i,s,w,j,o}=setup(),u=ready(i,o,unwrap(i.reserve(o,j)),j),r=unwrap(i.consume(o,u,j));
  expect(JSON.stringify([s,w,j,o,u,r])).toBe('[{},{},{},{},{},{}]');
  expect(i.accept(o,r)).toEqual({ok:true,value:true});
  expect(i.accept(o,r)).toEqual({ok:false,reason:'invalid_state'});
  expect(i.createOwner(s,w)).toEqual({ok:false,reason:'session_claimed'});
});
it('claims the session even when owner generation fails',()=>{
  const i=issuer(),s=i.issueSession(),other=i.issueSession(),wrong=unwrap(i.issueWorker(other));
  expect(i.createOwner(s,wrong)).toEqual({ok:false,reason:'binding_mismatch'});
  expect(i.createOwner(s,unwrap(i.issueWorker(s)))).toEqual({ok:false,reason:'session_claimed'});
});
it.each(['other_session','other_worker','other_issuer','clone'] as const)('rejects job binding: %s',kind=>{
  const {i,s,w,j,o}=setup();
  let bad=j;
  if(kind==='other_session'){const t=i.issueSession();bad=unwrap(i.issueJob(t,unwrap(i.issueWorker(t)),'b'.repeat(32)));}
  if(kind==='other_worker')bad=unwrap(i.issueJob(s,unwrap(i.issueWorker(s)),'b'.repeat(32)));
  if(kind==='other_issuer')bad=setup().j;
  if(kind==='clone')bad=structuredClone(j);
  expect(i.reserve(o,bad)).toEqual({ok:false,reason:'binding_mismatch'});
  expect(i.reserve(o,j)).toEqual({ok:false,reason:'binding_mismatch'});
  expect(i.createOwner(s,w)).toEqual({ok:false,reason:'session_claimed'});
});
it('rejects another job on consumption and never reopens the consumed claim',()=>{
  const {i,s,w,j,o}=setup(),u=unwrap(i.reserve(o,j));
  const other=unwrap(i.issueJob(s,w,'b'.repeat(32)));
  expect(i.consume(o,u,other)).toEqual({ok:false,reason:'binding_mismatch'});
  expect(i.consume(o,u,j)).toEqual({ok:false,reason:'binding_mismatch'});
});
it('rejects a replacement job for the same selected asset',()=>{
  const {i,s,w,j,o}=setup();unwrap(i.reserve(o,j));
  expect(i.reserve(o,unwrap(i.issueJob(s,w,'a'.repeat(32))))).toEqual({ok:false,reason:'invalid_state'});
});
it('rejects double consumption and revokes an unaccepted receipt',()=>{
  const {i,j,o}=setup(),u=ready(i,o,unwrap(i.reserve(o,j)),j),r=unwrap(i.consume(o,u,j));
  expect(i.consume(o,u,j)).toEqual({ok:false,reason:'invalid_state'});
  expect(i.accept(o,r)).toEqual({ok:false,reason:'invalid_state'});
});
it.each(['cancel','owner_close','session_close','worker_exit'] as const)('revokes pending use and completion at %s',kind=>{
  const {i,s,w,j,o}=setup(),u=ready(i,o,unwrap(i.reserve(o,j)),j),r=unwrap(i.consume(o,u,j));
  if(kind==='cancel')i.cancel(o);
  if(kind==='owner_close'){i.closeOwner(o);i.closeOwner(o);}
  if(kind==='session_close'){i.closeSession(s);i.closeSession(s);}
  if(kind==='worker_exit')i.exitWorker(w);
  expect(i.accept(o,r).ok).toBe(false);expect(i.consume(o,u,j).ok).toBe(false);
  expect(i.createOwner(s,unwrapOrOld(i.issueWorker(s),w)).ok).toBe(false);
});
function unwrapOrOld<T>(r:{ok:true;value:T}|{ok:false},fallback:T):T{return r.ok?r.value:fallback;}
it('rejects forged receipts and preserves the first cancellation reason on close',()=>{
  const {i,j,o}=setup(),u=ready(i,o,unwrap(i.reserve(o,j)),j),r=unwrap(i.consume(o,u,j));
  expect(i.accept(o,structuredClone(r))).toEqual({ok:false,reason:'binding_mismatch'});
  const x=setup();x.i.cancel(x.o);x.i.closeOwner(x.o);
  expect(x.i.reserve(x.o,x.j)).toEqual({ok:false,reason:'cancelled'});
});
it.each([
  ['close_then_cancel','closed'],['exit_then_close','worker_exited'],
  ['exit_then_session_close','worker_exited'],['exit_then_cancel','worker_exited'],
] as const)('keeps the first terminal reason: %s',(kind,reason)=>{
  const {i,s,w,j,o}=setup();
  if(kind==='close_then_cancel'){i.closeOwner(o);i.cancel(o);}
  if(kind==='exit_then_close'){i.exitWorker(w);i.closeOwner(o);i.closeSession(s);}
  if(kind==='exit_then_session_close'){i.exitWorker(w);i.closeSession(s);i.cancel(o);}
  if(kind==='exit_then_cancel'){i.exitWorker(w);i.cancel(o);i.closeOwner(o);}
  expect(i.reserve(o,j)).toEqual({ok:false,reason});
});
it('bounds synthetic issued jobs at 100',()=>{
  const i=issuer(),s=i.issueSession(),w=unwrap(i.issueWorker(s));
  for(let n=0;n<100;n++)unwrap(i.issueJob(s,w,n.toString(16).padStart(32,'0')));
  expect(i.issueJob(s,w,'f'.repeat(32))).toEqual({ok:false,reason:'limit'});
});
it('rejects cloned session/owner/use handles and another owner receipt',()=>{
  const {i,s,w,j,o}=setup();
  expect(i.createOwner(structuredClone(s),w)).toEqual({ok:false,reason:'invalid_session'});
  expect(i.reserve(structuredClone(o),j)).toEqual({ok:false,reason:'binding_mismatch'});
  const u=unwrap(i.reserve(o,j));
  expect(i.consume(o,structuredClone(u),j)).toEqual({ok:false,reason:'binding_mismatch'});
  const x=setup(),r=unwrap(x.i.consume(x.o,ready(x.i,x.o,unwrap(x.i.reserve(x.o,x.j)),x.j),x.j));
  const y=setup();expect(y.i.accept(y.o,r)).toEqual({ok:false,reason:'binding_mismatch'});
});
it('does not migrate a job to a replacement worker generation',()=>{
  const {i,s,w,j,o}=setup();i.exitWorker(w);
  const replacement=unwrap(i.issueWorker(s));
  expect(i.reserve(o,j)).toEqual({ok:false,reason:'worker_exited'});
  expect(i.createOwner(s,replacement)).toEqual({ok:false,reason:'session_claimed'});
});
it('does not call network, timers or clocks',()=>{
  const f=vi.fn(()=>{throw Error('forbidden');});vi.stubGlobal('fetch',f);
  const clock=vi.spyOn(Date,'now').mockImplementation(f),timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(f);
  try{const {i,j,o}=setup();unwrap(i.consume(o,ready(i,o,unwrap(i.reserve(o,j)),j),j));expect(f).not.toHaveBeenCalled();}
  finally{clock.mockRestore();timer.mockRestore();vi.unstubAllGlobals();}
});
