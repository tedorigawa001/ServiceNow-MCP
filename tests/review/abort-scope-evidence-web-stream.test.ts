import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FixtureAccountingSession } from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import { createFakeSessionOwnerIssuer } from '../../src/review/abort-scope-evidence-session-fixture.js';
import { createFixtureWebStreamTransport } from '../../src/review/abort-scope-evidence-web-stream.js';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';
const sessions:FixtureAccountingSession[]=[];
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{sessions.splice(0).forEach(s=>s.close());expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();vi.restoreAllMocks();});
async function setup(source:Parameters<typeof createFixtureWebStreamTransport>[2],limits:ConstructorParameters<typeof FixtureAccountingSession>[0]={}){
  const session=new FixtureAccountingSession(limits);sessions.push(session);await session.baseline('{}',()=>{});
  const f=createFakeSessionOwnerIssuer(),s=get(f.source(session,{parent_ready:true,final_started:false,release_match:'matched'})),owner=get(f.claim(session,s.source,s.permit));
  const api=get(createFixtureWebStreamTransport(session,owner,source)),m=api.machine;
  const permit=get(m.purpose('metadata_initial',{source:m.source,phase:m.phase()}));return {session,owner,api,m,permit};
}
it('reads a real Response stream through one accounting owner and releases its EOF lock',async()=>{
  const response=new Response('{"result":[]}'),x=await setup(()=>response),result=get(await x.api.run(x.permit));
  expect(result.outcome).toBe('body');expect(get(x.m.cleanupInfo(result.cleanup))).toMatchObject({disposition:'confirmed',kind:'eof'});
  expect(response.body!.locked).toBe(false);expect(x.session.stats()).toMatchObject({requests:2,received_bytes:15});
  expect(get(x.m.consumeBody(result.body!,x.permit)).bytes).toBe(13);expect(x.m.issueEvidence().ok).toBe(false);
  expect(x.api.stats()).toMatchObject({reads:2,cancels:0,releases:1,active:false,timers:0,retained_bytes:0});
});
it('bounds total empty reads, including empties separated by non-empty chunks, without retry',async()=>{
  const stream=new ReadableStream<Uint8Array>({start(c){for(let i=0;i<17;i++){c.enqueue(new Uint8Array([32]));c.enqueue(new Uint8Array());}c.enqueue(Buffer.from('{}'));c.close();}});
  const x=await setup(()=>new Response(stream)),r=get(await x.api.run(x.permit));
  expect(r.outcome).toBe('invalid_response');expect(r.body).toBeNull();expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('confirmed');
  expect(x.api.stats()).toMatchObject({requests:2,reads:34,cancels:1,releases:1,timers:0});expect(x.m.begin(x.permit).ok).toBe(false);
});
it('does not certify a pending cancel merely because read and closed already settled',async()=>{
  let finishCancel!:()=>void;const cancel=vi.fn(()=>new Promise<void>(resolve=>{finishCancel=resolve;}));
  const response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel})),x=await setup(()=>response);
  let done=false;const pending=x.api.run(x.permit).then(r=>{done=true;return r;});
  await vi.advanceTimersByTimeAsync(9750);expect(cancel).toHaveBeenCalledTimes(1);expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(250);const result=get(await pending),cleanup=get(x.m.cleanupInfo(result.cleanup));
  expect(cleanup).toMatchObject({disposition:'unconfirmed',reason:'cleanup_deadline'});expect(result.body).toBeNull();
  expect(x.api.stats()).toMatchObject({timers:0,active:false,retained_bytes:0,cleanup_unconfirmed:true});
  finishCancel();await vi.advanceTimersByTimeAsync(0);
  expect(get(x.m.cleanupInfo(result.cleanup))).toEqual(cleanup);expect(cancel).toHaveBeenCalledTimes(1);expect(x.m.issueEvidence().ok).toBe(false);
});
it('confirms cancelled cleanup only after cancel settles within the original deadline',async()=>{
  let finishCancel!:()=>void;const response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel(){return new Promise<void>(r=>{finishCancel=r;});}}));
  const x=await setup(()=>response),pending=x.api.run(x.permit);await vi.advanceTimersByTimeAsync(9800);finishCancel();await vi.advanceTimersByTimeAsync(0);
  const result=get(await pending);expect(result.outcome).toBe('upstream_unavailable');expect(result.body).toBeNull();
  expect(get(x.m.cleanupInfo(result.cleanup))).toMatchObject({disposition:'confirmed',kind:'cancelled'});expect(response.body!.locked).toBe(false);
  expect(x.api.stats()).toMatchObject({cancels:1,releases:1,timers:0,active:false});
});
it.each([401,403,404])('does not read a terminal HTTP %s body and observes cancellation',async status=>{
  const cancel=vi.fn(),response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel}),{status}),x=await setup(()=>response);
  const r=get(await x.api.run(x.permit));expect(r.body).toBeNull();expect(cancel).toHaveBeenCalledTimes(1);
  expect(x.api.stats()).toMatchObject({reads:0,cancels:1,releases:0,received_bytes:2,timers:0});
  expect(get(x.m.cleanupInfo(r.cleanup))).toMatchObject({disposition:'confirmed',kind:'cancelled'});
  expect(x.m.stats().primary).toBe(status===401?'authentication_failed':status===403?'access_denied':null);
});
it('keeps a rejected cancel unconfirmed and never leaks the rejection',async()=>{
  const response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel(){return Promise.reject(Error('PRIVATE_CANCEL'));}}),{status:404});
  const x=await setup(()=>response),r=get(await x.api.run(x.permit));expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('unconfirmed');
  expect(JSON.stringify(r)).not.toContain('PRIVATE_CANCEL');expect(x.api.stats()).toMatchObject({cancels:1,cleanup_unconfirmed:true,timers:0});
});
it('refuses an already locked body without taking or releasing its foreign reader',async()=>{
  const response=new Response('{}'),foreign=response.body!.getReader(),x=await setup(()=>response),pending=x.api.run(x.permit);
  await vi.advanceTimersByTimeAsync(9750);const r=get(await pending);expect(r.body).toBeNull();expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('unconfirmed');
  expect(x.api.stats()).toMatchObject({reads:0,cancels:0,releases:0});expect(response.body!.locked).toBe(true);foreign.releaseLock();
});
it.each(['sync','async'] as const)('counts a %s source rejection once and permits only a cleaned-up retry',async mode=>{
  let n=0;const source=vi.fn(()=>{if(n++===0){if(mode==='sync')throw Error('PRIVATE_SOURCE');return Promise.reject(Error('PRIVATE_SOURCE'));}return new Response('{}');});
  const x=await setup(source),r=get(await x.api.run(x.permit));expect(r.outcome).toBe('upstream_unavailable');expect(get(x.m.cleanupInfo(r.cleanup)).kind).toBe('no_response');
  const next=get(await x.api.run(x.permit));expect(next.outcome).toBe('body');expect(x.api.stats()).toMatchObject({requests:3,received_bytes:4,timers:0});
  expect(source).toHaveBeenCalledTimes(2);expect(JSON.stringify(r)).not.toContain('PRIVATE_SOURCE');
});
it('distinguishes absent body from a received empty JSON body',async()=>{
  const x=await setup(()=>new Response(null,{status:204})),r=get(await x.api.run(x.permit));
  expect(r.outcome).toBe('invalid_response');expect(get(x.m.cleanupInfo(r.cleanup))).toMatchObject({disposition:'confirmed',kind:'no_body'});
  expect(x.api.stats()).toMatchObject({reads:0,cancels:0,releases:0,received_bytes:2});
});
it('decodes split UTF-8 only after EOF without returning source text',async()=>{
  const raw=Buffer.from('"界"'),stream=new ReadableStream<Uint8Array>({start(c){for(const b of raw)c.enqueue(new Uint8Array([b]));c.close();}});
  const x=await setup(()=>new Response(stream)),r=get(await x.api.run(x.permit));expect(r.outcome).toBe('body');
  expect(get(x.m.consumeBody(r.body!,x.permit)).bytes).toBe(raw.length);expect(JSON.stringify(r)).not.toContain('界');expect(x.api.stats().reads).toBe(raw.length+1);
});
it.each(['utf8','json'] as const)('does not issue a receipt for invalid %s after successful cleanup',async kind=>{
  const x=await setup(()=>new Response(kind==='utf8'?new Uint8Array([0xff]):'{PRIVATE_BAD_JSON')),r=get(await x.api.run(x.permit));
  expect(r.outcome).toBe('invalid_response');expect(r.body).toBeNull();expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('confirmed');
  expect(JSON.stringify(r)).not.toContain('PRIVATE_BAD_JSON');expect(x.api.stats()).toMatchObject({retained_bytes:0,timers:0});
});
it('keeps an errored reader unconfirmed, observes rejections and releases its owned lock best-effort',async()=>{
  const response=new Response(new ReadableStream<Uint8Array>({start(c){c.error(Error('PRIVATE_READ'));}})),x=await setup(()=>response),r=get(await x.api.run(x.permit));
  expect(r.body).toBeNull();expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('unconfirmed');expect(response.body!.locked).toBe(false);
  expect(JSON.stringify(r)).not.toContain('PRIVATE_READ');expect(x.api.stats()).toMatchObject({cleanup_unconfirmed:true,timers:0,releases:1});
});
it('charges an oversized chunk before rejecting it and does not copy the excess into scratch',async()=>{
  const x=await setup(()=>new Response('{}  ',{headers:{'content-length':'1'}}),{responseBytes:3}),r=get(await x.api.run(x.permit));
  expect(r.body).toBeNull();expect(x.m.stats().primary).toBe('receive_budget_exceeded');
  expect(x.api.stats()).toMatchObject({received_bytes:6,peak_retained_bytes:0,retained_bytes:0,timers:0});
});
it('keeps a table-specific overshoot local after real cancel/closed/lock cleanup',async()=>{
  const response=new Response(' '.repeat(16385)),x=await setup(()=>response),p=get(x.m.purpose('table_initial',{source:x.m.source,phase:x.m.phase(),target:'incident'})),r=get(await x.api.run(p));
  expect(r.outcome).toBe('scope_evidence_limit');expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('confirmed');expect(x.m.stats().primary).toBeNull();
  expect(x.api.stats()).toMatchObject({evidence_bytes:16385,received_bytes:16387,peak_retained_bytes:0,timers:0});expect(response.body!.locked).toBe(false);
});
it('does not resurrect a timed-out fetch and cancels a late Response exactly once',async()=>{
  let deliver!:(r:Response)=>void;const source=vi.fn(()=>new Promise<Response>(resolve=>{deliver=resolve;})),x=await setup(source),pending=x.api.run(x.permit);
  await vi.advanceTimersByTimeAsync(10000);const r=get(await pending),cleanup=get(x.m.cleanupInfo(r.cleanup));expect(cleanup.disposition).toBe('unconfirmed');
  const cancel=vi.fn(),late=new Response(new ReadableStream<Uint8Array>({pull(){},cancel}));deliver(late);await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledTimes(1);expect(get(x.m.cleanupInfo(r.cleanup))).toEqual(cleanup);expect(x.api.stats()).toMatchObject({received_bytes:2,reads:0,cancels:1,timers:0,retained_bytes:0});
  expect(x.m.begin(x.permit).ok).toBe(false);expect(source).toHaveBeenCalledTimes(1);
});
it.each(['cancel','close'] as const)('observes real cleanup after fixture %s without reopening body issuance',async mode=>{
  const cancel=vi.fn(),response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel})),x=await setup(()=>response),pending=x.api.run(x.permit);
  await vi.advanceTimersByTimeAsync(0);if(mode==='cancel')x.m.stop('cancelled');else x.session.close();
  const r=get(await pending);expect(r.body).toBeNull();expect(r.outcome).toBe('stopped');expect(x.m.stats().primary).toBe(mode==='cancel'?'cancelled':'closed');
  expect(get(x.m.cleanupInfo(r.cleanup))).toMatchObject({disposition:'confirmed',kind:'cancelled'});expect(response.body!.locked).toBe(false);
  expect(x.api.stats()).toMatchObject({reads:1,cancels:1,releases:1,timers:0,retained_bytes:0});expect(cancel).toHaveBeenCalledTimes(1);
});
it.each(['stop_first','chunk_first'] as const)('linearizes stop and chunk adoption: %s',async order=>{
  let c!:ReadableStreamDefaultController<Uint8Array>;const response=new Response(new ReadableStream<Uint8Array>({start(controller){c=controller;}}));
  const x=await setup(()=>response),pending=x.api.run(x.permit);await vi.advanceTimersByTimeAsync(0);
  if(order==='stop_first'){x.m.stop('cancelled');c.enqueue(Buffer.from(' '));}else{c.enqueue(Buffer.from(' '));await vi.advanceTimersByTimeAsync(0);x.m.stop('cancelled');}
  const r=get(await pending);expect(r.body).toBeNull();expect(x.api.stats().received_bytes).toBe(order==='stop_first'?2:3);expect(x.api.stats().timers).toBe(0);
});
it('does not turn releaseLock failure into confirmed cleanup or retry the release',async()=>{
  const response=new Response('{}'),acquire=response.body!.getReader.bind(response.body);let native!:ReadableStreamDefaultReader<Uint8Array>,calls=0,restore!:()=>void;
  vi.spyOn(response.body!,'getReader').mockImplementation(()=>{native=acquire();const mocked=vi.spyOn(native,'releaseLock').mockImplementation(()=>{calls++;throw Error('PRIVATE_RELEASE');});restore=()=>mocked.mockRestore();return native;});
  const x=await setup(()=>response),r=get(await x.api.run(x.permit));
  expect(r.body).toBeNull();expect(get(x.m.cleanupInfo(r.cleanup))).toMatchObject({disposition:'unconfirmed',reason:'release_failed'});expect(calls).toBe(1);
  expect(JSON.stringify(r)).not.toContain('PRIVATE_RELEASE');expect(x.m.begin(x.permit).ok).toBe(false);restore();native.releaseLock();
});
it('contains unexpected pump exceptions instead of leaking a rejected background promise',async()=>{
  const poisoned=new Proxy(new Uint8Array([123,125]),{get(){throw Error('PRIVATE_CHUNK');}});
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(poisoned);c.close();}}),x=await setup(()=>new Response(stream)),pending=x.api.run(x.permit);
  await vi.advanceTimersByTimeAsync(10000);const r=get(await pending);expect(r.outcome).toBe('stopped');expect(r.body).toBeNull();expect(JSON.stringify(r)).not.toContain('PRIVATE_CHUNK');
});
it('keeps the final clock check after controller termination and never issues a late body',async()=>{
  const x=await setup((_r,signal)=>{signal.addEventListener('abort',()=>vi.advanceTimersByTime(10000),{once:true});return new Response('{}');});
  const r=get(await x.api.run(x.permit));expect(r.body).toBeNull();expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('unconfirmed');expect(x.api.stats().timers).toBe(0);
});
it('does not enroll real sessions through the Web Stream adapter',async()=>{
  const x=await setup(()=>new Response('{}')),source=vi.fn(()=>new Response('{}'));
  const real=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'ISOLATED_REAL',oauth:{clientId:'',clientSecret:''}},{fetch:async()=>new Response('{}')});
  try{
    expect(createFixtureWebStreamTransport(real,x.owner,source).ok).toBe(false);expect(source).not.toHaveBeenCalled();
    await expect(real.get('/api/now/table/sys_update_set?sysparm_limit=1')).resolves.toEqual({});expect(real.stats()).toMatchObject({requests:1});
  }finally{real.close();}
});
it('rejects concurrent run without starting another source or interfering with cleanup',async()=>{
  const source=vi.fn(()=>new Response(new ReadableStream<Uint8Array>({pull(){}}))),x=await setup(source),pending=x.api.run(x.permit);
  await vi.advanceTimersByTimeAsync(0);expect(await x.api.run(x.permit)).toEqual({ok:false,code:'invalid_state'});expect(source).toHaveBeenCalledTimes(1);
  x.m.stop('cancelled');expect(get(await pending).outcome).toBe('stopped');expect(x.api.stats().timers).toBe(0);
});
it('cancels a response returned after reentrant revocation without claiming confirmation',async()=>{
  let stop!:()=>void;const cancel=vi.fn(),response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel}));
  const x=await setup(()=>{stop();return response;});stop=()=>{x.m.stop('cancelled');};
  expect(await x.api.run(x.permit)).toEqual({ok:false,code:'cancelled'});await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledTimes(1);expect(x.api.stats()).toMatchObject({cleanup_unconfirmed:true,reads:0,timers:0,active:false,retained_bytes:0});
});
it('charges failed-status body bytes once without retaining them, before a cleaned-up retry',async()=>{
  let n=0;const x=await setup(()=>n++?new Response('{}'):new Response('xxxxx',{status:503})),first=get(await x.api.run(x.permit));
  expect(first.outcome).toBe('upstream_unavailable');expect(x.api.stats()).toMatchObject({received_bytes:7,peak_retained_bytes:0,retained_bytes:0});
  expect(get(await x.api.run(x.permit)).outcome).toBe('body');expect(x.api.stats()).toMatchObject({requests:3,received_bytes:9,cancels:0,releases:2});
});
it('keeps decoded payload charging at the source boundary rather than charging its JSON envelope',async()=>{
  const body=JSON.stringify({payload:'<a/>'}),x=await setup(()=>new Response(body),{payloadBytes:4});
  const p=get(x.m.purpose('payload',{source:x.m.source,phase:x.m.phase(),target:'a'.repeat(32)})),r=get(await x.api.run(p));
  expect(r.outcome).toBe('body');expect(x.api.stats()).toMatchObject({received_bytes:2+Buffer.byteLength(body),payload_bytes:0});
  expect(x.api.chargePayload('<a/>')).toEqual({ok:true,value:true});expect(x.api.stats().payload_bytes).toBe(4);expect(x.api.chargePayload('<a/>').ok).toBe(false);
});
it('cancels only the body captured on receipt, without re-reading a substitutable body getter',async()=>{
  const ownedCancel=vi.fn(),otherCancel=vi.fn(),owned=new ReadableStream<Uint8Array>({pull(){},cancel:ownedCancel}),other=new ReadableStream<Uint8Array>({pull(){},cancel:otherCancel});
  const response=new Response(owned,{status:404});let reads=0;Object.defineProperty(response,'body',{get:()=>reads++===0?owned:other});
  const x=await setup(()=>response),r=get(await x.api.run(x.permit));expect(get(x.m.cleanupInfo(r.cleanup)).disposition).toBe('confirmed');
  expect(ownedCancel).toHaveBeenCalledTimes(1);expect(otherCancel).not.toHaveBeenCalled();expect(reads).toBe(1);
});
it('decides terminal-status handling from one captured status value before opening a reader',async()=>{
  const cancel=vi.fn(),response=new Response(new ReadableStream<Uint8Array>({pull(){},cancel}));let reads=0;
  Object.defineProperty(response,'status',{get:()=>reads++===0?401:200});
  const x=await setup(()=>response),r=get(await x.api.run(x.permit));expect(r.body).toBeNull();expect(x.m.stats().primary).toBe('authentication_failed');
  expect(x.api.stats().reads).toBe(0);expect(reads).toBe(1);expect(cancel).toHaveBeenCalledTimes(1);
});
it('bounds its owned scratch to the lowered response limit as well as limiting received bytes',async()=>{
  const x=await setup(()=>new Response('{}'),{responseBytes:2}),r=get(await x.api.run(x.permit));
  expect(r.outcome).toBe('body');expect(x.api.stats()).toMatchObject({peak_retained_bytes:2,retained_bytes:0,received_bytes:4});
});
it('cancels a local table shortage before terminating its controller so it can remain local',async()=>{
  let c!:ReadableStreamDefaultController<Uint8Array>;const stream=new ReadableStream<Uint8Array>({start(controller){c=controller;c.enqueue(new Uint8Array(16385));}});
  const x=await setup((_r,signal)=>{signal.addEventListener('abort',()=>c.error(Error('ABORTED_BODY')),{once:true});return new Response(stream);});
  const p=get(x.m.purpose('table_initial',{source:x.m.source,phase:x.m.phase(),target:'incident'})),r=get(await x.api.run(p));
  expect(r.outcome).toBe('scope_evidence_limit');expect(get(x.m.cleanupInfo(r.cleanup))).toMatchObject({disposition:'confirmed',kind:'cancelled'});
  expect(x.m.stats().primary).toBeNull();expect(x.api.stats()).toMatchObject({cancels:1,releases:1,evidence_bytes:16385,timers:0});
});
