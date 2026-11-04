import {expect,it} from 'vitest';
import {createSyntheticAtomicStagingRoot,createSyntheticAtomicPreparationRoot} from '../support/review/synthetic-recovery-kernel.js';
import {bundlePartsInput} from './fixtures/bundle-parts-input.js';
function setup(mixed=false){
  let guard:(s:string)=>unknown=()=>undefined;const r=createSyntheticAtomicStagingRoot(bundlePartsInput(mixed),{guard:(s:string)=>guard(s)});
  return {r,arm:(g:typeof guard)=>{guard=g;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
function clear(r:ReturnType<typeof createSyntheticAtomicStagingRoot>){
  expect(r.inspect().atomic_stage).toMatchObject({terminal_pending:false,bundle_pending:false,candidate_pending:false,staged_pending:false,origin_pending:false,source_closed:false,cleanup_confirmed:false,commits:0,seals:0,published:0});
  expect(r.inspect().atomic_preparation).toMatchObject({state:'failed',owner_pending:false,shell_pending:false,bundle_pending:false,preparation_pending:false});
  r.finalDiscard(r.transferFailure());expect(r.custody().payload_cleared).toBe(true);
}
it.each([false,true])('builds one bound private candidate before post and stages it only after post (%s)',mixed=>{
  const f=setup(mixed);f.ready();const budget=f.r.inspect().budget,seen:ReturnType<typeof f.r.inspect>[]=[];
  f.arm(s=>{if(s.startsWith('atomic_prepare_'))seen.push(f.r.inspect());});expect(()=>f.r.stageAtomicCommit()).toThrow();
  expect(seen).toHaveLength(2);expect(seen[0].atomic_stage).toMatchObject({started:false,terminal_issues:0,record_builds:0,staged:0});
  expect(seen[1].atomic_stage).toMatchObject({started:true,starts:1,terminal_issues:1,record_builds:1,checks:1,terminal_pending:true,bundle_pending:true,candidate_pending:true,staged_pending:false,staged:0});
  expect(f.r.inspect()).toMatchObject({first_failure:'state',atomic_stage:{starts:1,terminal_issues:1,record_builds:1,checks:3,staged:1},atomic_preparation:{staged:1,failure:{phase:'fixed_abort',reason:'state'}},transfer:{aborts:1,successful_seals:0}});
  expect(f.r.inspect().budget).toEqual(budget);const before=f.r.inspect().atomic_stage;expect(()=>f.r.stageAtomicCommit()).toThrow();expect(f.r.inspect().atomic_stage).toEqual(before);
  for(const key of ['commit','seal','handle','record','terminal','prepareAtomicCommit','buildAtomicStage','stageAtomicRecord'])expect(f.r).not.toHaveProperty(key);expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');clear(f.r);
});
it.each(['atomic_prepare_pre','atomic_prepare_post'])('stops and clears partial records at %s',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','throw','unknown']){const f=setup(true);f.ready();f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE_BODY');return stop;}});
    expect(()=>f.r.stageAtomicCommit()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:stop==='throw'||stop==='unknown'?'internal':stop,atomic_stage:{staged:0,record_builds:stage==='atomic_prepare_pre'?0:1}});
    f.arm(()=>undefined);clear(f.r);expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');}
});
it.each(['atomic_prepare_pre','atomic_prepare_post'])('retains a swallowed reentry stop at %s',stage=>{
  const f=setup();f.ready();f.arm(s=>{if(s===stage)try{f.r.stageAtomicCommit();}catch{/* cannot reopen the constructor */}});expect(()=>f.r.stageAtomicCommit()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'reentrant',atomic_stage:{staged:0}});f.arm(()=>undefined);clear(f.r);
});
it.each(['source','cleanup'])('invalidates the original route before staging: %s',kind=>{
  const f=setup(),t=f.ready();if(kind==='source')f.r.beginSourceClose();else f.r.beginCleanup(t.cleanup);expect(f.r.inspect().atomic_preparation?.state).toBe('invalidated');expect(()=>f.r.stageAtomicCommit()).toThrow();expect(f.r.inspect().atomic_stage).toMatchObject({starts:0,terminal_issues:0,staged:0});clear(f.r);
});
it('rejects foreign arguments and an unprepared construction',()=>{
  const f=setup();f.ready();expect(()=>f.r.stageAtomicCommit({})).toThrow();expect(f.r.inspect().atomic_stage?.record_builds).toBe(0);clear(f.r);
  const early=setup();expect(()=>early.r.stageAtomicCommit()).toThrow();expect(early.r.inspect().atomic_stage?.starts).toBe(0);
});
it('keeps AC-A preparation-only and delegates the original fixed deadline',()=>{
  const a=createSyntheticAtomicPreparationRoot(bundlePartsInput(),{guard:()=>undefined});expect(a).not.toHaveProperty('stageAtomicCommit');expect(a.inspect()).not.toHaveProperty('atomic_stage');
  const f=setup();f.ready();const budget=f.r.inspect().budget;let now=59_999;f.arm(s=>{if(s==='atomic_prepare_post')now=60_000;return now>=60_000?'deadline_exceeded':undefined;});expect(()=>f.r.stageAtomicCommit()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'deadline_exceeded',atomic_stage:{record_builds:1,staged:0}});expect(f.r.inspect().budget).toEqual(budget);f.arm(()=>undefined);clear(f.r);
});
