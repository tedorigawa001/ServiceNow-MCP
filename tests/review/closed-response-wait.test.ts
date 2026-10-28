import {expect,it,vi} from 'vitest';
import {createInjectedClosedParentResponseWait} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
import {createFakeClosedBodyGate} from '../../src/review/abort-scope-evidence-closed-body-gate.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const id='a'.repeat(32);
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const j={deadline,wake};jobs.add(j);return ()=>{jobs.delete(j);};},advance(n:number){now=n;for(const j of [...jobs])if(j.deadline<=now){jobs.delete(j);j.wake();}},pending:()=>jobs.size};}
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
it('aborts a pending Response at the original I/O cutoff and keeps dispatch-pending cleanup unconfirmed',async()=>{
  const c=clock();let signal!:AbortSignal;
  const run=createInjectedClosedParentResponseWait(c,(_r,s)=>{signal=s;return new Promise<Response>(()=>{});},{update_set_sys_id:id}),request=get(run.initial());
  const work=run.wait(request);c.advance(9750);await flush();expect(signal.aborted).toBe(true);expect(run.status().active).toBe(true);
  c.advance(10000);expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});
  expect(run.status()).toMatchObject({requests:1,received_bytes:0,attempt_failure:'attempt_deadline_exceeded',cleanup:{disposition:'unconfirmed',reason:'dispatch_pending'}});expect(c.pending()).toBe(0);
});
it('discards an owned Response without a reader, bytes charge, EOF or body receipt',async()=>{
  const c=clock();let cancels=0;const response=new Response(new ReadableStream<Uint8Array>({cancel(){cancels++;}}));
  const run=createInjectedClosedParentResponseWait(c,()=>response,{update_set_sys_id:id});
  expect(get(await run.wait(get(run.initial())))).toEqual({response_wait_completed:true,body_adopted:false,synthetic:true,evidence_issuance:'disabled'});
  expect(cancels).toBe(1);expect(run.status()).toMatchObject({requests:1,received_bytes:0,cleanup:{disposition:'confirmed',kind:'cancelled'},operations:{reads:0,releases:0,cancels:1}});expect(c.pending()).toBe(0);
});
it('retains a local timeout when abort settles dispatch, and retries on the same purpose/auth/budget with a fresh signal',async()=>{
  const c=clock(),seen:{auth:object;signal:AbortSignal;url:string;ordinal:number}[]=[];
  const run=createInjectedClosedParentResponseWait(c,(r,signal,auth)=>{seen.push({...r,auth,signal});return seen.length===1?new Promise<Response>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('PRIVATE_ABORT')))):new Response('not parsed');},{update_set_sys_id:id});
  const h=get(run.initial()),first=run.wait(h);c.advance(9750);expect(await first).toEqual({ok:false,code:'attempt_deadline_exceeded'});
  expect(run.status()).toMatchObject({primary:null,cleanup:{disposition:'confirmed',kind:null}});expect((await run.wait(h)).ok).toBe(true);
  expect(seen.map(x=>x.ordinal)).toEqual([1,2]);expect(seen[0].auth).toBe(seen[1].auth);expect(seen[0].url).toBe(seen[1].url);expect(seen[0].signal).not.toBe(seen[1].signal);
  expect(run.status()).toMatchObject({requests:2,received_bytes:0,dispatches:2});expect(c.pending()).toBe(0);
});
it('does not invoke a thenable or overridden Promise.then from a dispatcher result',async()=>{
  let calls=0;const raw={then(){calls++;throw Error('PRIVATE_THEN');}};
  const run=createInjectedClosedParentResponseWait(clock(),(()=>raw) as unknown as ()=>Response,{update_set_sys_id:id});
  expect((await run.wait(get(run.initial()))).ok).toBe(false);expect(calls).toBe(0);
  const work=Promise.resolve(new Response('ignored'));Object.defineProperty(work,'then',{value(){calls++;throw Error('PRIVATE_OVERRIDE');}});
  const valid=createInjectedClosedParentResponseWait(clock(),()=>work,{update_set_sys_id:id});expect((await valid.wait(get(valid.initial()))).ok).toBe(true);expect(calls).toBe(0);
});
it('waits for Response body cancellation and rejects the exact cleanup boundary without fabricating a released reader',async()=>{
  const c=clock();let finish!:()=>void;const response=new Response(new ReadableStream({cancel:()=>new Promise<void>(resolve=>{finish=resolve;})}));
  const run=createInjectedClosedParentResponseWait(c,()=>response,{update_set_sys_id:id}),work=run.wait(get(run.initial()));await flush();expect(run.status().active).toBe(true);c.advance(250);
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});const report=run.status().cleanup;expect(report).toMatchObject({reason:'response_cancel_pending',kind:null});finish();await flush();expect(run.status().cleanup).toEqual(report);expect(run.status().operations.releases).toBe(0);expect(c.pending()).toBe(0);
});
it('keeps body cancellation rejection separate from the primary failure and does not expose its error',async()=>{
  const response=new Response(new ReadableStream({cancel(){throw Error('PRIVATE_CANCEL');}})),run=createInjectedClosedParentResponseWait(clock(),()=>response,{update_set_sys_id:id});
  expect(await run.wait(get(run.initial()))).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(run.status().cleanup).toMatchObject({reason:'response_cancel_rejected'});expect(JSON.stringify(run.status())).not.toContain('PRIVATE_CANCEL');
});
it.each(['cancel','close'] as const)('handles %s during pending dispatch, preserving its reason after abort-triggered rejection',async method=>{
  const c=clock();let signal!:AbortSignal;const run=createInjectedClosedParentResponseWait(c,(_r,s)=>{signal=s;return new Promise<Response>((_resolve,reject)=>s.addEventListener('abort',()=>reject(Error('PRIVATE_REJECT'))));},{update_set_sys_id:id});
  const work=run.wait(get(run.initial()));run[method]();expect(await work).toEqual({ok:false,code:method==='cancel'?'cancelled':'closed'});expect(signal.aborted).toBe(true);expect(run.status()).toMatchObject({cleanup:{disposition:'confirmed',kind:null},requests:1});expect(c.pending()).toBe(0);
});
it('cleans only a late Response owned by that old attempt without repairing its terminal report',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,cancels=0;
  const run=createInjectedClosedParentResponseWait(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.wait(get(run.initial()));c.advance(9750);await flush();c.advance(10000);await work;
  const before=run.status();resolve(new Response(new ReadableStream({cancel(){cancels++;}})));await flush();expect(cancels).toBe(1);
  expect(run.status().cleanup).toEqual(before.cleanup);expect(run.status().primary).toEqual(before.primary);expect(run.status().received_bytes).toBe(0);expect(run.status().operations.reads).toBe(0);expect(c.pending()).toBe(0);
});
it('does not cancel or unlock a late Response body locked by a foreign reader',async()=>{
  const c=clock();let resolve!:(r:Response)=>void,cancels=0;const response=new Response(new ReadableStream({cancel(){cancels++;}})),reader=response.body!.getReader();void reader.closed.catch(()=>{});
  const run=createInjectedClosedParentResponseWait(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.wait(get(run.initial()));c.advance(10000);await flush();await work;
  try{resolve(response);await flush();expect(cancels).toBe(0);expect(response.body!.locked).toBe(true);expect(run.status().cleanup.reason).toBe('dispatch_pending');}
  finally{await reader.cancel();reader.releaseLock();}
});
it('uses the original cleanup anchor when a Response arrives during timeout cleanup',async()=>{
  const c=clock();let resolve!:(r:Response)=>void;const run=createInjectedClosedParentResponseWait(c,()=>new Promise<Response>(r=>{resolve=r;}),{update_set_sys_id:id}),work=run.wait(get(run.initial()));
  c.advance(9750);await flush();c.advance(9990);resolve(new Response('discard'));await flush();expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(run.status().cleanup.disposition).toBe('confirmed');expect(c.pending()).toBe(0);
});
it.each([201,302,429,500,204])('refuses unimplemented HTTP status %i without adopting its body',async status=>{
  let cancels=0;const response=new Response(status===204?null:new ReadableStream({cancel(){cancels++;}}),{status}),run=createInjectedClosedParentResponseWait(clock(),()=>response,{update_set_sys_id:id});
  expect(await run.wait(get(run.initial()))).toEqual({ok:false,code:'invalid_response'});expect(run.status().cleanup.disposition).toBe('confirmed');expect(run.status().received_bytes).toBe(0);expect(cancels).toBe(status===204?0:1);
});
it('refuses a null 200 body and never claims an EOF or lock release',async()=>{
  const run=createInjectedClosedParentResponseWait(clock(),()=>new Response(null),{update_set_sys_id:id});expect(await run.wait(get(run.initial()))).toEqual({ok:false,code:'invalid_response'});expect(run.status()).toMatchObject({cleanup:{disposition:'confirmed',kind:null},operations:{reads:0,releases:0,cancels:0}});
});
it('refuses a replayed Response without cancelling it again or changing its first owner',async()=>{
  let cancels=0;const response=new Response(new ReadableStream({cancel(){cancels++;}})),a=createInjectedClosedParentResponseWait(clock(),()=>response,{update_set_sys_id:id});get(await a.wait(get(a.initial())));const before=a.status();
  const b=createInjectedClosedParentResponseWait(clock(),()=>response,{update_set_sys_id:id});expect(await b.wait(get(b.initial()))).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(cancels).toBe(1);expect(a.status()).toEqual(before);expect(b.status().cleanup.reason).toBe('response_ownership_unknown');
});
it.each(['proxy','forged','plain'] as const)('refuses %s Response without invoking caller getters',async kind=>{
  let calls=0;const raw=kind==='proxy'?new Proxy(new Response('ignored'),{get(){calls++;throw Error('PRIVATE_PROXY');}}):kind==='forged'?Object.create(Response.prototype):{get body(){calls++;throw Error('PRIVATE_BODY');}};
  const run=createInjectedClosedParentResponseWait(clock(),(()=>raw) as ()=>Response,{update_set_sys_id:id});expect(await run.wait(get(run.initial()))).toEqual({ok:false,code:'invalid_response'});expect(calls).toBe(0);expect(run.status().operations.reads).toBe(0);
});
it('ignores caller Response getter overrides while pinning native body ownership',async()=>{
  let calls=0;class Hostile extends Response{get status():number{calls++;throw Error('PRIVATE_STATUS');}get body():ReadableStream<Uint8Array>|null{calls++;throw Error('PRIVATE_BODY');}get url():string{calls++;return 'https://foreign.invalid';}}
  const response=new Response('ignored');Object.setPrototypeOf(response,Hostile.prototype);
  const run=createInjectedClosedParentResponseWait(clock(),()=>response,{update_set_sys_id:id});expect((await run.wait(get(run.initial()))).ok).toBe(true);expect(calls).toBe(0);
});
it('checks cutoff, cancellation and reservation capacity before invoking the dispatcher',async()=>{
  for(const reason of ['cutoff','cancel','capacity'] as const){const c=clock();let calls=0;
    const run=createInjectedClosedParentResponseWait(c,()=>{calls++;return new Response('ignored');},{update_set_sys_id:id,...(reason==='capacity'?{session:{accounting:{requests:4}}}:{})}),h=get(run.initial());
    if(reason==='cutoff')c.advance(50000);if(reason==='cancel')run.cancel();
    expect(await run.wait(h)).toEqual({ok:false,code:reason==='cutoff'?'phase_deadline_exceeded':reason==='cancel'?'cancelled':'request_budget_exceeded'});expect(calls).toBe(0);expect(run.status().requests).toBe(0);expect(c.pending()).toBe(0);
  }
});
it('rejects foreign/copied request handles before C and leaves their issuing owner unchanged',async()=>{
  const a=createInjectedClosedParentResponseWait(clock(),()=>new Response('ignored'),{update_set_sys_id:id}),h=get(a.initial()),before=a.status();
  for(const handle of [h,{...h}]){const b=createInjectedClosedParentResponseWait(clock(),()=>{throw Error('NOT_CALLED');},{update_set_sys_id:id});expect(await b.wait(handle as typeof h)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(b.status().requests).toBe(0);expect(a.status()).toEqual(before);}
});
it.each(['throw','reject'] as const)('charges spontaneous dispatch %s once and preserves its fixed primary',async kind=>{
  const run=createInjectedClosedParentResponseWait(clock(),()=>{if(kind==='throw')throw Error('PRIVATE_UPSTREAM');return Promise.reject(Error('PRIVATE_UPSTREAM'));},{update_set_sys_id:id});
  expect(await run.wait(get(run.initial()))).toEqual({ok:false,code:'upstream_unavailable'});expect(run.status()).toMatchObject({requests:1,dispatches:1,cleanup:{disposition:'confirmed',kind:null}});expect(JSON.stringify(run.status())).not.toContain('PRIVATE_UPSTREAM');
});
it('denies replay and a third retry without a new attempt or auth context',async()=>{
  const c=clock();let calls=0;const run=createInjectedClosedParentResponseWait(c,(_r,s)=>{calls++;return new Promise<Response>((_resolve,reject)=>s.addEventListener('abort',()=>reject(Error())));},{update_set_sys_id:id}),h=get(run.initial());
  for(const time of [9750,19500]){const work=run.wait(h);c.advance(time);expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});}
  expect((await run.wait(h)).ok).toBe(false);expect(calls).toBe(2);expect(run.status().requests).toBe(2);expect(c.pending()).toBe(0);
});
it('rejects concurrent wait and stops the original resource without a second dispatch',async()=>{
  const c=clock();const run=createInjectedClosedParentResponseWait(c,(_r,s)=>new Promise<Response>((_resolve,reject)=>s.addEventListener('abort',()=>reject(Error()))),{update_set_sys_id:id}),h=get(run.initial()),first=run.wait(h);
  expect(await run.wait(h)).toEqual({ok:false,code:'invalid_state'});expect(await first).toEqual({ok:false,code:'invalid_state'});expect(run.status()).toMatchObject({requests:1,dispatches:1,cleanup:{disposition:'confirmed'}});expect(c.pending()).toBe(0);
});
it('does not rearm cleanup when Response cancellation reenters close and does not expose body or URL',async()=>{
  const c=clock();let cancels=0;const run=createInjectedClosedParentResponseWait(c,()=>new Response(new ReadableStream({cancel(){cancels++;run.close();}})),{update_set_sys_id:id});
  expect(await run.wait(get(run.initial()))).toEqual({ok:false,code:'closed'});expect(cancels).toBe(1);expect(run.status().cleanup.disposition).toBe('confirmed');expect(c.pending()).toBe(0);
  for(const text of [id,'closed-dispatch.invalid','sysparm_fields'])expect(JSON.stringify(run.status())).not.toContain(text);
});
it('cannot call global fetch even when a normal injected Response is delivered',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
  try{const run=createInjectedClosedParentResponseWait(clock(),()=>new Response('PRIVATE_BODY'),{update_set_sys_id:id});const result=await run.wait(get(run.initial()));expect(result.ok).toBe(true);expect(JSON.stringify(result)).not.toContain('PRIVATE_BODY');expect(spy).not.toHaveBeenCalled();}
  finally{spy.mockRestore();}
});
it('does not permit the unopened discard to assert success, mint a candidate or settle after even an empty append',()=>{
  for(const mode of ['success','appended','empty'] as const){const gate=createFakeClosedBodyGate({now:()=>0}),s=get(gate.construct({accounting:{body_mode:'bytes'}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));
    if(mode!=='success')get(port.body!.append(a,0,new Uint8Array(mode==='empty'?0:1)));
    expect(port.finishUnopened(a,(mode==='success'?'success':'unavailable') as 'unavailable')).toEqual({ok:false,code:'invalid_state'});expect(port.body!.diagnostic().consumes).toBe(0);expect(gate.refuseBody(s,r,t).ok).toBe(false);
  }
});
it('settles an unopened discard once without body candidates, reader facts or body bytes',()=>{
  const gate=createFakeClosedBodyGate({now:()=>0}),s=get(gate.construct({accounting:{body_mode:'bytes'}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),p=get(port.openPurpose({kind:'parent_initial'})),a=get(port.dispatch(p));
  get(port.finishUnopened(a,'unavailable'));expect(port.body!.diagnostic()).toMatchObject({cleanup:{disposition:'confirmed',kind:null},consumes:0,retained_bytes:0,pending:false});expect(port.finishUnopened(a,'unavailable').ok).toBe(false);
});
