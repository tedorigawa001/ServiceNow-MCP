import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FixtureAccountingSession} from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import {createFakeSessionOwnerIssuer} from '../../src/review/abort-scope-evidence-session-fixture.js';
import {createFixtureFixedWebSource} from '../../src/review/abort-scope-evidence-fixed-web-source.js';
import {createFixtureWebStreamTransport} from '../../src/review/abort-scope-evidence-web-stream.js';
const id='a'.repeat(32),tableId='b'.repeat(32),sessions:FixtureAccountingSession[]=[];
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
type Source=Parameters<typeof createFixtureFixedWebSource>[3];
const row=(name='incident',scope:string|null='global')=>({sys_id:tableId,name,sys_scope:scope,sys_updated_on:'2026-10-26 00:00:00',sys_mod_count:'1'});
function response(request:Parameters<Source>[0]){
  return new Response(JSON.stringify({result:request.purpose.startsWith('table')?[row()]:request.purpose.startsWith('parent')?
    [{sys_id:id,sys_updated_on:'2026-10-26',sys_mod_count:'1'}]:[]}));
}
async function fixture(){
  const session=new FixtureAccountingSession();sessions.push(session);await session.baseline('{}',()=>{});
  const f=createFakeSessionOwnerIssuer(),s=get(f.source(session,{parent_ready:true,final_started:false,release_match:'matched'}));
  return {session,owner:get(f.claim(session,s.source,s.permit))};
}
async function setup(source:Source=response){const f=await fixture();return {...f,api:get(createFixtureFixedWebSource(f.session,f.owner,id,source))};}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{sessions.splice(0).forEach(s=>s.close());expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();});
it('binds fixed GETs, actual receipt status/time and normalized observations to one fixture source',async()=>{
  const seen:Parameters<Source>[0][]=[],x=await setup(r=>{seen.push(r);return response(r);});
  expect(get(await x.api.prepare()).state).toBe('prepared');
  const first=get(await x.api.initial('incident'));expect(first.observation).toMatchObject({state:'rows',phase:'initial',rows:[{sys_scope:'global'}]});
  expect(get(await x.api.initial('incident')).cached).toBe(true);
  const final=get(await x.api.finalize());expect(final).toMatchObject({state:'stable',parent:'stable',metadata:'stable',seal:null,evidence_issuance:'disabled'});
  expect(seen.map(r=>r.purpose)).toEqual(['parent_initial','metadata_initial','table_initial','parent_final','metadata_final','table_final']);
  for(const r of seen){const u=new URL(r.path,'https://fixture.invalid');expect(r.method).toBe('GET');expect(u.searchParams.get('sysparm_offset')).toBe('0');
    expect(u.searchParams.get('sysparm_display_value')).toBe('false');expect(u.searchParams.get('sysparm_exclude_reference_link')).toBe('true');
    if(r.purpose.startsWith('table')){expect(u.pathname).toBe('/api/now/table/sys_db_object');expect(u.searchParams.get('sysparm_query')).toBe('name=incident^ORDERBYsys_id');
      expect(u.searchParams.get('sysparm_fields')).toBe('sys_id,name,sys_scope,sys_updated_on,sys_mod_count');expect(u.searchParams.get('sysparm_limit')).toBe('2');}}
  expect(x.api.stats()).toMatchObject({requests:7,reserved:0,timers:0,retained_bytes:0,state:'done'});
});
it.each(['empty','ambiguous','missing','invalid'] as const)('downgrades semantic %s initial once and skips its final without GET or refund',async kind=>{
  const seen:string[]=[],x=await setup(r=>{seen.push(r.purpose);if(!r.purpose.startsWith('table'))return response(r);
    const missing={sys_id:tableId,name:'incident',sys_mod_count:'1'};
    return new Response(JSON.stringify({result:kind==='empty'?[]:kind==='ambiguous'?[row(),row()]:kind==='missing'?[missing]:[row('incident','PRIVATE_SECRET')]}));});
  get(await x.api.prepare());expect(get(await x.api.initial('incident')).observation?.state).toBe('unavailable');
  const result=get(await x.api.finalize());expect(result.state).toBe('unverified');expect(result.tables).toHaveLength(1);
  expect(seen).not.toContain('table_final');expect(x.api.stats()).toMatchObject({requests:6,reserved:0});expect(JSON.stringify(result)).not.toContain('PRIVATE_SECRET');
});
it.each([404,503] as const)('keeps local HTTP %s failure and final reservation release',async status=>{
  let attempts=0;const x=await setup(r=>{if(r.purpose==='table_initial'){attempts++;return new Response('{}',{status});}return response(r);});
  get(await x.api.prepare());expect(get(await x.api.initial('incident')).observation).toBeNull();
  const r=get(await x.api.finalize());expect(r.state).toBe('unverified');expect(x.api.stats().reserved).toBe(0);expect(attempts).toBe(status===503?2:1);
});
it.each([401,403] as const)('retains terminal HTTP %s and does not start final reads',async status=>{
  const seen:string[]=[],x=await setup(r=>{seen.push(r.purpose);return r.purpose==='table_initial'?new Response(null,{status}):response(r);});
  get(await x.api.prepare());expect(await x.api.initial('incident')).toEqual({ok:false,code:status===401?'authentication_failed':'access_denied'});
  expect((await x.api.finalize()).ok).toBe(false);expect(seen).not.toContain('parent_final');
});
it('stops on name mixing and never returns foreign or extra column values',async()=>{
  const x=await setup(r=>r.purpose==='table_initial'?new Response(JSON.stringify({result:[{...row('problem'),script:'PRIVATE_SCRIPT'}]})):response(r));
  get(await x.api.prepare());const result=await x.api.initial('incident');expect(result).toEqual({ok:false,code:'table_binding_mismatch'});
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SCRIPT');expect((await x.api.initial('problem')).ok).toBe(false);
});
it('removes all extra JSON columns and records elapsed receipt time, not a supplied timestamp',async()=>{
  const x=await setup(r=>r.purpose.startsWith('table')?new Response(JSON.stringify({secret:'PRIVATE_OUTER',result:[{...row(),payload:'PRIVATE_PAYLOAD',token:'PRIVATE_TOKEN'}]})):response(r));
  get(await x.api.prepare());await vi.advanceTimersByTimeAsync(7);const r=get(await x.api.initial('incident'));
  expect(r.observation?.observed_at).toBe('1970-01-01T00:00:00.007Z');expect(JSON.stringify(r)).not.toMatch(/PRIVATE_|payload|token/);
  const end=get(await x.api.finalize());expect(JSON.stringify(end)).not.toMatch(/PRIVATE_/);
});
it('keeps a changed final version separate from an unknown scope',async()=>{
  const x=await setup(r=>r.purpose==='table_final'?new Response(JSON.stringify({result:[{...row(),sys_mod_count:'2'}]})):response(r));
  get(await x.api.prepare());get(await x.api.initial('incident'));expect(get(await x.api.finalize()).tables[0].state).toBe('changed');
  const y=await setup(r=>r.purpose.startsWith('table')?new Response(JSON.stringify({result:[row('incident',null)]})):response(r));
  get(await y.api.prepare());get(await y.api.initial('incident'));expect(get(await y.api.finalize()).tables[0]).toMatchObject({state:'unverified',reason:'scope_unknown'});
});
it('retains baseline shortage diagnostics and never converts it into stable',async()=>{
  const x=await setup(r=>r.purpose==='metadata_initial'?new Response('{"result":"PRIVATE_INVALID"}'):response(r));
  expect(get(await x.api.prepare()).state).toBe('unverified');get(await x.api.initial('incident'));
  expect(get(await x.api.finalize())).toMatchObject({state:'unverified',diagnostics:[{stage:'metadata_initial',reason:'invalid_observation'}]});
});
it('refuses cached observations after revocation and cannot re-enroll the same owner',async()=>{
  const x=await setup();get(await x.api.prepare());get(await x.api.initial('incident'));x.session.close();
  expect(await x.api.initial('incident')).toEqual({ok:false,code:'closed'});
  expect(createFixtureFixedWebSource(x.session,x.owner,id,response).ok).toBe(false);
});
it('requires same permit/receipt, consumes projections once, and preserves actual status',async()=>{
  const f=await fixture(),api=get(createFixtureWebStreamTransport(f.session,f.owner,()=>new Response(JSON.stringify({result:[row()]}),{status:201}))),m=api.machine;
  const p=get(m.purpose('table_initial',{source:m.source,phase:m.phase(),target:'incident'})),r=get(await api.run(p));
  const projected=get(m.consumeSourceBody(r.body!,p,id));expect(projected.status).toBe(201);expect(projected.kind).toBe('table');
  expect(m.consumeSourceBody(r.body!,p,id).ok).toBe(false);expect(m.issueEvidence().ok).toBe(false);
});
it('rejects foreign and cloned receipts before projection, with no body exposure',async()=>{
  const f=await fixture(),api=get(createFixtureWebStreamTransport(f.session,f.owner,()=>new Response('{"result":[]}'))),m=api.machine;
  const p=get(m.purpose('table_initial',{source:m.source,phase:m.phase(),target:'incident'})),r=get(await api.run(p));
  expect(m.consumeSourceBody({...r.body!},p,id)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(m.consumeSourceBody(r.body!,p,id).ok).toBe(false);
});
it('does not expose source projections for payload or accept an arbitrary table query',async()=>{
  const x=await setup();get(await x.api.prepare());expect(await x.api.initial('incident^ORname=secret')).toEqual({ok:false,code:'invalid_input'});
  const f=await fixture(),api=get(createFixtureWebStreamTransport(f.session,f.owner,()=>new Response('{"payload":"PRIVATE"}'))),m=api.machine;
  const p=get(m.purpose('payload',{source:m.source,phase:m.phase(),target:id})),r=get(await api.run(p));
  expect(m.consumeSourceBody(r.body!,p,id)).toEqual({ok:false,code:'invalid_state'});
});
it('matches an independent event-byte oracle without charging projection/cache/final comparison twice',async()=>{
  let bytes=2,calls=1;const x=await setup(r=>{calls++;const text=JSON.stringify({result:r.purpose.startsWith('table')?[row()]:r.purpose.startsWith('parent')?[{sys_id:id,sys_updated_on:'2026-10-26',sys_mod_count:'1'}]:[]});bytes+=Buffer.byteLength(text);return new Response(text);});
  get(await x.api.prepare());get(await x.api.initial('incident'));get(await x.api.initial('incident'));get(await x.api.finalize());
  expect(x.api.stats()).toMatchObject({requests:calls,received_bytes:bytes,payload_bytes:0,reserved:0});
});
it('does not return an observation or finalize after unconfirmed cancellation',async()=>{
  const x=await setup(r=>r.purpose==='table_initial'?new Response(new ReadableStream({pull(){},cancel(){return new Promise(()=>{});}})):response(r));
  get(await x.api.prepare());const pending=x.api.initial('incident');await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual({ok:false,code:'internal_review_error'});expect((await x.api.finalize()).ok).toBe(false);
  expect(x.api.stats()).toMatchObject({cleanup_unconfirmed:true,timers:0,retained_bytes:0});
});
it('stops active source consumption on close with no late observation',async()=>{
  const x=await setup(r=>r.purpose==='table_initial'?new Response(new ReadableStream({pull(){}})):response(r));
  get(await x.api.prepare());const pending=x.api.initial('incident');await vi.advanceTimersByTimeAsync(0);x.api.close();
  expect(await pending).toEqual({ok:false,code:'closed'});expect(x.api.stats()).toMatchObject({timers:0,retained_bytes:0,state:'failed'});
});
it('does not claim a stable source when its parent changed even if the table stayed stable',async()=>{
  const x=await setup(r=>r.purpose==='parent_final'?new Response(JSON.stringify({result:[{sys_id:id,sys_updated_on:'2026-10-26',sys_mod_count:'2'}]})):response(r));
  get(await x.api.prepare());get(await x.api.initial('incident'));expect(get(await x.api.finalize())).toMatchObject({state:'changed',parent:'changed',seal:null});
  expect(x.api.consumeObservations('incident')).toEqual({ok:false,code:'evidence_missing'});
});
it('releases exactly the unused final retry when E closes after a cleaned-up 503',async()=>{
  let finalAttempts=0;const x=await setup(r=>{
    if(!r.purpose.startsWith('table'))return response(r);
    const name=new URL(r.path,'https://fixture.invalid').searchParams.get('sysparm_query')!.split('=')[1].split('^')[0];
    if(r.purpose==='table_final'&&name==='t7'){finalAttempts++;return new Response(' '.repeat(16384),{status:503});}
    return new Response(JSON.stringify({result:[row(name)]}).padEnd(16384,' '));
  });
  get(await x.api.prepare());for(let n=0;n<8;n++)get(await x.api.initial(`t${n}`));
  const r=get(await x.api.finalize());expect(r.state).toBe('unverified');expect(r.tables[7]).toMatchObject({reason:'evidence_budget_exhausted'});
  expect(finalAttempts).toBe(1);expect(x.api.stats()).toMatchObject({requests:21,evidence_bytes:262144,reserved:0});
});
it.each(['foreign','duplicate','unsorted','lookahead','missing'] as const)('does not accept a %s selection baseline as complete',async kind=>{
  const metadata=(n:number)=>({sys_id:n.toString(16).padStart(32,'0'),update_set:id,name:'sys_script_'+tableId,sys_updated_on:'2026-10-26',sys_mod_count:'1'});
  const rows=kind==='foreign'?[{...metadata(1),update_set:tableId}]:kind==='duplicate'?[metadata(1),metadata(1)]:kind==='unsorted'?[metadata(2),metadata(1)]:
    kind==='lookahead'?Array.from({length:101},(_,n)=>metadata(n+1)):[{sys_id:tableId,update_set:id,name:'sys_script_'+tableId}];
  const x=await setup(r=>r.purpose==='metadata_initial'?new Response(JSON.stringify({result:rows})):response(r));
  expect(get(await x.api.prepare()).state).toBe('unverified');get(await x.api.initial('incident'));
  expect(get(await x.api.finalize())).toMatchObject({state:'unverified',metadata:'unverified'});
});
it('projects metadata identity/version and detects a final version change without retaining payload',async()=>{
  const x=await setup(r=>r.purpose.startsWith('metadata')?new Response(JSON.stringify({result:[{sys_id:tableId,update_set:id,name:'sys_script_'+tableId,
    sys_updated_on:'2026-10-26',sys_mod_count:r.purpose.endsWith('final')?'2':'1',payload:'PRIVATE_XML'}]})):response(r));
  expect(get(await x.api.prepare()).state).toBe('prepared');get(await x.api.initial('incident'));
  const final=get(await x.api.finalize());expect(final).toMatchObject({state:'changed',metadata:'changed',seal:null});expect(JSON.stringify(final)).not.toContain('PRIVATE_XML');
});
