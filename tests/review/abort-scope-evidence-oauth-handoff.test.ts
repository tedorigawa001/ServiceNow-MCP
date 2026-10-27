import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FixtureAccountingSession} from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import {createFixtureOAuthSourceTransport,type FixtureHandoffRequest} from '../../src/review/abort-scope-evidence-oauth-handoff.js';
import {createFixtureOAuthBootstrap} from '../../src/review/abort-scope-evidence-oauth-bootstrap.js';
import {fixtureFixedGetRequest} from '../../src/review/abort-scope-evidence-fixed-web-source.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
import * as web from '../../src/review/abort-scope-evidence-web-stream.js';
const id='a'.repeat(32),sessions:FixtureAccountingSession[]=[];
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const token=JSON.stringify({access_token:'PRIVATE_DUMMY_TOKEN',expires_in:3600,token_type:'Bearer',refresh_token:'PRIVATE_REFRESH'});
const parent=JSON.stringify({result:[{sys_id:id,sys_updated_on:'2026-10-27',sys_mod_count:'1'}]});
function session(limits:ConstructorParameters<typeof FixtureAccountingSession>[0]={}){const s=new FixtureAccountingSession(limits,{oauthBootstrap:true});sessions.push(s);return s;}
function setup(source:(r:FixtureHandoffRequest,s:AbortSignal)=>Response|Promise<Response>=r=>new Response(r.method==='POST'?token:parent),s=session()){
  return {s,api:get(createFixtureOAuthSourceTransport(s,id,source))};
}
async function adopted(x=setup()){
  get(await x.api.bootstrap.run());const ticket=get(x.api.root.offer());return {...x,ticket,lane:get(x.api.root.adopt(ticket))};
}
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('UNEXPECTED_FETCH');});});
afterEach(()=>{sessions.splice(0).forEach(s=>s.close());expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();vi.restoreAllMocks();});
it('uses one adapter/dispatcher and one session claim across POST→GET, with a zero-cost ownership switch',async()=>{
  const factory=vi.spyOn(web,'createFixtureOAuthWebStreamTransport');
  const calls:FixtureHandoffRequest[]=[],x=setup(r=>{calls.push(r);return new Response(r.method==='POST'?token:parent);});
  get(await x.api.bootstrap.run());const before=x.api.stats(),ticket=get(x.api.root.offer()),lane=get(x.api.root.adopt(ticket)),after=x.api.stats();
  expect(after).toMatchObject({requests:1,received_bytes:Buffer.byteLength(token),payload_bytes:0,evidence_bytes:0,reserved:4,
    reads:before.reads,cancels:before.cancels,releases:before.releases,aborts:before.aborts,timers:0,retained_bytes:0,state:'source_owned'});
  expect(calls).toHaveLength(1);expect(get(await lane.probeParent())).toEqual({outcome:'body',synthetic:true,evidence_issuance:'disabled'});
  expect(factory).toHaveBeenCalledTimes(1);
  expect(calls).toEqual([{method:'POST',path:'/oauth_token.do',grant_type:'client_credentials',ordinal:1,synthetic:true},
    fixtureFixedGetRequest(id,{purpose:'parent_initial',ordinal:1,synthetic:true})]);
  expect(x.api.stats()).toMatchObject({requests:2,received_bytes:Buffer.byteLength(token)+Buffer.byteLength(parent),reserved:4,timers:0,retained_bytes:0});
  expect(createFixtureOAuthSourceTransport(x.s,id,()=>new Response(token)).ok).toBe(false);
  expect(createFixtureOAuthBootstrap(x.s,()=>new Response(token)).ok).toBe(false);
  expect(JSON.stringify([before,after,await lane.probeParent()])).not.toMatch(/PRIVATE_|access_token|refresh_token/);
  expect(Object.keys(x.api)).toEqual(['bootstrap','root','stats']);expect(Object.keys(lane)).toEqual(['probeParent','close']);
});
it.each([429,503])('keeps retry C/G and prior diagnostics after a cleaned-up OAuth %s',async status=>{
  let c=0,g=0;const x=setup(r=>{const body=c++===0?'PRIVATE_RETRY':r.method==='POST'?token:parent;g+=Buffer.byteLength(body);return new Response(body,{status:c===1?status:200});});
  const a=await adopted(x);get(await a.lane.probeParent());
  expect(c).toBe(3);expect(a.api.stats()).toMatchObject({requests:c,received_bytes:g,reserved:4,diagnostic:{last_failure:{code:'upstream_unavailable',retryable:true}}});
  expect(JSON.stringify(a.api.stats())).not.toContain('PRIVATE_RETRY');
});
it('shares Response identity rejection across the owner switch instead of making a second adapter',async()=>{
  const response=new Response(token),x=await adopted(setup(()=>response));
  expect(await x.lane.probeParent()).toMatchObject({ok:false});expect(x.api.stats()).toMatchObject({cleanup_unconfirmed:true,requests:2});
  expect(x.api.root.offer().ok).toBe(false);
});
it('shares stream identity rejection even for a fresh Response wrapper',async()=>{
  const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(token));c.close();}});
  // The native Response constructor refuses a disturbed stream before the adapter can see it.
  // A hostile fixture wrapper deliberately presents it through a body getter instead.
  const x=await adopted(setup(()=>{const response=new Response(null);Object.defineProperty(response,'body',{value:body});return response;}));
  expect(await x.lane.probeParent()).toMatchObject({ok:false});
  expect(x.api.stats()).toMatchObject({cleanup_unconfirmed:true});
});
it('refuses old bootstrap operations and duplicate tickets without stopping the adopted source',async()=>{
  const x=await adopted();expect(await x.api.bootstrap.run()).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.bootstrap.close()).toEqual({ok:false,code:'invalid_state'});expect(x.api.bootstrap.cancel()).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.root.offer()).toEqual({ok:false,code:'invalid_state'});expect(x.api.root.adopt(x.ticket)).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.root.adopt({...x.ticket})).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect((await x.lane.probeParent()).ok).toBe(true);expect(x.api.stats().primary).toBeNull();
});
it('does not accept another run ticket or scalar/clone, or poison either source',async()=>{
  const x=setup(),y=setup();get(await x.api.bootstrap.run());get(await y.api.bootstrap.run());
  const tx=get(x.api.root.offer()),ty=get(y.api.root.offer());
  expect(y.api.root.adopt(tx)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.api.root.adopt({...tx})).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect((await get(x.api.root.adopt(tx)).probeParent()).ok).toBe(true);
  expect((await get(y.api.root.adopt(ty)).probeParent()).ok).toBe(true);
});
it.each(['cancel','close','session'] as const)('root %s remains authoritative after transfer and blocks the next GET',async kind=>{
  const source=vi.fn((r:FixtureHandoffRequest)=>new Response(r.method==='POST'?token:parent)),x=await adopted(setup(source));
  if(kind==='session')x.s.close();else x.api.root[kind]();
  expect(await x.lane.probeParent()).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(source).toHaveBeenCalledTimes(1);expect(x.api.root.adopt(x.ticket).ok).toBe(false);
});
it.each(['cancel','close','session'] as const)('stops %s while source read is pending and releases once',async kind=>{
  const cancel=vi.fn(),x=await adopted(setup(r=>r.method==='POST'?new Response(token):new Response(new ReadableStream({pull(){},cancel}))));
  const work=x.lane.probeParent();for(let n=0;n<8;n++)await Promise.resolve();
  if(kind==='session')x.s.close();else x.api.root[kind]();
  await vi.advanceTimersByTimeAsync(1000);expect(await work).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(cancel).toHaveBeenCalledTimes(1);expect(x.api.stats()).toMatchObject({timers:0,retained_bytes:0,active:false});
});
it('never offers while OAuth I/O is pending, then rejects repeated or concurrent bootstrap without new dispatch',async()=>{
  let resolve!:(r:Response)=>void;const source=vi.fn(()=>new Promise<Response>(r=>{resolve=r;})),x=setup(source),work=x.api.bootstrap.run();
  expect(x.api.root.offer()).toEqual({ok:false,code:'invalid_state'});expect(await x.api.bootstrap.run()).toEqual({ok:false,code:'invalid_state'});
  resolve(new Response(token));get(await work);const ticket=get(x.api.root.offer());get(x.api.root.adopt(ticket));expect(source).toHaveBeenCalledTimes(1);
});
it('does not infer finally/ready from inside the injected callback',async()=>{
  let result:unknown;const x=setup(()=>{result=x.api.root.offer();return new Response(token);});
  get(await x.api.bootstrap.run());expect(result).toEqual({ok:false,code:'invalid_state'});expect(x.api.root.offer().ok).toBe(true);
});
it('checks actual adapter finally separately from machine auth readiness',async()=>{
  let during:unknown;let api:Extract<ReturnType<typeof web.createFixtureOAuthWebStreamTransport>,{ok:true}>['value'];
  api=get(web.createFixtureOAuthWebStreamTransport(session(),()=>{during=api.handoffCheckpoint();return new Response(token);}));
  const m=api.machine,p=get(m.purpose('oauth',{source:m.source,phase:m.phase()}));get(await api.run(p));
  expect(during).toEqual({ok:false,code:'invalid_state'});expect(api.handoffCheckpoint()).toEqual({ok:true,value:true});
  const parentPermit=get(m.purpose('parent_initial',{source:m.source,phase:m.phase()}));
  get(await api.run(parentPermit));expect(m.stats().body_pending).toBe(true);
  expect(api.handoffCheckpoint()).toEqual({ok:false,code:'invalid_state'});
});
it.each(['cancel','close'] as const)('does not commit an adoption if the final clock reenters root %s',async kind=>{
  const x=setup();get(await x.api.bootstrap.run());const ticket=get(x.api.root.offer()),now=performance.now.bind(performance);
  vi.spyOn(performance,'now').mockImplementationOnce(()=>{x.api.root[kind]();return now();});
  expect(x.api.root.adopt(ticket)).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(x.api.stats()).toMatchObject({requests:1,state:kind==='close'?'closed':'failed'});
  expect(x.api.root.adopt(ticket).ok).toBe(false);
});
it('does not make a clean lease out of OAuth cleanup uncertainty',async()=>{
  const x=setup(()=>new Response(new ReadableStream({pull(){},cancel:()=>new Promise(()=>{})}),{status:401}),session({requestTimeoutMs:1000}));
  const work=x.api.bootstrap.run();await vi.advanceTimersByTimeAsync(1000);
  const result=await work;expect(result.ok).toBe(false);expect(x.api.stats()).toMatchObject({cleanup_unconfirmed:true,requests:1});
  expect(x.api.root.offer().ok).toBe(false);expect(await x.api.bootstrap.run()).toEqual(result);
});
it.each([400,401,403,503])('keeps OAuth failure %s and never offers or dispatches GET',async status=>{
  const source=vi.fn(()=>new Response('{}',{status})),x=setup(source),r=await x.api.bootstrap.run();
  expect(r).toEqual({ok:false,code:status===503?'upstream_unavailable':'authentication_failed'});
  expect(x.api.root.offer()).toEqual(r);expect(await x.api.bootstrap.run()).toEqual(r);
  expect(source).toHaveBeenCalledTimes(status===503?2:1);x.api.root.close();expect(x.api.stats().primary).toBe(r.ok?null:r.code);
});
it.each([100,60000])('keeps the original normal/hard deadline with deadlineMs=%s',async deadlineMs=>{
  const x=setup(undefined,session({deadlineMs,requestTimeoutMs:Math.min(1000,deadlineMs)}));get(await x.api.bootstrap.run());const ticket=get(x.api.root.offer());
  await vi.advanceTimersByTimeAsync(Math.ceil(deadlineMs*5/6));expect(x.api.root.adopt(ticket)).toEqual({ok:false,code:'phase_deadline_exceeded'});
  expect(x.api.stats().requests).toBe(1);expect(x.api.root.offer().ok).toBe(false);
  const y=await adopted(setup(undefined,session({deadlineMs,requestTimeoutMs:Math.min(1000,deadlineMs)})));
  await vi.advanceTimersByTimeAsync(deadlineMs);expect(await y.lane.probeParent()).toEqual({ok:false,code:'deadline_exceeded'});
});
it('fails an invalid configuration after claim and never repairs or reenrolls that session',()=>{
  const s=session(),source=vi.fn(()=>new Response(token));
  expect(createFixtureOAuthSourceTransport(s,'INVALID',source)).toEqual({ok:false,code:'invalid_input'});
  expect(createFixtureOAuthSourceTransport(s,id,source).ok).toBe(false);expect(createFixtureOAuthBootstrap(s,source).ok).toBe(false);expect(source).not.toHaveBeenCalled();
});
it('rejects real and per-user sessions before any I/O',()=>{
  const source=vi.fn(()=>new Response(token)),user=new FixtureAccountingSession();sessions.push(user);
  const real=new BoundedReadSession({instanceUrl:'https://fixture.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'',clientSecret:''}},{fetch:async()=>new Response('{}')});
  try{expect(createFixtureOAuthSourceTransport(real,id,source)).toEqual({ok:false,code:'evidence_binding_mismatch'});
    expect(createFixtureOAuthSourceTransport(user,id,source).ok).toBe(false);expect(source).not.toHaveBeenCalled();}finally{real.close();}
});
it.each(['oauth','payload','release_rows'] as const)('does not turn %s into an arbitrary GET route',purpose=>{
  expect(()=>fixtureFixedGetRequest(id,{purpose,ordinal:1,synthetic:true})).toThrow('invalid_state');
});
it.each(['incident^ORname=secret','global','https://secret.invalid','INCIDENT'])('rejects malformed table %s before descriptor dispatch',target=>{
  expect(()=>fixtureFixedGetRequest(id,{purpose:'table_initial',target,ordinal:1,synthetic:true})).toThrow('invalid_state');
});
it('retains no injected exception or secret in the result/diagnostic and keeps the gate closed',async()=>{
  const x=setup(()=>{throw Error('PRIVATE_DUMMY_TOKEN');});const result=await x.api.bootstrap.run();
  expect(result.ok).toBe(false);expect(x.api.stats().evidence_issuance).toBe('disabled');
  expect(JSON.stringify([result,x.api.stats()])).not.toMatch(/PRIVATE_|stack|access_token|refresh_token/);
});
it('keeps source close authoritative without granting a new bootstrap or invoking global fetch',async()=>{
  const x=await adopted();expect(x.lane.close()).toEqual({ok:false,code:'closed'});
  expect(await x.lane.probeParent()).toEqual({ok:false,code:'closed'});expect(await x.api.bootstrap.run()).toEqual({ok:false,code:'closed'});
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
