import { expect, it, vi } from 'vitest';
import { createSyntheticScopeSourceStream, type SyntheticScopeFinalSeal } from '../../src/review/abort-scope-evidence-source-stream.js';
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T{if(!r.ok)throw Error(r.code);return r.value;}
const updateSet='b'.repeat(32),time=(s:number)=>`2026-10-26T00:00:${String(s).padStart(2,'0')}Z`;
const parent=()=>({sys_id:updateSet,sys_updated_on:'2026-10-25 00:00:00',sys_mod_count:'0'});
const metadata=()=>({sys_id:'a'.repeat(32),update_set:updateSet,name:'sys_script_'+'a'.repeat(32),sys_updated_on:'2026-10-25 00:00:00',sys_mod_count:'0'});
const row=(name='incident')=>({sys_id:'c'.repeat(32),name,sys_scope:'global',sys_updated_on:'2026-10-25 00:00:00',sys_mod_count:'0'});
type Fixture={status?:number;body?:string;cancel?:()=>Promise<void>};
type Event={phase:string;kind:string;name:string;attempt:number;path:string};
function setup(limits={},overrides:Record<string,Fixture>={}){
  const x=get(createSyntheticScopeSourceStream({instance_binding:'d'.repeat(64),started_at:time(0),deadline_ms:60000},
    {update_set_sys_id:updateSet,parent_ready:true,metadata_ready:true,final_started:false,release_match:'matched',release_origin:'observed'},
    {requests:210,consumed:0,responseBytes:4194304,totalBytes:16777216,evidenceResponseBytes:16384,evidenceBytes:262144,...limits}));
  let phase='prepare';const events:Event[]=[],chunks:{evidence:boolean;bytes:number}[]=[],cancels:string[]=[];
  const send=vi.fn(async(request:{method:'GET';path:string},attempt:1|2)=>{
    const url=new URL(request.path,'https://synthetic.invalid'),kind=url.pathname.endsWith('/sys_update_set')?'parent':url.pathname.endsWith('/sys_update_xml')?'metadata':'table';
    const name=kind==='table'?url.searchParams.get('sysparm_query')!.split('=')[1].split('^')[0]:kind;
    const event={phase,kind,name,attempt,path:request.path};events.push(event);
    const fixture=overrides[`${phase}.${name}.${attempt}`]??overrides[`${phase}.${name}`]??{};
    const text=fixture.body??JSON.stringify({result:[kind==='parent'?parent():kind==='metadata'?metadata():row(name)]});let n=0;
    return {status:fixture.status??200,reader:{read:async()=>{
      if(n++)return {done:true as const};const value=new TextEncoder().encode(text);chunks.push({evidence:kind==='table',bytes:value.byteLength});return {done:false as const,value};
    },cancel:async()=>{cancels.push(`${event.phase}.${event.name}`);if(fixture.cancel)await fixture.cancel();}}};
  });
  return {x,events,chunks,cancels,send,overrides,setPhase:(value:string)=>{phase=value;},
    async prepare(){phase='prepare';return x.prepare(time(0),send);},
    async initial(name='incident'){phase='initial';return x.initial(name,time(1),send);},
    async final(signal?:AbortSignal){phase='final';return x.finalize(time(2),send,signal);},
    oracle(){return {requests:events.length,global_bytes:chunks.reduce((sum,c)=>sum+c.bytes,0),evidence_bytes:chunks.filter(c=>c.evidence).reduce((sum,c)=>sum+c.bytes,0)};}};
}
async function prepared(x:ReturnType<typeof setup>,names=['incident']){get(await x.prepare());for(const n of names)get(await x.initial(n));}
it('reuses exact parent/metadata descriptors, visits fixed final order, and seals only after all slots terminate',async()=>{
  const f=setup();await prepared(f,['incident','problem']);const value=get(await f.final());
  expect(value.state).toBe('stable');expect(value.seal).not.toBeNull();expect(JSON.stringify(value.seal)).toBe('{}');
  expect(f.events.map(e=>`${e.phase}.${e.name}`)).toEqual(['prepare.parent','prepare.metadata','initial.incident','initial.problem','final.parent','final.metadata','final.incident','final.problem']);
  for(const kind of ['parent','metadata']){
    const events=f.events.filter(e=>e.kind===kind);expect(events[0].path).toBe(events[1].path);
    const url=new URL(events[0].path,'https://fixture.invalid');expect(url.searchParams.get('sysparm_fields')).not.toContain('payload');
    expect(url.searchParams.get('sysparm_limit')).toBe(kind==='parent'?'2':'101');
  }
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0,composition_phase:'finished',composition_primary:null});
  expect(f.oracle().requests).toBe(8);
  expect(get(f.x.consumeSeal(value.seal!))).toEqual({state:'stable',tables:2,synthetic:true});
  expect(f.x.consumeSeal(value.seal!)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each([
  {fixture:{status:404},reason:'not_found_or_not_visible'},
  {fixture:{status:503},reason:'upstream_unavailable'},
  {fixture:{body:'{'},reason:'invalid_observation'},
  {fixture:{body:'{"result":[]}'},reason:'not_found_or_not_visible'},
])('retains initial local $reason, continues another table, and skips its final without GET',async({fixture,reason})=>{
  const f=setup({}, {'initial.incident':fixture});get(await f.prepare());
  expect(get(await f.initial())).toMatchObject({state:'unavailable',reason});get(await f.initial('problem'));
  const end=get(await f.final());expect(end).toMatchObject({state:'unverified',seal:null,tables:[{name:'incident',state:'unverified'},{name:'problem',state:'stable'}]});
  expect(f.events.some(e=>e.phase==='final'&&e.name==='incident')).toBe(false);
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0,composition_primary:null});
  const slot=f.x.stats().slots[2];expect(slot).toMatchObject({attempts:0,state:'skipped'});
});
it.each([404,503])('continues after final table HTTP %i; no seal is issued',async status=>{
  const f=setup({}, {'final.incident':{status}});await prepared(f,['incident','problem']);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null,tables:[{name:'incident',state:'unverified'},{name:'problem',state:'stable'}]});
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0,composition_primary:null});
});
it.each(['{','{"result":false}','{"result":[]}'])('continues after a final body unavailable condition: %s',async body=>{
  const f=setup({}, {'final.incident':{body}});await prepared(f,['incident','problem']);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null,tables:[{name:'incident',state:'unverified'},{name:'problem',state:'stable'}]});
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0,composition_primary:null});
});
it.each(['parent','metadata','incident'] as const)('a final %s version change is retained and cannot yield a seal',async name=>{
  const value=name==='parent'?parent():name==='metadata'?metadata():row();value.sys_mod_count='1';
  const f=setup({}, {[`final.${name}`]:{body:JSON.stringify({result:[value]})}});await prepared(f);
  expect(get(await f.final())).toMatchObject({state:'changed',seal:null});
  expect(f.x.stats().diagnostics.some(d=>d.code==='changed')).toBe(true);
});
it.each(['parent','metadata'])('a local final %s failure still terminates the remaining slots as unverified',async name=>{
  const f=setup({}, {[`final.${name}`]:{status:404}});await prepared(f);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});
  expect(f.events.at(-1)?.name).toBe('incident');expect(f.x.stats().reserved).toBe(0);
});
it('an unavailable baseline cannot be repaired into stable by a successful final read',async()=>{
  const f=setup({}, {'prepare.parent':{status:404}});await prepared(f);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});expect(f.x.stats().composition_primary).toBeNull();
});
it('initial E exhaustion leaves parent/metadata capacity and skips final evidence without dispatch',async()=>{
  const bytes=Buffer.byteLength(JSON.stringify({result:[row()]})),f=setup({evidenceBytes:bytes});await prepared(f);
  f.setPhase('initial');expect(await f.x.initial('problem',time(1),f.send)).toMatchObject({ok:false,code:'scope_evidence_limit',terminal:false});
  const end=get(await f.final());expect(end).toMatchObject({state:'unverified',seal:null});
  expect(f.events.map(e=>`${e.phase}.${e.name}`)).toEqual(['prepare.parent','prepare.metadata','initial.incident','final.parent','final.metadata']);
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0,evidence_closed:true});
  expect(f.x.stats().slots[2]).toMatchObject({attempts:0,state:'skipped'});
});
it('final E exhaustion retains the first read and skips the remaining final table',async()=>{
  const bytes=Buffer.byteLength(JSON.stringify({result:[row()]}));
  const f=setup({evidenceBytes:bytes*3-1});await prepared(f,['incident','problem']);
  const end=get(await f.final());expect(end).toMatchObject({state:'unverified',seal:null});
  expect(f.events.filter(e=>e.phase==='final'&&e.kind==='table').map(e=>e.name)).toEqual(['incident']);
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0,evidence_closed:true});
});
it('final retry uses its own slot and charges every failed body once',async()=>{
  const f=setup({}, {'final.incident.1':{status:503,body:'retry-body'}});await prepared(f);
  expect(get(await f.final()).state).toBe('stable');
  expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0});
  expect(f.x.stats().slots[2]).toMatchObject({attempts:2,state:'done'});
});
it.each([401,403])('final authentication/ACL %i stops before subsequent dispatches',async status=>{
  const f=setup({}, {'final.parent':{status}});await prepared(f);
  expect(await f.final()).toEqual({ok:false,code:status===401?'authentication_failed':'access_denied'});
  expect(f.events.at(-1)?.name).toBe('parent');expect(f.x.stats().composition_primary).not.toBeNull();
});
it.each(['parent','metadata'])('rejects foreign identity in final %s before seal',async kind=>{
  const foreign=kind==='parent'?{...parent(),sys_id:'f'.repeat(32)}:{...metadata(),update_set:'f'.repeat(32)};
  const f=setup({}, {[`final.${kind}`]:{body:JSON.stringify({result:[foreign]})}});await prepared(f);
  expect(await f.final()).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(f.events.at(-1)?.name).toBe(kind);
});
it.each(['parent','metadata','incident'])('unconfirmed cleanup in final %s cannot seal or dispatch the next read',async name=>{
  const f=setup({}, {[`final.${name}`]:{cancel:()=>new Promise<void>(()=>{})}});await prepared(f);
  expect(await f.final()).toEqual({ok:false,code:'internal_review_error'});expect(f.events.at(-1)?.name).toBe(name);
  expect(f.x.stats().cleanup).toBe('unconfirmed');
});
it('101 metadata rows are lookahead, not a complete selected list',async()=>{
  const rows=Array.from({length:101},(_,n)=>({...metadata(),sys_id:(n+1).toString(16).padStart(32,'0')}));
  const f=setup({}, {'final.metadata':{body:JSON.stringify({result:rows})}});await prepared(f);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});
});
it('exactly 100 sorted metadata rows remain within the fixed complete-list subset',async()=>{
  const rows=Array.from({length:100},(_,n)=>({...metadata(),sys_id:(n+1).toString(16).padStart(32,'0')}));
  const body=JSON.stringify({result:rows}),f=setup({}, {'prepare.metadata':{body},'final.metadata':{body}});await prepared(f);
  expect(get(await f.final()).state).toBe('stable');expect(f.x.stats()).toMatchObject({...f.oracle(),reserved:0});
});
it('a final table identity mismatch stops instead of falling back to a sys_id GET',async()=>{
  const f=setup({}, {'final.incident':{body:JSON.stringify({result:[row('problem')]})}});await prepared(f,['incident','problem']);
  expect(await f.final()).toEqual({ok:false,code:'table_binding_mismatch'});
  expect(f.events.at(-1)?.name).toBe('incident');
});
it('same-name recreation and scope changes both prevent a seal even with unchanged version strings',async()=>{
  for(const patch of [{sys_id:'f'.repeat(32)},{sys_scope:'f'.repeat(32)}]){
    const f=setup({}, {'final.incident':{body:JSON.stringify({result:[{...row(),...patch}]})}});await prepared(f);
    expect(get(await f.final())).toMatchObject({state:'changed',seal:null});
  }
});
it('duplicate metadata identities cannot be hidden by sorting or deduplication',async()=>{
  const f=setup({}, {'final.metadata':{body:JSON.stringify({result:[metadata(),metadata()]})}});await prepared(f);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});
});
it('null table scope stays unverified even with identical initial/final rows',async()=>{
  const text=JSON.stringify({result:[{...row(),sys_scope:null}]}),f=setup({}, {'initial.incident':{body:text},'final.incident':{body:text}});await prepared(f);
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});
});
it.each(['clone','foreign','closed'] as const)('a %s seal has no authority',async mode=>{
  const f=setup();await prepared(f);const end=get(await f.final());
  const target=mode==='foreign'?setup().x:f.x;if(mode==='closed')f.x.close();
  expect(target.consumeSeal(mode==='clone'?structuredClone(end.seal!):end.seal!)).toMatchObject({ok:false});
});
it('cannot finalize without received baselines or finalize twice',async()=>{
  const f=setup();get(await f.initial());expect(await f.final()).toEqual({ok:false,code:'invalid_state'});
  const g=setup();await prepared(g);const end=get(await g.final());expect(await g.final()).toEqual({ok:false,code:'invalid_state'});
  expect(g.x.consumeSeal(end.seal!)).toMatchObject({ok:false});
});
it('never accepts an externally constructed seal before completion',()=>{
  const f=setup();expect(f.x.consumeSeal(Object.freeze({}) as SyntheticScopeFinalSeal)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('time reversal and deadline boundary stop before final dispatch',async()=>{
  const f=setup();await prepared(f);const n=f.events.length;
  expect(await f.x.finalize(time(0),f.send)).toEqual({ok:false,code:'invalid_observation_time'});expect(f.events).toHaveLength(n);
  const g=setup();await prepared(g);expect(await g.x.finalize('2026-10-26T00:01:00Z',g.send)).toMatchObject({ok:false});
});
it('shares the request cap with prepare and preserves final reservations on admission rejection',async()=>{
  const f=setup({requests:6});get(await f.prepare());
  expect(await f.initial()).toMatchObject({ok:false,code:'scope_evidence_limit',terminal:false});
  expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});
  expect(f.x.stats()).toMatchObject({...f.oracle(),requests:4,reserved:0});
});
it('global byte excess remains terminal, not an evidence-local unknown',async()=>{
  const f=setup({totalBytes:1});expect(await f.prepare()).toEqual({ok:false,code:'receive_budget_exceeded'});
  expect(f.events).toHaveLength(1);expect(f.x.stats().global_bytes).toBeGreaterThan(1);
});
it('global byte excess on a final evidence read is not downgraded to a local cap',async()=>{
  const size=(value:unknown)=>Buffer.byteLength(JSON.stringify({result:[value]}));
  const f=setup({totalBytes:2*(size(parent())+size(metadata())+size(row()))-1});await prepared(f);
  expect(await f.final()).toEqual({ok:false,code:'receive_budget_exceeded'});
  expect(f.x.stats()).toMatchObject({...f.oracle(),composition_primary:'receive_budget_exceeded'});
});
it('deduplicates repeated admission diagnostics and never opens the evidence cap again',async()=>{
  const f=setup({requests:6});get(await f.prepare());
  for(let n=0;n<100;n++)expect(await f.initial()).toMatchObject({ok:false,code:'scope_evidence_limit'});
  expect(f.x.stats().diagnostics).toEqual([{stage:'initial.admission',code:'scope_evidence_limit'}]);
  expect(f.events).toHaveLength(2);expect(get(await f.final())).toMatchObject({state:'unverified',seal:null});
});
it('public close and stop never echo caller-supplied diagnostic strings',()=>{
  const f=setup();expect((f.x.close as (...args:unknown[])=>unknown)('SECRET')).toEqual({ok:false,code:'closed'});
  const g=setup();expect((g.x.stop as (code:unknown)=>unknown)('SECRET')).toEqual({ok:false,code:'invalid_input'});
  expect(JSON.stringify(g.x.stats())).not.toContain('SECRET');
});
it.each(['cancelled','deadline_exceeded'] as const)('a %s notification interrupts a pending final read with no seal',async code=>{
  const f=setup();await prepared(f);let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
  const cancel=vi.fn(async()=>{}),abort=new AbortController();let finish!:(v:{done:true})=>void;
  const final=f.x.finalize(time(2),async()=>({status:200,reader:{read:()=>{started();return new Promise(resolve=>{finish=resolve;});},cancel}}),abort.signal);
  await ready;if(code==='cancelled')abort.abort();else f.x.stop(code);
  expect(await final).toEqual({ok:false,code});finish({done:true});expect(cancel).toHaveBeenCalledTimes(1);
  expect(f.x.consumeSeal({} as SyntheticScopeFinalSeal)).toEqual({ok:false,code});
});
