/** Session-private run lifecycle. No lookup, fixture adoption, source claim or evidence activation API. */
import type {ReadFailureCode} from './bounded-read.js';
type Code=ReadFailureCode|'evidence_binding_mismatch'|'invalid_observation_time';
const codes=new Set<Code>(['cancelled','closed','deadline_exceeded','authentication_failed','access_denied',
  'receive_budget_exceeded','payload_budget_exceeded','internal_review_error','evidence_binding_mismatch','invalid_observation_time',
  'invalid_input','not_found_or_not_visible','upstream_unavailable','request_budget_exceeded','payload_limit','invalid_response',
  'review_busy','changed_during_review','release_not_admitted','config_invalid','phase_deadline_exceeded','candidate_filter_violation']);
const fixed=(reason:unknown):Code=>typeof reason==='string'&&codes.has(reason as Code)?reason as Code:'internal_review_error';
export interface ReviewRunBudgetLease {
  /** Observation only. Never dispatches, charges, refunds or extends a deadline. */
  read():Readonly<{requests:number;received_bytes:number;payload_bytes:number;remaining_ms:number}>;
}
const registered=new WeakSet<object>();
/** The closure stays in the creating session's ECMAScript-private field. Arbitrary objects cannot
 * replace an existing session's owner. No exported mark/revoke/lookup-by-session operation exists. */
export function registerReviewEvidenceSession(session:object,snapshot:object,lease:ReviewRunBudgetLease){
  if(registered.has(session))throw new Error('invalid_state');
  registered.add(session);
  const authIdentity=Object.freeze({});const budgetIdentity=Object.freeze({});
  let pinnedSnapshot:object|undefined=snapshot,ready:object|undefined;
  let state:'created'|'ready'|'stopped'|'closed'='created';
  let primary:Readonly<{stage:'authentication'|'owner'|'binding';code:Code}>|null=null;
  let generation=0;
  let readyStarted=false;
  let lastBudget:ReturnType<ReviewRunBudgetLease['read']>|undefined;
  function revoke(reason:unknown,stage:'authentication'|'owner'|'binding'='owner'){
    primary??=Object.freeze({stage,code:fixed(reason)});ready=undefined;pinnedSnapshot=undefined;
    if(state!=='closed')state='stopped';
  }
  function check(currentSnapshot:object,currentLease:ReviewRunBudgetLease){
    if(primary)return false;
    if(currentSnapshot!==pinnedSnapshot||currentLease!==lease){revoke('evidence_binding_mismatch','binding');return false;}
    try{observeBudget();}
    catch{revoke('internal_review_error');}
    return primary===null&&currentSnapshot===pinnedSnapshot&&currentLease===lease;
  }
  function observeBudget(){
    const raw=lease.read();const b=Object.freeze({requests:raw.requests,received_bytes:raw.received_bytes,payload_bytes:raw.payload_bytes,remaining_ms:raw.remaining_ms});
    if(!Number.isFinite(b.remaining_ms)||!(['requests','received_bytes','payload_bytes'] as const).every(k=>Number.isSafeInteger(b[k])&&b[k]>=0)){
      revoke('invalid_observation_time');return null;
    }
    if(lastBudget&&(b.remaining_ms>lastBudget.remaining_ms||b.requests<lastBudget.requests||b.received_bytes<lastBudget.received_bytes||b.payload_bytes<lastBudget.payload_bytes)){
      revoke('invalid_observation_time');return null;
    }
    lastBudget=b;if(b.remaining_ms<=0)revoke('deadline_exceeded');return b;
  }
  return Object.freeze({
    markReady(currentSnapshot:object,currentLease:ReviewRunBudgetLease){
      if(readyStarted||state!=='created')return false;readyStarted=true;
      if(!check(currentSnapshot,currentLease))return false;
      ready=Object.freeze({authIdentity,budgetIdentity});generation=1;state='ready';return true;
    },
    revoke,
    failure(){return primary?.code;},
    close(reason:unknown){revoke(reason);state='closed';},
    inspect(currentSnapshot:object,currentLease:ReviewRunBudgetLease){
      check(currentSnapshot,currentLease);
      let budget:ReturnType<ReviewRunBudgetLease['read']>|null=null;
      try{budget=observeBudget();}
      catch{revoke('internal_review_error');}
      if(!primary)check(currentSnapshot,currentLease);
      return Object.freeze({state,auth_ready:!!ready,ready_generation:generation,primary,budget,evidence_issuance:'disabled' as const});
    },
  });
}
