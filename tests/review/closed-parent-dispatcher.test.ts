import {expect,it,vi} from 'vitest';
import {createFakeClosedParentDispatcher,type FakeClosedAttemptIo} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const id='a'.repeat(32);
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const job={deadline,wake};jobs.add(job);return ()=>{jobs.delete(job);};},advance(n:number){now=n;for(const j of [...jobs])if(j.deadline<=now){jobs.delete(j);j.wake();}},pending:()=>jobs.size};}
function io():FakeClosedAttemptIo{const bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:id}}));let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,bytes}),closed:Promise.resolve(),cancel:async()=>{},abort(){},release(){}};}
it('dispatches a fixed parent GET after the same attempt charge and returns only a synthetic summary',async()=>{
  const c=clock(),observed:{url:string;ordinal:number;purpose:string;requests:number;signal:AbortSignal;auth:object}[]=[];
  const run=createFakeClosedParentDispatcher(c,(request,signal,auth)=>{observed.push({...request,requests:run.status().requests,signal,auth});return io();},{update_set_sys_id:id});
  const request=get(run.initial()),result=get(await run.read(request));
  expect(result).toMatchObject({records:1,synthetic:true,evidence_issuance:'disabled'});
  const expected=new URL(`https://closed-dispatch.invalid/api/now/table/sys_update_set/${id}`);
  expected.search=new URLSearchParams({sysparm_fields:'sys_id,state,application,sys_updated_on,sys_mod_count',sysparm_display_value:'false',sysparm_exclude_reference_link:'true'}).toString();
  for(const listOnly of ['sysparm_query','sysparm_limit','sysparm_offset','sysparm_no_count'])expect(new URL(observed[0]!.url).searchParams.has(listOnly)).toBe(false);
  expect(observed).toHaveLength(1);expect(observed[0]).toMatchObject({url:expected.href,ordinal:1,purpose:'parent_initial',requests:1});
  expect(observed[0].signal.aborted).toBe(false);expect(Object.isFrozen(observed[0].auth)).toBe(true);
  expect(run.status()).toMatchObject({requests:1,dispatches:1,formal_issuance:'disabled',cleanup:{disposition:'confirmed',kind:'eof'}});expect(c.pending()).toBe(0);
});
it('does not dispatch a foreign or copied logical request even when its target is identical',async()=>{
  for(const copied of [false,true]){
    let calls=0;const a=createFakeClosedParentDispatcher(clock(),()=>io(),{update_set_sys_id:id}),b=createFakeClosedParentDispatcher(clock(),()=>{calls++;return io();},{update_set_sys_id:id});
    const handle=get(a.initial()),before=a.status(),mixed=copied?Object.freeze({...handle}):handle;
    expect(await b.read(mixed as typeof handle)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(calls).toBe(0);expect(b.status().requests).toBe(0);expect(a.status()).toEqual(before);
  }
});
it('refuses unsupported caller URL, purpose or auth configuration before any dispatch',()=>{
  for(const extra of [{url:'https://foreign.invalid'},{purpose:'metadata_initial'},{authContext:{}},{origin:'https://foreign.invalid'},{update_set_sys_id:'x'}]){
    let calls=0;expect(()=>createFakeClosedParentDispatcher(clock(),()=>{calls++;return io();},{update_set_sys_id:id,...extra})).toThrow('invalid_input');expect(calls).toBe(0);
  }
});
it('does not dispatch after the soft cutoff or cancellation and never refunds the final reservations',async()=>{
  for(const cancelled of [false,true]){let calls=0;const c=clock(),run=createFakeClosedParentDispatcher(c,()=>{calls++;return io();},{update_set_sys_id:id}),h=get(run.initial());
    if(cancelled)run.cancel();else c.advance(50000);
    expect(await run.read(h)).toEqual({ok:false,code:cancelled?'cancelled':'phase_deadline_exceeded'});expect(calls).toBe(0);expect(run.status()).toMatchObject({requests:0,dispatches:0});expect(c.pending()).toBe(0);
  }
});
it('accounts a synchronous dispatcher throw once and suppresses its secret exception',async()=>{
  let calls=0;const run=createFakeClosedParentDispatcher(clock(),()=>{calls++;throw Error('PRIVATE_DISPATCH_SECRET');},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});expect(await run.read(h)).toEqual({ok:false,code:'upstream_unavailable'});
  expect(run.status()).toMatchObject({requests:1,dispatches:1});expect(calls).toBe(1);expect(JSON.stringify(run.status())).not.toContain('PRIVATE_DISPATCH_SECRET');
});
it('refuses retry when pending I/O cannot confirm cleanup and aborts the same dispatch signal',async()=>{
  const c=clock(),seen:{ordinal:number;signal:AbortSignal;auth:object;url:string}[]=[];let cancelled=0;
  const run=createFakeClosedParentDispatcher(c,(request,signal,auth)=>{seen.push({...request,signal,auth});return seen.length===1?{read:()=>new Promise(()=>{}),closed:new Promise(()=>{}),cancel:async()=>{cancelled++;},abort(){},release(){}}:io();},{update_set_sys_id:id});
  const h=get(run.initial()),work=run.read(h);c.advance(9750);await Promise.resolve();c.advance(10000);
  // An unsettled fake read/closed is not a cleaned-up timeout and must never retry.
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});expect((await run.read(h)).ok).toBe(false);expect(seen).toHaveLength(1);expect(seen[0].signal.aborted).toBe(true);expect(cancelled).toBe(1);
});
it('observes and rejects an accidentally asynchronous dispatcher without leaking its rejection',async()=>{
  const run=createFakeClosedParentDispatcher(clock(),(()=>Promise.reject(Error('PRIVATE_ASYNC_SECRET'))) as unknown as ()=>FakeClosedAttemptIo,{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'invalid_input'});expect(run.status()).toMatchObject({requests:1,dispatches:1});
  await new Promise(resolve=>setImmediate(resolve));expect(JSON.stringify(run.status())).not.toContain('PRIVATE_ASYNC_SECRET');
});
it('retries confirmed cancellation with the same logical URL/auth and a fresh signal, without resetting C/G',async()=>{
  const c=clock(),seen:{signal:AbortSignal;auth:object;ordinal:number;url:string}[]=[];let releases=0;
  const run=createFakeClosedParentDispatcher(c,(request,signal,auth)=>{
    seen.push({...request,signal,auth});expect(Object.isFrozen(request)).toBe(true);
    if(seen.length>1)return io();
    let endRead!:(value:{done:boolean})=>void,endClosed!:()=>void;
    const closed=new Promise<void>(resolve=>{endClosed=resolve;});
    return {read:()=>new Promise(resolve=>{endRead=resolve;}),closed,cancel:async()=>{endRead({done:true});endClosed();},abort(){},release(){releases++;}};
  },{update_set_sys_id:id});
  const h=get(run.initial()),work=run.read(h);c.advance(9750);expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});
  expect(get(await run.read(h))).toMatchObject({records:1});expect(seen.map(x=>x.ordinal)).toEqual([1,2]);expect(seen[0].auth).toBe(seen[1].auth);expect(seen[0].url).toBe(seen[1].url);
  expect(seen[0].signal).not.toBe(seen[1].signal);expect(seen.map(x=>x.signal.aborted)).toEqual([true,false]);expect(releases).toBe(1);expect(run.status()).toMatchObject({requests:2,dispatches:2});expect(c.pending()).toBe(0);
});
it('rejects a Proxy I/O result without invoking arbitrary result getters',async()=>{
  let getters=0;const raw=new Proxy(io(),{get(){getters++;throw Error('PRIVATE_GETTER');}}),run=createFakeClosedParentDispatcher(clock(),()=>raw,{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'invalid_input'});expect(getters).toBe(0);expect(run.status()).toMatchObject({requests:1,dispatches:1});
});
it('uses the same private auth context and URL at the ordered final parent position',async()=>{
  const seen:{auth:object;purpose:string;url:string;ordinal:number}[]=[],run=createFakeClosedParentDispatcher(clock(),(r,_s,auth)=>{seen.push({...r,auth});return io();},{update_set_sys_id:id});
  get(await run.read(get(run.initial())));get(await run.read(get(run.final())));
  expect(seen.map(x=>x.purpose)).toEqual(['parent_initial','parent_final']);expect(seen.map(x=>x.ordinal)).toEqual([1,1]);expect(seen[0].url).toBe(seen[1].url);expect(seen[0].auth).toBe(seen[1].auth);
  expect(run.status()).toMatchObject({requests:2,dispatches:2});
});
it('rejects a final request before a successful initial observation without dispatching',()=>{
  let calls=0;const run=createFakeClosedParentDispatcher(clock(),()=>{calls++;return io();},{update_set_sys_id:id});
  expect(run.final()).toEqual({ok:false,code:'invalid_state'});expect(calls).toBe(0);expect(run.status().requests).toBe(0);
});
it('refuses replay of a consumed request and a third attempt after two confirmed timeouts',async()=>{
  const completed=createFakeClosedParentDispatcher(clock(),()=>io(),{update_set_sys_id:id}),h=get(completed.initial());get(await completed.read(h));expect((await completed.read(h)).ok).toBe(false);expect(completed.status().requests).toBe(1);
  const c=clock();let calls=0;const run=createFakeClosedParentDispatcher(c,()=>{calls++;let read!:(v:{done:boolean})=>void,closed!:()=>void;return {read:()=>new Promise(resolve=>{read=resolve;}),closed:new Promise<void>(resolve=>{closed=resolve;}),cancel:async()=>{read({done:true});closed();},abort(){},release(){}};},{update_set_sys_id:id}),request=get(run.initial());
  for(const cutoff of [9750,19500]){const work=run.read(request);c.advance(cutoff);expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});}
  expect((await run.read(request)).ok).toBe(false);expect(calls).toBe(2);expect(run.status().requests).toBe(2);expect(c.pending()).toBe(0);
});
it('reentrant cancellation in dispatch aborts that same signal and never reads or starts another request',async()=>{
  let reads=0,aborts=0,cancels=0;let signal!:AbortSignal;
  const run=createFakeClosedParentDispatcher(clock(),(_r,s)=>{signal=s;s.addEventListener('abort',()=>{aborts++;run.cancel();});run.cancel();return {...io(),read:async()=>{reads++;return {done:true};},cancel:async()=>{cancels++;}};},{update_set_sys_id:id}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'cancelled'});expect(reads).toBe(0);expect(signal.aborted).toBe(true);expect(aborts).toBe(1);expect(cancels).toBe(1);expect(run.status().requests).toBe(1);
});
it('respects the original request reservation floor and rejects dispatch when no ordinary attempt is available',async()=>{
  let calls=0;const run=createFakeClosedParentDispatcher(clock(),()=>{calls++;return io();},{update_set_sys_id:id,session:{accounting:{requests:4}}}),h=get(run.initial());
  expect(await run.read(h)).toEqual({ok:false,code:'request_budget_exceeded'});expect(calls).toBe(0);expect(run.status().requests).toBe(0);
});
it('never invokes accessor fields of an injected I/O result',async()=>{
  let getters=0;const fake={...io()};Object.defineProperty(fake,'read',{get(){getters++;throw Error('PRIVATE_ACCESSOR');}});
  const run=createFakeClosedParentDispatcher(clock(),()=>fake,{update_set_sys_id:id});expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_input'});expect(getters).toBe(0);
});
it('does not accept an auth context or a display descriptor as a logical request authority',async()=>{
  let auth!:object,descriptor!:object;const a=createFakeClosedParentDispatcher(clock(),(r,_s,context)=>{auth=context;descriptor=r;return io();},{update_set_sys_id:id});
  get(await a.read(get(a.initial())));
  for(const foreign of [auth,descriptor,{...descriptor,url:'https://foreign.invalid'},Object.freeze(Object.create(null))]){
    let calls=0;const b=createFakeClosedParentDispatcher(clock(),()=>{calls++;return io();},{update_set_sys_id:id});
    expect(await b.read(foreign as Parameters<typeof b.read>[0])).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(b.status().requests).toBe(0);expect(calls).toBe(0);
  }
});
it('pins immutable auth and request views and never exposes them through status or summary',async()=>{
  const run=createFakeClosedParentDispatcher(clock(),(r,_s,auth)=>{expect(Reflect.set(r,'url','https://foreign.invalid')).toBe(false);expect(Reflect.set(auth,'token','PRIVATE_TOKEN')).toBe(false);expect(Object.keys(auth)).toEqual([]);return io();},{update_set_sys_id:id});
  const summary=get(await run.read(get(run.initial()))),publicJson=JSON.stringify({summary,status:run.status()});
  for(const privateText of [id,'closed-dispatch.invalid','PRIVATE_TOKEN','authContext','sysparm_fields'])expect(publicJson).not.toContain(privateText);
});
it('rejects Response, resolved Promise and thenable results without reading a body or invoking then',async()=>{
  let thenCalls=0;const response=new Response('PRIVATE_BODY'),thenable={then(){thenCalls++;throw Error('PRIVATE_THEN');}};
  for(const value of [response,Promise.resolve(response),thenable]){
    const run=createFakeClosedParentDispatcher(clock(),(()=>value) as unknown as ()=>FakeClosedAttemptIo,{update_set_sys_id:id});
    expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_input'});expect(run.status()).toMatchObject({requests:1,received_bytes:0});expect(response.bodyUsed).toBe(false);
  }expect(thenCalls).toBe(0);
});
it('observes a rejected closed promise even when another I/O field is invalid',async()=>{
  const raw={...io(),read:undefined,closed:Promise.reject(Error('PRIVATE_CLOSED_SECRET'))},run=createFakeClosedParentDispatcher(clock(),(()=>raw) as unknown as ()=>FakeClosedAttemptIo,{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_input'});await new Promise(resolve=>setImmediate(resolve));expect(JSON.stringify(run.status())).not.toContain('PRIVATE_CLOSED_SECRET');
});
it('cannot fall through to global fetch and closes permanently without dispatching after close',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
  try{let calls=0;const run=createFakeClosedParentDispatcher(clock(),()=>{calls++;return io();},{update_set_sys_id:id}),h=get(run.initial());run.close();expect(await run.read(h)).toEqual({ok:false,code:'closed'});expect(calls).toBe(0);expect(spy).not.toHaveBeenCalled();expect(run.status().requests).toBe(0);}
  finally{spy.mockRestore();}
});
it('aborts the same signal after a dispatcher result is refused, without losing the primary reason',async()=>{
  let signal!:AbortSignal,aborts=0;const run=createFakeClosedParentDispatcher(clock(),(_r,s)=>{signal=s;s.addEventListener('abort',()=>{aborts++;run.cancel();});return new Response('ignored') as unknown as FakeClosedAttemptIo;},{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'invalid_input'});expect(signal.aborted).toBe(true);expect(aborts).toBe(1);expect(run.status()).toMatchObject({requests:1,dispatches:1,primary:{code:'invalid_input'}});
});
