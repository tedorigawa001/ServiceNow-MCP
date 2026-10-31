import {expect,it,vi} from 'vitest';
import {createCanonicalReviewBudget} from '../../src/servicenow/review-canonical-budget.js';
import {registerReviewEvidenceSession,type ReviewRunBudgetLease} from '../../src/servicenow/review-evidence-lifecycle.js';

function fixture(limits:Parameters<typeof createCanonicalReviewBudget>[0]['limits']={}){
 let remaining=60000,hook=()=>{};
 const core=createCanonicalReviewBudget({clock:{remainingMs(){hook();return remaining;}},limits});
 const snapshot={},source={},lease:ReviewRunBudgetLease=Object.freeze({read:()=>core.view.lease.read()});
 const stopped=vi.fn();
 const owner=registerReviewEvidenceSession({},snapshot,lease,undefined,{core,stop:stopped}),t=owner.transportConstructor;
 const h=t.claim(snapshot,lease);if(!h.ok)throw Error(h.code);
 expect(t.bindInitialSource(h.value,snapshot,lease,source).ok).toBe(true);
 const b=t.claimStatusBinding(h.value,snapshot,lease,source);if(!b.ok)throw Error(b.code);
 const raw=core.construction.takeBootstrapAccounting();
 const connect=(port=raw)=>b.value.connectAccounting(port);
 const connected=()=>{const r=connect();if(!r.ok)throw Error(r.code);return r.value;};
 return {core,owner,b:b.value,raw,connect,connected,stopped,setTime:(n:number)=>{remaining=n;},setHook:(h:()=>void)=>{hook=h;}};
}
it('delegates C/G once to the same core/lease with an independent fake event oracle',()=>{
 const f=fixture(),p=f.connected(),events:number[]=[];p.reserve();expect(p.reserved()).toBe(4);
 for(const bytes of [3,0,5]){p.dispatch(100);events.push(bytes);p.chunk(bytes);}
 expect(f.core.view.stats()).toEqual({requests:events.length,received_bytes:events.reduce((a,b)=>a+b,0),payload_bytes:0});
 expect(f.core.view.lease.read()).toMatchObject({requests:3,received_bytes:8,remaining_ms:60000});
 p.release();p.release();expect(p.reserved()).toBe(0);expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:'closed',accounting_claim:'claimed'});
 expect(f.owner.failure()).toBeUndefined();expect(f.stopped).not.toHaveBeenCalled();
 expect(()=>p.dispatch()).toThrow('closed');expect(f.core.view.stats().requests).toBe(3);
});
it.each(['copy','foreign'] as const)('rejects %s accounting before updating either core',kind=>{
 const f=fixture(),other=fixture();const port=kind==='copy'?Object.freeze({...f.raw}):other.raw;
 expect(f.connect(port)).toMatchObject({ok:false,code:'evidence_binding_mismatch'});
 expect(f.connect().ok).toBe(false);expect(f.core.view.stats().requests).toBe(0);expect(other.core.view.stats().requests).toBe(0);
 expect(other.connected().reserved()).toBe(0);
});
it('rejects duplicate attachment and synchronously stops the attached core without resetting claims',()=>{
 const f=fixture(),p=f.connected();p.reserve();expect(f.connect()).toMatchObject({ok:false,code:'invalid_state'});
 expect(f.core.view.diagnostic().primary).toEqual({internal:'invalid_state',public:'internal_review_error'});
 expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:'invalid_state'});
 expect(()=>p.chunk(1)).toThrow('internal_review_error');expect(f.stopped).toHaveBeenCalledTimes(1);
});
it.each(['cancelled','deadline_exceeded','evidence_binding_mismatch'] as const)('propagates core %s synchronously and retains first diagnostics',code=>{
 const f=fixture(),p=f.connected();p.reserve();p.dispatch();p.chunk(7);
 f.core.writer.stop(code);
 expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:code,budget_primary:{internal:code}});
 expect(f.owner.failure()).toBe(code);expect(f.stopped).toHaveBeenCalledTimes(1);
 f.owner.close('closed');p.release();expect(f.b.diagnostic().first_terminal).toBe(code);
 expect(f.core.view.stats()).toEqual({requests:1,received_bytes:7,payload_bytes:0});
 expect(JSON.stringify(f.b.diagnostic())).not.toMatch(/snapshot|credential|token/);
});
it('propagates owner stop to the canonical core before calling the fixed stop owner',()=>{
 const f=fixture(),p=f.connected();p.reserve();f.owner.revoke('cancelled');
 expect(f.core.view.failure()).toBe('cancelled');expect(f.b.diagnostic().state).toBe('revoked');expect(f.stopped).toHaveBeenCalledTimes(1);
 expect(()=>p.dispatch()).toThrow('cancelled');expect(f.core.view.stats().requests).toBe(0);
});
it('charges an overshoot once, then refuses all subsequent writes and keeps the overshoot',()=>{
 const f=fixture({totalBytes:4}),p=f.connected();p.reserve();p.dispatch();p.chunk(4);
 expect(()=>p.chunk(1)).toThrow('receive_budget_exceeded');expect(()=>p.chunk(1)).toThrow('receive_budget_exceeded');
 expect(f.core.view.stats()).toEqual({requests:1,received_bytes:5,payload_bytes:0});expect(f.stopped).toHaveBeenCalledTimes(1);
});
it('rejects dispatch at its floor without C and retains that failure after release',()=>{
 const f=fixture(),p=f.connected();p.reserve();f.setTime(100);
 expect(()=>p.dispatch(100)).toThrow('upstream_unavailable');p.release();
 expect(f.core.view.stats().requests).toBe(0);expect(f.b.diagnostic().first_terminal).toBe('upstream_unavailable');
});
it.each(['throw','reject'] as const)('records one C for a dispatched fake %s and never refunds it',async kind=>{
 const f=fixture(),p=f.connected();p.reserve();let calls=0;
 const dispatch=()=>{p.dispatch();calls++;if(kind==='throw')throw Error('PRIVATE_FAILURE');return Promise.reject(Error('PRIVATE_FAILURE'));};
 try{await dispatch();}catch{f.owner.revoke('upstream_unavailable');}finally{p.release();}
 expect(calls).toBe(1);expect(f.core.view.stats().requests).toBe(1);expect(f.b.diagnostic().first_terminal).toBe('upstream_unavailable');
});
it('preserves the first internal reason during a clock callback cancellation before dispatch',()=>{
 const f=fixture(),p=f.connected();p.reserve();let done=false;
 f.setHook(()=>{if(!done){done=true;f.owner.revoke('cancelled');}});
 expect(()=>p.dispatch()).toThrow('cancelled');expect(f.core.view.stats().requests).toBe(0);expect(f.stopped).toHaveBeenCalledTimes(1);
});
it('closes on accounting expiry and cannot reconnect when the clock changes',()=>{
 const f=fixture(),p=f.connected();p.reserve();f.setTime(0);
 expect(()=>p.chunk(1)).toThrow('deadline_exceeded');expect(f.b.diagnostic().first_terminal).toBe('deadline_exceeded');
 f.setTime(1);expect(f.connect().ok).toBe(false);expect(f.core.view.stats().received_bytes).toBe(0);
});
it('invalidates binding and records the budget reason before notifying the fixed stop owner',()=>{
 const f=fixture(),p=f.connected();p.reserve();
 f.stopped.mockImplementation(()=>{
   expect(f.b.diagnostic()).toMatchObject({state:'revoked',first_terminal:'cancelled',budget_primary:{internal:'cancelled'}});
   expect(()=>p.dispatch()).toThrow('cancelled');
 });
 f.owner.revoke('cancelled');expect(f.stopped).toHaveBeenCalledTimes(1);expect(f.core.view.stats().requests).toBe(0);
});
it('spends attachment on reentry and does not return a recovered writer',()=>{
 const f=fixture();let entered=false;
 f.setHook(()=>{if(!entered){entered=true;expect(f.connect().ok).toBe(false);}});
 expect(f.connect().ok).toBe(false);f.setHook(()=>{});expect(f.connect().ok).toBe(false);
 expect(f.core.view.stats().requests).toBe(0);expect(f.b.diagnostic().state).toBe('revoked');
});
it('does not accept a released raw port even though it belongs to the same core',()=>{
 const f=fixture();f.raw.release();expect(f.connect()).toMatchObject({ok:false,code:'evidence_binding_mismatch'});
 expect(f.connect().ok).toBe(false);expect(f.core.view.stats().requests).toBe(0);
});
