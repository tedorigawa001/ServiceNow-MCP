import {expect,it} from 'vitest';
import {modelSyntheticParentOmission,ParentOmissionValueError,PARENT_OMISSION_VALUE_LIMITS} from '../support/review/synthetic-parent-omission-values.js';
import {aggregate} from './fixtures/bp5-results.js';
import {readFileSync} from 'node:fs';
import {parse,type Node} from 'acorn';
import ts from 'typescript';
const id=(n:number)=>n.toString(16).padStart(32,'0');
function reviewed(n=1,count=1){
  const asset=aggregate().assets[0];asset.update_xml_sys_id=asset.result.target.update_xml_sys_id=id(n);
  asset.result.findings=Array.from({length:count},()=>structuredClone(asset.result.findings[0]));return {producer:'analysis',outcome:asset};
}
function fixture(rows:unknown[]=[reviewed()]){return {kind:'synthetic_parent_omission_values_v1',model_id:'recovery-omission-v1',schema_version:'bp-mcp-review-0.2',limits:{max_findings:100},
  selected:rows.map((_,i)=>id(i+1)),prefix:{limitations:[] as string[],errors:[] as unknown[]},rows};}
it('keeps a reviewed value intact and derives the parent prefix without issuing authority',()=>{
  const raw=fixture(),before=structuredClone(raw),out=modelSyntheticParentOmission(raw);
  expect(out).toMatchObject({authority:'none',checked_scope:'parent_finding_values_only',value:{kept_findings:1,prefix:{limitations:[],errors:[]},trace:[{ordinal:0,action:'keep',before:0,incoming:1,after:1}]}});
  expect(out.value.assets).toEqual([(raw.rows[0] as ReturnType<typeof reviewed>).outcome]);expect(raw).toEqual(before);expect(Object.isFrozen(raw)).toBe(false);
});
it('omits only the over-budget whole result and still retains a later fitting result',()=>{
  const out=modelSyntheticParentOmission(fixture([reviewed(1,99),reviewed(2,2),reviewed(3,1)]));
  expect(out.value.trace.map(t=>[t.action,t.before,t.incoming,t.after])).toEqual([['keep',0,99,99],['parent_omit',99,2,99],['keep',99,1,100]]);
  expect(out.value.assets[1]).toEqual({state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'});
  expect(out.value.prefix).toEqual({limitations:['response_truncated','finding_budget_exceeded'],errors:[{stage:'output',code:'response_limit'}]});
});
it('keeps an original worker omission distinct and does not count nonreviewed rows as findings',()=>{
  const raw=fixture([reviewed(1,99),{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'}},
    {producer:'metadata',outcome:{state:'not_applicable',update_xml_sys_id:id(3),asset_type:'other',reason:'asset_type_unsupported'}},
    {producer:'retrieval',outcome:{state:'retrieval_failed',update_xml_sys_id:id(4),reason:'payload_unavailable'}},
    {producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id(5),reason:'deadline_exceeded'}},reviewed(6,2)]);
  const out=modelSyntheticParentOmission(raw);
  expect(out.value.trace.map(t=>[t.action,t.incoming,t.after])).toEqual([['keep',99,99],['keep',0,99],['keep',0,99],['keep',0,99],['keep',0,99],['parent_omit',2,99]]);
  expect(out.value.prefix).toEqual({limitations:['response_truncated'],errors:[{stage:'output',code:'response_limit'}]});
});
const omitted=(n:number)=>({producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id(n),reason:'response_limit'}});
// Independent truth table, not computed from the model's output or implementation.
it.each([
  [[99,0],['keep','keep'],99],[[99,1],['keep','keep'],100],[[99,2],['keep','parent_omit'],99],
  [[100,0],['keep','keep'],100],[[100,1,0],['keep','parent_omit','keep'],100],[[50,51,50],['keep','parent_omit','keep'],100],
  [[0,100,1],['keep','keep','parent_omit'],100],[[60,60,60],['keep','parent_omit','parent_omit'],60],
] as const)('matches the independent finding table %j', (counts,actions,total)=>{
  const out=modelSyntheticParentOmission(fixture(counts.map((n,i)=>reviewed(i+1,n))));
  expect(out.value.trace.map(t=>t.action)).toEqual(actions);expect(out.value.kept_findings).toBe(total);
});
it.each([
  [[],['response_truncated','finding_budget_exceeded'],1],
  [['response_truncated'],['response_truncated'],0],
  [['finding_budget_exceeded'],['finding_budget_exceeded','response_truncated','finding_budget_exceeded'],1],
  [['response_truncated','finding_budget_exceeded'],['response_truncated','finding_budget_exceeded'],0],
] as const)('preserves the parent-specific warning condition %j',(before,after,added)=>{
  const raw=fixture([reviewed(1,100),reviewed(2,1)]);raw.prefix.limitations=[...before];const out=modelSyntheticParentOmission(raw);
  expect(out.value.initial_prefix.limitations).toEqual(before);expect(out.value.prefix.limitations).toEqual(after);expect(out.value.prefix.errors).toHaveLength(added);
});
it.each([0,99,100])('preserves the error prefix and applies the cap at %i',size=>{
  const raw=fixture([reviewed(1,100),reviewed(2,1)]);raw.prefix.errors=Array.from({length:size},()=>({stage:'output',code:'response_limit'}));
  const out=modelSyntheticParentOmission(raw);expect(out.value.prefix.errors).toHaveLength(size===100?100:size+1);
  expect(out.value.prefix.errors.slice(0,size)).toEqual(raw.prefix.errors);
  expect(out.value.prefix.limitations).toEqual(['response_truncated','finding_budget_exceeded',...(size===100?['error_details_truncated']:[])]);
  expect(out.value.trace[1]).toMatchObject({errors_added:size===100?0:1,limitations_added:out.value.prefix.limitations});
});
it('keeps all 103 intermediate limitations without premature dedup or final-schema admission',()=>{
  const raw=fixture([reviewed(1,100),reviewed(2,1)]);raw.prefix.limitations=Array(100).fill('existing');raw.prefix.errors=Array(100).fill({stage:'analysis',code:'internal_review_error'});
  const out=modelSyntheticParentOmission(raw);expect(out.value.prefix.limitations).toHaveLength(103);expect(out.value.prefix.limitations.slice(0,100)).toEqual(raw.prefix.limitations);
  expect(out.value.prefix.limitations.slice(100)).toEqual(['response_truncated','finding_budget_exceeded','error_details_truncated']);
  expect(out).not.toHaveProperty('candidate');expect(out.value).not.toHaveProperty('coverage');expect(out.value).not.toHaveProperty('counts');expect(out.value).not.toHaveProperty('status');
});
it('does not append an error or finding warning once an original omission set response_truncated',()=>{
  const raw=fixture([omitted(1),reviewed(2,100),reviewed(3,1)]),out=modelSyntheticParentOmission(raw);
  expect(out.value.trace.map(t=>[t.original_state,t.action,t.errors_added,t.limitations_added])).toEqual([
    ['result_omitted','keep',1,['response_truncated']],['reviewed','keep',0,[]],['reviewed','parent_omit',0,[]]]);
});
it('retains the full original reviewed value after parent omission, but keeps that as DATA not evidence',()=>{
  const raw=fixture([reviewed(1,100),reviewed(2,1)]),out=modelSyntheticParentOmission(raw);
  expect(out.value.original_rows[1]).toEqual(raw.rows[1]);expect(out.value.assets[1].state).toBe('result_omitted');
  expect(out.unverified).toContain('capture_binding');expect(out.unverified).toContain('decision_evidence');
  expect(out).not.toHaveProperty('seal');expect(out).not.toHaveProperty('consume');
});
it('accepts empty pure values without claiming an empty-manifest or recovery proof',()=>{
  const out=modelSyntheticParentOmission(fixture([]));expect(out.value.assets).toEqual([]);expect(out.value.kept_findings).toBe(0);expect(out.unverified).toContain('manifest');
});
it('supports the 0.3 value subset but refuses deleted and version-incompatible errors',()=>{
  const raw=fixture();raw.schema_version='bp-mcp-review-0.3';raw.prefix.errors=[{stage:'metadata',code:'candidate_filter_violation'}];expect(modelSyntheticParentOmission(raw).value.schema_version).toBe(raw.schema_version);
  raw.schema_version='bp-mcp-review-0.2';expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
  const deleted=fixture([{producer:'metadata',outcome:{state:'skipped_deleted',update_xml_sys_id:id(1),reason:'deleted_asset'}}]);expect(modelSyntheticParentOmission(deleted).value.assets[0].state).toBe('skipped_deleted');
  deleted.schema_version='bp-mcp-review-0.3';expect(()=>modelSyntheticParentOmission(deleted)).toThrow('internal_review_error');
});
it.each(['model','limit','extra','missing','duplicate','reverse','wrong_id','wrong_producer','parent_omission','wrong_reason','101_findings','invalid_nested'] as const)('fails closed for %s input',kind=>{
  const raw=fixture([reviewed(1),reviewed(2)]);
  if(kind==='model')raw.model_id='other';if(kind==='limit')raw.limits.max_findings=101;if(kind==='extra')Object.assign(raw,{verified:true});if(kind==='missing')raw.rows.pop();
  if(kind==='duplicate')raw.selected[1]=raw.selected[0];if(kind==='reverse')raw.rows.reverse();if(kind==='wrong_id')raw.selected[1]=id(3);
  if(kind==='wrong_producer')raw.rows[0]={...reviewed(),producer:'metadata'};if(kind==='parent_omission')raw.rows[0]={...omitted(1),producer:'parent_omission'};
  if(kind==='wrong_reason')raw.rows[0]={producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id(1),reason:'deadline_exceeded'}};
  if(kind==='101_findings')raw.rows[0]=reviewed(1,101);if(kind==='invalid_nested'){const r=reviewed();r.outcome.result.target.update_xml_sys_id=id(2);raw.rows[0]=r;}
  // Nested provenance against the containing asset is checked below, separately from full result refinements.
  expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
});
it('rejects unbounded prefix and row collections',()=>{
  const raw=fixture();raw.prefix.limitations=Array(101).fill('x');expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
  raw.prefix.limitations=['x'.repeat(2001)];expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
  raw.prefix.limitations=[];raw.prefix.errors=Array(101).fill({stage:'output',code:'response_limit'});expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
  const over=fixture(Array.from({length:101},(_,i)=>omitted(i+1)));expect(()=>modelSyntheticParentOmission(over)).toThrow('internal_review_error');
});
it('does not invoke caller accessors, proxies, toJSON or arbitrary callbacks',()=>{
  let touches=0;const trap=()=>{touches++;throw Error('secret');};
  for(const raw of [new Proxy({}, {get:trap,ownKeys:trap}),Object.defineProperty(fixture(),'rows',{get:trap}),{...fixture(),rows:new Proxy([],{get:trap})},
    {...fixture(),prefix:{limitations:[],errors:[],toJSON:trap}},fixture([{producer:'analysis',outcome:Object.defineProperty({},'state',{get:trap,enumerable:true})}])])expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
  expect(touches).toBe(0);
});
it('returns owned deeply immutable values without freezing or retaining caller aliases',()=>{
  const raw=fixture(),out=modelSyntheticParentOmission(raw),original=raw.rows[0] as ReturnType<typeof reviewed>;
  original.outcome.result.findings[0].recommendation='changed';raw.prefix.limitations.push('changed');
  expect(out.value.assets[0]).not.toEqual(original.outcome);expect(out.value.prefix.limitations).toEqual([]);expect(Object.isFrozen(out.value.original_rows[0].outcome)).toBe(true);
  // @ts-expect-error Pure model output is deeply readonly.
  const mutate=()=>{out.value.assets[0].state='result_omitted';};expect(mutate).toThrow();expect(Object.isFrozen(raw)).toBe(false);
});
it('uses fixed non-secret failures and exposes no hidden exception or source fields',()=>{
  try{modelSyntheticParentOmission({secret:'do not disclose'});throw Error('missing rejection');}catch(error){expect(error).toBeInstanceOf(ParentOmissionValueError);const e=error as ParentOmissionValueError;expect(e.message).toBe('internal_review_error');expect(e).not.toHaveProperty('cause');expect(JSON.stringify(e)).not.toContain('do not disclose');}
  expect(PARENT_OMISSION_VALUE_LIMITS.model_id).toBe('recovery-omission-v1');
});
it.each([false,true])('does not dedup a pre-existing error_details_truncated warning (%s)',already=>{
  const raw=fixture([omitted(1)]);raw.prefix.errors=Array(100).fill({stage:'analysis',code:'internal_review_error'});raw.prefix.limitations=already?['error_details_truncated']:[];
  const out=modelSyntheticParentOmission(raw);expect(out.value.prefix.limitations).toEqual(already?['error_details_truncated','response_truncated']:['response_truncated','error_details_truncated']);expect(out.value.trace[0].errors_added).toBe(0);
});
it.each(['sparse','array_extra','array_proto','row_proto','symbol','undefined','function','cycle','depth','long_string'] as const)('rejects exotic or over-bounded %s values',kind=>{
  const raw=fixture(),r=raw.rows[0] as ReturnType<typeof reviewed>;
  if(kind==='sparse')delete raw.rows[0];if(kind==='array_extra')Object.assign(raw.rows,{extra:true});if(kind==='array_proto')Object.setPrototypeOf(raw.rows,{});
  if(kind==='row_proto')Object.setPrototypeOf(raw.rows[0],{other:true});if(kind==='symbol')Object.assign(raw,{[Symbol('extra')]:'x'});if(kind==='undefined')Object.assign(r.outcome,{extra:undefined});
  if(kind==='function')Object.assign(r.outcome.result,{callback:()=>undefined});if(kind==='cycle')Object.assign(r.outcome.result,{cycle:r.outcome});
  if(kind==='depth'){let x:unknown='x';for(let i=0;i<8;i++)x={x};Object.assign(r.outcome.result,{extra:x});}
  if(kind==='long_string')r.outcome.result.findings[0].issue='x'.repeat(262145);
  expect(()=>modelSyntheticParentOmission(raw)).toThrow('internal_review_error');
});
function sized(bytes:number){
  const row=reviewed(1,100),keys=['issue','impact','applicability','recommendation'] as const;
  for(const f of row.outcome.result.findings)for(const k of keys)f[k]='x';
  let remaining=bytes-Buffer.byteLength(JSON.stringify(row.outcome),'utf8');
  for(const f of row.outcome.result.findings)for(const k of keys){const n=Math.min(Math.max(remaining,0),1999);f[k]+='x'.repeat(n);remaining-=n;}
  expect(remaining).toBe(0);expect(Buffer.byteLength(JSON.stringify(row.outcome),'utf8')).toBe(bytes);return row;
}
it.each([262143,262144])('accepts a pure asset whose normalized logical JSON is %i bytes without granting wire origin',bytes=>{
  const out=modelSyntheticParentOmission(fixture([sized(bytes)]));expect(out.value.kept_findings).toBe(100);expect(out.unverified).toContain('producer_origin');
});
it('rejects the B+1 asset boundary without replacing it with an invented omission',()=>{
  expect(()=>modelSyntheticParentOmission(fixture([sized(262145)]))).toThrow('internal_review_error');
});
it('accepts 100 ordered pure rows without treating them as a completed recovery run',()=>{
  const raw=fixture(Array.from({length:100},(_,i)=>omitted(i+1))),out=modelSyntheticParentOmission(raw);expect(out.value.assets).toHaveLength(100);expect(out.value.kept_findings).toBe(0);
  expect(out.value.prefix.errors).toEqual([{stage:'output',code:'response_limit'}]);expect(out.unverified).toContain('whole_run_budget');
});
it.each(['duplicate','different'] as const)('rejects %s applicable rules that contradict the nested result',kind=>{
  const row=reviewed();row.outcome.applicable_rule_ids=kind==='duplicate'?['AU-BR-001','AU-BR-001']:['AU-BR-002'];expect(()=>modelSyntheticParentOmission(fixture([row]))).toThrow('internal_review_error');
});
it.each([
  ['metadata','rejected','unsupported_action'],['retrieval','rejected','payload_limit'],['analysis','rejected','invalid_xml'],['retained','not_processed','deadline_exceeded'],
] as const)('keeps %s/%s/%s as an unchanged nonreviewed value',(producer,state,reason)=>{
  const row={producer,outcome:{state,update_xml_sys_id:id(1),reason}},out=modelSyntheticParentOmission(fixture([row]));
  expect(out.value.original_rows).toEqual([row]);expect(out.value.assets).toEqual([row.outcome]);expect(out.value.prefix).toEqual({limitations:[],errors:[]});expect(out.value.kept_findings).toBe(0);
});
it.each([
  ['metadata','result_omitted','response_limit'],['retrieval','retrieval_failed','unauthorized'],['analysis','not_processed','deadline_exceeded'],['retained','not_processed','cancelled'],
] as const)('does not widen NR-A for %s/%s/%s',(producer,state,reason)=>{
  expect(()=>modelSyntheticParentOmission(fixture([{producer,outcome:{state,update_xml_sys_id:id(1),reason}}]))).toThrow('internal_review_error');
});
// Pinned source branch audit supplements, but is not a substitute for, the independent truth tables.
function program(text:string){return parse(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{ecmaVersion:'latest',sourceType:'module'});}
function nodes(root:Node){const result:Record<string,unknown>[]=[],pending:unknown[]=[root];while(pending.length){const n=pending.pop();if(!n||typeof n!=='object')continue;const v=n as Record<string,unknown>;if(typeof v.type==='string')result.push(v);for(const x of Object.values(v))if(Array.isArray(x))pending.push(...x);else if(x&&typeof x==='object')pending.push(x);}return result;}
function canonical(n:unknown){return JSON.parse(JSON.stringify(n,(key,value)=>['start','end','loc','raw'].includes(key)?undefined:value));}
const fixedBranch=`if (validated.state === 'reviewed' && findings + validated.result.findings.length > run.limits.max_findings) {
run.assets.push({ state: 'result_omitted', update_xml_sys_id: row.sys_id, reason: 'response_limit' });
if (!run.limitations.includes('response_truncated')) { run.limitations.push('response_truncated', 'finding_budget_exceeded'); addError(run, { stage: 'output', code: 'response_limit' }); }
} else { run.assets.push(validated); if (validated.state === 'result_omitted' && !run.limitations.includes('response_truncated')) { run.limitations.push('response_truncated'); addError(run, { stage: 'output', code: 'response_limit' }); } }`;
function auditParent(text:string){
  const all=nodes(program(text)),candidates=all.filter(n=>n.type==='IfStatement'&&JSON.stringify(n.test).includes('"name":"findings"'));
  expect(candidates).toHaveLength(1);expect(canonical(candidates[0])).toEqual(canonical(nodes(program(fixedBranch)).find(n=>n.type==='IfStatement'&&JSON.stringify(n.test).includes('"name":"findings"'))));
  const actual=all.filter(n=>n.type==='VariableDeclarator'&&(n.id as {name?:string})?.name==='findings');expect(actual).toHaveLength(1);
  const expected=nodes(program("const findings = run.assets.reduce((n,a) => n + (a.state === 'reviewed' ? a.result.findings.length : 0), 0);")).find(n=>n.type==='VariableDeclarator');expect(canonical(actual[0])).toEqual(canonical(expected));
  const fixedError=`function addError(run,error){ if(run.errors.length<100){if(error.code==='candidate_filter_violation'){if(run.schema_version!=='bp-mcp-review-0.3')throw new Error('internal_review_error');run.errors.push(error);}else run.errors.push({...error,code:error.code});}else if(!run.limitations.includes('error_details_truncated'))run.limitations.push('error_details_truncated');}`;
  const helpers=all.filter(n=>n.type==='FunctionDeclaration'&&(n.id as {name?:string})?.name==='addError');expect(helpers).toHaveLength(1);expect(canonical(helpers[0])).toEqual(canonical(nodes(program(fixedError)).find(n=>n.type==='FunctionDeclaration')));
}
it('keeps the modeled parent branch and prefix derivation pinned to the current source without executing it',()=>{
  const source=readFileSync(new URL('../../src/review/update-set-adapter.ts',import.meta.url),'utf8');expect(()=>auditParent(source)).not.toThrow();
});
it.each([
  ['boundary',"findings + validated.result.findings.length > run.limits.max_findings","findings + validated.result.findings.length >= run.limits.max_findings"],
  ['warning_order',"push('response_truncated', 'finding_budget_exceeded')","push('finding_budget_exceeded', 'response_truncated')"],
  ['reason',"reason: 'response_limit'","reason: 'deadline_exceeded'"],
  ['prefix',"n + (a.state === 'reviewed' ? a.result.findings.length : 0)","n + (a.state === 'reviewed' ? 0 : a.result.findings.length)"],
  ['error_cap','run.errors.length < 100','run.errors.length <= 100'],
] as const)('detects source %s drift as a negative control',(_name,from,to)=>{
  const source=readFileSync(new URL('../../src/review/update-set-adapter.ts',import.meta.url),'utf8');expect(source).toContain(from);expect(()=>auditParent(source.replace(from,to))).toThrow();
});
