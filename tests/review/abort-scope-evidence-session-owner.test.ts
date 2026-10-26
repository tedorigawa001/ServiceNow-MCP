import { afterEach, expect, it, vi } from 'vitest';
import { type BoundedReadOptions, type ReadSnapshot } from '../../src/servicenow/bounded-read.js';
import { FixtureReadSession as BoundedReadSession } from '../../src/review/abort-scope-evidence-read-fixture.js';
import { createFakeSessionOwnerIssuer } from '../../src/review/abort-scope-evidence-session-fixture.js';
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T{if(!r.ok)throw Error(r.code);return r.value;}
const sessions=new Set<BoundedReadSession>();let serial=0;
const path='/api/now/table/sys_update_set?sysparm_limit=1';
const facts=()=>({parent_ready:true,final_started:false,release_match:'matched' as 'matched'|'mismatched'|'unknown'});
function make(options:BoundedReadOptions={},snapshot?:ReadSnapshot){
  const s=new BoundedReadSession(snapshot??{instanceUrl:'https://fixture.service-now.com',authMode:'per-user',
    perUserBearerToken:`PRIVATE_TOKEN_${serial++}`,oauth:{clientId:'PRIVATE_ID',clientSecret:'PRIVATE_SECRET'}},
  {fetch:async()=>new Response('{}'),...options});sessions.add(s);return s;
}
async function setup(options:BoundedReadOptions={}){
  const s=make(options);await s.get(path);const f=createFakeSessionOwnerIssuer(),issued=get(f.source(s,facts()));
  return {s,f,...issued};
}
afterEach(()=>{for(const s of sessions)s.close();sessions.clear();vi.restoreAllMocks();vi.useRealTimers();});
it('binds a fixture owner to an authenticated observer wrapper without real claim authority',async()=>{
  const fetcher=vi.fn(async()=>new Response('{}')),x=await setup({fetch:fetcher});
  const before=x.s.stats(),o=get(x.f.claim(x.s,x.source,x.permit));
  expect(get(x.f.status(o))).toEqual({state:'prepared',code:null,evidence_issuance:'disabled',revocations:0});
  expect(x.f.check(o)).toEqual({ok:true,value:true});
  for(let n=0;n<3;n++)expect(x.f.issue(o)).toEqual({ok:false,code:'invalid_state'});
  expect(x.s.stats()).toEqual(before);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(o)).toBe('{}');expect(Reflect.ownKeys(o)).toEqual([]);
  expect(JSON.stringify(x.f.status(o))).not.toMatch(/PRIVATE|token|auth|snapshot|permit|session/i);
});
it('claims synchronously and refuses a second owner even through a different fake issuer/source',async()=>{
  const x=await setup(),o=get(x.f.claim(x.s,x.source,x.permit));
  expect(x.f.claim(x.s,x.source,x.permit)).toEqual({ok:false,code:'invalid_state'});
  const f=createFakeSessionOwnerIssuer(),next=get(f.source(x.s,facts()));
  expect(f.claim(x.s,next.source,next.permit)).toEqual({ok:false,code:'invalid_state'});
  expect(get(x.f.status(o)).state).toBe('prepared');
});
it.each(['unknown','mismatched'] as const)('consumes the session claim before rejecting release %s',async release=>{
  const s=make();await s.get(path);const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,{...facts(),release_match:release}));
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'release_not_admitted'});
  const corrected=get(f.source(s,facts()));expect(f.claim(s,corrected.source,corrected.permit)).toEqual({ok:false,code:'release_not_admitted'});
});
it.each(['parent','final','permit'] as const)('does not reopen a failed generation claim: %s',async kind=>{
  const s=make();await s.get(path);const f=createFakeSessionOwnerIssuer(),raw=facts();
  if(kind==='parent')raw.parent_ready=false;if(kind==='final')raw.final_started=true;
  const a=get(f.source(s,raw));const rejected=f.claim(s,a.source,kind==='permit'?structuredClone(a.permit):a.permit);
  expect(rejected).toEqual({ok:false,code:kind==='permit'?'release_not_admitted':'invalid_state'});
  const next=get(f.source(s,facts()));expect(f.claim(s,next.source,next.permit)).toEqual(rejected);
});
it('does not consume a valid session claim on an unknown source or a foreign session argument',async()=>{
  const a=await setup(),b=make();await b.get(path);
  expect(a.f.claim(a.s,structuredClone(a.source),a.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(a.f.claim(b,a.source,a.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(a.f.claim(a.s,a.source,a.permit).ok).toBe(true);
  const other=get(a.f.source(b,facts()));expect(a.f.claim(b,other.source,other.permit).ok).toBe(true);
});
it('rejects another session AuthSnapshotIdentity and auth generation even after both authenticated',async()=>{
  const a=make(),b=make();await a.get(path);await b.get(path);
  const f=createFakeSessionOwnerIssuer(),mixed=get(f.source(a,facts(),b));
  expect(f.claim(a,mixed.source,mixed.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  const fixed=get(f.source(a,facts()));expect(f.claim(a,fixed.source,fixed.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('missing authentication consumes the known-session generation claim and cannot be repaired by a later GET',async()=>{
  const s=make(),f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts()));
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'authentication_failed'});
  await s.get(path);const next=get(f.source(s,facts()));expect(f.claim(s,next.source,next.permit)).toEqual({ok:false,code:'authentication_failed'});
});
it('a source registered before auth cannot impersonate the later authentication generation',async()=>{
  const s=make(),f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts()));await s.get(path);
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('source facts are captured once and caller mutations do not change the private registration',async()=>{
  const s=make();await s.get(path);const f=createFakeSessionOwnerIssuer(),raw=facts(),a=get(f.source(s,raw));
  raw.parent_ready=false;raw.release_match='unknown';raw.final_started=true;
  expect(f.claim(s,a.source,a.permit).ok).toBe(true);
});
it('pins the copied per-user snapshot rather than reading changed caller credentials',async()=>{
  const snapshot:ReadSnapshot={instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'ORIGINAL',oauth:{clientId:'',clientSecret:''}};
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('{}')),s=make({fetch:fetcher},snapshot);
  snapshot.perUserBearerToken='REPLACED';snapshot.authMode='service-account';
  await s.get(path);const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts()));expect(f.claim(s,a.source,a.permit).ok).toBe(true);
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer ORIGINAL');
});
it.each(['cached','exchange'] as const)('pins the single service-account auth-ready generation: %s',async kind=>{
  const fetcher=vi.fn(async(url:URL|RequestInfo)=>new URL(String(url)).pathname==='/oauth_token.do'
    ?new Response('{"access_token":"PRIVATE_TOKEN","expires_in":3600}'):new Response('{}'));
  const s=make({fetch:fetcher},{instanceUrl:'https://fixture.service-now.com',authMode:'service-account',
    accessToken:kind==='cached'?'CACHED':undefined,tokenExpiry:Date.now()+3600000,oauth:{clientId:'client',clientSecret:'secret'}});
  await s.get(path);const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts())),o=get(f.claim(s,a.source,a.permit));
  await s.get(path);expect(f.check(o)).toEqual({ok:true,value:true});
  expect(fetcher.mock.calls.filter(([url])=>new URL(String(url)).pathname==='/oauth_token.do')).toHaveLength(kind==='cached'?0:1);
  expect(f.issue(o)).toEqual({ok:false,code:'invalid_state'});
});
it('close synchronously revokes an owner once and preserves the consumed claim',async()=>{
  const x=await setup(),o=get(x.f.claim(x.s,x.source,x.permit));x.s.close();
  expect(get(x.f.status(o))).toEqual({state:'revoked',code:'closed',evidence_issuance:'disabled',revocations:1});
  x.s.close();expect(get(x.f.status(o)).revocations).toBe(1);
  expect(x.f.check(o)).toEqual({ok:false,code:'closed'});expect(x.f.issue(o)).toEqual({ok:false,code:'closed'});
  expect(x.f.claim(x.s,x.source,x.permit)).toEqual({ok:false,code:'closed'});
});
it('cancellation revokes before the transport AbortSignal listener runs',async()=>{
  const abort=new AbortController();let stage=0,observe!:()=>void;let entered!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;});
  const fetcher:typeof fetch=async(_url,init)=>{
    if(stage++===0)return new Response('{}');
    init!.signal!.addEventListener('abort',()=>observe(),{once:true});entered();return new Promise(()=>{});
  };
  const x=await setup({fetch:fetcher,signal:abort.signal}),o=get(x.f.claim(x.s,x.source,x.permit));
  const observed:unknown[]=[];observe=()=>{observed.push(get(x.f.status(o)));};
  const pending=x.s.get(path);const assertion=expect(pending).rejects.toMatchObject({code:'cancelled'});
  await ready;abort.abort();expect(observed).toEqual([{state:'revoked',code:'cancelled',evidence_issuance:'disabled',revocations:1}]);
  await assertion;x.s.close();expect(get(x.f.status(o)).code).toBe('cancelled');
});
it('hard deadline revokes before close, without extending the original timer',async()=>{
  vi.useFakeTimers();const x=await setup({limits:{deadlineMs:100}}),o=get(x.f.claim(x.s,x.source,x.permit));
  await vi.advanceTimersByTimeAsync(100);
  expect(get(x.f.status(o))).toMatchObject({state:'revoked',code:'deadline_exceeded',revocations:1});
  x.s.close();expect(get(x.f.status(o)).code).toBe('deadline_exceeded');expect(vi.getTimerCount()).toBe(0);
});
it('phase cutoff does not revoke the whole owner or extend the hard deadline',async()=>{
  vi.useFakeTimers();const x=await setup({limits:{deadlineMs:100}}),o=get(x.f.claim(x.s,x.source,x.permit));
  x.s.setPhaseReserve(50);await vi.advanceTimersByTimeAsync(50);
  expect(x.f.check(o)).toEqual({ok:true,value:true});
  await expect(x.s.get(path)).rejects.toMatchObject({code:'phase_deadline_exceeded'});
  x.s.setPhaseReserve(0);expect(x.f.check(o).ok).toBe(true);
  await vi.advanceTimersByTimeAsync(50);expect(get(x.f.status(o)).code).toBe('deadline_exceeded');
});
it.each([401,403])('status %i revokes with the original reason before close',async status=>{
  let n=0;const x=await setup({fetch:async()=>n++?new Response('',{status}):new Response('{}')}),o=get(x.f.claim(x.s,x.source,x.permit));
  await expect(x.s.get(path)).rejects.toMatchObject({code:status===401?'authentication_failed':'access_denied'});
  x.s.close();expect(get(x.f.status(o))).toMatchObject({state:'revoked',code:status===401?'authentication_failed':'access_denied',revocations:1});
});
it('a receive-budget stop is propagated without becoming a local scope shortage',async()=>{
  let n=0;const x=await setup({limits:{responseBytes:8},fetch:async()=>new Response(n++?'x'.repeat(9):'{}')}),o=get(x.f.claim(x.s,x.source,x.permit));
  await expect(x.s.get(path)).rejects.toMatchObject({code:'receive_budget_exceeded'});
  expect(get(x.f.status(o)).code).toBe('receive_budget_exceeded');
});
it('failed service-account authentication never becomes an auth-ready generation or retries via a new owner',async()=>{
  const fetcher=vi.fn(async()=>new Response('{"access_token":"SECRET"}'));
  const s=make({fetch:fetcher},{instanceUrl:'https://fixture.service-now.com',authMode:'service-account',oauth:{clientId:'client',clientSecret:'secret'}});
  const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts()));
  await expect(s.get(path)).rejects.toMatchObject({code:'authentication_failed'});
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'authentication_failed'});
  await expect(s.get(path)).rejects.toMatchObject({code:'authentication_failed'});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps the typed upstream reason when the pinned authentication exchange exhausts its retries',async()=>{
  const s=make({limits:{retryDelayMs:1},fetch:async()=>new Response('{}',{status:503})},
    {instanceUrl:'https://fixture.service-now.com',authMode:'service-account',oauth:{clientId:'client',clientSecret:'secret'}});
  const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts()));
  await expect(s.get(path)).rejects.toMatchObject({code:'upstream_unavailable'});
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'upstream_unavailable'});
});
it('retains the authentication-phase deadline without issuing a ready generation',async()=>{
  vi.useFakeTimers();const s=make({limits:{deadlineMs:100},fetch:()=>new Promise(()=>{})},
    {instanceUrl:'https://fixture.service-now.com',authMode:'service-account',oauth:{clientId:'client',clientSecret:'secret'}});
  s.setPhaseReserve(50);const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts())),pending=s.get(path);
  const assertion=expect(pending).rejects.toMatchObject({code:'phase_deadline_exceeded'});
  await vi.advanceTimersByTimeAsync(50);await assertion;
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'phase_deadline_exceeded'});
});
it('late authentication completion cannot restore readiness after session cancellation',async()=>{
  const abort=new AbortController();let release!:(r:Response)=>void;
  const s=make({signal:abort.signal,fetch:()=>new Promise(resolve=>{release=resolve;})},
    {instanceUrl:'https://fixture.service-now.com',authMode:'service-account',oauth:{clientId:'client',clientSecret:'secret'}});
  const f=createFakeSessionOwnerIssuer(),a=get(f.source(s,facts())),pending=s.get(path);
  const assertion=expect(pending).rejects.toMatchObject({code:'cancelled'});abort.abort();await assertion;
  release(new Response('{"access_token":"SECRET","expires_in":3600}'));await Promise.resolve();await Promise.resolve();
  expect(f.claim(s,a.source,a.permit)).toEqual({ok:false,code:'cancelled'});
});
it.each(['clone','other_issuer','raw'] as const)('rejects %s owner handles without exposing bindings',async kind=>{
  const x=await setup(),o=get(x.f.claim(x.s,x.source,x.permit));
  const f=kind==='other_issuer'?createFakeSessionOwnerIssuer():x.f;
  const value=kind==='clone'?structuredClone(o):kind==='raw'?{} as typeof o:o;
  expect(f.status(value)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(f.issue(value)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.f.check(o).ok).toBe(true);
});
it('same credential values in a later session do not make old source/owner handles valid',async()=>{
  const snapshot:ReadSnapshot={instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'IDENTICAL',oauth:{clientId:'',clientSecret:''}};
  const a=make({},snapshot);await a.get(path);const f=createFakeSessionOwnerIssuer(),source=get(f.source(a,facts())),o=get(f.claim(a,source.source,source.permit));a.close();
  const b=make({},snapshot);await b.get(path);expect(f.claim(b,source.source,source.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(f.check(o)).toEqual({ok:false,code:'closed'});
});
it('unknown or already cancelled sessions cannot register usable fake sources',()=>{
  const f=createFakeSessionOwnerIssuer();expect(f.source({},facts())).toEqual({ok:false,code:'evidence_binding_mismatch'});
  const abort=new AbortController();abort.abort();const s=make({signal:abort.signal});
  expect(f.source(s,facts())).toEqual({ok:false,code:'cancelled'});
});
