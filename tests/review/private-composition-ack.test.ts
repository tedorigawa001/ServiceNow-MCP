import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,claimPrivateCompositionSource,type ReadSnapshot,type BoundedReadOptions} from '../../src/servicenow/bounded-read.js';
import {BoundedUpdateSetSource,parseBoundedSourceInput} from '../../src/review/bounded-source.js';
import type {CompositionFakeIO} from '../../src/servicenow/review-composition-fake-io.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
const id='a'.repeat(32),parent={sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-31',sys_mod_count:'0'};
const encode=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
const snapshot=():ReadSnapshot=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused'}});
const io=()=>({responses:[{purpose:'parent' as const,bytes:encode({result:parent})},{purpose:'release' as const,bytes:encode({result:[{build_name:'Australia'}]})}]});
const run=(script:CompositionFakeIO=io(),change:Partial<ReadSnapshot>={},options:Pick<BoundedReadOptions,'signal'|'limits'>={})=>BoundedReadSession.prepareNewReviewComposition({...snapshot(),...change},{update_set_sys_id:id},{...options,synthetic_io:script});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('accepts parent/release acks from the same byte budget and real source release decision, then closes without authority',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');}),script=io();
 const result=await run(script);
 expect(result).toMatchObject({state:'prepared_only',fake_io:true,auth_ready:true,ready_generation:1,evidence_issuance:'disabled',dispatch:'unavailable',cleanup:'closed',reserved:0,instance_release:{family:'Australia'},budget:{requests:2,received_bytes:script.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0}});
 expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toMatch(/PRIVATE|permit|sys_updated_on/);
});
it('never reenters legacy GET or the source public acquisition methods, and ignores public observation replacements',async()=>{
 vi.useFakeTimers();vi.spyOn(BoundedReadSession.prototype,'get').mockImplementation(async()=>{throw Error('LEGACY_FORBIDDEN');});
 vi.spyOn(BoundedUpdateSetSource.prototype,'readParent').mockImplementation(async()=>{throw Error('LEGACY_FORBIDDEN');});
 vi.spyOn(BoundedUpdateSetSource.prototype,'resolveRelease').mockImplementation(async()=>{throw Error('LEGACY_FORBIDDEN');});
 vi.spyOn(BoundedReadSession.prototype,'remainingMs').mockReturnValue(0);vi.spyOn(BoundedReadSession.prototype,'stats').mockReturnValue({requests:999,received_bytes:999,payload_bytes:999});
 const close=vi.spyOn(BoundedReadSession.prototype,'close').mockImplementation(()=>{});expect(await run()).toMatchObject({state:'prepared_only',budget:{requests:2}});expect(close).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it.each(['cached','exchange'] as const)('derives %s authentication from the pinned snapshot and keeps its bytes in one budget',async mode=>{
 const script:CompositionFakeIO=mode==='exchange'?{responses:[{purpose:'authentication',bytes:encode({access_token:'PRIVATE_OAUTH',expires_in:3600,token_type:'bearer'})},...io().responses]}:io();
 const result=await run(script,{authMode:'service-account',oauth:{clientId:'dummy',clientSecret:'PRIVATE_SECRET'},...(mode==='cached'?{accessToken:'PRIVATE_CACHE',tokenExpiry:Date.now()+3600000}:{})});
 expect(result).toMatchObject({state:'prepared_only',ready_generation:1,budget:{requests:script.responses.length,received_bytes:script.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0}});expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it.each([{access_token:''},{expires_in:0},{token_type:'mac'}])('stops invalid OAuth before parent readiness: %j',change=>{
 const script={responses:[{purpose:'authentication' as const,bytes:encode({access_token:'PRIVATE_TOKEN',expires_in:3600,...change})},...io().responses]};
 return expect(run(script,{authMode:'service-account'})).rejects.toMatchObject({code:'authentication_failed'});
});
it.each([[{build_name:'Zurich'}],[{build_name:'nonsense'}],[{build_name:null}],[],[{build_name:'Australia'},{build_name:'Zurich'}],Array.from({length:21},()=>({build_name:'Australia'}))].map(rows=>({rows})))('does not prepare a non-admitted release observation',async({rows})=>{
 const script=io();script.responses[1].bytes=encode({result:rows});await expect(run(script)).rejects.toMatchObject({code:'release_not_admitted'});
 expect((await run()).cleanup).toBe('closed');
});
it('projects only build_name and does not retain unexpected node addresses or certificates',async()=>{
 const script=io();script.responses[1].bytes=encode({result:[{build_name:' australia ',address:'PRIVATE_NODE',certificate:'PRIVATE_CERT'}]});
 const r=await run(script);expect(r.instance_release).toMatchObject({family:'Australia',raw_buildname:'australia'});expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(Object.isFrozen(r.instance_release)).toBe(true);expect(Object.isFrozen(r.limitations)).toBe(true);
});
const config=(family='Australia')=>({instance_id:'dummy',assertion:{family,instance_binding:createReviewInstanceBinding('dummy','https://synthetic.invalid'),asserted_at:new Date(Date.now()-3600000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()}});
it('uses the existing C-mode assertion only for a complete empty 200 observation',async()=>{
 const script=io();script.responses[1].bytes=encode({result:[]});const r=await run(script,{reviewReleaseConfig:config()});
 expect(r.instance_release).toMatchObject({source:'operator_config',resolution_status:'asserted'});expect(r.limitations).toContain('release_config_may_be_stale');
});
it('keeps measured/configured conflicts closed rather than trusting a supplied family',async()=>{
 await expect(run(io(),{reviewReleaseConfig:config('Zurich')})).rejects.toMatchObject({code:'release_not_admitted'});
});
it.each([{...parent,sys_id:'b'.repeat(32)},{...parent,sys_mod_count:undefined},{...parent,script:'PRIVATE_BODY'}])('rejects invalid parent bytes before release binding',bad=>{
 const script=io();script.responses[0].bytes=encode({result:bad});return expect(run(script)).rejects.toMatchObject({code:'invalid_response'});
});
it.each([new Uint8Array([0xc3,0x28]),new TextEncoder().encode('PRIVATE_BAD_JSON')])('rejects malformed JSON/UTF8 without exposing bytes',async bytes=>{
 const script=io();script.responses[0].bytes=bytes;await expect(run(script)).rejects.toMatchObject({code:'invalid_response'});
});
it('pins the entire transcript before awaiting and never reparses caller-mutated bytes',async()=>{
 const script=io(),n=script.responses.reduce((n,r)=>n+r.bytes.length,0),pending=run(script);for(const r of script.responses)r.bytes.fill(0);
 expect(await pending).toMatchObject({state:'prepared_only',budget:{received_bytes:n}});
});
it.each(['parent','release'] as const)('cancels a pending fake %s and frees all timers/admission without resuming',async purpose=>{
 vi.useFakeTimers();const a=new AbortController(),script={responses:io().responses.map(r=>({...r,delay_ms:r.purpose===purpose?1000:0}))};
 const checked=expect(run(script,{}, {signal:a.signal})).rejects.toMatchObject({code:'cancelled'});await vi.advanceTimersByTimeAsync(1);a.abort(Error('PRIVATE_REASON'));await checked;
 expect(vi.getTimerCount()).toBe(0);expect((await run()).cleanup).toBe('closed');expect(vi.getTimerCount()).toBe(0);
});
it.each(['totalBytes','responseBytes'] as const)('keeps a lowered %s cap and closes after a charged overshoot',async cap=>{
 await expect(run(io(),{}, {limits:{[cap]:1} as never})).rejects.toMatchObject({code:'receive_budget_exceeded'});expect((await run()).cleanup).toBe('closed');
});
it.each([4,5])('does not consume final-four capacity with C cap %i',async requests=>{
 await expect(run(io(),{}, {limits:{requests} as never})).rejects.toMatchObject({code:'request_budget_exceeded'});expect((await run()).cleanup).toBe('closed');
});
it('does not upgrade raw release decisions/permits encoded as response JSON',async()=>{
 const script=io();script.responses[1].bytes=encode({release_match:'matched',instance_release:{family:'Australia'},permit:{}});await expect(run(script)).rejects.toMatchObject({code:'release_not_admitted'});
});
it.each([{}, {responses:[...io().responses,{purpose:'release',bytes:encode({})}]}, {responses:io().responses,dispatch:()=>{}}, {responses:[{purpose:'parent',bytes:encode({}),status:403},io().responses[1]]}])('rejects non-data/unsupported transcript shapes before dispatch',bad=>{
 expect(()=>run(bad as never)).toThrow('invalid_input');
});
it('cannot retrieve a consumer or adopt an existing session with a guessed construction key',()=>{
 const s=new BoundedReadSession(snapshot()),capture=vi.fn();try{
  for(const key of [{},undefined,null]){
   expect(claimPrivateCompositionSource(s,key as never,{} as never)).toBe(false);
   expect(()=>new BoundedUpdateSetSource(s,parseBoundedSourceInput({update_set_sys_id:id}),{key:key as never,check:()=>{},take:()=>({result:parent}),capture})).toThrow('invalid_input');
  }
  expect(capture).not.toHaveBeenCalled();s.chargePayload('x');expect(s.stats().payload_bytes).toBe(1);
 }finally{s.close();}
});
it('does not trust a replaced static verifier or expose a private source consumer',()=>{
 Object.defineProperty(BoundedReadSession,'claimCompositionSource',{value:()=>true,configurable:true});
 const s=new BoundedReadSession(snapshot()),capture=vi.fn();try{
  expect(()=>new BoundedUpdateSetSource(s,parseBoundedSourceInput({update_set_sys_id:id}),{key:{},check:()=>{},take:()=>({}),capture})).toThrow('invalid_input');expect(capture).not.toHaveBeenCalled();
 }finally{s.close();Reflect.deleteProperty(BoundedReadSession,'claimCompositionSource');}
});
it('requires the actual private source-to-owner binding instead of accepting a successful-looking hook',async()=>{
 vi.spyOn(BoundedReadSession.prototype,'bindReviewReleaseSource').mockImplementation(()=>{});
 await expect(run()).rejects.toMatchObject({code:'internal_review_error'});
});
it('rejects hard deadline equality after dispatch and clears delayed fake I/O',async()=>{
 vi.useFakeTimers();let elapsed=0;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);
 const script={responses:io().responses.map((r,i)=>({...r,delay_ms:i===0?1000:0}))};
 const checked=expect(run(script)).rejects.toMatchObject({code:'deadline_exceeded'});await vi.advanceTimersByTimeAsync(1);elapsed=60000;await vi.advanceTimersByTimeAsync(1000);await checked;expect(vi.getTimerCount()).toBe(0);
});
