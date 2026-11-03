import {afterEach,expect,it,vi} from 'vitest';
import {createSyntheticPostProofRoot,createSyntheticBundlePartsRoot} from '../support/review/synthetic-recovery-kernel.js';
import * as expectation from '../support/review/synthetic-recovery-finish-values.js';
import {bundlePartsInput} from './fixtures/bundle-parts-input.js';
afterEach(()=>vi.restoreAllMocks());
function setup(mixed=false){
  let guard:(s:string)=>unknown=()=>undefined;const r=createSyntheticPostProofRoot(bundlePartsInput(mixed),{guard:(s:string)=>guard(s)});
  return {r,arm:(g:typeof guard)=>{guard=g;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
it.each([false,true])('issues one private proof pair only after post and clears it on fixed abort (%s)',mixed=>{
  const f=setup(mixed);f.ready();const budget=f.r.inspect().budget,seen:ReturnType<typeof f.r.inspect>[]=[];
  f.arm(s=>{if(s==='transfer_pre'||s==='transfer_post')seen.push(f.r.inspect());});
  expect(()=>f.r.issuePostProofs()).toThrow();
  for(const s of seen)expect(s.post_proofs).toMatchObject({state:'unused',starts:0,pairs:0,checks:0,post_passed:false,content_issues:0,prefix_issues:0,pair_pending:false});
  expect(seen[1].bundle_parts).toMatchObject({builds:1,pending:true,post_checks:0});
  expect(f.r.inspect()).toMatchObject({first_failure:'state',post_proofs:{state:'failed',starts:1,pairs:1,checks:1,post_passed:false,pair_pending:false,markers_pending:false,origins_pending:false,content_issues:1,prefix_issues:1,completed_bundles:0,seals:0},bundle_parts:{post_checks:1,pending:false},transfer:{successful_seals:0}});
  expect(f.r.inspect().budget).toEqual(budget);expect(()=>f.r.issuePostProofs()).toThrow();expect(f.r.inspect().post_proofs?.pairs).toBe(1);
  const text=JSON.stringify(f.r.inspect());expect(text).not.toContain('PRIVATE_BODY');expect(text).not.toContain('44444444444444444444444444444444');
  for(const key of ['issuePostProofPair','proofOrigins','postAcceptedProofPair','consumePrefixRelation','bundle','seal','commit','prepareBundleParts'])expect(f.r).not.toHaveProperty(key);
  f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
it.each(['transfer_pre','transfer_post'])('does not issue after a guard stop at %s',stage=>{
  for(const reason of ['cancelled','deadline_exceeded','throw','unknown']){
    const f=setup(true);f.ready();f.arm(s=>{if(s===stage){if(reason==='throw')throw Error('PRIVATE');return reason;}});
    expect(()=>f.r.issuePostProofs()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:reason==='throw'||reason==='unknown'?'internal':reason,post_proofs:{state:'failed',starts:0,pairs:0,content_issues:0,prefix_issues:0,pair_pending:false,markers_pending:false,origins_pending:false}});
    expect(()=>f.r.issuePostProofs()).toThrow();f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  }
});
it('rejects swallowed reentry without issuing or losing cleanup custody',()=>{
  const f=setup();f.ready();f.arm(s=>{if(s==='transfer_post')try{f.r.issuePostProofs();}catch{/* swallowed */}});
  expect(()=>f.r.issuePostProofs()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'reentrant',post_proofs:{starts:0,pairs:0,pair_pending:false}});
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.upper.inspect().current?.first_hard.code).toBe('internal_review_error');
});
it.each(['source','cleanup'])('refuses issuance after %s invalidation',kind=>{
  const f=setup(),t=f.ready();if(kind==='source')f.r.beginSourceClose();else f.r.beginCleanup(t.cleanup);
  expect(()=>f.r.issuePostProofs()).toThrow();expect(f.r.inspect().post_proofs).toMatchObject({starts:0,pairs:0,state:'failed',pair_pending:false});
});
it('refuses a foreign summary and leaves its root unchanged',()=>{
  const a=setup(),b=setup();a.ready();b.ready();const before=b.r.inspect();expect(()=>a.r.issuePostProofs(before)).toThrow();expect(b.r.inspect()).toEqual(before);
  expect(a.r.inspect().post_proofs?.pairs).toBe(0);
});
it('keeps the FP-2 fixed continuation proof-free',()=>{
  const r=createSyntheticBundlePartsRoot(bundlePartsInput(),{guard:()=>undefined});r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();
  expect(()=>r.prepareBundleParts()).toThrow();expect(r.inspect().bundle_parts).toMatchObject({content_checks:0,relations:0,completed_bundles:0});expect(r).not.toHaveProperty('issuePostProofs');expect(r.inspect()).not.toHaveProperty('post_proofs');
});
it.each([undefined,'cancelled','deadline_exceeded'])('keeps a work failure provisional, issues nothing and prioritizes post stop %s',stop=>{
  const f=setup();f.ready();vi.spyOn(expectation,'projectRecoveryFinishExpectation').mockImplementationOnce(()=>{throw Error('PRIVATE');});
  f.arm(s=>s==='transfer_post'?stop:undefined);expect(()=>f.r.issuePostProofs()).toThrow();
  expect(f.r.inspect()).toMatchObject({first_failure:stop??'binding',post_proofs:{state:'failed',starts:stop?0:1,pairs:0,checks:0,content_issues:0,prefix_issues:0,pair_pending:false,markers_pending:false,origins_pending:false},bundle_parts:{builds:0,pending:false}});
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
