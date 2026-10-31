import {expect,it} from 'vitest';
import {registerReviewEvidenceSession,type ReviewRunBudgetLease} from '../../src/servicenow/review-evidence-lifecycle.js';

function fixture(){
 const snapshot={},source={};let remaining=60000;let hook=()=>{};
 const lease:ReviewRunBudgetLease={read(){hook();return {requests:0,received_bytes:0,payload_bytes:0,remaining_ms:remaining};}};
 const owner=registerReviewEvidenceSession({},snapshot,lease),t=owner.transportConstructor;
 const claim=t.claim(snapshot,lease);if(!claim.ok)throw Error(claim.code);
 const handle=claim.value;expect(t.bindInitialSource(handle,snapshot,lease,source).ok).toBe(true);
 const create=()=>t.claimStatusBinding(handle,snapshot,lease,source);
 return {snapshot,source,lease,owner,t,handle,create,setRemaining:(n:number)=>{remaining=n;},setHook:(fn:()=>void)=>{hook=fn;}};
}
function bound(){const f=fixture(),r=f.create();if(!r.ok)throw Error(r.code);return {...f,b:r.value};}

it('binds the existing constructor before ready without a permit or issuance authority',()=>{
 const f=bound();expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source)).toMatchObject({ok:true,value:{ready_generation:0,evidence_issuance:'disabled',dispatch:'unavailable'}});
 expect(f.owner.markReady(f.snapshot,f.lease)).toBe(true);
 expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source)).toMatchObject({ok:true,value:{ready_generation:1}});
 expect(Object.keys(f.b).sort()).toEqual(['connectAccounting','diagnostic','inspect']);
});
it.each(['handle','snapshot','lease','source'] as const)('rejects foreign %s and cannot restart after failure',key=>{
 const f=bound(),other=bound();
 const args=[f.handle,f.snapshot,f.lease,f.source] as const;
 const foreign=[other.handle,other.snapshot,other.lease,other.source] as const;
 const changed=[...args];changed[['handle','snapshot','lease','source'].indexOf(key)]=foreign[['handle','snapshot','lease','source'].indexOf(key)];
 expect(f.b.inspect(...changed as unknown as typeof args)).toMatchObject({ok:false,code:'evidence_binding_mismatch'});
 expect(f.b.inspect(...args).ok).toBe(false);expect(f.create().ok).toBe(false);
 expect(other.b.inspect(other.handle,other.snapshot,other.lease,other.source).ok).toBe(true);
 expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:'evidence_binding_mismatch',refusal:'evidence_binding_mismatch'});
});
it('rejects duplicate creation without replacing the first context',()=>{
 const f=bound();expect(f.create()).toMatchObject({ok:false,code:'invalid_state'});
 expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:'invalid_state'});
 expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source).ok).toBe(false);
});
it.each(['cancelled','deadline_exceeded','closed'] as const)('synchronously revokes and retains first %s after close',reason=>{
 const f=bound();f.owner.revoke(reason);expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:reason,primary:{code:reason}});
 f.owner.close('closed');expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source)).toMatchObject({ok:false,code:reason});
 expect(f.create().ok).toBe(false);expect(f.b.diagnostic().first_terminal).toBe(reason);
 expect(JSON.stringify(f.b.diagnostic())).not.toMatch(/snapshot|permit|lease|token/);
});
it('fails the generation claim before callbacks can reenter it',()=>{
 const f=fixture();let entered=false;f.setHook(()=>{if(!entered){entered=true;expect(f.create().ok).toBe(false);}});
 expect(f.create().ok).toBe(false);f.setHook(()=>{});expect(f.create().ok).toBe(false);
});
it('rejects a callback stop in the post guard instead of returning a live binding',()=>{
 const f=bound();f.setHook(()=>f.owner.revoke('cancelled'));
 expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source)).toMatchObject({ok:false,code:'cancelled'});
 expect(f.b.diagnostic().first_terminal).toBe('cancelled');
});
it('does not permit first generation after ready or after an expired observation',()=>{
 const ready=fixture();ready.owner.markReady(ready.snapshot,ready.lease);expect(ready.create().ok).toBe(false);
 const expired=fixture();expired.setRemaining(0);expect(expired.create()).toMatchObject({ok:false,code:'deadline_exceeded'});expect(expired.create().ok).toBe(false);
});
it('rejects first generation for a copied initial source and spends that claim',()=>{
 const f=fixture();expect(f.t.claimStatusBinding(f.handle,f.snapshot,f.lease,{})).toMatchObject({ok:false,code:'evidence_binding_mismatch'});
 expect(f.create().ok).toBe(false);
});
it('retains observation failure instead of reviving a context after the lease recovers',()=>{
 const f=bound();f.setHook(()=>{throw Error('PRIVATE_FAILURE');});
 expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source)).toMatchObject({ok:false,code:'internal_review_error'});
 f.setHook(()=>{});expect(f.b.inspect(f.handle,f.snapshot,f.lease,f.source).ok).toBe(false);
 expect(JSON.stringify(f.b.diagnostic())).not.toContain('PRIVATE_FAILURE');
});
it('rechecks a ready transition introduced by the final generation observation',()=>{
 const f=fixture();let calls=0;
 f.setHook(()=>{if(++calls===3){f.setHook(()=>{});f.owner.markReady(f.snapshot,f.lease);}});
 expect(f.create().ok).toBe(false);expect(f.create().ok).toBe(false);
});
