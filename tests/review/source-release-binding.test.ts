import {afterEach,expect,it,vi} from 'vitest';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';
import {BoundedUpdateSetSource} from '../../src/review/bounded-source.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
const parent='a'.repeat(32);let sequence=0;const sessions:BoundedReadSession[]=[];
afterEach(()=>{sessions.splice(0).forEach(s=>s.close());vi.useRealTimers();});
const row={sys_id:parent,state:'in progress',application:'global',sys_updated_on:'2026-10-27',sys_mod_count:'0'};
function make(){const fetcher=vi.fn<typeof fetch>(async url=>Response.json({result:String(url).includes('sys_cluster_state')?[{build_name:'Australia'}]:String(url).includes('sys_update_xml')?[]:row}));
  const root=new AbortController();const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',authMode:'per-user',perUserBearerToken:`DUMMY_${sequence++}`,oauth:{clientId:'',clientSecret:''}},{fetch:fetcher,signal:root.signal});
  sessions.push(session);const source=new BoundedUpdateSetSource(session,{update_set_sys_id:parent,max_records:20});return {source,session,fetcher,root};}
async function admit(source:BoundedUpdateSetSource){await source.readParent();const d=await source.resolveRelease();if(d.release_match!=='matched')throw Error('Expected match');return d;}
it('binds the source-issued permit and an independent immutable release snapshot to the existing run',async()=>{
  const x=make(),d=await admit(x.source);
  if(d.instance_release.source==='sys_cluster_state.build_name')d.instance_release.raw_buildname='Zurich';
  const status=x.source.reviewReleaseStatus(d.permit);
  expect(status).toMatchObject({state:'prepared_only',instance_release:{family:'Australia',raw_buildname:'Australia'},limitations:['release_visible_nodes_only'],evidence_issuance:'disabled'});
  expect(Object.isFrozen(status.instance_release)).toBe(true);expect(Object.isFrozen(status.limitations)).toBe(true);
  expect(x.session.reviewRunStatus()).toMatchObject({source_claim:'claimed',budget:{requests:2}});
  await x.source.listMetadata(d.permit);expect(x.session.stats().requests).toBe(3);
});
it('does not redirect the bound source through a shadow public session property',async()=>{
  const x=make(),other=make(),d=await admit(x.source);Object.defineProperty(x.source,'session',{value:other.session});
  expect(x.source.stats().requests).toBe(2);await x.source.listMetadata(d.permit);
  expect(x.fetcher).toHaveBeenCalledTimes(3);expect(other.fetcher).not.toHaveBeenCalled();
});
it.each(['cancel','close'] as const)('cannot use the prepared release binding after %s',async kind=>{
  const x=make(),d=await admit(x.source);if(kind==='cancel')x.root.abort();else x.session.close();
  const code=kind==='cancel'?'cancelled':'closed';expect(()=>x.source.reviewReleaseStatus(d.permit)).toThrow(expect.objectContaining({code}));
  await expect(x.source.listMetadata(d.permit)).rejects.toMatchObject({code});expect(x.fetcher).toHaveBeenCalledTimes(2);
  expect(x.session.reviewRunStatus()).toMatchObject({auth_ready:false,primary:{code},source_claim:'claimed'});
});
it('stops when a second source attempts to replace the already claimed source on the same run',async()=>{
  const x=make(),first=await admit(x.source),other=new BoundedUpdateSetSource(x.session,{update_set_sys_id:parent,max_records:20});
  await other.readParent();await expect(other.resolveRelease()).rejects.toMatchObject({code:'internal_review_error'});
  expect(x.session.reviewRunStatus()).toMatchObject({state:'stopped',primary:{stage:'binding',code:'evidence_binding_mismatch'}});
  expect(()=>x.source.reviewReleaseStatus(first.permit)).toThrow();expect(x.fetcher).toHaveBeenCalledTimes(4);
});
it.each(['forged','clone','other_permit','other_source','foreign_pair','other_session','proxy'] as const)('rejects %s binding confusion without changing a foreign run',async kind=>{
  const x=make(),y=make(),a=await admit(x.source),b=await admit(y.source);
  const source=kind==='other_source'||kind==='foreign_pair'?y.source:kind==='proxy'?new Proxy(x.source,{}):x.source;
  const permit=kind==='forged'?{}:kind==='clone'?structuredClone(a.permit):kind==='other_permit'||kind==='foreign_pair'?b.permit:a.permit;
  if(kind==='other_session')expect(()=>y.session.reviewReleaseSourceStatus(x.source,a.permit)).toThrow(expect.objectContaining({code:'internal_review_error'}));
  else expect(()=>x.session.reviewReleaseSourceStatus(source,permit)).toThrow(expect.objectContaining({code:'internal_review_error'}));
  const victim=kind==='other_session'?y:x,healthy=kind==='other_session'?x:y,healthyPermit=kind==='other_session'?a.permit:b.permit;
  expect(victim.session.reviewRunStatus()).toMatchObject({state:'stopped',primary:{code:'evidence_binding_mismatch'}});
  await healthy.source.listMetadata(healthyPermit);expect(healthy.session.reviewRunStatus().primary).toBeNull();
  expect(victim.fetcher).toHaveBeenCalledTimes(2);victim.session.close();expect(victim.session.reviewRunStatus().primary?.code).toBe('evidence_binding_mismatch');
});
it('rejects duplicate binding without replacing the healthy prepared owner or causing extra I/O',async()=>{
  const x=make(),d=await admit(x.source);expect(()=>x.session.bindReviewReleaseSource(x.source,d.permit)).toThrow();
  expect(x.session.reviewRunStatus().primary).toBeNull();expect(x.source.reviewReleaseStatus(d.permit).state).toBe('prepared_only');
  expect(await x.source.resolveRelease()).toBe(d);expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it.each(['Zurich','Unrecognized','empty','conflict'] as const)('never claims a source for an unmatched %s observation',async family=>{
  const x=make();x.fetcher.mockImplementation(async url=>Response.json({result:String(url).includes('sys_cluster_state')?
    family==='empty'?[]:family==='conflict'?[{build_name:'Australia'},{build_name:'Zurich'}]:[{build_name:family}]:row}));
  await x.source.readParent();const d=await x.source.resolveRelease();expect(d.release_match).not.toBe('matched');expect(d).not.toHaveProperty('permit');
  expect(x.session.reviewRunStatus()).toMatchObject({source_claim:'unclaimed',primary:null});expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it('pins C-mode asserted release and all limitations independently of the public decision',async()=>{
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('sys_cluster_state')?new Response(null,{status:403}):Response.json({result:row}));
  const now=Date.now(),binding=createReviewInstanceBinding('dummy','https://fake.invalid');
  const session=new BoundedReadSession({instanceUrl:'https://fake.invalid',authMode:'per-user',perUserBearerToken:`DUMMY_${sequence++}`,oauth:{clientId:'',clientSecret:''},
    reviewReleaseConfig:{instance_id:'dummy',assertion:{family:'Australia',instance_binding:binding,asserted_at:new Date(now-60000).toISOString(),expires_at:new Date(now+120000).toISOString()}}},{fetch:fetcher});sessions.push(session);
  const source=new BoundedUpdateSetSource(session,{update_set_sys_id:parent,max_records:20}),d=await admit(source);
  const status=source.reviewReleaseStatus(d.permit);expect(status.instance_release).toMatchObject({source:'operator_config',resolution_status:'asserted',family:'Australia'});
  expect(status.limitations).toEqual(['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable']);
  expect(status.instance_release).not.toBe(d.instance_release);expect(status.limitations).not.toBe(d.limitations);
  expect(session.reviewRunStatus()).toMatchObject({source_claim:'claimed',budget:{requests:2}});
});
it('does not issue a binding when cancelled during the fake release read',async()=>{
  const x=make();x.fetcher.mockImplementation(async url=>{if(String(url).includes('sys_cluster_state')){x.root.abort();return Response.json({result:[{build_name:'Australia'}]});}return Response.json({result:row});});
  await x.source.readParent();await expect(x.source.resolveRelease()).rejects.toMatchObject({code:'cancelled'});
  expect(x.session.reviewRunStatus()).toMatchObject({source_claim:'unclaimed',primary:{code:'cancelled'}});expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it('stops retained permits at the original deadline but allows readonly inspection after the normal cutoff',async()=>{
  vi.useFakeTimers({toFake:['performance','setTimeout','clearTimeout']});const x=make(),d=await admit(x.source);x.session.setPhaseReserve(10000);
  await vi.advanceTimersByTimeAsync(50000);expect(x.source.reviewReleaseStatus(d.permit).state).toBe('prepared_only');
  await expect(x.source.listMetadata(d.permit)).rejects.toMatchObject({code:'phase_deadline_exceeded'});
  await vi.advanceTimersByTimeAsync(10000);expect(()=>x.source.reviewReleaseStatus(d.permit)).toThrow(expect.objectContaining({code:'deadline_exceeded'}));
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
