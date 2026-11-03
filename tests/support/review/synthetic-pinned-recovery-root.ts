/** RB-B: private pins and recovery context originate in one synthetic construction. */
import {types} from 'node:util';
import {z} from 'zod';
import {createSyntheticFinishPins} from './synthetic-finish-pins.js';
import {createSyntheticFinishBindingKernel,type SyntheticRecoverySeed,type SyntheticSoftFacts} from './synthetic-recovery-kernel.js';
import {createSyntheticRecoveryCaptureAssembly,projectSyntheticRecoveryCaptureContexts,RecoveryCaptureError,type CaptureManifest} from './synthetic-recovery-capture.js';
import {createSyntheticNonReviewedManifestSupplier,NonReviewedIssuerError} from './synthetic-recovery-nonreviewed-issuer.js';
import {projectSyntheticNonReviewedValue} from './synthetic-recovery-nonreviewed-values.js';
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
declare const capturedFinishBrand:unique symbol;
type CapturedFinish=Readonly<{[capturedFinishBrand]:'synthetic_captured_finish_expectation'}>;
declare const mixedFinishBrand:unique symbol;
type MixedFinish=Readonly<{[mixedFinishBrand]:'synthetic_mixed_finish_expectation'}>;
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
function prepareMixed(material:ReturnType<typeof construct>,raw:unknown,check:()=>string|undefined){
  if(!Array.isArray(raw)||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>100||Reflect.ownKeys(raw).length!==raw.length+1)throw Error();
  const events=Array.from({length:raw.length},(_,i)=>{
    const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value')||!d.value||typeof d.value!=='object'||types.isProxy(d.value))throw Error();
    const kind=Object.getOwnPropertyDescriptor(d.value,'kind')?.value;
    return record(d.value,kind==='reviewed'?['kind','context','response']:kind==='metadata'?['kind','row']:kind==='retrieval'?['kind','row','event']:kind==='analysis'?['kind','row','response']:[]);
  });
  const pins=material.pins,processed=pins.outcomes.filter(o=>o.state!=='not_processed');
  if(events.length!==processed.length)throw Error();
  const links=pins.outcomes.map((outcome,i)=>{
    if(outcome.update_xml_sys_id!==pins.seed.selected[i])throw Error();const input=pins.receipts.find(r=>r.update_xml_sys_id===outcome.update_xml_sys_id);
    if(outcome.state==='not_processed'&&(!input||input.state!=='not_processed'||outcome.reason!=='deadline_exceeded'))throw Error();
    if(outcome.state==='result_omitted'&&outcome.reviewed_origin!==null)throw Error();
    return Object.freeze({row:opaque(),outcome,input});
  });
  const reviewedEvents:Readonly<Record<string,unknown>>[]=[],nonEvents:Readonly<Record<string,unknown>>[]=[],rows:Record<string,unknown>[]=[],expected:unknown[]=[];
  for(const [i,outcome] of processed.entries()){
    const event=events[i],input=pins.receipts.find(r=>r.update_xml_sys_id===outcome.update_xml_sys_id);
    if(event.kind==='reviewed'){
      if(outcome.state!=='reviewed')throw Error();reviewedEvents.push(Object.freeze({context:event.context,response:event.response}));continue;
    }
    if(outcome.state==='reviewed')throw Error();const r=record(event.row,event.kind==='analysis'?['producer','sys_id','name','action','retrieved_at']:['producer','sys_id','name','action']);
    if(r.producer!==event.kind||r.sys_id!==outcome.update_xml_sys_id)throw Error();
    if(event.kind==='metadata'&&input)throw Error();
    if(event.kind==='retrieval'&&input&&(input.state!=='completed'||input.expected_context!==null))throw Error();
    if(event.kind==='analysis'&&(!input||input.state!=='completed'||!input.expected_context||r.retrieved_at!==input.retrieved_at))throw Error();
    const data=outcome.state==='result_omitted'?{state:outcome.state,update_xml_sys_id:outcome.update_xml_sys_id,reason:outcome.reason}:outcome;
    expected.push(projectSyntheticNonReviewedValue({schema_version:pins.seed.header.schema_version,producer:event.kind,outcome:data}).value);rows.push(r);nonEvents.push(event);
  }
  let supplier:ReturnType<typeof createSyntheticNonReviewedManifestSupplier>|undefined;
  try{
    if(rows.length){supplier=createSyntheticNonReviewedManifestSupplier({kind:'synthetic_nonreviewed_issuer_v1',schema_version:pins.seed.header.schema_version,requested_rule_ids:pins.seed.header.coverage.requested_rule_ids,rows},{guard:()=>{
      const reason=check();if(reason!==undefined)throw Object.assign(Error(),{code:reason});
    }},expected);
      for(const [i,event] of nonEvents.entries()){const row=supplier.rows[i];
        if(event.kind==='metadata')supplier.issueClassified(row);
        else if(event.kind==='retrieval'){const t=supplier.beginRetrieval(row),terminal=supplier.settleRetrieval(row,t.input,t.attempt,event.event);supplier.issueRetrieved(row,t.input,t.attempt,terminal);}
        else{const t=supplier.beginAnalysis(row),w=supplier.deliverAnalysis(row,t.input,t.job,event.response);supplier.issueAnalyzed(row,t.input,t.job,w);}
      }
    }
    return {links:Object.freeze(links),reviewedEvents:Object.freeze(reviewedEvents),supplier,counts:Object.freeze({selected:links.length,reviewed:reviewedEvents.length,nonreviewed:rows.length,retained:links.filter(l=>l.outcome.state==='not_processed').length})};
  }catch(error){supplier?.discard();throw error;}
}
function createRoot(raw:unknown,check:()=>string|undefined,captureMode=false,events?:unknown,mixedMode=false){
  let material:ReturnType<typeof construct>|undefined;try{material=construct(raw);}catch{/* fixed binding rejection below */}
  let capture:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>|undefined,manifest:CaptureManifest|undefined;
  let capturedState:'prepared'|'sealed'|'invalidated'|'discarded'|'failed'='prepared',capturedTransfers=0,capturedReceipts=0,capturedStarted=false;
  let constructionStop='internal_review_error',captureStop:string|undefined;
  let captureBinding:Readonly<{accepted:object;plan:object;handoff:object;seal:object;content:object}>|undefined;
  let ownPlan:object|undefined,ownHandoff:object|undefined,ownAccepted:object|undefined;
  let mixed:ReturnType<typeof prepareMixed>|undefined,mixedSeal:Readonly<{handle:MixedFinish;accepted:object;plan:object;handoff:object;seal:object;empty:Readonly<{plan:object;rows:readonly object[]}>|undefined}>|undefined,mixedBusy=false;
  let mixedCounts:Readonly<{selected:number;reviewed:number;nonreviewed:number;retained:number}>=Object.freeze({selected:0,reviewed:0,nonreviewed:0,retained:0});
  // All receipt/accepted identities come from this construction's private pins, never from event DATA.
  let receiptLinks:readonly Readonly<{receipt:object;accepted:object;id:string}>[]|undefined;
  if(mixedMode)try{if(!material)throw Error();mixed=prepareMixed(material,events,()=>{const reason=check();if(reason!==undefined)captureStop=reason;return reason;});mixedCounts=mixed.counts;events=mixed.reviewedEvents;}catch(error){if(captureStop!==undefined)constructionStop=captureStop;else if(error instanceof NonReviewedIssuerError)constructionStop=error.code;material=undefined;capturedState='failed';}
  if(captureMode)try{
    if(!material||!Array.isArray(events)||types.isProxy(events)||Object.getPrototypeOf(events)!==Array.prototype||events.length<(mixedMode?0:1)||events.length>100||Reflect.ownKeys(events).length!==events.length+1)throw Error();
    const rows=Array.from({length:events.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(events,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error();return record(d.value,['context','response']);});
    const contexts=rows.length?projectSyntheticRecoveryCaptureContexts(rows.map(r=>r.context)):[],pins=material.pins;
    const reviewed=pins.outcomes.filter(o=>o.state==='reviewed');
    if(reviewed.length!==contexts.length||!mixedMode&&pins.outcomes.some(o=>o.state!=='reviewed'&&o.state!=='not_processed'))throw Error();
    receiptLinks=Object.freeze(reviewed.map((o,i)=>{
      if(o.state!=='reviewed')throw Error();const c=contexts[i],input=pins.receipts.find(r=>r.receipt===o.receipt),e=input?.expected_context;
      if(!input||!e||input.state!=='completed'||input.update_xml_sys_id!==c.update_xml_sys_id||o.update_xml_sys_id!==c.update_xml_sys_id||c.reviewed_at!==input.retrieved_at||c.target.retrieved_at!==input.retrieved_at
        ||c.target.update_set_id!==pins.seed.header.target.update_set_sys_id||c.instance_binding!==e.instance_binding||c.target.record_updated_at!==e.record_updated_at
        ||JSON.stringify(c.instance_release)!==JSON.stringify(e.instance_release)||JSON.stringify(c.requested_rule_ids)!==JSON.stringify(e.requested_rule_ids)||JSON.stringify(c.applicable_rule_ids)!==JSON.stringify(e.requested_rule_ids)||e.release_limitations.some(x=>!c.release_limitations.includes(x)))throw Error();
      return Object.freeze({receipt:input.receipt,accepted:o.accepted_outcome,id:o.update_xml_sys_id});
    }));
    capturedReceipts=receiptLinks.length;
    if(contexts.length){capture=createSyntheticRecoveryCaptureAssembly(contexts,{guard:()=>{const reason=check();if(reason!==undefined)captureStop=reason;return reason===undefined?undefined:reason==='cancelled'||reason==='deadline_exceeded'?reason:(()=>{throw Error();})();}});
      for(let i=0;i<rows.length;i++)capture.accept(capture.deliver(capture.inputs[i],rows[i].response));}
  }catch(error){if(captureStop!==undefined)constructionStop=captureStop;else if(error instanceof RecoveryCaptureError&&(error.reason==='cancelled'||error.reason==='deadline_exceeded'))constructionStop=error.reason;capture?.discard();mixed?.supplier?.discard();capture=undefined;mixed=undefined;material=undefined;capturedState='failed';}
  // Captures already copied/validated these deliveries; do not retain caller contexts or raw JSON via the partition.
  if(mixed)mixed.reviewedEvents=Object.freeze([]);
  events=undefined;raw=undefined;
  const invalid=!material,core=createSyntheticFinishBindingKernel(material?.seed as SyntheticRecoverySeed,material?.facts as SyntheticSoftFacts,material?.pins,()=>invalid?constructionStop:check());
  function invalidateCaptured(next:typeof capturedState){capture?.discard();mixed?.supplier?.discard();mixed=undefined;mixedSeal=undefined;manifest=undefined;captureBinding=undefined;receiptLinks=undefined;ownPlan=ownHandoff=ownAccepted=undefined;capturedState=next;}
  function invoke<T>(work:()=>T):T{try{if(mixedBusy)throw Error();return work();}catch(error){core.revoke(captureMode&&captureStop!==undefined?captureStop:captureMode&&error instanceof RecoveryCaptureError&&(error.reason==='cancelled'||error.reason==='deadline_exceeded')?error.reason:'internal_review_error');const code=core.inspect().diagnostics.hard?.code??'internal_review_error';throw Object.assign(Error(code),{code});}finally{
    const s=core.inspect();if(['failed','closed'].includes(s.state)){material=undefined;if(captureMode)invalidateCaptured(s.state==='failed'?'failed':'discarded');}
    else if(captureMode&&(s.lifecycle?.source_close_started||s.lifecycle?.cleanup_started))invalidateCaptured(capturedState==='discarded'?'discarded':'invalidated');
  }}
  const root={
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
    discardWorkerRecoveryPreparation(binding:object,preparation:object){return invoke(()=>{if(captureMode)invalidateCaptured('discarded');return core.discardWorkerRecoveryPreparation(binding,preparation);});},
    claimRecoveryGeneration(binding:object,preparation:object){return invoke(()=>{core.beginWorkerVerify(binding,preparation);const ticket=core.claimWorkerGeneration(binding,preparation);return Object.freeze({start:ticket.start as unknown as Start,cleanup:ticket.cleanup as unknown as Cleanup});});},
    startRecoveryGeneration(binding:object,start:object):Lease{return invoke(()=>core.startWorkerGeneration(binding,start)) as unknown as Lease;},
    acceptRecoveryReady(binding:object,lease:object):Ready{return invoke(()=>{const event=core.issueWorkerGenerationReady(binding,lease);return core.acceptWorkerGenerationReady(binding,lease,event);}) as unknown as Ready;},
    checkRecoveryReady(binding:object,ready:object){return invoke(()=>core.checkWorkerGenerationReady(binding,ready));},
    beginSourceClose(binding:object){return invoke(()=>core.beginSourceClose(binding));},
    settleSourceClose(binding:object,status:unknown){return invoke(()=>core.settleSourceClose(binding,status));},
    beginRecoveryCleanup(sink:object){return invoke(()=>core.beginWorkerGenerationCleanup(sink));},
    recordRecoveryCleanup(sink:object,status:unknown){return invoke(()=>core.recordWorkerGenerationCleanup(sink,status));},
    discardRecoveryGeneration(binding:object,ready:object){return invoke(()=>{if(captureMode)invalidateCaptured('discarded');return core.discardWorkerGeneration(binding,ready);});},
    sealRecoveryPlan(binding:object,ready:object,...extra:unknown[]):Plan{return invoke(()=>{if(extra.length)throw Error();const p=core.sealWorkerRecoveryPlan(binding,ready);if(captureMode)ownPlan=p;return p;}) as unknown as Plan;},
    transferRecoveryPlan(binding:object,plan:object,...extra:unknown[]):Handoff{return invoke(()=>{if(extra.length)throw Error();const h=core.transferWorkerRecoveryPlan(binding,plan);if(captureMode)ownHandoff=h;return h;}) as unknown as Handoff;},
    summarizeRecoveryPlan(binding:object,plan:object){return invoke(()=>{if(captureMode)invalidateCaptured('discarded');const s=core.summarizeWorkerRecoveryPlan(binding,plan);return Object.freeze({scope:'synthetic_unbound_recovery_summary' as const,authority:'none' as const,selected:s.assets.length,inputs:s.inputs.length});});},
    discardUnboundRecoveryPlan(binding:object,handoff:object){return invoke(()=>{if(captureMode)invalidateCaptured('discarded');return core.discardTransferredWorkerRecoveryPlan(binding,handoff);});},
    bindRecoveryPlan(binding:object,handoff:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.bindRecoveryPlan(binding,handoff);});},
    issueFinishContext(binding:object,handoff:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.issueFinishContext(binding,handoff);});},
    acceptRecoveryFinishContext(binding:object,handoff:object,evidence:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();const a=core.acceptRecoveryFinishContext(binding,handoff,evidence);if(captureMode)ownAccepted=a;return a;});},
    sealRecoveryFinishExpectation(binding:object,accepted:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();return core.sealRecoveryFinishExpectation(binding,accepted);});},
    discardAcceptedFinishContext(binding:object,accepted:object,...extra:unknown[]){return invoke(()=>{if(extra.length)throw Error();if(captureMode)invalidateCaptured('discarded');return core.discardAcceptedFinishContext(binding,accepted);});},
    checkBoundRecoveryPlan(binding:object,handoff:object){return invoke(()=>core.checkBoundRecoveryPlan(binding,handoff));},
    discardBoundRecoveryPlan(binding:object,handoff:object){return invoke(()=>{if(captureMode)invalidateCaptured('discarded');return core.discardBoundRecoveryPlan(binding,handoff);});},
    revoke(reason:unknown){return invoke(()=>core.revoke(reason));},
    close(binding:object){return invoke(()=>core.close(binding));},
    inspect(){const s=core.inspect(),p=s.worker_preparation;return Object.freeze({scope:'synthetic_pinned_recovery_root' as const,authority:'none' as const,state:s.state,claims:s.claims,diagnostics:s.diagnostics,closure:s.worker_closure,lifecycle:s.lifecycle??null,new_generation:s.new_generation,finish_binding:s.finish_binding??null,finish_issue:s.finish_issue??null,finish_accept:s.finish_accept??null,finish_accepted_discard:s.finish_accepted_discard??null,finish_seal:s.finish_seal??null,pins:material?Object.freeze({selected:material.pins.seed.selected.length,inputs:material.pins.receipts.length,accepted:material.pins.accepted}):null,preparation:p?Object.freeze({selected:p.selected,retained_inputs:p.retained_inputs,completed:p.completed,not_processed:p.not_processed,accounting:p.accounting,collection_status:p.collection_status,consistency:p.consistency,held:p.held}):null,route_bound:s.finish_binding?.active??false,evidence_issues:s.finish_issue?.issues??0,permissions:s.permissions});},
  };
  if(!captureMode)return Object.freeze(root);
  const {sealRecoveryFinishExpectation,inspect,...surface}=root;void sealRecoveryFinishExpectation;
  if(mixedMode)return Object.freeze({...surface,
    sealMixedRecoveryFinishExpectation(binding:object,accepted:object,...extra:unknown[]){return invoke(()=>{
      const used=capturedStarted;capturedStarted=true;if(extra.length||used||!material||!mixed||!ownPlan||!ownHandoff||capturedState!=='prepared')throw Error();mixedBusy=true;
      try{
        const seal=core.sealRecoveryFinishExpectation(binding,accepted);if(accepted!==ownAccepted)throw Error();
        const checkMixed=()=>{const reason=check();if(reason!==undefined){captureStop=reason;throw Error();}if(core.inspect().state!=='consumed'||!material||!mixed)throw Error();};
        checkMixed();
        if(mixed.links.length!==material.pins.seed.selected.length||mixed.counts.selected!==mixed.counts.reviewed+mixed.counts.nonreviewed+mixed.counts.retained)throw Error();
        for(const [i,link] of mixed.links.entries())if(link.outcome!==material.pins.outcomes[i]||link.outcome.update_xml_sys_id!==material.pins.seed.selected[i]||link.input!==material.pins.receipts.find(r=>r.update_xml_sys_id===link.outcome.update_xml_sys_id))throw Error();
        if(capture)manifest=capture.transfer();mixed.supplier?.sealManifest();
        const empty=mixed.counts.reviewed===0?Object.freeze({plan:ownPlan,rows:Object.freeze(mixed.links.map(l=>l.row))}):undefined;
        checkMixed();const handle=opaque() as MixedFinish;mixedSeal=Object.freeze({handle,accepted,plan:ownPlan,handoff:ownHandoff,seal,empty});capturedTransfers=1;capturedState='sealed';return handle;
      }finally{mixedBusy=false;}
    });},
    inspect(){return Object.freeze({...inspect(),manifest_binding:Object.freeze({scope:'synthetic_mixed_manifest_binding',authority:'none',state:capturedState,...mixedCounts,empty_reviewed:mixedCounts.selected>0&&mixedCounts.reviewed===0,started:capturedStarted,transfers:capturedTransfers,pending:!!mixedSeal,content_gate:false})});},
  });
  return Object.freeze({...surface,
    sealCapturedRecoveryFinishExpectation(binding:object,accepted:object){return invoke(()=>{
      const used=capturedStarted;capturedStarted=true;
      if(used||!capture||!material||!receiptLinks||!ownPlan||!ownHandoff||capturedState!=='prepared')throw Error();
      // The old seal validates the same live accepted/plan owner and both kernel guards first.
      const seal=core.sealRecoveryFinishExpectation(binding,accepted);
      if(accepted!==ownAccepted)throw Error();
      for(const link of receiptLinks){const o=material.pins.outcomes.find(o=>o.state==='reviewed'&&o.receipt===link.receipt);if(!o||o.state!=='reviewed'||o.accepted_outcome!==link.accepted||o.update_xml_sys_id!==link.id)throw Error();}
      manifest=capture.transfer();const content=opaque() as CapturedFinish;captureBinding=Object.freeze({accepted,plan:ownPlan,handoff:ownHandoff,seal,content});capturedTransfers=1;capturedState='sealed';return content;
    });},
    inspect(){return Object.freeze({...inspect(),capture_binding:Object.freeze({scope:'synthetic_capture_plan_binding',authority:'none',state:capturedState,started:capturedStarted,receipts:capturedReceipts,transfers:capturedTransfers,pending:!!(captureBinding&&manifest),content_gate:false})});},
  });
}
export function createSyntheticPinnedRecoveryRoot(raw:unknown,check:()=>string|undefined=()=>undefined){return createRoot(raw,check) as PinnedRoot;}
type PinnedRoot=Exclude<ReturnType<typeof createRoot>,{sealCapturedRecoveryFinishExpectation:unknown}|{sealMixedRecoveryFinishExpectation:unknown}>;
/** Fresh constructor only: old pins/accepted handles cannot be upgraded or registered. */
export function createSyntheticCapturedRecoveryRoot(raw:unknown,events:unknown,check:()=>string|undefined=()=>undefined){return createRoot(raw,check,true,events) as Extract<ReturnType<typeof createRoot>,{sealCapturedRecoveryFinishExpectation:unknown}>;}
/** New synthetic constructor only; never adopts old roots, evidence handles or summaries. */
export function createSyntheticMixedRecoveryRoot(raw:unknown,events:unknown,check:()=>string|undefined=()=>undefined){return createRoot(raw,check,true,events,true) as Extract<ReturnType<typeof createRoot>,{sealMixedRecoveryFinishExpectation:unknown}>;}
