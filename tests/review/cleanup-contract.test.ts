import {expect,it} from 'vitest';
import {createFakeCleanupContract} from '../../src/review/abort-scope-evidence-cleanup-contract.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const eof={fetch:'fulfilled',body:'reader',pending_read:false,eof:true,closed:'fulfilled',cancel:'not_requested',lock:'released',abort_failed:false};
function setup(){let now=0;const model=createFakeCleanupContract({now:()=>now});return {model,setTime:(n:number)=>{now=n;}};}
it('derives a typed EOF report and final HTTP confirmation without inventing a worker cleanup',()=>{
  const {model}=setup(),purpose=get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1})),attempt=get(model.beginHttp(purpose));
  get(model.startHttp(attempt));const report=get(model.finishHttp(attempt,eof));
  expect(get(model.readHttpReport(report))).toMatchObject({disposition:'confirmed',kind:'eof',reason:null,synthetic:true});
  get(model.consumeHttp(attempt,report));get(model.finishRun());
  expect(model.diagnostic()).toMatchObject({state:'closed',primary:null,cleanup:{http:'confirmed',worker:'not_started'},synthetic:true,evidence_issuance:'disabled'});
});
it('keeps worker termination failure separate from confirmed HTTP cleanup and retains a prior cancellation',()=>{
  const {model}=setup(),p=get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1})),a=get(model.beginHttp(p));get(model.startHttp(a));
  get(model.consumeHttp(a,get(model.finishHttp(a,eof))));const w=get(model.issueWorker());get(model.startWorker(w));model.stop('cancelled');
  const report=get(model.finishWorker(w,{termination:'pending',listeners:'attached',stdout:'open',stderr:'open'}));get(model.consumeWorker(w,report));model.finishRun();
  expect(model.diagnostic()).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'confirmed',worker:'unconfirmed'}});
});
it('rejects duplicate consumption as an invalid state and never overwrites that diagnosis with later cleanup',()=>{
  const {model}=setup(),p=get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1})),a=get(model.beginHttp(p));get(model.startHttp(a));
  const report=get(model.finishHttp(a,eof));get(model.consumeHttp(a,report));
  expect(model.consumeHttp(a,report)).toEqual({ok:false,code:'invalid_state'});model.stop('cancelled');model.finishRun();
  expect(model.diagnostic()).toMatchObject({primary:{code:'invalid_state'},cleanup:{http:'confirmed',worker:'not_started'}});
});
it('rejects a final-purpose label in the normal phase',()=>{
  const {model}=setup();expect(model.issueHttpPurpose({kind:'parent_final',ordinal:1})).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(model.diagnostic().model_counts.purposes).toBe(0);
});
it('keeps a closed diagnostic immutable against late invalid requests',()=>{
  const {model}=setup();get(model.finishRun());const before=model.diagnostic();
  expect(model.readHttpReport({} as never).ok).toBe(false);model.stop('cancelled');
  expect(model.diagnostic()).toEqual(before);
});
it.each(['http','worker'] as const)('does not invent an unconfirmed resource for an unstarted %s at the hard deadline',axis=>{
  const {model,setTime}=setup();
  if(axis==='http'){
    const a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));setTime(60000);
    const r=get(model.finishHttp(a,{fetch:'not_started',body:'none',pending_read:false,eof:false,closed:null,cancel:'not_requested',lock:'not_owned',abort_failed:false}));
    expect(get(model.readHttpReport(r)).disposition).toBe('not_started');get(model.consumeHttp(a,r));
  }else{const w=get(model.issueWorker());setTime(60000);const r=get(model.finishWorker(w,{termination:'not_started',listeners:'not_attached',stdout:'not_created',stderr:'not_created'}));
    expect(get(model.readWorkerReport(r)).disposition).toBe('not_started');get(model.consumeWorker(w,r));}
  model.finishRun();expect(model.diagnostic()).toMatchObject({primary:{code:'deadline_exceeded'},cleanup:{http:'not_started',worker:'not_started'}});
});
const none={fetch:'fulfilled',body:'none',pending_read:false,eof:false,closed:null,cancel:'not_requested',lock:'not_owned',abort_failed:false};
it.each([
  ['cancelled reader',{...eof,eof:false,cancel:'fulfilled'},'confirmed','cancelled',null],
  ['cancelled unlocked body',{...none,body:'unlocked',cancel:'fulfilled'},'confirmed','cancelled',null],
  ['settled fetch rejection',{...none,fetch:'rejected'},'confirmed','no_response',null],
  ['absent body',none,'confirmed','no_body',null],
  ['pending fetch',{...none,fetch:'pending'},'unconfirmed',null,'fetch_pending'],
  ['pending read',{...eof,pending_read:true,eof:false,closed:'pending',lock:'held'},'unconfirmed',null,'read_pending'],
  ['pending cancel',{...eof,eof:false,cancel:'pending',closed:'pending',lock:'held'},'unconfirmed',null,'cancel_pending'],
  ['rejected cancel',{...eof,eof:false,cancel:'rejected'},'unconfirmed',null,'cancel_rejected'],
  ['unconfirmed closed',{...eof,closed:'pending'},'unconfirmed',null,'closed_unconfirmed'],
  ['rejected closed',{...eof,closed:'rejected'},'unconfirmed',null,'closed_rejected'],
  ['unknown reader',{...none,body:'unknown_lock',lock:'unknown'},'unconfirmed',null,'reader_owner_unknown'],
  ['unreleased lock',{...eof,lock:'held'},'unconfirmed',null,'lock_release_failed'],
  ['failed abort',{...eof,abort_failed:true},'unconfirmed',null,'abort_failed'],
  ['no EOF or cancel proof',{...eof,eof:false},'unconfirmed',null,'cleanup_observation_invalid'],
  ['claimed confirmation',{...eof,disposition:'confirmed'},'unconfirmed',null,'cleanup_observation_invalid'],
  ['inconsistent structure',{...none,pending_read:true},'unconfirmed',null,'cleanup_observation_invalid'],
] as const)('derives HTTP disposition from independent primitive observations: %s',(_name,observation,disposition,kind,reason)=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));
  const report=get(model.finishHttp(a,observation));expect(get(model.readHttpReport(report))).toMatchObject({disposition,kind,reason});
  get(model.consumeHttp(a,report));model.finishRun();expect(model.diagnostic().cleanup.http).toBe(disposition==='confirmed'?'confirmed':'unconfirmed');
  expect(model.diagnostic().evidence_issuance).toBe('disabled');
});
const terminated={termination:'fulfilled',listeners:'detached',stdout:'closed',stderr:'closed'};
it.each([
  ['terminated',terminated,'confirmed',null],
  ['pending',{...terminated,termination:'pending'},'unconfirmed','termination_pending'],
  ['rejected',{...terminated,termination:'rejected'},'unconfirmed','termination_rejected'],
  ['listener retained',{...terminated,listeners:'attached'},'unconfirmed','listeners_attached'],
  ['listener never attached',{...terminated,listeners:'not_attached'},'unconfirmed','listeners_not_attached'],
  ['stdout retained',{...terminated,stdout:'open'},'unconfirmed','stdout_open'],
  ['stderr retained',{...terminated,stderr:'open'},'unconfirmed','stderr_open'],
  ['raw confirmation',{...terminated,disposition:'confirmed'},'unconfirmed','cleanup_observation_invalid'],
] as const)('keeps worker cleanup independent: %s',(_name,observation,disposition,reason)=>{
  const {model}=setup(),w=get(model.issueWorker());get(model.startWorker(w));const r=get(model.finishWorker(w,observation));
  expect(get(model.readWorkerReport(r))).toMatchObject({disposition,reason});get(model.consumeWorker(w,r));model.finishRun();
  expect(model.diagnostic().cleanup).toEqual({http:'not_started',worker:disposition});
});
it('does not report a run-wide HTTP confirmation while the run can start more work',()=>{
  const {model}=setup();
  const a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));get(model.consumeHttp(a,get(model.finishHttp(a,eof))));
  expect(model.diagnostic().cleanup.http).toBe('in_progress');
  const b=get(model.beginHttp(get(model.issueHttpPurpose({kind:'release_rows',ordinal:1}))));get(model.startHttp(b));
  get(model.consumeHttp(b,get(model.finishHttp(b,{...none,fetch:'pending'}))));model.finishRun();
  expect(model.diagnostic().cleanup.http).toBe('unconfirmed');expect(model.finishHttp(b,eof).ok).toBe(false);
});
it('keeps first reason even when both fake resources are subsequently confirmed',()=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));
  const w=get(model.issueWorker());get(model.startWorker(w));model.stop('authentication_failed');
  get(model.consumeHttp(a,get(model.finishHttp(a,eof))));get(model.consumeWorker(w,get(model.finishWorker(w,terminated))));model.finishRun();
  expect(model.diagnostic()).toMatchObject({primary:{code:'authentication_failed'},cleanup:{http:'confirmed',worker:'confirmed'},evidence_issuance:'disabled'});
});
it.each(['purpose','attempt','report','worker','worker_report'] as const)('rejects foreign %s handles without modifying the foreign realm',kind=>{
  const {model:x}=setup(),{model:y}=setup();const p=get(y.issueHttpPurpose({kind:'parent_initial',ordinal:1})),a=get(y.beginHttp(p));get(y.startHttp(a));
  const r=get(y.finishHttp(a,eof)),w=get(y.issueWorker());get(y.startWorker(w));const wr=get(y.finishWorker(w,terminated)),before=y.diagnostic();
  if(kind==='purpose')expect(x.beginHttp(p).ok).toBe(false);
  if(kind==='attempt')expect(x.finishHttp(a,eof).ok).toBe(false);
  if(kind==='report')expect(x.readHttpReport(r).ok).toBe(false);
  if(kind==='worker')expect(x.finishWorker(w,terminated).ok).toBe(false);
  if(kind==='worker_report')expect(x.readWorkerReport(wr).ok).toBe(false);
  expect(x.diagnostic().primary?.code).toBe('evidence_binding_mismatch');expect(y.diagnostic()).toEqual(before);
  get(y.consumeHttp(a,r));get(y.consumeWorker(w,wr));get(y.finishRun());
});
it.each(['clone','shape'] as const)('rejects a %s report without accepting a scalar confirmation',kind=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));
  const r=get(model.finishHttp(a,eof));expect(model.consumeHttp(a,(kind==='clone'?structuredClone(r):{disposition:'confirmed'}) as never).ok).toBe(false);
  expect(model.diagnostic().primary?.code).toBe('evidence_binding_mismatch');
});
it('rejects report/attempt substitution within the same realm',()=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));const r=get(model.finishHttp(a,eof));get(model.consumeHttp(a,r));
  const b=get(model.beginHttp(get(model.issueHttpPurpose({kind:'release_rows',ordinal:1}))));get(model.startHttp(b));
  expect(model.consumeHttp(b,r).ok).toBe(false);model.finishRun();expect(model.diagnostic()).toMatchObject({cleanup:{http:'unconfirmed'},primary:{code:'evidence_binding_mismatch'}});
});
it.each([59999,60000,60001])('enforces the original deadline at %i without extending cleanup',now=>{
  const {model,setTime}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));setTime(now);
  const r=get(model.finishHttp(a,eof));expect(get(model.readHttpReport(r)).disposition).toBe(now<60000?'confirmed':'unconfirmed');get(model.consumeHttp(a,r));model.finishRun();
  expect(model.diagnostic().cleanup.http).toBe(now<60000?'confirmed':'unconfirmed');
});
it('retains a timely confirmation fact consumed after expiry, but never revives active work',()=>{
  const {model,setTime}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));setTime(59999);const r=get(model.finishHttp(a,eof));
  setTime(60000);get(model.consumeHttp(a,r));model.finishRun();expect(model.diagnostic()).toMatchObject({primary:{code:'deadline_exceeded'},cleanup:{http:'confirmed'}});
  expect(model.issueHttpPurpose({kind:'release_rows',ordinal:1}).ok).toBe(false);
});
it('closes pending resources as unconfirmed and never repairs them with late success',()=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));const w=get(model.issueWorker());get(model.startWorker(w));
  expect(model.finishRun().ok).toBe(false);const before=model.diagnostic();expect(before.cleanup).toEqual({http:'unconfirmed',worker:'unconfirmed'});
  expect(model.finishHttp(a,eof).ok).toBe(false);expect(model.finishWorker(w,terminated).ok).toBe(false);expect(model.diagnostic()).toEqual(before);
});
it('does not expose accounting, I/O, session registration, body or formal evidence APIs',()=>{
  const {model}=setup();for(const name of ['dispatch','fetch','session','register','chargePayload','chargeChunk','stats','activate','issueEvidence','body'])expect(Reflect.has(model,name)).toBe(false);
  const p=get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}));expect(JSON.stringify(p)).toBe('{}');expect(Object.isFrozen(model.diagnostic().cleanup)).toBe(true);
  model.stop(Error('PRIVATE_TOKEN'));model.finishRun();expect(JSON.stringify(model.diagnostic())).not.toContain('PRIVATE');expect(model.diagnostic().primary?.code).toBe('internal_review_error');
});
it.each(['backwards','nonfinite','exception'] as const)('stops on %s clock observations without exposing raw reasons',kind=>{
  let now=10,throwClock=false;const model=createFakeCleanupContract({now:()=>{if(throwClock)throw Error('PRIVATE_CLOCK');return now;}});
  const a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));
  if(kind==='backwards')now=9;if(kind==='nonfinite')now=NaN;if(kind==='exception')throwClock=true;
  const r=get(model.finishHttp(a,eof));expect(get(model.readHttpReport(r))).toMatchObject({disposition:'unconfirmed',ended_at:null});get(model.consumeHttp(a,r));model.finishRun();
  expect(model.diagnostic().primary?.code).toBe(kind==='exception'?'internal_review_error':'invalid_observation_time');expect(JSON.stringify(model.diagnostic())).not.toContain('PRIVATE');
});
it('does not reset the clock when entering final',()=>{
  const {model,setTime}=setup();setTime(50000);get(model.beginFinal());
  const p=get(model.issueHttpPurpose({kind:'parent_final',ordinal:1})),a=get(model.beginHttp(p));get(model.startHttp(a));setTime(60000);
  expect(get(model.readHttpReport(get(model.finishHttp(a,eof)))).disposition).toBe('unconfirmed');
});
it('rejects an old phase permit while the run is still active and has remaining time',()=>{
  const {model}=setup(),old=get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}));get(model.beginFinal());
  expect(model.beginHttp(old)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(model.diagnostic().model_counts.attempts).toBe(0);
});
it.each([59999,60000])('enforces the worker cleanup deadline at %i',now=>{
  const {model,setTime}=setup(),w=get(model.issueWorker());get(model.startWorker(w));setTime(now);
  const r=get(model.finishWorker(w,terminated));expect(get(model.readWorkerReport(r)).disposition).toBe(now<60000?'confirmed':'unconfirmed');
  get(model.consumeWorker(w,r));model.finishRun();expect(model.diagnostic().cleanup).toEqual({http:'not_started',worker:now<60000?'confirmed':'unconfirmed'});
});
it('enforces the finite fake handle limit without touching a real counter',()=>{
  const model=createFakeCleanupContract({now:()=>0},{max_attempts:1});const p=get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1})),a=get(model.beginHttp(p));get(model.startHttp(a));
  get(model.consumeHttp(a,get(model.finishHttp(a,eof))));expect(model.issueHttpPurpose({kind:'release_rows',ordinal:1})).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(model.diagnostic().model_counts).toEqual({purposes:1,attempts:1,started:1});
});
it.each([{deadline_ms:60001},{max_attempts:211},{deadline_ms:0},{secret:'PRIVATE'}])('rejects non-contract config %j',config=>{
  expect(()=>createFakeCleanupContract({now:()=>0},config)).toThrow('invalid_input');
});
it('does not create a report after reentrant final close during its observation checkpoint',()=>{
  let hook:(()=>void)|undefined;const model=createFakeCleanupContract({now:()=>{const h=hook;hook=undefined;h?.();return 0;}});
  const a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));hook=()=>{model.finishRun();};
  expect(model.finishHttp(a,eof).ok).toBe(false);expect(model.diagnostic()).toMatchObject({state:'closed',cleanup:{http:'unconfirmed'},primary:{code:'invalid_state'}});
});
it('does not transfer a normal-purpose label into a final phase during a clock callback',()=>{
  let hook:(()=>void)|undefined;const model=createFakeCleanupContract({now:()=>{const h=hook;hook=undefined;h?.();return 0;}});
  let reads=0;hook=()=>{reads++;hook=()=>{model.beginFinal();};};
  expect(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}).ok).toBe(false);expect(reads).toBe(1);expect(model.diagnostic().primary?.code).toBe('evidence_binding_mismatch');
});
it('does not silently finish an unconsumed terminal report as confirmed',()=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));get(model.finishHttp(a,eof));
  expect(model.finishRun().ok).toBe(false);expect(model.diagnostic()).toMatchObject({cleanup:{http:'unconfirmed'},primary:{code:'invalid_state'}});
});
it.each(['http','worker'] as const)('rejects a cross-axis terminal report at the %s slot',axis=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));const r=get(model.finishHttp(a,eof));
  const w=get(model.issueWorker());get(model.startWorker(w));const wr=get(model.finishWorker(w,terminated));
  expect(axis==='http'?model.consumeHttp(a,wr as never).ok:model.consumeWorker(w,r as never).ok).toBe(false);
  expect(model.diagnostic().primary?.code).toBe('evidence_binding_mismatch');
});
it('rejects duplicate worker completion and consumption without recreating its slot',()=>{
  const {model}=setup(),w=get(model.issueWorker());get(model.startWorker(w));const r=get(model.finishWorker(w,terminated));
  expect(model.finishWorker(w,terminated).ok).toBe(false);get(model.consumeWorker(w,r));expect(model.consumeWorker(w,r).ok).toBe(false);
  expect(model.issueWorker().ok).toBe(false);model.finishRun();expect(model.diagnostic()).toMatchObject({primary:{code:'invalid_state'},cleanup:{http:'not_started',worker:'confirmed'}});
});
it('rejects duplicate HTTP completion while keeping the original typed report',()=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));const r=get(model.finishHttp(a,eof));
  expect(model.finishHttp(a,{...none,fetch:'pending'}).ok).toBe(false);expect(get(model.readHttpReport(r)).disposition).toBe('confirmed');
  get(model.consumeHttp(a,r));model.finishRun();expect(model.diagnostic()).toMatchObject({primary:{code:'invalid_state'},cleanup:{http:'confirmed'}});
});
it.each(['access_denied','receive_budget_exceeded','payload_budget_exceeded'] as const)('retains the known %s primary separately from a cleanup failure',code=>{
  const {model}=setup(),a=get(model.beginHttp(get(model.issueHttpPurpose({kind:'parent_initial',ordinal:1}))));get(model.startHttp(a));model.stop(code);
  get(model.consumeHttp(a,get(model.finishHttp(a,{...none,fetch:'pending'}))));model.finishRun();
  expect(model.diagnostic()).toMatchObject({primary:{code},cleanup:{http:'unconfirmed',worker:'not_started'}});
});
