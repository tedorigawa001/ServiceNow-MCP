import {afterEach,expect,it,vi} from 'vitest';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {createDevelopmentResponseDelivery} from '../support/review/ef03/native.js';
import {createIsolatedStatusCleanupRealm,consumeSourceCleanupProof} from '../../src/review/abort-scope-evidence-status-cleanup.js';
import {createDevelopmentSourceRealm} from '../support/review/ef03/source.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
import {ReadableStreamDefaultReader as Reader} from 'node:stream/web';
const target='a'.repeat(32),parent_bytes=new TextEncoder().encode(JSON.stringify({result:{sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'}}));
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('cleans the same injected reader without reading and consumes its private proof before source close',async()=>{
  let cancels=0;const stream=new ReadableStream({cancel(){cancels++;}}),response=new Response(stream,{status:403});
  const result=await createDevelopmentRoot().run({principal:'native',native:{target,parent_bytes,delivery:createDevelopmentResponseDelivery(response)}});
  expect(result).toMatchObject({ok:true,scope:'native_cleanup_only',budget:{requests:2,received_bytes:parent_bytes.length,payload_bytes:0},
    native:{closed:true,revoked:true,operations:{get_reader:1,read:0,cancel:1,closed:1,release_lock:1},cleanup:{disposition:'confirmed',kind:'cancelled'}},
    source:{status_consumptions:1,release_consumptions:0,state:'closed',sealed:true},bootstrap:{reserved:0,release_attempts:1}});
  expect(cancels).toBe(1);expect(stream.locked).toBe(false);
});
const profile=(response:Response)=>({target,parent_bytes,delivery:createDevelopmentResponseDelivery(response)});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
async function reached(predicate:()=>boolean){for(let i=0;i<50&&!predicate();i++)await Promise.resolve();expect(predicate()).toBe(true);}
it.each([403,404])('accepts status %i with no body without reader operations or a JSON ack',async status=>{
  const result=await createDevelopmentRoot().run({principal:'empty',native:profile(new Response(null,{status}))});
  expect(result).toMatchObject({ok:true,native:{http:{status,body_present:false},cleanup:{disposition:'confirmed',kind:'no_body'},operations:{get_reader:0,read:0,cancel:0,closed:0,release_lock:0}},
    source:{status_consumptions:1,release_consumptions:0},bootstrap:{release_match:'not_evaluated'}});
});
it.each([401,200,500])('preserves diagnostic-only HTTP %i and never creates a status acceptance',async status=>{
  let cancels=0;const stream=new ReadableStream({cancel(){cancels++;}}),result=await createDevelopmentRoot().run({principal:'http',native:profile(new Response(stream,{status}))});
  expect(result).toMatchObject({ok:false,code:status===401?'authentication_failed':'invalid_response',source:{status_consumptions:0},native:{http:{status},operations:{read:0,cancel:1,release_lock:1}},bootstrap:{reserved:0,release_attempts:1}});
  expect(stream.locked).toBe(false);expect(cancels).toBe(1);
});
it('retains rejected cancel as unconfirmed and refuses source acceptance',async()=>{
  const stream=new ReadableStream({cancel(){return Promise.reject(Error('PRIVATE_CANCEL'));}});
  const result=await createDevelopmentRoot().run({principal:'reject',native:profile(new Response(stream,{status:403}))});
  expect(result).toMatchObject({ok:false,code:'internal_review_error',native:{cleanup:{disposition:'unconfirmed',reason:'cancel_rejected'},operations:{read:0,cancel:1,release_lock:1}},source:{status_consumptions:0}});
  expect(stream.locked).toBe(false);expect(JSON.stringify(result)).not.toContain('PRIVATE_CANCEL');
});
it('keeps hard HTTP and failed cleanup in separate diagnostic fields',async()=>{
  const stream=new ReadableStream({cancel(){return Promise.reject(Error('PRIVATE_HTTP_CLEANUP'));}});
  const result=await createDevelopmentRoot().run({principal:'both',native:profile(new Response(stream,{status:401}))});
  expect(result).toMatchObject({code:'authentication_failed',native:{http:{status:401},primary:'authentication_failed',run_stop:'authentication_failed',cleanup:{disposition:'unconfirmed',reason:'cancel_rejected'}},source:{status_consumptions:0}});
});
it('joins the same pending cleanup after cancellation before returning accounting/admission',async()=>{
  vi.useFakeTimers();const gate=deferred();let cancelling=false;
  const stream=new ReadableStream({cancel(){cancelling=true;return gate.promise;}}),root=createDevelopmentRoot(),controller=new AbortController();
  const result=root.run({principal:'cancel',native:profile(new Response(stream,{status:404}))},{signal:controller.signal});
  try{
    await reached(()=>cancelling);controller.abort(Error('PRIVATE_REASON'));await Promise.resolve();expect(root.inspect().active).toBe(1);
    gate.resolve();const summary=await result;
    expect(summary).toMatchObject({code:'cancelled',construction:{primary:null},native:{cleanup:{disposition:'confirmed',kind:'cancelled'}},source:{status_consumptions:0},bootstrap:{reserved:0,release_attempts:1}});
    expect(stream.locked).toBe(false);expect(root.inspect().active).toBe(0);expect(vi.getTimerCount()).toBe(0);
  }finally{gate.resolve();await result;}
});
it('bounds pending cleanup by the original floor and never upgrades a late settlement',async()=>{
  vi.useFakeTimers();const gate=deferred();let elapsed=0,cancelling=false;
  const stream=new ReadableStream({cancel(){cancelling=true;return gate.promise;}}),root=createDevelopmentRoot({clock:()=>elapsed}),controller=new AbortController();
  const result=root.run({principal:'floor',native:profile(new Response(stream,{status:403}))},{signal:controller.signal});
  try{
    await reached(()=>cancelling);controller.abort();elapsed=10000;await vi.advanceTimersByTimeAsync(10000);
    const summary=await result,before=JSON.stringify(summary);
    expect(summary).toMatchObject({code:'cancelled',native:{cleanup:{disposition:'unconfirmed',wait_issue:'cleanup_deadline',facts:{cancel:'pending'}},operations:{release_lock:1}},source:{status_consumptions:0}});
    gate.resolve();await Promise.resolve();expect(JSON.stringify(summary)).toBe(before);expect(vi.getTimerCount()).toBe(0);expect(stream.locked).toBe(false);
  }finally{gate.resolve();await result;}
});
it('keeps the shared run deadline distinct from native cancellation control',async()=>{
  vi.useFakeTimers();const gate=deferred();let elapsed=0,cancelling=false;
  const stream=new ReadableStream({cancel(){cancelling=true;return gate.promise;}}),root=createDevelopmentRoot({clock:()=>elapsed});
  const result=root.run({principal:'deadline',native:profile(new Response(stream,{status:403}))});
  try{await reached(()=>cancelling);elapsed=60000;await vi.advanceTimersByTimeAsync(60000);const summary=await result;
    expect(summary).toMatchObject({code:'deadline_exceeded',native:{run_stop:'deadline_exceeded',cleanup:{disposition:'unconfirmed'}},source:{status_consumptions:0},bootstrap:{reserved:0}});
    expect(vi.getTimerCount()).toBe(0);
  }finally{gate.resolve();await result;}
});
it('never acquires an injected reader if parent validation fails or the run is already cancelled',async()=>{
  let cancels=0;const stream=new ReadableStream({cancel(){cancels++;}}),root=createDevelopmentRoot();
  const bad=await root.run({principal:'parent',native:{...profile(new Response(stream,{status:403})),parent_bytes:new TextEncoder().encode('{}')}});
  expect(bad).toMatchObject({code:'invalid_response',budget:{requests:1},native:{http:null,operations:{get_reader:0,cancel:0,read:0}},bootstrap:{reserved:0}});
  const controller=new AbortController();controller.abort();
  const cancelled=await root.run({principal:'pre',native:profile(new Response(null,{status:403}))},{signal:controller.signal});
  expect(cancelled).toMatchObject({code:'cancelled',budget:{requests:0},native:null,bootstrap:{release_attempts:0}});
  expect(cancels).toBe(0);expect(stream.locked).toBe(false);
});
it('rejects Response and stream reuse across fresh roots without sharing old fixture tables',async()=>{
  const response=new Response(null,{status:403}),delivery=createDevelopmentResponseDelivery(response);
  expect(()=>createDevelopmentResponseDelivery(response)).toThrow('invalid_input');
  const native={target,parent_bytes,delivery};expect((await createDevelopmentRoot().run({principal:'first',native})).ok).toBe(true);
  expect((await createDevelopmentRoot().run({principal:'again',native})).code).toBe('invalid_input');
  const stream=new ReadableStream(),first=new Response(stream,{status:403}),second=new Response(stream,{status:403});
  expect((await createDevelopmentRoot().run({principal:'stream1',native:profile(first)})).ok).toBe(true);
  const summary=await createDevelopmentRoot().run({principal:'stream2',native:profile(second)});
  expect(summary).toMatchObject({ok:false,code:'invalid_response',source:{status_consumptions:0},native:{operations:{get_reader:0}}});
});
it('refuses raw/proxy/copied deliveries and injected cleanup records without invoking accessors',async()=>{
  let reads=0;const root=createDevelopmentRoot(),delivery=createDevelopmentResponseDelivery(new Response(null,{status:403}));
  const bads=[{target,parent_bytes,delivery:{...delivery}},{target,parent_bytes,delivery:new Proxy(delivery,{})},
    {target,parent_bytes,delivery:new Response(null,{status:403})},{target,parent_bytes,get delivery(){reads++;return delivery;}},
    {target,parent_bytes,delivery,cleanup:{disposition:'confirmed'}}];
  for(const native of bads)expect((await root.run({principal:'bad',native})).code).toBe('invalid_input');
  expect(reads).toBe(0);expect((await root.run({principal:'valid',native:{target,parent_bytes,delivery}})).ok).toBe(true);
});
async function issued(){
  const owner=createIsolatedStatusCleanupRealm().create({fake_io:true,deadline_ms:60000,budget:{read:()=>({remaining_ms:60000})},schedule:(ms,wake)=>{const timer=setTimeout(wake,ms);return ()=>clearTimeout(timer);}});
  const window=Object.freeze({purpose:'release' as const,ordinal:1 as const,window_origin_ms:60000,cleanup_floor_ms:50000});
  const acquired=await owner.acquire(new Response(null,{status:403}),window);if(!acquired.ok)throw Error('acquire');
  const proof=await owner.finishSource(acquired.value.handle);if(!proof.ok)throw Error('proof');
  return {owner,window,proof:proof.value};
}
it.each(['copy','foreign_owner','foreign_window','diagnostic'] as const)('refuses %s rather than promoting a diagnostic into cleanup evidence',async mode=>{
  const own=await issued(),foreign=await issued();
  try{
    const result=consumeSourceCleanupProof(mode==='foreign_owner'?foreign.owner:own.owner,
      mode==='copy'?{...own.proof}:mode==='diagnostic'?own.owner.diagnostics():own.proof,
      mode==='foreign_window'?{...own.window}:own.window);
    expect(result).toMatchObject({ok:false,code:'evidence_binding_mismatch'});
  }finally{await own.owner.close();await foreign.owner.close();}
});
it('consumes once and makes close invalidate any unconsumed private proof',async()=>{
  const first=await issued();
  try{expect(consumeSourceCleanupProof(first.owner,first.proof,first.window)).toMatchObject({ok:true,value:{status:403,cleanup:'no_body'}});
    expect(consumeSourceCleanupProof(first.owner,first.proof,first.window)).toMatchObject({ok:false,code:'invalid_state'});
  }finally{await first.owner.close();}
  const second=await issued();await second.owner.close();expect(consumeSourceCleanupProof(second.owner,second.proof,second.window).ok).toBe(false);
});
it('retains source pre/post guard failures without accepting a known native proof',async()=>{
  const n=await issued(),context=Object.freeze({run:{},snapshot:{},lease:{}});let stop=false;
  const source=createDevelopmentSourceRealm().create(context,target,()=>stop?'cancelled':null,n.owner);
  try{
    source.prepare(context);source.ready(context);source.consume(source.issue('parent',JSON.parse(new TextDecoder().decode(parent_bytes))),'parent',context);
    stop=true;expect(()=>source.consumeStatus(n.proof,n.window,context)).toThrow('cancelled');
    stop=false;expect(consumeSourceCleanupProof(n.owner,n.proof,n.window).ok).toBe(false);
    source.revoke();source.seal();expect(source.inspect()).toMatchObject({status_consumptions:0,primary:{code:'cancelled'}});
  }finally{await n.owner.close();}
});
it('leaves real-class admission, run diagnostics and byte accounting unchanged',async()=>{
  const snapshot=(token:string)=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user' as const,perUserBearerToken:token,oauth:{clientId:'',clientSecret:''}});
  const a=new BoundedReadSession(snapshot('same')),b=new BoundedReadSession(snapshot('other'));
  const state=()=>[a,b].map(s=>({construction:s.constructionStatus(),primary:s.reviewRunStatus().primary,budget:s.stats()})),before=state();
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('PRIVATE_NETWORK');});
  try{expect((await createDevelopmentRoot().run({principal:'same',native:profile(new Response(null,{status:404}))})).ok).toBe(true);
    expect(state()).toEqual(before);expect(()=>new BoundedReadSession(snapshot('third'))).toThrow('review_busy');expect(network).not.toHaveBeenCalled();
  }finally{a.close();b.close();}
});
it('does not invoke shadow Response properties or stream/reader instance methods',async()=>{
  let shadows=0;const stream=new ReadableStream(),response=new Response(stream,{status:403});
  Object.defineProperty(response,'status',{get(){shadows++;throw Error('PRIVATE_STATUS');}});
  Object.defineProperty(response,'body',{get(){shadows++;throw Error('PRIVATE_BODY');}});
  Object.defineProperty(stream,'getReader',{value:()=>{shadows++;throw Error('PRIVATE_READER');}});
  const result=await createDevelopmentRoot().run({principal:'shadows',native:profile(response)});
  expect(result.ok).toBe(true);expect(shadows).toBe(0);expect(stream.locked).toBe(false);
});
it('does not cancel or release a reader already owned by the caller',async()=>{
  const stream=new ReadableStream(),response=new Response(stream,{status:403}),reader=stream.getReader();
  try{const result=await createDevelopmentRoot().run({principal:'locked',native:profile(response)});
    expect(result).toMatchObject({ok:false,code:'invalid_response',native:{operations:{get_reader:0,cancel:0,release_lock:0},cleanup:{disposition:'unconfirmed'}},source:{status_consumptions:0}});
    expect(stream.locked).toBe(true);
  }finally{await reader.cancel();reader.releaseLock();}
});
it('retains rejected closed/cancel facts from an errored injected stream',async()=>{
  const stream=new ReadableStream({start(c){c.error(Error('PRIVATE_STREAM'));}});
  const result=await createDevelopmentRoot().run({principal:'error',native:profile(new Response(stream,{status:403}))});
  expect(result).toMatchObject({ok:false,native:{cleanup:{disposition:'unconfirmed',facts:{closed:'rejected',cancel:'rejected',release:'succeeded'}}},source:{status_consumptions:0}});
  expect(JSON.stringify(result)).not.toContain('PRIVATE_STREAM');
});
it.each(['get_reader','closed','release'] as const)('records injected %s acquisition/cleanup failure without inventing ownership or success',async fault=>{
  vi.resetModules();let held:object|undefined;const recovery:object[]=[];
  const getReader=ReadableStream.prototype.getReader,release=Reader.prototype.releaseLock,cancel=Reader.prototype.cancel;
  if(fault==='get_reader')vi.spyOn(ReadableStream.prototype,'getReader').mockImplementation(function(this:ReadableStream){
    held=Reflect.apply(getReader,this,[]);throw Error('PRIVATE_ACQUIRE');
  });
  if(fault==='closed')vi.spyOn(Reader.prototype,'closed','get').mockImplementation(()=>{throw Error('PRIVATE_CLOSED');});
  if(fault==='release')vi.spyOn(Reader.prototype,'releaseLock').mockImplementation(function(this:object){recovery.push(this);throw Error('PRIVATE_RELEASE');});
  const {createDevelopmentRoot:root}=await import('../support/review/ef03/assembly.js');
  const {createDevelopmentResponseDelivery:delivery}=await import('../support/review/ef03/native.js');
  const stream=new ReadableStream(),response=new Response(stream,{status:403});
  try{const result=await root().run({principal:'fault',native:{target,parent_bytes,delivery:delivery(response)}});
    expect(result).toMatchObject({ok:false,native:{cleanup:{disposition:'unconfirmed'},operations:{read:0}},source:{status_consumptions:0}});
    if(fault==='get_reader')expect(result.native?.operations).toMatchObject({get_reader:1,closed:0,cancel:0,release_lock:0});
    if(fault==='closed')expect(result.native?.operations).toMatchObject({get_reader:1,closed:1,cancel:1,release_lock:1});
    if(fault==='release')expect(result.native?.cleanup).toMatchObject({reason:'lock_release_failed'});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }finally{
    vi.restoreAllMocks();
    // Test-owned recovery of deliberately hidden/failed native resources, not production cleanup credit.
    if(held){await Reflect.apply(cancel,held,[]).catch(()=>{});Reflect.apply(release,held,[]);}
    for(const reader of recovery){await Reflect.apply(cancel,reader,[]).catch(()=>{});Reflect.apply(release,reader,[]);}
  }
});
it('spends proof on a post-guard stop without committing status acceptance',async()=>{
  const n=await issued(),context=Object.freeze({run:{},snapshot:{},lease:{}});let armed=false,checks=0;
  const source=createDevelopmentSourceRealm().create(context,target,()=>armed&&++checks===2?'cancelled':null,n.owner);
  try{source.prepare(context);source.ready(context);source.consume(source.issue('parent',JSON.parse(new TextDecoder().decode(parent_bytes))),'parent',context);
    armed=true;expect(()=>source.consumeStatus(n.proof,n.window,context)).toThrow('cancelled');
    expect(source.inspect().status_consumptions).toBe(0);expect(consumeSourceCleanupProof(n.owner,n.proof,n.window).ok).toBe(false);
  }finally{await n.owner.close();}
});
