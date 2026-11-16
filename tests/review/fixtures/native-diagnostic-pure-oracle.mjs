import assert from 'node:assert/strict';

// Handwritten expectations from the event contract, not from the legacy runner's output.
export const cases = [
  {scenario:'unobserved'},
  {scenario:'duplicate_binding',refusal:'invalid_state',refusalStage:'binding'},
  {scenario:'foreign_binding',binding:'failed',refusal:'evidence_binding_mismatch',refusalStage:'binding'},
  {scenario:'binding_retry',binding:'failed',refusal:'evidence_binding_mismatch',refusalStage:'binding'},
  {scenario:'before_binding',binding:'pending',refusal:'invalid_state',refusalStage:'header'},
  {scenario:'hard_cleanup',status:401,classification:'hard',cleanup:'unconfirmed',reason:'cancel_rejected',primary:'authentication_failed',primaryStage:'header'},
  {scenario:'release_403',status:403,accepted:true},
  {scenario:'release_404',status:404,accepted:true},
  {scenario:'no_body',status:403,body:false,accepted:true},
  {scenario:'cancel_then_header',status:401,classification:'hard',cleanup:'unconfirmed',reason:'cancel_rejected',primary:'cancelled',primaryStage:'stop'},
  {scenario:'deadline_then_header',status:401,classification:'hard',cleanup:'unconfirmed',reason:'cancel_rejected',primary:'deadline_exceeded',primaryStage:'stop'},
  {scenario:'parent_404',purpose:'parent',status:404,classification:'local',local:'not_found_or_not_visible'},
  {scenario:'auth_403',purpose:'authentication',status:403,classification:'hard',primary:'access_denied',primaryStage:'header',teardown:'unconfirmed'},
  {scenario:'parent_403',purpose:'parent',status:403,classification:'hard',primary:'access_denied',primaryStage:'header',teardown:'unconfirmed'},
  {scenario:'duplicate_header',status:403,cleanup:'not_started',refusal:'invalid_state',refusalStage:'header'},
  {scenario:'duplicate_cleanup',status:403,refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'cleanup_before_header',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'confirmed_without_pending',status:403,cleanup:'not_started',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'duplicate_consume',status:403,accepted:true,refusal:'invalid_state',refusalStage:'acceptance'},
  {scenario:'accept_without_cleanup',status:403,cleanup:'not_started',refusal:'invalid_state',refusalStage:'acceptance'},
  {scenario:'wrong_purpose',refusal:'evidence_binding_mismatch',refusalStage:'header'},
  {scenario:'foreign_attempt',refusal:'evidence_binding_mismatch',refusalStage:'header'},
  {scenario:'copy_attempt',refusal:'evidence_binding_mismatch',refusalStage:'header'},
  {scenario:'foreign_window',refusal:'evidence_binding_mismatch',refusalStage:'header'},
  {scenario:'retry_after_refusal',refusal:'evidence_binding_mismatch',refusalStage:'header'},
  {scenario:'duplicate_teardown',status:403,primary:'internal_review_error',primaryStage:'teardown',refusal:'invalid_state',refusalStage:'teardown',teardown:'unconfirmed'},
  {scenario:'pending_seal',status:403,cleanup:'unconfirmed',reason:'window_ended',primary:'internal_review_error'},
  {scenario:'pending_late_success',status:403,cleanup:'unconfirmed',reason:'window_ended',primary:'internal_review_error',late:1},
  {scenario:'unconfirmed_late_success',status:403,cleanup:'unconfirmed',reason:'cancel_rejected',primary:'internal_review_error',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'sealed_writes',status:403,accepted:true,late:7},
  {scenario:'later_attempts',status:503,classification:'other',later:2,laterReason:'upstream_unavailable'},
  {scenario:'duplicate_later',status:503,classification:'other',later:1,laterReason:'upstream_unavailable',primary:'internal_review_error',refusal:'invalid_state',refusalStage:'header'},
  {scenario:'ordinal_gap',status:503,classification:'other',refusal:'invalid_state',refusalStage:'header'},
  {scenario:'ordinal_limit',status:503,classification:'other',later:209,refusal:'invalid_state',refusalStage:'header'},
  {scenario:'cleanup_body_mismatch',status:403,cleanup:'unconfirmed',reason:'window_ended',primary:'internal_review_error',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'cleanup_reason_mismatch',status:403,cleanup:'unconfirmed',reason:'window_ended',primary:'internal_review_error',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'cleanup_kind_mismatch',status:403,cleanup:'unconfirmed',reason:'window_ended',primary:'internal_review_error',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'pending_with_kind',status:403,cleanup:'not_started',refusal:'invalid_state',refusalStage:'cleanup'},
  {scenario:'later_cleanup_failure',status:503,classification:'other',later:1,laterReason:'upstream_unavailable',primary:'internal_review_error'},
  {scenario:'advance_pending_attempt',status:403,cleanup:'unconfirmed',reason:'window_ended',primary:'internal_review_error',refusal:'invalid_state',refusalStage:'header'},
  {scenario:'no_response_retry',cleanup:'not_applicable',later:1},
  {scenario:'no_response_then_header',cleanup:'not_applicable',refusal:'invalid_state',refusalStage:'header'},
  {scenario:'later_redirect',status:503,classification:'other',later:2,laterReason:'invalid_response'},
];

export function checkCase(run, expected) {
  const r = run({scenario:expected.scenario}), d = r.diagnostic;
  assert.equal(r.ok,true); assert.equal(r.kind,'native_diagnostic_fixture');
  assert.deepEqual(Object.keys(r),['ok','kind','diagnostic','at_seal','late_results','foreign_unchanged','permissions']);
  assert.equal(r.foreign_unchanged,true); assert.equal(d,r.at_seal);
  assert.deepEqual(r.late_results,Array(expected.late??0).fill('late_ignored'));
  assert.deepEqual(r.permissions,{dispatch:false,read_body:false,retry:false,fallback:false,body_ack:false,release_permit:false,formal_issuance:false});
  assert.deepEqual(Object.keys(d),['scope','binding','sealed','stopped','primary','local','refusal','teardown','slots']);
  assert.equal(d.scope,'synthetic_contract_only'); assert.equal(d.binding,expected.binding??'bound');
  assert.equal(d.sealed,true); assert.equal(d.stopped,true); assert.equal(d.teardown,expected.teardown??'not_started');
  assert.deepEqual(d.primary,expected.primary?{code:expected.primary,public_code:expected.primary,stage:expected.primaryStage??'cleanup'}:null);
  assert.deepEqual(d.local,expected.local?{code:expected.local,stage:'header'}:null);
  assert.deepEqual(d.refusal,expected.refusal?{code:expected.refusal,stage:expected.refusalStage}:null);
  assert.deepEqual(Object.keys(d.slots),['authentication','parent','release']);
  for(const p of ['authentication','parent','release']) {
    const active=p===(expected.purpose??'release'), e=active?expected:{}, phase=e.cleanup??(e.status?'confirmed':'not_started');
    assert.deepEqual(d.slots[p],{
      http:e.status?{status:e.status,body_present:e.body??true,classification:e.classification??'recovery_candidate'}:null,
      cleanup:{phase,kind:phase==='confirmed'?(e.body===false?'no_body':'cancelled'):null,reason:e.reason??null},
      acceptance:{phase:'revoked',first_terminal:e.accepted?'accepted':'revoked',consumes:e.accepted?1:0},
      later_attempts:e.later??0,later_reason:e.laterReason??null,
    });
  }
  const visit=x=>{if(x&&typeof x==='object'){assert(Object.isFrozen(x));for(const v of Object.values(x))visit(v);}};
  // A public reason such as window_ended is not a leaked identity field.
  visit(r); const encoded=JSON.stringify(r);
  assert(!/PRIVATE|credential/.test(encoded)); assert(!/"(?:snapshot|writer|window)"\s*:/.test(encoded));
  assert.deepEqual(run(r),{ok:false,code:'invalid_input',permissions:r.permissions});
  return r;
}
