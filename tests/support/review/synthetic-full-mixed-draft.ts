/** D1 pure full-field DATA draft. Not an owner, ContentChecked, receipt or seal. */
import {types} from 'node:util';
import {Buffer} from 'node:buffer';
import {aggregateReviewStructure,assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import {reviewResultV2Schema} from '../../../src/review/result-schema-v2.js';
import {modelSyntheticParentOmission,ParentOmissionValueError,PARENT_OMISSION_VALUE_LIMITS} from './synthetic-parent-omission-values.js';
import {RECOVERY_FULL_JSON_SHAPE} from './synthetic-recovery-full-json.js';
import {projectSyntheticNonReviewedValue,NonReviewedValueError} from './synthetic-recovery-nonreviewed-values.js';

export const FULL_MIXED_DRAFT_LIMITS=Object.freeze({model_id:'full-mixed-draft-v1',rows:100,asset_nodes:PARENT_OMISSION_VALUE_LIMITS.asset_nodes,
  asset_character_units:PARENT_OMISSION_VALUE_LIMITS.asset_character_units,asset_bytes:PARENT_OMISSION_VALUE_LIMITS.asset_bytes,
  asset_depth:RECOVERY_FULL_JSON_SHAPE.analyze.depth,object_keys:30,array:103,small_nodes:10000,small_character_units:650000,small_depth:4});
type Phase='input'|'parent'|'manifest'|'content';
export class FullMixedDraftError extends Error{
  readonly code='internal_review_error';
  constructor(readonly reason:'shape'|'limit'|'unsupported'|'mismatch',readonly phase:Phase){super('internal_review_error');}
}
const bad=(reason:FullMixedDraftError['reason'],phase:Phase):never=>{throw new FullMixedDraftError(reason,phase);};
function record(v:unknown):object{
  if(!v||typeof v!=='object'||types.isProxy(v)||Array.isArray(v)||![null,Object.prototype].includes(Object.getPrototypeOf(v)))return bad('shape','input');return v;
}
function own(v:unknown,k:string):unknown{const d=Object.getOwnPropertyDescriptor(record(v),k);if(!d||!Object.hasOwn(d,'value'))return bad('shape','input');return d.value;}
function exact(v:unknown,keys:readonly string[]){const names=Reflect.ownKeys(record(v));if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))bad('shape','input');}
function array(v:unknown,max:number):unknown[]{
  if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)return bad('shape','input');
  if(v.length>max)return bad('limit','input');if(Reflect.ownKeys(v).length!==v.length+1)return bad('shape','input');
  return Array.from({length:v.length},(_,n)=>{const d=Object.getOwnPropertyDescriptor(v,String(n));if(!d||!Object.hasOwn(d,'value'))return bad('shape','input');return d.value;});
}
function freeze(v:unknown):void{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}}
type Deep<T>=T extends readonly(infer E)[]?readonly Deep<E>[]:T extends object?{readonly[K in keyof T]:Deep<T[K]>}:T;
export function projectSyntheticFullMixedDraft(raw:unknown,...extra:unknown[]){
  let copiedNodes=0,copiedCharacters=0,comparedNodes=0;
  function copy(v:unknown,asset:boolean):unknown{
    const l=FULL_MIXED_DRAFT_LIMITS;let nodes=0,characters=0;
    const nodeCap=asset?l.asset_nodes:l.small_nodes,charCap=asset?l.asset_character_units:l.small_character_units,depthCap=asset?l.asset_depth:l.small_depth;
    function text(s:string){if(s.length*3>charCap-characters)bad('limit','input');characters+=s.length*3;return s;}
    function visit(x:unknown,d:number):unknown{
      if(d>depthCap||nodes>=nodeCap)bad('limit','input');nodes++;
      if(typeof x==='string')return text(x);if(x===null||typeof x==='boolean'||typeof x==='number'&&Number.isSafeInteger(x))return x;
      if(!x||typeof x!=='object'||types.isProxy(x))return bad('shape','input');
      if(Array.isArray(x))return array(x,asset?100:l.array).map(y=>visit(y,d+1));
      const keys=Reflect.ownKeys(record(x));if(keys.length>l.object_keys)bad('limit','input');const out:Record<string,unknown>=Object.create(null);
      for(const k of keys){if(typeof k!=='string')bad('shape','input');text(k as string);out[k as string]=visit(own(x,k as string),d+1);}return out;
    }
    const out=visit(v,0);copiedNodes+=nodes;copiedCharacters+=characters;return out;
  }
  function equal(a:unknown,b:unknown):boolean{
    comparedNodes++;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return a===b;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,n)=>equal(x,b[n]));
    const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,n)=>k===bk[n]&&equal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
  }
  try{
    if(extra.length)bad('shape','input');exact(raw,['kind','model_id','schema_version','ruleset_version','selected','prefix','rows','manifest']);
    if(own(raw,'kind')!=='synthetic_full_mixed_draft_v1'||own(raw,'model_id')!==FULL_MIXED_DRAFT_LIMITS.model_id)bad('unsupported','input');
    const version=own(raw,'schema_version'),rawRuleset=own(raw,'ruleset_version');if(typeof version!=='string'||typeof rawRuleset!=='string')bad('shape','input');
    const ruleset=aggregateReviewStructure.shape.versions.shape.ruleset.safeParse(rawRuleset);if(!ruleset.success)bad('unsupported','input');
    const selected=copy(own(raw,'selected'),false),prefix=copy(own(raw,'prefix'),false),sourceRows=array(own(raw,'rows'),100);
    if(!sourceRows.length)bad('shape','input');
    // OM-A performs the existing per-asset bounded snapshot/full schema and producer checks.
    const modeled=modelSyntheticParentOmission({kind:'synthetic_parent_omission_values_v1',model_id:'recovery-omission-v1',schema_version:version,limits:{max_findings:100},selected,prefix,rows:sourceRows});
    const m=modeled.value;
    if(!m.original_rows.some(r=>r.producer==='retained'&&r.outcome.state==='not_processed'))bad('unsupported','input');
    for(const row of m.original_rows)if(row.outcome.state==='reviewed'&&row.outcome.result.ruleset_version!==ruleset.data)bad('mismatch','parent');
    const manifest=own(raw,'manifest');exact(manifest,['assets','prefix','trace']);
    const supplied=array(own(manifest,'assets'),100);if(supplied.length!==m.selected.length)bad('mismatch','manifest');
    const assets=supplied.map((value,n)=>{
      const snapshot=copy(value,true);if(Buffer.byteLength(JSON.stringify(snapshot),'utf8')>FULL_MIXED_DRAFT_LIMITS.asset_bytes)bad('limit','input');
      const a=assetOutcomeStructure.safeParse(snapshot);if(!a.success)return bad('shape','manifest');let asset=a.data;
      if(asset.state==='reviewed'){
        const full=reviewResultV2Schema.safeParse(asset.result);if(!full.success)bad('shape','manifest');asset={...asset,result:full.data!};
        if(asset.result.ruleset_version!==ruleset.data)bad('mismatch','manifest');
      }else{
        const original=m.original_rows[n],producer=m.trace[n].action==='parent_omit'?'parent_omission':original.producer;
        projectSyntheticNonReviewedValue({schema_version:m.schema_version,producer,outcome:asset,...(producer==='parent_omission'?{original_state:'reviewed'}:{})});
      }
      // All typed fields, not just context/ID/hash. Never short-circuit on object identity.
      if(!equal(m.assets[n],asset))bad('mismatch','content');return asset;
    });
    const actualPrefix=copy(own(manifest,'prefix'),false),trace=copy(own(manifest,'trace'),false);
    if(!equal(m.prefix,actualPrefix)||!equal(m.trace,trace))bad('mismatch','manifest');
    const value={schema_version:m.schema_version,ruleset_version:ruleset.data!,selected:m.selected,initial_prefix:m.initial_prefix,original_rows:m.original_rows,
      manifest:{assets,prefix:m.prefix,trace:m.trace},kept_findings:m.kept_findings};freeze(value);
    return Object.freeze({scope:'synthetic_full_mixed_draft_values' as const,authority:'none' as const,checked_scope:'full_mixed_values_only' as const,model_id:FULL_MIXED_DRAFT_LIMITS.model_id,
      value:value as Deep<typeof value>,usage:Object.freeze({copied_nodes:copiedNodes,copied_character_units:copiedCharacters,compared_nodes:comparedNodes,parent_usage:modeled.usage}),
      unverified:Object.freeze(['pending_origin','row_receipts','active_input_binding','accepted_projection','original_wire','content_checked_origin','seal','runtime_origin','whole_run_budget'] as const)});
  }catch(error){
    if(error instanceof FullMixedDraftError)throw error;
    if(error instanceof ParentOmissionValueError)throw new FullMixedDraftError(error.reason==='limit'?'limit':error.reason==='unsupported'?'unsupported':'shape','parent');
    if(error instanceof NonReviewedValueError)throw new FullMixedDraftError(error.reason,'manifest');
    return bad('shape','manifest');
  }
}
export type SyntheticFullMixedDraftValues=ReturnType<typeof projectSyntheticFullMixedDraft>;
