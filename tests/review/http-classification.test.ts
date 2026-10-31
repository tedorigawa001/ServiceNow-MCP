import {expect,it} from 'vitest';
import {classifyHttpObservation} from '../../src/review/abort-scope-evidence-http-classification.js';
import {httpClassificationOracleCases} from './fixtures/http-classification-oracle.js';
it('describes release 403 without authorizing fallback, retry or body acknowledgement',()=>{
 expect(classifyHttpObservation({purpose:'release',status:403,body_present:false})).toEqual({
  ok:true,kind:'classification_only',model_id:'br006-http-classification-v1',observation_source:'unverified_input',
  observation:{purpose:'release',status:403,body_present:false},
  legacy:{category:'terminal_error',code:'access_denied',body:'none',release:'candidate'},
  proposal:{category:'release_unavailable_candidate',code:'access_denied',body:'none',approvals:['A01','A02']},
  permissions:{dispatch:false,read_body:false,retry:false,fallback:false,body_ack:false,release_permit:false,formal_issuance:false},
 });
});
it.each(httpClassificationOracleCases())('matches table oracle $purpose/$status/$body_present',({purpose,status,body_present,expected})=>{
 const result=classifyHttpObservation({purpose,status,body_present});expect(result.ok).toBe(true);
 if(!result.ok)throw Error('Expected classification');
 expect({legacy:result.legacy,proposal:result.proposal}).toEqual(expected);
 expect(Object.values(result.permissions)).toEqual([false,false,false,false,false,false,false]);
 expect(result.observation).toEqual({purpose,status,body_present});
});
it('keeps 200 with a body as only a schema/ack candidate, never an acceptance',()=>{
 expect(classifyHttpObservation({purpose:'parent',status:200,body_present:true})).toMatchObject({ok:true,legacy:{category:'json_candidate',code:null,body:'json',release:'none'},proposal:{category:'body_candidate',code:null,body:'json_candidate',approvals:[]},permissions:{body_ack:false,release_permit:false}});
});
it('requires the independent table to cover every finite tuple exactly once',()=>{
 const cases=httpClassificationOracleCases();expect(cases).toHaveLength(3000);
 expect(new Set(cases.map(r=>[r.purpose,r.status,r.body_present].join('/'))).size).toBe(3000);
 for(const p of ['authentication','parent','release'])for(const b of [false,true])expect(cases.filter(r=>r.purpose===p&&r.body_present===b)).toHaveLength(500);
});
const valid={purpose:'parent',status:200,body_present:true};
const badInputs:[string,unknown][]=[
 ['null',null],['undefined',undefined],['string','PRIVATE_INPUT'],['number',200],['function',()=>{}],['array',[]],
 ['missing purpose',{status:200,body_present:true}],['missing status',{purpose:'parent',body_present:true}],['missing body',{purpose:'parent',status:200}],
 ['unknown purpose',{...valid,purpose:'metadata'}],['empty purpose',{...valid,purpose:''}],['purpose object',{...valid,purpose:{}}],
 ...[0,99,600,NaN,Infinity,-Infinity,200.5,'200',null,undefined,200n,new Number(200)].map(n=>['invalid status '+typeof n,{...valid,status:n}] as [string,unknown]),
 ...[0,1,'false',null,undefined,{},new Boolean(false)].map(b=>['invalid body '+typeof b,{...valid,body_present:b}] as [string,unknown]),
 ['approval injection',{...valid,approvals:['A01']}],['activation injection',{...valid,enabled:true}],['body injection',{...valid,body:'PRIVATE_BODY'}],
 ['symbol key',{...valid,[Symbol('hidden')]:true}],['custom prototype',Object.assign(Object.create({}),valid)],
];
it.each(badInputs)('refuses %s without echoing data or granting authority',(_name,input)=>{
 const r=classifyHttpObservation(input);expect(r).toMatchObject({ok:false,code:'invalid_input',kind:'classification_only',observation_source:'unverified_input'});
 expect(r).not.toHaveProperty('observation');expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(Object.values(r.permissions)).toEqual([false,false,false,false,false,false,false]);expect(Object.isFrozen(r)).toBe(true);
});
it.each(['purpose','status','body_present'])('does not read an accessor %s',key=>{
 let calls=0;const raw={...valid};Object.defineProperty(raw,key,{enumerable:true,get(){calls++;throw Error('PRIVATE_GETTER');}});
 expect(classifyHttpObservation(raw)).toMatchObject({ok:false,code:'invalid_input'});expect(calls).toBe(0);
});
it('refuses proxy and revoked proxy inputs without invoking traps',()=>{
 let calls=0;const proxy=new Proxy(valid,{ownKeys(){calls++;throw Error('PRIVATE');},getPrototypeOf(){calls++;throw Error('PRIVATE');}}),revoked=Proxy.revocable(valid,{});revoked.revoke();
 for(const raw of [proxy,revoked.proxy])expect(classifyHttpObservation(raw)).toMatchObject({ok:false,code:'invalid_input'});expect(calls).toBe(0);
});
it('accepts null-prototype data without changing the input',()=>{
 const raw=Object.assign(Object.create(null),valid);expect(classifyHttpObservation(raw)).toMatchObject({ok:true,observation:valid});expect(Object.getPrototypeOf(raw)).toBeNull();expect(Object.keys(raw)).toHaveLength(3);
});
it('returns immutable descriptive copies, and never grants permission after attempted mutation',()=>{
 const input={purpose:'release',status:403,body_present:false},r=classifyHttpObservation(input);if(!r.ok)throw Error('classification');
 for(const object of [r,r.observation,r.legacy,r.proposal,r.proposal.approvals,r.permissions])expect(Object.isFrozen(object)).toBe(true);
 expect(Reflect.set(r.permissions,'fallback',true)).toBe(false);expect(Reflect.set(r.proposal.approvals,'0','approved')).toBe(false);
 input.status=200;expect(r.observation.status).toBe(403);expect(classifyHttpObservation(r)).toMatchObject({ok:false,code:'invalid_input'});
 expect(classifyHttpObservation({purpose:'release',status:403,body_present:false})).toEqual(r);
});
it('distinguishes a legacy missing-body refusal from an unapproved retry proposal',()=>{
 expect(classifyHttpObservation({purpose:'release',status:503,body_present:false})).toMatchObject({legacy:{category:'invalid_response',code:'invalid_response',release:'none'},proposal:{category:'retry_status_candidate',code:'upstream_unavailable',approvals:['A01','A03','A04','A05']},permissions:{retry:false,fallback:false}});
});
it('does not infer a native Response or normalize a declared body from status alone',()=>{
 expect(classifyHttpObservation({purpose:'parent',status:204,body_present:true})).toMatchObject({observation:{body_present:true},legacy:{category:'json_candidate'},proposal:{category:'unsupported_status'},permissions:{body_ack:false}});
});
