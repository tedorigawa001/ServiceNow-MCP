import {afterEach,expect,it,vi} from 'vitest';
import {ReadableStream} from 'node:stream/web';
import {createSyntheticBoundStatusWorkflow} from '../../src/review/abort-scope-evidence-status-bound-workflow.js';

const window={purpose:'release',ordinal:1,window_origin_ms:60000,cleanup_floor_ms:50000};
function setup(){
 vi.useFakeTimers();let time=60000,hook=()=>{};
 const owner=createSyntheticBoundStatusWorkflow({fake_io:true,clock:{remainingMs:()=>{hook();return time;}},
  schedule(ms,wake){const t=setTimeout(wake,ms);return ()=>clearTimeout(t);}});
 return {owner,setTime:(n:number)=>{time=n;},setHook:(fn:()=>void)=>{hook=fn;}};
}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
it.each([403,404])('connects release %i to same-reader cleanup and one private consume, never fallback',async status=>{
 const network=vi.fn(()=>{throw Error('NETWORK_FORBIDDEN');});vi.stubGlobal('fetch',network);
 const f=setup(),stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('PRIVATE_BODY'));}});
 const r=await f.owner.run(new Response(stream,{status}),window);
 expect(r).toMatchObject({scope:'synthetic_bound_status_only',outcome:'consumed',http:{purpose:'release',status},cleanup:{disposition:'confirmed',kind:'cancelled'},
  native:{operations:{get_reader:1,read:0,cancel:1,closed:1,release_lock:1},workflow:{counts:{issued:1,consume_attempts:1,consumed:1}}},
  budget:{requests:1,received_bytes:0,payload_bytes:0},reservation:0,formal_issuance:'disabled',fallback:'disabled'});
 expect(r.native.primary).toBe('closed');
 expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));expect(network).not.toHaveBeenCalled();expect(stream.locked).toBe(false);
 expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(vi.getTimerCount()).toBe(0);
 const second=await f.owner.run(new Response(null,{status}),window);expect(second.run_refusal).toBe('invalid_state');expect(second.native.workflow?.counts.consumed).toBe(1);expect(second.budget.requests).toBe(1);
});
it('represents no-body as not-applicable cleanup, never EOF',async()=>{
 const f=setup(),r=await f.owner.run(new Response(null,{status:404}),window);
 expect(r).toMatchObject({outcome:'consumed',cleanup:{kind:'no_body',facts:{reader_owned:false,cancel:'not_applicable',closed:'not_applicable',release:'not_applicable'}},native:{operations:{get_reader:0,read:0,cancel:0,closed:0,release_lock:0}}});
});
it.each([['authentication',401,'authentication_failed'],['parent',403,'access_denied'],['parent',404,'closed']] as const)('keeps %s/%i diagnostic-only',async(purpose,status,reason)=>{
 const f=setup(),r=await f.owner.run(new Response(new ReadableStream(),{status}),{...window,purpose});
 expect(r.http).toMatchObject({purpose,status});expect(r.cleanup?.disposition).toBe('confirmed');expect(r.native.workflow?.counts.consumed).toBe(0);
 expect(r.binding.first_terminal).toBe(reason);expect(r.outcome).toBe(purpose==='parent'&&status===404?'diagnostic_only':'failed');
});
it.each([403,401])('retains HTTP %i and unconfirmed cleanup independently',async status=>{
 const f=setup(),r=await f.owner.run(new Response(new ReadableStream({cancel(){throw Error('PRIVATE_CANCEL');}}),{status}),window);
 expect(r).toMatchObject({outcome:'failed',http:{status},cleanup:{disposition:'unconfirmed',reason:'cancel_rejected'},native:{workflow:{counts:{consumed:0}}}});
 expect(r.binding.primary?.code).toBe(status===401?'authentication_failed':'internal_review_error');expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('cancels while cleanup is pending, joins one cleanup and never consumes',async()=>{
 const f=setup();let finish!:()=>void,calls=0;
 const stream=new ReadableStream({cancel(){calls++;return new Promise<void>(r=>{finish=r;});}});
 const p=f.owner.run(new Response(stream,{status:403}),window);await vi.advanceTimersByTimeAsync(0);
 f.owner.stop();const closing=f.owner.close();finish();const r=await p;await closing;
 expect(r.binding.first_terminal).toBe('cancelled');expect(r.cleanup?.disposition).toBe('confirmed');expect(r.native.workflow?.counts.consumed).toBe(0);
 expect(calls).toBe(1);expect(stream.locked).toBe(false);expect(r.budget).toEqual({requests:1,received_bytes:0,payload_bytes:0});
});
it('freezes a pending cleanup failure and does not promote a late settle',async()=>{
 const f=setup();let finish!:()=>void;
 const p=f.owner.run(new Response(new ReadableStream({cancel(){return new Promise<void>(r=>{finish=r;});}}),{status:403}),window);
 await vi.advanceTimersByTimeAsync(10000);const r=await p,before=f.owner.diagnostics();
 expect(r.cleanup).toMatchObject({disposition:'unconfirmed',reason:'cancel_pending'});expect(r.native.workflow?.counts.consumed).toBe(0);
 finish();await vi.advanceTimersByTimeAsync(0);expect(f.owner.diagnostics()).toEqual(before);expect(vi.getTimerCount()).toBe(0);
});
it.each(['issuing','consuming_pre','consuming_post'])('synchronously invalidates from canonical clock during %s',phase=>{
 const f=setup();let done=false;
 f.setHook(()=>{if(!done&&f.owner.diagnostics().native.workflow?.phase===phase){done=true;f.owner.stop();}});
 return f.owner.run(new Response(null,{status:403}),window).then(r=>{
  expect(done).toBe(true);expect(r.binding.first_terminal).toBe('cancelled');expect(r.cleanup?.disposition).toBe('confirmed');expect(r.native.workflow?.counts.consumed).toBe(0);
 });
});
it('refuses floor expiry after acquisition without replacing the original deadline or cleanup facts',async()=>{
 const f=setup();let finish!:()=>void;
 const p=f.owner.run(new Response(new ReadableStream({cancel(){return new Promise<void>(r=>{finish=r;});}}),{status:403}),window);
 await vi.advanceTimersByTimeAsync(0);f.setTime(50000);finish();const r=await p;
 expect(r.native.primary).toBe('deadline_exceeded');expect(r.native.workflow?.counts.consumed).toBe(0);expect(r.budget.requests).toBe(1);
});
it('rejects replay/reentry without additional C and keeps the first terminal diagnostic',async()=>{
 const f=setup();let finish!:()=>void;
 const p=f.owner.run(new Response(new ReadableStream({cancel(){return new Promise<void>(r=>{finish=r;});}}),{status:403}),window);
 await vi.advanceTimersByTimeAsync(0);await f.owner.run(new Response(null,{status:403}),window);finish();const r=await p;
 expect(r.binding.first_terminal).toBe('invalid_state');expect(r.native.workflow?.counts.consumed).toBe(0);expect(r.budget.requests).toBe(1);
});
it('rejects invalid descriptors and close-before-start before any simulated dispatch',async()=>{
 const a=setup();expect((await a.owner.run(new Response(null,{status:403}),{...window,extra:'PRIVATE'})).budget.requests).toBe(0);
 const b=setup();const closing=b.owner.close();expect((await b.owner.run(new Response(null,{status:403}),window)).budget.requests).toBe(0);await closing;
});
it.each([[60000,0],[60000,30000],[30000,25000],[60000,9999]])('rejects owner-invalid window %i/%i before reserve or simulated dispatch',async(origin,floor)=>{
 const f=setup(),r=await f.owner.run(new Response(new ReadableStream(),{status:403}),{...window,window_origin_ms:origin,cleanup_floor_ms:floor});
 expect(r).toMatchObject({outcome:'failed',budget:{requests:0},reservation:0,native:{operations:{get_reader:0}}});expect(r.binding.first_terminal).toBe('invalid_input');
});
it.each(['session','binding','registry','terminal','cleanup','consumer'])('rejects caller-provided %s at the fake root',key=>{
 expect(()=>createSyntheticBoundStatusWorkflow({fake_io:true,clock:{remainingMs:()=>60000},schedule:()=>()=>{},[key]:{}})).toThrow('invalid_input');
});
it('does not accept public diagnostics or a foreign opaque handle as a Response',async()=>{
 const a=setup(),r=await a.owner.run(new Response(null,{status:403}),window),b=setup();
 const wrong=await b.owner.run(r,window);expect(wrong.outcome).toBe('failed');expect(wrong.native.workflow?.counts.consumed).toBe(0);expect(a.owner.diagnostics()).toEqual(r);
});
it('rejects an already owned Response without touching the first owner history',async()=>{
 const a=setup(),response=new Response(null,{status:403}),r=await a.owner.run(response,window),b=setup();
 expect((await b.owner.run(response,window)).outcome).toBe('failed');expect(a.owner.diagnostics()).toEqual(r);
});
it('rejects accessor/proxy inputs without invoking caller code',()=>{
 const getter=vi.fn(()=>{throw Error('PRIVATE_GET');});
 const raw={fake_io:true,clock:{remainingMs:()=>60000},schedule:()=>()=>{}};
 Object.defineProperty(raw,'clock',{get:getter});expect(()=>createSyntheticBoundStatusWorkflow(raw as never)).toThrow('invalid_input');
 expect(()=>createSyntheticBoundStatusWorkflow(new Proxy(raw,{ownKeys:getter}) as never)).toThrow('invalid_input');expect(getter).not.toHaveBeenCalled();
});
it.each(['cancelled','expired'] as const)('stops %s before acquiring a reader or charging C',async mode=>{
 const f=setup();if(mode==='cancelled')f.owner.stop();else f.setTime(0);
 const r=await f.owner.run(new Response(new ReadableStream(),{status:403}),window);
 expect(r.outcome).toBe('failed');expect(r.binding.first_terminal).toBe(mode==='cancelled'?'cancelled':'deadline_exceeded');
 expect(r.budget.requests).toBe(0);expect(r.native.operations.get_reader).toBe(0);expect(r.native.workflow?.counts.consumed).toBe(0);
});
