import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FixtureAccountingSession} from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import {createFixtureOAuthBootstrap} from '../../src/review/abort-scope-evidence-oauth-bootstrap.js';
import {createFixtureOAuthWebStreamTransport} from '../../src/review/abort-scope-evidence-web-stream.js';
import {createFakeSessionOwnerIssuer} from '../../src/review/abort-scope-evidence-session-fixture.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
const sessions:FixtureAccountingSession[]=[];
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const token=()=>({access_token:'DUMMY_PRIVATE_TOKEN',expires_in:3600,token_type:'Bearer',refresh_token:'DUMMY_REFRESH'});
function session(limits:ConstructorParameters<typeof FixtureAccountingSession>[0]={}){const s=new FixtureAccountingSession(limits,{oauthBootstrap:true});sessions.push(s);return s;}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{sessions.splice(0).forEach(s=>s.close());expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();vi.restoreAllMocks();});
it('starts before auth with a fixed POST descriptor, counts the exchange and exposes no tokens or body receipts',async()=>{
  const s=session(),source=vi.fn(()=>new Response(JSON.stringify(token()))),api=get(createFixtureOAuthBootstrap(s,source));
  expect(s.stats()).toEqual({requests:0,received_bytes:0,payload_bytes:0});
  const r=await api.bootstrap();expect(r).toEqual({ok:true,value:{state:'auth_ready',synthetic:true,evidence_issuance:'disabled'}});
  expect(source.mock.calls[0]).toEqual([{method:'POST',path:'/oauth_token.do',grant_type:'client_credentials',ordinal:1,synthetic:true},expect.any(AbortSignal)]);
  expect(api.stats()).toMatchObject({requests:1,received_bytes:Buffer.byteLength(JSON.stringify(token())),evidence_bytes:0,reserved:4,timers:0,retained_bytes:0,diagnostic:{auth_ready:true}});
  expect(JSON.stringify([r,api.stats()])).not.toMatch(/DUMMY_|access_token|refresh_token/);
});
it('continues after authentication with the identical machine, budget, clock and session generation',async()=>{
  const s=session(),source=vi.fn(r=>new Response(r.purpose==='oauth'?JSON.stringify(token()):'{"result":[]}')),
    api=get(createFixtureOAuthWebStreamTransport(s,source)),m=api.machine;
  const p=get(m.purpose('oauth',{source:m.source,phase:m.phase()})),r=get(await api.run(p));expect(r).toMatchObject({outcome:'auth_only',body:null});
  const parent=get(m.purpose('parent_initial',{source:m.source,phase:m.phase()})),read=get(await api.run(parent));get(m.consumeBody(read.body!,parent));
  const f=createFakeSessionOwnerIssuer(),fake=get(f.source(s,{parent_ready:true,final_started:false,release_match:'matched'})),owner=get(f.claim(s,fake.source,fake.permit));
  expect(f.check(owner).ok).toBe(true);expect(api.stats()).toMatchObject({requests:2,received_bytes:Buffer.byteLength(JSON.stringify(token()))+13,reserved:4});
  expect(m.issueEvidence().ok).toBe(false);
});
it.each(['per-user','ready','real'] as const)('does not enroll a %s session into bootstrap or switch authentication modes',async kind=>{
  const source=vi.fn(()=>new Response(JSON.stringify(token())));let s:object;
  let real:BoundedReadSession|undefined;
  if(kind==='real')s=real=new BoundedReadSession({instanceUrl:'https://fixture.service-now.com',authMode:'per-user',perUserBearerToken:'DUMMY_REAL',oauth:{clientId:'',clientSecret:''}},
    {fetch:async()=>new Response('{}')});
  else{const x=new FixtureAccountingSession();sessions.push(x);if(kind==='ready')await x.baseline('{}',()=>{});s=x;}
  try{expect(createFixtureOAuthBootstrap(s,source).ok).toBe(false);expect(source).not.toHaveBeenCalled();if(real)await expect(real.get('/api/now/table/sys_update_set?sysparm_limit=1')).resolves.toEqual({});}
  finally{real?.close();}
});
it('refuses ordinary reads before auth and never reopens a failed session with a bootstrap claim',()=>{
  const s=session(),source=vi.fn(()=>new Response(JSON.stringify(token()))),api=get(createFixtureOAuthWebStreamTransport(s,source)),m=api.machine;
  expect(m.purpose('parent_initial',{source:m.source,phase:m.phase()})).toEqual({ok:false,code:'authentication_failed'});
  expect(createFixtureOAuthBootstrap(s,source).ok).toBe(false);expect(source).not.toHaveBeenCalled();
});
it('rejects duplicate bootstrap registration and a second invocation without issuing another exchange',async()=>{
  const s=session(),source=vi.fn(()=>new Response(JSON.stringify(token()))),api=get(createFixtureOAuthBootstrap(s,source));
  expect(createFixtureOAuthBootstrap(s,source).ok).toBe(false);expect((await api.bootstrap()).ok).toBe(true);
  expect(await api.bootstrap()).toMatchObject({ok:false,code:'invalid_state'});expect(source).toHaveBeenCalledTimes(1);
});
it.each([
  {},{access_token:'DUMMY',expires_in:'3600'},{access_token:'',expires_in:3600},{access_token:'\r\nDUMMY',expires_in:3600},
  {access_token:'DUMMY',expires_in:3600,token_type:'Basic'},{access_token:'DUMMY',expires_in:3600,token_type:1},
  {access_token:'DUMMY',expires_in:-1},{access_token:'x'.repeat(8193),expires_in:3600},
  {access_token:'DUMMY',expires_in:3600,error:'PRIVATE_ERROR',error_description:'PRIVATE_DETAIL'},
])('rejects an invalid OAuth shape without leaking the supplied error or token (%#)',async value=>{
  const api=get(createFixtureOAuthBootstrap(session(),()=>new Response(JSON.stringify(value)))),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'authentication_failed',diagnostic:{primary_detail:'oauth_response_invalid',auth_ready:false,last_failure:{scope:'authentication',retryable:false}}});
  expect(JSON.stringify(r)).not.toMatch(/DUMMY|PRIVATE_/);expect(api.stats()).toMatchObject({requests:1,timers:0,retained_bytes:0});
});
it.each([59,60])('requires the declared token lifetime to exceed the full 60s run (%s)',async expires_in=>{
  const api=get(createFixtureOAuthBootstrap(session(),()=>new Response(JSON.stringify({...token(),expires_in})))),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'authentication_failed',diagnostic:{primary_detail:'oauth_lifetime_insufficient'}});
});
it.each(['bearer','BEARER',undefined])('accepts the existing case-insensitive/omitted token_type policy (%s)',async token_type=>{
  const api=get(createFixtureOAuthBootstrap(session(),()=>new Response(JSON.stringify({...token(),token_type}))));expect((await api.bootstrap()).ok).toBe(true);
});
it.each([400,401,403,404])('classifies terminal OAuth HTTP %s as authentication failure, not table absence or release fallback',async status=>{
  const cancel=vi.fn(),source=vi.fn(()=>new Response(new ReadableStream({pull(){},cancel}),{status})),api=get(createFixtureOAuthBootstrap(session(),source)),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'authentication_failed',diagnostic:{primary_detail:'oauth_http_error',last_failure:{scope:'authentication',retryable:false}}});
  expect(api.stats()).toMatchObject({reads:0,cancels:1,requests:1});expect(cancel).toHaveBeenCalledTimes(1);expect(source).toHaveBeenCalledTimes(1);
});
it.each(['syntax','utf8','no_body'] as const)('rejects a %s OAuth response after cleanup without becoming ready',async kind=>{
  const api=get(createFixtureOAuthBootstrap(session(),()=>kind==='no_body'?new Response(null,{status:204}):new Response(kind==='syntax'?'PRIVATE_BAD_JSON':new Uint8Array([0xff])))),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'authentication_failed',diagnostic:{primary_detail:'oauth_response_invalid',auth_ready:false}});expect(JSON.stringify(r)).not.toContain('PRIVATE_BAD_JSON');
});
it.each([429,503])('retries only a cleaned-up HTTP %s, preserving all C/G and prior fixed diagnostics',async status=>{
  let n=0,g=0,c=0;const source=vi.fn(()=>{c++;const text=n++===0?'PRIVATE_RETRY':JSON.stringify(token());g+=Buffer.byteLength(text);return new Response(text,{status:n===1?status:200});}),
    api=get(createFixtureOAuthBootstrap(session(),source));expect((await api.bootstrap()).ok).toBe(true);
  expect(api.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:0,reserved:4,diagnostic:{auth_ready:true,last_failure:{code:'upstream_unavailable',retryable:true}}});
  expect(c).toBe(2);expect(JSON.stringify(api.stats())).not.toContain('PRIVATE_RETRY');
});
it('keeps exhausted upstream failures distinct from an OAuth rejection and never tries a third time',async()=>{
  const source=vi.fn(()=>new Response('{}',{status:503})),api=get(createFixtureOAuthBootstrap(session(),source)),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'upstream_unavailable',diagnostic:{primary:'upstream_unavailable',last_failure:{code:'upstream_unavailable',scope:'transport',retryable:false},auth_ready:false}});expect(source).toHaveBeenCalledTimes(2);
  api.close();expect(api.stats().diagnostic.primary).toBe('upstream_unavailable');
});
it('does not replace a receive limit with authentication failure or reset its consumed counters',async()=>{
  const api=get(createFixtureOAuthBootstrap(session({responseBytes:8}),()=>new Response(JSON.stringify(token())))),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'receive_budget_exceeded'});expect(api.stats().received_bytes).toBe(Buffer.byteLength(JSON.stringify(token())));
});
it('keeps primary authentication failure when cleanup cannot be confirmed',async()=>{
  const api=get(createFixtureOAuthBootstrap(session(),()=>new Response(new ReadableStream({pull(){},cancel(){return Promise.reject(Error('PRIVATE_CANCEL'));}}),{status:401}))),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'authentication_failed',diagnostic:{primary_detail:'oauth_http_error',cleanup_unconfirmed:true,auth_ready:false}});expect(JSON.stringify(r)).not.toContain('PRIVATE_CANCEL');
});
it('does not mark auth ready when a successful JSON response cannot release its lock',async()=>{
  const response=new Response(JSON.stringify(token())),acquire=response.body!.getReader.bind(response.body);let native!:ReadableStreamDefaultReader<Uint8Array>,restore!:()=>void;
  vi.spyOn(response.body!,'getReader').mockImplementation(()=>{native=acquire();const s=vi.spyOn(native,'releaseLock').mockImplementation(()=>{throw Error('PRIVATE_RELEASE');});restore=()=>s.mockRestore();return native;});
  const s=session(),api=get(createFixtureOAuthBootstrap(s,()=>response)),r=await api.bootstrap();
  expect(r).toMatchObject({ok:false,code:'internal_review_error',diagnostic:{primary_detail:'cleanup_unconfirmed',auth_ready:false}});restore();native.releaseLock();
  expect(createFakeSessionOwnerIssuer().source(s,{parent_ready:true,final_started:false,release_match:'matched'})).toEqual({ok:false,code:'internal_review_error'});
});
it.each(['cancel','close'] as const)('blocks late OAuth readiness after %s and observes cleanup',async mode=>{
  const api=get(createFixtureOAuthBootstrap(session(),()=>new Response(new ReadableStream({pull(){}})))),pending=api.bootstrap();
  await vi.advanceTimersByTimeAsync(0);api[mode]();const r=await pending;
  expect(r).toMatchObject({ok:false,code:mode==='cancel'?'cancelled':'closed',diagnostic:{auth_ready:false}});expect(api.stats()).toMatchObject({timers:0,retained_bytes:0});
});
it('includes the original hard deadline before bootstrap and does not resurrect late auth completion',async()=>{
  const s=session({deadlineMs:20,requestTimeoutMs:20}),api=get(createFixtureOAuthBootstrap(s,()=>new Response(JSON.stringify(token()))));
  await vi.advanceTimersByTimeAsync(20);expect(await api.bootstrap()).toMatchObject({ok:false,code:'deadline_exceeded'});expect(api.stats()).toMatchObject({requests:0});
});
it('does not commit auth_only when controller termination reentrantly closes the session',async()=>{
  const s=session(),api=get(createFixtureOAuthWebStreamTransport(s,(_r,signal)=>{
    signal.addEventListener('abort',()=>s.close(),{once:true});return new Response(JSON.stringify(token()));
  })),m=api.machine,p=get(m.purpose('oauth',{source:m.source,phase:m.phase()})),r=get(await api.run(p));
  expect(r).toMatchObject({outcome:'stopped',body:null});expect(m.diagnostics()).toMatchObject({primary:'closed',auth_ready:false});
});
it('uses the original shortened deadline without weakening the required token lifetime boundary',async()=>{
  const api=get(createFixtureOAuthBootstrap(session({deadlineMs:20,requestTimeoutMs:20}),()=>new Response(JSON.stringify({...token(),expires_in:0.02}))));
  expect(await api.bootstrap()).toMatchObject({ok:false,code:'authentication_failed',diagnostic:{primary_detail:'oauth_lifetime_insufficient'}});
});
it('classifies a pre-dispatch request shortage without spending or resetting authentication budgets',async()=>{
  const source=vi.fn(()=>new Response(JSON.stringify(token()))),api=get(createFixtureOAuthBootstrap(session({requests:4}),source));
  expect(await api.bootstrap()).toMatchObject({ok:false,code:'request_budget_exceeded',diagnostic:{primary:'request_budget_exceeded',auth_ready:false}});
  expect(source).not.toHaveBeenCalled();expect(api.stats()).toMatchObject({requests:0,received_bytes:0,reserved:4});
});
it('keeps phase refusal on a retry distinct from cleaned-up upstream failure and hard timeout',async()=>{
  const source=vi.fn((_r,signal)=>{signal.addEventListener('abort',()=>vi.advanceTimersByTime(4),{once:true});return new Response('{}',{status:503});}),
    api=get(createFixtureOAuthBootstrap(session(),source));await vi.advanceTimersByTimeAsync(49995);
  expect(await api.bootstrap()).toMatchObject({ok:false,code:'phase_deadline_exceeded',diagnostic:{primary:'phase_deadline_exceeded',last_failure:{code:'upstream_unavailable'},auth_ready:false}});
  expect(source).toHaveBeenCalledTimes(1);expect(api.stats()).toMatchObject({requests:1,received_bytes:2,timers:0});
});
