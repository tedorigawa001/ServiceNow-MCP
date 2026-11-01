import {expect,it,vi} from 'vitest';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {createDevelopmentSourceRealm} from '../support/review/ef03/source.js';
import {createDevelopmentReleaseConditionsRealm} from '../support/review/ef03/release-conditions.js';
import {createDevelopmentResponseDelivery} from '../support/review/ef03/native.js';

const target='a'.repeat(32),parent={result:{sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'}};
const conditions=()=>({started_at:'2026-11-01T00:00:00.000Z',observed_at:'2026-11-01T00:00:01.000Z',policy:{instanceBinding:'a'.repeat(64)}});
const profile=()=>({principal:'conditions',source:{target,parent,release:{result:[{build_name:'Australia'}]}}});
it('keeps the existing summary fields unchanged and adds only the opted-in D02 value summary',async()=>{
  const root=createDevelopmentRoot({clock:()=>0});
  const old=await root.run(profile()),current=await root.run({...profile(),release_comparison:conditions()});
  const {release_comparison,...base}=current;
  expect(current.ok).toBe(true);expect(base).toEqual(old);
  expect(old).not.toHaveProperty('release_comparison');expect(current).not.toHaveProperty('decision');
  expect(release_comparison).toMatchObject({scope:'release_value_comparison_only',decision:{release_match:'matched'},permissions:{formal_issuance:false,release_permit:false}});
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
});
function fixture(){
  const sources=createDevelopmentSourceRealm(),realm=createDevelopmentReleaseConditionsRealm(sources);
  const context=Object.freeze({run:Object.freeze({}),snapshot:Object.freeze({}),lease:Object.freeze({})});
  const source=sources.create(context,target,()=>null);
  let stopped:string|null=null,action=()=>{};
  const owner=realm.bind(realm.pin(conditions(),60000),context,source,60000,()=>{action();return stopped as 'cancelled'|null;});
  return {sources,realm,context,source,owner,ready:()=>{source.prepare(context);source.ready(context);},stop:(code:string|null)=>{stopped=code;},arm:(value:()=>void)=>{action=value;}};
}
it('rejects a claim before ready and never restores it after failure',()=>{
  const f=fixture();expect(()=>f.owner.claim(f.context,f.source)).toThrow('internal_review_error');
  f.ready();expect(()=>f.owner.claim(f.context,f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',has_conditions:false,primary:{code:'invalid_state'}});
});
it.each(['cancelled','deadline_exceeded','SECRET_DIAGNOSTIC'])('keeps a fixed first stop for %s',code=>{
  const f=fixture();f.ready();f.stop(code);
  expect(()=>f.owner.claim(f.context,f.source)).toThrow(code==='SECRET_DIAGNOSTIC'?'internal_review_error':code);
  f.stop(null);expect(()=>f.owner.claim(f.context,f.source)).toThrow();
  expect(f.owner.inspect()).toMatchObject({has_conditions:false,primary:{code:code==='SECRET_DIAGNOSTIC'?'internal_review_error':code}});
  expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('spends the successful claim once, drops conditions on revoke, and cannot regenerate for the same run',()=>{
  const f=fixture();f.ready();f.owner.claim(f.context,f.source);
  expect(f.owner.inspect()).toMatchObject({state:'claimed',has_conditions:true,primary:null});
  expect(()=>f.owner.claim(f.context,f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({primary:{code:'invalid_state'},has_conditions:false});
  expect(()=>f.realm.bind(f.realm.pin(conditions(),60000),f.context,f.source,60000,()=>null)).toThrow('internal_review_error');
  f.owner.revoke();expect(f.owner.inspect()).toMatchObject({state:'closed',has_conditions:false,primary:{code:'invalid_state'}});
  expect(()=>f.owner.claim(f.context,f.source)).toThrow('internal_review_error');
});
it.each(['run','snapshot','lease','wrapper','source'] as const)('refuses mixed %s identity and does not affect a foreign realm',key=>{
  const f=fixture(),other=fixture();f.ready();other.ready();
  const candidate=key==='source'?f.context:key==='wrapper'?Object.freeze({...f.context}):Object.freeze({...f.context,[key]:other.context[key]});
  expect(()=>f.owner.claim(candidate,key==='source'?other.source:f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({has_conditions:false,primary:{code:'evidence_binding_mismatch'}});
  other.owner.claim(other.context,other.source);expect(other.owner.inspect().state).toBe('claimed');
});
it.each(['copy','foreign','proxy','deadline','source'] as const)('spends the pinned handle before rejecting bind %s',kind=>{
  const sources=createDevelopmentSourceRealm(),realm=createDevelopmentReleaseConditionsRealm(sources),other=fixture();
  const context=Object.freeze({run:{},snapshot:{},lease:{}}),source=sources.create(context,target,()=>null),handle=realm.pin(conditions(),60000);
  const candidate=kind==='copy'?{...handle}:kind==='foreign'?other.realm.pin(conditions(),60000):kind==='proxy'?new Proxy(handle,{}):handle;
  expect(()=>realm.bind(candidate,context,kind==='source'?other.source:source,kind==='deadline'?1:60000,()=>null)).toThrow('internal_review_error');
  if(candidate===handle)expect(()=>realm.bind(handle,context,source,60000,()=>null)).toThrow('internal_review_error');
  else {const owner=realm.bind(handle,context,source,60000,()=>null);owner.revoke();}
});
it('rejects nested claim reentry even when its guard catches the inner failure',()=>{
  const f=fixture();f.ready();let once=true;
  f.arm(()=>{if(once){once=false;try{f.owner.claim(f.context,f.source);}catch{/* outer must still refuse */}}});
  expect(()=>f.owner.claim(f.context,f.source)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',has_conditions:false,primary:{code:'invalid_state'}});
});
it('does not revive a claim revoked during its post-guard',()=>{
  const f=fixture();f.ready();let calls=0;f.arm(()=>{if(++calls===2)f.owner.revoke();});
  expect(()=>f.owner.claim(f.context,f.source)).toThrow('closed');
  expect(f.owner.inspect()).toMatchObject({state:'closed',has_conditions:false,primary:{code:'closed'}});
});
it('retains a post-guard cancellation without accepting the claim',()=>{
  const f=fixture();f.ready();let calls=0;f.arm(()=>{if(++calls===2)f.stop('cancelled');});
  expect(()=>f.owner.claim(f.context,f.source)).toThrow('cancelled');
  expect(f.owner.inspect()).toMatchObject({state:'failed',has_conditions:false,primary:{code:'cancelled'}});
});
const assertion=()=>({source:'operator_config',resolution_status:'asserted',visibility_scope:'operator_configured',family:'Australia',instance_binding:'a'.repeat(64),config_version:'b'.repeat(64),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'});
it('refuses contradictory binding issue labels before clock or synthetic dispatch',async()=>{
  let clocks=0;const root=createDevelopmentRoot({clock:()=>{clocks++;return 0;}});
  for(const policy of [
    {instanceBinding:'a'.repeat(64),assertion:{...assertion(),instance_binding:'c'.repeat(64)}},
    {instanceBinding:'a'.repeat(64),assertion:assertion(),issue:'config_binding_mismatch'},
  ]){
    const result=await root.run({...profile(),release_comparison:{...conditions(),policy}});
    expect(result.code).toBe('invalid_input');expect(result.budget).toEqual({requests:0,received_bytes:0,payload_bytes:0});
  }
  expect(clocks).toBe(0);
});
it('rejects untrusted condition shapes before constructing resources without running getters or proxies',async()=>{
  let clocks=0,calls=0;const root=createDevelopmentRoot({clock:()=>{clocks++;return 0;}});
  const getter={...conditions()};Object.defineProperty(getter,'policy',{get(){calls++;return conditions().policy;}});
  for(const release_comparison of [getter,new Proxy(conditions(),{ownKeys(){calls++;return [];}}),{...conditions(),deadline_ms:1},
    {...conditions(),started_at:'invalid'}, {...conditions(),policy:{...conditions().policy,permit:{}}},undefined]){
    const result=await root.run({...profile(),release_comparison});expect(result.code).toBe('invalid_input');
    expect(result.construction.resources.core.state).toBe('absent');
  }
  expect(clocks).toBe(0);expect(calls).toBe(0);
});
it('rejects conditions without an eligible source route',async()=>{
  const result=await createDevelopmentRoot().run({principal:'none',release_comparison:conditions()});
  expect(result.code).toBe('invalid_input');expect(result.budget.requests).toBe(0);
});
it('keeps long config dates uncapped and copies conditions without exposing them',async()=>{
  const configured={...assertion(),asserted_at:`2026-10-01T00:00:00.${'0'.repeat(1000)}Z`};
  const root=createDevelopmentRoot({clock:()=>0});
  const result=await root.run({...profile(),release_comparison:{...conditions(),policy:{...conditions().policy,assertion:configured}}});
  expect(result.ok).toBe(true);expect(JSON.stringify(result)).not.toContain('asserted_at');
});
it('does not affect real session state or admission and never calls fetch',async()=>{
  const {BoundedReadSession}=await import('../../src/servicenow/bounded-read.js');
  const config={instanceUrl:'https://synthetic.invalid',authMode:'per-user' as const,perUserBearerToken:'d01-first',oauth:{clientId:'',clientSecret:''}};
  const a=new BoundedReadSession(config),b=new BoundedReadSession({...config,perUserBearerToken:'d01-second'});
  const before={construction:a.constructionStatus(),budget:a.stats(),primary:a.reviewRunStatus().primary};
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('SECRET_NETWORK');});
  try{
    expect((await createDevelopmentRoot().run({...profile(),release_comparison:conditions()})).ok).toBe(true);
    expect({construction:a.constructionStatus(),budget:a.stats(),primary:a.reviewRunStatus().primary}).toEqual(before);
    expect(()=>new BoundedReadSession({...config,perUserBearerToken:'d01-third'})).toThrow('review_busy');
    expect(fetch).not.toHaveBeenCalled();
  }finally{fetch.mockRestore();a.close();b.close();}
});
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const transcript=(auth:'per-user'|'cached'|'exchange')=>({target,auth,responses:[
  ...(auth==='exchange'?[{purpose:'authentication',bytes:encode({access_token:'SYNTHETIC_SECRET',token_type:'Bearer',expires_in:3600})}]:[]),
  {purpose:'parent',bytes:encode(parent)},{purpose:'release',bytes:encode({result:[{build_name:'Australia'}]})},
]});
it.each(['per-user','cached','exchange'] as const)('keeps %s transcript accounting and final-four cleanup unchanged',async auth=>{
  const root=createDevelopmentRoot({clock:()=>0}),script=transcript(auth);
  const old=await root.run({principal:'transcript',transcript:script});
  const value=await root.run({principal:'transcript',transcript:transcript(auth),release_comparison:conditions()});
  const {release_comparison,...base}=value;
  expect(value.ok).toBe(true);expect(base).toEqual(old);
  expect(old).not.toHaveProperty('release_comparison');expect(release_comparison?.decision.release_match).toBe('matched');
  expect(value.bootstrap).toMatchObject({reserved:0,release_attempts:1,release_match:'not_evaluated'});
  expect(value.budget).toEqual({requests:auth==='exchange'?3:2,received_bytes:script.responses.reduce((n,r)=>n+r.bytes.length,0),payload_bytes:0});
  expect(JSON.stringify(value)).not.toContain('SYNTHETIC_SECRET');
});
it('rejects native/conditions combinations before spending the native delivery',async()=>{
  const native={target,parent_bytes:encode(parent),delivery:createDevelopmentResponseDelivery(new Response(null,{status:403}))};
  const root=createDevelopmentRoot({clock:()=>0});
  expect((await root.run({principal:'native',native,release_comparison:conditions()})).code).toBe('invalid_input');
  const legacy=await root.run({principal:'native',native});
  expect(legacy.ok).toBe(true);expect(legacy.source?.status_consumptions).toBe(1);
});
it('pins conditions before await, removes private refs on cancellation and frees the run for another profile',async()=>{
  let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
  const root=createDevelopmentRoot({clock:()=>0,wait:()=>pending}),controller=new AbortController(),value=conditions();
  const run=root.run({...profile(),release_comparison:value},{signal:controller.signal});
  value.started_at='SECRET_INVALID';value.policy.instanceBinding='invalid';controller.abort();release();
  const result=await run;
  expect(result).toMatchObject({code:'cancelled',run_primary:{code:'cancelled'},source:{state:'closed',sealed:true}});
  expect(JSON.stringify(result)).not.toContain('SECRET');expect(root.inspect().active).toBe(0);
  expect((await root.run(profile())).ok).toBe(true);
});
it('spends bind setup and generation when its first guard fails',()=>{
  const sources=createDevelopmentSourceRealm(),realm=createDevelopmentReleaseConditionsRealm(sources),context=Object.freeze({run:{},snapshot:{},lease:{}});
  const source=sources.create(context,target,()=>null),handle=realm.pin(conditions(),60000);
  expect(()=>realm.bind(handle,context,source,60000,()=>{throw Error('SECRET');})).toThrow('internal_review_error');
  expect(()=>realm.bind(handle,context,source,60000,()=>null)).toThrow('internal_review_error');
  expect(()=>realm.bind(realm.pin(conditions(),60000),context,source,60000,()=>null)).toThrow('internal_review_error');
});
it('fails closed for invalid falsy guard results rather than treating them as success',()=>{
  for(const value of [undefined,false,0,'']){
    const f=fixture();f.ready();f.stop(value as unknown as string);
    expect(()=>f.owner.claim(f.context,f.source)).toThrow('internal_review_error');
    expect(f.owner.inspect()).toMatchObject({state:'failed',has_conditions:false,primary:{code:'internal_review_error'}});
  }
});
