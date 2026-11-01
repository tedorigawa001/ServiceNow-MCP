import {expect,it} from 'vitest';
import {createReleaseComparisonReceiptOwner,type ReleaseComparisonProjection} from '../../src/servicenow/review-kernel/release-comparison-receipt.js';
const start='2026-11-01T00:00:00.000Z',observed='2026-11-01T00:00:01.000Z';
const assertion=()=>({source:'operator_config' as const,resolution_status:'asserted' as const,visibility_scope:'operator_configured' as const,family:'Australia' as const,instance_binding:'a'.repeat(64),config_version:'b'.repeat(64),asserted_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-12-01T00:00:00.000Z'});
const projection=(policy:ReleaseComparisonProjection['policy']={instanceBinding:'a'.repeat(64),assertion:assertion()}):ReleaseComparisonProjection=>Object.freeze({session:{},source:{},key:{},timing:Object.freeze({started_at:start,deadline_ms:60000}),policy:Object.freeze(policy)});
it('retains empty-200 O in a private accepted candidate without adding it to assertion evidence',()=>{
  const p=projection(),ack={},owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  const receipt=owner.issue(p,ack,[],observed),candidate=owner.compare(p,receipt);owner.accept(p,candidate);
  expect(owner.inspect()).toMatchObject({state:'accepted',observed_at:observed,comparison:{kind:'release_comparison_draft',decision:{release_match:'matched',instance_release:{source:'operator_config'}},permissions:{release_permit:false,dispatch:false,formal_issuance:false,fallback_activation:false}}});
  expect(owner.inspect().comparison!.decision.instance_release).not.toHaveProperty('observed_at');
});
function fixture(p=projection()){
  const ack={};let action=()=>{},reason='internal_review_error';
  const owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>action(),reject:()=>{throw Error(reason);}});
  const issue=(rows:unknown=[])=>owner.issue(p,ack,rows,observed);
  return {p,ack,owner,issue,complete:(rows:unknown=[])=>owner.accept(p,owner.compare(p,issue(rows))),arm:(fn:()=>void)=>{action=fn;},stop:(next:string)=>{reason=next;throw Error('PRIVATE_GUARD');}};
}
it('uses a bounded copy of the exact issued rows, not their later mutation',()=>{
  const f=fixture(),rows=[{build_name:'Australia'}],receipt=f.issue(rows);rows[0].build_name='Zurich';
  f.owner.accept(f.p,f.owner.compare(f.p,receipt));
  expect(f.owner.inspect().comparison?.decision.instance_release).toMatchObject({source:'sys_cluster_state.build_name',raw_buildname:'Australia',observed_at:observed});
  expect(Object.isFrozen(f.owner.inspect().comparison?.decision.instance_release)).toBe(true);
});
it.each(['projection','ack','receipt','candidate'] as const)('rejects foreign %s while another owner stays healthy',kind=>{
  const f=fixture(),g=fixture();
  if(kind==='projection')expect(()=>f.owner.issue(g.p,f.ack,[],observed)).toThrow('internal_review_error');
  if(kind==='ack')expect(()=>f.owner.issue(f.p,g.ack,[],observed)).toThrow('internal_review_error');
  if(kind==='receipt'){const receipt=g.issue();f.issue();expect(()=>f.owner.compare(f.p,receipt)).toThrow('internal_review_error');g.owner.accept(g.p,g.owner.compare(g.p,receipt));}
  else if(kind==='candidate'){const candidate=g.owner.compare(g.p,g.issue());f.owner.compare(f.p,f.issue());expect(()=>f.owner.accept(f.p,candidate)).toThrow('internal_review_error');g.owner.accept(g.p,candidate);}
  else g.complete();
  expect(f.owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});expect(g.owner.inspect().state).toBe('accepted');
});
it.each(['issue','compare','accept'] as const)('refuses duplicate %s and never restores a consumed handle',phase=>{
  const f=fixture(),receipt=f.issue();
  if(phase==='issue')expect(()=>f.issue()).toThrow('internal_review_error');
  else {const candidate=f.owner.compare(f.p,receipt);if(phase==='compare')expect(()=>f.owner.compare(f.p,receipt)).toThrow('internal_review_error');
    else {f.owner.accept(f.p,candidate);expect(()=>f.owner.accept(f.p,candidate)).toThrow('internal_review_error');}}
  expect(f.owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});
  expect(()=>f.issue()).toThrow('internal_review_error');
});
it.each([1,2,3,4,5,6])('preserves failure at guard %i and clears unpublished O/candidate',at=>{
  const f=fixture();let checks=0;f.arm(()=>{if(++checks===at)f.stop(at%2?'cancelled':'deadline_exceeded');});
  const code=at%2?'cancelled':'deadline_exceeded';expect(()=>f.complete()).toThrow(code);
  expect(f.owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});expect(()=>f.issue()).toThrow(code);
});
it('refuses caught reentry at issuance and cannot revive the outer call',()=>{
  const f=fixture();let once=true;f.arm(()=>{if(once){once=false;try{f.issue();}catch{}}});
  expect(()=>f.issue()).toThrow('internal_review_error');expect(f.owner.inspect().state).toBe('failed');
});
it('closes and discards retained empty-200 UTC after successful acceptance',()=>{
  const f=fixture();f.complete();expect(f.owner.inspect().observed_at).toBe(observed);f.owner.close();
  expect(f.owner.inspect()).toEqual({state:'closed',observed_at:null,comparison:null});expect(()=>f.issue()).toThrow('internal_review_error');
});
it('does not treat a serialized accepted draft as a candidate handle',()=>{
  const f=fixture(),g=fixture();f.complete();const copy=JSON.parse(JSON.stringify(f.owner.inspect().comparison));g.owner.compare(g.p,g.issue());
  expect(()=>g.owner.accept(g.p,copy)).toThrow('internal_review_error');expect(f.owner.inspect().state).toBe('accepted');
});
it.each([
  {rows:[],reason:'observation_unavailable'},
  {rows:[{build_name:'UNKNOWN'}],reason:'observation_inconsistent'},
  {rows:[{build_name:'Australia'},{build_name:null}],reason:'observation_incomplete'},
  {rows:Array(21).fill({build_name:'Australia'}),reason:'observation_limit'},
])('accepts a non-executable unknown and retains O for $reason',({rows,reason})=>{
  const f=fixture(projection({instanceBinding:'a'.repeat(64)}));f.complete(rows);
  expect(f.owner.inspect()).toMatchObject({observed_at:observed,comparison:{decision:{release_match:'unknown',instance_release:{source:'none',reason},limitations:[reason,'release_unknown']}}});
});
it.each(['Australia','Brazil','Zurich','Yokohama','Xanadu'] as const)('uses the fixed comparator for %s without authority',family=>{
  const f=fixture(projection({instanceBinding:'a'.repeat(64)}));f.complete([{build_name:family}]);
  expect(f.owner.inspect().comparison).toMatchObject({model_id:'release-comparison-v1',decision:{release_match:family==='Australia'?'matched':'mismatched',instance_release:{family,observed_at:observed},limitations:['release_visible_nodes_only',...(family==='Australia'?[]:['release_mismatch'])]},permissions:{release_permit:false,dispatch:false,formal_issuance:false,fallback_activation:false}});
});
it('keeps full L and insufficient policy after a long observation delay',()=>{
  const p=projection({instanceBinding:'a'.repeat(64),assertion:{...assertion(),expires_at:'2026-11-01T00:00:50.000Z'},issue:'config_validity_insufficient'}),ack={};
  const owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{},reject:()=>{throw Error('internal_review_error');}}),o='2026-11-01T00:00:45.000Z';
  owner.accept(p,owner.compare(p,owner.issue(p,ack,[],o)));
  expect(owner.inspect()).toMatchObject({observed_at:o,comparison:{decision:{release_match:'unknown',instance_release:{reason:'config_validity_insufficient'}}}});
});
it.each(['invalid_issue','reverse','forward','raw22'] as const)('stops on %s without falling back or retaining O',fault=>{
  const p=projection(fault==='invalid_issue'?{instanceBinding:'a'.repeat(64),assertion:assertion(),issue:'config_expired'}:undefined),ack={};
  const owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  const o=fault==='reverse'?'2026-10-31T23:59:59.999Z':fault==='forward'?'2026-11-01T00:01:00.001Z':observed;
  expect(()=>owner.accept(p,owner.compare(p,owner.issue(p,ack,fault==='raw22'?Array(22).fill({build_name:'Australia'}):[],o)))).toThrow('internal_review_error');
  expect(owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});
});
it('keeps post-comparison cancellation ahead of a contradictory policy result',()=>{
  const f=fixture(projection({instanceBinding:'a'.repeat(64),assertion:assertion(),issue:'config_expired'}));
  const receipt=f.issue();let checks=0;f.arm(()=>{if(++checks===2)f.stop('cancelled');});
  expect(()=>f.owner.compare(f.p,receipt)).toThrow('cancelled');expect(f.owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});
});
it('does not hide unknown policy fields when omitting unset optionals',()=>{
  const base=projection(),p=Object.freeze({...base,policy:Object.freeze({...base.policy,issue:undefined,extra:'PRIVATE_UNKNOWN'})}),ack={};
  const owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  expect(()=>owner.issue(p,ack,[],observed)).toThrow('internal_review_error');
  expect(owner.inspect()).toMatchObject({state:'failed',observed_at:null,comparison:null});
});
it('projects unset optional policy fields without changing the pinned policy object',()=>{
  const base=projection(),p=Object.freeze({...base,policy:Object.freeze({...base.policy,issue:undefined})}),ack={};
  const owner=createReleaseComparisonReceiptOwner(p,ack,{check:()=>{},reject:()=>{throw Error('internal_review_error');}});
  owner.accept(p,owner.compare(p,owner.issue(p,ack,[],observed)));
  expect(owner.inspect().comparison?.decision.instance_release.source).toBe('operator_config');
  expect(Object.hasOwn(p.policy,'issue')).toBe(true);expect(p.policy.issue).toBeUndefined();
});
