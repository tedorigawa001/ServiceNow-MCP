/** Session-private run lifecycle. No lookup, fixture adoption, transport dispatch or evidence activation API. */
import type {ReadFailureCode} from './bounded-read.js';
import type {ReleaseEvidence} from '../review/result-schema-v2.js';
type Code=ReadFailureCode|'evidence_binding_mismatch'|'invalid_observation_time'|'invalid_state';
type Stage='authentication'|'owner'|'binding'|'transport_claim'|'transport_binding';
declare const transportBrand:unique symbol;
type ConstructorTransportHandle={readonly [transportBrand]:'constructor_transport_identity'};
type TransportResult<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
const codes=new Set<Code>(['cancelled','closed','deadline_exceeded','authentication_failed','access_denied',
  'receive_budget_exceeded','payload_budget_exceeded','internal_review_error','evidence_binding_mismatch','invalid_observation_time',
  'invalid_input','not_found_or_not_visible','upstream_unavailable','request_budget_exceeded','payload_limit','invalid_response',
  'review_busy','changed_during_review','release_not_admitted','config_invalid','phase_deadline_exceeded','candidate_filter_violation','invalid_state']);
const fixed=(reason:unknown):Code=>typeof reason==='string'&&codes.has(reason as Code)?reason as Code:'internal_review_error';
export interface ReviewRunBudgetLease {
  /** Observation only. Never dispatches, charges, refunds or extends a deadline. */
  read():Readonly<{requests:number;received_bytes:number;payload_bytes:number;remaining_ms:number}>;
}
export interface ReviewSourceReleaseSnapshot {readonly instance_release:ReleaseEvidence;readonly limitations:readonly string[];}
/** Only the concrete source's private verifier supplies this port to a real session. */
export interface ReviewSourceReleasePort {
  matches():boolean;
  copyRelease():ReviewSourceReleaseSnapshot;
}
function copyRelease(value:ReviewSourceReleaseSnapshot):ReviewSourceReleaseSnapshot{
  return Object.freeze({instance_release:Object.freeze(structuredClone(value.instance_release)),limitations:Object.freeze([...value.limitations])});
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
  let primary:Readonly<{stage:Stage;code:Code}>|null=null;
  let generation=0;
  let readyStarted=false;
  let lastBudget:ReturnType<ReviewRunBudgetLease['read']>|undefined;
  let sourceClaim:'unclaimed'|'consuming'|'claimed'|'failed'='unclaimed';
  let sourceBinding:{source:object;permit:object;port:ReviewSourceReleasePort;ready:object;release:ReviewSourceReleaseSnapshot}|undefined;
  let transportClaim:'unclaimed'|'consuming'|'claimed'|'failed'='unclaimed';
  let transportState:'unclaimed'|'claiming'|'identity_only'|'revoked'='unclaimed';
  let transportHandle:ConstructorTransportHandle|undefined;
  let transportBusy=false;
  let transportRefusal:Readonly<{stage:'transport_claim';code:'invalid_state'}>|null=null;
  function revoke(reason:unknown,stage:Stage='owner'){
    primary??=Object.freeze({stage,code:fixed(reason)});ready=undefined;pinnedSnapshot=undefined;
    if(sourceClaim==='consuming')sourceClaim='failed';sourceBinding=undefined;
    if(transportClaim==='consuming')transportClaim='failed';transportState='revoked';transportHandle=undefined;
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
  const transportNo=():TransportResult<never>=>Object.freeze({ok:false,code:primary?.code??'invalid_state'});
  const transportOk=<T>(value:T):TransportResult<T>=>Object.freeze({ok:true,value});
  const identityView=Object.freeze({state:'identity_only' as const,transport_claim:'claimed' as const,evidence_issuance:'disabled' as const,dispatch:'unavailable' as const});
  const idleBudget=()=>lastBudget?.requests===0&&lastBudget.received_bytes===0&&lastBudget.payload_bytes===0;
  const transportBound=(handle:ConstructorTransportHandle)=>transportClaim==='claimed'&&transportState==='identity_only'&&handle===transportHandle;
  function inspectSource(currentSnapshot:object,currentLease:ReviewRunBudgetLease,source:object,permit:object,port:ReviewSourceReleasePort){
    const b=sourceBinding;
    try{
      if(!check(currentSnapshot,currentLease))return null;
      if(!b||sourceClaim!=='claimed'||source!==b.source||permit!==b.permit||port!==b.port||ready!==b.ready||!port.matches()){
        revoke('evidence_binding_mismatch','binding');return null;
      }
      const release=copyRelease(b.release);
      if(!check(currentSnapshot,currentLease))return null;
      if(ready!==b.ready||!port.matches()){revoke('evidence_binding_mismatch','binding');return null;}
      return Object.freeze({state:'prepared_only' as const,...release,evidence_issuance:'disabled' as const});
    }catch{revoke('internal_review_error','binding');return null;}
  }
  function checkTransport(handle:ConstructorTransportHandle,currentSnapshot:object,currentLease:ReviewRunBudgetLease){
    if(!check(currentSnapshot,currentLease))return false;
    if(!transportBound(handle)){revoke('evidence_binding_mismatch','transport_binding');return false;}
    return check(currentSnapshot,currentLease);
  }
  function useTransport<T>(work:()=>TransportResult<T>):TransportResult<T>{
    if(primary)return transportNo();
    if(transportBusy){revoke('invalid_state','transport_binding');return transportNo();}
    transportBusy=true;
    try{return work();}catch{revoke('internal_review_error','transport_binding');return transportNo();}finally{transportBusy=false;}
  }
  const transportConstructor=Object.freeze({
    claim(currentSnapshot:object,currentLease:ReviewRunBudgetLease):TransportResult<ConstructorTransportHandle>{
      if(primary)return transportNo();
      if(transportClaim==='claimed'){
        if(currentSnapshot!==pinnedSnapshot||currentLease!==lease){revoke('evidence_binding_mismatch','transport_binding');return transportNo();}
        transportRefusal??=Object.freeze({stage:'transport_claim',code:'invalid_state'});return Object.freeze({ok:false,code:'invalid_state'});
      }
      if(transportClaim!=='unclaimed'){revoke('invalid_state','transport_claim');return transportNo();}
      return useTransport(()=>{
      transportClaim='consuming';transportState='claiming';
      if(readyStarted||state!=='created'||sourceClaim!=='unclaimed'){revoke('invalid_state','transport_claim');return transportNo();}
      if(!check(currentSnapshot,currentLease))return transportNo();
      if(!idleBudget()){revoke('invalid_state','transport_claim');return transportNo();}
      const handle=Object.freeze(Object.create(null)) as ConstructorTransportHandle;
      if(!check(currentSnapshot,currentLease))return transportNo();
      if(readyStarted||state!=='created'||sourceClaim!=='unclaimed'||transportClaim!=='consuming'||!idleBudget()){revoke('invalid_state','transport_claim');return transportNo();}
      transportHandle=handle;transportClaim='claimed';transportState='identity_only';return transportOk(handle);
      });
    },
    inspect(handle:ConstructorTransportHandle,currentSnapshot:object,currentLease:ReviewRunBudgetLease){
      return useTransport(()=>checkTransport(handle,currentSnapshot,currentLease)?transportOk(identityView):transportNo());
    },
    inspectPrepared(handle:ConstructorTransportHandle,currentSnapshot:object,currentLease:ReviewRunBudgetLease,source:object,permit:object,port:ReviewSourceReleasePort){
      return useTransport(()=>{
      if(!checkTransport(handle,currentSnapshot,currentLease))return transportNo();
      const prepared=inspectSource(currentSnapshot,currentLease,source,permit,port);if(!prepared)return transportNo();
      // No new lease/observer callback between the existing source verifier's final check and return.
      if(!transportBound(handle)){revoke('evidence_binding_mismatch','transport_binding');return transportNo();}
      return transportOk(Object.freeze({...prepared,dispatch:'unavailable' as const}));
      });
    },
    diagnostic(){return Object.freeze({state:transportState,claim:transportClaim,primary,refusal:transportRefusal,evidence_issuance:'disabled' as const,dispatch:'unavailable' as const});},
  });
  return Object.freeze({
    // Kept only in the actual session's #runOwner. No public session getter or dispatch operation.
    transportConstructor,
    markReady(currentSnapshot:object,currentLease:ReviewRunBudgetLease){
      if(readyStarted||state!=='created')return false;readyStarted=true;
      if(!check(currentSnapshot,currentLease))return false;
      ready=Object.freeze({authIdentity,budgetIdentity});generation=1;state='ready';return true;
    },
    revoke,
    failure(){return primary?.code;},
    rejectSource(){revoke('evidence_binding_mismatch','binding');},
    bindSource(currentSnapshot:object,currentLease:ReviewRunBudgetLease,source:object,permit:object,port:ReviewSourceReleasePort){
      if(primary)return false;
      if(sourceClaim!=='unclaimed'){
        if(!sourceBinding||sourceBinding.source!==source||sourceBinding.permit!==permit||sourceBinding.port!==port)revoke('evidence_binding_mismatch','binding');
        return false;
      }
      sourceClaim='consuming';
      try{
        if(!check(currentSnapshot,currentLease)||!ready||!port.matches()){revoke('evidence_binding_mismatch','binding');return false;}
        const release=copyRelease(port.copyRelease());
        if(!check(currentSnapshot,currentLease)||!ready||!port.matches()){revoke('evidence_binding_mismatch','binding');return false;}
        sourceBinding={source,permit,port,ready,release};sourceClaim='claimed';return true;
      }catch{revoke('internal_review_error','binding');return false;}
    },
    inspectSource,
    close(reason:unknown){revoke(reason);state='closed';},
    inspect(currentSnapshot:object,currentLease:ReviewRunBudgetLease){
      check(currentSnapshot,currentLease);
      let budget:ReturnType<ReviewRunBudgetLease['read']>|null=null;
      try{budget=observeBudget();}
      catch{revoke('internal_review_error');}
      if(!primary)check(currentSnapshot,currentLease);
      return Object.freeze({state,auth_ready:!!ready,ready_generation:generation,source_claim:sourceClaim,transport_claim:transportClaim,transport_state:transportState,primary,budget,evidence_issuance:'disabled' as const});
    },
  });
}
