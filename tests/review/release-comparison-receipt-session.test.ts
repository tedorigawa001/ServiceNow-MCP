import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
import {BoundedUpdateSetSource} from '../../src/review/bounded-source.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
const id='a'.repeat(32),origin='https://synthetic.invalid',start='2026-11-01T00:00:00.000Z';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const snapshot=():ReadSnapshot=>({instanceUrl:origin,authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused',clientSecret:''},reviewReleaseConfig:{instance_id:'test',assertion:{family:'Australia',instance_binding:createReviewInstanceBinding('test',origin),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'}}});
const script=(rows:unknown=[])=>({responses:[{purpose:'parent' as const,bytes:encode({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'0'}})},{purpose:'release' as const,bytes:encode({result:rows})}]});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it.each([[],[{build_name:'Australia'}]].map(rows=>({rows})))('keeps the fixed fake legacy output and same-byte accounting %#',async({rows})=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));const iso=vi.spyOn(Date.prototype,'toISOString'),io=script(rows);
  const result=await BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:io});
  expect(result).toMatchObject({state:'prepared_only',budget:{requests:2,received_bytes:io.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0},reserved:0,cleanup:'closed',dispatch:'unavailable',evidence_issuance:'disabled'});
  expect(iso).toHaveBeenCalledTimes(2);expect(JSON.stringify(result)).not.toMatch(/PRIVATE|comparison|receipt|projection/);
  if(!rows.length)expect(result.instance_release).not.toHaveProperty('observed_at');
  expect(Object.getOwnPropertyNames(BoundedReadSession.prototype).some(name=>/releaseComparison|Receipt/.test(name))).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it('never reparses caller-mutated body storage or adopts an externally supplied candidate',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));const io=script(),expected=io.responses.reduce((n,r)=>n+r.bytes.length,0);
  const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:io});io.responses[1].bytes.fill(0);
  expect(await pending).toMatchObject({state:'prepared_only',budget:{received_bytes:expected}});
  expect(()=>BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:{...script(),candidate:{decision:{release_match:'matched'}}} as never})).toThrow('invalid_input');
});
it('does not expose the source observation receiver through a guessed constructor key',()=>{
  const session=new BoundedReadSession(snapshot()),capture=vi.fn(),observe=vi.fn(()=>start),accept=vi.fn();
  try{
    expect(()=>new BoundedUpdateSetSource(session,{update_set_sys_id:id,max_records:20},{key:{},check:()=>{},take:()=>({}),capture,observeReleaseUtc:observe,acceptReleaseObservation:accept})).toThrow('invalid_input');
    expect(capture).not.toHaveBeenCalled();expect(observe).not.toHaveBeenCalled();expect(accept).not.toHaveBeenCalled();
  }finally{session.close();}
});
it('closes after cancelled body delivery and does not reuse that run for a new candidate',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(start));const controller=new AbortController(),io=script();
  const pending=BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{signal:controller.signal,synthetic_io:{responses:io.responses.map((r,i)=>({...r,delay_ms:i===1?1000:0}))}});
  const checked=expect(pending).rejects.toMatchObject({code:'cancelled'});await vi.advanceTimersByTimeAsync(1);controller.abort();await checked;
  expect(vi.getTimerCount()).toBe(0);
  expect(await BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},{synthetic_io:script()})).toMatchObject({cleanup:'closed'});
});
