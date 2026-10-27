/** Fake-only transport state machine. No actual session, fetch, stream, timer, budget or production evidence. */
import { z } from 'zod';
import { createHash, type Hash } from 'node:crypto';
import { normalizeFixedTableValue } from './abort-scope-evidence-fixed-source.js';
import { validateFixtureOAuthResponse,type FixtureOAuthDetail } from './abort-scope-evidence-oauth-policy.js';
import type { PreparedTransportBudget, PreparedFinalSkip } from '../servicenow/review-transport-budget.js';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type FakePurposePermit=Handle<'purpose'>;
export type FakeAttemptClaim=Handle<'attempt'>;
export type FakeCleanupEvidence=Handle<'cleanup'>;
export type FakeBodyReceipt=Handle<'body'>;
export type FakeTransportSource=Handle<'source'>;
export type FakeTransportPhase=Handle<'phase'>;
export type FakeTransportSlot=Handle<'slot'>;
export type FakeTransportPurpose='oauth'|'parent_initial'|'release_rows'|'metadata_initial'|'payload'|'table_initial'|'parent_final'|'metadata_final'|'table_final';
type Code='invalid_input'|'invalid_state'|'evidence_binding_mismatch'|'release_not_admitted'|'authentication_failed'|'access_denied'
  |'cancelled'|'closed'|'deadline_exceeded'|'phase_deadline_exceeded'|'attempt_deadline_exceeded'|'invalid_observation_time'|'internal_review_error'
  |'request_budget_exceeded'|'receive_budget_exceeded'|'payload_budget_exceeded'|'payload_limit'|'scope_evidence_limit'|'invalid_response'|'table_binding_mismatch'|'upstream_unavailable';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
type Outcome='body'|'auth_only'|'upstream_unavailable'|'invalid_response'|'not_found_or_not_visible'|'access_denied'|'scope_evidence_limit'|'stopped';
type Detail=FixtureOAuthDetail|'oauth_http_error'|'authentication_completion_failed'|'http_unauthorized'|'http_forbidden'|'cleanup_unconfirmed'|'invalid_json'|'upstream_unavailable'|'local_unavailable'|'run_stopped';
const configSchema=z.strictObject({deadline_ms:z.number().int().min(1).max(60000),request_timeout_ms:z.number().int().min(1).max(10000),
  auth_mode:z.enum(['per-user','service-account']),auth_ready:z.boolean(),parent_ready:z.boolean(),release_match:z.enum(['matched','mismatched','unknown']),
  selection_ready:z.boolean(),plan_ready:z.boolean()});
const purposes:readonly FakeTransportPurpose[]=['oauth','parent_initial','release_rows','metadata_initial','payload','table_initial','parent_final','metadata_final','table_final'];
const observationSchema=z.strictObject({fetch:z.enum(['pending','rejected','fulfilled']),status:z.number().int().min(100).max(599).nullable(),
  body:z.enum(['none','reader','unlocked','unknown_lock']),pending_read:z.boolean(),eof:z.boolean(),
  closed:z.enum(['pending','fulfilled','rejected']).nullable(),cancel:z.enum(['not_requested','pending','fulfilled','rejected']),read_failed:z.boolean().optional()}).superRefine((s,c)=>{
  if((s.fetch==='fulfilled')!==(s.status!==null)||s.fetch!=='fulfilled'&&s.body!=='none'
    ||s.body!=='reader'&&(s.pending_read||s.eof||s.closed!==null)||s.body==='reader'&&s.closed===null||s.eof&&s.pending_read
    ||s.read_failed&&(s.body!=='reader'||s.pending_read||s.eof))c.addIssue({code:'custom',message:'invalid observation'});
});
export type FakeIoObservation=z.infer<typeof observationSchema>;
export interface FakeAttemptIo {
  snapshot():unknown;
  bodyText():unknown;
  cancel():void;
  releaseLock():void;
  abort():void;
}
export type FakeDispatchRequest=Readonly<{purpose:FakeTransportPurpose;target?:string;ordinal:1|2;synthetic:true}>;
export type FakeAttemptTiming=Readonly<{io_deadline:number;deadline:number;response_cap:number;now:()=>number}>;
export interface FakeTransportIo { dispatch(request:FakeDispatchRequest,timing:FakeAttemptTiming):FakeAttemptIo }
type Cleanup=Readonly<{disposition:'confirmed'|'unconfirmed';kind:'eof'|'cancelled'|'no_response'|'no_body'|null;reason:string|null;synthetic:true}>;
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});

export function createFakeTransportReceiptMachine(raw:unknown,clock:{now():number},io:FakeTransportIo,budget?:PreparedTransportBudget){
  let parsed:z.infer<typeof configSchema>,t0:number;
  try{parsed=configSchema.parse(structuredClone(raw));t0=clock.now();if(!Number.isFinite(t0)||t0<0||typeof io.dispatch!=='function')throw Error();}
  catch{return {ok:false as const,code:'invalid_input' as const};}
  const facts=parsed,hard=Math.min(t0+facts.deadline_ms,budget?.deadlineMs??Infinity),source=opaque<FakeTransportSource>();
  let phase=opaque<FakeTransportPhase>(),phaseName:'normal'|'final'='normal',last=t0,primary:Code|undefined,primaryDetail:Detail|undefined;
  let authReady=facts.auth_ready;
  let lastFailure:Readonly<{purpose:FakeTransportPurpose;code:Code|Outcome;detail:Detail;retryable:boolean;scope:'run'|'authentication'|'local'|'release'|'transport'}>|null=null;
  type Slot={kind:'parent'|'metadata'|'table';target?:string;skipped?:boolean};
  type Purpose={kind:FakeTransportPurpose;phase:FakeTransportPhase;target?:string;slot?:FakeTransportSlot;attempts:number;state:'issued'|'inflight'|'retryable'|'done';startFailure?:'phase_deadline_exceeded'|'request_budget_exceeded'};
  type Attempt={permit:FakePurposePermit;p:Purpose;ordinal:1|2;deadline:number;ioDeadline:number;state:'io'|'cleanup'|'settled';
    resource?:FakeAttemptIo;dispatchRejected:boolean;cancelled:boolean;released:boolean;aborted:boolean;abortFailed:boolean;timedOut:boolean;
    received:number;sequence:number;empty:number;hash:Hash;localFailure?:'scope_evidence_limit'|'payload_limit'|'invalid_response'};
  type Body={permit:FakePurposePermit;data?:unknown;bytes:number;used:boolean;status:number;observed:number};
  const slots=new WeakMap<FakeTransportSlot,Slot>(),slotNames=new Map<string,FakeTransportSlot>();
  const permits=new WeakMap<FakePurposePermit,Purpose>(),permitNames=new Set<string>(),attempts=new WeakMap<FakeAttemptClaim,Attempt>();
  const purposeByName=new Map<string,Purpose>();
  const cleanups=new WeakMap<FakeCleanupEvidence,Cleanup>(),bodies=new WeakMap<FakeBodyReceipt,Body>(),resources=new WeakSet<object>();
  let current:Attempt|undefined,pendingBody:FakeBodyReceipt|undefined,dispatches=0,cleanupUnconfirmed=false;
  let detach=()=>{};
  function no(code:Code):Result<never>{return Object.freeze({ok:false,code:primary??code});}
  function abort(a:Attempt){if(a.aborted||!a.resource)return;a.aborted=true;try{a.resource.abort();}catch{a.abortFailed=true;}}
  function stop(code:Code,detail:Detail='run_stopped'){if(!primary){primary=code;primaryDetail=detail;}detach();if(pendingBody){const b=bodies.get(pendingBody);if(b)b.data=undefined;pendingBody=undefined;}if(current)abort(current);try{budget?.stop(primary);}catch{/* fixed reason */}return no(primary);}
  function budgetCode(error:unknown):Code{
    const code=error instanceof Error?error.message:'';
    return ['cancelled','closed','deadline_exceeded','authentication_failed','access_denied','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded','payload_limit','scope_evidence_limit','upstream_unavailable'].includes(code)?code as Code:'internal_review_error';
  }
  function now(allowStopped=false):number|null{
    let n:number;try{if(!allowStopped)budget?.check();n=allowStopped&&budget?budget.observationNow():clock.now();}catch(error){stop(budgetCode(error));return null;}
    if(!Number.isFinite(n)||n<last){stop('invalid_observation_time');return null;}last=n;
    if(n>=hard)stop('deadline_exceeded');
    return primary&&!allowStopped?null:n;
  }
  const cutoff=()=>hard-(phaseName==='normal'?facts.deadline_ms/6:facts.deadline_ms/12);
  function fail(code:Code):Result<never>{return stop(code);}
  function observe(a:Attempt):FakeIoObservation|null{
    if(a.dispatchRejected)return {fetch:'rejected',status:null,body:'none',pending_read:false,eof:false,closed:null,cancel:'not_requested'};
    try{const p=observationSchema.safeParse(structuredClone(a.resource!.snapshot()));if(p.success)return p.data;}catch{/* fixed failure */}
    return null;
  }
  function finish(a:Attempt,disposition:Cleanup['disposition'],kind:Cleanup['kind'],reason:string|null,outcome:Outcome){
    abort(a);const completed=now(true);
    if(a.abortFailed||completed===null||completed>=a.deadline){disposition='unconfirmed';kind=null;reason??=a.abortFailed?'abort_failed':'cleanup_deadline';outcome='stopped';}
    if(primary&&(outcome==='body'||outcome==='auth_only'))outcome='stopped';
    const evidence=opaque<FakeCleanupEvidence>();cleanups.set(evidence,Object.freeze({disposition,kind,reason,synthetic:true}));
    a.state='settled';a.p.state=outcome==='upstream_unavailable'&&a.ordinal===1&&disposition==='confirmed'&&!primary?'retryable':'done';
    if(current===a)current=undefined;
    if(disposition==='unconfirmed'){cleanupUnconfirmed=true;stop('internal_review_error','cleanup_unconfirmed');}
    try{budget?.settle({retryable:a.p.state==='retryable',outcome,cleanup:disposition});}catch{stop('internal_review_error');outcome='stopped';}
    if(primary||!['body','auth_only'].includes(outcome))lastFailure=Object.freeze({purpose:a.p.kind,code:primary??outcome,
      detail:primaryDetail??(disposition==='unconfirmed'?'cleanup_unconfirmed':outcome==='upstream_unavailable'?'upstream_unavailable':outcome==='invalid_response'?'invalid_json':'local_unavailable'),
      retryable:!primary&&a.p.state==='retryable',scope:primary?a.p.kind==='oauth'&&primary==='authentication_failed'?'authentication':'run':outcome==='upstream_unavailable'?'transport':a.p.kind==='release_rows'?'release':'local'});
    return {evidence,outcome};
  }
  function pending(){return ok(Object.freeze({state:'pending' as const}));}
  function projected<T>(value:T):Result<T>{return now()===null?no(primary!):ok(value);}
  if(budget){
    const revoked=()=>{try{budget.check();stop('closed');}catch(error){stop(budgetCode(error));}};
    detach=()=>budget.signal.removeEventListener('abort',revoked);
    budget.signal.addEventListener('abort',revoked,{once:true});if(budget.signal.aborted)revoked();
  }
  return {ok:true as const,value:Object.freeze({
    source,
    phase(){return phase;},
    slot(kind:'parent'|'metadata'|'table',target?:string):Result<FakeTransportSlot>{
      if(now()===null)return no(primary!);
      if(!['parent','metadata','table'].includes(kind)||kind==='table'&&(!target||!/^[a-z][a-z0-9_]{0,79}$/.test(target)||target==='global')||kind!=='table'&&target!==undefined)return fail('invalid_input');
      const key=`${kind}:${target??''}`,old=slotNames.get(key);if(old)return ok(old);
      if(slotNames.size>=10)return fail('invalid_state');const value=opaque<FakeTransportSlot>();slots.set(value,{kind,target});slotNames.set(key,value);return ok(value);
    },
    purpose(kind:FakeTransportPurpose,context:Readonly<{source:FakeTransportSource;phase:FakeTransportPhase;target?:string;slot?:FakeTransportSlot}>):Result<FakePurposePermit>{
      if(now()===null)return no(primary!);
      if(!purposes.includes(kind))return fail('invalid_input');
      if(context.source!==source||context.phase!==phase)return fail('evidence_binding_mismatch');
      const final=kind.endsWith('_final');if(final!==(phaseName==='final'))return fail('invalid_state');
      if(kind==='oauth'&&(facts.auth_mode==='per-user'||authReady)||kind!=='oauth'&&!authReady)return fail('authentication_failed');
      if(!['oauth','parent_initial','release_rows'].includes(kind)&&facts.release_match!=='matched')return fail('release_not_admitted');
      if(!['oauth','parent_initial'].includes(kind)&&!facts.parent_ready)return fail('invalid_state');
      if(['payload','table_initial','table_final'].includes(kind)&&!facts.selection_ready||kind.startsWith('table_')&&!facts.plan_ready)return fail('invalid_state');
      const target=context.target;
      if(kind.startsWith('table_')&&(!target||!/^[a-z][a-z0-9_]{0,79}$/.test(target)||target==='global')
        ||kind==='payload'&&(!target||!/^[a-f0-9]{32}$/.test(target))||!kind.startsWith('table_')&&kind!=='payload'&&target!==undefined)return fail('invalid_input');
      const s=context.slot?slots.get(context.slot):undefined,expected=kind==='parent_final'?'parent':kind==='metadata_final'?'metadata':'table';
      if(final&&(!s||s.kind!==expected||s.target!==target)||!final&&context.slot!==undefined)return fail('evidence_binding_mismatch');
      if(s?.skipped)return fail('invalid_state');
      const key=`${kind}:${target??''}`;if(permitNames.has(key)||permitNames.size>=210)return fail('invalid_state');permitNames.add(key);
      const value=opaque<FakePurposePermit>(),p:Purpose={kind,phase,target,slot:context.slot,attempts:0,state:'issued'};
      permits.set(value,p);purposeByName.set(key,p);return ok(value);
    },
    begin(permit:FakePurposePermit):Result<FakeAttemptClaim>{
      const t=now();if(t===null)return no(primary!);const p=permits.get(permit);
      if(!p||p.phase!==phase)return fail('evidence_binding_mismatch');
      if(current||pendingBody||!['issued','retryable'].includes(p.state)||p.attempts>=2)return fail('invalid_state');
      const deadline=Math.min(t+facts.request_timeout_ms,cutoff(),hard),reserve=Math.min(250,Math.floor((deadline-t)/4));
      // No time left in this phase: refuse to start (no dispatch, C or permit use) without stopping the run,
      // so the normal phase can still move to its final reservations.
      if(reserve<=0){p.startFailure='phase_deadline_exceeded';return Object.freeze({ok:false as const,code:'phase_deadline_exceeded' as const});}
      try{budget?.dispatch(p.kind,p.target,(p.attempts+1) as 1|2);}catch(error){const code=budgetCode(error);
        if(code==='request_budget_exceeded'||code==='scope_evidence_limit'){p.state='done';if(code==='request_budget_exceeded')p.startFailure=code;return no(code);}return fail(code);}
      p.attempts++;p.state='inflight';const claim=opaque<FakeAttemptClaim>(),a:Attempt={permit,p,ordinal:p.attempts as 1|2,deadline,ioDeadline:deadline-reserve,
        state:'io',dispatchRejected:false,cancelled:false,released:false,aborted:false,abortFailed:false,timedOut:false,received:0,sequence:0,empty:0,hash:createHash('sha256')};attempts.set(claim,a);current=a;dispatches++;
      let resource:FakeAttemptIo|undefined;
      try{resource=io.dispatch(Object.freeze({purpose:p.kind,target:p.target,ordinal:a.ordinal,synthetic:true}),
        Object.freeze({io_deadline:a.ioDeadline,deadline:a.deadline,response_cap:Math.min(p.kind.startsWith('table_')?16384:4194304,budget?.responseBytes??4194304),now:()=>budget?budget.observationNow():clock.now()}));}
      catch{a.dispatchRejected=true;}
      if(!a.dispatchRejected){
        let valid=false;
        try{valid=!!resource&&typeof resource==='object'&&!resources.has(resource)&&['snapshot','bodyText','cancel','releaseLock','abort'].every(k=>typeof resource![k as keyof FakeAttemptIo]==='function');}catch{/* unknown returned resource */}
        if(!valid){cleanupUnconfirmed=true;return fail('evidence_binding_mismatch');}
        resources.add(resource!);a.resource=resource;if(primary)abort(a);
      }
      if(now()===null){cleanupUnconfirmed=true;return no(primary!);}return ok(claim);
    },
    chunk(claim:FakeAttemptClaim,sequence:number,bytes:Uint8Array):Result<true>{
      const t=now();if(t===null)return no(primary!);const a=attempts.get(claim);
      if(!budget||!a||a!==current)return fail('evidence_binding_mismatch');
      if(a.state!=='io'||a.localFailure||sequence!==a.sequence||!(bytes instanceof Uint8Array))return fail('invalid_state');
      if(t>=a.ioDeadline){a.timedOut=true;a.state='cleanup';abort(a);return no('attempt_deadline_exceeded');}
      a.sequence++;a.received+=bytes.byteLength;
      try{budget.chunk(bytes.byteLength);}catch(error){const code=budgetCode(error);
        if(code==='scope_evidence_limit'||code==='payload_limit'){a.localFailure=code;return no(code);}return fail(code);}
      a.hash.update(bytes);
      if(bytes.byteLength===0)a.empty++;if(a.empty>16){a.localFailure='invalid_response';return no('invalid_response');}
      return ok(true);
    },
    poll(claim:FakeAttemptClaim){
      const a=attempts.get(claim);if(!a)return fail('evidence_binding_mismatch');
      if(a.state==='settled')return fail('invalid_state');
      if(a!==current)return fail('evidence_binding_mismatch');
      const t=now(true);if(t===null){const r=finish(a,'unconfirmed',null,'clock_invalid','stopped');return ok(Object.freeze({state:'settled' as const,cleanup:r.evidence,outcome:r.outcome,body:null}));}
      let s=observe(a);
      if(!s){const r=finish(a,'unconfirmed',null,'observation_invalid','stopped');return ok(Object.freeze({state:'settled' as const,cleanup:r.evidence,outcome:r.outcome,body:null}));}
      if(!a.cancelled&&s.cancel!=='not_requested'){const r=finish(a,'unconfirmed',null,'unowned_cancel','stopped');return ok(Object.freeze({state:'settled' as const,cleanup:r.evidence,outcome:r.outcome,body:null}));}
      if(a.p.kind==='oauth'&&s.status!==null&&(s.status<200||s.status>=300)&&s.status!==429&&s.status<500)stop('authentication_failed','oauth_http_error');
      else if(s.status===401||s.status===403&&a.p.kind!=='release_rows')stop(s.status===401?'authentication_failed':'access_denied',s.status===401?'http_unauthorized':'http_forbidden');
      const terminal=s.status!==null&&(s.status<200||s.status>=300)&&s.status!==429&&s.status<500;
      if(a.state==='io'){
        if(primary||t>=a.ioDeadline){a.timedOut=true;a.state='cleanup';abort(a);s=observe(a);}
        else if(a.localFailure)a.state='cleanup';
        else if(s.fetch==='rejected'||s.fetch==='fulfilled'&&(terminal||s.body==='none'||s.body==='unknown_lock'||s.eof||s.read_failed))a.state='cleanup';
        else return pending();
      }
      let reason:string|null=null,kind:Cleanup['kind']=null;
      if(t>=a.deadline)reason='cleanup_deadline';
      else if(!s)reason='observation_invalid';
      else if(s.body==='unknown_lock')reason='unowned_lock';
      else if(s.fetch==='rejected')kind='no_response';
      else if(s.fetch==='pending')return pending();
      else if(s.body==='none')kind='no_body';
      else{
        const natural=s.body==='reader'&&s.eof&&!s.read_failed&&!a.localFailure&&!a.timedOut&&!primary;
        if(!natural&&!a.cancelled){a.cancelled=true;try{a.resource!.cancel();}catch{reason='cancel_rejected';}s=observe(a);}
        if(!reason){
          if(!s)reason='observation_invalid';
          else if(a.cancelled&&s.cancel==='rejected')reason='cancel_rejected';
          else if(s.pending_read||s.body==='reader'&&s.closed==='pending'||a.cancelled&&s.cancel!=='fulfilled')return pending();
          else if(s.body==='reader'&&s.closed!=='fulfilled')reason='closed_unconfirmed';
          else{kind=natural?'eof':'cancelled';if(s.body==='reader'&&!a.released){a.released=true;try{a.resource!.releaseLock();}catch{reason='release_failed';}}}
        }
      }
      const end=now(true);if(end===null||end>=a.deadline)reason??='cleanup_deadline';
      if(reason){const r=finish(a,'unconfirmed',null,reason,'stopped');return ok(Object.freeze({state:'settled' as const,cleanup:r.evidence,outcome:r.outcome,body:null}));}
      let outcome:Outcome=primary?'stopped':a.localFailure==='invalid_response'?'invalid_response':a.localFailure?'scope_evidence_limit':a.timedOut||s?.read_failed||s?.fetch==='rejected'||s?.status===429||(s?.status??0)>=500?'upstream_unavailable'
        :s?.status===404?'not_found_or_not_visible':s?.status===403?'access_denied':terminal||kind!=='eof'?'invalid_response':'body';
      let data:unknown,bytes=0;
      if(outcome==='body')try{
        const text=a.resource!.bodyText(),cap=a.p.kind.startsWith('table_')?16384:4194304;
        if(typeof text!=='string'||text.length>cap||Buffer.byteLength(text)>cap)outcome=a.p.kind.startsWith('table_')?'scope_evidence_limit':'invalid_response';
        else{bytes=Buffer.byteLength(text);if(budget&&(bytes!==a.received||createHash('sha256').update(text).digest('hex')!==a.hash.digest('hex')))throw Error();data=JSON.parse(text);if(a.p.kind==='oauth'){
          const validated=validateFixtureOAuthResponse(data,facts.deadline_ms);data=undefined;
          if(validated.ok)outcome='auth_only';else{stop('authentication_failed',validated.detail);outcome='stopped';}
        }}
      }catch{outcome='invalid_response';}
      if(a.p.kind==='oauth'&&outcome==='invalid_response'){stop('authentication_failed','oauth_response_invalid');outcome='stopped';data=undefined;}
      const at=now();if(at===null||at>=a.deadline||at>=cutoff()){if(!primary)stop(at!==null&&at>=a.deadline?'attempt_deadline_exceeded':'phase_deadline_exceeded');outcome='stopped';data=undefined;}
      const r=finish(a,'confirmed',kind,null,outcome);let body:FakeBodyReceipt|null=null;
      if(r.outcome==='auth_only'&&!primary){
        try{budget?.authenticationReady?.();if(now()===null)throw Error();authReady=true;}catch{stop('authentication_failed','authentication_completion_failed');r.outcome='stopped';
          lastFailure=Object.freeze({purpose:'oauth',code:primary!,detail:primaryDetail!,retryable:false,scope:primary==='authentication_failed'?'authentication':'run'});}
      }
      if(r.outcome==='body'&&!primary){body=opaque<FakeBodyReceipt>();bodies.set(body,{permit:a.permit,data,bytes,used:false,status:s!.status!,observed:last});pendingBody=body;}
      return ok(Object.freeze({state:'settled' as const,cleanup:r.evidence,outcome:r.outcome,body}));
    },
    cleanupInfo(value:FakeCleanupEvidence){const c=cleanups.get(value);return c?ok(c):fail('evidence_binding_mismatch');},
    consumeBody(value:FakeBodyReceipt,permit:FakePurposePermit,discard=false){
      if(now()===null)return no(primary!);const b=bodies.get(value);
      if(!b||b.permit!==permit)return fail('evidence_binding_mismatch');if(b.used||pendingBody!==value)return fail('invalid_state');
      b.used=true;b.data=undefined;pendingBody=undefined;
      return ok(Object.freeze({state:discard?'discarded' as const:'simulated_body' as const,bytes:b.bytes,synthetic:true,evidence_issuance:'disabled' as const}));
    },
    /** Fixed source-only projections; no raw body getter or caller-supplied projector. Fixture authority only. */
    consumeSourceBody(value:FakeBodyReceipt,permit:FakePurposePermit,updateSet:string){
      if(now()===null)return no(primary!);const b=bodies.get(value),p=permits.get(permit);
      if(!b||b.permit!==permit||!p||p.phase!==phase)return fail('evidence_binding_mismatch');
      if(b.used||pendingBody!==value)return fail('invalid_state');
      const data=b.data;b.used=true;b.data=undefined;pendingBody=undefined;
      if(typeof updateSet!=='string'||!/^[a-f0-9]{32}$/.test(updateSet))return fail('invalid_input');
      const base={status:b.status,observed_ms:b.observed,synthetic:true as const,evidence_issuance:'disabled' as const};
      if(p.kind==='table_initial'||p.kind==='table_final'){
        // ISO here uses the fixture elapsed-clock epoch, not a claimed production wall clock.
        const observation=normalizeFixedTableValue(p.target!,p.kind==='table_initial'?'initial':'final',new Date(b.observed).toISOString(),data,b.status);
        if(observation==='binding_error')return fail('table_binding_mismatch');
        if(p.kind==='table_initial'&&observation.state==='unavailable'){
          if(!budget?.rejectInitialTable)return fail('internal_review_error');
          try{budget.rejectInitialTable(p.target!);}catch{return fail('internal_review_error');}
        }
        return projected(Object.freeze({...base,kind:'table' as const,observation}));
      }
      if(!['parent_initial','parent_final','metadata_initial','metadata_final'].includes(p.kind))return fail('invalid_state');
      const parent=p.kind.startsWith('parent_'),id=z.string().regex(/^[a-f0-9]{32}$/);
      const rawRows=data&&typeof data==='object'&&!Array.isArray(data)&&'result'in data?data.result:null;
      // Refuse oversize arrays before schema traversal; .max alone bounds output, not validation work.
      if(!Array.isArray(rawRows)||rawRows.length>(parent?2:101))return projected(Object.freeze({...base,kind:'baseline' as const,state:'unavailable' as const,reason:'invalid_observation' as const,rows:null}));
      const version={sys_id:id,sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)};
      const schema=parent?z.object(version):z.object({...version,update_set:z.literal(updateSet),name:z.string().min(1).max(256)});
      const envelope=z.object({result:z.array(schema).max(parent?2:101)}).safeParse(data);
      if(!envelope.success)return projected(Object.freeze({...base,kind:'baseline' as const,state:'unavailable' as const,reason:'invalid_observation' as const,rows:null}));
      const rows=envelope.data.result;
      if(parent?(rows.length!==1||rows[0].sys_id!==updateSet):rows.length>100||rows.some((r,i)=>i>0&&rows[i-1].sys_id>=r.sys_id)){
        return projected(Object.freeze({...base,kind:'baseline' as const,state:'unavailable' as const,reason:'incomplete_or_mismatched' as const,rows:null}));
      }
      return projected(Object.freeze({...base,kind:'baseline' as const,state:'rows' as const,reason:null,rows:Object.freeze(rows.map(r=>Object.freeze(r)))}));
    },
    checkpoint():Result<true>{return now()===null?no(primary!):ok(true);},
    /** Internal fixture handoff precondition, not a release/source evidence issuer. */
    handoffCheckpoint():Result<true>{
      const t=now();if(t===null)return no(primary!);
      if(t>=cutoff())return no('phase_deadline_exceeded');
      const oauth=purposeByName.get('oauth:');
      return phaseName==='normal'&&authReady&&!current&&!pendingBody&&!cleanupUnconfirmed
        &&permitNames.size===1&&oauth?.state==='done'?ok(true):no('invalid_state');
    },
    enterFinal():Result<FakeTransportPhase>{
      if(now()===null)return no(primary!);if(phaseName!=='normal'||current||pendingBody)return fail('invalid_state');
      try{budget?.enterFinal();}catch(error){return fail(budgetCode(error));}
      phaseName='final';phase=opaque<FakeTransportPhase>();return ok(phase);
    },
    skipFinal(slot:FakeTransportSlot,context:Readonly<{source:FakeTransportSource;phase:FakeTransportPhase;target:string}>):Result<PreparedFinalSkip>{
      if(now()===null)return no(primary!);const s=slots.get(slot);
      if(!budget||!s||s.kind!=='table'||s.target!==context.target||context.source!==source||context.phase!==phase)return fail('evidence_binding_mismatch');
      if(phaseName!=='final'||current||pendingBody||s.skipped)return fail('invalid_state');
      try{const result=budget.skipFinal(s.target!);s.skipped=true;
        const p=purposeByName.get(`table_final:${s.target}`);if(p)p.state='done';
        return ok(result);
      }catch(error){return fail(budgetCode(error));}
    },
    issueEvidence():Result<never>{return primary?no(primary):no('invalid_state');},
    /** Promote only the observed, cleaned-up two-attempt OAuth exhaustion, never a caller-supplied code. */
    finishOAuthFailure(permit:FakePurposePermit):Result<never>{
      if(now()===null)return no(primary!);const p=permits.get(permit);
      if(!p||p.kind!=='oauth'||p.phase!==phase)return fail('evidence_binding_mismatch');
      if(!authReady&&!current&&!pendingBody&&p.startFailure)return stop(p.startFailure);
      if(authReady||current||pendingBody||p.state!=='done'||p.attempts!==2||lastFailure?.purpose!=='oauth'||lastFailure.code!=='upstream_unavailable'||lastFailure.retryable)return fail('invalid_state');
      return stop('upstream_unavailable','upstream_unavailable');
    },
    diagnostics(){return Object.freeze({primary:primary??null,primary_detail:primaryDetail??null,last_failure:lastFailure,cleanup_unconfirmed:cleanupUnconfirmed,auth_ready:authReady&&!primary,evidence_issuance:'disabled' as const});},
    stop(code:'cancelled'|'closed'|'deadline_exceeded'){
      return ['cancelled','closed','deadline_exceeded'].includes(code)?stop(code):fail('invalid_input');
    },
    stats(){return Object.freeze({primary:primary??null,phase:phaseName,permits:permitNames.size,dispatches,cleanup_unconfirmed:cleanupUnconfirmed,
      body_pending:pendingBody!==undefined,evidence_issuance:'disabled' as const});},
  })};
}
