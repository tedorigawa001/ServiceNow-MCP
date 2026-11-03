/** NR-A: bounded value checks only. No issuer, owner, claims or runtime admission. */
import {types} from 'node:util';
import {z} from 'zod';
import {assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';

export const RECOVERY_NONREVIEWED_VALUE_LIMITS=Object.freeze({model_id:'nr-state-producer-v1',depth:2,object_keys:4,nodes:16,character_units:1024});
export class NonReviewedValueError extends Error{readonly code='internal_review_error';constructor(readonly reason:'shape'|'limit'|'unsupported'){super('internal_review_error');}}
const bad=(reason:NonReviewedValueError['reason']='shape'):never=>{throw new NonReviewedValueError(reason);};
// Explicit snapshot, not an automatically expanding runtime allowlist. Extraction + payload-review catches.
const analysisReasons=['invalid_input','invalid_xml','forbidden_dtd','forbidden_instruction','unsupported_xml_version','forbidden_namespace','unsupported_envelope','ambiguous_record','deleted_asset','unsupported_action','duplicate_field','nested_field','payload_limit','element_limit','depth_limit','text_limit','code_limit','unexpected_text','missing_script','identity_mismatch','invalid_scope','javascript_parse_failed','analysis_limit','finding_limit','analysis_failed','rule_asset_mismatch'] as const;
const [,_notApplicable,deleted,rejected,retrieval,unprocessed,omitted]=assetOutcomeStructure.options;
const notApplicable=_notApplicable.refine(v=>v.asset_type==='other'?v.reason==='asset_type_unsupported':v.reason==='no_requested_rules');
const metadata=z.union([notApplicable,deleted,rejected.extend({reason:z.enum(['unsupported_action','identity_mismatch'])})]);
const retrieved=z.union([retrieval.extend({reason:z.enum(['payload_unavailable','missing_required_field','changed_during_review'])}),rejected.extend({reason:z.literal('payload_limit')})]);
const analysis=z.union([rejected.extend({reason:z.enum(analysisReasons)}),omitted]);
const common={schema_version:z.enum(['bp-mcp-review-0.2','bp-mcp-review-0.3'])};
const contract=z.discriminatedUnion('producer',[
  z.strictObject({...common,producer:z.literal('metadata'),outcome:metadata}),
  z.strictObject({...common,producer:z.literal('retrieval'),outcome:retrieved}),
  z.strictObject({...common,producer:z.literal('analysis'),outcome:analysis}),
  z.strictObject({...common,producer:z.literal('parent_omission'),outcome:omitted,original_state:z.literal('reviewed')}),
  z.strictObject({...common,producer:z.literal('retained'),outcome:unprocessed.extend({reason:z.literal('deadline_exceeded')})}),
]);
type Deep<T>=T extends readonly(infer E)[]?readonly Deep<E>[]:T extends object?{readonly[K in keyof T]:Deep<T[K]>}:T;
const brand=Symbol('synthetic_nonreviewed_value_only');
const unverified=Object.freeze(['producer_origin','receipt_binding','decision_origin','original_capture','cleanup','manifest','runtime_transport'] as const);
type Category<T>=T extends {producer:'parent_omission'}?'parent_omission_value':T extends {producer:'retained'}?'retained_value':'nonreviewed_value';
type Projected<T>=T extends object?Readonly<{scope:'synthetic_nonreviewed_values';authority:'none';validation_scope:'state_producer_values_only';category:Category<T>;model_id:typeof RECOVERY_NONREVIEWED_VALUE_LIMITS.model_id;value:Deep<T>;usage:Readonly<{nodes:number;character_units:number;maximum_depth:number;max_object_keys:number}>;unverified:typeof unverified;[brand]:'nonreviewed_data_only'}>:never;
export type SyntheticNonReviewedValues=Projected<z.infer<typeof contract>>;
export function projectSyntheticNonReviewedValue(raw:unknown):SyntheticNonReviewedValues{
  let nodes=0,characters=0,depth=0,keys=0;const limits=RECOVERY_NONREVIEWED_VALUE_LIMITS;
  function string(v:string){if(characters+v.length*3>limits.character_units)bad('limit');characters+=v.length*3;return v;}
  function copy(v:unknown,d:number):unknown{
    if(d>limits.depth||nodes>=limits.nodes)bad('limit');nodes++;depth=Math.max(depth,d);
    if(typeof v==='string')return string(v);
    if(!v||typeof v!=='object'||types.isProxy(v)||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return bad();
    const names=Reflect.ownKeys(v);if(names.length>limits.object_keys)bad('limit');keys=Math.max(keys,names.length);const out:Record<string,unknown>=Object.create(null);
    for(const k of names){if(typeof k!=='string')bad();string(k as string);const p=Object.getOwnPropertyDescriptor(v,k);if(!p||!Object.hasOwn(p,'value'))bad();out[k as string]=copy(p!.value,d+1);}return out;
  }
  function freeze(v:unknown){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}}
  try{
    const checked=contract.safeParse(copy(raw,0));if(!checked.success)bad();const value=checked.data!;
    if(value.schema_version==='bp-mcp-review-0.3'&&value.outcome.state==='skipped_deleted')bad('unsupported');
    freeze(value);const category=value.producer==='parent_omission'?'parent_omission_value':value.producer==='retained'?'retained_value':'nonreviewed_value';
    return Object.freeze({scope:'synthetic_nonreviewed_values',authority:'none',validation_scope:'state_producer_values_only',category,model_id:limits.model_id,value,
      usage:Object.freeze({nodes,character_units:characters,maximum_depth:depth,max_object_keys:keys}),unverified,[brand]:'nonreviewed_data_only'}) as SyntheticNonReviewedValues;
  }catch(error){if(error instanceof NonReviewedValueError)throw error;return bad();}
}
