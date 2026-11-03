import {afterEach,expect,it,vi} from 'vitest';
import {createSyntheticDestinationPreparationRoot,createSyntheticNormalTransferRoot} from '../support/review/synthetic-recovery-kernel.js';
import * as full from '../support/review/synthetic-full-mixed-draft.js';
import {aggregate} from './fixtures/bp5-results.js';
const project=full.projectSyntheticFullMixedDraft;
afterEach(()=>vi.restoreAllMocks());
function fixture(mixed=false):unknown{
  const a=aggregate(),id='4'.repeat(32),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  const f={kind:'synthetic_omd_bound_root_v1',recovery:{point:'analyze_timer',active_input_sys_id:id,accounting:{requests:10,received_bytes:20,payload_bytes:30},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,
      collection:{...a.collection,metadata_seen:1,selected:1},coverage:{...a.coverage,analysis_complete:false},limits:a.limits,limitations:[...a.limitations,'zz','aa'],errors:[]},selected:[id],inputs:[{update_xml_sys_id:id,retrieved_at:U,state:'not_processed',expected_context:null}]},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations,'zz','aa'],errors:[]},rows:[{producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id,reason:'deadline_exceeded'}}]}};
  if(!mixed)return f;
  const asset=(n:number,count:number)=>{const r=aggregate().assets[0];r.update_xml_sys_id=r.result.target.update_xml_sys_id=String(n).repeat(32);r.result.reviewed_at=r.result.target.retrieved_at=O;r.result.target.record_updated_at='2026-10-17T04:58:00Z';r.result.findings=Array.from({length:count},()=>({...structuredClone(r.result.findings[0]),issue:'PRIVATE_BODY'}));return r;};
  const x=asset(1,99),y=asset(2,2),r=x.result,context={record_updated_at:r.target.record_updated_at,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations};
  return {...f,finish:{...f.finish,header:{...f.finish.header,collection:{...f.finish.header.collection,metadata_seen:4,selected:4}},selected:['1','2','3','4'].map(n=>n.repeat(32)),
    inputs:[...[x,y].map(a=>({update_xml_sys_id:a.update_xml_sys_id,retrieved_at:O,state:'completed',expected_context:context})),{update_xml_sys_id:'3'.repeat(32),retrieved_at:O,state:'completed',expected_context:context},...f.finish.inputs]},
    mixed:{...f.mixed,rows:[{producer:'analysis',outcome:x},{producer:'analysis',outcome:y},{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:'3'.repeat(32),reason:'response_limit'}},...f.mixed.rows]}};
}
function setup(raw=fixture()){
  let guard:(s:string)=>unknown=()=>undefined;
  const root=createSyntheticDestinationPreparationRoot(raw,{guard:(s:string)=>guard(s)});
  return {root,arm:(g:typeof guard)=>{guard=g;},ready:()=>{
    root.prepare();root.move();root.startKernel();root.beginClosure();root.settleOld({termination:'confirmed',cleanup:'complete'});root.prepareGeneration();
    const t=root.claimGeneration(),l=root.startGeneration(t.start);root.acceptReady(l,root.issueReady(l));root.adopt();return t;
  }};
}
it.each([false,true])('prepares once from the same pending, then clears all unpublished payload (mixed=%s)',mixed=>{
  const spy=vi.spyOn(full,'projectSyntheticFullMixedDraft'),f=setup(fixture(mixed));
  expect(f.root.inspect().destination).toMatchObject({owners:1,owner_pending:true,started:false,checks:0,preparations:0,published:0,seals:0});
  f.ready();const budget=f.root.inspect().budget,seen:ReturnType<typeof f.root.inspect>[]=[];
  f.arm(s=>{if(s==='transfer_pre'||s==='transfer_post')seen.push(f.root.inspect());});
  expect(()=>f.root.prepareDestination()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  expect(seen[0].destination).toMatchObject({started:true,content_calls:0,candidates:0,checks:0,preparations:0});
  expect(seen[1].destination).toMatchObject({content_calls:1,candidates:1,candidate_pending:true,checks:0,preparations:0,checked_pending:false,draft_pending:false});
  expect(f.root.inspect()).toMatchObject({first_failure:'state',destination:{started:true,content_calls:1,candidates:1,checks:1,preparations:1,owner_pending:false,candidate_pending:false,checked_pending:false,draft_pending:false,published:0,seals:0},prefix_check:{relations:1,consumptions:1},transfer:{successful_seals:0}});
  expect(f.root.inspect().budget).toEqual(budget);expect(()=>f.root.prepareDestination()).toThrow();expect(spy).toHaveBeenCalledTimes(1);
  const input=spy.mock.calls[0][0] as {rows:{outcome:{state:string}}[];manifest:{assets:{state:string}[];prefix:{limitations:string[]}}};
  if(mixed){expect(input.rows.map(x=>x.outcome.state)).toEqual(['reviewed','reviewed','result_omitted','not_processed']);expect(input.manifest.assets.map(x=>x.state)).toEqual(['reviewed','result_omitted','result_omitted','not_processed']);expect(input.manifest.prefix.limitations.slice(-2)).toEqual(['response_truncated','finding_budget_exceeded']);}
  const text=JSON.stringify(f.root.inspect());expect(text).not.toContain('PRIVATE_BODY');expect(text).not.toContain('original_rows');
  for(const name of ['abortBoundTransfer','ContentChecked','destinationOwner','seal','commit','register'])expect(f.root).not.toHaveProperty(name);
  f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody()).toMatchObject({payload_cleared:true,holder:'upper'});
});
it.each(['transfer_pre','transfer_post'] as const)('clears owner/draft and keeps stop precedence at %s',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','throw','unknown']){
    const spy=vi.spyOn(full,'projectSyntheticFullMixedDraft'),f=setup();f.ready();
    f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE');return stop==='unknown'?'PRIVATE':stop;}});
    expect(()=>f.root.prepareDestination()).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:stop==='throw'||stop==='unknown'?'internal':stop,destination:{started:true,content_calls:stage==='transfer_pre'?0:1,checks:0,preparations:0,owner_pending:false,candidate_pending:false,checked_pending:false,draft_pending:false,seals:0}});
    expect(spy).toHaveBeenCalledTimes(stage==='transfer_pre'?0:1);expect(()=>f.root.prepareDestination()).toThrow();f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody().payload_cleared).toBe(true);spy.mockRestore();
  }
});
it.each([undefined,'cancelled','deadline_exceeded'] as const)('defers content mismatch until post and prioritizes %s',stop=>{
  let aliasBefore=false;
  const spy=vi.spyOn(full,'projectSyntheticFullMixedDraft').mockImplementationOnce(raw=>{
    const input=structuredClone(raw) as {rows:{outcome:unknown}[];manifest:{assets:{result:{findings:{recommendation:string}[]}}[]}};
    aliasBefore=input.rows[0].outcome===input.manifest.assets[0];input.manifest=structuredClone(input.manifest);
    input.manifest.assets[0].result.findings[0].recommendation='different candidate body';return project(input);
  }),f=setup(fixture(true));f.ready();let post:ReturnType<typeof f.root.inspect>|undefined;
  f.arm(s=>{if(s==='transfer_post'){post=f.root.inspect();return stop;}});
  expect(()=>f.root.prepareDestination()).toThrow();expect(spy).toHaveBeenCalledTimes(1);expect(aliasBefore).toBe(true);
  expect(post).toMatchObject({first_failure:null,destination:{content_calls:1,candidates:0,checks:0,preparations:0,rejection:{reason:'mismatch',phase:'content'}}});
  expect(f.root.inspect()).toMatchObject({first_failure:stop??'binding',failure_notices:1,destination:{owner_pending:false,candidate_pending:false,checked_pending:false,draft_pending:false,published:0,seals:0}});
  f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(f.root.upper.inspect().report).toMatchObject({first_hard:{code:stop??'internal_review_error'}});
});
it('rejects swallowed reentry without duplicating preparation or losing cleanup custody',()=>{
  const f=setup();f.ready();f.arm(s=>{if(s==='transfer_post')try{f.root.prepareDestination();}catch{/* swallowed */}});
  expect(()=>f.root.prepareDestination()).toThrow();expect(f.root.inspect()).toMatchObject({first_failure:'reentrant',destination:{content_calls:1,candidates:1,checks:0,preparations:0,owner_pending:false,candidate_pending:false}});
  f.arm(()=>undefined);f.root.finalDiscard(f.root.transferFailure());expect(f.root.custody().payload_cleared).toBe(true);
});
it.each(['source','cleanup'] as const)('cannot reprepare after %s invalidation',kind=>{
  const spy=vi.spyOn(full,'projectSyntheticFullMixedDraft'),f=setup(),t=f.ready();if(kind==='source')f.root.beginSourceClose();else f.root.beginCleanup(t.cleanup);
  expect(()=>f.root.prepareDestination()).toThrow();expect(spy).not.toHaveBeenCalled();expect(f.root.inspect().destination).toMatchObject({owner_pending:false,content_calls:0,checks:0,preparations:0,published:0});
});
it('does not accept a foreign root/summary and leaves the other owner untouched',()=>{
  const spy=vi.spyOn(full,'projectSyntheticFullMixedDraft'),a=setup(),b=setup();a.ready();b.ready();const before=b.root.inspect();
  expect(()=>a.root.prepareDestination(b.root.inspect())).toThrow();expect(spy).not.toHaveBeenCalled();expect(b.root.inspect()).toEqual(before);
  expect(a.root.inspect()).toMatchObject({first_failure:'binding',destination:{started:true,checks:0,preparations:0,owner_pending:false}});
});
it('preserves the legacy transfer surface and never runs D1 on its fixed-abort path',()=>{
  const spy=vi.spyOn(full,'projectSyntheticFullMixedDraft'),r=createSyntheticNormalTransferRoot(fixture(),{guard:()=>undefined});
  r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();
  expect(()=>r.abortBoundTransfer()).toThrow();expect(spy).not.toHaveBeenCalled();expect(r).not.toHaveProperty('prepareDestination');expect(r.inspect()).not.toHaveProperty('destination');
});
it('reserves the sole owner before rejected DATA and clears it without inventing resource absence',()=>{
  let reads=0;const raw=Object.defineProperty({},'finish',{get(){reads++;throw Error('PRIVATE');}}),f=setup(raw);
  expect(f.root.inspect().destination).toMatchObject({owners:1,owner_pending:true,started:false});expect(()=>f.root.prepare()).toThrow();expect(reads).toBe(0);
  expect(f.root.inspect().destination).toMatchObject({owner_pending:false,content_calls:0,checks:0,preparations:0});f.root.finalDiscard(f.root.transferFailure());expect(f.root.upper.inspect().current?.release).toBe('unconfirmed');
});
