import {expect,it} from 'vitest';
import {projectSyntheticPrefixDelta,PrefixDeltaValueError} from '../support/review/synthetic-prefix-delta.js';
import {modelSyntheticParentOmission} from '../support/review/synthetic-parent-omission-values.js';
import {aggregate} from './fixtures/bp5-results.js';
function fixture(){return {kind:'synthetic_prefix_delta_v1',model_id:'ordered-prefix-delta-v1',schema_version:'bp-mcp-review-0.2',collection_status:'complete',
  parent_prefix:{limitations:['z','a'],errors:[] as {stage:string;code:string;update_xml_sys_id?:string}[]},
  verify:{stage:'verified',verify_required:false,consistency:'stable_observation',verify_error:null as string|null,limitations:[] as string[],errors:[] as string[]}};}
it('keeps separate original and sorted-base lanes without changing caller values or issuing authority',()=>{
  const input=fixture(),before=structuredClone(input),p=projectSyntheticPrefixDelta(input);
  expect(p).toMatchObject({scope:'synthetic_prefix_delta_values',authority:'none',checked_scope:'prefix_local_values_only',value:{
    parent_prefix:{limitations:['z','a'],errors:[]},base_prefix:{limitations:['a','z'],errors:[]},
    ordered_prefix:{limitations:['z','a','soft_deadline_reached','deadline_exceeded'],errors:[{stage:'analysis',code:'deadline_exceeded'}]},
    plan_pre_prefix:{limitations:['a','z','soft_deadline_reached','deadline_exceeded']},
    canonical_prefix:{limitations:['a','deadline_exceeded','soft_deadline_reached','z']},
    stats:{appended_errors:1,dropped_errors:0,errors_truncated:false,truncation_warning_added:false}}});
  expect(input).toEqual(before);expect(Object.isFrozen(input.parent_prefix)).toBe(false);expect(Object.isFrozen(p.value.ordered_prefix.limitations)).toBe(true);
  for(const k of ['issue','claim','bind','seal','receipt','owner','accepted'])expect(p).not.toHaveProperty(k);
});
function rejected(raw:unknown,phase:string,reason?:string){
  try{projectSyntheticPrefixDelta(raw);expect.fail('must reject');}catch(e){expect(e).toBeInstanceOf(PrefixDeltaValueError);expect(e).toMatchObject({code:'internal_review_error',message:'internal_review_error',phase,...(reason?{reason}:{})});}
}
it.each([99,100,101,102,103,104])('checks the parent %i boundary before dedup or sort',count=>{
  const f=fixture();f.parent_prefix.limitations=Array(count).fill('soft_deadline_reached');
  rejected(f,count>103?'shape':'eligibility',count>100?'limit':'binding');
});
// Independent oracle: no product model/projection; linear membership and explicit UTF-16 insertion ordering.
function contains(xs:readonly string[],x:string){for(const y of xs)if(x===y)return true;return false;}
function utf16(a:string,b:string){for(let n=0;n<Math.min(a.length,b.length);n++){const d=a.charCodeAt(n)-b.charCodeAt(n);if(d)return d;}return a.length-b.length;}
function insertion(xs:readonly string[]){const out:string[]=[];for(const x of xs){let at=0;while(at<out.length&&utf16(out[at],x)<=0)at++;out.splice(at,0,x);}return out;}
function oracle(f:ReturnType<typeof fixture>){
  const p=f.parent_prefix,v=f.verify;
  if(p.limitations.length>100||p.limitations.some(x=>x.length>200))return {phase:'eligibility',reason:'limit'};
  const seen:string[]=[];for(const x of p.limitations){if(contains(seen,x))return {phase:'eligibility',reason:'binding'};seen.push(x);}
  const d=[{stage:'analysis',code:'deadline_exceeded'}];if(v.verify_error!==null)d.push({stage:'consistency',code:v.verify_error});if(v.consistency==='changed')d.push({stage:'consistency',code:'changed_during_review'});
  const errors=p.errors.map(x=>({...x}));let accepted=0,dropped=0,capacity=100-errors.length;
  for(const e of d){if(capacity){errors.push({...e});capacity--;accepted++;}else dropped++;}
  const dl=['soft_deadline_reached','deadline_exceeded',...v.limitations];
  function lane(start:string[]){const out:string[]=[];for(const group of [start,dl])for(const x of group)if(!contains(out,x))out.push(x);const add=dropped>0&&!contains(out,'error_details_truncated');if(add)out.push('error_details_truncated');return {out,add};}
  const base=insertion(p.limitations),a=lane(p.limitations),b=lane(base);if(a.out.length>100||b.out.length>100)return {phase:'delta',reason:'limit'};
  return {value:{parent_prefix:p,base_prefix:{limitations:base,errors:p.errors},ordered_prefix:{limitations:a.out,errors},plan_pre_prefix:{limitations:b.out,errors},canonical_prefix:{limitations:insertion(b.out),errors},delta:{limitations:dl,errors:d},
    stats:{appended_errors:accepted,dropped_errors:dropped,errors_truncated:dropped!==0,truncation_warning_added:a.add}}};
}
function withVerify(mode:'stable'|'unverified'|'error'|'changed'|'pure_three'){
  const f=fixture(),changed=mode==='changed'||mode==='pure_three',unverified=mode==='unverified'||mode==='error';
  f.verify.consistency=changed?'changed':unverified?'unverified':'stable_observation';f.verify.verify_error=mode==='error'||mode==='pure_three'?'metadata_unavailable':null;
  f.verify.verify_required=f.verify.verify_error!==null;f.verify.limitations=mode==='stable'?[]:['provisional_results',changed?'changed_during_review':'consistency_unverified'];
  f.verify.errors=[...(f.verify.verify_error?[f.verify.verify_error]:[]),...(changed?['changed_during_review']:[])];return f;
}
it.each(['stable','unverified','error','changed','pure_three'] as const)('matches the independent errors/cap oracle for %s values (not creator evidence)',mode=>{
  for(const e of [0,97,98,99,100])for(const count of [0,95,96,97,98,99,100,101,102,103])for(const x of [false,true]){
    const f=withVerify(mode);f.parent_prefix.errors=Array.from({length:e},(_,n)=>({stage:n%2?'analysis':'output',code:n%2?'deadline_exceeded':'response_limit',...(n%3?{}:{update_xml_sys_id:n.toString(16).padStart(32,'0')})}));
    f.parent_prefix.limitations=Array.from({length:count},(_,n)=>`w${String(count-n).padStart(3,'0')}`);if(x&&count)f.parent_prefix.limitations[0]='error_details_truncated';
    const expected=oracle(f);if(expected.value)expect(projectSyntheticPrefixDelta(f).value).toEqual(expected.value);else rejected(f,expected.phase!,expected.reason);
  }
});
it('deduplicates only the fixed post-eligibility merge and keeps first occurrence in each lane',()=>{
  for(let mask=0;mask<32;mask++){
    const f=withVerify('unverified'),names=['soft_deadline_reached','deadline_exceeded','provisional_results','consistency_unverified','error_details_truncated'];
    f.parent_prefix.limitations=['z',...names.filter((_,n)=>mask&(1<<n)).reverse(),'a'];f.parent_prefix.errors=Array(100).fill({stage:'analysis',code:'deadline_exceeded'});
    expect(projectSyntheticPrefixDelta(f).value).toEqual(oracle(f).value);
  }
});
it('uses UTF-16 ordering without case folding, trimming, normalization or locale ordering',()=>{
  const f=fixture();f.parent_prefix.limitations=['é','e\u0301','\ue000','\ud800\udc00','a','A',' a','a '];
  const p=projectSyntheticPrefixDelta(f);expect(p.value).toEqual(oracle(f).value);expect(p.value.ordered_prefix.limitations.slice(0,8)).toEqual(f.parent_prefix.limitations);
  expect(p.value.base_prefix.limitations).toEqual([' a','A','a','a ','e\u0301','é','\ud800\udc00','\ue000']);
});
it('retains duplicate errors and adds a truncation warning only for an actual dropped delta',()=>{
  const f=withVerify('error');f.parent_prefix.limitations=['error_details_truncated'];f.parent_prefix.errors=Array(98).fill({stage:'analysis',code:'deadline_exceeded'});
  const fits=projectSyntheticPrefixDelta(f);expect(fits.value.stats).toEqual({appended_errors:2,dropped_errors:0,errors_truncated:false,truncation_warning_added:false});
  expect(fits.value.ordered_prefix.errors).toHaveLength(100);expect(fits.value.ordered_prefix.errors[98]).toEqual(f.parent_prefix.errors[0]);
  f.parent_prefix.errors.push({stage:'analysis',code:'deadline_exceeded'});const drops=projectSyntheticPrefixDelta(f);expect(drops.value.stats).toEqual({appended_errors:1,dropped_errors:1,errors_truncated:true,truncation_warning_added:false});
  expect(drops.value.ordered_prefix.limitations[0]).toBe('error_details_truncated');expect(drops.value.ordered_prefix.errors.at(-1)).toEqual({stage:'analysis',code:'deadline_exceeded'});
});
it('keeps distinct ordered lanes when parent order changes but canonical values agree',()=>{
  const a=fixture(),b=fixture();b.parent_prefix.limitations.reverse();const pa=projectSyntheticPrefixDelta(a),pb=projectSyntheticPrefixDelta(b);
  expect(pa.value.ordered_prefix).not.toEqual(pb.value.ordered_prefix);expect(pa.value.canonical_prefix).toEqual(pb.value.canonical_prefix);
  a.parent_prefix.errors=[{stage:'analysis',code:'deadline_exceeded'},{stage:'output',code:'response_limit'}];b.parent_prefix.errors=[...a.parent_prefix.errors].reverse();
  expect(projectSyntheticPrefixDelta(a).value.canonical_prefix.errors).not.toEqual(projectSyntheticPrefixDelta(b).value.canonical_prefix.errors);
});
function parentOracle(counts:readonly(number|'worker')[],prefix:ReturnType<typeof fixture>['parent_prefix']){
  const l=[...prefix.limitations],e=prefix.errors.map(x=>({...x}));let remaining=100,response=contains(l,'response_truncated'),room=100-e.length;
  const actions:string[]=[],totals:number[]=[];
  for(const count of counts){
    const omitted=count!=='worker'&&count>remaining;actions.push(omitted?'parent_omit':'keep');if(count!=='worker'&&!omitted)remaining-=count;
    if((omitted||count==='worker')&&!response){response=true;l.push('response_truncated');if(omitted)l.push('finding_budget_exceeded');if(room){e.push({stage:'output',code:'response_limit'});room--;}else if(!contains(l,'error_details_truncated'))l.push('error_details_truncated');}
    totals.push(100-remaining);
  }
  return {prefix:{limitations:l,errors:e},actions,totals};
}
function parentInput(counts:readonly(number|'worker')[],prefix:ReturnType<typeof fixture>['parent_prefix']){
  const rows=counts.map((count,n)=>{const id=(n+1).toString(16).padStart(32,'0');if(count==='worker')return {producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id,reason:'response_limit'}};
    const a=aggregate().assets[0];a.update_xml_sys_id=a.result.target.update_xml_sys_id=id;a.result.findings=Array.from({length:count},()=>structuredClone(a.result.findings[0]));return {producer:'analysis',outcome:a};});
  return {kind:'synthetic_parent_omission_values_v1',model_id:'recovery-omission-v1',schema_version:'bp-mcp-review-0.2',limits:{max_findings:100},selected:rows.map(r=>r.outcome.update_xml_sys_id),prefix,rows};
}
it.each([
  [[99,2,1],['keep','parent_omit','keep'],100],[[100,1,1],['keep','parent_omit','parent_omit'],100],
  [['worker',100,1],['keep','keep','parent_omit'],100],[[100,1,'worker'],['keep','parent_omit','keep'],100],
] as const)('matches the handwritten parent sequence %j before calculating either delta lane',(counts,actions,total)=>{
  for(const start of [[],['response_truncated'],['finding_budget_exceeded'],['x','x']])for(const size of [0,99,100]){
    const p={limitations:[...start],errors:Array.from({length:size},()=>({stage:'output',code:'response_limit'}))};
    const expected=parentOracle(counts,p),actual=modelSyntheticParentOmission(parentInput(counts,p)).value;
    expect(expected.actions).toEqual(actions);expect(expected.totals.at(-1)).toBe(total);
    expect(actual.prefix).toEqual(expected.prefix);expect(actual.trace.map(t=>t.action)).toEqual(expected.actions);expect(actual.trace.map(t=>t.after)).toEqual(expected.totals);
    const f=fixture();f.parent_prefix=expected.prefix;const answer=oracle(f);if(answer.value)expect(projectSyntheticPrefixDelta({...f,parent_prefix:actual.prefix}).value).toEqual(answer.value);else rejected({...f,parent_prefix:actual.prefix},answer.phase!,answer.reason);
  }
});
it.each([98,99,100])('allows the parent model intermediate %i+3 but refuses to rescue it at eligibility',size=>{
  const f=fixture();f.parent_prefix.limitations=Array.from({length:size},(_,n)=>`w${n}`);f.parent_prefix.errors=Array(100).fill({stage:'analysis',code:'internal_review_error'});
  const expected=parentOracle([100,1],f.parent_prefix),actual=modelSyntheticParentOmission(parentInput([100,1],f.parent_prefix)).value;
  expect(actual.prefix).toEqual(expected.prefix);expect(actual.prefix.limitations).toHaveLength(size+3);rejected({...f,parent_prefix:actual.prefix},'eligibility','limit');
});
it.each([200,201,2000,2001])('keeps the warning character boundary %i distinct from the parent array cap',length=>{
  const f=fixture();f.parent_prefix.limitations=['x'.repeat(length)];if(length===200)expect(projectSyntheticPrefixDelta(f).value).toEqual(oracle(f).value);else rejected(f,length>2000?'shape':'eligibility',length>2000?'shape':'limit');
});
it.each(['consistency','stage','missing_warning','duplicate_warning','extra_warning','error_order','no_verify_error','unknown_error','raw_error','hard_cancel'] as const)('refuses inconsistent verify value %s without emitting an executable result',kind=>{
  const f=withVerify('pure_three');
  if(kind==='consistency')f.verify.consistency='unknown';if(kind==='stage')f.verify.stage='pending';if(kind==='missing_warning')f.verify.limitations.pop();
  if(kind==='duplicate_warning')f.verify.limitations[1]=f.verify.limitations[0];if(kind==='extra_warning')f.verify.limitations.push('other');if(kind==='error_order')f.verify.errors.reverse();
  if(kind==='no_verify_error')f.verify.verify_required=false;
  if(kind==='unknown_error'||kind==='raw_error'||kind==='hard_cancel'){f.verify.verify_error=kind==='raw_error'?'invalid_response':kind==='hard_cancel'?'cancelled':'PRIVATE_UNKNOWN';f.verify.errors[0]=f.verify.verify_error;}
  expect(()=>projectSyntheticPrefixDelta(f)).toThrow('internal_review_error');
});
it.each(['bp-mcp-review-0.2','bp-mcp-review-0.3'])('retains exact error fields/order with the %s candidate-filter contract',version=>{
  for(const status of ['complete','failed'])for(const stage of ['metadata','consistency','payload'])for(const withId of [false,true]){
    const f=fixture();f.schema_version=version;f.collection_status=status;f.parent_prefix.errors=[{stage,code:'candidate_filter_violation',...(withId?{update_xml_sys_id:'1'.repeat(32)}:{})}];
    const valid=version==='bp-mcp-review-0.3'&&!withId&&(stage==='metadata'&&status==='failed'||stage==='consistency'&&status==='complete');
    if(valid)expect(projectSyntheticPrefixDelta(f).value).toEqual(oracle(f).value);else rejected(f,'eligibility',version==='bp-mcp-review-0.2'?'unsupported':'binding');
  }
});
it('validates a dropped delta code too rather than hiding malformed values behind 100 errors',()=>{
  const f=withVerify('error');f.parent_prefix.errors=Array(100).fill({stage:'analysis',code:'deadline_exceeded'});f.verify.verify_error='PRIVATE_UNKNOWN';f.verify.errors=['PRIVATE_UNKNOWN'];
  rejected(f,'delta','unsupported');
});
it('retains the actual supplied verify warning order as values without promoting a reordered view to issuer proof',()=>{
  const f=withVerify('unverified');f.verify.limitations.reverse();const p=projectSyntheticPrefixDelta(f);expect(p.value).toEqual(oracle(f).value);expect(p.unverified).toContain('verify_origin');
});
it.each(['kind','model','version','collection','extra','missing','error_extra','error_id','error_stage','errors101','delta','owner'] as const)('rejects strict input mismatch %s',kind=>{
  const f=fixture();if(kind==='kind')f.kind='other';if(kind==='model')f.model_id='other';if(kind==='version')f.schema_version='bp-mcp-review-0.4';if(kind==='collection')f.collection_status='not_started';
  if(kind==='extra'||kind==='owner'||kind==='delta')Object.assign(f,{[kind]:{}});if(kind==='missing')delete (f.verify as Record<string,unknown>).errors;
  if(kind==='error_extra')f.parent_prefix.errors=[{stage:'analysis',code:'deadline_exceeded',secret:'PRIVATE'} as never];if(kind==='error_id')f.parent_prefix.errors=[{stage:'analysis',code:'deadline_exceeded',update_xml_sys_id:'wrong'}];
  if(kind==='error_stage')f.parent_prefix.errors=[{stage:'unexpected',code:'deadline_exceeded'}];if(kind==='errors101')f.parent_prefix.errors=Array(101).fill({stage:'analysis',code:'deadline_exceeded'});
  expect(()=>projectSyntheticPrefixDelta(f)).toThrow('internal_review_error');
});
it('does not execute hostile accessors, proxies, toJSON or callbacks',()=>{
  let calls=0;const touch=()=>{calls++;throw Error('PRIVATE');},proxy=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  const variants=[proxy,Object.defineProperty(fixture(),'parent_prefix',{get:touch}),{...fixture(),verify:proxy},{...fixture(),parent_prefix:{limitations:new Proxy([],{get:touch,ownKeys:touch}),errors:[]}},
    {...fixture(),parent_prefix:{limitations:[],errors:[Object.defineProperty({},'stage',{get:touch,enumerable:true})]}},{...fixture(),toJSON:touch}];
  for(const raw of variants)expect(()=>projectSyntheticPrefixDelta(raw)).toThrow('internal_review_error');
  expect(()=>projectSyntheticPrefixDelta(fixture(),proxy)).toThrow();expect(calls).toBe(0);
});
it.each(['sparse','array_property','symbol','cycle','depth','keys','characters','unsafe_number'] as const)('stops bounded input %s before schema/copy can expose caller behavior',kind=>{
  const f=fixture();if(kind==='sparse')delete f.parent_prefix.limitations[0];if(kind==='array_property')Object.assign(f.parent_prefix.limitations,{extra:true});
  if(kind==='symbol')Object.assign(f,{[Symbol('x')]:true});if(kind==='cycle')Object.assign(f,{cycle:f});
  if(kind==='depth'){let x:unknown=null;for(let n=0;n<6;n++)x={x};Object.assign(f,{extra:x});}if(kind==='keys')for(let n=0;n<9;n++)Object.assign(f,{['key'+n]:true});
  if(kind==='characters')f.parent_prefix.limitations=['x'.repeat(216667)];if(kind==='unsafe_number')Object.assign(f,{unsafe:Number.MAX_SAFE_INTEGER+1});
  expect(()=>projectSyntheticPrefixDelta(f)).toThrow('internal_review_error');
});
it('uses one shared node/character budget, including otherwise unknown fields',()=>{
  const f=fixture();f.parent_prefix.limitations=Array(103).fill('x'.repeat(2000));f.parent_prefix.errors=Array(100).fill({stage:'metadata',code:'metadata_unavailable',update_xml_sys_id:'1'.repeat(32)});
  const bytesBefore=projectSyntheticPrefixDelta(fixture()).usage.character_units;expect(bytesBefore).toBeGreaterThan(0);
  Object.assign(f,{extra:'x'.repeat(11000)});rejected(f,'shape','limit');
});
it('owns and deeply freezes its values while leaving caller aliases mutable and unretained',()=>{
  const f=fixture();f.parent_prefix.errors=[{stage:'metadata',code:'metadata_unavailable',update_xml_sys_id:'1'.repeat(32)}];const p=projectSyntheticPrefixDelta(f),before=structuredClone(p.value);
  f.parent_prefix.limitations[0]='PRIVATE';f.parent_prefix.errors[0].code='access_denied';f.verify.limitations.push('PRIVATE');expect(p.value).toEqual(before);
  expect(Object.isFrozen(p.value.ordered_prefix.errors[0])).toBe(true);expect(Object.isFrozen(f.parent_prefix.errors[0])).toBe(false);
  // @ts-expect-error The pure returned arrays are readonly, not a writable owner slot.
  expect(()=>{p.value.canonical_prefix.errors[0].code='access_denied';}).toThrow();
});
it('has only fixed failure metadata and no hidden raw input or cause',()=>{
  const f=fixture();f.parent_prefix.limitations=['PRIVATE','PRIVATE'];try{projectSyntheticPrefixDelta(f);expect.fail('must reject');}catch(e){
    expect(e).toBeInstanceOf(PrefixDeltaValueError);expect(String(e)).toBe('Error: internal_review_error');expect(JSON.stringify(e)).not.toContain('PRIVATE');expect(e).not.toHaveProperty('cause');expect(e).not.toHaveProperty('input');
  }
});
it.each(['deadline_exceeded','metadata_unavailable','not_found_or_not_visible','authentication_failed','access_denied','upstream_unavailable','request_budget_exceeded','payload_budget_exceeded','candidate_filter_violation'])('uses normalized verify error %s unchanged as pure DATA',code=>{
  const f=withVerify('error');f.schema_version=code==='candidate_filter_violation'?'bp-mcp-review-0.3':'bp-mcp-review-0.2';f.verify.verify_error=code;f.verify.errors=[code];
  const p=projectSyntheticPrefixDelta(f);expect(p.value).toEqual(oracle(f).value);expect(p.value.delta.errors[1]).toEqual({stage:'consistency',code});expect(p.unverified).toContain('verify_origin');
});
it('bounds nodes even for wide unknown input before the strict schema can reject its fields',()=>{
  function tree(depth:number):unknown{return depth?Object.fromEntries(Array.from({length:8},(_,n)=>['k'+n,tree(depth-1)])):null;}
  rejected(tree(4),'shape','limit');
});
it('applies the candidate-filter collection rule to a delta verify error, not only to the parent prefix',()=>{
  const f=withVerify('error');f.schema_version='bp-mcp-review-0.3';f.collection_status='failed';f.verify.verify_error='candidate_filter_violation';f.verify.errors=['candidate_filter_violation'];
  // The 0.3 schema accepts the code; only the consistency-stage collection rule rejects it here.
  rejected(f,'delta','binding');
});
