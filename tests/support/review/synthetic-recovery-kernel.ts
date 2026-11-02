/** RB-A: shared package-excluded recovery lifecycle; constructs fresh roots only. */
import {types} from 'node:util';
import {z} from 'zod';
import {createSyntheticPhaseModel} from './synthetic-phase-recovery.js';
import {prepareSyntheticWorkerRecoveryInputs} from './synthetic-worker-recovery-input.js';
import {createSyntheticWorkerVerify} from './synthetic-worker-recovery-verify.js';
type ReadPhase='metadata'|'payload'|'consistency';
type WorkerRefs=Readonly<{generation:object;worker:object}>;
type WorkerCall=Readonly<{kind:'worker_deadline';phase:'analysis';supervisor:object;request:object;input:object}>;
export type SyntheticSoftFacts=
  |Readonly<{kind:'phase_deadline';point:'phase_guard';phase:ReadPhase}&({worker_state:'none'}|{worker_state:'ready';supervisor:object}&WorkerRefs)>
  |Readonly<WorkerCall&(
    {point:'request_check_unstarted';worker_state:'none'}
    |{point:'request_check_existing';worker_state:'ready'}&WorkerRefs
    |{point:'ready_timer'|'ready_reply_check';worker_state:'starting'}&WorkerRefs
    |{point:'send_check';worker_state:'ready';allocation:object;id:number}&WorkerRefs
    |{point:'analyze_timer'|'analyze_reply_check';worker_state:'ready';job:object;id:number}&WorkerRefs)>;
export type SyntheticRecoverySeed=Readonly<{run:object;session:object;source:object;key:object;origin:object;budget:object;release:object;started_at:string;deadline_ms:number;observed_at:string;upper_utc:string}>;
type Code='cancelled'|'deadline_exceeded'|'worker_unavailable'|'internal_review_error'|'receive_budget_exceeded'|'authentication_failed'|'access_denied'|'request_budget_exceeded'|'payload_budget_exceeded';
type Phase='binding'|'observation'|'recovery_claim'|'recovery_consume'|'cleanup_lease'|'cleanup_record'|'revoke'|'close'|'discard'|'phase_prepare'|'phase_verify'|'phase_chunk'|'phase_retry'|'phase_worker'|'phase_ready'|'phase_consume'|'worker_closure_begin'|'worker_closure_settle'|'worker_closure_consume'|'worker_prepare'|'worker_prepare_discard'|'worker_verify'|'generation_claim'|'generation_start'|'generation_ready'|'generation_cleanup'|'generation_discard'|'worker_plan';
type State='fresh'|'binding'|'active'|'observing'|'observed'|'claiming'|'claimed'|'consuming'|'consumed'|'failed'|'closed'|'phase_planning'|'phase_planned'|'phase_consuming'|'worker_closing'|'worker_closed'|'worker_preparing'|'worker_prepared'|'generation_claiming'|'generation_claimed'|'generation_starting'|'generation_waiting'|'generation_ready'|'plan_sealed'|'plan_transferred';
type ClosureDiagnostic=Readonly<{close_requests:0|1;input_state:'unsent'|'sent_terminal';id_state:'absent'|'allocated_unsent'|'sent_terminal';termination:'not_required'|'requested'|'confirmed'|'rejected'|'unconfirmed';cleanup:'not_required'|'not_started'|'complete'|'failed'|'unconfirmed'}>;
type SoftDiagnostic=Readonly<Pick<SyntheticSoftFacts,'kind'|'phase'|'point'|'worker_state'>>;
type CleanupStatus='not_required'|'not_started'|'requested'|'confirmed'|'failed'|'unconfirmed';
declare const ownerBrand:unique symbol,observationBrand:unique symbol,recoveryBrand:unique symbol,cleanupBrand:unique symbol,closureLeaseBrand:unique symbol,closureEvidenceBrand:unique symbol,preparationBrand:unique symbol;
declare const generationStartBrand:unique symbol,generationCleanupBrand:unique symbol,generationLeaseBrand:unique symbol,generationEventBrand:unique symbol,generationReadyBrand:unique symbol;
type GenerationStart=Readonly<{[generationStartBrand]:'synthetic_generation_start'}>;
type GenerationCleanup=Readonly<{[generationCleanupBrand]:'synthetic_generation_cleanup'}>;
type GenerationLease=Readonly<{[generationLeaseBrand]:'synthetic_generation_lease'}>;
type GenerationEvent=Readonly<{[generationEventBrand]:'synthetic_generation_event'}>;
type GenerationReady=Readonly<{[generationReadyBrand]:'synthetic_generation_ready'}>;
type OwnerBinding=Readonly<{[ownerBrand]:'synthetic_owner'}>;
type ObservationHandle=Readonly<{[observationBrand]:'synthetic_observation'}>;
type RecoveryHandle=Readonly<{[recoveryBrand]:'synthetic_recovery'}>;
type CleanupDiagnosticHandle=Readonly<{[cleanupBrand]:'synthetic_cleanup_diagnostic'}>;
type WorkerClosureLease=Readonly<{[closureLeaseBrand]:'synthetic_worker_closure'}>;
type WorkerClosureEvidence=Readonly<{[closureEvidenceBrand]:'no_generation'|'closed_generation'}>;
type WorkerRecoveryPreparation=Readonly<{[preparationBrand]:'synthetic_worker_recovery_preparation'}>;
type HeldClosure=Readonly<{evidence:WorkerClosureEvidence;origin:Extract<SyntheticSoftFacts,{kind:'worker_deadline'}>;inputs:ReturnType<typeof prepareSyntheticWorkerRecoveryInputs>}>;
declare const planBrand:unique symbol,handoffBrand:unique symbol;
type RecoveryPlanHandle=Readonly<{[planBrand]:'synthetic_worker_recovery_plan_handle'}>;
type RecoveryPlanHandoff=Readonly<{[handoffBrand]:'synthetic_worker_recovery_plan_handoff'}>;
type SealedRecoveryPlan=Readonly<{owner:OwnerBinding;seed:SyntheticRecoverySeed;frame:object;inputs:HeldClosure['inputs'];time:Readonly<Pick<SyntheticRecoverySeed,'started_at'|'deadline_ms'|'observed_at'|'upper_utc'>>;verify:ReturnType<ReturnType<typeof createSyntheticWorkerVerify>['inspect']>}>;
const seedKeys=['run','session','source','key','origin','budget','release','started_at','deadline_ms','observed_at','upper_utc'];
const referenceKeys=['run','session','source','key','origin','budget','release','input','request','supervisor','worker','generation','allocation','job'];
const utc=z.iso.datetime({precision:3});
const opaque=<T extends object>():T=>Object.freeze(Object.create(null)) as T;
function plain(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||types.isProxy(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw Error();
  const names=Reflect.ownKeys(value);if(names.length>16)throw Error();const result:Record<string,unknown>=Object.create(null);
  for(const key of names){if(typeof key!=='string')throw Error();const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error();result[key]=d.value;}
  return Object.freeze(result);
}
function exact(value:Record<string,unknown>,keys:readonly string[]){if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error();}
function refs(value:Record<string,unknown>){for(const k of referenceKeys)if(Object.hasOwn(value,k)&&(!value[k]||typeof value[k]!=='object'||types.isProxy(value[k])))throw Error();}
function pinSeed(raw:unknown):SyntheticRecoverySeed{
  const v=plain(raw);exact(v,seedKeys);refs(v);
  for(const k of ['started_at','observed_at','upper_utc'])if(typeof v[k]!=='string'||v[k].length!==24||!utc.safeParse(v[k]).success)throw Error();
  const s=v as unknown as SyntheticRecoverySeed;
  if(!Number.isSafeInteger(s.deadline_ms)||s.deadline_ms<1||s.deadline_ms>60000||Date.parse(s.observed_at)<Date.parse(s.started_at)||Date.parse(s.upper_utc)<Date.parse(s.observed_at)||Date.parse(s.upper_utc)>Date.parse(s.started_at)+s.deadline_ms)throw Error();return s;
}
function pinFacts(raw:unknown):SyntheticSoftFacts{
  const v=plain(raw);refs(v);const keys=['kind','point','phase','worker_state'];
  if(v.kind==='phase_deadline'){
    if(v.point!=='phase_guard'||!['metadata','payload','consistency'].includes(v.phase as string))throw Error();
    if(v.worker_state==='ready')keys.push('supervisor','worker','generation');else if(v.worker_state!=='none')throw Error();
  }else if(v.kind==='worker_deadline'){
    if(v.phase!=='analysis')throw Error();keys.push('input','request','supervisor');
    if(v.point==='request_check_unstarted'){if(v.worker_state!=='none')throw Error();}
    else{
      keys.push('worker','generation');
      if(v.point==='ready_timer'||v.point==='ready_reply_check'){if(v.worker_state!=='starting')throw Error();}
      else{
        if(v.worker_state!=='ready')throw Error();
        if(v.point==='send_check')keys.push('allocation','id');
        else if(v.point==='analyze_timer'||v.point==='analyze_reply_check')keys.push('job','id');
        else if(v.point!=='request_check_existing')throw Error();
      }
    }
    if(keys.includes('id')&&(!Number.isSafeInteger(v.id)||(v.id as number)<1))throw Error();
  }else throw Error();
  exact(v,keys);return v as unknown as SyntheticSoftFacts;
}
function equal(a:object,b:object){const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>x[k]===y[k]);}
function code(raw:unknown):Code{
  const c=raw&&typeof raw==='object'&&!types.isProxy(raw)?Object.getOwnPropertyDescriptor(raw,'code')?.value:raw;
  return c==='cancelled'||c==='deadline_exceeded'||c==='worker_unavailable'||c==='receive_budget_exceeded'||c==='authentication_failed'||c==='access_denied'||c==='request_budget_exceeded'||c==='payload_budget_exceeded'?c:'internal_review_error';
}
/** Caller-supplied expected topology is a fake fixture, not live-source evidence. */
export function createSyntheticRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined=()=>undefined){
  let seedRef:SyntheticRecoverySeed|undefined=seed,expectedRef:SyntheticSoftFacts|undefined=expected,pinned:SyntheticRecoverySeed|undefined,facts:SyntheticSoftFacts|undefined;
  try{pinned=pinSeed(seed);facts=pinFacts(expected);}catch{/* bind stops without exposing input */}
  let state:State='fresh',busy=false,binding:OwnerBinding|undefined,observation:ObservationHandle|undefined,observationStarted=false;
  let recovery:RecoveryHandle|undefined,recoveryStarted=false;
  let cleanupToken:CleanupDiagnosticHandle|undefined,cleanupStarted=false,cleanupRequiresWorker=false;
  let soft:SoftDiagnostic|null=null,hard:Readonly<{code:Code;phase:Phase}>|null=null;
  let cleanup:Readonly<{scope:'synthetic_cleanup_snapshot';status:CleanupStatus}>|null=null;
  let phaseModel:ReturnType<typeof createSyntheticPhaseModel>|undefined,phaseHandle:object|undefined;
  let phaseDiagnostic:ReturnType<ReturnType<typeof createSyntheticPhaseModel>['inspect']>|null=null;
  let closureLease:WorkerClosureLease|undefined,closureEvidence:WorkerClosureEvidence|undefined,closureDiagnostic:ClosureDiagnostic|null=null;
  let heldClosure:HeldClosure|undefined,preparationHandle:WorkerRecoveryPreparation|undefined,preparationStarted=false,transfers=0;
  let preparationDiagnostic:Readonly<{selected:number;completed:number;not_processed:number;retained_inputs:number;collection_status:string;consistency:string;accounting:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>}>|undefined;
  let workerVerify:ReturnType<typeof createSyntheticWorkerVerify>|undefined,verifyStarted=false;
  let verifyDiagnostic:ReturnType<ReturnType<typeof createSyntheticWorkerVerify>['inspect']>|undefined;
  let generationClaimed=false,generationUses=0,generationStarts=0,generationReadyEvents=0;
  let generationStart:GenerationStart|undefined,generationCleanupToken:GenerationCleanup|undefined;
  let generationFrame:Readonly<{supervisor:object;worker:object;generation:object}>|undefined;
  let generationInputs:HeldClosure['inputs']|undefined;
  let generationCleanupContext:Readonly<{frame:object;started:boolean}>|undefined;
  let generationCleanup:Readonly<{status:CleanupStatus}>|null=null;
  let generationTicketPublished=false,generationEventIssued=false;
  let generationLease:GenerationLease|undefined,generationEvent:Readonly<{handle:GenerationEvent;frame:object}>|undefined,generationDiscard:GenerationStart|GenerationReady|undefined;
  let planStarted=false,planSeals=0,planTransfers=0,planSummaries=0;
  let sealedPlan:SealedRecoveryPlan|undefined,transferredPlan:SealedRecoveryPlan|undefined,planHandle:RecoveryPlanHandle|undefined,handoffHandle:RecoveryPlanHandoff|undefined;
  let planCounts:Readonly<{selected:number;retained_inputs:number}>|undefined;
  let time:Readonly<{started_at:string;deadline_ms:number;observed_at:string;upper_utc:string}>|null=null;
  function clear(){if(phaseModel){phaseModel.dispose();phaseDiagnostic=phaseModel.inspect();phaseModel=undefined;}if(workerVerify){workerVerify.dispose();verifyDiagnostic=workerVerify.inspect();workerVerify=undefined;}sealedPlan=transferredPlan=undefined;planHandle=handoffHandle=undefined;generationStart=generationLease=generationDiscard=undefined;generationEvent=generationFrame=generationInputs=undefined;if(!generationTicketPublished&&!generationStarts){generationCleanupToken=generationCleanupContext=undefined;}heldClosure=undefined;preparationHandle=undefined;phaseHandle=closureLease=closureEvidence=undefined;binding=observation=recovery=seedRef=expectedRef=undefined;pinned=facts=undefined;}
  function fail(phase:Phase,raw?:unknown):never{
    if(state==='closed')throw Error('internal_review_error');hard??=Object.freeze({code:code(raw),phase});state='failed';clear();throw Object.assign(Error(hard.code),{code:hard.code});
  }
  function guard(phase:Phase){
    const reason=check();if(reason!==undefined)fail(phase,reason);if(hard)fail(phase,hard.code);
    if(!seedRef||!expectedRef||!pinned||!facts||!equal(pinSeed(seedRef),pinned)||!equal(pinFacts(expectedRef),facts))fail(phase);
  }
  function model(handle:object,phase:Phase){if(!phaseModel||handle!==phaseHandle)fail(phase);return phaseModel!;}
  function act<T>(phase:Phase,b:object|undefined,claim:()=>void,work:()=>T,commit:(v:T)=>void=()=>{}):T{
    if(busy||hard||state==='closed'||(phase==='binding'?state!=='fresh':!binding||b!==binding))return fail(phase,hard?.code);
    busy=true;try{claim();guard(phase);const value=work();guard(phase);commit(value);return value;}catch(error){return fail(phase,error);}finally{busy=false;}
  }
  function verifyModel(handle:object){if(state!=='worker_prepared'||handle!==preparationHandle||!heldClosure||!workerVerify)fail('worker_verify');return workerVerify!;}
  function checkPlan(p:SealedRecoveryPlan){
    if(p.owner!==binding||p.seed!==pinned||p.time!==time||generationStarts!==1||generationReadyEvents!==1||(generationCleanupToken?generationCleanupContext?.frame!==p.frame:generationCleanup?.status!=='confirmed'))fail('worker_plan');
  }
  function takePlan(handle:object){const own=planHandle,p=sealedPlan;planHandle=undefined;sealedPlan=undefined;if(state!=='plan_sealed'||!own||handle!==own||!p)fail('worker_plan');checkPlan(p!);return p!;}
  return Object.freeze({
    transferWorkerRecoveryPlan(b:object,handle:object){let p:SealedRecoveryPlan;return act('worker_plan',b,()=>{p=takePlan(handle);},()=>{
      transferredPlan=p;planTransfers=1;return opaque<RecoveryPlanHandoff>();
    },handoff=>{handoffHandle=handoff;state='plan_transferred';});},
    discardTransferredWorkerRecoveryPlan(b:object,handoff:object){return act('worker_plan',b,()=>{
      const p=transferredPlan,own=handoffHandle;transferredPlan=undefined;handoffHandle=undefined;
      if(state!=='plan_transferred'||!p||!own||handoff!==own||generationCleanupToken||generationCleanup?.status!=='confirmed')fail('worker_plan');checkPlan(p!);
    },()=>{},()=>{state='consumed';});},
    summarizeWorkerRecoveryPlan(b:object,handle:object){let p:SealedRecoveryPlan;return act('worker_plan',b,()=>{p=takePlan(handle);},()=>{
      const errors:Readonly<{stage:'analysis'|'consistency';code:string}>[]=[Object.freeze({stage:'analysis',code:'deadline_exceeded'})];if(p.verify.verify_error)errors.push(Object.freeze({stage:'consistency',code:p.verify.verify_error}));if(p.verify.consistency==='changed')errors.push(Object.freeze({stage:'consistency',code:'changed_during_review'}));
      return Object.freeze({scope:'synthetic_worker_recovery_plan' as const,authority:'none' as const,mode:'new_generation' as const,assets:p.inputs.assets,inputs:Object.freeze(p.inputs.inputs.map(x=>Object.freeze({update_xml_sys_id:x.update_xml_sys_id,retrieved_at:x.retrieved_at,state:x.state}))),time:p.time,accounting:p.verify.accounting,collection_status:p.inputs.collection_status,run_status:p.inputs.collection_status==='failed'?'failed' as const:'partial' as const,consistency:p.verify.consistency,limitations:Object.freeze(['soft_deadline_reached','deadline_exceeded',...p.verify.limitations]),errors:Object.freeze(errors)});
    },()=>{planSummaries=1;state='consumed';});},
    sealWorkerRecoveryPlan(b:object,ready:object){return act('worker_plan',b,()=>{
      const used=planStarted,own=generationDiscard;planStarted=true;generationDiscard=undefined;
      if(used||state!=='generation_ready'||!own||ready!==own||!generationFrame||!generationInputs||!time||workerVerify?.inspect().stage!=='verified')fail('worker_plan');
    },()=>{
      sealedPlan=Object.freeze({owner:binding!,seed:pinned!,frame:generationFrame!,inputs:generationInputs!,time:time!,verify:workerVerify!.inspect()});
      planCounts=Object.freeze({selected:generationInputs!.rows.length,retained_inputs:generationInputs!.inputs.length});generationFrame=generationInputs=undefined;planSeals=1;return opaque<RecoveryPlanHandle>();
    },handle=>{planHandle=handle;state='plan_sealed';});},
    claimWorkerGeneration(b:object,handle:object){let held:HeldClosure;return act('generation_claim',b,()=>{
      const used=generationClaimed;generationClaimed=true;
      if(used||state!=='worker_prepared'||handle!==preparationHandle||!heldClosure||workerVerify?.inspect().stage!=='verified')fail('generation_claim');
      held=heldClosure!;heldClosure=undefined;preparationHandle=undefined;generationUses=1;state='generation_claiming';
    },()=>{
      generationInputs=held.inputs;generationFrame=Object.freeze({supervisor:opaque(),worker:opaque(),generation:opaque()});
      const start=opaque<GenerationStart>(),cleanup=opaque<GenerationCleanup>();generationStart=start;generationDiscard=start;generationCleanupToken=cleanup;generationCleanupContext=Object.freeze({frame:generationFrame,started:false});generationCleanup=Object.freeze({status:'not_required'});
      return Object.freeze({start,cleanup});
    },()=>{generationTicketPublished=true;state='generation_claimed';});},
    startWorkerGeneration(b:object,handle:object){return act('generation_start',b,()=>{
      // A started frame is discarded only through its accepted ready handle, never the pre-start ticket.
      const own=generationStart;generationStart=undefined;generationDiscard=undefined;if(state!=='generation_claimed'||!own||own!==handle||!generationFrame||generationCleanupContext?.frame!==generationFrame||!generationCleanupToken||generationStarts)fail('generation_start');state='generation_starting';
    },()=>{generationStarts=1;generationCleanupContext=Object.freeze({frame:generationFrame!,started:true});generationCleanup=Object.freeze({status:'not_started'});return opaque<GenerationLease>();},handle=>{generationLease=handle;state='generation_waiting';});},
    issueWorkerGenerationReady(b:object,lease:object){return act('generation_ready',b,()=>{
      const used=generationEventIssued;generationEventIssued=true;if(used||state!=='generation_waiting'||lease!==generationLease||!generationFrame||!generationCleanupToken)fail('generation_ready');
    },()=>{const handle=opaque<GenerationEvent>();generationEvent=Object.freeze({handle,frame:generationFrame!});return handle;});},
    acceptWorkerGenerationReady(b:object,lease:object,event:object){let own:object|undefined,issued:typeof generationEvent;return act('generation_ready',b,()=>{
      own=generationLease;issued=generationEvent;generationLease=generationEvent=undefined;
      if(state!=='generation_waiting'||!own||lease!==own||!issued||event!==issued.handle||issued.frame!==generationFrame||generationCleanupContext?.frame!==generationFrame||!generationCleanupToken)fail('generation_ready');
    },()=>opaque<GenerationReady>(),handle=>{generationReadyEvents=1;generationDiscard=handle;state='generation_ready';});},
    failWorkerGeneration(b:object,lease:object,reason:unknown){return act('generation_ready',b,()=>{
      const own=generationLease;generationLease=undefined;generationEvent=undefined;if(state!=='generation_waiting'||!own||lease!==own)fail('generation_ready');
    },()=>fail('generation_ready',reason==='worker_unavailable'||reason==='cancelled'||reason==='deadline_exceeded'?reason:'internal_review_error'));},
    recordWorkerGenerationCleanup(sink:object,status:unknown){
      // Preissued new-frame sink is diagnostics only, including after hard stop.
      if(busy||state==='closed'||!generationCleanupToken||sink!==generationCleanupToken||!generationCleanupContext)return fail('generation_cleanup',hard?.code);
      generationCleanupToken=undefined;const started=generationCleanupContext.started;generationCleanupContext=undefined;
      const valid=started?['not_started','requested','confirmed','failed','unconfirmed'].includes(status as string):status==='not_required';
      generationCleanup=Object.freeze({status:valid?status as CleanupStatus:'unconfirmed'});generationStart=generationLease=undefined;generationEvent=undefined;
      if(!valid||(started?status!=='confirmed':status!=='not_required'))fail('generation_cleanup');
    },
    discardWorkerGeneration(b:object,handle:object){return act('generation_discard',b,()=>{
      const own=generationDiscard;generationDiscard=undefined;if(!own||handle!==own||!generationInputs||generationCleanupToken||!['confirmed','not_required'].includes(generationCleanup?.status??''))fail('generation_discard');
      generationInputs=generationFrame=undefined;state='consuming';
    },()=>{},()=>{state='consumed';});},
    beginWorkerVerify(b:object,handle:object){return act('worker_verify',b,()=>{
      const used=verifyStarted;verifyStarted=true;if(used||state!=='worker_prepared'||!heldClosure||handle!==preparationHandle)fail('worker_verify');
    },()=>{const i=heldClosure!.inputs;workerVerify=createSyntheticWorkerVerify(i.accounting,i.context.verify!==null,i.consistency);});},
    workerVerifyAttempt(b:object,handle:object,role:unknown){return act('worker_verify',b,()=>{verifyModel(handle);},()=>verifyModel(handle).dispatch(role));},
    workerVerifyChunk(b:object,handle:object,attempt:object,identity:object,bytes:unknown){return act('worker_verify',b,()=>{verifyModel(handle);},()=>verifyModel(handle).chunk(attempt,identity,bytes));},
    workerVerifyOutcome(b:object,handle:object,attempt:object,outcome:unknown){let a:ReturnType<ReturnType<typeof createSyntheticWorkerVerify>['take']>;return act('worker_verify',b,()=>{a=verifyModel(handle).take(attempt);},()=>verifyModel(handle).settle(a,outcome));},
    workerVerifyRetry(b:object,handle:object){return act('worker_verify',b,()=>{verifyModel(handle);},()=>verifyModel(handle).retry());},
    prepareWorkerRecovery(b:object,evidence:object,raw:unknown){let own:WorkerClosureEvidence;return act('worker_prepare',b,()=>{
      const used=preparationStarted,issued=closureEvidence;preparationStarted=true;closureEvidence=undefined;
      if(used||state!=='worker_closed'||!issued||issued!==evidence||heldClosure)fail('worker_prepare');own=issued!;state='worker_preparing';
    },()=>{if(facts!.kind!=='worker_deadline')fail('worker_prepare');const origin=facts! as Extract<SyntheticSoftFacts,{kind:'worker_deadline'}>,inputs=prepareSyntheticWorkerRecoveryInputs(pinned!,origin,raw);
      heldClosure=Object.freeze({evidence:own,origin,inputs});transfers=1;preparationDiagnostic=Object.freeze({selected:inputs.rows.length,completed:inputs.completed.length,not_processed:inputs.assets.filter(a=>a.state==='not_processed').length,retained_inputs:inputs.inputs.length,collection_status:inputs.collection_status,consistency:inputs.consistency,accounting:inputs.accounting});return opaque<WorkerRecoveryPreparation>();
    },handle=>{preparationHandle=handle;state='worker_prepared';});},
    discardWorkerRecoveryPreparation(b:object,handle:object){return act('worker_prepare_discard',b,()=>{
      if(workerVerify?.inFlight())fail('worker_prepare_discard');if(workerVerify){workerVerify.dispose();verifyDiagnostic=workerVerify.inspect();workerVerify=undefined;}
      const own=preparationHandle;preparationHandle=undefined;const held=heldClosure;heldClosure=undefined;
      if(state!=='worker_prepared'||!own||own!==handle||!held)fail('worker_prepare_discard');state='consuming';
    },()=>{},()=>{state='consumed';});},
    beginWorkerClosure(b:object,handle:object){return act('worker_closure_begin',b,()=>{
      const own=recovery;recovery=undefined;if(state!=='claimed'||!own||own!==handle||closureDiagnostic)fail('worker_closure_begin');
      if(facts!.kind!=='worker_deadline')fail('worker_closure_begin');state='worker_closing';
    },()=>{const f=facts!;const sent=f.kind==='worker_deadline'&&(f.point==='analyze_timer'||f.point==='analyze_reply_check');
      closureDiagnostic=Object.freeze({close_requests:f.worker_state==='none'?0:1,input_state:sent?'sent_terminal':'unsent',id_state:sent?'sent_terminal':f.point==='send_check'?'allocated_unsent':'absent',termination:f.worker_state==='none'?'not_required':'requested',cleanup:f.worker_state==='none'?'not_required':'not_started'});return opaque<WorkerClosureLease>();
    },handle=>{closureLease=handle;});},
    confirmWorkerUnstarted(b:object,lease:object,context:unknown){return act('worker_closure_settle',b,()=>{
      const own=closureLease;closureLease=undefined;if(state!=='worker_closing'||!own||own!==lease)fail('worker_closure_settle');
    },()=>{if(facts!.worker_state!=='none'||!equal(pinFacts(context),facts!))fail('worker_closure_settle');return opaque<WorkerClosureEvidence>();},handle=>{closureEvidence=handle;state='worker_closed';});},
    settleWorkerClosure(b:object,lease:object,event:unknown){return act('worker_closure_settle',b,()=>{
      const own=closureLease;closureLease=undefined;if(state!=='worker_closing'||!own||own!==lease)fail('worker_closure_settle');
    },()=>{const v=plain(event);exact(v,['context','termination','cleanup']);if(facts!.worker_state==='none'||!equal(pinFacts(v.context),facts!))fail('worker_closure_settle');
      const termination=['confirmed','rejected','unconfirmed'].includes(v.termination as string)?v.termination as 'confirmed'|'rejected'|'unconfirmed':'unconfirmed';
      const cleanup=['complete','failed','unconfirmed'].includes(v.cleanup as string)?v.cleanup as 'complete'|'failed'|'unconfirmed':'unconfirmed';
      closureDiagnostic=Object.freeze({...closureDiagnostic!,termination,cleanup});if(termination!=='confirmed'||cleanup!=='complete')fail('worker_closure_settle');return opaque<WorkerClosureEvidence>();
    },handle=>{closureEvidence=handle;state='worker_closed';});},
    consumeWorkerClosure(b:object,evidence:object){return act('worker_closure_consume',b,()=>{
      const own=closureEvidence;closureEvidence=undefined;if(state!=='worker_closed'||!own||own!==evidence)fail('worker_closure_consume');state='consuming';
    },()=>Object.freeze({scope:'synthetic_worker_closure_consumption' as const,authority:'none' as const,closure_kind:facts!.worker_state==='none'?'no_generation' as const:'closed_generation' as const,point:facts!.point,input_state:closureDiagnostic!.input_state,id_state:closureDiagnostic!.id_state}),()=>{state='consumed';});},
    bind(value:SyntheticRecoverySeed){return act('binding',undefined,()=>{state='binding';},()=>{if(value!==seedRef)fail('binding');return opaque<OwnerBinding>();},handle=>{binding=handle;state='active';time=Object.freeze({started_at:pinned!.started_at,deadline_ms:pinned!.deadline_ms,observed_at:pinned!.observed_at,upper_utc:pinned!.upper_utc});});},
    observe(b:object,value:unknown){return act('observation',b,()=>{if(observationStarted||state!=='active')fail('observation');observationStarted=true;state='observing';},()=>{if(!equal(pinFacts(value),facts!))fail('observation');return opaque<ObservationHandle>();},handle=>{observation=handle;state='observed';soft=Object.freeze({kind:facts!.kind,phase:facts!.phase,point:facts!.point,worker_state:facts!.worker_state});});},
    claimRecovery(b:object,handle:object){return act('recovery_claim',b,()=>{
      const started=recoveryStarted,issued=observation;recoveryStarted=true;observation=undefined;if(started||state!=='observed'||!issued||issued!==handle)fail('recovery_claim');state='claiming';
    },()=>opaque<RecoveryHandle>(),handle=>{recovery=handle;state='claimed';});},
    consumeRecovery(b:object,handle:object){return act('recovery_consume',b,()=>{
      const issued=recovery;recovery=undefined;if(state!=='claimed'||!issued||issued!==handle)fail('recovery_consume');state='consuming';
    },()=>Object.freeze({scope:'synthetic_recovery_consumption' as const,kind:soft!.kind,phase:soft!.phase,point:soft!.point,authority:'none' as const}),()=>{state='consumed';});},
    preparePhase(b:object,handle:object,input:unknown){let model:ReturnType<typeof createSyntheticPhaseModel>;return act('phase_prepare',b,()=>{
      const issued=recovery;recovery=undefined;if(state!=='claimed'||!issued||issued!==handle||phaseModel)fail('phase_prepare');state='phase_planning';
    },()=>{const f=facts!;if(f.kind!=='phase_deadline')fail('phase_prepare');model=createSyntheticPhaseModel(pinned!,f as Extract<SyntheticSoftFacts,{kind:'phase_deadline'}>,input);return opaque<object>();},
    handle=>{phaseModel=model;phaseHandle=handle;state='phase_planned';});},
    phaseAttempt(b:object,plan:object,role:unknown){return act('phase_verify',b,()=>{model(plan,'phase_verify');},()=>model(plan,'phase_verify').dispatch(role));},
    phaseChunk(b:object,plan:object,attempt:object,identity:object,bytes:unknown){return act('phase_chunk',b,()=>{model(plan,'phase_chunk');},()=>model(plan,'phase_chunk').chunk(attempt,identity,bytes));},
    phaseOutcome(b:object,plan:object,attempt:object,outcome:unknown){let receipt:ReturnType<ReturnType<typeof createSyntheticPhaseModel>['take']>;return act('phase_verify',b,()=>{receipt=model(plan,'phase_verify').take(attempt);},()=>model(plan,'phase_verify').settle(receipt,outcome));},
    phaseRetry(b:object,plan:object){return act('phase_retry',b,()=>{model(plan,'phase_retry');},()=>model(plan,'phase_retry').retry());},
    phaseWorker(b:object,plan:object){return act('phase_worker',b,()=>{model(plan,'phase_worker');},()=>model(plan,'phase_worker').selectWorker());},
    phaseReady(b:object,plan:object,worker:object,context:unknown){return act('phase_ready',b,()=>{model(plan,'phase_ready').takeWorker(worker);},()=>model(plan,'phase_ready').ready(context));},
    phaseReadyFailure(b:object,plan:object,worker:object,reason:unknown){return act('phase_ready',b,()=>{model(plan,'phase_ready').takeWorker(worker);},()=>model(plan,'phase_ready').readyFailure(reason));},
    consumePhase(b:object,plan:object){let own:ReturnType<typeof createSyntheticPhaseModel>;return act('phase_consume',b,()=>{own=model(plan,'phase_consume');phaseHandle=undefined;state='phase_consuming';},()=>own.consume(),()=>{state='consumed';});},
    revoke(reason:unknown){if(state==='closed')return;try{fail('revoke',reason);}catch{/* fixed synchronous revocation */}},
    cleanupLease(b:object){return act('cleanup_lease',b,()=>{if(cleanupStarted)fail('cleanup_lease');cleanupStarted=true;},()=>opaque<CleanupDiagnosticHandle>(),handle=>{cleanupToken=handle;cleanupRequiresWorker=facts!.worker_state!=='none';});},
    recordCleanup(lease:object,status:unknown){
      // A previously issued, diagnostics-only sink can seal facts after hard stop.
      // It never calls the run health guard or issues a recovery/close capability.
      if(busy||state==='closed'||!cleanupToken||lease!==cleanupToken)return fail('cleanup_record',hard?.code);
      cleanupToken=undefined;
      const valid=cleanupRequiresWorker?['not_started','requested','confirmed','failed','unconfirmed'].includes(status as string):status==='not_required';
      cleanup=Object.freeze({scope:'synthetic_cleanup_snapshot',status:valid?status as CleanupStatus:'unconfirmed'});
      if(!valid||status!=='confirmed'&&status!=='not_required')fail('cleanup_record');
    },
    close(b:object){return act('close',b,()=>{},()=>{if(cleanupToken||phaseModel?.inFlight()||closureLease||closureEvidence||heldClosure||preparationHandle||generationCleanupToken||generationInputs||generationFrame||sealedPlan||transferredPlan)fail('close');},()=>{clear();time=null;state='closed';});},
    discardTerminalTime(){if(busy||state!=='failed'||time===null)return fail('discard',hard?.code);time=null;},
    inspect(){return Object.freeze({scope:'synthetic_soft_recovery_only' as const,state,time,observation_pending:!!observation,recovery_pending:!!recovery,cleanup_pending:!!cleanupToken,
      new_generation:generationClaimed?Object.freeze({claim_started:true,starts:generationStarts,ready_events:generationReadyEvents,cleanup:generationCleanup,cleanup_pending:!!generationCleanupToken}):null,
      worker_plan:planStarted?Object.freeze({...planCounts,seal_started:true,seals:planSeals,transfers:planTransfers,summaries:planSummaries,sealed_pending:!!sealedPlan,transferred_pending:!!transferredPlan,finish_calls:0}):null,
      claims:Object.freeze({observation_started:observationStarted,recovery_started:recoveryStarted,cleanup_started:cleanupStarted}),
      diagnostics:Object.freeze({soft,hard,cleanup}),phase:phaseModel?.inspect()??phaseDiagnostic,worker_closure:closureDiagnostic?Object.freeze({...closureDiagnostic,lease_pending:!!closureLease,evidence_pending:!!closureEvidence}):null,worker_preparation:preparationStarted?Object.freeze({...preparationDiagnostic,...(workerVerify||verifyDiagnostic?{verify:workerVerify?.inspect()??verifyDiagnostic,accounting:(workerVerify?.inspect()??verifyDiagnostic)!.accounting}:{}),claim_started:true,held:!!heldClosure,handle_pending:!!preparationHandle,transfers,generation_uses:generationUses,verify_attempts:(workerVerify?.inspect()??verifyDiagnostic)?.attempts??0,new_generations:generationStarts}):null,permissions:Object.freeze({formal_issuance:false,dispatch:false,recovery_route:false})});},
  });
}
