import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
import {BoundedUpdateSetSource} from '../../src/review/bounded-source.js';

const id='a'.repeat(32),origin='https://synthetic.invalid';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const script=()=>({responses:[
  {purpose:'parent' as const,bytes:encode({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'0'}})},
  {purpose:'release' as const,bytes:encode({result:[{build_name:'Australia'}]})},
]});
const snapshot=():ReadSnapshot=>({instanceUrl:origin,authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused',clientSecret:''}});
const run=(change:Partial<ReadSnapshot>={},limits?:Record<string,number>)=>BoundedReadSession.prepareNewReviewComposition({...snapshot(),...change},{update_set_sys_id:id},{synthetic_io:script(),limits:limits as never});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('stops the fake continuation when the getter differs from the full deadline used at configuration pin',async()=>{
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockReturnValue(10000);
  await expect(run()).rejects.toMatchObject({code:'internal_review_error'});
});
const actualDeadline=Object.getOwnPropertyDescriptor(BoundedReadSession.prototype,'deadlineMs')!.get!;
it.each([60000,10000])('reads the existing getter once for the same pinned session at full L=%i',async deadline=>{
  let owner:BoundedReadSession|undefined;
  const getter=vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){owner=this;return actualDeadline.call(this);});
  const result=await run({}, {deadlineMs:deadline});
  expect(getter).toHaveBeenCalledTimes(1);expect(actualDeadline.call(owner)).toBe(deadline);
  expect(result).toMatchObject({state:'prepared_only',dispatch:'unavailable',evidence_issuance:'disabled',cleanup:'closed',reserved:0,budget:{requests:2,payload_bytes:0}});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|releaseInput|deadline_ms|policy|session|projection/);
  expect(Object.getOwnPropertyNames(BoundedReadSession.prototype).some(name=>/releaseInput|Projection/.test(name))).toBe(false);
});
it('rejects a remaining-time replacement after elapsed parent time instead of silently shrinking L',async()=>{
  vi.useFakeTimers();
  const getter=vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){return this.remainingMs();});
  const io=script();const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:{responses:io.responses.map((row,i)=>({...row,delay_ms:i===0?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'internal_review_error'});
  await vi.advanceTimersByTimeAsync(1000);await checked;expect(getter).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it.each(['throw','cancel','deadline'] as const)('keeps fixed stop and no release dispatch on getter %s',fault=>{
  vi.useFakeTimers();let owner:BoundedReadSession|undefined;
  const controller=new AbortController();
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){
    owner=this;if(fault==='cancel')controller.abort(Error('PRIVATE_REASON'));
    if(fault==='deadline')vi.spyOn(performance,'now').mockReturnValue(performance.now()+60000);
    if(fault==='throw')throw Error('PRIVATE_GETTER');return actualDeadline.call(this);
  });
  const expected=fault==='throw'?'internal_review_error':fault==='cancel'?'cancelled':'deadline_exceeded';
  return expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:script()})).rejects.toMatchObject({code:expected}).then(()=>{
    expect(owner!.stats().requests).toBe(1);expect(owner!.reviewRunStatus()).toMatchObject({primary:{code:expected}});
    expect(vi.getTimerCount()).toBe(0);
  });
});
it.each(['startedAt','policy','deadline'] as const)('refuses corrupted %s at capture with no release I/O',field=>{
  let owner:BoundedReadSession|undefined;
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){
    owner=this;
    if(field==='startedAt')Object.defineProperty(this,'startedAt',{value:'2026-10-01T00:00:00.000Z'});
    if(field==='policy')Object.defineProperty(this,'releasePolicy',{value:Object.freeze({...this.releasePolicy})});
    return field==='deadline'?10000:actualDeadline.call(this);
  });
  return expect(run()).rejects.toMatchObject({code:'internal_review_error'}).then(()=>{expect(owner!.stats().requests).toBe(1);});
});
it.each(['startedAt','policy'] as const)('refuses %s replacement after capture but before consumption',async field=>{
  vi.useFakeTimers();let owner:BoundedReadSession|undefined;
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){owner=this;return actualDeadline.call(this);});
  const io=script();const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:{responses:io.responses.map((row,i)=>({...row,delay_ms:i===1?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'internal_review_error'});await vi.advanceTimersByTimeAsync(1);
  Object.defineProperty(owner!,field==='policy'?'releasePolicy':'startedAt',{value:field==='policy'?Object.freeze({...owner!.releasePolicy}):'2026-10-01T00:00:00.000Z'});
  await vi.advanceTimersByTimeAsync(1000);await checked;expect(owner!.stats().requests).toBe(2);expect(vi.getTimerCount()).toBe(0);
});
it('rejects equal-valued policy from a different session rather than treating values as identity',async()=>{
  let foreign:BoundedReadSession|undefined;
  const getter=vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){foreign=this;return actualDeadline.call(this);});
  await run();const policy=foreign!.releasePolicy;
  getter.mockImplementation(function(this:BoundedReadSession){Object.defineProperty(this,'releasePolicy',{value:policy});return actualDeadline.call(this);});
  await expect(run()).rejects.toMatchObject({code:'internal_review_error'});
});
it.each([-1,0,1])('keeps the configuration pin boundary E=S+L%+i while using the original getter',async delta=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
  const start=Date.now(),deadline=10000;let owner:BoundedReadSession|undefined;
  const provider=vi.fn(()=>({instance_id:'test',assertion:{family:'Australia',instance_binding:createReviewInstanceBinding('test',origin),asserted_at:new Date(start-1000).toISOString(),expires_at:new Date(start+deadline+delta).toISOString()}}));
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){owner=this;return actualDeadline.call(this);});
  const result=await run({reviewReleaseConfigProvider:provider},{deadlineMs:deadline});
  expect(provider).toHaveBeenCalledTimes(1);expect(owner!.startedAt).toBe(new Date(start).toISOString());
  expect(owner!.releasePolicy.issue).toBe(delta<=0?'config_validity_insufficient':undefined);
  expect(result.limitations).toEqual(['release_visible_nodes_only',...(delta<=0?['config_validity_insufficient']:[])]);
});
it('copies options before awaiting and never calls remainingMs to form the projection',async()=>{
  vi.useFakeTimers();const limits={deadlineMs:10000};
  const remaining=vi.spyOn(BoundedReadSession.prototype,'remainingMs').mockReturnValue(1);
  const getter=vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get');
  const pending=run({},limits);limits.deadlineMs=1;
  expect(await pending).toMatchObject({state:'prepared_only',budget:{requests:2}});
  expect(getter).toHaveReturnedWith(10000);expect(remaining).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('stops a retained pending projection on cancellation and closes admission without resuming it',async()=>{
  vi.useFakeTimers();const controller=new AbortController(),io=script();
  const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:{responses:io.responses.map((row,i)=>({...row,delay_ms:i===1?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'cancelled'});await vi.advanceTimersByTimeAsync(1);controller.abort();await checked;
  expect(vi.getTimerCount()).toBe(0);expect(await run()).toMatchObject({cleanup:'closed'});
});
it.each([0,NaN,Infinity,60001])('rejects a corrupt getter value %s without creating a new deadline',async value=>{
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockReturnValue(value);
  await expect(run()).rejects.toMatchObject({code:'internal_review_error'});
});
it('does not let a getter exception replace an earlier cancellation',async()=>{
  const controller=new AbortController();
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(()=>{controller.abort();throw Error('PRIVATE_FAILURE');});
  await expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:script()})).rejects.toMatchObject({code:'cancelled'});
});
it('refuses the pending value after session close and releases all timers',async()=>{
  vi.useFakeTimers();let owner:BoundedReadSession|undefined;
  vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockImplementation(function(this:BoundedReadSession){owner=this;return actualDeadline.call(this);});
  const io=script(),pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:{responses:io.responses.map((row,i)=>({...row,delay_ms:i===1?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'closed'});await vi.advanceTimersByTimeAsync(1);owner!.close();await checked;
  expect(vi.getTimerCount()).toBe(0);expect(await run()).toMatchObject({cleanup:'closed'});
});
it('does not replace the ordinary source decision or invoke the new projection on that route',async()=>{
  const getter=vi.spyOn(BoundedReadSession.prototype,'deadlineMs','get').mockReturnValue(1),io=script();
  let next=0;const fetcher=vi.fn<typeof fetch>(async()=>new Response(io.responses[next++].bytes,{status:200}));
  const session=new BoundedReadSession(snapshot(),{fetch:fetcher});
  try{
    const source=new BoundedUpdateSetSource(session,{update_set_sys_id:id,max_records:20});
    await source.readParent();expect((await source.resolveRelease()).release_match).toBe('matched');
    expect(getter).not.toHaveBeenCalled();expect(session.stats().requests).toBe(2);
  }finally{session.close();}
});
