import {afterEach,expect,it,vi} from 'vitest';
import {createSyntheticUnpublishedBundleRoot,createSyntheticPostProofRoot} from '../support/review/synthetic-recovery-kernel.js';
import * as expectation from '../support/review/synthetic-recovery-finish-values.js';
import {bundlePartsInput} from './fixtures/bundle-parts-input.js';
afterEach(()=>vi.restoreAllMocks());
function setup(mixed=false){
  let guard:(s:string)=>unknown=()=>undefined;const r=createSyntheticUnpublishedBundleRoot(bundlePartsInput(mixed),{guard:(s:string)=>guard(s)});
  return {r,arm:(g:typeof guard)=>{guard=g;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
it.each([false,true])('prepares one same-origin private bundle, then fixed-aborts and clears every slot (%s)',mixed=>{
  const f=setup(mixed);f.ready();const budget=f.r.inspect().budget;let post:ReturnType<typeof f.r.inspect>|undefined;
  f.arm(s=>{if(s==='transfer_post')post=f.r.inspect();});expect(()=>f.r.prepareUnpublishedBundle()).toThrow();
  expect(post?.unpublished_bundle).toMatchObject({started:false,builds:0,readies:0,pending:false,building_pending:false});
  expect(f.r.inspect()).toMatchObject({first_failure:'state',post_proofs:{state:'failed',starts:1,pairs:1,completed_bundles:1,pair_pending:false},unpublished_bundle:{started:true,builds:1,readies:1,checks:3,building_pending:false,pending:false,marker_pending:false,origin_pending:false,published:0,seals:0,consumptions:0},bundle_parts:{pending:false},transfer:{successful_seals:0}});
  expect(f.r.inspect().budget).toEqual(budget);expect(()=>f.r.prepareUnpublishedBundle()).toThrow();expect(f.r.inspect().unpublished_bundle?.readies).toBe(1);
  expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');for(const key of ['bundle','buildingBundle','unpublishedCompleteBundle','seal','commit','issuePostProofs','consume'])expect(f.r).not.toHaveProperty(key);
  f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
it.each(['transfer_pre','transfer_post'])('does not allocate a bundle after %s stops',stage=>{
  for(const reason of ['cancelled','deadline_exceeded','throw','unknown']){
    const f=setup(true);f.ready();f.arm(s=>{if(s===stage){if(reason==='throw')throw Error('PRIVATE');return reason;}});
    expect(()=>f.r.prepareUnpublishedBundle()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:reason==='throw'||reason==='unknown'?'internal':reason,post_proofs:{pairs:0},unpublished_bundle:{started:false,builds:0,readies:0,pending:false,building_pending:false}});
    f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  }
});
it.each([undefined,'cancelled','deadline_exceeded'])('preserves provisional work failure and post precedence %s',stop=>{
  const f=setup();f.ready();vi.spyOn(expectation,'projectRecoveryFinishExpectation').mockImplementationOnce(()=>{throw Error('PRIVATE');});
  f.arm(s=>s==='transfer_post'?stop:undefined);expect(()=>f.r.prepareUnpublishedBundle()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:stop??'binding',post_proofs:{pairs:0},unpublished_bundle:{started:false,readies:0,pending:false}});
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
it('rejects reentry, foreign input and source/cleanup invalidation',()=>{
  const f=setup();f.ready();f.arm(s=>{if(s==='transfer_post')try{f.r.prepareUnpublishedBundle();}catch{/* swallowed */}});expect(()=>f.r.prepareUnpublishedBundle()).toThrow();expect(f.r.inspect().first_failure).toBe('reentrant');
  for(const kind of ['source','cleanup']){const x=setup(),t=x.ready();if(kind==='source')x.r.beginSourceClose();else x.r.beginCleanup(t.cleanup);expect(()=>x.r.prepareUnpublishedBundle()).toThrow();expect(x.r.inspect().unpublished_bundle?.readies).toBe(0);}
  const a=setup(),b=setup();a.ready();b.ready();const before=b.r.inspect();expect(()=>a.r.prepareUnpublishedBundle(before)).toThrow();expect(b.r.inspect()).toEqual(before);
});
it('leaves the FP3-A continuation pair-only',()=>{
  const r=createSyntheticPostProofRoot(bundlePartsInput(),{guard:()=>undefined});r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();
  expect(()=>r.issuePostProofs()).toThrow();expect(r.inspect().post_proofs).toMatchObject({pairs:1,completed_bundles:0});expect(r.inspect()).not.toHaveProperty('unpublished_bundle');expect(r).not.toHaveProperty('prepareUnpublishedBundle');
});
