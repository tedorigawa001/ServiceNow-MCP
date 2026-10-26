import { afterEach, expect, it, vi } from 'vitest';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';
import { createFakeSessionOwnerIssuer } from '../../src/review/abort-scope-evidence-session-fixture.js';
import type { PreparedPayloadReady, PreparedTransferClaim } from '../../src/servicenow/review-evidence-lifecycle.js';
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T{if(!r.ok)throw Error(r.code);return r.value;}
const sessions=new Set<BoundedReadSession>();let serial=0;
const updateSet='a'.repeat(32),stamp={sys_updated_on:'2026-10-26 00:00:00',sys_mod_count:'0'};
const row=(n=1)=>({sys_id:n.toString(16).padStart(32,'0'),update_set:updateSet,
  name:`sys_script_${n.toString(16).padStart(32,'0')}`,type:'Business Rule',action:'INSERT_OR_UPDATE',...stamp});
const raw=()=>({parent:{sys_id:updateSet,state:'in progress',application:'global',...stamp},
  max_records:1,requested_rule_ids:['AU-BR-006'],rows:[row()]});
async function setup(f=createFakeSessionOwnerIssuer()){
  const abort=new AbortController(),fetcher=vi.fn(async()=>new Response('{}'));
  const s=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:`DUMMY_${serial++}`,
    oauth:{clientId:'',clientSecret:''}},{fetch:fetcher,signal:abort.signal});sessions.add(s);
  await s.get('/api/now/table/sys_update_set?sysparm_limit=1');
  const src=get(f.source(s,{parent_ready:true,final_started:false,release_match:'matched'})),owner=get(f.claim(s,src.source,src.permit));
  return {s,f,owner,abort,fetcher};
}
function selected(x:Awaited<ReturnType<typeof setup>>,input:unknown=raw()){
  const window=get(x.f.window(x.owner,x.s,input)),r=get(x.f.row(x.owner,x.s,window,0));return {window,row:r};
}
function ready(x:Awaited<ReturnType<typeof setup>>,input:unknown=raw()){
  const r=selected(x,input),start=get(x.f.begin(x.owner,x.s,r.window,r.row)),ticket=get(x.f.settle(x.owner,x.s,start,'ready'));
  if(!ticket)throw Error('missing fake ready');return {...r,start,ready:ticket};
}
afterEach(()=>{for(const s of sessions)s.close();sessions.clear();vi.restoreAllMocks();vi.useRealTimers();});

it('simulates one row lifecycle with bound opaque handles and no extra HTTP/byte/IPC authority',async()=>{
  const x=await setup(),before=x.s.stats(),r=ready(x),transfer=get(x.f.transfer(x.owner,x.s,r.row,r.ready));
  expect(get(x.f.consumeTransfer(x.owner,x.s,transfer))).toEqual({state:'simulated',synthetic:true,evidence_issuance:'disabled'});
  expect(get(x.f.status(x.owner))).toMatchObject({state:'prepared',evidence_issuance:'disabled'});
  expect(x.f.issue(x.owner)).toEqual({ok:false,code:'invalid_state'});
  expect(x.s.stats()).toEqual(before);expect(x.fetcher).toHaveBeenCalledTimes(1);
  for(const handle of [r.window,r.row,r.start,r.ready,transfer]){
    expect(Object.isFrozen(handle)).toBe(true);expect(Reflect.ownKeys(handle)).toEqual([]);expect(JSON.stringify(handle)).toBe('{}');
  }
});
it('keeps readonly row lookup repeatable without granting another payload start',async()=>{
  const x=await setup(),r=selected(x);expect(get(x.f.row(x.owner,x.s,r.window,0))).toBe(r.row);
  get(x.f.begin(x.owner,x.s,r.window,r.row));expect(x.f.begin(x.owner,x.s,r.window,r.row)).toEqual({ok:false,code:'invalid_state'});
  expect(get(x.f.status(x.owner))).toMatchObject({state:'revoked',code:'invalid_state',revocations:1});
});
it('keeps an empty selected window empty rather than inventing a row receipt',async()=>{
  const x=await setup(),window=get(x.f.window(x.owner,x.s,{...raw(),rows:[]}));
  expect(get(x.f.windowInfo(x.owner,x.s,window))).toMatchObject({selected:0,metadata_seen:0,truncated:false});
  expect(x.f.row(x.owner,x.s,window,0)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('creates only one window per owner and cannot reopen after rejection',async()=>{
  const x=await setup(),r=selected(x);expect(x.f.window(x.owner,x.s,raw())).toEqual({ok:false,code:'invalid_state'});
  expect(x.f.windowInfo(x.owner,x.s,r.window)).toEqual({ok:false,code:'invalid_state'});
  expect(x.f.window(x.owner,x.s,raw())).toEqual({ok:false,code:'invalid_state'});
});
it.each(['omitted','bounded_all','review_targets'] as const)('pins the fake selection mode and preserves omission: %s',async mode=>{
  const x=await setup(),input={...raw(),...(mode==='omitted'?{}:{selection_mode:mode}),...(mode==='review_targets'?{filter_version:'target-prefix-0.1'}:{})};
  const r=selected(x,input),info=get(x.f.windowInfo(x.owner,x.s,r.window));
  expect(info).toEqual({state:'draft',selection_mode:mode==='review_targets'?'review_targets':'bounded_all',mode_supplied:mode!=='omitted',selected:1,metadata_seen:1,truncated:false,evidence_issuance:'disabled'});
  expect(Object.isFrozen(info)).toBe(true);
});
it('excludes lookahead from row receipts and never expands its authority to all metadata',async()=>{
  const x=await setup(),window=get(x.f.window(x.owner,x.s,{...raw(),rows:[row(1),row(2)]}));
  expect(get(x.f.windowInfo(x.owner,x.s,window))).toMatchObject({selected:1,metadata_seen:2,truncated:true});
  get(x.f.row(x.owner,x.s,window,0));expect(x.f.row(x.owner,x.s,window,1)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('supports the exact 100 selected + 1 lookahead bound with at most one claim chain per row',async()=>{
  const x=await setup(),before=x.s.stats(),window=get(x.f.window(x.owner,x.s,{...raw(),max_records:100,rows:Array.from({length:101},(_,n)=>row(n+1))}));
  expect(get(x.f.windowInfo(x.owner,x.s,window))).toMatchObject({selected:100,metadata_seen:101,truncated:true});
  for(let n=0;n<100;n++){
    const r=get(x.f.row(x.owner,x.s,window,n)),start=get(x.f.begin(x.owner,x.s,window,r));
    const ticket=get(x.f.settle(x.owner,x.s,start,'ready'));if(!ticket)throw Error('missing ready');
    const transfer=get(x.f.transfer(x.owner,x.s,r,ticket));get(x.f.consumeTransfer(x.owner,x.s,transfer));
  }
  expect(x.s.stats()).toEqual(before);expect(x.f.issue(x.owner)).toEqual({ok:false,code:'invalid_state'});
});
it.each(['too_many','lookahead_overflow','max_zero','max_101','unknown_rule','mixed_rules','extra','proxy'] as const)('rejects malformed or unsupported fake window: %s',async kind=>{
  const x=await setup(),base=raw();let input:unknown=base;
  if(kind==='too_many')input={...base,max_records:100,rows:Array.from({length:102},(_,n)=>row(n+1))};
  if(kind==='lookahead_overflow')input={...base,rows:[row(1),row(2),row(3)]};
  if(kind==='max_zero')input={...base,max_records:0};if(kind==='max_101')input={...base,max_records:101};
  if(kind==='unknown_rule')input={...base,requested_rule_ids:['SECRET']};if(kind==='mixed_rules')input={...base,requested_rule_ids:['AU-BR-006','AU-BR-001']};
  if(kind==='extra')input={...base,payload:'SECRET'};if(kind==='proxy')input=new Proxy(base,{});
  expect(x.f.window(x.owner,x.s,input)).toEqual({ok:false,code:'invalid_input'});
  expect(x.f.window(x.owner,x.s,base)).toEqual({ok:false,code:'invalid_input'});
  expect(JSON.stringify(x.f.status(x.owner))).not.toContain('SECRET');
});
it.each(['wrong_update_set','duplicate','descending'] as const)('rejects identity/sort violations without repairing them: %s',async kind=>{
  const x=await setup(),items=kind==='wrong_update_set'?[{...row(),update_set:'b'.repeat(32)}]:kind==='duplicate'?[row(),row()]:[row(2),row(1)];
  expect(x.f.window(x.owner,x.s,{...raw(),rows:items})).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each(['missing_filter','wrong_filter','filter_on_all','client','include','delete','bad_lookahead'] as const)('enforces the fixed BR-only candidate subset: %s',async kind=>{
  const x=await setup();let input:unknown={...raw(),selection_mode:'review_targets',filter_version:'target-prefix-0.1'};
  if(kind==='missing_filter')input={...raw(),selection_mode:'review_targets'};
  if(kind==='wrong_filter')input={...raw(),selection_mode:'review_targets',filter_version:'OTHER'};
  if(kind==='filter_on_all')input={...raw(),selection_mode:'bounded_all',filter_version:'target-prefix-0.1'};
  const bad=kind==='client'?{...row(),name:'sys_script_client_'+'c'.repeat(32)}:kind==='include'?{...row(),name:'sys_script_include_'+'c'.repeat(32)}:{...row(),action:'DELETE'};
  if(['client','include','delete'].includes(kind))input={...raw(),selection_mode:'review_targets',filter_version:'target-prefix-0.1',rows:[bad]};
  if(kind==='bad_lookahead')input={...raw(),selection_mode:'review_targets',filter_version:'target-prefix-0.1',rows:[row(),{...row(2),action:'DELETE'}]};
  expect(x.f.window(x.owner,x.s,input)).toEqual({ok:false,code:['missing_filter','wrong_filter','filter_on_all'].includes(kind)?'invalid_input':'candidate_filter_violation'});
});
it.each(['client','include','delete','malformed'] as const)('does not create BR-006 payload starts for non-eligible selected assets: %s',async kind=>{
  const x=await setup(),item={...row()};
  if(kind==='client')item.name='sys_script_client_'+'c'.repeat(32);if(kind==='include')item.name='sys_script_include_'+'c'.repeat(32);
  if(kind==='delete')item.action='DELETE';if(kind==='malformed')item.name='sys_script_invalid';
  const r=selected(x,{...raw(),rows:[item]});expect(x.f.begin(x.owner,x.s,r.window,r.row)).toEqual({ok:false,code:'invalid_state'});
  item.name=row().name;item.action='INSERT_OR_UPDATE';expect(x.f.begin(x.owner,x.s,r.window,r.row)).toEqual({ok:false,code:'invalid_state'});
});
it('captures immutable private selection data rather than rereading mutated caller objects',async()=>{
  const x=await setup(),input=raw(),r=selected(x,input);
  input.rows[0].name='sys_script_client_'+'c'.repeat(32);input.rows[0].action='DELETE';input.max_records=100;input.parent.sys_id='b'.repeat(32);
  get(x.f.begin(x.owner,x.s,r.window,r.row));expect(get(x.f.windowInfo(x.owner,x.s,r.window))).toMatchObject({selected:1,metadata_seen:1,truncated:false});
});
it('rechecks closure after a fixture getter runs during the single clone',async()=>{
  const x=await setup(),input=raw();let calls=0;
  Object.defineProperty(input,'rows',{enumerable:true,get(){calls++;x.s.close();return [row()];}});
  expect(x.f.window(x.owner,x.s,input)).toEqual({ok:false,code:'closed'});expect(calls).toBe(1);
});
it('consumes the window claim before a fixture getter can reenter generation',async()=>{
  const x=await setup(),input=raw();let nested:unknown;
  Object.defineProperty(input,'rows',{enumerable:true,get(){nested=x.f.window(x.owner,x.s,raw());return [row()];}});
  expect(x.f.window(x.owner,x.s,input)).toEqual({ok:false,code:'invalid_state'});
  expect(nested).toEqual({ok:false,code:'invalid_state'});expect(get(x.f.status(x.owner)).revocations).toBe(1);
});
it('cannot bind an owner to another session even with identical fixture rows',async()=>{
  const a=await setup(),b=await setup(a.f);
  expect(a.f.window(a.owner,b.s,raw())).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(a.f.check(a.owner)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(b.f.check(b.owner).ok).toBe(true);
});
it.each(['window','row','start','ready','transfer'] as const)('rejects another owner\'s %s handle without consuming the other owner\'s claims',async kind=>{
  const a=await setup(),b=await setup(a.f),ra=ready(a),rb=ready(b);
  const tb=get(b.f.transfer(b.owner,b.s,rb.row,rb.ready));
  const out=kind==='window'?a.f.windowInfo(a.owner,a.s,rb.window):kind==='row'?a.f.begin(a.owner,a.s,ra.window,rb.row)
    :kind==='start'?a.f.settle(a.owner,a.s,rb.start,'ready'):kind==='ready'?a.f.transfer(a.owner,a.s,ra.row,rb.ready):a.f.consumeTransfer(a.owner,a.s,tb);
  expect(out).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(b.f.check(b.owner).ok).toBe(true);
  expect(b.f.consumeTransfer(b.owner,b.s,tb).ok).toBe(true);
});
it.each(['window','row','start','ready','transfer'] as const)('rejects cloned %s handles',async kind=>{
  const x=await setup(),r=ready(x),t=get(x.f.transfer(x.owner,x.s,r.row,r.ready));
  const out=kind==='window'?x.f.windowInfo(x.owner,x.s,structuredClone(r.window)):kind==='row'?x.f.begin(x.owner,x.s,r.window,structuredClone(r.row))
    :kind==='start'?x.f.settle(x.owner,x.s,structuredClone(r.start),'ready'):kind==='ready'?x.f.transfer(x.owner,x.s,r.row,structuredClone(r.ready))
      :x.f.consumeTransfer(x.owner,x.s,structuredClone(t));
  expect(out).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('settles a start once and cannot retry an unavailable fake completion',async()=>{
  const x=await setup(),r=selected(x),start=get(x.f.begin(x.owner,x.s,r.window,r.row));
  expect(get(x.f.settle(x.owner,x.s,start,'unavailable'))).toBeNull();
  expect(x.f.settle(x.owner,x.s,start,'ready')).toEqual({ok:false,code:'invalid_state'});
  expect(x.f.begin(x.owner,x.s,r.window,r.row)).toEqual({ok:false,code:'invalid_state'});
});
it('does not accept a start handle in place of a ready completion',async()=>{
  const x=await setup(),r=selected(x),start=get(x.f.begin(x.owner,x.s,r.window,r.row));
  expect(x.f.transfer(x.owner,x.s,r.row,start as unknown as PreparedPayloadReady)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('consumes ready/transfer claims once and cannot repair either replay',async()=>{
  const x=await setup(),r=ready(x);get(x.f.transfer(x.owner,x.s,r.row,r.ready));
  expect(x.f.transfer(x.owner,x.s,r.row,r.ready)).toEqual({ok:false,code:'invalid_state'});
  x.s.close();const y=await setup(),s=ready(y),t=get(y.f.transfer(y.owner,y.s,s.row,s.ready));get(y.f.consumeTransfer(y.owner,y.s,t));
  expect(y.f.consumeTransfer(y.owner,y.s,t)).toEqual({ok:false,code:'invalid_state'});
});
it('binds a ready completion to its exact row even inside one window',async()=>{
  const x=await setup(),r=ready(x,{...raw(),max_records:2,rows:[row(1),row(2)]}),other=get(x.f.row(x.owner,x.s,r.window,1));
  expect(x.f.transfer(x.owner,x.s,other,r.ready)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each(['close','cancel'] as const)('rejects every operation after synchronous owner %s revocation',async kind=>{
  const x=await setup(),r=ready(x),t=get(x.f.transfer(x.owner,x.s,r.row,r.ready));
  if(kind==='close')x.s.close();else x.abort.abort();const expected={ok:false,code:kind==='close'?'closed':'cancelled'};
  for(const out of [x.f.windowInfo(x.owner,x.s,r.window),x.f.row(x.owner,x.s,r.window,0),x.f.begin(x.owner,x.s,r.window,r.row),
    x.f.settle(x.owner,x.s,r.start,'ready'),x.f.transfer(x.owner,x.s,r.row,r.ready),x.f.consumeTransfer(x.owner,x.s,t),x.f.window(x.owner,x.s,raw())])expect(out).toEqual(expected);
  expect(get(x.f.status(x.owner)).revocations).toBe(1);
});
it('rejects pending draft receipts after the session hard deadline without a new timer',async()=>{
  vi.useFakeTimers();const x=await setup(),r=ready(x),t=get(x.f.transfer(x.owner,x.s,r.row,r.ready));
  await vi.advanceTimersByTimeAsync(60000);
  expect(x.f.windowInfo(x.owner,x.s,r.window)).toEqual({ok:false,code:'deadline_exceeded'});
  expect(x.f.consumeTransfer(x.owner,x.s,t)).toEqual({ok:false,code:'deadline_exceeded'});
  expect(get(x.f.status(x.owner))).toMatchObject({state:'revoked',revocations:1});
});
it('an unknown issuer cannot issue windows for an existing owner',async()=>{
  const x=await setup(),foreign=createFakeSessionOwnerIssuer();expect(foreign.window(x.owner,x.s,raw())).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.f.window(x.owner,x.s,raw()).ok).toBe(true);
});
it('does not echo invalid fake completion outcomes and never accepts raw transfer records',async()=>{
  const x=await setup(),r=selected(x),start=get(x.f.begin(x.owner,x.s,r.window,r.row));
  expect(x.f.settle(x.owner,x.s,start,'SECRET' as 'ready')).toEqual({ok:false,code:'invalid_input'});
  expect(JSON.stringify(x.f.status(x.owner))).not.toContain('SECRET');x.s.close();
  const y=await setup();expect(y.f.consumeTransfer(y.owner,y.s,{} as PreparedTransferClaim)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('uses the real candidate policy for AU-BR-006: Business Rules only, never Client Scripts or Script Includes',async()=>{
  const { candidatePolicy, requestedAssetTypes } = await import('../../src/review/target-selection.js');
  expect(requestedAssetTypes(['AU-BR-006'])).toEqual(['business_rule']);
  const policy=candidatePolicy(['AU-BR-006']),hex='a'.repeat(32);
  expect(policy.query).toBe('^action=INSERT_OR_UPDATE^nameSTARTSWITHsys_script_^nameNOT LIKEsys_script_client_^nameNOT LIKEsys_script_include_');
  expect(policy.accepts({name:`sys_script_${hex}`,action:'INSERT_OR_UPDATE'})).toBe(true);
  for(const name of [`sys_script_client_${hex}`,`sys_script_include_${hex}`])expect(policy.accepts({name,action:'INSERT_OR_UPDATE'})).toBe(false);
  expect(policy.accepts({name:`sys_script_${hex}`,action:'DELETE'})).toBe(false);
});
