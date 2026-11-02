/** RD-B01: strict bounded structure-only values. No owner, issuer, comparison or dispatch. */
import {types} from 'node:util';
import {z} from 'zod';
import {aggregateReviewStructure,aggregateReviewV3Structure,assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import {bp5RuleIdsSchema,releaseEvidenceStructure} from '../../../src/review/result-schema-v2.js';
export const RECOVERY_FINISH_VALUE_LIMITS=Object.freeze({depth:8,array:100,object_keys:30,nodes:10000,character_units:262144});
export class RecoveryFinishValueError extends Error{readonly code='internal_review_error';constructor(readonly reason:'shape'|'limit'){super('internal_review_error');}}
const bad=(reason:'shape'|'limit'='shape'):never=>{throw new RecoveryFinishValueError(reason);};
const expectationBrand=Symbol('synthetic_recovery_finish_expectation_value_only'),replyBrand=Symbol('synthetic_recovery_finish_reply_value_only');
declare const checkBrand:unique symbol;
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
/** Reserved contract for RD-B03; no constructor/issuer exists in RD-B01. */
export type SyntheticRecoveryFinishValueCheck=Readonly<{scope:'synthetic_recovery_finish_value_check';authority:'none';checked_scope:'context_and_manifest_only';matches:boolean;unverified:readonly['binding_provenance','original_body','full_schema','wire'];usage:Usage;[checkBrand]:'comparison_value_only'}>;
export function projectRecoveryFinishExpectation(raw:unknown):SyntheticRecoveryFinishExpectationValues{
  try{const budget=new Budget(),p=expectationSchema.safeParse(collect(raw,budget,true));if(!p.success)bad();return Object.freeze({scope:'synthetic_recovery_finish_expectation_values',authority:'none',validation_scope:'structure_only',unverified,value:freeze(p.data,true) as DeepValue<z.infer<typeof expectationSchema>>,usage:budget.usage(),[expectationBrand]:'expectation_value_only' as const});}catch(error){if(error instanceof RecoveryFinishValueError)throw error;return bad();}
}
export function projectRecoveryFinishReply(raw:unknown):SyntheticRecoveryFinishReplyValues{
  try{const budget=new Budget(),p=replySchema.safeParse(collect(raw,budget,false));if(!p.success)bad();return Object.freeze({scope:'synthetic_recovery_finish_reply_values',authority:'none',validation_scope:'structure_only',unverified,value:freeze(p.data,false) as DeepValue<z.infer<typeof replySchema>>,usage:budget.usage(),[replyBrand]:'reply_value_only' as const});}catch(error){if(error instanceof RecoveryFinishValueError)throw error;return bad();}
}
