import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
import {registerReviewEvidenceSession} from '../../src/servicenow/review-evidence-lifecycle.js';
const snapshot=():ReadSnapshot=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused'}});
const input={update_set_sys_id:'a'.repeat(32)};
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('binds a fresh session, its registered lease and fixed source before any authentication or I/O, then closes',()=>{
 vi.useFakeTimers();const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
 const result=BoundedReadSession.prepareNewReviewComposition(snapshot(),input);
 expect(result).toMatchObject({state:'constructor_bound',auth_ready:false,ready_generation:0,initial_source:'bound',transport_claim:'claimed',budget:{requests:0,received_bytes:0,payload_bytes:0},reserved:0,cleanup:'closed',evidence_issuance:'disabled',dispatch:'unavailable'});
 expect(fetch).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN');
});
it('ignores public observation replacements rather than using them as budget authority',()=>{
 vi.spyOn(BoundedReadSession.prototype,'stats').mockImplementation(()=>({requests:199,received_bytes:999,payload_bytes:999}));
 vi.spyOn(BoundedReadSession.prototype,'remainingMs').mockReturnValue(0);
 expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input)).toMatchObject({budget:{requests:0,received_bytes:0,payload_bytes:0},phase_reserve_ms:10000,cleanup:'closed'});
});
it('returns only a deeply frozen limited summary, with no work callback or live authority',()=>{
 const r=BoundedReadSession.prepareNewReviewComposition(snapshot(),input);
 expect(Object.keys(r).sort()).toEqual(['auth_ready','budget','cleanup','dispatch','evidence_issuance','initial_source','phase_reserve_ms','ready_generation','reserved','state','transport_claim']);
 expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.budget)).toBe(true);
 expect(JSON.stringify(r)).not.toMatch(/PRIVATE|synthetic.invalid|aaaa/);
});
it.each([{}, {...input,session:{}}, {...input,update_set_sys_id:'bad'}, {...input,max_records:101}])('rejects malformed or session-shaped input before allocating a run: %j',bad=>{
 vi.useFakeTimers();expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),bad)).toThrow('invalid_input');expect(vi.getTimerCount()).toBe(0);
 expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input).cleanup).toBe('closed');
});
it.each([{fetch:()=>{throw Error('PRIVATE');}},{native_body:true},{get signal(){throw Error('PRIVATE_GETTER');}}])('rejects injection/mode options rather than exposing a transport switch',options=>{
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input,options as never)).toThrow('invalid_input');
});
it('releases constructor resources after cancellation and permits a separate new run',()=>{
 vi.useFakeTimers();const abort=new AbortController();abort.abort(Error('PRIVATE_REASON'));
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input,{signal:abort.signal})).toThrow('cancelled');expect(vi.getTimerCount()).toBe(0);
 for(let i=0;i<4;i++)expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input).cleanup).toBe('closed');
 expect(vi.getTimerCount()).toBe(0);
});
it('stops and releases if cancellation arrives while its registered lease is sampled',()=>{
 vi.useFakeTimers();const abort=new AbortController();let calls=0;
 vi.spyOn(performance,'now').mockImplementation(()=>{if(++calls===3)abort.abort();return 0;});
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input,{signal:abort.signal})).toThrow('cancelled');expect(vi.getTimerCount()).toBe(0);
});
it.each([50000,60000])('rejects a soft/hard deadline crossed during constructor binding at %i without I/O',at=>{
 vi.useFakeTimers();let calls=0;vi.spyOn(performance,'now').mockImplementation(()=>++calls>=4?at:0);
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input)).toThrow(at===60000?'deadline_exceeded':'phase_deadline_exceeded');expect(vi.getTimerCount()).toBe(0);
});
it('keeps the lowered cap and closes on an insufficient final-four allocation',()=>{
 vi.useFakeTimers();expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input,{limits:{requests:3} as never})).toThrow('invalid_input');
 expect(vi.getTimerCount()).toBe(0);expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input,{limits:{deadlineMs:6000} as never}).phase_reserve_ms).toBe(1000);
});
function owner(){const snapshot={},lease=Object.freeze({read:()=>({requests:0,received_bytes:0,payload_bytes:0,remaining_ms:60000})}),o=registerReviewEvidenceSession({},snapshot,lease),claim=o.transportConstructor.claim(snapshot,lease);if(!claim.ok)throw Error('claim');return {snapshot,lease,o,handle:claim.value,source:{}};}
it('consumes initial binding once and cannot remint it after the first refusal',()=>{
 const a=owner();expect(a.o.transportConstructor.bindInitialSource(a.handle,a.snapshot,a.lease,a.source)).toMatchObject({ok:true,value:{initial_source:'bound'}});
 expect(a.o.transportConstructor.bindInitialSource(a.handle,a.snapshot,a.lease,a.source)).toEqual({ok:false,code:'invalid_state'});
 expect(a.o.transportConstructor.bindInitialSource(a.handle,a.snapshot,a.lease,{})).toEqual({ok:false,code:'invalid_state'});
});
it.each(['snapshot','lease','handle'] as const)('rejects a foreign %s without mutating the foreign owner',which=>{
 const a=owner(),b=owner();expect(a.o.transportConstructor.bindInitialSource(which==='handle'?b.handle:a.handle,which==='snapshot'?b.snapshot:a.snapshot,which==='lease'?b.lease:a.lease,a.source)).toEqual({ok:false,code:'evidence_binding_mismatch'});
 expect(a.o.transportConstructor.bindInitialSource(a.handle,a.snapshot,a.lease,a.source)).toEqual({ok:false,code:'evidence_binding_mismatch'});
 expect(b.o.transportConstructor.bindInitialSource(b.handle,b.snapshot,b.lease,b.source).ok).toBe(true);
});
it('distinguishes initial source identity from a ReleasePermit and rejects a later foreign source',()=>{
 const a=owner();expect(a.o.transportConstructor.bindInitialSource(a.handle,a.snapshot,a.lease,a.source).ok).toBe(true);
 expect(a.o.inspect(a.snapshot,a.lease)).toMatchObject({auth_ready:false,ready_generation:0,source_claim:'unclaimed'});
 expect(a.o.markReady(a.snapshot,a.lease)).toBe(true);
 const port={matches:()=>true,copyRelease:()=>({instance_release:{source:'none' as const,resolution_status:'unknown' as const,family:null,visibility_scope:'unavailable' as const,reason:'observation_unavailable' as const},limitations:[]})};
 expect(a.o.bindSource(a.snapshot,a.lease,{}, {},port)).toBe(false);
 expect(a.o.inspect(a.snapshot,a.lease).primary?.code).toBe('evidence_binding_mismatch');
});
it('rejects initial binding after ready and after close',()=>{
 const a=owner();a.o.markReady(a.snapshot,a.lease);expect(a.o.transportConstructor.bindInitialSource(a.handle,a.snapshot,a.lease,a.source)).toEqual({ok:false,code:'invalid_state'});
 const b=owner();b.o.close('cancelled');expect(b.o.transportConstructor.bindInitialSource(b.handle,b.snapshot,b.lease,b.source)).toEqual({ok:false,code:'cancelled'});
});
it('consumes initial binding before a lease callback can reenter',()=>{
 let hook=()=>{};const snapshot={},lease={read(){hook();return {requests:0,received_bytes:0,payload_bytes:0,remaining_ms:60000};}},o=registerReviewEvidenceSession({},snapshot,lease),claim=o.transportConstructor.claim(snapshot,lease);
 if(!claim.ok)throw Error('claim');let nested:unknown;hook=()=>{hook=()=>{};nested=o.transportConstructor.bindInitialSource(claim.value,snapshot,lease,{});};
 expect(o.transportConstructor.bindInitialSource(claim.value,snapshot,lease,{})).toEqual({ok:false,code:'invalid_state'});
 expect(nested).toEqual({ok:false,code:'invalid_state'});expect(o.inspect(snapshot,lease)).toMatchObject({auth_ready:false,primary:{code:'invalid_state'}});
});
it('cannot adopt or switch an existing session, which keeps its ordinary legacy writer',()=>{
 const s=new BoundedReadSession(snapshot(),{fetch:async()=>{throw Error('I/O forbidden');}});
 try{
   expect(()=>BoundedReadSession.prepareNewReviewComposition(s as never,input)).toThrow('invalid_input');
   expect('prepareNewReviewComposition' in s).toBe(false);expect('construction' in s).toBe(false);
   s.chargePayload('x');expect(s.stats().payload_bytes).toBe(1);expect(s.reviewRunStatus()).toMatchObject({transport_claim:'unclaimed',ready_generation:0});
 }finally{s.close();}
});
it('rejects an invalid signal before constructor admission can be allocated',()=>{
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input,{signal:{} as AbortSignal})).toThrow('invalid_input');
 expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input).cleanup).toBe('closed');
});
it('rejects signal callback replacements before allocation instead of invoking them',()=>{
 const a=new AbortController();const callback=vi.fn(()=>{throw Error('PRIVATE_CALLBACK');});Object.defineProperty(a.signal,'addEventListener',{value:callback});
 expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),input,{signal:a.signal})).toThrow('invalid_input');expect(callback).not.toHaveBeenCalled();
 expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input).cleanup).toBe('closed');
});
it('uses its fixed private cleanup rather than a replaced public close method',()=>{
 vi.useFakeTimers();const close=vi.spyOn(BoundedReadSession.prototype,'close').mockImplementation(()=>{});
 expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),input).cleanup).toBe('closed');expect(close).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
