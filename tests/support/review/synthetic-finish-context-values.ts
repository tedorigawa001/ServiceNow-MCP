/** RA-01: bounded value projections only; never issues evidence or runtime authority. */
import {types} from 'node:util';
import {z} from 'zod';
import {aggregateReviewStructure,aggregateReviewV3Structure,assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import {bp5RuleIdsSchema,releaseEvidenceStructure,bp5RulesetFor,checkReleaseEvidence,releaseMatchForEvidence} from '../../../src/review/result-schema-v2.js';
import {requestedAssetTypes,TARGET_LIMITATIONS} from '../../../src/review/target-selection.js';
declare const evidenceBrand:unique symbol;
const projectionBrand=Symbol('synthetic_finish_value_only');
export type SyntheticFinishContextEvidence=Readonly<{[evidenceBrand]:'evidence_not_issued_by_ra01'}>;
export class SyntheticFinishValueError extends Error{readonly code='internal_review_error';constructor(readonly reason:'shape'|'limit'|'mismatch'){super('internal_review_error');}}
const bad=(reason:'shape'|'limit'|'mismatch'='shape'):never=>{throw new SyntheticFinishValueError(reason);};
const reference=z.custom<object>(v=>!!v&&typeof v==='object'&&!types.isProxy(v));
const utc=z.string().length(24).pipe(z.iso.datetime({precision:3})),id=z.string().regex(/^[a-f0-9]{32}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const warnings=z.array(z.string().min(1).max(200)).max(100);
const expected=z.strictObject({record_updated_at:z.iso.datetime(),instance_binding:hash,instance_release:releaseEvidenceStructure,requested_rule_ids:bp5RuleIdsSchema,release_limitations:warnings});
const coverage=aggregateReviewStructure.shape.coverage.extend({analysis_complete:z.literal(false)});
const collection=aggregateReviewStructure.shape.collection.extend({status:z.enum(['complete','failed'])});
const header2=aggregateReviewStructure.pick({schema_version:true,target:true,versions:true,started_at:true,instance_release:true,release_match:true,principal:true,collection:true,coverage:true,limits:true,limitations:true,errors:true})
  .extend({release_match:z.literal('matched'),collection,coverage,limitations:warnings});
const header3=header2.extend({schema_version:z.literal('bp-mcp-review-0.3'),selection:aggregateReviewV3Structure.shape.selection,coverage:aggregateReviewV3Structure.shape.coverage.extend({analysis_complete:z.literal(false)}),errors:aggregateReviewV3Structure.shape.errors});
const context=z.strictObject({run:reference,session:reference,source:reference,key:reference,origin:reference,budget:reference,release:reference,window:reference,started_at:utc,deadline_ms:z.number().int().min(1).max(60000),observed_at:utc,upper_utc:utc});
const outcome=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('reviewed'),update_xml_sys_id:id,receipt:reference,accepted_outcome:reference}),
  z.strictObject({state:z.literal('result_omitted'),update_xml_sys_id:id,reason:z.literal('response_limit'),reviewed_origin:z.strictObject({receipt:reference,accepted_outcome:reference}).nullable()}),
  assetOutcomeStructure.options[1],assetOutcomeStructure.options[2],assetOutcomeStructure.options[3],assetOutcomeStructure.options[4],assetOutcomeStructure.options[5].extend({reason:z.literal('deadline_exceeded')}),
]);
const schema=z.strictObject({kind:z.literal('synthetic_finish_context_v1'),owner:reference,plan:reference,source_lifecycle:reference,run_context:context,header:z.discriminatedUnion('schema_version',[header2,header3]),selected:z.array(id).min(1).max(100),
  inputs:z.array(z.strictObject({receipt:reference,update_xml_sys_id:id,retrieved_at:utc,state:z.enum(['completed','not_processed']),expected_context:expected.nullable()})).min(1).max(100),outcomes:z.array(outcome).min(1).max(100),
  route:z.strictObject({owner:reference,frame:z.strictObject({supervisor:reference,worker:reference,generation:reference}),ready_origin:reference,cleanup_origin:z.strictObject({lifecycle:reference,frame:reference,sink:reference,start_serial:z.literal(0)}),source_origin:z.strictObject({source:reference,lifecycle:reference})}),
});
type Values=z.infer<typeof schema>;
const opaquePaths=new Set(['owner','plan','source_lifecycle',...['run','session','source','key','origin','budget','release','window'].map(k=>'run_context.'+k),'inputs.*.receipt','outcomes.*.receipt','outcomes.*.accepted_outcome','outcomes.*.reviewed_origin.receipt','outcomes.*.reviewed_origin.accepted_outcome','route.owner','route.ready_origin','route.frame.supervisor','route.frame.worker','route.frame.generation','route.cleanup_origin.lifecycle','route.cleanup_origin.frame','route.cleanup_origin.sink','route.source_origin.source','route.source_origin.lifecycle']);
const opaque=(path:readonly string[])=>opaquePaths.has(path.map(x=>/^\d+$/.test(x)?'*':x).join('.'));
class Budget{
  nodes=0;characters=0;
  node(depth:number){if(++this.nodes>10000||depth>8)bad('limit');}
  string(s:string){this.characters+=s.length*3;if(this.characters>262144)bad('limit');}
  usage(){return Object.freeze({nodes:this.nodes,character_units:this.characters});}
}
function collect(raw:unknown,b:Budget){
  const identities=new Map<string,object>(),ancestors=new Set<object>();
  function visit(v:unknown,path:string[],depth:number):unknown{
    b.node(depth);
    if(opaque(path)){if(!v||typeof v!=='object'||types.isProxy(v))bad();identities.set(path.join('.'),v as object);return v;}
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isSafeInteger(v))bad();return v;}
    if(typeof v==='string'){b.string(v);return v;}
    if(!v||typeof v!=='object'||types.isProxy(v)||ancestors.has(v))bad();
    if(path.join('.')==='route.frame')identities.set('route.frame',v as object);
    ancestors.add(v as object);
    try{
      const keys=Reflect.ownKeys(v as object);
      if(Array.isArray(v)){
        if(v.length>100)bad('limit');if(keys.length!==v.length+1)bad();
        return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))bad();return visit(d!.value,[...path,String(i)],depth+1);});
      }
      if(![null,Object.prototype].includes(Object.getPrototypeOf(v)))bad();if(keys.length>30)bad('limit');
      const out:Record<string,unknown>=Object.create(null);
      for(const k of keys){if(typeof k!=='string')bad();b.string(k as string);const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))bad();out[k as string]=visit(d!.value,[...path,k as string],depth+1);}return out;
    }finally{ancestors.delete(v as object);}
  }
  return {value:visit(raw,[],0),identities};
}
function freeze(v:unknown,path:string[]=[]):unknown{
  if(opaque(path)||!v||typeof v!=='object')return v;
  for(const k of Object.keys(v))freeze((v as Record<string,unknown>)[k],[...path,k]);return Object.freeze(v);
}
function unique<T>(values:readonly T[]){if(new Set(values).size!==values.length)bad('mismatch');}
function equalData(a:unknown,b:unknown,path:string[]=[]):boolean{
  if(opaque(path))return true;
  if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const x=Object.keys(a).sort(),y=Object.keys(b).sort();return x.length===y.length&&x.every((k,i)=>k===y[i]&&equalData((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k],[...path,k]));
}
function semantics(p:Values){
  const c=p.run_context,h=p.header,S=Date.parse(c.started_at),O=Date.parse(c.observed_at),U=Date.parse(c.upper_utc);
  if(S>O||O>U||U>S+c.deadline_ms||h.started_at!==c.started_at||h.collection.selected!==p.selected.length)bad('mismatch');
  // Same metadata budget/accounting refinement as the aggregate schema.
  const seen=h.collection.metadata_seen,max=h.limits.max_records;
  if(seen>max+1)bad('mismatch');if(h.collection.selected!==Math.min(seen,max))bad('mismatch');if(h.collection.truncated!==(seen>max))bad('mismatch');
  unique(p.selected);unique(h.coverage.requested_rule_ids);unique(h.limitations);unique(h.coverage.skipped_rules.map(x=>x.rule_id));
  if(h.versions.ruleset!==bp5RulesetFor(h.coverage.requested_rule_ids)||releaseMatchForEvidence(h.instance_release)!=='matched'||h.coverage.skipped_rules.length)bad('mismatch');
  const e=h.instance_release;
  if(e.source==='operator_config'){
    if(checkReleaseEvidence(e,c.started_at,h.target.instance_binding,h.limitations).length||Date.parse(e.expires_at)<=S+60000)bad('mismatch');
  }else if(e.source==='sys_cluster_state.build_name'){
    if(checkReleaseEvidence(e,e.observed_at,h.target.instance_binding,h.limitations).length)bad('mismatch');
  }else bad('mismatch');
  if(h.schema_version==='bp-mcp-review-0.3'){
    if(!equalData(h.selection.requested_asset_types,requestedAssetTypes(h.coverage.requested_rule_ids))||TARGET_LIMITATIONS.some(x=>!h.limitations.includes(x))||p.outcomes.some(x=>x.state==='skipped_deleted'))bad('mismatch');
    for(const error of h.errors.filter(x=>x.code==='candidate_filter_violation'))if(error.update_xml_sys_id||!['metadata','consistency'].includes(error.stage)||error.stage==='metadata'&&h.collection.status!=='failed'||error.stage==='consistency'&&h.collection.status!=='complete')bad('mismatch');
  }
  h.coverage.requested_rule_ids.sort();h.limitations.sort();
  const rows=new Map(p.outcomes.map(x=>[x.update_xml_sys_id,x]));
  if(rows.size!==p.selected.length||p.outcomes.length!==p.selected.length||p.outcomes.some((x,i)=>x.update_xml_sys_id!==p.selected[i]))bad('mismatch');
  const receipts=new Set<object>(),inputs=new Map<string,Values['inputs'][number]>();let upper=O,unfinished=0;
  for(const i of p.inputs){
    const t=Date.parse(i.retrieved_at),row=rows.get(i.update_xml_sys_id);
    if(!row||receipts.has(i.receipt)||inputs.has(i.update_xml_sys_id)||t<upper||t>U||(i.state==='not_processed')!==(row.state==='not_processed'))bad('mismatch');
    receipts.add(i.receipt);inputs.set(i.update_xml_sys_id,i);upper=t;if(i.state==='not_processed')unfinished++;
    const ex=i.expected_context;if(ex){unique(ex.requested_rule_ids);unique(ex.release_limitations);
      if(ex.instance_binding!==h.target.instance_binding||!equalData(ex.instance_release,e)||ex.requested_rule_ids.some(r=>!h.coverage.requested_rule_ids.includes(r))||ex.release_limitations.some(x=>!h.limitations.includes(x))||checkReleaseEvidence(ex.instance_release,i.retrieved_at,ex.instance_binding,ex.release_limitations).length)bad('mismatch');
      ex.requested_rule_ids.sort();ex.release_limitations.sort();
    }
  }
  if(upper!==U||!unfinished)bad('mismatch');
  const accepted=new Set<object>();
  for(const row of p.outcomes){const i=inputs.get(row.update_xml_sys_id);
    if(row.state==='reviewed'){
      if(!i||i.state!=='completed'||!i.expected_context||row.receipt!==i.receipt||accepted.has(row.accepted_outcome))bad('mismatch');accepted.add(row.accepted_outcome);
    }else if(row.state==='result_omitted'){
      if(!i||i.state!=='completed')bad('mismatch');
      if(row.reviewed_origin){const origin=row.reviewed_origin;if(!i!.expected_context||origin.receipt!==i!.receipt||accepted.has(origin.accepted_outcome))bad('mismatch');accepted.add(origin.accepted_outcome);}
    }
  }
}
function parse(raw:unknown,b:Budget){
  const collected=collect(raw,b),parsed=schema.safeParse(collected.value);if(!parsed.success)bad();
  const value=parsed.data!;
  if(value.route.owner!==value.owner||value.route.source_origin.source!==value.run_context.source||value.route.source_origin.lifecycle!==value.source_lifecycle||collected.identities.get('route.frame')!==value.route.cleanup_origin.frame)bad('mismatch');
  semantics(value);value.route.cleanup_origin.frame=value.route.frame;
  return {value:freeze(value) as Values,identities:collected.identities};
}
type DeepValue<T>=T extends readonly (infer E)[]?readonly DeepValue<E>[]:T extends object?{readonly [K in keyof T]:DeepValue<T[K]>}:T;
type Projection=Readonly<{scope:'synthetic_finish_values';authority:'none';value:DeepValue<Values>;usage:ReturnType<Budget['usage']>;[projectionBrand]:'value_only'}>;
export function projectSyntheticFinishValues(raw:unknown):Projection{
  try{const budget=new Budget(),p=parse(raw,budget);return Object.freeze({scope:'synthetic_finish_values' as const,authority:'none' as const,value:p.value,usage:budget.usage(),[projectionBrand]:'value_only' as const});}catch(error){if(error instanceof SyntheticFinishValueError)throw error;return bad();}
}
export function compareSyntheticFinishValues(raw:unknown,expectedValue:unknown){
  try{
    const budget=new Budget(),actual=parse(raw,budget),expected=parse(expectedValue,budget);
    if(actual.identities.size!==expected.identities.size||[...actual.identities].some(([key,value])=>expected.identities.get(key)!==value)||!equalData(actual.value,expected.value))bad('mismatch');
    return Object.freeze({scope:'synthetic_finish_comparison' as const,authority:'none' as const,matches:true as const,usage:budget.usage()});
  }catch(error){if(error instanceof SyntheticFinishValueError)throw error;return bad();}
}
