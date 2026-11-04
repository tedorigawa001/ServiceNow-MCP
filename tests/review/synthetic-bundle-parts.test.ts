import {afterEach,expect,it,vi} from 'vitest';
import {createSyntheticBundlePartsRoot,createSyntheticFullProjectionReceiptRoot} from '../support/review/synthetic-recovery-kernel.js';
import * as expectation from '../support/review/synthetic-recovery-finish-values.js';
import * as content from '../support/review/synthetic-full-mixed-draft.js';
import * as prefix from '../support/review/synthetic-pending-prefix-values.js';
import {bundlePartsInput} from './fixtures/bundle-parts-input.js';
afterEach(()=>vi.restoreAllMocks());
function setup(mixed=false){
  let guard:(s:string)=>unknown=()=>undefined;const raw=bundlePartsInput(mixed),r=createSyntheticBundlePartsRoot(raw,{guard:(s:string)=>guard(s)});
  return {r,raw,arm:(g:typeof guard)=>{guard=g;},ready:()=>{r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();return t;}};
}
it.each([false,true])('builds same-snapshot expectation and all work parts once, but never completes a bundle (%s)',mixed=>{
  const es=vi.spyOn(expectation,'projectRecoveryFinishExpectation'),ds=vi.spyOn(content,'projectSyntheticFullMixedDraft'),ps=vi.spyOn(prefix,'projectSyntheticPendingPrefixValues'),f=setup(mixed);f.ready();const budget=f.r.inspect().budget;
  let post:ReturnType<typeof f.r.inspect>|undefined;f.arm(s=>{if(s==='transfer_post')post=f.r.inspect();});
  expect(()=>f.r.prepareBundleParts()).toThrow();expect(es).toHaveBeenCalledTimes(1);expect(ds).toHaveBeenCalledTimes(1);expect(ps).toHaveBeenCalledTimes(1);
  expect(post?.bundle_parts).toMatchObject({expectations:1,projection_comparisons:1,builds:1,post_checks:0,pending:true,expectation_pending:true,prefix_pending:true,content_pending:true,completed_bundles:0,content_checks:0,relations:0});
  expect(f.r.inspect()).toMatchObject({first_failure:'state',full_projection:{receipts:1,post_checks:1},bundle_parts:{builds:1,post_checks:1,owner_pending:false,pending:false,expectation_pending:false,content_pending:false,prefix_pending:false,completed_bundles:0,seals:0}});
  // Independent input oracle: time/header/input identities and P0/Pp/final-prefix lanes are not interchangeable.
  const e=es.mock.calls[0][0] as {binding:{accepted_origin:object};time:unknown;header:{limitations:string[]};selected:string[];inputs:{receipt:object;update_xml_sys_id:string}[];outcomes:{state:string}[];content_evidence:unknown};
  const d=ds.mock.calls[0][0] as {rows:unknown[];manifest:{assets:{state:string}[];prefix:{limitations:string[]}}};
  expect(e.time).toEqual(f.raw.finish.time);expect(e.selected).toEqual(f.raw.finish.selected);expect(e.inputs.map(x=>x.update_xml_sys_id)).toEqual(f.raw.finish.inputs.map(x=>x.update_xml_sys_id));
  expect(new Set(e.inputs.map(x=>x.receipt)).size).toBe(e.inputs.length);expect(e.binding.accepted_origin).toBeTruthy();
  expect(e.content_evidence).toEqual({original_body:'unknown',full_schema:'unverified',wire:'unverified'});
  expect(e.header).toEqual({...f.raw.finish.header,limitations:[...new Set([...f.raw.finish.header.limitations,...(mixed?['response_truncated','finding_budget_exceeded']:[]),'soft_deadline_reached','deadline_exceeded','provisional_results','consistency_unverified'])].sort(),
    errors:[...(mixed?[{stage:'output',code:'response_limit'}]:[]),{stage:'analysis',code:'deadline_exceeded'}]});
  expect(e.header.limitations).toContain('soft_deadline_reached');expect(d.manifest.prefix.limitations).not.toContain('soft_deadline_reached');expect(d.manifest.prefix.limitations.slice(0,f.raw.mixed.initial_prefix.limitations.length)).toEqual(f.raw.mixed.initial_prefix.limitations);
  if(mixed){expect(e.outcomes.map(x=>x.state)).toEqual(['reviewed','result_omitted','result_omitted','not_processed']);expect(d.manifest.assets.map(x=>x.state)).toEqual(e.outcomes.map(x=>x.state));}
  expect(f.r.inspect().budget).toEqual(budget);expect(JSON.stringify(f.r.inspect())).not.toContain('PRIVATE_BODY');expect(()=>f.r.prepareBundleParts()).toThrow();expect(es).toHaveBeenCalledTimes(1);
  f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  for(const key of ['expectation','bundleParts','seal','commit','receiveFullProjection','prepareDestination'])expect(f.r).not.toHaveProperty(key);
});
it.each(['transfer_pre','transfer_post'])('stops/clears without completing proof at %s',stage=>{
  for(const reason of ['cancelled','deadline_exceeded','throw','unknown']){
    const f=setup(true);f.ready();f.arm(s=>{if(s===stage){if(reason==='throw')throw Error('PRIVATE');return reason;}});
    expect(()=>f.r.prepareBundleParts()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:reason==='throw'||reason==='unknown'?'internal':reason,bundle_parts:{builds:stage==='transfer_pre'?0:1,post_checks:0,pending:false,expectation_pending:false,content_pending:false,prefix_pending:false,owner_pending:false,completed_bundles:0}});
    f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  }
});
it.each([undefined,'cancelled','deadline_exceeded'])('keeps work failure provisional and prioritizes post stop %s',stop=>{
  const f=setup();f.ready();vi.spyOn(expectation,'projectRecoveryFinishExpectation').mockImplementationOnce(()=>{throw Error('PRIVATE');});
  f.arm(s=>s==='transfer_post'?stop:undefined);expect(()=>f.r.prepareBundleParts()).toThrow();expect(f.r.inspect()).toMatchObject({first_failure:stop??'binding',bundle_parts:{builds:0,post_checks:0,pending:false}});
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
});
it('rejects reentry, foreign arguments and reuse after invalidation',()=>{
  const f=setup();f.ready();f.arm(s=>{if(s==='transfer_post')try{f.r.prepareBundleParts();}catch{/* swallowed */}});expect(()=>f.r.prepareBundleParts()).toThrow();expect(f.r.inspect().first_failure).toBe('reentrant');
  f.arm(()=>undefined);f.r.finalDiscard(f.r.transferFailure());expect(f.r.custody().payload_cleared).toBe(true);
  const a=setup(),b=setup();a.ready();b.ready();const before=b.r.inspect();expect(()=>a.r.prepareBundleParts(before)).toThrow();expect(b.r.inspect()).toEqual(before);
  const x=setup();x.ready();x.r.beginSourceClose();expect(()=>x.r.prepareBundleParts()).toThrow();expect(x.r.inspect().bundle_parts?.builds).toBe(0);
});
it('leaves the FP-1 continuation free of expectation and body generation',()=>{
  const es=vi.spyOn(expectation,'projectRecoveryFinishExpectation'),ds=vi.spyOn(content,'projectSyntheticFullMixedDraft'),r=createSyntheticFullProjectionReceiptRoot(bundlePartsInput(),{guard:()=>undefined});
  r.prepare();r.move();r.startKernel();r.beginClosure();r.settleOld({termination:'confirmed',cleanup:'complete'});r.prepareGeneration();const t=r.claimGeneration(),l=r.startGeneration(t.start);r.acceptReady(l,r.issueReady(l));r.adopt();
  expect(()=>r.receiveFullProjection()).toThrow();expect(es).not.toHaveBeenCalled();expect(ds).not.toHaveBeenCalled();expect(r).not.toHaveProperty('prepareBundleParts');
});
