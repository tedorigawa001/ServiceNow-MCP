import {expect,it} from 'vitest';
import {projectSyntheticPendingPrefixValues,PendingPrefixValueError} from '../support/review/synthetic-pending-prefix-values.js';
type E={stage:string;code:string;update_xml_sys_id?:string};
type P={limitations:string[];errors:E[]};
// Independent linear membership + UTF-16 insertion oracle: no PD-A/OM-A/plan projection imports.
function sort(xs:string[]){const out:string[]=[];for(const x of xs){let at=0;while(at<out.length){const y=out[at];let d=0;for(let n=0;n<Math.min(x.length,y.length)&&!d;n++)d=x.charCodeAt(n)-y.charCodeAt(n);if(!d)d=x.length-y.length;if(d<0)break;at++;}out.splice(at,0,x);}return out;}
function oracle(p:P,mode:'stable'|'unverified'|'changed',verifyError:string|null=null){
  const v={stage:'verified',verify_required:verifyError!==null,consistency:mode==='stable'?'stable_observation':mode,verify_error:verifyError,
    limitations:mode==='stable'?[]:['provisional_results',mode==='changed'?'changed_during_review':'consistency_unverified'],errors:[...(verifyError?[verifyError]:[]),...(mode==='changed'?['changed_during_review']:[])]};
  const added:E[]=[{stage:'analysis',code:'deadline_exceeded'},...(verifyError?[{stage:'consistency',code:verifyError}]:[]),...(mode==='changed'?[{stage:'consistency',code:'changed_during_review'}]:[])];
  const errors=p.errors.map(e=>({...e}));let drops=0;for(const e of added){if(errors.length<100)errors.push(e);else drops++;}
  const ordered=[...p.limitations];for(const x of ['soft_deadline_reached','deadline_exceeded',...v.limitations]){let exists=false;for(const y of ordered)if(x===y)exists=true;if(!exists)ordered.push(x);}
  if(drops){let exists=false;for(const y of ordered)if(y==='error_details_truncated')exists=true;if(!exists)ordered.push('error_details_truncated');}
  return {v,ordered:{limitations:ordered,errors},base:{limitations:sort(p.limitations),errors:p.errors.map(e=>({...e}))},canonical:{limitations:sort(ordered),errors},drops};
}
function fixture(p:P={limitations:['z','a'],errors:[]},mode:'stable'|'unverified'|'changed'='stable',error:string|null=null,version='bp-mcp-review-0.2'){
  const o=oracle(p,mode,error),header=(prefix:P)=>({schema_version:version,collection:{status:'complete'},...structuredClone(prefix)});
  return {kind:'synthetic_pending_prefix_values_v1',model:{schema_version:version,prefix:structuredClone(p)},pins_header:header(o.base),plan_verify:{...o.v,accounting:{requests:0},attempts:0},accepted_header:header(o.canonical)};
}
function reject(raw:unknown,phase?:string){let error:unknown;try{projectSyntheticPendingPrefixValues(raw);}catch(e){error=e;}expect(error).toBeInstanceOf(PendingPrefixValueError);expect(error).toMatchObject({message:'internal_review_error',...(phase?{phase}:{})});return error;}
it('selects exactly six verify fields, compares two prefix lanes, and returns no authority or aliases',()=>{
  const f=fixture(),before=structuredClone(f),r=projectSyntheticPendingPrefixValues(f);
  expect(r).toMatchObject({scope:'synthetic_pending_prefix_values',authority:'none',checked_scope:'prefix_values_only'});
  expect(r.projection.value.base_prefix).toEqual({limitations:['a','z'],errors:[]});
  expect(r.projection.value.ordered_prefix.limitations).toEqual(['z','a','soft_deadline_reached','deadline_exceeded']);
  expect(f).toEqual(before);expect(Object.isFrozen(f.model.prefix)).toBe(false);
  f.model.prefix.limitations[0]='PRIVATE';f.accepted_header.errors.push({stage:'analysis',code:'access_denied'});
  expect(r.projection.value.parent_prefix.limitations).toEqual(['z','a']);expect(Object.isFrozen(r.projection.value.canonical_prefix.errors)).toBe(true);
  for(const key of ['claim','owner','receipt','relation','seal','accepted','pending'])expect(r).not.toHaveProperty(key);
});
it.each(['bp-mcp-review-0.2','bp-mcp-review-0.3'])('matches independent whole-array expectations and boundary rejection for %s',version=>{
  for(const mode of ['stable','unverified','changed'] as const)for(const count of [0,95,96,97,98,99,100,101,102,103])for(const errors of [0,98,99,100])for(const truncated of [false,true]){
    const p={limitations:Array.from({length:count},(_,n)=>`w${count-n}`),errors:Array.from({length:errors},(_,n)=>({stage:n%2?'analysis':'output',code:n%2?'deadline_exceeded':'response_limit',...(n%3?{}:{update_xml_sys_id:n.toString(16).padStart(32,'0')})}))};
    if(truncated&&count)p.limitations[0]='error_details_truncated';
    const error=mode==='changed'?'metadata_unavailable':null,o=oracle(p,mode,error),f=fixture(p,mode,error,version);
    if(count>100||o.ordered.limitations.length>100){reject(f,o.ordered.limitations.length>103?'input':'delta');continue;}
    const r=projectSyntheticPendingPrefixValues(f);expect(r.projection.value.base_prefix).toEqual(o.base);expect(r.projection.value.ordered_prefix).toEqual(o.ordered);expect(r.projection.value.canonical_prefix).toEqual(o.canonical);expect(r.projection.value.stats.dropped_errors).toBe(o.drops);
  }
});
it.each(['model_version','header_version','collection','base_order','accepted_order','base_error','error_order','error_dedup','extra_error_field','optional_id','missing_id','seed_header'] as const)('rejects the seeded %s mismatch without sort/dedup rescue',kind=>{
  const p={limitations:['z','a'],errors:[{stage:'output',code:'response_limit'},{stage:'analysis',code:'deadline_exceeded'},{stage:'output',code:'response_limit',update_xml_sys_id:'1'.repeat(32)}]},f=fixture(p);
  if(kind==='model_version')f.model.schema_version='bp-mcp-review-0.3';if(kind==='header_version')f.accepted_header.schema_version='bp-mcp-review-0.3';if(kind==='collection')f.accepted_header.collection.status='failed';
  if(kind==='base_order')f.pins_header.limitations.reverse();if(kind==='accepted_order')f.accepted_header.limitations.reverse();if(kind==='base_error')f.pins_header.errors[0].code='deadline_exceeded';
  if(kind==='error_order')f.accepted_header.errors.reverse();if(kind==='error_dedup')f.accepted_header.errors.pop();
  if(kind==='extra_error_field')Object.assign(f.accepted_header.errors[0],{secret:'PRIVATE'});if(kind==='optional_id')f.accepted_header.errors[0].update_xml_sys_id='1'.repeat(32);if(kind==='missing_id')delete f.accepted_header.errors[2].update_xml_sys_id;
  if(kind==='seed_header')f.accepted_header=structuredClone(f.pins_header);
  reject(f,kind.startsWith('base')||kind==='model_version'?'base':'accepted');
});
it('does not use JSON property order and preserves Unicode code units and duplicate errors',()=>{
  const p={limitations:['é','e\u0301','\ue000','\ud800\udc00','a','A'],errors:[{stage:'analysis',code:'deadline_exceeded'},{stage:'analysis',code:'deadline_exceeded'}]},f=fixture(p);
  f.accepted_header.errors=f.accepted_header.errors.map(e=>({code:e.code,stage:e.stage}));
  expect(projectSyntheticPendingPrefixValues(f).projection.value.canonical_prefix).toEqual(oracle(p,'stable').canonical);
  f.pins_header.limitations=['A','a','e\u0301','é','\ue000','\ud800\udc00'];reject(f,'base');
});
it.each(['duplicate','long','verify_extra_selected','verify_missing','candidate_wrong_collection'] as const)('preserves PD-A rejection for %s',kind=>{
  const f=fixture();if(kind==='duplicate')f.model.prefix.limitations=['a','a'];if(kind==='long')f.model.prefix.limitations=['x'.repeat(201)];
  if(kind==='verify_extra_selected')f.plan_verify.errors=['PRIVATE'];if(kind==='verify_missing')delete (f.plan_verify as Record<string,unknown>).stage;
  if(kind==='candidate_wrong_collection'){
    f.model.schema_version=f.pins_header.schema_version=f.accepted_header.schema_version='bp-mcp-review-0.3';f.pins_header.collection.status=f.accepted_header.collection.status='failed';
    f.plan_verify={...f.plan_verify,verify_required:true,consistency:'unverified',verify_error:'candidate_filter_violation',limitations:['provisional_results','consistency_unverified'],errors:['candidate_filter_violation']};
  }
  reject(f,kind==='verify_missing'?'input':'delta');
});
it('never invokes accessors or proxies, including ignored full-header/verify ancillary fields',()=>{
  let calls=0;const touch=()=>{calls++;throw Error('PRIVATE');},proxy=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  const good=fixture();Object.defineProperty(good.plan_verify,'accounting',{get:touch});Object.defineProperty(good.pins_header,'principal',{get:touch});
  expect(projectSyntheticPendingPrefixValues(good).authority).toBe('none');
  for(const v of [proxy,{...fixture(),model:proxy},{...fixture(),plan_verify:proxy},Object.defineProperty(fixture(),'accepted_header',{get:touch}),
    {...fixture(),accepted_header:{...fixture().accepted_header,errors:[Object.defineProperty({},'stage',{get:touch,enumerable:true})]}}])reject(v);
  expect(calls).toBe(0);
});
it.each(['extra','missing','model_extra','sparse','array_property','cycle','depth','keys','characters','array104'] as const)('bounds and rejects %s input',kind=>{
  const f=fixture();if(kind==='extra')Object.assign(f,{relation:{}});if(kind==='missing')delete (f as Record<string,unknown>).pins_header;if(kind==='model_extra')Object.assign(f.model,{trace:[]});
  if(kind==='sparse')delete f.accepted_header.limitations[0];if(kind==='array_property')Object.assign(f.accepted_header.limitations,{extra:true});
  if(kind==='cycle')Object.assign(f.model.prefix,{cycle:f});if(kind==='depth'){let x:unknown=null;for(let n=0;n<8;n++)x={x};Object.assign(f.model.prefix,{deep:x});}
  if(kind==='keys')for(let n=0;n<9;n++)Object.assign(f.model.prefix,{['k'+n]:null});
  if(kind==='characters')f.accepted_header.limitations=['x'.repeat(650001)];if(kind==='array104')f.accepted_header.limitations=Array(104).fill('x');reject(f);
});
it('has fixed failure metadata and no source data, raw cause, or executable result',()=>{
  const f=fixture();f.accepted_header.errors[0].code='PRIVATE';const e=reject(f,'accepted');
  expect(JSON.stringify(e)).not.toContain('PRIVATE');expect(e).not.toHaveProperty('cause');expect(e).not.toHaveProperty('input');
  expect(()=>projectSyntheticPendingPrefixValues(fixture(),{})).toThrow('internal_review_error');
});
it('keeps the 200/201 character eligibility and shared snapshot node/character caps finite',()=>{
  const at=fixture({limitations:['x'.repeat(200)],errors:[]});expect(projectSyntheticPendingPrefixValues(at).authority).toBe('none');
  reject(fixture({limitations:['x'.repeat(201)],errors:[]}),'delta');
  function tree(d:number):unknown{return d?Object.fromEntries(Array.from({length:8},(_,n)=>['k'+n,tree(d-1)])):null;}
  const wide=fixture();Object.assign(wide.model.prefix,{extra:tree(4)});expect(reject(wide,'input')).toMatchObject({reason:'limit'});
  const large=fixture();large.model.prefix.limitations=Array(100).fill('x'.repeat(2200));large.pins_header.limitations=Array(100).fill('x'.repeat(2200));large.accepted_header.limitations=Array(100).fill('x'.repeat(2200));
  expect(reject(large,'input')).toMatchObject({reason:'limit'});
});
it('retains candidate-filter version/status/optional-id restrictions in selected values',()=>{
  const p={limitations:[],errors:[{stage:'metadata',code:'candidate_filter_violation'}]},f=fixture(p,'stable',null,'bp-mcp-review-0.3');
  f.pins_header.collection.status=f.accepted_header.collection.status='failed';
  expect(projectSyntheticPendingPrefixValues(f).projection.collection_status).toBe('failed');
  f.model.schema_version=f.pins_header.schema_version=f.accepted_header.schema_version='bp-mcp-review-0.2';reject(f,'delta');
  f.model.schema_version=f.pins_header.schema_version=f.accepted_header.schema_version='bp-mcp-review-0.3';
  Object.assign(f.model.prefix.errors[0],{update_xml_sys_id:'1'.repeat(32)});reject(f,'delta');
});
it('retains the PD-A eligibility phase and does not claim full-header or origin validation',()=>{
  const duplicate=fixture();duplicate.model.prefix.limitations=['a','a'];
  expect(reject(duplicate,'delta')).toMatchObject({reason:'binding',delta_phase:'eligibility'});
  const f=fixture();Object.assign(f.pins_header,{target:'not-validated'});Object.assign(f.accepted_header,{target:'different-not-validated'});
  const r=projectSyntheticPendingPrefixValues(f);expect(r.unverified).toContain('full_header');expect(r.unverified).toContain('accepted_origin');
});
