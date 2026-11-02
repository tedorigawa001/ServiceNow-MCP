import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts} from '../support/review/synthetic-soft-recovery.js';
import {createSyntheticPhaseModel} from '../support/review/synthetic-phase-recovery.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z';
function fixture(phase:'metadata'|'payload'|'consistency'='payload',ready=true,verify=false,upper=O){
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:upper};let action:()=>string|undefined=()=>undefined;
  const refs={supervisor:{},worker:{},generation:{}},facts:SyntheticSoftFacts=ready?{kind:'phase_deadline',point:'phase_guard',phase,worker_state:'ready',...refs}:{kind:'phase_deadline',point:'phase_guard',phase,worker_state:'none'};
  const owner=createSyntheticSoftRecoveryIssuer(s,facts,()=>action()),b=owner.bind(s),observation=owner.observe(b,facts),claim=owner.claimRecovery(b,observation);
  const input={source:s.source,budget:s.budget,release:s.release,origin:s.origin,window:{},verify:verify?{}:null,
    accounting:{requests:10,received_bytes:20,payload_bytes:30},rows:[] as string[],completed:[] as unknown[],inputs:[] as unknown[],
    collection_status:'complete',consistency:'unverified',initial_worker:ready?null:{supervisor:{},worker:{},generation:{}}};
  return {s,refs,owner,b,claim,input,facts,arm:(fn:()=>string|undefined)=>{action=fn;},prepare:()=>owner.preparePhase(b,claim,input)};
}
type F=ReturnType<typeof fixture>;
const ok=(changed=false)=>({kind:'success',changed});
const error=(code:string)=>({kind:'failure',type:'bounded',code});
function verifySuccess(f:F,p:object,parentChanged=false,metadataChanged=false){
  for(const [role,changed] of [['parent',parentChanged],['metadata',metadataChanged]] as const){const a=f.owner.phaseAttempt(f.b,p,role)!;f.owner.phaseOutcome(f.b,p,a,ok(changed));}
}
function finish(f:F,p:object){const w=f.owner.phaseWorker(f.b,p);if(f.facts.worker_state==='none')f.owner.phaseReady(f.b,p,w,f.input.initial_worker);return f.owner.consumePhase(f.b,p);}
it('prepares the same ready generation from the unconsumed same-owner recovery slot',()=>{
  const f=fixture(),plan=f.prepare();expect(Object.keys(plan)).toEqual([]);
  expect(f.owner.inspect()).toMatchObject({phase:{mode:'reuse_generation',selected:0,verify_required:false},time:{started_at:S,deadline_ms:60000,upper_utc:O}});
});
it('turns selected unfinished rows into deadline not_processed without dropping a retained input time',()=>{
  const f=fixture();f.s.upper_utc='2026-11-02T00:00:02.000Z'; // use a fresh owner for the pinned upper UTC
  const owner=createSyntheticSoftRecoveryIssuer(f.s,f.facts),b=owner.bind(f.s),o=owner.observe(b,f.facts),c=owner.claimRecovery(b,o),id='a'.repeat(32);
  const input={...f.input,rows:[id],inputs:[{receipt:{},update_xml_sys_id:id,retrieved_at:f.s.upper_utc,state:'retained'}]};
  owner.preparePhase(b,c,input);expect(owner.inspect()).toMatchObject({phase:{selected:1,not_processed:1},time:{upper_utc:f.s.upper_utc}});
});
it('projects an existing ready frame into the exact three-field worker identity boundary',()=>{
  const f=fixture();expect(createSyntheticPhaseModel(f.s,f.facts as Extract<SyntheticSoftFacts,{kind:'phase_deadline'}>,f.input).inspect().mode).toBe('reuse_generation');
});
it('charges only the first parent attempt of one required verify, keeping prior C/G/P',()=>{
  const f=fixture('payload',true,true),plan=f.prepare();expect(f.owner.phaseAttempt(f.b,plan,'parent')).not.toBeNull();
  expect(f.owner.inspect()).toMatchObject({phase:{verify_calls:1,attempts:1,accounting:{requests:11,received_bytes:20,payload_bytes:30}}});
});
it('keeps a ready worker unchanged and consumes only a non-executable phase plan',()=>{
  const f=fixture(),plan=f.prepare();f.owner.phaseWorker(f.b,plan);
  expect(f.owner.consumePhase(f.b,plan)).toMatchObject({scope:'synthetic_phase_recovery_plan',mode:'reuse_generation',authority:'none',accounting:{requests:10,received_bytes:20,payload_bytes:30}});
  expect(f.owner.inspect()).toMatchObject({phase:{worker_starts:0,ready_events:0}});
});
it.each(['metadata','payload','consistency'] as const)('matches a separate event oracle for %s and both worker modes',phase=>{
  for(const ready of [false,true])for(const verify of [false,true]){
    const f=fixture(phase,ready,verify),p=f.prepare(),needed=phase!=='consistency'&&verify;
    if(needed)verifySuccess(f,p);const result=finish(f,p);
    expect(result).toMatchObject({mode:ready?'reuse_generation':'initial_start',authority:'none',collection_status:phase==='metadata'?'failed':'complete',accounting:{requests:10+(needed?2:0),received_bytes:20,payload_bytes:30}});
    expect(f.owner.inspect()).toMatchObject({phase:{verify_calls:needed?1:0,attempts:needed?2:0,worker_starts:ready?0:1,ready_events:ready?0:1}});
  }
});
it('does not start even a fake worker before required verify has completed',()=>{
  const f=fixture('payload',false,true),p=f.prepare();expect(()=>f.owner.phaseWorker(f.b,p)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({phase:{worker_starts:0,accounting:{requests:10}}});
});
it.each([false,true])('combines parent and metadata change observations without skipping metadata: %s',changed=>{
  const f=fixture('payload',true,true),p=f.prepare();verifySuccess(f,p,changed,false);const r=finish(f,p);
  expect(r.consistency).toBe(changed?'changed':'stable_observation');expect(r.accounting.requests).toBe(12);if(changed){expect(r.limitations).toContain('changed_during_review');expect(r.errors).toContainEqual({stage:'consistency',code:'changed_during_review'});}
});
it.each(['phase_deadline_exceeded','invalid_response','not_found_or_not_visible','authentication_failed','access_denied','upstream_unavailable','request_budget_exceeded','payload_budget_exceeded','candidate_filter_violation'])('preserves the bounded verify continuation for %s',code=>{
  const f=fixture('payload',true,true),p=f.prepare();let a=f.owner.phaseAttempt(f.b,p,'parent')!;f.owner.phaseOutcome(f.b,p,a,error(code));
  if(code==='upstream_unavailable'){f.owner.phaseRetry(f.b,p);a=f.owner.phaseAttempt(f.b,p,'parent')!;f.owner.phaseOutcome(f.b,p,a,error(code));}
  const mapped=code==='phase_deadline_exceeded'?'deadline_exceeded':code==='invalid_response'?'metadata_unavailable':code,r=finish(f,p);
  expect(r).toMatchObject({consistency:'unverified',accounting:{requests:10+(code==='upstream_unavailable'?2:1),received_bytes:20,payload_bytes:30}});expect(r.errors).toContainEqual({stage:'consistency',code:mapped});expect(r.limitations).toContain('provisional_results');expect(f.owner.inspect().diagnostics.hard).toBeNull();
});
it('accounts at most four physical attempts and two retry waits for one logical verify',()=>{
  const f=fixture('payload',false,true),p=f.prepare();
  for(const role of ['parent','metadata']){let a=f.owner.phaseAttempt(f.b,p,role)!;f.owner.phaseChunk(f.b,p,a,{},3);f.owner.phaseOutcome(f.b,p,a,error('upstream_unavailable'));f.owner.phaseRetry(f.b,p);a=f.owner.phaseAttempt(f.b,p,role)!;f.owner.phaseChunk(f.b,p,a,{},5);f.owner.phaseOutcome(f.b,p,a,ok());}
  expect(f.owner.inspect()).toMatchObject({phase:{verify_calls:1,attempts:4,retry_waits:2,worker_starts:0,accounting:{requests:14,received_bytes:36,payload_bytes:30}}});expect(finish(f,p).consistency).toBe('stable_observation');
});
it.each(['retry_without_failure','attempt_without_wait','retry_twice','parent_twice','metadata_first'] as const)('rejects invalid verify order %s',kind=>{
  const f=fixture('payload',true,true),p=f.prepare();
  expect(()=>{
    if(kind==='retry_without_failure'){f.owner.phaseRetry(f.b,p);return;}
    if(kind==='metadata_first'){f.owner.phaseAttempt(f.b,p,'metadata');return;}
    const a=f.owner.phaseAttempt(f.b,p,'parent')!;f.owner.phaseOutcome(f.b,p,a,kind==='parent_twice'?ok():error('upstream_unavailable'));
    if(kind==='retry_twice'){f.owner.phaseRetry(f.b,p);f.owner.phaseRetry(f.b,p);}else f.owner.phaseAttempt(f.b,p,'parent');
  }).toThrow('internal_review_error');
});
it.each(['receive_budget_exceeded','cancelled','deadline_exceeded','unknown'])('stops rather than continuing verify failure %s',code=>{
  const f=fixture('payload',false,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;expect(()=>f.owner.phaseOutcome(f.b,p,a,error(code))).toThrow(code==='unknown'?'internal_review_error':code);
  expect(f.owner.inspect()).toMatchObject({state:'failed',phase:{worker_starts:0,attempt_pending:false,accounting:{requests:11,received_bytes:20,payload_bytes:30}}});expect(()=>f.owner.phaseWorker(f.b,p)).toThrow();
});
it('does not treat an unexpected exception or getter as a bounded verify error',()=>{
  const f=fixture('payload',true,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;let n=0;const v=Object.defineProperty({},'kind',{get(){n++;throw Error('SECRET');}});
  expect(()=>f.owner.phaseOutcome(f.b,p,a,v)).toThrow('internal_review_error');expect(n).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('keeps current C when quota rejects a final attempt, and still models unverified continuation',()=>{
  const f=fixture('payload',true,true);f.input.accounting.requests=210;const p=f.prepare();expect(f.owner.phaseAttempt(f.b,p,'parent')).toBeNull();
  const r=finish(f,p);expect(r).toMatchObject({consistency:'unverified',accounting:{requests:210}});expect(r.errors).toContainEqual({stage:'consistency',code:'request_budget_exceeded'});
});
it('uses C=209 for a parent dispatch but cannot exceed 210 on metadata',()=>{
  const f=fixture('payload',true,true);f.input.accounting.requests=209;const p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;f.owner.phaseOutcome(f.b,p,a,ok());expect(f.owner.phaseAttempt(f.b,p,'metadata')).toBeNull();expect(finish(f,p).accounting.requests).toBe(210);
});
it('does not charge C when G is already exhausted before a dispatch',()=>{
  const f=fixture('payload',true,true);f.input.accounting.received_bytes=16777216;const p=f.prepare();expect(()=>f.owner.phaseAttempt(f.b,p,'parent')).toThrow('receive_budget_exceeded');expect(f.owner.inspect()).toMatchObject({phase:{accounting:{requests:10,received_bytes:16777216}}});
});
it.each([4194304,4194305])('charges an offending response chunk before refusing size %i',bytes=>{
  const f=fixture('payload',true,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;
  if(bytes===4194304){f.owner.phaseChunk(f.b,p,a,{},bytes);f.owner.phaseOutcome(f.b,p,a,ok());}
  else expect(()=>f.owner.phaseChunk(f.b,p,a,{},bytes)).toThrow('receive_budget_exceeded');expect(f.owner.inspect()).toMatchObject({phase:{accounting:{requests:11,received_bytes:20+bytes,payload_bytes:30}}});
});
it('charges cumulative receive overflow without resetting prefix G/P',()=>{
  const f=fixture('payload',true,true);f.input.accounting.received_bytes=16777215;const p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;expect(()=>f.owner.phaseChunk(f.b,p,a,{},2)).toThrow('receive_budget_exceeded');expect(f.owner.inspect()).toMatchObject({phase:{accounting:{received_bytes:16777217,payload_bytes:30}}});
});
it('refuses chunk replay and attempt replay without double charging',()=>{
  const f=fixture('payload',true,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!,chunk={};f.owner.phaseChunk(f.b,p,a,chunk,4);expect(()=>f.owner.phaseChunk(f.b,p,a,chunk,4)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({phase:{accounting:{received_bytes:24}}});
  const other=fixture('payload',true,true),q=other.prepare(),b=other.owner.phaseAttempt(other.b,q,'parent')!;other.owner.phaseOutcome(other.b,q,b,ok());expect(()=>other.owner.phaseOutcome(other.b,q,b,ok())).toThrow('internal_review_error');expect(other.owner.inspect().phase?.accounting.requests).toBe(11);
});
it.each(['supervisor','worker','generation'] as const)('refuses a foreign initial ready %s and never restarts',key=>{
  const f=fixture('payload',false,false),p=f.prepare(),w=f.owner.phaseWorker(f.b,p);expect(()=>f.owner.phaseReady(f.b,p,w,{...f.input.initial_worker,[key]:{}})).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({phase:{worker_starts:1,ready_events:0}});expect(()=>f.owner.phaseWorker(f.b,p)).toThrow('internal_review_error');
});
it.each(['worker_unavailable','cancelled','deadline_exceeded'])('keeps initial ready failure %s hard',reason=>{
  const f=fixture('payload',false,false),p=f.prepare(),w=f.owner.phaseWorker(f.b,p);expect(()=>f.owner.phaseReadyFailure(f.b,p,w,reason)).toThrow(reason);expect(f.owner.inspect()).toMatchObject({phase:{worker_starts:1,ready_events:0}});
});
it('never accepts a new ready event for an already-ready reused generation',()=>{
  const f=fixture(),p=f.prepare(),w=f.owner.phaseWorker(f.b,p);expect(()=>f.owner.phaseReady(f.b,p,w,f.refs)).toThrow('internal_review_error');expect(f.owner.inspect().phase?.worker_starts).toBe(0);
});
it('refuses premature and duplicate phase consumption',()=>{
  const f=fixture(),p=f.prepare();expect(()=>f.owner.consumePhase(f.b,p)).toThrow('internal_review_error');
  const other=fixture(),q=other.prepare();finish(other,q);expect(()=>other.owner.consumePhase(other.b,q)).toThrow('internal_review_error');
});
it('rejects phase preparation from an already-consumed SR-A data result',()=>{
  const f=fixture();const data=f.owner.consumeRecovery(f.b,f.claim);expect(()=>f.owner.preparePhase(f.b,data,f.input)).toThrow('internal_review_error');
});
it.each(['source','budget','release','origin'] as const)('binds a phase plan to the same %s identity',key=>{
  const f=fixture();f.input[key]={};expect(f.prepare).toThrow('internal_review_error');
});
it.each(['plan','attempt','worker'] as const)('rejects a foreign %s handle without consuming another owner',kind=>{
  const a=fixture('payload',false,true),b=fixture('payload',false,true),p=a.prepare(),q=b.prepare();
  if(kind==='plan')expect(()=>a.owner.phaseAttempt(a.b,q,'parent')).toThrow('internal_review_error');
  if(kind==='attempt'){const own=a.owner.phaseAttempt(a.b,p,'parent')!,foreign=b.owner.phaseAttempt(b.b,q,'parent')!;expect(()=>a.owner.phaseOutcome(a.b,p,foreign,ok())).toThrow('internal_review_error');b.owner.phaseOutcome(b.b,q,foreign,ok());expect(own).toBeDefined();}
  if(kind==='worker'){verifySuccess(a,p);verifySuccess(b,q);a.owner.phaseWorker(a.b,p);const foreign=b.owner.phaseWorker(b.b,q);expect(()=>a.owner.phaseReady(a.b,p,foreign,a.input.initial_worker)).toThrow('internal_review_error');b.owner.phaseReady(b.b,q,foreign,b.input.initial_worker);}
  expect(b.owner.inspect().diagnostics.hard).toBeNull();
});
it('preserves completed states and retained input UTC while classifying unfinished selected ids',()=>{
  const t='2026-11-02T00:00:02.000Z',f=fixture('payload',true,false,t),ids=['a','b','c','d'].map(x=>x.repeat(32));f.input.rows=ids;
  f.input.completed=[{state:'reviewed',update_xml_sys_id:ids[0]},{state:'rejected',update_xml_sys_id:ids[1],reason:'unsupported_action'}];
  f.input.inputs=[{receipt:{},update_xml_sys_id:ids[0],retrieved_at:O,state:'completed'},{receipt:{},update_xml_sys_id:ids[2],retrieved_at:t,state:'retained'}];
  const r=finish(f,f.prepare());expect(r.assets).toEqual([{state:'reviewed',update_xml_sys_id:ids[0]},{state:'rejected',update_xml_sys_id:ids[1],reason:'unsupported_action'},...ids.slice(2).map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}))]);
  expect(r.inputs.map(x=>x.retrieved_at)).toEqual([O,t]);expect(r.inputs.map(x=>x.state)).toEqual(['completed','not_processed']);expect(f.owner.inspect().time?.upper_utc).toBe(t);
});
it.each(['missing','duplicate_row','foreign_done','duplicate_done','duplicate_receipt','reversal','drop_upper','completed_without_done','retained_with_done'] as const)('refuses incoherent selected/input set: %s',kind=>{
  const t='2026-11-02T00:00:02.000Z',f=fixture('payload',true,false,t),id='a'.repeat(32),second='b'.repeat(32),receipt={};f.input.rows=[id,second];
  const row={receipt,update_xml_sys_id:id,retrieved_at:t,state:'retained'};f.input.inputs=[row];
  if(kind==='missing')f.input.rows=[];if(kind==='duplicate_row')f.input.rows=[id,id];if(kind==='foreign_done')f.input.completed=[{state:'rejected',update_xml_sys_id:'c'.repeat(32),reason:'invalid_xml'}];
  if(kind==='duplicate_done')f.input.completed=[{state:'rejected',update_xml_sys_id:second,reason:'invalid_xml'},{state:'rejected',update_xml_sys_id:second,reason:'invalid_xml'}];
  if(kind==='duplicate_receipt')f.input.inputs=[row,{...row,update_xml_sys_id:second}];if(kind==='reversal')f.input.inputs=[row,{...row,receipt:{},update_xml_sys_id:second,retrieved_at:O}];if(kind==='drop_upper')f.input.inputs=[];
  if(kind==='completed_without_done')row.state='completed';if(kind==='retained_with_done')f.input.completed=[{state:'rejected',update_xml_sys_id:id,reason:'invalid_xml'}];expect(f.prepare).toThrow('internal_review_error');
});
it.each([0,100,101])('checks a selected-window size of %i',n=>{
  const f=fixture();f.input.rows=Array.from({length:n},(_,i)=>(i+1).toString(16).padStart(32,'0'));
  if(n===101)expect(f.prepare).toThrow('internal_review_error');else expect(finish(f,f.prepare()).assets.length).toBe(n);
});
it('pins collection data/accounting and initial worker frame before caller mutation',()=>{
  const f=fixture('payload',false,false),original={...f.input.initial_worker!},p=f.prepare();f.input.accounting.requests=209;f.input.rows.push('a'.repeat(32));f.input.initial_worker!.generation={};
  const w=f.owner.phaseWorker(f.b,p);f.owner.phaseReady(f.b,p,w,original);expect(f.owner.consumePhase(f.b,p)).toMatchObject({assets:[],accounting:{requests:10}});
});
it.each(['plan','chunk','outcome','ready'] as const)('refuses getter/proxy injection in %s without reading source or secrets',kind=>{
  const f=fixture('payload',false,kind==='chunk'||kind==='outcome');let calls=0;
  if(kind==='plan'){const raw=new Proxy(f.input,{get(){calls++;throw Error('SECRET');}});expect(()=>f.owner.preparePhase(f.b,f.claim,raw)).toThrow('internal_review_error');}
  else{const p=f.prepare();if(kind==='ready'){const w=f.owner.phaseWorker(f.b,p),raw=Object.defineProperty({...f.input.initial_worker},'worker',{get(){calls++;throw Error('SECRET');}});expect(()=>f.owner.phaseReady(f.b,p,w,raw)).toThrow('internal_review_error');}
    else{const a=f.owner.phaseAttempt(f.b,p,'parent')!,raw=new Proxy({},{get(){calls++;throw Error('SECRET');}});expect(()=>kind==='chunk'?f.owner.phaseChunk(f.b,p,a,raw,5):f.owner.phaseOutcome(f.b,p,a,raw)).toThrow('internal_review_error');}}
  expect(calls).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
function pipeline(f:F){const p=f.prepare(),parent=f.owner.phaseAttempt(f.b,p,'parent')!;f.owner.phaseChunk(f.b,p,parent,{},3);f.owner.phaseOutcome(f.b,p,parent,ok());
  const metadata=f.owner.phaseAttempt(f.b,p,'metadata')!;f.owner.phaseChunk(f.b,p,metadata,{},4);f.owner.phaseOutcome(f.b,p,metadata,ok());const w=f.owner.phaseWorker(f.b,p);f.owner.phaseReady(f.b,p,w,f.input.initial_worker);return f.owner.consumePhase(f.b,p);}
it.each(Array.from({length:20},(_,i)=>i+1))('independent interruption oracle conserves C/G/P at phase guard %i',at=>{
  const f=fixture('payload',false,true);let n=0;f.arm(()=>++n===at?'cancelled':undefined);expect(()=>pipeline(f)).toThrow('cancelled');
  const s=f.owner.inspect(),account=s.phase?.accounting??{requests:10,received_bytes:20,payload_bytes:30};
  expect(account).toEqual({requests:10+(at>=4?1:0)+(at>=10?1:0),received_bytes:20+(at>=6?3:0)+(at>=12?4:0),payload_bytes:30});
  expect(s).toMatchObject({state:'failed',diagnostics:{soft:{kind:'phase_deadline'},hard:{code:'cancelled'}}});expect(s.phase?.worker_starts??0).toBe(at>=16?1:0);expect(s.phase?.attempt_pending??false).toBe(false);
});
it('preserves the full phase event count without reset or extra retry/worker operations',()=>{
  const f=fixture('payload',false,true);let n=0;f.arm(()=>{n++;return undefined;});expect(pipeline(f)).toMatchObject({accounting:{requests:12,received_bytes:27,payload_bytes:30}});
  expect(n).toBe(20);expect(f.owner.inspect()).toMatchObject({phase:{verify_calls:1,attempts:2,retry_waits:0,worker_starts:1,ready_events:1}});
});
it.each(['attempt','chunk','outcome','worker','consume'] as const)('rejects otherwise-valid cleanup lease reentry during %s',step=>{
  const f=fixture('payload',true,step!=='worker'&&step!=='consume'),p=f.prepare();let a:object|undefined;
  if(step==='chunk'||step==='outcome')a=f.owner.phaseAttempt(f.b,p,'parent')!;if(step==='consume')f.owner.phaseWorker(f.b,p);
  let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.cleanupLease(f.b);}catch{}}return undefined;});
  expect(()=>step==='attempt'?f.owner.phaseAttempt(f.b,p,'parent'):step==='chunk'?f.owner.phaseChunk(f.b,p,a!,{},5):step==='outcome'?f.owner.phaseOutcome(f.b,p,a!,ok()):step==='worker'?f.owner.phaseWorker(f.b,p):f.owner.consumePhase(f.b,p)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',cleanup_pending:false});
});
it('removes pending attempt before outcome guards and plan handle before consumption guards',()=>{
  const f=fixture('payload',true,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!,seen:boolean[]=[];f.arm(()=>{seen.push(f.owner.inspect().phase?.attempt_pending??false);return undefined;});f.owner.phaseOutcome(f.b,p,a,ok());expect(seen).toEqual([false,false]);
});
it('keeps a verify-time canonical revocation hard and does not create a worker afterwards',()=>{
  const f=fixture('payload',false,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;f.arm(()=>{f.owner.revoke('receive_budget_exceeded');return undefined;});expect(()=>f.owner.phaseOutcome(f.b,p,a,ok())).toThrow('receive_budget_exceeded');expect(f.owner.inspect()).toMatchObject({phase:{worker_starts:0,attempt_pending:false}});
});
it('does not execute methods on verify, budget or worker fixture identities',()=>{
  const f=fixture('payload',false,true);let calls=0;
  for(const obj of [f.s.budget,f.input.verify!,f.input.initial_worker!.worker])Object.defineProperty(obj,'dispatch',{get(){calls++;throw Error('SECRET');}});
  const p=f.prepare();verifySuccess(f,p);finish(f,p);expect(calls).toBe(0);
});
it('keeps the same root UTC/deadline and immutable result after closing the synthetic plan owner',()=>{
  const f=fixture('payload',false,true),p=f.prepare();verifySuccess(f,p);const r=finish(f,p);expect(f.owner.inspect().time).toEqual({started_at:S,deadline_ms:60000,observed_at:O,upper_utc:O});f.owner.close(f.b);
  expect(f.owner.inspect()).toMatchObject({state:'closed',time:null,phase:{disposed:true,attempt_pending:false}});expect(Object.isFrozen(r.assets)).toBe(true);expect(()=>f.owner.consumePhase(f.b,p)).toThrow('internal_review_error');expect(r.accounting.requests).toBe(12);
});
it.each([NaN,-1,1.5,16777218])('rejects a malformed chunk size %s without a receive charge',size=>{
  const f=fixture('payload',true,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;expect(()=>f.owner.phaseChunk(f.b,p,a,{},size)).toThrow('internal_review_error');expect(f.owner.inspect().phase?.accounting.received_bytes).toBe(20);
});
it.each(['requests','received_bytes','payload_bytes'] as const)('refuses an out-of-range prior accounting %s',key=>{
  const f=fixture();f.input.accounting[key]=key==='requests'?211:key==='received_bytes'?16777217:8388609;expect(f.prepare).toThrow('internal_review_error');
});
it.each(['pending','retry_wait','waiting_ready'] as const)('does not disguise an in-flight %s as normal close',stage=>{
  const f=fixture('payload',false,stage!=='waiting_ready'),p=f.prepare();if(stage==='waiting_ready')f.owner.phaseWorker(f.b,p);
  else{const a=f.owner.phaseAttempt(f.b,p,'parent')!;if(stage==='retry_wait')f.owner.phaseOutcome(f.b,p,a,error('upstream_unavailable'));}
  expect(()=>f.owner.close(f.b)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',phase:{disposed:true,attempt_pending:false}});
});
it.each([
  ['a non-bounded failure',{kind:'failure',type:'unexpected',code:'access_denied'}],
  ['a non-boolean change flag',{kind:'success',changed:'no'}],
] as const)('stops instead of continuing verify on %s',(_name,outcome)=>{
  const f=fixture('payload',true,true),p=f.prepare(),a=f.owner.phaseAttempt(f.b,p,'parent')!;expect(()=>f.owner.phaseOutcome(f.b,p,a,outcome)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',diagnostics:{hard:{code:'internal_review_error'}},phase:{worker_starts:0}});
});
it('refuses to prepare a phase plan from a worker-deadline recovery',()=>{
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:O};
  const facts={kind:'worker_deadline',phase:'analysis',input:{},request:{},supervisor:{},point:'analyze_timer',worker:{},generation:{},worker_state:'ready',id:7,job:{}} as SyntheticSoftFacts;
  const owner=createSyntheticSoftRecoveryIssuer(s,facts),b=owner.bind(s),c=owner.claimRecovery(b,owner.observe(b,facts));
  const input={source:s.source,budget:s.budget,release:s.release,origin:s.origin,window:{},verify:null,accounting:{requests:10,received_bytes:20,payload_bytes:30},rows:[],completed:[],inputs:[],collection_status:'complete',consistency:'unverified',initial_worker:null};
  expect(()=>owner.preparePhase(b,c,input)).toThrow('internal_review_error');expect(owner.inspect()).toMatchObject({state:'failed',phase:null});
});
it('refuses a completed reviewed row without an accepted input time',()=>{
  const f=fixture(),id='a'.repeat(32);f.input.rows=[id];f.input.completed=[{state:'reviewed',update_xml_sys_id:id}];expect(f.prepare).toThrow('internal_review_error');
});
// Plan references compare by ===, so primitives or proxies would not be opaque identities.
it.each(['window','verify','receipt'] as const)('rejects a %s reference given as a string or proxy',key=>{
  for(const value of ['identity-7',new Proxy({},{})]){
    const t='2026-11-02T00:00:02.000Z',f=fixture('payload',true,true,key==='receipt'?t:O);
    if(key==='receipt'){const id='a'.repeat(32);f.input.rows=[id];f.input.inputs=[{receipt:value,update_xml_sys_id:id,retrieved_at:t,state:'retained'}];}
    else Object.assign(f.input,{[key]:value});
    expect(f.prepare).toThrow('internal_review_error');
  }
});
it('refuses an initial-start frame for a reused ready generation',()=>{
  const f=fixture();f.input.initial_worker={supervisor:{},worker:{},generation:{}};expect(f.prepare).toThrow('internal_review_error');
});
it('fixes an unexpected initial ready failure reason to an internal error',()=>{
  const f=fixture('payload',false,false),p=f.prepare(),w=f.owner.phaseWorker(f.b,p);expect(()=>f.owner.phaseReadyFailure(f.b,p,w,'access_denied')).toThrow('internal_review_error');
  expect(f.owner.inspect().diagnostics.hard?.code).toBe('internal_review_error');
});
