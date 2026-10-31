import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
const status=vi.hoisted(()=>({release:200}));
vi.mock('../../src/servicenow/review-composition-fake-io.js',async original=>{
 const actual=await original<typeof import('../../src/servicenow/review-composition-fake-io.js')>();
 return {...actual,pinCompositionFakeIO(raw:unknown){
  const fake=actual.pinCompositionFakeIO(raw);
  return Object.freeze({...fake,async dispatch(request:{purpose:string},signal:AbortSignal){
   const response=await fake.dispatch(request,signal);
   return request.purpose==='release'&&status.release!==200?new Response(response.body,{status:status.release}):response;
  }});
 }};
});
const id='a'.repeat(32),parent={sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-31',sys_mod_count:'0'};
const encode=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
const snapshot=():ReadSnapshot=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused'}});
const run=(release:unknown={result:[{build_name:'Australia'}]})=>BoundedReadSession.prepareNewReviewComposition(snapshot(),{update_set_sys_id:id},
 {synthetic_io:{responses:[{purpose:'parent',bytes:encode({result:parent})},{purpose:'release',bytes:encode(release)}]}});
afterEach(()=>{status.release=200;vi.restoreAllMocks();});
it('keeps a non-stopping phase cutoff raised by the session guard after parent acceptance as phase_deadline_exceeded',async()=>{
 let elapsed=0;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);
 const clone=globalThis.structuredClone;
 vi.spyOn(globalThis,'structuredClone').mockImplementation(((value:unknown,options?:StructuredSerializeOptions)=>{
  // The parent consumer clones the accepted row; the guard right after it is the first to see the phase boundary.
  if(value&&typeof value==='object'&&'sys_mod_count' in value)elapsed=50000;
  return clone(value,options);
 }) as typeof structuredClone);
 await expect(run()).rejects.toMatchObject({code:'phase_deadline_exceeded'});
});
it('refuses a non-200 release before the source can treat a missing body as an observation',async()=>{
 status.release=403;
 await expect(run({})).rejects.toMatchObject({code:'invalid_response'});
});
