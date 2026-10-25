import { expect, it } from 'vitest';
import { createSyntheticScopeOwnerIssuer as issuer } from '../../src/review/abort-scope-evidence-owner.js';
function get<T>(r:{ok:true;value:T}|{ok:false;reason:string}):T { if(!r.ok)throw Error(r.reason);return r.value; }
function setup(){
  const i=issuer(),s=i.issueSession(),w=get(i.issueWorker(s)),o=get(i.createOwner(s,w));
  const j=get(i.issueJob(s,w,'a'.repeat(32))),u=get(i.reserve(o,j));return {i,s,w,o,j,u};
}
const phases=['prepare','initial','final'] as const;
function methods(i:ReturnType<typeof issuer>,phase:typeof phases[number]){
  return phase==='prepare'?[i.beginPrepare,i.finishPrepare] as const:
    phase==='initial'?[i.beginInitial,i.finishInitial] as const:[i.beginFinal,i.finishFinal] as const;
}
function advance(x:ReturnType<typeof setup>,until:typeof phases[number]){
  for(const p of phases){if(p===until)break;const [begin,finish]=methods(x.i,p);get(finish(x.o,get(begin(x.o,x.u,x.j)),x.j));}
}
it('requires prepare then initial then final completion before consumption',()=>{
  const x=setup();for(const phase of phases){const [begin,finish]=methods(x.i,phase);
    const ticket=get(begin(x.o,x.u,x.j));expect(JSON.stringify(ticket)).toBe('{}');get(finish(x.o,ticket,x.j));}
  get(x.i.accept(x.o,get(x.i.consume(x.o,x.u,x.j))));
});
it.each(['initial','final'] as const)('rejects out-of-order %s and cannot restart',phase=>{
  const x=setup(),[begin]=methods(x.i,phase);
  expect(begin(x.o,x.u,x.j)).toEqual({ok:false,reason:'invalid_state'});
  expect(x.i.beginPrepare(x.o,x.u,x.j)).toEqual({ok:false,reason:'invalid_state'});
});
it.each(phases)('rejects double start while %s is pending',phase=>{
  const x=setup();advance(x,phase);const [begin,finish]=methods(x.i,phase),ticket=get(begin(x.o,x.u,x.j));
  expect(begin(x.o,x.u,x.j)).toEqual({ok:false,reason:'invalid_state'});
  expect(finish(x.o,ticket,x.j)).toEqual({ok:false,reason:'invalid_state'});
});
it.each(phases)('rejects double completion of %s',phase=>{
  const x=setup();advance(x,phase);const [begin,finish]=methods(x.i,phase),ticket=get(begin(x.o,x.u,x.j));
  get(finish(x.o,ticket,x.j));expect(finish(x.o,ticket,x.j)).toEqual({ok:false,reason:'invalid_state'});
  expect(x.i.consume(x.o,x.u,x.j).ok).toBe(false);
});
it.each(phases)('refuses consumption before %s completes',phase=>{
  const x=setup();advance(x,phase);const [begin,finish]=methods(x.i,phase),ticket=get(begin(x.o,x.u,x.j));
  expect(x.i.consume(x.o,x.u,x.j)).toEqual({ok:false,reason:'invalid_state'});
  expect(finish(x.o,ticket,x.j)).toEqual({ok:false,reason:'invalid_state'});
});
it('refuses consumption before prepare starts',()=>{
  const x=setup();expect(x.i.consume(x.o,x.u,x.j)).toEqual({ok:false,reason:'invalid_state'});
});
it.each(phases)('keeps %s failure sticky across close and rejects regeneration',phase=>{
  const x=setup();advance(x,phase);const [begin,finish]=methods(x.i,phase),ticket=get(begin(x.o,x.u,x.j));
  expect(x.i.failPhase(x.o,ticket,x.j)).toEqual({ok:false,reason:'phase_failed'});
  expect(begin(x.o,x.u,x.j)).toEqual({ok:false,reason:'phase_failed'});
  expect(finish(x.o,ticket,x.j)).toEqual({ok:false,reason:'phase_failed'});
  x.i.closeOwner(x.o);expect(x.i.consume(x.o,x.u,x.j)).toEqual({ok:false,reason:'phase_failed'});
  expect(x.i.createOwner(x.s,x.w)).toEqual({ok:false,reason:'session_claimed'});
});
it.each(['clone','wrong_job','wrong_phase','other_issuer'] as const)('rejects completion binding: %s',kind=>{
  const x=setup(),ticket=get(x.i.beginPrepare(x.o,x.u,x.j));
  const bad=kind==='other_issuer'?(()=>{const y=setup();return get(y.i.beginPrepare(y.o,y.u,y.j));})():
    kind==='clone'?structuredClone(ticket):ticket;
  const job=kind==='wrong_job'?get(x.i.issueJob(x.s,x.w,'b'.repeat(32))):x.j;
  const finish=kind==='wrong_phase'?x.i.finishInitial:x.i.finishPrepare;
  expect(finish(x.o,bad,job)).toEqual({ok:false,reason:'binding_mismatch'});
  expect(x.i.finishPrepare(x.o,ticket,x.j)).toEqual({ok:false,reason:'binding_mismatch'});
});
it.each(phases)('rejects pending %s completion after cancellation',phase=>{
  const x=setup();advance(x,phase);const [begin,finish]=methods(x.i,phase),ticket=get(begin(x.o,x.u,x.j));
  x.i.cancel(x.o);expect(finish(x.o,ticket,x.j)).toEqual({ok:false,reason:'cancelled'});
});
it.each(['session','owner','worker'] as const)('rejects pending completion after %s ends',kind=>{
  const x=setup(),ticket=get(x.i.beginPrepare(x.o,x.u,x.j));
  if(kind==='session')x.i.closeSession(x.s);if(kind==='owner')x.i.closeOwner(x.o);if(kind==='worker')x.i.exitWorker(x.w);
  expect(x.i.finishPrepare(x.o,ticket,x.j).ok).toBe(false);
});
