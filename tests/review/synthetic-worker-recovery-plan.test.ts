import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts} from '../support/review/synthetic-soft-recovery.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(options:{collection?:'complete'|'failed';consistency?:'stable_observation'|'changed'|'unverified';verify?:'changed'|'success'|'invalid_response'|'phase_deadline_exceeded';rows?:number}={}){
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U};
  const facts={kind:'worker_deadline',phase:'analysis',point:'analyze_timer',worker_state:'ready',supervisor:{},request:{},input:{},worker:{},generation:{},job:{},id:7} as const satisfies SyntheticSoftFacts;
  let check:()=>string|undefined=()=>undefined;const owner=createSyntheticSoftRecoveryIssuer(seed,facts,()=>check()),b=owner.bind(seed),r=owner.claimRecovery(b,owner.observe(b,facts));
  const proof=owner.settleWorkerClosure(b,owner.beginWorkerClosure(b,r),{context:facts,termination:'confirmed',cleanup:'complete'});
  const raw={source:seed.source,budget:seed.budget,release:seed.release,origin:seed.origin,window:{},verify:null as object|null,accounting:{requests:10,received_bytes:20,payload_bytes:30},rows:[id(1),id(2),id(3)],completed:[{state:'reviewed',update_xml_sys_id:id(1)},{state:'rejected',update_xml_sys_id:id(2),reason:'invalid_xml'}],inputs:[{receipt:{},update_xml_sys_id:id(1),retrieved_at:O,state:'completed'},{receipt:facts.input,update_xml_sys_id:id(3),retrieved_at:U,state:'retained'}],collection_status:'complete',consistency:'unverified'};
  raw.collection_status=options.collection??'complete';raw.consistency=options.consistency??'unverified';
  if(options.rows!==undefined){raw.rows=Array.from({length:options.rows},(_,i)=>id(i+1));raw.completed=options.rows===1?[]:raw.completed;raw.inputs=options.rows===1?[{receipt:facts.input,update_xml_sys_id:id(1),retrieved_at:U,state:'retained'}]:[{receipt:{},update_xml_sys_id:id(1),retrieved_at:O,state:'completed'},{receipt:facts.input,update_xml_sys_id:id(options.rows),retrieved_at:U,state:'retained'}];}
  if(options.verify)raw.verify={};
  const p=owner.prepareWorkerRecovery(b,proof,raw);owner.beginWorkerVerify(b,p);
  if(options.verify){const a=owner.workerVerifyAttempt(b,p,'parent')!;if(options.verify==='success'||options.verify==='changed'){owner.workerVerifyOutcome(b,p,a,{kind:'success',changed:options.verify==='changed'});const m=owner.workerVerifyAttempt(b,p,'metadata')!;owner.workerVerifyOutcome(b,p,m,{kind:'success',changed:false});}else owner.workerVerifyOutcome(b,p,a,{kind:'failure',type:'bounded',code:options.verify});}
  const ticket=owner.claimWorkerGeneration(b,p),lease=owner.startWorkerGeneration(b,ticket.start),event=owner.issueWorkerGenerationReady(b,lease),ready=owner.acceptWorkerGenerationReady(b,lease,event);
  return {owner,b,seed,raw,p,ready,ticket,lease,event,arm:(fn:()=>string|undefined)=>{check=fn;},seal:()=>owner.sealWorkerRecoveryPlan(b,ready)};
}
it('seals the same new-frame inputs once without executing finish',()=>{
  const f=fixture(),plan=f.seal();expect(Object.keys(plan)).toEqual([]);
  expect(f.owner.inspect()).toMatchObject({state:'plan_sealed',worker_plan:{seal_started:true,seals:1,sealed_pending:true,transferred_pending:false,selected:3,retained_inputs:2,finish_calls:0},new_generation:{starts:1,ready_events:1,cleanup_pending:true}});
});
it('summarizes the frozen set and retained T_i/U as non-executable data, never as receipts',()=>{
  const f=fixture(),summary=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());
  expect(summary).toMatchObject({scope:'synthetic_worker_recovery_plan',authority:'none',mode:'new_generation',assets:[{state:'reviewed',update_xml_sys_id:id(1)},{state:'rejected',update_xml_sys_id:id(2),reason:'invalid_xml'},{state:'not_processed',update_xml_sys_id:id(3),reason:'deadline_exceeded'}],inputs:[{update_xml_sys_id:id(1),retrieved_at:O,state:'completed'},{update_xml_sys_id:id(3),retrieved_at:U,state:'not_processed'}],time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',run_status:'partial'});
  expect(Object.isFrozen(summary)).toBe(true);expect(summary.inputs.some(x=>'receipt' in x)).toBe(false);expect(f.owner.inspect().worker_plan).toMatchObject({sealed_pending:false,summaries:1,transfers:0});
  f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');f.owner.close(f.b);
});
it('moves the same private plan to one receiving slot, then discards only after new cleanup',()=>{
  const f=fixture(),handoff=f.owner.transferWorkerRecoveryPlan(f.b,f.seal());expect(Object.keys(handoff)).toEqual([]);
  expect(f.owner.inspect()).toMatchObject({state:'plan_transferred',worker_plan:{seals:1,transfers:1,summaries:0,sealed_pending:false,transferred_pending:true,finish_calls:0}});
  f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');f.owner.discardTransferredWorkerRecoveryPlan(f.b,handoff);f.owner.close(f.b);expect(f.owner.inspect()).toMatchObject({state:'closed',time:null,worker_plan:{transferred_pending:false}});
});
it.each(['summary','transfer'] as const)('rejects reuse of the seal after %s and retains only diagnostics',branch=>{
  const f=fixture(),plan=f.seal();if(branch==='summary')f.owner.summarizeWorkerRecoveryPlan(f.b,plan);else f.owner.transferWorkerRecoveryPlan(f.b,plan);
  expect(()=>f.owner.transferWorkerRecoveryPlan(f.b,plan)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_plan:{seals:1,transfers:branch==='transfer'?1:0,summaries:branch==='summary'?1:0,sealed_pending:false,transferred_pending:false},new_generation:{cleanup_pending:true}});
  f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');
});
it.each(['summary','transfer','discard_old_ready','seal_old_ready','claim_old_prepare'] as const)('rejects competing branch %s after private transfer',step=>{
  const f=fixture(),plan=f.seal();f.owner.transferWorkerRecoveryPlan(f.b,plan);
  expect(()=>step==='summary'?f.owner.summarizeWorkerRecoveryPlan(f.b,plan):step==='transfer'?f.owner.transferWorkerRecoveryPlan(f.b,plan):step==='discard_old_ready'?f.owner.discardWorkerGeneration(f.b,f.ready):step==='seal_old_ready'?f.seal():f.owner.claimWorkerGeneration(f.b,f.p)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',worker_plan:{transfers:1,summaries:0,finish_calls:0},new_generation:{starts:1,cleanup_pending:true}});
});
it.each(['seal','transfer','discard'] as const)('rejects the non-executable summary as %s input even with copied/edited contents',target=>{
  const f=fixture(),summary=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());
  const forged={...summary,authority:'private',assets:[...summary.assets,{state:'reviewed',update_xml_sys_id:id(99)}],time:{...summary.time,upper_utc:O}};
  expect(()=>target==='seal'?f.owner.sealWorkerRecoveryPlan(f.b,forged):target==='transfer'?f.owner.transferWorkerRecoveryPlan(f.b,forged):f.owner.discardTransferredWorkerRecoveryPlan(f.b,forged)).toThrow('internal_review_error');expect(f.owner.inspect().worker_plan).toMatchObject({seals:1,summaries:1,transfers:0,finish_calls:0});
});
it.each(['binding','ready','copy_ready','plan','copy_plan','summary','handoff','copy_handoff','ready_as_plan','plan_as_handoff'] as const)('rejects mixed or copied %s without changing the other owner',kind=>{
  const f=fixture(),other=fixture();let run:()=>unknown;
  if(kind==='binding')run=()=>f.owner.sealWorkerRecoveryPlan(other.b,f.ready);
  else if(kind==='ready'||kind==='copy_ready')run=()=>f.owner.sealWorkerRecoveryPlan(f.b,kind==='ready'?other.ready:{...f.ready});
  else{const plan=f.seal(),otherPlan=other.seal();
    if(kind==='plan'||kind==='copy_plan'||kind==='ready_as_plan')run=()=>f.owner.transferWorkerRecoveryPlan(f.b,kind==='plan'?otherPlan:kind==='copy_plan'?{...plan}:f.ready);
    else if(kind==='summary'){const data=other.owner.summarizeWorkerRecoveryPlan(other.b,otherPlan);run=()=>f.owner.transferWorkerRecoveryPlan(f.b,data);}
    else{const handoff=f.owner.transferWorkerRecoveryPlan(f.b,plan),otherHandoff=other.owner.transferWorkerRecoveryPlan(other.b,otherPlan);f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');run=()=>f.owner.discardTransferredWorkerRecoveryPlan(f.b,kind==='handoff'?otherHandoff:kind==='copy_handoff'?{...handoff}:plan);}
  }
  const before=other.owner.inspect();expect(run).toThrow('internal_review_error');expect(other.owner.inspect()).toEqual(before);
});
it.each(['sealed','transferred'] as const)('does not hide %s plan in normal close even after cleanup',stage=>{
  const f=fixture(),plan=f.seal();if(stage==='transferred')f.owner.transferWorkerRecoveryPlan(f.b,plan);f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');expect(()=>f.owner.close(f.b)).toThrow('internal_review_error');expect(f.owner.inspect().worker_plan).toMatchObject({sealed_pending:false,transferred_pending:false});
});
it('rejects receiver discard before confirmed cleanup and never revives it after late confirmation',()=>{
  const f=fixture(),handoff=f.owner.transferWorkerRecoveryPlan(f.b,f.seal());expect(()=>f.owner.discardTransferredWorkerRecoveryPlan(f.b,handoff)).toThrow('internal_review_error');f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');expect(()=>f.owner.discardTransferredWorkerRecoveryPlan(f.b,handoff)).toThrow('internal_review_error');
});
it('rejects a second receiving-slot consume after confirmed discard',()=>{
  const f=fixture(),handoff=f.owner.transferWorkerRecoveryPlan(f.b,f.seal());f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');f.owner.discardTransferredWorkerRecoveryPlan(f.b,handoff);expect(()=>f.owner.discardTransferredWorkerRecoveryPlan(f.b,handoff)).toThrow('internal_review_error');
});
it.each(['summary','transfer'] as const)('keeps same prefix and UTC through %s without new calls',branch=>{
  const f=fixture({verify:'success'}),before=f.owner.inspect(),plan=f.seal();if(branch==='summary')f.owner.summarizeWorkerRecoveryPlan(f.b,plan);else f.owner.transferWorkerRecoveryPlan(f.b,plan);
  expect(f.owner.inspect().time).toEqual(before.time);expect(f.owner.inspect().worker_preparation?.accounting).toEqual(before.worker_preparation?.accounting);expect(f.owner.inspect().new_generation).toEqual(before.new_generation);expect(f.owner.inspect().worker_plan?.finish_calls).toBe(0);
});
it.each([1,3,100])('preserves the canonical selected order and input U at size %i',rows=>{
  const f=fixture({rows}),summary=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());expect(summary.assets.map(x=>x.update_xml_sys_id)).toEqual(Array.from({length:rows},(_,i)=>id(i+1)));expect(summary.inputs.at(-1)).toMatchObject({update_xml_sys_id:id(rows),retrieved_at:U,state:'not_processed'});expect(summary.time.upper_utc).toBe(U);
});
it('never adopts caller mutations as set additions, omissions, state upgrades or U cut-downs',()=>{
  const f=fixture();f.raw.rows=[id(99)];f.raw.completed=[{state:'reviewed',update_xml_sys_id:id(3)}];f.raw.inputs[1].retrieved_at=O;f.raw.accounting.requests=0;f.raw.collection_status='failed';
  const summary=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());expect(summary.assets.map(x=>[x.update_xml_sys_id,x.state])).toEqual([[id(1),'reviewed'],[id(2),'rejected'],[id(3),'not_processed']]);expect(summary.inputs[1].retrieved_at).toBe(U);expect(summary.collection_status).toBe('complete');expect(summary.accounting.requests).toBe(10);
});
it.each(['complete','failed'] as const)('keeps %s collection and source outcomes without promoting to complete',collection=>{
  const f=fixture({collection}),s=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());expect(s.collection_status).toBe(collection);expect(s.run_status).toBe(collection==='failed'?'failed':'partial');
});
it.each(['stable_observation','changed','unverified'] as const)('retains original %s when no verify exists',consistency=>{
  const f=fixture({consistency}),s=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());expect(s.consistency).toBe(consistency);expect(s.errors[0]).toEqual({stage:'analysis',code:'deadline_exceeded'});if(consistency==='changed')expect(s.limitations).toContain('changed_during_review');
});
it.each(['success','changed','invalid_response','phase_deadline_exceeded'] as const)('seals the fixed verify result for %s',verify=>{
  const f=fixture({verify}),s=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());expect(s.consistency).toBe(verify==='success'?'stable_observation':verify==='changed'?'changed':'unverified');if(verify==='invalid_response')expect(s.errors).toContainEqual({stage:'consistency',code:'metadata_unavailable'});if(verify==='phase_deadline_exceeded')expect(s.errors).toContainEqual({stage:'consistency',code:'deadline_exceeded'});
});
it.each(['rows','assets','asset','inputs','input','time','accounting','limitations','errors','error'] as const)('freezes summary %s and exposes no authority-bearing references',key=>{
  const f=fixture(),s=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());const values={rows:s.assets,assets:s.assets,asset:s.assets[0],inputs:s.inputs,input:s.inputs[0],time:s.time,accounting:s.accounting,limitations:s.limitations,errors:s.errors,error:s.errors[0]};expect(Object.isFrozen(values[key])).toBe(true);
  for(const name of ['receipt','frame','owner','seed','release','source','worker','generation','cleanup','handle'])expect(Object.hasOwn(s,name)).toBe(false);
});
it.each(['summary','transfer'] as const)('guards all six %s boundaries and keeps exact diagnostics after cancellation',branch=>{
  for(let at=1;at<=6;at++){
    const f=fixture();let n=0;f.arm(()=>++n===at?'cancelled':undefined);
    expect(()=>{const plan=f.seal();if(branch==='summary'){f.owner.summarizeWorkerRecoveryPlan(f.b,plan);f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');f.owner.close(f.b);}else{const h=f.owner.transferWorkerRecoveryPlan(f.b,plan);f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');f.owner.discardTransferredWorkerRecoveryPlan(f.b,h);}}).toThrow('cancelled');
    expect(n).toBe(at);expect(f.owner.inspect()).toMatchObject({state:'failed',worker_plan:{seals:at>=2?1:0,transfers:branch==='transfer'&&at>=4?1:0,summaries:branch==='summary'&&at>=5?1:0,sealed_pending:false,transferred_pending:false,finish_calls:0},new_generation:{starts:1,ready_events:1,cleanup_pending:at<5},worker_preparation:{accounting:{requests:10,received_bytes:20,payload_bytes:30}},diagnostics:{hard:{code:'cancelled'}}});
    if(at<5)f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');expect(f.owner.inspect().diagnostics.hard?.code).toBe('cancelled');
  }
});
it.each(['seal','summary','transfer','receiver'] as const)('rejects synchronous guard reentry during %s without second output',step=>{
  const f=fixture(),plan=step==='seal'?undefined:f.seal(),h=step==='receiver'?f.owner.transferWorkerRecoveryPlan(f.b,plan!):undefined;if(step==='receiver')f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');
  let once=false;f.arm(()=>{if(!once){once=true;try{f.seal();}catch{/* outer must still stop */}}return undefined;});
  expect(()=>step==='seal'?f.seal():step==='summary'?f.owner.summarizeWorkerRecoveryPlan(f.b,plan!):step==='transfer'?f.owner.transferWorkerRecoveryPlan(f.b,plan!):f.owner.discardTransferredWorkerRecoveryPlan(f.b,h!)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_plan:{sealed_pending:false,transferred_pending:false,finish_calls:0}});
});
it.each(['run','session','source','key','origin','budget','release'] as const)('rechecks the same %s before summary and never adopts an alternate identity',key=>{
  const f=fixture(),p=f.seal();f.seed[key]={};expect(()=>f.owner.summarizeWorkerRecoveryPlan(f.b,p)).toThrow('internal_review_error');expect(f.owner.inspect().worker_plan).toMatchObject({summaries:0,sealed_pending:false});
});
it.each(['started_at','observed_at','upper_utc','deadline_ms'] as const)('rejects original %s mutation before transfer and preserves terminal time',key=>{
  const f=fixture(),p=f.seal(),before=f.owner.inspect().time;if(key==='deadline_ms')f.seed.deadline_ms=50000;else f.seed[key]=key==='started_at'?O:S;
  expect(()=>f.owner.transferWorkerRecoveryPlan(f.b,p)).toThrow('internal_review_error');expect(f.owner.inspect().time).toEqual(before);expect(f.owner.inspect().worker_plan?.transfers).toBe(0);
});
it.each(['cancelled','deadline_exceeded','worker_unavailable'] as const)('drops private plan after hard %s but keeps only the preissued cleanup sink',code=>{
  const f=fixture(),p=f.seal();f.owner.revoke(code);expect(()=>f.owner.transferWorkerRecoveryPlan(f.b,p)).toThrow(code);f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');expect(f.owner.inspect()).toMatchObject({state:'failed',worker_plan:{sealed_pending:false,transferred_pending:false},new_generation:{cleanup:{status:'confirmed'},cleanup_pending:false},diagnostics:{hard:{code}}});
});
it('rejects a second seal immediately and keeps the new cleanup responsibility',()=>{
  const f=fixture();f.seal();expect(f.seal).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({worker_plan:{seals:1,sealed_pending:false},new_generation:{cleanup_pending:true}});
});
it('permits summary after confirmed cleanup without concealing remaining sealed state',()=>{
  const f=fixture();f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,'confirmed');const s=f.owner.summarizeWorkerRecoveryPlan(f.b,f.seal());expect(s.authority).toBe('none');f.owner.close(f.b);expect(f.owner.inspect().time).toBeNull();
});
it.each(['not_started','requested','failed','unconfirmed'])('does not revive a sealed plan after new cleanup %s',status=>{
  const f=fixture(),p=f.seal();expect(()=>f.owner.recordWorkerGenerationCleanup(f.ticket.cleanup,status)).toThrow('internal_review_error');expect(()=>f.owner.summarizeWorkerRecoveryPlan(f.b,p)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({worker_plan:{sealed_pending:false,transferred_pending:false},new_generation:{cleanup:{status}}});
});
