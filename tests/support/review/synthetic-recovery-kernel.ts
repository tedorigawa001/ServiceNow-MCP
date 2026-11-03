/** RB-A: shared package-excluded recovery lifecycle; constructs fresh roots only. */
import {types} from 'node:util';
import {z} from 'zod';
import {createSyntheticPhaseModel} from './synthetic-phase-recovery.js';
import {prepareSyntheticWorkerRecoveryInputs} from './synthetic-worker-recovery-input.js';
import {createSyntheticWorkerVerify} from './synthetic-worker-recovery-verify.js';
import {projectSyntheticFinishPlanBinding} from './synthetic-finish-plan-binding.js';
import {compareSyntheticFinishValues} from './synthetic-finish-context-values.js';
import {projectRecoveryFinishExpectation} from './synthetic-recovery-finish-values.js';
import {createSyntheticFinishPins,type SyntheticFinishPins} from './synthetic-finish-pins.js';
import {modelSyntheticParentOmission} from './synthetic-parent-omission-values.js';
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
type Phase='binding'|'observation'|'recovery_claim'|'recovery_consume'|'cleanup_lease'|'cleanup_record'|'revoke'|'close'|'discard'|'phase_prepare'|'phase_verify'|'phase_chunk'|'phase_retry'|'phase_worker'|'phase_ready'|'phase_consume'|'worker_closure_begin'|'worker_closure_settle'|'worker_closure_consume'|'worker_prepare'|'worker_prepare_discard'|'worker_verify'|'generation_claim'|'generation_start'|'generation_ready'|'generation_cleanup'|'generation_discard'|'worker_plan'|'source_lifecycle'|'finish_binding'|'finish_discard'|'finish_issue'|'finish_accept'|'finish_accepted_discard'|'finish_seal';
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
declare const acceptedFinishBrand:unique symbol;
type SyntheticAcceptedFinishContext=Readonly<{[acceptedFinishBrand]:'synthetic_accepted_finish_context'}>;
declare const finishExpectationBrand:unique symbol;
type SealedRecoveryFinishExpectation=Readonly<{[finishExpectationBrand]:'synthetic_sealed_recovery_finish_expectation'}>;
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
function createRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined,tracked:boolean,providedPins?:SyntheticFinishPins,failureLink?:FailureKernelLink){
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
  if(source?.identity&&source.reference)failureLink?.sourceBorn(source.identity,source.reference);
  let liveCleanup:{frame:object|undefined;identity:object|undefined;sink:object|undefined;started:boolean;serial:0|1;settled:boolean}|undefined;
  let readyOrigin:Readonly<{owner:object;frame:object;lease:object;event:object;source:object;cleanup:object}>|undefined;
  const hasFinish=providedPins!==undefined;let finishPins=providedPins,finishStarted=false,finishDiscards=false,finishBindings=0;
  let finishState:'unused'|'checking'|'bound'|'accepting'|'accepted'|'sealed'|'invalidated'|'discarding'|'discarded'|'failed'='unused';
  let finishStats:ReturnType<typeof projectSyntheticFinishPlanBinding>['stats']|null=null;
  let finishBound:Readonly<{plan:SealedRecoveryPlan;handoff:object;origin:object;source:object;cleanup:object;projection:ReturnType<typeof projectSyntheticFinishPlanBinding>}>|undefined;
  let issueStarted=false,issueCount=0;
  let issueState:'unused'|'issuing'|'issued'|'consumed'|'invalidated'|'discarded'|'failed'='unused';
  let issuedFinish:Readonly<{handle:SyntheticIssuedFinishContext;bound:NonNullable<typeof finishBound>;projection:ReturnType<typeof projectSyntheticFinishPlanBinding>}>|undefined;
  let acceptStarted=false,acceptCount=0,routeSpent=false;
  let acceptState:'unused'|'accepting'|'accepted'|'sealed'|'invalidated'|'discarding'|'discarded'|'failed'='unused';
  let acceptedFinish:Readonly<{handle:SyntheticAcceptedFinishContext;projection:ReturnType<typeof projectSyntheticFinishPlanBinding>;bound:NonNullable<typeof finishBound>}>|undefined;
  // Terminal-only ownership survives live-route invalidation; only fixed accepted discard consumes it.
  let acceptedTermination:Readonly<{handle:SyntheticAcceptedFinishContext;frame:object;source:object;cleanup:object;sink:object}>|undefined;
  let acceptedSourceClosed:typeof acceptedTermination,acceptedCleanupConfirmed:typeof acceptedTermination;
  let acceptedDiscardStarted=false,acceptedDiscards=0;
  let sealStarted=false,sealCount=0;
  let sealState:'unused'|'sealing'|'sealed'|'invalidated'|'discarding'|'discarded'|'failed'='unused';
  let sealedFinish:Readonly<{handle:SealedRecoveryFinishExpectation;accepted:SyntheticAcceptedFinishContext;bound:NonNullable<typeof finishBound>;expectation:ReturnType<typeof projectRecoveryFinishExpectation>}>|undefined;
  let sealUsage:ReturnType<typeof projectRecoveryFinishExpectation>['usage']|null=null;
  type AcceptPending=Readonly<{plan:SealedRecoveryPlan|undefined;handoff:RecoveryPlanHandoff|undefined;bound:typeof finishBound;issue:typeof issuedFinish;route_used:boolean}>;
  function invalidateFinish(){finishBound=undefined;issuedFinish=undefined;acceptedFinish=undefined;sealedFinish=undefined;if(sealState==='sealed')sealState='invalidated';if(acceptState==='accepted'||acceptState==='sealed')acceptState='invalidated';if(issueState==='issued')issueState='invalidated';if(hasFinish&&(finishState==='bound'||finishState==='accepted'||finishState==='sealed'))finishState='invalidated';}
  function readyUsable(){return !!(tracked&&readyOrigin&&binding===readyOrigin.owner&&source?.status==='open'&&source.reference===pinned?.source&&source.identity===readyOrigin.source&&liveCleanup?.identity===readyOrigin.cleanup&&liveCleanup.frame===readyOrigin.frame&&!liveCleanup.started&&!liveCleanup.settled&&generationCleanupToken===liveCleanup.sink&&generationCleanupContext?.frame===readyOrigin.frame);}
  function clear(){finishBound=undefined;finishPins=undefined;issuedFinish=undefined;acceptedFinish=undefined;sealedFinish=undefined;acceptedTermination=acceptedSourceClosed=acceptedCleanupConfirmed=undefined;if(hasFinish&&state==='failed'){finishState='failed';issueState='failed';acceptState='failed';sealState='failed';}if(source){source.status=state==='failed'?'failed':'closed';source.reference=source.identity=undefined;readyOrigin=undefined;}if(phaseModel){phaseModel.dispose();phaseDiagnostic=phaseModel.inspect();phaseModel=undefined;}if(workerVerify){workerVerify.dispose();verifyDiagnostic=workerVerify.inspect();workerVerify=undefined;}sealedPlan=transferredPlan=undefined;planHandle=handoffHandle=undefined;generationStart=generationLease=generationDiscard=undefined;generationEvent=generationFrame=generationInputs=undefined;if(!generationTicketPublished&&!generationStarts&&!failureLink?.hasNewSink()){generationCleanupToken=generationCleanupContext=undefined;}if(liveCleanup&&!generationCleanupToken)liveCleanup.frame=liveCleanup.identity=liveCleanup.sink=undefined;heldClosure=undefined;preparationHandle=undefined;phaseHandle=closureLease=closureEvidence=undefined;binding=observation=recovery=seedRef=expectedRef=undefined;pinned=facts=undefined;}
  function fail(phase:Phase,raw?:unknown):never{
    if(state==='closed')throw Error('internal_review_error');hard??=Object.freeze({code:code(raw),phase});state='failed';
    try{failureLink?.beforeClear(hard.code,hard.phase,{source:source?.identity,reference:source?.reference,
      old_worker:facts&&'worker' in facts?facts.worker:undefined,old_generation:facts&&'generation' in facts?facts.generation:undefined,
      new_frame:generationCleanupContext?.frame,new_sink:generationCleanupToken});}finally{clear();}
    throw Object.assign(Error(hard.code),{code:hard.code});
  }
  function guard(phase:Phase){
    const reason=check();if(reason!==undefined)fail(phase,reason);if(hard)fail(phase,hard.code);
    if(!seedRef||!expectedRef||!pinned||!facts||!equal(pinSeed(seedRef),pinned)||!equal(pinFacts(expectedRef),facts))fail(phase);
    if(tracked){
      if(source?.status!=='open'&&!['source_lifecycle','generation_cleanup','generation_discard','worker_prepare_discard','finish_discard','finish_accepted_discard','close','discard'].includes(phase))fail(phase);
      if(['generation_claim','generation_start','generation_ready','worker_plan','finish_binding','finish_issue','finish_accept','finish_seal'].includes(phase)&&liveCleanup?.started)fail(phase);
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
  function acceptPendingOk(p:AcceptPending,handoff:object,evidence:object){
    return !!(p.plan&&p.handoff&&p.bound&&p.issue&&!p.route_used&&p.handoff===handoff&&p.bound.handoff===handoff&&p.issue.handle===evidence&&p.issue.bound===p.bound&&p.plan===p.bound.plan&&p.issue.projection.snapshot.plan===p.plan&&planOk(p.plan)&&readyUsable()&&readyOrigin===p.bound.origin&&source?.identity===p.bound.source&&liveCleanup?.identity===p.bound.cleanup&&readyOrigin?.frame===p.plan.frame);
  }
  function sealPendingOk(own:typeof acceptedFinish,accepted:object){
    return !!(own&&own.handle===accepted&&own.projection.snapshot.plan===own.bound.plan&&acceptCount===1&&routeSpent&&acceptState==='accepted'&&finishState==='accepted'&&planOk(own.bound.plan)&&readyUsable()&&readyOrigin===own.bound.origin&&readyOrigin?.frame===own.bound.plan.frame&&source?.identity===own.bound.source&&liveCleanup?.identity===own.bound.cleanup&&liveCleanup.serial===0&&acceptedTermination?.handle===own.handle&&acceptedTermination.frame===own.bound.plan.frame&&acceptedTermination.source===own.bound.source&&acceptedTermination.cleanup===own.bound.cleanup&&acceptedTermination.sink===generationCleanupToken);
  }
  return Object.freeze({
    sealRecoveryFinishExpectation(b:object,accepted:object){let own:typeof acceptedFinish,expectation:ReturnType<typeof projectRecoveryFinishExpectation>|undefined,mismatch=false;return act('finish_seal',b,()=>{
      const used=sealStarted;sealStarted=true;sealState='sealing';own=acceptedFinish;acceptedFinish=undefined;
      if(!hasFinish||used||acceptCount!==1||state!=='consumed')fail('finish_seal');
    },()=>{
      if(!sealPendingOk(own,accepted)||!finishPins||!source?.identity||!liveCleanup?.identity||!generationCleanupToken)mismatch=true;
      else try{
        const projection=projectSyntheticFinishPlanBinding(finishPins,own!.bound.plan,{owner:binding!,frame:own!.bound.plan.frame,source:source.reference!,source_identity:source.identity,cleanup_identity:liveCleanup.identity,sink:generationCleanupToken,ready_origin:readyOrigin!,serial:0});
        compareSyntheticFinishValues(projection.snapshot,own!.projection.snapshot);
        const s=projection.snapshot,c=s.run_context;
        if(s.selected.some((id,n)=>n>0&&s.selected[n-1]>=id))throw Error();
        expectation=projectRecoveryFinishExpectation({kind:'synthetic_recovery_finish_expectation_v1',binding:{owner:s.owner,plan:s.plan,run:c.run,session:c.session,source:c.source,key:c.key,origin:c.origin,budget:c.budget,release:c.release,window:c.window,frame:s.route.frame,accepted_origin:own!.handle},
          time:{started_at:c.started_at,deadline_ms:c.deadline_ms,observed_at:c.observed_at,upper_utc:c.upper_utc},header:s.header,selected:s.selected,inputs:s.inputs,outcomes:s.outcomes,run_status:s.header.collection.status==='failed'?'failed':'partial',consistency:own!.bound.plan.verify.consistency,
          content_evidence:{original_body:'unknown',full_schema:'unverified',wire:'unverified'}});
      }catch{mismatch=true;}
      return opaque<SealedRecoveryFinishExpectation>();
    },handle=>{
      if(mismatch||!expectation||!sealPendingOk(own,accepted))fail('finish_seal');
      sealedFinish=Object.freeze({handle,accepted:own!.handle,bound:own!.bound,expectation:expectation!});sealUsage=expectation!.usage;sealCount=1;sealState='sealed';acceptState='sealed';finishState='sealed';
    });},
    discardAcceptedFinishContext(b:object,accepted:object){let own:typeof acceptedTermination,sourceProof:typeof acceptedTermination,cleanupProof:typeof acceptedTermination;
      const valid=()=>!!(own&&own.handle===accepted&&sourceProof===own&&cleanupProof===own&&source?.identity===own.source&&source.reference===pinned?.source&&source.close_started&&source.status==='closed'&&source.completion==='closed'&&!generationCleanupToken&&!generationCleanupContext&&generationCleanup?.status==='confirmed'&&liveCleanup?.started&&liveCleanup.serial===1&&liveCleanup.settled);
      return act('finish_accepted_discard',b,()=>{
        const used=acceptedDiscardStarted;acceptedDiscardStarted=true;own=acceptedTermination;sourceProof=acceptedSourceClosed;cleanupProof=acceptedCleanupConfirmed;
        acceptedTermination=acceptedSourceClosed=acceptedCleanupConfirmed=undefined;acceptedFinish=undefined;sealedFinish=undefined;if(sealStarted)sealState='discarding';acceptState='discarding';finishState='discarding';
        if(!hasFinish||used||acceptCount!==1||state!=='consumed')fail('finish_accepted_discard');
      },()=>{ /* No hard mismatch before post-guard; commit rechecks the fixed terminal receipts. */ },()=>{
        if(!valid())fail('finish_accepted_discard');acceptedDiscards=1;acceptState='discarded';finishState='discarded';if(sealStarted)sealState='discarded';
      });
    },
    acceptRecoveryFinishContext(b:object,handoff:object,evidence:object){let own:AcceptPending,projection:ReturnType<typeof projectSyntheticFinishPlanBinding>|undefined,projectionFailed=false;return act('finish_accept',b,()=>{
      const used=acceptStarted;acceptStarted=true;acceptState='accepting';
      own={plan:transferredPlan,handoff:handoffHandle,bound:finishBound,issue:issuedFinish,route_used:routeSpent};
      routeSpent=true;transferredPlan=undefined;handoffHandle=undefined;finishBound=undefined;issuedFinish=undefined;finishState='accepting';if(own.issue)issueState='consumed';
      if(!hasFinish||used||own.route_used||state!=='plan_transferred')fail('finish_accept');
    },()=>{
      // A mismatch is not a hard stop until after post-guard: preserve cancellation/deadline priority.
      if(!acceptPendingOk(own,handoff,evidence)||!finishPins||!source?.identity||!liveCleanup?.identity||!generationCleanupToken)projectionFailed=true;
      else try{projection=projectSyntheticFinishPlanBinding(finishPins,own.plan!,{owner:binding!,frame:own.plan!.frame,source:source.reference!,source_identity:source.identity,cleanup_identity:liveCleanup.identity,sink:generationCleanupToken,ready_origin:readyOrigin!,serial:0});compareSyntheticFinishValues(projection.snapshot,own.issue!.projection.snapshot);}catch{projectionFailed=true;}
      return opaque<SyntheticAcceptedFinishContext>();
    },handle=>{
      if(projectionFailed||!projection||!acceptPendingOk(own,handoff,evidence))fail('finish_accept');
      acceptedFinish=Object.freeze({handle,projection:projection!,bound:own.bound!});acceptedTermination=Object.freeze({handle,frame:own.plan!.frame,source:own.bound!.source,cleanup:own.bound!.cleanup,sink:generationCleanupToken!});
      acceptCount=1;acceptState='accepted';finishState='accepted';state='consumed';
    });},
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
      failureLink?.sourceCloseRequested(source!.identity!,source!.reference!);
      source!.close_started=true;source!.status='closing';readyOrigin=undefined;invalidateFinish();
    },()=>{});},
    settleSourceClose(b:object,status:unknown){return act('source_lifecycle',b,()=>{
      if(!tracked||!source?.close_started||source.status!=='closing')fail('source_lifecycle');
    },()=>{source!.completion=status==='closed'?'closed':status==='failed'?'failed':'unconfirmed';if(status!=='closed')fail('source_lifecycle');
      failureLink?.sourceClosed(source!.identity!,source!.reference!);source!.status='closed';readyOrigin=undefined;},()=>{
      if(acceptedTermination&&source?.identity===acceptedTermination.source&&source.reference===pinned?.source)acceptedSourceClosed=acceptedTermination;
    });},
    checkWorkerGenerationReady(b:object,ready:object){return act('generation_ready',b,()=>{
      if(!tracked||state!=='generation_ready'||ready!==generationDiscard||!readyUsable())fail('generation_ready');
    },()=>{});},
    beginWorkerGenerationCleanup(sink:object){
      // Cleanup-only claim: safe after hard stop; it never runs the healthy-run guard.
      if(!tracked||state==='closed'||!generationCleanupToken||sink!==generationCleanupToken||!generationCleanupContext||!liveCleanup||liveCleanup.sink!==sink||liveCleanup.frame!==generationCleanupContext.frame||liveCleanup.started||liveCleanup.settled)fail('generation_cleanup',hard?.code);
      failureLink?.newCleanupRequested(generationCleanupContext.frame,sink,liveCleanup.identity!);
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
      const used=generationClaimed;if(!used)failureLink?.reserveNew();generationClaimed=true;
      if(used||state!=='worker_prepared'||handle!==preparationHandle||!heldClosure||workerVerify?.inspect().stage!=='verified')fail('generation_claim');
      held=heldClosure!;heldClosure=undefined;preparationHandle=undefined;generationUses=1;state='generation_claiming';
    },()=>{
      generationInputs=held.inputs;generationFrame=Object.freeze({supervisor:opaque(),worker:opaque(),generation:opaque()});
      const start=opaque<GenerationStart>(),cleanup=opaque<GenerationCleanup>();generationStart=start;generationDiscard=start;generationCleanupToken=cleanup;generationCleanupContext=Object.freeze({frame:generationFrame,started:false});generationCleanup=Object.freeze({status:'not_required'});
      if(tracked)liveCleanup={frame:generationFrame,identity:opaque(),sink:cleanup,started:false,serial:0,settled:false};
      failureLink?.newAllocated(generationFrame,cleanup,liveCleanup!.identity!);
      return Object.freeze({start,cleanup});
    },()=>{generationTicketPublished=true;state='generation_claimed';});},
    startWorkerGeneration(b:object,handle:object){return act('generation_start',b,()=>{
      // A started frame is discarded only through its accepted ready handle, never the pre-start ticket.
      const own=generationStart;generationStart=undefined;generationDiscard=undefined;if(state!=='generation_claimed'||!own||own!==handle||!generationFrame||generationCleanupContext?.frame!==generationFrame||!generationCleanupToken||generationStarts)fail('generation_start');state='generation_starting';
    },()=>{generationStarts=1;generationCleanupContext=Object.freeze({frame:generationFrame!,started:true});generationCleanup=Object.freeze({status:'not_started'});
      failureLink?.newStarted(generationFrame!,generationCleanupToken!);return opaque<GenerationLease>();},handle=>{generationLease=handle;state='generation_waiting';});},
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
      const terminal=!hard&&acceptedTermination&&liveCleanup?.frame===acceptedTermination.frame&&liveCleanup.identity===acceptedTermination.cleanup&&sink===acceptedTermination.sink?acceptedTermination:undefined;
      const started=generationCleanupContext.started;
      const valid=validStart&&(started?['not_started','requested','confirmed','failed','unconfirmed'].includes(status as string):status==='not_required');
      failureLink?.newSettled(generationCleanupContext.frame,sink,validStart,started,valid,status);
      generationCleanupToken=undefined;generationCleanupContext=undefined;
      if(tracked&&liveCleanup){liveCleanup.settled=true;liveCleanup.frame=liveCleanup.identity=liveCleanup.sink=undefined;readyOrigin=undefined;}
      invalidateFinish();
      generationCleanup=Object.freeze({status:valid?status as CleanupStatus:'unconfirmed'});generationStart=generationLease=undefined;generationEvent=undefined;
      if(!valid||(started?status!=='confirmed':status!=='not_required'))fail('generation_cleanup');
      if(terminal&&started&&status==='confirmed')acceptedCleanupConfirmed=terminal;
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
      closureDiagnostic=Object.freeze({close_requests:f.worker_state==='none'?0:1,input_state:sent?'sent_terminal':'unsent',id_state:sent?'sent_terminal':f.point==='send_check'?'allocated_unsent':'absent',termination:f.worker_state==='none'?'not_required':'requested',cleanup:f.worker_state==='none'?'not_required':'not_started'});
      const lease=opaque<WorkerClosureLease>();failureLink?.oldLease(lease,f);return lease;
    },handle=>{closureLease=handle;});},
    confirmWorkerUnstarted(b:object,lease:object,context:unknown){return act('worker_closure_settle',b,()=>{
      const own=closureLease;closureLease=undefined;if(state!=='worker_closing'||!own||own!==lease)fail('worker_closure_settle');
    },()=>{if(facts!.worker_state!=='none'||!equal(pinFacts(context),facts!))fail('worker_closure_settle');failureLink?.oldUnstarted(lease,facts!);return opaque<WorkerClosureEvidence>();},handle=>{closureEvidence=handle;state='worker_closed';});},
    settleWorkerClosure(b:object,lease:object,event:unknown){return act('worker_closure_settle',b,()=>{
      const own=closureLease;closureLease=undefined;if(state!=='worker_closing'||!own||own!==lease)fail('worker_closure_settle');
    },()=>{const v=plain(event);exact(v,['context','termination','cleanup']);if(facts!.worker_state==='none'||!equal(pinFacts(v.context),facts!))fail('worker_closure_settle');
      const termination=['confirmed','rejected','unconfirmed'].includes(v.termination as string)?v.termination as 'confirmed'|'rejected'|'unconfirmed':'unconfirmed';
      const cleanup=['complete','failed','unconfirmed'].includes(v.cleanup as string)?v.cleanup as 'complete'|'failed'|'unconfirmed':'unconfirmed';
      closureDiagnostic=Object.freeze({...closureDiagnostic!,termination,cleanup});failureLink?.oldSettled(lease,facts!,termination,cleanup);
      if(termination!=='confirmed'||cleanup!=='complete')fail('worker_closure_settle');return opaque<WorkerClosureEvidence>();
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
    close(b:object){return act('close',b,()=>{},()=>{if(cleanupToken||phaseModel?.inFlight()||closureLease||closureEvidence||heldClosure||preparationHandle||generationCleanupToken||generationInputs||generationFrame||sealedPlan||transferredPlan||issuedFinish||acceptedFinish||sealedFinish||acceptedTermination||acceptedSourceClosed||acceptedCleanupConfirmed||source?.status==='closing')fail('close');},()=>{clear();time=null;state='closed';});},
    discardTerminalTime(){if(busy||state!=='failed'||time===null)return fail('discard',hard?.code);time=null;},
    inspect(){return Object.freeze({scope:'synthetic_soft_recovery_only' as const,state,time,observation_pending:!!observation,recovery_pending:!!recovery,cleanup_pending:!!cleanupToken,
      ...(hasFinish?{finish_binding:Object.freeze({state:finishState,started:finishStarted,bindings:finishBindings,active:!!finishBound&&readyUsable(),discard_started:finishDiscards,...finishStats})}:{}),
      ...(hasFinish?{finish_issue:Object.freeze({state:issueState,started:issueStarted,issues:issueCount,pending:!!issuedFinish})}:{}),
      ...(hasFinish?{finish_accept:Object.freeze({state:acceptState,started:acceptStarted,accepts:acceptCount,route_spent:routeSpent,pending:!!acceptedFinish,terminal_pending:!!acceptedTermination})}:{}),
      ...(hasFinish?{finish_accepted_discard:Object.freeze({started:acceptedDiscardStarted,discards:acceptedDiscards,source_confirmed:!!acceptedSourceClosed,cleanup_confirmed:!!acceptedCleanupConfirmed})}:{}),
      ...(hasFinish?{finish_seal:Object.freeze({state:sealState,started:sealStarted,seals:sealCount,pending:!!sealedFinish,usage:sealUsage})}:{}),
      ...(tracked?{lifecycle:Object.freeze({source:source!.status,source_close_started:source!.close_started,source_completion:source!.completion,worker_started:generationStarts===1,cleanup_started:liveCleanup?.started??false,cleanup_serial:liveCleanup?.serial??0,cleanup_settled:liveCleanup?.settled??false,ready_origin:!!readyOrigin,ready_usable:readyUsable()})}:{}),
      new_generation:generationClaimed?Object.freeze({claim_started:true,starts:generationStarts,ready_events:generationReadyEvents,cleanup:generationCleanup,cleanup_pending:!!generationCleanupToken}):null,
      worker_plan:planStarted?Object.freeze({...planCounts,seal_started:true,seals:planSeals,transfers:planTransfers,summaries:planSummaries,sealed_pending:!!sealedPlan,transferred_pending:!!transferredPlan,finish_calls:0}):null,
      claims:Object.freeze({observation_started:observationStarted,recovery_started:recoveryStarted,cleanup_started:cleanupStarted}),
      diagnostics:Object.freeze({soft,hard,cleanup}),phase:phaseModel?.inspect()??phaseDiagnostic,worker_closure:closureDiagnostic?Object.freeze({...closureDiagnostic,lease_pending:!!closureLease,evidence_pending:!!closureEvidence}):null,worker_preparation:preparationStarted?Object.freeze({...preparationDiagnostic,...(workerVerify||verifyDiagnostic?{verify:workerVerify?.inspect()??verifyDiagnostic,accounting:(workerVerify?.inspect()??verifyDiagnostic)!.accounting}:{}),claim_started:true,held:!!heldClosure,handle_pending:!!preparationHandle,transfers,generation_uses:generationUses,verify_attempts:(workerVerify?.inspect()??verifyDiagnostic)?.attempts??0,new_generations:generationStarts}):null,permissions:Object.freeze({formal_issuance:false,dispatch:false,recovery_route:false})});},
  });
}
/** Legacy/RB-A roots retain exactly their original method surface and behavior. */
export function createSyntheticRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined=()=>undefined){
  const {beginSourceClose,settleSourceClose,checkWorkerGenerationReady,beginWorkerGenerationCleanup,bindRecoveryPlan,checkBoundRecoveryPlan,discardBoundRecoveryPlan,issueFinishContext,acceptRecoveryFinishContext,discardAcceptedFinishContext,sealRecoveryFinishExpectation,...legacy}=createRecoveryKernel(seed,expected,check,false);
  void beginSourceClose;void settleSourceClose;void checkWorkerGenerationReady;void beginWorkerGenerationCleanup;
  void bindRecoveryPlan;void checkBoundRecoveryPlan;void discardBoundRecoveryPlan;void issueFinishContext;void acceptRecoveryFinishContext;void discardAcceptedFinishContext;void sealRecoveryFinishExpectation;
  type Snapshot=ReturnType<typeof legacy.inspect>;type Hard=NonNullable<Snapshot['diagnostics']['hard']>;
  type LegacySnapshot=Readonly<Omit<Snapshot,'lifecycle'|'finish_binding'|'finish_issue'|'finish_accept'|'finish_accepted_discard'|'finish_seal'|'diagnostics'>&{diagnostics:Readonly<Omit<Snapshot['diagnostics'],'hard'>&{hard:Readonly<Omit<Hard,'phase'>&{phase:Exclude<Phase,'source_lifecycle'|'finish_binding'|'finish_discard'|'finish_issue'|'finish_accept'|'finish_accepted_discard'|'finish_seal'>}>|null}>}>;
  return Object.freeze(legacy) as Omit<typeof legacy,'inspect'>&{inspect():LegacySnapshot};
}
/** Fresh tracked root only; no existing kernel, owner or mutable mode can be supplied. */
export function createSyntheticLifecycleRecoveryKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined=()=>undefined){
  const {bindRecoveryPlan,checkBoundRecoveryPlan,discardBoundRecoveryPlan,issueFinishContext,acceptRecoveryFinishContext,discardAcceptedFinishContext,sealRecoveryFinishExpectation,...lifecycle}=createRecoveryKernel(seed,expected,check,true);void bindRecoveryPlan;void checkBoundRecoveryPlan;void discardBoundRecoveryPlan;void issueFinishContext;void acceptRecoveryFinishContext;void discardAcceptedFinishContext;void sealRecoveryFinishExpectation;
  type Snapshot=ReturnType<typeof lifecycle.inspect>;type Hard=NonNullable<Snapshot['diagnostics']['hard']>;
  type LifecycleSnapshot=Readonly<Omit<Snapshot,'finish_binding'|'finish_issue'|'finish_accept'|'finish_accepted_discard'|'finish_seal'|'diagnostics'>&{diagnostics:Readonly<Omit<Snapshot['diagnostics'],'hard'>&{hard:Readonly<Omit<Hard,'phase'>&{phase:Exclude<Phase,'finish_binding'|'finish_discard'|'finish_issue'|'finish_accept'|'finish_accepted_discard'|'finish_seal'>}>|null}>}>;
  return Object.freeze(lifecycle) as Omit<typeof lifecycle,'inspect'>&{inspect():LifecycleSnapshot};
}
/** Constructor-only pin supply; never accepts an existing owner/kernel or registration callback. */
export function createSyntheticFinishBindingKernel(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,pins:SyntheticFinishPins|undefined,check:()=>string|undefined=()=>undefined){return createRecoveryKernel(seed,expected,check,true,pins);}

// OB-01: DATA preparation only, deliberately not connected to createRecoveryKernel/accepted/seal.
type SupplyReason='shape'|'binding'|'order'|'duplicate'|'state'|'internal'|'reentrant'|'cancelled'|'deadline_exceeded';
export class OwnedMixedSupplyError extends Error{readonly code='internal_review_error';constructor(readonly reason:SupplyReason){super('internal_review_error');}}
declare const preparedSupplyBrand:unique symbol;
export type PreparedOwnedMixedSupply=Readonly<{[preparedSupplyBrand]:'synthetic_owned_mixed_supply'}>;
type SupplyModel=ReturnType<typeof modelSyntheticParentOmission>['value'];
type SupplyInput={update_xml_sys_id:string;retrieved_at:string;state:'completed'|'not_processed';expected_context:unknown};
type SupplyData={recovery:{point:string;active_input_sys_id:string;accounting:{requests:number;received_bytes:number;payload_bytes:number};consistency:string};
  finish:{time:Record<string,unknown>;header:Record<string,unknown>;inputs:SupplyInput[]};model:SupplyModel};
type BoundSupplyRow={row:object;row_receipt:object;original:SupplyModel['original_rows'][number];outcome:SyntheticFinishPins['outcomes'][number];
  input:SyntheticFinishPins['receipts'][number]|undefined;original_reviewed:object|null;generated:boolean;consumed:boolean};
type OwnedMixedSupply={token:object;pins:SyntheticFinishPins;rows:BoundSupplyRow[];model:SupplyModel;data:SupplyData};
const supplyBad=(reason:SupplyReason='shape'):never=>{throw new OwnedMixedSupplyError(reason);};
function supplyRecord(raw:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))return supplyBad();
  const names=Reflect.ownKeys(raw);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return supplyBad();
  const out:Record<string,unknown>=Object.create(null);for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))return supplyBad();out[k]=d.value;}return out;
}
function supplyCopySmall(raw:unknown):unknown{
  let nodes=0,characters=0;
  function text(s:string){characters+=s.length*3;if(characters>262144)supplyBad();return s;}
  function visit(v:unknown,depth:number):unknown{
    if(++nodes>10000||depth>8)supplyBad();
    if(typeof v==='string')return text(v);if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;
    if(!v||typeof v!=='object'||types.isProxy(v))return supplyBad();
    if(Array.isArray(v)){
      if(Object.getPrototypeOf(v)!==Array.prototype||v.length>100||Reflect.ownKeys(v).length!==v.length+1)return supplyBad();
      return Object.freeze(Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))return supplyBad();return visit(d.value,depth+1);}));
    }
    if(![null,Object.prototype].includes(Object.getPrototypeOf(v)))return supplyBad();
    const keys=Reflect.ownKeys(v);if(keys.length>30)return supplyBad();const out:Record<string,unknown>=Object.create(null);
    for(const k of keys){if(typeof k!=='string')return supplyBad();text(k);const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))return supplyBad();out[k]=visit(d.value,depth+1);}return Object.freeze(out);
  }return visit(raw,0);
}
function supplyEqual(a:unknown,b:unknown):boolean{
  if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const x=Object.keys(a).sort(),y=Object.keys(b).sort();return x.length===y.length&&x.every((k,n)=>k===y[n]&&supplyEqual((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
}
function supplyRules(a:readonly string[],b:readonly string[]){return a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x));}
function pinSupplyData(raw:unknown):SupplyData{
  const top=supplyRecord(raw,['kind','recovery','finish','mixed']);if(top.kind!=='synthetic_omd_bound_root_v1')return supplyBad();
  const rec=supplyRecord(top.recovery,['point','active_input_sys_id','accounting','consistency']);
  const recovery=z.strictObject({point:z.enum(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check']),
    active_input_sys_id:z.string().regex(/^[a-f0-9]{32}$/),accounting:z.strictObject({requests:z.number().int().min(0).max(210),received_bytes:z.number().int().min(0).max(16777216),payload_bytes:z.number().int().min(0).max(8388608)}),
    consistency:z.enum(['stable_observation','changed','unverified'])}).parse(supplyCopySmall(rec));
  const f=supplyRecord(top.finish,['time','header','selected','inputs']),m=supplyRecord(top.mixed,['model_id','initial_prefix','rows']);
  const small=supplyCopySmall(f) as Record<string,unknown>,time=supplyRecord(small.time,['started_at','deadline_ms','observed_at','upper_utc']);
  if(!small.header||typeof small.header!=='object'||Array.isArray(small.header)||!Array.isArray(small.inputs))return supplyBad();const header=small.header as Record<string,unknown>;
  const inputs=small.inputs.map(v=>z.strictObject({update_xml_sys_id:z.string().regex(/^[a-f0-9]{32}$/),retrieved_at:z.iso.datetime({precision:3}),state:z.enum(['completed','not_processed']),expected_context:z.unknown()})
    .parse(supplyRecord(v,['update_xml_sys_id','retrieved_at','state','expected_context'])));
  const model=modelSyntheticParentOmission({kind:'synthetic_parent_omission_values_v1',model_id:m.model_id,schema_version:header.schema_version,limits:{max_findings:100},selected:small.selected,prefix:m.initial_prefix,rows:m.rows}).value;
  if(!model.selected.length||!supplyEqual(model.initial_prefix,{limitations:header.limitations,errors:header.errors}))return supplyBad('binding');
  const byId=new Map(inputs.map(i=>[i.update_xml_sys_id,i]));if(byId.size!==inputs.length||inputs.some(i=>!model.selected.includes(i.update_xml_sys_id)))return supplyBad('binding');
  const active=byId.get(recovery.active_input_sys_id);if(!active||active.state!=='not_processed')return supplyBad('binding');
  for(const original of model.original_rows){const input=byId.get(original.outcome.update_xml_sys_id);
    if(original.producer==='metadata'&&input||original.producer==='analysis'&&(!input||input.state!=='completed'||input.expected_context===null)
      ||original.producer==='retrieval'&&input&&(input.state!=='completed'||input.expected_context!==null)
      ||original.producer==='retained'&&(!input||input.state!=='not_processed'))return supplyBad('binding');
  }
  return {recovery,finish:{time,header,inputs},model};
}
function checkOwnedSupply(s:OwnedMixedSupply,token:object){
  const {pins,model,rows}=s;if(s.token!==token||rows.length!==model.selected.length||rows.length!==pins.outcomes.length||pins.accepted!==model.original_rows.filter(x=>x.outcome.state==='reviewed').length)supplyBad('binding');
  const rowRefs=new Set<object>(),rowReceipts=new Set<object>();
  for(const [n,link] of rows.entries()){
    const original=model.original_rows[n],outcome=pins.outcomes[n],input=pins.receipts.find(i=>i.update_xml_sys_id===model.selected[n]);
    if(rowRefs.has(link.row)||rowReceipts.has(link.row_receipt)||link.row===link.row_receipt||link.row_receipt===input?.receipt||link.original!==original||link.outcome!==outcome||link.input!==input||!link.generated||!link.consumed
      ||pins.seed.selected[n]!==model.selected[n]||outcome.update_xml_sys_id!==model.selected[n]||outcome.state!==model.assets[n].state)supplyBad('binding');
    if(outcome.state!=='reviewed'&&!supplyEqual(outcome.state==='result_omitted'?{state:outcome.state,update_xml_sys_id:outcome.update_xml_sys_id,reason:outcome.reason}:outcome,model.assets[n]))supplyBad('binding');
    rowRefs.add(link.row);rowReceipts.add(link.row_receipt);
    const accepted=outcome.state==='reviewed'?outcome.accepted_outcome:outcome.state==='result_omitted'?outcome.reviewed_origin?.accepted_outcome??null:null;
    if(link.original_reviewed!==accepted||(original.outcome.state==='reviewed')!==(accepted!==null))supplyBad('binding');
    if(outcome.state==='reviewed'&&outcome.receipt!==input?.receipt||outcome.state==='result_omitted'&&outcome.reviewed_origin&&outcome.reviewed_origin.receipt!==input?.receipt)supplyBad('binding');
    if(original.outcome.state==='reviewed'){
      const r=original.outcome.result,e=input?.expected_context,h=pins.seed.header;
      if(!input||!e||r.reviewed_at!==input.retrieved_at||r.target.retrieved_at!==input.retrieved_at||r.target.update_xml_sys_id!==input.update_xml_sys_id
        ||r.target.update_set_id!==h.target.update_set_sys_id||r.target.record_updated_at!==e.record_updated_at||r.instance_binding!==e.instance_binding||r.instance_binding!==h.target.instance_binding
        ||!supplyEqual(r.instance_release,e.instance_release)||!supplyEqual(r.instance_release,h.instance_release)||!supplyRules(original.outcome.applicable_rule_ids,e.requested_rule_ids)
        ||!supplyRules(r.coverage.requested_rule_ids,e.requested_rule_ids)||e.release_limitations.some(x=>!r.limitations.includes(x)))supplyBad('binding');
    }
  }
}

/** Fresh synthetic DATA only. Never adopts old handles, creates a recovery kernel or exposes pins. */
export function createSyntheticOwnedMixedSupply(raw:unknown,dependencies:unknown,...extra:unknown[]){
  const deps=supplyRecord(dependencies,['guard']);if(typeof deps.guard!=='function'||types.isProxy(deps.guard))return supplyBad();
  return createOwnedMixedSupply(raw,deps.guard as SupplyGuard,extra,opaque<object>());
}
type SupplyGuard=(stage:'prepare_pre'|'row_pre'|'row_post'|'prepare_post'|'discard_pre'|'discard_post',ordinal?:number)=>unknown;
type SupplyFailureSlot={token:object;claimed:boolean;notices:number;reason:SupplyReason|undefined;custody:ReturnType<typeof createFailureCustodyCore>;accounting?:FailureRunSupply;stage?:'prepare'|'transfer'|'cleanup'};
type SupplyKernelBridge={token:object;owned:OwnedMixedSupply|undefined};
// NB-01: private constructor continuation only; no external receipt/pins registration.
type PinsBirthReceipt=Readonly<{token:object;serial:1;pins:SyntheticFinishPins;owned:OwnedMixedSupply}>;
type NormalPinBinding=Readonly<{token:object;pins:SyntheticFinishPins;context:SyntheticFinishPins['seed']['run_context'];serial:1}>;
type NormalSupplyChannel={token:object;birth:PinsBirthReceipt|undefined;take:(()=>OwnedMixedSupply)|undefined;invalidate:((reason:SupplyReason)=>void)|undefined};
function createOwnedMixedSupply(raw:unknown,fixedGuard:SupplyGuard,extra:unknown[],constructionToken:object,failure?:SupplyFailureSlot,initialFailure?:SupplyReason,bridge?:SupplyKernelBridge,normal?:NormalSupplyChannel){
  let first:SupplyReason|undefined,state:'fresh'|'preparing'|'prepared'|'moved'|'failed'|'invalidated'|'discarded'='fresh',busy=false,started=false;
  let data:SupplyData|undefined,held:OwnedMixedSupply|undefined,prepared:PreparedOwnedMixedSupply|undefined;
  let selected=0,pinBuilds=0,pinsCreated=0,preparations=0,linked=0,generated=0,consumed=0,inputs=0,originalReviewed=0,parentOmitted=0,workerOmitted=0,retained=0,keptFindings=0;
  function clear(){data=undefined;held=undefined;prepared=undefined;if(bridge)bridge.owned=undefined;if(normal){normal.birth=undefined;normal.take=undefined;}}
  function recordFailure(reason:SupplyReason){
    first??=reason;state='failed';
    try{
      if(failure&&!failure.claimed){
        // Claim before the fixed private write. Neither caller callbacks nor public issuer attachment are used.
        failure.claimed=true;failure.reason=first;
        if(failure.token!==constructionToken)throw new OwnedMixedSupplyError('binding');
        failure.custody.local.hard(first==='cancelled'||first==='deadline_exceeded'?first:'internal_review_error',failure.stage??'prepare');
        failure.notices++;
        failure.accounting?.record('notice');
      }
    }finally{clear();}
  }
  const fail=(reason:SupplyReason):never=>{recordFailure(reason);throw new OwnedMixedSupplyError(first!);};
  if(normal)normal.invalidate=recordFailure;
  function live(){if(first)throw new OwnedMixedSupplyError(first);if(busy)fail('reentrant');if(state==='invalidated'||state==='discarded')fail('state');}
  function guard(stage:Parameters<typeof fixedGuard>[0],n?:number){
    let stop:unknown;try{stop=fixedGuard(stage,n);}catch{if(first)throw new OwnedMixedSupplyError(first);fail('internal');}
    if(first)throw new OwnedMixedSupplyError(first);if(stop!==undefined)fail(stop==='cancelled'||stop==='deadline_exceeded'?stop:'internal');
  }
  try{if(initialFailure)supplyBad(initialFailure);if(extra.length)supplyBad();data=pinSupplyData(raw);selected=data.model.selected.length;}catch(e){recordFailure(e instanceof OwnedMixedSupplyError?e.reason:'shape');}
  raw=undefined;extra=[];
  return Object.freeze({
    prepare(...args:unknown[]):PreparedOwnedMixedSupply{
      live();if(started)fail('duplicate');started=true;state='preparing';busy=true;
      let moving:OwnedMixedSupply|undefined;
      try{
        guard('prepare_pre');let mismatch:SupplyReason|undefined;
        try{
          if(args.length||!data)supplyBad();const source=data!,model=source.model;
          const originalById=new Map(model.original_rows.map(x=>[x.outcome.update_xml_sys_id,x]));
          pinBuilds++;
          const pins=createSyntheticFinishPins({kind:'synthetic_finish_seed_v1',time:source.finish.time,header:{...source.finish.header,limitations:model.prefix.limitations,errors:model.prefix.errors},selected:model.selected,
            inputs:source.finish.inputs.map(i=>({...i,accepted:originalById.get(i.update_xml_sys_id)?.outcome.state==='reviewed'?{kind:'synthetic_reviewed_pin',update_xml_sys_id:i.update_xml_sys_id,retrieved_at:i.retrieved_at}:null})),
            outcomes:model.assets.map(a=>a.state==='reviewed'?{state:a.state,update_xml_sys_id:a.update_xml_sys_id}:a)});
          pinsCreated++;inputs=pins.receipts.length;originalReviewed=pins.accepted;
          const rows:BoundSupplyRow[]=[];
          for(const [n,original] of model.original_rows.entries()){
            generated++;guard('row_pre',n);const outcome=pins.outcomes[n],input=pins.receipts.find(i=>i.update_xml_sys_id===model.selected[n]);
            const link:BoundSupplyRow={row:opaque(),row_receipt:opaque(),original,outcome,input,
              original_reviewed:outcome.state==='reviewed'?outcome.accepted_outcome:outcome.state==='result_omitted'?outcome.reviewed_origin?.accepted_outcome??null:null,generated:true,consumed:true};
            guard('row_post',n);rows.push(link);consumed++;linked++;
          }
          moving={token:constructionToken,pins,rows,model,data:source};checkOwnedSupply(moving,constructionToken);
        }catch(e){mismatch=e instanceof OwnedMixedSupplyError?e.reason:'shape';}
        guard('prepare_post');if(mismatch||!moving)fail(mismatch??'internal');const complete=moving!;checkOwnedSupply(complete,constructionToken);
        held=complete;data=undefined;prepared=opaque<PreparedOwnedMixedSupply>();preparations=1;state='prepared';
        if(bridge){if(bridge.token!==constructionToken)fail('binding');bridge.owned=complete;}
        if(normal){
          if(normal.token!==constructionToken)fail('binding');
          normal.birth=Object.freeze({token:constructionToken,serial:1,pins:complete.pins,owned:complete});
          normal.take=()=>{
            live();if(state!=='prepared'||held!==complete||!prepared||normal.birth?.owned!==complete)fail('binding');
            const moved=held!;clear();state='moved';return moved;
          };
        }
        parentOmitted=complete.model.trace.filter(t=>t.action==='parent_omit').length;workerOmitted=complete.model.original_rows.filter(x=>x.outcome.state==='result_omitted').length;
        retained=complete.model.original_rows.filter(x=>x.producer==='retained').length;keptFindings=complete.model.kept_findings;
        return prepared;
      }catch(e){if(first)throw new OwnedMixedSupplyError(first);return fail(e instanceof OwnedMixedSupplyError?e.reason:'internal');}finally{moving=undefined;if(first)clear();busy=false;}
    },
    discardPrepared(handle:PreparedOwnedMixedSupply,...args:unknown[]){
      live();const own=prepared;prepared=undefined;busy=true;
      try{guard('discard_pre');const mismatch=args.length||state!=='prepared'||handle!==own||!held;guard('discard_post');if(mismatch)fail('binding');clear();state='discarded';}
      catch(e){if(first)throw new OwnedMixedSupplyError(first);fail(e instanceof OwnedMixedSupplyError?e.reason:'internal');}finally{if(first)clear();busy=false;}
    },
    beginSourceClose(...args:unknown[]){live();if(args.length)fail('shape');clear();state='invalidated';},
    beginCleanup(...args:unknown[]){if(busy)fail('reentrant');if(args.length)fail('shape');clear();if(!first)state='invalidated';},
    discard(...args:unknown[]){if(busy)fail('reentrant');if(args.length)fail('shape');clear();if(!first)state='discarded';},
    stop(reason:'cancelled'|'deadline_exceeded',...args:unknown[]){if(args.length||reason!=='cancelled'&&reason!=='deadline_exceeded')return fail('internal');return fail(reason);},
    inspect:()=>Object.freeze({scope:'synthetic_owned_mixed_supply' as const,authority:'none' as const,state,first_failure:first??null,started,preparations,pin_builds:pinBuilds,pins_created:pinsCreated,pending:!!held,
      selected,linked_rows:linked,generated,consumed,inputs,original_reviewed_pins:originalReviewed,parent_omitted:parentOmitted,original_worker_omitted:workerOmitted,retained,kept_findings:keptFindings,retained_rows:held?.rows.length??0,
      permissions:Object.freeze({accepted_adoption:false,destination_seal:false,formal_issuance:false}),unverified:Object.freeze(['runtime_origin','accepted_plan','ready_origin','cleanup_evidence','whole_run_budget'])}),
  });
}

/** NB-01 closed synthetic normal root. No kernel, accepted route, transferable handle or runtime authority. */
export function createSyntheticNormalOwnedSupply(raw:unknown,dependencies:unknown,...extra:unknown[]){
  const deps=supplyRecord(dependencies,['guard']);if(typeof deps.guard!=='function'||types.isProxy(deps.guard))return supplyBad();
  const fixedGuard=deps.guard as (stage:string,ordinal?:number)=>unknown,token=opaque<object>();
  // All owners and slots precede DATA inspection. Unknown roles are not promoted to absence.
  const custody=createFailureCustodyCore('connected',()=>undefined,token);
  const failure:SupplyFailureSlot={token,claimed:false,notices:0,reason:undefined,custody};
  const channel:NormalSupplyChannel={token,birth:undefined,take:undefined,invalidate:undefined};
  let state:'fresh'|'prepared'|'moving'|'normal_owned'|'failed'|'invalidated'|'discarded'='fresh',first:SupplyReason|undefined,busy=false;
  let failureStage:'prepare'|'transfer'|'cleanup'='prepare';
  let prepareStarted=false,moveStarted=false,births=0,birthConsumptions=0,moves=0,invalidations=0;
  let owned:OwnedMixedSupply|undefined,binding:NormalPinBinding|undefined;
  type NormalBudget=Readonly<{token:object;identity:object;serial:1;accounting:Readonly<SupplyData['recovery']['accounting']>;started_at:string;deadline_ms:number}>;
  let budget:NormalBudget|undefined,identityChecks=0,rowsChecked=0;
  const supply=createOwnedMixedSupply(raw,(stage,n)=>fixedGuard(stage,n),extra,token,failure,undefined,undefined,channel);
  raw=undefined;extra=[];
  function clear(){owned=undefined;binding=undefined;channel.birth=undefined;channel.take=undefined;}
  function fail(reason:SupplyReason):never{
    first??=reason;state='failed';invalidations++;
    failure.stage=failureStage;
    try{channel.invalidate!(first);}catch{/* fixed private invalidation; keep the original diagnosis */}
    finally{
      clear();
      // The supply may already have reported a preparation failure.
      if(!failure.claimed){failure.claimed=true;failure.reason=first;failure.notices++;}
      custody.local.hard(first==='cancelled'||first==='deadline_exceeded'?first:'internal_review_error',failureStage);
    }
    throw new OwnedMixedSupplyError(first);
  }
  function live(){if(first)throw new OwnedMixedSupplyError(first);if(busy)fail('reentrant');if(state==='invalidated'||state==='discarded')fail('state');}
  function guard(stage:'move_pre'|'move_post'|'normal_discard_pre'|'normal_discard_post'){
    let stop:unknown;try{stop=fixedGuard(stage);}catch{if(first)throw new OwnedMixedSupplyError(first);return fail('internal');}
    if(first)throw new OwnedMixedSupplyError(first);if(stop!==undefined)fail(stop==='cancelled'||stop==='deadline_exceeded'?stop:'internal');
  }
  function reject(e:unknown):never{if(first)throw new OwnedMixedSupplyError(first);return fail(e instanceof OwnedMixedSupplyError?e.reason:'internal');}
  return Object.freeze({
    prepare(...args:unknown[]){
      live();if(prepareStarted)fail('duplicate');prepareStarted=true;busy=true;
      try{if(args.length)fail('shape');supply.prepare();if(!channel.birth||channel.birth.token!==token||channel.birth.serial!==1)fail('binding');births=1;state='prepared';}
      catch(e){reject(e);}finally{busy=false;if(first)clear();}
    },
    move(...args:unknown[]){
      live();if(moveStarted)fail('duplicate');moveStarted=true;busy=true;state='moving';failureStage='transfer';
      let pending:OwnedMixedSupply|undefined,birth:PinsBirthReceipt|undefined;
      try{
        birth=channel.birth;const take=channel.take;
        if(take){pending=take();birthConsumptions++;}
        guard('move_pre');let mismatch:SupplyReason|undefined,nextBudget:NormalBudget|undefined;
        try{
          if(args.length)supplyBad('shape');
          if(!pending||!birth||birth.token!==token||birth.serial!==1||birth.owned!==pending||birth.pins!==pending.pins||budget||binding)supplyBad('binding');
          checkOwnedSupply(pending!,token);
          const p=pending!,context=p.pins.seed.run_context;
          // Bind all eight original refs, never a reconstructed seed/window or a caller capability.
          for(const key of ['run','session','source','key','origin','budget','release','window'] as const){
            if(!context[key]||typeof context[key]!=='object')supplyBad('binding');
          }
          const source=p.data,active=p.pins.receipts.find(i=>i.update_xml_sys_id===source.recovery.active_input_sys_id);
          if(!active||!p.rows.some(r=>r.input===active)||context.started_at!==source.finish.time.started_at||context.deadline_ms!==source.finish.time.deadline_ms
            ||context.observed_at!==source.finish.time.observed_at||context.upper_utc!==source.finish.time.upper_utc)supplyBad('binding');
          nextBudget=Object.freeze({token,identity:context.budget,serial:1,accounting:Object.freeze({...source.recovery.accounting}),started_at:context.started_at,deadline_ms:context.deadline_ms});
        }catch(e){mismatch=e instanceof OwnedMixedSupplyError?e.reason:'internal';}
        guard('move_post');if(mismatch||!pending||!birth||!nextBudget)fail(mismatch??'internal');
        // No callbacks/await between the post guard and this single ownership/binding commit.
        owned=pending;binding=Object.freeze({token,pins:birth!.pins,context:birth!.pins.seed.run_context,serial:1});budget=nextBudget;
        identityChecks=8;rowsChecked=owned!.rows.length;moves=1;state='normal_owned';
      }catch(e){reject(e);}finally{pending=undefined;birth=undefined;busy=false;if(first)clear();}
    },
    beginSourceClose(...args:unknown[]){live();if(args.length)fail('shape');supply.beginSourceClose();clear();invalidations++;state='invalidated';},
    beginCleanup(...args:unknown[]){live();if(args.length)fail('shape');supply.beginCleanup();clear();invalidations++;state='invalidated';},
    discard(...args:unknown[]){
      live();busy=true;failureStage='cleanup';try{guard('normal_discard_pre');const mismatch=args.length;guard('normal_discard_post');if(mismatch)fail('shape');supply.discard();clear();state='discarded';}
      catch(e){reject(e);}finally{busy=false;if(first)clear();}
    },
    stop(reason:'cancelled'|'deadline_exceeded',...args:unknown[]){if(args.length||reason!=='cancelled'&&reason!=='deadline_exceeded')return fail('internal');return fail(reason);},
    inspect:()=>Object.freeze({scope:'synthetic_normal_owned_supply' as const,authority:'none' as const,state,first_failure:first??null,prepare_started:prepareStarted,move_started:moveStarted,
      births,birth_consumptions:birthConsumptions,moves,invalidations,birth_pending:!!channel.birth,normal_pending:!!owned,retained_rows:owned?.rows.length??0,
      binding:binding?Object.freeze({serial:binding.serial,identity_checks:identityChecks,rows_checked:rowsChecked,
        same_origin:binding.token===token&&budget?.token===token&&binding.pins===owned?.pins&&binding.context===owned?.pins.seed.run_context&&budget.identity===binding.context.budget}):null,
      budget:Object.freeze({state:budget?'bound':'unbound',serial:budget?.serial??0,accounting:budget?.accounting??null,started_at:budget?.started_at??null,deadline_ms:budget?.deadline_ms??null}),
      supply:supply.inspect(),failure:custody.currentFailure(),failure_notices:failure.notices,permissions:Object.freeze({accepted_adoption:false,destination_seal:false,formal_issuance:false}),
      unverified:Object.freeze(['runtime_origin','accepted_plan','ready_origin','cleanup_evidence','whole_run_budget'])}),
  });
}
/** Fresh synthetic failure/cleanup custody only. No runtime resource, accepted route or registration. */

const roles=['source','transport_group','old_generation','new_generation'] as const;
type Role=typeof roles[number];
type HardCode='cancelled'|'deadline_exceeded'|'internal_review_error'|'worker_unavailable'|'authentication_failed'|'access_denied'|'request_budget_exceeded'|'receive_budget_exceeded'|'payload_budget_exceeded';
type Stage='prepare'|'transfer'|'cleanup'|'display'|'internal';
type Reason='shape'|'binding'|'state'|'duplicate'|'reentrant'|'internal';
export class FailureCustodyError extends Error{readonly code='internal_review_error';constructor(readonly reason:Reason){super('internal_review_error');}}
declare const ticketBrand:unique symbol,factBrand:unique symbol,absenceBrand:unique symbol,reportBrand:unique symbol,commitBrand:unique symbol;
export type FailureCreationTicket=Readonly<{[ticketBrand]:'synthetic_failure_creation'}>;
export type FailureFact=Readonly<{[factBrand]:'synthetic_failure_fact'}>;
export type FailureAbsence=Readonly<{[absenceBrand]:'synthetic_failure_absence'}>;
export type FailureReport=Readonly<{[reportBrand]:'synthetic_failure_report'}>;
export type FailureCommitReceipt=Readonly<{[commitBrand]:'synthetic_failure_commit'}>;
type FactKind='created'|'source_closed'|'transport_quiescent'|'worker_terminated'|'cleanup_confirmed'|'cleanup_unconfirmed';
type FirstHard=Readonly<{code:HardCode;stage:Stage}>;
type RoleState={role:Role;frame:object;ever_started:boolean;creation_closed:boolean;ticket:FailureCreationTicket|undefined;
  generation:'unknown'|'creating'|'created'|'not_created';stop:'not_requested'|'requested';termination:'unknown'|'confirmed';cleanup:'not_requested'|'requested'|'confirmed'|'unconfirmed';
  issued:{creation:boolean;terminal:boolean;cleanup:boolean;absence:boolean}};
type RoleView=Readonly<Pick<RoleState,'generation'|'stop'|'termination'|'cleanup'>&{resolved:boolean}>;
type Snapshot=Readonly<{scope:'synthetic_failure_diagnostic';authority:'none';outcome:'failed';release:'confirmed'|'unconfirmed';unresolved:number;first_hard:FirstHard;roles:Readonly<Record<Role,RoleView>>}>;
type Evidence={token:object;role:RoleState;frame:object;ticket:FailureCreationTicket|undefined;kind:FactKind|'absence'};
function own(raw:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))throw new FailureCustodyError('shape');
  const names=Reflect.ownKeys(raw);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))throw new FailureCustodyError('shape');
  const out:Record<string,unknown>=Object.create(null);for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))throw new FailureCustodyError('shape');out[k]=d.value;}return out;
}

export function createSyntheticFailureCustody(raw:unknown,dependencies:unknown,...extra:unknown[]){
  const config=own(raw,['kind','upper']),deps=own(dependencies,['guard']);
  if(extra.length||config.kind!=='synthetic_failure_custody_v1'||!['connected','absent','reject'].includes(config.upper as string)
    ||typeof deps.guard!=='function'||types.isProxy(deps.guard))throw new FailureCustodyError('shape');
  const core=createFailureCustodyCore(config.upper,deps.guard as CustodyGuard,opaque<object>());
  return Object.freeze({issuer:core.issuer,local:core.local,upper:core.upper});
}
type CustodyGuard=(phase:'pre'|'post',operation:'seal'|'commit'|'discard')=>unknown;
type FailureResourceSlot={token:object;budget:object|undefined;local:object|undefined;upper:object|undefined;serial:0|1};
const failureRunCosts=['shell','budget_pin','entry','rejected_entry','healthy_checkpoint','role_reservation','role_fact','clear_checkpoint','notice','cleanup_request','terminal_receipt','cleanup_checkpoint','seal','commit','discard'] as const;
type FailureRunCost=typeof failureRunCosts[number];
function createFailureRunSupply(token:object){
  const identity=opaque<object>(),costs=Object.fromEntries(failureRunCosts.map(k=>[k,0])) as Record<FailureRunCost,number>;
  let total=0,saturated=false,bound=false,prefix:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>|null=null;
  let startedAt:string|null=null,deadline:number|null=null,observedStop:'cancelled'|'deadline_exceeded'|null=null;
  function record(key:FailureRunCost){if(total===4096){saturated=true;return;}costs[key]++;total++;}
  record('shell');
  return Object.freeze({identity,record,
    pin(owner:object,budget:object,accounting:Readonly<{requests:number;received_bytes:number;payload_bytes:number}>,started:string,deadlineMs:number){
      if(owner!==token||budget!==identity||bound)throw Error('internal_review_error');bound=true;prefix=Object.freeze({...accounting});startedAt=started;deadline=deadlineMs;record('budget_pin');
    },
    observe(stop:unknown){if(stop==='cancelled'||stop==='deadline_exceeded')observedStop??=stop;else if(stop!==undefined)throw Error('internal_review_error');},
    inspect:()=>Object.freeze({scope:'synthetic_failure_budget_view' as const,authority:'none' as const,model_id:'fb03-fake-events-v1' as const,budget_bound:bound,
      accounting:prefix,started_at:startedAt,deadline_ms:deadline,observed_stop:observedStop,total,saturated,costs:Object.freeze({...costs}),
      unverified:Object.freeze(['canonical_budget','actual_work_bound','cleanup_deadline'])}),
  });
}
type FailureRunSupply=ReturnType<typeof createFailureRunSupply>;
type FailureRunGuard=(phase:'pre'|'post',operation:'seal'|'commit'|'discard'|'cleanup',view:ReturnType<FailureRunSupply['inspect']>)=>unknown;
function createFailureCustodyCore(upperMode:unknown,fixedGuard:CustodyGuard,token:object,resources?:FailureResourceSlot,accounting?:FailureRunSupply){
  const unverified=Object.freeze(['runtime_resource_origin','actual_cleanup','attempt_inventory','canonical_budget','cleanup_deadline']);
  const ledger=Object.fromEntries(roles.map(role=>[role,{role,frame:opaque(),ever_started:false,creation_closed:false,ticket:undefined,generation:'unknown',stop:'not_requested',termination:'unknown',cleanup:'not_requested',issued:{creation:false,terminal:false,cleanup:false,absence:false}}])) as Record<Role,RoleState>;
  // One common slot selects the sole cleanup owner. No duplicate authority is kept by local/upper facades.
  const custody={holder:'local' as 'local'|'upper',serial:0};
  const tickets=new Map<FailureCreationTicket,RoleState>(),facts=new Map<FailureFact|FailureAbsence,Evidence>();
  let state:'tracking'|'failed_draining'|'sealed_waiting_ack'|'committed_to_upper'|'discarded'='tracking',first:FirstHard|undefined;
  let busy=false,poisoned=false,faults=0,observedStop:'cancelled'|'deadline_exceeded'|null=null;
  let sealStarted=false,commitStarted=false,discardStarted=false,commits=0,discards=0;
  let reportHandle:FailureReport|undefined,report:Snapshot|undefined,upperReport:Snapshot|undefined,receipt:FailureCommitReceipt|undefined;
  let commitProof:Readonly<{token:object;report:Snapshot;serial:1;failure:FirstHard;resources:object|undefined}>|undefined;
  function setHard(code:HardCode,stage:Stage){first??=Object.freeze({code,stage});for(const r of Object.values(ledger))r.creation_closed=true;if(state==='tracking')state='failed_draining';}
  const reject=(reason:Reason):never=>{faults=Math.min(100,faults+1);if(busy)poisoned=true;setHard('internal_review_error','internal');throw new FailureCustodyError(reason);};
  function action<T>(work:()=>T):T{
    if(busy)return reject('reentrant');busy=true;poisoned=false;
    try{return work();}catch(e){if(e instanceof FailureCustodyError)throw e;return reject('internal');}finally{busy=false;}
  }
  function checkpoint(phase:'pre'|'post',operation:'seal'|'commit'|'discard'){
    let stop:unknown;try{stop=fixedGuard(phase,operation);}catch{if(poisoned)return reject('reentrant');return reject('internal');}
    if(poisoned)return reject('reentrant');
    // Cleanup/reporting remains possible after hard/expiry. This is not a healthy-run guard.
    if(stop==='cancelled'||stop==='deadline_exceeded')observedStop??=stop;else if(stop!==undefined)reject('shape');
  }
  function roleOf(role:unknown):RoleState{if(typeof role!=='string'||!roles.includes(role as Role))return reject('shape');return ledger[role as Role];}
  function boundTicket(r:RoleState,ticket:FailureCreationTicket){if(tickets.get(ticket)!==r||r.ticket!==ticket||!r.ever_started)return reject('binding');}
  function owner(side:'local'|'upper'){
    if(custody.holder!==side||side==='local'&&state==='discarded'||side==='upper'&&!upperReport)reject('state');
  }
  function resolved(r:RoleState){return r.generation==='not_created'||r.generation==='created'&&r.termination==='confirmed'&&r.cleanup==='confirmed';}
  function snapshot():Snapshot{
    if(!first)return reject('state');const values=Object.fromEntries(roles.map(role=>{const r=ledger[role];return [role,Object.freeze({generation:r.generation,stop:r.stop,termination:r.termination,cleanup:r.cleanup,resolved:resolved(r)})];})) as Record<Role,RoleView>;
    const unresolved=roles.filter(role=>!values[role].resolved).length;
    return Object.freeze({scope:'synthetic_failure_diagnostic',authority:'none',outcome:'failed',release:unresolved?'unconfirmed':'confirmed',unresolved,first_hard:first,roles:Object.freeze(values)});
  }
  function observe(side:'local'|'upper',role:Role,ticket:FailureCreationTicket|undefined,fact:FailureFact|FailureAbsence,absence:boolean,args:unknown[]){return action(()=>{
    owner(side);const r=roleOf(role),e=facts.get(fact);facts.delete(fact);
    if(args.length||!e||e.token!==token||e.role!==r||e.frame!==r.frame||e.ticket!==ticket||absence!==(e.kind==='absence'))return reject('binding');
    if(absence){if(r.ever_started||!r.creation_closed||r.generation!=='unknown')return reject('state');r.generation='not_created';return;}
    boundTicket(r,ticket!);
    if(e.kind==='created'){if(r.generation!=='creating')return reject('state');r.generation='created';}
    else if(e.kind==='cleanup_confirmed'||e.kind==='cleanup_unconfirmed'){
      if(r.stop!=='requested'||r.cleanup!=='requested')return reject('state');r.cleanup=e.kind==='cleanup_confirmed'?'confirmed':'unconfirmed';
    }else{if(r.termination!=='unknown')return reject('duplicate');r.termination='confirmed';}
  });}
  function requestCleanup(side:'local'|'upper',role:Role,ticket:FailureCreationTicket,args:unknown[]){return action(()=>{
    owner(side);const r=roleOf(role);if(args.length)return reject('shape');boundTicket(r,ticket);if(r.stop!=='not_requested')return reject('duplicate');r.stop='requested';r.cleanup='requested';
  });}
  const issuer=Object.freeze({
    beginCreation(role:Role,...args:unknown[]):FailureCreationTicket{return action(()=>{
      const r=roleOf(role);if(args.length)return reject('shape');if(state!=='tracking'||first||r.creation_closed||r.ever_started)return reject('state');
      r.creation_closed=r.ever_started=true;r.generation='creating';const ticket=opaque<FailureCreationTicket>();r.ticket=ticket;tickets.set(ticket,r);return ticket;
    });},
    proveUncreated(role:Role,...args:unknown[]):FailureAbsence{return action(()=>{
      const r=roleOf(role);if(args.length)return reject('shape');if(r.ever_started||r.issued.absence||r.generation!=='unknown')return reject('state');
      r.creation_closed=true;r.issued.absence=true;const fact=opaque<FailureAbsence>();facts.set(fact,{token,role:r,frame:r.frame,ticket:undefined,kind:'absence'});return fact;
    });},
    fact(ticket:FailureCreationTicket,kind:FactKind,...args:unknown[]):FailureFact{return action(()=>{
      const r=tickets.get(ticket);if(args.length||!r)return reject('binding');boundTicket(r,ticket);
      if(!['created','source_closed','transport_quiescent','worker_terminated','cleanup_confirmed','cleanup_unconfirmed'].includes(kind))return reject('shape');
      if(kind==='source_closed'&&r.role!=='source'||kind==='transport_quiescent'&&r.role!=='transport_group'||kind==='worker_terminated'&&r.role!=='old_generation'&&r.role!=='new_generation')return reject('binding');
      const group=kind==='created'?'creation':kind==='cleanup_confirmed'||kind==='cleanup_unconfirmed'?'cleanup':'terminal';
      if(r.issued[group])return reject('duplicate');r.issued[group]=true;const fact=opaque<FailureFact>();facts.set(fact,{token,role:r,frame:r.frame,ticket,kind});return fact;
    });},
  });
  const local=Object.freeze({
    hard(code:HardCode,stage:Stage,...args:unknown[]){return action(()=>{
      if(args.length||!['cancelled','deadline_exceeded','internal_review_error','worker_unavailable','authentication_failed','access_denied','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded'].includes(code)
        ||!['prepare','transfer','cleanup','display','internal'].includes(stage))return reject('shape');
      if(state==='discarded')return reject('state');setHard(code,stage);
    });},
    observe:(role:Role,ticket:FailureCreationTicket,fact:FailureFact,...args:unknown[])=>observe('local',role,ticket,fact,false,args),
    observeAbsent:(role:Role,fact:FailureAbsence,...args:unknown[])=>observe('local',role,undefined,fact,true,args),
    requestCleanup:(role:Role,ticket:FailureCreationTicket,...args:unknown[])=>requestCleanup('local',role,ticket,args),
    seal(...args:unknown[]):FailureReport{return action(()=>{
      if(sealStarted)return reject('duplicate');sealStarted=true;accounting?.record('seal');checkpoint('pre','seal');
      if(args.length||state!=='failed_draining'||!first)return reject('state');const draft=snapshot(),handle=opaque<FailureReport>();checkpoint('post','seal');
      report=draft;reportHandle=handle;state='sealed_waiting_ack';return reportHandle;
    });},
    commit(handle:FailureReport,...args:unknown[]):FailureCommitReceipt{return action(()=>{
      if(commitStarted)return reject('duplicate');commitStarted=true;accounting?.record('commit');const ownHandle=reportHandle;reportHandle=undefined;
      checkpoint('pre','commit');
      if(args.length||state!=='sealed_waiting_ack'||handle!==ownHandle||!report||upperReport||custody.holder!=='local'||custody.serial!==0)return reject('binding');
      if(upperMode!=='connected')return reject('state');const moving=report,movingResources=resources?.local;
      if(resources&&(resources.token!==token||resources.serial!==0||!movingResources||resources.upper||accounting&&resources.budget!==accounting.identity))return reject('binding');
      const proof=Object.freeze({token,report:moving,serial:1 as const,failure:first!,resources:movingResources}),nextReceipt=opaque<FailureCommitReceipt>();checkpoint('post','commit');
      // Single synchronous commit: no callback/await between custody selection, report storage and receipt creation.
      if(resources){resources.upper=movingResources;resources.local=undefined;resources.serial=1;}
      upperReport=moving;commitProof=proof;receipt=nextReceipt;custody.holder='upper';custody.serial=1;
      state='committed_to_upper';commits=1;return receipt;
    });},
    finalDiscard(handle:FailureCommitReceipt,...args:unknown[]){return action(()=>{
      if(discardStarted)return reject('duplicate');discardStarted=true;accounting?.record('discard');const ownReceipt=receipt;receipt=undefined;
      checkpoint('pre','discard');
      if(args.length||state!=='committed_to_upper'||!ownReceipt||handle!==ownReceipt||!commitProof||commitProof.token!==token||commitProof.failure!==first||commitProof.report!==upperReport
        ||commitProof.serial!==custody.serial||custody.holder!=='upper'||!upperReport
        ||resources&&(resources.token!==token||resources.serial!==1||resources.local!==undefined||!resources.upper||resources.upper!==commitProof.resources||accounting&&resources.budget!==accounting.identity))return reject('binding');
      checkpoint('post','discard');commitProof=undefined;state='discarded';discards=1;
    });},
    inspect:()=>Object.freeze({scope:'synthetic_failure_owner' as const,authority:'none' as const,state,first_hard:first??null,custody:custody.holder,local_cleanup_refs:custody.holder==='local'?roles.filter(r=>ledger[r].ever_started).length:0,
      seal_started:sealStarted,commit_started:commitStarted,discard_started:discardStarted,commits,discards,report:report??null,report_pending:!!reportHandle,receipt_pending:!!receipt,protocol_faults:faults,observed_stop:observedStop,
      permissions:Object.freeze({accepted_adoption:false,destination_seal:false,formal_issuance:false}),unverified}),
  });
  const upper=Object.freeze({
    observe:(role:Role,ticket:FailureCreationTicket,fact:FailureFact,...args:unknown[])=>observe('upper',role,ticket,fact,false,args),
    observeAbsent:(role:Role,fact:FailureAbsence,...args:unknown[])=>observe('upper',role,undefined,fact,true,args),
    requestCleanup:(role:Role,ticket:FailureCreationTicket,...args:unknown[])=>requestCleanup('upper',role,ticket,args),
    inspect:()=>Object.freeze({scope:'synthetic_upper_failure_owner' as const,authority:'none' as const,accepted:!!upperReport,custody:custody.holder,report:upperReport??null,current:upperReport?snapshot():null,unverified}),
  });
  return Object.freeze({issuer,local,upper,currentFailure:()=>first?snapshot():null,holder:()=>custody.holder});
}

/** FB-01: fresh DATA-only construction. No kernel, role issuer, accepted adoption or cleanup execution. */
export function createSyntheticFailureBoundSupply(raw:unknown,dependencies:unknown,...extra:unknown[]){
  // Allocate all failure/custody/upper slots before inspecting any caller-owned input or dependency.
  const token=opaque<object>(),custody=createFailureCustodyCore('connected',()=>undefined,token);
  const failure:SupplyFailureSlot={token,claimed:false,notices:0,reason:undefined,custody};
  let fixedGuard:SupplyGuard=()=>undefined,initialFailure:SupplyReason|undefined;
  try{
    const deps=supplyRecord(dependencies,['guard']);
    if(typeof deps.guard!=='function'||types.isProxy(deps.guard))supplyBad();
    fixedGuard=deps.guard as SupplyGuard;
  }catch{initialFailure='shape';}
  const supply=createOwnedMixedSupply(raw,fixedGuard,extra,token,failure,initialFailure);
  raw=dependencies=undefined;
  return Object.freeze({...supply,failure:()=>Object.freeze({scope:'synthetic_failure_bound_supply' as const,authority:'none' as const,
    owner_allocated:true,upper_slot_allocated:true,notice_claimed:failure.claimed,notices:failure.notices,reason:failure.reason??null,
    current:custody.currentFailure(),upper_accepted:custody.upper.inspect().accepted,
    permissions:Object.freeze({kernel_generation:false,accepted_adoption:false,destination_seal:false,formal_issuance:false}),
    unverified:Object.freeze(['role_origin','actual_cleanup','attempt_inventory','canonical_budget','cleanup_deadline'])})});
}

// FB-02 fixed private lifecycle connection. These bindings never leave the fresh DATA constructor.
const failureStages:Readonly<Record<Phase,Stage>>={binding:'prepare',observation:'prepare',recovery_claim:'prepare',recovery_consume:'prepare',
  cleanup_lease:'cleanup',cleanup_record:'cleanup',revoke:'internal',close:'cleanup',discard:'cleanup',phase_prepare:'prepare',phase_verify:'prepare',phase_chunk:'prepare',
  phase_retry:'prepare',phase_worker:'prepare',phase_ready:'prepare',phase_consume:'prepare',worker_closure_begin:'cleanup',worker_closure_settle:'cleanup',worker_closure_consume:'cleanup',
  worker_prepare:'prepare',worker_prepare_discard:'cleanup',worker_verify:'prepare',generation_claim:'prepare',generation_start:'prepare',generation_ready:'prepare',
  generation_cleanup:'cleanup',generation_discard:'cleanup',worker_plan:'transfer',source_lifecycle:'cleanup',finish_binding:'transfer',finish_discard:'cleanup',
  finish_issue:'transfer',finish_accept:'transfer',finish_accepted_discard:'cleanup',finish_seal:'transfer'};
type KernelRoleBinding={ticket:FailureCreationTicket;creator:object;frame:object|undefined;reference:object|undefined;sink:object|undefined;started:boolean;settled:boolean;requested:boolean};
function createFailureKernelLink(failure:SupplyFailureSlot,accounting?:FailureRunSupply){
  const {custody}=failure,bindings:Partial<Record<Role,KernelRoleBinding>>={};let protectedState=false,protectionChecks=0,bindingFault=false,phase:Phase|null=null,oldCreatorClosed=false,unstartedLease:object|undefined;
  function reserve(role:Role){
    if(bindings[role])throw Error('internal_review_error');
    const b:KernelRoleBinding={ticket:custody.issuer.beginCreation(role),creator:opaque(),frame:undefined,reference:undefined,sink:undefined,started:false,settled:false,requested:false};bindings[role]=b;accounting?.record('role_reservation');return b;
  }
  const consumer=()=>custody.holder()==='upper'?custody.upper:custody.local;
  function fact(role:Role,b:KernelRoleBinding,kind:FactKind){consumer().observe(role,b.ticket,custody.issuer.fact(b.ticket,kind));accounting?.record('role_fact');}
  function request(role:Role,b:KernelRoleBinding){consumer().requestCleanup(role,b.ticket);accounting?.record('cleanup_request');}
  function created(role:Role,b:KernelRoleBinding){fact(role,b,'created');}
  function notice(code:Code,where:Phase){if(!failure.claimed){failure.claimed=true;phase=where;custody.local.hard(code,failureStages[where]);failure.notices++;accounting?.record('notice');}}
  return Object.freeze({
    reserveSource(){reserve('source');},
    sourceBorn(frame:object,reference:object){const b=bindings.source;if(!b||b.frame)throw Error('internal_review_error');b.frame=frame;b.reference=reference;b.started=true;created('source',b);},
    sourceCloseRequested(frame:object,reference:object){
      const b=bindings.source;if(!b||b.requested||b.frame!==frame||b.reference!==reference)throw Error('internal_review_error');
      b.requested=true;request('source',b);
    },
    sourceClosed(frame:object,reference:object){
      const b=bindings.source;if(!b||!b.requested||b.settled||b.frame!==frame||b.reference!==reference)throw Error('internal_review_error');
      b.settled=true;accounting?.record('terminal_receipt');fact('source',b,'source_closed');
    },
    reserveOld(){reserve('old_generation');},
    oldBorn(frame:object,generation:object){const b=bindings.old_generation;if(!b||b.frame||oldCreatorClosed)throw Error('internal_review_error');b.frame=frame;b.reference=generation;b.started=true;created('old_generation',b);},
    closeUnstartedOldCreator(){if(bindings.old_generation||oldCreatorClosed)throw Error('internal_review_error');oldCreatorClosed=true;},
    oldLease(lease:object,facts:SyntheticSoftFacts){
      const b=bindings.old_generation;
      if(facts.worker_state==='none'){if(!oldCreatorClosed||b||unstartedLease)throw Error('internal_review_error');unstartedLease=lease;return;}
      if(!b||b.sink||facts.worker!==b.frame||facts.generation!==b.reference)throw Error('internal_review_error');
      b.sink=lease;b.requested=true;request('old_generation',b);
    },
    oldUnstarted(lease:object,facts:SyntheticSoftFacts){
      if(!oldCreatorClosed||bindings.old_generation||facts.worker_state!=='none'||lease!==unstartedLease)throw Error('internal_review_error');
      unstartedLease=undefined;consumer().observeAbsent('old_generation',custody.issuer.proveUncreated('old_generation'));accounting?.record('role_fact');accounting?.record('terminal_receipt');
    },
    oldSettled(lease:object,facts:SyntheticSoftFacts,termination:string,cleanup:string){
      const b=bindings.old_generation;
      if(!b||b.settled||b.sink!==lease||facts.worker_state==='none'||facts.worker!==b.frame||facts.generation!==b.reference)throw Error('internal_review_error');
      b.settled=true;b.sink=undefined;accounting?.record('terminal_receipt');
      if(termination==='confirmed')fact('old_generation',b,'worker_terminated');
      fact('old_generation',b,cleanup==='complete'?'cleanup_confirmed':'cleanup_unconfirmed');
    },
    reserveNew(){reserve('new_generation');},
    newAllocated(frame:object,sink:object,identity:object){const b=bindings.new_generation;if(!b||b.frame||b.sink)throw Error('internal_review_error');b.frame=frame;b.reference=identity;b.sink=sink;},
    newStarted(frame:object,sink:object){const b=bindings.new_generation;if(!b||b.started||b.frame!==frame||b.sink!==sink||b.settled)throw Error('internal_review_error');b.started=true;created('new_generation',b);},
    newCleanupRequested(frame:object,sink:object,identity:object){
      const b=bindings.new_generation;if(!b||b.requested||b.settled||b.frame!==frame||b.sink!==sink||b.reference!==identity)throw Error('internal_review_error');
      b.requested=true;request('new_generation',b);
    },
    newSettled(frame:object,sink:object,validStart:boolean,started:boolean,valid:boolean,status:unknown){
      const b=bindings.new_generation;if(!b||b.settled||b.frame!==frame||b.sink!==sink||started!==b.started)throw Error('internal_review_error');
      b.settled=true;b.sink=undefined;accounting?.record('terminal_receipt');
      // Existing sink validation is the sole consumer; only its same-frame accepted fact is projected.
      if(validStart&&b.requested&&started)fact('new_generation',b,valid&&status==='confirmed'?'cleanup_confirmed':'cleanup_unconfirmed');
    },
    hasNewSink:()=>!!bindings.new_generation?.sink,
    ownedNewCleanup:()=>{const b=bindings.new_generation;return b?.sink?Object.freeze({sink:b.sink,requested:b.requested}):undefined;},
    beforeClear(code:Code,where:Phase,live:{source:object|undefined;reference:object|undefined;old_worker:object|undefined;old_generation:object|undefined;new_frame:object|undefined;new_sink:object|undefined}){
      if(!protectionChecks){
        protectionChecks=1;accounting?.record('clear_checkpoint');const s=bindings.source,o=bindings.old_generation,n=bindings.new_generation;
        bindingFault=!!(s?.frame&&(s.frame!==live.source||s.reference!==live.reference)||o?.frame&&(o.frame!==live.old_worker||o.reference!==live.old_generation)
          ||n?.sink&&(n.frame!==live.new_frame||n.sink!==live.new_sink));
        protectedState=!bindingFault;
      }
      // Inspect/catch after clear cannot synthesize this retained-FD-like identity checkpoint.
      notice(code,where);
    },
    hard:notice,
    inspect:()=>Object.freeze({protected:protectedState,protection_checks:protectionChecks,binding_fault:bindingFault,phase,bindings:Object.freeze(Object.fromEntries(roles.map(role=>{const b=bindings[role];return [role,Object.freeze({bound:!!b?.frame,reserved:!!b,started:b?.started??false,settled:b?.settled??false,cleanup_pending:!!b?.sink})];})))}),
  });
}
type FailureKernelLink=ReturnType<typeof createFailureKernelLink>;

/** FB-02: creates initial synthetic topology privately. No caller-supplied live references or accepted route. */
export function createSyntheticFailureBoundKernel(raw:unknown,dependencies:unknown,...extra:unknown[]){
  return createFailureBoundKernelCore(raw,dependencies,extra,false).base;
}
export function createSyntheticFailureCustodyRun(raw:unknown,dependencies:unknown,...extra:unknown[]){
  return createFailureBoundKernelCore(raw,dependencies,extra,true).joined;
}
function createFailureBoundKernelCore(raw:unknown,dependencies:unknown,extra:unknown[],joined:boolean){
  const token=opaque<object>(),accounting=joined?createFailureRunSupply(token):undefined;
  const resources:FailureResourceSlot|undefined=joined?{token,budget:accounting!.identity,local:{operations:undefined},upper:undefined,serial:0}:undefined;
  let terminalBusy=false,terminalPoison=false,cleanupGuard:FailureRunGuard=()=>undefined;
  function cleanupCheckpoint(phase:'pre'|'post',operation:'seal'|'commit'|'discard'|'cleanup'){
    accounting?.record('cleanup_checkpoint');let stop:unknown;
    try{stop=cleanupGuard(phase,operation,accounting!.inspect());}catch{throw Error('internal_review_error');}
    if(terminalPoison)throw Error('internal_review_error');accounting?.observe(stop);return stop;
  }
  const custody=createFailureCustodyCore('connected',(phase,operation)=>cleanupCheckpoint(phase,operation),token,resources,accounting);
  const failure:SupplyFailureSlot={token,claimed:false,notices:0,reason:undefined,custody,accounting},bridge:SupplyKernelBridge={token,owned:undefined};
  const link=createFailureKernelLink(failure,accounting);let fixedGuard:(stage:string,n?:number)=>unknown=()=>undefined,initialFailure:SupplyReason|undefined;
  try{const d=supplyRecord(dependencies,joined?['guard','cleanup_guard']:['guard']);if(typeof d.guard!=='function'||types.isProxy(d.guard))supplyBad();
    if(joined){if(typeof d.cleanup_guard!=='function'||types.isProxy(d.cleanup_guard))supplyBad();cleanupGuard=d.cleanup_guard as FailureRunGuard;}fixedGuard=d.guard as typeof fixedGuard;
  }catch{initialFailure='shape';}
  const supply=createOwnedMixedSupply(raw,(stage,n)=>{accounting?.record('healthy_checkpoint');const stop=fixedGuard(stage,n);return failure.claimed?custody.currentFailure()!.first_hard.code:stop;},extra,token,failure,initialFailure,bridge);raw=dependencies=undefined;extra=[];
  let kernel:ReturnType<typeof createRecoveryKernel>|undefined,initial:Readonly<{seed:SyntheticRecoverySeed;facts:SyntheticSoftFacts}>|undefined;
  let b:OwnerBinding|undefined,lease:WorkerClosureLease|undefined,evidence:WorkerClosureEvidence|undefined,busy=false;
  let preparationInput:unknown,preparation:WorkerRecoveryPreparation|undefined;
  function invalidate(){initial=undefined;b=lease=evidence=preparation=undefined;preparationInput=undefined;supply.discard();}
  function run<T>(phase:Phase,work:()=>T,cleanupOnly=false):T{
    if(busy||failure.claimed&&!cleanupOnly){link.hard(custody.currentFailure()?.first_hard.code??'internal_review_error',phase);kernel?.revoke(custody.currentFailure()!.first_hard.code);throw Error(custody.currentFailure()!.first_hard.code);}
    busy=true;try{return work();}catch(e){link.hard(code(e),phase);kernel?.revoke(custody.currentFailure()!.first_hard.code);throw Error(custody.currentFailure()!.first_hard.code);}
    finally{busy=false;if(failure.claimed)invalidate();}
  }
  const inspectFailure=()=>Object.freeze({scope:'synthetic_failure_bound_kernel' as const,authority:'none' as const,notices:failure.notices,current:custody.currentFailure(),...link.inspect(),upper_accepted:custody.upper.inspect().accepted,
    permissions:Object.freeze({accepted_adoption:false,destination_seal:false,formal_issuance:false}),unverified:Object.freeze(['runtime_resource_origin','actual_cleanup','attempt_inventory','worker_termination_origin','canonical_budget','cleanup_deadline','whole_run_work'])});
  const base=Object.freeze({
    prepare(...args:unknown[]){return run('binding',()=>{
      const h=supply.prepare(...args);let owned=bridge.owned;
      try{
        if(!owned||owned.token!==token)throw Error('internal_review_error');
        const time=owned.data.finish.time,point=owned.data.recovery.point;
        link.reserveSource();
        const seed:SyntheticRecoverySeed=Object.freeze({run:opaque(),session:opaque(),source:opaque(),key:opaque(),origin:opaque(),budget:accounting?.identity??opaque(),release:opaque(),
          started_at:time.started_at as string,deadline_ms:time.deadline_ms as number,observed_at:time.observed_at as string,upper_utc:time.upper_utc as string});
        accounting?.pin(token,seed.budget,owned.data.recovery.accounting,seed.started_at,seed.deadline_ms);
        const active=owned.pins.receipts.find(i=>i.update_xml_sys_id===owned!.data.recovery.active_input_sys_id);if(!active)throw Error('internal_review_error');
        const common={kind:'worker_deadline' as const,phase:'analysis' as const,point,supervisor:opaque(),request:opaque(),input:active.receipt};
        if(point!=='request_check_unstarted')link.reserveOld();else link.closeUnstartedOldCreator();
        const refs=point==='request_check_unstarted'?{}:{worker:opaque(),generation:opaque()};
        const facts=Object.freeze({...common,...refs,worker_state:point==='request_check_unstarted'?'none':point==='ready_timer'||point==='ready_reply_check'?'starting':'ready',
          ...(point==='send_check'?{allocation:opaque(),id:1}:point==='analyze_timer'||point==='analyze_reply_check'?{job:opaque(),id:1}:{})}) as SyntheticSoftFacts;
        if('worker' in facts)link.oldBorn(facts.worker,facts.generation);
        preparationInput={source:seed.source,budget:seed.budget,release:seed.release,origin:seed.origin,window:opaque(),verify:null,
          accounting:owned.data.recovery.accounting,rows:owned.model.selected,
          completed:owned.model.assets.filter(a=>a.state!=='not_processed').map(a=>a.state==='reviewed'?{state:a.state,update_xml_sys_id:a.update_xml_sys_id}:a),
          inputs:owned.pins.receipts.map(i=>({receipt:i.receipt,update_xml_sys_id:i.update_xml_sys_id,retrieved_at:i.retrieved_at,state:i.state==='completed'?'completed':'retained'})),
          collection_status:(owned.data.finish.header.collection as Record<string,unknown>).status,consistency:owned.data.recovery.consistency};
        supply.discardPrepared(h);
        kernel=createRecoveryKernel(seed,facts,()=>{accounting?.record('healthy_checkpoint');const stop=fixedGuard('kernel');return failure.claimed?custody.currentFailure()!.first_hard.code:stop===undefined?undefined:typeof stop==='string'?stop:'internal_review_error';},true,undefined,link);
        initial=Object.freeze({seed,facts});
      }catch(e){link.hard(code(e),'binding');throw Object.assign(Error(custody.currentFailure()!.first_hard.code),{code:custody.currentFailure()!.first_hard.code});}
      finally{owned=undefined;bridge.owned=undefined;if(failure.claimed)supply.discard();}
    });},
    beginClosure(...args:unknown[]){return run('worker_closure_begin',()=>{
      if(args.length||!kernel||!initial)throw Error('internal_review_error');b=kernel.bind(initial.seed);
      const observation=kernel.observe(b,initial.facts),recovery=kernel.claimRecovery(b,observation);lease=kernel.beginWorkerClosure(b,recovery);
    });},
    confirmOldUnstarted(...args:unknown[]){return run('worker_closure_settle',()=>{
      if(args.length||!kernel||!initial||!b||!lease)throw Error('internal_review_error');evidence=kernel.confirmWorkerUnstarted(b,lease,initial.facts);lease=undefined;
    });},
    settleOld(rawEvent:unknown,...args:unknown[]){return run('worker_closure_settle',()=>{
      if(args.length||!kernel||!initial||!b||!lease)throw Error('internal_review_error');const event=supplyRecord(rawEvent,['termination','cleanup']);
      evidence=kernel.settleWorkerClosure(b,lease,{context:initial.facts,termination:event.termination,cleanup:event.cleanup});lease=undefined;
    });},
    prepareGeneration(...args:unknown[]){return run('worker_prepare',()=>{
      if(args.length||!kernel||!b||!evidence||!preparationInput)throw Error('internal_review_error');const input=preparationInput;preparationInput=undefined;
      preparation=kernel.prepareWorkerRecovery(b,evidence,input);evidence=undefined;kernel.beginWorkerVerify(b,preparation);
    });},
    claimGeneration(...args:unknown[]){return run('generation_claim',()=>{if(args.length||!kernel||!b||!preparation)throw Error('internal_review_error');return kernel.claimWorkerGeneration(b,preparation);});},
    startGeneration(start:object,...args:unknown[]){return run('generation_start',()=>{if(args.length||!kernel||!b)throw Error('internal_review_error');return kernel.startWorkerGeneration(b,start);});},
    issueReady(lease:object,...args:unknown[]){return run('generation_ready',()=>{if(args.length||!kernel||!b)throw Error('internal_review_error');return kernel.issueWorkerGenerationReady(b,lease);});},
    acceptReady(lease:object,event:object,...args:unknown[]){return run('generation_ready',()=>{if(args.length||!kernel||!b)throw Error('internal_review_error');return kernel.acceptWorkerGenerationReady(b,lease,event);});},
    beginCleanup(sink:object,...args:unknown[]){return run('generation_cleanup',()=>{if(args.length||!kernel)throw Error('internal_review_error');kernel.beginWorkerGenerationCleanup(sink);},true);},
    settleCleanup(sink:object,status:unknown,...args:unknown[]){return run('generation_cleanup',()=>{if(args.length||!kernel)throw Error('internal_review_error');kernel.recordWorkerGenerationCleanup(sink,status);},true);},
    cleanupOwned(status:unknown,...args:unknown[]){return run('generation_cleanup',()=>{
      const own=link.ownedNewCleanup();if(args.length||!kernel||!own)throw Error('internal_review_error');
      if(!own.requested)kernel.beginWorkerGenerationCleanup(own.sink);kernel.recordWorkerGenerationCleanup(own.sink,status);
    },true);},
    beginSourceClose(...args:unknown[]){return run('source_lifecycle',()=>{if(args.length||!kernel||!b)throw Error('internal_review_error');kernel.beginSourceClose(b);});},
    settleSourceClose(status:unknown,...args:unknown[]){return run('source_lifecycle',()=>{if(args.length||!kernel||!b)throw Error('internal_review_error');kernel.settleSourceClose(b,status);});},
    stop(reason:unknown,...args:unknown[]){try{if(args.length){link.hard('internal_review_error','revoke');kernel?.revoke('internal_review_error');throw Error(custody.currentFailure()!.first_hard.code);}if(kernel)kernel.revoke(reason);else supply.stop(reason as 'cancelled');}finally{if(failure.claimed)invalidate();}},
    failure:inspectFailure,
    inspect:()=>Object.freeze({supply:supply.inspect(),kernel:kernel?.inspect()??null}),
  });
  if(resources)(resources.local as {operations:object}).operations=base;
  let transferStarted=false;
  function rejectJoined(phase:Phase):never{
    if(!custody.currentFailure())link.hard('internal_review_error',phase);
    if(resources?.local)(resources.local as {operations:typeof base}).operations.stop(custody.currentFailure()!.first_hard.code);
    throw Error(custody.currentFailure()!.first_hard.code);
  }
  function operations(side:'local'|'upper'){
    accounting?.record('entry');
    if(terminalBusy){accounting?.record('rejected_entry');terminalPoison=true;return rejectJoined('generation_cleanup');}
    const capsule=resources?.[side];
    if(!capsule||custody.holder()!==side){accounting?.record('rejected_entry');return rejectJoined('generation_cleanup');}
    return (capsule as {operations:typeof base}).operations;
  }
  function cleanup<T>(side:'local'|'upper',work:(ops:typeof base)=>T):T{
    const ops=operations(side);terminalBusy=true;terminalPoison=false;
    try{
      const stop=cleanupCheckpoint('pre','cleanup');
      if((stop==='cancelled'||stop==='deadline_exceeded')&&!custody.currentFailure()){link.hard(stop,'generation_cleanup');ops.stop(stop);}
      const value=work(ops);cleanupCheckpoint('post','cleanup');return value;
    }catch(e){link.hard(code(e),'generation_cleanup');ops.stop(custody.currentFailure()!.first_hard.code);throw Error(custody.currentFailure()!.first_hard.code);}
    finally{terminalBusy=false;}
  }
  const extended=Object.freeze({
    prepare:(...args:unknown[])=>operations('local').prepare(...args),
    beginClosure:(...args:unknown[])=>operations('local').beginClosure(...args),
    confirmOldUnstarted:(...args:unknown[])=>operations('local').confirmOldUnstarted(...args),
    settleOld:(event:unknown,...args:unknown[])=>operations('local').settleOld(event,...args),
    prepareGeneration:(...args:unknown[])=>operations('local').prepareGeneration(...args),
    claimGeneration:(...args:unknown[])=>operations('local').claimGeneration(...args),
    startGeneration:(start:object,...args:unknown[])=>operations('local').startGeneration(start,...args),
    issueReady:(lease:object,...args:unknown[])=>operations('local').issueReady(lease,...args),
    acceptReady:(lease:object,event:object,...args:unknown[])=>operations('local').acceptReady(lease,event,...args),
    beginCleanup:(sink:object,...args:unknown[])=>cleanup('local',ops=>ops.beginCleanup(sink,...args)),
    settleCleanup:(sink:object,status:unknown,...args:unknown[])=>cleanup('local',ops=>ops.settleCleanup(sink,status,...args)),
    cleanupOwned:(status:unknown,...args:unknown[])=>cleanup('local',ops=>ops.cleanupOwned(status,...args)),
    beginSourceClose:(...args:unknown[])=>operations('local').beginSourceClose(...args),
    settleSourceClose:(status:unknown,...args:unknown[])=>operations('local').settleSourceClose(status,...args),
    stop:(reason:unknown,...args:unknown[])=>operations('local').stop(reason,...args),
    transferFailure(...args:unknown[]){
      operations('local');if(transferStarted)return rejectJoined('worker_plan');transferStarted=true;
      if(args.length||!custody.currentFailure())return rejectJoined('worker_plan');
      terminalBusy=true;terminalPoison=false;
      try{return custody.local.commit(custody.local.seal());}catch{return rejectJoined('worker_plan');}finally{terminalBusy=false;}
    },
    finalDiscard(receipt:FailureCommitReceipt,...args:unknown[]){
      accounting?.record('entry');if(terminalBusy){accounting?.record('rejected_entry');terminalPoison=true;return rejectJoined('discard');}terminalBusy=true;terminalPoison=false;
      try{custody.local.finalDiscard(receipt,...args);}catch{return rejectJoined('discard');}finally{terminalBusy=false;}
    },
    failure:()=>Object.freeze({...inspectFailure(),...custody.local.inspect(),scope:'synthetic_failure_custody_run' as const,local_capsule:!!resources?.local,upper_capsule:!!resources?.upper,budget:accounting?.inspect()}),
    inspect:()=>resources?.local?(resources.local as {operations:typeof base}).operations.inspect():Object.freeze({supply:null,kernel:null}),
    upper:Object.freeze({cleanupOwned:(status:unknown,...args:unknown[])=>cleanup('upper',ops=>ops.cleanupOwned(status,...args)),
      inspect:()=>Object.freeze({...custody.upper.inspect(),capsule_pending:!!resources?.upper,budget:accounting?.inspect()})}),
  });
  return Object.freeze({base,joined:extended});
}
