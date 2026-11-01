import {expect,it} from 'vitest';
import {createSyntheticWorkerTimeIssuer} from '../support/review/synthetic-worker-time.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',T='2026-11-02T00:00:02.000Z',E='2026-11-02T00:00:03.000Z',asset='b'.repeat(32),hash='d'.repeat(64);
const release=()=>({source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'});
const aggregate=()=>({schema_version:'bp-mcp-review-0.2',started_at:S,ended_at:E,target:{update_set_sys_id:'a'.repeat(32),instance_binding:hash,target_version:'update_set_payload'},
  instance_release:release(),coverage:{requested_rule_ids:['AU-BR-001']},limits:{deadline_ms:60000},limitations:['release_visible_nodes_only'],assets:[] as unknown[]});
function fixture(deadline=60000){
  const s={run:{},session:{},source:{},key:{},origin:{},budget:{},update_set_sys_id:'a'.repeat(32),started_at:S,deadline_ms:60000,observed_at:O};let action:()=>string|undefined=()=>undefined;
  s.deadline_ms=deadline;const owner=createSyntheticWorkerTimeIssuer(s,()=>action()),b=owner.bind(s),supervisor={},worker={},g=owner.startGeneration(b,supervisor,worker);owner.ready(b,g);
  return {s,owner,b,g,supervisor,worker,arm:(fn:()=>string|undefined)=>{action=fn;},context:(id=2)=>({generation:g,supervisor,worker,id,kind:'finish' as const})};
}
const inputContext=()=>({record_updated_at:S,instance_binding:hash,instance_release:release(),requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']});
const reviewed=()=>({state:'reviewed',update_xml_sys_id:asset,applicable_rule_ids:['AU-BR-001'],result:{reviewed_at:T,
  target:{update_set_id:'a'.repeat(32),update_xml_sys_id:asset,target_version:'update_set_payload',retrieved_at:T,record_updated_at:S},
  instance_binding:hash,instance_release:release(),coverage:{requested_rule_ids:['AU-BR-001']},limitations:['release_visible_nodes_only']}});
function analyzed(state:'reviewed'|'rejected'|'result_omitted'='reviewed'){
  const f=fixture(),input=f.owner.input(f.b,{},asset,T,inputContext()),job=f.owner.analyze(f.b,f.g,input,2);
  const assetValue=state==='reviewed'?reviewed():{state,update_xml_sys_id:asset,reason:state==='rejected'?'invalid_xml':'response_limit'};
  f.owner.consumeAnalyze(f.b,job,{...f.context(),kind:'analyze',update_xml_sys_id:asset},assetValue);
  const run=aggregate();run.assets=[assetValue];return {...f,run};
}
function cleanup(f:ReturnType<typeof fixture>){f.owner.closeSource(f.b);f.owner.closeGeneration(f.b,f.g);f.owner.confirmClosed(f.b,f.g);}
it('validates a zero-input finish against retained O and returns only an opaque candidate',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),candidate=f.owner.consumeFinish(f.b,job,f.context(),aggregate());
  expect(Object.keys(candidate)).toEqual([]);expect(f.owner.inspect()).toMatchObject({upper_utc:O,candidate_retained:true});
});
it('rejects an added finish asset instead of silently changing the fixed empty set',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),v=aggregate();v.assets=[{state:'result_omitted',update_xml_sys_id:asset,reason:'response_limit'}];
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(),v)).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({candidate_retained:false,upper_utc:O});
});
it('consumes a candidate once after synthetic source/worker cleanup and closes the root before returning data',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),candidate=f.owner.consumeFinish(f.b,job,f.context(),aggregate());
  f.owner.closeSource(f.b);f.owner.closeGeneration(f.b,f.g);f.owner.confirmClosed(f.b,f.g);
  expect(f.owner.consumeTerminal(f.b,candidate)).toEqual({scope:'synthetic_finish_terminal',ended_at:E,assets:0,authority:'none'});
  expect(f.owner.inspect()).toMatchObject({state:'closed',upper_utc:null,candidate_retained:false});
  expect(()=>f.owner.consumeTerminal(f.b,candidate)).toThrow('internal_review_error');
});
it.each([
  [O,true],['2026-11-02T00:00:00.999Z',false],['2026-11-02T00:01:00.000Z',true],['2026-11-02T00:01:00.001Z',false],['invalid',false],
] as const)('independent empty-run E oracle: %s => %s',(end,ok)=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),v=aggregate();v.ended_at=end;
  if(ok)expect(f.owner.consumeFinish(f.b,job,f.context(),v)).toBeDefined();
  else expect(()=>f.owner.consumeFinish(f.b,job,f.context(),v)).toThrow('internal_review_error');
  expect(f.owner.inspect()).toMatchObject({upper_utc:O,candidate_retained:ok});
});
it.each(['reviewed','rejected','result_omitted'] as const)('keeps U as the lower E bound even for %s',state=>{
  const f=analyzed(state),job=f.owner.finish(f.b,f.g,3,f.run),v={...f.run,ended_at:'2026-11-02T00:00:01.999Z'};
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(3),v)).toThrow('internal_review_error');expect(f.owner.inspect().upper_utc).toBe(T);
});
it('accepts E=U and preserves exact nested T_i',()=>{
  const f=analyzed(),job=f.owner.finish(f.b,f.g,3,f.run),candidate=f.owner.consumeFinish(f.b,job,f.context(3),{...f.run,ended_at:T});cleanup(f);
  expect(f.owner.consumeTerminal(f.b,candidate)).toMatchObject({ended_at:T,assets:1,authority:'none'});
});
it('uses the pinned effective deadline rather than the JSON declaration',()=>{
  const f=fixture(2000),job=f.owner.finish(f.b,f.g,2,aggregate());
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(),aggregate())).toThrow('internal_review_error');expect(f.owner.inspect().held_time?.deadline_ms).toBe(2000);
});
const headerChanges:readonly [string,(v:ReturnType<typeof aggregate>)=>void][]=[
  ['schema',v=>{v.schema_version='bp-mcp-review-0.3';}],['start',v=>{v.started_at=O;}],['update set',v=>{v.target.update_set_sys_id='c'.repeat(32);}],
  ['binding',v=>{v.target.instance_binding='e'.repeat(64);}],['target version',v=>{v.target.target_version='current_record';}],
  ['release',v=>{v.instance_release.raw_buildname='Utah';}],['rules',v=>{v.coverage.requested_rule_ids=['AU-BR-002'];}],
  ['deadline declaration',v=>{v.limits.deadline_ms=2000;}],['limitation',v=>{v.limitations=[];}],
];
it.each(headerChanges)('independent header oracle rejects %s',(_name,change)=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),v=aggregate();change(v);
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(),v)).toThrow('internal_review_error');expect(f.owner.inspect().candidate_retained).toBe(false);
});
it.each(['missing','duplicate','foreign','nested UTC','nested target','nested release'] as const)('independent target-set oracle rejects %s',kind=>{
  const f=analyzed(),job=f.owner.finish(f.b,f.g,3,f.run),v={...f.run,assets:[reviewed()]};
  if(kind==='missing')v.assets=[];if(kind==='duplicate')v.assets.push(reviewed());if(kind==='foreign')v.assets[0].update_xml_sys_id='c'.repeat(32);
  if(kind==='nested UTC')v.assets[0].result.reviewed_at=O;if(kind==='nested target')v.assets[0].result.target.update_xml_sys_id='c'.repeat(32);if(kind==='nested release')v.assets[0].result.instance_release.raw_buildname='Utah';
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(3),v)).toThrow('internal_review_error');
});
it('permits only reviewed-to-omitted finalization while keeping U',()=>{
  const f=analyzed(),job=f.owner.finish(f.b,f.g,3,f.run),v={...f.run,assets:[{state:'result_omitted',update_xml_sys_id:asset,reason:'response_limit'}],limitations:['release_visible_nodes_only','response_truncated']};
  f.owner.consumeFinish(f.b,job,f.context(3),v);expect(f.owner.inspect()).toMatchObject({upper_utc:T,candidate_retained:true});
});
it.each(['rejected','result_omitted'] as const)('refuses %s-to-reviewed promotion',state=>{
  const f=analyzed(state),job=f.owner.finish(f.b,f.g,3,f.run);expect(()=>f.owner.consumeFinish(f.b,job,f.context(3),{...f.run,assets:[reviewed()]})).toThrow('internal_review_error');
});
it('does not let omission hide an invalid reviewed timestamp at finish issue',()=>{
  const f=analyzed(),bad=reviewed();bad.result.reviewed_at=O;f.run.assets=[bad];expect(()=>f.owner.finish(f.b,f.g,3,f.run)).toThrow('internal_review_error');
});
it('refuses omission without the original finalize warning',()=>{
  const f=analyzed(),job=f.owner.finish(f.b,f.g,3,f.run);expect(()=>f.owner.consumeFinish(f.b,job,f.context(3),{...f.run,assets:[{state:'result_omitted',update_xml_sys_id:asset,reason:'response_limit'}]})).toThrow('internal_review_error');
});
it('refuses a finish manifest missing a completed input and any unresolved input',()=>{
  const f=analyzed();expect(()=>f.owner.finish(f.b,f.g,3,aggregate())).toThrow('internal_review_error');
  const other=fixture();other.owner.input(other.b,{},asset,T,inputContext());expect(()=>other.owner.finish(other.b,other.g,2,aggregate())).toThrow('internal_review_error');
});
it('preserves non-analysis states/reasons and allows set order changes without additions',()=>{
  const f=fixture(),v=aggregate();v.assets=[{state:'not_applicable',update_xml_sys_id:asset,asset_type:'other',reason:'asset_type_unsupported'},{state:'skipped_deleted',update_xml_sys_id:'c'.repeat(32),reason:'deleted_asset'}];
  const job=f.owner.finish(f.b,f.g,2,v);f.owner.consumeFinish(f.b,job,f.context(),{...v,assets:[...v.assets].reverse()});expect(f.owner.inspect().candidate_retained).toBe(true);
});
// A same-length reply would otherwise let one duplicated id stand in for a missing fixed id.
it('rejects a same-length duplicate that hides a missing fixed id',()=>{
  const f=fixture(),other='c'.repeat(32),rejected={state:'rejected',update_xml_sys_id:other,reason:'invalid_xml'};
  for(const [id,n,value] of [[asset,2,reviewed()],[other,3,rejected]] as const){const i=f.owner.input(f.b,{},id,T,inputContext()),j=f.owner.analyze(f.b,f.g,i,n);f.owner.consumeAnalyze(f.b,j,{...f.context(n),kind:'analyze',update_xml_sys_id:id},value);}
  const v={...aggregate(),assets:[reviewed(),rejected]},job=f.owner.finish(f.b,f.g,4,v);
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(4),{...v,assets:[reviewed(),reviewed()]})).toThrow('internal_review_error');expect(f.owner.inspect().candidate_retained).toBe(false);
});
it('refuses a finish header that differs from the accepted input context',()=>{
  const f=analyzed('rejected');f.run.target.instance_binding='e'.repeat(64);expect(()=>f.owner.finish(f.b,f.g,3,f.run)).toThrow('internal_review_error');expect(f.owner.inspect().upper_utc).toBe(T);
});
it('refuses a changed reason for an analyzed rejection at finish issue',()=>{
  const f=analyzed('rejected');f.run.assets=[{state:'rejected',update_xml_sys_id:asset,reason:'payload_limit'}];expect(()=>f.owner.finish(f.b,f.g,3,f.run)).toThrow('internal_review_error');
});
it('accepts a parent-side response_limit omission of an accepted reviewed input and keeps U',()=>{
  const f=analyzed();f.run.assets=[{state:'result_omitted',update_xml_sys_id:asset,reason:'response_limit'}];f.run.limitations=['release_visible_nodes_only','response_truncated'];
  const job=f.owner.finish(f.b,f.g,3,f.run);f.owner.consumeFinish(f.b,job,f.context(3),f.run);expect(f.owner.inspect()).toMatchObject({upper_utc:T,candidate_retained:true});
});
it.each([
  ['an observation after E',(v:ReturnType<typeof aggregate>)=>{v.instance_release.observed_at='2026-11-02T00:00:04.000Z';}],
  ['a missing release limitation on a zero-input run',(v:ReturnType<typeof aggregate>)=>{v.limitations=[];}],
] as const)('reuses release evidence validation and rejects %s',(_name,change)=>{
  const f=fixture(),v=aggregate();change(v);const job=f.owner.finish(f.b,f.g,2,v);
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(),v)).toThrow('internal_review_error');expect(f.owner.inspect().candidate_retained).toBe(false);
});
it.each(Array.from({length:4},(_,i)=>i+1))('stops at finish-issue guard %i',at=>{
  const f=fixture();let n=0;f.arm(()=>++n===at?'cancelled':undefined);expect(()=>f.owner.finish(f.b,f.g,2,aggregate())).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({candidate_retained:false,upper_utc:O});
});
it.each(Array.from({length:6},(_,i)=>i+1))('stops at finish-response guard %i without publishing a candidate',at=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate());let n=0;f.arm(()=>++n===at?'deadline_exceeded':undefined);
  expect(()=>f.owner.consumeFinish(f.b,job,f.context(),aggregate())).toThrow('deadline_exceeded');expect(f.owner.inspect()).toMatchObject({candidate_retained:false,upper_utc:O,pending:false});
});
it.each(Array.from({length:4},(_,i)=>i+1))('stops at terminal-consumption guard %i and retains first diagnostic',at=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),c=f.owner.consumeFinish(f.b,job,f.context(),aggregate());cleanup(f);let n=0;f.arm(()=>++n===at?'cancelled':undefined);
  expect(()=>f.owner.consumeTerminal(f.b,c)).toThrow('cancelled');f.owner.revoke('deadline_exceeded');expect(f.owner.inspect()).toMatchObject({state:'failed',candidate_retained:false,terminal_consumed:false,diagnostic:{code:'cancelled'}});
});
it.each(['source','worker','confirmation'] as const)('refuses terminal consumption before %s cleanup',missing=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate()),c=f.owner.consumeFinish(f.b,j,f.context(),aggregate());
  if(missing!=='source')f.owner.closeSource(f.b);if(missing!=='worker'){f.owner.closeGeneration(f.b,f.g);if(missing!=='confirmation')f.owner.confirmClosed(f.b,f.g);}
  expect(()=>f.owner.consumeTerminal(f.b,c)).toThrow('internal_review_error');expect(f.owner.inspect().candidate_retained).toBe(false);
});
it('spends finish job once and removes pending before response guards',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),seen:boolean[]=[];f.arm(()=>{seen.push(f.owner.inspect().pending);return undefined;});f.owner.consumeFinish(f.b,job,f.context(),aggregate());
  expect(seen).toEqual([false,false,false,false,false,false]);expect(()=>f.owner.consumeFinish(f.b,job,f.context(),aggregate())).toThrow('internal_review_error');
});
it('refuses another finish issue even after its candidate is created',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate());f.owner.consumeFinish(f.b,job,f.context(),aggregate());expect(()=>f.owner.finish(f.b,f.g,3,aggregate())).toThrow('internal_review_error');
});
it('revokes a retained candidate synchronously and forbids late consumption',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate()),c=f.owner.consumeFinish(f.b,job,f.context(),aggregate());f.owner.revoke('cancelled');expect(()=>f.owner.consumeTerminal(f.b,c)).toThrow('cancelled');expect(f.owner.inspect().candidate_retained).toBe(false);
});
it('rejects a foreign/copied terminal candidate while leaving the other owner unchanged',()=>{
  const f=fixture(),other=fixture(),a=f.owner.finish(f.b,f.g,2,aggregate()),b=other.owner.finish(other.b,other.g,2,aggregate());f.owner.consumeFinish(f.b,a,f.context(),aggregate());const foreign=other.owner.consumeFinish(other.b,b,other.context(),aggregate());cleanup(f);
  expect(()=>f.owner.consumeTerminal(f.b,foreign)).toThrow('internal_review_error');cleanup(other);expect(other.owner.consumeTerminal(other.b,foreign).authority).toBe('none');
});
it('refuses caught reentry into candidate consumption and keeps the stop',()=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate()),c=f.owner.consumeFinish(f.b,j,f.context(),aggregate());cleanup(f);let once=false;
  f.arm(()=>{if(!once){once=true;try{f.owner.consumeTerminal(f.b,c);}catch{}}return undefined;});expect(()=>f.owner.consumeTerminal(f.b,c)).toThrow('internal_review_error');expect(f.owner.inspect().terminal_consumed).toBe(false);
});
it.each(['accessor','proxy'] as const)('does not run a %s while inspecting finish data',kind=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate()),v=aggregate();let calls=0;
  const raw=kind==='proxy'?new Proxy(v,{get(){calls++;throw Error('SECRET');}}):Object.defineProperty(v,'ended_at',{get(){calls++;throw Error('SECRET');}});
  expect(()=>f.owner.consumeFinish(f.b,j,f.context(),raw)).toThrow('internal_review_error');expect(calls).toBe(0);expect(JSON.stringify(f.owner.inspect())).not.toContain('SECRET');
});
it('uses the captured header/set even if the caller mutates the finish request after issue',()=>{
  const f=fixture(),v=aggregate(),job=f.owner.finish(f.b,f.g,2,v);v.target.instance_binding='e'.repeat(64);v.assets.push({state:'result_omitted',update_xml_sys_id:asset,reason:'response_limit'});
  expect(f.owner.consumeFinish(f.b,job,f.context(),aggregate())).toBeDefined();
});
it('preserves the fixed worker-unavailable reason for a finish send failure and keeps U',()=>{
  const f=fixture(),job=f.owner.finish(f.b,f.g,2,aggregate());expect(()=>f.owner.sendFailure(f.b,job,'worker_unavailable')).toThrow('worker_unavailable');
  expect(f.owner.inspect()).toMatchObject({upper_utc:O,pending:false,diagnostic:{code:'worker_unavailable'}});
});
it.each(['generation','supervisor','worker','id','kind','update_xml_sys_id'] as const)('refuses a foreign finish reply %s',key=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate()),context={...f.context(),[key]:key==='id'?3:key==='kind'?'analyze':key==='update_xml_sys_id'?asset:{}};
  expect(()=>f.owner.consumeFinish(f.b,j,context,aggregate())).toThrow('internal_review_error');
});
it('keeps the post-guard stop rather than hiding it behind an invalid finish body',()=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate());let n=0;f.arm(()=>++n===5?'cancelled':undefined);
  expect(()=>f.owner.consumeFinish(f.b,j,f.context(),{})).toThrow('cancelled');
});
it('permits finish consumption after normal source close, not new finish issuance',()=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate());f.owner.closeSource(f.b);expect(f.owner.consumeFinish(f.b,j,f.context(),aggregate())).toBeDefined();
  const other=fixture();other.owner.closeSource(other.b);expect(()=>other.owner.finish(other.b,other.g,2,aggregate())).toThrow('internal_review_error');
});
it('rejects a copied candidate and discards an unconsumed candidate at normal close',()=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate()),c=f.owner.consumeFinish(f.b,j,f.context(),aggregate());cleanup(f);
  expect(()=>f.owner.consumeTerminal(f.b,{...c})).toThrow('internal_review_error');
  const other=fixture(),job=other.owner.finish(other.b,other.g,2,aggregate()),candidate=other.owner.consumeFinish(other.b,job,other.context(),aggregate());cleanup(other);other.owner.close(other.b);
  expect(()=>other.owner.consumeTerminal(other.b,candidate)).toThrow('internal_review_error');expect(other.owner.inspect()).toMatchObject({state:'closed',candidate_retained:false});
});
it.each([60000,60001] as const)('keeps the independent operator expiry boundary at declared deadline + %i ms',expires=>{
  const f=fixture(2000),v={...aggregate(),ended_at:T,instance_release:{source:'operator_config',resolution_status:'asserted',family:'Australia',visibility_scope:'operator_configured',
    instance_binding:hash,config_version:'e'.repeat(64),asserted_at:S,expires_at:new Date(Date.parse(S)+expires).toISOString()},
  limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable']};
  const j=f.owner.finish(f.b,f.g,2,v);
  if(expires===60000)expect(()=>f.owner.consumeFinish(f.b,j,f.context(),v)).toThrow('internal_review_error');else expect(f.owner.consumeFinish(f.b,j,f.context(),v)).toBeDefined();
});
it('accepts the unchanged 0.3 header without changing the 60000 JSON declaration',()=>{
  const f=fixture(),v={...aggregate(),schema_version:'bp-mcp-review-0.3'},j=f.owner.finish(f.b,f.g,2,v);expect(f.owner.consumeFinish(f.b,j,f.context(),v)).toBeDefined();expect(v.limits.deadline_ms).toBe(60000);
});
it('caps the fixed set at 100 and refuses duplicate manifest identities before finish',()=>{
  const f=fixture(),v=aggregate();v.assets=Array.from({length:101},(_,i)=>({state:'skipped_deleted',update_xml_sys_id:(i+1).toString(16).padStart(32,'0'),reason:'deleted_asset'}));expect(()=>f.owner.finish(f.b,f.g,2,v)).toThrow('internal_review_error');
  const other=fixture(),run=aggregate(),a={state:'skipped_deleted',update_xml_sys_id:asset,reason:'deleted_asset'};run.assets=[a,a];expect(()=>other.owner.finish(other.b,other.g,2,run)).toThrow('internal_review_error');
});
it('pins a 100-row set against an independent id oracle',()=>{
  const f=fixture(),v=aggregate();v.assets=Array.from({length:100},(_,i)=>({state:'skipped_deleted',update_xml_sys_id:(i+1).toString(16).padStart(32,'0'),reason:'deleted_asset'}));
  const j=f.owner.finish(f.b,f.g,2,v),c=f.owner.consumeFinish(f.b,j,f.context(),{...v,assets:[...v.assets].reverse()});cleanup(f);expect(f.owner.consumeTerminal(f.b,c).assets).toBe(100);
});
it('refuses caught reentry into an otherwise-valid source close during finish consumption',()=>{
  const f=fixture(),j=f.owner.finish(f.b,f.g,2,aggregate());let once=false;
  f.arm(()=>{if(!once){once=true;try{f.owner.closeSource(f.b);}catch{}}return undefined;});
  expect(()=>f.owner.consumeFinish(f.b,j,f.context(),aggregate())).toThrow('internal_review_error');expect(f.owner.inspect()).toMatchObject({state:'failed',candidate_retained:false});
});
