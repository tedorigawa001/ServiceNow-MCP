import {expect,it,vi} from 'vitest';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {createDevelopmentSourceRealm} from '../support/review/ef03/source.js';
import {createDevelopmentReleaseConditionsRealm} from '../support/review/ef03/release-conditions.js';

const target='a'.repeat(32),parent={result:{sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'}};
const conditions=()=>({started_at:'2026-11-01T00:00:00.000Z',observed_at:'2026-11-01T00:00:01.000Z',policy:{instanceBinding:'a'.repeat(64)}});
const profile=(rows:unknown=[{build_name:'Australia'}])=>({principal:'adoption',source:{target,parent,release:{result:rows}},release_comparison:conditions()});
it('publishes a fixed non-executable summary only after source seal and confirmed cleanup',async()=>{
  const root=createDevelopmentRoot({clock:()=>0}),result=await root.run(profile());
  expect(result.ok).toBe(true);
  expect(result).toMatchObject({source:{state:'closed',sealed:true},construction:{teardown:'confirmed'},release_comparison:{
    scope:'release_value_comparison_only',ok:true,kind:'release_comparison_draft',model_id:'release-comparison-v1',
    decision:{release_match:'matched',instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:'2026-11-01T00:00:01.000Z',visibility_scope:'caller_acl'},limitations:['release_visible_nodes_only']},
    permissions:{formal_issuance:false,release_permit:false,dispatch:false,fallback_activation:false},
  }});
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
  expect(result).not.toHaveProperty('permit');
});
function fixture(raw:unknown=conditions()){
  const sources=createDevelopmentSourceRealm(),realm=createDevelopmentReleaseConditionsRealm(sources),context=Object.freeze({run:{},snapshot:{},lease:{}});
  let code:'cancelled'|'deadline_exceeded'|null=null,ownerAction=()=>{},sourceAction=()=>{};
  const source=sources.create(context,target,()=>{sourceAction();return code;});
  const owner=realm.bind(realm.pin(raw,60000),context,source,60000,()=>{ownerAction();return code;});
  source.prepare(context);source.ready(context);owner.claim(context,source);
  return {sources,realm,context,source,owner,consume:(rows:unknown=[{build_name:'Australia'}])=>{
    source.consume(source.issue('parent',parent),'parent',context);
    source.consume(source.issue('release',{result:rows}),'release',context);
  },stop:(value:typeof code)=>{code=value;},armOwner:(action:()=>void)=>{ownerAction=action;},armSource:(action:()=>void)=>{sourceAction=action;}};
}
it('takes the same consumed projection once, not a caller-supplied replacement',()=>{
  const f=fixture(),rows=[{build_name:'Australia',address:'SECRET'}];f.consume(rows);rows[0].build_name='Zurich';
  expect(f.owner.compare(f.context,f.source)).toBeUndefined();
  expect(f.owner.inspect()).toMatchObject({state:'compared',primary:null});
  const value=f.owner.takeForClose(f.context,f.source);
  expect(value.decision.instance_release).toMatchObject({family:'Australia',raw_buildname:'Australia'});
  expect(JSON.stringify(value)).not.toContain('SECRET');expect(Object.isFrozen(value.decision.instance_release)).toBe(true);
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('internal_review_error');
});
it('cannot compare before a completed release ack or retry after the failure',()=>{
  const f=fixture();expect(()=>f.owner.compare(f.context,f.source)).toThrow('internal_review_error');
  f.consume();expect(()=>f.owner.compare(f.context,f.source)).toThrow('internal_review_error');
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow();
});
it('rejects duplicate comparison and discards the prior unpublished candidate',()=>{
  const f=fixture();f.consume();f.owner.compare(f.context,f.source);
  expect(()=>f.owner.compare(f.context,f.source)).toThrow('internal_review_error');
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('internal_review_error');
});
it.each(['context','source','draft'] as const)('rejects foreign %s at comparison without affecting the other owner',kind=>{
  const f=fixture(),other=fixture();f.consume();other.consume();
  const source=kind==='context'?f.source:kind==='source'?other.source:{} as typeof f.source;
  expect(()=>f.owner.compare(kind==='context'?other.context:f.context,source)).toThrow('internal_review_error');
  expect(f.owner.inspect().primary?.code).toBe('evidence_binding_mismatch');
  other.owner.compare(other.context,other.source);expect(other.owner.takeForClose(other.context,other.source).ok).toBe(true);
});
it.each([1,3])('stops at comparison guard %i without exposing a candidate',at=>{
  const f=fixture();f.consume();let calls=0;f.armOwner(()=>{if(++calls===at)f.stop('cancelled');});
  expect(()=>f.owner.compare(f.context,f.source)).toThrow('cancelled');
  expect(f.owner.inspect()).toMatchObject({state:'failed',has_conditions:false,primary:{code:'cancelled'}});
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('cancelled');
});
it('cannot revive an owner revoked by the source acquisition guard',()=>{
  const f=fixture();f.consume();f.armSource(()=>f.owner.revoke());
  expect(()=>f.owner.compare(f.context,f.source)).toThrow('closed');
  expect(f.owner.inspect().state).toBe('closed');
});
it('refuses caught comparison reentry and retains the first reason',()=>{
  const f=fixture();f.consume();let once=true;f.armOwner(()=>{if(once){once=false;try{f.owner.compare(f.context,f.source);}catch{}}});
  expect(()=>f.owner.compare(f.context,f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect().primary?.code).toBe('invalid_state');
});
it.each(['cancel','deadline','throw','backwards'] as const)('refuses publication on the final post-cleanup %s check',fault=>{
  const controller=new AbortController();let armed=false,root!:ReturnType<typeof createDevelopmentRoot>;
  root=createDevelopmentRoot({clock:()=>{
    if(armed&&root.inspect().active===0){
      if(fault==='cancel')controller.abort();
      if(fault==='deadline')return 60000;
      if(fault==='throw')throw Error('SECRET_CLOCK');
      if(fault==='backwards')return -1;
    }
    return 0;
  },wait:async()=>{armed=true;}});
  return root.run(profile(),{signal:controller.signal}).then(result=>{
    expect(result.code).toBe(fault==='cancel'?'cancelled':fault==='deadline'?'deadline_exceeded':'internal_review_error');
    expect(result).not.toHaveProperty('release_comparison');expect(result.source).toMatchObject({state:'closed',sealed:true});
    expect(JSON.stringify(result)).not.toContain('SECRET_CLOCK');expect(root.inspect().active).toBe(0);
  });
});
const assertion=()=>({source:'operator_config',resolution_status:'asserted',visibility_scope:'operator_configured',family:'Australia',instance_binding:'a'.repeat(64),config_version:'b'.repeat(64),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'});
it('lets post-guard cancellation win over an invalid policy result',()=>{
  const bad={...conditions(),policy:{...conditions().policy,assertion:{...assertion(),expires_at:'2026-11-01T00:00:00.000Z'}}};
  const f=fixture(bad);f.consume();let checks=0;f.armOwner(()=>{if(++checks===3)f.stop('cancelled');});
  expect(()=>f.owner.compare(f.context,f.source)).toThrow('cancelled');
  expect(f.owner.inspect().primary?.code).toBe('cancelled');
});
it.each([
  [[], 'observation_unavailable'],
  [[{build_name:'Australia'},{build_name:null}], 'observation_incomplete'],
  [[{build_name:'SECRET_UNKNOWN'}], 'observation_inconsistent'],
  [Array(21).fill({build_name:null}), 'observation_limit'],
] as [unknown,string][])('publishes an ordinary unknown with fixed reason for %j',async(rows,reason)=>{
  const result=await createDevelopmentRoot({clock:()=>0}).run(profile(rows));
  expect(result.ok).toBe(true);
  expect(result.release_comparison?.decision).toEqual({release_match:'unknown',instance_release:{source:'none',resolution_status:'unknown',family:null,visibility_scope:'unavailable',reason},limitations:[reason,'release_unknown']});
  expect(JSON.stringify(result)).not.toContain('SECRET_UNKNOWN');
});
it.each(['Australia','Brazil','Zurich','Yokohama','Xanadu'])('preserves the exact measured warnings for %s',async family=>{
  const result=await createDevelopmentRoot({clock:()=>0}).run(profile([{build_name:family}]));
  expect(result.ok).toBe(true);
  expect(result.release_comparison?.decision).toMatchObject({release_match:family==='Australia'?'matched':'mismatched',instance_release:{source:'sys_cluster_state.build_name',family},limitations:['release_visible_nodes_only',...(family==='Australia'?[]:['release_mismatch'])]});
});
it.each(['Australia','Zurich'])('keeps the exact asserted warning order for %s',async family=>{
  const p={...profile([]),release_comparison:{...conditions(),policy:{...conditions().policy,assertion:{...assertion(),family}}}};
  const result=await createDevelopmentRoot({clock:()=>0}).run(p);
  expect(result.ok).toBe(true);expect(result.release_comparison?.decision).toEqual({release_match:family==='Australia'?'matched':'mismatched',instance_release:{...assertion(),family},limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable',...(family==='Australia'?[]:['release_mismatch'])]});
});
it('keeps expired configured family in a conflict without appending its issue',async()=>{
  const p={...profile(),release_comparison:{...conditions(),policy:{...conditions().policy,assertion:{...assertion(),family:'Zurich',expires_at:'2026-10-31T00:00:00.000Z'},issue:'config_expired'}}};
  const result=await createDevelopmentRoot({clock:()=>0}).run(p);
  expect(result.release_comparison?.decision).toEqual({release_match:'unknown',instance_release:{source:'conflict',resolution_status:'unknown',family:null,visibility_scope:'caller_acl',observed_families:['Australia'],configured_family:'Zurich',observed_at:conditions().observed_at},limitations:['release_evidence_conflict','release_unknown']});
});
it.each([Array(22).fill({build_name:'Australia'}),[{build_name:42}]].map(rows=>({rows})))('keeps invalid projection as a source failure, not an unknown result %#',async({rows})=>{
  const result=await createDevelopmentRoot({clock:()=>0}).run(profile(rows));
  expect(result.code).toBe('invalid_response');expect(result).not.toHaveProperty('release_comparison');
});
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const transcript=(auth:'per-user'|'cached'|'exchange')=>({target,auth,responses:[
  ...(auth==='exchange'?[{purpose:'authentication',bytes:encode({access_token:'SYNTHETIC_SECRET',token_type:'bearer',expires_in:3600})}]:[]),
  {purpose:'parent',bytes:encode(parent)},{purpose:'release',bytes:encode({result:[{build_name:'Australia'}]})},
]});
it.each(['per-user','cached','exchange'] as const)('keeps %s same-byte accounting, one reservation return and bootstrap non-admission',async auth=>{
  const script=transcript(auth),root=createDevelopmentRoot({clock:()=>0});
  const old=await root.run({principal:'bytes',transcript:script});
  const result=await root.run({principal:'bytes',transcript:transcript(auth),release_comparison:conditions()});
  const {release_comparison,...base}=result;expect(base).toEqual(old);
  expect(result.budget).toEqual({requests:auth==='exchange'?3:2,received_bytes:script.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0});
  expect(result.bootstrap).toMatchObject({reserved_peak:4,reserved:0,release_attempts:1,release_match:'not_evaluated'});
  expect(release_comparison?.decision.release_match).toBe('matched');expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET');
});
it('charges malformed body bytes but releases the final reservation without publishing a result',async()=>{
  const script=transcript('per-user');script.responses[1].bytes=new Uint8Array([255]);
  const result=await createDevelopmentRoot({clock:()=>0}).run({principal:'utf8',transcript:script,release_comparison:conditions()});
  expect(result.code).toBe('invalid_response');expect(result).not.toHaveProperty('release_comparison');
  expect(result.budget).toEqual({requests:2,received_bytes:script.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0});
  expect(result.bootstrap).toMatchObject({reserved:0,release_attempts:1});
});
it('releases the reservation on cancellation before parent acceptance without publishing a result',async()=>{
  const controller=new AbortController(),root=createDevelopmentRoot({clock:()=>0});
  const pending=root.run({principal:'cancel',transcript:transcript('per-user'),release_comparison:conditions()},{signal:controller.signal});
  controller.abort();const result=await pending;
  expect(result.code).toBe('cancelled');expect(result).not.toHaveProperty('release_comparison');
  expect(result.budget).toEqual({requests:1,received_bytes:0,payload_bytes:0});
  expect(result.bootstrap).toMatchObject({reserved:0,release_attempts:1});expect(root.inspect().active).toBe(0);
});
it('does not publish while waiting and discards a completed comparison when cancelled before cleanup',async()=>{
  let resume!:()=>void,published=false;const waiting=new Promise<void>(resolve=>{resume=resolve;});
  const controller=new AbortController(),root=createDevelopmentRoot({clock:()=>0,wait:()=>waiting});
  const pending=root.run(profile(),{signal:controller.signal}).then(result=>{published=true;return result;});
  await Promise.resolve();expect(published).toBe(false);expect(root.inspect().active).toBe(1);
  controller.abort();resume();const result=await pending;
  expect(result.code).toBe('cancelled');expect(result).not.toHaveProperty('release_comparison');
});
it('refuses summary publication when timer cleanup is unconfirmed',async()=>{
  const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  const timers:ReturnType<typeof setTimeout>[]=[];
  const set=vi.spyOn(globalThis,'setTimeout').mockImplementation(((...args:Parameters<typeof setTimeout>)=>{const handle=originalSet(...args);timers.push(handle);return handle;}) as typeof setTimeout);
  const clear=vi.spyOn(globalThis,'clearTimeout').mockImplementationOnce(()=>{throw Error('SECRET_CLEANUP');});
  try{
    const result=await createDevelopmentRoot({clock:()=>0}).run(profile());
    expect(result.code).toBe('internal_review_error');expect(result.construction.teardown).toBe('unconfirmed');
    expect(result).not.toHaveProperty('release_comparison');expect(JSON.stringify(result)).not.toContain('SECRET');
  }finally{clear.mockRestore();set.mockRestore();timers.forEach(timer=>originalClear(timer));}
});
it.each(['comparison','transfer'] as const)('rejects source-only revocation at the %s post-guard',phase=>{
  const f=fixture();f.consume();
  if(phase==='transfer')f.owner.compare(f.context,f.source);
  let checks=0;f.armOwner(()=>{if(++checks===(phase==='comparison'?3:2))f.source.revoke();});
  expect(()=>phase==='comparison'?f.owner.compare(f.context,f.source):f.owner.takeForClose(f.context,f.source)).toThrow('closed');
  expect(f.owner.inspect()).toMatchObject({has_conditions:false,primary:{code:'closed'}});
});
it.each([1,2])('refuses transfer guard %i without returning the private candidate',at=>{
  const f=fixture();f.consume();f.owner.compare(f.context,f.source);let checks=0;
  f.armOwner(()=>{if(++checks===at)f.stop('deadline_exceeded');});
  expect(()=>f.owner.takeForClose(f.context,f.source)).toThrow('deadline_exceeded');
  expect(f.owner.inspect()).toMatchObject({has_conditions:false,primary:{code:'deadline_exceeded'}});
});
it('treats contradictory pinned policy as an internal stop and never publishes an ordinary unknown',async()=>{
  const p={...profile(),release_comparison:{...conditions(),policy:{...conditions().policy,assertion:assertion(),issue:'config_expired'}}};
  const result=await createDevelopmentRoot({clock:()=>0}).run(p);
  expect(result).toMatchObject({code:'internal_review_error',run_primary:{code:'internal_review_error'},construction:{primary:null,teardown:'confirmed'}});
  expect(result).not.toHaveProperty('release_comparison');
});
it('does not adopt a serialized summary as new comparison conditions',async()=>{
  const root=createDevelopmentRoot({clock:()=>0}),first=await root.run(profile());
  const result=await root.run({...profile(),release_comparison:JSON.parse(JSON.stringify(first.release_comparison))});
  expect(result.code).toBe('invalid_input');expect(result.budget.requests).toBe(0);
});
it('rejects a post-cleanup clock rewind even when it stays after the original start',async()=>{
  let bodyDone=false,root!:ReturnType<typeof createDevelopmentRoot>;
  root=createDevelopmentRoot({clock:()=>bodyDone?(root.inspect().active===0?500:1000):0,wait:async()=>{bodyDone=true;}});
  const result=await root.run(profile());
  expect(result.code).toBe('internal_review_error');expect(result).not.toHaveProperty('release_comparison');
});
