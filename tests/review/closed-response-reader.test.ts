import {expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createInjectedClosedParentResponseReader} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const id='a'.repeat(32),encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
// Shape returned by the fixed parent GET fields (sys_id,state,application,sys_updated_on,sys_mod_count).
const parentRow=(sys_id:string)=>({sys_id,state:'in progress',application:'global',sys_updated_on:'2026-10-28 00:00:00',sys_mod_count:'3'});
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const j={deadline,wake};jobs.add(j);return ()=>{jobs.delete(j);};},advance(n:number){now=n;for(const j of [...jobs])if(j.deadline<=now){jobs.delete(j);j.wake();}},pending:()=>jobs.size};}
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
it('reads and parses the same owned Response bytes on one attempt and returns no body',async()=>{
  const c=clock(),bytes=encode({result:parentRow(id)});let resolve!:(r:Response)=>void,cancels=0;
  const response=new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes.subarray(0,9));controller.enqueue(bytes.subarray(9));controller.close();},cancel(){cancels++;}}));
  const run=createInjectedClosedParentResponseReader(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.read(get(run.initial()));
  c.advance(1000);resolve(response);expect(get(await work)).toMatchObject({records:1,received_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),synthetic:true,evidence_issuance:'disabled'});
  expect(run.status()).toMatchObject({requests:1,dispatches:1,received_bytes:bytes.length,cleanup:{disposition:'confirmed',kind:'eof'},operations:{reads:3,releases:1,cancels:0}});expect(cancels).toBe(0);expect(response.body!.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('keeps the original I/O cutoff after Response arrival and cancels/releases that same reader',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,cancels=0,signal!:AbortSignal;
  const response=new Response(new ReadableStream<Uint8Array>({cancel(){cancels++;}})),run=createInjectedClosedParentResponseReader(c,(_r,s)=>{signal=s;return new Promise<Response>(r=>{resolve=r;});},{update_set_sys_id:id});
  const work=run.read(get(run.initial()));c.advance(9000);resolve(response);await flush();expect(response.body!.locked).toBe(true);c.advance(9750);
  expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(signal.aborted).toBe(true);expect(cancels).toBe(1);expect(response.body!.locked).toBe(false);expect(run.status()).toMatchObject({requests:1,primary:null,cleanup:{disposition:'confirmed',kind:'cancelled'},operations:{releases:1}});expect(c.pending()).toBe(0);
});
it('rejects a body for a different parent even though it came through the same dispatcher',async()=>{
  const bytes=encode({result:parentRow('b'.repeat(32))}),run=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes),{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_response'});expect(run.status()).toMatchObject({requests:1,received_bytes:bytes.length});
});
it('does not turn Response arrival into a 250ms body deadline',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,controller!:ReadableStreamDefaultController<Uint8Array>;
  const run=createInjectedClosedParentResponseReader(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.read(get(run.initial()));
  c.advance(1000);resolve(new Response(new ReadableStream<Uint8Array>({start(c){controller=c;}})));await flush();c.advance(2000);controller.enqueue(encode({result:parentRow(id)}));controller.close();
  expect((await work).ok).toBe(true);expect(run.status().cleanup).toMatchObject({disposition:'confirmed',kind:'eof'});expect(c.pending()).toBe(0);
});
it('retains a timed-out prefix charge and retries on fresh Response/body/signal with no fragment reuse',async()=>{
  const c=clock(),seen:{signal:AbortSignal;auth:object;ordinal:number;url:string}[]=[];let cancels=0;
  const prefix=new TextEncoder().encode('PRIVATE_PREFIX'),bytes=encode({result:parentRow(id)});
  const run=createInjectedClosedParentResponseReader(c,(r,signal,auth)=>{seen.push({...r,signal,auth});return seen.length===1?new Response(new ReadableStream<Uint8Array>({start(ctrl){ctrl.enqueue(prefix);},cancel(){cancels++;}})):new Response(bytes);},{update_set_sys_id:id}),h=get(run.initial());
  const first=run.read(h);await flush();c.advance(9750);expect(await first).toEqual({ok:false,code:'attempt_deadline_exceeded'});const result=get(await run.read(h));
  expect(result).toMatchObject({records:1,received_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});expect(run.status()).toMatchObject({requests:2,received_bytes:prefix.length+bytes.length,operations:{releases:2}});
  expect(seen.map(x=>x.ordinal)).toEqual([1,2]);expect(seen[0].auth).toBe(seen[1].auth);expect(seen[0].url).toBe(seen[1].url);expect(seen[0].signal).not.toBe(seen[1].signal);expect(seen[0].signal.aborted).toBe(true);expect(cancels).toBe(1);expect(c.pending()).toBe(0);
});
it('keeps pending native cancellation unconfirmed even when closed/read settled and the lock was released',async()=>{
  const c=clock();let finish!:()=>void;const response=new Response(new ReadableStream<Uint8Array>({cancel:()=>new Promise<void>(resolve=>{finish=resolve;})}));
  const run=createInjectedClosedParentResponseReader(c,()=>response,{update_set_sys_id:id}),h=get(run.initial()),work=run.read(h);await flush();c.advance(9750);await flush();expect(response.body!.locked).toBe(false);c.advance(10000);
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});const report=run.status().cleanup;expect(report).toMatchObject({reason:'cancel_pending'});finish();await flush();expect(run.status().cleanup).toEqual(report);expect((await run.read(h)).ok).toBe(false);expect(run.status().requests).toBe(1);expect(c.pending()).toBe(0);
});
it.each(['cancel','close'] as const)('stops native body reads on %s and preserves the primary reason',async method=>{
  const c=clock();let signal!:AbortSignal,cancels=0;const response=new Response(new ReadableStream<Uint8Array>({cancel(){cancels++;}}));
  const run=createInjectedClosedParentResponseReader(c,(_r,s)=>{signal=s;return response;},{update_set_sys_id:id}),work=run.read(get(run.initial()));await flush();run[method]();expect(await work).toEqual({ok:false,code:method==='cancel'?'cancelled':'closed'});
  expect(signal.aborted).toBe(true);expect(cancels).toBe(1);expect(response.body!.locked).toBe(false);expect(run.status()).toMatchObject({cleanup:{disposition:'confirmed',kind:'cancelled'},operations:{releases:1}});expect(c.pending()).toBe(0);
});
it('does not repair a returned unconfirmed dispatch result when a late Response finally arrives',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,cancels=0;const run=createInjectedClosedParentResponseReader(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.read(get(run.initial()));c.advance(9750);await flush();c.advance(10000);await work;
  const before=run.status();resolve(new Response(new ReadableStream({cancel(){cancels++;}})));await flush();expect(cancels).toBe(1);expect(run.status().cleanup).toEqual(before.cleanup);expect(run.status().primary).toEqual(before.primary);expect(run.status().received_bytes).toBe(0);expect(run.status().operations.reads).toBe(0);expect(c.pending()).toBe(0);
});
it('uses one immutable private byte snapshot for charging, hashing and parsing even if the source buffer changes',async()=>{
  const c=clock(),source=encode({result:parentRow(id)}),expected=createHash('sha256').update(source).digest('hex');let bound:ReturnType<typeof createInjectedClosedParentResponseReader>|undefined;
  bound=createInjectedClosedParentResponseReader({...c,now(){if(bound&&bound.status().received_bytes>0)source.fill(0);return c.now();}},()=>new Response(new ReadableStream<Uint8Array>({start(ctrl){ctrl.enqueue(source);ctrl.close();}})),{update_set_sys_id:id});
  expect(get(await bound.read(get(bound.initial()))).sha256).toBe(expected);expect(source.every(x=>x===0)).toBe(true);
});
it('uses the same frozen auth/URL at the ordered final position and never returns the target or body',async()=>{
  const seen:{auth:object;url:string;purpose:string;ordinal:number}[]=[];
  const run=createInjectedClosedParentResponseReader(clock(),(r,_s,auth)=>{expect(Object.isFrozen(r)).toBe(true);seen.push({...r,auth});return new Response(encode({result:parentRow(id)}));},{update_set_sys_id:id});
  const first=get(await run.read(get(run.initial()))),last=get(await run.read(get(run.final())));expect(first.sha256).toBe(last.sha256);expect(seen.map(x=>x.purpose)).toEqual(['parent_initial','parent_final']);expect(seen.map(x=>x.ordinal)).toEqual([1,1]);expect(seen[0].auth).toBe(seen[1].auth);expect(seen[0].url).toBe(seen[1].url);
  const json=JSON.stringify({first,last,status:run.status()});for(const text of [id,'sysparm_fields','closed-dispatch.invalid'])expect(json).not.toContain(text);
  expect(first).not.toHaveProperty('body');expect(last).not.toHaveProperty('body');expect(run.status().body).toMatchObject({retained_bytes:0,pending:false,consumes:2});
  expect(run.status().requests).toBe(2);
});
it('does not obtain a reader for a Response delivered at the I/O cutoff',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,cancels=0;const response=new Response(new ReadableStream({cancel(){cancels++;}}));
  const run=createInjectedClosedParentResponseReader(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.read(get(run.initial()));c.advance(9750);resolve(response);
  expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(cancels).toBe(1);expect(run.status()).toMatchObject({received_bytes:0,operations:{reads:0,releases:0},cleanup:{disposition:'confirmed',kind:'cancelled'}});expect(c.pending()).toBe(0);
});
it('does not cancel or release a Response whose body belongs to another reader',async()=>{
  let cancels=0;const response=new Response(new ReadableStream({cancel(){cancels++;}})),reader=response.body!.getReader();void reader.closed.catch(()=>{});
  const run=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id});
  try{expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(cancels).toBe(0);expect(response.body!.locked).toBe(true);expect(run.status()).toMatchObject({received_bytes:0,operations:{reads:0,releases:0}});}
  finally{await reader.cancel();reader.releaseLock();}
});
it('refuses a consumed Response in another run without disturbing the first run',async()=>{
  const response=new Response(encode({result:parentRow(id)})),a=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id});get(await a.read(get(a.initial())));const before=a.status();
  const b=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id});expect(await b.read(get(b.initial()))).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(a.status()).toEqual(before);expect(b.status().operations.reads).toBe(0);
});
it.each(['proxy','forged','plain'] as const)('refuses %s Response without running its getters',async kind=>{
  let calls=0;const raw=kind==='proxy'?new Proxy(new Response('ignored'),{get(){calls++;throw Error('PRIVATE_PROXY');}}):kind==='forged'?Object.create(Response.prototype):{get body(){calls++;throw Error('PRIVATE_BODY');}};
  const run=createInjectedClosedParentResponseReader(clock(),(()=>raw) as ()=>Response,{update_set_sys_id:id});expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_response'});expect(calls).toBe(0);expect(run.status().operations.reads).toBe(0);
});
it.each([204,302,429,500])('refuses status %i without adopting body bytes or following a redirect',async status=>{
  let cancels=0;const response=new Response(status===204?null:new ReadableStream({cancel(){cancels++;}}),{status}),run=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:status===429||status>=500?'upstream_unavailable':'invalid_response'});expect(run.status()).toMatchObject({requests:1,received_bytes:0,operations:{reads:0,releases:0}});expect(cancels).toBe(status===204?0:1);
});
it('rejects a secret malformed JSON body after charging once, with no parser details in the result',async()=>{
  const bytes=new TextEncoder().encode('PRIVATE_JSON_BODY'),run=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes),{update_set_sys_id:id});
  const result=await run.read(get(run.initial()));expect(result).toEqual({ok:false,code:'invalid_response'});expect(run.status().received_bytes).toBe(bytes.length);expect(JSON.stringify({result,status:run.status()})).not.toContain('PRIVATE_JSON_BODY');
});
it('rejects an over-cap native chunk without retaining or parsing it, and never refunds its charge',async()=>{
  const bytes=new Uint8Array(128),run=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes),{update_set_sys_id:id,session:{accounting:{response_bytes:64}}});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'receive_budget_exceeded'});expect(run.status()).toMatchObject({received_bytes:128,requests:1,operations:{releases:1}});
});
it('does not let caller Response or reader method overrides replace the pinned native operations',async()=>{
  let calls=0;const response=new Response(encode({result:parentRow(id)})),stream=response.body!;
  Object.defineProperty(response,'body',{get(){calls++;throw Error('PRIVATE_BODY_GETTER');}});Object.defineProperty(stream,'getReader',{value(){calls++;throw Error('PRIVATE_READER');}});
  const run=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id});expect((await run.read(get(run.initial()))).ok).toBe(true);expect(calls).toBe(0);
});
it('cannot invoke global fetch and preserves the same native empty-read quota',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
  try{for(const empty of [16,17]){const response=new Response(new ReadableStream<Uint8Array>({start(ctrl){for(let i=0;i<empty;i++)ctrl.enqueue(new Uint8Array());ctrl.enqueue(encode({result:parentRow(id)}));ctrl.close();}}));
    const run=createInjectedClosedParentResponseReader(clock(),()=>response,{update_set_sys_id:id});expect((await run.read(get(run.initial()))).ok).toBe(empty===16);expect(response.body!.locked).toBe(false);}
    expect(spy).not.toHaveBeenCalled();
  }finally{spy.mockRestore();}
});
it('does not lose a scheduler failure while handing the Response-owned reader to body supervision',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,failed=false,cancels=0,aborts=0;
  const run=createInjectedClosedParentResponseReader({...c,schedule(d,wake){const dispose=c.schedule(d,wake);return ()=>{dispose();if(!failed){failed=true;throw Error('PRIVATE_DISPOSER');}};}},(_r,s)=>{s.addEventListener('abort',()=>{aborts++;});return new Promise<Response>(r=>{resolve=r;});},{update_set_sys_id:id});
  const work=run.read(get(run.initial()));resolve(new Response(new ReadableStream({cancel(){cancels++;}})));
  expect(await work).toEqual({ok:false,code:'internal_review_error'});await flush();expect(run.status().cleanup).toMatchObject({disposition:'unconfirmed',reason:'scheduler_failed'});expect(aborts).toBe(1);expect(cancels).toBe(1);expect(run.status().received_bytes).toBe(0);expect(c.pending()).toBe(0);
});
it.each([
  ['sys_id only',{sys_id:id}],['extra column',{...parentRow(id),name:'PRIVATE_EXTRA'}],['missing state',(({state:_s,...rest})=>rest)(parentRow(id))],['bad mod count',{...parentRow(id),sys_mod_count:'x'}],
])('parses the fixed parent GET fields strictly and rejects %s',async(_name,row)=>{
  const run=createInjectedClosedParentResponseReader(clock(),()=>new Response(encode({result:row})),{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_response'});expect(JSON.stringify(run.status())).not.toContain('PRIVATE_EXTRA');
});
