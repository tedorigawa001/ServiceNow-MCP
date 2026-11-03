import {expect,it} from 'vitest';
import {projectSyntheticNonReviewedValue,NonReviewedValueError,RECOVERY_NONREVIEWED_VALUE_LIMITS,type SyntheticNonReviewedValues} from '../support/review/synthetic-recovery-nonreviewed-values.js';
import {assetOutcomeStructure} from '../../src/review/aggregate-schema.js';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import ts from 'typescript';
const id='1'.repeat(32);
function value(producer='analysis',state='rejected',reason='invalid_xml'){
  return {schema_version:'bp-mcp-review-0.2',producer,outcome:{state,update_xml_sys_id:id,reason}};
}
it('validates an analysis rejection as immutable data, without issuing origin or acceptance evidence',()=>{
  const raw=value(),p=projectSyntheticNonReviewedValue(raw);
  expect(p.value).toEqual(raw);expect(p).toMatchObject({authority:'none',validation_scope:'state_producer_values_only',category:'nonreviewed_value'});
  expect(p.unverified).toContain('producer_origin');expect(Object.isFrozen(p.value.outcome)).toBe(true);expect(Object.isFrozen(raw.outcome)).toBe(false);
});
it('distinguishes original worker omission from a parent-only non-executable omission draft',()=>{
  const original=projectSyntheticNonReviewedValue(value('analysis','result_omitted','response_limit'));
  const parent=projectSyntheticNonReviewedValue({...value('parent_omission','result_omitted','response_limit'),original_state:'reviewed'});
  expect(original.category).toBe('nonreviewed_value');expect(parent.category).toBe('parent_omission_value');
  expect(parent.unverified).toContain('original_capture');expect(parent).not.toHaveProperty('evidence');
});
function fails(raw:unknown,reason?:string){let e:unknown;try{projectSyntheticNonReviewedValue(raw);}catch(error){e=error;}
  expect(e).toBeInstanceOf(NonReviewedValueError);expect(e).toMatchObject({code:'internal_review_error',message:'internal_review_error',...(reason?{reason}:{})});expect(e).not.toHaveProperty('cause');expect(e).not.toHaveProperty('issues');}
const reasons=['invalid_input','invalid_xml','forbidden_dtd','forbidden_instruction','unsupported_xml_version','forbidden_namespace','unsupported_envelope','ambiguous_record','deleted_asset','unsupported_action','duplicate_field','nested_field','payload_limit','element_limit','depth_limit','text_limit','code_limit','unexpected_text','missing_script','identity_mismatch','invalid_scope','javascript_parse_failed','analysis_limit','finding_limit','analysis_failed','rule_asset_mismatch'];
// Independent fixed acceptance table, not read from the helper's contract.
function oracle(producer:string,state:string,reason:string,assetType?:string,version='bp-mcp-review-0.2'){
  if(producer==='metadata')return state==='rejected'&&['unsupported_action','identity_mismatch'].includes(reason)
    ||state==='skipped_deleted'&&reason==='deleted_asset'&&version==='bp-mcp-review-0.2'
    ||state==='not_applicable'&&(assetType==='other'?reason==='asset_type_unsupported':['business_rule','client_script'].includes(assetType??'')&&reason==='no_requested_rules');
  if(producer==='retrieval')return state==='rejected'&&reason==='payload_limit'||state==='retrieval_failed'&&['payload_unavailable','missing_required_field','changed_during_review'].includes(reason);
  if(producer==='analysis')return state==='rejected'&&reasons.includes(reason)||state==='result_omitted'&&reason==='response_limit';
  if(producer==='parent_omission')return state==='result_omitted'&&reason==='response_limit';
  return producer==='retained'&&state==='not_processed'&&reason==='deadline_exceeded';
}
it.each(['metadata','retrieval','analysis','parent_omission','retained','unknown'])('matches an independent state/reason oracle for %s in both versions',producer=>{
  const states=['reviewed','not_applicable','skipped_deleted','rejected','retrieval_failed','not_processed','result_omitted','unknown'];
  const allReasons=[...new Set([...reasons,'asset_type_unsupported','no_requested_rules','payload_unavailable','missing_required_field','changed_during_review','unauthorized','response_limit','deadline_exceeded','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded','authentication_failed','access_denied','upstream_unavailable','invalid_result_context','unknown'])];
  for(const version of ['bp-mcp-review-0.2','bp-mcp-review-0.3'])for(const state of states)for(const reason of allReasons){
    const input={...value(producer,state,reason),schema_version:version,...(producer==='parent_omission'?{original_state:'reviewed'}:{})};
    if(state==='not_applicable')Object.assign(input.outcome,{asset_type:'other'});
    let accepted=false;try{projectSyntheticNonReviewedValue(input);accepted=true;}catch(e){expect(e).toBeInstanceOf(NonReviewedValueError);}
    expect(accepted,JSON.stringify({producer,state,reason,version})).toBe(oracle(producer,state,reason,state==='not_applicable'?'other':undefined,version));
  }
});
it.each(['business_rule','client_script','other'])('restricts metadata reason to its supported asset type %s',asset_type=>{
  for(const reason of ['asset_type_unsupported','no_requested_rules']){
    const input=value('metadata','not_applicable',reason);Object.assign(input.outcome,{asset_type});
    if(oracle('metadata','not_applicable',reason,asset_type))expect(projectSyntheticNonReviewedValue(input).value).toEqual(input);else fails(input);
  }
});
it.each(reasons)('retains the exact worker rejection reason %s',reason=>{
  const raw=value('analysis','rejected',reason);expect(projectSyntheticNonReviewedValue(raw).value.outcome).toEqual(raw.outcome);
});
it.each(['invalid_result_context','unauthorized','cancelled','new_reason'])('does not expand producer admission for schema-only/unsupported reason %s',reason=>{
  fails(value('analysis','rejected',reason));fails(value('retrieval','retrieval_failed',reason));fails(value('retained','not_processed',reason));
});
it('keeps soft retained values separate without claiming stopped-worker evidence',()=>{
  const p=projectSyntheticNonReviewedValue(value('retained','not_processed','deadline_exceeded'));
  expect(p.category).toBe('retained_value');expect(p.unverified).toContain('cleanup');expect(p).not.toHaveProperty('job');
});
it('refuses all extra authority/binding/body fields, including null placeholders',()=>{
  for(const key of ['receipt','job','T_i','owner','capture','result','evidence','verified','original_state']){
    fails({...value(),[key]:null});fails({...value(),outcome:{...value().outcome,[key]:null}});
  }
});
it('requires the parent draft marker and never accepts it on an original omission',()=>{
  fails(value('parent_omission','result_omitted','response_limit'));
  fails({...value('parent_omission','result_omitted','response_limit'),original_state:'not_processed'});
  fails({...value('analysis','result_omitted','response_limit'),original_state:'reviewed'});
});
it.each(['schema_version','producer','outcome'])('rejects missing required field %s',key=>{
  const raw:Record<string,unknown>=value();delete raw[key];fails(raw);
});
it.each(['state','reason','update_xml_sys_id'])('rejects missing outcome field %s',key=>{
  const raw=value() as {outcome:Record<string,unknown>};delete raw.outcome[key];fails(raw);
});
it('rejects unknown or case-folded versions, producer and ID values',()=>{
  for(const schema_version of ['bp-mcp-review-0.4','BP-MCP-REVIEW-0.2',null])fails({...value(),schema_version});
  fails(value('Analysis'));fails({...value(),outcome:{...value().outcome,update_xml_sys_id:'A'.repeat(32)}});
});
it('does not execute getter or Proxy traps, including nested ones',()=>{
  let touched=0;const poison=()=>{touched++;throw Error('SECRET');};
  const raw=Object.defineProperty({},'producer',{get:poison,enumerable:true});
  for(const item of [raw,new Proxy({},{get:poison,ownKeys:poison,getPrototypeOf:poison}),{...value(),outcome:new Proxy({},{get:poison})},{...value(),outcome:Object.defineProperty({},'state',{get:poison,enumerable:true})}])fails(item);
  expect(touched).toBe(0);
});
it('rejects exotic prototypes, symbol keys, arrays, cycles and primitive substitutes',()=>{
  for(const raw of [null,1,true,[],JSON.stringify(value()),Object.create({producer:'analysis'}),{...value(),[Symbol('x')]:1},{...value(),outcome:[]},new String('x')])fails(raw);
  const cycle:Record<string,unknown>={};cycle.outcome=cycle;fails(cycle);
});
function usageOracle(raw:unknown){
  const queue:[unknown,number][]=[[raw,0]];let nodes=0,character_units=0,maximum_depth=0,max_object_keys=0;
  for(let i=0;i<queue.length;i++){const [v,d]=queue[i];nodes++;maximum_depth=Math.max(maximum_depth,d);
    if(typeof v==='string')character_units+=v.length*3;
    else if(v&&typeof v==='object'){const entries=Object.entries(v);max_object_keys=Math.max(max_object_keys,entries.length);for(const [k,x]of entries){character_units+=k.length*3;queue.push([x,d+1]);}}
  }return {nodes,character_units,maximum_depth,max_object_keys};
}
it('matches independent bounded statistics for every accepted branch',()=>{
  const inputs=[value(),value('metadata','rejected','unsupported_action'),value('metadata','skipped_deleted','deleted_asset'),value('retrieval','retrieval_failed','changed_during_review'),value('retrieval','rejected','payload_limit'),value('analysis','result_omitted','response_limit'),{...value('parent_omission','result_omitted','response_limit'),original_state:'reviewed'},value('retained','not_processed','deadline_exceeded')];
  for(const raw of inputs){const p=projectSyntheticNonReviewedValue(raw);expect(p.usage).toEqual(usageOracle(raw));expect(p.usage.nodes).toBeLessThanOrEqual(RECOVERY_NONREVIEWED_VALUE_LIMITS.nodes);}
});
it('enforces each finite collection limit before accepting arbitrary structure',()=>{
  fails({a:'x',b:'x',c:'x',d:'x',e:'x'},'limit');fails({a:{b:{c:'x'}}},'limit');
  fails({a:'x'.repeat(342)},'limit');
  fails({a:{a:'',b:'',c:'',d:''},b:{a:'',b:'',c:'',d:''},c:{a:'',b:'',c:'',d:''},d:{a:'',b:'',c:'',d:''}},'limit');
});
it('checks character accounting exactly at its boundary, independently of schema validity',()=>{
  // Three units per code unit: 1024 cap admits 1023 accounted units, never rounds down 1026.
  fails({a:'x'.repeat(340)},'shape');fails({a:'x'.repeat(341)},'limit');
});
it('copies inputs without freezing caller data or retaining later mutations',()=>{
  const raw=value(),p=projectSyntheticNonReviewedValue(raw);raw.outcome.reason='secret changed';
  expect(p.value.outcome.reason).toBe('invalid_xml');expect(Object.isFrozen(raw)).toBe(false);expect(Object.isFrozen(p.usage)).toBe(true);
  expect(projectSyntheticNonReviewedValue(value()).value).toEqual(p.value);
});
it('keeps parent omission values statically distinct from accepted nonreviewed DATA',()=>{
  type Parent=Extract<SyntheticNonReviewedValues,{category:'parent_omission_value'}>;
  type NonReviewed=Extract<SyntheticNonReviewedValues,{category:'nonreviewed_value'}>;
  function cannotPromote(parent:Parent){
    // @ts-expect-error A parent omission draft is not even an accepted-nonreviewed DATA variant.
    const notNonReviewed:NonReviewed=parent;return notNonReviewed;
  }void cannotPromote;
});
it('does not admit a runtime asset outside the current producer snapshot merely because its schema accepts it',()=>{
  expect(assetOutcomeStructure.safeParse(value('retrieval','retrieval_failed','unauthorized').outcome).success).toBe(true);
  fails(value('retrieval','retrieval_failed','unauthorized'));
});
it('agrees with an independent AST oracle for deliverable analysis rejection reasons in the fixed sources',()=>{
  const sourceReasons=new Set<string>();
  for(const file of ['../../src/review/payload-review.ts','../../src/review/update-xml.ts']){
    // TypeScript is inspected as text via the installed compiler, never evaluated.
    const text=readFileSync(new URL(file,import.meta.url),'utf8');
    const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const root=parse(js,{ecmaVersion:'latest',sourceType:'module'}),queue:unknown[]=[root];
    for(let i=0;i<queue.length;i++){
      const n=queue[i] as Record<string,unknown>;if(!n||typeof n!=='object')continue;
      const callee=n.callee as {type?:string;name?:string}|undefined;
      if((n.type==='CallExpression'&&callee?.name==='reject')||(n.type==='NewExpression'&&callee?.name==='ExtractionError')){
        const pending:unknown[]=[(n.arguments as unknown[])[0]];
        for(let j=0;j<pending.length;j++){const x=pending[j] as Record<string,unknown>;if(!x||typeof x!=='object')continue;
          if(x.type==='Literal'&&typeof x.value==='string')sourceReasons.add(x.value);
          for(const v of Object.values(x))if(v&&typeof v==='object')pending.push(...(Array.isArray(v)?v:[v]));
        }
      }
      for(const v of Object.values(n))if(v&&typeof v==='object')queue.push(...(Array.isArray(v)?v:[v]));
    }
  }
  expect(sourceReasons.has('invalid_result_context')).toBe(true);
  for(const reason of assetOutcomeStructure.options[3].shape.reason.options){
    let accepted=false;try{projectSyntheticNonReviewedValue(value('analysis','rejected',reason));accepted=true;}catch{/* fixed rejection */}
    expect(accepted,reason).toBe(sourceReasons.has(reason));
  }
});
