import {expect,it,vi} from 'vitest';
import {createDevelopmentSourceRealm} from '../support/review/ef03/source.js';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';

const target='a'.repeat(32),parent={result:{sys_id:target,state:'complete',application:'global',sys_updated_on:'2026-11-01',sys_mod_count:'1'}};
const binding=()=>Object.freeze({run:Object.freeze({}),snapshot:Object.freeze({}),lease:Object.freeze({})});
it('accepts parent then projected release once in a fresh development lifecycle and revokes before seal',()=>{
  const realm=createDevelopmentSourceRealm(),context=binding(),source=realm.create(context,target,()=>null);
  source.prepare(context);source.ready(context);
  source.consume(source.issue('parent',parent),'parent',context);
  source.consume(source.issue('release',{result:[{build_name:'Australia',address:'PRIVATE'}]}),'release',context);
  expect(source.inspect()).toMatchObject({state:'done',ready_generation:1,parent_consumptions:1,release_consumptions:1,primary:null});
  source.revoke();source.seal();
  expect(source.inspect()).toMatchObject({state:'closed',sealed:true});
  expect(JSON.stringify(source.inspect())).not.toContain('PRIVATE');
});
function fixture(){
  const realm=createDevelopmentSourceRealm(),context=binding();let stop:'cancelled'|'deadline_exceeded'|null=null;
  const source=realm.create(context,target,()=>stop);
  return {realm,context,source,stop:(code:typeof stop)=>{stop=code;},ready:()=>{source.prepare(context);source.ready(context);}};
}
it.each(['run','snapshot','lease'] as const)('rejects foreign %s binding and spends the failed lifecycle',key=>{
  const f=fixture();expect(()=>f.source.prepare({...f.context,[key]:{}})).toThrow('internal_review_error');
  expect(f.source.inspect().primary?.code).toBe('evidence_binding_mismatch');
  expect(()=>f.source.prepare(f.context)).toThrow('internal_review_error');
  expect(()=>f.realm.create(f.context,target,()=>null)).toThrow('internal_review_error');
});
it('cannot generate another source for the same run by copying the context wrapper',()=>{
  const f=fixture();
  expect(()=>f.realm.create(Object.freeze({...f.context}),target,()=>null)).toThrow('internal_review_error');
});
it('spends generation before a failed preparation and does not restore it after cancellation',()=>{
  const f=fixture();f.stop('cancelled');expect(()=>f.source.prepare(f.context)).toThrow('cancelled');
  f.stop(null);expect(()=>f.source.prepare(f.context)).toThrow('cancelled');
  expect(()=>f.realm.create(f.context,target,()=>null)).toThrow('internal_review_error');
});
it('rejects duplicate readiness without erasing the first reason or restoring generation',()=>{
  const f=fixture();f.ready();expect(()=>f.source.ready(f.context)).toThrow('internal_review_error');
  expect(f.source.inspect()).toMatchObject({ready_generation:1,primary:{code:'invalid_state'}});
  expect(()=>f.source.issue('parent',parent)).toThrow('internal_review_error');
});
it('rejects release before parent and never restarts after failure',()=>{
  const f=fixture();f.ready();expect(()=>f.source.issue('release',{result:[]})).toThrow('internal_review_error');
  expect(()=>f.source.issue('parent',parent)).toThrow('internal_review_error');
  expect(f.source.inspect().parent_consumptions).toBe(0);
});
it.each(['copy','foreign','purpose'] as const)('refuses %s acknowledgements and invalidates the pending own ack',kind=>{
  const f=fixture(),other=fixture();f.ready();other.ready();
  const ack=f.source.issue('parent',parent),foreign=other.source.issue('parent',parent);
  const candidate=kind==='copy'?{...ack}:kind==='foreign'?foreign:ack;
  expect(()=>f.source.consume(candidate,kind==='purpose'?'release':'parent',f.context)).toThrow('internal_review_error');
  expect(()=>f.source.consume(ack,'parent',f.context)).toThrow('internal_review_error');
  expect(f.source.inspect().parent_consumptions).toBe(0);
  other.source.consume(foreign,'parent',other.context);expect(other.source.inspect().parent_consumptions).toBe(1);
});
it('does not consume the same ack twice or allow a second pending issuance',()=>{
  const f=fixture();f.ready();const ack=f.source.issue('parent',parent);f.source.consume(ack,'parent',f.context);
  expect(()=>f.source.consume(ack,'parent',f.context)).toThrow('internal_review_error');
  expect(f.source.inspect().parent_consumptions).toBe(1);
  const g=fixture();g.ready();g.source.issue('parent',parent);
  expect(()=>g.source.issue('parent',parent)).toThrow('internal_review_error');
});
it.each(['cancelled','deadline_exceeded'] as const)('spends a pending ack on %s without accepting or resuming it',code=>{
  const f=fixture();f.ready();const ack=f.source.issue('parent',parent);f.stop(code);
  expect(()=>f.source.consume(ack,'parent',f.context)).toThrow(code);
  f.stop(null);expect(()=>f.source.consume(ack,'parent',f.context)).toThrow(code);
  expect(f.source.inspect()).toMatchObject({parent_consumptions:0,primary:{code}});
});
it('retains the first refusal when a guard reenters consumption',()=>{
  const context=binding();let armed=false,ack:object,source:ReturnType<ReturnType<typeof createDevelopmentSourceRealm>['create']>;
  source=createDevelopmentSourceRealm().create(context,target,()=>{
    if(armed){armed=false;try{source.consume(ack,'parent',context);}catch{/* original caller observes sticky failure */}}
    return null;
  });
  source.prepare(context);source.ready(context);ack=source.issue('parent',parent);armed=true;
  expect(()=>source.consume(ack,'parent',context)).toThrow('internal_review_error');
  expect(source.inspect()).toMatchObject({parent_consumptions:0,primary:{code:'evidence_binding_mismatch'}});
});
it('refuses the post-guard stop before accepting the parent',()=>{
  const context=binding();let checks=0,armed=false;
  const source=createDevelopmentSourceRealm().create(context,target,()=>armed&&++checks===2?'cancelled':null);
  source.prepare(context);source.ready(context);const ack=source.issue('parent',parent);armed=true;
  expect(()=>source.consume(ack,'parent',context)).toThrow('cancelled');
  expect(source.inspect().parent_consumptions).toBe(0);
});
it('rejects issuance and consumption after revoke, and never changes a sealed summary',()=>{
  const f=fixture();f.ready();const ack=f.source.issue('parent',parent);f.source.revoke();f.source.seal();const before=f.source.inspect();
  expect(()=>f.source.consume(ack,'parent',f.context)).toThrow('internal_review_error');
  expect(()=>f.source.issue('parent',parent)).toThrow('internal_review_error');
  f.source.revoke();expect(f.source.inspect()).toEqual(before);expect(Object.isFrozen(before)).toBe(true);
});
it.each([[],Array.from({length:21},()=>({build_name:'Australia'}))].map(rows=>({rows})))('allows bounded release rows of length %# without making a permit',({rows})=>{
  const f=fixture();f.ready();f.source.consume(f.source.issue('parent',parent),'parent',f.context);
  f.source.consume(f.source.issue('release',{result:rows}),'release',f.context);
  expect(f.source.inspect()).toMatchObject({release_consumptions:1,permissions:{release_permit:false,formal_issuance:false,fallback:false}});
});
it.each([null,{}, {result:Array.from({length:22},()=>({build_name:'Australia'}))},{result:[{build_name:42}]}])('rejects an invalid release envelope %#',value=>{
  const f=fixture();f.ready();f.source.consume(f.source.issue('parent',parent),'parent',f.context);
  expect(()=>f.source.issue('release',value)).toThrow('invalid_response');expect(f.source.inspect().release_consumptions).toBe(0);
});
it('isolates real-class source, accounting and admission while development source values are accepted',async()=>{
  const oauth={clientId:'',clientSecret:''};
  const real=new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'same',oauth});
  const other=new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'other',oauth});
  const before={construction:real.constructionStatus(),budget:real.stats(),primary:real.reviewRunStatus().primary};
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('PRIVATE_NETWORK');});
  try{
    const result=await createDevelopmentRoot().run({principal:'same',source:{target,parent,release:{result:[]}}});
    expect(result.ok).toBe(true);expect(result.budget).toEqual({requests:0,received_bytes:0,payload_bytes:0});
    expect({construction:real.constructionStatus(),budget:real.stats(),primary:real.reviewRunStatus().primary}).toEqual(before);
    expect(()=>new BoundedReadSession({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'third',oauth})).toThrow('review_busy');
    expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore();real.close();other.close();}
});
it('rejects profile accessors, proxies, foreign live objects and excess fields before clock or resource creation',async()=>{
  let reads=0,clocks=0;const root=createDevelopmentRoot({clock:()=>{clocks++;return 0;}});
  const bads=[{target,parent,release:{get result(){reads++;return [];}}},new Proxy({},{}),
    {target,parent,release:{result:[]},consumer:{}},{target,parent:{result:new Date()},release:{result:[]}}];
  for(const source of bads){expect((await root.run({principal:'invalid',source})).code).toBe('invalid_input');expect(root.inspect().active).toBe(0);}
  expect(reads).toBe(0);expect(clocks).toBe(0);
});
it('pins source values before awaiting and revokes on cancellation without exposing values',async()=>{
  let cancel!:()=>void;const waiting=new Promise<void>(resolve=>{cancel=resolve;});
  const controller=new AbortController(),root=createDevelopmentRoot({wait:()=>waiting});
  const result=root.run({principal:'source',source:{target,parent,release:{result:[{build_name:'Australia',private:'PRIVATE_VALUE'}]}}},{signal:controller.signal});
  controller.abort();cancel();const summary=await result;
  expect(summary).toMatchObject({ok:false,code:'cancelled',run_primary:{code:'cancelled'},construction:{primary:null},source:{state:'closed',sealed:true}});
  expect(JSON.stringify(summary)).not.toContain('PRIVATE_VALUE');expect(root.inspect().registered).toBe(0);
});
it('keeps closed source facts immutable after caller mutation and allows a distinct new run after rejection',async()=>{
  const root=createDevelopmentRoot(),rows=[{build_name:'Australia'}],profile={target,parent:structuredClone(parent),release:{result:rows}};
  const pending=root.run({principal:'same',source:profile});rows[0].build_name='INVALID';profile.parent.result.sys_id='b'.repeat(32);
  const result=await pending;expect(result.ok).toBe(true);const before=JSON.stringify(result);
  rows.length=0;expect(JSON.stringify(result)).toBe(before);expect(Object.isFrozen(result.source)).toBe(true);
  expect((await root.run({principal:'same',source:profile})).code).toBe('invalid_response');
  expect((await root.run({principal:'same',source:{target,parent,release:{result:[]}}})).ok).toBe(true);
});
it('classifies 22 release rows through the assembly like production, as invalid_response',async()=>{
  const root=createDevelopmentRoot(),result=await root.run({principal:'rows',source:{target,parent,release:{result:Array.from({length:22},()=>({build_name:'Australia'}))}}});
  expect(result).toMatchObject({code:'invalid_response',run_primary:{code:'invalid_response'},source:{parent_consumptions:1,release_consumptions:0}});
  expect(root.inspect().active).toBe(0);
});
it.each([Array.from({length:64},()=>({build_name:'Australia'})),[{build_name:'x'.repeat(65537)}]].map(result=>({result})))('pins bounded source shapes before constructing a core %#',async({result})=>{
  const root=createDevelopmentRoot({clock:()=>{throw Error('CLOCK_MUST_NOT_RUN');}});
  expect((await root.run({principal:'bound',source:{target,parent,release:{result}}})).code).toBe('invalid_input');
  expect(root.inspect().active).toBe(0);
});
it('does not revive a lifecycle revoked during a guard callback',()=>{
  const context=binding();let calls=0,source:ReturnType<ReturnType<typeof createDevelopmentSourceRealm>['create']>;
  source=createDevelopmentSourceRealm().create(context,target,()=>{if(++calls===2)source.revoke();return null;});
  expect(()=>source.prepare(context)).toThrow('closed');
  expect(source.inspect()).toMatchObject({state:'closed',ready_generation:0,parent_consumptions:0});
  source.seal();expect(source.inspect()).toMatchObject({state:'closed',sealed:true});
});
it('runs source values only inside a fresh assembly and returns a closed non-executable summary',async()=>{
  const root=createDevelopmentRoot();
  const result=await root.run({principal:'source',source:{target,parent,release:{result:[{build_name:'Australia'}]}}});
  expect(result).toMatchObject({ok:true,scope:'source_values_only',source:{state:'closed',sealed:true,ready_generation:1,parent_consumptions:1,release_consumptions:1},budget:{requests:0,received_bytes:0,payload_bytes:0}});
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
});
