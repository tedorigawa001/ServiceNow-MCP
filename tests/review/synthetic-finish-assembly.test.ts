import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {createSyntheticFinishAssembly} from '../support/review/synthetic-finish-assembly.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import type {SyntheticFinishContextEvidence} from '../support/review/synthetic-finish-context-values.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){
  return {kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
    header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
    selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]};
}
function write(raw:unknown,path:string,value:unknown){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;v[keys.at(-1)!]=value;}
function remove(raw:unknown,path:string){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;delete v[keys.at(-1)!];}
function reviewed(omitted=false){
  const raw=fixture(),expected={record_updated_at:S,instance_binding:raw.header.target.instance_binding,instance_release:{...raw.header.instance_release},requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};
  raw.selected.push(id(2));raw.header.collection.selected=raw.header.collection.metadata_seen=2;
  write(raw,'inputs',[{update_xml_sys_id:id(2),retrieved_at:O,state:'completed',expected_context:expected,accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(2),retrieved_at:O}},...raw.inputs]);
  write(raw,'outcomes',[...raw.outcomes,omitted?{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'}:{state:'reviewed',update_xml_sys_id:id(2)}]);return raw;
}
function rejected(raw:unknown){const a=createSyntheticFinishAssembly(raw);expect(()=>a.bind()).toThrow('internal_review_error');expect(a.inspect()).toMatchObject({state:'failed',pins:null,evidence_issues:0,hard:{code:'internal_review_error',stage:'binding'}});expect(()=>a.bind()).toThrow('internal_review_error');}
it('constructs a separate non-executable assembly with private pins and no evidence issuance',()=>{
  const assembly=createSyntheticFinishAssembly(fixture()),binding=assembly.bind();assembly.prepare(binding);
  expect(assembly.inspect()).toEqual({scope:'synthetic_finish_assembly',authority:'none',state:'prepared',bind_started:true,prepare_started:true,pins:{selected:1,inputs:1,accepted:0},hard:null,evidence_issues:0,route_bound:false});
  expect(Object.keys(assembly)).toEqual(['bind','prepare','revoke','close','inspect']);
  expect(Object.keys(binding)).toEqual([]);expect(Object.isFrozen(binding)).toBe(true);
  const notEvidence:typeof binding extends SyntheticFinishContextEvidence?true:false=false;expect(notEvidence).toBe(false);
});
it('rejects reentrant bind even when the injected guard swallows the inner failure',()=>{
  let assembly:ReturnType<typeof createSyntheticFinishAssembly>,entered=false;
  assembly=createSyntheticFinishAssembly(fixture(),()=>{if(!entered){entered=true;try{assembly.bind();}catch{/* attempt to swallow failure */}}});
  expect(()=>assembly.bind()).toThrow('internal_review_error');expect(assembly.inspect()).toMatchObject({state:'failed',pins:null,hard:{code:'internal_review_error',stage:'binding'},evidence_issues:0});
  expect(()=>assembly.bind()).toThrow('internal_review_error');
});
it('rejects reentrant preparation swallowed inside the post guard and clears private pins',()=>{
  let a:ReturnType<typeof createSyntheticFinishAssembly>,b:object,calls=0;
  a=createSyntheticFinishAssembly(fixture(),()=>{if(++calls===4){try{a.prepare(b);}catch{/* no resurrection */}}});b=a.bind();
  expect(()=>a.prepare(b)).toThrow('internal_review_error');expect(a.inspect()).toMatchObject({state:'failed',pins:null,hard:{stage:'preparation'}});
});
it('creates independent roots even from the same fixture object rather than registering an existing owner',()=>{
  const raw=fixture(),a=createSyntheticFinishAssembly(raw),b=createSyntheticFinishAssembly(raw),aa=a.bind(),bb=b.bind();expect(aa).not.toBe(bb);
  a.prepare(aa);b.prepare(bb);expect(a.inspect()).toEqual(b.inspect());expect(()=>a.bind()).toThrow('internal_review_error');expect(b.inspect().state).toBe('prepared');
});
it('rejects a foreign owner without mutating the other assembly',()=>{
  const a=createSyntheticFinishAssembly(fixture()),b=createSyntheticFinishAssembly(fixture()),ab=a.bind(),bb=b.bind();
  expect(()=>a.prepare(bb)).toThrow('internal_review_error');expect(a.inspect()).toMatchObject({state:'failed',pins:null});
  b.prepare(bb);expect(b.inspect()).toMatchObject({state:'prepared'});expect(ab).not.toBe(bb);
});
it.each([false,true])('pins fixture-owned immutable reviewed origins (omitted=%s) without issuing evidence',omitted=>{
  const a=createSyntheticFinishAssembly(reviewed(omitted)),b=a.bind();a.prepare(b);expect(a.inspect()).toMatchObject({state:'prepared',pins:{selected:2,inputs:2,accepted:1},evidence_issues:0,route_bound:false});
});
it('keeps a completed non-reviewed omission separate from a synthetic reviewed origin',()=>{
  const raw=reviewed(true);write(raw,'inputs.0.accepted',null);write(raw,'inputs.0.expected_context',null);
  const a=createSyntheticFinishAssembly(raw),b=a.bind();a.prepare(b);expect(a.inspect().pins?.accepted).toBe(0);
});
it.each(['bind','prepare'] as const)('rejects a second %s and clears pins permanently',method=>{
  const a=createSyntheticFinishAssembly(fixture()),b=a.bind();if(method==='prepare')a.prepare(b);
  expect(()=>method==='bind'?a.bind():a.prepare(b)).toThrow('internal_review_error');
  expect(a.inspect()).toMatchObject({state:'failed',pins:null});expect(()=>a.prepare(b)).toThrow('internal_review_error');expect(()=>a.bind()).toThrow('internal_review_error');
});
it('rejects copied and old-issuer bindings without changing old issuer state or claims',()=>{
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U};
  const facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  const old=createSyntheticSoftRecoveryIssuer(seed,facts),oldBinding=old.bind(seed),before=old.inspect();
  const a=createSyntheticFinishAssembly(fixture());a.bind();expect(()=>a.prepare(oldBinding)).toThrow('internal_review_error');expect(old.inspect()).toEqual(before);
  const observation=old.observe(oldBinding,facts),recovery=old.claimRecovery(oldBinding,observation);expect(old.consumeRecovery(oldBinding,recovery)).toMatchObject({authority:'none'});
  const c=createSyntheticFinishAssembly(fixture()),binding=c.bind();expect(()=>c.prepare({...binding})).toThrow('internal_review_error');
});
it('pins bounded copies instead of retaining mutable constructor data',()=>{
  const raw=reviewed(),a=createSyntheticFinishAssembly(raw),b=a.bind();
  raw.header.target.instance_binding='SECRET';raw.header.limitations.push('SECRET');raw.selected.length=0;raw.inputs.length=0;raw.outcomes.length=0;
  a.prepare(b);expect(a.inspect()).toMatchObject({state:'prepared',pins:{selected:2,inputs:2,accepted:1}});expect(JSON.stringify(a.inspect())).not.toContain('SECRET');
  a.close(b);expect(a.inspect()).toMatchObject({state:'closed',pins:null,hard:null});
});
it('does not inspect constructor data until bind and never invokes getters',()=>{
  let calls=0;const raw=fixture();Object.defineProperty(raw,'header',{get(){calls++;throw Error('SECRET');}});
  const a=createSyntheticFinishAssembly(raw);expect(calls).toBe(0);expect(a.inspect().state).toBe('fresh');expect(()=>a.bind()).toThrow('internal_review_error');expect(calls).toBe(0);
});
it.each(['kind','time','header','selected','inputs','outcomes','time.started_at','time.deadline_ms','time.observed_at','time.upper_utc','inputs.0.update_xml_sys_id','inputs.0.retrieved_at','inputs.0.state','inputs.0.expected_context','inputs.0.accepted'])('rejects missing seed field %s',path=>{const raw=fixture();remove(raw,path);rejected(raw);});
it.each(['owner','plan','source','session','route','handoff','ready','evidence','authority','summary'])('does not allow caller registration through seed.%s',key=>{const raw=fixture();write(raw,key,{});rejected(raw);});
it.each(['receipt','accepted_outcome','reviewed_origin'])('does not accept caller handles in input.%s',key=>{const raw=fixture();write(raw,'inputs.0.'+key,{});rejected(raw);});
it.each([
  ['kind','synthetic_finish_values'],['time.deadline_ms',0],['time.deadline_ms',60001],['time.upper_utc',S],['header.started_at',O],['header.target.instance_binding','SECRET'],['selected',[]],['inputs',[]],['outcomes',[]],['inputs.0.state','reviewed'],['inputs.0.expected_context',undefined],['inputs.0.accepted',{}],['inputs.0.accepted',false],['outcomes.0.reason','other'],
])('rejects malformed construction field %s', (path,value)=>{const raw=fixture();write(raw,path as string,value);rejected(raw);});
it.each([
  ['inputs.0.accepted.kind','reviewed'],['inputs.0.accepted.update_xml_sys_id',id(1)],['inputs.0.accepted.retrieved_at',U],['inputs.0.accepted',null],['inputs.0.expected_context',null],['inputs.0.state','not_processed'],['outcomes.1.accepted_outcome',{}],['outcomes.1.receipt',{}],['outcomes.1.reviewed_origin',{}],
])('rejects mixed or caller-authored reviewed origin %s',(path,value)=>{const raw=reviewed();write(raw,path as string,value);rejected(raw);});
it.each(['kind','update_xml_sys_id','retrieved_at'])('rejects missing synthetic accepted descriptor.%s',key=>{const raw=reviewed();remove(raw,'inputs.0.accepted.'+key);rejected(raw);});
it('rejects duplicate original receipt IDs before allocating a second ledger slot',()=>{const raw=reviewed();raw.inputs.push(raw.inputs[0]);rejected(raw);});
it.each(['cancelled','deadline_exceeded'] as const)('retains first %s across failed reuse and releases all pins',reason=>{
  let stop:unknown;const a=createSyntheticFinishAssembly(fixture(),()=>stop),b=a.bind();stop=reason;
  expect(()=>a.prepare(b)).toThrow(reason);stop=undefined;expect(()=>a.bind()).toThrow(reason);expect(()=>a.close(b)).toThrow(reason);
  expect(a.inspect()).toMatchObject({state:'failed',pins:null,hard:{code:reason,stage:'preparation'}});
});
it.each([1,2,3,4])('stops at injected guard %i without publishing preparation or restoring pins',point=>{
  let calls=0;const a=createSyntheticFinishAssembly(fixture(),()=>++calls===point?'cancelled':undefined);let binding:object|undefined;
  try{binding=a.bind();}catch{/* guard 1/2 */}if(binding)expect(()=>a.prepare(binding!)).toThrow('cancelled');
  expect(a.inspect()).toMatchObject({state:'failed',pins:null,hard:{code:'cancelled',stage:point<=2?'binding':'preparation'}});
  expect(()=>a.bind()).toThrow('cancelled');
});
it('claims each preparation attempt before its first external guard, including cancelled attempts',()=>{
  const a=createSyntheticFinishAssembly(fixture(),()=> 'cancelled');expect(()=>a.bind()).toThrow('cancelled');expect(a.inspect().bind_started).toBe(true);
  let stop:unknown;const b=createSyntheticFinishAssembly(fixture(),()=>stop),binding=b.bind();stop='cancelled';expect(()=>b.prepare(binding)).toThrow('cancelled');expect(b.inspect().prepare_started).toBe(true);
});
it('keeps thrown guard details private and refuses recovery after failure',()=>{
  const a=createSyntheticFinishAssembly(fixture(),()=>{throw Error('SECRET');});expect(()=>a.bind()).toThrow('internal_review_error');expect(JSON.stringify(a.inspect())).not.toContain('SECRET');expect(()=>a.bind()).toThrow('internal_review_error');
});
it('revokes a prepared assembly synchronously without evidence or route resurrection',()=>{
  const a=createSyntheticFinishAssembly(fixture()),b=a.bind();a.prepare(b);expect(()=>a.revoke(b,'deadline_exceeded')).toThrow('deadline_exceeded');expect(a.inspect()).toMatchObject({state:'failed',pins:null,evidence_issues:0,hard:{code:'deadline_exceeded',stage:'revoke'}});expect(()=>a.prepare(b)).toThrow('deadline_exceeded');
});
it('closes the data-only scope without manufacturing source/worker cleanup evidence',()=>{
  const a=createSyntheticFinishAssembly(fixture()),b=a.bind();a.close(b);expect(a.inspect()).toMatchObject({state:'closed',pins:null,evidence_issues:0,route_bound:false});expect(()=>a.prepare(b)).toThrow('internal_review_error');
});
it.each([new Proxy({},{}),new Map(),Object.create({}),NaN,()=>{},Symbol('SECRET')])('rejects unsupported fixture values without promotion',value=>{const raw=fixture();write(raw,'header',value);rejected(raw);});
it('rejects cycles, sparse arrays, symbol fields and repeated data above the total cap',()=>{
  const cycle=fixture();write(cycle,'header',cycle);rejected(cycle);
  const sparse=fixture();write(sparse,'selected',new Array(1));rejected(sparse);
  const symbol=fixture();Object.defineProperty(symbol,Symbol('SECRET'),{value:1});rejected(symbol);
  const large=fixture();large.header.limitations=Array.from({length:100},(_,i)=>'x'.repeat(1000)+i);rejected(large);
  const oversized=fixture();write(oversized,'selected',Array.from({length:101},(_,i)=>id(i+1)));rejected(oversized);
});
it('uses one seed character cap across records even when each warning and array is individually bounded',()=>{
  const raw=reviewed(),warnings=['release_visible_nodes_only',...Array.from({length:99},(_,i)=>String(i).padStart(3,'0')+'x'.repeat(187))];
  raw.header.limitations=warnings;write(raw,'inputs.0.expected_context.release_limitations',warnings);
  const completed=raw.inputs[0] as unknown as Record<string,unknown>;
  for(let n=3;n<=5;n++){
    raw.selected.push(id(n));write(raw,'inputs',[...raw.inputs.slice(0,-1),{...completed,update_xml_sys_id:id(n),accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(n),retrieved_at:O}},raw.inputs.at(-1)]);
    raw.outcomes.push({state:'reviewed',update_xml_sys_id:id(n)} as typeof raw.outcomes[number]);
  }
  raw.header.collection.selected=raw.header.collection.metadata_seen=5;
  // Independent data oracle: seed has no opaque references; aliases count per occurrence.
  function characters(v:unknown):number{return typeof v==='string'?v.length:v&&typeof v==='object'?Object.entries(v).reduce((sum,[k,x])=>sum+(Array.isArray(v)?0:k.length)+characters(x),0):0;}
  expect(warnings.every(x=>x.length<=200)).toBe(true);expect(warnings.length).toBe(100);expect(characters(raw)*3).toBeGreaterThan(262144);rejected(raw);
});
it('rejects caught reentry into close during the preparation post guard',()=>{
  let a:ReturnType<typeof createSyntheticFinishAssembly>,b:object,calls=0;
  a=createSyntheticFinishAssembly(fixture(),()=>{if(++calls===4){try{a.close(b);}catch{/* outer must still stop */}}});b=a.bind();
  expect(()=>a.prepare(b)).toThrow('internal_review_error');expect(a.inspect()).toMatchObject({state:'failed',pins:null,hard:{code:'internal_review_error',stage:'close'}});
});
it.each([['bind',2,'binding'],['prepare',4,'preparing']] as const)('publishes %s state only after its post guard',(_name,at,expected)=>{
  let a:ReturnType<typeof createSyntheticFinishAssembly>,calls=0,seen:string|undefined;
  a=createSyntheticFinishAssembly(fixture(),()=>{if(++calls===at)seen=a.inspect().state;return undefined;});const b=a.bind();a.prepare(b);
  expect(seen).toBe(expected);expect(a.inspect().state).toBe('prepared');
});
