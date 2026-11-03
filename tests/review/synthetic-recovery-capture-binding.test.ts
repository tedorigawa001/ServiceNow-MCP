import {expect,it} from 'vitest';
import {createSyntheticCapturedRecoveryRoot,createSyntheticPinnedRecoveryRoot} from '../support/review/synthetic-pinned-recovery-root.js';
import {aggregate} from './fixtures/bp5-results.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
const id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){
  const run=aggregate(),asset=run.assets[0],r=asset.result,T='2026-10-17T04:59:02.000Z',U='2026-10-17T04:59:03.000Z';
  r.target.update_xml_sys_id=id(1);asset.update_xml_sys_id=id(1);r.target.retrieved_at=T;r.reviewed_at=T;r.target.record_updated_at='2026-10-17T04:58:00Z';
  run.started_at='2026-10-17T04:59:00.000Z';run.instance_release=structuredClone(r.instance_release);run.target.update_set_sys_id=r.target.update_set_id;
  run.collection={...run.collection,metadata_seen:2,selected:2};run.coverage.analysis_complete=false;run.limits.max_records=100;
  const context={update_xml_sys_id:id(1),applicable_rule_ids:asset.applicable_rule_ids,reviewed_at:T,target:r.target,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  const raw={kind:'synthetic_pinned_recovery_root_v1',point:'analyze_timer',active_input_sys_id:id(2),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified',finish:{kind:'synthetic_finish_seed_v1',time:{started_at:run.started_at,deadline_ms:60000,observed_at:'2026-10-17T04:59:01.000Z',upper_utc:U},
    header:{schema_version:run.schema_version,target:run.target,versions:run.versions,started_at:run.started_at,instance_release:run.instance_release,release_match:run.release_match,principal:run.principal,collection:run.collection,coverage:run.coverage,limits:run.limits,limitations:run.limitations,errors:[]},selected:[id(1),id(2)],
    inputs:[{update_xml_sys_id:id(1),retrieved_at:T,state:'completed',expected_context:{record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations},accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(1),retrieved_at:T}},
      {update_xml_sys_id:id(2),retrieved_at:U,state:'not_processed',expected_context:null,accepted:null}],outcomes:[{state:'reviewed',update_xml_sys_id:id(1)},{state:'not_processed',update_xml_sys_id:id(2),reason:'deadline_exceeded'}]}};
  return {raw,events:[{context,response:{id:1,ok:true,json:JSON.stringify(asset)}}]};
}
function setup(f=fixture()){
  let guard:()=>string|undefined=()=>undefined;
  const root=createSyntheticCapturedRecoveryRoot(f.raw,f.events,()=>guard()),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'}),ticket=root.claimRecoveryGeneration(b,p),lease=root.startRecoveryGeneration(b,ticket.start),ready=root.acceptRecoveryReady(b,lease),plan=root.sealRecoveryPlan(b,ready),handoff=root.transferRecoveryPlan(b,plan);
  root.bindRecoveryPlan(b,handoff);const evidence=root.issueFinishContext(b,handoff),accepted=root.acceptRecoveryFinishContext(b,handoff,evidence);
  return {root,b,ticket,accepted,plan,handoff,arm:(fn:()=>string|undefined)=>{guard=fn;}};
}
it('binds the same private receipts and accepted plan to a one-shot opaque content handle',()=>{
  const f=setup(),handle=f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);
  expect(Reflect.ownKeys(handle)).toEqual([]);expect(f.root.inspect().capture_binding).toMatchObject({state:'sealed',receipts:1,transfers:1,pending:true,authority:'none'});
  f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
  f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);expect(f.root.inspect().capture_binding).toMatchObject({pending:false,state:'discarded'});
});
it('preserves cancellation at the capture transfer guard after the old seal succeeds',()=>{
  const f=setup();let n=0;f.arm(()=>++n===3?'cancelled':undefined);
  expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('cancelled');
  expect(f.root.inspect().diagnostics.hard?.code).toBe('cancelled');expect(f.root.inspect().capture_binding.pending).toBe(false);
});
it('preserves cancellation during constructor capture without leaving a usable root',()=>{
  const f=fixture(),root=createSyntheticCapturedRecoveryRoot(f.raw,f.events,()=>'cancelled');
  expect(()=>root.bind()).toThrow('cancelled');expect(root.inspect().capture_binding).toMatchObject({state:'failed',pending:false});
});
it('preserves an existing shared-budget stop at the capture-only transfer guard',()=>{
  const f=setup();let n=0;f.arm(()=>++n===3?'receive_budget_exceeded':undefined);
  expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('receive_budget_exceeded');
});
function release(f:ReturnType<typeof setup>){
  f.arm(()=>undefined);if(!f.root.inspect().lifecycle?.source_close_started){f.root.beginSourceClose(f.b);f.root.settleSourceClose(f.b,'closed');}
  if(!f.root.inspect().lifecycle?.cleanup_started)f.root.beginRecoveryCleanup(f.ticket.cleanup);
  if(f.root.inspect().new_generation?.cleanup_pending)f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');
}
it('keeps both old API and structure-only diagnostics unchanged',()=>{
  const f=fixture(),old=createSyntheticPinnedRecoveryRoot(f.raw),fresh=createSyntheticCapturedRecoveryRoot(f.raw,f.events);
  expect(old).not.toHaveProperty('sealCapturedRecoveryFinishExpectation');expect(old.inspect()).not.toHaveProperty('capture_binding');
  expect(fresh).not.toHaveProperty('sealRecoveryFinishExpectation');expect(fresh.inspect().permissions).toEqual({formal_issuance:false,dispatch:false,recovery_route:false});
});
it.each(['accepted','copy','binding','plan','handoff','summary'] as const)('rejects mixed %s without consuming another owner',kind=>{
  const a=setup(),b=setup(),before=b.root.inspect();
  const value=kind==='accepted'?b.accepted:kind==='copy'?{...a.accepted}:kind==='plan'?a.plan:kind==='handoff'?a.handoff:kind==='summary'?a.root.inspect():a.accepted;
  expect(()=>a.root.sealCapturedRecoveryFinishExpectation(kind==='binding'?b.b:a.b,value)).toThrow('internal_review_error');
  expect(a.root.inspect().capture_binding).toMatchObject({pending:false,state:'failed',transfers:0});expect(b.root.inspect()).toEqual(before);
});
it('does not upgrade an accepted handle from the legacy root',()=>{
  const a=setup(),old=createSyntheticPinnedRecoveryRoot(fixture().raw),b=old.bind(),r=old.claimRecovery(b,old.observe(b)),p=old.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'}),t=old.claimRecoveryGeneration(b,p),l=old.startRecoveryGeneration(b,t.start),ready=old.acceptRecoveryReady(b,l),plan=old.sealRecoveryPlan(b,ready),h=old.transferRecoveryPlan(b,plan);
  old.bindRecoveryPlan(b,h);const e=old.issueFinishContext(b,h),accepted=old.acceptRecoveryFinishContext(b,h,e);
  expect(()=>a.root.sealCapturedRecoveryFinishExpectation(a.b,accepted)).toThrow('internal_review_error');expect(old.inspect().finish_accept?.pending).toBe(true);
});
it.each([1,2,3,4])('refuses cancellation at fixed combined guard %i without publishing partial content',point=>{
  const f=setup();let n=0;f.arm(()=>++n===point?'cancelled':undefined);
  expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('cancelled');
  expect(f.root.inspect()).toMatchObject({state:'failed',capture_binding:{started:true,pending:false,transfers:0},finish_seal:{pending:false},diagnostics:{hard:{code:'cancelled'}}});
  f.arm(()=>undefined);expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('cancelled');
});
it('gives post-guard stop priority over mismatched accepted identity',()=>{
  const f=setup();let n=0;f.arm(()=>++n===2?'deadline_exceeded':undefined);
  expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,{})).toThrow('deadline_exceeded');
});
it.each(['source','cleanup','revoke','seal','discard'] as const)('refuses swallowed %s reentry at each combined guard',operation=>{
  for(const point of [1,2,3,4]){
    const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
      if(operation==='source')f.root.beginSourceClose(f.b);
      else if(operation==='cleanup')f.root.beginRecoveryCleanup(f.ticket.cleanup);
      else if(operation==='revoke')f.root.revoke('cancelled');
      else if(operation==='discard')f.root.discardAcceptedFinishContext(f.b,f.accepted);
      else f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);
    }catch{/* deliberately swallowed */}return undefined;});
    expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted)).toThrow();
    expect(f.root.inspect().capture_binding).toMatchObject({pending:false,transfers:0,state:'failed'});
  }
});
it.each(['source','cleanup'] as const)('invalidates capture synchronously at %s start while retaining accepted cleanup responsibility',operation=>{
  const f=setup();f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);
  if(operation==='source')f.root.beginSourceClose(f.b);else f.root.beginRecoveryCleanup(f.ticket.cleanup);
  expect(f.root.inspect().capture_binding).toMatchObject({state:'invalidated',pending:false,transfers:1});
  expect(f.root.inspect().finish_accept?.terminal_pending).toBe(true);
  if(operation==='source')f.root.settleSourceClose(f.b,'closed');release(f);
  f.root.discardAcceptedFinishContext(f.b,f.accepted);f.root.close(f.b);expect(f.root.inspect().state).toBe('closed');
});
it('rejects double transfer and removes both original and captured seal without revival',()=>{
  const f=setup(),h=f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);
  expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted)).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({finish_seal:{pending:false},capture_binding:{pending:false,transfers:1}});
  expect(()=>f.root.sealCapturedRecoveryFinishExpectation(f.b,h)).toThrow('internal_review_error');
});
it.each(['cancelled','deadline_exceeded'] as const)('drops content on %s and retains first hard after late cleanup',reason=>{
  const f=setup();f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);f.root.revoke(reason);f.root.beginRecoveryCleanup(f.ticket.cleanup);f.root.recordRecoveryCleanup(f.ticket.cleanup,'confirmed');f.root.revoke('internal_review_error');
  expect(f.root.inspect()).toMatchObject({capture_binding:{state:'failed',pending:false},diagnostics:{hard:{code:reason}},new_generation:{cleanup:{status:'confirmed'}}});
});
it('keeps original accounting, generation and time facts unchanged across capture transfer',()=>{
  const f=setup(),before=f.root.inspect();f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);const after=f.root.inspect();
  for(const key of ['preparation','closure','new_generation'] as const)expect(after[key]).toEqual(before[key]);
  expect(after.permissions).toEqual(before.permissions);expect(after.capture_binding.content_gate).toBe(false);
});
it.each(['missing','extra','wrong_id','wrong_T','wrong_set','wrong_release','wrong_rules','wrong_warning','omitted','bad_json','extra_event_key'] as const)('fails constructor closed for %s',kind=>{
  const f=fixture();
  if(kind==='missing')f.events=[];
  if(kind==='extra')f.events.push(f.events[0]);
  if(kind==='wrong_id')f.events[0].context.update_xml_sys_id=id(9);
  if(kind==='wrong_T')f.events[0].context.reviewed_at='2026-10-17T04:59:02.500Z';
  if(kind==='wrong_set')f.events[0].context.target.update_set_id=id(99);
  if(kind==='wrong_release')f.events[0].context.instance_release.config_version='e'.repeat(64);
  if(kind==='wrong_rules')f.events[0].context.requested_rule_ids=['AU-BR-002'];
  if(kind==='wrong_warning')f.events[0].context.release_limitations=[];
  if(kind==='omitted')f.raw.finish.outcomes[0]={state:'result_omitted',update_xml_sys_id:id(1)};
  if(kind==='bad_json')f.events[0].response.json='{}';
  if(kind==='extra_event_key')Object.assign(f.events[0],{receipt:{}});
  const root=createSyntheticCapturedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');
  expect(root.inspect().capture_binding).toMatchObject({state:'failed',pending:false});
});
it('rejects event accessors and proxies without touching caller code',()=>{
  let touched=0;
  for(const events of [new Proxy([],{get(){touched++;throw Error();}}),[Object.defineProperty({},'context',{get(){touched++;throw Error();},enumerable:true})]]){
    const root=createSyntheticCapturedRecoveryRoot(fixture().raw,events);expect(()=>root.bind()).toThrow('internal_review_error');
  }expect(touched).toBe(0);
});
it('does not retain caller mutations or expose receipt/body fields in diagnostics',()=>{
  const f=fixture(),root=createSyntheticCapturedRecoveryRoot(f.raw,f.events);f.events[0].response.json='changed secret';f.events[0].context.target.code_hash='e'.repeat(64);
  expect(()=>root.bind()).not.toThrow();const text=JSON.stringify(root.inspect());for(const marker of ['changed secret','findings','code_hash','receipt','instance_binding'])expect(text).not.toContain('"'+marker+'"');
});
it('keeps the content handle distinct from the old structure-only seal type',()=>{
  const f=setup(),content=f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);
  // @ts-expect-error Content ownership is not an old structure-only sealed expectation.
  const wrong:ReturnType<ReturnType<typeof createSyntheticPinnedRecoveryRoot>['sealRecoveryFinishExpectation']>=content;
  void wrong;expect(Object.isFrozen(content)).toBe(true);
});
it('supports 0.3 plan facts without changing selection or enabling admission',()=>{
  const f=fixture();Object.assign(f.raw.finish.header,{schema_version:'bp-mcp-review-0.3',selection:{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}}});
  Object.assign(f.raw.finish.header.coverage,{analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false});f.raw.finish.header.limitations=[...f.raw.finish.header.limitations,...TARGET_LIMITATIONS];
  const x=setup(f);x.root.sealCapturedRecoveryFinishExpectation(x.b,x.accepted);expect(x.root.inspect().capture_binding.pending).toBe(true);
});
it('drops captures when preparation takes the fixed non-executable discard path',()=>{
  const f=fixture(),root=createSyntheticCapturedRecoveryRoot(f.raw,f.events),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'});
  root.discardWorkerRecoveryPreparation(b,p);expect(root.inspect().capture_binding).toMatchObject({state:'discarded',pending:false});
});
function twoReviewed(){
  const f=fixture(),T='2026-10-17T04:59:02.500Z',last=f.raw.finish.inputs[1];last.update_xml_sys_id=id(3);f.raw.finish.outcomes[1].update_xml_sys_id=id(3);f.raw.active_input_sys_id=id(3);
  f.raw.finish.selected=[id(1),id(2),id(3)];f.raw.finish.header.collection.selected=f.raw.finish.header.collection.metadata_seen=3;
  const completed=structuredClone(f.raw.finish.inputs[0]);if(!completed.expected_context)throw Error('fixture must start with a completed context');
  f.raw.finish.inputs.splice(1,0,{...completed,expected_context:completed.expected_context,update_xml_sys_id:id(2),retrieved_at:T,accepted:{kind:'synthetic_reviewed_pin',update_xml_sys_id:id(2),retrieved_at:T}});
  f.raw.finish.outcomes.splice(1,0,{state:'reviewed',update_xml_sys_id:id(2)});
  const next=structuredClone(f.events[0]);next.context.update_xml_sys_id=next.context.target.update_xml_sys_id=id(2);next.context.reviewed_at=next.context.target.retrieved_at=T;
  const body=JSON.parse(next.response.json);body.update_xml_sys_id=body.result.target.update_xml_sys_id=id(2);body.result.reviewed_at=body.result.target.retrieved_at=T;next.response={id:2,ok:true,json:JSON.stringify(body)};f.events.push(next);return f;
}
type Body=ReturnType<typeof aggregate>['assets'][number]&{state:'reviewed'};
function eventFor(body:Body,n=1){
  const r=body.result;
  return {context:{update_xml_sys_id:body.update_xml_sys_id,applicable_rule_ids:body.applicable_rule_ids,reviewed_at:r.reviewed_at,target:r.target,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations},response:{id:n,ok:true,json:JSON.stringify(body)}};
}
// Change the delivered body and its context together, so only the private pins can detect the mismatch.
function consistent(change:(body:Body)=>void){const f=fixture(),body=JSON.parse(f.events[0].response.json) as Body;change(body);f.events[0]=eventFor(body);return f;}
it('accepts the unchanged self-consistent event used by the pin mismatch cases',()=>{
  const f=setup(consistent(()=>{}));f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);expect(f.root.inspect().capture_binding).toMatchObject({state:'sealed',pending:true});
});
it.each([
  ['reviewed_at',(b:Body)=>{b.result.reviewed_at='2026-10-17T04:59:02.500Z';}],
  ['target_retrieved_at',(b:Body)=>{b.result.target.retrieved_at='2026-10-17T04:59:01.500Z';}],
  ['record_updated_at',(b:Body)=>{b.result.target.record_updated_at='2026-10-17T04:57:00Z';}],
  ['update_set',(b:Body)=>{b.result.target.update_set_id=id(99);}],
  ['release',(b:Body)=>{Object.assign(b.result.instance_release,{config_version:'e'.repeat(64)});}],
  ['id',(b:Body)=>{b.update_xml_sys_id=b.result.target.update_xml_sys_id=id(9);}],
  ['applicable_rules',(b:Body)=>{b.applicable_rule_ids=['AU-BR-002'];}],
] as const)('rejects a self-consistent analyze event whose %s disagrees with the private pins',(_name,change)=>{
  const f=consistent(change),root=createSyntheticCapturedRecoveryRoot(f.raw,f.events);
  expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().capture_binding).toMatchObject({state:'failed',pending:false,receipts:0});
});
it('rejects an extra self-consistent event for a not_processed input instead of retaining an unlinked capture',()=>{
  const f=fixture(),body=JSON.parse(f.events[0].response.json) as Body;body.update_xml_sys_id=body.result.target.update_xml_sys_id=id(2);f.events.push(eventFor(body,2));
  const root=createSyntheticCapturedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');
  expect(root.inspect().capture_binding).toMatchObject({state:'failed',pending:false,receipts:0});
});
it('drops captures synchronously on the non-executable summary terminal',()=>{
  const f=fixture(),root=createSyntheticCapturedRecoveryRoot(f.raw,f.events),b=root.bind(),r=root.claimRecovery(b,root.observe(b)),p=root.prepareWorkerRecovery(b,r,{termination:'confirmed',cleanup:'complete'});
  const t=root.claimRecoveryGeneration(b,p),ready=root.acceptRecoveryReady(b,root.startRecoveryGeneration(b,t.start)),plan=root.sealRecoveryPlan(b,ready);root.summarizeRecoveryPlan(b,plan);
  expect(root.inspect()).toMatchObject({state:'consumed',capture_binding:{state:'discarded',pending:false}});
});
it('preserves a shared-budget stop raised during constructor capture',()=>{
  const f=fixture();let n=0;const root=createSyntheticCapturedRecoveryRoot(f.raw,f.events,()=>++n===1?'receive_budget_exceeded':undefined);
  expect(()=>root.bind()).toThrow('receive_budget_exceeded');expect(root.inspect().capture_binding).toMatchObject({state:'failed',pending:false});
});
it('uses two distinct original receipts in canonical order, without rebuilding them by ID',()=>{
  const f=setup(twoReviewed());f.root.sealCapturedRecoveryFinishExpectation(f.b,f.accepted);expect(f.root.inspect().capture_binding).toMatchObject({receipts:2,transfers:1,pending:true});
});
it('rejects reversed analyze events before creating a usable owner',()=>{
  const f=twoReviewed();f.events.reverse();const root=createSyntheticCapturedRecoveryRoot(f.raw,f.events);expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().capture_binding.pending).toBe(false);
});
