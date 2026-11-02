import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {compareRecoveryFinishValues,projectRecoveryFinishExpectation,projectRecoveryFinishReply,RecoveryFinishValueError} from '../support/review/synthetic-recovery-finish-values.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',T='2026-11-02T00:00:02.000Z',E='2026-11-02T00:00:04.000Z';
const id=(n:number)=>n.toString(16).padStart(32,'0');
const header=()=>({schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]});
function pair(){
  const content={original_body:'unknown',full_schema:'unverified',wire:'unverified'};
  const a={kind:'synthetic_recovery_finish_expectation_v1',binding:{owner:{},plan:{},run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},window:{},frame:{supervisor:{},worker:{},generation:{}},accepted_origin:{}},time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:T},header:header(),selected:[id(1)],inputs:[{receipt:{},update_xml_sys_id:id(1),retrieved_at:T,state:'not_processed',expected_context:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}],run_status:'partial',consistency:'unverified',content_evidence:content};
  const b={kind:'synthetic_recovery_finish_reply_v1',header:header(),ended_at:E,run_status:'partial',consistency:'unverified',assets:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}],content_evidence:content};
  return {a,b};
}
function set(raw:unknown,path:string,value:unknown){const keys=path.split('.');let o=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))o=o[k] as Record<string,unknown>;o[keys.at(-1)!]=value;}
function rejects(a:unknown,b:unknown,reason:'shape'|'limit'|'mismatch'='mismatch'){
  let error:unknown;try{compareRecoveryFinishValues(a,b);}catch(e){error=e;}
  expect(error).toBeInstanceOf(RecoveryFinishValueError);expect(error).toMatchObject({message:'internal_review_error',code:'internal_review_error',reason});
}
it('rejects E before the retained upper UTC rather than replacing it with a fresh clock',()=>{
  const {a,b}=pair();b.ended_at=O;rejects(a,b);
});
it('returns only a frozen non-executable local comparison with explicit unknown content',()=>{
  const {a,b}=pair(),check=compareRecoveryFinishValues(a,b);
  expect(check).toMatchObject({authority:'none',checked_scope:'context_and_manifest_only',matches:true});
  expect(check.unverified).toEqual(['binding_provenance','original_body','full_schema','wire']);expect(Object.isFrozen(check)).toBe(true);
  expect(check).not.toHaveProperty('candidate');expect(check).not.toHaveProperty('value');
});
it('rejects a same-length substitution for the fixed selected ID',()=>{
  const {a,b}=pair();b.assets[0].update_xml_sys_id=id(2);rejects(a,b);
});
it('does not let a reply replace the fixed parent header',()=>{
  const {a,b}=pair();b.header.target.update_set_sys_id=id(11);rejects(a,b);
});
function withReviewed(){
  const p=pair(),{a,b}=p,receipt=a.inputs[0].receipt;
  const context={record_updated_at:S,instance_binding:a.header.target.instance_binding,instance_release:header().instance_release,requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};
  a.selected.push(id(2));a.header.collection.metadata_seen=b.header.collection.metadata_seen=2;a.header.collection.selected=b.header.collection.selected=2;
  const active='2026-11-02T00:00:03.000Z';a.time.upper_utc=active;
  set(a,'inputs',[{receipt,update_xml_sys_id:id(1),retrieved_at:T,state:'completed',expected_context:context},{receipt:{},update_xml_sys_id:id(2),retrieved_at:active,state:'not_processed',expected_context:null}]);
  set(a,'outcomes',[{state:'reviewed',update_xml_sys_id:id(1),receipt,accepted_outcome:{}},{state:'not_processed',update_xml_sys_id:id(2),reason:'deadline_exceeded'}]);
  set(b,'assets',[{state:'reviewed',update_xml_sys_id:id(1),applicable_rule_ids:['AU-BR-001'],result:{reviewed_at:T,target:{update_set_id:id(10),update_xml_sys_id:id(1),target_version:'update_set_payload',retrieved_at:T,record_updated_at:S},instance_binding:context.instance_binding,instance_release:header().instance_release,coverage:{requested_rule_ids:['AU-BR-001']},limitations:['release_visible_nodes_only']}},{state:'not_processed',update_xml_sys_id:id(2),reason:'deadline_exceeded'}]);
  return p;
}
it('keeps active T_i and prior completed T_i distinct while allowing reply set order changes',()=>{
  const {a,b}=withReviewed();b.assets.reverse();expect(compareRecoveryFinishValues(a,b).matches).toBe(true);
});
it.each([
  ['missing',[]],['extra',[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'},{state:'not_processed',update_xml_sys_id:id(2),reason:'deadline_exceeded'}]],
  ['duplicate',[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'},{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]],
])('rejects reply %s rather than filling it from the expectation',(_name,rows)=>{const {a,b}=pair();set(b,'assets',rows);rejects(a,b);});
it.each([
  ['selected',[id(1),id(1)]],['selected',[id(2)]],['time.observed_at','2026-11-01T23:59:59.999Z'],['time.started_at',O],['time.upper_utc',O],['time.deadline_ms',1],
  ['inputs.0.update_xml_sys_id',id(8)],['inputs.0.retrieved_at',S],['inputs.0.retrieved_at',E],['inputs.0.state','completed'],
  ['outcomes.0.update_xml_sys_id',id(2)],['header.collection.selected',2],['header.collection.metadata_seen',2],['header.collection.truncated',true],
  ['header.versions.ruleset','bp3-0.5'],['header.coverage.requested_rule_ids',['AU-BR-001','AU-BR-001']],['header.limitations',['release_visible_nodes_only','release_visible_nodes_only']],
])('rejects independently inconsistent expected %s = %j',(path,value)=>{const {a,b}=pair();set(a,path,value);rejects(a,b);});
it.each([
  ['header.target.instance_binding','e'.repeat(64)],['header.versions.ruleset','bp3-0.5'],['header.started_at',O],['header.instance_release.raw_buildname','other'],
  ['header.coverage.requested_rule_ids',['AU-BR-002']],['header.coverage.requested_rule_ids',['AU-BR-001','AU-BR-001']],['header.limitations',[]],
  ['header.collection.metadata_seen',2],['header.collection.status','failed'],['header.principal.auth_mode','service-account'],
  ['run_status','failed'],['consistency','stable_observation'],
])('rejects independent reply header/status change %s',(path,value)=>{const {a,b}=pair();set(b,path,value);rejects(a,b);});
it.each([
  ['result.reviewed_at',O],['result.target.retrieved_at',E],['result.target.update_set_id',id(11)],['result.target.update_xml_sys_id',id(2)],['result.target.record_updated_at',O],['result.instance_binding','e'.repeat(64)],
  ['applicable_rule_ids',['AU-BR-002']],['applicable_rule_ids',['AU-BR-001','AU-BR-001']],['result.coverage.requested_rule_ids',['AU-BR-002']],['result.coverage.requested_rule_ids',['AU-BR-001','AU-BR-001']],
  ['result.instance_release.raw_buildname','changed'],['result.limitations',[]],
])('rejects reviewed local context replacement %s',(path,value)=>{const {a,b}=withReviewed();set(b,'assets.0.'+path,value);rejects(a,b);});
it.each([
  ['inputs.0.expected_context',null],['inputs.0.expected_context.instance_binding','e'.repeat(64)],['inputs.0.expected_context.requested_rule_ids',['AU-BR-002']],
  ['inputs.0.expected_context.requested_rule_ids',['AU-BR-001','AU-BR-001']],['inputs.0.expected_context.release_limitations',[]],['inputs.0.expected_context.instance_release.raw_buildname','different'],
  ['outcomes.0.receipt',{}],['inputs.0.receipt',{}],['inputs.0.state','not_processed'],['inputs.1.state','completed'],['time.upper_utc',E],
])('rejects reviewed expectation/receipt inconsistency %s',(path,value)=>{const {a,b}=withReviewed();set(a,path,value);rejects(a,b);});
it('rejects duplicate receipt identities, out-of-order T_i and noncanonical selected/outcome order',()=>{
  {const {a,b}=withReviewed();set(a,'inputs.1.receipt',a.inputs[0].receipt);rejects(a,b);}
  {const {a,b}=withReviewed();a.inputs.reverse();rejects(a,b);}
  {const {a,b}=withReviewed();a.selected.reverse();a.outcomes.reverse();rejects(a,b);}
  {const {a,b}=withReviewed();a.outcomes.reverse();rejects(a,b);}
});
const states=['reviewed','result_omitted','rejected','not_applicable','skipped_deleted','retrieval_failed','not_processed'] as const;
const simple=(state:string)=>({state,update_xml_sys_id:id(1),...(state==='not_applicable'?{asset_type:'other'}:{}),reason:({result_omitted:'response_limit',rejected:'invalid_xml',not_applicable:'asset_type_unsupported',skipped_deleted:'deleted_asset',retrieval_failed:'payload_unavailable',not_processed:'deadline_exceeded'} as Record<string,string>)[state]});
it.each(states.flatMap(from=>states.map(to=>({from,to}))))('state oracle: $from -> $to',({from,to})=>{
  const {a,b}=withReviewed(),reviewedReply=b.assets[0];
  if(from!=='reviewed'){
    set(a,'outcomes.0',from==='result_omitted'?{...simple(from),reviewed_origin:{receipt:a.inputs[0].receipt,accepted_outcome:{}}}:simple(from));
    if(from==='not_processed')set(a,'inputs.0.state','not_processed');
  }
  set(b,'assets.0',to==='reviewed'?reviewedReply:simple(to));b.header.limitations.push('response_truncated');
  if(from==='reviewed'&&to==='result_omitted')(b.header.errors as unknown[]).push({stage:'output',code:'response_limit'});
  const allowed=from===to||from==='reviewed'&&to==='result_omitted';
  if(allowed)expect(compareRecoveryFinishValues(a,b).matches).toBe(true);else rejects(a,b);
});
it('requires response_truncated only for a newly omitted reviewed result and never fabricates T_i for unfetched rows',()=>{
  const {a,b}=withReviewed();set(b,'assets.0',simple('result_omitted'));rejects(a,b);b.header.limitations.push('response_truncated');(b.header.errors as unknown[]).push({stage:'output',code:'response_limit'});expect(compareRecoveryFinishValues(a,b).matches).toBe(true);
  a.selected.push(id(3));a.outcomes.push({state:'not_processed',update_xml_sys_id:id(3),reason:'deadline_exceeded'});b.assets.push({state:'not_processed',update_xml_sys_id:id(3),reason:'deadline_exceeded'});
  a.header.collection.metadata_seen=b.header.collection.metadata_seen=3;a.header.collection.selected=b.header.collection.selected=3;
  expect(compareRecoveryFinishValues(a,b).matches).toBe(true);expect(a.inputs).toHaveLength(2);
});
it.each([2999,3000,3001,59999,60000,60001])('independent E interval oracle at %i ms',ms=>{
  for(const deadline of [3000,60000]){const {a,b}=withReviewed();a.time.deadline_ms=deadline;b.ended_at=new Date(Date.parse(S)+ms).toISOString();
    if(ms>=3000&&ms<=deadline)expect(compareRecoveryFinishValues(a,b).matches).toBe(true);else rejects(a,b);
  }
});
function operator(p:ReturnType<typeof pair>,expires:string){
  const release={source:'operator_config',resolution_status:'asserted',family:'Australia',visibility_scope:'operator_configured',instance_binding:'d'.repeat(64),config_version:'e'.repeat(64),asserted_at:S,expires_at:expires};
  const limits=['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable'];
  for(const raw of [p.a,p.b]){set(raw,'header.instance_release',release);set(raw,'header.limitations',limits);}
}
it.each([59999,60000,60001])('operator expiry remains strictly past S+60000 at %i, not E or effective L',ms=>{
  const p=pair();p.a.time.deadline_ms=3000;p.b.ended_at=T;operator(p,new Date(Date.parse(S)+ms).toISOString());
  if(ms>60000)expect(compareRecoveryFinishValues(p.a,p.b).matches).toBe(true);else rejects(p.a,p.b);
});
it.each(['binding','warning','assertion','future observation','family'] as const)('rejects invalid release evidence: %s',kind=>{
  const p=pair();
  if(kind==='future observation')for(const x of [p.a,p.b])set(x,'header.instance_release.observed_at',E.replace('04.000','05.000'));
  else if(kind==='family')for(const x of [p.a,p.b])set(x,'header.instance_release.raw_buildname','Utah');
  else{operator(p,'2026-11-02T00:02:00.000Z');for(const x of [p.a,p.b]){
    if(kind==='binding')set(x,'header.instance_release.instance_binding','f'.repeat(64));
    if(kind==='warning')set(x,'header.limitations',[]);
    if(kind==='assertion')set(x,'header.instance_release.asserted_at',O);
  }}rejects(p.a,p.b);
});
it('requires observed release evidence to exist by retained O, not merely by response E',()=>{
  const p=pair();for(const x of [p.a,p.b])set(x,'header.instance_release.observed_at','2026-11-02T00:00:01.500Z');rejects(p.a,p.b);
});
function version3(p:ReturnType<typeof pair>){
  for(const x of [p.a,p.b]){
    set(x,'header.schema_version','bp-mcp-review-0.3');set(x,'header.selection',{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}});
    set(x,'header.coverage.analysis_scope','selected_candidate_window');set(x,'header.coverage.candidate_inventory_complete',false);set(x,'header.coverage.update_set_inventory_complete',false);
    x.header.limitations.push(...TARGET_LIMITATIONS);
  }
}
it('keeps 0.3 selection facts and scope limitations while leaving full inventory unverified',()=>{
  const p=pair();version3(p);expect(compareRecoveryFinishValues(p.a,p.b).matches).toBe(true);
});
it.each(['asset type','missing warning','selection replacement','deleted row','error stage'] as const)('rejects 0.3 inconsistency: %s',kind=>{
  const p=withReviewed();version3(p);
  if(kind==='asset type')for(const x of [p.a,p.b])set(x,'header.selection.requested_asset_types',['client_script']);
  if(kind==='missing warning')for(const x of [p.a,p.b])set(x,'header.limitations',['release_visible_nodes_only']);
  if(kind==='selection replacement')set(p.b,'header.selection.requested_asset_types',['client_script']);
  if(kind==='deleted row'){set(p.a,'outcomes.0',simple('skipped_deleted'));set(p.b,'assets.0',simple('skipped_deleted'));}
  if(kind==='error stage')for(const x of [p.a,p.b])set(x,'header.errors',[{stage:'analysis',code:'candidate_filter_violation'}]);
  rejects(p.a,p.b);
});
it('preserves changed diagnosis and required errors instead of accepting a cleaner reply',()=>{
  const p=pair();for(const x of [p.a,p.b]){x.consistency='changed';set(x,'header.errors',[{stage:'consistency',code:'changed_during_review'}]);}
  expect(compareRecoveryFinishValues(p.a,p.b).matches).toBe(true);
  p.b.consistency='stable_observation';rejects(p.a,p.b);p.b.consistency='changed';set(p.b,'header.errors',[]);rejects(p.a,p.b);
});
it('does not pretend a failed initial collection supplied the required active receipt/window',()=>{
  const p=pair();for(const x of [p.a,p.b]){x.header.collection.status='failed';x.run_status='failed';}
  rejects(p.a,p.b);
});
it('keeps requested-rule order independent but rejects duplicate reply/expected rule lists',()=>{
  const {a,b}=pair();a.header.coverage.requested_rule_ids=['AU-BR-001','AU-BR-002'];b.header.coverage.requested_rule_ids=['AU-BR-002','AU-BR-001'];
  expect(compareRecoveryFinishValues(a,b).matches).toBe(true);b.header.coverage.requested_rule_ids=['AU-BR-001','AU-BR-001'];rejects(a,b);
});
it('preserves expected omitted origins locally but never upgrades them to body evidence',()=>{
  const {a,b}=withReviewed();set(a,'outcomes.0',{...simple('result_omitted'),reviewed_origin:null});set(b,'assets.0',simple('result_omitted'));
  expect(compareRecoveryFinishValues(a,b).unverified).toContain('original_body');
  set(a,'outcomes.0.reviewed_origin',{receipt:{},accepted_outcome:{}});rejects(a,b);
});
function manyReviewed(count:number,warnings:string[]){
  const p=withReviewed(),{a,b}=p,first=a.inputs[0],reply=JSON.parse(JSON.stringify(b.assets[0]));
  const inputs=Array.from({length:count},(_,n)=>({...first,receipt:{},update_xml_sys_id:id(n+1)}));
  a.selected=Array.from({length:count+1},(_,n)=>id(n+1));
  set(a,'inputs',[...inputs,{...a.inputs[1],update_xml_sys_id:id(count+1)}]);
  set(a,'outcomes',[...inputs.map(i=>({state:'reviewed',update_xml_sys_id:i.update_xml_sys_id,receipt:i.receipt,accepted_outcome:{}})),{...a.outcomes[1],update_xml_sys_id:id(count+1)}]);
  set(b,'assets',[...inputs.map(i=>({...reply,update_xml_sys_id:i.update_xml_sys_id,result:{...reply.result,target:{...reply.result.target,update_xml_sys_id:i.update_xml_sys_id}}})),{...b.assets[1],update_xml_sys_id:id(count+1)}]);
  for(const x of [a,b]){x.header.collection.metadata_seen=x.header.collection.selected=count+1;x.header.limitations=warnings;}
  for(let n=0;n<count;n++){set(a,`inputs.${n}.expected_context.release_limitations`,warnings);set(b,`assets.${n}.result.limitations`,warnings);}
  return p;
}
it('charges both raw projections to the same character budget, not two independent budgets',()=>{
  const p=manyReviewed(2,['release_visible_nodes_only',...Array.from({length:99},(_,n)=>String(n).padEnd(200,'x'))]);
  const a=projectRecoveryFinishExpectation(p.a),b=projectRecoveryFinishReply(p.b);expect(a.usage.character_units+b.usage.character_units).toBeGreaterThan(262144);rejects(p.a,p.b,'limit');
});
it('charges both projections to the same node budget without changing their individual acceptance',()=>{
  const p=manyReviewed(40,['release_visible_nodes_only',...Array.from({length:99},(_,n)=>'w'+n)]);
  const a=projectRecoveryFinishExpectation(p.a),b=projectRecoveryFinishReply(p.b);expect(a.usage.nodes+b.usage.nodes).toBeGreaterThan(10000);rejects(p.a,p.b,'limit');
});
it('reports exactly the sum of independent projection usage on successful comparison',()=>{
  const {a,b}=withReviewed(),x=projectRecoveryFinishExpectation(a).usage,y=projectRecoveryFinishReply(b).usage;
  expect(compareRecoveryFinishValues(a,b).usage).toEqual({nodes:x.nodes+y.nodes,character_units:x.character_units+y.character_units});
});
it.each(['header.limits.max_findings','content_evidence.original_body','assets.0.reason'])('preserves shape failure for invalid reply %s',path=>{
  const {a,b}=pair();set(b,path,path==='header.limits.max_findings'?1:'invented');rejects(a,b,'shape');
});
it('does not call accessors, proxy traps or retain raw errors while rejecting hostile input',()=>{
  let calls=0;const p=pair();Object.defineProperty(p.b,'ended_at',{get(){calls++;throw Error('SECRET');}});rejects(p.a,p.b,'shape');expect(calls).toBe(0);
  rejects(p.a,new Proxy({}, {ownKeys(){calls++;throw Error('SECRET');}}),'shape');expect(calls).toBe(0);
});
it('rejects projection wrappers and copied check summaries as raw values, without creating an authority path',()=>{
  const {a,b}=pair(),check=compareRecoveryFinishValues(a,b);rejects(projectRecoveryFinishExpectation(a),b,'shape');rejects(a,projectRecoveryFinishReply(b),'shape');rejects(a,{...check},'shape');
  const marker={secret:'LOCAL_ONLY'};a.binding.owner=marker;expect(compareRecoveryFinishValues(a,b).matches).toBe(true);
  expect(JSON.stringify(compareRecoveryFinishValues(a,b))).not.toContain('LOCAL_ONLY'); // Provenance explicitly remains unverified.
});
it('rejects reusing one accepted-outcome identity for different completed inputs',()=>{
  const {a,b}=manyReviewed(2,['release_visible_nodes_only']);
  const rows=a.outcomes as unknown as {accepted_outcome:object}[];rows[1].accepted_outcome=rows[0].accepted_outcome;rejects(a,b);
});
it('requires a completed input even for an omitted outcome without reviewed origin',()=>{
  const {a,b}=pair();set(a,'outcomes.0',{...simple('result_omitted'),reviewed_origin:null});set(b,'assets.0',simple('result_omitted'));rejects(a,b);
});
it('does not require the active T_i to stand in for a prior reviewed T_i',()=>{
  const p=withReviewed();set(p.b,'assets.0.result.reviewed_at',p.a.time.upper_utc);rejects(p.a,p.b);
  set(p.b,'assets.0.result.reviewed_at',T);expect(compareRecoveryFinishValues(p.a,p.b).matches).toBe(true);
});
it('requires an unfinished active input and never accepts a zero-input recovery',()=>{
  const p=withReviewed();set(p.a,'inputs',[]);rejects(p.a,p.b,'shape');
  const q=withReviewed();q.a.inputs.pop();set(q.a,'outcomes.1',simple('rejected'));rejects(q.a,q.b);
});
it('preserves a maximum truncated window and requires metadata_truncated',()=>{
  const {a,b}=pair();a.selected=Array.from({length:100},(_,n)=>id(n+1));a.outcomes=a.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));b.assets=a.outcomes.map(row=>({...row}));
  for(const x of [a,b]){x.header.collection={scope:'caller_acl_visible',status:'complete',metadata_seen:101,selected:100,truncated:true};x.header.limitations.push('metadata_truncated');}
  expect(compareRecoveryFinishValues(a,b).matches).toBe(true);for(const x of [a,b])x.header.limitations.pop();rejects(a,b);
});
it('enforces combined node 10000/10001 even when an unknown field would otherwise be a shape error',()=>{
  for(const target of [10000,10001]){
    const {a,b}=pair(),base=projectRecoveryFinishExpectation(a).usage.nodes+projectRecoveryFinishReply(b).usage.nodes;
    let remaining=target-base-101;const rows=Array.from({length:100},()=>{const n=Math.min(100,remaining);remaining-=n;return Array(n).fill(null);});expect(remaining).toBe(0);set(b,'extra',rows);
    rejects(a,b,target===10000?'shape':'limit');
  }
});
it('enforces combined character-unit boundary before unknown-field schema handling',()=>{
  const {a,b}=pair(),base=projectRecoveryFinishExpectation(a).usage.character_units+projectRecoveryFinishReply(b).usage.character_units+3*'extra'.length,n=Math.floor((262144-base)/3);
  set(b,'extra','x'.repeat(n));rejects(a,b,'shape');set(b,'extra','x'.repeat(n+1));rejects(a,b,'limit');
});
it('does not mutate, freeze opaque identities or turn repeated pure comparisons into one-shot claims',()=>{
  const {a,b}=withReviewed(),before=JSON.stringify([a,b]);compareRecoveryFinishValues(a,b);compareRecoveryFinishValues(a,b);
  expect(JSON.stringify([a,b])).toBe(before);expect(Object.isFrozen(a.binding.owner)).toBe(false);
});
// Finalize appends exactly one output/response_limit error when it first adds response_truncated (aggregate-finalize.ts omit()).
function omitted(){const {a,b}=withReviewed();set(b,'assets.0',simple('result_omitted'));b.header.limitations.push('response_truncated');return {a,b};}
it('requires the finalize omission error rather than accepting a limitation-only omission',()=>{const {a,b}=omitted();rejects(a,b);});
it('rejects an unrelated appended error even with a valid omission',()=>{const {a,b}=omitted();(b.header.errors as unknown[]).push({stage:'output',code:'response_limit'},{stage:'analysis',code:'deadline_exceeded'});rejects(a,b);});
it('rejects an omission error without any newly omitted reviewed result',()=>{const {a,b}=withReviewed();(b.header.errors as unknown[]).push({stage:'output',code:'response_limit'});rejects(a,b);});
it('does not expect a second omission error when response_truncated was already present',()=>{
  const {a,b}=omitted();a.header.limitations.push('response_truncated');expect(compareRecoveryFinishValues(a,b).matches).toBe(true);(b.header.errors as unknown[]).push({stage:'output',code:'response_limit'});rejects(a,b);
});
it('marks error truncation instead of appending once the expected errors are full',()=>{
  const {a,b}=omitted(),full=Array.from({length:100},()=>({stage:'analysis',code:'deadline_exceeded'}));set(a,'header.errors',full);set(b,'header.errors',full.map(x=>({...x})));
  rejects(a,b);b.header.limitations.push('error_details_truncated');expect(compareRecoveryFinishValues(a,b).matches).toBe(true);
});
it('rejects a same-length reply whose duplicate asset hides a missing expected id',()=>{
  const {a,b}=pair();a.selected.push(id(3));a.header.collection.selected=a.header.collection.metadata_seen=2;b.header.collection.selected=b.header.collection.metadata_seen=2;
  a.outcomes.push({state:'not_processed',update_xml_sys_id:id(3),reason:'deadline_exceeded'});b.assets.push({...(b.assets[0] as object)} as never);rejects(a,b);
});
it('rejects a reply that drops an expected non-release limitation',()=>{const {a,b}=pair();a.header.limitations.push('soft_deadline_reached');rejects(a,b);b.header.limitations.push('soft_deadline_reached');expect(compareRecoveryFinishValues(a,b).matches).toBe(true);});
it('rejects reply coverage that reports skipped rules',()=>{const {a,b}=pair();set(b,'header.coverage.skipped_rules',[{rule_id:'AU-BR-001',reason:'release_mismatch'}]);rejects(a,b);});
