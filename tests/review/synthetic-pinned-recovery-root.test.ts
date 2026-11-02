import {expect,it} from 'vitest';
import {CATALOG_VERSION} from '../../src/review/catalog.js';
import {createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {createSyntheticFinishRecoveryRoot} from '../support/review/synthetic-finish-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import type {SyntheticFinishContextEvidence} from '../support/review/synthetic-finish-context-values.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z',id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){return {kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(1),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
  header:{schema_version:'bp-mcp-review-0.2',target:{update_set_sys_id:id(10),target_version:'update_set_payload',instance_binding:'d'.repeat(64)},versions:{knowledge_base:CATALOG_VERSION,ruleset:'bp3-0.4',asset_schema:'bp-review-0.2'},started_at:S,instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:O,visibility_scope:'caller_acl'},release_match:'matched',principal:{auth_mode:'per-user'},collection:{scope:'caller_acl_visible',status:'complete',metadata_seen:1,selected:1,truncated:false},coverage:{requested_rule_ids:['AU-BR-001'],skipped_rules:[],analysis_complete:false},limits:{max_records:100,max_findings:100,max_response_bytes:262144,deadline_ms:60000},limitations:['release_visible_nodes_only'],errors:[]},
  selected:[id(1)],inputs:[{update_xml_sys_id:id(1),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'}]}};}
function write(raw:unknown,path:string,value:unknown){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;v[keys.at(-1)!]=value;}
function remove(raw:unknown,path:string){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;delete v[keys.at(-1)!];}
const good={termination:'confirmed',cleanup:'complete'};
function begin(raw:unknown=fixture(),check:()=>string|undefined=()=>undefined){const root=createSyntheticPinnedRecoveryRoot(raw,check),b=root.bind(),recovery=root.claimRecovery(b,root.observe(b));return {root,b,recovery,prepare:()=>root.prepareWorkerRecovery(b,recovery,good)};}
function rejected(raw:unknown){const root=createSyntheticPinnedRecoveryRoot(raw);expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect()).toMatchObject({state:'failed',pins:null,route_bound:false,evidence_issues:0});expect(()=>root.bind()).toThrow('internal_review_error');}
function mixed(){
  const raw=fixture(),expected={record_updated_at:S,instance_binding:raw.finish.header.target.instance_binding,instance_release:{...raw.finish.header.instance_release},requested_rule_ids:['AU-BR-001'],release_limitations:['release_visible_nodes_only']};
  raw.finish.selected=[id(1),id(2),id(3)];raw.finish.header.collection.selected=raw.finish.header.collection.metadata_seen=3;
  write(raw,'finish.inputs',[{update_xml_sys_id:id(1),retrieved_at:O,state:'not_processed',expected_context:null,accepted:null},{update_xml_sys_id:id(2),retrieved_at:O,state:'completed',expected_context:expected,accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(2),retrieved_at:O}},{update_xml_sys_id:id(3),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}]);
  write(raw,'finish.outcomes',[{state:'not_processed',update_xml_sys_id:id(1),reason:'deadline_exceeded'},{state:'reviewed',update_xml_sys_id:id(2)},{state:'not_processed',update_xml_sys_id:id(3),reason:'deadline_exceeded'}]);return raw;
}
it('feeds the same private pin context and active receipt into guarded recovery preparation',()=>{
  const root=createSyntheticPinnedRecoveryRoot(fixture()),b=root.bind(),r=root.claimRecovery(b,root.observe(b));
  const p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'});
  expect(Object.keys(p)).toEqual([]);expect(root.inspect()).toMatchObject({scope:'synthetic_pinned_recovery_root',authority:'none',state:'worker_prepared',pins:{selected:1,inputs:1,accepted:0},preparation:{selected:1,retained_inputs:1,completed:0,not_processed:1,accounting:{requests:10,received_bytes:20,payload_bytes:30}},route_bound:false,evidence_issues:0});
  root.discardWorkerRecoveryPreparation(b,p);root.close(b);expect(root.inspect()).toMatchObject({state:'closed',pins:null});
});
it('keeps U from all inputs when the active receipt is not the latest and retains a reviewed pin',()=>{
  const f=begin(mixed()),p=f.prepare();expect(f.root.inspect()).toMatchObject({state:'worker_prepared',pins:{selected:3,inputs:3,accepted:1},preparation:{selected:3,retained_inputs:3,completed:1,not_processed:2}});
  f.root.discardWorkerRecoveryPreparation(f.b,p);f.root.close(f.b);expect(f.root.inspect().state).toBe('closed');
});
it.each([true,false])('preserves omitted origins from the same private ledger (reviewed=%s)',reviewed=>{
  const raw=mixed();write(raw,'finish.outcomes.1',{state:'result_omitted',update_xml_sys_id:id(2),reason:'response_limit'});if(!reviewed){write(raw,'finish.inputs.1.accepted',null);write(raw,'finish.inputs.1.expected_context',null);}
  const f=begin(raw);f.prepare();expect(f.root.inspect()).toMatchObject({pins:{accepted:reviewed?1:0},preparation:{completed:1,not_processed:2}});
});
it.each([1,100])('keeps the bounded %i-row window and original U without adding a receipt',count=>{
  const raw=fixture();raw.finish.selected=Array.from({length:count},(_,i)=>id(i+1));raw.finish.header.collection.selected=raw.finish.header.collection.metadata_seen=count;
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}));raw.finish.outcomes=raw.finish.selected.map(update_xml_sys_id=>({state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}));
  const f=begin(raw);f.prepare();expect(f.root.inspect().preparation).toMatchObject({selected:count,retained_inputs:count,not_processed:count});
});
it.each([{requests:0,received_bytes:0,payload_bytes:0},{requests:210,received_bytes:16777216,payload_bytes:8388608}])('keeps exact accounting boundary %j without new charges',accounting=>{
  const raw=fixture();raw.accounting=accounting;const f=begin(raw);f.prepare();expect(f.root.inspect().preparation?.accounting).toEqual(accounting);
});
it.each(['stable_observation','changed','unverified'])('preserves fixture %s and accounting without verify or new I/O',consistency=>{
  const raw=fixture();raw.consistency=consistency;const f=begin(raw);f.prepare();expect(f.root.inspect().preparation).toMatchObject({consistency,accounting:raw.accounting});
});
it.each(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check'])('prepares the fixed %s closure topology',point=>{
  const raw=fixture();raw.point=point;const f=begin(raw);const event=point==='request_check_unstarted'?{termination:'not_required',cleanup:'not_required'}:good;
  f.root.prepareWorkerRecovery(f.b,f.recovery,event);expect(f.root.inspect().state).toBe('worker_prepared');
});
it.each(['binding','recovery','preparation'] as const)('rejects mixed/copy %s and leaves the other root unchanged',kind=>{
  for(const copy of [false,true]){
    const a=begin(),b=begin();let run:()=>unknown;
    if(kind==='binding')run=()=>a.root.prepareWorkerRecovery(copy?{...a.b}:b.b,a.recovery,good);
    else if(kind==='recovery')run=()=>a.root.prepareWorkerRecovery(a.b,copy?{...a.recovery}:b.recovery,good);
    else{const ap=a.prepare(),bp=b.prepare();run=()=>a.root.discardWorkerRecoveryPreparation(a.b,copy?{...ap}:bp);}
    const before=b.root.inspect();expect(run).toThrow('internal_review_error');expect(a.root.inspect()).toMatchObject({state:'failed',pins:null});expect(b.root.inspect()).toEqual(before);
  }
});
it('rejects RB-A and legacy bindings without adopting or mutating their root',()=>{
  const old=createSyntheticFinishRecoveryRoot({kind:'synthetic_finish_recovery_root_v1',time:fixture().finish.time,point:'analyze_timer'}),ob=old.bind(),before=old.inspect();const f=begin();expect(()=>f.root.prepareWorkerRecovery(ob,f.recovery,good)).toThrow('internal_review_error');expect(old.inspect()).toEqual(before);
  const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},...fixture().finish.time},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;
  const legacy=createSyntheticSoftRecoveryIssuer(seed,facts),lb=legacy.bind(seed),prior=legacy.inspect(),g=begin();expect(()=>g.root.prepareWorkerRecovery(lb,g.recovery,good)).toThrow('internal_review_error');expect(legacy.inspect()).toEqual(prior);
});
it('keeps static binding/preparation brands separate from RB-A and finish evidence',()=>{
  type Root=ReturnType<typeof createSyntheticPinnedRecoveryRoot>;type Binding=ReturnType<Root['bind']>;type Prior=ReturnType<ReturnType<typeof createSyntheticFinishRecoveryRoot>['bind']>;type Prep=ReturnType<Root['prepareWorkerRecovery']>;
  const binding:Binding extends Prior?true:false=false,proof:Prep extends SyntheticFinishContextEvidence?true:false=false;expect([binding,proof]).toEqual([false,false]);
});
it('never accepts a replacement source/window/release/receipt through preparation arguments',()=>{
  for(const field of ['source','window','release','receipt','rows','inputs','expected_context','owner','callback']){
    const f=begin();expect(()=>f.root.prepareWorkerRecovery(f.b,f.recovery,good,{[field]:{}})).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null});
  }
});
it('pins descriptor data and does not adopt mutations before or after bind',()=>{
  const raw=mixed(),root=createSyntheticPinnedRecoveryRoot(raw);raw.finish.inputs.length=0;raw.finish.header.target.instance_binding='SECRET';raw.accounting.requests=0;raw.active_input_sys_id=id(99);
  const b=root.bind(),r=root.claimRecovery(b,root.observe(b));root.prepareWorkerRecovery(b,r,good);expect(root.inspect().preparation).toMatchObject({selected:3,retained_inputs:3,accounting:{requests:10}});expect(JSON.stringify(root.inspect())).not.toContain('SECRET');
});
it.each(['kind','point','active_input_sys_id','accounting','consistency','finish','accounting.requests','accounting.received_bytes','accounting.payload_bytes'])('rejects missing descriptor %s',path=>{const raw=fixture();remove(raw,path);rejected(raw);});
it.each(['owner','source','window','release','receipt','seed','facts','pin','handoff','route','mode','issuer'])('does not register an existing %s at construction',field=>{const raw=fixture();write(raw,field,{});rejected(raw);});
it.each(['source','window','release','receipt','owner','accepted_outcome'])('rejects externally inserted pin input %s',field=>{const raw=fixture();write(raw,'finish.inputs.0.'+field,{});rejected(raw);});
it.each([
  ['kind','synthetic_finish_recovery_root_v1'],['point','phase_guard'],['active_input_sys_id',id(99)],['active_input_sys_id',{}],['consistency','complete'],['accounting.requests',211],['accounting.requests',-1],['accounting.requests',1.5],['accounting.received_bytes',16777217],['accounting.payload_bytes',8388609],['finish.time.upper_utc',O],['finish.inputs.0.retrieved_at',O],['finish.header.target.instance_binding','SECRET'],['finish.inputs.0.expected_context',undefined],
])('rejects invalid descriptor %s',(path,value)=>{const raw=fixture();write(raw,path as string,value);rejected(raw);});
it('rejects an active completed receipt and duplicate selected/input IDs instead of minting a replacement',()=>{
  const raw=mixed();raw.active_input_sys_id=id(2);rejected(raw);
  const duplicate=mixed();duplicate.finish.inputs.push(duplicate.finish.inputs[0]);rejected(duplicate);
  const selected=fixture();selected.finish.selected.push(id(1));rejected(selected);
});
it.each(['confirmed','rejected','unconfirmed'])('requires both old termination and cleanup confirmation (termination=%s)',termination=>{
  const f=begin();expect(()=>f.root.prepareWorkerRecovery(f.b,f.recovery,{termination,cleanup:termination==='confirmed'?'unconfirmed':'complete'})).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,closure:{termination,cleanup:termination==='confirmed'?'unconfirmed':'complete'}});
});
it('does not accept requested cleanup or missing/extra event fields as closure confirmation',()=>{
  for(const event of [{termination:'confirmed'}, {...good,context:{}},{termination:'confirmed',cleanup:'requested'},null]){const f=begin();expect(()=>f.root.prepareWorkerRecovery(f.b,f.recovery,event)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null});}
});
it('rejects a second preparation and any reuse after failure or discard',()=>{
  const f=begin();f.prepare();expect(f.prepare).toThrow('internal_review_error');expect(()=>f.root.bind()).toThrow('internal_review_error');
  const g=begin(),p=g.prepare();g.root.discardWorkerRecoveryPreparation(g.b,p);expect(()=>g.root.discardWorkerRecoveryPreparation(g.b,p)).toThrow('internal_review_error');expect(g.root.inspect().pins).toBeNull();
});
it.each(Array.from({length:12},(_,i)=>i+1))('stops at shared guard %i, clears pins and retains the first reason',at=>{
  let calls=0;const root=createSyntheticPinnedRecoveryRoot(fixture(),()=>++calls===at?'cancelled':undefined);
  expect(()=>{const b=root.bind(),r=root.claimRecovery(b,root.observe(b));root.prepareWorkerRecovery(b,r,good);}).toThrow('cancelled');
  expect(root.inspect()).toMatchObject({state:'failed',pins:null,diagnostics:{hard:{code:'cancelled'}},evidence_issues:0});root.revoke('deadline_exceeded');expect(()=>root.bind()).toThrow('cancelled');
});
it('rejects a swallowed preparation reentry in the shared guard',()=>{
  let f:ReturnType<typeof begin>,once=false;f=begin(fixture(),()=>{if(f&&!once){once=true;try{f.prepare();}catch{/* no resurrection */}}return undefined;});
  expect(f.prepare).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null});
});
it('does not hide a pending preparation in normal close',()=>{const f=begin();f.prepare();expect(()=>f.root.close(f.b)).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',pins:null,preparation:{held:false}});});
it('does not expose pin values, raw exceptions or lifecycle witnesses, and cannot issue from preparation',()=>{
  const f=begin();f.prepare();const text=JSON.stringify(f.root.inspect());for(const value of [S,O,U,id(1),'instance_binding','receipt','expected_context'])expect(text).not.toContain(value);
  for(const key of ['pins','input','seed','facts','source','core','handoff','claimWorkerGeneration','acceptRoute'])expect(Object.hasOwn(f.root,key)).toBe(false);
  expect(f.root.inspect().evidence_issues).toBe(0);
  const root=createSyntheticPinnedRecoveryRoot(fixture(),()=>{throw Error('SECRET');});expect(()=>root.bind()).toThrow('internal_review_error');expect(JSON.stringify(root.inspect())).not.toContain('SECRET');
});
it('does not invoke constructor/event getters and revokes pending private inputs on failure',()=>{
  let calls=0;const raw=fixture();Object.defineProperty(raw,'finish',{get(){calls++;throw Error('SECRET');}});rejected(raw);expect(calls).toBe(0);
  const f=begin(),event={};Object.defineProperty(event,'termination',{get(){calls++;throw Error('SECRET');}});Object.defineProperty(event,'cleanup',{value:'complete'});expect(()=>f.root.prepareWorkerRecovery(f.b,f.recovery,event)).toThrow('internal_review_error');expect(calls).toBe(0);expect(f.root.inspect().pins).toBeNull();
});
it('keeps deadline failure ahead of later cleanup/input errors and refuses a new root binding',()=>{
  let stop:string|undefined;const f=begin(fixture(),()=>stop);stop='deadline_exceeded';expect(f.prepare).toThrow('deadline_exceeded');stop=undefined;expect(()=>f.root.prepareWorkerRecovery(f.b,f.recovery,null)).toThrow('deadline_exceeded');expect(f.root.inspect()).toMatchObject({pins:null,diagnostics:{hard:{code:'deadline_exceeded'}}});
});
it.each([['confirmed','complete'],['not_required','complete'],['confirmed','not_required']] as const)('refuses unstarted closure event termination=%s cleanup=%s',(termination,cleanup)=>{
  const raw=fixture();raw.point='request_check_unstarted';const f=begin(raw);
  expect(()=>f.root.prepareWorkerRecovery(f.b,f.recovery,{termination,cleanup})).toThrow('internal_review_error');expect(f.root.inspect()).toMatchObject({state:'failed',route_bound:false,evidence_issues:0});
});
it('accepts not_required closure only for the unstarted origin (positive control)',()=>{
  const raw=fixture();raw.point='request_check_unstarted';const f=begin(raw);f.root.prepareWorkerRecovery(f.b,f.recovery,{termination:'not_required',cleanup:'not_required'});expect(f.root.inspect().state).toBe('worker_prepared');
});
it('rejects bind and observe extra arguments instead of accepting caller seed or facts',()=>{
  const a=createSyntheticPinnedRecoveryRoot(fixture());expect(()=>(a.bind as (...x:unknown[])=>unknown)({owner:{}})).toThrow('internal_review_error');
  const b=createSyntheticPinnedRecoveryRoot(fixture()),bb=b.bind();expect(()=>(b.observe as (...x:unknown[])=>unknown)(bb,{point:'SECRET'})).toThrow('internal_review_error');
});
it.each(['descriptor','accounting'] as const)('rejects a non-plain prototype %s even with valid own data properties',where=>{
  const raw=fixture();if(where==='descriptor')rejected(Object.assign(Object.create({inherited:true}),raw));
  else{write(raw,'accounting',Object.assign(Object.create({inherited:true}),raw.accounting));rejected(raw);}
});
it('does not invoke the external guard for a structurally invalid descriptor',()=>{
  let checks=0;const raw=fixture();write(raw,'kind','wrong');const root=createSyntheticPinnedRecoveryRoot(raw,()=>{checks++;return undefined;});
  expect(()=>root.bind()).toThrow('internal_review_error');expect(checks).toBe(0);
});
