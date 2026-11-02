/** RB-B: private pins and recovery context originate in one synthetic construction. */
import {types} from 'node:util';
import {z} from 'zod';
import {createSyntheticFinishPins} from './synthetic-finish-pins.js';
import {createSyntheticFinishBindingKernel,type SyntheticRecoverySeed,type SyntheticSoftFacts} from './synthetic-recovery-kernel.js';
declare const bindingBrand:unique symbol,observationBrand:unique symbol,recoveryBrand:unique symbol,preparationBrand:unique symbol;
type Binding=Readonly<{[bindingBrand]:'synthetic_pinned_recovery_binding'}>;
type Observation=Readonly<{[observationBrand]:'synthetic_pinned_recovery_observation'}>;
type Recovery=Readonly<{[recoveryBrand]:'synthetic_pinned_recovery_claim'}>;
type Preparation=Readonly<{[preparationBrand]:'synthetic_pinned_recovery_preparation'}>;
declare const startBrand:unique symbol,cleanupBrand:unique symbol,leaseBrand:unique symbol,readyBrand:unique symbol;
type Start=Readonly<{[startBrand]:'synthetic_pinned_generation_start'}>;
type Cleanup=Readonly<{[cleanupBrand]:'synthetic_pinned_generation_cleanup'}>;
type Lease=Readonly<{[leaseBrand]:'synthetic_pinned_generation_lease'}>;
type Ready=Readonly<{[readyBrand]:'synthetic_pinned_generation_ready'}>;
declare const planBrand:unique symbol,handoffBrand:unique symbol;
type Plan=Readonly<{[planBrand]:'synthetic_pinned_recovery_plan'}>;
type Handoff=Readonly<{[handoffBrand]:'synthetic_pinned_recovery_handoff'}>;
const opaque=()=>Object.freeze(Object.create(null)) as object;
const accountingSchema=z.strictObject({requests:z.number().int().min(0).max(210),received_bytes:z.number().int().min(0).max(16777216),payload_bytes:z.number().int().min(0).max(8388608)});
const pointSchema=z.enum(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check']);
function record(raw:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)throw Error();
  const out:Record<string,unknown>=Object.create(null);for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))throw Error();out[k]=d.value;}return Object.freeze(out);
}
function construct(raw:unknown){
  const d=record(raw,['kind','point','active_input_sys_id','accounting','consistency','finish']);if(d.kind!=='synthetic_pinned_recovery_root_v1')throw Error();
  const p=pointSchema.parse(d.point),accounting=Object.freeze(accountingSchema.parse(record(d.accounting,['requests','received_bytes','payload_bytes']))),consistency=z.enum(['stable_observation','changed','unverified']).parse(d.consistency);
  const pins=createSyntheticFinishPins(d.finish),c=pins.seed.run_context;
  const active=pins.receipts.find(x=>x.update_xml_sys_id===d.active_input_sys_id);if(!active||active.state!=='not_processed')throw Error();
  const seed:SyntheticRecoverySeed=Object.freeze({run:c.run,session:c.session,source:c.source,key:c.key,origin:c.origin,budget:c.budget,release:c.release,started_at:c.started_at,deadline_ms:c.deadline_ms,observed_at:c.observed_at,upper_utc:c.upper_utc});
  const base={kind:'worker_deadline' as const,phase:'analysis' as const,supervisor:opaque(),request:opaque(),input:active.receipt};let facts:SyntheticSoftFacts;
  if(p==='request_check_unstarted')facts=Object.freeze({...base,point:p,worker_state:'none'});
  else{const refs={worker:opaque(),generation:opaque()};
    if(p==='ready_timer'||p==='ready_reply_check')facts=Object.freeze({...base,...refs,point:p,worker_state:'starting'});
    else if(p==='send_check')facts=Object.freeze({...base,...refs,point:p,worker_state:'ready',allocation:opaque(),id:1});
    else if(p==='analyze_timer'||p==='analyze_reply_check')facts=Object.freeze({...base,...refs,point:p,worker_state:'ready',job:opaque(),id:1});
    else facts=Object.freeze({...base,...refs,point:p,worker_state:'ready'});
  }
  const completed=Object.freeze(pins.outcomes.filter(x=>x.state!=='not_processed').map(x=>x.state==='reviewed'?Object.freeze({state:x.state,update_xml_sys_id:x.update_xml_sys_id}):x.state==='result_omitted'?Object.freeze({state:x.state,update_xml_sys_id:x.update_xml_sys_id,reason:x.reason}):x));
  const input=Object.freeze({source:c.source,budget:c.budget,release:c.release,origin:c.origin,window:c.window,verify:null,accounting,rows:pins.seed.selected,completed,inputs:Object.freeze(pins.receipts.map(x=>Object.freeze({receipt:x.receipt,update_xml_sys_id:x.update_xml_sys_id,retrieved_at:x.retrieved_at,state:x.state==='completed'?'completed':'retained'}))),collection_status:pins.seed.header.collection.status,consistency});
  // Fail closed if the fixed supplier ever stops forwarding the original identities/rows.
  for(const k of ['source','budget','release','origin'] as const)if(input[k]!==c[k]||seed[k]!==c[k])throw Error();
  if(input.window!==c.window||input.rows!==pins.seed.selected||facts.input!==active.receipt||input.inputs.length!==pins.receipts.length)throw Error();
  for(let n=0;n<input.inputs.length;n++){const a=input.inputs[n],b=pins.receipts[n];if(a.receipt!==b.receipt||a.update_xml_sys_id!==b.update_xml_sys_id||a.retrieved_at!==b.retrieved_at||a.state!==(b.state==='completed'?'completed':'retained'))throw Error();}
  return Object.freeze({pins,seed,facts,input});
}
export function createSyntheticPinnedRecoveryRoot(raw:unknown,check:()=>string|undefined=()=>undefined){
  let material:ReturnType<typeof construct>|undefined;try{material=construct(raw);}catch{/* fixed binding rejection below */}
  const invalid=!material,core=createSyntheticFinishBindingKernel(material?.seed as SyntheticRecoverySeed,material?.facts as SyntheticSoftFacts,material?.pins,()=>invalid?'internal_review_error':check());
  function invoke<T>(work:()=>T):T{try{return work();}catch{core.revoke('internal_review_error');const code=core.inspect().diagnostics.hard?.code??'internal_review_error';throw Object.assign(Error(code),{code});}finally{if(['failed','closed'].includes(core.inspect().state))material=undefined;}}
  return Object.freeze({
    bind(...extra:unknown[]):Binding{return invoke(()=>core.bind(extra.length?Object.freeze({}) as SyntheticRecoverySeed:material?.seed as SyntheticRecoverySeed)) as unknown as Binding;},
    observe(binding:object,...extra:unknown[]):Observation{return invoke(()=>core.observe(binding,extra.length?{}:material?.facts)) as unknown as Observation;},
    claimRecovery(binding:object,observation:object):Recovery{return invoke(()=>core.claimRecovery(binding,observation)) as unknown as Recovery;},
    prepareWorkerRecovery(binding:object,recovery:object,event:unknown,...extra:unknown[]):Preparation{return invoke(()=>{
      const lease=core.beginWorkerClosure(binding,recovery);if(extra.length||!material)throw Error();
      const e=record(event,['termination','cleanup']);let proof:object;
      if(material.facts.worker_state==='none'){
        if(e.termination!=='not_required'||e.cleanup!=='not_required')throw Error();proof=core.confirmWorkerUnstarted(binding,lease,material.facts);
      }else proof=core.settleWorkerClosure(binding,lease,{context:material.facts,termination:e.termination,cleanup:e.cleanup});
      return core.prepareWorkerRecovery(binding,proof,material.input);
    }) as unknown as Preparation;},
    discardWorkerRecoveryPreparation(binding:object,preparation:object){return invoke(()=>core.discardWorkerRecoveryPreparation(binding,preparation));},
    claimRecoveryGeneration(binding:object,preparation:object){return invoke(()=>{core.beginWorkerVerify(binding,preparation);const ticket=core.claimWorkerGeneration(binding,preparation);return Object.freeze({start:ticket.start as unknown as Start,cleanup:ticket.cleanup as unknown as Cleanup});});},
    startRecoveryGeneration(binding:object,start:object):Lease{return invoke(()=>core.startWorkerGeneration(binding,start)) as unknown as Lease;},
    acceptRecoveryReady(binding:object,lease:object):Ready{return invoke(()=>{const event=core.issueWorkerGenerationReady(binding,lease);return core.acceptWorkerGenerationReady(binding,lease,event);}) as unknown as Ready;},
    checkRecoveryReady(binding:object,ready:object){return invoke(()=>core.checkWorkerGenerationReady(binding,ready));},
    beginSourceClose(binding:object){return invoke(()=>core.beginSourceClose(binding));},
    settleSourceClose(binding:object,status:unknown){return invoke(()=>core.settleSourceClose(binding,status));},
    beginRecoveryCleanup(sink:object){return invoke(()=>core.beginWorkerGenerationCleanup(sink));},
    recordRecoveryCleanup(sink:object,status:unknown){return invoke(()=>core.recordWorkerGenerationCleanup(sink,status));},
    discardRecoveryGeneration(binding:object,ready:object){return invoke(()=>core.discardWorkerGeneration(binding,ready));},
    sealRecoveryPlan(binding:object,ready:object,...extra:unknown[]):Plan{return invoke(()=>{if(extra.length)throw Error();return core.sealWorkerRecoveryPlan(binding,ready);}) as unknown as Plan;},
    transferRecoveryPlan(binding:object,plan:object,...extra:unknown[]):Handoff{return invoke(()=>{if(extra.length)throw Error();return core.transferWorkerRecoveryPlan(binding,plan);}) as unknown as Handoff;},
    summarizeRecoveryPlan(binding:object,plan:object){return invoke(()=>{const s=core.summarizeWorkerRecoveryPlan(binding,plan);return Object.freeze({scope:'synthetic_unbound_recovery_summary' as const,authority:'none' as const,selected:s.assets.length,inputs:s.inputs.length});});},
    discardUnboundRecoveryPlan(binding:object,handoff:object){return invoke(()=>core.discardTransferredWorkerRecoveryPlan(binding,handoff));},
    bindRecoveryPlan(binding:object,handoff:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.bindRecoveryPlan(binding,handoff);});},
    issueFinishContext(binding:object,handoff:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.issueFinishContext(binding,handoff);});},
    acceptRecoveryFinishContext(binding:object,handoff:object,evidence:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.acceptRecoveryFinishContext(binding,handoff,evidence);});},
    discardAcceptedFinishContext(binding:object,accepted:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.discardAcceptedFinishContext(binding,accepted);});},
    checkBoundRecoveryPlan(binding:object,handoff:object){return invoke(()=>core.checkBoundRecoveryPlan(binding,handoff));},
    discardBoundRecoveryPlan(binding:object,handoff:object){return invoke(()=>core.discardBoundRecoveryPlan(binding,handoff));},
    revoke(reason:unknown){return invoke(()=>core.revoke(reason));},
    close(binding:object){return invoke(()=>core.close(binding));},
    inspect(){const s=core.inspect(),p=s.worker_preparation;return Object.freeze({scope:'synthetic_pinned_recovery_root' as const,authority:'none' as const,state:s.state,claims:s.claims,diagnostics:s.diagnostics,closure:s.worker_closure,lifecycle:s.lifecycle??null,new_generation:s.new_generation,finish_binding:s.finish_binding??null,finish_issue:s.finish_issue??null,finish_accept:s.finish_accept??null,finish_accepted_discard:s.finish_accepted_discard??null,pins:material?Object.freeze({selected:material.pins.seed.selected.length,inputs:material.pins.receipts.length,accepted:material.pins.accepted}):null,preparation:p?Object.freeze({selected:p.selected,retained_inputs:p.retained_inputs,completed:p.completed,not_processed:p.not_processed,accounting:p.accounting,collection_status:p.collection_status,consistency:p.consistency,held:p.held}):null,route_bound:s.finish_binding?.active??false,evidence_issues:s.finish_issue?.issues??0,permissions:s.permissions});},
  });
}
