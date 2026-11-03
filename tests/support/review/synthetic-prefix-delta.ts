/** PD-A: bounded prefix-local values only. No lifecycle, binding, issuer or runtime admission. */
import {types} from 'node:util';
import {z} from 'zod';
import {aggregateReviewStructure,aggregateReviewV3Structure} from '../../../src/review/aggregate-schema.js';

export const PREFIX_DELTA_VALUE_LIMITS=Object.freeze({model_id:'ordered-prefix-delta-v1',depth:4,object_keys:8,array:103,nodes:2500,character_units:650000});
type Phase='shape'|'eligibility'|'verify'|'delta';
export class PrefixDeltaValueError extends Error{readonly code='internal_review_error';constructor(readonly reason:'shape'|'limit'|'binding'|'unsupported',readonly phase:Phase){super('internal_review_error');}}
const bad=(reason:PrefixDeltaValueError['reason'],phase:Phase):never=>{throw new PrefixDeltaValueError(reason,phase);};
const warnings=z.array(z.string().min(1).max(2000)).max(103),verifyWarnings=z.array(z.string().min(1).max(200)).max(100);
const input=z.strictObject({kind:z.literal('synthetic_prefix_delta_v1'),model_id:z.literal(PREFIX_DELTA_VALUE_LIMITS.model_id),schema_version:z.enum(['bp-mcp-review-0.2','bp-mcp-review-0.3']),collection_status:z.enum(['complete','failed']),
  parent_prefix:z.strictObject({limitations:warnings,errors:aggregateReviewV3Structure.shape.errors}),
  verify:z.strictObject({stage:z.literal('verified'),verify_required:z.boolean(),consistency:z.enum(['stable_observation','changed','unverified']),verify_error:z.string().min(1).max(200).nullable(),limitations:verifyWarnings,errors:z.array(z.string().min(1).max(200)).max(2)})});
type ErrorValue=z.infer<typeof aggregateReviewV3Structure.shape.errors.element>;
type Deep<T>=T extends readonly(infer E)[]?readonly Deep<E>[]:T extends object?{readonly[K in keyof T]:Deep<T[K]>}:T;
const brand=Symbol('synthetic_prefix_delta_value_only');
const unverified=Object.freeze(['initial_prefix','parent_trace','full_header_eligibility','verify_origin','private_binding','accepted_projection','runtime_origin','whole_run_budget'] as const);
function freeze<T>(v:T):Deep<T>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v as Deep<T>;}
function copyBounded(raw:unknown){
  const lim=PREFIX_DELTA_VALUE_LIMITS;let nodes=0,characters=0,maxDepth=0;
  function text(s:string){if(characters+s.length*3>lim.character_units)bad('limit','shape');characters+=s.length*3;return s;}
  function visit(v:unknown,d:number):unknown{
    if(d>lim.depth||nodes>=lim.nodes)bad('limit','shape');nodes++;maxDepth=Math.max(maxDepth,d);
    if(typeof v==='string')return text(v);if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;
    if(!v||typeof v!=='object'||types.isProxy(v))return bad('shape','shape');
    if(Array.isArray(v)){
      if(Object.getPrototypeOf(v)!==Array.prototype||v.length>lim.array)return bad('limit','shape');
      if(Reflect.ownKeys(v).length!==v.length+1)return bad('shape','shape');
      return Array.from({length:v.length},(_,n)=>{const p=Object.getOwnPropertyDescriptor(v,String(n));if(!p||!Object.hasOwn(p,'value'))return bad('shape','shape');return visit(p.value,d+1);});
    }
    if(![null,Object.prototype].includes(Object.getPrototypeOf(v)))return bad('shape','shape');
    const keys=Reflect.ownKeys(v);if(keys.length>lim.object_keys)return bad('limit','shape');const out:Record<string,unknown>=Object.create(null);
    for(const k of keys){if(typeof k!=='string')return bad('shape','shape');text(k);const p=Object.getOwnPropertyDescriptor(v,k);if(!p||!Object.hasOwn(p,'value'))return bad('shape','shape');out[k]=visit(p.value,d+1);}return out;
  }
  const value=visit(raw,0);return {value,usage:{nodes,character_units:characters,maximum_depth:maxDepth}};
}
/** Pure DATA projection. Computed canonical equality is not an accepted-header or provenance proof. */
export function projectSyntheticPrefixDelta(raw:unknown,...extra:unknown[]){
  try{
    if(extra.length)bad('shape','shape');const copied=copyBounded(raw),parsed=input.safeParse(copied.value);if(!parsed.success)return bad('shape','shape');
    const s=parsed.data,v=s.verify,p=s.parent_prefix;
    // Eligibility precedes all dedup/sort. Do not rescue an OM-A intermediate with 101..103 or duplicates.
    if(p.limitations.length>100||p.limitations.some(x=>x.length>200))bad('limit','eligibility');
    if(new Set(p.limitations).size!==p.limitations.length)bad('binding','eligibility');
    const errorSchema=s.schema_version==='bp-mcp-review-0.2'?aggregateReviewStructure.shape.errors.element:aggregateReviewV3Structure.shape.errors.element;
    function checkError(e:ErrorValue,phase:Phase){
      if(!errorSchema.safeParse(e).success)bad('unsupported',phase);
      if(e.code==='candidate_filter_violation'&&(e.update_xml_sys_id!==undefined||!['metadata','consistency'].includes(e.stage)||e.stage==='metadata'&&s.collection_status!=='failed'||e.stage==='consistency'&&s.collection_status!=='complete'))bad('binding',phase);
    }
    for(const e of p.errors)checkError(e,'eligibility');
    const needed=v.consistency==='stable_observation'?[]:['provisional_results',v.consistency==='changed'?'changed_during_review':'consistency_unverified'];
    const neededErrors=[...(v.verify_error!==null?[v.verify_error]:[]),...(v.consistency==='changed'?['changed_during_review']:[])];
    if(!v.verify_required&&v.verify_error!==null||v.limitations.length!==needed.length||new Set(v.limitations).size!==needed.length||needed.some(x=>!v.limitations.includes(x))||v.errors.length!==neededErrors.length||neededErrors.some((x,n)=>v.errors[n]!==x))bad('binding','verify');
    const deltaErrors:ErrorValue[]=[{stage:'analysis',code:'deadline_exceeded'}];
    if(v.verify_error!==null){const e={stage:'consistency',code:v.verify_error};const checked=errorSchema.safeParse(e);if(!checked.success)bad('unsupported','delta');deltaErrors.push(checked.data!);}
    if(v.consistency==='changed')deltaErrors.push({stage:'consistency',code:'changed_during_review'});
    // Validate even a would-be dropped delta; invalid DATA is not hidden by a full error prefix.
    for(const e of deltaErrors)checkError(e,'delta');
    const deltaLimitations=['soft_deadline_reached','deadline_exceeded',...v.limitations],available=100-p.errors.length;
    const errors=[...p.errors,...deltaErrors.slice(0,available)],dropped=Math.max(0,deltaErrors.length-available);
    function merge(start:readonly string[]){const values=[...new Set([...start,...deltaLimitations])];const add=dropped>0&&!values.includes('error_details_truncated');if(add)values.push('error_details_truncated');return {values,add};}
    const baseLimitations=[...p.limitations].sort(),ordered=merge(p.limitations),planPre=merge(baseLimitations);
    if(ordered.values.length>100||planPre.values.length>100)bad('limit','delta');
    const canonical=[...planPre.values].sort(),fromOrdered=[...ordered.values].sort();
    if(canonical.length!==fromOrdered.length||canonical.some((x,n)=>x!==fromOrdered[n]))bad('binding','delta');
    return freeze({scope:'synthetic_prefix_delta_values' as const,authority:'none' as const,checked_scope:'prefix_local_values_only' as const,model_id:PREFIX_DELTA_VALUE_LIMITS.model_id,schema_version:s.schema_version,collection_status:s.collection_status,
      value:{parent_prefix:p,base_prefix:{limitations:baseLimitations,errors:p.errors},ordered_prefix:{limitations:ordered.values,errors},plan_pre_prefix:{limitations:planPre.values,errors},canonical_prefix:{limitations:canonical,errors},
        delta:{limitations:deltaLimitations,errors:deltaErrors},stats:{appended_errors:errors.length-p.errors.length,dropped_errors:dropped,errors_truncated:dropped>0,truncation_warning_added:ordered.add}},
      usage:copied.usage,unverified,[brand]:'prefix_delta_values_only' as const});
  }catch(error){if(error instanceof PrefixDeltaValueError)throw error;return bad('shape','shape');}
}
