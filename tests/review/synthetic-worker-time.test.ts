import {expect,it} from 'vitest';
import {createSyntheticWorkerTimeIssuer} from '../support/review/synthetic-worker-time.js';
import type {SyntheticJobBinding} from '../support/review/synthetic-worker-job.js';
const S='2026-11-01T00:00:00.000Z',O='2026-11-01T00:00:01.000Z',T='2026-11-01T00:00:02.000Z',asset='b'.repeat(32);
const seed=():SyntheticJobBinding=>Object.freeze({run:{},session:{},source:{},key:{},origin:{},budget:{},update_set_sys_id:'a'.repeat(32),started_at:S,deadline_ms:60000,observed_at:O});
const expected=()=>({record_updated_at:'2026-10-31T00:00:00Z',instance_binding:'d'.repeat(64),
  instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},
  requested_rule_ids:['AU-BR-001','AU-BR-002'],release_limitations:['release_visible_nodes_only']});
const outcome=(time=T,target=asset)=>({state:'reviewed',update_xml_sys_id:target,applicable_rule_ids:['AU-BR-002','AU-BR-001'],result:{
  reviewed_at:time,target:{update_set_id:'a'.repeat(32),update_xml_sys_id:target,target_version:'update_set_payload',retrieved_at:time,record_updated_at:expected().record_updated_at},
  instance_binding:expected().instance_binding,instance_release:expected().instance_release,coverage:{requested_rule_ids:['AU-BR-001','AU-BR-002']},limitations:['release_visible_nodes_only','additional_engine_limit']}});
function fixture(){
  const s=seed();let action:()=>string|undefined=()=>undefined;
  const owner=createSyntheticWorkerTimeIssuer(s,()=>action()),b=owner.bind(s),supervisor={},worker={},input=owner.input(b,{},asset,T,expected()),g=owner.startGeneration(b,supervisor,worker);owner.ready(b,g);
  const context={generation:g,supervisor,worker,id:2,kind:'analyze' as const,update_xml_sys_id:asset};
  return {owner,b,g,input,context,job:()=>owner.analyze(b,g,input,2),arm:(fn:()=>string|undefined)=>{action=fn;}};
}
it('accepts the same input time before startup and advances U only once',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);
  owner.input(b,{},asset,T);expect(owner.inspect().upper_utc).toBe(T);
});
it('compares same-receipt expectation and exact UTC before accepting a non-executable candidate',()=>{
  const f=fixture(),job=f.job();expect(f.owner.consumeAnalyze(f.b,job,f.context,outcome())).toEqual({scope:'synthetic_analyze_candidate',state:'reviewed',authority:'none'});
  expect(f.owner.inspect()).toMatchObject({upper_utc:T,analyze_accepted:1,pending:false});
});
// Independent oracle: changes one expected field, never calls the production/schema comparator to predict acceptance.
const changes:readonly [string,(v:ReturnType<typeof outcome>)=>void][]=[
  ['asset',v=>{v.update_xml_sys_id='c'.repeat(32);}],['nested asset',v=>{v.result.target.update_xml_sys_id='c'.repeat(32);}],
  ['update set',v=>{v.result.target.update_set_id='c'.repeat(32);}],['version',v=>{v.result.target.target_version='current_record';}],
  ['reviewed UTC -1ms',v=>{v.result.reviewed_at='2026-11-01T00:00:01.999Z';}],['retrieved UTC +1ms',v=>{v.result.target.retrieved_at='2026-11-01T00:00:02.001Z';}],
  ['equivalent but different UTC string',v=>{v.result.reviewed_at='2026-11-01T00:00:02Z';}],
  ['record UTC',v=>{v.result.target.record_updated_at=S;}],['binding',v=>{v.result.instance_binding='e'.repeat(64);}],
  ['release',v=>{v.result.instance_release.raw_buildname='Utah';}],['requested rules',v=>{v.result.coverage.requested_rule_ids=['AU-BR-001'];}],
  ['applicable rules',v=>{v.applicable_rule_ids=['AU-BR-001'];}],['duplicate rules',v=>{v.applicable_rule_ids=['AU-BR-001','AU-BR-001'];}],
  ['required limitation',v=>{v.result.limitations=[];}],['state',v=>{v.state='not_processed';}],
];
it.each(changes)('independent mismatch oracle stops on %s and keeps U',(_name,change)=>{
  const f=fixture(),job=f.job(),v=outcome();change(v);
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,v)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',upper_utc:T,pending:false,analyze_accepted:0,inputs_retained:0});
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,outcome())).toThrow('internal_review_error');
});
it.each(['rejected','result_omitted'] as const)('retains accepted U for %s without inventing result timestamps',state=>{
  const f=fixture(),job=f.job();expect(f.owner.consumeAnalyze(f.b,job,f.context,{state,update_xml_sys_id:asset,reason:state==='rejected'?'invalid_xml':'response_limit'})).toMatchObject({state,authority:'none'});
  expect(f.owner.inspect().upper_utc).toBe(T);
});
it.each(['startup','send'] as const)('keeps U and fixed first diagnostic after %s failure, forbids retry, then discards terminal UTC',phase=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s),input=owner.input(b,{},asset,T,expected()),g=owner.startGeneration(b,{},{});
  if(phase==='startup')expect(()=>owner.startupFailure(b,g,'worker_unavailable')).toThrow('worker_unavailable');
  else{owner.ready(b,g);const j=owner.analyze(b,g,input,2);expect(()=>owner.sendFailure(b,j,'worker_unavailable')).toThrow('worker_unavailable');}
  owner.revoke('cancelled');expect(owner.inspect()).toMatchObject({state:'failed',upper_utc:T,held_time:{started_at:S,deadline_ms:60000,observed_at:O},inputs_retained:0,pending:false,diagnostic:{code:'worker_unavailable'}});
  expect(()=>owner.startGeneration(b,{},{})).toThrow('worker_unavailable');owner.discardTerminalTime();expect(owner.inspect()).toMatchObject({upper_utc:null,held_time:null,state:'failed'});
});
it.each(Array.from({length:5},(_,i)=>i+1))('does not advance U at input guard %i',at=>{
  const s=seed();let n=0,armed=false;const owner=createSyntheticWorkerTimeIssuer(s,()=>armed&&++n===at?'deadline_exceeded':undefined),b=owner.bind(s);
  armed=true;expect(()=>owner.input(b,{},asset,T,expected())).toThrow('deadline_exceeded');expect(owner.inspect()).toMatchObject({upper_utc:O,state:'failed'});
});
it.each(Array.from({length:6},(_,i)=>i+1))('refuses an analyze candidate at response guard %i',at=>{
  const f=fixture(),job=f.job();let n=0;f.arm(()=>++n===at?'cancelled':undefined);
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,outcome())).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({state:'failed',upper_utc:T,analyze_accepted:0});
});
it('lets cancellation at the comparison post-guard win over invalid values',()=>{
  const f=fixture(),job=f.job();let n=0;f.arm(()=>++n===5?'deadline_exceeded':undefined);
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,{})).toThrow('deadline_exceeded');
});
it.each(['generation','supervisor','worker','id','kind','update_xml_sys_id'] as const)('refuses a mixed response context %s',key=>{
  const f=fixture(),job=f.job(),context={...f.context,[key]:key==='id'?3:key==='kind'?'finish':key==='update_xml_sys_id'?'c'.repeat(32):{}};
  expect(()=>f.owner.consumeAnalyze(f.b,job,context,outcome())).toThrow('internal_review_error');
});
it('spends the same input and response exactly once',()=>{
  const f=fixture(),job=f.job();f.owner.consumeAnalyze(f.b,job,f.context,outcome());
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,outcome())).toThrow('internal_review_error');
  const other=fixture();other.job();expect(()=>other.job()).toThrow('internal_review_error');
});
it('pins input expectation without retaining caller mutations and ignores unrelated result contents',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s),e=expected(),input=owner.input(b,{},asset,T,e),supervisor={},worker={},g=owner.startGeneration(b,supervisor,worker);owner.ready(b,g);
  e.requested_rule_ids.length=0;e.instance_release.raw_buildname='changed';
  const v=outcome();let calls=0;Object.defineProperty(v.result,'findings',{get(){calls++;throw Error('SECRET');}});
  expect(owner.consumeAnalyze(b,owner.analyze(b,g,input,2),{generation:g,supervisor,worker,id:2,kind:'analyze',update_xml_sys_id:asset},v).state).toBe('reviewed');expect(calls).toBe(0);
});
it.each(['accessor','proxy'] as const)('rejects %s result context without executing caller code',kind=>{
  const f=fixture(),job=f.job();let calls=0;const v=outcome();
  const raw=kind==='proxy'?new Proxy(v,{get(){calls++;throw Error('SECRET');}}):Object.defineProperty(v.result,'reviewed_at',{get(){calls++;throw Error('SECRET');}})&&v;
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,raw)).toThrow('internal_review_error');expect(calls).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('rejects caught reentry that would otherwise accept an additional input',()=>{
  const f=fixture(),job=f.job();let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.input(f.b,{},'c'.repeat(32),T,expected());}catch{}}return undefined;});
  expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,outcome())).toThrow('internal_review_error');expect(f.owner.inspect().analyze_accepted).toBe(0);
});
it('accepts an issued response after normal source cleanup but issues no new job',()=>{
  const f=fixture(),job=f.job();f.owner.closeSource(f.b);f.owner.consumeAnalyze(f.b,job,f.context,outcome());
  f.owner.closeGeneration(f.b,f.g);f.owner.confirmClosed(f.b,f.g);f.owner.close(f.b);
  expect(f.owner.inspect()).toMatchObject({state:'closed',upper_utc:null,held_time:null,diagnostic:null});
});
it('matches an independent 100-input nondecreasing UTC transcript with no sampling or extra jobs',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s),supervisor={},worker={},g=owner.startGeneration(b,supervisor,worker);owner.ready(b,g);
  let oracle=Date.parse(O);
  for(let i=0;i<100;i++){
    const time=new Date(Date.parse(O)+i*500).toISOString(),target=(i+1).toString(16).padStart(32,'0'),input=owner.input(b,{},target,time,expected());oracle=Math.max(oracle,Date.parse(time));
    const j=owner.analyze(b,g,input,i+1);owner.consumeAnalyze(b,j,{generation:g,supervisor,worker,id:i+1,kind:'analyze',update_xml_sys_id:target},outcome(time,target));
    expect(owner.inspect().upper_utc).toBe(new Date(oracle).toISOString());
  }
  expect(owner.inspect()).toMatchObject({analyze_accepted:100,inputs_retained:0,pending:false,permissions:{dispatch:false,formal_issuance:false}});
});
it('rejects a seed change made in the last input guard without publishing U',()=>{
  const s={...seed()};let armed=false,n=0;
  const owner=createSyntheticWorkerTimeIssuer(s,()=>{if(armed&&++n===5)s.source={};return undefined;}),b=owner.bind(s);
  armed=true;expect(()=>owner.input(b,{},asset,T,expected())).toThrow('internal_review_error');expect(owner.inspect().upper_utc).toBe(O);
});
it('refuses a later receipt below U, stops, and retains the last accepted time',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);
  owner.input(b,{},asset,T);
  expect(()=>owner.input(b,{},'c'.repeat(32),O)).toThrow('internal_review_error');
  expect(owner.inspect()).toMatchObject({state:'failed',upper_utc:T});
});
it('does not publish U when the last input post-guard cancels',()=>{
  const s=seed();let armed=false,n=0;
  const owner=createSyntheticWorkerTimeIssuer(s,()=>armed&&++n===5?'cancelled':undefined),b=owner.bind(s);
  armed=true;expect(()=>owner.input(b,{},asset,T)).toThrow('cancelled');
  expect(owner.inspect()).toMatchObject({upper_utc:O,state:'failed',inputs_retained:0});
});
it.each([O,'2026-11-01T00:01:00.000Z'])('accepts the equality boundary %s without changing S or L',time=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);owner.input(b,{},asset,time,expected());
  expect(owner.inspect()).toMatchObject({upper_utc:time,held_time:{started_at:S,deadline_ms:60000,observed_at:O}});
});
it.each(['2026-11-01T00:00:00.999Z','2026-11-01T00:01:00.001Z','invalid'])('refuses UTC boundary %s',time=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);expect(()=>owner.input(b,{},asset,time,expected())).toThrow('internal_review_error');expect(owner.inspect().upper_utc).toBe(O);
});
it('retains O for the zero-input/empty-observation case without manufacturing T or E',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);expect(owner.inspect()).toMatchObject({upper_utc:O,analyze_accepted:0});
  owner.revoke('cancelled');expect(owner.inspect().upper_utc).toBe(O);expect(()=>owner.input(b,{},asset,T,expected())).toThrow('cancelled');
});
it.each(['throw','reject'] as const)('retains accepted T after a synthetic send %s with no exception text disclosure',async mode=>{
  const f=fixture(),job=f.job(),secret=Error('SECRET_TOKEN_AND_SOURCE');
  try{if(mode==='throw')throw secret;await Promise.reject(secret);}catch(error){expect(()=>f.owner.sendFailure(f.b,job,error)).toThrow('internal_review_error');}
  expect(f.owner.inspect()).toMatchObject({state:'failed',upper_utc:T,pending:false,diagnostic:{phase:'send_failure'}});expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it.each(['input','job'] as const)('refuses a foreign %s without consuming the other owner',kind=>{
  const a=fixture(),b=fixture(),job=a.job();
  expect(()=>kind==='input'?a.owner.analyze(a.b,a.g,b.input,3):a.owner.consumeAnalyze(a.b,b.job(),a.context,outcome())).toThrow('internal_review_error');
  const otherJob=kind==='input'?b.job():undefined;
  if(otherJob)b.owner.consumeAnalyze(b.b,otherJob,b.context,outcome());expect(b.owner.inspect().state).toBe('active');expect(job).toBeDefined();
});
it('retains the stop diagnostic when a delayed response arrives after revocation',()=>{
  const f=fixture(),job=f.job();f.owner.revoke('cancelled');expect(()=>f.owner.consumeAnalyze(f.b,job,f.context,outcome())).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({upper_utc:T,analyze_accepted:0,diagnostic:{code:'cancelled'}});
});
it('rejects a proxy expectation without running traps and never accepts its T',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);let calls=0;
  expect(()=>owner.input(b,{},asset,T,new Proxy(expected(),{get(){calls++;throw Error();}}))).toThrow('internal_review_error');expect(calls).toBe(0);expect(owner.inspect().upper_utc).toBe(O);
});
it('removes the wrapper pending slot before any response guard can observe it',()=>{
  const f=fixture(),job=f.job(),seen:boolean[]=[];f.arm(()=>{seen.push(f.owner.inspect().pending);return undefined;});
  f.owner.consumeAnalyze(f.b,job,f.context,outcome());expect(seen).toEqual([false,false,false,false,false,false]);
});
// A time-only receipt would otherwise accept rejected/omitted replies without any same-input expectation.
it('refuses an analyze job for a time-only receipt before issuing a claim',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s),input=owner.input(b,{},asset,T),g=owner.startGeneration(b,{},{});owner.ready(b,g);
  expect(()=>owner.analyze(b,g,input,2)).toThrow('internal_review_error');
  expect(owner.inspect()).toMatchObject({state:'failed',pending:false,inputs_retained:0,upper_utc:T,diagnostic:{code:'internal_review_error',phase:'analyze'}});
});
it('refuses terminal UTC discard on an active or normally closed owner',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);owner.input(b,{},asset,T);
  expect(()=>owner.discardTerminalTime()).toThrow('internal_review_error');
  expect(owner.inspect()).toMatchObject({state:'failed',upper_utc:T,held_time:{started_at:S,deadline_ms:60000,observed_at:O},diagnostic:{phase:'discard'}});
  const f=fixture();f.owner.consumeAnalyze(f.b,f.job(),f.context,outcome());f.owner.closeGeneration(f.b,f.g);f.owner.confirmClosed(f.b,f.g);f.owner.close(f.b);
  expect(()=>f.owner.discardTerminalTime()).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'closed',upper_utc:null,held_time:null,diagnostic:null});
});
it('refuses a startup failure for a ready generation',()=>{
  const f=fixture();expect(()=>f.owner.startupFailure(f.b,f.g,'worker_unavailable')).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',upper_utc:T,pending:false,diagnostic:{code:'internal_review_error',phase:'startup_failure'}});
});
it('does not treat an omitted binding as constructor permission on a failure event',()=>{
  const s=seed(),owner=createSyntheticWorkerTimeIssuer(s),b=owner.bind(s);owner.input(b,{},asset,T,expected());const g=owner.startGeneration(b,{},{});
  expect(()=>owner.startupFailure(undefined as unknown as object,g,'cancelled')).toThrow('internal_review_error');
});
