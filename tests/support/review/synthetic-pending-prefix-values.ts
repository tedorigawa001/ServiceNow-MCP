/** PD-B(A): pure DATA selectors/comparison. No pending, owner, receipt or relation authority. */
import {types} from 'node:util';
import {projectSyntheticPrefixDelta,PrefixDeltaValueError} from './synthetic-prefix-delta.js';

export const PENDING_PREFIX_VALUE_LIMITS=Object.freeze({nodes:8000,character_units:1950000,depth:6,object_keys:8,array:103});
type Phase='input'|'delta'|'base'|'accepted';
export class PendingPrefixValueError extends Error{
  readonly code='internal_review_error';
  constructor(readonly reason:'shape'|'limit'|'binding'|'unsupported',readonly phase:Phase,readonly delta_phase?:PrefixDeltaValueError['phase']){super('internal_review_error');}
}
const bad=(reason:PendingPrefixValueError['reason'],phase:Phase='input'):never=>{throw new PendingPrefixValueError(reason,phase);};
function record(v:unknown):object{
  if(!v||typeof v!=='object'||types.isProxy(v)||Array.isArray(v)||![null,Object.prototype].includes(Object.getPrototypeOf(v)))bad('shape');
  return v as object;
}
function field(v:unknown,key:string):unknown{
  const d=Object.getOwnPropertyDescriptor(record(v),key);if(!d||!Object.hasOwn(d,'value'))bad('shape');return d!.value;
}
function exact(v:unknown,names:readonly string[]){
  const keys=Reflect.ownKeys(record(v));if(keys.length!==names.length||keys.some(x=>typeof x!=='string'||!names.includes(x)))bad('shape');
}
function header(v:unknown){return {schema_version:field(v,'schema_version'),collection_status:field(field(v,'collection'),'status'),prefix:{limitations:field(v,'limitations'),errors:field(v,'errors')}};}
function copyBounded(raw:unknown){
  const lim=PENDING_PREFIX_VALUE_LIMITS;let nodes=0,characters=0;
  function text(v:string){if(v.length*3>lim.character_units-characters)bad('limit');characters+=v.length*3;return v;}
  function visit(v:unknown,depth:number):unknown{
    if(depth>lim.depth||nodes>=lim.nodes)bad('limit');nodes++;
    if(typeof v==='string')return text(v);if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;
    if(!v||typeof v!=='object'||types.isProxy(v))return bad('shape');
    if(Array.isArray(v)){
      if(Object.getPrototypeOf(v)!==Array.prototype||v.length>lim.array)bad('limit');
      if(Reflect.ownKeys(v).length!==v.length+1)bad('shape');
      return Object.freeze(Array.from({length:v.length},(_,n)=>{const d=Object.getOwnPropertyDescriptor(v,String(n));if(!d||!Object.hasOwn(d,'value'))bad('shape');return visit(d!.value,depth+1);}));
    }
    const keys=Reflect.ownKeys(record(v));if(keys.length>lim.object_keys)bad('limit');const out:Record<string,unknown>=Object.create(null);
    for(const key of keys){if(typeof key!=='string')bad('shape');text(key as string);out[key as string]=visit(field(v,key as string),depth+1);}return Object.freeze(out);
  }
  return {value:visit(raw,0),usage:Object.freeze({nodes,character_units:characters})};
}
type ErrorValue=Readonly<{stage:string;code:string;update_xml_sys_id?:string}>;
type Prefix=Readonly<{limitations:readonly string[];errors:readonly ErrorValue[]}>;
function comparePrefix(actual:unknown,expected:Prefix,phase:'base'|'accepted'){
  exact(actual,['limitations','errors']);const l=field(actual,'limitations'),e=field(actual,'errors');
  if(!Array.isArray(l)||!Array.isArray(e)||l.length!==expected.limitations.length||e.length!==expected.errors.length)return bad('binding',phase);
  for(let n=0;n<expected.limitations.length;n++)if(l[n]!==expected.limitations[n])bad('binding',phase);
  for(let n=0;n<expected.errors.length;n++){
    const a=e[n],b=expected.errors[n],has=Object.hasOwn(b,'update_xml_sys_id');
    const keys=Reflect.ownKeys(record(a)),names=has?['stage','code','update_xml_sys_id']:['stage','code'];
    if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k))||field(a,'stage')!==b.stage||field(a,'code')!==b.code||has&&field(a,'update_xml_sys_id')!==b.update_xml_sys_id)bad('binding',phase);
  }
}

/** Full headers/verify may contain ancillary fields; only fixed own DATA fields are read. */
export function projectSyntheticPendingPrefixValues(raw:unknown,...extra:unknown[]){
  try{
    if(extra.length)bad('shape');exact(raw,['kind','model','pins_header','plan_verify','accepted_header']);
    if(field(raw,'kind')!=='synthetic_pending_prefix_values_v1')bad('shape');
    const model=field(raw,'model');exact(model,['schema_version','prefix']);
    const v=field(raw,'plan_verify'),b=header(field(raw,'pins_header')),h=header(field(raw,'accepted_header'));
    const selected={model_version:field(model,'schema_version'),base:b,accepted:h,input:{kind:'synthetic_prefix_delta_v1',model_id:'ordered-prefix-delta-v1',
      schema_version:b.schema_version,collection_status:b.collection_status,parent_prefix:field(model,'prefix'),verify:{stage:field(v,'stage'),verify_required:field(v,'verify_required'),
        consistency:field(v,'consistency'),verify_error:field(v,'verify_error'),limitations:field(v,'limitations'),errors:field(v,'errors')}}};
    const snapshot=copyBounded(selected),s=snapshot.value as typeof selected;
    const q=projectSyntheticPrefixDelta(s.input);
    if(s.model_version!==q.schema_version)bad('binding','base');
    comparePrefix(s.base.prefix,q.value.base_prefix,'base');
    if(s.accepted.schema_version!==q.schema_version||s.accepted.collection_status!==q.collection_status)bad('binding','accepted');
    comparePrefix(s.accepted.prefix,q.value.canonical_prefix,'accepted');
    return Object.freeze({scope:'synthetic_pending_prefix_values' as const,authority:'none' as const,checked_scope:'prefix_values_only' as const,projection:q,usage:snapshot.usage,
      unverified:Object.freeze(['pending_origin','model_trace','pins_origin','accepted_origin','full_header','one_shot_relation','runtime_origin','whole_run_budget'] as const)});
  }catch(error){
    if(error instanceof PendingPrefixValueError)throw error;
    if(error instanceof PrefixDeltaValueError)throw new PendingPrefixValueError(error.reason,'delta',error.phase);
    return bad('shape');
  }
}
