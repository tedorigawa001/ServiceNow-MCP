import {expect,it} from 'vitest';
import {createSyntheticBundleConsumerRoot,createSyntheticUnpublishedBundleRoot} from '../support/review/synthetic-recovery-kernel.js';
import {bundlePartsInput} from './fixtures/bundle-parts-input.js';
function setup(mixed=false){
  let guard:(s:string)=>unknown=()=>undefined;
  const r=createSyntheticBundleConsumerRoot(bundlePartsInput(mixed),{guard:(s:string)=>guard(s)});
  return {r,arm:(g:typeof guard)=>{guard=g;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
it.each([false,true])('moves the sole bundle into the tracked slot and retires it without publishing (%s)',mixed=>{
  const f=setup(mixed);f.ready();const budget=f.r.inspect().budget;
  const seen:string[]=[];
  f.arm(stage=>{if(stage.startsWith('bundle_consume_')){seen.push(stage);const x=f.r.inspect();expect(x.unpublished_bundle).toMatchObject({pending:false,consumptions:0});expect(x.bundle_consumer).toMatchObject({started:true,pending:true,consumptions:0});expect(x.post_proofs?.state).toBe('consuming');if(stage==='bundle_consume_post')expect(x.bundle_consumer?.work_checks).toBe(1);}});
  expect(()=>f.r.consumePreparedBundle()).toThrow();expect(seen).toEqual(['bundle_consume_pre','bundle_consume_post']);
  expect(f.r.inspect()).toMatchObject({first_failure:'state',bundle_consumer:{started:true,pre_passes:1,work_checks:1,post_passes:1,post_checks:1,pending:false,consumptions:1,retired:true,rejection:null,published:0,seals:0},unpublished_bundle:{pending:false,building_pending:false,origin_pending:false,marker_pending:false,consumptions:1},transfer:{successful_seals:0}});
  expect(f.r.inspect().budget).toEqual(budget);expect(()=>f.r.consumePreparedBundle()).toThrow();expect(f.r.inspect().bundle_consumer?.consumptions).toBe(1);
  expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');for(const key of ['bundle','consumeUnpublishedBundle','consumingBundle','seal','commit'])expect(f.r).not.toHaveProperty(key);
  f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
it.each(['bundle_consume_pre','bundle_consume_post'])('clears the active slot when %s stops',stage=>{
  for(const stop of ['cancelled','deadline_exceeded','throw','unknown']){
    const f=setup(true);f.ready();f.arm(s=>{if(s===stage){if(stop==='throw')throw Error('PRIVATE_BODY');return stop;}});
    expect(()=>f.r.consumePreparedBundle()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:stop==='throw'||stop==='unknown'?'internal':stop,bundle_consumer:{started:true,pending:false,consumptions:0,retired:false},unpublished_bundle:{pending:false,origin_pending:false,marker_pending:false}});
    f.arm(()=>undefined);expect(()=>f.r.consumePreparedBundle()).toThrow();f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');
  }
});
it.each(['bundle_consume_pre','bundle_consume_post'])('does not rearm after swallowed reentry at %s',stage=>{
  const f=setup();f.ready();f.arm(s=>{if(s===stage)try{f.r.consumePreparedBundle();}catch{/* caller cannot undo the root stop */}});
  expect(()=>f.r.consumePreparedBundle()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'reentrant',bundle_consumer:{pending:false,consumptions:0}});f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());
});
it.each(['bundle_consume_pre','bundle_consume_post'])('uses the existing guard deadline without renewing the budget at %s',stage=>{
  const f=setup();f.ready();let now=59_999;const deadline=60_000,budget=f.r.inspect().budget;
  f.arm(s=>{if(s===stage)now=deadline;return now>=deadline?'deadline_exceeded':undefined;});
  expect(()=>f.r.consumePreparedBundle()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:'deadline_exceeded',bundle_consumer:{pending:false,consumptions:0}});expect(f.r.inspect().budget).toEqual(budget);
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());
});
it('rejects arguments and source/cleanup invalidation before consumption',()=>{
  for(const kind of ['source','cleanup','argument']){const f=setup(),t=f.ready();if(kind==='source')f.r.beginSourceClose();if(kind==='cleanup')f.r.beginCleanup(t.cleanup);expect(()=>kind==='argument'?f.r.consumePreparedBundle({}):f.r.consumePreparedBundle()).toThrow();expect(f.r.inspect().bundle_consumer?.consumptions).toBe(0);}
});
it('keeps the previous private builder consumer-free',()=>{
  const r=createSyntheticUnpublishedBundleRoot(bundlePartsInput(),{guard:()=>undefined});r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();expect(()=>r.prepareUnpublishedBundle()).toThrow();expect(r.inspect().unpublished_bundle?.consumptions).toBe(0);expect(r.inspect()).not.toHaveProperty('bundle_consumer');expect(r).not.toHaveProperty('consumePreparedBundle');
});
