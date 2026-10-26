/** Fake I/O adapter bound to the registered session's one-shot accounting port. No live transport. */
import { claimPreparedTransportBudget,claimFixtureBootstrapTransport, type PreparedEvidenceOwner } from './abort-scope-evidence-fixture-lifecycle.js';
import { createFakeTransportReceiptMachine, type FakeTransportIo } from './abort-scope-evidence-transport-state.js';
import type { PreparedTransportBudget } from '../servicenow/review-transport-budget.js';
export function createSessionBoundFakeTransport(session:object,owner:PreparedEvidenceOwner,io:FakeTransportIo){
  const claimed=claimPreparedTransportBudget(owner,session);if(!claimed.ok)return claimed;
  return bind(claimed.value,io);
}
/** Bootstrap is admitted by a dedicated pre-auth fixture claim, never by a prepared owner. */
export function createBootstrapBoundFakeTransport(session:object,io:FakeTransportIo){
  const claimed=claimFixtureBootstrapTransport(session);if(!claimed.ok)return claimed;
  const budget=claimed.value;
  if(budget.authMode!=='service-account'||budget.authReady!==false||!budget.authenticationReady){budget.stop('authentication_failed');return {ok:false as const,code:'authentication_failed' as const};}
  return bind(budget,io);
}
function bind(budget:PreparedTransportBudget,io:FakeTransportIo){
  const made=createFakeTransportReceiptMachine({deadline_ms:budget.deadlineMs,request_timeout_ms:budget.requestTimeoutMs,
    auth_mode:budget.authMode,auth_ready:budget.authReady??true,parent_ready:true,release_match:'matched',selection_ready:true,plan_ready:true},budget,io,budget);
  if(!made.ok){budget.stop('invalid_input');return made;}
  // Source-boundary payload charge: the decoded payload string, once after a successful payload attempt.
  const chargePayload=(payload:string)=>{
    try{budget.chargePayload(payload);return {ok:true as const,value:true as const};}
    catch(error){const code=error instanceof Error?error.message:'internal_review_error';return {ok:false as const,code};}
  };
  return {ok:true as const,value:Object.freeze({machine:made.value,stats:budget.stats,chargePayload})};
}
