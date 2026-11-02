/** RD-B01/03: bounded local values/comparison only. No owner, evidence or dispatch. */
import {types} from 'node:util';
import {z} from 'zod';
import {aggregateReviewStructure,aggregateReviewV3Structure,assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import {bp5RuleIdsSchema,releaseEvidenceStructure,bp5RulesetFor,checkReleaseEvidence,releaseMatchForEvidence} from '../../../src/review/result-schema-v2.js';
import {requestedAssetTypes,TARGET_LIMITATIONS} from '../../../src/review/target-selection.js';
import {finishEndOutsideBounds,sameFinishRuleSet,sameFinishReleaseEncoding} from './synthetic-finish-scalars.js';
export const RECOVERY_FINISH_VALUE_LIMITS=Object.freeze({depth:8,array:100,object_keys:30,nodes:10000,character_units:262144});
export class RecoveryFinishValueError extends Error{readonly code='internal_review_error';constructor(readonly reason:'shape'|'limit'|'mismatch'){super('internal_review_error');}}
const bad=(reason:'shape'|'limit'|'mismatch'='shape'):never=>{throw new RecoveryFinishValueError(reason);};
const expectationBrand=Symbol('synthetic_recovery_finish_expectation_value_only'),replyBrand=Symbol('synthetic_recovery_finish_reply_value_only');
const checkBrand=Symbol('synthetic_recovery_finish_comparison_value_only');
const unverified=Object.freeze(['binding_provenance','context_and_manifest','time_consistency','original_body','full_schema','wire'] as const);
const contentEvidence=z.strictObject({original_body:z.literal('unknown'),full_schema:z.literal('unverified'),wire:z.literal('unverified')});
const reference=z.custom<object>(v=>!!v&&typeof v==='object'&&!types.isProxy(v));
const utc=z.string().length(24).pipe(z.iso.datetime({precision:3})),id=z.string().regex(/^[a-f0-9]{32}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const warnings=z.array(z.string().min(1).max(200)).max(100);
const expectedContext=z.strictObject({record_updated_at:z.iso.datetime(),instance_binding:hash,instance_release:releaseEvidenceStructure,requested_rule_ids:bp5RuleIdsSchema,release_limitations:warnings});
const header2=aggregateReviewStructure.pick({schema_version:true,target:true,versions:true,started_at:true,instance_release:true,release_match:true,principal:true,collection:true,coverage:true,limits:true,limitations:true,errors:true}).extend({
  release_match:z.literal('matched'),collection:aggregateReviewStructure.shape.collection.extend({status:z.enum(['complete','failed'])}),coverage:aggregateReviewStructure.shape.coverage.extend({analysis_complete:z.literal(false)}),limitations:warnings});
const header3=header2.extend({schema_version:z.literal('bp-mcp-review-0.3'),selection:aggregateReviewV3Structure.shape.selection,coverage:aggregateReviewV3Structure.shape.coverage.extend({analysis_complete:z.literal(false)}),errors:aggregateReviewV3Structure.shape.errors});
const header=z.discriminatedUnion('schema_version',[header2,header3]);
const nonReviewed=[assetOutcomeStructure.options[1],assetOutcomeStructure.options[2],assetOutcomeStructure.options[3],assetOutcomeStructure.options[4],assetOutcomeStructure.options[5].extend({reason:z.literal('deadline_exceeded')})] as const;
const outcome=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('reviewed'),update_xml_sys_id:id,receipt:reference,accepted_outcome:reference}),
  z.strictObject({state:z.literal('result_omitted'),update_xml_sys_id:id,reason:z.literal('response_limit'),reviewed_origin:z.strictObject({receipt:reference,accepted_outcome:reference}).nullable()}),...nonReviewed]);
const reviewedContext=z.strictObject({reviewed_at:utc,target:z.strictObject({update_set_id:id,update_xml_sys_id:id,target_version:z.literal('update_set_payload'),retrieved_at:utc,record_updated_at:z.iso.datetime()}),
  instance_binding:hash,instance_release:releaseEvidenceStructure,coverage:z.strictObject({requested_rule_ids:bp5RuleIdsSchema}),limitations:warnings});
const replyAsset=z.discriminatedUnion('state',[z.strictObject({state:z.literal('reviewed'),update_xml_sys_id:id,applicable_rule_ids:bp5RuleIdsSchema,result:reviewedContext}),assetOutcomeStructure.options[6],...nonReviewed]);
const expectationSchema=z.strictObject({kind:z.literal('synthetic_recovery_finish_expectation_v1'),binding:z.strictObject({owner:reference,plan:reference,run:reference,session:reference,source:reference,key:reference,origin:reference,budget:reference,release:reference,window:reference,
  frame:z.strictObject({supervisor:reference,worker:reference,generation:reference}),accepted_origin:reference}),time:z.strictObject({started_at:utc,deadline_ms:z.number().int().min(1).max(60000),observed_at:utc,upper_utc:utc}),
  header,selected:z.array(id).min(1).max(100),inputs:z.array(z.strictObject({receipt:reference,update_xml_sys_id:id,retrieved_at:utc,state:z.enum(['completed','not_processed']),expected_context:expectedContext.nullable()})).min(1).max(100),
  outcomes:z.array(outcome).min(1).max(100),run_status:z.enum(['partial','failed']),consistency:z.enum(['stable_observation','changed','unverified']),content_evidence:contentEvidence});
const replySchema=z.strictObject({kind:z.literal('synthetic_recovery_finish_reply_v1'),header,ended_at:utc,run_status:z.enum(['partial','failed']),consistency:z.enum(['stable_observation','changed','unverified']),assets:z.array(replyAsset).max(100),content_evidence:contentEvidence});
const opaquePaths=new Set([...['owner','plan','run','session','source','key','origin','budget','release','window','accepted_origin'].map(k=>'binding.'+k),...['supervisor','worker','generation'].map(k=>'binding.frame.'+k),
  'inputs.*.receipt','outcomes.*.receipt','outcomes.*.accepted_outcome','outcomes.*.reviewed_origin.receipt','outcomes.*.reviewed_origin.accepted_outcome']);
function opaque(path:readonly string[],expectation:boolean){return expectation&&opaquePaths.has(path.map(k=>/^\d+$/.test(k)?'*':k).join('.'));}
class Budget{
  nodes=0;characters=0;
  node(depth:number){if(++this.nodes>RECOVERY_FINISH_VALUE_LIMITS.nodes||depth>RECOVERY_FINISH_VALUE_LIMITS.depth)bad('limit');}
  string(value:string){this.characters+=value.length*3;if(this.characters>RECOVERY_FINISH_VALUE_LIMITS.character_units)bad('limit');}
  usage(){return Object.freeze({nodes:this.nodes,character_units:this.characters});}
}
function collect(raw:unknown,b:Budget,expectation:boolean){
  const ancestors=new Set<object>();
  function visit(v:unknown,path:string[],depth:number):unknown{
    b.node(depth);
    if(opaque(path,expectation)){if(!v||typeof v!=='object'||types.isProxy(v))bad();return v;}
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isSafeInteger(v))bad();return v;}
    if(typeof v==='string'){b.string(v);return v;}
    if(!v||typeof v!=='object'||types.isProxy(v)||ancestors.has(v))bad();
    const object=v as object;ancestors.add(object);
    try{
      if(Array.isArray(v)){
        if(v.length>RECOVERY_FINISH_VALUE_LIMITS.array)bad('limit');if(Object.getPrototypeOf(v)!==Array.prototype||Reflect.ownKeys(v).length!==v.length+1)bad();
        return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))bad();return visit(d!.value,[...path,String(i)],depth+1);});
      }
      if(![null,Object.prototype].includes(Object.getPrototypeOf(v)))bad();const keys=Reflect.ownKeys(object);if(keys.length>RECOVERY_FINISH_VALUE_LIMITS.object_keys)bad('limit');
      const out:Record<string,unknown>=Object.create(null);for(const k of keys){if(typeof k!=='string')bad();b.string(k as string);const d=Object.getOwnPropertyDescriptor(object,k);if(!d||!Object.hasOwn(d,'value'))bad();out[k as string]=visit(d!.value,[...path,k as string],depth+1);}return out;
    }finally{ancestors.delete(object);}
  }
  return visit(raw,[],0);
}
function freeze(v:unknown,expectation:boolean,path:string[]=[]):unknown{
  if(opaque(path,expectation)||!v||typeof v!=='object')return v;
  for(const k of Object.keys(v))freeze((v as Record<string,unknown>)[k],expectation,[...path,k]);return Object.freeze(v);
}
type DeepValue<T>=T extends readonly(infer E)[]?readonly DeepValue<E>[]:T extends object?{readonly[K in keyof T]:DeepValue<T[K]>}:T;
type Usage=ReturnType<Budget['usage']>;
export type SyntheticRecoveryFinishExpectationValues=Readonly<{scope:'synthetic_recovery_finish_expectation_values';authority:'none';validation_scope:'structure_only';unverified:typeof unverified;value:DeepValue<z.infer<typeof expectationSchema>>;usage:Usage;[expectationBrand]:'expectation_value_only'}>;
export type SyntheticRecoveryFinishReplyValues=Readonly<{scope:'synthetic_recovery_finish_reply_values';authority:'none';validation_scope:'structure_only';unverified:typeof unverified;value:DeepValue<z.infer<typeof replySchema>>;usage:Usage;[replyBrand]:'reply_value_only'}>;
/** Local context/manifest comparison only; never proof of original body or provenance. */
export type SyntheticRecoveryFinishValueCheck=Readonly<{scope:'synthetic_recovery_finish_value_check';authority:'none';checked_scope:'context_and_manifest_only';matches:boolean;unverified:readonly['binding_provenance','original_body','full_schema','wire'];usage:Usage;[checkBrand]:'comparison_value_only'}>;
export function projectRecoveryFinishExpectation(raw:unknown):SyntheticRecoveryFinishExpectationValues{
  try{const budget=new Budget(),p=expectationSchema.safeParse(collect(raw,budget,true));if(!p.success)bad();return Object.freeze({scope:'synthetic_recovery_finish_expectation_values',authority:'none',validation_scope:'structure_only',unverified,value:freeze(p.data,true) as DeepValue<z.infer<typeof expectationSchema>>,usage:budget.usage(),[expectationBrand]:'expectation_value_only' as const});}catch(error){if(error instanceof RecoveryFinishValueError)throw error;return bad();}
}
export function projectRecoveryFinishReply(raw:unknown):SyntheticRecoveryFinishReplyValues{
  try{const budget=new Budget(),p=replySchema.safeParse(collect(raw,budget,false));if(!p.success)bad();return Object.freeze({scope:'synthetic_recovery_finish_reply_values',authority:'none',validation_scope:'structure_only',unverified,value:freeze(p.data,false) as DeepValue<z.infer<typeof replySchema>>,usage:budget.usage(),[replyBrand]:'reply_value_only' as const});}catch(error){if(error instanceof RecoveryFinishValueError)throw error;return bad();}
}
type ExpectedValues=z.infer<typeof expectationSchema>;
type ReplyValues=z.infer<typeof replySchema>;
const unique=<T>(values:readonly T[])=>{if(new Set(values).size!==values.length)bad('mismatch');};
function equalData(a:unknown,b:unknown):boolean{
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const x=Object.keys(a).sort(),y=Object.keys(b).sort();
  return x.length===y.length&&x.every((k,i)=>k===y[i]&&equalData((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
}
function compareManifest(a:ExpectedValues,b:ReplyValues){
  unique(a.selected);unique(a.inputs.map(i=>i.update_xml_sys_id));unique(a.inputs.map(i=>i.receipt));
  unique(a.outcomes.map(i=>i.update_xml_sys_id));unique(b.assets.map(i=>i.update_xml_sys_id));
  if(a.selected.some((id,i)=>i>0&&a.selected[i-1]>=id)||a.outcomes.length!==a.selected.length||a.outcomes.some((r,i)=>r.update_xml_sys_id!==a.selected[i])||b.assets.length!==a.selected.length)bad('mismatch');
  const rows=new Map(a.outcomes.map(r=>[r.update_xml_sys_id,r])),inputs=new Map(a.inputs.map(i=>[i.update_xml_sys_id,i]));
  const accepted=new Set<object>();let upper=Date.parse(a.time.observed_at),unfinished=0;
  for(const i of a.inputs){
    const row=rows.get(i.update_xml_sys_id),t=Date.parse(i.retrieved_at);
    if(!row||t<upper||t>Date.parse(a.time.upper_utc)||(i.state==='not_processed')!==(row.state==='not_processed'))bad('mismatch');
    upper=t;if(i.state==='not_processed')unfinished++;
    const ex=i.expected_context;
    if(ex){
      unique(ex.requested_rule_ids);unique(ex.release_limitations);
      if(ex.instance_binding!==a.header.target.instance_binding||!sameFinishReleaseEncoding(JSON.stringify(ex.instance_release),JSON.stringify(a.header.instance_release))||ex.requested_rule_ids.some(r=>!a.header.coverage.requested_rule_ids.includes(r))||ex.release_limitations.some(x=>!a.header.limitations.includes(x))||checkReleaseEvidence(ex.instance_release,i.retrieved_at,ex.instance_binding,ex.release_limitations).length)bad('mismatch');
    }
  }
  if(!unfinished||upper!==Date.parse(a.time.upper_utc))bad('mismatch');
  for(const row of a.outcomes){
    const input=inputs.get(row.update_xml_sys_id);
    const origin=row.state==='reviewed'?row:row.state==='result_omitted'?row.reviewed_origin:null;
    if(row.state==='result_omitted'&&(!input||input.state!=='completed'))bad('mismatch');
    if(origin){if(!input||input.state!=='completed'||!input.expected_context||origin.receipt!==input.receipt||accepted.has(origin.accepted_outcome))bad('mismatch');accepted.add(origin.accepted_outcome);}
  }
  for(const actual of b.assets){
    const expected=rows.get(actual.update_xml_sys_id);if(!expected)bad('mismatch');
    if(expected!.state==='reviewed'){
      if(actual.state==='result_omitted'){if(!b.header.limitations.includes('response_truncated'))bad('mismatch');continue;}
      if(actual.state!=='reviewed')return bad('mismatch');
      const input=inputs.get(actual.update_xml_sys_id)!,context=input.expected_context!,r=actual.result,t=r.target;
      unique(actual.applicable_rule_ids);unique(r.coverage.requested_rule_ids);unique(r.limitations);
      if(r.reviewed_at!==input.retrieved_at||t.retrieved_at!==input.retrieved_at||t.update_set_id!==a.header.target.update_set_sys_id||t.update_xml_sys_id!==input.update_xml_sys_id||t.record_updated_at!==context.record_updated_at||r.instance_binding!==context.instance_binding||
        !sameFinishRuleSet(actual.applicable_rule_ids,context.requested_rule_ids)||!sameFinishRuleSet(r.coverage.requested_rule_ids,context.requested_rule_ids)||!sameFinishReleaseEncoding(JSON.stringify(r.instance_release),JSON.stringify(context.instance_release))||context.release_limitations.some(x=>!r.limitations.includes(x)))bad('mismatch');
    }else if(expected!.state==='result_omitted'){
      if(actual.state!=='result_omitted'||actual.reason!==expected!.reason)bad('mismatch');
    }else if(!equalData(expected,actual))bad('mismatch');
  }
}
function compareHeaderAndTime(a:ExpectedValues,b:ReplyValues,newOmission:boolean){
  const h=a.header,r=b.header,t=a.time,S=Date.parse(t.started_at),O=Date.parse(t.observed_at),U=Date.parse(t.upper_utc);
  if(S>O||O>U||U>S+t.deadline_ms||h.started_at!==t.started_at||h.collection.selected!==a.selected.length||a.run_status!==(h.collection.status==='failed'?'failed':'partial')||b.run_status!==a.run_status||b.consistency!==a.consistency)bad('mismatch');
  const seen=h.collection.metadata_seen,max=h.limits.max_records;
  // An initial failed collection cannot supply the nonempty active-input contract.
  if(h.collection.status==='failed'&&(seen||h.collection.selected||h.collection.truncated||a.consistency!=='unverified'))bad('mismatch');
  if(seen>max+1||h.collection.selected!==Math.min(seen,max)||h.collection.truncated!==(seen>max)||h.collection.truncated&&!h.limitations.includes('metadata_truncated'))bad('mismatch');
  unique(h.coverage.requested_rule_ids);unique(r.coverage.requested_rule_ids);unique(h.limitations);unique(r.limitations);
  if(h.coverage.skipped_rules.length||h.versions.ruleset!==bp5RulesetFor(h.coverage.requested_rule_ids)||releaseMatchForEvidence(h.instance_release)!=='matched')bad('mismatch');
  if(!sameFinishRuleSet(h.coverage.requested_rule_ids,r.coverage.requested_rule_ids)||h.limitations.some(x=>!r.limitations.includes(x))||!sameFinishReleaseEncoding(JSON.stringify(h.instance_release),JSON.stringify(r.instance_release)))bad('mismatch');
  // All fixed header facts remain exact; only requested-rule order and added warnings vary.
  for(const key of Object.keys(h) as (keyof typeof h)[]){
    if(key==='coverage'||key==='limitations'||key==='instance_release'||key==='errors')continue;
    if(!equalData(h[key],r[key]))bad('mismatch');
  }
  if(!equalData({...h.coverage,requested_rule_ids:[]},{...r.coverage,requested_rule_ids:[]}))bad('mismatch');
  // Errors keep the expected prefix; finalize may append only its single omission error (addReviewError), else marks truncation.
  const appendsOmissionError=newOmission&&!h.limitations.includes('response_truncated');
  const extraErrors=appendsOmissionError&&h.errors.length<100?[{stage:'output',code:'response_limit'}]:[];
  if(r.errors.length!==h.errors.length+extraErrors.length||!equalData(h.errors,r.errors.slice(0,h.errors.length))||!equalData(extraErrors,r.errors.slice(h.errors.length)))bad('mismatch');
  if(appendsOmissionError&&h.errors.length>=100&&!r.limitations.includes('error_details_truncated'))bad('mismatch');
  const release=h.instance_release;
  if(release.source==='sys_cluster_state.build_name'&&checkReleaseEvidence(release,t.observed_at,h.target.instance_binding,h.limitations).length)bad('mismatch');
  if(checkReleaseEvidence(release,release.source==='operator_config'?t.started_at:b.ended_at,h.target.instance_binding,r.limitations).length||release.source==='operator_config'&&Date.parse(release.expires_at)<=S+60000)bad('mismatch');
  if(h.schema_version==='bp-mcp-review-0.3'){
    if(!equalData(h.selection.requested_asset_types,requestedAssetTypes(h.coverage.requested_rule_ids))||TARGET_LIMITATIONS.some(x=>!h.limitations.includes(x))||a.outcomes.some(x=>x.state==='skipped_deleted'))bad('mismatch');
    for(const error of h.errors.filter(e=>e.code==='candidate_filter_violation'))if(error.update_xml_sys_id||a.consistency!=='unverified'||!['metadata','consistency'].includes(error.stage)||error.stage==='metadata'&&h.collection.status!=='failed'||error.stage==='consistency'&&h.collection.status!=='complete')bad('mismatch');
  }
}
export function compareRecoveryFinishValues(rawExpectation:unknown,rawReply:unknown):SyntheticRecoveryFinishValueCheck{
  try{
    const budget=new Budget(),a=expectationSchema.safeParse(collect(rawExpectation,budget,true));if(!a.success)bad();
    const b=replySchema.safeParse(collect(rawReply,budget,false));if(!b.success)bad();
    const expected=a.data!,reply=b.data!,t=expected.time;
    if(finishEndOutsideBounds(Date.parse(reply.ended_at),Date.parse(t.upper_utc),Date.parse(t.started_at),t.deadline_ms))bad('mismatch');
    const newOmission=expected.outcomes.some(o=>o.state==='reviewed'&&reply.assets.some(x=>x.update_xml_sys_id===o.update_xml_sys_id&&x.state==='result_omitted'));
    compareHeaderAndTime(expected,reply,newOmission);
    compareManifest(expected,reply);
    return Object.freeze({scope:'synthetic_recovery_finish_value_check',authority:'none',checked_scope:'context_and_manifest_only',matches:true,
      unverified:Object.freeze(['binding_provenance','original_body','full_schema','wire'] as const),usage:budget.usage(),[checkBrand]:'comparison_value_only' as const});
  }catch(error){if(error instanceof RecoveryFinishValueError)throw error;return bad();}
}
