import {afterEach,expect,it,vi} from 'vitest';
import {registerReviewEvidenceSession} from '../../src/servicenow/review-evidence-lifecycle.js';
import type {BootstrapBodyResource} from '../../src/servicenow/review-bootstrap-body.js';
const id='a'.repeat(32),encode=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
afterEach(()=>vi.useRealTimers());
function setup(auth:'per-user'|'exchange'='per-user',limits:Partial<{total_bytes:number;response_bytes:number}>={}){vi.useFakeTimers();const start=Date.now(),counters={requests:0,received_bytes:0,payload_bytes:0},ops={read:0,cancel:0,release:0,dispatch:0},source={},permit={};let r=0;
  const lease={read:()=>({...counters,remaining_ms:60000-(Date.now()-start)})};
  const release={instance_release:{source:'sys_cluster_state.build_name' as const,resolution_status:'resolved' as const,family:'Australia',raw_buildname:'Australia',observed_at:'2026-10-29T00:00:00Z',visibility_scope:'caller_acl' as const},limitations:['release_visible_nodes_only']};
  const port={matches:()=>true,copyRelease:()=>release};
  let body:(purpose:string)=>BootstrapBodyResource=(purpose:string)=>{let i=0;const raw=encode(purpose==='authentication'?{access_token:'PRIVATE_TOKEN',expires_in:3600,token_type:'bearer'}:purpose==='parent'?{result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-29',sys_mod_count:'0'}}:{result:[{build_name:'Australia'}]});return {read:async()=>{ops.read++;return i++?{done:true as const}:{done:false as const,value:raw};},cancel:async()=>{ops.cancel++;},closed:Promise.resolve(),release(){ops.release++;}};};
  let dispatch=async(request:{purpose:string})=>({status:200,body:body(request.purpose)});
  const deps={fake_io:true as const,typed_body:true as const,lease,source,target:id,auth,limits:{requests:210,total_bytes:16777216,response_bytes:4194304,deadline_ms:60000,...limits},accounting:{reserve(){r=4;},reserved:()=>r,dispatch(){counters.requests++;ops.dispatch++;},chunk(n:number){counters.received_bytes+=n;},release(){r=0;}},
    dispatch:(request:{purpose:string})=>dispatch(request),resolveRelease:()=>({source,permit,port}),schedule(delay:number,wake:()=>void){const timer=setTimeout(wake,delay);return ()=>clearTimeout(timer);}};
  const snapshot={},owner=registerReviewEvidenceSession({},snapshot,lease,deps),claim=owner.transportConstructor.claim(snapshot,lease);if(!claim.ok)throw Error(claim.code);
  return {owner,ops,counters,defaultDispatch:dispatch,setBody:(fn:typeof body)=>{body=fn;},setDispatch:(fn:typeof dispatch)=>{dispatch=fn;},run:()=>owner.transportConstructor.bootstrap(claim.value,snapshot,lease)};
}
it('connects typed read/closed/release to same-byte candidate and ack before prepared',async()=>{
  const s=setup();expect(await s.run()).toMatchObject({ok:true,value:{state:'prepared_only',evidence_issuance:'disabled'}});
  expect(s.ops).toEqual({read:4,cancel:0,release:2,dispatch:2});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed',kind:'eof'},consumes:2,acknowledgements:2,retained_bytes:0}});expect(vi.getTimerCount()).toBe(0);s.owner.close('closed');
});
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
it('cancels and closes the same pending read after synchronous owner revocation without making a candidate',async()=>{
  const s=setup();let complete!:(x:{done:boolean})=>void,close!:()=>void;
  s.setBody(()=>({read(){s.ops.read++;return new Promise(resolve=>{complete=resolve;});},closed:new Promise(resolve=>{close=resolve;}),async cancel(){s.ops.cancel++;complete({done:true});close();},release(){s.ops.release++;}}));
  const pending=s.run();await flush();s.owner.revoke('cancelled');expect(await pending).toEqual({ok:false,code:'cancelled'});
  expect(s.ops).toEqual({read:1,cancel:1,release:1,dispatch:1});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed',kind:'cancelled'},consumes:0,acknowledgements:0,retained_bytes:0}});expect(vi.getTimerCount()).toBe(0);
});
it('never acquires or releases the same fake body resource a second time',async()=>{
  const s=setup();let i=0;const bytes=encode({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-29',sys_mod_count:'0'}}),resource={read:async()=>{s.ops.read++;return i++?{done:true}:{done:false,value:bytes};},cancel:async()=>{s.ops.cancel++;},closed:Promise.resolve(),release(){s.ops.release++;}};
  s.setBody(()=>resource);expect(await s.run()).toEqual({ok:false,code:'invalid_response'});expect(s.ops.release).toBe(1);expect(s.ops.read).toBe(2);expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'reader_owner_unknown'},acknowledgements:1}});
});
it('does not accept a missing closed promise as cleanup proof',async()=>{
  const s=setup();s.setBody(()=>({read:async()=>({done:true}),cancel:async()=>{},closed:undefined as unknown as Promise<void>,release(){s.ops.release++;}}));expect(await s.run()).toEqual({ok:false,code:'invalid_response'});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'reader_owner_unknown'},consumes:0}});
});
it('keeps pending dispatch unconfirmed and disposes a late body without charging or repairing its terminal',async()=>{
  const s=setup();let respond!:(response:{status:number;body:BootstrapBodyResource})=>void;s.setDispatch(()=>new Promise(resolve=>{respond=resolve;}));const pending=s.run();await flush();s.owner.revoke('cancelled');expect(await pending).toEqual({ok:false,code:'cancelled'});
  expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'fetch_pending'},consumes:0}});const before=s.owner.transportConstructor.diagnostic();
  respond({status:200,body:{read:async()=>{s.ops.read++;return {done:true};},cancel:async()=>{s.ops.cancel++;},closed:Promise.resolve(),release(){s.ops.release++;}}});await flush();expect(s.ops).toEqual({dispatch:1,read:0,cancel:1,release:1});expect(s.counters.received_bytes).toBe(0);expect(s.owner.transportConstructor.diagnostic()).toEqual(before);
});
it('connects typed OAuth authentication and retains neither token nor body in the prepared view',async()=>{
  const s=setup('exchange'),result=await s.run();expect(result).toMatchObject({ok:true});expect(s.ops).toEqual({dispatch:3,read:6,cancel:0,release:3});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{acknowledgements:3,retained_bytes:0}});expect(JSON.stringify({result,status:s.owner.transportConstructor.diagnostic()})).not.toContain('PRIVATE_TOKEN');s.owner.close('closed');
});
it.each(['cancel_pending','cancel_rejected','closed_pending','closed_rejected','release_failed'] as const)('does not upgrade %s to a confirmed terminal or retry',async kind=>{
  const s=setup();let readDone!:(x:{done:boolean})=>void,close!:()=>void,cancelDone!:()=>void;
  s.setBody(()=>({read(){s.ops.read++;return new Promise(resolve=>{readDone=resolve;});},closed:new Promise<void>((resolve,reject)=>{close=resolve;if(kind==='closed_rejected')reject(Error('PRIVATE_CLOSED'));}),cancel(){s.ops.cancel++;readDone({done:true});if(kind!=='closed_pending'&&kind!=='closed_rejected')close();if(kind==='cancel_rejected')return Promise.reject(Error('PRIVATE_CANCEL'));if(kind==='cancel_pending')return new Promise(resolve=>{cancelDone=resolve;});return Promise.resolve();},release(){s.ops.release++;if(kind==='release_failed')throw Error('PRIVATE_RELEASE');}}));
  const pending=s.run();await flush();s.owner.revoke('cancelled');await vi.advanceTimersByTimeAsync(10000);expect(await pending).toEqual({ok:false,code:'cancelled'});
  const reason=kind==='release_failed'?'lock_release_failed':kind;expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason},consumes:0,acknowledgements:0,retained_bytes:0}});expect(s.ops).toEqual({dispatch:1,read:1,cancel:1,release:1});expect(vi.getTimerCount()).toBe(0);const before=s.owner.transportConstructor.diagnostic();close();cancelDone?.();await flush();expect(s.owner.transportConstructor.diagnostic()).toEqual(before);expect(JSON.stringify(before)).not.toContain('PRIVATE');
});
it('reserves cleanup time inside the original attempt and never retries a timed-out typed read',async()=>{
  const s=setup();let finish!:(x:{done:boolean})=>void,close!:()=>void;s.setBody(()=>({read(){s.ops.read++;return new Promise(resolve=>{finish=resolve;});},closed:new Promise(resolve=>{close=resolve;}),async cancel(){s.ops.cancel++;finish({done:true});close();},release(){s.ops.release++;}}));
  const pending=s.run();await vi.advanceTimersByTimeAsync(9750);expect(await pending).toEqual({ok:false,code:'upstream_unavailable'});expect(s.ops).toEqual({dispatch:1,read:1,cancel:1,release:1});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed',kind:'cancelled'},consumes:0}});expect(vi.getTimerCount()).toBe(0);
});
it.each(['response','total'] as const)('charges the %s overshoot chunk once then cancels the same resource',async kind=>{
  const s=setup('per-user',kind==='response'?{response_bytes:3}:{total_bytes:3});s.setBody(()=>({read:async()=>{s.ops.read++;return {done:false,value:new Uint8Array(4)};},closed:Promise.resolve(),cancel:async()=>{s.ops.cancel++;},release(){s.ops.release++;}}));
  expect(await s.run()).toEqual({ok:false,code:'receive_budget_exceeded'});expect(s.counters).toEqual({requests:1,received_bytes:4,payload_bytes:0});expect(s.ops).toEqual({dispatch:1,read:1,cancel:1,release:1});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed',kind:'cancelled'},consumes:0,retained_bytes:0}});
});
it('does not accept EOF while closed is pending, and does not repair the terminal later',async()=>{
  const s=setup();let close!:()=>void;s.setBody(()=>({read:async()=>{s.ops.read++;return {done:true};},closed:new Promise(resolve=>{close=resolve;}),cancel:async()=>{s.ops.cancel++;},release(){s.ops.release++;}}));const pending=s.run();await vi.advanceTimersByTimeAsync(10000);expect(await pending).toEqual({ok:false,code:'internal_review_error'});const before=s.owner.transportConstructor.diagnostic();expect(before.bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'closed_pending'},consumes:0}});close();await flush();expect(s.owner.transportConstructor.diagnostic()).toEqual(before);expect(s.ops.release).toBe(1);expect(vi.getTimerCount()).toBe(0);
});
it('keeps cleanup independent from cancellation in release and refuses the body before consume',async()=>{
  const s=setup();let i=0;s.setBody(()=>({read:async()=>i++?{done:true}:{done:false,value:encode({result:1})},closed:Promise.resolve(),cancel:async()=>{},release(){s.ops.release++;s.owner.revoke('cancelled');}}));expect(await s.run()).toEqual({ok:false,code:'cancelled'});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed',kind:'eof'},consumes:0,acknowledgements:0,retained_bytes:0}});
});
it('does not infer a fulfilled cancel from a missing promise',async()=>{
  const s=setup();let done!:(x:{done:boolean})=>void;s.setBody(()=>({read:()=>new Promise(resolve=>{done=resolve;}),closed:Promise.resolve(),cancel:(()=>{done({done:true});}) as unknown as ()=>Promise<void>,release(){s.ops.release++;}}));const pending=s.run();await flush();s.owner.revoke('cancelled');expect(await pending).toEqual({ok:false,code:'cancelled'});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'cancel_rejected'},consumes:0}});
});
it('does not confirm cleanup if release finishes at the original attempt deadline',async()=>{
  const s=setup();let i=0;s.setBody(()=>({read:async()=>i++?{done:true}:{done:false,value:encode({result:1})},closed:Promise.resolve(),cancel:async()=>{},release(){s.ops.release++;vi.setSystemTime(Date.now()+10000);}}));expect((await s.run()).ok).toBe(false);expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'cleanup_deadline'},consumes:0,acknowledgements:0,retained_bytes:0}});
});
it('distinguishes an unadopted malformed response from a still-pending dispatch',async()=>{
  const s=setup();s.setDispatch(async()=>({status:0,body:{read:async()=>{s.ops.read++;return {done:true};},closed:Promise.resolve(),cancel:async()=>{s.ops.cancel++;},release(){s.ops.release++;}}}));expect(await s.run()).toEqual({ok:false,code:'invalid_response'});expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'unconfirmed',reason:'reader_owner_unknown'},consumes:0}});expect(s.ops).toEqual({dispatch:1,read:0,cancel:1,release:1});
});
it('does not retry if the consumed draft expires during the async acknowledgement handoff',async()=>{
  const s=setup(),parse=JSON.parse;let called=false;const spy=vi.spyOn(JSON,'parse').mockImplementation((text:string)=>{const value=parse(text);if(!called){called=true;queueMicrotask(()=>vi.setSystemTime(Date.now()+10000));}return value;});
  try{expect(await s.run()).toEqual({ok:false,code:'upstream_unavailable'});expect(s.ops.dispatch).toBe(1);expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed',kind:'eof'},consumes:1,acknowledgements:0,retained_bytes:0}});}finally{spy.mockRestore();}
});
it('allows one HTTP 503 retry only after the same body has confirmed cleanup and ack, without resetting G or C',async()=>{
  const s=setup();let count=0;s.setDispatch(async request=>{const result=await s.defaultDispatch(request);return {...result,status:++count===1?503:200};});expect(await s.run()).toMatchObject({ok:true});expect(s.ops).toEqual({dispatch:3,read:6,cancel:0,release:3});expect(s.counters.requests).toBe(3);expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({body:{cleanup:{disposition:'confirmed'},consumes:3,acknowledgements:3,retained_bytes:0}});s.owner.close('closed');
});
it('reports a typed-read phase cutoff as a stopped bootstrap, not an ordinary close',async()=>{
  const s=setup();let i=0;s.setBody(()=>({read:async()=>{s.ops.read++;if(i++===0){vi.setSystemTime(Date.now()+50001);return {done:false,value:new Uint8Array(1)};}return {done:true};},closed:Promise.resolve(),cancel:async()=>{s.ops.cancel++;},release(){s.ops.release++;}}));
  expect(await s.run()).toEqual({ok:false,code:'phase_deadline_exceeded'});const d=s.owner.transportConstructor.diagnostic();
  expect(d).toMatchObject({primary:{code:'phase_deadline_exceeded'},bootstrap:{state:'failed',reservation_released:true,body:{cleanup:{disposition:'unconfirmed'},consumes:0}}});expect(s.ops).toEqual({dispatch:1,read:1,cancel:1,release:1});
});
it.each([5,'PRIVATE'])('keeps invalid_response for a primitive delivery %j instead of a probe error',async value=>{
  const s=setup();s.setDispatch((async()=>value) as never);expect(await s.run()).toEqual({ok:false,code:'invalid_response'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({primary:{code:'invalid_response'},bootstrap:{body:{cleanup:{disposition:'unconfirmed',reason:'reader_owner_unknown'}}}});expect(s.ops).toEqual({dispatch:1,read:0,cancel:0,release:0});
});
