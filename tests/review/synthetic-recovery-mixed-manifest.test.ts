import {expect,it} from 'vitest';
import {createSyntheticMixedRecoveryRoot,createSyntheticCapturedRecoveryRoot,createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {aggregate} from './fixtures/bp5-results.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
import {createSyntheticNonReviewedIssuer,createSyntheticNonReviewedManifestSupplier} from '../support/review/synthetic-recovery-nonreviewed-issuer.js';
const id=(n:number)=>n.toString(16).padStart(32,'0'),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
function fixture(){
  const a=aggregate();a.started_at=S;a.coverage.analysis_complete=false;a.collection={...a.collection,metadata_seen:2,selected:2};a.limits.max_records=100;
  return {raw:{kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(2),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
    header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:a.collection,coverage:a.coverage,limits:a.limits,limitations:a.limitations,errors:[]},selected:[id(1),id(2)],
    inputs:[{update_xml_sys_id:id(2),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'not_applicable',update_xml_sys_id:id(1),asset_type:'other',reason:'asset_type_unsupported'},{state:'not_processed',update_xml_sys_id:id(2),reason:'deadline_exceeded'}]}},
    events:[{kind:'metadata',row:{producer:'metadata',sys_id:id(1),name:'sys_dictionary_task_name',action:'INSERT_OR_UPDATE'}}]};
}
function setup(f:{raw:unknown;events:unknown}=fixture()){
  let guard:()=>string|undefined=()=>undefined;const root=createSyntheticMixedRecoveryRoot(f.raw,f.events,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease),plan=root.sealRecoveryPlan(b,ready),handoff=root.transferRecoveryPlan(b,plan);
  root.bindRecoveryPlan(b,handoff);const e=root.issueFinishContext(b,handoff),accepted=root.acceptRecoveryFinishContext(b,handoff,e);
  return {root,b,ticket,accepted,plan,handoff,arm:(fn:()=>string|undefined)=>{guard=fn;}};
}
it('seals a proven zero-reviewed partition with the same accepted plan and preserves terminal discard',()=>{
  const f=setup(),h=f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);expect(Reflect.ownKeys(h)).toEqual([]);
  expect(f.root.inspect().manifest_binding).toMatchObject({state:'sealed',selected:2,reviewed:0,nonreviewed:1,retained:1,empty_reviewed:true,transfers:1,pending:true,content_gate:false});
  f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);
  expect(f.root.inspect().manifest_binding).toMatchObject({state:'discarded',pending:false});
});
function combined(options:{omitted?:boolean;version3?:boolean;allRetained?:boolean;metadataInput?:boolean;parentOmission?:boolean;wrongReason?:boolean;wrongTime?:boolean}={}){
  const f=fixture(),a=aggregate(),body=a.assets[0],r=body.result,T='2026-10-17T04:59:02.000Z';
  body.update_xml_sys_id=r.target.update_xml_sys_id=id(2);r.reviewed_at=r.target.retrieved_at=T;r.target.record_updated_at='2026-10-17T04:58:00Z';
  f.raw.finish.header.instance_release=structuredClone(r.instance_release);f.raw.finish.header.target.update_set_sys_id=r.target.update_set_id;
  const expected={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  const context={update_xml_sys_id:id(2),applicable_rule_ids:body.applicable_rule_ids,reviewed_at:T,target:r.target,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  const inputs:unknown[]=[{update_xml_sys_id:id(2),retrieved_at:T,state:'completed',expected_context:expected,accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(2),retrieved_at:T}},
    {update_xml_sys_id:id(4),retrieved_at:T,state:'completed',expected_context:expected,accepted:options.parentOmission?{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(4),retrieved_at:T}:null},
    {update_xml_sys_id:id(5),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}];
  const analysis={state:options.omitted||options.parentOmission?'result_omitted':'rejected',update_xml_sys_id:id(4),reason:options.omitted||options.parentOmission?'response_limit':'invalid_xml'};
  const outcomes:unknown[]=[f.raw.finish.outcomes[0],{state:'reviewed',update_xml_sys_id:id(2)},{state:'retrieval_failed',update_xml_sys_id:id(3),reason:options.wrongReason?'changed_during_review':'payload_unavailable'},analysis,{state:'not_processed',update_xml_sys_id:id(5),reason:'deadline_exceeded'}];
  const events:unknown[]=[f.events[0],{kind:'reviewed',context,response:{id:1,ok:true,json:JSON.stringify(body)}},
    {kind:'retrieval',row:{producer:'retrieval',sys_id:id(3),name:'sys_script_'+id(33),action:'INSERT_OR_UPDATE'},event:{kind:'error',code:'not_found_or_not_visible',cleanup:'confirmed'}},
    {kind:'analysis',row:{producer:'analysis',sys_id:id(4),name:'sys_script_'+id(44),action:'INSERT_OR_UPDATE',retrieved_at:options.wrongTime?U:T},response:{id:1,ok:true,json:JSON.stringify(analysis)}}];
  if(options.metadataInput)inputs.unshift({update_xml_sys_id:id(1),retrieved_at:T,state:'completed',expected_context:null,accepted:null});
  const selected=options.allRetained?[id(5)]:[1,2,3,4,5].map(id);
  const header={...f.raw.finish.header,collection:{...f.raw.finish.header.collection,metadata_seen:selected.length,selected:selected.length},...(options.version3?{
    schema_version:'bp-mcp-review-0.3',selection:{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}},
    coverage:{...f.raw.finish.header.coverage,analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false},limitations:[...f.raw.finish.header.limitations,...TARGET_LIMITATIONS]}:{})};
  return {raw:{...f.raw,active_input_sys_id:id(5),finish:{...f.raw.finish,header,selected,inputs:options.allRetained?inputs.slice(-1):inputs,outcomes:options.allRetained?outcomes.slice(-1):outcomes}},events:options.allRetained?[]:events};
}
it.each([{}, {omitted:true}, {version3:true}])('seals a canonical reviewed/metadata/retrieval/analysis/retained partition %j',options=>{
  const f=setup(combined(options)),before=f.root.inspect();f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);const after=f.root.inspect();
  expect(after.manifest_binding).toMatchObject({state:'sealed',selected:5,reviewed:1,nonreviewed:3,retained:1,empty_reviewed:false,transfers:1,pending:true});
  for(const key of ['preparation','closure','new_generation','permissions'] as const)expect(after[key]).toEqual(before[key]);
  expect(after.permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});
});
it('accepts all-retained only with the original active input and proven empty partition',()=>{
  const f=setup(combined({allRetained:true}));f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);
  expect(f.root.inspect().manifest_binding).toMatchObject({selected:1,reviewed:0,nonreviewed:0,retained:1,empty_reviewed:true,pending:true});
});
it.each([{metadataInput:true},{parentOmission:true},{wrongTime:true}])('fails closed for incompatible original evidence %j',options=>{
  const f=combined(options),root=createSyntheticMixedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().manifest_binding.pending).toBe(false);
});
it('refuses a producer terminal whose reason differs from the private original outcome',()=>{
  const f=setup(combined({wrongReason:true}));expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');
  expect(f.root.inspect().manifest_binding).toMatchObject({state:'failed',pending:false,transfers:0});
});
it.each(['missing','extra','reordered','duplicate','copied_receipt','unknown_kind','sparse','oversize'] as const)('rejects %s events before producing a usable owner',kind=>{
  const f=combined();if(kind==='missing')f.events.pop();if(kind==='extra')f.events.push(f.events[0]);if(kind==='reordered')f.events.reverse();if(kind==='duplicate')f.events[2]=f.events[0];
  if(kind==='copied_receipt')f.events[0]={...(f.events[0] as object),receipt:{}};
  if(kind==='unknown_kind')f.events[0]={kind:'retained'};if(kind==='sparse')delete f.events[0];if(kind==='oversize')f.events=Array(101).fill(null);
  const root=createSyntheticMixedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().manifest_binding.pending).toBe(false);
});
it('rejects getters and proxies without executing caller code',()=>{
  let touches=0;for(const events of [new Proxy([],{get(){touches++;throw Error();}}),[Object.defineProperty({},'kind',{get(){touches++;throw Error();},enumerable:true})]]){
    const root=createSyntheticMixedRecoveryRoot(fixture().raw,events);expect(()=>root.bind()).toThrow('internal_review_error');
  }expect(touches).toBe(0);
});
it.each(['accepted','copy','binding','plan','handoff','summary'] as const)('refuses foreign %s without changing its owner',kind=>{
  const a=setup(),b=setup(),before=b.root.inspect(),value=kind==='accepted'?b.accepted:kind==='copy'?{...a.accepted}:kind==='plan'?a.plan:kind==='handoff'?a.handoff:kind==='summary'?a.root.inspect():a.accepted;
  expect(()=>a.root.sealMixedRecoveryFinishExpectation(kind==='binding'?b.b:a.b,value)).toThrow('internal_review_error');
  expect(a.root.inspect().manifest_binding).toMatchObject({state:'failed',pending:false,transfers:0});expect(b.root.inspect()).toEqual(before);
});
it.each(Array.from({length:8},(_,i)=>i+1))('rejects cancellation at combined guard %i without partial publication',point=>{
  const f=setup(combined());let n=0;f.arm(()=>++n===point?'cancelled':undefined);
  expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('cancelled');expect(n).toBeGreaterThanOrEqual(point);
  expect(f.root.inspect()).toMatchObject({state:'failed',manifest_binding:{pending:false,transfers:0},diagnostics:{hard:{code:'cancelled'}}});
  f.arm(()=>undefined);expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('cancelled');
});
it.each(['source','cleanup','discard','seal','revoke'] as const)('rejects swallowed %s reentry at every guard',operation=>{
  for(let point=1;point<=8;point++){
    const f=setup(combined());let n=0;f.arm(()=>{if(++n===point)try{
      if(operation==='source')f.root.beginSourceClose(f.b);else if(operation==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);else if(operation==='discard')f.root.discardAcceptedFinishContext(f.b,f.accepted);else if(operation==='revoke')f.root.revoke('cancelled');else f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);
    }catch{/* swallowed */}return undefined;});
    expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted)).toThrow();expect(f.root.inspect().manifest_binding).toMatchObject({state:'failed',pending:false,transfers:0});
  }
});
it.each(['source','cleanup'] as const)('invalidates on %s start but keeps accepted terminal responsibilities',operation=>{
  const f=setup(combined());f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);
  if(operation==='source'){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(f.root.inspect().manifest_binding).toMatchObject({state:'invalidated',pending:false,selected:5});expect(f.root.inspect().finish_accept?.terminal_pending).toBe(true);
  if(operation==='source')f.root.beginRecoveryCleanup(f.ticket.cleanup);else{f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}
  f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);expect(f.root.inspect().state).toBe('closed');
});
it('rejects double transfer and a copied opaque handle and preserves first hard through late cleanup',()=>{
  const f=setup(),h=f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);expect(Object.isFrozen(h)).toBe(true);
  expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,{...h})).toThrow('internal_review_error');f.root.revoke('cancelled');
  f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
  expect(f.root.inspect()).toMatchObject({manifest_binding:{pending:false,transfers:1},diagnostics:{hard:{code:'internal_review_error'}},new_generation:{cleanup:{status:'confirmed'}}});
});
it('preserves constructor stop and does not upgrade old root APIs or diagnostics',()=>{
  const f=fixture(),root=createSyntheticMixedRecoveryRoot(f.raw,f.events,()=>'receive_budget_exceeded');expect(()=>root.bind()).toThrow('receive_budget_exceeded');
  const old=createSyntheticPinnedRecoveryRoot(f.raw),capture=createSyntheticCapturedRecoveryRoot(f.raw,[]);
  for(const r of [old,capture]){expect(r).not.toHaveProperty('sealMixedRecoveryFinishExpectation');expect(r.inspect()).not.toHaveProperty('manifest_binding');}
  const fresh=createSyntheticMixedRecoveryRoot(f.raw,f.events);expect(fresh).not.toHaveProperty('sealRecoveryFinishExpectation');expect(fresh).not.toHaveProperty('sealCapturedRecoveryFinishExpectation');
});
it('pins caller data and exposes only bounded counts, never body or row identity',()=>{
  const f=combined(),root=createSyntheticMixedRecoveryRoot(f.raw,f.events);f.events.reverse();f.raw.finish.selected.reverse();expect(()=>root.bind()).not.toThrow();
  const text=JSON.stringify(root.inspect());for(const marker of ['sys_dictionary_task_name','findings','code_hash','instance_binding',id(1),id(2)])expect(text).not.toContain(marker);
});
it.each(['cancelled','deadline_exceeded','payload_budget_exceeded'] as const)('retains %s through manifest failure and late cleanup',reason=>{
  const f=setup();let n=0;f.arm(()=>++n===5?reason:undefined);expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted)).toThrow(reason);
  f.arm(()=>undefined);f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.revoke('internal_review_error');
  expect(f.root.inspect()).toMatchObject({manifest_binding:{state:'failed',pending:false,selected:2},diagnostics:{hard:{code:reason}},new_generation:{cleanup:{status:'confirmed'}}});
});
it('does not interpret no selected rows or no active original input as an empty reviewed proof',()=>{
  for(const noRows of [true,false]){const f=fixture();if(noRows){f.raw.finish.selected=[];f.raw.finish.outcomes=[];}f.raw.finish.inputs=[];
    const root=createSyntheticMixedRecoveryRoot(f.raw,[]);expect(()=>root.bind()).toThrow('internal_review_error');}
});
it('drops the partition on preparation discard before any new generation starts',()=>{
  const f=fixture(),root=createSyntheticMixedRecoveryRoot(f.raw,f.events),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'});
  root.discardWorkerRecoveryPreparation(b,p);expect(root.inspect().manifest_binding).toMatchObject({state:'discarded',pending:false,transfers:0});
});
it('keeps a mixed seal nominally distinct from the old content handle',()=>{
  const f=setup(),mixed=f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted);
  // @ts-expect-error Mixed partitions are not a reviewed-only captured expectation.
  const old:ReturnType<ReturnType<typeof createSyntheticCapturedRecoveryRoot>['sealCapturedRecoveryFinishExpectation']>=mixed;
  void old;expect(Reflect.ownKeys(mixed)).toEqual([]);
});
function supplierFixture(size=2){
  const rows=Array.from({length:size},(_,i)=>({producer:'metadata',sys_id:id(i+1),name:i%2?'sys_choice_task_state':'sys_dictionary_task_name',action:'INSERT_OR_UPDATE'}));
  const raw={kind:'synthetic_nonreviewed_issuer_v1',schema_version:'bp-mcp-review-0.2',requested_rule_ids:['AU-BR-001'],rows};
  const expected=rows.map(r=>({schema_version:'bp-mcp-review-0.2',producer:'metadata',outcome:{state:'not_applicable',update_xml_sys_id:r.sys_id,asset_type:'other',reason:'asset_type_unsupported'}}));
  return {raw,expected};
}
it('consumes the exact private producer evidence set once, independent of issue order',()=>{
  const f=supplierFixture(),root=createSyntheticNonReviewedManifestSupplier(f.raw,{guard:()=>undefined},f.expected);
  root.issueClassified(root.rows[1]);root.issueClassified(root.rows[0]);const h=root.sealManifest();expect(Reflect.ownKeys(h)).toEqual([]);
  expect(root.summary()).toMatchObject({state:'sealed',pending_evidence:0,manifest:{started:true,transfers:1,pending:true}});
  root.discardManifest(h);expect(root.summary()).toMatchObject({state:'discarded',manifest:{pending:false}});
});
it.each(['missing','discarded','mismatch','reordered','duplicate_expected'] as const)('refuses a %s producer evidence set',kind=>{
  const f=supplierFixture();if(kind==='mismatch')f.expected[1].outcome.asset_type='client_script';if(kind==='reordered')f.expected.reverse();if(kind==='duplicate_expected')f.expected[1]=f.expected[0];
  const exercise=()=>{const root=createSyntheticNonReviewedManifestSupplier(f.raw,{guard:()=>undefined},f.expected);const h=root.issueClassified(root.rows[0]);if(kind!=='missing')root.issueClassified(root.rows[1]);if(kind==='discarded')root.discardEvidence(h);root.sealManifest();};
  expect(exercise).toThrow('internal_review_error');
});
it.each(['pre','post'] as const)('does not publish a nonreviewed manifest on the %s guard stop',phase=>{
  const f=supplierFixture(1),root=createSyntheticNonReviewedManifestSupplier(f.raw,{guard:(op,p)=>op==='manifest_seal'&&p===phase?'cancelled':undefined},f.expected);root.issueClassified(root.rows[0]);
  expect(()=>root.sealManifest()).toThrow('cancelled');expect(root.summary()).toMatchObject({state:'failed',pending_evidence:0,manifest:{pending:false,transfers:0}});expect(()=>root.sealManifest()).toThrow('cancelled');
});
it('rejects foreign manifest discard, and no old issuer exposes a manifest upgrade',()=>{
  const f=supplierFixture(1),a=createSyntheticNonReviewedManifestSupplier(f.raw,{guard:()=>undefined},f.expected),b=createSyntheticNonReviewedManifestSupplier(f.raw,{guard:()=>undefined},f.expected);
  a.issueClassified(a.rows[0]);b.issueClassified(b.rows[0]);a.sealManifest();const h=b.sealManifest(),before=b.summary();expect(()=>a.discardManifest(h)).toThrow('internal_review_error');expect(b.summary()).toEqual(before);
  const old=createSyntheticNonReviewedIssuer(f.raw,{guard:()=>undefined});expect(old).not.toHaveProperty('sealManifest');expect(old.summary()).not.toHaveProperty('manifest');
  // @ts-expect-error Legacy issuer diagnostics do not acquire a manifest surface.
  void old.summary().manifest;
});
it('supports the exact 100-row bound and refuses 101 without relaxing original pin limits',()=>{
  const f=supplierFixture(100),root=createSyntheticNonReviewedManifestSupplier(f.raw,{guard:()=>undefined},f.expected);for(const row of root.rows)root.issueClassified(row);root.sealManifest();expect(root.summary().issued.metadata).toBe(100);
  const over=supplierFixture(101);expect(()=>createSyntheticNonReviewedManifestSupplier(over.raw,{guard:()=>undefined},over.expected)).toThrow('internal_review_error');
});
it('binds a retrieval failure to an existing completed input only when it has no analysis context',()=>{
  const f=combined();f.raw.finish.inputs.splice(1,0,{update_xml_sys_id:id(3),retrieved_at:'2026-10-17T04:59:02.000Z',state:'completed',expected_context:null,accepted:null});
  const x=setup(f);x.root.sealMixedRecoveryFinishExpectation(x.b,x.accepted);expect(x.root.inspect().manifest_binding.pending).toBe(true);
});
it.each(['missing_input','wrong_reason','unknown_cleanup'] as const)('refuses analysis/cleanup drift %s without retaining a manifest',kind=>{
  const f=combined();if(kind==='missing_input')f.raw.finish.inputs.splice(1,1);
  if(kind==='wrong_reason')f.events[3]={kind:'analysis',row:{producer:'analysis',sys_id:id(4),name:'sys_script_'+id(44),action:'INSERT_OR_UPDATE',retrieved_at:'2026-10-17T04:59:02.000Z'},response:{id:1,ok:true,json:JSON.stringify({state:'rejected',update_xml_sys_id:id(4),reason:'missing_script'})}};
  if(kind==='unknown_cleanup')f.events[2]={kind:'retrieval',row:{producer:'retrieval',sys_id:id(3),name:'sys_script_'+id(33),action:'INSERT_OR_UPDATE'},event:{kind:'error',code:'not_found_or_not_visible',cleanup:'unconfirmed'}};
  const root=createSyntheticMixedRecoveryRoot(f.raw,f.events);if(kind==='wrong_reason'){const x=setup(f);expect(()=>x.root.sealMixedRecoveryFinishExpectation(x.b,x.accepted)).toThrow('internal_review_error');expect(x.root.inspect().manifest_binding.pending).toBe(false);}else expect(()=>root.bind()).toThrow('internal_review_error');
});
it('consumes the claim even when extra transfer arguments are rejected',()=>{
  const f=setup();expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted,{})).toThrow('internal_review_error');
  expect(()=>f.root.sealMixedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');expect(f.root.inspect().manifest_binding.transfers).toBe(0);
});
it('seals a full 100-row metadata/retained partition, including Choice names',()=>{
  const f=fixture(),last={update_xml_sys_id:id(100),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null};
  const outcomes=[...Array.from({length:99},(_,i)=>({state:'not_applicable',update_xml_sys_id:id(i+1),asset_type:'other',reason:'asset_type_unsupported'})),{state:'not_processed',update_xml_sys_id:id(100),reason:'deadline_exceeded'}];
  const raw={...f.raw,active_input_sys_id:id(100),finish:{...f.raw.finish,selected:Array.from({length:100},(_,i)=>id(i+1)),inputs:[last],outcomes,header:{...f.raw.finish.header,collection:{...f.raw.finish.header.collection,metadata_seen:100,selected:100}}}};
  const events=Array.from({length:99},(_,i)=>({kind:'metadata',row:{producer:'metadata',sys_id:id(i+1),name:i%2?'sys_choice_task_state':'sys_dictionary_task_name',action:'INSERT_OR_UPDATE'}}));
  const x=setup({raw,events});x.root.sealMixedRecoveryFinishExpectation(x.b,x.accepted);expect(x.root.inspect().manifest_binding).toMatchObject({selected:100,reviewed:0,nonreviewed:99,retained:1,pending:true});
});
it('refuses a retrieval failure bound to a completed input that already carries an analysis context',()=>{
  const f=combined(),inputs=f.raw.finish.inputs as Record<string,unknown>[];
  inputs.splice(1,0,{update_xml_sys_id:id(3),retrieved_at:'2026-10-17T04:59:02.000Z',state:'completed',expected_context:inputs[0].expected_context,accepted:null});
  const root=createSyntheticMixedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().manifest_binding).toMatchObject({state:'failed',pending:false});
});
it('refuses an analysis outcome whose completed input has no expected analysis context',()=>{
  const f=combined();(f.raw.finish.inputs as Record<string,unknown>[])[1].expected_context=null;
  const root=createSyntheticMixedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().manifest_binding).toMatchObject({state:'failed',pending:false});
});
it('rejects a shorter expected evidence list at supplier construction, before any issue',()=>{
  const f=supplierFixture(2);expect(()=>createSyntheticNonReviewedManifestSupplier(f.raw,{guard:()=>undefined},f.expected.slice(0,1))).toThrow('internal_review_error');
});
