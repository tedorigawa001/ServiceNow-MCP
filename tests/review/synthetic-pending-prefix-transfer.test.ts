import {afterEach,expect,it,vi} from 'vitest';
import {createSyntheticNormalTransferRoot} from '../support/review/synthetic-recovery-kernel.js';
import * as values from '../support/review/synthetic-pending-prefix-values.js';
import {aggregate} from './fixtures/bp5-results.js';
const project=values.projectSyntheticPendingPrefixValues;
afterEach(()=>vi.restoreAllMocks());
function setup(mixed=false){
  const a=aggregate(),id='1'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  const prefix=[...a.limitations,'zz','aa'];
  const raw={kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
      collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:prefix,errors:[]},
      selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:prefix,errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
  let input:unknown=raw;
  if(mixed){
    const asset=(n:number,count:number)=>{const x=aggregate().assets[0];x.update_xml_sys_id=x.result.target.update_xml_sys_id=String(n).repeat(32);x.result.reviewed_at=x.result.target.retrieved_at=O;
      x.result.target.record_updated_at='2026-10-17T04:58:00Z';x.result.findings=Array.from({length:count},()=>structuredClone(x.result.findings[0]));return x;};
    const x=asset(1,99),y=asset(2,2),r=x.result,context={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
    const tail='4'.repeat(32);raw.recovery.active_input_sys_id=tail;raw.finish.inputs[0].update_xml_sys_id=tail;raw.mixed.rows[0].outcome.update_xml_sys_id=tail;
    input={...raw,finish:{...raw.finish,header:{...raw.finish.header,collection:{...raw.finish.header.collection,metadata_seen:4,selected:4}},selected:['1','2','3','4'].map(n=>n.repeat(32)),
      inputs:[...[x,y].map(a=>({update_xml_sys_id:a.update_xml_sys_id,retrieved_at:O,state:'completed',expected_context:context})),{update_xml_sys_id:'3'.repeat(32),retrieved_at:O,state:'completed',expected_context:context},...raw.finish.inputs]},
      mixed:{...raw.mixed,rows:[{producer:'analysis',outcome:x},{producer:'analysis',outcome:y},{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:'3'.repeat(32),reason:'response_limit'}},...raw.mixed.rows]}};
  }
  let guard:(s:string)=>unknown=()=>undefined;
  const root=createSyntheticNormalTransferRoot(input,{guard:(s:string)=>guard(s)});
  root.prepare();root.move();root.startKernel();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();
  const ticket=root.claimGeneration(),lease=root.startGeneration(ticket.start);root.acceptReady(lease,root.issueReady(lease));root.adopt();
  return {root,prefix,ticket,arm:(g:typeof guard)=>{guard=g;}};
}
it('uses same pending values once and retains only a provisional candidate across post guard',()=>{
  const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues'),f=setup(),snapshots:ReturnType<typeof f.root.inspect>[]=[];
  const budget=f.root.inspect().budget;
  f.arm(s=>{if(s==='transfer_pre'||s==='transfer_post')snapshots.push(f.root.inspect());});
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  expect(snapshots[0].prefix_check).toEqual({started:true,calls:0,candidates:0,post_checks:0,pending:false,rejection:null,relations:0});
  expect(snapshots[1].prefix_check).toEqual({started:true,calls:1,candidates:1,post_checks:0,pending:true,rejection:null,relations:0});
  const input=spy.mock.calls[0][0] as {model:{prefix:{limitations:readonly string[]}};pins_header:{limitations:readonly string[]};accepted_header:{errors:readonly unknown[]};plan_verify:{stage:string}};
  expect(input.model.prefix.limitations).toEqual(f.prefix);expect(input.pins_header.limitations).toEqual([...f.prefix].sort());
  expect(input.accepted_header.errors).toHaveLength(1);expect(input.plan_verify.stage).toBe('verified');
  expect(f.root.inspect()).toMatchObject({first_failure:'state',prefix_check:{calls:1,candidates:1,post_checks:1,pending:false,relations:0},transfer:{successful_seals:0,header_pending:false}});
  expect(f.root.inspect().budget).toEqual(budget);
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody().payload_cleared).toBe(true);
});
it.each(['transfer_pre','transfer_post'] as const)('preserves one-shot claim and clears candidates on %s stops',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','throw','unknown']){
    const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues'),f=setup();
    f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE');return stop==='unknown'?'PRIVATE':stop;}});
    expect(()=>f.root.abortBoundTransfer()).toThrow();
    expect(f.root.inspect()).toMatchObject({first_failure:stop==='throw'||stop==='unknown'?'internal':stop,prefix_check:{started:true,calls:stage==='transfer_pre'?0:1,candidates:stage==='transfer_pre'?0:1,post_checks:0,pending:false,relations:0}});
    expect(spy).toHaveBeenCalledTimes(stage==='transfer_pre'?0:1);expect(()=>f.root.abortBoundTransfer()).toThrow();
    f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody().payload_cleared).toBe(true);spy.mockRestore();
  }
});
it.each([undefined,'cancelled','deadline_exceeded'] as const)('defers accepted-prefix mismatch until post and prioritizes %s',stop=>{
  const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues').mockImplementationOnce(raw=>{
    const r=raw as Record<string,unknown>;return project({...r,accepted_header:r.pins_header});
  }),f=setup();let post:ReturnType<typeof f.root.inspect>|undefined;
  f.arm(s=>{if(s==='transfer_post'){post=f.root.inspect();return stop;}});
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  expect(post).toMatchObject({first_failure:null,prefix_check:{calls:1,candidates:0,pending:false,rejection:{reason:'binding',phase:'accepted'}}});
  expect(f.root.inspect()).toMatchObject({first_failure:stop??'binding',prefix_check:{started:true,post_checks:0,pending:false,relations:0},failure_notices:1});
  f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(f.root.upper.inspect().report).toMatchObject({first_hard:{code:stop??'internal_review_error'}});
});
it('clears a provisional candidate on swallowed post reentry without a second calculation',()=>{
  const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues'),f=setup();
  f.arm(s=>{if(s==='transfer_post')try{f.root.abortBoundTransfer();}catch{/* deliberately swallowed */}});
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  expect(f.root.inspect()).toMatchObject({first_failure:'reentrant',prefix_check:{calls:1,candidates:1,post_checks:0,pending:false,relations:0}});
  f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody().payload_cleared).toBe(true);
});
it.each(['source','cleanup'] as const)('cannot calculate after %s invalidation',kind=>{
  const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues'),f=setup();
  if(kind==='source')f.root.beginSourceClose();else f.root.beginCleanup(f.ticket.cleanup);
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(spy).not.toHaveBeenCalled();expect(f.root.inspect().prefix_check).toMatchObject({calls:0,candidates:0,pending:false,relations:0});
});
it('rejects a foreign summary before calculation without mutating the other root',()=>{
  const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues'),a=setup(),b=setup(),before=b.root.inspect();
  expect(()=>a.root.abortBoundTransfer(b.root.inspect())).toThrow();expect(spy).not.toHaveBeenCalled();expect(b.root.inspect()).toEqual(before);
  expect(a.root.inspect()).toMatchObject({first_failure:'binding',prefix_check:{started:true,calls:0,candidates:0,pending:false,relations:0}});
});
it('supplies the parent-processed Pp rather than P0 for mixed keep/omit/worker-omit rows',()=>{
  const spy=vi.spyOn(values,'projectSyntheticPendingPrefixValues'),f=setup(true);
  expect(()=>f.root.abortBoundTransfer()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  const input=spy.mock.calls[0][0] as {model:{prefix:{limitations:readonly string[];errors:readonly unknown[]}};accepted_header:{errors:readonly unknown[]}};
  // Handwritten oracle for 99 findings kept, 2 parent-omitted, then worker-omitted and retained.
  expect(input.model.prefix.limitations).toEqual([...f.prefix,'response_truncated','finding_budget_exceeded']);
  expect(input.model.prefix.errors).toEqual([{stage:'output',code:'response_limit'}]);expect(input.accepted_header.errors).toHaveLength(2);
  expect(f.root.inspect()).toMatchObject({first_failure:'state',supply:{parent_omitted:1,original_worker_omitted:1},prefix_check:{calls:1,candidates:1,post_checks:1,pending:false,relations:0}});
});
