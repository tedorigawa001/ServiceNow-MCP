import {afterEach,expect,it,vi} from 'vitest';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
import {createCanonicalReviewBudget} from '../../src/servicenow/review-canonical-budget.js';
import {pinDevelopmentTranscript} from '../support/review/ef03/bootstrap.js';
const target='a'.repeat(32),encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const parent={sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'};
const transcript=()=>({target,auth:'per-user',responses:[
  {purpose:'parent',bytes:encode({result:parent})},{purpose:'release',bytes:encode({result:[{build_name:'Australia'}]})},
]});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('charges fixed parent/release bytes on the same core and returns the final-four reservation once',async()=>{
  const script=transcript(),received=script.responses.reduce((n,r)=>n+r.bytes.length,0);
  const result=await createDevelopmentRoot().run({principal:'same',transcript:script});
  expect(result).toMatchObject({ok:true,scope:'bootstrap_transcript_only',budget:{requests:2,received_bytes:received,payload_bytes:0},
    bootstrap:{claimed:true,reserved_peak:4,reserved:0,release_attempts:1,dispatches:2,release_match:'not_evaluated'},
    source:{parent_consumptions:1,release_consumptions:1,state:'closed',sealed:true}});
});
it.each([10000,50000,60000])('uses the original clock at elapsed %i without refreshing the attempt window',async elapsedAtCutoff=>{
  vi.useFakeTimers();let elapsed=0;
  const root=createDevelopmentRoot({clock:()=>elapsed}),script=transcript();
  const result=root.run({principal:'clock',transcript:{...script,responses:script.responses.map(r=>({...r,delay_ms:10000}))}});
  elapsed=elapsedAtCutoff;await vi.advanceTimersByTimeAsync(10000);const summary=await result;
  expect(summary).toMatchObject({ok:false,code:elapsedAtCutoff===60000?'deadline_exceeded':elapsedAtCutoff===50000?'phase_deadline_exceeded':'upstream_unavailable',
    budget:{requests:1,received_bytes:0},bootstrap:{reserved:0,release_attempts:1}});
  expect(vi.getTimerCount()).toBe(0);expect(root.inspect().active).toBe(0);
});
it('retains charged bytes on aggregate overshoot in the release response',async()=>{
  const script=transcript(),n=script.responses.reduce((n,r)=>n+r.bytes.length,0);
  expect(await createDevelopmentRoot().run({principal:'aggregate',transcript:{...script,limits:{total_bytes:n-1}}}))
    .toMatchObject({code:'receive_budget_exceeded',budget:{requests:2,received_bytes:n,payload_bytes:0},source:{parent_consumptions:1,release_consumptions:0},bootstrap:{reserved:0}});
});
it.each([403,200])('refuses caller-supplied status %i rather than selecting a non-200 or fallback lane',async status=>{
  const script=transcript();
  const result=await createDevelopmentRoot().run({principal:'status',transcript:{...script,responses:script.responses.map(r=>({...r,status}))}});
  expect(result).toMatchObject({code:'invalid_input',budget:{requests:0,received_bytes:0}});
});
it.each([{}, {requests:3},{requests:211},{total_bytes:0},{response_bytes:4194305}])('refuses malformed transcript or out-of-range limits %# before dispatch',async limits=>{
  const script=transcript(),profile=Object.keys(limits).length?{...script,limits}:{};
  expect(await createDevelopmentRoot().run({principal:'shape',transcript:profile})).toMatchObject({code:'invalid_input',budget:{requests:0,received_bytes:0}});
});
it('rejects getter/proxy/shared-storage and injected writer fields without invoking them',async()=>{
  let calls=0;const script=transcript(),root=createDevelopmentRoot();
  const bads=[{...script,get auth(){calls++;return 'per-user';}},new Proxy(script,{}),
    {...script,responses:[{purpose:'parent',bytes:new Uint8Array(new SharedArrayBuffer(1))},script.responses[1]]},
    {...script,core:{}},{...script,dispatch:()=>{calls++;}}];
  for(const profile of bads)expect((await root.run({principal:'bad',transcript:profile})).code).toBe('invalid_input');
  expect(calls).toBe(0);expect(root.inspect().active).toBe(0);
});
it('does not combine value-only source input with an accounting transcript',async()=>{
  const result=await createDevelopmentRoot().run({principal:'mixed',source:{target,parent:{result:parent},release:{result:[]}},transcript:transcript()});
  expect(result).toMatchObject({code:'invalid_input',budget:{requests:0}});
});
it('cannot reuse a consumed or disposed transcript to claim another core',async()=>{
  const pinned=pinDevelopmentTranscript(transcript()),core=createCanonicalReviewBudget({clock:{remainingMs:()=>60000}}),signal=new AbortController().signal;
  const hooks={check:()=>{},stop:()=>{},ready:()=>{},accept:()=>{}};
  await pinned.run(core,signal,60000,hooks);expect(pinned.diagnostic()).toMatchObject({release_attempts:1,reserved:0});
  const foreign=createCanonicalReviewBudget({clock:{remainingMs:()=>60000}});
  await expect(pinned.run(foreign,signal,60000,hooks)).rejects.toThrow('internal_review_error');
  expect(foreign.construction.status()).toMatchObject({claim:'unclaimed',reserved:0});expect(foreign.view.stats().requests).toBe(0);
  expect(pinned.diagnostic().release_attempts).toBe(1);
});
it('fails closed on an already claimed core rather than starting a second ledger',async()=>{
  const pinned=pinDevelopmentTranscript(transcript()),core=createCanonicalReviewBudget({clock:{remainingMs:()=>60000}});
  core.construction.takeBootstrapAccounting();
  await expect(pinned.run(core,new AbortController().signal,60000,{check:()=>{},stop:()=>{},ready:()=>{},accept:()=>{}})).rejects.toThrow('internal_review_error');
  expect(core.view.stats().requests).toBe(0);expect(pinned.diagnostic()).toMatchObject({claimed:false,dispatches:0,release_attempts:0});
});
it('keeps real-class admission and counters unchanged and never uses network or public source reads',async()=>{
  const oauth={clientId:'',clientSecret:''},snapshot=(token:string)=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user' as const,perUserBearerToken:token,oauth});
  const real=new BoundedReadSession(snapshot('same')),other=new BoundedReadSession(snapshot('other'));
  const state=()=>[real,other].map(s=>({construction:s.constructionStatus(),budget:s.stats(),primary:s.reviewRunStatus().primary}));
  const before=state(),network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('PRIVATE_NETWORK');});
  try{
    const summary=await createDevelopmentRoot().run({principal:'same',transcript:transcript()});expect(summary.ok).toBe(true);
    expect(state()).toEqual(before);expect(()=>new BoundedReadSession(snapshot('third'))).toThrow('review_busy');expect(network).not.toHaveBeenCalled();
  }finally{real.close();other.close();}
});
it.each(['per-user','cached','exchange'] as const)('uses one byte ledger for synthetic %s authentication and both source acks',async auth=>{
  const script=transcript();script.auth=auth;
  if(auth==='exchange')script.responses.unshift({purpose:'authentication',bytes:encode({access_token:'PRIVATE_TOKEN',expires_in:3600,token_type:'bEaReR'})});
  const expected=script.responses.reduce((n,r)=>n+r.bytes.length,0),result=await createDevelopmentRoot().run({principal:'auth',transcript:script});
  expect(result).toMatchObject({ok:true,source:{ready_generation:1},budget:{requests:auth==='exchange'?3:2,received_bytes:expected,payload_bytes:0}});
  expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN');
});
it.each([4,5,6])('keeps four requests unavailable to bootstrap at cap %i',async requests=>{
  const script=transcript(),result=await createDevelopmentRoot().run({principal:'cap',transcript:{...script,limits:{requests}}});
  const committed=Math.min(2,requests-4);
  expect(result).toMatchObject({ok:requests===6,code:requests===6?null:'request_budget_exceeded',
    budget:{requests:committed,received_bytes:script.responses.slice(0,committed).reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0},
    bootstrap:{reserved_peak:4,reserved:0,release_attempts:1,dispatches:committed}});
});
it.each(['throw','reject'] as const)('counts a %s after dispatch exactly once and never retries',async outcome=>{
  const script=transcript(),result=await createDevelopmentRoot().run({principal:'fail',transcript:{...script,responses:script.responses.map((r,i)=>i? r:{...r,outcome})}});
  expect(result).toMatchObject({ok:false,code:'upstream_unavailable',budget:{requests:1,received_bytes:0,payload_bytes:0},bootstrap:{dispatches:1,reserved:0,release_attempts:1}});
});
it.each(['total_bytes','response_bytes'] as const)('charges the first whole chunk before rejecting a lowered %s limit',async cap=>{
  const script=transcript(),result=await createDevelopmentRoot().run({principal:'bytes',transcript:{...script,limits:{[cap]:1}}});
  expect(result).toMatchObject({ok:false,code:'receive_budget_exceeded',budget:{requests:1,received_bytes:script.responses[0].bytes.length,payload_bytes:0},bootstrap:{reserved:0,release_attempts:1}});
});
it('accepts exact aggregate and per-response byte ceilings',async()=>{
  const script=transcript(),total=script.responses.reduce((n,r)=>n+r.bytes.length,0),response=Math.max(...script.responses.map(r=>r.bytes.length));
  expect((await createDevelopmentRoot().run({principal:'equal',transcript:{...script,limits:{total_bytes:total,response_bytes:response}}})).ok).toBe(true);
});
it.each([new Uint8Array([0xff]),encode({result:{...parent,sys_id:'b'.repeat(32)}}),encode({result:{...parent,script:'PRIVATE'}})])('charges and refuses malformed or foreign parent bytes %#',async bytes=>{
  const script=transcript();script.responses[0].bytes=bytes;
  const result=await createDevelopmentRoot().run({principal:'parent',transcript:script});
  expect(result).toMatchObject({ok:false,code:'invalid_response',budget:{requests:1,received_bytes:bytes.length},source:{parent_consumptions:0},bootstrap:{release_attempts:1,reserved:0}});
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it.each([{access_token:''},{expires_in:60},{token_type:'mac'}])('refuses invalid synthetic OAuth before ready %#',async change=>{
  const script=transcript(),bytes=encode({access_token:'PRIVATE',expires_in:3600,...change});
  const result=await createDevelopmentRoot().run({principal:'oauth',transcript:{...script,auth:'exchange',responses:[{purpose:'authentication',bytes},...script.responses]}});
  expect(result).toMatchObject({ok:false,code:'authentication_failed',budget:{requests:1,received_bytes:bytes.length},source:{ready_generation:0,parent_consumptions:0},bootstrap:{reserved:0}});
});
it('pins all bytes before await without consuming caller-owned storage or exposing values',async()=>{
  const script=transcript(),expected=script.responses.reduce((n,r)=>n+r.bytes.length,0),result=createDevelopmentRoot().run({principal:'pin',transcript:script});
  for(const row of script.responses)row.bytes.fill(0);
  const summary=await result;expect(summary).toMatchObject({ok:true,budget:{requests:2,received_bytes:expected}});
  expect(Object.isFrozen(summary.bootstrap)).toBe(true);expect(summary).not.toHaveProperty('core');
});
it.each(['parent','release'] as const)('cancels pending %s with no later charges and returns only its own reservation',async purpose=>{
  vi.useFakeTimers();const controller=new AbortController(),script=transcript(),root=createDevelopmentRoot();
  const result=root.run({principal:'cancel',transcript:{...script,responses:script.responses.map(r=>({...r,delay_ms:r.purpose===purpose?1000:0}))}},{signal:controller.signal});
  await vi.advanceTimersByTimeAsync(1);controller.abort(Error('PRIVATE_REASON'));const summary=await result;
  expect(summary).toMatchObject({ok:false,code:'cancelled',bootstrap:{reserved:0,release_attempts:1},construction:{primary:null}});
  expect(summary.budget.requests).toBe(purpose==='parent'?1:2);
  expect(summary.budget.received_bytes).toBe(purpose==='parent'?0:script.responses[0].bytes.length);
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});expect(vi.getTimerCount()).toBe(0);
  expect((await root.run({principal:'cancel',transcript:transcript()})).ok).toBe(true);
});
it('refuses pre-abort without acquiring accounting, dispatching, or reserving',async()=>{
  const controller=new AbortController();controller.abort();
  expect(await createDevelopmentRoot().run({principal:'pre',transcript:transcript()},{signal:controller.signal}))
    .toMatchObject({code:'cancelled',budget:{requests:0,received_bytes:0},bootstrap:{claimed:false,reserved_peak:0,release_attempts:0}});
});
it('fails closed when a chunk does not move G by exactly its own bytes',async()=>{
  const pinned=pinDevelopmentTranscript(transcript()),core=createCanonicalReviewBudget({clock:{remainingMs:()=>60000}});
  let real:ReturnType<typeof core.construction.takeBootstrapAccounting>|undefined;
  const skewed={view:core.view,construction:{
    takeBootstrapAccounting:()=>{real=core.construction.takeBootstrapAccounting();return Object.freeze({...real,chunk:(n:number)=>real!.chunk(n+1)});},
    connectStopOwner:(_:unknown,notify:(code:string)=>void)=>core.construction.connectStopOwner(real,notify)}};
  const accept=vi.fn();
  await expect(pinned.run(skewed as never,new AbortController().signal,60000,{check:()=>{},stop:()=>{},ready:()=>{},accept})).rejects.toThrow('internal_review_error');
  expect(accept).not.toHaveBeenCalled();expect(pinned.diagnostic()).toMatchObject({dispatches:1,reserved:0,release_attempts:1});
});
