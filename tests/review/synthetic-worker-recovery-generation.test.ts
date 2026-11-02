import {expect,it} from 'vitest';
import {createSyntheticSoftRecoveryIssuer,type SyntheticSoftFacts} from '../support/review/synthetic-soft-recovery.js';
const points=['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'] as const;
function fixture(point:typeof points[number]='analyze_timer',continuation:object|null=null){
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:'2026-11-02T00:00:00.000Z',deadline_ms:60000,observed_at:'2026-11-02T00:00:01.000Z',upper_utc:'2026-11-02T00:00:02.000Z'};
  const common={kind:'worker_deadline',phase:'analysis',point,supervisor:{},request:{},input:{}};
  const refs={worker:{},generation:{}};
  const facts=(point==='request_check_unstarted'?{...common,worker_state:'none'}:point==='ready_timer'||point==='ready_reply_check'?{...common,...refs,worker_state:'starting'}:point==='request_check_existing'?{...common,...refs,worker_state:'ready'}:{...common,...refs,worker_state:'ready',...(point==='send_check'?{allocation:{}}:{job:{}}),id:7}) as SyntheticSoftFacts;
  let check:()=>string|undefined=()=>undefined;const owner=createSyntheticSoftRecoveryIssuer(seed,facts,()=>check()),b=owner.bind(seed),r=owner.claimRecovery(b,owner.observe(b,facts)),lease=owner.beginWorkerClosure(b,r);
  const proof=point==='request_check_unstarted'?owner.confirmWorkerUnstarted(b,lease,facts):owner.settleWorkerClosure(b,lease,{context:facts,termination:'confirmed',cleanup:'complete'});
  const p=owner.prepareWorkerRecovery(b,proof,{source:seed.source,budget:seed.budget,release:seed.release,origin:seed.origin,window:{},verify:continuation,accounting:{requests:10,received_bytes:20,payload_bytes:30},rows:['1'.repeat(32)],completed:[],inputs:[{receipt:common.input,update_xml_sys_id:'1'.repeat(32),retrieved_at:seed.upper_utc,state:'retained'}],collection_status:'complete',consistency:'unverified'});
  return {owner,b,p,proof,seed,facts,arm:(fn:()=>string|undefined)=>{check=fn;},verify:()=>owner.beginWorkerVerify(b,p)};
}
it('uses HeldClosure once after verify and allocates cleanup before any synthetic start',()=>{
  const f=fixture();f.verify();const ticket=f.owner.claimWorkerGeneration(f.b,f.p);
  expect(Object.keys(ticket)).toEqual(['start','cleanup']);expect(Object.keys(ticket.start)).toEqual([]);expect(Object.keys(ticket.cleanup)).toEqual([]);
  expect(f.owner.inspect()).toMatchObject({worker_preparation:{held:false,handle_pending:false,generation_uses:1,new_generations:0},new_generation:{claim_started:true,starts:0,ready_events:0,cleanup:{status:'not_required'},cleanup_pending:true}});
});
it.each(points)('starts only one new frame and accepts its private ready for %s',point=>{
  const f=fixture(point);f.verify();const ticket=f.owner.claimWorkerGeneration(f.b,f.p),lease=f.owner.startWorkerGeneration(f.b,ticket.start),event=f.owner.issueWorkerGenerationReady(f.b,lease),ready=f.owner.acceptWorkerGenerationReady(f.b,lease,event);
  expect(f.owner.inspect()).toMatchObject({state:'generation_ready',worker_preparation:{generation_uses:1,new_generations:1},new_generation:{starts:1,ready_events:1,cleanup:{status:'not_started'},cleanup_pending:true}});
  f.owner.recordWorkerGenerationCleanup(ticket.cleanup,'confirmed');f.owner.discardWorkerGeneration(f.b,ready);f.owner.close(f.b);
  expect(f.owner.inspect()).toMatchObject({state:'closed',time:null,new_generation:{cleanup:{status:'confirmed'},cleanup_pending:false}});
});
it.each(['unstarted','parent','pending','retry_wait','metadata'])('does not use HeldClosure before verify finishes at %s',stage=>{
  const f=fixture('analyze_timer',{});if(stage!=='unstarted')f.verify();
  if(['pending','retry_wait','metadata'].includes(stage)){const a=f.owner.workerVerifyAttempt(f.b,f.p,'parent')!;if(stage==='retry_wait')f.owner.workerVerifyOutcome(f.b,f.p,a,{kind:'failure',type:'bounded',code:'upstream_unavailable'});if(stage==='metadata')f.owner.workerVerifyOutcome(f.b,f.p,a,{kind:'success',changed:false});}
  expect(()=>f.owner.claimWorkerGeneration(f.b,f.p)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({worker_preparation:{held:false,generation_uses:0,new_generations:0},new_generation:{starts:0}});
});
it.each(['invalid_response','phase_deadline_exceeded','success','changed'])('starts after completed verify outcome %s without changing prefix or upper time',code=>{
  const f=fixture('analyze_timer',{});f.verify();const a=f.owner.workerVerifyAttempt(f.b,f.p,'parent')!;
  if(code==='success'||code==='changed'){f.owner.workerVerifyOutcome(f.b,f.p,a,{kind:'success',changed:code==='changed'});const b=f.owner.workerVerifyAttempt(f.b,f.p,'metadata')!;f.owner.workerVerifyOutcome(f.b,f.p,b,{kind:'success',changed:false});}
  else f.owner.workerVerifyOutcome(f.b,f.p,a,{kind:'failure',type:'bounded',code});
  const before=f.owner.inspect().worker_preparation?.accounting,t=f.owner.inspect().time;const ticket=f.owner.claimWorkerGeneration(f.b,f.p);f.owner.startWorkerGeneration(f.b,ticket.start);
  expect(f.owner.inspect().worker_preparation?.accounting).toEqual(before);expect(f.owner.inspect().time).toEqual(t);expect(f.owner.inspect().new_generation?.starts).toBe(1);
});
it.each(['claim','start','issue','accept','cleanup','discard'] as const)('rejects duplicate %s and cannot spend a second closure/start/ready',step=>{
  const f=fixture();f.verify();const ticket=f.owner.claimWorkerGeneration(f.b,f.p);let repeat:()=>unknown;
  if(step==='claim')repeat=()=>f.owner.claimWorkerGeneration(f.b,f.p);
  else{const lease=f.owner.startWorkerGeneration(f.b,ticket.start);if(step==='start')repeat=()=>f.owner.startWorkerGeneration(f.b,ticket.start);
    else{const event=f.owner.issueWorkerGenerationReady(f.b,lease);if(step==='issue')repeat=()=>f.owner.issueWorkerGenerationReady(f.b,lease);
      else{const ready=f.owner.acceptWorkerGenerationReady(f.b,lease,event);if(step==='accept')repeat=()=>f.owner.acceptWorkerGenerationReady(f.b,lease,event);
        else{f.owner.recordWorkerGenerationCleanup(ticket.cleanup,'confirmed');if(step==='cleanup')repeat=()=>f.owner.recordWorkerGenerationCleanup(ticket.cleanup,'confirmed');else{f.owner.discardWorkerGeneration(f.b,ready);repeat=()=>f.owner.discardWorkerGeneration(f.b,ready);}}}
    }
  }
  const before=f.owner.inspect();expect(repeat).toThrow('internal_review_error');expect(f.owner.inspect().worker_preparation?.generation_uses).toBe(1);expect(f.owner.inspect().new_generation?.starts).toBe(before.new_generation?.starts);expect(f.owner.inspect().new_generation?.ready_events).toBe(before.new_generation?.ready_events);
});
it.each(['foreign_binding','foreign_preparation','old_proof','foreign_start','copy_start','foreign_lease','copy_lease','foreign_event','copy_event','old_ready','raw_ready','old_job','old_cleanup','foreign_cleanup'] as const)('rejects mixed/copied %s without spending the other owner',kind=>{
  const f=fixture(),other=fixture();f.verify();other.verify();const q=other.owner.claimWorkerGeneration(other.b,other.p),otherLease=other.owner.startWorkerGeneration(other.b,q.start),otherEvent=other.owner.issueWorkerGenerationReady(other.b,otherLease);
  let run:()=>unknown;
  if(kind==='foreign_binding')run=()=>f.owner.claimWorkerGeneration(other.b,f.p);
  else if(kind==='foreign_preparation'||kind==='old_proof')run=()=>f.owner.claimWorkerGeneration(f.b,kind==='old_proof'?f.proof:other.p);
  else{const ticket=f.owner.claimWorkerGeneration(f.b,f.p);
    if(kind==='foreign_start'||kind==='copy_start')run=()=>f.owner.startWorkerGeneration(f.b,kind==='foreign_start'?q.start:{...ticket.start});
    else if(kind==='foreign_cleanup'||kind==='old_cleanup')run=()=>f.owner.recordWorkerGenerationCleanup(kind==='foreign_cleanup'?q.cleanup:f.proof,'confirmed');
    else{const lease=f.owner.startWorkerGeneration(f.b,ticket.start),event=f.owner.issueWorkerGenerationReady(f.b,lease);
      run=()=>f.owner.acceptWorkerGenerationReady(f.b,kind==='foreign_lease'?otherLease:kind==='copy_lease'?{...lease}:lease,kind==='foreign_event'?otherEvent:kind==='copy_event'?{...event}:kind==='old_ready'?f.proof:kind==='old_job'?{id:7,type:'analyzed'}:kind==='raw_ready'?{type:'ready'}:event);
    }
  }
  expect(run).toThrow('internal_review_error');expect(other.owner.inspect()).toMatchObject({state:'generation_waiting',new_generation:{starts:1,ready_events:0,cleanup_pending:true}});
});
it.each(points.flatMap(point=>Array.from({length:8},(_,i)=>[point,i+1] as const)))('keeps cleanup responsibility after %s guard %i',(point,at)=>{
  const f=fixture(point);f.verify();let n=0,ticket:ReturnType<typeof f.owner.claimWorkerGeneration>|undefined;f.arm(()=>++n===at?'cancelled':undefined);
  expect(()=>{ticket=f.owner.claimWorkerGeneration(f.b,f.p);const lease=f.owner.startWorkerGeneration(f.b,ticket.start),event=f.owner.issueWorkerGenerationReady(f.b,lease);f.owner.acceptWorkerGenerationReady(f.b,lease,event);}).toThrow('cancelled');
  const starts=at>=4?1:0;expect(f.owner.inspect()).toMatchObject({state:'failed',worker_preparation:{held:false,generation_uses:1,new_generations:starts},new_generation:{starts,ready_events:0,cleanup_pending:at>=3},diagnostics:{soft:{kind:'worker_deadline',point},hard:{code:'cancelled'}}});
  if(ticket){f.owner.recordWorkerGenerationCleanup(ticket.cleanup,starts?'confirmed':'not_required');expect(f.owner.inspect()).toMatchObject({state:'failed',new_generation:{cleanup_pending:false,cleanup:{status:starts?'confirmed':'not_required'}},diagnostics:{hard:{code:'cancelled'}}});}
});
it.each(['not_started','requested','failed','unconfirmed','not_required','SECRET'])('keeps failed/incomplete new cleanup %s separate from old confirmed closure',status=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p);f.owner.startWorkerGeneration(f.b,t.start);expect(()=>f.owner.recordWorkerGenerationCleanup(t.cleanup,status)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',worker_closure:{termination:'confirmed',cleanup:'complete'},new_generation:{cleanup_pending:false,cleanup:{status:status==='SECRET'||status==='not_required'?'unconfirmed':status}}});expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it.each(['cancelled','deadline_exceeded','worker_unavailable','SECRET'])('retains startup/ready failure %s and accepts only the original cleanup sink',reason=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p),lease=f.owner.startWorkerGeneration(f.b,t.start),expected=reason==='SECRET'?'internal_review_error':reason;
  expect(()=>f.owner.failWorkerGeneration(f.b,lease,reason)).toThrow(expected);f.owner.recordWorkerGenerationCleanup(t.cleanup,'confirmed');expect(()=>f.owner.startWorkerGeneration(f.b,t.start)).toThrow(expected);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it.each(['claimed','waiting','ready','cleaned'] as const)('normal close cannot conceal undiscarded new generation in %s',stage=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p);
  if(stage!=='claimed'){const lease=f.owner.startWorkerGeneration(f.b,t.start);if(stage==='ready'||stage==='cleaned'){const event=f.owner.issueWorkerGenerationReady(f.b,lease);f.owner.acceptWorkerGenerationReady(f.b,lease,event);}if(stage==='cleaned')f.owner.recordWorkerGenerationCleanup(t.cleanup,'confirmed');}
  expect(()=>f.owner.close(f.b)).toThrow('internal_review_error');expect(f.owner.inspect().new_generation?.cleanup_pending).toBe(stage!=='cleaned');
});
it('allows fixed pre-start abandonment only after not-required cleanup, without spending a start',()=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p);f.owner.recordWorkerGenerationCleanup(t.cleanup,'not_required');f.owner.discardWorkerGeneration(f.b,t.start);f.owner.close(f.b);expect(f.owner.inspect()).toMatchObject({state:'closed',new_generation:{starts:0,ready_events:0,cleanup:{status:'not_required'}}});
});
it('does not let the old cleanup sink discharge the new frame responsibility',()=>{
  const f=fixture(),old=f.owner.cleanupLease(f.b);f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p);f.owner.startWorkerGeneration(f.b,t.start);f.owner.recordCleanup(old,'confirmed');
  expect(f.owner.inspect()).toMatchObject({diagnostics:{cleanup:{status:'confirmed'}},new_generation:{cleanup_pending:true,cleanup:{status:'not_started'}}});f.owner.recordWorkerGenerationCleanup(t.cleanup,'confirmed');
});
it.each(['requested','failed','unconfirmed'])('keeps cancellation as the first hard reason when new cleanup reports %s',status=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p);f.owner.startWorkerGeneration(f.b,t.start);f.owner.revoke('cancelled');expect(()=>f.owner.recordWorkerGenerationCleanup(t.cleanup,status)).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({diagnostics:{hard:{code:'cancelled'}},new_generation:{cleanup:{status},cleanup_pending:false}});
});
it.each(['claim','start','issue','accept'] as const)('rejects guard reentry during %s and retains one cleanup responsibility',step=>{
  const f=fixture();f.verify();const t=step!=='claim'?f.owner.claimWorkerGeneration(f.b,f.p):undefined,lease=step==='issue'||step==='accept'?f.owner.startWorkerGeneration(f.b,t!.start):undefined,event=step==='accept'?f.owner.issueWorkerGenerationReady(f.b,lease!):undefined;
  let once=false;f.arm(()=>{if(!once){once=true;try{f.owner.claimWorkerGeneration(f.b,f.p);}catch{/* outer must stop */}}return undefined;});
  expect(()=>step==='claim'?f.owner.claimWorkerGeneration(f.b,f.p):step==='start'?f.owner.startWorkerGeneration(f.b,t!.start):step==='issue'?f.owner.issueWorkerGenerationReady(f.b,lease!):f.owner.acceptWorkerGenerationReady(f.b,lease!,event!)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({state:'failed',new_generation:{starts:step==='issue'||step==='accept'?1:0,ready_events:0,cleanup_pending:step!=='claim'}});
});
it.each(['run','session','source','key','origin','budget','release'] as const)('rechecks the original %s before startup and retains not-required cleanup',key=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p);f.seed[key]={};expect(()=>f.owner.startWorkerGeneration(f.b,t.start)).toThrow('internal_review_error');f.owner.recordWorkerGenerationCleanup(t.cleanup,'not_required');expect(f.owner.inspect().new_generation?.starts).toBe(0);
});
it('cannot discard an unconfirmed frame then restart after late cleanup',()=>{
  const f=fixture();f.verify();const t=f.owner.claimWorkerGeneration(f.b,f.p),lease=f.owner.startWorkerGeneration(f.b,t.start),event=f.owner.issueWorkerGenerationReady(f.b,lease),ready=f.owner.acceptWorkerGenerationReady(f.b,lease,event);
  expect(()=>f.owner.discardWorkerGeneration(f.b,ready)).toThrow('internal_review_error');f.owner.recordWorkerGenerationCleanup(t.cleanup,'confirmed');expect(()=>f.owner.discardWorkerGeneration(f.b,ready)).toThrow('internal_review_error');expect(f.owner.inspect().new_generation?.starts).toBe(1);
});
it('retains a preissued new-frame cleanup sink after startup failure without restoring authority',()=>{
  const f=fixture();f.verify();const ticket=f.owner.claimWorkerGeneration(f.b,f.p),lease=f.owner.startWorkerGeneration(f.b,ticket.start);
  expect(()=>f.owner.failWorkerGeneration(f.b,lease,'worker_unavailable')).toThrow('worker_unavailable');f.owner.recordWorkerGenerationCleanup(ticket.cleanup,'confirmed');
  expect(f.owner.inspect()).toMatchObject({state:'failed',diagnostics:{soft:{kind:'worker_deadline'},hard:{code:'worker_unavailable'}},new_generation:{starts:1,ready_events:0,cleanup_pending:false,cleanup:{status:'confirmed'}}});
  expect(()=>f.owner.claimWorkerGeneration(f.b,f.p)).toThrow('worker_unavailable');
});
