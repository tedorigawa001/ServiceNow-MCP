import { expect, it, vi } from 'vitest';
import { createSyntheticScopeStreamHarness as create, type SyntheticScopeReader, type SyntheticScopeSource } from '../../src/review/abort-scope-evidence-stream.js';
import { streamOracle, type StreamEvent } from './fixtures/scope-stream-oracle.js';
const defaults={requests:210,consumed:0,responseBytes:4194304,totalBytes:16777216,evidenceResponseBytes:16384,evidenceBytes:262144};
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T{if(!r.ok)throw Error(r.code);return r.value;}
const setup=(overrides:Partial<typeof defaults>={})=>get(create({...defaults,...overrides}));
type Harness=ReturnType<typeof setup>;
const json=(n:number)=>new TextEncoder().encode('{}'+' '.repeat(n-2));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function source(events:StreamEvent[],evidence:boolean,responses:{status:number;chunks:Uint8Array[];error?:boolean;cancel?:'reject'|'hang'}[]):SyntheticScopeSource {
  return async ordinal=>{events.push({kind:'dispatch',evidence});const r=responses[ordinal-1];if(!r)throw Error('PRIVATE_EXTRA_ATTEMPT');let index=0;
    return {status:r.status,reader:{read:async()=>{
      if(index<r.chunks.length){const value=r.chunks[index++];events.push({kind:'chunk',bytes:value.byteLength});return {done:false as const,value};}
      if(r.error)throw Error('PRIVATE_READ_FAILURE');events.push({kind:'eof'});return {done:true as const};
    },cancel:()=>{events.push({kind:'reader_cancel'});return r.cancel==='reject'?Promise.reject(Error('PRIVATE_CANCEL')):
      r.cancel==='hang'?new Promise<void>(()=>{}):Promise.resolve();}}};};
}
function check(h:Harness,events:StreamEvent[]){const expected=streamOracle(events),s=h.stats();
  expect({requests:s.requests,global_bytes:s.global_bytes,evidence_bytes:s.evidence_bytes,response_bytes:s.response_bytes,cancel_calls:s.cancel_calls}).toEqual(expected);}
it.each([16384,16385])('receives %i bytes with bounded acceptance',async n=>{
  const h=setup(),t=get(h.admitTable('incident')),events:StreamEvent[]=[];
  const out=await h.runInitial(t,source(events,true,[{status:200,chunks:[json(n)]}]));
  expect(out.ok).toBe(n===16384);if(!out.ok)expect(out).toMatchObject({code:'scope_evidence_limit',terminal:false});
  check(h,events);expect(h.stats()).toMatchObject({requests:1,global_bytes:n,evidence_bytes:n});
});
it('keeps per-response overflow local and permits another table',async()=>{
  const h=setup({evidenceResponseBytes:8,evidenceBytes:50}),events:StreamEvent[]=[];
  const t=get(h.admitTable('incident'));expect(await h.runInitial(t,source(events,true,[{status:200,chunks:[json(9)]}]))).toMatchObject({ok:false,terminal:false});
  const other=get(h.admitTable('task'));get(await h.runInitial(other,source(events,true,[{status:200,chunks:[json(2)]}])));
  check(h,events);expect(h.stats()).toMatchObject({requests:2,evidence_bytes:11,evidence_closed:false});
});
it('stops before reading further chunks after the first evidence overflow',async()=>{
  const h=setup({evidenceResponseBytes:4}),events:StreamEvent[]=[];
  const out=await h.runInitial(get(h.admitTable('incident')),source(events,true,[{status:200,chunks:[json(3),json(2),json(100)]}]));
  expect(out).toMatchObject({code:'scope_evidence_limit',terminal:false});check(h,events);
  expect(events.filter(e=>e.kind==='chunk')).toHaveLength(2);expect(events.some(e=>e.kind==='eof')).toBe(false);
  expect(h.stats()).toMatchObject({global_bytes:5,evidence_bytes:5,response_bytes:5});
});
it.each([8,9])('closes cumulative evidence at %i while preserving ordinary final reads',async total=>{
  const h=setup({evidenceResponseBytes:8,evidenceBytes:8}),events:StreamEvent[]=[];
  const a=get(h.admitTable('incident'));get(await h.runInitial(a,source(events,true,[{status:200,chunks:[json(6)]}])));
  const b=get(h.admitTable('task')),out=await h.runInitial(b,source(events,true,[{status:200,chunks:[json(total-6)]}]));expect(out.ok).toBe(total===8);
  expect(h.admitTable('u_new')).toMatchObject({ok:false,code:'scope_evidence_limit'});get(h.enterFinal());
  get(await h.runFinal(h.parent,'parent',source(events,false,[{status:200,chunks:[json(2)]}])));
  get(await h.runFinal(h.metadata,'metadata',source(events,false,[{status:200,chunks:[json(2)]}])));
  const forbidden=vi.fn(async()=>{throw Error('must not fetch');});
  for(const t of [a,b])expect(await h.runFinal(get(h.tableSlot(t)),t,forbidden)).toMatchObject({ok:false,code:'scope_evidence_limit',terminal:false});
  expect(forbidden).not.toHaveBeenCalled();check(h,events);expect(h.stats()).toMatchObject({reserved:0,requests:4,evidence_bytes:total,global_bytes:total+4});
});
it('prioritizes global overflow when the same chunk also exceeds evidence limits',async()=>{
  const h=setup({totalBytes:8,evidenceBytes:8,evidenceResponseBytes:4}),events:StreamEvent[]=[];
  const t=get(h.admitTable('incident'));const out=await h.runInitial(t,source(events,true,[{status:200,chunks:[json(9)]}]));
  expect(out).toEqual({ok:false,code:'receive_budget_exceeded',terminal:true});check(h,events);
  expect(h.stats()).toMatchObject({global_bytes:9,evidence_bytes:9,reserved:0,primary:'receive_budget_exceeded'});
  expect(h.stop('cancelled')).toEqual(out);
});
it('respects a lowered ordinary response ceiling even for evidence',async()=>{
  const h=setup({responseBytes:4,evidenceResponseBytes:8}),events:StreamEvent[]=[];
  expect(await h.runInitial(get(h.admitTable('incident')),source(events,true,[{status:200,chunks:[json(5)]}]))).toMatchObject({code:'receive_budget_exceeded',terminal:true});check(h,events);
});
it('accepts EOF at the exact global cap but does not start the next request',async()=>{
  const h=setup({totalBytes:2}),events:StreamEvent[]=[];get(await h.runOrdinary('ordinary',source(events,false,[{status:200,chunks:[json(2)]}])));
  const forbidden=vi.fn(async()=>{throw Error('no dispatch');});expect(await h.runOrdinary('ordinary',forbidden)).toMatchObject({code:'receive_budget_exceeded',terminal:true});
  expect(forbidden).not.toHaveBeenCalled();check(h,events);
});
it.each([429,500,503])('charges a failed %i body and retry exactly once',async status=>{
  const h=setup(),events:StreamEvent[]=[];const t=get(h.admitTable('incident'));
  get(await h.runInitial(t,source(events,true,[{status,chunks:[json(7)]},{status:200,chunks:[json(2)]}])));
  check(h,events);expect(h.stats()).toMatchObject({requests:2,evidence_bytes:9,global_bytes:9,response_bytes:2});
});
it('retains partial bytes after a read rejection and does not leak its exception',async()=>{
  const h=setup(),events:StreamEvent[]=[];const t=get(h.admitTable('incident'));
  get(await h.runInitial(t,source(events,true,[{status:200,chunks:[json(5)],error:true},{status:200,chunks:[json(2)]}])));
  check(h,events);expect(h.stats()).toMatchObject({requests:2,evidence_bytes:7,response_bytes:2});
  expect(JSON.stringify(h.stats())).not.toContain('PRIVATE');
});
it('stops after two upstream failures without refunding either body',async()=>{
  const h=setup(),events:StreamEvent[]=[];const out=await h.runInitial(get(h.admitTable('incident')),
    source(events,true,[{status:500,chunks:[json(3)]},{status:500,chunks:[json(4)]}]));
  expect(out).toEqual({ok:false,code:'upstream_unavailable',terminal:false});check(h,events);expect(h.stats().requests).toBe(2);
});
it('does not retry invalid JSON or evidence-response overflow',async()=>{
  for(const invalid of [true,false]){const h=setup({evidenceResponseBytes:4}),events:StreamEvent[]=[];
    const out=await h.runInitial(get(h.admitTable('incident')),source(events,true,[{status:200,chunks:[invalid?new TextEncoder().encode('bad'):json(5)]}]));
    expect(out).toMatchObject({ok:false,code:invalid?'invalid_response':'scope_evidence_limit'});check(h,events);expect(h.stats().requests).toBe(1);}
});
it('does not retry when the failed body exactly consumes the evidence cap',async()=>{
  const h=setup({evidenceBytes:4}),events:StreamEvent[]=[];
  expect(await h.runInitial(get(h.admitTable('incident')),source(events,true,[{status:500,chunks:[json(4)]}]))).toMatchObject({code:'scope_evidence_limit',terminal:false});
  check(h,events);expect(h.stats()).toMatchObject({requests:1,evidence_closed:true});
});
it.each([401,403,404,400])('does not open the body of terminal %i',async status=>{
  const h=setup(),read=vi.fn(async()=>{throw Error('PRIVATE_BODY');}),cancel=vi.fn(async()=>{});
  const out=await h.runInitial(get(h.admitTable('incident')),async()=>({status,reader:{read,cancel}}));
  expect(read).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledTimes(1);expect(h.stats()).toMatchObject({requests:1,global_bytes:0,evidence_bytes:0});
  expect(out).toMatchObject({ok:false,terminal:status===401||status===403});
});
it.each(['resolve','reject','hang'] as const)('keeps bounded cleanup with cancel=%s',async mode=>{
  const h=setup(),events:StreamEvent[]=[];
  const out=await h.runInitial(get(h.admitTable('incident')),source(events,true,[{status:200,chunks:[json(2)],cancel:mode==='resolve'?undefined:mode}]));
  expect(get(out).cleanup).toBe(mode==='resolve'?'confirmed':'unconfirmed');expect(h.stats()).toMatchObject({cancel_calls:1,cleanup:mode==='resolve'?'confirmed':'unconfirmed'});check(h,events);
});
it('cancels a pending read, ignores its late bytes and retains the first reason',async()=>{
  const h=setup(),events:StreamEvent[]=[],entered=deferred<void>(),late=deferred<{done:false;value:Uint8Array}>(),abort=new AbortController();let reads=0;
  const reader:SyntheticScopeReader={read:()=>{if(reads++===0){events.push({kind:'chunk',bytes:2});return Promise.resolve({done:false,value:json(2)});}
    entered.resolve();return late.promise;},cancel:async()=>{events.push({kind:'reader_cancel'});}};
  const work=h.runInitial(get(h.admitTable('incident')),async()=>{events.push({kind:'dispatch',evidence:true});return {status:200,reader};},abort.signal);
  await entered.promise;events.push({kind:'cancel'});abort.abort();expect(await work).toEqual({ok:false,code:'cancelled',terminal:true});
  events.push({kind:'chunk',bytes:100});late.resolve({done:false,value:new Uint8Array(100)});await Promise.resolve();
  check(h,events);expect(h.stats()).toMatchObject({requests:1,global_bytes:2,evidence_bytes:2,reserved:0,primary:'cancelled'});
  h.stop('deadline_exceeded');h.close();expect(h.stats().primary).toBe('cancelled');
});
it('cancels a late response after a non-cooperative source without charging a body',async()=>{
  const h=setup(),abort=new AbortController(),entered=deferred<void>(),late=deferred<{status:number;reader:SyntheticScopeReader}>();
  const read=vi.fn(async()=>({done:true as const})),cancel=vi.fn(async()=>{});
  const work=h.runInitial(get(h.admitTable('incident')),()=>{entered.resolve();return late.promise;},abort.signal);
  await entered.promise;abort.abort();expect(await work).toMatchObject({code:'cancelled',terminal:true});
  late.resolve({status:200,reader:{read,cancel}});await Promise.resolve();await Promise.resolve();
  expect(cancel).toHaveBeenCalledTimes(1);expect(read).not.toHaveBeenCalled();expect(h.stats()).toMatchObject({requests:1,global_bytes:0,cleanup:'unconfirmed'});
});
it('propagates a ledger protocol failure immediately to a stalled read',async()=>{
  const h=setup(),entered=deferred<void>(),cancel=vi.fn(async()=>{});
  const work=h.runInitial(get(h.admitTable('incident')),async()=>({status:200,reader:{
    read:()=>{entered.resolve();return new Promise(()=>{});},cancel}}));
  await entered.promise;expect(h.enterFinal()).toMatchObject({ok:false,code:'invalid_state'});
  expect(await work).toEqual({ok:false,code:'invalid_state',terminal:true});expect(cancel).toHaveBeenCalledTimes(1);
  expect(h.stats()).toMatchObject({requests:1,reserved:0,global_bytes:0,primary:'invalid_state'});
});
it('does not dispatch on pre-abort, exhausted normal reservations, or repeated cancelled calls',async()=>{
  const abort=new AbortController();abort.abort();const f=vi.fn(async()=>({status:200}));
  const h=setup();expect(await h.runInitial(get(h.admitTable('incident')),f,abort.signal)).toMatchObject({code:'cancelled'});
  expect(h.stats().requests).toBe(0);expect(await h.runOrdinary('ordinary',f)).toMatchObject({code:'cancelled'});
  const limited=setup({requests:4});expect(await limited.runOrdinary('ordinary',f)).toMatchObject({code:'request_budget_exceeded',terminal:false});
  expect(f).not.toHaveBeenCalled();expect(limited.stats()).toMatchObject({requests:0,reserved:4});
});
it.each([1,2,7,128])('matches the independent oracle for chunk partition %i',async partition=>{
  const h=setup(),events:StreamEvent[]=[],bytes=json(513),chunks=[];
  for(let i=0;i<bytes.length;i+=partition)chunks.push(bytes.slice(i,i+partition));
  const t=get(h.admitTable('incident'));get(await h.runInitial(t,source(events,true,[{status:200,chunks:[new Uint8Array(),...chunks]}])));
  check(h,events);expect(h.stats()).toMatchObject({global_bytes:513,evidence_bytes:513,response_bytes:513});
});
it('does not call a real fetch, clock, timer or logger',async()=>{
  const f=vi.fn(()=>{throw Error('forbidden');});vi.stubGlobal('fetch',f);
  const clock=vi.spyOn(Date,'now').mockImplementation(f),timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(f),log=vi.spyOn(console,'log').mockImplementation(f);
  try{const h=setup();get(await h.runInitial(get(h.admitTable('incident')),source([],true,[{status:200,chunks:[json(2)]}])));expect(f).not.toHaveBeenCalled();}
  finally{clock.mockRestore();timer.mockRestore();log.mockRestore();vi.unstubAllGlobals();}
});
