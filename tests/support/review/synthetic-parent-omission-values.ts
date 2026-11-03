/** OM-A: bounded pure values only. Never a capture, decision issuer or runtime entry. */
import {types} from 'node:util';
import {Buffer} from 'node:buffer';
import {z} from 'zod';
import {aggregateReviewStructure,aggregateReviewV3Structure,assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import {reviewResultV2Schema} from '../../../src/review/result-schema-v2.js';
import {RECOVERY_FULL_JSON_SHAPE} from './synthetic-recovery-full-json.js';
import {projectSyntheticNonReviewedValue} from './synthetic-recovery-nonreviewed-values.js';

export const PARENT_OMISSION_VALUE_LIMITS=Object.freeze({model_id:'recovery-omission-v1',rows:100,prefix_nodes:2500,prefix_character_units:650000,
  asset_nodes:262144,asset_character_units:786432,asset_bytes:262144,intermediate_limitations:103});
export class ParentOmissionValueError extends Error{readonly code='internal_review_error';constructor(readonly reason:'shape'|'limit'|'model'|'order'|'unsupported'){super('internal_review_error');}}
const bad=(reason:ParentOmissionValueError['reason']='shape'):never=>{throw new ParentOmissionValueError(reason);};
function own(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))return bad();
  const names=Reflect.ownKeys(raw);if(names.length>(keys?.length??30)||keys&&names.length!==keys.length)return bad();
  const out:Record<string,unknown>=Object.create(null);for(const name of names){if(typeof name!=='string'||keys&&!keys.includes(name))bad();const d=Object.getOwnPropertyDescriptor(raw,name);if(!d||!Object.hasOwn(d,'value'))bad();out[name as string]=d!.value;}return out;
}
function array(raw:unknown):unknown[]{
  if(!Array.isArray(raw)||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>100||Reflect.ownKeys(raw).length!==raw.length+1)return bad();
  return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))bad();return d!.value;});
}
type Usage={nodes:number;character_units:number;maximum_depth:number};
function copy(raw:unknown,maxNodes:number,maxCharacters:number,maxDepth:number){
  const usage:Usage={nodes:0,character_units:0,maximum_depth:0};
  function string(s:string){if(usage.character_units+s.length*3>maxCharacters)bad('limit');usage.character_units+=s.length*3;return s;}
  function visit(v:unknown,d:number):unknown{
    if(d>maxDepth||usage.nodes>=maxNodes)bad('limit');usage.nodes++;usage.maximum_depth=Math.max(d,usage.maximum_depth);
    if(typeof v==='string')return string(v);if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;
    if(Array.isArray(v))return array(v).map(x=>visit(x,d+1));
    const out=own(v);for(const key of Object.keys(out)){string(key);out[key]=visit(out[key],d+1);}return out;
  }return {value:visit(raw,0),usage};
}
function freeze(v:unknown):void{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}}
type Asset=z.infer<typeof assetOutcomeStructure>;
type Producer='analysis'|'metadata'|'retrieval'|'retained';
type Trace={ordinal:number;producer:Producer;original_state:Asset['state'];action:'keep'|'parent_omit';before:number;incoming:number;after:number;limitations_added:string[];errors_added:number};
type Deep<T>=T extends readonly(infer E)[]?readonly Deep<E>[]:T extends object?{readonly[K in keyof T]:Deep<T[K]>}:T;
const brand=Symbol('synthetic_parent_omission_value_only');
const unverified=Object.freeze(['producer_origin','capture_binding','context_binding','prefix_origin','receipt_binding','decision_evidence','manifest','finish_job','finalize_model','whole_run_budget']);
export function modelSyntheticParentOmission(raw:unknown){
  try{
    const top=own(raw,['kind','model_id','schema_version','limits','selected','prefix','rows']);
    if(top.kind!=='synthetic_parent_omission_values_v1')bad();if(top.model_id!==PARENT_OMISSION_VALUE_LIMITS.model_id)bad('model');
    const version=z.enum(['bp-mcp-review-0.2','bp-mcp-review-0.3']).parse(top.schema_version),limits=own(top.limits,['max_findings']);if(limits.max_findings!==100)bad();
    const selected=array(top.selected).map(x=>z.string().regex(/^[a-f0-9]{32}$/).parse(x));if(selected.some((x,i)=>i>0&&selected[i-1]>=x))bad('order');
    const sourceRows=array(top.rows);if(sourceRows.length!==selected.length)bad('order');
    const prefix=copy(top.prefix,PARENT_OMISSION_VALUE_LIMITS.prefix_nodes,PARENT_OMISSION_VALUE_LIMITS.prefix_character_units,3);
    const p=own(prefix.value,['limitations','errors']),limitations=aggregateReviewStructure.shape.limitations.parse(p.limitations),errors=(version==='bp-mcp-review-0.2'?aggregateReviewStructure:aggregateReviewV3Structure).shape.errors.parse(p.errors);
    const initialPrefix={limitations:[...limitations],errors:[...errors]};
    const assets:Asset[]=[],originals:{producer:Producer;outcome:Asset}[]=[],trace:Trace[]=[];let kept=0,assetNodes=0,assetCharacters=0;
    const addOmissionError=()=>{if(errors.length<100)errors.push({stage:'output',code:'response_limit'});else if(!limitations.includes('error_details_truncated'))limitations.push('error_details_truncated');};
    for(const [ordinal,row] of sourceRows.entries()){
      const r=own(row,['producer','outcome']);if(!['analysis','metadata','retrieval','retained'].includes(r.producer as string))bad('unsupported');
      const copied=copy(r.outcome,PARENT_OMISSION_VALUE_LIMITS.asset_nodes,PARENT_OMISSION_VALUE_LIMITS.asset_character_units,RECOVERY_FULL_JSON_SHAPE.analyze.depth);
      let asset=assetOutcomeStructure.parse(copied.value);
      if(asset.state==='reviewed'){if(r.producer!=='analysis')bad('unsupported');asset.result=reviewResultV2Schema.parse(asset.result);
        const rules=asset.result.coverage.requested_rule_ids;
        if(asset.result.target.update_xml_sys_id!==asset.update_xml_sys_id||new Set(asset.applicable_rule_ids).size!==asset.applicable_rule_ids.length||asset.applicable_rule_ids.length!==rules.length||asset.applicable_rule_ids.some(x=>!rules.includes(x)))bad();
      }
      else asset=projectSyntheticNonReviewedValue({schema_version:version,producer:r.producer,outcome:asset}).value.outcome;
      if(asset.update_xml_sys_id!==selected[ordinal])bad('order');if(Buffer.byteLength(JSON.stringify(asset),'utf8')>PARENT_OMISSION_VALUE_LIMITS.asset_bytes)bad('limit');
      assetNodes+=copied.usage.nodes;assetCharacters+=copied.usage.character_units;
      originals.push({producer:r.producer as Producer,outcome:asset});
      const warningStart=limitations.length,errorStart=errors.length;
      const incoming=asset.state==='reviewed'?asset.result.findings.length:0,before=kept,omit=asset.state==='reviewed'&&kept+incoming>100;
      if(omit){assets.push({state:'result_omitted',update_xml_sys_id:asset.update_xml_sys_id,reason:'response_limit'});
        if(!limitations.includes('response_truncated')){
          limitations.push('response_truncated','finding_budget_exceeded');
          addOmissionError();
        }
      }else{kept+=incoming;assets.push(asset);if(asset.state==='result_omitted'&&!limitations.includes('response_truncated')){limitations.push('response_truncated');addOmissionError();}}
      trace.push({ordinal,producer:r.producer as Producer,original_state:asset.state,action:omit?'parent_omit':'keep',before,incoming,after:kept,limitations_added:limitations.slice(warningStart),errors_added:errors.length-errorStart});
    }
    if(limitations.length>PARENT_OMISSION_VALUE_LIMITS.intermediate_limitations)bad('limit');
    const value={schema_version:version,selected,limits:{max_findings:100 as const},initial_prefix:initialPrefix,prefix:{limitations,errors},original_rows:originals,assets,trace,kept_findings:kept};freeze(value);
    return Object.freeze({scope:'synthetic_parent_omission_values' as const,authority:'none' as const,checked_scope:'parent_finding_values_only' as const,model_id:PARENT_OMISSION_VALUE_LIMITS.model_id,value:value as Deep<typeof value>,
      usage:Object.freeze({prefix_nodes:prefix.usage.nodes,prefix_character_units:prefix.usage.character_units,asset_nodes:assetNodes,asset_character_units:assetCharacters,rows:sourceRows.length}),unverified,[brand]:'non_executable_parent_model' as const});
  }catch(error){if(error instanceof ParentOmissionValueError)throw error;return bad();}
}
