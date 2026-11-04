import {expect,it} from 'vitest';
import {createSyntheticAtomicPreparationRoot,createSyntheticBundleConsumerRoot} from '../support/review/synthetic-recovery-kernel.js';
import {bundlePartsInput} from './fixtures/bundle-parts-input.js';
function setup(mixed=false){
  let guard:(stage:string)=>unknown=()=>undefined;
  const r=createSyntheticAtomicPreparationRoot(bundlePartsInput(mixed),{guard:(stage:string)=>guard(stage)});
  return {r,arm:(value:typeof guard)=>{guard=value;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
function cleared(r:ReturnType<typeof createSyntheticAtomicPreparationRoot>){
  expect(r.inspect().atomic_preparation).toMatchObject({state:'failed',owner_pending:false,shell_pending:false,bundle_pending:false,preparation_pending:false,staged:0,commits:0,seals:0,published:0});
  expect(r.inspect().unpublished_bundle).toMatchObject({pending:false,building_pending:false,origin_pending:false,marker_pending:false,consumptions:0});
  r.finalDiscard(r.transferFailure());expect(r.custody().payload_cleared).toBe(true);
}
it.each([false,true])('reserves a private shell then prepares once and fixed-aborts without commit (%s)',mixed=>{
  const f=setup(mixed);expect(f.r.inspect().atomic_preparation).toMatchObject({state:'reserved',started:false,starts:0,owner_pending:true,shell_pending:true,bundle_pending:false,preparation_pending:false,failure:null});
  f.ready();const budget=f.r.inspect().budget,seen:ReturnType<typeof f.r.inspect>[]=[];
  f.arm(stage=>{if(stage.startsWith('atomic_prepare_'))seen.push(f.r.inspect());});expect(()=>f.r.prepareAtomicCommit()).toThrow();
  expect(seen).toHaveLength(2);for(const x of seen){expect(x.atomic_preparation).toMatchObject({state:'preparing',started:true,starts:1,owner_pending:true,shell_pending:true,bundle_pending:true,staged:0,commits:0});expect(x.unpublished_bundle?.pending).toBe(false);}
  expect(seen[0].atomic_preparation?.preparation_pending).toBe(false);expect(seen[1].atomic_preparation).toMatchObject({preparation_pending:true,work_checks:1});
  expect(f.r.inspect().atomic_preparation).toMatchObject({started:true,starts:1,pre_passes:1,work_checks:1,post_passes:1,final_checks:1,rejection:null,failure:{phase:'fixed_abort',reason:'state'}});
  expect(f.r.inspect().transfer).toMatchObject({aborts:1,successful_seals:0});
  expect(f.r.inspect().budget).toEqual(budget);const before=f.r.inspect().atomic_preparation;expect(()=>f.r.prepareAtomicCommit()).toThrow();expect(f.r.inspect().atomic_preparation).toEqual(before);
  for(const key of ['commit','seal','handle','atomicOwner','atomicShell','prepareAtomicCommitInternal','consumePreparedBundle'])expect(f.r).not.toHaveProperty(key);
  expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');cleared(f.r);
});
it.each(['atomic_prepare_pre','atomic_prepare_post'])('preserves first stop and clears all references at %s',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','throw','unknown']){
    const f=setup(true);f.ready();f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE_BODY');return stop;}});
    expect(()=>f.r.prepareAtomicCommit()).toThrow();const reason=stop==='throw'||stop==='unknown'?'internal':stop;
    expect(f.r.inspect()).toMatchObject({first_failure:reason,atomic_preparation:{started:true,starts:1,final_checks:0,failure:{phase:stage==='atomic_prepare_pre'?'pre':'post',reason}}});
    f.arm(()=>undefined);expect(()=>f.r.prepareAtomicCommit()).toThrow();cleared(f.r);expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');
  }
});
it.each(['atomic_prepare_pre','atomic_prepare_post'])('poisons swallowed reentry at %s without rearming',stage=>{
  const f=setup();f.ready();f.arm(s=>{if(s===stage)try{f.r.prepareAtomicCommit();}catch{/* cannot clear the original stop */}});
  expect(()=>f.r.prepareAtomicCommit()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'reentrant',atomic_preparation:{starts:1,failure:{reason:'reentrant'}}});f.arm(()=>undefined);cleared(f.r);
});
it.each(['atomic_prepare_pre','atomic_prepare_post'])('delegates the original fixed deadline to the same guard at %s',stage=>{
  const f=setup();f.ready();const budget=f.r.inspect().budget;let now=59_999;
  f.arm(s=>{if(s===stage)now=60_000;return now>=60_000?'deadline_exceeded':undefined;});expect(()=>f.r.prepareAtomicCommit()).toThrow();expect(f.r.inspect().budget).toEqual(budget);f.arm(()=>undefined);cleared(f.r);
});
it('rejects early/foreign arguments and source or cleanup invalidation',()=>{
  const early=setup();expect(()=>early.r.prepareAtomicCommit()).toThrow();expect(early.r.inspect().atomic_preparation).toMatchObject({starts:0,failure:{phase:'upstream'}});
  for(const kind of ['source','cleanup','argument']){const f=setup(),t=f.ready();if(kind==='source')f.r.beginSourceClose();if(kind==='cleanup')f.r.beginCleanup(t.cleanup);expect(()=>kind==='argument'?f.r.prepareAtomicCommit({}):f.r.prepareAtomicCommit()).toThrow();expect(f.r.inspect().atomic_preparation?.starts).toBe(0);cleared(f.r);}
});
it('does not replace the existing FP3-C retirement continuation',()=>{
  const r=createSyntheticBundleConsumerRoot(bundlePartsInput(),{guard:()=>undefined});expect(r).not.toHaveProperty('prepareAtomicCommit');expect(r.inspect()).not.toHaveProperty('atomic_preparation');
});
