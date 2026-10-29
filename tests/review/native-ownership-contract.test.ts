import {expect,it,vi} from 'vitest';
import {createSyntheticNativeContractDomain} from '../../src/servicenow/review-native-contract.js';
import {createFakeCleanupContract} from '../../src/review/abort-scope-evidence-cleanup-contract.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const observation={pending_read:false,eof:true,cancel:'not_requested',closed:'fulfilled',closed_captured:true} as const;
function setup(domain=createSyntheticNativeContractDomain()){
  let remaining=60000,onRead=()=>{};const run=domain.identity('run'),signal=domain.identity('signal'),budget={read:()=>{onRead();return {remaining_ms:remaining};}},ports=get(domain.createOwner({run,budget,signal,deadline_ms:60000}));
  const issued=get(ports.issuer.attempt({purpose:'parent',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000}));
  return {domain,...ports,...issued,run,signal,budget,time:(n:number)=>{remaining=n;},onRead:(fn:()=>void)=>{onRead=fn;}};
}
function claimed(s:ReturnType<typeof setup>,stream=s.domain.identity('stream')){const d=get(s.issuer.delivery(s.attempt,s.window,{response:s.domain.identity('response'),stream})),r=get(s.owner.claim(s.attempt,s.window,d));get(s.issuer.reader(r,s.domain.identity('reader')));return r;}
it('binds a synthetic delivery and its pre-release/end evidence to one owner, attempt and original window',()=>{
  const s=setup(),response=s.domain.identity('response'),stream=s.domain.identity('stream');const delivery=get(s.issuer.delivery(s.attempt,s.window,{response,stream})),resource=get(s.owner.claim(s.attempt,s.window,delivery));
  get(s.issuer.reader(resource,s.domain.identity('reader')));const before=get(s.issuer.preRelease(resource,observation)),end=get(s.issuer.end(resource,before,{release:'succeeded'}));
  expect(Object.keys(end)).toEqual([]);expect(get(s.owner.consume(s.attempt,s.window,resource,end))).toMatchObject({state:'end_verified_only',cleanup:{disposition:'confirmed',kind:'eof'},native_operations:'unavailable',evidence_issuance:'disabled',body_eligible:false});
  expect(s.owner.status()).toMatchObject({consumed:1,primary:null,resources:1});
});
it('rejects claim at the original I/O cutoff instead of starting another window',()=>{
  const s=setup(),d=get(s.issuer.delivery(s.attempt,s.window,{response:s.domain.identity('response'),stream:s.domain.identity('stream')}));s.time(50250);
  expect(s.owner.claim(s.attempt,s.window,d)).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(s.owner.status().resources).toBe(0);s.time(60000);expect(s.owner.claim(s.attempt,s.window,d)).toEqual({ok:false,code:'attempt_deadline_exceeded'});
});
it('does not issue either attempt when the budget callback reenters generation',()=>{
  const s=setup();let nested:unknown;s.onRead(()=>{s.onRead(()=>{});nested=s.issuer.attempt({purpose:'release',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000});});
  expect(s.issuer.attempt({purpose:'release',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000})).toEqual({ok:false,code:'invalid_state'});expect(nested).toEqual({ok:false,code:'invalid_state'});expect(s.owner.status()).toMatchObject({primary:'invalid_state',attempts:1});
});
it.each([{io_floor_ms:50000,cleanup_floor_ms:50000},{io_floor_ms:50251,cleanup_floor_ms:50000},{io_floor_ms:50000,cleanup_floor_ms:49000},{io_floor_ms:10001,cleanup_floor_ms:9999}])('refuses a raised or invalid original window %j',window=>{
  const s=setup();expect(s.issuer.attempt({purpose:'release',ordinal:1,...window})).toEqual({ok:false,code:'invalid_input'});expect(s.owner.status().attempts).toBe(1);
});
it('refuses terminal consumption at the original cleanup cutoff while preserving earlier cleanup facts',()=>{
  const s=setup(),r=claimed(s),p=get(s.issuer.preRelease(r,observation)),e=get(s.issuer.end(r,p,{release:'succeeded'}));s.time(50000);
  expect(s.owner.consume(s.attempt,s.window,r,e)).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(s.owner.status()).toMatchObject({consumed:1,cleanup:{disposition:'confirmed',kind:'eof'}});
});
it('cannot repair a pre-release pending read with release success or subsequent changes to the input',()=>{
  const s=setup(),r=claimed(s),raw={...observation,pending_read:true},p=get(s.issuer.preRelease(r,raw));raw.pending_read=false;
  const e=get(s.issuer.end(r,p,{release:'succeeded'}));expect(s.owner.status()).toMatchObject({primary:'internal_review_error',cleanup:{disposition:'unconfirmed',reason:'read_pending'}});expect(s.owner.consume(s.attempt,s.window,r,e)).toEqual({ok:false,code:'internal_review_error'});
});
it('does not issue a second delivery for one attempt',()=>{
  const s=setup(),ids={response:s.domain.identity('response'),stream:s.domain.identity('stream')};get(s.issuer.delivery(s.attempt,s.window,ids));expect(s.issuer.delivery(s.attempt,s.window,ids)).toEqual({ok:false,code:'invalid_state'});
});
it('keeps a no-body terminal separate from EOF and never creates reader evidence',()=>{
  const s=setup(),d=get(s.issuer.delivery(s.attempt,s.window,{response:s.domain.identity('response'),stream:null})),r=get(s.owner.claim(s.attempt,s.window,d)),e=get(s.issuer.endNoBody(r));
  expect(get(s.owner.consume(s.attempt,s.window,r,e))).toMatchObject({cleanup:{disposition:'confirmed',kind:'no_body'},body_eligible:false,native_operations:'unavailable'});expect(s.issuer.endNoBody(r)).toEqual({ok:false,code:'invalid_state'});
});
it('does not register arbitrary run or signal objects as a synthetic owner',()=>{
  const domain=createSyntheticNativeContractDomain(),run=domain.identity('run'),signal=domain.identity('signal'),budget={read:()=>({remaining_ms:60000})};expect(domain.createOwner({run:{},budget,signal,deadline_ms:60000})).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(domain.createOwner({run,budget,signal:{},deadline_ms:60000})).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(domain.createOwner({run,budget,signal,deadline_ms:60000}).ok).toBe(true);
});
it.each(['response','stream','reader'] as const)('keeps runtime-domain %s claims private and rejects reuse across owners after close',kind=>{
  const domain=createSyntheticNativeContractDomain(),a=setup(domain),b=setup(domain),response=domain.identity('response'),stream=domain.identity('stream'),reader=domain.identity('reader');
  const d=get(a.issuer.delivery(a.attempt,a.window,{response,stream})),r=get(a.owner.claim(a.attempt,a.window,d));get(a.issuer.reader(r,reader));const p=get(a.issuer.preRelease(r,observation)),e=get(a.issuer.end(r,p,{release:'succeeded'}));get(a.owner.consume(a.attempt,a.window,r,e));a.owner.close();const before=a.owner.status();
  const bd=get(b.issuer.delivery(b.attempt,b.window,{response:kind==='response'?response:domain.identity('response'),stream:kind==='stream'?stream:domain.identity('stream')})),br=b.owner.claim(b.attempt,b.window,bd);
  const result=kind==='reader'?b.issuer.reader(get(br),reader):br;expect(result).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(a.owner.status()).toEqual(before);
});
it.each(['window','delivery','resource','pre','end'] as const)('refuses a foreign %s without consuming foreign evidence',kind=>{
  const a=setup(),b=setup(),ad=get(a.issuer.delivery(a.attempt,a.window,{response:a.domain.identity('response'),stream:a.domain.identity('stream')}));
  const br=claimed(b),bp=get(b.issuer.preRelease(br,observation)),be=get(b.issuer.end(br,bp,{release:'succeeded'}));let result;
  if(kind==='window')result=a.owner.claim(a.attempt,b.window,ad);else if(kind==='delivery')result=a.owner.claim(a.attempt,a.window,{} as typeof ad);else{const ar=get(a.owner.claim(a.attempt,a.window,ad));get(a.issuer.reader(ar,a.domain.identity('reader')));if(kind==='resource')result=a.issuer.preRelease(br,observation);else if(kind==='pre')result=a.issuer.end(ar,bp,{release:'succeeded'});else result=a.owner.consume(a.attempt,a.window,ar,be);}
  expect(result).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(get(b.owner.consume(b.attempt,b.window,br,be)).cleanup.disposition).toBe('confirmed');
});
it.each(['pending_read','cancel_pending','cancel_rejected','closed_pending','closed_rejected','closed_missing','release_failed','not_eof'] as const)('does not promote %s pre-release state into a completed cleanup',kind=>{
  const s=setup(),r=claimed(s),raw={...observation,pending_read:kind==='pending_read',cancel:kind==='cancel_pending'?'pending':kind==='cancel_rejected'?'rejected':'not_requested',closed:kind==='closed_pending'?'pending':kind==='closed_rejected'?'rejected':'fulfilled',closed_captured:kind!=='closed_missing',eof:kind!=='not_eof'},p=get(s.issuer.preRelease(r,raw)),e=get(s.issuer.end(r,p,{release:kind==='release_failed'?'failed':'succeeded'}));
  expect(s.owner.status()).toMatchObject({primary:'internal_review_error',cleanup:{disposition:'unconfirmed',kind:null}});expect(s.owner.consume(s.attempt,s.window,r,e).ok).toBe(false);
});
it.each(['pre','end'] as const)('retains a typed observation failure for malformed %s input',kind=>{
  const s=setup(),r=claimed(s),result=kind==='pre'?s.issuer.preRelease(r,{...observation,extra:'PRIVATE'}):s.issuer.end(r,get(s.issuer.preRelease(r,observation)),{release:'unknown',secret:'PRIVATE'});
  expect(result).toEqual({ok:false,code:'invalid_input'});expect(s.owner.status()).toMatchObject({primary:'invalid_input',cleanup:{disposition:'unconfirmed',reason:'observation_invalid'}});expect(JSON.stringify(s.owner.status())).not.toContain('PRIVATE');
});
it('rechecks the same I/O floor after claim callbacks instead of returning an expired resource',()=>{
  const s=setup(),d=get(s.issuer.delivery(s.attempt,s.window,{response:s.domain.identity('response'),stream:s.domain.identity('stream')}));let calls=0;s.onRead(()=>{if(++calls===2)s.time(50250);});expect(s.owner.claim(s.attempt,s.window,d)).toEqual({ok:false,code:'attempt_deadline_exceeded'});
});
it('does not echo an unknown externally supplied stop reason',()=>{
  const s=setup();s.owner.stop('PRIVATE_TOKEN' as 'cancelled');expect(s.owner.status().primary).toBe('invalid_input');expect(JSON.stringify(s.owner.status())).not.toContain('PRIVATE');
});
it('keeps attempt expiry as the primary reason when release finishes at the original cutoff',()=>{
  const s=setup(),r=claimed(s),p=get(s.issuer.preRelease(r,observation));s.time(50000);const e=get(s.issuer.end(r,p,{release:'succeeded'}));expect(s.owner.status()).toMatchObject({primary:'attempt_deadline_exceeded',cleanup:{disposition:'unconfirmed',reason:'cleanup_deadline'}});expect(s.owner.consume(s.attempt,s.window,r,e)).toEqual({ok:false,code:'attempt_deadline_exceeded'});
});
it.each(['pre','end','consume'] as const)('consumes %s only once and retains the first failure',kind=>{
  const s=setup(),r=claimed(s),p=get(s.issuer.preRelease(r,observation));if(kind==='pre'){expect(s.issuer.preRelease(r,observation)).toEqual({ok:false,code:'invalid_state'});}else{const e=get(s.issuer.end(r,p,{release:'succeeded'}));if(kind==='end')expect(s.issuer.end(r,p,{release:'succeeded'})).toEqual({ok:false,code:'invalid_state'});else{get(s.owner.consume(s.attempt,s.window,r,e));expect(s.owner.consume(s.attempt,s.window,r,e)).toEqual({ok:false,code:'invalid_state'});expect(s.owner.status().consumed).toBe(1);}}
  s.owner.close();expect(s.issuer.attempt({purpose:'release',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000})).toEqual({ok:false,code:'invalid_state'});
});
it.each(['cancelled','closed'] as const)('allows cleanup recording after %s without restoring authority or overwriting the primary',code=>{
  const s=setup(),r=claimed(s);s.owner.stop(code);const p=get(s.issuer.preRelease(r,{...observation,eof:false,cancel:'fulfilled'})),e=get(s.issuer.end(r,p,{release:'succeeded'}));expect(s.owner.consume(s.attempt,s.window,r,e)).toEqual({ok:false,code});expect(s.owner.status()).toMatchObject({primary:code,cleanup:{disposition:'confirmed',kind:'cancelled'},consumed:1});s.owner.close();expect(s.owner.status().primary).toBe(code);
});
it.each([NaN,Infinity,61000])('rejects invalid remaining time %s and keeps typed observation diagnostics',time=>{
  const s=setup(),r=claimed(s);s.time(time);const p=get(s.issuer.preRelease(r,observation)),e=get(s.issuer.end(r,p,{release:'succeeded'}));expect(s.owner.status()).toMatchObject({primary:'invalid_observation_time',cleanup:{disposition:'unconfirmed',reason:'observation_invalid'}});expect(s.owner.consume(s.attempt,s.window,r,e).ok).toBe(false);
});
it('keeps a thrown observation private and never substitutes a new clock',()=>{
  const s=setup(),r=claimed(s);s.onRead(()=>{throw Error('PRIVATE_CLOCK');});const p=get(s.issuer.preRelease(r,observation));get(s.issuer.end(r,p,{release:'succeeded'}));expect(s.owner.status()).toMatchObject({primary:'internal_review_error',cleanup:{disposition:'unconfirmed',reason:'observation_invalid'}});expect(JSON.stringify(s.owner.status())).not.toContain('PRIVATE');
});
it('retains a budget rollback as unconfirmed observational evidence and does not replace the lease',()=>{
  const s=setup(),r=claimed(s);s.time(58000);const p=get(s.issuer.preRelease(r,observation));s.time(59000);get(s.issuer.end(r,p,{release:'succeeded'}));expect(s.owner.status()).toMatchObject({primary:'invalid_observation_time',cleanup:{disposition:'unconfirmed',reason:'observation_invalid'}});
});
it('fails closed without exposing budget getter exceptions during owner creation',()=>{
  const d=createSyntheticNativeContractDomain(),run=d.identity('run'),signal=d.identity('signal');let calls=0;const budget=Object.defineProperty({},'read',{get(){calls++;throw Error('PRIVATE_BUDGET');}}) as {read():{remaining_ms:number}};
  expect(d.createOwner({run:{},signal,budget,deadline_ms:60000})).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(calls).toBe(0);expect(d.createOwner({run,signal,budget,deadline_ms:60000})).toEqual({ok:false,code:'internal_review_error'});expect(d.createOwner({run,signal,budget:{read:()=>({remaining_ms:60000})},deadline_ms:60000})).toEqual({ok:false,code:'invalid_state'});
});
it('does not attach a reader after the same attempt I/O floor has expired',()=>{
  const s=setup(),d=get(s.issuer.delivery(s.attempt,s.window,{response:s.domain.identity('response'),stream:s.domain.identity('stream')})),r=get(s.owner.claim(s.attempt,s.window,d));s.time(50250);expect(s.issuer.reader(r,s.domain.identity('reader'))).toEqual({ok:false,code:'attempt_deadline_exceeded'});
});
it('retains original context references and refuses duplicate owner creation even with another budget',()=>{
  const s=setup(),before=s.owner.status();expect(s.domain.createOwner({run:s.run,signal:s.signal,budget:{read(){throw Error('PRIVATE_NEW_BUDGET');}},deadline_ms:60000})).toEqual({ok:false,code:'invalid_state'});expect(s.owner.status()).toEqual(before);
});
it('does not adopt foreign-domain identities or fixture handles into its dedicated registry',()=>{
  const s=setup(),other=createSyntheticNativeContractDomain(),fixture=createFakeCleanupContract({now:()=>0}),token=get(fixture.issueHttpPurpose({kind:'parent_initial',ordinal:1}));
  expect(s.domain.createOwner({run:token,signal:s.signal,budget:s.budget,deadline_ms:60000})).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(s.issuer.delivery(s.attempt,s.window,{response:other.identity('response'),stream:null})).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('bounds logical issuance without mutating canonical C/G/P or treating the bound as a dispatch permit',()=>{
  const s=setup();for(let i=1;i<210;i++)get(s.issuer.attempt({purpose:'release',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000}));expect(s.issuer.attempt({purpose:'release',ordinal:1,io_floor_ms:50250,cleanup_floor_ms:50000})).toEqual({ok:false,code:'invalid_state'});expect(s.owner.status()).toMatchObject({attempts:210,native_operations:'unavailable',evidence_issuance:'disabled'});
});
it('does not touch native constructors or fetch and exposes neither raw identities nor executable operations',()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('FORBIDDEN_FETCH');}),response=vi.spyOn(globalThis,'Response'),stream=vi.spyOn(globalThis,'ReadableStream');
  try{const s=setup(),r=claimed(s),p=get(s.issuer.preRelease(r,observation)),e=get(s.issuer.end(r,p,{release:'succeeded'})),view=get(s.owner.consume(s.attempt,s.window,r,e));expect(fetch).not.toHaveBeenCalled();expect(response).not.toHaveBeenCalled();expect(stream).not.toHaveBeenCalled();for(const field of ['response','reader','signal','run','budget','resource','body','token','read','cancel','release'])expect(view).not.toHaveProperty(field);expect(Object.isFrozen(e)).toBe(true);expect(Object.getPrototypeOf(e)).toBeNull();}finally{fetch.mockRestore();response.mockRestore();stream.mockRestore();}
});
