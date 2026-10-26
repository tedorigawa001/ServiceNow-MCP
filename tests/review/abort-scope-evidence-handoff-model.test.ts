import {expect,it} from 'vitest';
import {createSyntheticOAuthHandoffIssuer} from '../../src/review/abort-scope-evidence-handoff-model.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
const id='a'.repeat(32);
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const frame=()=>({oauth_permit_done:true,phase:'normal',active_io:false,pending_body:false,attempt_timers:0,retained_bytes:0,other_purposes:0,cleanup_unconfirmed:false});
function fixture(deadline=60000){
  let tick=0,reads=0,hook:(()=>void)|undefined,broken=false;
  const api=createSyntheticOAuthHandoffIssuer({now(){reads++;const h=hook;hook=undefined;h?.();if(broken)throw Error('PRIVATE_CLOCK');return tick;}}),
    session=get(api.issueSession({auth_mode:'service-account',deadline_ms:deadline})),run=get(api.createRun(session,{update_set_sys_id:id}));
  const ready=()=>{get(api.completeOAuth(run.root,{outcome:'auth_only',cleanup:'confirmed'}));get(api.settleBootstrap(run.root,frame()));};
  return {api,session,...run,ready,setTime:(n:number)=>{tick=n;},get reads(){return reads;},onRead:(h:()=>void)=>{hook=h;},breakClock:()=>{broken=true;}};
}
it('moves one session-owned claim through ready/offer/adopt with frozen opaque handles and no activation',()=>{
  const x=fixture();expect(get(x.api.status(x.root))).toMatchObject({state:'bootstrap_owned',transport_claimed:true,session_handoff:'none'});
  x.ready();const ticket=get(x.api.offer(x.root));expect(get(x.api.status(x.root))).toMatchObject({state:'offered',session_handoff:'offered'});
  const lease=get(x.api.adopt(x.root,ticket,x.destination));expect(x.api.checkLease(x.root,lease).ok).toBe(true);
  expect(get(x.api.status(x.root))).toMatchObject({state:'source_owned',session_handoff:'adopted',synthetic:true,evidence_issuance:'disabled'});
  for(const h of [x.session,x.root,x.destination,ticket,lease]){expect(Object.isFrozen(h)).toBe(true);expect(JSON.stringify(h)).toBe('{}');}
});
it('stores the creation claim on the session, not just a disposable ticket',()=>{
  const x=fixture();expect(x.api.createRun(x.session,{update_set_sys_id:id})).toEqual({ok:false,code:'invalid_state'});
  expect(get(x.api.status(x.root)).state).toBe('bootstrap_owned');x.ready();get(x.api.offer(x.root));
  expect(x.api.createRun(x.session,{update_set_sys_id:'b'.repeat(32)})).toEqual({ok:false,code:'invalid_state'});
});
it('consumes failed creation so a corrected configuration cannot restart the session',()=>{
  const a=createSyntheticOAuthHandoffIssuer({now:()=>0}),s=get(a.issueSession({auth_mode:'service-account',deadline_ms:60000}));
  expect(a.createRun(s,{update_set_sys_id:'PRIVATE_BAD'})).toEqual({ok:false,code:'invalid_input'});
  expect(a.createRun(s,{update_set_sys_id:id})).toEqual({ok:false,code:'invalid_input'});
});
it('does not register an actual session or accept its scalar-copy identities',()=>{
  const x=fixture(),real=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'DUMMY',oauth:{clientId:'',clientSecret:''}},
    {fetch:async()=>new Response('{}')});
  try{expect(x.api.createRun(real as never,{update_set_sys_id:id})).toEqual({ok:false,code:'evidence_binding_mismatch'});
    expect(x.api.createRun({...x.session} as never,{update_set_sys_id:id}).ok).toBe(false);
  }finally{real.close();}
});
it('refuses per-user enrollment rather than switching its authentication mode',()=>{
  const a=createSyntheticOAuthHandoffIssuer({now:()=>0}),s=get(a.issueSession({auth_mode:'per-user',deadline_ms:60000}));
  expect(a.createRun(s,{update_set_sys_id:id})).toEqual({ok:false,code:'authentication_failed'});expect(a.createRun(s,{update_set_sys_id:id}).ok).toBe(false);
});
it('distinguishes auth-ready from adapter-finally completion and never allows correction after failed offer',()=>{
  const x=fixture();get(x.api.completeOAuth(x.root,{outcome:'auth_only',cleanup:'confirmed'}));
  expect(x.api.offer(x.root)).toEqual({ok:false,code:'invalid_state'});expect(x.api.settleBootstrap(x.root,frame())).toEqual({ok:false,code:'invalid_state'});
});
it.each([
  {oauth_permit_done:false},{phase:'final'},{active_io:true},{pending_body:true},{attempt_timers:1},{retained_bytes:1},{other_purposes:1},{cleanup_unconfirmed:true},
])('rejects a non-idle/non-private bootstrap frame (%j)',patch=>{
  const x=fixture();get(x.api.completeOAuth(x.root,{outcome:'auth_only',cleanup:'confirmed'}));get(x.api.settleBootstrap(x.root,{...frame(),...patch}));
  expect(x.api.offer(x.root)).toEqual({ok:false,code:'invalid_state'});expect(x.api.offer(x.root).ok).toBe(false);
});
it.each(['auth','adapter','budget','dispatcher','ready'] as const)('binds %s identity by reference instead of matching summaries',kind=>{
  const x=fixture();x.ready();get(x.api.simulateIdentityChange(x.root,kind));expect(x.api.offer(x.root)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.api.createRun(x.session,{update_set_sys_id:id}).ok).toBe(false);
});
it.each(['auth','adapter','budget','dispatcher','ready'] as const)('rechecks %s after offer before consuming/adopting',kind=>{
  const x=fixture();x.ready();const t=get(x.api.offer(x.root));get(x.api.simulateIdentityChange(x.root,kind));
  expect(x.api.adopt(x.root,t,x.destination)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(get(x.api.status(x.root))).toMatchObject({state:'failed',session_handoff:'failed'});expect(x.api.offer(x.root).ok).toBe(false);
});
it('rejects cloned/foreign tickets without stopping either existing run',()=>{
  const x=fixture(),y=fixture();x.ready();y.ready();const t=get(x.api.offer(x.root)),u=get(y.api.offer(y.root));
  expect(x.api.adopt(x.root,{...t},x.destination)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.api.adopt(x.root,u,x.destination)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(get(x.api.status(x.root)).state).toBe('offered');expect(get(y.api.status(y.root)).state).toBe('offered');
  expect(x.api.adopt(x.root,t,x.destination).ok).toBe(true);
});
it('consumes the legitimate ticket before rejecting a foreign destination and cannot repair it',()=>{
  const x=fixture(),y=fixture();x.ready();const t=get(x.api.offer(x.root));
  expect(x.api.adopt(x.root,t,y.destination)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.api.adopt(x.root,t,x.destination)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(get(y.api.status(y.root)).state).toBe('bootstrap_owned');
});
it('does not give stale bootstrap calls or duplicate handoffs authority over the source lease',()=>{
  const x=fixture();x.ready();const t=get(x.api.offer(x.root)),l=get(x.api.adopt(x.root,t,x.destination));
  expect(x.api.adopt(x.root,t,x.destination)).toEqual({ok:false,code:'invalid_state'});expect(x.api.offer(x.root)).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.completeOAuth(x.root,{outcome:'auth_only',cleanup:'confirmed'})).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.settleBootstrap(x.root,frame())).toEqual({ok:false,code:'invalid_state'});expect(x.api.closeBootstrap(x.root)).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.checkLease(x.root,l)).toEqual({ok:true,value:true});
});
it.each(['cancel','close','revoke'] as const)('keeps root/session %s authoritative after lease transfer',kind=>{
  const x=fixture();x.ready();const t=get(x.api.offer(x.root)),l=get(x.api.adopt(x.root,t,x.destination));
  if(kind==='revoke')x.api.revokeSession(x.session,'authentication_failed');else x.api[kind](x.root);
  expect(x.api.checkLease(x.root,l)).toEqual({ok:false,code:kind==='revoke'?'authentication_failed':kind==='cancel'?'cancelled':'closed'});
  expect(x.api.createRun(x.session,{update_set_sys_id:id}).ok).toBe(false);
});
it.each(['authentication_failed','upstream_unavailable'] as const)('preserves OAuth primary %s across close/offer/retry',outcome=>{
  const x=fixture();expect(x.api.completeOAuth(x.root,{outcome,cleanup:'confirmed'})).toEqual({ok:false,code:outcome});x.api.close(x.root);
  expect(x.api.offer(x.root)).toEqual({ok:false,code:outcome});expect(get(x.api.status(x.root)).primary).toBe(outcome);
});
it('does not issue a ready generation for cleanup-unconfirmed auth or echo extra secret fields',()=>{
  const x=fixture();expect(x.api.completeOAuth(x.root,{outcome:'auth_only',cleanup:'unconfirmed'})).toEqual({ok:false,code:'internal_review_error'});
  const y=fixture(),r=y.api.completeOAuth(y.root,{outcome:'auth_only',cleanup:'confirmed',token:'PRIVATE_TOKEN'});
  expect(r).toEqual({ok:false,code:'invalid_input'});expect(JSON.stringify([r,get(y.api.status(y.root))])).not.toContain('PRIVATE_TOKEN');
});
it.each([60000,120])('keeps original normal/hard boundaries with deadline %s',deadline=>{
  const x=fixture(deadline);x.ready();x.setTime(deadline*5/6);expect(x.api.offer(x.root)).toEqual({ok:false,code:'phase_deadline_exceeded'});
  const y=fixture(deadline);y.ready();const t=get(y.api.offer(y.root));y.setTime(deadline);expect(y.api.adopt(y.root,t,y.destination)).toEqual({ok:false,code:'deadline_exceeded'});
});
it('rechecks time at the final adoption checkpoint without creating a fresh deadline',()=>{
  const x=fixture();x.ready();const t=get(x.api.offer(x.root));x.onRead(()=>{x.onRead(()=>x.setTime(50000));});
  expect(x.api.adopt(x.root,t,x.destination)).toEqual({ok:false,code:'phase_deadline_exceeded'});
});
it('rechecks cancellation and generation after a reentrant final clock call',()=>{
  const x=fixture();x.ready();const t=get(x.api.offer(x.root));x.onRead(()=>x.onRead(()=>x.api.cancel(x.root)));
  expect(x.api.adopt(x.root,t,x.destination)).toEqual({ok:false,code:'cancelled'});
  const y=fixture();y.ready();const u=get(y.api.offer(y.root));y.onRead(()=>y.onRead(()=>y.api.simulateIdentityChange(y.root,'ready')));
  expect(y.api.adopt(y.root,u,y.destination)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('normalizes clock exceptions and backwards time without printing raw errors',()=>{
  const x=fixture();x.ready();x.breakClock();const r=x.api.offer(x.root);expect(r).toEqual({ok:false,code:'internal_review_error'});expect(JSON.stringify(r)).not.toContain('PRIVATE_CLOCK');
  const y=fixture();y.ready();y.setTime(-1);expect(y.api.offer(y.root)).toEqual({ok:false,code:'invalid_observation_time'});
});
it('never stores an unknown revocation string as a diagnostic code',()=>{
  const x=fixture();x.api.revokeSession(x.session,'PRIVATE_REASON' as never);expect(get(x.api.status(x.root)).primary).toBe('internal_review_error');
  expect(JSON.stringify(get(x.api.status(x.root)))).not.toContain('PRIVATE_REASON');
});
it('keeps closed terminal and preserves the first reason after later cancellation',()=>{
  const x=fixture();x.api.close(x.root);x.api.cancel(x.root);expect(get(x.api.status(x.root))).toMatchObject({state:'closed',primary:'closed'});
});
it('uses bounded synchronous control work and never provides an I/O or activation entry',()=>{
  const x=fixture();x.ready();const before=x.reads,t=get(x.api.offer(x.root));expect(x.reads-before).toBe(2);
  const start=x.reads;get(x.api.adopt(x.root,t,x.destination));expect(x.reads-start).toBe(2);
  for(const name of ['fetch','dispatch','get','activate','issueEvidence'])expect(Object.keys(x.api)).not.toContain(name);
});
