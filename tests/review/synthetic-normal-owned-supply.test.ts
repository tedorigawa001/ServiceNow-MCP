import {expect,it} from 'vitest';
import {createSyntheticNormalOwnedSupply} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
import {TARGET_FILTER_VERSION,TARGET_LIMITATIONS} from '../../src/review/target-selection.js';
const S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
function fixture(){
  const a=aggregate(),id='1'.repeat(32);
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,
      instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:{...a.limits,max_records:100},limitations:[...a.limitations],errors:[]},
      selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
}
it('retains its single pins birth and moves it once into the same normal budget binding',()=>{
  const root=createSyntheticNormalOwnedSupply(fixture(),{guard:()=>undefined});
  expect(root.inspect()).toMatchObject({state:'fresh',budget:{state:'unbound',accounting:null},normal_pending:false});
  expect(root.prepare()).toBeUndefined();
  expect(root.inspect()).toMatchObject({state:'prepared',birth_pending:true,births:1,budget:{state:'unbound'},supply:{pins_created:1,pin_builds:1,pending:true}});
  expect(root.move()).toBeUndefined();
  expect(root.inspect()).toMatchObject({state:'normal_owned',birth_pending:false,birth_consumptions:1,moves:1,normal_pending:true,retained_rows:1,
    binding:{serial:1,identity_checks:8,rows_checked:1,same_origin:true},budget:{state:'bound',serial:1,accounting:{requests:10,received_bytes:20,payload_bytes:30},started_at:S,deadline_ms:60000},
    supply:{pins_created:1,pin_builds:1,pending:false,state:'moved'}});
  for(const key of ['pins','body','bind','register','accepted','transfer','sealBoundMixedExpectation'])expect(root).not.toHaveProperty(key);
});
function setup(raw:unknown=fixture()){
  let guard:(stage:string,n?:number)=>unknown=()=>undefined;
  const root=createSyntheticNormalOwnedSupply(raw,{guard:(stage:string,n?:number)=>guard(stage,n)});
  return {root,arm:(next:typeof guard)=>{guard=next;}};
}
it.each(['move_pre','move_post'] as const)('preserves cancellation at %s without binding or restoring the spent birth',stage=>{
  const f=setup();f.root.prepare();f.arm(s=>s===stage?'cancelled':undefined);
  expect(()=>f.root.move()).toThrow('internal_review_error');
  expect(f.root.inspect()).toMatchObject({state:'failed',first_failure:'cancelled',normal_pending:false,birth_pending:false,birth_consumptions:1,moves:0,
    binding:null,budget:{state:'unbound'},supply:{pending:false,retained_rows:0,first_failure:'cancelled'},failure:{first_hard:{code:'cancelled',stage:'transfer'},unresolved:4}});
  f.arm(()=>undefined);expect(()=>f.root.move()).toThrow();expect(()=>f.root.prepare()).toThrow();
});
it.each(['move_pre','move_post'] as const)('preserves deadline at %s over malformed adoption arguments',stage=>{
  const f=setup();f.root.prepare();f.arm(s=>s===stage?'deadline_exceeded':undefined);
  expect(()=>f.root.move({pins:{}})).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:'deadline_exceeded',normal_pending:false,birth_pending:false,moves:0,budget:{state:'unbound'}});
});
it.each(['move_pre','move_post','normal_discard_pre','normal_discard_post'] as const)('fails closed on throw and unknown guard responses at %s',stage=>{
  for(const kind of ['throw','unknown']){
    const f=setup();f.root.prepare();if(stage.startsWith('normal_'))f.root.move();
    f.arm(s=>{if(s===stage){if(kind==='throw')throw Error('PRIVATE_STOP');return 'PRIVATE_STOP';}});
    expect(()=>stage.startsWith('normal_')?f.root.discard():f.root.move()).toThrow();
    expect(f.root.inspect()).toMatchObject({first_failure:'internal',normal_pending:false,birth_pending:false,binding:null,budget:{state:stage.startsWith('normal_')?'bound':'unbound'}});
    expect(JSON.stringify(f.root.inspect())).not.toContain('PRIVATE_STOP');
  }
});
it.each(['prepare','move','beginSourceClose','beginCleanup','discard','stop'] as const)('detects swallowed %s reentry at every prepare/move checkpoint',operation=>{
  for(const stage of ['prepare_pre','row_pre','row_post','prepare_post','move_pre','move_post']){
    const f=setup();if(stage.startsWith('move'))f.root.prepare();
    f.arm(s=>{if(s===stage)try{if(operation==='stop')f.root.stop('cancelled');else f.root[operation]();}catch{/* deliberately swallowed */}});
    expect(()=>stage.startsWith('move')?f.root.move():f.root.prepare()).toThrow();
    expect(f.root.inspect()).toMatchObject({state:'failed',first_failure:operation==='stop'?'cancelled':'reentrant',normal_pending:false,birth_pending:false,binding:null,moves:0});
    f.arm(()=>undefined);expect(()=>f.root.move()).toThrow();expect(()=>f.root.prepare()).toThrow();
  }
});
it.each(['duplicate_prepare','duplicate_move','before_prepare','prepare_args','move_args','discard_args'] as const)('never restores claims on %s',kind=>{
  const f=setup();
  if(kind!=='before_prepare'&&kind!=='prepare_args')f.root.prepare();
  if(kind==='duplicate_move'||kind==='discard_args')f.root.move();
  expect(()=>{
    if(kind==='duplicate_prepare')f.root.prepare();else if(kind==='prepare_args')f.root.prepare({});else if(kind==='move_args')f.root.move({});
    else if(kind==='discard_args')f.root.discard({});else f.root.move();
  }).toThrow();
  expect(f.root.inspect()).toMatchObject({state:'failed',normal_pending:false,birth_pending:false,binding:null});
  expect(()=>f.root.prepare()).toThrow();expect(()=>f.root.move()).toThrow();
});
it.each(['beginSourceClose','beginCleanup','discard','cancelled','deadline_exceeded'] as const)('clears payload on %s before and after the normal move without unbinding a committed budget',operation=>{
  for(const moved of [false,true]){
    const f=setup();f.root.prepare();if(moved)f.root.move();
    if(operation==='cancelled'||operation==='deadline_exceeded')expect(()=>f.root.stop(operation)).toThrow();else f.root[operation]();
    expect(f.root.inspect()).toMatchObject({normal_pending:false,birth_pending:false,retained_rows:0,binding:null,supply:{pending:false,retained_rows:0},budget:{state:moved?'bound':'unbound'}});
    expect(()=>f.root.move()).toThrow();expect(()=>f.root.prepare()).toThrow();
  }
});
it('keeps separate roots unchanged when external handles, summaries or factories are passed as arguments',()=>{
  for(const kind of ['root','summary','copy']){
    const a=setup(),b=setup();a.root.prepare();b.root.prepare();b.root.move();const before=b.root.inspect();
    expect(()=>a.root.move(kind==='root'?b.root:kind==='summary'?before:{...b.root})).toThrow();
    expect(b.root.inspect()).toEqual(before);expect(a.root.inspect()).toMatchObject({moves:0,normal_pending:false,birth_pending:false});
    b.root.discard();
  }
});
it('preserves an unbound failure as Unknown instead of inventing zero accounting or absent resources',()=>{
  const f=setup({secret:'PRIVATE_BODY'});expect(()=>f.root.prepare()).toThrow();
  expect(f.root.inspect()).toMatchObject({normal_pending:false,birth_pending:false,budget:{state:'unbound',accounting:null,started_at:null,deadline_ms:null},failure:{release:'unconfirmed',unresolved:4}});
  expect(JSON.stringify(f.root.inspect())).not.toContain('PRIVATE_BODY');
});
it('retains the first stop and same accounting after a bound failure',()=>{
  const f=setup();f.root.prepare();f.root.move();expect(()=>f.root.stop('deadline_exceeded')).toThrow();expect(()=>f.root.stop('cancelled')).toThrow();
  expect(f.root.inspect()).toMatchObject({first_failure:'deadline_exceeded',failure_notices:1,failure:{first_hard:{code:'deadline_exceeded',stage:'transfer'}},budget:{state:'bound',accounting:{requests:10,received_bytes:20,payload_bytes:30},started_at:S,deadline_ms:60000}});
});
function mixedFixture(){
  const f=fixture(),asset=(n:number,count:number)=>{
    const a=aggregate().assets[0];a.update_xml_sys_id=a.result.target.update_xml_sys_id=n.toString().repeat(32);
    a.result.reviewed_at=a.result.target.retrieved_at=O;a.result.target.record_updated_at='2026-10-17T04:58:00Z';a.result.findings=Array.from({length:count},()=>structuredClone(a.result.findings[0]));return a;
  },a=asset(1,99),b=asset(2,2),r=a.result;
  const tail='3'.repeat(32);f.finish.selected=[tail];f.finish.inputs[0].update_xml_sys_id=tail;f.mixed.rows[0].outcome.update_xml_sys_id=tail;f.recovery.active_input_sys_id=tail;
  const context={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  return {...f,finish:{...f.finish,header:{...f.finish.header,collection:{...f.finish.header.collection,metadata_seen:3,selected:3}},selected:[a.update_xml_sys_id,b.update_xml_sys_id,...f.finish.selected],
    inputs:[...[a,b].map(body=>({update_xml_sys_id:body.update_xml_sys_id,retrieved_at:O,state:'completed',expected_context:context})),...f.finish.inputs]},
    mixed:{...f.mixed,rows:[{producer:'analysis',outcome:a},{producer:'analysis',outcome:b},...f.mixed.rows]}};
}
it('moves mixed original reviewed and parent-omitted pins without reconstructing their origins',()=>{
  const f=setup(mixedFixture());f.root.prepare();f.root.move();
  expect(f.root.inspect()).toMatchObject({moves:1,retained_rows:3,binding:{rows_checked:3},supply:{pins_created:1,original_reviewed_pins:2,parent_omitted:1,retained:1,kept_findings:99}});
  f.root.discard();expect(f.root.inspect()).toMatchObject({state:'discarded',normal_pending:false,budget:{state:'bound'}});
});
it.each([1,100])('preserves %i entirely retained entries and the original accounting caps',count=>{
  const raw=fixture();raw.finish.selected=Array.from({length:count},(_,n)=>(n+1).toString(16).padStart(32,'0'));
  raw.finish.inputs=raw.finish.selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null}));
  raw.mixed.rows=raw.finish.selected.map(update_xml_sys_id=>({producer:'retained',outcome:{state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}}));
  raw.recovery.active_input_sys_id=raw.finish.selected.at(-1)!;raw.finish.header.collection.metadata_seen=raw.finish.header.collection.selected=count;
  raw.recovery.accounting={requests:210,received_bytes:16777216,payload_bytes:8388608};
  const f=setup(raw);f.root.prepare();f.root.move();expect(f.root.inspect()).toMatchObject({retained_rows:count,supply:{original_reviewed_pins:0},budget:{accounting:raw.recovery.accounting}});
  f.root.discard();
});
it('supports the existing 0.3 selection subset and copies caller data without retaining late mutations',()=>{
  const raw=fixture();Object.assign(raw.finish.header,{schema_version:'bp-mcp-review-0.3',
    selection:{mode:'review_targets',filter_version:TARGET_FILTER_VERSION,requested_asset_types:['business_rule'],action_scope:'insert_or_update_only',order:'sys_id_asc',excluded_counts:{unsupported_assets:null,deleted_assets:null,other_actions:null}},
    coverage:{...raw.finish.header.coverage,analysis_scope:'selected_candidate_window',candidate_inventory_complete:false,update_set_inventory_complete:false}});
  raw.finish.header.limitations.push(...TARGET_LIMITATIONS);raw.mixed.initial_prefix.limitations.push(...TARGET_LIMITATIONS);
  const f=setup(raw);raw.recovery.accounting.requests=999;raw.finish.time.deadline_ms=1;raw.finish.inputs[0].retrieved_at='PRIVATE_TIME';
  f.root.prepare();f.root.move();expect(f.root.inspect()).toMatchObject({moves:1,budget:{accounting:{requests:10},deadline_ms:60000}});
  const summary=JSON.stringify(f.root.inspect());for(const secret of ['PRIVATE_TIME','1'.repeat(32),'"result":','"findings":'])expect(summary).not.toContain(secret);
  expect(Object.isFrozen(raw)).toBe(false);
});
it('has a fixed ordered guard transcript with no implicit retries, source creation or worker creation',()=>{
  const seen:string[]=[],root=createSyntheticNormalOwnedSupply(fixture(),{guard:(s:string,n?:number)=>{seen.push(`${s}:${n??'-'}`);}});
  root.prepare();root.move();root.discard();
  expect(seen).toEqual(['prepare_pre:-','row_pre:0','row_post:0','prepare_post:-','move_pre:-','move_post:-','normal_discard_pre:-','normal_discard_post:-']);
  expect(root.inspect()).toMatchObject({births:1,birth_consumptions:1,moves:1,supply:{pin_builds:1,pins_created:1},permissions:{accepted_adoption:false,destination_seal:false,formal_issuance:false}});
});
it('does not execute Proxy traps or getters and does not accept constructor capabilities',()=>{
  let touches=0;const touch=()=>{touches++;throw Error('PRIVATE');},proxy=new Proxy({},{get:touch,getPrototypeOf:touch,ownKeys:touch});
  for(const raw of [proxy,Object.defineProperty(fixture(),'finish',{get:touch})]){
    const f=setup(raw);expect(()=>f.root.prepare()).toThrow();expect(f.root.inspect().budget.accounting).toBeNull();
  }
  for(const deps of [proxy,{guard:new Proxy(()=>undefined,{apply:touch})},Object.defineProperty({},'guard',{get:touch,enumerable:true}),{guard:()=>undefined,pins:{}}])expect(()=>createSyntheticNormalOwnedSupply(fixture(),deps)).toThrow();
  const root=createSyntheticNormalOwnedSupply(fixture(),{guard:()=>undefined},proxy);expect(()=>root.prepare()).toThrow();expect(root.inspect().supply.pin_builds).toBe(0);
  expect(touches).toBe(0);
});
it.each(['prepare_pre','row_pre','row_post','prepare_post'] as const)('never issues a birth before a stopped %s has completed',stage=>{
  const f=setup();f.arm(s=>s===stage?'deadline_exceeded':undefined);expect(()=>f.root.prepare()).toThrow();
  expect(f.root.inspect()).toMatchObject({births:0,birth_pending:false,normal_pending:false,budget:{state:'unbound'},failure:{first_hard:{code:'deadline_exceeded',stage:'prepare'},unresolved:4}});
});
it('prioritizes a move post stop over a missing birth and never creates new pins to repair it',()=>{
  const f=setup();f.arm(s=>s==='move_post'?'deadline_exceeded':undefined);expect(()=>f.root.move()).toThrow();
  expect(f.root.inspect()).toMatchObject({first_failure:'deadline_exceeded',births:0,birth_consumptions:0,moves:0,supply:{pin_builds:0,pins_created:0},budget:{state:'unbound'}});
});
it.each(['prepare','move','beginSourceClose','beginCleanup','discard','stop'] as const)('rejects swallowed %s reentry while disposing the normal payload',operation=>{
  for(const stage of ['normal_discard_pre','normal_discard_post']){
    const f=setup();f.root.prepare();f.root.move();
    f.arm(s=>{if(s===stage)try{if(operation==='stop')f.root.stop('cancelled');else f.root[operation]();}catch{/* swallowed */}});
    expect(()=>f.root.discard()).toThrow();expect(f.root.inspect()).toMatchObject({normal_pending:false,birth_pending:false,binding:null,budget:{state:'bound'},failure_notices:1,
      failure:{first_hard:{code:operation==='stop'?'cancelled':'internal_review_error',stage:'cleanup'},unresolved:4}});
  }
});
it('records an unknown stop reason as internal instead of retaining caller text',()=>{
  const root=createSyntheticNormalOwnedSupply(fixture(),{guard:()=>undefined});
  expect(()=>root.stop('caller_reason' as never)).toThrow('internal_review_error');
  expect(root.inspect()).toMatchObject({state:'failed',first_failure:'internal'});expect(JSON.stringify(root.inspect())).not.toContain('caller_reason');
});
