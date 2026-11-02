import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {projectRecoveryFinishExpectation,projectRecoveryFinishReply,RecoveryFinishValueError,RECOVERY_FINISH_VALUE_LIMITS,type SyntheticRecoveryFinishValueCheck} from '../support/review/synthetic-recovery-finish-values.js';
import {TARGET_FILTER_VERSION} from '../../src/review/target-selection.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',T='2026-11-02T00:00:02.000Z',E='2026-11-02T00:00:03.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
const evidence=()=>({original_body:'unknown',full_schema:'unverified',wire:'unverified'});
const header=()=>({schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]});
function expectation(){return {kind:'synthetic_recovery_finish_expectation_v1',binding:{owner:{},plan:{},run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},window:{},frame:{supervisor:{},worker:{},generation:{}},accepted_origin:{}},time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:T},header:header(),selected:[id(1)],inputs:[{receipt:{},update_xml_sys_id:id(1),retrieved_at:T,state:'not_processed',expected_context:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}],run_status:'partial',consistency:'unverified',content_evidence:evidence()};}
function reply(){return {kind:'synthetic_recovery_finish_reply_v1',header:header(),ended_at:E,run_status:'partial',consistency:'unverified',assets:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}],content_evidence:evidence()};}
function change(raw:unknown,path:string,value:unknown){const keys=path.split('.');let current=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))current=current[k] as Record<string,unknown>;current[keys.at(-1)!]=value;}
function remove(raw:unknown,path:string){const keys=path.split('.');let current=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))current=current[k] as Record<string,unknown>;delete current[keys.at(-1)!];}
function reject(raw:unknown,expectationValue=true,reason?:'shape'|'limit'){
  let error:unknown;try{(expectationValue?projectRecoveryFinishExpectation:projectRecoveryFinishReply)(raw);}catch(e){error=e;}expect(error).toBeInstanceOf(RecoveryFinishValueError);expect(error).toMatchObject({message:'internal_review_error',code:'internal_review_error',...(reason?{reason}:{})});
}
function reviewed(){return {state:'reviewed',update_xml_sys_id:id(2),applicable_rule_ids:['AU-BR-001'],result:{reviewed_at:T,target:{update_set_id:id(10),update_xml_sys_id:id(2),target_version:'update_set_payload',retrieved_at:T,record_updated_at:S},instance_binding:'d'.repeat(64),instance_release:header().instance_release,coverage:{requested_rule_ids:['AU-BR-001']},limitations:['release_visible_nodes_only']}};}
function oracle(raw:unknown,refs=new Set<object>()){
  const queue=[raw];let nodes=0,character_units=0;while(queue.length){const v=queue.pop();nodes++;if(typeof v==='string')character_units+=3*v.length;else if(v&&typeof v==='object'&&!refs.has(v)){if(Array.isArray(v))queue.push(...v);else for(const [key,value]of Object.entries(v)){character_units+=3*key.length;queue.push(value);}}}return {nodes,character_units};
}
it('projects separate immutable structure-only values while retaining opaque identities without granting authority',()=>{
  const raw=expectation(),e=projectRecoveryFinishExpectation(raw),r=projectRecoveryFinishReply(reply());
  expect(e).toMatchObject({scope:'synthetic_recovery_finish_expectation_values',authority:'none',validation_scope:'structure_only'});expect(r).toMatchObject({scope:'synthetic_recovery_finish_reply_values',authority:'none',validation_scope:'structure_only'});
  expect(e.value.binding.frame).not.toBe(raw.binding.frame);expect(e.value.binding.frame.worker).toBe(raw.binding.frame.worker);expect(e.value.inputs[0].receipt).toBe(raw.inputs[0].receipt);
  expect(Object.isFrozen(e.value.header.target)).toBe(true);expect(Object.isFrozen(r.value.assets[0])).toBe(true);expect(Object.isFrozen(raw.binding.frame.worker)).toBe(false);
  expect(e.unverified).toContain('original_body');expect(r.unverified).toContain('time_consistency');expect(e).not.toHaveProperty('matches');expect(r).not.toHaveProperty('matches');
});
it.each(['kind','binding','binding.owner','binding.frame.worker','time','time.upper_utc','header','header.target','selected','inputs','inputs.0.receipt','inputs.0.expected_context','outcomes','outcomes.0.reason','run_status','consistency','content_evidence','content_evidence.original_body'])('rejects missing expectation %s',path=>{const raw=expectation();remove(raw,path);reject(raw,true,'shape');});
it.each(['kind','header','header.coverage','ended_at','run_status','consistency','assets','assets.0.state','content_evidence','content_evidence.wire'])('rejects missing reply %s',path=>{const raw=reply();remove(raw,path);reject(raw,false,'shape');});
it.each(['','binding','binding.frame','time','header','header.target','header.coverage','inputs.0','outcomes.0','content_evidence'])('rejects extra keys at expectation %s',path=>{const raw=expectation();change(raw,path?path+'.extra':'extra',true);reject(raw,true,'shape');});
it.each(['','header','header.limits','assets.0','content_evidence'])('rejects extra keys at reply %s',path=>{const raw=reply();change(raw,path?path+'.extra':'extra',true);reject(raw,false,'shape');});
it.each(['reviewed','not_applicable','skipped_deleted','rejected','retrieval_failed','not_processed','result_omitted'])('accepts the strict %s variant without declaring a context match',state=>{
  const expected=expectation(),response=reply(),variants:Record<string,unknown>={reviewed:{state,update_xml_sys_id:id(2),receipt:{},accepted_outcome:{}},not_applicable:{state,update_xml_sys_id:id(2),asset_type:'other',reason:'asset_type_unsupported'},skipped_deleted:{state,update_xml_sys_id:id(2),reason:'deleted_asset'},rejected:{state,update_xml_sys_id:id(2),reason:'invalid_xml'},retrieval_failed:{state,update_xml_sys_id:id(2),reason:'payload_unavailable'},not_processed:{state,update_xml_sys_id:id(2),reason:'deadline_exceeded'},result_omitted:{state,update_xml_sys_id:id(2),reason:'response_limit',reviewed_origin:null}};
  change(expected,'outcomes',[variants[state]]);change(response,'assets',[state==='reviewed'?reviewed():state==='result_omitted'?{state,update_xml_sys_id:id(2),reason:'response_limit'}:variants[state]]);
  expect(projectRecoveryFinishExpectation(expected).validation_scope).toBe('structure_only');expect(projectRecoveryFinishReply(response).validation_scope).toBe('structure_only');
});
it.each(['unexpected','completed','omitted','',null])('rejects unknown state %s in both directions',state=>{const a=expectation(),b=reply();change(a,'outcomes.0.state',state);change(b,'assets.0.state',state);reject(a);reject(b,false);});
it.each(['outcomes.0.reason','inputs.0.state','header.release_match','header.principal.auth_mode','consistency','run_status','kind','content_evidence.original_body','content_evidence.full_schema','content_evidence.wire'])('refuses unknown or promoted expectation %s',path=>{const raw=expectation();change(raw,path,'verified');reject(raw);});
it('retains explicit reviewed-origin identities, but rejects missing or malformed origin variants',()=>{
  const raw=expectation(),receipt={},accepted={};change(raw,'outcomes',[{state:'result_omitted',update_xml_sys_id:id(1),reason:'response_limit',reviewed_origin:{receipt,accepted_outcome:accepted}}]);
  const p=projectRecoveryFinishExpectation(raw),row=p.value.outcomes[0];expect(row.state).toBe('result_omitted');if(row.state==='result_omitted')expect(row.reviewed_origin?.accepted_outcome).toBe(accepted);remove(raw,'outcomes.0.reviewed_origin.receipt');reject(raw);
  const missing=expectation();change(missing,'outcomes',[{state:'result_omitted',update_xml_sys_id:id(1),reason:'response_limit'}]);reject(missing);
});
it('rejects a full worker result rather than silently dropping body fields from the strict reply view',()=>{
  const raw=reply();change(raw,'assets',[reviewed()]);expect(projectRecoveryFinishReply(raw).value.assets[0].state).toBe('reviewed');change(raw,'assets.0.result.findings',[]);reject(raw,false);remove(raw,'assets.0.result.findings');change(raw,'assets.0.result.code','synthetic body');reject(raw,false);
});
it('preserves data copies and input order without freezing or traversing caller-owned opaque graphs',()=>{
  const raw=expectation(),ref=raw.binding.source;Object.defineProperty(ref,'body',{get(){throw Error('SECRET');}});const p=projectRecoveryFinishExpectation(raw);raw.header.limitations[0]='changed';raw.selected[0]=id(100);expect(p.value.header.limitations[0]).toBe('release_visible_nodes_only');expect(p.value.selected[0]).toBe(id(1));expect(p.value.binding.source).toBe(ref);expect(Object.isFrozen(ref)).toBe(false);
});
it('does not turn invalid temporal/set relationships into a comparison result',()=>{
  const raw=expectation();raw.time.upper_utc=S;raw.selected=[id(1),id(1)];raw.header.target.update_set_sys_id=id(99);const a=projectRecoveryFinishExpectation(raw);const r=reply();r.ended_at=S;r.assets=[];const b=projectRecoveryFinishReply(r);
  for(const p of [a,b]){expect(p.validation_scope).toBe('structure_only');expect(p.unverified).toContain('context_and_manifest');expect(p.unverified).toContain('time_consistency');expect(p).not.toHaveProperty('matches');}
});
it.each(['binding.owner','inputs.0.receipt','outcomes.0.receipt','outcomes.0.accepted_outcome'])('refuses nonobject or proxy references at %s without invoking traps',path=>{
  for(const value of [null,'ref',1,()=>{},new Proxy({},{get(){throw Error('SECRET');},getPrototypeOf(){throw Error('SECRET');},ownKeys(){throw Error('SECRET');}})]){const raw=expectation();if(path.startsWith('outcomes'))change(raw,'outcomes',[{state:'reviewed',update_xml_sys_id:id(1),receipt:{},accepted_outcome:{}}]);change(raw,path,value);reject(raw,true,'shape');}
});
it.each(['','header','header.target','inputs.0','content_evidence'])('does not invoke object getters/setters at %s',path=>{
  for(const setter of [false,true]){const raw=expectation();let v=raw as unknown as Record<string,unknown>;if(path)for(const k of path.split('.'))v=v[k] as Record<string,unknown>;let touched=0;Object.defineProperty(v,'injected',setter?{set(){touched++;}}:{get(){touched++;throw Error('SECRET');}});reject(raw);expect(touched).toBe(0);}
});
it.each(['proxy','revoked','date','map','custom_proto','function','symbol','bigint','undefined'])('refuses %s in copied value paths',kind=>{
  let touched=0;const revocable=Proxy.revocable({},{});revocable.revoke();const raw=reply(),value=kind==='proxy'?new Proxy({},{ownKeys(){touched++;throw Error('SECRET');}}):kind==='revoked'?revocable.proxy:kind==='date'?new Date(S):kind==='map'?new Map():kind==='custom_proto'?Object.create({inherited:true}):kind==='function'?()=>{}:kind==='symbol'?Symbol('SECRET'):kind==='bigint'?1n:undefined;
  change(raw,'header.target',value);reject(raw,false);expect(touched).toBe(0);
});
it('refuses cycles, symbols, prototype keys and invalid array descriptors without exposing raw details',()=>{
  const cycle=reply();change(cycle,'extra',cycle);reject(cycle,false,'shape');
  for(const key of [Symbol('hidden'),'__proto__','constructor','prototype']){const raw=reply();Object.defineProperty(raw,key,{value:'SECRET',enumerable:true});reject(raw,false,'shape');}
  for(const kind of ['sparse','getter','named','symbol','custom_proto']){const raw=reply(),rows=raw.assets;let touched=0;if(kind==='sparse')delete rows[0];else if(kind==='getter')Object.defineProperty(rows,'0',{get(){touched++;throw Error('SECRET');}});else if(kind==='named')Object.defineProperty(rows,'extra',{value:1});else if(kind==='symbol')Object.defineProperty(rows,Symbol(),{value:1});else Object.setPrototypeOf(rows,null);reject(raw,false,'shape');expect(touched).toBe(0);}
});
it.each([NaN,Infinity,-Infinity,1.5,Number.MAX_SAFE_INTEGER+1,0,60001])('refuses nonbounded deadline %s',value=>{const raw=expectation();change(raw,'time.deadline_ms',value);reject(raw);});
it.each(['invalid','2026-11-02T00:00:03Z','2026-02-29T00:00:03.000Z','2026-11-02T00:00:03.000+00:00'])('refuses malformed fixed-ms reply UTC %s',value=>{const raw=reply();raw.ended_at=value;reject(raw,false);});
it('keeps expectation/reply/check brands and actual opaque handles nonassignable',()=>{
  type A=ReturnType<typeof projectRecoveryFinishExpectation>;type B=ReturnType<typeof projectRecoveryFinishReply>;
  const aIsB:A extends B?true:false=false,bIsA:B extends A?true:false=false,aIsCheck:A extends SyntheticRecoveryFinishValueCheck?true:false=false,bIsCheck:B extends SyntheticRecoveryFinishValueCheck?true:false=false;
  expect([aIsB,bIsA,aIsCheck,bIsCheck]).toEqual([false,false,false,false]);reject(projectRecoveryFinishExpectation(expectation()),true);reject(projectRecoveryFinishReply(reply()),false);reject(reply(),true);reject(expectation(),false);
});
it('supports the strict 0.3 header without removing selection evidence or allowing 0.3-only fields in 0.2',()=>{
  for(const side of ['expected','reply']){const raw=side==='expected'?expectation():reply(),h=raw.header;h.schema_version='bp-mcp-review-0.3';change(h,'selection',{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}});change(h,'coverage.analysis_scope','selected_candidate_window');change(h,'coverage.candidate_inventory_complete',false);change(h,'coverage.update_set_inventory_complete',false);
    const project=side==='expected'?projectRecoveryFinishExpectation:projectRecoveryFinishReply;expect(project(raw).value.header.schema_version).toBe('bp-mcp-review-0.3');remove(h,'selection');reject(raw,side==='expected');
  }
  const raw=reply();change(raw.header,'selection',{});reject(raw,false);
});
it('accepts explicit null-prototype data containers and preserves structural-only status',()=>{
  const raw=reply();Object.setPrototypeOf(raw,null);Object.setPrototypeOf(raw.header.target,null);expect(projectRecoveryFinishReply(raw).validation_scope).toBe('structure_only');
});
it('has no owner/issuer/candidate/clock/transport entry and does not claim full body verification',async()=>{
  const api=await import('../support/review/synthetic-recovery-finish-values.js');expect(Object.keys(api).sort()).toEqual(['RECOVERY_FINISH_VALUE_LIMITS','RecoveryFinishValueError','projectRecoveryFinishExpectation','projectRecoveryFinishReply'].sort());
  for(const p of [projectRecoveryFinishExpectation(expectation()),projectRecoveryFinishReply(reply())]){expect(p.value.content_evidence).toEqual(evidence());expect(p.unverified).toEqual(['binding_provenance','context_and_manifest','time_consistency','original_body','full_schema','wire']);expect(p).not.toHaveProperty('candidate');}
});
it('rejects invalid per-state field combinations instead of stripping them',()=>{
  for(const row of [{state:'not_applicable',update_xml_sys_id:id(1),reason:'asset_type_unsupported'}, {state:'rejected',update_xml_sys_id:id(1),reason:'unknown'}, {state:'not_processed',update_xml_sys_id:id(1),reason:'request_budget_exceeded'}, {state:'result_omitted',update_xml_sys_id:id(1),reason:'other'}]){const a=expectation(),b=reply();change(a,'outcomes',[row]);change(b,'assets',[row]);reject(a);reject(b,false);}
});
it('matches an independent queue-based node/character oracle, charging shared data once per occurrence',()=>{
  const a=expectation(),refs=new Set<object>([...Object.entries(a.binding).filter(([k])=>k!=='frame').map(([,v])=>v),...Object.values(a.binding.frame),a.inputs[0].receipt]);
  expect(projectRecoveryFinishExpectation(a).usage).toEqual(oracle(a,refs));const b=reply();expect(projectRecoveryFinishReply(b).usage).toEqual(oracle(b));b.header.limitations=['same','same'];expect(projectRecoveryFinishReply(b).usage).toEqual(oracle(b));
});
it.each(['selected','inputs','outcomes'])('accepts 100 structure rows and stops at 101 in %s',key=>{
  const raw=expectation(),rows=(raw as unknown as Record<string,unknown[]>)[key],value=rows[0];change(raw,key,Array.from({length:100},()=>value));expect(projectRecoveryFinishExpectation(raw).validation_scope).toBe('structure_only');change(raw,key,Array.from({length:101},()=>value));reject(raw,true,'limit');
});
it('bounds response asset/limitation arrays without confusing structure acceptance with set consistency',()=>{
  const raw=reply();raw.assets=Array.from({length:100},()=>({state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}));raw.header.limitations=Array(100).fill('x');expect(projectRecoveryFinishReply(raw).value.assets).toHaveLength(100);raw.assets.push(raw.assets[0]);reject(raw,false,'limit');raw.assets.pop();raw.header.limitations.push('x');reject(raw,false,'limit');
});
it('requires nonempty expectation sets/receipts but leaves empty reply-set matching unverified',()=>{
  for(const key of ['selected','inputs','outcomes']){const raw=expectation();change(raw,key,[]);reject(raw,true,'shape');}const raw=reply();raw.assets=[];const p=projectRecoveryFinishReply(raw);expect(p.unverified).toContain('context_and_manifest');expect(p).not.toHaveProperty('matches');
});
it('charges header and every repeated record against one character budget rather than per-record resets',()=>{
  const raw=expectation(),context={record_updated_at:S,instance_binding:'d'.repeat(64),instance_release:header().instance_release,requested_rule_ids:['AU-BR-001'],release_limitations:Array(70).fill('x'.repeat(200))};
  change(raw,'inputs',Array.from({length:7},(_,n)=>({receipt:{},update_xml_sys_id:id(n+1),retrieved_at:T,state:'completed',expected_context:context})));
  const total=oracle(raw);expect(total.nodes).toBeLessThan(10000);expect(total.character_units).toBeGreaterThan(262144);reject(raw,true,'limit');
});
it('enforces exact global character-unit boundaries independently of schema rejection',()=>{
  const baseline=oracle(reply()),n=Math.floor((262144-baseline.character_units-3*'extra'.length)/3),a=reply();change(a,'extra','x'.repeat(n));expect(oracle(a).character_units).toBeLessThanOrEqual(262144);reject(a,false,'shape');change(a,'extra','x'.repeat(n+1));expect(oracle(a).character_units).toBeGreaterThan(262144);reject(a,false,'limit');
});
it('enforces node 10000/10001 across the whole object independently of character limits',()=>{
  function padded(target:number){const raw=reply(),base=oracle(raw).nodes,leaves=target-base-101;let remaining=leaves;const rows=Array.from({length:100},()=>{const n=Math.min(100,remaining);remaining-=n;return Array(n).fill(null);});expect(remaining).toBe(0);change(raw,'extra',rows);expect(oracle(raw)).toMatchObject({nodes:target});return raw;}
  reject(padded(10000),false,'shape');reject(padded(10001),false,'limit');
});
it('distinguishes shape rejection at depth 8 from collector stop at depth 9',()=>{
  function nested(wrappers:number){let v:unknown=null;for(let n=0;n<wrappers;n++)v={x:v};const raw=reply();change(raw,'extra',v);return raw;}reject(nested(7),false,'shape');reject(nested(8),false,'limit');
});
it('distinguishes schema rejection at 30 keys from collector stop at 31 keys',()=>{
  const raw=reply(),base=Object.keys(raw).length;for(let n=base;n<30;n++)change(raw,'padding'+n,null);expect(Object.keys(raw)).toHaveLength(30);reject(raw,false,'shape');change(raw,'extra',null);reject(raw,false,'limit');
});
it('does not add an unapproved per-field config datetime length cap or validate expiry using the wall clock',()=>{
  const raw=reply(),at='2026-11-02T00:00:00.'+'1'.repeat(500)+'Z';change(raw,'header.instance_release',{source:'operator_config',resolution_status:'asserted',family:'Australia',visibility_scope:'operator_configured',instance_binding:'d'.repeat(64),config_version:'e'.repeat(64),asserted_at:at,expires_at:at});
  const p=projectRecoveryFinishReply(raw);expect(p.value.header.instance_release.source).toBe('operator_config');expect(p.unverified).toContain('time_consistency');expect(p.validation_scope).toBe('structure_only');
});
it('keeps immutable limits and metadata without mistaking copied metadata for measured wire/memory bounds',()=>{
  expect(RECOVERY_FINISH_VALUE_LIMITS).toEqual({depth:8,array:100,object_keys:30,nodes:10000,character_units:262144});expect(Object.isFrozen(RECOVERY_FINISH_VALUE_LIMITS)).toBe(true);const p=projectRecoveryFinishReply(reply());expect(Object.isFrozen(p.usage)).toBe(true);expect(Object.isFrozen(p.unverified)).toBe(true);expect(p.unverified).toContain('wire');
});
it('copies complete per-input expected contexts while preserving receipt identity and uncertainty',()=>{
  const raw=expectation(),context={record_updated_at:S,instance_binding:'d'.repeat(64),instance_release:header().instance_release,requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};change(raw,'inputs.0.state','completed');change(raw,'inputs.0.expected_context',context);change(raw,'outcomes',[{state:'reviewed',update_xml_sys_id:id(1),receipt:raw.inputs[0].receipt,accepted_outcome:{}}]);
  const p=projectRecoveryFinishExpectation(raw);context.release_limitations[0]='mutated';expect(p.value.inputs[0].expected_context?.release_limitations).toEqual(['release_visible_nodes_only']);expect(p.value.inputs[0].receipt).toBe(raw.inputs[0].receipt);expect(p.unverified).toContain('binding_provenance');
});
it.each(['reviewed_at','target','target.update_set_id','target.update_xml_sys_id','target.retrieved_at','target.record_updated_at','instance_binding','instance_release','coverage.requested_rule_ids','limitations'])('rejects missing reviewed response context %s',path=>{
  const raw=reply();change(raw,'assets',[reviewed()]);remove(raw,'assets.0.result.'+path);reject(raw,false,'shape');
});
it.each(['record_updated_at','instance_binding','instance_release','requested_rule_ids','release_limitations'])('rejects missing input expected context %s',path=>{
  const raw=expectation();change(raw,'inputs.0.expected_context',{record_updated_at:S,instance_binding:'d'.repeat(64),instance_release:header().instance_release,requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']});remove(raw,'inputs.0.expected_context.'+path);reject(raw,true,'shape');
});
