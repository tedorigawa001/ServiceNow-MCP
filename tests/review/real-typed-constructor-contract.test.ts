import {expect,it,vi} from 'vitest';
import {registerReviewEvidenceSession,type ReviewSourceReleaseSnapshot} from '../../src/servicenow/review-evidence-lifecycle.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function make(){const session={},snapshot={},budget={requests:0,received_bytes:0,payload_bytes:0,remaining_ms:60000};let observe=()=>{};
  const lease={read(){observe();return {...budget};}},owner=registerReviewEvidenceSession(session,snapshot,lease);
  return {session,snapshot,budget,lease,owner,observe:(fn:()=>void)=>{observe=fn;}};}
it('claims the constructor-owned identity contract once without dispatch, budget updates or evidence authority',()=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease));
  expect(Reflect.ownKeys(h)).toEqual([]);expect(Object.isFrozen(h)).toBe(true);
  expect(get(s.owner.transportConstructor.inspect(h,s.snapshot,s.lease))).toEqual({state:'identity_only',transport_claim:'claimed',evidence_issuance:'disabled',dispatch:'unavailable'});
  expect(s.budget).toEqual({requests:0,received_bytes:0,payload_bytes:0,remaining_ms:60000});
  expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});
  expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({state:'created',primary:null,transport_claim:'claimed'});
  expect(get(s.owner.transportConstructor.inspect(h,s.snapshot,s.lease)).state).toBe('identity_only');
});
it.each(['snapshot','lease'] as const)('distinguishes mixed duplicate %s claims from harmless same-binding duplication',kind=>{
  const s=make();get(s.owner.transportConstructor.claim(s.snapshot,s.lease));
  expect(s.owner.transportConstructor.claim(kind==='snapshot'?{}:s.snapshot,kind==='lease'?{...s.lease}:s.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({state:'revoked',primary:{code:'evidence_binding_mismatch'}});
});
function prepared(s:ReturnType<typeof make>){const source={},permit={},release:ReviewSourceReleaseSnapshot={instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:'2026-10-29T00:00:00Z',visibility_scope:'caller_acl'},limitations:['release_visible_nodes_only']};
  let matches=true;const port={matches:()=>matches,copyRelease:()=>release};
  expect(s.owner.markReady(s.snapshot,s.lease)).toBe(true);expect(s.owner.bindSource(s.snapshot,s.lease,source,permit,port)).toBe(true);
  return {source,permit,port,release,invalidate:()=>{matches=false;}};}
it('reuses the existing prepared source binding without a new source claim or mutable release authority',()=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease)),p=prepared(s);
  const result=get(s.owner.transportConstructor.inspectPrepared(h,s.snapshot,s.lease,p.source,p.permit,p.port));
  expect(result).toMatchObject({state:'prepared_only',instance_release:{family:'Australia'},dispatch:'unavailable',evidence_issuance:'disabled'});
  expect(result.instance_release).not.toBe(p.release.instance_release);expect(Object.isFrozen(result.instance_release)).toBe(true);
  expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({source_claim:'claimed',transport_claim:'claimed',primary:null,budget:{requests:0}});
  expect(get(s.owner.transportConstructor.inspectPrepared(h,s.snapshot,s.lease,p.source,p.permit,p.port))).toEqual(result);
});
it('does not adopt a run whose canonical budget already records I/O, even without a ready notification',()=>{
  const s=make();s.budget.requests=1;
  expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({state:'revoked',claim:'failed',primary:{stage:'transport_claim',code:'invalid_state'}});
  s.budget.requests=0;expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});
});
it('fails closed on dependency reentry during transport inspection rather than recursively accepting the handle',()=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease));let entered=false,nested:unknown;
  s.observe(()=>{if(!entered){entered=true;nested=s.owner.transportConstructor.inspect(h,s.snapshot,s.lease);}});
  expect(s.owner.transportConstructor.inspect(h,s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});expect(nested).toEqual({ok:false,code:'invalid_state'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({state:'revoked',primary:{code:'invalid_state'}});
});
it.each(['snapshot','lease'] as const)('consumes claim before rejecting a foreign %s and never retries after failure',kind=>{
  const s=make();expect(s.owner.transportConstructor.claim(kind==='snapshot'?{}:s.snapshot,kind==='lease'?{...s.lease}:s.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({claim:'failed',state:'revoked',primary:{code:'evidence_binding_mismatch'}});
  expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(s.owner.markReady(s.snapshot,s.lease)).toBe(false);
});
it.each(['foreign','clone','proxy'] as const)('rejects %s transport handles and leaves the issuing owner untouched',kind=>{
  const a=make(),h=get(a.owner.transportConstructor.claim(a.snapshot,a.lease)),before=a.owner.transportConstructor.diagnostic(),b=make();get(b.owner.transportConstructor.claim(b.snapshot,b.lease));
  let traps=0;const candidate=kind==='foreign'?h:kind==='clone'?{...h}:new Proxy(h,{get(){traps++;throw Error('PRIVATE_TRAP');}});
  expect(b.owner.transportConstructor.inspect(candidate as typeof h,b.snapshot,b.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(a.owner.transportConstructor.diagnostic()).toEqual(before);expect(get(a.owner.transportConstructor.inspect(h,a.snapshot,a.lease)).state).toBe('identity_only');expect(traps).toBe(0);
});
it.each(['snapshot','lease'] as const)('rejects a foreign %s on inspection and retains the first diagnosis through close',kind=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease));
  expect(s.owner.transportConstructor.inspect(h,kind==='snapshot'?{}:s.snapshot,kind==='lease'?{...s.lease}:s.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  s.owner.revoke('cancelled');s.owner.close('closed');expect(s.owner.transportConstructor.inspect(h,s.snapshot,s.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({state:'revoked',claim:'claimed',primary:{code:'evidence_binding_mismatch'}});
});
it.each(['requests','received_bytes','payload_bytes'] as const)('rejects pre-existing %s at either constructor claim guard',field=>{
  for(const at of [1,2]){const s=make();let observations=0;s.observe(()=>{if(++observations===at)s.budget[field]=1;});
    expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});expect(s.owner.transportConstructor.diagnostic()).toMatchObject({claim:'failed',state:'revoked'});expect(s.budget[field]).toBe(1);
  }
});
it('rejects claiming after ready even when no HTTP counter was consumed',()=>{
  const s=make();expect(s.owner.markReady(s.snapshot,s.lease)).toBe(true);expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});expect(s.owner.transportConstructor.diagnostic().claim).toBe('failed');
});
it('consumes claim before dependency reentry and never publishes a handle after nested generation',()=>{
  const s=make();let entered=false,nested:unknown;s.observe(()=>{if(!entered){entered=true;nested=s.owner.transportConstructor.claim(s.snapshot,s.lease);}});
  expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'invalid_state'});expect(nested).toEqual({ok:false,code:'invalid_state'});expect(s.owner.transportConstructor.diagnostic()).toMatchObject({claim:'failed',state:'revoked'});
});
it.each(['claim','inspect','prepared'] as const)('does not accept %s after cancellation from the final lease observation',stage=>{
  const s=make();
  // Infer the opaque handle through an actual successful claim only for post-constructor stages.
  const existing=stage==='claim'?undefined:get(s.owner.transportConstructor.claim(s.snapshot,s.lease)),p=stage==='prepared'?prepared(s):undefined;
  let seen=0;const at=stage==='prepared'?4:2;s.observe(()=>{if(++seen===at)s.owner.revoke('cancelled');});
  const result=stage==='claim'?s.owner.transportConstructor.claim(s.snapshot,s.lease):stage==='inspect'?s.owner.transportConstructor.inspect(existing!,s.snapshot,s.lease):s.owner.transportConstructor.inspectPrepared(existing!,s.snapshot,s.lease,p!.source,p!.permit,p!.port);
  expect(result).toEqual({ok:false,code:'cancelled'});expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code:'cancelled'});expect(s.owner.transportConstructor.diagnostic().state).toBe('revoked');
});
it.each(['source','permit','port'] as const)('reuses the canonical prepared verifier to reject a mixed %s',kind=>{
  const a=make(),ha=get(a.owner.transportConstructor.claim(a.snapshot,a.lease)),pa=prepared(a),b=make(),hb=get(b.owner.transportConstructor.claim(b.snapshot,b.lease)),pb=prepared(b),before=b.owner.transportConstructor.diagnostic();
  expect(a.owner.transportConstructor.inspectPrepared(ha,a.snapshot,a.lease,kind==='source'?pb.source:pa.source,kind==='permit'?pb.permit:pa.permit,kind==='port'?pb.port:pa.port)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(b.owner.transportConstructor.diagnostic()).toEqual(before);get(b.owner.transportConstructor.inspectPrepared(hb,b.snapshot,b.lease,pb.source,pb.permit,pb.port));
  expect(a.owner.inspect(a.snapshot,a.lease)).toMatchObject({source_claim:'claimed',transport_state:'revoked'});
});
it('does not rescue a missing or invalidated prepared binding by generating another transport claim',()=>{
  const a=make(),h=get(a.owner.transportConstructor.claim(a.snapshot,a.lease));
  expect(a.owner.transportConstructor.inspectPrepared(h,a.snapshot,a.lease,{}, {},{matches:()=>true,copyRelease:()=>{throw Error('NOT_CALLED');}})).toEqual({ok:false,code:'evidence_binding_mismatch'});
  const b=make(),hb=get(b.owner.transportConstructor.claim(b.snapshot,b.lease)),p=prepared(b);p.invalidate();expect(b.owner.transportConstructor.inspectPrepared(hb,b.snapshot,b.lease,p.source,p.permit,p.port)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(b.owner.transportConstructor.claim(b.snapshot,b.lease)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each(['cancelled','closed','authentication_failed'] as const)('revokes retained transport identity synchronously on %s and keeps first cause',code=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease));s.owner.revoke(code);expect(s.owner.transportConstructor.diagnostic()).toMatchObject({state:'revoked',primary:{code}});
  s.owner.close('closed');expect(s.owner.transportConstructor.inspect(h,s.snapshot,s.lease)).toEqual({ok:false,code});expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code});
});
it.each(['throw','nonfinite','expired','rewind'] as const)('rejects %s lease observations without exposing dependency errors or restoring claim',kind=>{
  const s=make();
  const existing=kind==='rewind'?get(s.owner.transportConstructor.claim(s.snapshot,s.lease)):undefined;
  if(kind==='throw')s.observe(()=>{throw Error('PRIVATE_LEASE_SECRET');});else s.budget.remaining_ms=kind==='nonfinite'?NaN:kind==='expired'?0:60001;
  const result=existing?s.owner.transportConstructor.inspect(existing,s.snapshot,s.lease):s.owner.transportConstructor.claim(s.snapshot,s.lease);
  const code=kind==='throw'?'internal_review_error':kind==='expired'?'deadline_exceeded':'invalid_observation_time';expect(result).toEqual({ok:false,code});expect(s.owner.transportConstructor.claim(s.snapshot,s.lease)).toEqual({ok:false,code});expect(JSON.stringify(s.owner.transportConstructor.diagnostic())).not.toContain('PRIVATE_LEASE_SECRET');
});
it('preserves the existing immutable release snapshot and never returns callback or update authority',()=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease)),p=prepared(s);(p.release.instance_release as {raw_buildname:string}).raw_buildname='Zurich';(p.release.limitations as string[]).push('PRIVATE_CHANGED');
  const value=get(s.owner.transportConstructor.inspectPrepared(h,s.snapshot,s.lease,p.source,p.permit,p.port));expect(value).toMatchObject({instance_release:{family:'Australia',raw_buildname:'Australia'},limitations:['release_visible_nodes_only']});
  for(const key of ['dispatch','fetch','chunk','charge','update','get','body','issueReceipt'])expect(typeof Reflect.get(s.owner.transportConstructor,key)).not.toBe('function');
  for(const key of ['transport','session','snapshot','lease','permit','source','token'])expect(Reflect.has(value,key)).toBe(false);
});
it('rechecks transport revocation after the existing source verifier final callback without publishing prepared success',()=>{
  const s=make(),h=get(s.owner.transportConstructor.claim(s.snapshot,s.lease)),p=prepared(s);let matched=0;
  p.port.matches=()=>{if(++matched===2)s.owner.revoke('cancelled');return true;};
  expect(s.owner.transportConstructor.inspectPrepared(h,s.snapshot,s.lease,p.source,p.permit,p.port)).toEqual({ok:false,code:'cancelled'});
  expect(s.owner.transportConstructor.diagnostic()).toMatchObject({state:'revoked',primary:{code:'cancelled'}});
});
it('keeps the actual session continuation private, rejects re-registration and never dispatches',()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>{throw Error('DISPATCH_FORBIDDEN');}),root=new AbortController();
  const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_RT_B01_TOKEN',oauth:{clientId:'',clientSecret:''}},{fetch:fetcher,signal:root.signal});
  try{
    expect(session.reviewRunStatus()).toMatchObject({transport_claim:'unclaimed',transport_state:'unclaimed',budget:{requests:0,received_bytes:0,payload_bytes:0}});
    expect(Reflect.has(session,'transportConstructor')).toBe(false);expect(()=>registerReviewEvidenceSession(session,{},make().lease)).toThrow('invalid_state');
    const fake=make();Object.defineProperty(session,'transportConstructor',{value:fake.owner.transportConstructor});get(fake.owner.transportConstructor.claim(fake.snapshot,fake.lease));expect(session.reviewRunStatus().transport_claim).toBe('unclaimed');
    root.abort();expect(session.reviewRunStatus()).toMatchObject({primary:{code:'cancelled'},transport_state:'revoked'});expect(JSON.stringify(session.reviewRunStatus())).not.toContain('PRIVATE_RT_B01_TOKEN');
    expect(fetcher).not.toHaveBeenCalled();
  }finally{session.close();}
});
