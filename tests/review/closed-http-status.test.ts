import {expect,it} from 'vitest';
import {createInjectedClosedParentResponseReader} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const id='a'.repeat(32),bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-28 00:00:00',sys_mod_count:'3'}}));
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const j={deadline,wake};jobs.add(j);return ()=>{jobs.delete(j);};},advance(n:number){now=n;for(const j of [...jobs])if(j.deadline<=now){jobs.delete(j);j.wake();}},pending:()=>jobs.size};}
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
it('allows a second same-purpose attempt only after a 429 body was cancelled and confirmed',async()=>{
  const c=clock(),seen:{url:string;auth:object;signal:AbortSignal;ordinal:number}[]=[];let cancels=0;
  const run=createInjectedClosedParentResponseReader(c,(r,signal,auth)=>{seen.push({...r,signal,auth});return seen.length===1?new Response(new ReadableStream({cancel(){cancels++;}}),{status:429}):new Response(bytes);},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(run.status()).toMatchObject({requests:1,primary:null,attempt_failure:'upstream_unavailable',cleanup:{disposition:'confirmed',kind:'cancelled'},http_failure:{status:429,classification:'rate_limited',code:'upstream_unavailable'}});
  expect(get(await run.read(h))).toMatchObject({records:1});expect(cancels).toBe(1);expect(seen.map(x=>x.ordinal)).toEqual([1,2]);expect(seen[0].auth).toBe(seen[1].auth);expect(seen[0].url).toBe(seen[1].url);expect(seen[0].signal).not.toBe(seen[1].signal);
  expect(run.status()).toMatchObject({requests:2,received_bytes:bytes.length});expect(c.pending()).toBe(0);
});
it.each([500,501,503,599])('classifies %i as a retryable server failure only after owned-body cleanup',async status=>{
  let calls=0,cancels=0;const run=createInjectedClosedParentResponseReader(clock(),()=>++calls===1?new Response(new ReadableStream({cancel(){cancels++;}}),{status}):new Response(bytes),{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(run.status()).toMatchObject({primary:null,http_failure:{status,classification:'server_error'},cleanup:{disposition:'confirmed'}});
  get(await run.read(h));expect(calls).toBe(2);expect(cancels).toBe(1);expect(run.status().requests).toBe(2);
});
it.each([[401,'authentication_failed','unauthorized'],[403,'access_denied','forbidden']] as const)('stops %i before reading an uncooperative error body',async(status,code,classification)=>{
  const c=clock();let signal!:AbortSignal,finish!:()=>void,cancels=0,calls=0;
  const run=createInjectedClosedParentResponseReader(c,(_r,s)=>{calls++;signal=s;return new Response(new ReadableStream({cancel(){cancels++;return new Promise<void>(resolve=>{finish=resolve;});}}),{status});},{update_set_sys_id:id}),h=get(run.initial()),work=run.read(h);
  await flush();expect(signal.aborted).toBe(true);expect(run.status()).toMatchObject({primary:{code},http_failure:{status,classification,code},operations:{reads:0}});c.advance(250);
  expect(await work).toEqual({ok:false,code});expect(run.status().cleanup).toMatchObject({disposition:'unconfirmed',reason:'response_cancel_pending'});finish();await flush();expect(await run.read(h)).toEqual({ok:false,code});expect(calls).toBe(1);expect(cancels).toBe(1);expect(c.pending()).toBe(0);
});
it.each([300,301,302,303,304,307,308])('refuses redirect status %i and never follows Location or interprets Retry-After',async status=>{
  const c=clock();let calls=0,headerGets=0;
  const response=new Response(status===304?null:'PRIVATE_HTTP_BODY',{status,headers:{Location:'https://foreign.invalid/PRIVATE_TOKEN','Retry-After':'999999999'}});
  Object.defineProperty(response,'headers',{get(){headerGets++;throw Error('PRIVATE_HEADER_GETTER');}});
  const run=createInjectedClosedParentResponseReader(c,()=>{calls++;return response;},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'invalid_response'});expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(1);expect(headerGets).toBe(0);expect(c.pending()).toBe(0);expect(run.status()).toMatchObject({http_failure:{status,classification:'redirect'},received_bytes:0,operations:{reads:0}});
  for(const text of ['PRIVATE_HTTP_BODY','PRIVATE_TOKEN','foreign.invalid','Location','Retry-After'])expect(JSON.stringify(run.status())).not.toContain(text);
});
it.each([[201,'unsupported_success'],[204,'unsupported_success'],[206,'unsupported_success'],[400,'client_error'],[404,'client_error'],[408,'client_error'],[418,'client_error'],[422,'client_error']] as const)('does not retry unsupported/non-transient HTTP %i',async(status,classification)=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return new Response(status===204?null:'ignored',{status});},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'invalid_response'});expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(1);expect(run.status()).toMatchObject({http_failure:{status,classification},primary:{code:'invalid_response'},operations:{reads:0}});
});
it('keeps first and last HTTP failures separate when a retry changes from 429 to 403',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>new Response('PRIVATE_ERROR_BODY',{status:++calls===1?429:403}),{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(await run.read(h)).toEqual({ok:false,code:'access_denied'});
  expect(run.status()).toMatchObject({requests:2,received_bytes:0,attempt_failure:'upstream_unavailable',primary:{code:'access_denied'},http_failure:{status:429,classification:'rate_limited'},last_http_failure:{status:403,classification:'forbidden'}});expect(JSON.stringify(run.status())).not.toContain('PRIVATE_ERROR_BODY');
});
it.each(['pending','rejected'] as const)('does not authorize retry after %s cleanup of a 503 response',async mode=>{
  const c=clock();let calls=0,finish!:()=>void;
  const run=createInjectedClosedParentResponseReader(c,()=>{calls++;return new Response(new ReadableStream({cancel(){return mode==='pending'?new Promise<void>(resolve=>{finish=resolve;}):Promise.reject(Error('PRIVATE_CANCEL'));}}),{status:503});},{update_set_sys_id:id}),h=get(run.initial()),work=run.read(h);
  await flush();if(mode==='pending'){expect(run.status().active).toBe(true);expect(calls).toBe(1);c.advance(250);}
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(run.status()).toMatchObject({attempt_failure:'upstream_unavailable',primary:{code:'cleanup_unconfirmed'},http_failure:{status:503},cleanup:{disposition:'unconfirmed'}});
  if(mode==='pending'){const report=run.status().cleanup;finish();await flush();expect(run.status().cleanup).toEqual(report);}
  expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(1);expect(c.pending()).toBe(0);expect(JSON.stringify(run.status())).not.toContain('PRIVATE_CANCEL');
});
it('uses at most two HTTP attempts and never resets the shared request cap or creates another purpose',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return new Response(null,{status:503});},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});
  expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(2);expect(run.status()).toMatchObject({requests:2,received_bytes:0});
});
it('shares the two-attempt limit between a timeout and an HTTP transient failure',async()=>{
  const c=clock();let calls=0;const run=createInjectedClosedParentResponseReader(c,(_r,s)=>++calls===1?new Promise<Response>((_resolve,reject)=>s.addEventListener('abort',()=>reject(Error()))):new Response(null,{status:500}),{update_set_sys_id:id}),h=get(run.initial());
  const first=run.read(h);c.advance(9750);expect(await first).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});
  expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(2);expect(run.status()).toMatchObject({requests:2,attempt_failure:'attempt_deadline_exceeded',http_failure:{status:500}});expect(c.pending()).toBe(0);
});
it('does not use a stale HTTP failure to retry a later spontaneous dispatcher rejection',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>++calls===1?new Response(null,{status:429}):Promise.reject(Error('PRIVATE_UPSTREAM')),{update_set_sys_id:id}),h=get(run.initial());
  await run.read(h);expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(run.status()).toMatchObject({primary:{code:'upstream_unavailable'},http_failure:{status:429}});expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(2);
});
it('preserves the original phase cutoff when a cleanup-confirmed HTTP failure is followed by a retry',async()=>{
  const c=clock();let calls=0;const run=createInjectedClosedParentResponseReader(c,()=>{calls++;return new Response(null,{status:503});},{update_set_sys_id:id}),h=get(run.initial());
  c.advance(49900);expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});c.advance(50000);expect(await run.read(h)).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(calls).toBe(1);expect(run.status().requests).toBe(1);expect(c.pending()).toBe(0);
});
it('does not consume final reservations or a second C when retry capacity is exhausted',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return new Response(null,{status:429});},{update_set_sys_id:id,session:{accounting:{requests:5}}}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(run.status().reserved).toBe(4);expect(await run.read(h)).toEqual({ok:false,code:'request_budget_exceeded'});expect(run.status()).toMatchObject({requests:1,reserved:4});expect(calls).toBe(1);
});
it('retries a transient final parent read using its existing final slot, URL and auth context',async()=>{
  const seen:{purpose:string;ordinal:number;auth:object;url:string}[]=[];let calls=0;const run=createInjectedClosedParentResponseReader(clock(),(r,_s,auth)=>{seen.push({...r,auth});return ++calls===2?new Response(null,{status:503}):new Response(bytes);},{update_set_sys_id:id});
  get(await run.read(get(run.initial())));const final=get(run.final());expect(await run.read(final)).toEqual({ok:false,code:'upstream_unavailable'});expect(run.status().reserved).toBe(3);get(await run.read(final));
  expect(seen.map(x=>[x.purpose,x.ordinal])).toEqual([['parent_initial',1],['parent_final',1],['parent_final',2]]);expect(seen.every(x=>x.auth===seen[0].auth&&x.url===seen[0].url)).toBe(true);expect(run.status()).toMatchObject({requests:3,reserved:2,received_bytes:bytes.length*2});
});
it('retains cancellation as primary when an HTTP retryable status triggers a reentrant abort listener',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),(_r,s)=>{calls++;s.addEventListener('abort',()=>run.cancel());return new Response('ignored',{status:429});},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'cancelled'});expect(run.status()).toMatchObject({http_failure:{status:429},primary:{code:'cancelled'}});expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(1);
});
it('never treats a late 401 as a new authentication failure after the attempt already timed out',async()=>{
  const c=clock();let resolve!:(r:Response)=>void;const run=createInjectedClosedParentResponseReader(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.read(get(run.initial()));
  c.advance(9750);await flush();resolve(new Response('ignored',{status:401}));expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(run.status()).toMatchObject({http_failure:null,primary:null,attempt_failure:'attempt_deadline_exceeded'});expect(c.pending()).toBe(0);
});
it('does not touch a foreign locked error body or permit retry on ownership uncertainty',async()=>{
  let cancels=0;const response=new Response(new ReadableStream({cancel(){cancels++;}}),{status:503}),reader=response.body!.getReader();void reader.closed.catch(()=>{});
  const run=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id}),h=get(run.initial());
  try{expect(await run.read(h)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect((await run.read(h)).ok).toBe(false);expect(response.body!.locked).toBe(true);expect(cancels).toBe(0);expect(run.status()).toMatchObject({http_failure:null,last_http_failure:null,primary:{code:'evidence_binding_mismatch'},cleanup:{disposition:'unconfirmed',reason:'response_ownership_unknown'}});}
  finally{await reader.cancel();reader.releaseLock();}
});
it.each([[401,'locked'],[403,'locked'],[401,'used'],[403,'used']] as const)('treats a %s status on a %s foreign Response as binding mismatch, not as auth evidence',async(status,mode)=>{
  let cancels=0;const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();},cancel(){cancels++;}}),{status});
  const reader=mode==='locked'?response.body!.getReader():undefined;if(reader)void reader.closed.catch(()=>{});else await response.arrayBuffer();
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return response;},{update_set_sys_id:id}),h=get(run.initial());
  try{expect(await run.read(h)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(1);expect(cancels).toBe(0);
    expect(run.status()).toMatchObject({primary:{code:'evidence_binding_mismatch'},http_failure:null,last_http_failure:null,cleanup:{disposition:'unconfirmed',reason:'response_ownership_unknown'}});}
  finally{if(reader){await reader.cancel();reader.releaseLock();}}
});
it('classifies a native Response.error status as invalid without manufacturing a body or retry',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return Response.error();},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'invalid_response'});expect((await run.read(h)).ok).toBe(false);expect(calls).toBe(1);expect(run.status()).toMatchObject({http_failure:{status:0,classification:'invalid_status'},operations:{reads:0,cancels:0}});
});
