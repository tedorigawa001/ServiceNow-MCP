import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
const id='a'.repeat(32),start='2026-11-01T00:00:00.000Z',origin='https://synthetic.invalid';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const snapshot=():ReadSnapshot=>({instanceUrl:origin,authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused',clientSecret:''},reviewReleaseConfig:{instance_id:'test',assertion:{family:'Australia',instance_binding:createReviewInstanceBinding('test',origin),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'}}});
const script=(rows:unknown=[])=>({responses:[{purpose:'parent' as const,bytes:encode({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'0'}})},{purpose:'release' as const,bytes:encode({result:rows})}]});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('stops empty-200 fallback when its single observation UTC conversion fails',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));
  const original=Date.prototype.toISOString;let reads=0;
  vi.spyOn(Date.prototype,'toISOString').mockImplementation(function(this:Date){if(++reads===2)throw Error('PRIVATE_CLOCK');return original.call(this);});
  await expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:script()})).rejects.toMatchObject({code:'internal_review_error'});
  expect(reads).toBe(2);expect(vi.getTimerCount()).toBe(0);
});
it.each([
  {rows:[],expected:'operator_config',ok:true},
  {rows:[{build_name:null}],expected:'operator_config',ok:true},
  {rows:[{build_name:'Australia'}],expected:'sys_cluster_state.build_name',ok:true},
  {rows:[{build_name:'PRIVATE_UNKNOWN'}],expected:'none',ok:false},
  {rows:[{build_name:'Australia'},{build_name:null}],expected:'none',ok:false},
  {rows:Array(21).fill({build_name:'Australia'}),expected:'none',ok:false},
  {rows:[{build_name:'Australia'},{build_name:'Zurich'}],expected:'conflict',ok:false},
])('samples once for complete-200 $expected with no legacy resample',async({rows,expected,ok})=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));
  const iso=vi.spyOn(Date.prototype,'toISOString'),io=script(rows);
  const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:io});
  if(ok){
    const result=await pending;
    expect(result.instance_release.source).toBe(expected);
    if(result.instance_release.source==='sys_cluster_state.build_name')expect(result.instance_release.observed_at).toBe(start);
    else expect(result.instance_release).not.toHaveProperty('observed_at');
    expect(result.budget).toEqual({requests:2,received_bytes:io.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0});
    expect(result).toMatchObject({reserved:0,cleanup:'closed',dispatch:'unavailable',evidence_issuance:'disabled'});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }else await expect(pending).rejects.toMatchObject({code:'release_not_admitted'});
  expect(iso).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});
it.each([Array(22).fill({build_name:'Australia'}),[{build_name:42}]].map(rows=>({rows})))('does not read observation UTC for invalid row projection %#',async({rows})=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));const iso=vi.spyOn(Date.prototype,'toISOString');
  await expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:script(rows)})).rejects.toMatchObject({code:'release_not_admitted'});
  expect(iso).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it.each(['reverse','forward'] as const)('rejects UTC %s without adjusting S or extending the monotonic budget',async fault=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));
  const io=script([{build_name:'Australia'}]);
  const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:{responses:io.responses.map((r,i)=>({...r,delay_ms:i===1?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'internal_review_error'});await vi.advanceTimersByTimeAsync(1);
  vi.setSystemTime(new Date(Date.parse(start)+(fault==='reverse'?-1001:60001)));
  await vi.advanceTimersByTimeAsync(1000);await checked;expect(vi.getTimerCount()).toBe(0);
});
it.each(['cancel','cancel_throw','deadline'] as const)('retains %s when it occurs during the observation read',async fault=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));const controller=new AbortController(),original=Date.prototype.toISOString;let calls=0;
  vi.spyOn(Date.prototype,'toISOString').mockImplementation(function(this:Date){
    if(++calls===2){
      if(fault==='deadline')vi.spyOn(performance,'now').mockReturnValue(performance.now()+60000);
      else controller.abort(Error('PRIVATE_CANCEL'));
      if(fault==='cancel_throw')throw Error('PRIVATE_CLOCK');
    }return original.call(this);
  });
  await expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:script()})).rejects.toMatchObject({code:fault==='deadline'?'deadline_exceeded':'cancelled'});
  expect(calls).toBe(2);expect(vi.getTimerCount()).toBe(0);
});
it('does not reach the observation clock after cancellation of the delayed release body',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));const iso=vi.spyOn(Date.prototype,'toISOString'),controller=new AbortController(),io=script();
  const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:{responses:io.responses.map((r,i)=>({...r,delay_ms:i===1?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'cancelled'});await vi.advanceTimersByTimeAsync(1);controller.abort();await checked;
  expect(iso).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
