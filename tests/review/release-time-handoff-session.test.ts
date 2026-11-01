import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
const id='a'.repeat(32),url='https://synthetic.invalid',S='2026-11-01T00:00:00.000Z';
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const snapshot=():ReadSnapshot=>({instanceUrl:url,authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused',clientSecret:''},reviewReleaseConfig:{instance_id:'test',assertion:{family:'Australia',instance_binding:createReviewInstanceBinding('test',url),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'}}});
const io=(rows:unknown=[])=>({responses:[{purpose:'parent' as const,bytes:bytes({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'0'}})},{purpose:'release' as const,bytes:bytes({result:rows})}]});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it.each([[],[{build_name:'Australia'}]].map(rows=>({rows})))('keeps fake prepared output, clocks and accounting after the private time handoff %#',async({rows})=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(S));const iso=vi.spyOn(Date.prototype,'toISOString'),script=io(rows),fetch=vi.spyOn(globalThis,'fetch');
  const result=await BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:script});
  expect(result).toMatchObject({state:'prepared_only',cleanup:'closed',reserved:0,dispatch:'unavailable',evidence_issuance:'disabled',budget:{requests:2,received_bytes:script.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0}});
  expect(iso).toHaveBeenCalledTimes(2);expect(fetch).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Time|upper|handoff|projection|comparison/);
  if(!rows.length)expect(result.instance_release).not.toHaveProperty('observed_at');
});
it('cannot transfer a normal comparison candidate when legacy release is not admitted',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(S));const config=snapshot();config.reviewReleaseConfig=undefined;
  await expect(BoundedReadSession.prepareNewReviewComposition(config,{update_set_sys_id:id},{synthetic_io:io()})).rejects.toMatchObject({code:'release_not_admitted'});
  expect(vi.getTimerCount()).toBe(0);
  expect(await BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:io()})).toMatchObject({cleanup:'closed'});
});
it.each(['sync','queued'] as const)('stops at late injected monotonic-clock boundaries (%s), releases admission and exposes no time authority',async mode=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(S));
  const isoNative=Date.prototype.toISOString;let observations=0,afterO=0;
  vi.spyOn(Date.prototype,'toISOString').mockImplementation(function(this:Date){observations++;return Reflect.apply(isoNative,this,[]);});
  const clock=vi.spyOn(performance,'now').mockImplementation(()=>{if(observations>=2)afterO++;return 0;});
  await BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:io()});
  const total=afterO;expect(total).toBeGreaterThan(30);
  for(const target of [Math.floor(total/2),total-30,total-15]){
    observations=0;afterO=0;const controller=new AbortController();let fired=false;
    clock.mockImplementation(()=>{if(observations>=2&&++afterO===target){fired=true;if(mode==='queued')queueMicrotask(()=>controller.abort());else controller.abort();}return 0;});
    await expect(BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:io()})).rejects.toMatchObject({code:'cancelled'});
    expect(fired).toBe(true);expect(vi.getTimerCount()).toBe(0);
    clock.mockReturnValue(0);observations=0;
    expect(await BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:io()})).toMatchObject({cleanup:'closed'});
  }
  expect(Object.getOwnPropertyNames(BoundedReadSession.prototype).some(name=>/Time|Handoff|Accepted/.test(name))).toBe(false);
});
