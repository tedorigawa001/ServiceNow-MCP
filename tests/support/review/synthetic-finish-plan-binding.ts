/** RB-D pure bounded comparison/projection; never registers an owner or issues evidence. */
import {projectSyntheticFinishValues} from './synthetic-finish-context-values.js';
import type {SyntheticFinishPins} from './synthetic-finish-pins.js';
import type {prepareSyntheticWorkerRecoveryInputs} from './synthetic-worker-recovery-input.js';
import type {createSyntheticWorkerVerify} from './synthetic-worker-recovery-verify.js';
type Context=SyntheticFinishPins['seed']['run_context'];
export type SyntheticFinishPlanView=Readonly<{owner:object;seed:Omit<Context,'window'>;frame:object;inputs:ReturnType<typeof prepareSyntheticWorkerRecoveryInputs>;time:Pick<Context,'started_at'|'deadline_ms'|'observed_at'|'upper_utc'>;verify:ReturnType<ReturnType<typeof createSyntheticWorkerVerify>['inspect']>}>;
export type SyntheticFinishRouteView=Readonly<{owner:object;frame:object;source:object;source_identity:object;cleanup_identity:object;sink:object;ready_origin:object;serial:0}>;
const bad=():never=>{throw Error('internal_review_error');};
function project(pins:SyntheticFinishPins,plan:SyntheticFinishPlanView,route:SyntheticFinishRouteView){
  const c=pins.seed.run_context,i=plan.inputs,base=pins.seed.header;
  if(plan.owner!==route.owner||plan.frame!==route.frame||route.source!==c.source||route.serial!==0||plan.verify.stage!=='verified')bad();
  for(const k of ['run','session','source','key','origin','budget','release'] as const)if(plan.seed[k]!==c[k])bad();
  for(const k of ['started_at','deadline_ms','observed_at','upper_utc'] as const)if(plan.seed[k]!==c[k]||plan.time[k]!==c[k])bad();
  for(const k of ['source','budget','release','origin','window'] as const)if(i.context[k]!==c[k])bad();
  if(i.rows.length!==pins.seed.selected.length||i.rows.length>100||i.assets.length!==pins.outcomes.length||i.inputs.length!==pins.receipts.length||i.collection_status!==base.collection.status)bad();
  for(let n=0;n<i.rows.length;n++)if(i.rows[n]!==pins.seed.selected[n])bad();
  for(let n=0;n<i.inputs.length;n++){const a=i.inputs[n],b=pins.receipts[n];if(a.receipt!==b.receipt||a.update_xml_sys_id!==b.update_xml_sys_id||a.retrieved_at!==b.retrieved_at||a.state!==b.state)bad();}
  function checkAsset(raw:unknown,b:SyntheticFinishPins['outcomes'][number]){
    const a=raw as Record<string,unknown>;
    const keys=b.state==='reviewed'?['state','update_xml_sys_id']:b.state==='result_omitted'?['state','update_xml_sys_id','reason']:Object.keys(b);
    if(Object.keys(a).length!==keys.length||keys.some(k=>a[k]!==((b as unknown) as Record<string,unknown>)[k]))bad();
  }
  for(let n=0;n<i.assets.length;n++)checkAsset(i.assets[n],pins.outcomes[n]);
  const expectedCompleted=pins.outcomes.filter(x=>x.state!=='not_processed');if(i.completed.length!==expectedCompleted.length)bad();
  const completed=new Map(i.completed.map(x=>[x.update_xml_sys_id,x]));if(completed.size!==i.completed.length)bad();for(const x of expectedCompleted)checkAsset(completed.get(x.update_xml_sys_id),x);
  if(!['stable_observation','changed','unverified'].includes(plan.verify.consistency))bad();
  if(plan.verify.verify_required!==(i.context.verify!==null)||plan.verify.limitations.length>100)bad();
  if(!plan.verify.verify_required&&(plan.verify.consistency!==i.consistency||plan.verify.verify_error!==null||plan.verify.verify_calls!==0||plan.verify.attempts!==0||plan.verify.retry_waits!==0))bad();
  if(!plan.verify.verify_required)for(const k of ['requests','received_bytes','payload_bytes'] as const)if(plan.verify.accounting[k]!==i.accounting[k])bad();
  const needed=plan.verify.consistency==='stable_observation'?[]:['provisional_results',plan.verify.consistency==='changed'?'changed_during_review':'consistency_unverified'];
  if(plan.verify.limitations.length!==needed.length||new Set(plan.verify.limitations).size!==needed.length||needed.some(x=>!plan.verify.limitations.includes(x)))bad();
  const neededErrors=[...(plan.verify.verify_error?[plan.verify.verify_error]:[]),...(plan.verify.consistency==='changed'?['changed_during_review']:[])];
  if(plan.verify.errors.length!==neededErrors.length||neededErrors.some((x,n)=>plan.verify.errors[n]!==x))bad();
  const limitations=[...new Set([...base.limitations,'soft_deadline_reached','deadline_exceeded',...plan.verify.limitations])];
  const errors:unknown[]=[...base.errors],softErrors:unknown[]=[{stage:'analysis',code:'deadline_exceeded'}];
  if(plan.verify.verify_error)softErrors.push({stage:'consistency',code:plan.verify.verify_error});
  if(plan.verify.consistency==='changed')softErrors.push({stage:'consistency',code:'changed_during_review'});
  let truncated=false;for(const error of softErrors){if(errors.length<100)errors.push(Object.freeze(error));else truncated=true;}
  if(truncated&&!limitations.includes('error_details_truncated'))limitations.push('error_details_truncated');
  if(limitations.length>100)bad();
  const header=Object.freeze({...base,limitations:Object.freeze(limitations),errors:Object.freeze(errors)});
  const raw=Object.freeze({kind:'synthetic_finish_context_v1',owner:route.owner,plan,source_lifecycle:route.source_identity,run_context:c,header,selected:pins.seed.selected,inputs:pins.receipts,outcomes:pins.outcomes,
    route:Object.freeze({owner:route.owner,frame:route.frame,ready_origin:route.ready_origin,cleanup_origin:Object.freeze({lifecycle:route.cleanup_identity,frame:route.frame,sink:route.sink,start_serial:route.serial}),source_origin:Object.freeze({source:route.source,lifecycle:route.source_identity})})});
  const checked=projectSyntheticFinishValues(raw);
  // Retain the ORIGINAL private frame graph, never reconstruct a handle from projected copies.
  return Object.freeze({scope:'synthetic_finish_plan_projection' as const,authority:'none' as const,snapshot:Object.freeze({...raw,header:checked.value.header}),stats:Object.freeze({selected:i.rows.length,inputs:i.inputs.length,limitations:limitations.length,errors:errors.length,errors_truncated:truncated,consistency:plan.verify.consistency}),usage:checked.usage});
}
export function projectSyntheticFinishPlanBinding(pins:SyntheticFinishPins,plan:SyntheticFinishPlanView,route:SyntheticFinishRouteView){try{return project(pins,plan,route);}catch{return bad();}}
