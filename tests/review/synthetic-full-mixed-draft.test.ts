import {expect,it} from 'vitest';
import {projectSyntheticFullMixedDraft,FullMixedDraftError} from '../support/review/synthetic-full-mixed-draft.js';
import {aggregate} from './fixtures/bp5-results.js';
type Row={producer:'analysis'|'metadata'|'retrieval'|'retained';outcome:Record<string,unknown>&{state:string;update_xml_sys_id:string}};
type Prefix={limitations:string[];errors:{stage:string;code:string;update_xml_sys_id?:string}[]};
const id=(n:number)=>n.toString(16).padStart(32,'0');
function reviewed(n:number,count=1):Row{
  const a=aggregate().assets[0];a.update_xml_sys_id=a.result.target.update_xml_sys_id=id(n);
  a.result.findings=Array.from({length:count},(_,i)=>({...structuredClone(a.result.findings[0]),issue:`issue-${i}`}));
  return {producer:'analysis',outcome:a};
}
function retained(n:number):Row{return {producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id(n),reason:'deadline_exceeded'}};}
// Independent original-to-manifest oracle: no OM-A, PD-A, assembler or comparator calls.
function oracle(rows:Row[],initial:Prefix){
  const prefix=structuredClone(initial),assets:Row['outcome'][][]=[]; // Each cell preserves a complete independent DATA copy.
  const trace:{ordinal:number;producer:string;original_state:string;action:string;before:number;incoming:number;after:number;limitations_added:string[];errors_added:number}[]=[];
  let remaining=100;
  const has=(value:string)=>{for(const x of prefix.limitations)if(x===value)return true;return false;};
  for(let n=0;n<rows.length;n++){
    const {producer,outcome:a}=rows[n],incoming=a.state==='reviewed'?(a.result as {findings:unknown[]}).findings.length:0,before=100-remaining,omit=a.state==='reviewed'&&incoming>remaining;
    const added:string[]=[];let errorsAdded=0;
    if(!omit)remaining-=incoming;
    assets.push([omit?{state:'result_omitted',update_xml_sys_id:a.update_xml_sys_id,reason:'response_limit'}:structuredClone(a)]);
    if((omit||a.state==='result_omitted')&&!has('response_truncated')){
      added.push('response_truncated');if(omit)added.push('finding_budget_exceeded');
      if(prefix.errors.length<100){prefix.errors.push({stage:'output',code:'response_limit'});errorsAdded=1;}
      else if(!has('error_details_truncated'))added.push('error_details_truncated');
      prefix.limitations.push(...added);
    }
    trace.push({ordinal:n,producer,original_state:a.state,action:omit?'parent_omit':'keep',before,incoming,after:100-remaining,limitations_added:added,errors_added:errorsAdded});
  }
  return {assets:assets.map(x=>x[0]),prefix,trace};
}
function fixture(rows:Row[]=[reviewed(1,2),retained(2)],prefix:Prefix={limitations:['z','a'],errors:[]},version='bp-mcp-review-0.2'){
  return {kind:'synthetic_full_mixed_draft_v1',model_id:'full-mixed-draft-v1',schema_version:version,ruleset_version:'bp3-0.4',selected:rows.map(r=>r.outcome.update_xml_sys_id),prefix,rows,
    manifest:oracle(rows,prefix)};
}
type Body=ReturnType<typeof aggregate>['assets'][number]['result'];
function body(f:ReturnType<typeof fixture>){return f.manifest.assets[0].result as Body;}
function reject(raw:unknown,phase?:string){let error:unknown;try{projectSyntheticFullMixedDraft(raw);}catch(e){error=e;}expect(error).toBeInstanceOf(FullMixedDraftError);expect(error).toMatchObject({message:'internal_review_error',...(phase?{phase}:{})});return error;}
it('compares full typed bodies and returns an owned, frozen non-executable draft only',()=>{
  const f=fixture(),before=structuredClone(f),out=projectSyntheticFullMixedDraft(f);
  expect(out).toMatchObject({scope:'synthetic_full_mixed_draft_values',authority:'none',checked_scope:'full_mixed_values_only',value:{kept_findings:2}});
  expect(out.value.manifest).toEqual(f.manifest);expect(out.value.original_rows).toEqual(f.rows);expect(f).toEqual(before);
  body(f).findings[0].issue='PRIVATE';expect((out.value.manifest.assets[0] as {state:'reviewed';result:Body}).result.findings[0].issue).toBe('issue-0');
  expect(Object.isFrozen(out.value.manifest.assets[0])).toBe(true);expect(Object.isFrozen(f.rows[0])).toBe(false);
  for(const key of ['owner','receipt','seal','ContentChecked','claim','pending'])expect(out).not.toHaveProperty(key);
  expect(out.usage.compared_nodes).toBeGreaterThan(100);expect(out.unverified).toContain('original_wire');
});
it.each(['bp-mcp-review-0.2','bp-mcp-review-0.3'])('matches the independent whole-asset and trace oracle for %s',version=>{
  for(const counts of [[99,2,1],[100,1,1],[0,100,1],[50,50,1],[1,1,1]])for(const errorCount of [0,99,100])for(const warnings of [[],['response_truncated'],['error_details_truncated'],['x','x']]){
    const rows=[...counts.map((n,i)=>reviewed(i+1,n)),{producer:'analysis' as const,outcome:{state:'result_omitted',update_xml_sys_id:id(4),reason:'response_limit'}},retained(5)];
    const f=fixture(rows,{limitations:[...warnings],errors:Array.from({length:errorCount},()=>({stage:'output',code:'response_limit'}))},version),out=projectSyntheticFullMixedDraft(f);
    expect(out.value.manifest).toEqual(f.manifest);expect(out.value.original_rows).toEqual(rows);
    expect(out.value.kept_findings).toBe(f.manifest.trace.at(-1)!.after);
  }
});
it.each(['issue','impact','applicability','recommendation','source_summary','optional_scope','hash','reviewed_at','limitation_order','findings_order','findings_duplicate','follow_up_order','target_optional'] as const)('rejects a same-context or full-field %s mutation',field=>{
  const f=fixture(),b=body(f),finding=b.findings[0];
  if(['issue','impact','applicability','recommendation'].includes(field))Object.assign(finding,{[field]:'changed but schema-valid'});
  if(field==='source_summary')finding.sources[0].summary='changed summary';if(field==='optional_scope')b.target.sys_scope=null;
  if(field==='hash')b.target.code_hash='f'.repeat(64);if(field==='reviewed_at')b.reviewed_at='2026-10-17T05:00:01Z';
  if(field==='limitation_order')b.limitations.reverse();if(field==='findings_order')b.findings.reverse();if(field==='findings_duplicate')b.findings[1]=structuredClone(b.findings[0]);
  if(field==='follow_up_order')finding.required_follow_up.reverse();if(field==='target_optional')b.target.record_updated_at='2026-10-17T04:00:00Z';
  reject(f,'content');
});
it('ignores object property insertion order but never string normalization or array order',()=>{
  const f=fixture();body(f).findings[0]=Object.fromEntries(Object.entries(body(f).findings[0]).reverse()) as Body['findings'][number];
  expect(projectSyntheticFullMixedDraft(f).authority).toBe('none');
  const source=(f.rows[0].outcome.result as Body);source.findings[0].issue='é';body(f).findings[0].issue='e\u0301';reject(f,'content');
});
it.each(['parent_to_worker','lost_parent_body','wrong_reason','extra_field','nonreviewed_variant','row_order','trace_action','trace_count','trace_prefix','prefix_error_order'] as const)('rejects %s substitution or mismatched manifest',kind=>{
  const f=fixture([reviewed(1,99),reviewed(2,2),retained(3)],{limitations:[],errors:[{stage:'analysis',code:'deadline_exceeded'},{stage:'output',code:'response_limit'}]});
  if(kind==='parent_to_worker')f.rows[1]={producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'}};
  if(kind==='lost_parent_body')delete f.rows[1].outcome.result;if(kind==='wrong_reason')f.manifest.assets[1].reason='deadline_exceeded';
  if(kind==='extra_field')Object.assign(f.manifest.assets[1],{original_body:'PRIVATE'});if(kind==='nonreviewed_variant')f.manifest.assets[2]={state:'rejected',update_xml_sys_id:id(3),reason:'payload_limit'};
  if(kind==='row_order')f.manifest.assets.reverse();if(kind==='trace_action')f.manifest.trace[1].action='keep';if(kind==='trace_count')f.manifest.trace[1].incoming=1;
  if(kind==='trace_prefix')f.manifest.trace[1].limitations_added.reverse();if(kind==='prefix_error_order')f.manifest.prefix.errors.reverse();reject(f);
});
it('handles zero original reviewed and separately retains parent-omitted original bodies',()=>{
  const zero=fixture([{producer:'metadata',outcome:{state:'not_applicable',update_xml_sys_id:id(1),asset_type:'other',reason:'asset_type_unsupported'}},retained(2)]);
  expect(projectSyntheticFullMixedDraft(zero).value.original_rows.every(x=>x.outcome.state!=='reviewed')).toBe(true);
  const omitted=fixture([reviewed(1,100),reviewed(2,1),retained(3)]),out=projectSyntheticFullMixedDraft(omitted);
  expect(out.value.original_rows[1].outcome.state).toBe('reviewed');expect(out.value.manifest.assets[1].state).toBe('result_omitted');
  const missing=fixture([], {limitations:[],errors:[]});reject(missing);
  reject(fixture([reviewed(1)]),'input');
});
it.each(['bp-mcp-review-0.2','bp-mcp-review-0.3'])('checks producer/state and deletion rules for %s',version=>{
  const rows:Row[]=[{producer:'metadata',outcome:{state:'skipped_deleted',update_xml_sys_id:id(1),reason:'deleted_asset'}},retained(2)],f=fixture(rows,undefined,version);
  if(version==='bp-mcp-review-0.2')expect(projectSyntheticFullMixedDraft(f).authority).toBe('none');else reject(f,'parent');
  const bad=fixture([{producer:'retrieval',outcome:{state:'rejected',update_xml_sys_id:id(1),reason:'javascript_parse_failed'}},retained(2)]);reject(bad,'parent');
});
it.each(['kind','model','version','ruleset','result_ruleset','unknown_body','source_field','missing','extra','duplicate_id','unsorted','rows101','sparse','symbol','depth','characters'] as const)('fails closed on %s input',kind=>{
  const f=fixture();if(kind==='kind')f.kind='other';if(kind==='model')f.model_id='other';if(kind==='version')f.schema_version='bp-mcp-review-0.4';if(kind==='ruleset')f.ruleset_version='bp3-unknown';if(kind==='result_ruleset')f.ruleset_version='bp3-0.5';
  if(kind==='unknown_body')Object.assign(body(f),{unknown:'PRIVATE'});if(kind==='source_field')body(f).findings[0].sources[0].title='wrong catalog title';
  if(kind==='missing')delete (f as Record<string,unknown>).manifest;if(kind==='extra')Object.assign(f,{owner:{}});if(kind==='duplicate_id')f.selected[1]=f.selected[0];if(kind==='unsorted')f.selected.reverse();
  if(kind==='rows101')f.rows=Array(101).fill(retained(1));if(kind==='sparse')delete f.manifest.assets[0];if(kind==='symbol')Object.assign(f.manifest.assets[0],{[Symbol('x')]:1});
  if(kind==='depth'){let x:unknown=null;for(let n=0;n<30;n++)x={x};Object.assign(f.manifest.assets[0],{deep:x});}
  if(kind==='characters')body(f).findings[0].issue='x'.repeat(262145);reject(f);
});
it('rejects hostile descriptors without executing them and keeps failures free of raw body/cause',()=>{
  let calls=0;const touch=()=>{calls++;throw Error('PRIVATE');},p=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  for(const f of [p,{...fixture(),rows:p},{...fixture(),schema_version:p},{...fixture(),ruleset_version:p},Object.defineProperty(fixture(),'manifest',{get:touch}),{...fixture(),manifest:{...fixture().manifest,assets:[p]}}])reject(f);
  const f=fixture();Object.defineProperty(body(f).findings[0],'issue',{get:touch});const error=reject(f);expect(calls).toBe(0);expect(JSON.stringify(error)).not.toContain('PRIVATE');expect(error).not.toHaveProperty('cause');
  expect(()=>projectSyntheticFullMixedDraft(fixture(),{})).toThrow('internal_review_error');
});
it('keeps the 100-row, 103-intermediate-prefix and per-asset byte limits separate',()=>{
  const rows:Row[]=Array.from({length:99},(_,n)=>({producer:'metadata',outcome:{state:'not_applicable',update_xml_sys_id:id(n+1),asset_type:'other',reason:'asset_type_unsupported'}}));rows.push(retained(100));
  expect(projectSyntheticFullMixedDraft(fixture(rows)).value.selected).toHaveLength(100);
  const initial={limitations:Array.from({length:100},(_,n)=>`warning-${n}`),errors:Array.from({length:100},()=>({stage:'output',code:'response_limit'}))};
  const intermediate=projectSyntheticFullMixedDraft(fixture([reviewed(1,99),reviewed(2,2),retained(3)],initial));
  expect(intermediate.value.manifest.prefix.limitations).toHaveLength(103);expect(intermediate.unverified).toContain('seal');
  const large=reviewed(1,100);for(const finding of (large.outcome.result as Body).findings)finding.issue='x'.repeat(2000);
  expect(reject(fixture([large,retained(2)]),'parent')).toMatchObject({reason:'limit'});
});
it('does not turn matching synthetic caller DATA into original-body or receipt authority',()=>{
  const f=fixture();(f.rows[0].outcome.result as Body).findings[0].recommendation='same synthetic replacement';body(f).findings[0].recommendation='same synthetic replacement';
  const result=projectSyntheticFullMixedDraft(f);expect(result.authority).toBe('none');expect(result.unverified).toContain('row_receipts');expect(result.unverified).toContain('original_wire');
});
