/** Development-only fixture lifecycle. Disjoint from real session registries and authority. */
import { BoundedReadSession, type ReadFailureCode } from '../servicenow/bounded-read.js';
import { z } from 'zod';
import { candidatePolicy } from './target-selection.js';
import type { PreparedTransportBudget, PreparedAttemptSettlement } from '../servicenow/review-transport-budget.js';
export type PreparedOwnerFailure = ReadFailureCode | 'invalid_state' | 'evidence_binding_mismatch' | 'internal_review_error';
declare const ownerBrand: unique symbol;
export type PreparedEvidenceOwner = { readonly [ownerBrand]: true };
declare const draftBrand: unique symbol;
type DraftHandle<K extends string> = { readonly [draftBrand]: K };
export type PreparedSelectionWindow = DraftHandle<'window'>;
export type PreparedSelectedRow = DraftHandle<'row'>;
export type PreparedPayloadStart = DraftHandle<'payload_start'>;
export type PreparedPayloadReady = DraftHandle<'payload_ready'>;
export type PreparedTransferClaim = DraftHandle<'transfer'>;
type Result<T> = Readonly<{ok:true;value:T}|{ok:false;code:PreparedOwnerFailure}>;
type AuthSnapshotIdentity = object;
type Session = { snapshot?:object; auth:AuthSnapshotIdentity; ready?:object; live:boolean;
  claim:'unclaimed'|'claimed'; failure?:PreparedOwnerFailure; owner?:Owner;
  transport?:()=>PreparedTransportBudget;bootstrap?:()=>PreparedTransportBudget;transportClaimed?:boolean };
type FixtureSource = { session:object; auth:AuthSnapshotIdentity; ready?:object; permit:object|null;
  claimed:boolean; parentReady:boolean; finalStarted:boolean; matched:boolean };
type Owner = { state:'prepared'|'revoked'; code?:PreparedOwnerFailure; revocations:number;
  windowStarted?:boolean; window?:DraftWindow;
  binding?:{session:Session;source:FixtureSource;auth:AuthSnapshotIdentity;ready:object;permit:object} };
const id=z.string().regex(/^[a-f0-9]{32}$/),version={sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)};
const rowSchema=z.strictObject({sys_id:id,update_set:id,name:z.string().min(1).max(200),type:z.string().max(200),action:z.string().max(40),...version});
const windowSchema=z.strictObject({parent:z.strictObject({sys_id:id,state:z.string().max(100),application:z.string().max(32),...version}),
  selection_mode:z.enum(['bounded_all','review_targets']).optional(),max_records:z.number().int().min(1).max(100),
  requested_rule_ids:z.tuple([z.literal('AU-BR-006')]),filter_version:z.literal('target-prefix-0.1').nullable().optional(),
  rows:z.array(rowSchema).max(101)});
type RowData=z.infer<typeof rowSchema>;
type DraftWindow={owner:Owner;session?:Session;data?:z.infer<typeof windowSchema>;rows:DraftRow[]};
type DraftRow={window:DraftWindow;handle:PreparedSelectedRow;ordinal:number;data?:Readonly<RowData>;start?:DraftStart};
type DraftStart={row:DraftRow;state:'started'|'ready'|'unavailable'|'transferred';ready?:PreparedPayloadReady};
type DraftReady={start:DraftStart;used:boolean};
type DraftTransfer={start:DraftStart;used:boolean};
const windows=new WeakMap<PreparedSelectionWindow,DraftWindow>(),rows=new WeakMap<PreparedSelectedRow,DraftRow>();
const starts=new WeakMap<PreparedPayloadStart,DraftStart>(),readyTickets=new WeakMap<PreparedPayloadReady,DraftReady>();
const transfers=new WeakMap<PreparedTransferClaim,DraftTransfer>();
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
  if(owner.binding)owner.binding.session.failure??=reason;
  if(owner.window){for(const row of owner.window.rows){row.data=undefined;row.start=undefined;}
    owner.window.data=undefined;owner.window.session=undefined;owner.window.rows=[];owner.window=undefined;}
  owner.code??=reason;owner.state='revoked';owner.binding=undefined;owner.revocations++;
}

/** Explicit fixture registration only. Real BoundedReadSession objects are refused. */
export function registerFixtureReviewSession(session:object,snapshot:object,transport?:()=>PreparedTransportBudget,bootstrap?:()=>PreparedTransportBudget):void{
  if(session instanceof BoundedReadSession||sessions.has(session))throw new Error('invalid_state');
  sessions.set(session,{snapshot,auth:opaque(),live:true,claim:'unclaimed',transport,bootstrap});
}
/** Pre-auth fixture claim, disjoint from real sessions and never issued from prepared scalar facts. */
export function claimFixtureBootstrapTransport(session:object):Result<PreparedTransportBudget>{
  const s=sessions.get(session);if(!s)return no('evidence_binding_mismatch');
  if(!s.live)return no(s.failure??'closed');
  if(s.ready||s.owner||s.transportClaimed||s.claim!=='unclaimed'||!s.bootstrap)return no('invalid_state');
  s.transportClaimed=true;
  try{
    const port=s.bootstrap(),check=()=>{if(!s.live||s.failure)throw Error(s.failure??'closed');port.check();};
    return ok(Object.freeze({...port,check,now(){check();return port.now();},
      dispatch(p:string,t:string|undefined,n:1|2){check();port.dispatch(p,t,n);},chunk(n:number){check();port.chunk(n);},
      chargePayload(payload:string){check();port.chargePayload(payload);},enterFinal(){check();port.enterFinal();},
      skipFinal(target:string){check();return port.skipFinal(target);},
      authenticationReady(){check();if(!port.authenticationReady)throw Error('authentication_failed');port.authenticationReady();check();},
    }));
  }catch{return no('invalid_state');}
}
/** Called after the pinned readyPromise succeeds; late auth completion cannot resurrect a session. */
export function markFixtureAuthReady(session:object):void{
  const s=sessions.get(session);if(s?.live&&!s.failure)s.ready??=opaque();
}
/** Synchronous, non-callback revocation must run before controller.abort(). */
export function revokeFixtureReviewSession(session:object,raw:unknown):void{
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

function boundOwner(owner:PreparedEvidenceOwner,session:object):Result<Owner>{
  const checked=assertPreparedOwner(owner);if(!checked.ok)return checked;
  const o=owners.get(owner)!;
  if(o.binding!.session!==sessions.get(session)){revoke(o,'evidence_binding_mismatch');return no(o.code!);}
  return ok(o);
}
/** Fake-dependency accounting only. No real source calls this, no production receipts. */
export function claimPreparedTransportBudget(owner:PreparedEvidenceOwner,session:object):Result<PreparedTransportBudget>{
  const bound=boundOwner(owner,session);if(!bound.ok)return bound;
  const s=bound.value.binding!.session;
  if(s.transportClaimed)return draftFailure(bound.value,'invalid_state');
  s.transportClaimed=true;
  try{
    if(!s.transport)return draftFailure(bound.value,'invalid_state');
    const port=s.transport();
    const check=()=>{const live=boundOwner(owner,session);if(!live.ok)throw Error(live.code);port.check();};
    return ok(Object.freeze({...port,
      now(){check();return port.now();},check,
      dispatch(p:string,t:string|undefined,n:1|2){check();port.dispatch(p,t,n);},
      chunk(n:number){check();port.chunk(n);},chargePayload(payload:string){check();port.chargePayload(payload);},settle(result:PreparedAttemptSettlement){port.settle(result);},
      skipFinal(target:string){check();return port.skipFinal(target);},
      enterFinal(){check();port.enterFinal();},
    }));
  }catch{return draftFailure(bound.value,'invalid_state');}
}
function draftFailure(owner:Owner,reason:PreparedOwnerFailure):Result<never>{revoke(owner,reason);return no(owner.code!);}
function boundWindow(owner:Owner,window:PreparedSelectionWindow):Result<DraftWindow>{
  const w=windows.get(window);
  return w?.owner===owner&&owner.window===w&&w.session===owner.binding?.session?ok(w):draftFailure(owner,'evidence_binding_mismatch');
}
function eligible(row:Readonly<RowData>){return row.action==='INSERT_OR_UPDATE'&&/^sys_script_[a-f0-9]{32}$/.test(row.name);}

/** Non-authoritative fixture window. No real source/body/cleanup proof may be registered here. */
export function createPreparedFixtureWindow(owner:PreparedEvidenceOwner,session:object,raw:unknown):Result<PreparedSelectionWindow>{
  const bound=boundOwner(owner,session);if(!bound.ok)return bound;const o=bound.value;
  if(o.windowStarted)return draftFailure(o,'invalid_state');o.windowStarted=true;
  try{
    const copy=structuredClone(raw),live=boundOwner(owner,session);if(!live.ok)return live;
    const p=windowSchema.safeParse(copy);if(!p.success)return draftFailure(o,'invalid_input');
    const d=p.data,mode=d.selection_mode??'bounded_all';
    if(d.rows.length>d.max_records+1||(mode==='review_targets')!==(d.filter_version==='target-prefix-0.1'))return draftFailure(o,'invalid_input');
    if(d.rows.some(r=>r.update_set!==d.parent.sys_id)||d.rows.some((r,n)=>n>0&&r.sys_id<=d.rows[n-1].sys_id))return draftFailure(o,'evidence_binding_mismatch');
    // The same fixed policy the real source applies, not a local copy that could drift from it.
    const policy=candidatePolicy(d.requested_rule_ids);
    if(mode==='review_targets'&&d.rows.some(r=>!policy.accepts(r)))return draftFailure(o,'candidate_filter_violation');
    const handle=opaque() as PreparedSelectionWindow,w:DraftWindow={owner:o,session:o.binding!.session,data:d,rows:[]};
    for(const [ordinal,data] of d.rows.slice(0,d.max_records).entries()){
      const rowHandle=opaque() as PreparedSelectedRow,row:DraftRow={window:w,handle:rowHandle,ordinal,data:Object.freeze({...data})};
      rows.set(rowHandle,row);w.rows.push(row);
    }
    windows.set(handle,w);o.window=w;return ok(handle);
  }catch{return draftFailure(o,'invalid_input');}
}
export function preparedWindowInfo(owner:PreparedEvidenceOwner,session:object,window:PreparedSelectionWindow){
  const b=boundOwner(owner,session);if(!b.ok)return b;const w=boundWindow(b.value,window);if(!w.ok)return w;
  const d=w.value.data!;
  return ok(Object.freeze({state:'draft' as const,selection_mode:d.selection_mode??'bounded_all',mode_supplied:d.selection_mode!==undefined,
    selected:w.value.rows.length,metadata_seen:d.rows.length,truncated:d.rows.length>d.max_records,evidence_issuance:'disabled' as const}));
}
export function preparedWindowRow(owner:PreparedEvidenceOwner,session:object,window:PreparedSelectionWindow,ordinal:number):Result<PreparedSelectedRow>{
  const b=boundOwner(owner,session);if(!b.ok)return b;const w=boundWindow(b.value,window);if(!w.ok)return w;
  if(!Number.isInteger(ordinal)||ordinal<0||ordinal>=w.value.rows.length)return draftFailure(b.value,'evidence_binding_mismatch');
  return ok(w.value.rows[ordinal].handle);
}
export function beginPreparedPayload(owner:PreparedEvidenceOwner,session:object,window:PreparedSelectionWindow,row:PreparedSelectedRow):Result<PreparedPayloadStart>{
  const b=boundOwner(owner,session);if(!b.ok)return b;const w=boundWindow(b.value,window);if(!w.ok)return w;
  const r=rows.get(row);if(!r||r.window!==w.value)return draftFailure(b.value,'evidence_binding_mismatch');
  if(r.start)return draftFailure(b.value,'invalid_state');
  // Consume the row start even if this asset turns out to be ineligible; never repair/retry it.
  const start:DraftStart={row:r,state:'started'};r.start=start;
  if(!r.data||!eligible(r.data))return draftFailure(b.value,'invalid_state');
  const ticket=opaque() as PreparedPayloadStart;starts.set(ticket,start);return ok(ticket);
}
/** Fake completion disposition only: carries no bytes, hashes, cleanup claims or real receipt. */
export function settlePreparedPayload(owner:PreparedEvidenceOwner,session:object,ticket:PreparedPayloadStart,outcome:'ready'|'unavailable'):Result<PreparedPayloadReady|null>{
  const b=boundOwner(owner,session);if(!b.ok)return b;const start=starts.get(ticket);
  if(!start||start.row.window.owner!==b.value||start.row.window!==b.value.window)return draftFailure(b.value,'evidence_binding_mismatch');
  if(start.state!=='started')return draftFailure(b.value,'invalid_state');
  start.state='unavailable';
  if(outcome==='unavailable')return ok(null);
  if(outcome!=='ready')return draftFailure(b.value,'invalid_input');
  start.state='ready';const ready=opaque() as PreparedPayloadReady;start.ready=ready;readyTickets.set(ready,{start,used:false});return ok(ready);
}
export function claimPreparedTransfer(owner:PreparedEvidenceOwner,session:object,row:PreparedSelectedRow,ready:PreparedPayloadReady):Result<PreparedTransferClaim>{
  const b=boundOwner(owner,session);if(!b.ok)return b;const r=rows.get(row),ticket=readyTickets.get(ready);
  if(!r||r.window.owner!==b.value||r.window!==b.value.window||!ticket||ticket.start.row!==r||r.start!==ticket.start)return draftFailure(b.value,'evidence_binding_mismatch');
  if(ticket.used||ticket.start.state!=='ready'||ticket.start.ready!==ready)return draftFailure(b.value,'invalid_state');
  ticket.used=true;ticket.start.state='transferred';
  const transfer=opaque() as PreparedTransferClaim;transfers.set(transfer,{start:ticket.start,used:false});return ok(transfer);
}
export function consumePreparedTransfer(owner:PreparedEvidenceOwner,session:object,claim:PreparedTransferClaim){
  const b=boundOwner(owner,session);if(!b.ok)return b;const t=transfers.get(claim);
  if(!t||t.start.row.window.owner!==b.value||t.start.row.window!==b.value.window)return draftFailure(b.value,'evidence_binding_mismatch');
  if(t.used)return draftFailure(b.value,'invalid_state');t.used=true;
  return ok(Object.freeze({state:'simulated' as const,synthetic:true as const,evidence_issuance:'disabled' as const}));
}
