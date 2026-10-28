import {expect,it} from 'vitest';
import {createFakeClosedBodyGate} from '../../src/review/abort-scope-evidence-closed-body-gate.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function setup(){let now=0;const gate=createFakeClosedBodyGate({now:()=>now});return {gate,time:(n:number)=>{now=n;}};}
it('binds a fake constructor continuation once but keeps the formal body gate deny-only',()=>{
  const {gate}=setup(),session=get(gate.construct({})),run=get(gate.claimRun(session)),transport=get(gate.claimTransport(session,run));
  expect(get(gate.checkBinding(session,run,transport))).toMatchObject({state:'identity_only',body_gate:'closed',synthetic:true});
  expect(gate.refuseBody(session,run,transport)).toEqual({ok:false,code:'issuance_disabled'});
  expect(gate.diagnostic()).toMatchObject({state:'transport_bound',primary:null,claims:{constructor:'claimed',run:'claimed',transport:'claimed'},body_gate:'closed',receipts_issued:0,evidence_issuance:'disabled',cleanup:{http:'not_started',worker:'not_started'}});
});
it('rejects duplicate generation without replacing a healthy owner or making its original bindings unusable',()=>{
  const {gate}=setup(),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  expect(gate.construct({})).toEqual({ok:false,code:'invalid_state'});expect(gate.claimRun(s)).toEqual({ok:false,code:'invalid_state'});expect(gate.claimTransport(s,r)).toEqual({ok:false,code:'invalid_state'});
  get(gate.checkBinding(s,r,t));expect(gate.diagnostic()).toMatchObject({primary:null,refusal:{stage:'construct',code:'invalid_state'},claims:{constructor:'claimed',run:'claimed',transport:'claimed'}});
});
it('consumes a failing constructor before input evaluation and never repairs it with corrected config',()=>{
  const {gate}=setup();expect(gate.construct({body_gate:'open'})).toEqual({ok:false,code:'invalid_input'});
  expect(gate.construct({})).toEqual({ok:false,code:'invalid_input'});expect(gate.diagnostic()).toMatchObject({primary:{stage:'input',code:'invalid_input'},claims:{constructor:'failed',run:'unclaimed',transport:'unclaimed'},cleanup:{http:'not_started',worker:'not_started'}});
});
it('stops a reentrant constructor before publishing any session handle',()=>{
  let gate:ReturnType<typeof createFakeClosedBodyGate>,nested:unknown;
  gate=createFakeClosedBodyGate({now:()=>0});const raw={get lane(){nested=gate.construct({});return 'typed';}};
  expect(gate.construct(raw)).toEqual({ok:false,code:'invalid_state'});expect(nested).toEqual({ok:false,code:'invalid_state'});
  expect(gate.diagnostic()).toMatchObject({state:'stopped',claims:{constructor:'failed'}});expect(gate.construct({}).ok).toBe(false);
});
it.each(['run','transport'] as const)('rejects reentry while the %s continuation is consuming and keeps the failed claim consumed',kind=>{
  let hook:(()=>void)|undefined;const gate=createFakeClosedBodyGate({now(){const h=hook;hook=undefined;h?.();return 0;}}),s=get(gate.construct({}));
  if(kind==='run'){hook=()=>{gate.claimRun(s);};expect(gate.claimRun(s)).toEqual({ok:false,code:'invalid_state'});expect(gate.claimRun(s).ok).toBe(false);}
  else{const r=get(gate.claimRun(s));hook=()=>{gate.claimTransport(s,r);};expect(gate.claimTransport(s,r)).toEqual({ok:false,code:'invalid_state'});expect(gate.claimTransport(s,r).ok).toBe(false);}
  expect(gate.diagnostic().claims[kind]).toBe('failed');
});
it.each(['construct','run','transport'] as const)('keeps cancellation from a clock callback during %s and publishes no capability',kind=>{
  let hook:(()=>void)|undefined;const gate=createFakeClosedBodyGate({now(){const h=hook;hook=undefined;h?.();return 0;}});
  if(kind==='construct'){hook=()=>{gate.stop('cancelled');};expect(gate.construct({})).toEqual({ok:false,code:'cancelled'});}
  else{const s=get(gate.construct({}));if(kind==='run'){hook=()=>{gate.stop('cancelled');};expect(gate.claimRun(s)).toEqual({ok:false,code:'cancelled'});}
    else{const r=get(gate.claimRun(s));hook=()=>{gate.stop('cancelled');};expect(gate.claimTransport(s,r)).toEqual({ok:false,code:'cancelled'});}}
  gate.close();expect(gate.diagnostic()).toMatchObject({state:'closed',primary:{code:'cancelled'},body_gate:'closed',receipts_issued:0});
});
it.each(['session','run','transport'] as const)('rejects foreign %s without mutating the foreign realm',kind=>{
  const a=setup().gate,b=setup().gate,sa=get(a.construct({})),sb=get(b.construct({})),ra=get(a.claimRun(sa)),rb=get(b.claimRun(sb)),ta=get(a.claimTransport(sa,ra)),tb=get(b.claimTransport(sb,rb));
  const before=b.diagnostic();expect(a.checkBinding(kind==='session'?sb:sa,kind==='run'?rb:ra,kind==='transport'?tb:ta).ok).toBe(false);expect(b.diagnostic()).toEqual(before);
  if(kind==='session'){expect(a.diagnostic().primary).toBeNull();get(a.checkBinding(sa,ra,ta));}
  else expect(a.diagnostic().primary?.code).toBe('evidence_binding_mismatch');
});
it.each(['session','run','transport'] as const)('does not recognize a clone or scalar shape as the %s binding',kind=>{
  const {gate}=setup(),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  expect(gate.checkBinding(kind==='session'?structuredClone(s):s,kind==='run'?structuredClone(r):r,kind==='transport'?({body_gate:'closed'} as never):t).ok).toBe(false);
  expect(gate.diagnostic().receipts_issued).toBe(0);
});
it.each([59999,60000,60001])('checks the original hard deadline at %i before binding checks or a gate refusal',time=>{
  const {gate,time:setTime}=setup(),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));setTime(time);
  expect(gate.refuseBody(s,r,t)).toEqual({ok:false,code:time<60000?'issuance_disabled':'deadline_exceeded'});
  expect(gate.diagnostic().primary?.code).toBe(time<60000?undefined:'deadline_exceeded');expect(gate.diagnostic().receipts_issued).toBe(0);
});
it('keeps a lowered deadline and the constructor origin instead of resetting time at each continuation',()=>{
  let time=20;const gate=createFakeClosedBodyGate({now:()=>time}),s=get(gate.construct({deadline_ms:10}));time=25;const r=get(gate.claimRun(s));time=29;const t=get(gate.claimTransport(s,r));
  get(gate.checkBinding(s,r,t));time=30;expect(gate.refuseBody(s,r,t)).toEqual({ok:false,code:'deadline_exceeded'});
});
it.each(['negative','nonfinite','overflow','exception'] as const)('rejects %s initial clock without publishing a session or exposing a raw error',kind=>{
  const gate=createFakeClosedBodyGate({now(){if(kind==='exception')throw Error('PRIVATE_CLOCK');return kind==='negative'?-1:kind==='nonfinite'?NaN:Number.MAX_VALUE;}});
  expect(gate.construct({}).ok).toBe(false);expect(gate.diagnostic().claims.constructor).toBe('failed');expect(JSON.stringify(gate.diagnostic())).not.toContain('PRIVATE');
});
it.each(['rewind','nonfinite','exception'] as const)('retains %s clock failure through close and later plausible observations',kind=>{
  let now=10,throwing=false;const gate=createFakeClosedBodyGate({now(){if(throwing)throw Error('PRIVATE_CLOCK');return now;}}),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  now=kind==='rewind'?9:kind==='nonfinite'?Infinity:10;throwing=kind==='exception';expect(gate.checkBinding(s,r,t).ok).toBe(false);const first=gate.diagnostic().primary;
  now=11;throwing=false;expect(gate.checkBinding(s,r,t).ok).toBe(false);gate.close();expect(gate.diagnostic().primary).toEqual(first);
});
it('does not give a legacy identity a typed transport continuation or allow switching lanes by reconstructing',()=>{
  const {gate}=setup(),s=get(gate.construct({lane:'legacy'})),r=get(gate.claimRun(s));expect(gate.claimTransport(s,r)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(gate.construct({lane:'typed'}).ok).toBe(false);expect(gate.diagnostic()).toMatchObject({claims:{transport:'failed'},receipts_issued:0});
});
it('preserves first refusal separately from first primary and freezes closed diagnostics against late calls',()=>{
  const {gate}=setup(),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));gate.refuseBody(s,r,t);gate.stop('cancelled');gate.stop(Error('PRIVATE_LATE'));gate.close();const before=gate.diagnostic();
  gate.construct({});gate.claimRun(s);gate.claimTransport(s,r);gate.checkBinding(s,r,t);gate.refuseBody(s,r,t);gate.stop('deadline_exceeded');gate.close();
  expect(gate.diagnostic()).toEqual(before);expect(before).toMatchObject({primary:{code:'cancelled'},refusal:{stage:'gate',code:'issuance_disabled'}});
});
it('does not let modified diagnostic copies or approval-shaped input open the gate',()=>{
  const {gate}=setup(),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),d=gate.diagnostic();
  expect(Object.isFrozen(d)).toBe(true);expect(Object.isFrozen(d.claims)).toBe(true);expect(Object.isFrozen(d.cleanup)).toBe(true);
  expect(Reflect.set(d,'body_gate','open')).toBe(false);const copy=structuredClone(d);Reflect.set(copy,'body_gate','open');
  expect(gate.refuseBody(s,r,t)).toEqual({ok:false,code:'issuance_disabled'});expect(gate.diagnostic().primary).toBeNull();
});
it.each([{gate:'open'},{approved:true},{requests:210},{deadline_ms:60001},{deadline_ms:0},{lane:'active'}])('does not accept approval/cap or raised settings through %j',raw=>{
  const {gate}=setup();expect(gate.construct(raw)).toEqual({ok:false,code:'invalid_input'});expect(gate.diagnostic().receipts_issued).toBe(0);
});
it('provides opaque identity-only handles and no continuation, real-session registration, I/O or receipt API',()=>{
  const {gate}=setup(),s=get(gate.construct({})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r));
  for(const h of [s,r,t]){expect(Object.keys(h)).toEqual([]);expect(Object.getPrototypeOf(h)).toBeNull();expect(Object.isFrozen(h)).toBe(true);expect(JSON.stringify(h)).toBe('{}');}
  for(const name of ['register','adopt','continueRun','continueTransport','dispatch','read','chargePayload','issueBody','consumeBody','open','approve','markReady','bindSource','lease'])expect(Reflect.has(gate,name)).toBe(false);
  gate.stop(Error('PRIVATE_TOKEN_OR_BODY'));expect(gate.diagnostic()).toMatchObject({budget_authority:'identity_only',auth_ready:false,source_binding:'not_connected',primary:{code:'internal_review_error'}});
  expect(JSON.stringify(gate.diagnostic())).not.toContain('PRIVATE');
});
