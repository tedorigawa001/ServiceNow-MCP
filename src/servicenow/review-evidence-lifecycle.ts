/** Session-private run lifecycle. No lookup, fixture adoption, transport dispatch or evidence activation API. */
import type {ReadFailureCode} from './bounded-read.js';
import type {ReleaseEvidence} from '../review/result-schema-v2.js';
import {createReviewBootstrapContract,type ReviewBootstrapDependencies} from './review-bootstrap-contract.js';
import {CanonicalBudgetError,type createCanonicalReviewBudget} from './review-canonical-budget.js';
type CanonicalCore=ReturnType<typeof createCanonicalReviewBudget>;
type ConstructorAccounting=ReturnType<CanonicalCore['construction']['takeBootstrapAccounting']>;
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
export function registerReviewEvidenceSession(session:object,snapshot:object,lease:ReviewRunBudgetLease,bootstrapDependencies?:ReviewBootstrapDependencies,
  canonical?:Readonly<{core:CanonicalCore;stop(code:Code):void}>){
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
  let initialSourceClaim:'unclaimed'|'consuming'|'claimed'|'failed'='unclaimed';
  let initialSource:object|undefined;
  let transportClaim:'unclaimed'|'consuming'|'claimed'|'failed'='unclaimed';
  let transportState:'unclaimed'|'claiming'|'identity_only'|'revoked'='unclaimed';
  let transportHandle:ConstructorTransportHandle|undefined;
  let transportBusy=false;
  let statusClaim:'unclaimed'|'consuming'|'claimed'|'failed'='unclaimed';
  let statusRevoke:(()=>void)|undefined;
  let canonicalConnected=false,stopNotified=false;
  let transportRefusal:Readonly<{stage:'transport_claim';code:'invalid_state'}>|null=null;
  let bootstrap:ReturnType<typeof createReviewBootstrapContract<ConstructorTransportHandle>>|undefined;
  function revoke(reason:unknown,stage:Stage='owner'){
    primary??=Object.freeze({stage,code:fixed(reason)});ready=undefined;pinnedSnapshot=undefined;
    if(statusClaim==='consuming')statusClaim='failed';
    if(sourceClaim==='consuming')sourceClaim='failed';sourceBinding=undefined;
    if(initialSourceClaim==='consuming')initialSourceClaim='failed';initialSource=undefined;
    if(transportClaim==='consuming')transportClaim='failed';transportState='revoked';transportHandle=undefined;
    if(state!=='closed')state='stopped';
    statusRevoke?.();
    if(canonicalConnected&&canonical&&!stopNotified){
      stopNotified=true;
      canonical.core.writer.stop(primary.code);canonical.stop(primary.code);
    }
    bootstrap?.revoke();
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
    /** Internal creator continuation only. Identity/diagnostics, never body/status issuance authority. */
    claimStatusBinding(handle:ConstructorTransportHandle,currentSnapshot:object,currentLease:ReviewRunBudgetLease,source:object){
      return useTransport(()=>{
        if(statusClaim!=='unclaimed'){revoke('invalid_state','transport_binding');return transportNo();}
        statusClaim='consuming';
        if(!checkTransport(handle,currentSnapshot,currentLease))return transportNo();
        if(initialSourceClaim!=='claimed'||initialSource!==source){revoke('evidence_binding_mismatch','transport_binding');return transportNo();}
        if(readyStarted||!idleBudget()){revoke('invalid_state','transport_binding');return transportNo();}
        let live=true,firstTerminal:Code|null=null,refusal:Code|null=null;
        let accountingClaim:'unclaimed'|'consuming'|'claimed'|'failed'='unclaimed',released=false;
        statusRevoke=()=>{live=false;firstTerminal??=primary?.code??'closed';if(statusClaim==='consuming')statusClaim='failed';};
        const diagnostic=()=>Object.freeze({state:live?'bound' as const:'revoked' as const,claim:statusClaim,
          first_terminal:firstTerminal,refusal,primary,accounting_claim:accountingClaim,
          budget_primary:canonicalConnected?canonical!.core.view.diagnostic().primary:null,
          evidence_issuance:'disabled' as const,dispatch:'unavailable' as const});
        const inspect=(h:ConstructorTransportHandle,s:object,l:ReviewRunBudgetLease,src:object)=>useTransport(()=>{
          if(!live||statusClaim!=='claimed'){refusal??=primary?.code??'invalid_state';return transportNo();}
          if(h!==handle||s!==currentSnapshot||l!==currentLease||src!==source){
            refusal??='evidence_binding_mismatch';revoke('evidence_binding_mismatch','transport_binding');return transportNo();
          }
          if(!checkTransport(h,s,l))return transportNo();
          if(!live||initialSource!==source){revoke('evidence_binding_mismatch','transport_binding');return transportNo();}
          return transportOk(Object.freeze({state:'constructor_bound' as const,ready_generation:generation,evidence_issuance:'disabled' as const,dispatch:'unavailable' as const}));
        });
        const connectAccounting=(port:ConstructorAccounting)=>useTransport(()=>{
          if(accountingClaim!=='unclaimed'){revoke('invalid_state','transport_binding');return transportNo();}
          accountingClaim='consuming';
          if(!canonical||!canonical.core.construction.ownsBootstrapAccounting(port)){
            accountingClaim='failed';revoke('evidence_binding_mismatch','transport_binding');return transportNo();
          }
          canonicalConnected=true;
          canonical.core.construction.connectStopOwner(port,code=>revoke(code,'transport_binding'));
          if(!live||!checkTransport(handle,currentSnapshot,currentLease)||accountingClaim!=='consuming'){
            accountingClaim='failed';return transportNo();
          }
          accountingClaim='claimed';
          const adopt=(error:unknown):never=>{
            const reason=canonical.core.view.diagnostic().primary?.internal??(error instanceof CanonicalBudgetError?error.code:'internal_review_error');
            revoke(reason,'transport_binding');throw new CanonicalBudgetError(canonical.core.view.failure()??'internal_review_error');
          };
          const run=(operation:()=>void)=>{
            if(released||!inspect(handle,currentSnapshot,currentLease,source).ok)return adopt(new CanonicalBudgetError('closed'));
            try{
              operation();
              if(!inspect(handle,currentSnapshot,currentLease,source).ok)return adopt(new CanonicalBudgetError('closed'));
            }catch(error){return adopt(error);}
          };
          return transportOk(Object.freeze({
            reserve:()=>run(()=>port.reserve()),reserved:()=>port.reserved(),
            dispatch:(floor?:number)=>run(()=>port.dispatch(floor)),chunk:(n:number)=>run(()=>port.chunk(n)),
            // Reservation teardown is not a new run failure; preserve an ordinary cutoff's reason.
            release:()=>{if(released)return;released=true;port.release();statusRevoke?.();},
          }));
        });
        // Recheck after lease callbacks; reentry/stop may have spent the claim.
        if(!checkTransport(handle,currentSnapshot,currentLease)||!live||statusClaim!=='consuming')return transportNo();
        if(readyStarted||!idleBudget()){revoke('invalid_state','transport_binding');return transportNo();}
        statusClaim='claimed';
        return transportOk(Object.freeze({inspect,diagnostic,connectAccounting}));
      });
    },
    /** Creator-owned pre-I/O binding, distinct from the post-ready ReleasePermit binding. */
    bindInitialSource(handle:ConstructorTransportHandle,currentSnapshot:object,currentLease:ReviewRunBudgetLease,source:object){
      return useTransport(()=>{
        if(initialSourceClaim!=='unclaimed'){revoke('invalid_state','transport_binding');return transportNo();}
        initialSourceClaim='consuming';
        if(!checkTransport(handle,currentSnapshot,currentLease))return transportNo();
        if(readyStarted||state!=='created'||sourceClaim!=='unclaimed'||!idleBudget()||!source||typeof source!=='object'){
          revoke('invalid_state','transport_binding');return transportNo();
        }
        initialSource=source;
        if(!checkTransport(handle,currentSnapshot,currentLease))return transportNo();
        if(initialSourceClaim!=='consuming'||initialSource!==source||readyStarted||!idleBudget()){
          revoke('invalid_state','transport_binding');return transportNo();
        }
        initialSourceClaim='claimed';
        return transportOk(Object.freeze({state:'constructor_bound' as const,initial_source:'bound' as const,evidence_issuance:'disabled' as const}));
      });
    },
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
    bootstrap(handle:ConstructorTransportHandle,currentSnapshot:object,currentLease:ReviewRunBudgetLease){return bootstrap?bootstrap.run(handle,currentSnapshot,currentLease):Promise.resolve(transportNo());},
    diagnostic(){return Object.freeze({state:transportState,claim:transportClaim,primary,refusal:transportRefusal,bootstrap:bootstrap?.diagnostic()??null,evidence_issuance:'disabled' as const,dispatch:'unavailable' as const});},
  });
  const owner=Object.freeze({
    // Actual sessions keep this in #runOwner and supply no fake bootstrap dependencies or public getter.
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
      if(initialSourceClaim!=='unclaimed'&&(initialSourceClaim!=='claimed'||source!==initialSource)){
        revoke('evidence_binding_mismatch','binding');return false;
      }
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
  if(bootstrapDependencies)bootstrap=createReviewBootstrapContract({lease,sample:observeBudget,check:(h,s,l)=>transportConstructor.inspect(h,s,l),
    ready:()=>owner.markReady(snapshot,lease),bind:(s,p,port)=>owner.bindSource(snapshot,lease,s,p,port),
    prepared:(h,s,l,source,p,port)=>transportConstructor.inspectPrepared(h,s,l,source,p,port),stop:code=>revoke(code),failure:()=>primary?.code},bootstrapDependencies);
  return owner;
}
