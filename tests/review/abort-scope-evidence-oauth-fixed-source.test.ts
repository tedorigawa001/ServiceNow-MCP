import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FixtureAccountingSession} from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import {createFixtureOAuthSourceTransport,type FixtureHandoffRequest} from '../../src/review/abort-scope-evidence-oauth-handoff.js';
import * as fixed from '../../src/review/abort-scope-evidence-fixed-web-source.js';
const id='a'.repeat(32),tableId='b'.repeat(32),sessions:FixtureAccountingSession[]=[];
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const token=JSON.stringify({access_token:'PRIVATE_DUMMY',expires_in:3600,token_type:'Bearer'});
// Independent boundary oracle: count bytes returned by the native reader, not bytes merely supplied to Response.
function observedResponse(text:string,status:number,onChunk:(n:number)=>void){
  const response=new Response(text,{status}),body=response.body!,acquire=body.getReader.bind(body);
  Object.defineProperty(body,'getReader',{value:()=>{const reader=acquire(),read=reader.read.bind(reader);
    Object.defineProperty(reader,'read',{value:async()=>{const step=await read();if(!step.done)onChunk(step.value.byteLength);return step;}});return reader;}});
  return response;
}
function body(r:FixtureHandoffRequest){return r.method==='POST'?token:JSON.stringify({result:r.purpose.startsWith('table')?
  [{sys_id:tableId,name:'incident',sys_scope:'global',sys_updated_on:'2026-10-27',sys_mod_count:'1'}]:
  r.purpose.startsWith('parent')?[{sys_id:id,sys_updated_on:'2026-10-27',sys_mod_count:'1'}]:[]});}
function setup(source:(r:FixtureHandoffRequest,s:AbortSignal)=>Response|Promise<Response>=r=>new Response(body(r)),limits:ConstructorParameters<typeof FixtureAccountingSession>[0]={}){
  const session=new FixtureAccountingSession(limits,{oauthBootstrap:true});sessions.push(session);
  return {session,api:get(createFixtureOAuthSourceTransport(session,id,source))};
}
async function start(x=setup()){
  get(await x.api.bootstrap.run());const ticket=get(x.api.root.offer());return {...x,ticket,source:get(x.api.root.adoptSource(ticket))};
}
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('UNEXPECTED_FETCH');});});
afterEach(()=>{sessions.splice(0).forEach(s=>s.close());expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();vi.restoreAllMocks();});
it('continues OAuth accounting through fixed initial/final reads and releases every reservation',async()=>{
  let c=0,g=0,e=0;const calls:string[]=[],x=setup(r=>{const text=body(r);c++;g+=Buffer.byteLength(text);
    if(r.method==='GET'&&r.purpose.startsWith('table'))e+=Buffer.byteLength(text);calls.push(r.method==='POST'?'oauth':r.purpose);return new Response(text);});
  get(await x.api.bootstrap.run());const before=x.api.stats(),ticket=get(x.api.root.offer()),source=get(x.api.root.adoptSource(ticket));
  expect(x.api.stats()).toMatchObject({requests:before.requests,received_bytes:before.received_bytes,reserved:4});
  expect(get(await source.prepare()).state).toBe('prepared');expect(get(await source.initial('incident')).observation?.state).toBe('rows');
  expect(source.stats().reserved).toBe(6);get(await source.initial('incident'));
  expect(get(await source.finalize())).toMatchObject({state:'stable',seal:null,evidence_issuance:'disabled'});
  expect(calls).toEqual(['oauth','parent_initial','metadata_initial','table_initial','parent_final','metadata_final','table_final']);
  expect(c).toBe(7);expect(source.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,payload_bytes:0,reserved:0,timers:0,retained_bytes:0});
  expect(x.api.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,reserved:0});
  expect(get(source.consumeObservations('incident'))).toMatchObject({synthetic:true,evidence_issuance:'disabled'});
  expect(source.consumeObservations('incident').ok).toBe(false);expect(globalThis.fetch).not.toHaveBeenCalled();
});
it('synchronously withdraws final delivery and fixed-source state when the root is cancelled',async()=>{
  const x=setup();get(await x.api.bootstrap.run());const source=get(x.api.root.adoptSource(get(x.api.root.offer())));
  get(await source.prepare());get(await source.initial('incident'));get(await source.finalize());
  x.api.root.cancel();expect(source.stats()).toMatchObject({state:'failed',primary:'cancelled'});
  expect(source.consumeObservations('incident')).toEqual({ok:false,code:'cancelled'});
});
it.each([429,503])('preserves a cleaned-up OAuth %s retry and independently accounts all chunks to C=8/R=0',async status=>{
  let c=0,g=0,e=0;const x=await start(setup(r=>{const first=c===0,text=first?'PRIVATE_RETRY':body(r);c++;g+=Buffer.byteLength(text);
    if(r.method==='GET'&&r.purpose.startsWith('table'))e+=Buffer.byteLength(text);return new Response(text,{status:first?status:200});}));
  get(await x.source.prepare());get(await x.source.initial('incident'));get(await x.source.finalize());
  expect(c).toBe(8);expect(x.source.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,payload_bytes:0,reserved:0});
  expect(x.api.stats()).toMatchObject({diagnostic:{last_failure:{code:'upstream_unavailable',retryable:true}}});
  expect(JSON.stringify([x.api.stats(),x.source.stats()])).not.toContain('PRIVATE_RETRY');
});
it.each(['404','503','syntax','empty'] as const)('continues after local initial %s, skips its final and releases reservation without refund',async kind=>{
  const calls:string[]=[];let g=0,e=0;const x=await start(setup(r=>{
    if(r.method==='POST'){calls.push('oauth');return observedResponse(token,200,n=>{g+=n;});}
    calls.push(r.purpose);const initial=r.purpose==='table_initial',text=initial?(kind==='syntax'?'PRIVATE_JSON':kind==='empty'?'{"result":[]}':'{}'):body(r);
    return observedResponse(text,initial&&kind==='404'?404:initial&&kind==='503'?503:200,n=>{g+=n;if(r.purpose.startsWith('table'))e+=n;});
  }));
  get(await x.source.prepare());get(await x.source.initial('incident'));expect(x.source.stats().reserved).toBe(6);
  expect(get(await x.source.finalize())).toMatchObject({state:'unverified',seal:null,tables:[{name:'incident',state:'unverified'}]});
  expect(calls).not.toContain('table_final');expect(calls.filter(v=>v==='table_initial')).toHaveLength(kind==='503'?2:1);
  expect(x.source.stats()).toMatchObject({requests:calls.length,received_bytes:g,evidence_bytes:e,reserved:0});
  expect(x.source.consumeObservations('incident').ok).toBe(false);
});
it('releases the unused final retry when the shared E budget closes at exactly 262144 bytes',async()=>{
  let c=0,g=0,e=0,last=0;const x=await start(setup(r=>{
    let text=body(r),status=200;
    if(r.method==='GET'&&r.purpose.startsWith('table')){
      const name=new URL(r.path,'https://fixture.invalid').searchParams.get('sysparm_query')!.split('=')[1].split('^')[0];
      if(r.purpose==='table_final'&&name==='t7'){last++;text=' '.repeat(16384);status=503;}
      else text=JSON.stringify({result:[{sys_id:tableId,name,sys_scope:'global',sys_updated_on:'2026-10-27',sys_mod_count:'1'}]}).padEnd(16384,' ');
      e+=Buffer.byteLength(text);
    }
    c++;g+=Buffer.byteLength(text);return new Response(text,{status});
  }));
  get(await x.source.prepare());for(let n=0;n<8;n++)get(await x.source.initial(`t${n}`));expect(x.source.stats().reserved).toBe(20);
  expect(get(await x.source.finalize())).toMatchObject({state:'unverified',tables:Array.from({length:8},(_,n)=>n===7?{reason:'evidence_budget_exhausted'}:{state:'stable'})});
  expect(last).toBe(1);expect(c).toBe(21);expect(e).toBe(262144);
  expect(x.source.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,reserved:0});
});
it.each(['parent','metadata','table'] as const)('does not deliver evidence when the final %s version changes',async kind=>{
  const x=await start(setup(r=>{if(r.method==='POST')return new Response(token);
    if(r.purpose===`${kind}_final`){const result=kind==='parent'?[{sys_id:id,sys_updated_on:'changed',sys_mod_count:'2'}]:
      kind==='metadata'?[{sys_id:tableId,update_set:id,name:'sys_script_'+tableId,sys_updated_on:'changed',sys_mod_count:'2'}]:
      [{sys_id:tableId,name:'incident',sys_scope:'global',sys_updated_on:'changed',sys_mod_count:'2'}];return new Response(JSON.stringify({result}));}
    return new Response(body(r));}));
  get(await x.source.prepare());get(await x.source.initial('incident'));expect(get(await x.source.finalize())).toMatchObject({state:'changed',seal:null});
  expect(x.source.stats().reserved).toBe(0);expect(x.source.consumeObservations('incident')).toEqual({ok:false,code:'evidence_missing'});
});
it('pins the destination and consumes a ticket across probe and source adoption with no second factory or claim',async()=>{
  const x=await start();expect(x.api.root.adopt(x.ticket)).toEqual({ok:false,code:'invalid_state'});
  expect(x.api.root.adoptSource(x.ticket)).toEqual({ok:false,code:'invalid_state'});
  expect(await x.api.bootstrap.run()).toEqual({ok:false,code:'invalid_state'});expect(x.api.bootstrap.close().ok).toBe(false);
  expect(x.api.bootstrap.cancel().ok).toBe(false);get(await x.source.prepare());get(await x.source.finalize());expect(x.source.stats().reserved).toBe(0);
  const y=setup();get(await y.api.bootstrap.run());const t=get(y.api.root.offer()),probe=get(y.api.root.adopt(t));
  get(await probe.probeParent());expect(y.api.root.adoptSource(t)).toEqual({ok:false,code:'invalid_state'});expect(y.api.stats().requests).toBe(2);
});
it('refuses foreign/cloned adoption without poisoning the pinned owner or accepting another adapter',async()=>{
  const x=setup(),y=setup();get(await x.api.bootstrap.run());get(await y.api.bootstrap.run());
  const tx=get(x.api.root.offer()),ty=get(y.api.root.offer());
  expect(x.api.root.adoptSource(ty)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(y.api.root.adoptSource({...tx})).toEqual({ok:false,code:'evidence_binding_mismatch'});
  const a=get(x.api.root.adoptSource(tx)),b=get(y.api.root.adoptSource(ty));get(await a.prepare());get(await b.prepare());
  expect(get(await a.finalize()).state).toBe('stable');expect(get(await b.finalize()).state).toBe('stable');
});
it.each(['cancel','close','session'] as const)('rejects cached/deliverable data and new reads after %s without retrying authentication',async kind=>{
  const calls:FixtureHandoffRequest[]=[],x=await start(setup(r=>{calls.push(r);return new Response(body(r));}));
  get(await x.source.prepare());get(await x.source.initial('incident'));
  if(kind==='session')x.session.close();else x.api.root[kind]();
  expect(await x.source.initial('incident')).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(await x.source.finalize()).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(calls).toHaveLength(4);expect(calls.filter(r=>r.method==='POST')).toHaveLength(1);
});
it.each([401,403])('preserves terminal initial HTTP %s at the source and root without a final read',async status=>{
  const calls:string[]=[],x=await start(setup(r=>{calls.push(r.method==='POST'?'oauth':r.purpose);return r.method==='GET'&&r.purpose==='table_initial'?new Response(null,{status}):new Response(body(r));}));
  get(await x.source.prepare());const result=await x.source.initial('incident');expect(result).toEqual({ok:false,code:status===401?'authentication_failed':'access_denied'});
  expect(await x.source.finalize()).toEqual(result);expect(x.api.stats().primary).toBe(status===401?'authentication_failed':'access_denied');
  expect(calls).not.toContain('parent_final');expect(x.api.root.offer()).toEqual(result);
});
it('does not reset the total receive budget after OAuth adoption',async()=>{
  const cap=Buffer.byteLength(token)+Buffer.byteLength(body({method:'GET',path:'',purpose:'parent_initial',ordinal:1,synthetic:true}));
  const x=await start(setup(undefined,{totalBytes:cap}));
  expect(await x.source.prepare()).toEqual({ok:false,code:'receive_budget_exceeded'});expect(x.source.stats()).toMatchObject({requests:2,received_bytes:cap});
});
it('keeps the original hard deadline after adoption and forbids final/delivery resurrection',async()=>{
  const x=await start(setup(undefined,{deadlineMs:120,requestTimeoutMs:30}));get(await x.source.prepare());get(await x.source.initial('incident'));
  await vi.advanceTimersByTimeAsync(120);expect(await x.source.finalize()).toEqual({ok:false,code:'deadline_exceeded'});
  expect(x.source.consumeObservations('incident')).toEqual({ok:false,code:'deadline_exceeded'});expect(x.api.stats().requests).toBe(4);
});
it.each(['cancel','close'] as const)('does not commit the private source when final adoption clock reenters %s',async kind=>{
  const x=setup();get(await x.api.bootstrap.run());const ticket=get(x.api.root.offer()),now=performance.now.bind(performance);
  vi.spyOn(performance,'now').mockImplementationOnce(()=>{x.api.root[kind]();return now();});
  expect(x.api.root.adoptSource(ticket)).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(x.api.stats().requests).toBe(1);expect(x.api.root.adoptSource(ticket).ok).toBe(false);
});
it('uses the same 50/55/60 phase schedule rather than granting a fresh source deadline',async()=>{
  const x=await start(setup(undefined,{deadlineMs:120,requestTimeoutMs:30}));get(await x.source.prepare());get(await x.source.initial('incident'));
  await vi.advanceTimersByTimeAsync(100);expect(get(await x.source.finalize()).state).toBe('stable');expect(x.source.stats()).toMatchObject({requests:7,reserved:0});
  const y=setup(undefined,{deadlineMs:120,requestTimeoutMs:30});get(await y.api.bootstrap.run());const ticket=get(y.api.root.offer());
  await vi.advanceTimersByTimeAsync(100);expect(y.api.root.adoptSource(ticket)).toEqual({ok:false,code:'phase_deadline_exceeded'});
  expect(y.api.stats().requests).toBe(1);
});
it('observes cancel/closed/release once when a root cancellation interrupts an initial read',async()=>{
  const cancel=vi.fn(),x=await start(setup(r=>r.method==='GET'&&r.purpose==='table_initial'?
    new Response(new ReadableStream({pull(){},cancel})):new Response(body(r))));
  get(await x.source.prepare());const work=x.source.initial('incident');await vi.advanceTimersByTimeAsync(0);x.api.root.cancel();
  expect(await work).toEqual({ok:false,code:'cancelled'});expect(cancel).toHaveBeenCalledTimes(1);
  expect(x.source.stats()).toMatchObject({active:false,timers:0,retained_bytes:0,state:'failed',primary:'cancelled'});
  expect(await x.source.finalize()).toEqual({ok:false,code:'cancelled'});
});
it('keeps authentication failure and cleanup uncertainty distinct and rejects all later source reads',async()=>{
  const x=await start(setup(r=>r.method==='GET'&&r.purpose==='table_initial'?
    new Response(new ReadableStream({pull(){},cancel(){return Promise.reject(Error('PRIVATE_CANCEL'));}}),{status:401}):new Response(body(r))));
  get(await x.source.prepare());expect(await x.source.initial('incident')).toEqual({ok:false,code:'authentication_failed'});
  expect(x.api.stats()).toMatchObject({primary:'authentication_failed',cleanup_unconfirmed:true,diagnostic:{primary:'authentication_failed',cleanup_unconfirmed:true}});
  expect(await x.source.finalize()).toEqual({ok:false,code:'authentication_failed'});expect(JSON.stringify(x.api.stats())).not.toContain('PRIVATE_CANCEL');
});
it('retains the same Response reuse guard across OAuth and private-source adoption',async()=>{
  const response=new Response(token),x=await start(setup(()=>response));expect((await x.source.prepare()).ok).toBe(false);
  expect(x.source.stats()).toMatchObject({requests:2,cleanup_unconfirmed:true,state:'failed'});expect(x.source.consumeObservations('incident').ok).toBe(false);
});
it('strips extra columns from one-shot delivery and never exposes OAuth credentials or a formal seal',async()=>{
  const x=await start(setup(r=>{
    const raw=JSON.parse(body(r));if(r.method==='GET'){raw.secret='PRIVATE_OUTER';for(const row of raw.result){row.payload='PRIVATE_XML';row.token='PRIVATE_SECRET';}}
    return new Response(JSON.stringify(raw));
  }));
  get(await x.source.prepare());get(await x.source.initial('incident'));const final=get(await x.source.finalize()),delivery=get(x.source.consumeObservations('incident'));
  expect(final.seal).toBeNull();expect(JSON.stringify([final,delivery,x.api.stats(),x.source.stats()])).not.toMatch(/PRIVATE_|access_token|refresh_token|"payload":|"script":/);
  expect(delivery.evidence_issuance).toBe('disabled');expect(globalThis.fetch).not.toHaveBeenCalled();
});
it('preserves a source binding failure in the root even after source/root close',async()=>{
  const x=await start(setup(r=>r.method==='GET'&&r.purpose==='table_initial'?
    new Response(JSON.stringify({result:[{sys_id:tableId,name:'problem',sys_scope:'global',sys_updated_on:'2026-10-27',sys_mod_count:'1'}]})):new Response(body(r))));
  get(await x.source.prepare());expect(await x.source.initial('incident')).toEqual({ok:false,code:'table_binding_mismatch'});
  x.source.close();x.api.root.close();expect(x.api.stats().primary).toBe('table_binding_mismatch');
  expect(await x.source.finalize()).toEqual({ok:false,code:'table_binding_mismatch'});
});
it('does not export an arbitrary-adapter adoption or transport registration constructor',()=>{
  expect(Object.keys(fixed).sort()).toEqual(['createFixtureFixedWebSource','createFixtureOAuthSourceTransport','fixtureFixedGetRequest']);
});
