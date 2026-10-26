/** Fake I/O adapter bound to the registered session's one-shot accounting port. No live transport. */
import { claimPreparedTransportBudget, type PreparedEvidenceOwner } from '../servicenow/review-evidence-lifecycle.js';
import { createFakeTransportReceiptMachine, type FakeTransportIo } from './abort-scope-evidence-transport-state.js';
export function createSessionBoundFakeTransport(session:object,owner:PreparedEvidenceOwner,io:FakeTransportIo){
  const claimed=claimPreparedTransportBudget(owner,session);if(!claimed.ok)return claimed;
  const budget=claimed.value;
  const made=createFakeTransportReceiptMachine({deadline_ms:budget.deadlineMs,request_timeout_ms:budget.requestTimeoutMs,
    auth_mode:budget.authMode,auth_ready:true,parent_ready:true,release_match:'matched',selection_ready:true,plan_ready:true},budget,io,budget);
  if(!made.ok){budget.stop('invalid_input');return made;}
  // Source-boundary payload charge: the decoded payload string, once after a successful payload attempt.
  const chargePayload=(payload:string)=>{
    try{budget.chargePayload(payload);return {ok:true as const,value:true as const};}
    catch(error){const code=error instanceof Error?error.message:'internal_review_error';return {ok:false as const,code};}
  };
  return {ok:true as const,value:Object.freeze({machine:made.value,stats:budget.stats,chargePayload})};
}
