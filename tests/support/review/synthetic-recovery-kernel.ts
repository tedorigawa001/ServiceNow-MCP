/** RB-A: shared package-excluded recovery lifecycle; constructs fresh roots only. */
import {types} from 'node:util';
import {z} from 'zod';
import {createSyntheticPhaseModel} from './synthetic-phase-recovery.js';
import {prepareSyntheticWorkerRecoveryInputs} from './synthetic-worker-recovery-input.js';
import {createSyntheticWorkerVerify} from './synthetic-worker-recovery-verify.js';
import {projectSyntheticFinishPlanBinding} from './synthetic-finish-plan-binding.js';
import type {SyntheticFinishPins} from './synthetic-finish-pins.js';
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
type Phase='binding'|'observation'|'recovery_claim'|'recovery_consume'|'cleanup_lease'|'cleanup_record'|'revoke'|'close'|'discard'|'phase_prepare'|'phase_verify'|'phase_chunk'|'phase_retry'|'phase_worker'|'phase_ready'|'phase_consume'|'worker_closure_begin'|'worker_closure_settle'|'worker_closure_consume'|'worker_prepare'|'worker_prepare_discard'|'worker_verify'|'generation_claim'|'generation_start'|'generation_ready'|'generation_cleanup'|'generation_discard'|'worker_plan'|'source_lifecycle'|'finish_binding'|'finish_discard'|'finish_issue';
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
declare const finishEvidenceBrand:unique symbol;
type SyntheticIssuedFinishContext=Readonly<{[finishEvidenceBrand]:'synthetic_issued_finish_context'}>;
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
function createRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined,tracked:boolean,providedPins?:SyntheticFinishPins){
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
  const source=tracked?{reference:pinned?.source,identity:opaque<object>() as object|undefined,status:'open' as 'open'|'closing'|'closed'|'failed',close_started:false,completion:'none' as 'none'|'closed'|'failed'|'unconfirmed'}:undefined;
  let liveCleanup:{frame:object|undefined;identity:object|undefined;sink:object|undefined;started:boolean;serial:0|1;settled:boolean}|undefined;
  let readyOrigin:Readonly<{owner:object;frame:object;lease:object;event:object;source:object;cleanup:object}>|undefined;
  const hasFinish=providedPins!==undefined;let finishPins=providedPins,finishStarted=false,finishDiscards=false,finishBindings=0;
  let finishState:'unused'|'checking'|'bound'|'invalidated'|'discarding'|'discarded'|'failed'='unused';
  let finishStats:ReturnType<typeof projectSyntheticFinishPlanBinding>['stats']|null=null;
  let finishBound:Readonly<{plan:SealedRecoveryPlan;handoff:object;origin:object;source:object;cleanup:object;projection:ReturnType<typeof projectSyntheticFinishPlanBinding>}>|undefined;
  let issueStarted=false,issueCount=0;
  let issueState:'unused'|'issuing'|'issued'|'invalidated'|'discarded'|'failed'='unused';
  let issuedFinish:Readonly<{handle:SyntheticIssuedFinishContext;bound:NonNullable<typeof finishBound>;projection:ReturnType<typeof projectSyntheticFinishPlanBinding>}>|undefined;
  function invalidateFinish(){finishBound=undefined;issuedFinish=undefined;if(issueState==='issued')issueState='invalidated';if(hasFinish&&finishState==='bound')finishState='invalidated';}
  function readyUsable(){return !!(tracked&&readyOrigin&&binding===readyOrigin.owner&&source?.status==='open'&&source.reference===pinned?.source&&source.identity===readyOrigin.source&&liveCleanup?.identity===readyOrigin.cleanup&&liveCleanup.frame===readyOrigin.frame&&!liveCleanup.started&&!liveCleanup.settled&&generationCleanupToken===liveCleanup.sink&&generationCleanupContext?.frame===readyOrigin.frame);}
  function clear(){finishBound=undefined;finishPins=undefined;issuedFinish=undefined;if(hasFinish&&state==='failed'){finishState='failed';issueState='failed';}if(source){source.status=state==='failed'?'failed':'closed';source.reference=source.identity=undefined;readyOrigin=undefined;}if(phaseModel){phaseModel.dispose();phaseDiagnostic=phaseModel.inspect();phaseModel=undefined;}if(workerVerify){workerVerify.dispose();verifyDiagnostic=workerVerify.inspect();workerVerify=undefined;}sealedPlan=transferredPlan=undefined;planHandle=handoffHandle=undefined;generationStart=generationLease=generationDiscard=undefined;generationEvent=generationFrame=generationInputs=undefined;if(!generationTicketPublished&&!generationStarts){generationCleanupToken=generationCleanupContext=undefined;}if(liveCleanup&&!generationCleanupToken)liveCleanup.frame=liveCleanup.identity=liveCleanup.sink=undefined;heldClosure=undefined;preparationHandle=undefined;phaseHandle=closureLease=closureEvidence=undefined;binding=observation=recovery=seedRef=expectedRef=undefined;pinned=facts=undefined;}
  function fail(phase:Phase,raw?:unknown):never{
    if(state==='closed')throw Error('internal_review_error');hard??=Object.freeze({code:code(raw),phase});state='failed';clear();throw Object.assign(Error(hard.code),{code:hard.code});
  }
  function guard(phase:Phase){
    const reason=check();if(reason!==undefined)fail(phase,reason);if(hard)fail(phase,hard.code);
    if(!seedRef||!expectedRef||!pinned||!facts||!equal(pinSeed(seedRef),pinned)||!equal(pinFacts(expectedRef),facts))fail(phase);
    if(tracked){
      if(source?.status!=='open'&&!['source_lifecycle','generation_cleanup','generation_discard','worker_prepare_discard','finish_discard','close','discard'].includes(phase))fail(phase);
      if(['generation_claim','generation_start','generation_ready','worker_plan','finish_binding','finish_issue'].includes(phase)&&liveCleanup?.started)fail(phase);
    }
  }
  function model(handle:object,phase:Phase){if(!phaseModel||handle!==phaseHandle)fail(phase);return phaseModel!;}
  function act<T>(phase:Phase,b:object|undefined,claim:()=>void,work:()=>T,commit:(v:T)=>void=()=>{}):T{
    if(busy||hard||state==='closed'||(phase==='binding'?state!=='fresh':!binding||b!==binding))return fail(phase,hard?.code);
    busy=true;try{claim();guard(phase);const value=work();guard(phase);commit(value);return value;}catch(error){return fail(phase,error);}finally{busy=false;}
  }
  function verifyModel(handle:object){if(state!=='worker_prepared'||handle!==preparationHandle||!heldClosure||!workerVerify)fail('worker_verify');return workerVerify!;}
  function planOk(p:SealedRecoveryPlan){
    return !(p.owner!==binding||p.seed!==pinned||p.time!==time||generationStarts!==1||generationReadyEvents!==1||(generationCleanupToken?generationCleanupContext?.frame!==p.frame:generationCleanup?.status!=='confirmed'));
  }
  function checkPlan(p:SealedRecoveryPlan){if(!planOk(p))fail('worker_plan');}
  function takePlan(handle:object){const own=planHandle,p=sealedPlan;planHandle=undefined;sealedPlan=undefined;if(state!=='plan_sealed'||!own||handle!==own||!p)fail('worker_plan');checkPlan(p!);return p!;}
  function finishProjection(p:SealedRecoveryPlan,phase:'finish_binding'|'finish_issue'='finish_binding'){
    if(!tracked||!finishPins||!readyUsable()||!source?.identity||!liveCleanup?.identity||!generationCleanupToken||readyOrigin?.frame!==p.frame)fail(phase);
    checkPlan(p);
    return projectSyntheticFinishPlanBinding(finishPins!,p,{owner:binding!,frame:p.frame,source:source!.reference!,source_identity:source!.identity!,cleanup_identity:liveCleanup!.identity!,sink:generationCleanupToken!,ready_origin:readyOrigin!,serial:0});
  }
  function boundOk(handoff:object){
    return !(!finishBound||finishState!=='bound'||handoff!==finishBound.handoff||handoff!==handoffHandle||transferredPlan!==finishBound.plan||!readyUsable()||readyOrigin!==finishBound.origin||source?.identity!==finishBound.source||liveCleanup?.identity!==finishBound.cleanup);
  }
  function checkBound(handoff:object,phase:'finish_binding'|'finish_issue'='finish_binding'){if(!boundOk(handoff))fail(phase);}
  return Object.freeze({
    issueFinishContext(b:object,handoff:object){let own:NonNullable<typeof finishBound>,projection:ReturnType<typeof projectSyntheticFinishPlanBinding>|undefined,projectionFailed=false;return act('finish_issue',b,()=>{
      const used=issueStarted;issueStarted=true;issueState='issuing';if(!hasFinish||used||state!=='plan_transferred')fail('finish_issue');
    },()=>{
      // Value/identity mismatches are held (no hard yet) so a post-guard stop keeps priority; commit rejects them.
      if(!boundOk(handoff)||!finishPins||!source?.identity||!liveCleanup?.identity||!generationCleanupToken||readyOrigin?.frame!==finishBound!.plan.frame||!planOk(finishBound!.plan))projectionFailed=true;
      else{own=finishBound!;try{projection=projectSyntheticFinishPlanBinding(finishPins,own.plan,{owner:binding!,frame:own.plan.frame,source:source.reference!,source_identity:source.identity,cleanup_identity:liveCleanup.identity,sink:generationCleanupToken,ready_origin:readyOrigin!,serial:0});}catch{projectionFailed=true;}}
      return opaque<SyntheticIssuedFinishContext>();},handle=>{
      if(projectionFailed||!projection||!own||finishBound!==own)fail('finish_issue');checkBound(handoff,'finish_issue');
      issuedFinish=Object.freeze({handle,bound:own,projection:projection!});issueCount=1;issueState='issued';
    });},
    bindRecoveryPlan(b:object,handoff:object){let projection:ReturnType<typeof projectSyntheticFinishPlanBinding>|undefined,projectionFailed=false;return act('finish_binding',b,()=>{
      const used=finishStarted;finishStarted=true;finishState='checking';if(!hasFinish||used||state!=='plan_transferred'||handoff!==handoffHandle||!transferredPlan)fail('finish_binding');
    },()=>{try{projection=finishProjection(transferredPlan!);}catch{projectionFailed=true;}},()=>{
      if(projectionFailed||!projection||!readyUsable()||!source?.identity||!liveCleanup?.identity)fail('finish_binding');
      finishBound=Object.freeze({plan:transferredPlan!,handoff,origin:readyOrigin!,source:source.identity,cleanup:liveCleanup.identity,projection:projection!});finishStats=projection!.stats;finishBindings=1;finishState='bound';
    });},
    checkBoundRecoveryPlan(b:object,handoff:object){return act('finish_binding',b,()=>{checkBound(handoff);},()=>{},()=>{checkBound(handoff);});},
    discardBoundRecoveryPlan(b:object,handoff:object){return act('finish_discard',b,()=>{
      const used=finishDiscards;finishDiscards=true;finishState='discarding';
      const p=transferredPlan,own=handoffHandle;transferredPlan=undefined;handoffHandle=undefined;finishBound=undefined;issuedFinish=undefined;
      if(!hasFinish||used||finishBindings!==1||state!=='plan_transferred'||!p||handoff!==own||source?.status!=='closed'||source.completion!=='closed'||generationCleanupToken||generationCleanup?.status!=='confirmed')fail('finish_discard');checkPlan(p!);
    },()=>{},()=>{finishState='discarded';if(issueStarted)issueState='discarded';state='consumed';});},
    beginSourceClose(b:object){return act('source_lifecycle',b,()=>{
      if(!tracked||!source||source.status!=='open'||source.close_started)fail('source_lifecycle');
      source!.close_started=true;source!.status='closing';readyOrigin=undefined;invalidateFinish();
    },()=>{});},
    settleSourceClose(b:object,status:unknown){return act('source_lifecycle',b,()=>{
      if(!tracked||!source?.close_started||source.status!=='closing')fail('source_lifecycle');
    },()=>{source!.completion=status==='closed'?'closed':status==='failed'?'failed':'unconfirmed';if(status!=='closed')fail('source_lifecycle');source!.status='closed';readyOrigin=undefined;});},
    checkWorkerGenerationReady(b:object,ready:object){return act('generation_ready',b,()=>{
      if(!tracked||state!=='generation_ready'||ready!==generationDiscard||!readyUsable())fail('generation_ready');
    },()=>{});},
    beginWorkerGenerationCleanup(sink:object){
      // Cleanup-only claim: safe after hard stop; it never runs the healthy-run guard.
      if(!tracked||state==='closed'||!generationCleanupToken||sink!==generationCleanupToken||!generationCleanupContext||!liveCleanup||liveCleanup.sink!==sink||liveCleanup.frame!==generationCleanupContext.frame||liveCleanup.started||liveCleanup.settled)fail('generation_cleanup',hard?.code);
      liveCleanup!.started=true;liveCleanup!.serial=1;readyOrigin=undefined;invalidateFinish();
      if(busy)fail('generation_cleanup',hard?.code);
      generationCleanup=Object.freeze({status:generationCleanupContext!.started?'requested':'not_required'});
    },
    transferWorkerRecoveryPlan(b:object,handle:object){let p:SealedRecoveryPlan;return act('worker_plan',b,()=>{p=takePlan(handle);},()=>{
      transferredPlan=p;planTransfers=1;return opaque<RecoveryPlanHandoff>();
    },handoff=>{handoffHandle=handoff;state='plan_transferred';});},
    discardTransferredWorkerRecoveryPlan(b:object,handoff:object){const phase=hasFinish?'finish_discard':'worker_plan';return act(phase,b,()=>{
      const p=transferredPlan,own=handoffHandle;transferredPlan=undefined;handoffHandle=undefined;
      if(finishStarted||state!=='plan_transferred'||!p||!own||handoff!==own||generationCleanupToken||generationCleanup?.status!=='confirmed')fail(phase);checkPlan(p!);
    },()=>{},()=>{state='consumed';});},
    summarizeWorkerRecoveryPlan(b:object,handle:object){let p:SealedRecoveryPlan;return act('worker_plan',b,()=>{p=takePlan(handle);},()=>{
      const errors:Readonly<{stage:'analysis'|'consistency';code:string}>[]=[Object.freeze({stage:'analysis',code:'deadline_exceeded'})];if(p.verify.verify_error)errors.push(Object.freeze({stage:'consistency',code:p.verify.verify_error}));if(p.verify.consistency==='changed')errors.push(Object.freeze({stage:'consistency',code:'changed_during_review'}));
      return Object.freeze({scope:'synthetic_worker_recovery_plan' as const,authority:'none' as const,mode:'new_generation' as const,assets:p.inputs.assets,inputs:Object.freeze(p.inputs.inputs.map(x=>Object.freeze({update_xml_sys_id:x.update_xml_sys_id,retrieved_at:x.retrieved_at,state:x.state}))),time:p.time,accounting:p.verify.accounting,collection_status:p.inputs.collection_status,run_status:p.inputs.collection_status==='failed'?'failed' as const:'partial' as const,consistency:p.verify.consistency,limitations:Object.freeze(['soft_deadline_reached','deadline_exceeded',...p.verify.limitations]),errors:Object.freeze(errors)});
    },()=>{planSummaries=1;state='consumed';});},
    sealWorkerRecoveryPlan(b:object,ready:object){return act('worker_plan',b,()=>{
      const used=planStarted,own=generationDiscard;planStarted=true;generationDiscard=undefined;
      if(used||state!=='generation_ready'||!own||ready!==own||!generationFrame||!generationInputs||!time||workerVerify?.inspect().stage!=='verified'||hasFinish&&!readyUsable())fail('worker_plan');
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
      if(tracked)liveCleanup={frame:generationFrame,identity:opaque(),sink:cleanup,started:false,serial:0,settled:false};
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
    },()=>opaque<GenerationReady>(),handle=>{
      generationReadyEvents=1;generationDiscard=handle;state='generation_ready';
      if(tracked){if(!source?.identity||!liveCleanup?.identity||liveCleanup.started||liveCleanup.frame!==generationFrame)fail('generation_ready');readyOrigin=Object.freeze({owner:binding!,frame:generationFrame!,lease:own!,event:issued!.handle,source:source.identity,cleanup:liveCleanup.identity});}
    });},
    failWorkerGeneration(b:object,lease:object,reason:unknown){return act('generation_ready',b,()=>{
      const own=generationLease;generationLease=undefined;generationEvent=undefined;if(state!=='generation_waiting'||!own||lease!==own)fail('generation_ready');
    },()=>fail('generation_ready',reason==='worker_unavailable'||reason==='cancelled'||reason==='deadline_exceeded'?reason:'internal_review_error'));},
    recordWorkerGenerationCleanup(sink:object,status:unknown){
      // Preissued new-frame sink is diagnostics only, including after hard stop.
      if(busy||state==='closed'||!generationCleanupToken||sink!==generationCleanupToken||!generationCleanupContext)return fail('generation_cleanup',hard?.code);
      const validStart=!tracked||!!(liveCleanup?.started&&liveCleanup.sink===sink&&liveCleanup.frame===generationCleanupContext.frame&&!liveCleanup.settled);
      generationCleanupToken=undefined;const started=generationCleanupContext.started;generationCleanupContext=undefined;
      if(tracked&&liveCleanup){liveCleanup.settled=true;liveCleanup.frame=liveCleanup.identity=liveCleanup.sink=undefined;readyOrigin=undefined;}
      invalidateFinish();
      const valid=validStart&&(started?['not_started','requested','confirmed','failed','unconfirmed'].includes(status as string):status==='not_required');
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
    close(b:object){return act('close',b,()=>{},()=>{if(cleanupToken||phaseModel?.inFlight()||closureLease||closureEvidence||heldClosure||preparationHandle||generationCleanupToken||generationInputs||generationFrame||sealedPlan||transferredPlan||issuedFinish||source?.status==='closing')fail('close');},()=>{clear();time=null;state='closed';});},
    discardTerminalTime(){if(busy||state!=='failed'||time===null)return fail('discard',hard?.code);time=null;},
    inspect(){return Object.freeze({scope:'synthetic_soft_recovery_only' as const,state,time,observation_pending:!!observation,recovery_pending:!!recovery,cleanup_pending:!!cleanupToken,
      ...(hasFinish?{finish_binding:Object.freeze({state:finishState,started:finishStarted,bindings:finishBindings,active:!!finishBound&&readyUsable(),discard_started:finishDiscards,...finishStats})}:{}),
      ...(hasFinish?{finish_issue:Object.freeze({state:issueState,started:issueStarted,issues:issueCount,pending:!!issuedFinish})}:{}),
      ...(tracked?{lifecycle:Object.freeze({source:source!.status,source_close_started:source!.close_started,source_completion:source!.completion,worker_started:generationStarts===1,cleanup_started:liveCleanup?.started??false,cleanup_serial:liveCleanup?.serial??0,cleanup_settled:liveCleanup?.settled??false,ready_origin:!!readyOrigin,ready_usable:readyUsable()})}:{}),
      new_generation:generationClaimed?Object.freeze({claim_started:true,starts:generationStarts,ready_events:generationReadyEvents,cleanup:generationCleanup,cleanup_pending:!!generationCleanupToken}):null,
      worker_plan:planStarted?Object.freeze({...planCounts,seal_started:true,seals:planSeals,transfers:planTransfers,summaries:planSummaries,sealed_pending:!!sealedPlan,transferred_pending:!!transferredPlan,finish_calls:0}):null,
      claims:Object.freeze({observation_started:observationStarted,recovery_started:recoveryStarted,cleanup_started:cleanupStarted}),
      diagnostics:Object.freeze({soft,hard,cleanup}),phase:phaseModel?.inspect()??phaseDiagnostic,worker_closure:closureDiagnostic?Object.freeze({...closureDiagnostic,lease_pending:!!closureLease,evidence_pending:!!closureEvidence}):null,worker_preparation:preparationStarted?Object.freeze({...preparationDiagnostic,...(workerVerify||verifyDiagnostic?{verify:workerVerify?.inspect()??verifyDiagnostic,accounting:(workerVerify?.inspect()??verifyDiagnostic)!.accounting}:{}),claim_started:true,held:!!heldClosure,handle_pending:!!preparationHandle,transfers,generation_uses:generationUses,verify_attempts:(workerVerify?.inspect()??verifyDiagnostic)?.attempts??0,new_generations:generationStarts}):null,permissions:Object.freeze({formal_issuance:false,dispatch:false,recovery_route:false})});},
  });
}
/** Legacy/RB-A roots retain exactly their original method surface and behavior. */
export function createSyntheticRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined=()=>undefined){
  const {beginSourceClose,settleSourceClose,checkWorkerGenerationReady,beginWorkerGenerationCleanup,bindRecoveryPlan,checkBoundRecoveryPlan,discardBoundRecoveryPlan,issueFinishContext,...legacy}=createRecoveryKernel(seed,expected,check,false);
  void beginSourceClose;void settleSourceClose;void checkWorkerGenerationReady;void beginWorkerGenerationCleanup;
  void bindRecoveryPlan;void checkBoundRecoveryPlan;void discardBoundRecoveryPlan;void issueFinishContext;
  type Snapshot=ReturnType<typeof legacy.inspect>;type Hard=NonNullable<Snapshot['diagnostics']['hard']>;
  type LegacySnapshot=Readonly<Omit<Snapshot,'lifecycle'|'finish_binding'|'finish_issue'|'diagnostics'>&{diagnostics:Readonly<Omit<Snapshot['diagnostics'],'hard'>&{hard:Readonly<Omit<Hard,'phase'>&{phase:Exclude<Phase,'source_lifecycle'|'finish_binding'|'finish_discard'|'finish_issue'>}>|null}>}>;
  return Object.freeze(legacy) as Omit<typeof legacy,'inspect'>&{inspect():LegacySnapshot};
}
/** Fresh tracked root only; no existing kernel, owner or mutable mode can be supplied. */
export function createSyntheticLifecycleRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined=()=>undefined){
  const {bindRecoveryPlan,checkBoundRecoveryPlan,discardBoundRecoveryPlan,issueFinishContext,...lifecycle}=createRecoveryKernel(seed,expected,check,true);void bindRecoveryPlan;void checkBoundRecoveryPlan;void discardBoundRecoveryPlan;void issueFinishContext;
  type Snapshot=ReturnType<typeof lifecycle.inspect>;type Hard=NonNullable<Snapshot['diagnostics']['hard']>;
  type LifecycleSnapshot=Readonly<Omit<Snapshot,'finish_binding'|'finish_issue'|'diagnostics'>&{diagnostics:Readonly<Omit<Snapshot['diagnostics'],'hard'>&{hard:Readonly<Omit<Hard,'phase'>&{phase:Exclude<Phase,'finish_binding'|'finish_discard'|'finish_issue'>}>|null}>}>;
  return Object.freeze(lifecycle) as Omit<typeof lifecycle,'inspect'>&{inspect():LifecycleSnapshot};
}
/** Constructor-only pin supply; never accepts an existing owner/kernel or registration callback. */
export function createSyntheticFinishBindingKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,pins:SyntheticFinishPins|undefined,check:()=>string|undefined=()=>undefined){return createRecoveryKernel(seed,expected,check,true,pins);}
