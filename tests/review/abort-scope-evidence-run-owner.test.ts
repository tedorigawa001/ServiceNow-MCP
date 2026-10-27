import {expect,it} from 'vitest';
import {createSyntheticRunOwnerIssuer} from '../../src/review/abort-scope-evidence-run-owner.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const config={update_set_sys_id:'a'.repeat(32)};
function setup(){let now=0;const issuer=createSyntheticRunOwnerIssuer({now:()=>now}),slot=issuer.allocateDiagnostic(),session=get(issuer.issueSession({auth_mode:'service-account',deadline_ms:60000}));
  return {issuer,slot,session,setTime:(n:number)=>{now=n;}};}
it('claims the synthetic session once without replacing a healthy owner on a duplicate request',()=>{
  const x=setup(),first=get(x.issuer.createRun(x.slot,x.session,config)),next=x.issuer.allocateDiagnostic();
  expect(x.issuer.createRun(next,x.session,config)).toEqual({ok:false,code:'invalid_state'});
  expect(get(x.issuer.diagnostic(next))).toMatchObject({state:'rejected',primary:{stage:'run_claim',code:'invalid_state'}});
  expect(get(x.issuer.inspectRun(first.run))).toMatchObject({state:'created',run_claim:'claimed',source_claim:'unclaimed'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({state:'attached',primary:null,cleanup:{http:'not_started',worker:'not_started'},evidence_issuance:'disabled'});
});
const observed={parent_ready:true,release_match:'matched',source:'observed',family:'Australia',limitations:['release_visible_nodes_only']};
it('binds only the same synthetic source/permit/ready/budget once, with repeated readonly checks and a closed gate',()=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const permit=get(x.issuer.completeRelease(r.run,observed)).permit!,binding=get(x.issuer.bindSource(r.run,r.source,permit));
  expect(get(x.issuer.checkBinding(r.run,binding))).toEqual({state:'prepared_only',release:{source:'observed',family:'Australia',limitations:['release_visible_nodes_only']},synthetic:true,evidence_issuance:'disabled'});
  expect(x.issuer.checkBinding(r.run,binding).ok).toBe(true);expect(x.issuer.bindSource(r.run,r.source,permit)).toEqual({ok:false,code:'invalid_state'});
  expect(x.issuer.refuseEvidence(r.run,binding)).toEqual({ok:false,code:'invalid_state'});expect(get(x.issuer.diagnostic(x.slot)).primary).toBeNull();
});
it('retains a failed source claim and its first diagnostic across cleanup updates, close and attempted repair',()=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const permit=get(x.issuer.completeRelease(r.run,{...observed,parent_ready:false})).permit!;
  expect(x.issuer.bindSource(r.run,r.source,permit)).toEqual({ok:false,code:'invalid_state'});
  expect(get(x.issuer.inspectRun(r.run))).toMatchObject({state:'stopped',source_claim:'failed'});
  x.issuer.observeCleanup(r.run,'http','unconfirmed');x.issuer.observeCleanup(r.run,'http','confirmed');x.issuer.observeCleanup(r.run,'worker','confirmed');
  x.issuer.close(r.run);x.issuer.cancel(r.run);
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({state:'closed',primary:{stage:'source_claim',code:'invalid_state'},cleanup:{http:'unconfirmed',worker:'confirmed'}});
  expect(x.issuer.completeRelease(r.run,observed)).toEqual({ok:false,code:'invalid_state'});
  expect(x.issuer.bindSource(r.run,r.source,permit)).toEqual({ok:false,code:'invalid_state'});
});
it('detects a budget identity replacement without accepting a same-shaped binding or repairing the run',()=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const p=get(x.issuer.completeRelease(r.run,observed)).permit!,b=get(x.issuer.bindSource(r.run,r.source,p));
  get(x.issuer.replaceSyntheticIdentity(x.session,'budget'));
  expect(x.issuer.checkBinding(r.run,b)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.issuer.replaceSyntheticIdentity(x.session,'budget')).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({primary:{stage:'binding',code:'evidence_binding_mismatch'}});
});
function prepared(){const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const permit=get(x.issuer.completeRelease(r.run,observed)).permit!,binding=get(x.issuer.bindSource(r.run,r.source,permit));return {...x,...r,permit,binding};}
it('retains creation failure in the preallocated slot and consumes the run claim before validation',()=>{
  const x=setup();expect(x.issuer.createRun(x.slot,x.session,{...config,token:'PRIVATE_TOKEN'})).toEqual({ok:false,code:'invalid_input'});
  const next=x.issuer.allocateDiagnostic();expect(x.issuer.createRun(next,x.session,config)).toEqual({ok:false,code:'invalid_input'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({state:'stopped',primary:{stage:'run_claim',code:'invalid_input'}});
  expect(JSON.stringify(x.issuer.diagnostic(x.slot))).not.toContain('PRIVATE_TOKEN');
});
it('holds a before-run rejection without inventing cleanup or allowing that diagnostic slot to attach later',()=>{
  const x=setup();expect(x.issuer.rejectBeforeRun(x.slot,'config_invalid')).toEqual({ok:false,code:'config_invalid'});
  expect(x.issuer.createRun(x.slot,x.session,config)).toEqual({ok:false,code:'config_invalid'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({state:'rejected',primary:{stage:'input',code:'config_invalid'},cleanup:{http:'not_started',worker:'not_started'}});
  const fresh=x.issuer.allocateDiagnostic();expect(x.issuer.createRun(fresh,x.session,config).ok).toBe(true);
});
it('normalizes unknown input/session-stop reasons rather than retaining arbitrary strings or Error messages',()=>{
  const x=setup();x.issuer.rejectBeforeRun(x.slot,Error('PRIVATE_MESSAGE'));
  const y=prepared();y.issuer.revokeSession(y.session,'PRIVATE_TOKEN');y.issuer.close(y.run);
  expect(get(x.issuer.diagnostic(x.slot)).primary?.code).toBe('internal_review_error');
  expect(get(y.issuer.diagnostic(y.slot)).primary?.code).toBe('internal_review_error');
  expect(JSON.stringify([x.issuer.diagnostic(x.slot),y.issuer.diagnostic(y.slot)])).not.toMatch(/PRIVATE_|stack|message/);
});
it('does not enroll a raw session object, a cloned session or a different synthetic realm',()=>{
  const x=setup(),other=setup();
  for(const value of [{}, {...x.session}, other.session]){
    const slot=x.issuer.allocateDiagnostic();expect(x.issuer.createRun(slot,value as typeof x.session,config)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  }
  expect(x.issuer.createRun(x.slot,x.session,config).ok).toBe(true);
  expect(other.issuer.createRun(other.slot,other.session,config).ok).toBe(true);
});
it.each(['auth','snapshot','budget','ready','source_generation','permit','release_snapshot'] as const)('rejects %s replacement during readonly validation without restoring claims',kind=>{
  const x=prepared();get(x.issuer.replaceSyntheticIdentity(x.session,kind));
  expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.issuer.bindSource(x.run,x.source,x.permit)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.issuer.refuseEvidence(x.run,x.binding)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('rejects cloned/foreign readonly handles without poisoning either bound owner',()=>{
  const x=prepared(),y=prepared();
  expect(x.issuer.checkBinding(x.run,{...x.binding})).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.issuer.checkBinding(x.run,y.binding)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.issuer.checkBinding(x.run,x.binding).ok).toBe(true);expect(y.issuer.checkBinding(y.run,y.binding).ok).toBe(true);
});
it.each(['source','permit'] as const)('fails a known requesting owner on foreign %s without consuming the foreign owner',kind=>{
  const x=setup(),y=prepared(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const p=get(x.issuer.completeRelease(r.run,observed)).permit!;
  expect(x.issuer.bindSource(r.run,kind==='source'?y.source:r.source,kind==='permit'?y.permit:p)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(y.issuer.checkBinding(y.run,y.binding).ok).toBe(true);
  expect(x.issuer.bindSource(r.run,r.source,p)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each(['unknown','mismatched'] as const)('does not claim a source or issue a permit for %s release',release_match=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const release=get(x.issuer.completeRelease(r.run,{parent_ready:true,release_match,source:'none',family:null,limitations:[]}));expect(release.permit).toBeNull();
  expect(x.issuer.bindSource(r.run,r.source,null)).toEqual({ok:false,code:'release_not_admitted'});
  expect(get(x.issuer.inspectRun(r.run))).toMatchObject({state:'stopped',source_claim:'unclaimed'});
  expect(x.issuer.completeRelease(r.run,observed)).toEqual({ok:false,code:'release_not_admitted'});
});
it('pins a separate immutable synthetic operator snapshot and preserves asserted limitations',()=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const raw={...observed,source:'operator_config',limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale']};
  const p=get(x.issuer.completeRelease(r.run,raw)).permit!;raw.family='Zurich';raw.limitations.length=0;
  const b=get(x.issuer.bindSource(r.run,r.source,p)),view=get(x.issuer.checkBinding(r.run,b));
  expect(view.release).toEqual({source:'operator_config',family:'Australia',limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale']});
  expect(Object.isFrozen(view.release)).toBe(true);expect(Object.isFrozen(view.release.limitations)).toBe(true);
  expect(x.issuer.refuseEvidence(r.run,b)).toEqual({ok:false,code:'invalid_state'});
});
it.each([null,{...observed,extra:'PRIVATE_VALUE'},{...observed,source:'operator_config',limitations:[]}])('rejects malformed release premises once and never repairs them (%#)',raw=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  expect(x.issuer.completeRelease(r.run,raw)).toEqual({ok:false,code:'invalid_input'});
  expect(x.issuer.completeRelease(r.run,observed)).toEqual({ok:false,code:'invalid_input'});
  expect(JSON.stringify(x.issuer.diagnostic(x.slot))).not.toContain('PRIVATE_VALUE');
});
it('refuses out-of-order binding and an unsuccessful auth completion without issuing later generations',()=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));expect(x.issuer.bindSource(r.run,r.source,null)).toEqual({ok:false,code:'invalid_state'});
  expect(x.issuer.completeAuthentication(r.run,'ready')).toEqual({ok:false,code:'invalid_state'});
  const y=setup(),r2=get(y.issuer.createRun(y.slot,y.session,config));expect(y.issuer.completeAuthentication(r2.run,'authentication_failed')).toEqual({ok:false,code:'authentication_failed'});
  expect(y.issuer.completeAuthentication(r2.run,'ready')).toEqual({ok:false,code:'authentication_failed'});
});
it.each(['cancel','close','session'] as const)('invalidates every known binding after %s and preserves the first diagnosis',kind=>{
  const x=prepared();if(kind==='session')x.issuer.revokeSession(x.session,'upstream_unavailable');else x.issuer[kind](x.run);
  const code=kind==='session'?'upstream_unavailable':kind==='cancel'?'cancelled':'closed';
  expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code});x.issuer.close(x.run);x.issuer.cancel(x.run);
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({state:'closed',primary:{code}});
});
it.each(['http','worker'] as const)('keeps %s cleanup uncertainty sticky and distinguishes it from the other axis',axis=>{
  const x=prepared();expect(x.issuer.observeCleanup(x.run,axis,'unconfirmed')).toEqual({ok:false,code:'internal_review_error'});
  x.issuer.observeCleanup(x.run,axis,'confirmed');expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'internal_review_error'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({primary:{stage:'cleanup',code:'internal_review_error'},cleanup:{[axis]:'unconfirmed',[axis==='http'?'worker':'http']:'not_started'}});
});
it('does not allow malformed cleanup observations to escape the fixed diagnostic vocabulary',()=>{
  const x=prepared();x.issuer.observeCleanup(x.run,'PRIVATE_AXIS','PRIVATE_REASON');
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({primary:{stage:'cleanup',code:'invalid_input'},cleanup:{http:'not_started',worker:'not_started'}});
  expect(JSON.stringify(x.issuer.diagnostic(x.slot))).not.toMatch(/PRIVATE_/);
});
it('allows readonly inspection after normal cutoff but never opens the evidence gate; hard equality stops it',()=>{
  const x=prepared();x.setTime(50000);expect(x.issuer.checkBinding(x.run,x.binding).ok).toBe(true);
  expect(x.issuer.refuseEvidence(x.run,x.binding)).toEqual({ok:false,code:'invalid_state'});
  x.setTime(60000);expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'deadline_exceeded'});
  x.setTime(0);expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'deadline_exceeded'});
});
it('rejects clock reversal without resetting the original budget',()=>{
  const x=prepared();x.setTime(10);get(x.issuer.checkBinding(x.run,x.binding));x.setTime(9);
  expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'invalid_observation_time'});
});
it('keeps handles opaque and exposes neither transport/job activation nor actual counters',()=>{
  const x=prepared();expect(JSON.stringify([x.session,x.run,x.source,x.permit,x.binding])).toBe('[{},{},{},{},{}]');
  expect(Object.keys(x.issuer).some(k=>/fetch|dispatch|worker|payload|activate|register|charge/i.test(k))).toBe(false);
  expect(get(x.issuer.inspectRun(x.run))).toEqual({state:'prepared_only',run_claim:'claimed',source_claim:'claimed',synthetic:true,evidence_issuance:'disabled'});
});
function reentrant(){let hook=()=>{};const issuer=createSyntheticRunOwnerIssuer({now:()=>{hook();return 0;}}),slot=issuer.allocateDiagnostic(),session=get(issuer.issueSession({auth_mode:'service-account',deadline_ms:60000}));
  return {issuer,slot,session,hook:(f:()=>void)=>{hook=f;}};}
it('rejects identity replacement during the run-claim checkpoint before committing the owner',()=>{
  const x=reentrant();x.hook(()=>{x.hook(()=>{});get(x.issuer.replaceSyntheticIdentity(x.session,'budget'));});
  expect(x.issuer.createRun(x.slot,x.session,config)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  const slot=x.issuer.allocateDiagnostic();expect(x.issuer.createRun(slot,x.session,config)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({primary:{stage:'binding',code:'evidence_binding_mismatch'}});
});
it.each(['cancel','close'] as const)('does not publish a source binding if its final checkpoint reenters %s',kind=>{
  const x=reentrant(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const permit=get(x.issuer.completeRelease(r.run,observed)).permit!;let calls=0;
  x.hook(()=>{if(++calls===2){x.hook(()=>{});x.issuer[kind](r.run);}});
  expect(x.issuer.bindSource(r.run,r.source,permit)).toEqual({ok:false,code:kind==='cancel'?'cancelled':'closed'});
  expect(get(x.issuer.inspectRun(r.run))).toMatchObject({source_claim:'failed',state:kind==='cancel'?'stopped':'closed'});
});
it('detects mutation at the last readonly checkpoint rather than returning a stale success',()=>{
  const x=reentrant(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const permit=get(x.issuer.completeRelease(r.run,observed)).permit!,binding=get(x.issuer.bindSource(r.run,r.source,permit));let calls=0;
  x.hook(()=>{if(++calls===2){x.hook(()=>{});get(x.issuer.replaceSyntheticIdentity(x.session,'ready'));}});
  expect(x.issuer.checkBinding(r.run,binding)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('retains cancellation if a release premise getter stops the run during its copy',()=>{
  const x=setup(),r=get(x.issuer.createRun(x.slot,x.session,config));get(x.issuer.completeAuthentication(r.run,'ready'));
  const raw={...observed};Object.defineProperty(raw,'family',{enumerable:true,get(){x.issuer.cancel(r.run);return 'Australia';}});
  expect(x.issuer.completeRelease(r.run,raw)).toEqual({ok:false,code:'cancelled'});
  expect(x.issuer.completeRelease(r.run,observed)).toEqual({ok:false,code:'cancelled'});
});
it('normalizes an injected clock exception without retaining its message or allowing reuse',()=>{
  const x=reentrant(),r=get(x.issuer.createRun(x.slot,x.session,config));x.hook(()=>{throw Error('PRIVATE_CLOCK');});
  expect(x.issuer.completeAuthentication(r.run,'ready')).toEqual({ok:false,code:'internal_review_error'});
  expect(JSON.stringify(x.issuer.diagnostic(x.slot))).not.toContain('PRIVATE_CLOCK');
});
it.each(['service-account','per-user'] as const)('models %s without accepting credentials or changing auth modes',auth_mode=>{
  const issuer=createSyntheticRunOwnerIssuer({now:()=>0}),slot=issuer.allocateDiagnostic(),session=get(issuer.issueSession({auth_mode,deadline_ms:120}));
  const r=get(issuer.createRun(slot,session,config));get(issuer.completeAuthentication(r.run,'ready'));const permit=get(issuer.completeRelease(r.run,observed)).permit!;
  const b=get(issuer.bindSource(r.run,r.source,permit));expect(issuer.checkBinding(r.run,b).ok).toBe(true);
  expect(issuer.issueSession({auth_mode,deadline_ms:120,token:'PRIVATE_TOKEN'})).toEqual({ok:false,code:'invalid_input'});
});
it('rejects duplicate auth/release completion without replacing the existing ready/permit generation',()=>{
  const x=prepared();expect(x.issuer.completeAuthentication(x.run,'ready')).toEqual({ok:false,code:'invalid_state'});
  expect(x.issuer.completeRelease(x.run,observed)).toEqual({ok:false,code:'invalid_state'});
  expect(x.issuer.checkBinding(x.run,x.binding).ok).toBe(true);
});
it.each([false,true])('does not record late cleanup as confirmed, preserving earlier cancellation=%s',cancelled=>{
  const x=prepared();if(cancelled)x.issuer.cancel(x.run);x.setTime(60000);
  expect(x.issuer.observeCleanup(x.run,'worker','confirmed')).toEqual({ok:false,code:cancelled?'cancelled':'deadline_exceeded'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({primary:{code:cancelled?'cancelled':'deadline_exceeded'},cleanup:{worker:'unconfirmed',http:'not_started'}});
});
it('keeps an already recorded timely cleanup fact idempotent after the hard deadline without granting activity',()=>{
  const x=prepared();get(x.issuer.observeCleanup(x.run,'http','confirmed'));x.setTime(60000);
  expect(x.issuer.observeCleanup(x.run,'http','confirmed')).toEqual({ok:true,value:true});
  expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'deadline_exceeded'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({cleanup:{http:'confirmed',worker:'not_started'},primary:{code:'deadline_exceeded'}});
});
it('permits observation-only cleanup after cancellation within budget without restoring the binding',()=>{
  const x=prepared();x.issuer.cancel(x.run);x.setTime(10);get(x.issuer.observeCleanup(x.run,'http','confirmed'));
  expect(x.issuer.checkBinding(x.run,x.binding)).toEqual({ok:false,code:'cancelled'});
  expect(get(x.issuer.diagnostic(x.slot))).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'confirmed',worker:'not_started'}});
});
