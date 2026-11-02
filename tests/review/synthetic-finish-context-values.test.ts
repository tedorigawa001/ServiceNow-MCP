import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
import {projectSyntheticFinishValues,compareSyntheticFinishValues,type SyntheticFinishContextEvidence} from '../support/review/synthetic-finish-context-values.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function write(raw:unknown,path:string,value:unknown){const keys=path.split('.');let p=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))p=p[k] as Record<string,unknown>;p[keys.at(-1)!]=value;}
function remove(raw:unknown,path:string){const keys=path.split('.');let p=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))p=p[k] as Record<string,unknown>;delete p[keys.at(-1)!];}
function rejects(run:()=>unknown,reason?:string){try{run();throw Error('Expected rejection');}catch(error){expect(error).toMatchObject({code:'internal_review_error',...(reason?{reason}:{})});expect(String(error)).not.toContain('SECRET');}}
function fixture(){
  const owner={},source={},lifecycle={},frame={supervisor:{},worker:{},generation:{}},receipt={};
  const release={source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'};
  return {kind:'synthetic_finish_context_v1',owner,plan:{},source_lifecycle:lifecycle,
    run_context:{run:{},session:{},source,key:{},origin:{},budget:{},release:{},window:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
    header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:release,release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
    selected:[id(1)],inputs:[{receipt,update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}],
    route:{owner,frame,ready_origin:{},cleanup_origin:{lifecycle:{},frame,sink:{},start_serial:0},source_origin:{source,lifecycle}},
  };
}
it('projects strict synthetic values as immutable data, never FinishContextEvidence',()=>{
  const raw=fixture(),p=projectSyntheticFinishValues(raw);expect(p).toMatchObject({scope:'synthetic_finish_values',authority:'none',value:{selected:[id(1)],run_context:{upper_utc:U},header:{release_match:'matched'}}});
  expect(Object.isFrozen(p.value)).toBe(true);expect(Object.isFrozen(p.value.header)).toBe(true);expect(p.value.inputs[0].receipt).toBe(raw.inputs[0].receipt);
  const cannotBeEvidence:ReturnType<typeof projectSyntheticFinishValues> extends SyntheticFinishContextEvidence?true:false=false;expect(cannotBeEvidence).toBe(false);
});
it('rejects a retained input above U rather than lowering or replacing its time',()=>{
  const raw=fixture();raw.run_context.upper_utc=O;expect(()=>projectSyntheticFinishValues(raw)).toThrow('internal_review_error');
});
it('compares values and raw identity references without issuing an owner or evidence',()=>{
  const raw=fixture();expect(compareSyntheticFinishValues(raw,{...raw,header:{...raw.header}})).toMatchObject({scope:'synthetic_finish_comparison',authority:'none',matches:true});
  expect(()=>compareSyntheticFinishValues(raw,fixture())).toThrow('internal_review_error');
});
function reviewed(){
  const raw=fixture(),receipt={},accepted={};raw.selected.push(id(2));raw.header.collection.selected=raw.header.collection.metadata_seen=2;
  const expected={record_updated_at:S,instance_binding:raw.header.target.instance_binding,instance_release:{...raw.header.instance_release},requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};
  write(raw,'inputs',[{receipt,update_xml_sys_id:id(2),retrieved_at:O,state:'completed',expected_context:expected},...raw.inputs]);
  write(raw,'outcomes',[...raw.outcomes,{state:'reviewed',update_xml_sys_id:id(2),receipt,accepted_outcome:accepted}]);return raw;
}
function many(n:number){
  const raw=fixture();raw.selected=Array.from({length:n},(_,i)=>id(i+1));raw.header.collection.selected=raw.header.collection.metadata_seen=n;
  raw.inputs=raw.selected.map(update_xml_sys_id=>({receipt:{},update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null}));raw.outcomes=raw.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));return raw;
}
it('keeps a reviewed context and opaque outcome reference without reading findings',()=>{
  const raw=reviewed();let calls=0;const ref={};Object.defineProperty(ref,'findings',{get(){calls++;throw Error('SECRET');}});write(raw,'outcomes.1.accepted_outcome',ref);
  const p=projectSyntheticFinishValues(raw);expect(p.value.outcomes[1]).toMatchObject({state:'reviewed'});expect(calls).toBe(0);expect(Object.isFrozen(ref)).toBe(false);
});
it.each(['kind','owner','plan','source_lifecycle','run_context','header','selected','inputs','outcomes','route'])('rejects missing top-level %s',key=>{const raw=fixture();remove(raw,key);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['schema_version','target','versions','started_at','instance_release','release_match','principal','collection','coverage','limits','limitations','errors'])('rejects missing header %s',key=>{const raw=fixture();remove(raw,'header.'+key);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['receipt','update_xml_sys_id','retrieved_at','state','expected_context'])('rejects missing input %s including explicit-null context',key=>{const raw=fixture();remove(raw,'inputs.0.'+key);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['','header','run_context','inputs.0','outcomes.0','route','route.frame','route.cleanup_origin','route.source_origin'])('rejects extra data at %s',path=>{const raw=fixture();write(raw,path?path+'.extra':'extra',true);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['header.ended_at','header.status','header.assets','header.counts','header.poc_only','header.code_return_mode'])('does not accept a finish/output field %s as header proof',path=>{const raw=fixture();write(raw,path,path.endsWith('poc_only')?true:'SECRET');rejects(()=>projectSyntheticFinishValues(raw));});
it.each([
  ['kind','wrong'],['header.schema_version','bp-mcp-review-0.4'],['header.target.target_version','current_record'],['header.release_match','unknown'],['header.principal.auth_mode','admin'],['header.coverage.analysis_complete',true],['header.limits.deadline_ms',1000],['header.collection.status','not_started'],['inputs.0.state','retained'],['outcomes.0.state','completed'],['outcomes.0.reason','upstream_unavailable'],['route.cleanup_origin.start_serial',1],['route.cleanup_origin.start_serial',-1],['route.cleanup_origin.start_serial',0.5],['header.coverage.requested_rule_ids',['AU-BR-006']],['header.selection',{}],
] as const)('rejects invalid value/variant %s',(path,value)=>{const raw=fixture();write(raw,path,value);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['kind','header.schema_version','header.target.target_version','header.release_match','header.principal.auth_mode','header.coverage.analysis_complete','header.limits.deadline_ms','route.cleanup_origin.start_serial'])('positive field-write control for %s',path=>{
  const raw=fixture();const value=path.split('.').reduce<unknown>((p,k)=>(p as Record<string,unknown>)[k],raw);write(raw,path,value);expect(projectSyntheticFinishValues(raw).authority).toBe('none');
});
it.each(['route.owner','route.cleanup_origin.frame','route.source_origin.source','route.source_origin.lifecycle'])('refuses incoherent same-snapshot reference %s',path=>{const raw=fixture();write(raw,path,{});rejects(()=>projectSyntheticFinishValues(raw),'mismatch');});
it.each([0,1,100,101])('bounds the whole selected/input/outcome set at %i',n=>{const raw=many(n);if(n===0||n===101)rejects(()=>projectSyntheticFinishValues(raw));else expect(projectSyntheticFinishValues(raw).value.selected).toHaveLength(n);});
it.each(['duplicate_id','duplicate_receipt','foreign_id','missing_outcome','extra_outcome','wrong_order','completed_pending','no_unfinished','time_before_o','time_after_u','u_not_max','time_reversal'] as const)('rejects set/receipt/time mismatch %s',kind=>{
  const raw=reviewed();if(kind==='duplicate_id')raw.selected[1]=raw.selected[0];if(kind==='duplicate_receipt')raw.inputs[0].receipt=raw.inputs[1].receipt;if(kind==='foreign_id')raw.inputs[0].update_xml_sys_id=id(99);if(kind==='missing_outcome')raw.outcomes.pop();if(kind==='extra_outcome')raw.outcomes.push({...raw.outcomes[0]});if(kind==='wrong_order')raw.outcomes.reverse();if(kind==='completed_pending')raw.inputs[1].state='completed';
  if(kind==='no_unfinished'){write(raw,'inputs.1.state','completed');write(raw,'outcomes.0',{state:'rejected',update_xml_sys_id:id(1),reason:'invalid_xml'});}
  if(kind==='time_before_o')raw.inputs[0].retrieved_at=S;if(kind==='time_after_u')raw.inputs[1].retrieved_at='2026-11-02T00:00:03.000Z';if(kind==='u_not_max')raw.inputs[1].retrieved_at=O;if(kind==='time_reversal'){raw.inputs[0].retrieved_at=U;raw.inputs[1].retrieved_at=O;}
  rejects(()=>projectSyntheticFinishValues(raw),'mismatch');
});
it.each(['inputs.0.expected_context','outcomes.1.accepted_outcome','outcomes.1.receipt'])('rejects missing reviewed prerequisite %s',path=>{const raw=reviewed();write(raw,path,null);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['instance_binding','instance_release','requested_rule_ids','release_limitations','record_updated_at'])('strictly requires reviewed context %s',key=>{const raw=reviewed();remove(raw,'inputs.0.expected_context.'+key);rejects(()=>projectSyntheticFinishValues(raw));});
it.each([false,true])('accepts explicit omitted origin %s without minting it',origin=>{
  const raw=reviewed(),receipt=raw.inputs[0].receipt,accepted={};write(raw,'outcomes.1',{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit',reviewed_origin:origin?{receipt,accepted_outcome:accepted}:null});
  expect(projectSyntheticFinishValues(raw).value.outcomes[1]).toMatchObject({state:'result_omitted'});
});
it.each(['missing','undefined','wrong_reason','foreign_receipt','no_context','extra_origin','no_input'])('rejects invalid omitted variant %s',kind=>{
  const raw=reviewed();write(raw,'outcomes.1',{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit',reviewed_origin:{receipt:raw.inputs[0].receipt,accepted_outcome:{}}});
  if(kind==='missing')remove(raw,'outcomes.1.reviewed_origin');if(kind==='undefined')write(raw,'outcomes.1.reviewed_origin',undefined);if(kind==='wrong_reason')write(raw,'outcomes.1.reason','deadline_exceeded');if(kind==='foreign_receipt')write(raw,'outcomes.1.reviewed_origin.receipt',{});if(kind==='no_context')write(raw,'inputs.0.expected_context',null);if(kind==='extra_origin')write(raw,'outcomes.1.reviewed_origin.extra',true);if(kind==='no_input')raw.inputs.shift();
  rejects(()=>projectSyntheticFinishValues(raw));
});
it.each(['owner','plan','run','session','source','key','origin','budget','release','window','receipt','ready','frame','result'] as const)('rejects changed reference %s against expected values',key=>{
  const expected=reviewed();const raw={...expected,run_context:{...expected.run_context},route:{...expected.route},inputs:expected.inputs.map(i=>({...i})),outcomes:expected.outcomes.map(i=>({...i}))};
  if(key==='owner'){raw.owner={};raw.route.owner=raw.owner;}else if(key==='plan')raw.plan={};else if(key==='receipt'){raw.inputs[0].receipt={};write(raw,'outcomes.1.receipt',raw.inputs[0].receipt);}else if(key==='ready')raw.route.ready_origin={};else if(key==='frame'){raw.route.frame={...expected.route.frame};raw.route.cleanup_origin={...expected.route.cleanup_origin,frame:raw.route.frame};}else if(key==='result')write(raw,'outcomes.1.accepted_outcome',{});else{write(raw,'run_context.'+key,{});if(key==='source')raw.route.source_origin={...expected.route.source_origin,source:raw.run_context.source};}
  rejects(()=>compareSyntheticFinishValues(raw,expected),'mismatch');
});
it('does not upgrade matching values to live ready/source/receipt or issuance evidence',()=>{
  const raw=fixture(),result=compareSyntheticFinishValues(raw,raw);expect(Object.keys(result).sort()).toEqual(['authority','matches','scope','usage']);expect(result.authority).toBe('none');expect(Object.isFrozen(result)).toBe(true);
});
function v3(){const raw=fixture();raw.header.schema_version='bp-mcp-review-0.3';write(raw,'header.selection',{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}});write(raw,'header.coverage',{...raw.header.coverage,analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false});raw.header.limitations.push(...TARGET_LIMITATIONS);return raw;}
it('accepts the strict 0.3 header subset without claiming full aggregate validation',()=>{expect(projectSyntheticFinishValues(v3()).value.header.schema_version).toBe('bp-mcp-review-0.3');});
it.each(['selection','coverage.analysis_scope','coverage.candidate_inventory_complete','coverage.update_set_inventory_complete'])('requires 0.3 field %s',path=>{const raw=v3();remove(raw,'header.'+path);rejects(()=>projectSyntheticFinishValues(raw));});
it.each(['type','filter','scope','order','excluded','inventory','limitation','error_stage','deleted'])('rejects inconsistent 0.3 %s',kind=>{
  const raw=v3();if(kind==='type')write(raw,'header.selection.requested_asset_types',['client_script']);if(kind==='filter')write(raw,'header.selection.filter_version','wrong');if(kind==='scope')write(raw,'header.selection.action_scope','all');if(kind==='order')write(raw,'header.selection.order','name');if(kind==='excluded')write(raw,'header.selection.excluded_counts.unsupported_assets',0);if(kind==='inventory')write(raw,'header.coverage.candidate_inventory_complete',true);if(kind==='limitation')raw.header.limitations=[];if(kind==='error_stage')write(raw,'header.errors',[{stage:'input',code:'candidate_filter_violation'}]);if(kind==='deleted')write(raw,'outcomes.0',{state:'skipped_deleted',update_xml_sys_id:id(1),reason:'deleted_asset'});rejects(()=>projectSyntheticFinishValues(raw));
});
function configured(expires_at:string){const raw=fixture();write(raw,'header.instance_release',{source:'operator_config',resolution_status:'asserted',family:'Australia',visibility_scope:'operator_configured',instance_binding:raw.header.target.instance_binding,config_version:'e'.repeat(64),asserted_at:S,expires_at});raw.header.limitations=['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable'];return raw;}
it.each([['2026-11-02T00:00:59.999Z',false],['2026-11-02T00:01:00.000Z',false],['2026-11-02T00:01:00.001Z',true]] as const)('independent strict config deadline boundary %s => %s',(expiry,ok)=>{const raw=configured(expiry);if(ok)expect(projectSyntheticFinishValues(raw).authority).toBe('none');else rejects(()=>projectSyntheticFinishValues(raw),'mismatch');});
it.each(['binding','future_assertion','warning'])('rejects configured release %s',kind=>{const raw=configured('2026-11-02T00:02:00.000Z');if(kind==='binding')write(raw,'header.instance_release.instance_binding','f'.repeat(64));if(kind==='future_assertion')write(raw,'header.instance_release.asserted_at',O);if(kind==='warning')raw.header.limitations.pop();rejects(()=>projectSyntheticFinishValues(raw),'mismatch');});
it('never shortens config expiry validity to the effective deadline',()=>{const raw=configured('2026-11-02T00:00:04.000Z');raw.run_context.deadline_ms=3000;rejects(()=>projectSyntheticFinishValues(raw),'mismatch');});
it('leaves header observation versus future E to RD-B rather than sampling a clock',()=>{const raw=fixture();raw.header.instance_release.observed_at='2026-11-02T00:00:03.000Z';expect(projectSyntheticFinishValues(raw).authority).toBe('none');});
it.each(['time','binding','release','rules','limits','duplicate_rule'])('rejects reviewed expected-context %s mismatch',kind=>{
  const raw=reviewed();if(kind==='time')write(raw,'inputs.0.expected_context.instance_release.observed_at',U);if(kind==='binding')write(raw,'inputs.0.expected_context.instance_binding','e'.repeat(64));if(kind==='release')write(raw,'inputs.0.expected_context.instance_release.raw_buildname','Utah');if(kind==='rules')write(raw,'inputs.0.expected_context.requested_rule_ids',['AU-BR-002']);if(kind==='limits')write(raw,'inputs.0.expected_context.release_limitations',[]);if(kind==='duplicate_rule')write(raw,'inputs.0.expected_context.requested_rule_ids',['AU-BR-001','AU-BR-001']);rejects(()=>projectSyntheticFinishValues(raw),'mismatch');
});
it.each(['null','string','function','proxy'])('rejects invalid opaque reference %s without dereference',kind=>{const raw=fixture();let n=0;const ref=kind==='null'?null:kind==='string'?'SECRET':kind==='function'?()=>{n++;}:new Proxy({},{get(){n++;throw Error('SECRET');}});write(raw,'plan',ref);rejects(()=>projectSyntheticFinishValues(raw));expect(n).toBe(0);});
it.each(['getter','setter','proxy','symbol','sparse','array_extra','cycle','function','nan','infinity'])('rejects hostile data %s without raw errors',kind=>{
  const raw=fixture();let calls=0;let input:unknown=raw;
  if(kind==='getter')Object.defineProperty(raw.header,'limitations',{get(){calls++;throw Error('SECRET');}});if(kind==='setter')Object.defineProperty(raw.header,'limitations',{set(){calls++;}});
  if(kind==='proxy')input=new Proxy(raw,{get(){calls++;throw Error('SECRET');}});if(kind==='symbol')Object.defineProperty(raw,Symbol('SECRET'),{value:true});if(kind==='sparse')delete (raw.selected as unknown[])[0];if(kind==='array_extra')Object.assign(raw.selected,{extra:true});if(kind==='cycle')write(raw,'header.extra',raw);if(kind==='function')write(raw,'header.extra',()=>{calls++;});if(kind==='nan')write(raw,'header.collection.metadata_seen',NaN);if(kind==='infinity')write(raw,'header.collection.metadata_seen',Infinity);
  rejects(()=>projectSyntheticFinishValues(input));expect(calls).toBe(0);
});
it('ignores even cyclic/getter-bearing opaque references and never invokes toJSON',()=>{
  const raw=fixture();let n=0;const ref:{self?:object}={};ref.self=ref;Object.defineProperty(ref,'toJSON',{get(){n++;throw Error('SECRET');}});raw.plan=ref;expect(projectSyntheticFinishValues(raw).value.plan).toBe(ref);expect(compareSyntheticFinishValues(raw,raw).matches).toBe(true);expect(n).toBe(0);
});
// Independent character oracle for these fixed fixtures: all opaque leaves are empty;
// only cleanup.frame aliases a nonempty data object and is deliberately not copied.
function fixtureChars(v:unknown,path=''):number{
  if(path==='route.cleanup_origin.frame')return 0;if(typeof v==='string')return v.length;if(!v||typeof v!=='object')return 0;
  if(Array.isArray(v))return v.reduce((sum,x,i)=>sum+fixtureChars(x,path+'.'+i),0);
  return Object.entries(v).reduce((sum,[key,x])=>sum+key.length+fixtureChars(x,path?path+'.'+key:key),0);
}
function fixtureNodes(v:unknown,path=''):number{
  if(path==='route.cleanup_origin.frame'||!v||typeof v!=='object')return 1;
  if(Array.isArray(v))return 1+v.reduce((sum,x,i)=>sum+fixtureNodes(x,path+'.'+i),0);
  return 1+Object.entries(v).reduce((sum,[key,x])=>sum+fixtureNodes(x,path?path+'.'+key:key),0);
}
function longTimestamp(){const raw=reviewed();const before=fixtureChars(raw),prefix='2026-11-02T00:00:00.',length=87381-(before-S.length);write(raw,'inputs.0.expected_context.record_updated_at',prefix+'0'.repeat(length-prefix.length-1)+'Z');return raw;}
it('accepts the largest representable character charge below 262144, then refuses one more character',()=>{
  const raw=longTimestamp();expect(fixtureChars(raw)).toBe(87381);expect(projectSyntheticFinishValues(raw).usage.character_units).toBe(262143);
  const old=(raw.inputs[0] as unknown as {expected_context:{record_updated_at:string}}).expected_context.record_updated_at;write(raw,'inputs.0.expected_context.record_updated_at',old.slice(0,-1)+'0Z');expect(fixtureChars(raw)).toBe(87382);rejects(()=>projectSyntheticFinishValues(raw),'limit');
});
it('uses one collection budget across comparison operands rather than resetting per side',()=>{const raw=longTimestamp();projectSyntheticFinishValues(raw);rejects(()=>compareSyntheticFinishValues(raw,raw),'limit');});
it('charges repeated nonopaque aliases across all records and stops above the node cap',()=>{
  const raw=many(100),ex={record_updated_at:S,instance_binding:raw.header.target.instance_binding,instance_release:{...raw.header.instance_release},requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only',...Array.from({length:99},(_,i)=>String.fromCharCode(33+i))]};raw.header.limitations=ex.release_limitations;
  for(const i of raw.inputs)write(i,'expected_context',ex);expect(fixtureNodes(raw)).toBeGreaterThan(10000);expect(fixtureChars(raw)*3).toBeLessThan(262144);rejects(()=>projectSyntheticFinishValues(raw),'limit');
});
it.each([8,9])('bounds collection depth before shape validation at %i',depth=>{
  const raw=fixture();let nested:unknown=null;for(let i=0;i<depth-1;i++)nested={x:nested};write(raw,'extra',nested);rejects(()=>projectSyntheticFinishValues(raw),depth===8?'shape':'limit');
});
it.each([30,31])('bounds object field count at %i',count=>{const raw=fixture();for(let i=Object.keys(raw).length;i<count;i++)write(raw,'x'+i,true);rejects(()=>projectSyntheticFinishValues(raw),count===30?'shape':'limit');});
it('keeps projection data stable after caller-side metadata mutation without freezing opaque objects',()=>{
  const raw=reviewed(),p=projectSyntheticFinishValues(raw);raw.header.collection.selected=99;raw.selected.pop();raw.inputs[0].retrieved_at=S;raw.route.frame.worker={};expect(p.value.selected).toHaveLength(2);expect(p.value.header.collection.selected).toBe(2);expect(p.value.inputs[0].retrieved_at).toBe(O);expect(Object.isFrozen(raw.owner)).toBe(false);
});
it.each(['prototype','sparse','array_extra'])('distinguishes invalid %s shape from resource exhaustion',kind=>{
  const raw=fixture();if(kind==='prototype')Object.setPrototypeOf(raw.header,{inherited:true});if(kind==='sparse')delete (raw.selected as unknown[])[0];if(kind==='array_extra')Object.assign(raw.selected,{extra:true});rejects(()=>projectSyntheticFinishValues(raw),'shape');
});
function changed(raw:unknown,path:string,value:unknown):unknown{
  const [key,...rest]=path.split('.');const copy=Array.isArray(raw)?[...raw]:{...(raw as Record<string,unknown>)};const target=copy as Record<string,unknown>;
  target[key]=rest.length?changed((raw as Record<string,unknown>)[key],rest.join('.'),value):value;return copy;
}
it.each([
  ['header.target.update_set_sys_id',id(99)],['header.principal.auth_mode','service-account'],['header.collection.status','failed'],['header.limits.max_records',1],['run_context.deadline_ms',50000],['header.instance_release.observed_at',S],['header.errors',[{stage:'analysis',code:'deadline_exceeded'}]],['header.limitations',['release_visible_nodes_only','extra']],
] as const)('compares valid nonidentity field %s against the pinned value',(path,value)=>{
  const expected=fixture(),raw=changed(expected,path,value);projectSyntheticFinishValues(raw);rejects(()=>compareSyntheticFinishValues(raw,expected),'mismatch');
});
it('does not accept a self-consistent lower U in place of the expected retained input time',()=>{
  const expected=fixture(),raw=changed(changed(expected,'inputs.0.retrieved_at',O),'run_context.upper_utc',O);projectSyntheticFinishValues(raw);rejects(()=>compareSyntheticFinishValues(raw,expected),'mismatch');
});
it('normalizes rule/limitation sets but never canonicalizes a changed selected order',()=>{
  const raw=fixture();raw.header.coverage.requested_rule_ids=['AU-BR-001','AU-BR-002'];raw.header.limitations.push('extra');
  const other=changed(changed(raw,'header.coverage.requested_rule_ids',['AU-BR-002','AU-BR-001']),'header.limitations',[...raw.header.limitations].reverse());expect(compareSyntheticFinishValues(raw,other).matches).toBe(true);
  const manyRows=many(2),reversed=changed(changed(manyRows,'selected',[...manyRows.selected].reverse()),'outcomes',[...manyRows.outcomes].reverse());projectSyntheticFinishValues(reversed);rejects(()=>compareSyntheticFinishValues(reversed,manyRows),'mismatch');
});
it('compares a consistent truncated collection against the pinned untruncated value',()=>{
  const expected=fixture(),raw=changed(changed(changed(expected,'header.limits.max_records',1),'header.collection.metadata_seen',2),'header.collection.truncated',true);
  projectSyntheticFinishValues(raw);rejects(()=>compareSyntheticFinishValues(raw,expected),'mismatch');
});
// Header/run semantics: each case isolates one check in semantics().
it.each([
  ['O before S',(r:ReturnType<typeof fixture>)=>{r.run_context.observed_at='2026-11-01T23:59:59.999Z';}],
  ['U beyond S+L',(r:ReturnType<typeof fixture>)=>{r.run_context.deadline_ms=1000;}],
  ['header start differs from run S',(r:ReturnType<typeof fixture>)=>{r.header.started_at=O;}],
  ['collection.selected differs from the selected set',(r:ReturnType<typeof fixture>)=>{r.header.collection.selected=2;r.header.collection.metadata_seen=2;}],
  ['metadata_seen above max_records+1',(r:ReturnType<typeof fixture>)=>{r.header.limits.max_records=1;r.header.collection.metadata_seen=3;r.header.collection.truncated=true;}],
  ['selected not min(metadata_seen,max_records)',(r:ReturnType<typeof fixture>)=>{r.header.collection.metadata_seen=5;}],
  ['truncated inconsistent with metadata_seen',(r:ReturnType<typeof fixture>)=>{r.header.collection.truncated=true;}],
  ['duplicate requested rule',(r:ReturnType<typeof fixture>)=>{r.header.coverage.requested_rule_ids=['AU-BR-001','AU-BR-001'];}],
  ['duplicate limitation',(r:ReturnType<typeof fixture>)=>{r.header.limitations=['release_visible_nodes_only','release_visible_nodes_only'];}],
  ['ruleset not derived from rules',(r:ReturnType<typeof fixture>)=>{r.header.versions.ruleset='bp3-0.5';}],
  ['nonempty skipped rules',(r:ReturnType<typeof fixture>)=>{r.header.coverage.skipped_rules=[{rule_id:'AU-BR-001',reason:'release_mismatch'}] as never[];}],
] as const)('rejects header/run semantic mismatch: %s',(_name,change)=>{const raw=fixture();change(raw);rejects(()=>projectSyntheticFinishValues(raw),'mismatch');});
it('rejects reviewed expected limitations outside the header set',()=>{
  const raw=reviewed();write(raw,'inputs.0.expected_context.release_limitations',['release_visible_nodes_only','extra']);rejects(()=>projectSyntheticFinishValues(raw),'mismatch');
});
function twoReviewed(){
  const raw=reviewed(),receipt={};raw.selected.push(id(3));raw.header.collection.selected=raw.header.collection.metadata_seen=3;
  const ex=(raw.inputs[0] as {expected_context:unknown}).expected_context;
  raw.inputs.splice(1,0,{receipt,update_xml_sys_id:id(3),retrieved_at:O,state:'completed',expected_context:ex} as never);
  raw.outcomes.push({state:'reviewed',update_xml_sys_id:id(3),receipt,accepted_outcome:{}} as never);return raw;
}
it('accepts two reviewed rows with distinct accepted outcomes (positive control)',()=>{expect(projectSyntheticFinishValues(twoReviewed()).value.outcomes).toHaveLength(3);});
it('rejects one accepted outcome reused by two reviewed rows',()=>{
  const raw=twoReviewed();write(raw,'outcomes.2.accepted_outcome',(raw.outcomes[1] as {accepted_outcome:object}).accepted_outcome);rejects(()=>projectSyntheticFinishValues(raw),'mismatch');
});
it('rejects an omitted reviewed origin reusing another row accepted outcome',()=>{
  const raw=twoReviewed(),shared=(raw.outcomes[1] as {accepted_outcome:object}).accepted_outcome;
  write(raw,'outcomes.2',{state:'result_omitted',update_xml_sys_id:id(3),reason:'response_limit',reviewed_origin:{receipt:(raw.inputs[1] as {receipt:object}).receipt,accepted_outcome:shared}});rejects(()=>projectSyntheticFinishValues(raw),'mismatch');
});
it('rejects a result_omitted row without a completed input',()=>{
  const raw=reviewed();raw.inputs.shift();write(raw,'outcomes.1',{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit',reviewed_origin:null});rejects(()=>projectSyntheticFinishValues(raw),'mismatch');
});
it('classifies a cycle as shape and an oversized array as limit',()=>{
  const raw=fixture();write(raw,'header.extra',raw);rejects(()=>projectSyntheticFinishValues(raw),'shape');rejects(()=>projectSyntheticFinishValues(many(101)),'limit');
});
