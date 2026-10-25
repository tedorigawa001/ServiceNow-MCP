/** Internal prepared-only lifecycle. No I/O, source evidence, receipt, permit or worker authority. */
import type { ReadFailureCode } from './bounded-read.js';
export type PreparedOwnerFailure = ReadFailureCode | 'invalid_state' | 'evidence_binding_mismatch' | 'internal_review_error';
declare const ownerBrand: unique symbol;
export type PreparedEvidenceOwner = { readonly [ownerBrand]: true };
type Result<T> = Readonly<{ok:true;value:T}|{ok:false;code:PreparedOwnerFailure}>;
type AuthSnapshotIdentity = object;
type Session = { snapshot?:object; auth:AuthSnapshotIdentity; ready?:object; live:boolean;
  claim:'unclaimed'|'claimed'; failure?:PreparedOwnerFailure; owner?:Owner };
type FixtureSource = { session:object; auth:AuthSnapshotIdentity; ready?:object; permit:object|null;
  claimed:boolean; parentReady:boolean; finalStarted:boolean; matched:boolean };
type Owner = { state:'prepared'|'revoked'; code?:PreparedOwnerFailure; revocations:number;
  binding?:{session:Session;source:FixtureSource;auth:AuthSnapshotIdentity;ready:object;permit:object} };
const sessions=new WeakMap<object,Session>(),sources=new WeakMap<object,FixtureSource>(),owners=new WeakMap<PreparedEvidenceOwner,Owner>();
const opaque=()=>Object.freeze(Object.create(null)) as object;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const no=(code:PreparedOwnerFailure):Result<never>=>Object.freeze({ok:false,code});
const readCodes={invalid_input:true,authentication_failed:true,access_denied:true,not_found_or_not_visible:true,
  upstream_unavailable:true,deadline_exceeded:true,receive_budget_exceeded:true,request_budget_exceeded:true,
  payload_budget_exceeded:true,payload_limit:true,invalid_response:true,review_busy:true,cancelled:true,closed:true,
  changed_during_review:true,release_not_admitted:true,config_invalid:true,phase_deadline_exceeded:true,candidate_filter_violation:true} satisfies Record<ReadFailureCode,true>;
const codes=new Set<PreparedOwnerFailure>([...Object.keys(readCodes) as ReadFailureCode[],
  'invalid_state','evidence_binding_mismatch','internal_review_error']);
function code(raw:unknown):PreparedOwnerFailure{return codes.has(raw as PreparedOwnerFailure)?raw as PreparedOwnerFailure:'internal_review_error';}
function revoke(owner:Owner,reason:PreparedOwnerFailure){
  if(owner.state==='revoked')return;
  owner.code??=reason;owner.state='revoked';owner.binding=undefined;owner.revocations++;
}

/** Called only by the real session constructor, with its isolated snapshot reference. */
export function registerReviewEvidenceSession(session:object,snapshot:object):void{
  if(sessions.has(session))throw new Error('invalid_state');
  sessions.set(session,{snapshot,auth:opaque(),live:true,claim:'unclaimed'});
}
/** Called after the pinned readyPromise succeeds; late auth completion cannot resurrect a session. */
export function markReviewEvidenceAuthReady(session:object):void{
  const s=sessions.get(session);if(s?.live&&!s.failure)s.ready??=opaque();
}
/** Synchronous, non-callback revocation must run before controller.abort(). */
export function revokeReviewEvidenceSession(session:object,raw:unknown):void{
  const s=sessions.get(session);if(!s)return;
  const reason=code(raw);s.failure??=reason;s.live=false;s.ready=undefined;s.snapshot=undefined;
  if(s.owner)revoke(s.owner,s.owner.code??s.failure);
}

/** Non-authoritative fixture registration port. No BoundedUpdateSetSource calls this port.
 * Registration/claim can only create a prepared owner; there is deliberately no activation API.
 * The ergonomic fake issuer is development-only and excluded from the package. */
export function registerPreparedFixtureSource(session:object,source:object,permit:object|null,
  facts:Readonly<{parentReady:boolean;finalStarted:boolean;matched:boolean}>,authSession:object=session):Result<true>{
  const s=sessions.get(session),auth=sessions.get(authSession);
  if(!s||!auth||sources.has(source))return no('evidence_binding_mismatch');
  if(!s.live)return no(s.failure??'closed');
  sources.set(source,{session,auth:auth.auth,ready:auth.ready,permit,claimed:false,
    parentReady:facts.parentReady,finalStarted:facts.finalStarted,matched:facts.matched});return ok(true);
}
export function claimPreparedFixtureOwner(session:object,source:object,permit:object|null):Result<PreparedEvidenceOwner>{
  const s=sessions.get(session),x=sources.get(source);
  // Reject unknown/foreign source without consuming somebody else's session claim.
  if(!s||!x||x.session!==session)return no('evidence_binding_mismatch');
  if(!s.live)return no(s.failure??'closed');
  if(s.claim==='claimed')return no(s.failure??'invalid_state');
  s.claim='claimed';
  const fail=(reason:PreparedOwnerFailure):Result<never>=>{s.failure??=reason;return no(s.failure);};
  if(x.claimed)return fail('invalid_state');x.claimed=true;
  if(x.auth!==s.auth||x.ready!==s.ready)return fail('evidence_binding_mismatch');
  if(!s.ready)return fail('authentication_failed');
  if(!x.parentReady||x.finalStarted)return fail('invalid_state');
  if(!x.matched||!x.permit||permit!==x.permit)return fail('release_not_admitted');
  const value=opaque() as PreparedEvidenceOwner;
  const owner:Owner={state:'prepared',revocations:0,binding:{session:s,source:x,auth:s.auth,ready:s.ready,permit:x.permit}};
  owners.set(value,owner);s.owner=owner;return ok(value);
}
/** Fixed diagnostic only; never returns identities, credentials, source or session references. */
export function preparedOwnerStatus(owner:PreparedEvidenceOwner){
  const o=owners.get(owner);if(!o)return no('evidence_binding_mismatch');
  return ok(Object.freeze({state:o.state,code:o.code??null,evidence_issuance:'disabled' as const,revocations:o.revocations}));
}
export function assertPreparedOwner(owner:PreparedEvidenceOwner):Result<true>{
  const o=owners.get(owner);if(!o)return no('evidence_binding_mismatch');
  if(o.state==='revoked')return no(o.code??'closed');
  const b=o.binding;
  if(!b||!b.session.live){revoke(o,b?.session.failure??'closed');return no(o.code!);}
  if(b.auth!==b.session.auth||b.ready!==b.session.ready||b.source.auth!==b.auth||b.source.ready!==b.ready||b.source.permit!==b.permit){
    revoke(o,'evidence_binding_mismatch');return no(o.code!);
  }
  return ok(true);
}
/** A closed gate, not a receipt factory. Cannot produce a production-shaped success. */
export function refusePreparedEvidenceIssuance(owner:PreparedEvidenceOwner):Result<never>{
  const live=assertPreparedOwner(owner);return live.ok?no('invalid_state'):live;
}
