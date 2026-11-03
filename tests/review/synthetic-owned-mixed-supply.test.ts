import {expect,it} from 'vitest';
import {createSyntheticOwnedMixedSupply} from '../support/review/synthetic-recovery-kernel.js';
import type {PreparedOwnedMixedSupply} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
const id=(n:number)=>n.toString(16).padStart(32,'0');
const S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',T='2026-10-17T04:59:02.000Z',U='2026-10-17T04:59:03.000Z';
function fixture(){
  const a=aggregate(),asset=(n:number,count:number)=>{
    const body=aggregate().assets[0];body.update_xml_sys_id=body.result.target.update_xml_sys_id=id(n);
    body.result.reviewed_at=body.result.target.retrieved_at=T;body.result.target.record_updated_at='2026-10-17T04:58:00Z';
    body.result.findings=Array.from({length:count},()=>structuredClone(body.result.findings[0]));return body;
  };
  const first=asset(1,99),second=asset(3,2),r=first.result;
  const context={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  const rows=[{producer:'analysis',outcome:first},{producer:'metadata',outcome:{state:'not_applicable',update_xml_sys_id:id(2),asset_type:'other',reason:'asset_type_unsupported'}},
    {producer:'analysis',outcome:second},{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id(4),reason:'response_limit'}},
    {producer:'retrieval',outcome:{state:'retrieval_failed',update_xml_sys_id:id(5),reason:'payload_unavailable'}},
    {producer:'analysis',outcome:{state:'rejected',update_xml_sys_id:id(6),reason:'invalid_xml'}},
    {producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id(7),reason:'deadline_exceeded'}}];
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id(7),accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},
      header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
        collection:{...a.collection,metadata_seen:7,selected:7},coverage:{...a.coverage,analysis_complete:false},limits:{...a.limits,max_records:100},limitations:[...a.limitations],errors:[] as unknown[]},
      selected:rows.map((_,i)=>id(i+1)),inputs:[1,3,4,6,7].map(n=>({update_xml_sys_id:id(n),retrieved_at:n===7?U:T,state:n===7?'not_processed':'completed',expected_context:n===7?null:structuredClone(context)}))},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[] as unknown[]},rows}};
}
it('prepares one owned mixed supply with shared pins and row identities, without an accepted route',()=>{
  const root=createSyntheticOwnedMixedSupply(fixture(),{guard:()=>undefined}),prepared=root.prepare();
  expect(Reflect.ownKeys(prepared)).toEqual([]);expect(Object.isFrozen(prepared)).toBe(true);
  expect(root.inspect()).toMatchObject({authority:'none',state:'prepared',started:true,preparations:1,pins_created:1,pending:true,
    selected:7,linked_rows:7,inputs:5,original_reviewed_pins:2,parent_omitted:1,original_worker_omitted:1,retained:1,kept_findings:99,
    permissions:{accepted_adoption:false,destination_seal:false,formal_issuance:false}});
  for(const key of ['bind','acceptRecoveryFinishContext','sealBoundMixedExpectation','transfer','pins','body'])expect(root).not.toHaveProperty(key);
  root.discardPrepared(prepared);expect(root.inspect()).toMatchObject({state:'discarded',pending:false,retained_rows:0});
});
function setup(raw:unknown=fixture()){
  let fn:(stage:string,ordinal?:number)=>unknown=()=>undefined;
  const root=createSyntheticOwnedMixedSupply(raw,{guard:(stage:string,n?:number)=>fn(stage,n)});
  return {root,arm:(next:typeof fn)=>{fn=next;}};
}
function expectRejected(raw:unknown){
  const root=createSyntheticOwnedMixedSupply(raw,{guard:()=>undefined});expect(()=>root.prepare()).toThrow('internal_review_error');
  expect(root.inspect()).toMatchObject({state:'failed',preparations:0,pending:false,retained_rows:0});expect(()=>root.prepare()).toThrow();return root.inspect();
}
it('consumes the prepare claim once and discards prepared ownership only through its same handle',()=>{
  const a=setup(),b=setup(),pa=a.root.prepare(),pb=b.root.prepare(),before=b.root.inspect();
  expect(()=>a.root.discardPrepared(pb)).toThrow();expect(a.root.inspect()).toMatchObject({state:'failed',pending:false,preparations:1});expect(b.root.inspect()).toEqual(before);
  expect(()=>a.root.prepare()).toThrow();b.root.discardPrepared(pb);expect(()=>b.root.discardPrepared(pb)).toThrow();
  expect(Reflect.ownKeys(pa)).toEqual([]);
});
it.each(['repeat','copy','summary','old_prefix','extra_prepare','extra_discard'] as const)('refuses %s with no second pins construction or resurrection',kind=>{
  const f=setup();if(kind==='extra_prepare'){expect(()=>f.root.prepare({})).toThrow();expect(f.root.inspect().pin_builds).toBe(0);return;}
  const h=f.root.prepare();expect(()=>{
    if(kind==='repeat')f.root.prepare();else if(kind==='extra_discard')f.root.discardPrepared(h,{});
    else f.root.discardPrepared((kind==='copy'?{...h}:kind==='summary'?f.root.inspect():{}) as PreparedOwnedMixedSupply);
  }).toThrow();expect(f.root.inspect()).toMatchObject({state:'failed',pending:false,pins_created:1,pin_builds:1,retained_rows:0});
});
it.each(['cancelled','deadline_exceeded','unknown','throw'] as const)('stops on %s at every preparation guard without publishing partial supply',kind=>{
  for(let point=1;point<=16;point++){
    const f=setup();let n=0;f.arm(()=>{if(++n===point){if(kind==='throw')throw Error('SECRET');return kind==='unknown'?'caller_secret':kind;}});
    expect(()=>f.root.prepare()).toThrow('internal_review_error');expect(n).toBeGreaterThanOrEqual(point);
    expect(f.root.inspect()).toMatchObject({state:'failed',first_failure:kind==='throw'||kind==='unknown'?'internal':kind,pending:false,retained_rows:0,preparations:0});
    f.arm(()=>undefined);f.root.beginCleanup();f.root.discard();expect(()=>f.root.prepare()).toThrow();expect(JSON.stringify(f.root.inspect())).not.toContain('SECRET');
  }
});
it.each(['prepare','discardPrepared','source','cleanup','discard','stop'] as const)('refuses swallowed %s reentry before any prepared handle is published',operation=>{
  for(let point=1;point<=16;point++){
    const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
      if(operation==='prepare')f.root.prepare();else if(operation==='discardPrepared')f.root.discardPrepared({} as PreparedOwnedMixedSupply);
      else if(operation==='source')f.root.beginSourceClose();else if(operation==='cleanup')f.root.beginCleanup();else if(operation==='discard')f.root.discard();else f.root.stop('cancelled');
    }catch{/* deliberately swallowed */}});
    expect(()=>f.root.prepare()).toThrow();expect(f.root.inspect()).toMatchObject({state:'failed',pending:false,retained_rows:0,preparations:0});
  }
});
it.each(['source','cleanup','discard','cancelled','deadline_exceeded'] as const)('synchronously invalidates a prepared supply on %s',event=>{
  const f=setup(),h=f.root.prepare();if(event==='source')f.root.beginSourceClose();else if(event==='cleanup')f.root.beginCleanup();else if(event==='discard')f.root.discard();else expect(()=>f.root.stop(event)).toThrow();
  expect(f.root.inspect()).toMatchObject({pending:false,retained_rows:0});expect(()=>f.root.discardPrepared(h)).toThrow();expect(()=>f.root.prepare()).toThrow();
});
it.each(['pre','post'] as const)('prioritizes the discard %s guard stop over a foreign handle and preserves the first reason',phase=>{
  const f=setup();f.root.prepare();f.arm(stage=>stage===`discard_${phase}`?'deadline_exceeded':undefined);
  expect(()=>f.root.discardPrepared({} as PreparedOwnedMixedSupply)).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:'deadline_exceeded',pending:false});
  f.root.discard();expect(()=>f.root.stop('cancelled')).toThrow();expect(f.root.inspect().first_failure).toBe('deadline_exceeded');
});
it('gives a prepare post-guard stop priority over a rejected pins projection',()=>{
  const raw=fixture();raw.finish.time.deadline_ms=60001;const f=setup(raw);f.arm(stage=>stage==='prepare_post'?'deadline_exceeded':undefined);
  expect(()=>f.root.prepare()).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:'deadline_exceeded',pin_builds:1,pins_created:0,preparations:0,pending:false});
});
it.each(['kind','top_extra','outcomes','receipt','accepted','delta','version','model','input_field','point','active','accounting','time','prefix','empty','limit','sparse'] as const)('rejects invalid DATA contract %s',kind=>{
  const f=fixture();
  if(kind==='kind')f.kind='unknown';if(kind==='top_extra')Object.assign(f,{owner:{}});if(kind==='outcomes')Object.assign(f.finish,{outcomes:[]});
  if(kind==='receipt')Object.assign(f.finish.inputs[0],{receipt:{}});if(kind==='accepted')Object.assign(f.finish.inputs[0],{accepted:{}});
  if(kind==='delta')Object.assign(f.mixed,{delta:[]});if(kind==='version')Object.assign(f.mixed,{schema_version:'bp-mcp-review-0.2'});if(kind==='model')f.mixed.model_id='unknown';
  if(kind==='input_field')delete (f.finish.inputs[0] as Record<string,unknown>).expected_context;
  if(kind==='point')f.recovery.point='unknown';if(kind==='active')f.recovery.active_input_sys_id=id(1);if(kind==='accounting')f.recovery.accounting.requests=211;
  if(kind==='time')f.finish.time.deadline_ms=60001;if(kind==='prefix')f.mixed.initial_prefix.limitations.reverse();
  if(kind==='empty'){f.mixed.rows=[];f.finish.selected=[];f.finish.inputs=[];}
  if(kind==='limit')f.finish.selected=Array(101).fill(id(1));if(kind==='sparse')delete f.mixed.rows[0];
  expectRejected(f);
});
it.each(['missing','duplicate','extra','metadata','analysis_null','analysis_unsent','retrieval_context','retained_completed','order','retained_middle'] as const)('rejects incompatible row/input correspondence %s',kind=>{
  const f=fixture();
  if(kind==='missing')f.finish.inputs.splice(0,1);if(kind==='duplicate')f.finish.inputs.push(f.finish.inputs[0]);if(kind==='extra')f.finish.inputs[0].update_xml_sys_id=id(99);
  if(kind==='metadata')f.finish.inputs.splice(1,0,{...f.finish.inputs[0],update_xml_sys_id:id(2)});
  if(kind==='analysis_null')f.finish.inputs[0].expected_context=null;if(kind==='analysis_unsent')f.finish.inputs[0].state='not_processed';
  if(kind==='retrieval_context')f.finish.inputs.splice(3,0,{...f.finish.inputs[0],update_xml_sys_id:id(5)});
  if(kind==='retained_completed')f.finish.inputs.at(-1)!.state='completed';if(kind==='order')f.finish.inputs.reverse();
  if(kind==='retained_middle'){const row=f.mixed.rows.pop()!;f.mixed.rows.splice(2,0,row);}
  expectRejected(f);
});
it.each(['time','target_time','updated','binding','release','set','rule','limitations'] as const)('rejects reviewed/parent-omitted original context drift: %s',kind=>{
  const f=fixture(),body=(f.mixed.rows[2] as {outcome:ReturnType<typeof aggregate>['assets'][number]}).outcome;
  if(kind==='time')body.result.reviewed_at=U;if(kind==='target_time')body.result.target.retrieved_at=U;
  if(kind==='updated')body.result.target.record_updated_at='2026-10-17T04:57:00Z';if(kind==='binding')body.result.instance_binding='b'.repeat(64);
  if(kind==='release')body.result.instance_release.family='Yokohama';if(kind==='set')body.result.target.update_set_id=id(99);
  if(kind==='rule')body.applicable_rule_ids=['AU-BR-002'];if(kind==='limitations')body.result.limitations=[];
  expectRejected(f);
});
it('pins caller DATA without freezing it or retaining late mutations and emits scalar diagnostics only',()=>{
  const raw=fixture(),before=structuredClone(raw),f=setup(raw);raw.finish.selected.reverse();raw.mixed.rows.reverse();raw.finish.inputs[0].expected_context!.instance_binding='b'.repeat(64);
  const h=f.root.prepare();expect(f.root.inspect()).toMatchObject({state:'prepared',selected:7,original_reviewed_pins:2,parent_omitted:1});
  expect(Object.isFrozen(raw)).toBe(false);expect(raw).not.toEqual(before);const text=JSON.stringify(f.root.inspect());
  for(const marker of [id(1),T,'instance_binding','"findings":','"result":','source_approval_pending'])expect(text).not.toContain(marker);
  f.root.discardPrepared(h);expect(f.root.inspect().retained_rows).toBe(0);
});
it('supports the 0.3 subset without adding a second schema version or changing selection',()=>{
  const f=fixture();Object.assign(f.finish.header,{schema_version:'bp-mcp-review-0.3',
    selection:{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}},
    coverage:{...f.finish.header.coverage,analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false}});
  f.finish.header.limitations.push(...TARGET_LIMITATIONS);f.mixed.initial_prefix.limitations.push(...TARGET_LIMITATIONS);
  const root=setup(f).root;root.prepare();expect(root.inspect()).toMatchObject({preparations:1,pins_created:1,parent_omitted:1});
  Object.assign(f.mixed.rows[1],{outcome:{state:'skipped_deleted',update_xml_sys_id:id(2)}});expectRejected(f);
});
it.each([1,100])('prepares %i entirely retained rows without inventing reviewed pins or a ready frame',count=>{
  const f=fixture();f.mixed.rows=Array.from({length:count},(_,i)=>({producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id(i+1),reason:'deadline_exceeded'}}));
  f.finish.selected=Array.from({length:count},(_,i)=>id(i+1));f.finish.inputs=f.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null}));
  f.finish.header.collection.metadata_seen=f.finish.header.collection.selected=count;f.recovery.active_input_sys_id=id(count);
  const root=setup(f).root;root.prepare();expect(root.inspect()).toMatchObject({selected:count,linked_rows:count,retained:count,original_reviewed_pins:0,kept_findings:0});
  for(const key of ['startRecoveryGeneration','acceptRecoveryReady','bindRecoveryPlan'])expect(root).not.toHaveProperty(key);
});
it('accepts an optional retrieval input only with a null context and preserves all accounting caps',()=>{
  const f=fixture();f.finish.inputs.splice(3,0,{update_xml_sys_id:id(5),retrieved_at:T,state:'completed',expected_context:null});
  f.recovery.accounting={requests:210,received_bytes:16777216,payload_bytes:8388608};const root=setup(f).root;root.prepare();expect(root.inspect()).toMatchObject({inputs:6,pins_created:1});
  for(const [key,max] of [['requests',210],['received_bytes',16777216],['payload_bytes',8388608]] as const){const over=structuredClone(f);over.recovery.accounting[key]=max+1;expectRejected(over);}
});
it.each(['duplicate','overflow','duplicate_model'] as const)('does not rescue a local prefix mismatch by dedup or cap expansion: %s',kind=>{
  const f=fixture();
  if(kind==='duplicate')f.finish.header.limitations.push(f.finish.header.limitations[0]);
  else if(kind==='overflow')f.finish.header.limitations.push(...Array.from({length:95},(_,n)=>`private_${n}`));
  else{f.finish.header.limitations.push('finding_budget_exceeded');}
  f.mixed.initial_prefix.limitations=[...f.finish.header.limitations];expectRejected(f);
});
it('does not invoke configuration accessors, proxy traps or a Proxy guard',()=>{
  let touches=0;const touch=()=>{touches++;throw Error('SECRET');},proxy=new Proxy({},{get:touch,getPrototypeOf:touch,ownKeys:touch});
  for(const raw of [proxy,{...fixture(),recovery:proxy},{...fixture(),mixed:{...fixture().mixed,rows:[proxy]}},Object.defineProperty(fixture(),'finish',{get:touch})])expectRejected(raw);
  for(const deps of [proxy,Object.defineProperty({},'guard',{get:touch,enumerable:true}),{guard:new Proxy(()=>undefined,{apply:touch})}])expect(()=>createSyntheticOwnedMixedSupply(fixture(),deps)).toThrow();
  expect(touches).toBe(0);
});
it('keeps the guard fixed, rejects unknown stop/dependency fields and never accepts a constructor capability',()=>{
  let calls=0;const deps={guard:()=>{calls++;}},raw=fixture(),root=createSyntheticOwnedMixedSupply(raw,deps);deps.guard=()=>{throw Error('late guard');};root.prepare();expect(calls).toBe(16);
  expect(()=>createSyntheticOwnedMixedSupply(raw,{guard:()=>undefined,source:{}})).toThrow();
  const extra=createSyntheticOwnedMixedSupply(raw,{guard:()=>undefined},{});expect(()=>extra.prepare()).toThrow();expect(extra.inspect().pin_builds).toBe(0);
  const stopped=setup().root;expect(()=>stopped.stop('unknown' as never)).toThrow();expect(stopped.inspect().first_failure).toBe('internal');
});
it('keeps old factory APIs unchanged and rejects their values at the new DATA boundary',async()=>{
  const {createSyntheticMixedSlotAssembly}=await import('../support/review/synthetic-omd-slots.js');
  const {createSyntheticPinnedRecoveryRoot}=await import('../support/review/synthetic-pinned-recovery-root.js');
  const f=fixture(),old=createSyntheticMixedSlotAssembly({kind:'synthetic_omd_slots_v1',model_id:f.mixed.model_id,schema_version:f.finish.header.schema_version,selected:f.finish.selected,prefix:f.mixed.initial_prefix,rows:f.mixed.rows},{guard:()=>undefined}),before=old.summary();
  expectRejected(old);expectRejected(old.begin());expect(old.summary()).toMatchObject({...before,pending_prefixes:1,state:'active'});
  const legacy=createSyntheticPinnedRecoveryRoot({});for(const key of ['prepare','discardPrepared'])expect(legacy).not.toHaveProperty(key);
  expectRejected(legacy);expectRejected(legacy.inspect());
  const fresh=setup().root,prepared=fresh.prepare();
  // @ts-expect-error A prepared supply is not a row receipt or old finish/owner binding.
  expect(()=>old.generate(prepared,old.rows[0].receipt,{})).toThrow();
});
