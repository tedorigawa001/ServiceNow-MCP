import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,claimPrivateCompositionSource,type ReadSnapshot,type BoundedReadOptions} from '../../src/servicenow/bounded-read.js';
import {BoundedUpdateSetSource,parseBoundedSourceInput} from '../../src/review/bounded-source.js';
const id='a'.repeat(32),parent={sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-31',sys_mod_count:'0'};
const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const snapshot=():ReadSnapshot=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused'}});
const profile=()=>({parent_bytes:encode({result:parent}),release_status:403 as const,cleanup:'cancelled' as const});
const probe=(change:Record<string,unknown>={},options:Pick<BoundedReadOptions,'signal'|'limits'>={})=>BoundedReadSession.probeNewStatusAcceptance(snapshot(),{update_set_sys_id:id},{...options,synthetic_status:{...profile(),...change} as never});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('binds the real source and session continuation before close, without a permit or fallback',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
 const r=await BoundedReadSession.probeNewStatusAcceptance(snapshot(),{update_set_sys_id:id},
  {synthetic_status:{parent_bytes:encode({result:parent}),release_status:403,cleanup:'cancelled'}});
 expect(r).toMatchObject({state:'status_accepted_closed_gate',fake_io:true,accepted_before_close:true,consumptions:1,ready_generation:1,
  status:403,cleanup_kind:'cancelled',fallback:'disabled',evidence_issuance:'disabled',release_permit:'unavailable',cleanup:'closed',reserved:0,
  budget:{requests:2,received_bytes:encode({result:parent}).length,payload_bytes:0}});
 expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(r)).not.toMatch(/PRIVATE|sys_updated_on|instance_release/);
 expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));expect(Object.isFrozen(r.permissions)).toBe(true);
});
it.each([403,404] as const)('accepts %i/no_body as a closed-gate source fact, never EOF or release evidence',async status=>{
 expect(await probe({release_status:status,cleanup:'no_body'})).toMatchObject({state:'status_accepted_closed_gate',status,cleanup_kind:'no_body',consumptions:1,release_permit:'unavailable'});
});
it('does not reenter legacy GET, public source reads or the release/permit decision',async()=>{
 const methods=[vi.spyOn(BoundedReadSession.prototype,'get'),vi.spyOn(BoundedUpdateSetSource.prototype,'readParent'),vi.spyOn(BoundedUpdateSetSource.prototype,'resolveRelease'),vi.spyOn(BoundedReadSession.prototype,'bindReviewReleaseSource')];
 for(const method of methods)method.mockImplementation(()=>{throw Error('LEGACY_OR_FALLBACK_FORBIDDEN');});
 expect((await probe()).consumptions).toBe(1);for(const method of methods)expect(method).not.toHaveBeenCalled();
});
it('refuses unconfirmed cleanup and closes without calling fallback',async()=>{
 vi.useFakeTimers();await expect(probe({cleanup:'unconfirmed'})).rejects.toMatchObject({code:'internal_review_error'});
 expect(vi.getTimerCount()).toBe(0);expect((await probe()).cleanup).toBe('closed');expect(vi.getTimerCount()).toBe(0);
});
it.each([new Uint8Array([0xff]),encode({result:{...parent,sys_id:'b'.repeat(32)}}),encode({result:{...parent,script:'PRIVATE'}})])('rejects malformed/foreign parent data before status acceptance',async parentBytes=>{
 await expect(probe({parent_bytes:parentBytes})).rejects.toMatchObject({code:'invalid_response'});expect((await probe()).cleanup).toBe('closed');
});
it.each([{release_status:200},{release_status:401},{cleanup:{disposition:'confirmed'}},{session:{}},{fetch:()=>{}},{delay_ms:10001}])('rejects non-profile input before creating authority',async change=>{
 await expect(probe(change)).rejects.toMatchObject({code:'invalid_input'});
});
it('does not relax the existing fixed-200 fake transcript guard',()=>{
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:{responses:[{purpose:'parent',bytes:encode({result:parent})},{purpose:'release',bytes:encode({}),status:403}] as never}})).toThrow('invalid_input');
});
it('copies parent bytes before awaiting and never trusts caller mutation',async()=>{
 const bytes=encode({result:parent}),n=bytes.length,p=probe({parent_bytes:bytes,delay_ms:1});bytes.fill(0);
 expect(await p).toMatchObject({consumptions:1,budget:{requests:2,received_bytes:n}});
});
it('stops cancellation during delayed fake observation and frees timers/admission',async()=>{
 vi.useFakeTimers();const controller=new AbortController();const p=expect(probe({delay_ms:1000},{signal:controller.signal})).rejects.toMatchObject({code:'cancelled'});
 await vi.advanceTimersByTimeAsync(1);controller.abort('PRIVATE_REASON');await p;
 expect(vi.getTimerCount()).toBe(0);expect((await probe()).cleanup).toBe('closed');expect(vi.getTimerCount()).toBe(0);
});
it('refuses an already cancelled run before readiness or acceptance',async()=>{
 vi.useFakeTimers();const controller=new AbortController();controller.abort();await expect(probe({}, {signal:controller.signal})).rejects.toMatchObject({code:'cancelled'});expect(vi.getTimerCount()).toBe(0);
});
it.each(['responseBytes','totalBytes'] as const)('keeps the lowered %s ceiling',async cap=>{
 await expect(probe({}, {limits:{[cap]:1} as never})).rejects.toMatchObject({code:'receive_budget_exceeded'});
});
it.each([4,5])('retains final-four reservation at request cap %i',async requests=>{
 await expect(probe({}, {limits:{requests} as never})).rejects.toMatchObject({code:'request_budget_exceeded'});
});
it('rejects the original attempt floor without making a new deadline',async()=>{
 vi.useFakeTimers();let elapsed=0;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);
 const p=expect(probe({delay_ms:1000})).rejects.toMatchObject({code:'upstream_unavailable'});await vi.advanceTimersByTimeAsync(1);elapsed=10000;await vi.advanceTimersByTimeAsync(1000);await p;expect(vi.getTimerCount()).toBe(0);
});
it('enforces a lowered hard deadline and cancels pending fake I/O without extending it',async()=>{
 vi.useFakeTimers();let elapsed=0;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);
 const p=expect(probe({delay_ms:1000},{limits:{deadlineMs:10} as never})).rejects.toMatchObject({code:'deadline_exceeded'});
 elapsed=10;await vi.advanceTimersByTimeAsync(10);await p;expect(vi.getTimerCount()).toBe(0);
});
it('cannot attach a private status consumer to an existing session with a guessed key',()=>{
 const s=new BoundedReadSession(snapshot()),capture=vi.fn();try{
  expect(claimPrivateCompositionSource(s,{},{} as never)).toBe(false);
  expect(()=>new BoundedUpdateSetSource(s,parseBoundedSourceInput({update_set_sys_id:id}),{key:{},check:()=>{},take:()=>({result:parent}),takeStatus:()=>({purpose:'release',status:403,cleanup:'cancelled'}),capture})).toThrow('invalid_input');
  expect(capture).not.toHaveBeenCalled();expect(s.stats().requests).toBe(0);
 }finally{s.close();}
});
