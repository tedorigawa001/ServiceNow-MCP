import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoundedReadSession, type BoundedReadOptions } from '../../src/servicenow/bounded-read.js';
import { createFakeSessionOwnerIssuer } from '../../src/review/abort-scope-evidence-session-fixture.js';
import { createSessionBoundFakeTransport } from '../../src/review/abort-scope-evidence-transport-budget.js';
import type { FakeTransportPurpose } from '../../src/review/abort-scope-evidence-transport-state.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const sessions:BoundedReadSession[]=[];let serial=0;
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{sessions.forEach(s=>s.close());sessions.length=0;vi.useRealTimers();});
async function setup(limits:BoundedReadOptions['limits']={}){
  const network=vi.fn(async()=>new Response('{}'));
  const s=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:`SECRET_${serial++}`,oauth:{clientId:'',clientSecret:''}},{fetch:network,limits});sessions.push(s);
  await s.get('/api/now/table/sys_update_set?sysparm_limit=1');
  const f=createFakeSessionOwnerIssuer(),source=get(f.source(s,{parent_ready:true,final_started:false,release_match:'matched'})),owner=get(f.claim(s,source.source,source.permit));
  let status=200,text='{}',cancel=0,releases=0;
  const dispatch=vi.fn(()=>{let cancelled=false;return {snapshot:()=>({fetch:'fulfilled',status,body:'reader',pending_read:false,eof:true,closed:'fulfilled',cancel:cancelled?'fulfilled':'not_requested'}),
    bodyText:()=>text,cancel:()=>{cancelled=true;cancel++;},releaseLock:()=>{releases++;},abort:()=>{}};});
  const bound=get(createSessionBoundFakeTransport(s,owner,{dispatch})),m=bound.machine;
  function permit(kind:FakeTransportPurpose='metadata_initial',target?:string){
    const slot=kind.endsWith('_final')?get(m.slot(kind==='parent_final'?'parent':kind==='metadata_final'?'metadata':'table',target)):undefined;
    return get(m.purpose(kind,{source:m.source,phase:m.phase(),target,slot}));
  }
  return {s,f,owner,m,bound,network,dispatch,permit,setStatus:(n:number)=>{status=n;},setText:(t:string)=>{text=t;},counts:()=>({cancel,releases})};
}
const bytes=(s:string)=>Buffer.from(s);
it('charges the real session once per fake dispatch/chunk, not on parse or consume',async()=>{
  const x=await setup(),p=x.permit(),a=get(x.m.begin(p));
  expect(x.m.chunk(a,0,bytes('{')).ok).toBe(true);expect(x.m.chunk(a,1,bytes('}')).ok).toBe(true);
  const result=get(x.m.poll(a));if(result.state!=='settled'||!result.body)throw Error('no body');
  expect(x.s.stats()).toEqual({requests:2,received_bytes:4,payload_bytes:0});
  expect(get(x.m.consumeBody(result.body,p)).bytes).toBe(2);
  expect(x.s.stats().received_bytes).toBe(4);expect(x.network).toHaveBeenCalledTimes(1);
  expect(x.m.issueEvidence().ok).toBe(false);expect(JSON.stringify(x.bound.stats())).not.toContain('SECRET');
});
it('requires charged bytes to match body content, not merely its length',async()=>{
  const x=await setup(),a=get(x.m.begin(x.permit()));x.m.chunk(a,0,bytes('[]'));
  const r=get(x.m.poll(a));expect(r.state==='settled'&&r.outcome).toBe('invalid_response');expect(x.s.stats().received_bytes).toBe(4);
});
it('does not mint a receipt for uncharged fake body text',async()=>{
  const x=await setup(),a=get(x.m.begin(x.permit()));const r=get(x.m.poll(a));expect(r.state==='settled'&&r.body).toBe(null);
});
it('retains retry bytes and charges a fresh C before each dispatch',async()=>{
  const x=await setup(),p=x.permit();x.setStatus(500);let a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));get(x.m.poll(a));
  x.setStatus(200);a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));get(x.m.poll(a));
  expect(x.s.stats()).toEqual({requests:3,received_bytes:6,payload_bytes:0});expect(x.dispatch).toHaveBeenCalledTimes(2);
});
it('charges synchronous dispatch throw without refund',async()=>{
  const x=await setup(),p=x.permit();x.dispatch.mockImplementationOnce(()=>{throw Error('SECRET');});const a=get(x.m.begin(p));get(x.m.poll(a));
  expect(x.s.stats().requests).toBe(2);expect(x.m.begin(p).ok).toBe(true);expect(x.s.stats().requests).toBe(3);
});
it.each(['replay','gap','clone'] as const)('rejects %s chunk events before accounting again',async mode=>{
  const x=await setup(),a=get(x.m.begin(x.permit()));x.m.chunk(a,0,bytes('{'));
  expect(x.m.chunk(mode==='clone'?structuredClone(a):a,mode==='gap'?2:0,bytes('}')).ok).toBe(false);
  expect(x.s.stats().received_bytes).toBe(3);
});
it('preserves four final reservations and rejects ordinary dispatch before fake I/O',async()=>{
  const x=await setup({requests:6}),p=x.permit(),a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));const r=get(x.m.poll(a));
  if(r.state==='settled'&&r.body)x.m.consumeBody(r.body,p);
  expect(x.m.begin(x.permit('release_rows'))).toEqual({ok:false,code:'request_budget_exceeded'});
  expect(x.bound.stats().reserved).toBe(4);expect(x.dispatch).toHaveBeenCalledTimes(1);
  expect(x.m.enterFinal().ok).toBe(true);
  for(const kind of ['parent_final','metadata_final'] as const){const p=x.permit(kind),a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));const r=get(x.m.poll(a));if(r.state==='settled'&&r.body)x.m.consumeBody(r.body,p);}
  expect(x.bound.stats()).toMatchObject({requests:4,reserved:0});
});
it('does not let legacy GET bypass the claimed accounting owner',async()=>{
  const x=await setup();await expect(x.s.get('/api/now/table/sys_update_set?sysparm_limit=1')).rejects.toThrow('invalid_input');expect(x.network).toHaveBeenCalledTimes(1);
  expect(()=>x.s.chargePayload('SECRET')).toThrow('invalid_input');expect(()=>x.s.setPhaseReserve(1)).toThrow('invalid_input');expect(x.s.stats().payload_bytes).toBe(0);
});
it('rejects second owner generation and stops the existing bound machine',async()=>{
  const x=await setup(),p=x.permit();expect(createSessionBoundFakeTransport(x.s,x.owner,{dispatch:x.dispatch}).ok).toBe(false);expect(x.m.begin(p).ok).toBe(false);
});
it('rejects a foreign real session without consuming its own claim',async()=>{
  const a=await setup(),b=await setup();expect(createSessionBoundFakeTransport(b.s,a.owner,{dispatch:a.dispatch}).ok).toBe(false);expect(b.bound.stats().requests).toBe(1);
});
it.each(['close','cancel','deadline'] as const)('does not charge late chunks after %s',async mode=>{
  const x=await setup(),a=get(x.m.begin(x.permit()));if(mode==='close')x.s.close();else if(mode==='cancel')x.m.stop('cancelled');else vi.advanceTimersByTime(60000);
  expect(x.m.chunk(a,0,bytes('{}')).ok).toBe(false);expect(x.s.stats().received_bytes).toBe(2);expect(x.m.issueEvidence().ok).toBe(false);
});
it.each([4,5])('charges G overshoot before rejecting (limit %s)',async total=>{
  const x=await setup({totalBytes:total}),a=get(x.m.begin(x.permit()));expect(x.m.chunk(a,0,new Uint8Array(4)).ok).toBe(false);
  expect(x.s.stats().received_bytes).toBe(6);expect(x.m.stats().primary).toBe('receive_budget_exceeded');
});
it('accepts the exact G boundary and stops the next chunk without refund',async()=>{
  const x=await setup({totalBytes:4}),a=get(x.m.begin(x.permit()));expect(x.m.chunk(a,0,bytes('{}')).ok).toBe(true);expect(x.m.chunk(a,1,bytes(' ')).ok).toBe(false);expect(x.s.stats().received_bytes).toBe(5);
});
it('keeps table E as a subset of G and makes per-table overflow local',async()=>{
  const x=await setup(),a=get(x.m.begin(x.permit('table_initial','incident')));expect(x.m.chunk(a,0,new Uint8Array(16385))).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(x.bound.stats()).toMatchObject({requests:2,received_bytes:16387,evidence_bytes:16385,reserved:6});
  const r=get(x.m.poll(a));expect(r.state==='settled'&&r.outcome).toBe('scope_evidence_limit');expect(x.m.stats().primary).toBe(null);
});
it('charges payload bytes independently and keeps local overflow charged',async()=>{
  const x=await setup({payloadBytes:2}),a=get(x.m.begin(x.permit('payload','a'.repeat(32))));expect(x.m.chunk(a,0,bytes('{} '))).toEqual({ok:false,code:'payload_limit'});expect(x.s.stats().payload_bytes).toBe(3);
});
it('limits empty events even though they cost zero bytes',async()=>{
  const x=await setup(),a=get(x.m.begin(x.permit()));for(let i=0;i<16;i++)expect(x.m.chunk(a,i,new Uint8Array()).ok).toBe(true);
  expect(x.m.chunk(a,16,new Uint8Array()).ok).toBe(false);expect(x.s.stats().received_bytes).toBe(2);
});
it('rejects events after the I/O cutoff without charging late bytes',async()=>{
  const x=await setup(),a=get(x.m.begin(x.permit()));vi.advanceTimersByTime(9750);
  expect(x.m.chunk(a,0,bytes('{}'))).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(x.s.stats().received_bytes).toBe(2);
});
it('independently reconstructs C/G/E/payload and R from a fixed event trace',async()=>{
  const x=await setup();let c=1,g=2,e=0,payload=0,reserved=4;
  for(const [kind,target,parts] of [
    ['metadata_initial',undefined,['{','}']],['payload','b'.repeat(32),['{}']],['table_initial','incident',['{','}']],
  ] as const){
    if(kind==='table_initial')reserved+=2;
    const p=x.permit(kind,target),a=get(x.m.begin(p));c++;
    for(const [seq,text] of parts.entries()){const n=Buffer.byteLength(text);g+=n;if(kind==='payload')payload+=n;if(kind==='table_initial')e+=n;
      expect(x.m.chunk(a,seq,bytes(text)).ok).toBe(true);expect(x.bound.stats()).toEqual({requests:c,received_bytes:g,payload_bytes:payload,evidence_bytes:e,reserved});}
    const r=get(x.m.poll(a));if(r.state==='settled'&&r.body)x.m.consumeBody(r.body,p);
  }
});
it('rejects final slot order before dispatch and retains charged C',async()=>{
  const x=await setup();x.m.enterFinal();expect(x.m.begin(x.permit('metadata_final')).ok).toBe(false);expect(x.dispatch).not.toHaveBeenCalled();expect(x.s.stats().requests).toBe(1);
});
it('closes further table dispatch when E reaches its exact cumulative cap',async()=>{
  const x=await setup();x.setStatus(500);
  for(let t=0;t<8;t++){const p=x.permit('table_initial',`u_table_${t}`);
    for(let n=0;n<2;n++){const a=get(x.m.begin(p));expect(x.m.chunk(a,0,new Uint8Array(16384)).ok).toBe(true);get(x.m.poll(a));}}
  const before=x.s.stats();expect(x.bound.stats().evidence_bytes).toBe(262144);
  expect(x.m.begin(x.permit('table_initial','u_other'))).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(x.s.stats()).toEqual(before);expect(before.requests).toBe(17);
});
it('does not reset the original session hard deadline when claiming later',async()=>{
  const x=await setup(),p=x.permit();vi.advanceTimersByTime(59999);expect(x.m.begin(p).ok).toBe(false);
  vi.advanceTimersByTime(1);expect(x.m.issueEvidence().ok).toBe(false);expect(x.s.stats().requests).toBe(1);
});
it('synchronously drops a pending fake body when the real session closes',async()=>{
  const x=await setup(),p=x.permit(),a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));const r=get(x.m.poll(a));
  expect(x.m.stats().body_pending).toBe(true);x.s.close();expect(x.m.stats().body_pending).toBe(false);
  if(r.state==='settled'&&r.body)expect(x.m.consumeBody(r.body,p).ok).toBe(false);
});

async function readTable(x:Awaited<ReturnType<typeof setup>>,kind:'table_initial'|'table_final',table:string,status=200,text='{}'){
  x.setStatus(status);x.setText(text);const p=x.permit(kind,table),a=get(x.m.begin(p));x.m.chunk(a,0,bytes(text));const r=get(x.m.poll(a));
  if(r.state!=='settled')throw Error('pending');if(r.body)get(x.m.consumeBody(r.body,p));return {p,a,r};
}
async function finalHeaders(x:Awaited<ReturnType<typeof setup>>){
  get(x.m.enterFinal());x.setStatus(200);x.setText('{}');
  for(const kind of ['parent_final','metadata_final'] as const){const p=x.permit(kind),a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));const r=get(x.m.poll(a));if(r.state==='settled'&&r.body)get(x.m.consumeBody(r.body,p));}
}
function skip(x:Awaited<ReturnType<typeof setup>>,table:string){return x.m.skipFinal(get(x.m.slot('table',table)),{source:x.m.source,phase:x.m.phase(),target:table});}
it('skips a failed table, releases two reservations once and continues to the next table',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a',404);await readTable(x,'table_initial','u_b');await finalHeaders(x);
  const before=x.bound.stats(),calls=x.dispatch.mock.calls.length,result=get(skip(x,'u_a'));
  expect(result).toEqual({state:'skipped',reason:'initial_unavailable',initial_outcome:'not_found_or_not_visible',released_attempts:2,synthetic:true,evidence_issuance:'disabled'});
  expect(x.bound.stats()).toEqual({...before,reserved:before.reserved-2});expect(x.dispatch).toHaveBeenCalledTimes(calls);
  await readTable(x,'table_final','u_b');expect(x.bound.stats()).toMatchObject({requests:6,received_bytes:12,evidence_bytes:6,reserved:0});expect(x.m.issueEvidence().ok).toBe(false);
});
it.each([['invalid_response','broken'],['scope_evidence_limit',' '.repeat(16385)]] as const)('keeps %s initial rejection as a reason-bearing skip',async(outcome,text)=>{
  const x=await setup();await readTable(x,'table_initial','u_a',200,text);await finalHeaders(x);
  expect(get(skip(x,'u_a'))).toMatchObject({reason:'initial_unavailable',initial_outcome:outcome,released_attempts:2});
});
it('marks an abandoned first retry unavailable without refunding its C or bytes',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a',500);await finalHeaders(x);const before=x.bound.stats();
  expect(get(skip(x,'u_a'))).toMatchObject({reason:'initial_not_completed',initial_outcome:'upstream_unavailable',released_attempts:2});
  expect(x.bound.stats()).toEqual({...before,reserved:0});
});
it('rejects arbitrary skip of a successful initial table without changing accounting',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a');await finalHeaders(x);const before=x.bound.stats();
  expect(skip(x,'u_a').ok).toBe(false);expect(x.bound.stats()).toEqual(before);
});
it('rejects repeated skip without a second release',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a',404);await finalHeaders(x);get(skip(x,'u_a'));const before=x.bound.stats();
  expect(skip(x,'u_a').ok).toBe(false);expect(x.bound.stats()).toEqual(before);
});
it.each(['order','unknown','normal','parent','foreign','clone'] as const)('rejects invalid skip: %s',async mode=>{
  const x=await setup();await readTable(x,'table_initial','u_a',404);await readTable(x,'table_initial','u_b',404);
  if(mode!=='normal')await finalHeaders(x);
  const slot=get(x.m.slot(mode==='parent'?'parent':'table',mode==='parent'?undefined:mode==='order'?'u_b':mode==='unknown'?'u_unknown':'u_a'));
  const before=x.bound.stats();expect(x.m.skipFinal(mode==='clone'?structuredClone(slot):slot,{source:mode==='foreign'?Object.freeze({}) as typeof x.m.source:x.m.source,phase:x.m.phase(),target:mode==='order'?'u_b':mode==='unknown'?'u_unknown':'u_a'}).ok).toBe(false);
  expect(x.bound.stats()).toEqual(before);
});
it('does not allow skip while a final I/O is active',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a');await finalHeaders(x);get(x.m.begin(x.permit('table_final','u_a')));const before=x.bound.stats();
  expect(skip(x,'u_a').ok).toBe(false);expect(x.bound.stats()).toEqual(before);
});
it('keeps unconfirmed cleanup terminal rather than converting it to a skip',async()=>{
  const x=await setup(),slot=get(x.m.slot('table','u_a')),phase=x.m.phase();x.dispatch.mockImplementationOnce(()=>({snapshot:()=>({fetch:'fulfilled',status:404,body:'unknown_lock',pending_read:false,eof:false,closed:null,cancel:'not_requested'}),bodyText:()=>'',cancel:()=>{},releaseLock:()=>{},abort:()=>{}}));
  const a=get(x.m.begin(x.permit('table_initial','u_a')));get(x.m.poll(a));const before=x.bound.stats();expect(x.m.skipFinal(slot,{source:x.m.source,phase,target:'u_a'}).ok).toBe(false);expect(x.bound.stats()).toEqual(before);
});
it.each(['cancel','close','deadline'] as const)('does not release on skip after %s',async mode=>{
  const x=await setup();await readTable(x,'table_initial','u_a',404);await finalHeaders(x);const slot=get(x.m.slot('table','u_a')),phase=x.m.phase(),before=x.bound.stats();
  if(mode==='cancel')x.m.stop('cancelled');else if(mode==='close')x.s.close();else vi.advanceTimersByTime(60000);
  expect(x.m.skipFinal(slot,{source:x.m.source,phase,target:'u_a'}).ok).toBe(false);expect(x.bound.stats()).toEqual(before);
});
it('skips all table reservations with zero dispatch when cumulative E is exhausted',async()=>{
  const x=await setup();x.setStatus(500);
  for(let t=0;t<8;t++){const p=x.permit('table_initial',`u_${t}`);
    for(let n=0;n<2;n++){const a=get(x.m.begin(p));x.m.chunk(a,0,new Uint8Array(16384));get(x.m.poll(a));}}
  await finalHeaders(x);const before=x.bound.stats(),calls=x.dispatch.mock.calls.length;let reserved=16;
  for(let t=0;t<8;t++){const result=get(skip(x,`u_${t}`));reserved-=2;
    expect(result).toMatchObject({reason:'evidence_budget_exhausted',released_attempts:2});expect(x.bound.stats()).toEqual({...before,reserved});}
  expect(x.dispatch).toHaveBeenCalledTimes(calls);expect(x.m.stats().primary).toBe(null);
});
it('releases only one unused retry reservation when E closes on a final first attempt',async()=>{
  const x=await setup(),text='{}'+' '.repeat(16382);
  for(let t=0;t<8;t++)await readTable(x,'table_initial',`u_${t}`,200,text);
  await finalHeaders(x);for(let t=0;t<7;t++)await readTable(x,'table_final',`u_${t}`,200,text);
  const {p}=await readTable(x,'table_final','u_7',500,text),before=x.bound.stats();
  expect(before).toMatchObject({requests:19,evidence_bytes:262144,reserved:1});
  expect(get(skip(x,'u_7'))).toMatchObject({reason:'evidence_budget_exhausted',released_attempts:1});
  expect(x.bound.stats()).toEqual({...before,reserved:0});expect(x.m.begin(p).ok).toBe(false);expect(x.bound.stats().requests).toBe(19);
});
it('requires unavailable tables to use skip rather than final dispatch',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a',404);await finalHeaders(x);const before=x.bound.stats(),calls=x.dispatch.mock.calls.length;
  expect(x.m.begin(x.permit('table_final','u_a')).ok).toBe(false);expect(x.dispatch).toHaveBeenCalledTimes(calls);expect(x.bound.stats()).toEqual(before);
});
it('does not allow skipping while a body still awaits consumption',async()=>{
  const x=await setup();await readTable(x,'table_initial','u_a',404);get(x.m.enterFinal());const p=x.permit('parent_final'),a=get(x.m.begin(p));x.m.chunk(a,0,bytes('{}'));get(x.m.poll(a));
  const before=x.bound.stats();expect(skip(x,'u_a').ok).toBe(false);expect(x.bound.stats()).toEqual(before);
});
