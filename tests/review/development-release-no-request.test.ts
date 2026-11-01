import {expect,it} from 'vitest';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {createDevelopmentSourceRealm} from '../support/review/ef03/source.js';
import {createDevelopmentReleaseConditionsRealm} from '../support/review/ef03/release-conditions.js';

const target='a'.repeat(32),parent={result:{sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'}};
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const assertion=()=>({source:'operator_config',resolution_status:'asserted',visibility_scope:'operator_configured',family:'Australia',instance_binding:'c'.repeat(64),config_version:'b'.repeat(64),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'});
const conditions=()=>({started_at:'2026-11-01T00:00:00.000Z',observed_at:'2026-11-01T00:00:01.000Z',policy:{instanceBinding:'a'.repeat(64),assertion:assertion(),issue:'config_binding_mismatch'}});
const transcript=(auth:'per-user'|'cached'|'exchange'='per-user')=>({target,auth,responses:[
  ...(auth==='exchange'?[{purpose:'authentication',bytes:encode({access_token:'SYNTHETIC_SECRET',expires_in:3600})}]:[]),
  {purpose:'parent',bytes:encode(parent)},
  // A dispatch would fail; no-request must neither deliver nor parse these bytes.
  {purpose:'release',bytes:new Uint8Array([255]),outcome:'throw'},
]});
it('rejects configured binding before release dispatch and returns the reservation once',async()=>{
  const script=transcript(),root=createDevelopmentRoot({clock:()=>0});
  const result=await root.run({principal:'no_request',transcript:script,release_comparison:conditions()});
  expect(result).toMatchObject({ok:true,code:null,construction:{teardown:'confirmed'},
    budget:{requests:1,received_bytes:script.responses[0].bytes.length,payload_bytes:0},
    bootstrap:{dispatches:1,reserved_peak:4,reserved:0,release_attempts:1,release_match:'not_evaluated'},
    source:{parent_consumptions:1,release_consumptions:0,status_consumptions:0,state:'closed',sealed:true},
    release_comparison:{decision:{release_match:'unknown',instance_release:{source:'none',reason:'config_binding_mismatch'},limitations:['config_binding_mismatch','release_unknown']},permissions:{release_permit:false,dispatch:false,fallback_activation:false}},
  });
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
});
it.each(['per-user','cached','exchange'] as const)('keeps %s authentication/parent accounting but release GET=0',async auth=>{
  const script=transcript(auth),root=createDevelopmentRoot({clock:()=>0});
  const result=await root.run({principal:'accounting',transcript:script,release_comparison:conditions()});
  const delivered=script.responses.slice(0,-1),expectedRequests=auth==='exchange'?2:1;
  expect(result.budget).toEqual({requests:expectedRequests,received_bytes:delivered.reduce((n,row)=>n+row.bytes.length,0),payload_bytes:0});
  expect(result.bootstrap).toMatchObject({dispatches:expectedRequests,reserved_peak:4,reserved:0,release_attempts:1});
  expect(result.source).toMatchObject({parent_consumptions:1,release_consumptions:0,status_consumptions:0});
  expect(result.release_comparison?.decision).toEqual({release_match:'unknown',instance_release:{source:'none',resolution_status:'unknown',family:null,visibility_scope:'unavailable',reason:'config_binding_mismatch'},limitations:['config_binding_mismatch','release_unknown']});
  const serialized=JSON.stringify(result);
  for(const hidden of ['SYNTHETIC_SECRET',conditions().observed_at,'c'.repeat(64),'config_version'])expect(serialized).not.toContain(hidden);
  expect(root.inspect().active).toBe(0);
});
it('skips source release projection without treating a skipped value as an empty 200',async()=>{
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'source_skip',source:{target,parent,release:{result:[{build_name:42}]}},release_comparison:conditions()});
  expect(result.ok).toBe(true);expect(result.budget).toEqual({requests:0,received_bytes:0,payload_bytes:0});
  expect(result.source).toMatchObject({parent_consumptions:1,release_consumptions:0,state:'closed',sealed:true});
  expect(result.release_comparison?.decision.instance_release).toMatchObject({source:'none',reason:'config_binding_mismatch'});
});
it.each(['authentication','parent'] as const)('does not bypass invalid %s when binding is wrong',async purpose=>{
  const script=transcript('exchange'),row=script.responses.find(row=>row.purpose===purpose)!;
  row.bytes=encode(purpose==='authentication'?{access_token:'SECRET',expires_in:1}:{result:{...parent.result,sys_id:'f'.repeat(32)}});
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'prior_failure',transcript:script,release_comparison:conditions()});
  expect(result.code).toBe(purpose==='authentication'?'authentication_failed':'invalid_response');
  expect(result).not.toHaveProperty('release_comparison');
  expect(result.budget.requests).toBe(purpose==='authentication'?1:2);
  expect(result.bootstrap).toMatchObject({reserved:0,release_attempts:1});
});
it('returns reserved slots after cancellation during parent delivery with no release GET',async()=>{
  const controller=new AbortController(),root=createDevelopmentRoot({clock:()=>0});
  const pending=root.run({principal:'abort',transcript:transcript(),release_comparison:conditions()},{signal:controller.signal});controller.abort();
  const result=await pending;
  expect(result).toMatchObject({code:'cancelled',budget:{requests:1,received_bytes:0,payload_bytes:0},bootstrap:{reserved:0,release_attempts:1}});
  expect(result).not.toHaveProperty('release_comparison');expect(root.inspect().active).toBe(0);
});
it('restores local admission and reserves/returns independently for successive runs',async()=>{
  const root=createDevelopmentRoot({clock:()=>0});
  for(let i=0;i<2;i++){
    const result=await root.run({principal:'repeat',transcript:transcript(),release_comparison:conditions()});
    expect(result).toMatchObject({ok:true,budget:{requests:1},bootstrap:{reserved_peak:4,reserved:0,release_attempts:1}});
    expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
  }
});
function fixture(){
  const sources=createDevelopmentSourceRealm(),realm=createDevelopmentReleaseConditionsRealm(sources),context=Object.freeze({run:{},snapshot:{},lease:{}});
  let code:'cancelled'|'deadline_exceeded'|null=null,action=()=>{},sourceAction=()=>{};
  const source=sources.create(context,target,()=>{sourceAction();return code;});
  const owner=realm.bind(realm.pin(conditions(),60000),context,source,60000,()=>{action();return code;});
  source.prepare(context);source.ready(context);owner.claim(context,source);
  return {sources,realm,context,source,owner,parent:()=>source.consume(source.issue('parent',parent),'parent',context),stop:(value:typeof code)=>{code=value;},arm:(value:()=>void)=>{action=value;},armSource:(value:()=>void)=>{sourceAction=value;}};
}
it('spends the no-request decision once and cannot create a release ack after it',()=>{
  const f=fixture();f.parent();expect(f.owner.beforeRelease(f.context,f.source)).toBe(false);
  expect(f.source.inspect()).toMatchObject({state:'done',release_consumptions:0});
  const draft=f.owner.takeForClose(f.context,f.source);expect(draft.permissions.dispatch).toBe(false);
  expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow('internal_review_error');
  expect(()=>f.source.issue('release',{result:[]})).toThrow('internal_review_error');
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('internal_review_error');
});
it.each([1,2,3])('retains stop at no-request guard %i without a transferable candidate',at=>{
  const f=fixture();f.parent();let checks=0;f.arm(()=>{if(++checks===at)f.stop(at===2?'deadline_exceeded':'cancelled');});
  const reason=at===2?'deadline_exceeded':'cancelled';
  expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow(reason);
  expect(f.owner.inspect()).toMatchObject({state:'failed',has_conditions:false,primary:{code:reason}});
  expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow(reason);
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow(reason);
  expect(f.source.inspect().release_consumptions).toBe(0);
});
it.each(['context','source'] as const)('refuses foreign %s without consuming the other owner',kind=>{
  const f=fixture(),other=fixture();f.parent();other.parent();
  expect(()=>f.owner.beforeRelease(kind==='context'?other.context:f.context,kind==='source'?other.source:f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect().primary?.code).toBe('evidence_binding_mismatch');
  expect(other.owner.beforeRelease(other.context,other.source)).toBe(false);
});
it('refuses an early decision and never resumes after the parent later completes',()=>{
  const f=fixture();expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow('internal_review_error');
  f.parent();expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow('internal_review_error');
});
it('retains caught reentry as the first failure',()=>{
  const f=fixture();f.parent();let once=true;f.arm(()=>{if(once){once=false;try{f.owner.beforeRelease(f.context,f.source);}catch{}}});
  expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({has_conditions:false,primary:{code:'invalid_state'}});
});
it.each(['owner','source'] as const)('refuses %s revocation during no-request source completion',part=>{
  const f=fixture();f.parent();f.armSource(()=>part==='owner'?f.owner.revoke():f.source.revoke());
  expect(()=>f.owner.beforeRelease(f.context,f.source)).toThrow('closed');
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('closed');
});
it('cannot bypass the no-request branch by providing release rows to the D02 comparator',()=>{
  const f=fixture();f.parent();f.source.consume(f.source.issue('release',{result:[{build_name:'Australia'}]}),'release',f.context);
  expect(()=>f.owner.compare(f.context,f.source)).toThrow('internal_review_error');
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('internal_review_error');
});
it.each(['request','received'] as const)('does not spend %s capacity reserved for an unrequested release',async dimension=>{
  const script=transcript(),limits=dimension==='request'?{requests:5}:{total_bytes:script.responses[0].bytes.length};
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'limit',transcript:{...script,limits},release_comparison:conditions()});
  expect(result.ok).toBe(true);expect(result.budget.requests).toBe(1);
  expect(result.bootstrap).toMatchObject({reserved_peak:4,reserved:0,release_attempts:1});
});
it('still charges and rejects an over-budget parent before the no-request decision',async()=>{
  const script=transcript();
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'over',transcript:{...script,limits:{total_bytes:script.responses[0].bytes.length-1}},release_comparison:conditions()});
  expect(result).toMatchObject({code:'receive_budget_exceeded',budget:{requests:1,received_bytes:script.responses[0].bytes.length},bootstrap:{reserved:0,release_attempts:1}});
  expect(result).not.toHaveProperty('release_comparison');
});
it('does not turn internally inconsistent mismatch dates into a successful unavailable draft',async()=>{
  const raw=conditions();raw.policy.assertion.asserted_at='2026-11-02T00:00:00.000Z';
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'bad_dates',transcript:transcript(),release_comparison:raw});
  expect(result).toMatchObject({code:'internal_review_error',budget:{requests:1},bootstrap:{reserved:0,release_attempts:1}});
  expect(result).not.toHaveProperty('release_comparison');
});
it.each([
  {rows:[],family:'Australia',match:'matched',source:'operator_config',limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable']},
  {rows:[],family:'Zurich',match:'mismatched',source:'operator_config',limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable','release_mismatch']},
  {rows:[{build_name:'Australia'}],family:'Australia',match:'matched',source:'sys_cluster_state.build_name',limitations:['release_visible_nodes_only']},
  {rows:[{build_name:'Australia'}],family:'Zurich',match:'unknown',source:'conflict',limitations:['release_evidence_conflict','release_unknown']},
])('retains a release dispatch for a same-binding $source decision ($family/$match)',async expected=>{
  const script=transcript(),raw=conditions();
  raw.policy.assertion.instance_binding=raw.policy.instanceBinding;raw.policy.assertion.family=expected.family;
  const {issue,...policy}=raw.policy;
  const release=encode({result:expected.rows});script.responses[1]={purpose:'release',bytes:release,outcome:'ok'};
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'same_binding',transcript:script,release_comparison:{...raw,policy}});
  expect(result.ok).toBe(true);expect(result.budget).toEqual({requests:2,received_bytes:script.responses[0].bytes.length+release.length,payload_bytes:0});
  expect(result.release_comparison?.decision).toMatchObject({release_match:expected.match,instance_release:{source:expected.source},limitations:expected.limitations});
  expect(result.source?.release_consumptions).toBe(1);expect(result.bootstrap).toMatchObject({reserved:0,release_attempts:1,release_match:'not_evaluated'});
});
