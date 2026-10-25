import { expect, it, vi } from 'vitest';
import { createSyntheticFixedSourceIssuer as factory } from '../../src/review/abort-scope-evidence-fixed-source.js';
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T{if(!r.ok)throw Error(r.code);return r.value;}
const sessionRaw=()=>({instance_binding:'a'.repeat(64),started_at:'2026-10-25T00:00:00Z',deadline_ms:60000});
const sourceRaw=()=>({update_set_sys_id:'b'.repeat(32),parent_ready:true,metadata_ready:true,final_started:false,
  release_match:'matched' as 'matched'|'mismatched'|'unknown',release_origin:'observed' as 'observed'|'operator_config'});
const row=()=>({sys_id:'c'.repeat(32),name:'incident',sys_scope:'global',sys_updated_on:'2026-10-24 12:00:00',sys_mod_count:'0'});
const frame=(rows:unknown[]=[row()],phase:'initial'|'final'='initial')=>({status:200,body_json:JSON.stringify({result:rows}),
  observed_at:phase==='initial'?'2026-10-25T00:00:02Z':'2026-10-25T00:00:03Z',cleanup:'confirmed'});
function setup(){const f=factory(),s=get(f.issueSession(sessionRaw())),issued=get(f.issueSource(s,sourceRaw())),
  i=get(f.createIssuer(s,issued.source,issued.permit));return {f,s,...issued,i};}
function initial(x:ReturnType<typeof setup>,raw:unknown=frame(),name='incident'){
  const read=get(x.f.begin(x.i,name,'initial'));const receipt=get(x.f.complete(x.i,read.ticket,raw));return {read,receipt};
}
it('issues a bound synthetic issuer and refuses duplicate generation across sources in one session',()=>{
  const x=setup(),other=get(x.f.issueSource(x.s,sourceRaw()));
  expect(x.f.createIssuer(x.s,x.source,x.permit)).toEqual({ok:false,code:'issuer_claimed'});
  expect(x.f.createIssuer(x.s,other.source,other.permit)).toEqual({ok:false,code:'issuer_claimed'});
  expect(JSON.stringify([x.s,x.source,x.permit,x.i])).toBe('[{},{},{},{}]');
});
it.each(['permit_clone','other_permit','source_clone','other_source','other_issuer','session_clone'] as const)('rejects mixed generation and does not reset a consumed claim: %s',kind=>{
  const f=factory(),s=get(f.issueSession(sessionRaw())),a=get(f.issueSource(s,sourceRaw())),otherS=get(f.issueSession(sessionRaw())),b=get(f.issueSource(otherS,sourceRaw()));
  const foreign=setup();
  const source=kind==='source_clone'?structuredClone(a.source):kind==='other_source'?b.source:kind==='other_issuer'?foreign.source:a.source;
  const permit=kind==='permit_clone'?structuredClone(a.permit):kind==='other_permit'?b.permit:a.permit;
  const session=kind==='session_clone'?structuredClone(s):s;
  const rejected=f.createIssuer(session,source,permit);expect(rejected.ok).toBe(false);
  if(kind!=='session_clone')expect(f.createIssuer(s,a.source,a.permit)).toEqual(rejected);
});
it.each(['parent','metadata','final','mismatched','unknown'] as const)('keeps failed generation sticky: %s',kind=>{
  const f=factory(),s=get(f.issueSession(sessionRaw())),raw=sourceRaw();
  if(kind==='parent')raw.parent_ready=false;if(kind==='metadata')raw.metadata_ready=false;if(kind==='final')raw.final_started=true;
  if(kind==='mismatched'||kind==='unknown')raw.release_match=kind;
  const issued=get(f.issueSource(s,raw));const rejected=f.createIssuer(s,issued.source,issued.permit);
  expect(rejected).toMatchObject({ok:false});raw.release_match='matched';raw.parent_ready=true;raw.metadata_ready=true;raw.final_started=false;
  const corrected=get(f.issueSource(s,raw));expect(f.createIssuer(s,corrected.source,corrected.permit)).toEqual(rejected);
});
it('uses private release/ready snapshots rather than mutated fixture/decision scalars',()=>{
  const f=factory(),s=get(f.issueSession(sessionRaw())),raw=sourceRaw();raw.release_origin='operator_config';
  const issued=get(f.issueSource(s,raw));raw.metadata_ready=false;raw.release_match='unknown';
  const copy={...issued.decision};copy.release_match='unknown';
  const i=get(f.createIssuer(s,issued.source,issued.permit));expect(f.diagnostic(i)).toEqual({state:'active',code:null});
  expect(Object.isFrozen(issued.decision)).toBe(true);
});
it('does not reopen a session after a closed source rejects generation',()=>{
  const f=factory(),s=get(f.issueSession(sessionRaw())),a=get(f.issueSource(s,sourceRaw()));f.closeSource(a.source);
  const rejected=f.createIssuer(s,a.source,a.permit);expect(rejected).toEqual({ok:false,code:'invalid_state'});
  const b=get(f.issueSource(s,sourceRaw()));expect(f.createIssuer(s,b.source,b.permit)).toEqual(rejected);
});
it('builds only the fixed GET and exact parameters for both phases',()=>{
  const x=setup(),a=initial(x);get(x.f.enterFinal(x.i));const b=get(x.f.begin(x.i,'incident','final'));
  for(const request of [a.read.request,b.request]){
    expect(request.method).toBe('GET');const u=new URL(request.path,'https://synthetic.invalid');expect(u.pathname).toBe('/api/now/table/sys_db_object');
    expect(Object.fromEntries(u.searchParams)).toEqual({sysparm_query:'name=incident^ORDERBYsys_id',
      sysparm_fields:'sys_id,name,sys_scope,sys_updated_on,sys_mod_count',sysparm_limit:'2',sysparm_offset:'0',sysparm_no_count:'true',
      sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});expect(Object.isFrozen(request)).toBe(true);
  }
  const receipt=get(x.f.complete(x.i,b.ticket,frame([row()],'final')));expect(get(x.f.view(x.i,receipt))).toMatchObject({state:'rows',phase:'final'});
});
it.each(['global','incident^ORactive=true','Incident','https://secret.invalid','x'.repeat(81),'','incident?x=1'])('refuses unsafe/unsupported table %s',name=>{
  const x=setup();const bad=x.f.begin(x.i,name,'initial');expect(bad).toEqual({ok:false,code:'invalid_input'});
  expect(x.f.begin(x.i,'incident','initial')).toEqual(bad);
});
it('projects only five columns and freezes the normalized observation',()=>{
  const x=setup(),r={...row(),password:'PRIVATE_SECRET',certificate:'PRIVATE_SECRET'},body={result:[r],extra:'PRIVATE_SECRET'};
  const read=get(x.f.begin(x.i,'incident','initial')),receipt=get(x.f.complete(x.i,read.ticket,{...frame(),body_json:JSON.stringify(body)}));
  r.sys_scope='wrong';const out=get(x.f.view(x.i,receipt));expect(JSON.stringify(out)).not.toContain('PRIVATE_SECRET');
  expect(out.state).toBe('rows');if(out.state==='rows'){expect(Object.keys(out.rows[0])).toEqual(['sys_id','name','sys_scope','sys_updated_on','sys_mod_count']);
    expect(out.rows[0].sys_scope).toBe('global');expect(Object.isFrozen(out.rows)).toBe(true);expect(Object.isFrozen(out.rows[0])).toBe(true);}
  expect(Object.isFrozen(out)).toBe(true);
});
it.each([[],[row(),row()],[row(),row(),row()]].map(rows=>({rows})))('keeps zero/ambiguous/oversized result unknown: %j',({rows})=>{
  const x=setup(),{receipt}=initial(x,frame(rows));expect(get(x.f.view(x.i,receipt))).toMatchObject({state:'unavailable',
    reason:rows.length===0?'not_found_or_not_visible':rows.length===2?'ambiguous_table':'invalid_observation'});
});
it.each(['sys_id','name','sys_updated_on','sys_mod_count'])('does not fill a missing required column: %s',key=>{
  const x=setup(),r:Record<string,unknown>=row();delete r[key];
  expect(get(x.f.view(x.i,initial(x,frame([r])).receipt))).toMatchObject({state:'unavailable',reason:'field_unavailable'});
});
it.each([null,undefined])('keeps missing/null scope as unknown: %j',scope=>{
  const x=setup(),r:Record<string,unknown>=row();if(scope===undefined)delete r.sys_scope;else r.sys_scope=scope;
  const out=get(x.f.view(x.i,initial(x,frame([r])).receipt));expect(out.state).toBe('rows');if(out.state==='rows')expect(out.rows[0].sys_scope).toBeNull();
});
it('preserves a valid scope reference without inferring its meaning',()=>{
  const x=setup(),scope='d'.repeat(32),out=get(x.f.view(x.i,initial(x,frame([{...row(),sys_scope:scope}])).receipt));
  expect(out.state).toBe('rows');if(out.state==='rows')expect(out.rows[0].sys_scope).toBe(scope);
});
it.each(['Global','',{}, {value:'global'},'F'.repeat(32)])('rejects display/reference/invalid scope: %j',scope=>{
  const x=setup();expect(get(x.f.view(x.i,initial(x,frame([{...row(),sys_scope:scope}])).receipt)))
    .toMatchObject({state:'unavailable',reason:'invalid_observation'});
});
it.each([404,429,500])('normalizes an exhausted synthetic status %i without retrying',status=>{
  const x=setup(),{receipt}=initial(x,{...frame(),status,body_json:null,cleanup:'not_started'});
  expect(get(x.f.view(x.i,receipt))).toMatchObject({state:'unavailable',reason:status===404?'not_found_or_not_visible':'upstream_unavailable'});
  expect(x.f.begin(x.i,'incident','initial')).toEqual({ok:false,code:'invalid_state'});
});
it.each([401,403])('stops authentication/ACL before considering cleanup: %i',status=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial')),out=x.f.complete(x.i,r.ticket,{...frame(),status,cleanup:'unconfirmed'});
  expect(out).toEqual({ok:false,code:status===401?'authentication_failed':'access_denied'});
  expect(x.f.complete(x.i,r.ticket,frame())).toEqual(out);x.f.closeIssuer(x.i);expect(x.f.diagnostic(x.i)).toMatchObject({code:status===401?'authentication_failed':'access_denied'});
});
it('stops a wrong table identity and refuses a corrected response',()=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial'));
  expect(x.f.complete(x.i,r.ticket,frame([{...row(),name:'task'}]))).toEqual({ok:false,code:'table_binding_mismatch'});
  expect(x.f.complete(x.i,r.ticket,frame())).toEqual({ok:false,code:'table_binding_mismatch'});
});
it.each(['duplicate','clone','other_issuer'] as const)('refuses duplicate/forged completion: %s',kind=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial'));let ticket=r.ticket;
  if(kind==='duplicate')get(x.f.complete(x.i,ticket,frame()));if(kind==='clone')ticket=structuredClone(ticket);
  if(kind==='other_issuer'){const y=setup();ticket=get(y.f.begin(y.i,'incident','initial')).ticket;}
  expect(x.f.complete(x.i,ticket,frame()).ok).toBe(false);expect(x.f.complete(x.i,r.ticket,frame()).ok).toBe(false);
});
it.each(['pending','final_before_phase','initial_after_final','wrong_final_order'] as const)('enforces source-only phase order: %s',kind=>{
  const x=setup();let r;
  if(kind==='pending'){get(x.f.begin(x.i,'incident','initial'));r=x.f.enterFinal(x.i);}
  if(kind==='final_before_phase'){initial(x);r=x.f.begin(x.i,'incident','final');}
  if(kind==='initial_after_final'){initial(x);get(x.f.enterFinal(x.i));r=x.f.begin(x.i,'task','initial');}
  if(kind==='wrong_final_order'){initial(x);initial(x,frame([{...row(),name:'task'}]),'task');get(x.f.enterFinal(x.i));r=x.f.begin(x.i,'task','final');}
  expect(r).toEqual({ok:false,code:'invalid_state'});
});
it('ends an initial GET still pending at the normal phase close and refuses its late completion',()=>{
  const x=setup();initial(x);const aborted=get(x.f.begin(x.i,'task','initial'));
  get(x.f.enterFinal(x.i,'2026-10-25T00:00:50Z'));
  expect(x.f.complete(x.i,aborted.ticket,frame([{...row(),name:'task'}]))).toEqual({ok:false,code:'invalid_state'});
});
it('does not re-read a not-collected initial in the final phase',()=>{
  const x=setup();get(x.f.begin(x.i,'incident','initial'));
  get(x.f.enterFinal(x.i,'2026-10-25T00:00:50Z'));
  expect(x.f.begin(x.i,'incident','final')).toEqual({ok:false,code:'invalid_state'});
});
it('skips an unavailable initial final as not_collected and keeps the order to the next table',()=>{
  const x=setup();initial(x,{...frame(),status:404,body_json:null,cleanup:'not_started'});
  initial(x,frame([{...row(),name:'task'}]),'task');get(x.f.enterFinal(x.i));
  const skipped=get(x.f.skipFinal(x.i,'incident','2026-10-25T00:00:51Z'));
  expect(get(x.f.view(x.i,skipped))).toMatchObject({phase:'final',state:'unavailable',reason:'not_collected',observed_at:'2026-10-25T00:00:51Z'});
  const b=get(x.f.begin(x.i,'task','final'));
  expect(get(x.f.view(x.i,get(x.f.complete(x.i,b.ticket,frame([{...row(),name:'task'}],'final')))))).toMatchObject({state:'rows',phase:'final'});
});
it.each(['available','time_outside','time_before_initial','missing_close_time'] as const)('refuses an improper skip or close: %s',kind=>{
  const x=setup();let r;
  if(kind==='available'){initial(x);get(x.f.enterFinal(x.i));r=x.f.skipFinal(x.i,'incident','2026-10-25T00:00:51Z');
    expect(r).toEqual({ok:false,code:'invalid_state'});return;}
  if(kind==='missing_close_time'){get(x.f.begin(x.i,'incident','initial'));expect(x.f.enterFinal(x.i)).toEqual({ok:false,code:'invalid_state'});return;}
  initial(x,{...frame(),status:404,body_json:null,cleanup:'not_started'});get(x.f.enterFinal(x.i));
  r=x.f.skipFinal(x.i,'incident',kind==='time_outside'?'2026-10-25T00:01:00Z':'2026-10-25T00:00:01Z');
  expect(r).toEqual({ok:false,code:'invalid_observation_time'});
});
it.each(['session','source','issuer'] as const)('invalidates old receipts at %s end',kind=>{
  const x=setup(),{receipt}=initial(x);if(kind==='session')x.f.closeSession(x.s);if(kind==='source')x.f.closeSource(x.source);if(kind==='issuer')x.f.closeIssuer(x.i);
  expect(x.f.view(x.i,receipt)).toEqual({ok:false,code:'closed'});expect(x.f.begin(x.i,'task','initial')).toEqual({ok:false,code:'closed'});
});
it.each(['2026-10-24T23:59:59Z','2026-10-25T00:01:00Z'])('stops a fixture observation outside the run interval: %s',observed_at=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial'));
  expect(x.f.complete(x.i,r.ticket,{...frame(),observed_at})).toEqual({ok:false,code:'invalid_observation_time'});
});
it('rejects final time before initial and cannot repeat a logical read',()=>{
  const x=setup();initial(x);get(x.f.enterFinal(x.i));const r=get(x.f.begin(x.i,'incident','final'));
  expect(x.f.complete(x.i,r.ticket,{...frame(),observed_at:'2026-10-25T00:00:01Z'})).toEqual({ok:false,code:'invalid_observation_time'});
});
it.each(['unconfirmed','not_started'])('does not issue a successful receipt for cleanup=%s',cleanup=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial'));
  expect(x.f.complete(x.i,r.ticket,{...frame(),cleanup})).toEqual({ok:false,code:'internal_review_error'});
});
it('clones an internal frame once and stops after reentrant closure',()=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial')),raw=frame();let calls=0;
  Object.defineProperty(raw,'body_json',{enumerable:true,get(){calls++;x.f.closeIssuer(x.i);return JSON.stringify({result:[row()]});}});
  expect(x.f.complete(x.i,r.ticket,raw)).toEqual({ok:false,code:'closed'});expect(calls).toBe(1);
});
it('returns unavailable for malformed JSON/envelope, never echoes raw data',()=>{
  for(const body_json of ['PRIVATE_SECRET','{}','{"result":{}}']){const x=setup(),r=get(x.f.begin(x.i,'incident','initial'));
    const out=get(x.f.view(x.i,get(x.f.complete(x.i,r.ticket,{...frame(),body_json}))));expect(out).toMatchObject({state:'unavailable',reason:'invalid_observation'});
    expect(JSON.stringify(out)).not.toContain('PRIVATE_SECRET');}
});
it.each(['extra','oversized','proxy'] as const)('refuses malformed internal frames and correction after failure: %s',kind=>{
  const x=setup(),r=get(x.f.begin(x.i,'incident','initial'));
  const raw=kind==='extra'?{...frame(),approved:true}:kind==='oversized'?{...frame(),body_json:'x'.repeat(16385)}:new Proxy(frame(),{});
  const rejected=x.f.complete(x.i,r.ticket,raw);expect(rejected).toEqual({ok:false,code:'evidence_invalid'});
  expect(x.f.complete(x.i,r.ticket,frame())).toEqual(rejected);
});
it('does not exceed eight table identities or poison existing observations on limit refusal',()=>{
  const x=setup();for(let n=0;n<8;n++)initial(x,frame([{...row(),name:`u_table_${n}`}]),`u_table_${n}`);
  expect(x.f.begin(x.i,'u_table_8','initial')).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(x.f.diagnostic(x.i)).toEqual({state:'active',code:null});
});
it('rejects clone/raw/other receipt views',()=>{
  const x=setup(),{receipt}=initial(x);expect(x.f.view(x.i,structuredClone(receipt))).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.f.view(x.i,receipt)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('does not touch real network, time, timers or logger',()=>{
  const f=vi.fn(()=>{throw Error('forbidden');});vi.stubGlobal('fetch',f);
  const clock=vi.spyOn(Date,'now').mockImplementation(f),timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(f),log=vi.spyOn(console,'log').mockImplementation(f);
  try{const x=setup();initial(x);expect(f).not.toHaveBeenCalled();}finally{clock.mockRestore();timer.mockRestore();log.mockRestore();vi.unstubAllGlobals();}
});
it('local failure consumes the exact pending read without inventing an HTTP success',()=>{
  const x=setup(),read=get(x.f.begin(x.i,'incident','initial'));
  const receipt=get(x.f.completeUnavailable(x.i,read.ticket,'upstream_unavailable','2026-10-25T00:00:02Z'));
  expect(get(x.f.view(x.i,receipt))).toMatchObject({state:'unavailable',reason:'upstream_unavailable',phase:'initial'});
  expect(x.f.completeUnavailable(x.i,read.ticket,'not_collected','2026-10-25T00:00:03Z')).toEqual({ok:false,code:'invalid_state'});
});
it('cannot complete another issuer read as a local unavailable',()=>{
  const x=setup(),y=setup(),read=get(y.f.begin(y.i,'incident','initial'));
  expect(x.f.completeUnavailable(x.i,read.ticket,'not_collected','2026-10-25T00:00:02Z')).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('invalid local reasons stop instead of becoming caller-controlled diagnostics',()=>{
  const x=setup(),read=get(x.f.begin(x.i,'incident','initial'));
  expect(x.f.completeUnavailable(x.i,read.ticket,'SECRET' as 'not_collected','2026-10-25T00:00:02Z')).toEqual({ok:false,code:'evidence_invalid'});
  expect(JSON.stringify(x.f.diagnostic(x.i))).not.toContain('SECRET');
});
it('finish requires every final slot and is one-shot',()=>{
  const x=setup();initial(x);get(x.f.enterFinal(x.i));
  expect(x.f.finish(x.i)).toEqual({ok:false,code:'invalid_state'});
  const y=setup();initial(y);get(y.f.enterFinal(y.i));const read=get(y.f.begin(y.i,'incident','final'));
  get(y.f.complete(y.i,read.ticket,frame([row()],'final')));get(y.f.finish(y.i));
  expect(y.f.diagnostic(y.i)).toEqual({state:'sealed',code:null});expect(y.f.finish(y.i)).toEqual({ok:false,code:'invalid_state'});
});
