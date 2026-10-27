import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
import * as lifecycle from '../../src/servicenow/review-evidence-lifecycle.js';
const opened:BoundedReadSession[]=[];let sequence=0;
afterEach(()=>{opened.splice(0).forEach(s=>s.close());vi.useRealTimers();});
function make(fetcher:typeof fetch,signal?:AbortSignal){
  const snapshot={instanceUrl:'https://fake.invalid',authMode:'per-user' as const,perUserBearerToken:`DUMMY_${sequence++}`,oauth:{clientId:'',clientSecret:''}};
  const session=new BoundedReadSession(snapshot,{fetch:fetcher,signal});opened.push(session);return {session,snapshot};
}
const path='/api/now/table/sys_update_set?sysparm_limit=1';
it('pins one private run to the real session snapshot, ready generation and existing budget without exposing authority',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response('{}'));const {session,snapshot}=make(fetcher);
  expect(session.reviewRunStatus()).toMatchObject({state:'created',auth_ready:false,evidence_issuance:'disabled',budget:{requests:0}});
  snapshot.perUserBearerToken='REPLACED_CALLER_COPY';await session.get(path);
  expect(session.reviewRunStatus()).toMatchObject({state:'ready',auth_ready:true,ready_generation:1,budget:{requests:1,received_bytes:2,payload_bytes:0}});
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).not.toContain('REPLACED');
  session.chargePayload('<a/>');await session.get(path);
  expect(session.reviewRunStatus()).toMatchObject({ready_generation:1,budget:{requests:2,received_bytes:4,payload_bytes:4}});
  expect(JSON.stringify(session.reviewRunStatus())).not.toMatch(/DUMMY|REPLACED|Authorization|snapshot|lease/);
});
it('does not derive its private lease from replaceable public stats or remaining-time summaries',async()=>{
  const {session}=make(async()=>new Response('{}'));await session.get(path);
  session.stats=()=>({requests:0,received_bytes:0,payload_bytes:0});session.remainingMs=()=>60000;
  expect(session.reviewRunStatus()).toMatchObject({budget:{requests:1,received_bytes:2}});
});
it('revokes synchronously before pending fake I/O sees abort and preserves cancellation through close',async()=>{
  const root=new AbortController();let started!:()=>void;const dispatched=new Promise<void>(r=>{started=r;});
  let session!:BoundedReadSession;let duringAbort:unknown;
  session=make(async(_url,init)=>{started();init!.signal!.addEventListener('abort',()=>{duringAbort=session.reviewRunStatus();},{once:true});
    return new Promise<Response>(()=>{});},root.signal).session;
  const pending=session.get(path);const rejected=expect(pending).rejects.toMatchObject({code:'cancelled'});await dispatched;root.abort(Error('SECRET_REASON'));
  expect(duringAbort).toMatchObject({state:'stopped',auth_ready:false,primary:{stage:'owner',code:'cancelled'}});
  await rejected;session.close();session.close();
  expect(session.reviewRunStatus()).toMatchObject({state:'closed',primary:{code:'cancelled'},budget:{requests:1}});
  await expect(session.get(path)).rejects.toMatchObject({code:'cancelled'});
  expect(JSON.stringify(session.reviewRunStatus())).not.toContain('SECRET');
});
it('does not resurrect ready after cancellation during a late OAuth response',async()=>{
  let resolve!:(r:Response)=>void,started!:()=>void;const dispatched=new Promise<void>(r=>{started=r;});const root=new AbortController();
  const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',oauth:{clientId:`CLIENT_${sequence++}`,clientSecret:'DUMMY_SECRET'}},
    {signal:root.signal,fetch:async()=>{started();return new Promise<Response>(r=>{resolve=r;});}});opened.push(session);
  const pending=session.get(path);const rejected=expect(pending).rejects.toMatchObject({code:'cancelled'});await dispatched;root.abort();
  resolve(Response.json({access_token:'DUMMY_LATE_TOKEN',expires_in:3600}));await rejected;await Promise.resolve();
  expect(session.reviewRunStatus()).toMatchObject({state:'stopped',auth_ready:false,ready_generation:0,primary:{code:'cancelled'},budget:{requests:1}});
});
it('keeps an authentication failure and never retries or replaces the auth generation',async()=>{
  const fetcher=vi.fn(async()=>Response.json({access_token:'DUMMY',expires_in:0}));
  const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',oauth:{clientId:`CLIENT_${sequence++}`,clientSecret:'DUMMY_SECRET'}},{fetch:fetcher});opened.push(session);
  await expect(session.get(path)).rejects.toMatchObject({code:'authentication_failed'});
  expect(session.reviewRunStatus()).toMatchObject({state:'stopped',ready_generation:0,primary:{stage:'authentication',code:'authentication_failed'}});
  await expect(session.get(path)).rejects.toMatchObject({code:'authentication_failed'});expect(fetcher).toHaveBeenCalledTimes(1);
  session.close();expect(session.reviewRunStatus().primary?.code).toBe('authentication_failed');
});
it('refuses a second owner for a real session and exports no mutation-by-session hooks',async()=>{
  const {session}=make(async()=>new Response('{}'));await session.get(path);
  const lease={read:()=>({requests:0,received_bytes:0,payload_bytes:0,remaining_ms:60000})};
  expect(()=>lifecycle.registerReviewEvidenceSession(session,{},lease)).toThrow('invalid_state');
  expect(Reflect.has(lifecycle,'markReviewEvidenceAuthReady')).toBe(false);expect(Reflect.has(lifecycle,'revokeReviewEvidenceSession')).toBe(false);
  expect(session.reviewRunStatus()).toMatchObject({state:'ready',ready_generation:1,evidence_issuance:'disabled'});
  expect(Object.keys(session)).not.toContain('snapshot');
  expect(()=>BoundedReadSession.prototype.reviewRunStatus.call({} as BoundedReadSession)).toThrow();
});
it('rejects a backwards budget-clock observation without creating a replacement ready generation',()=>{
  const snapshot={},session={};let remaining=100;const lease={read:()=>({requests:0,received_bytes:0,payload_bytes:0,remaining_ms:remaining})};
  const owner=lifecycle.registerReviewEvidenceSession(session,snapshot,lease);expect(owner.markReady(snapshot,lease)).toBe(true);
  remaining=101;expect(owner.inspect(snapshot,lease)).toMatchObject({state:'stopped',auth_ready:false,primary:{code:'invalid_observation_time'}});
  remaining=99;expect(owner.markReady(snapshot,lease)).toBe(false);
});
it.each(['snapshot','lease'] as const)('consumes the run irreversibly on a foreign %s and keeps the first binding diagnosis',kind=>{
  const snapshot={},key={},lease={read:()=>({requests:0,received_bytes:0,payload_bytes:0,remaining_ms:100})};
  const owner=lifecycle.registerReviewEvidenceSession(key,snapshot,lease);
  expect(owner.markReady(kind==='snapshot'?{}:snapshot,kind==='lease'?{...lease}:lease)).toBe(false);
  expect(owner.markReady(snapshot,lease)).toBe(false);owner.revoke('cancelled');owner.close('closed');
  expect(owner.inspect(snapshot,lease)).toMatchObject({state:'closed',ready_generation:0,primary:{stage:'binding',code:'evidence_binding_mismatch'}});
  expect(()=>lifecycle.registerReviewEvidenceSession(key,snapshot,lease)).toThrow('invalid_state');
});
it('keeps readonly views frozen and does not let a detached fake owner adopt or revoke a real run',async()=>{
  const {session}=make(async()=>new Response('{}'));await session.get(path);
  const fake=lifecycle.registerReviewEvidenceSession({},session,{read:()=>({requests:0,received_bytes:0,payload_bytes:0,remaining_ms:100})});
  fake.revoke('cancelled');const view=session.reviewRunStatus();
  expect(view).toMatchObject({state:'ready',primary:null,evidence_issuance:'disabled'});
  expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view.budget)).toBe(true);
  expect(()=>Reflect.set(view,'auth_ready',false)).not.toThrow();expect(view.auth_ready).toBe(true);
  for(const k of ['run','source','permit','snapshot','lease','markReady','revoke','claimTransportBudget'])expect(Reflect.has(view,k)).toBe(false);
});
it.each([401,403])('keeps a fake Table API %i failure across close and further reads',async status=>{
  const fetcher=vi.fn(async()=>new Response(null,{status})),{session}=make(fetcher);
  const code=status===401?'authentication_failed':'access_denied';await expect(session.get(path)).rejects.toMatchObject({code});
  expect(session.reviewRunStatus()).toMatchObject({state:'stopped',auth_ready:false,ready_generation:1,primary:{code}});
  session.close();await expect(session.get(path)).rejects.toMatchObject({code});expect(fetcher).toHaveBeenCalledTimes(1);
  expect(session.reviewRunStatus().primary?.code).toBe(code);
});
it('keeps the original hard deadline even when auth completes near it',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  let finish!:(r:Response)=>void,begin!:()=>void;const began=new Promise<void>(r=>{begin=r;});
  const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',oauth:{clientId:`CLIENT_${sequence++}`,clientSecret:'DUMMY_SECRET'}},
    {fetch:async url=>String(url).includes('oauth_token')?(begin(),new Promise<Response>(r=>{finish=r;})):new Response('{}')});opened.push(session);
  const pending=session.get(path);await began;await vi.advanceTimersByTimeAsync(9000);finish(Response.json({access_token:'DUMMY',expires_in:3600}));await pending;
  expect(session.reviewRunStatus()).toMatchObject({state:'ready',ready_generation:1,budget:{requests:2,remaining_ms:51000}});
  await vi.advanceTimersByTimeAsync(51000);
  expect(session.reviewRunStatus()).toMatchObject({state:'stopped',auth_ready:false,primary:{code:'deadline_exceeded'},budget:{remaining_ms:0}});
  await expect(session.get(path)).rejects.toMatchObject({code:'deadline_exceeded'});
});
it('does not turn a normal phase cutoff into a new run or release finalization budget',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const {session}=make(async()=>new Response('{}'));
  await session.get(path);session.setPhaseReserve(10000);await vi.advanceTimersByTimeAsync(50000);
  expect(session.reviewRunStatus()).toMatchObject({state:'ready',ready_generation:1,budget:{requests:1,remaining_ms:10000}});
  await expect(session.get(path)).rejects.toMatchObject({code:'phase_deadline_exceeded'});
  expect(session.reviewRunStatus().primary).toBeNull();
});
it('retains the same budget through a fake OAuth retry instead of replacing its origin',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});let n=0;
  const fetcher=vi.fn(async()=>++n===1?new Response('{}',{status:503}):n===2?Response.json({access_token:'DUMMY',expires_in:3600}):new Response('{}'));
  const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',oauth:{clientId:`CLIENT_${sequence++}`,clientSecret:'DUMMY_SECRET'}},{fetch:fetcher});opened.push(session);
  const pending=session.get(path);await vi.advanceTimersByTimeAsync(250);await pending;
  expect(session.reviewRunStatus()).toMatchObject({state:'ready',ready_generation:1,budget:{requests:3,remaining_ms:59750}});
  expect(session.reviewRunStatus().budget?.received_bytes).toBe(session.stats().received_bytes);
});
it.each(['cancelled','closed'] as const)('does not mark ready when the session is %s before authentication',async why=>{
  const root=new AbortController(),fetcher=vi.fn(async()=>new Response('{}'));const {session}=make(fetcher,root.signal);
  if(why==='cancelled')root.abort();else session.close();
  expect(session.reviewRunStatus()).toMatchObject({auth_ready:false,ready_generation:0,primary:{code:why}});
  await expect(session.get(path)).rejects.toMatchObject({code:why});expect(fetcher).not.toHaveBeenCalled();
});
it('cleans up via run finally without replacing a retained authentication diagnosis',async()=>{
  const {session}=make(async()=>new Response(null,{status:401}));
  await expect(session.run(()=>session.get(path))).rejects.toMatchObject({code:'authentication_failed'});
  expect(session.reviewRunStatus()).toMatchObject({state:'closed',auth_ready:false,primary:{code:'authentication_failed'}});
});
it('consumes the ready transition before a dependency can re-enter it',()=>{
  const snapshot={},key={};let owner:ReturnType<typeof lifecycle.registerReviewEvidenceSession>;let nested:unknown;let entered=false;
  const lease={read:()=>{if(!entered){entered=true;nested=owner.markReady(snapshot,lease);}return {requests:0,received_bytes:0,payload_bytes:0,remaining_ms:100};}};
  owner=lifecycle.registerReviewEvidenceSession(key,snapshot,lease);
  expect(owner.markReady(snapshot,lease)).toBe(true);expect(nested).toBe(false);
  expect(owner.inspect(snapshot,lease)).toMatchObject({state:'ready',ready_generation:1});expect(owner.markReady(snapshot,lease)).toBe(false);
});
it('keeps a cancellation from a lease callback before any ready generation is committed',()=>{
  const snapshot={};let owner:ReturnType<typeof lifecycle.registerReviewEvidenceSession>;
  const lease={read:()=>{owner.revoke('cancelled');return {requests:0,received_bytes:0,payload_bytes:0,remaining_ms:100};}};
  owner=lifecycle.registerReviewEvidenceSession({},snapshot,lease);
  expect(owner.markReady(snapshot,lease)).toBe(false);
  expect(owner.inspect(snapshot,lease)).toMatchObject({state:'stopped',ready_generation:0,primary:{code:'cancelled'}});
});
it.each(['exception','nonfinite','negative_counter','counter_rewind'] as const)('rejects %s lease observations with fixed diagnostics',kind=>{
  const snapshot={};let changed=false;
  const lease={read:()=>{if(changed&&kind==='exception')throw Error('PRIVATE_LEASE_SECRET');return {requests:changed&&kind==='negative_counter'?-1:changed&&kind==='counter_rewind'?0:1,
    received_bytes:2,payload_bytes:0,remaining_ms:changed&&kind==='nonfinite'?NaN:100};}};
  const owner=lifecycle.registerReviewEvidenceSession({},snapshot,lease);expect(owner.markReady(snapshot,lease)).toBe(true);changed=true;
  const view=owner.inspect(snapshot,lease);expect(view).toMatchObject({state:'stopped',auth_ready:false,primary:{code:kind==='exception'?'internal_review_error':'invalid_observation_time'}});
  expect(JSON.stringify(view)).not.toContain('PRIVATE');owner.close('closed');expect(owner.markReady(snapshot,lease)).toBe(false);
});
it('does not let an already-aborted input create ready or dispatch fake I/O',async()=>{
  const root=new AbortController();root.abort(Error('PRIVATE_REASON'));const fetcher=vi.fn(async()=>new Response('{}'));
  const {session}=make(fetcher,root.signal);expect(session.reviewRunStatus()).toMatchObject({state:'stopped',auth_ready:false,primary:{code:'cancelled'}});
  await expect(session.get(path)).rejects.toMatchObject({code:'cancelled'});expect(fetcher).not.toHaveBeenCalled();
});
