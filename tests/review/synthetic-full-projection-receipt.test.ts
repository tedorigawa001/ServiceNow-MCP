import {expect,it} from 'vitest';
import {createSyntheticFullProjectionReceiptRoot} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';
function setup(){
  const a=aggregate(),id='4'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  let guard:(s:string)=>unknown=()=>undefined;
  const r=createSyntheticFullProjectionReceiptRoot({kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
      collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:a.limitations,errors:[]},selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:a.limitations,errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}},{guard:(s:string)=>guard(s)});
  return {r,arm:(g:typeof guard)=>{guard=g;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
it('receives the original full projection once, rechecks after post, then fixed-aborts and clears',()=>{
  const f=setup();f.ready();const budget=f.r.inspect().budget,seen:ReturnType<typeof f.r.inspect>[]=[];
  f.arm(s=>{if(s==='transfer_pre'||s==='transfer_post')seen.push(f.r.inspect());});
  expect(()=>f.r.receiveFullProjection()).toThrow();
  expect(seen[0].full_projection).toMatchObject({receipts:0,pending:false});
  expect(seen[1]).toMatchObject({full_projection:{receipts:1,pending:true,post_checks:0},kernel:{accepted_header:{consume_started:true,consumptions:0,pending:false},accepted_projection:{consumptions:1,pending:true}}});
  expect(f.r.inspect()).toMatchObject({first_failure:'state',full_projection:{receipts:1,post_checks:1,pending:false,bundles:0,seals:0},kernel:{accepted_projection:{consumptions:1,pending:false}},prefix_check:{calls:0},transfer:{header_consumptions:0,successful_seals:0}});
  expect(f.r.inspect().budget).toEqual(budget);expect(()=>f.r.receiveFullProjection()).toThrow();
  f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  for(const key of ['consumeHeader','consumeProjection','accepted','projection','seal','commit','prepareDestination','abortBoundTransfer'])expect(f.r).not.toHaveProperty(key);
  expect(JSON.stringify(f.r.inspect())).not.toContain('44444444444444444444444444444444');
});
it.each(['transfer_pre','transfer_post'])('keeps stop precedence and clears all receipt slots at %s',stage=>{
  for(const reason of ['cancelled','deadline_exceeded','throw','unknown']){
    const f=setup();f.ready();f.arm(s=>{if(s===stage){if(reason==='throw')throw Error('PRIVATE');return reason;}});
    expect(()=>f.r.receiveFullProjection()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:reason==='throw'||reason==='unknown'?'internal':reason,full_projection:{receipts:stage==='transfer_pre'?0:1,post_checks:0,pending:false},kernel:{accepted_projection:{pending:false}}});
    expect(()=>f.r.receiveFullProjection()).toThrow();f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  }
});
it('rejects swallowed reentry and does not reuse the consumed claim',()=>{
  const f=setup();f.ready();f.arm(s=>{if(s==='transfer_post')try{f.r.receiveFullProjection();}catch{/* swallowed */}});
  expect(()=>f.r.receiveFullProjection()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'reentrant',full_projection:{receipts:1,post_checks:0,pending:false}});
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
it.each(['source','cleanup'])('refuses receipt after %s invalidation',kind=>{
  const f=setup(),t=f.ready();if(kind==='source')f.r.beginSourceClose();else f.r.beginCleanup(t.cleanup);
  expect(()=>f.r.receiveFullProjection()).toThrow();expect(f.r.inspect().full_projection).toMatchObject({receipts:0,pending:false});
});
it('rejects a foreign summary without disturbing its root',()=>{
  const a=setup(),b=setup();a.ready();b.ready();const before=b.r.inspect();expect(()=>a.r.receiveFullProjection(before)).toThrow();
  expect(b.r.inspect()).toEqual(before);expect(a.r.inspect().full_projection).toMatchObject({receipts:0,post_checks:0,pending:false});
});
