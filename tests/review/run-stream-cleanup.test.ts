import {afterEach,expect,it,vi} from 'vitest';
import {createFakeRunStreamSession} from '../../src/review/abort-scope-evidence-run-stream.js';
afterEach(()=>vi.useRealTimers());
function clock(){vi.useFakeTimers();return {now:()=>Date.now(),schedule(at:number,wake:()=>void){const t=setTimeout(wake,Math.max(0,at-Date.now()));return ()=>clearTimeout(t);}};}
const parent={kind:'parent_initial',ordinal:1};
it('observes native read/closed/releaseLock for the same charged attempt without returning body text',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>({start(s){s.enqueue(new Uint8Array([1,2]));s.enqueue(new Uint8Array([3]));s.close();}});
  const run=createFakeRunStreamSession(c,()=>new Response(stream));
  const result=await run.run(parent);expect(run.status().primary).toBeNull();expect(result).toMatchObject({ok:true});expect(stream.locked).toBe(false);run.finish();
  expect(run.status()).toMatchObject({budget:{requests:1,received_bytes:3,payload_bytes:0},cleanup:{http:'confirmed',worker:'not_started'},evidence_issuance:'disabled'});
  expect(run.operations()).toMatchObject({reads:3,cancels:0,releases:1,timers:0});
});
it('cancels a pending native read once and confirms only after cancel/closed settlement and lock release',async()=>{
  const c=clock();let cancelled=0;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancelled++;}}),run=createFakeRunStreamSession(c,()=>new Response(stream));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);run.cancel();await vi.advanceTimersByTimeAsync(0);
  expect(cancelled).toBe(1);expect((await pending).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'confirmed',worker:'not_started'}});
  expect(stream.locked).toBe(false);expect(run.operations()).toMatchObject({cancels:1,releases:1,timers:0});
});
it('keeps a pending cancel unconfirmed at the attempt deadline and never repairs the terminal with late fulfillment',async()=>{
  const c=clock();let complete!:()=>void;
  const stream=new ReadableStream<Uint8Array>({cancel(){return new Promise<void>(r=>{complete=r;});}}),run=createFakeRunStreamSession(c,()=>new Response(stream));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);run.cancel();await vi.advanceTimersByTimeAsync(10000);
  expect((await pending).ok).toBe(false);run.finish();const before=run.status();
  expect(before).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'cleanup_deadline'}});
  complete();await vi.advanceTimersByTimeAsync(0);expect(run.status()).toEqual(before);expect(run.operations()).toMatchObject({cancels:1,releases:1,timers:0});
});
it('retains first cancellation when native cancel rejects, without claiming a confirmed termination',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>({cancel(){throw Error('PRIVATE_CANCEL');}}),run=createFakeRunStreamSession(c,()=>new Response(stream));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);run.cancel();await pending;run.finish();
  expect(run.status()).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'cancel_rejected'}});
  expect(JSON.stringify(run.status())).not.toContain('PRIVATE');expect(run.operations().timers).toBe(0);
});
it.each([401,403,500])('cancels an unlocked rejected HTTP %i body without reading it',async status=>{
  const c=clock();let cancelled=0;const stream=new ReadableStream<Uint8Array>({cancel(){cancelled++;}});
  const run=createFakeRunStreamSession(c,()=>new Response(stream,{status}));expect((await run.run(parent)).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:status===401?'authentication_failed':status===403?'access_denied':'upstream_unavailable'},cleanup:{http:'confirmed'},budget:{requests:1,received_bytes:0}});
  expect(cancelled).toBe(1);expect(run.operations()).toMatchObject({reads:0,cancels:1,releases:0,timers:0});
});
it.each(['sync','async'] as const)('observes %s source rejection without Response as confirmed no-response cleanup',async mode=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>{if(mode==='sync')throw Error('PRIVATE_SOURCE');return Promise.reject(Error('PRIVATE_SOURCE'));});
  expect((await run.run(parent)).ok).toBe(false);run.finish();expect(run.status()).toMatchObject({primary:{code:'upstream_unavailable'},cleanup:{http:'confirmed'},budget:{requests:1}});
  expect(run.operations()).toMatchObject({reads:0,cancels:0,releases:0,timers:0});expect(JSON.stringify(run.status())).not.toContain('PRIVATE');
});
it('keeps a never-settled source unconfirmed and best-effort cancels its late Response once',async()=>{
  const c=clock();let resolve!:(r:Response)=>void;const run=createFakeRunStreamSession(c,()=>new Promise<Response>(r=>{resolve=r;}));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(10000);await pending;run.finish();const before=run.status();
  expect(before).toMatchObject({primary:{code:'upstream_unavailable'},cleanup:{http:'unconfirmed'}});
  let cancelled=0;resolve(new Response(new ReadableStream({cancel(){cancelled++;}})));await vi.advanceTimersByTimeAsync(0);
  expect(cancelled).toBe(1);expect(run.status()).toEqual(before);expect(run.operations().timers).toBe(0);
});
it('rejects a prelocked stream without stealing its reader or calling cancel',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>(),response=new Response(stream),owner=stream.getReader(),run=createFakeRunStreamSession(c,()=>response);
  expect((await run.run(parent)).ok).toBe(false);run.finish();expect(stream.locked).toBe(true);
  expect(run.status()).toMatchObject({primary:{code:'invalid_response'},cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'reader_owner_unknown'}});
  expect(run.operations()).toMatchObject({reads:0,cancels:0,releases:0});await owner.cancel();owner.releaseLock();
});
it('does not infer successful body acquisition from body=null',async()=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>new Response(null));expect((await run.run(parent)).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'invalid_response'},cleanup:{http:'confirmed'},budget:{received_bytes:0}});
});
it('preserves a reader error and observes closed/cancel rejection without exposing the raw error',async()=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>new Response(new ReadableStream({start(s){s.error(Error('PRIVATE_READ'));}})));
  expect((await run.run(parent)).ok).toBe(false);await vi.advanceTimersByTimeAsync(0);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'invalid_response'},cleanup:{http:'unconfirmed'}});expect(JSON.stringify(run.status())).not.toContain('PRIVATE');
});
it('charges the overshoot chunk once, cancels, and keeps the budget error separately from confirmed cleanup',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>({start(s){s.enqueue(new Uint8Array(4));}});
  const run=createFakeRunStreamSession(c,()=>new Response(stream),{session:{total_bytes:3}});expect((await run.run(parent)).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'receive_budget_exceeded'},budget:{requests:1,received_bytes:4},cleanup:{http:'confirmed'}});
  expect(run.operations()).toMatchObject({cancels:1,releases:1,timers:0});
});
it('enforces the total empty-read candidate bound even when nonempty reads alternate',async()=>{
  const c=clock();let i=0;const stream=new ReadableStream<Uint8Array>({pull(s){s.enqueue(new Uint8Array(i++%2));}});
  const run=createFakeRunStreamSession(c,()=>new Response(stream),{max_empty_reads:2});expect((await run.run(parent)).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'invalid_response'},budget:{received_bytes:2},cleanup:{http:'confirmed'}});
  expect(run.operations()).toMatchObject({reads:5,cancels:1,releases:1,timers:0});
});
it('explicitly discards modeled payloads and exposes no bytes/text/body receipt',async()=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>new Response('PRIVATE_CODE'));
  const result=await run.run({kind:'payload',ordinal:1});expect(result.ok).toBe(true);run.finish();
  expect(run.status()).toMatchObject({budget:{payload_bytes:0},cleanup:{http:'confirmed'}});
  expect(JSON.stringify({result,status:run.status()})).not.toContain('PRIVATE');for(const k of ['body','text','reader','session','transport','issueEvidence'])expect(Reflect.has(run,k)).toBe(false);
});
it('refuses a second concurrent run while preserving the first attempt for cancellation cleanup',async()=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>new Response(new ReadableStream()));
  const first=run.run(parent);await vi.advanceTimersByTimeAsync(0);expect((await run.run(parent)).ok).toBe(false);await first;run.finish();
  expect(run.status()).toMatchObject({primary:{code:'internal_review_error'},budget:{requests:1},cleanup:{http:'confirmed'}});
});
it.each(['response','stream'] as const)('rejects reused %s ownership on a second attempt without rereading or charging old bytes',async kind=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>({start(s){s.enqueue(new Uint8Array(2));s.close();}}),response=new Response(stream),second=new Response(stream);let calls=0;
  const run=createFakeRunStreamSession(c,()=>++calls===1||kind==='response'?response:second);expect((await run.run(parent)).ok).toBe(true);
  expect((await run.run({kind:'release_rows',ordinal:1})).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'invalid_response'},budget:{requests:2,received_bytes:2},cleanup:{http:'unconfirmed'}});
});
it('refuses a late read after a hard-clock jump before adopting its bytes',async()=>{
  const c=clock();let control!:ReadableStreamDefaultController<Uint8Array>;
  const run=createFakeRunStreamSession(c,()=>new Response(new ReadableStream({start(s){control=s;}})));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);vi.setSystemTime(Date.now()+60000);control.enqueue(new Uint8Array(8));await pending;run.finish();
  expect(run.status()).toMatchObject({primary:{code:'deadline_exceeded'},budget:{received_bytes:0},cleanup:{http:'unconfirmed'}});expect(run.operations().timers).toBe(0);
});
it.each([{request_timeout_ms:10001},{cleanup_reserve_ms:251},{max_empty_reads:17},{unknown:true}])('rejects raised or unknown fake policy %j before source invocation',options=>{
  const c=clock();let calls=0;expect(()=>createFakeRunStreamSession(c,()=>{calls++;return new Response();},options)).toThrow('invalid_input');expect(calls).toBe(0);
});
it('records releaseLock failure without a second release attempt or exposing the exception',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>({start(s){s.close();}}),original=stream.getReader.bind(stream);let cleanup:(()=>void)|undefined;
  stream.getReader=(()=>{const reader=original();cleanup=reader.releaseLock.bind(reader);reader.releaseLock=()=>{throw Error('PRIVATE_RELEASE');};return reader;}) as typeof stream.getReader;
  const run=createFakeRunStreamSession(c,()=>new Response(stream));expect((await run.run(parent)).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'lock_release_failed'}});expect(run.operations()).toMatchObject({releases:1,timers:0});
  expect(JSON.stringify(run.status())).not.toContain('PRIVATE');cleanup?.();
});
it('cannot confirm an unobserved closed promise even when read reports EOF',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>({start(s){s.close();}}),original=stream.getReader.bind(stream);let resolve!:()=>void;
  stream.getReader=(()=>{const reader=original();Object.defineProperty(reader,'closed',{value:new Promise<void>(r=>{resolve=r;})});return reader;}) as typeof stream.getReader;
  const run=createFakeRunStreamSession(c,()=>new Response(stream)),pending=run.run(parent);await vi.advanceTimersByTimeAsync(10000);await pending;run.finish();const before=run.status();
  expect(before).toMatchObject({cleanup:{http:'unconfirmed'}});expect(stream.locked).toBe(true);resolve();await vi.advanceTimersByTimeAsync(0);
  expect(stream.locked).toBe(false);expect(run.status()).toEqual(before);expect(run.operations()).toMatchObject({releases:1,timers:0});
});
it('stops before dispatch if there is no positive cleanup reserve left',async()=>{
  const c=clock();let calls=0;const run=createFakeRunStreamSession(c,()=>{calls++;return new Response();},{session:{deadline_ms:3}});
  expect((await run.run(parent)).ok).toBe(false);run.finish();expect(calls).toBe(0);expect(run.status()).toMatchObject({budget:{requests:0},cleanup:{http:'not_started'}});
});
it('fails closed immediately if scheduling fails while the source is pending, rather than retrying a broken wait',async()=>{
  const c=clock();let calls=0;const run=createFakeRunStreamSession({...c,schedule(at,wake){if(++calls===1)throw Error('PRIVATE_SCHEDULER');return c.schedule(at,wake);}},()=>new Promise<Response>(()=>{}));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);
  try{expect(run.operations().active).toBe(false);}finally{await vi.advanceTimersByTimeAsync(10000);await pending;}
  run.finish();expect(run.status()).toMatchObject({primary:{code:'internal_review_error'},cleanup:{http:'unconfirmed'}});expect(run.operations().timers).toBe(0);
  expect(JSON.stringify(run.status())).not.toContain('PRIVATE');
});
it('uses the lowered attempt IO cutoff for cancellation and the same original run deadline for cleanup',async()=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>new Response(new ReadableStream()),{request_timeout_ms:100});
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(75);expect((await pending).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'upstream_unavailable'},cleanup:{http:'confirmed'},budget:{requests:1,remaining_ms:59925}});
  expect(run.operations()).toMatchObject({cancels:1,releases:1,timers:0});
});
it('refuses closing the facade as proof of completed IO while a read is still active',async()=>{
  const c=clock(),run=createFakeRunStreamSession(c,()=>new Response(new ReadableStream()));const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);
  expect(run.finish().ok).toBe(false);await pending;run.finish();expect(run.status()).toMatchObject({primary:{code:'closed'},cleanup:{http:'confirmed'}});
});
it('stops on invalid clock after native read, with no stale-time confirmation or adoption',async()=>{
  const c=clock();let invalid=false,control!:ReadableStreamDefaultController<Uint8Array>;
  const run=createFakeRunStreamSession({...c,now:()=>invalid?NaN:c.now()},()=>new Response(new ReadableStream({start(s){control=s;}})));
  const pending=run.run(parent);await vi.advanceTimersByTimeAsync(0);invalid=true;control.enqueue(new Uint8Array(3));await pending;run.finish();
  expect(run.status()).toMatchObject({primary:{code:'invalid_observation_time'},cleanup:{http:'unconfirmed'},budget:{received_bytes:0}});
  expect(run.operations().timers).toBe(0);
});
it('handles cancellation inside source invocation without losing the charged-but-unreturned attempt',async()=>{
  const c=clock();let run:ReturnType<typeof createFakeRunStreamSession>,cancelled=0;
  run=createFakeRunStreamSession(c,()=>{run.cancel();return new Response(new ReadableStream({cancel(){cancelled++;}}));});
  expect((await run.run(parent)).ok).toBe(false);await vi.advanceTimersByTimeAsync(0);run.finish();
  expect(run.status()).toMatchObject({primary:{code:'cancelled'},budget:{requests:1},cleanup:{http:'unconfirmed'}});expect(cancelled).toBe(1);
});
it('does not allocate a second reader if getReader fails',async()=>{
  const c=clock(),stream=new ReadableStream<Uint8Array>();let calls=0;
  stream.getReader=(()=>{calls++;throw Error('PRIVATE_READER');}) as typeof stream.getReader;
  const run=createFakeRunStreamSession(c,()=>new Response(stream));expect((await run.run(parent)).ok).toBe(false);run.finish();
  expect(calls).toBe(1);expect(run.status()).toMatchObject({primary:{code:'invalid_response'},cleanup:{http:'unconfirmed'}});
  expect(run.operations()).toMatchObject({reads:0,releases:0});await stream.cancel();
});
