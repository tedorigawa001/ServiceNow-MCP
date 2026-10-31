import {afterEach,expect,it,vi} from 'vitest';
const control=vi.hoisted(()=>({mode:'save',abort:()=>{},tokens:[] as object[],consumers:[] as {status(t:object):unknown}[],sources:[] as object[],diagnostics:[] as (()=>{primary:{code:string}|null})[]}));
vi.mock('../../src/servicenow/review-evidence-lifecycle.js',async original=>{
 const actual=await original<typeof import('../../src/servicenow/review-evidence-lifecycle.js')>();
 return {...actual,registerReviewEvidenceSession(...args:Parameters<typeof actual.registerReviewEvidenceSession>){
  const owner=actual.registerReviewEvidenceSession(...args);control.diagnostics.push(()=>owner.transportConstructor.diagnostic());
  return control.mode==='fake_ready'?Object.freeze({...owner,markReady:()=>true}):owner;
 }};
});
vi.mock('../../src/review/bounded-source.js',async original=>{
 const actual=await original<typeof import('../../src/review/bounded-source.js')>();
 return {...actual,BoundedUpdateSetSource:class extends actual.BoundedUpdateSetSource{
  constructor(...args:ConstructorParameters<typeof actual.BoundedUpdateSetSource>){
   const creation=args[2];
   if(creation&&control.mode==='constructor_throw')throw Error('PRIVATE_CONSTRUCTOR');
   if(creation)args[2]={...creation,capture:consumer=>{
    control.consumers.push(consumer);
    creation.capture({...consumer,status(token){
     if(control.mode==='cancel_pre')control.abort();
     const result=consumer.status(control.mode==='foreign'?control.tokens[0]:control.mode==='copy'?Object.freeze({...token}):token);
     control.tokens.push(token);
     if(control.mode==='duplicate')consumer.status(token);
     if(control.mode==='cancel_post')control.abort();
     if(control.mode==='cancel_return_gap')queueMicrotask(()=>control.abort());
     return result;
    }});
   }};
   super(...args);control.sources.push(this);
  }
 }};
});
import {BoundedReadSession,type ReadSnapshot} from '../../src/servicenow/bounded-read.js';
import {BoundedUpdateSetSource} from '../../src/review/bounded-source.js';
const id='a'.repeat(32),encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const snap=():ReadSnapshot=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user',perUserBearerToken:'PRIVATE_TOKEN',oauth:{clientId:'unused'}});
const probe=(signal?:AbortSignal)=>BoundedReadSession.probeNewStatusAcceptance(snap(),{update_set_sys_id:id},{signal,synthetic_status:{parent_bytes:encode({result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-31',sys_mod_count:'0'}}),release_status:403,cleanup:'cancelled'}});
afterEach(()=>{control.mode='save';control.abort=()=>{};control.tokens.length=0;control.consumers.length=0;control.sources.length=0;control.diagnostics.length=0;vi.restoreAllMocks();});
it('refuses a terminal from another closed constructor without changing its history',async()=>{
 const first=await probe(),before=JSON.stringify(first);control.mode='foreign';
 await expect(probe()).rejects.toMatchObject({code:'internal_review_error'});
 expect(control.diagnostics.at(-1)!().primary?.code).toBe('evidence_binding_mismatch');
 expect(JSON.stringify(first)).toBe(before);expect(()=>control.consumers[0].status(control.tokens[0])).toThrow('closed');
});
it.each(['copy','duplicate'])('refuses %s consumption before returning any accepted summary',async mode=>{
 control.mode=mode;await expect(probe()).rejects.toMatchObject({code:'internal_review_error'});
 expect(control.diagnostics.at(-1)!().primary?.code).toBe(mode==='duplicate'?'invalid_state':'evidence_binding_mismatch');
 control.mode='save';expect((await probe()).consumptions).toBe(1);
});
it.each(['cancel_pre','cancel_post'])('stops at %s and discards the unpublished result',async mode=>{
 const controller=new AbortController();control.mode=mode;control.abort=()=>controller.abort('PRIVATE_REASON');
 await expect(probe(controller.signal)).rejects.toMatchObject({code:'cancelled'});
 control.mode='save';expect((await probe()).cleanup).toBe('closed');
});
it('cannot reuse the real source consumer after close or recover a permit from its draft',async()=>{
 const r=await probe();expect(()=>control.consumers[0].status(control.tokens[0])).toThrow('closed');
 expect(BoundedUpdateSetSource.releasePortFor(control.sources[0],{} as never,{})).toBeUndefined();
 expect(Object.isFrozen(r)).toBe(true);expect(r.release_permit).toBe('unavailable');expect(r).not.toHaveProperty('terminal');
});
it('maps unexpected private-constructor failure to a fixed internal error and releases admission',async()=>{
 control.mode='constructor_throw';await expect(probe()).rejects.toMatchObject({code:'internal_review_error'});
 expect(control.diagnostics.at(-1)!().primary?.code).toBe('internal_review_error');
 control.mode='save';expect((await probe()).cleanup).toBe('closed');
});
it('does not trust a successful-looking ready hook without the registered ready generation',async()=>{
 control.mode='fake_ready';await expect(probe()).rejects.toMatchObject({code:'internal_review_error'});
});
it('checks revocation after draft construction before publishing acceptance',async()=>{
 const controller=new AbortController(),freeze=Object.freeze;
 vi.spyOn(Object,'freeze').mockImplementation((value:unknown)=>{
  if(value&&typeof value==='object'&&'state' in value&&value.state==='status_accepted_closed_gate')controller.abort('PRIVATE_REASON');
  return freeze(value);
 });
 await expect(probe(controller.signal)).rejects.toMatchObject({code:'cancelled'});
 expect(control.diagnostics.at(-1)!().primary?.code).toBe('cancelled');
});
it('does not publish a result cancelled between the private return and the outer close',async()=>{
 const controller=new AbortController();control.mode='cancel_return_gap';control.abort=()=>controller.abort('PRIVATE_REASON');
 await expect(probe(controller.signal)).rejects.toMatchObject({code:'cancelled'});
});
it('checks the original attempt floor again after draft construction',async()=>{
 let elapsed=0;vi.spyOn(performance,'now').mockImplementation(()=>elapsed);const freeze=Object.freeze;
 vi.spyOn(Object,'freeze').mockImplementation((value:unknown)=>{
  if(value&&typeof value==='object'&&'state' in value&&value.state==='status_accepted_closed_gate')elapsed=10000;
  return freeze(value);
 });
 await expect(probe()).rejects.toMatchObject({code:'upstream_unavailable'});
});
