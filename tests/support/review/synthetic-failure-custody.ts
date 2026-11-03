/** Fresh synthetic failure/cleanup custody only. No runtime resource, accepted route or registration. */
import {types} from 'node:util';

const roles=['source','transport_group','old_generation','new_generation'] as const;
type Role=typeof roles[number];
type HardCode='cancelled'|'deadline_exceeded'|'internal_review_error'|'worker_unavailable'|'authentication_failed'|'access_denied'|'request_budget_exceeded'|'receive_budget_exceeded'|'payload_budget_exceeded';
type Stage='prepare'|'transfer'|'cleanup'|'display'|'internal';
type Reason='shape'|'binding'|'state'|'duplicate'|'reentrant'|'internal';
export class FailureCustodyError extends Error{readonly code='internal_review_error';constructor(readonly reason:Reason){super('internal_review_error');}}
declare const ticketBrand:unique symbol,factBrand:unique symbol,absenceBrand:unique symbol,reportBrand:unique symbol,commitBrand:unique symbol;
export type FailureCreationTicket=Readonly<{[ticketBrand]:'synthetic_failure_creation'}>;
export type FailureFact=Readonly<{[factBrand]:'synthetic_failure_fact'}>;
export type FailureAbsence=Readonly<{[absenceBrand]:'synthetic_failure_absence'}>;
export type FailureReport=Readonly<{[reportBrand]:'synthetic_failure_report'}>;
export type FailureCommitReceipt=Readonly<{[commitBrand]:'synthetic_failure_commit'}>;
type FactKind='created'|'source_closed'|'transport_quiescent'|'worker_terminated'|'cleanup_confirmed'|'cleanup_unconfirmed';
type FirstHard=Readonly<{code:HardCode;stage:Stage}>;
type RoleState={role:Role;frame:object;ever_started:boolean;creation_closed:boolean;ticket:FailureCreationTicket|undefined;
  generation:'unknown'|'creating'|'created'|'not_created';stop:'not_requested'|'requested';termination:'unknown'|'confirmed';cleanup:'not_requested'|'requested'|'confirmed'|'unconfirmed';
  issued:{creation:boolean;terminal:boolean;cleanup:boolean;absence:boolean}};
type RoleView=Readonly<Pick<RoleState,'generation'|'stop'|'termination'|'cleanup'>&{resolved:boolean}>;
type Snapshot=Readonly<{scope:'synthetic_failure_diagnostic';authority:'none';outcome:'failed';release:'confirmed'|'unconfirmed';unresolved:number;first_hard:FirstHard;roles:Readonly<Record<Role,RoleView>>}>;
type Evidence={token:object;role:RoleState;frame:object;ticket:FailureCreationTicket|undefined;kind:FactKind|'absence'};
const opaque=<T>():T=>Object.freeze(Object.create(null)) as T;
function own(raw:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))throw new FailureCustodyError('shape');
  const names=Reflect.ownKeys(raw);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))throw new FailureCustodyError('shape');
  const out:Record<string,unknown>=Object.create(null);for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))throw new FailureCustodyError('shape');out[k]=d.value;}return out;
}

export function createSyntheticFailureCustody(raw:unknown,dependencies:unknown,...extra:unknown[]){
  const config=own(raw,['kind','upper']),deps=own(dependencies,['guard']);
  if(extra.length||config.kind!=='synthetic_failure_custody_v1'||!['connected','absent','reject'].includes(config.upper as string)
    ||typeof deps.guard!=='function'||types.isProxy(deps.guard))throw new FailureCustodyError('shape');
  const upperMode=config.upper,fixedGuard=deps.guard as (phase:'pre'|'post',operation:'seal'|'commit'|'discard')=>unknown,token=opaque<object>();
  const unverified=Object.freeze(['runtime_resource_origin','actual_cleanup','attempt_inventory','canonical_budget','cleanup_deadline']);
  const ledger=Object.fromEntries(roles.map(role=>[role,{role,frame:opaque(),ever_started:false,creation_closed:false,ticket:undefined,generation:'unknown',stop:'not_requested',termination:'unknown',cleanup:'not_requested',issued:{creation:false,terminal:false,cleanup:false,absence:false}}])) as Record<Role,RoleState>;
  // One common slot selects the sole cleanup owner. No duplicate authority is kept by local/upper facades.
  const custody={holder:'local' as 'local'|'upper',serial:0};
  const tickets=new Map<FailureCreationTicket,RoleState>(),facts=new Map<FailureFact|FailureAbsence,Evidence>();
  let state:'tracking'|'failed_draining'|'sealed_waiting_ack'|'committed_to_upper'|'discarded'='tracking',first:FirstHard|undefined;
  let busy=false,poisoned=false,faults=0,observedStop:'cancelled'|'deadline_exceeded'|null=null;
  let sealStarted=false,commitStarted=false,discardStarted=false,commits=0,discards=0;
  let reportHandle:FailureReport|undefined,report:Snapshot|undefined,upperReport:Snapshot|undefined,receipt:FailureCommitReceipt|undefined;
  let commitProof:Readonly<{token:object;report:Snapshot;serial:1;failure:FirstHard}>|undefined;
  function setHard(code:HardCode,stage:Stage){first??=Object.freeze({code,stage});for(const r of Object.values(ledger))r.creation_closed=true;if(state==='tracking')state='failed_draining';}
  const reject=(reason:Reason):never=>{faults=Math.min(100,faults+1);if(busy)poisoned=true;setHard('internal_review_error','internal');throw new FailureCustodyError(reason);};
  function action<T>(work:()=>T):T{
    if(busy)return reject('reentrant');busy=true;poisoned=false;
    try{return work();}catch(e){if(e instanceof FailureCustodyError)throw e;return reject('internal');}finally{busy=false;}
  }
  function checkpoint(phase:'pre'|'post',operation:'seal'|'commit'|'discard'){
    let stop:unknown;try{stop=fixedGuard(phase,operation);}catch{if(poisoned)return reject('reentrant');return reject('internal');}
    if(poisoned)return reject('reentrant');
    // Cleanup/reporting remains possible after hard/expiry. This is not a healthy-run guard.
    if(stop==='cancelled'||stop==='deadline_exceeded')observedStop??=stop;else if(stop!==undefined)reject('shape');
  }
  function roleOf(role:unknown):RoleState{if(typeof role!=='string'||!roles.includes(role as Role))return reject('shape');return ledger[role as Role];}
  function boundTicket(r:RoleState,ticket:FailureCreationTicket){if(tickets.get(ticket)!==r||r.ticket!==ticket||!r.ever_started)return reject('binding');}
  function owner(side:'local'|'upper'){
    if(custody.holder!==side||side==='local'&&state==='discarded'||side==='upper'&&!upperReport)reject('state');
  }
  function resolved(r:RoleState){return r.generation==='not_created'||r.generation==='created'&&r.termination==='confirmed'&&r.cleanup==='confirmed';}
  function snapshot():Snapshot{
    if(!first)return reject('state');const values=Object.fromEntries(roles.map(role=>{const r=ledger[role];return [role,Object.freeze({generation:r.generation,stop:r.stop,termination:r.termination,cleanup:r.cleanup,resolved:resolved(r)})];})) as Record<Role,RoleView>;
    const unresolved=roles.filter(role=>!values[role].resolved).length;
    return Object.freeze({scope:'synthetic_failure_diagnostic',authority:'none',outcome:'failed',release:unresolved?'unconfirmed':'confirmed',unresolved,first_hard:first,roles:Object.freeze(values)});
  }
  function observe(side:'local'|'upper',role:Role,ticket:FailureCreationTicket|undefined,fact:FailureFact|FailureAbsence,absence:boolean,args:unknown[]){return action(()=>{
    owner(side);const r=roleOf(role),e=facts.get(fact);facts.delete(fact);
    if(args.length||!e||e.token!==token||e.role!==r||e.frame!==r.frame||e.ticket!==ticket||absence!==(e.kind==='absence'))return reject('binding');
    if(absence){if(r.ever_started||!r.creation_closed||r.generation!=='unknown')return reject('state');r.generation='not_created';return;}
    boundTicket(r,ticket!);
    if(e.kind==='created'){if(r.generation!=='creating')return reject('state');r.generation='created';}
    else if(e.kind==='cleanup_confirmed'||e.kind==='cleanup_unconfirmed'){
      if(r.stop!=='requested'||r.cleanup!=='requested')return reject('state');r.cleanup=e.kind==='cleanup_confirmed'?'confirmed':'unconfirmed';
    }else{if(r.termination!=='unknown')return reject('duplicate');r.termination='confirmed';}
  });}
  function requestCleanup(side:'local'|'upper',role:Role,ticket:FailureCreationTicket,args:unknown[]){return action(()=>{
    owner(side);const r=roleOf(role);if(args.length)return reject('shape');boundTicket(r,ticket);if(r.stop!=='not_requested')return reject('duplicate');r.stop='requested';r.cleanup='requested';
  });}
  const issuer=Object.freeze({
    beginCreation(role:Role,...args:unknown[]):FailureCreationTicket{return action(()=>{
      const r=roleOf(role);if(args.length)return reject('shape');if(state!=='tracking'||first||r.creation_closed||r.ever_started)return reject('state');
      r.creation_closed=r.ever_started=true;r.generation='creating';const ticket=opaque<FailureCreationTicket>();r.ticket=ticket;tickets.set(ticket,r);return ticket;
    });},
    proveUncreated(role:Role,...args:unknown[]):FailureAbsence{return action(()=>{
      const r=roleOf(role);if(args.length)return reject('shape');if(r.ever_started||r.issued.absence||r.generation!=='unknown')return reject('state');
      r.creation_closed=true;r.issued.absence=true;const fact=opaque<FailureAbsence>();facts.set(fact,{token,role:r,frame:r.frame,ticket:undefined,kind:'absence'});return fact;
    });},
    fact(ticket:FailureCreationTicket,kind:FactKind,...args:unknown[]):FailureFact{return action(()=>{
      const r=tickets.get(ticket);if(args.length||!r)return reject('binding');boundTicket(r,ticket);
      if(!['created','source_closed','transport_quiescent','worker_terminated','cleanup_confirmed','cleanup_unconfirmed'].includes(kind))return reject('shape');
      if(kind==='source_closed'&&r.role!=='source'||kind==='transport_quiescent'&&r.role!=='transport_group'||kind==='worker_terminated'&&r.role!=='old_generation'&&r.role!=='new_generation')return reject('binding');
      const group=kind==='created'?'creation':kind==='cleanup_confirmed'||kind==='cleanup_unconfirmed'?'cleanup':'terminal';
      if(r.issued[group])return reject('duplicate');r.issued[group]=true;const fact=opaque<FailureFact>();facts.set(fact,{token,role:r,frame:r.frame,ticket,kind});return fact;
    });},
  });
  const local=Object.freeze({
    hard(code:HardCode,stage:Stage,...args:unknown[]){return action(()=>{
      if(args.length||!['cancelled','deadline_exceeded','internal_review_error','worker_unavailable','authentication_failed','access_denied','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded'].includes(code)
        ||!['prepare','transfer','cleanup','display','internal'].includes(stage))return reject('shape');
      if(state==='discarded')return reject('state');setHard(code,stage);
    });},
    observe:(role:Role,ticket:FailureCreationTicket,fact:FailureFact,...args:unknown[])=>observe('local',role,ticket,fact,false,args),
    observeAbsent:(role:Role,fact:FailureAbsence,...args:unknown[])=>observe('local',role,undefined,fact,true,args),
    requestCleanup:(role:Role,ticket:FailureCreationTicket,...args:unknown[])=>requestCleanup('local',role,ticket,args),
    seal(...args:unknown[]):FailureReport{return action(()=>{
      if(sealStarted)return reject('duplicate');sealStarted=true;checkpoint('pre','seal');
      if(args.length||state!=='failed_draining'||!first)return reject('state');const draft=snapshot(),handle=opaque<FailureReport>();checkpoint('post','seal');
      report=draft;reportHandle=handle;state='sealed_waiting_ack';return reportHandle;
    });},
    commit(handle:FailureReport,...args:unknown[]):FailureCommitReceipt{return action(()=>{
      if(commitStarted)return reject('duplicate');commitStarted=true;const ownHandle=reportHandle;reportHandle=undefined;
      checkpoint('pre','commit');
      if(args.length||state!=='sealed_waiting_ack'||handle!==ownHandle||!report||upperReport||custody.holder!=='local'||custody.serial!==0)return reject('binding');
      if(upperMode!=='connected')return reject('state');const moving=report;
      const proof=Object.freeze({token,report:moving,serial:1 as const,failure:first!}),nextReceipt=opaque<FailureCommitReceipt>();checkpoint('post','commit');
      // Single synchronous commit: no callback/await between custody selection, report storage and receipt creation.
      upperReport=moving;commitProof=proof;receipt=nextReceipt;custody.holder='upper';custody.serial=1;
      state='committed_to_upper';commits=1;return receipt;
    });},
    finalDiscard(handle:FailureCommitReceipt,...args:unknown[]){return action(()=>{
      if(discardStarted)return reject('duplicate');discardStarted=true;const ownReceipt=receipt;receipt=undefined;
      checkpoint('pre','discard');
      if(args.length||state!=='committed_to_upper'||!ownReceipt||handle!==ownReceipt||!commitProof||commitProof.token!==token||commitProof.failure!==first||commitProof.report!==upperReport
        ||commitProof.serial!==custody.serial||custody.holder!=='upper'||!upperReport)return reject('binding');
      checkpoint('post','discard');commitProof=undefined;state='discarded';discards=1;
    });},
    inspect:()=>Object.freeze({scope:'synthetic_failure_owner' as const,authority:'none' as const,state,first_hard:first??null,custody:custody.holder,local_cleanup_refs:custody.holder==='local'?roles.filter(r=>ledger[r].ever_started).length:0,
      seal_started:sealStarted,commit_started:commitStarted,discard_started:discardStarted,commits,discards,report:report??null,report_pending:!!reportHandle,receipt_pending:!!receipt,protocol_faults:faults,observed_stop:observedStop,
      permissions:Object.freeze({accepted_adoption:false,destination_seal:false,formal_issuance:false}),unverified}),
  });
  const upper=Object.freeze({
    observe:(role:Role,ticket:FailureCreationTicket,fact:FailureFact,...args:unknown[])=>observe('upper',role,ticket,fact,false,args),
    observeAbsent:(role:Role,fact:FailureAbsence,...args:unknown[])=>observe('upper',role,undefined,fact,true,args),
    requestCleanup:(role:Role,ticket:FailureCreationTicket,...args:unknown[])=>requestCleanup('upper',role,ticket,args),
    inspect:()=>Object.freeze({scope:'synthetic_upper_failure_owner' as const,authority:'none' as const,accepted:!!upperReport,custody:custody.holder,report:upperReport??null,current:upperReport?snapshot():null,unverified}),
  });
  return Object.freeze({issuer,local,upper});
}
