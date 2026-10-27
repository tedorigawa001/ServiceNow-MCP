/** Synthetic realm only. No real session registry, I/O, timers, worker, credentials or evidence issuance. */
import {z} from 'zod';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type SyntheticRunSession=Handle<'run_session'>;
export type SyntheticDiagnosticSlot=Handle<'diagnostic_slot'>;
export type SyntheticRunOwner=Handle<'run_owner'>;
export type SyntheticRunSource=Handle<'run_source'>;
export type SyntheticReleasePermit=Handle<'release_permit'>;
export type SyntheticReadonlyBinding=Handle<'readonly_binding'>;
const codeSchema=z.enum(['invalid_input','invalid_state','evidence_binding_mismatch','release_not_admitted','authentication_failed',
  'access_denied','config_invalid','review_busy','upstream_unavailable','cancelled','closed','deadline_exceeded',
  'phase_deadline_exceeded','invalid_observation_time','internal_review_error']);
type Code=z.infer<typeof codeSchema>;
type Stage='input'|'run_claim'|'authentication'|'release'|'source_claim'|'binding'|'owner'|'cleanup';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
type Cleanup='not_started'|'confirmed'|'unconfirmed';
type Claim='unclaimed'|'consuming'|'claimed'|'failed';
type Slot={state:'pending'|'attached'|'rejected'|'stopped'|'closed';primary:Readonly<{stage:Stage;code:Code}>|null;http:Cleanup;worker:Cleanup};
type Session={live:boolean;reason?:Code;started:number;last:number;deadline:number;mode:'service-account'|'per-user';
  auth:object;snapshot:object;budget:object;ready?:object;runClaim:Claim;sourceClaim:Claim;run?:Run};
type Run={session:Session;slot:Slot;state:'created'|'release_pending'|'release_resolved'|'prepared_only'|'stopped'|'closed';
  source:SyntheticRunSource;updateSet:string;auth:object;snapshot:object;budget:object;ready?:object;authStarted:boolean;releaseStarted:boolean};
const limitationSchema=z.enum(['release_visible_nodes_only','release_operator_asserted','release_not_observed','release_config_may_be_stale']);
const releaseSchema=z.strictObject({parent_ready:z.boolean(),release_match:z.enum(['matched','unknown','mismatched']),
  source:z.enum(['observed','operator_config','none']),family:z.enum(['Australia','Zurich']).nullable(),limitations:z.array(limitationSchema).max(4)}).refine(v=>
  new Set(v.limitations).size===v.limitations.length&&(v.release_match!=='matched'||v.family==='Australia'&&v.source!=='none')
  &&(v.source!=='operator_config'||['release_operator_asserted','release_not_observed','release_config_may_be_stale'].every(x=>v.limitations.includes(x as z.infer<typeof limitationSchema>))));
type Release=Readonly<Omit<z.infer<typeof releaseSchema>,'limitations'>&{limitations:readonly z.infer<typeof limitationSchema>[]}>;
type Source={run:Run;generation:object;parentReady:boolean;release?:Release;permit?:SyntheticReleasePermit;claim:Claim};
type Binding={run:Run;source:Source;generation:object;ready:object;budget:object;release:Release;permit:SyntheticReleasePermit};
const sessionSchema=z.strictObject({auth_mode:z.enum(['service-account','per-user']),deadline_ms:z.number().int().min(1).max(60000)});
const runSchema=z.strictObject({update_set_sys_id:z.string().regex(/^[a-f0-9]{32}$/)});
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const no=(code:Code):Result<never>=>Object.freeze({ok:false,code});
const fixed=(raw:unknown):Code=>{const p=codeSchema.safeParse(raw);return p.success?p.data:'internal_review_error';};

export function createSyntheticRunOwnerIssuer(clock:{now():number}){
  const sessions=new WeakMap<SyntheticRunSession,Session>(),slots=new WeakMap<SyntheticDiagnosticSlot,Slot>(),runs=new WeakMap<SyntheticRunOwner,Run>();
  const sources=new WeakMap<SyntheticRunSource,Source>(),bindings=new WeakMap<SyntheticReadonlyBinding,Binding>();
  const primaryOf=(r:Run):Slot['primary']=>r.slot.primary;
  function reject(slot:Slot,stage:Stage,code:Code):Result<never>{slot.primary??=Object.freeze({stage,code});slot.state='rejected';return no(slot.primary.code);}
  function stop(r:Run,stage:Stage,code:Code):Result<never>{
    r.slot.primary??=Object.freeze({stage,code:r.session.reason??code});r.session.reason??=r.slot.primary.code;r.session.live=false;
    if(r.state!=='closed')r.state='stopped';if(r.slot.state!=='closed')r.slot.state='stopped';
    if(r.session.runClaim==='consuming')r.session.runClaim='failed';if(r.session.sourceClaim==='consuming')r.session.sourceClaim='failed';
    const source=sources.get(r.source);if(source?.claim==='consuming')source.claim='failed';
    r.session.ready=undefined;return no(r.slot.primary.code);
  }
  function live(r:Run):Result<true>{
    if(r.slot.primary)return no(r.slot.primary.code);if(!r.session.live)return stop(r,'owner',r.session.reason??'closed');
    let now:number;try{now=clock.now();}catch{return stop(r,'owner','internal_review_error');}
    const afterClock=primaryOf(r);if(afterClock||!r.session.live)return no(afterClock?.code??r.session.reason??'closed');
    if(!Number.isFinite(now)||now<r.session.last)return stop(r,'owner','invalid_observation_time');r.session.last=now;
    if(now-r.session.started>=r.session.deadline)return stop(r,'owner','deadline_exceeded');return ok(true);
  }
  function identities(r:Run,ready=false):Result<true>{
    const s=r.session;return s.run===r&&s.auth===r.auth&&s.snapshot===r.snapshot&&s.budget===r.budget
      &&(!ready||r.ready!==undefined&&r.ready===s.ready)?ok(true):stop(r,'binding','evidence_binding_mismatch');
  }
  function checkBinding(run:SyntheticRunOwner,binding:SyntheticReadonlyBinding){
    const r=runs.get(run),b=bindings.get(binding);if(!r||!b||b.run!==r)return no('evidence_binding_mismatch');
    const valid=()=>r.state==='prepared_only'&&r.session.sourceClaim==='claimed'&&b.source===sources.get(r.source)
      &&b.source.claim==='claimed'&&b.source.generation===b.generation&&b.source.permit===b.permit&&b.source.release===b.release
      &&b.ready===r.ready&&b.budget===r.budget;
    for(let i=0;i<2;i++){const checked=live(r);if(!checked.ok)return checked;const bound=identities(r,true);if(!bound.ok)return bound;
      if(!valid())return stop(r,'binding','evidence_binding_mismatch');}
    return ok(Object.freeze({state:'prepared_only' as const,release:Object.freeze({source:b.release.source,family:b.release.family,limitations:b.release.limitations}),
      synthetic:true,evidence_issuance:'disabled' as const}));
  }
  return Object.freeze({
    allocateDiagnostic():SyntheticDiagnosticSlot{const h=opaque<SyntheticDiagnosticSlot>();slots.set(h,{state:'pending',primary:null,http:'not_started',worker:'not_started'});return h;},
    issueSession(raw:unknown):Result<SyntheticRunSession>{
      try{const p=sessionSchema.safeParse(structuredClone(raw));if(!p.success)return no('invalid_input');const now=clock.now();
        if(!Number.isFinite(now)||now<0)return no('invalid_observation_time');const h=opaque<SyntheticRunSession>();
        sessions.set(h,{live:true,started:now,last:now,deadline:p.data.deadline_ms,mode:p.data.auth_mode,auth:opaque<object>(),snapshot:opaque<object>(),budget:opaque<object>(),runClaim:'unclaimed',sourceClaim:'unclaimed'});return ok(h);
      }catch{return no('invalid_input');}
    },
    createRun(slot:SyntheticDiagnosticSlot,session:SyntheticRunSession,raw:unknown):Result<Readonly<{run:SyntheticRunOwner;source:SyntheticRunSource}>>{
      const d=slots.get(slot);if(!d)return no('evidence_binding_mismatch');if(d.state!=='pending')return no(d.primary?.code??'invalid_state');
      const s=sessions.get(session);if(!s)return reject(d,'run_claim','evidence_binding_mismatch');
      if(!s.live)return reject(d,'run_claim',s.reason??'closed');if(s.runClaim!=='unclaimed')return reject(d,'run_claim','invalid_state');
      s.runClaim='consuming';d.state='attached';
      const source=opaque<SyntheticRunSource>(),h=opaque<SyntheticRunOwner>();
      const r:Run={session:s,slot:d,state:'created',source,updateSet:'',auth:s.auth,snapshot:s.snapshot,budget:s.budget,authStarted:false,releaseStarted:false};s.run=r;runs.set(h,r);
      sources.set(source,{run:r,generation:opaque<object>(),parentReady:false,claim:'unclaimed'});
      try{const p=runSchema.safeParse(structuredClone(raw));if(!p.success)return stop(r,'run_claim','invalid_input');r.updateSet=p.data.update_set_sys_id;
        const checked=live(r);if(!checked.ok)return checked;const bound=identities(r);if(!bound.ok)return bound;
        s.runClaim='claimed';return ok(Object.freeze({run:h,source}));
      }catch{return stop(r,'run_claim','internal_review_error');}
    },
    completeAuthentication(run:SyntheticRunOwner,outcome:unknown):Result<true>{
      const r=runs.get(run);if(!r)return no('evidence_binding_mismatch');const checked=live(r);if(!checked.ok)return checked;
      if(r.authStarted||r.state!=='created')return no('invalid_state');r.authStarted=true;
      if(outcome!=='ready')return stop(r,'authentication',outcome==='authentication_failed'?'authentication_failed':'invalid_input');
      const bound=identities(r);if(!bound.ok)return bound;r.ready=opaque<object>();r.session.ready=r.ready;r.state='release_pending';return ok(true);
    },
    completeRelease(run:SyntheticRunOwner,raw:unknown):Result<Readonly<{permit:SyntheticReleasePermit|null;synthetic:true}>>{
      const r=runs.get(run);if(!r)return no('evidence_binding_mismatch');const checked=live(r);if(!checked.ok)return checked;
      if(r.releaseStarted||r.state!=='release_pending')return no('invalid_state');r.releaseStarted=true;
      try{const p=releaseSchema.safeParse(structuredClone(raw));if(!p.success)return stop(r,'release','invalid_input');
        const final=live(r);if(!final.ok)return final;const bound=identities(r,true);if(!bound.ok)return bound;
        const x=sources.get(r.source)!;x.release=Object.freeze({...p.data,limitations:Object.freeze([...p.data.limitations])});x.parentReady=p.data.parent_ready;
        if(p.data.release_match==='matched')x.permit=opaque<SyntheticReleasePermit>();r.state='release_resolved';return ok(Object.freeze({permit:x.permit??null,synthetic:true}));
      }catch{return stop(r,'release','internal_review_error');}
    },
    bindSource(run:SyntheticRunOwner,source:SyntheticRunSource,permit:SyntheticReleasePermit|null):Result<SyntheticReadonlyBinding>{
      const r=runs.get(run);if(!r)return no('evidence_binding_mismatch');const checked=live(r);if(!checked.ok)return checked;
      if(r.session.sourceClaim!=='unclaimed')return no('invalid_state');
      const x=sources.get(source);if(!x||x.run!==r||source!==r.source)return stop(r,'source_claim','evidence_binding_mismatch');
      if(r.state!=='release_resolved')return stop(r,'source_claim','invalid_state');
      if(x.release?.release_match!=='matched')return stop(r,'source_claim','release_not_admitted');
      r.session.sourceClaim='consuming';x.claim='consuming';
      if(!x.parentReady)return stop(r,'source_claim','invalid_state');
      if(!permit||x.permit!==permit)return stop(r,'source_claim','evidence_binding_mismatch');
      const bound=identities(r,true);if(!bound.ok)return bound;const final=live(r);if(!final.ok)return final;const again=identities(r,true);if(!again.ok)return again;
      const h=opaque<SyntheticReadonlyBinding>();bindings.set(h,{run:r,source:x,generation:x.generation,ready:r.ready!,budget:r.budget,release:x.release,permit});
      r.session.sourceClaim='claimed';x.claim='claimed';r.state='prepared_only';return ok(h);
    },
    checkBinding,
    refuseEvidence(run:SyntheticRunOwner,binding:SyntheticReadonlyBinding):Result<never>{const checked=checkBinding(run,binding);return checked.ok?no('invalid_state'):checked;},
    /** Synthetic cleanup observations only, not completion evidence from a resource or OS. */
    observeCleanup(run:SyntheticRunOwner,axis:unknown,disposition:unknown):Result<true>{
      const r=runs.get(run);if(!r)return no('evidence_binding_mismatch');
      if((axis!=='http'&&axis!=='worker')||(disposition!=='confirmed'&&disposition!=='unconfirmed'))return stop(r,'cleanup','invalid_input');
      if(disposition==='unconfirmed'||r.slot[axis]==='unconfirmed'){r.slot[axis]='unconfirmed';return stop(r,'cleanup','internal_review_error');}
      if(r.slot[axis]==='confirmed')return ok(true); // Idempotent observation of an already recorded terminal fact.
      // Observation-only clock remains usable after logical stop; it grants no active capability.
      let now:number;try{now=clock.now();}catch{r.slot[axis]='unconfirmed';return stop(r,'cleanup','internal_review_error');}
      if(!Number.isFinite(now)||now<r.session.last){r.slot[axis]='unconfirmed';return stop(r,'cleanup','invalid_observation_time');}
      r.session.last=now;if(now-r.session.started>=r.session.deadline){r.slot[axis]='unconfirmed';return stop(r,'cleanup','deadline_exceeded');}
      r.slot[axis]='confirmed';return ok(true);
    },
    /** Adversarial synthetic premise only; cannot mutate/read an actual session or transport. */
    replaceSyntheticIdentity(session:SyntheticRunSession,kind:unknown):Result<true>{
      const s=sessions.get(session);if(!s)return no('evidence_binding_mismatch');const r=s.run;if(!r)return no('invalid_state');
      const checked=live(r);if(!checked.ok)return checked;
      const x=sources.get(r.source)!;
      if(kind==='auth'||kind==='snapshot'||kind==='budget')s[kind]=opaque<object>();
      else if(kind==='ready'&&s.ready)s.ready=opaque<object>();
      else if(kind==='source_generation')x.generation=opaque<object>();
      else if(kind==='permit'&&x.permit)x.permit=opaque<SyntheticReleasePermit>();
      else if(kind==='release_snapshot'&&x.release)x.release=Object.freeze({...x.release,limitations:Object.freeze([...x.release.limitations])});
      else return stop(r,'binding','invalid_input');
      return ok(true);
    },
    rejectBeforeRun(slot:SyntheticDiagnosticSlot,raw:unknown){const d=slots.get(slot);if(!d)return no('evidence_binding_mismatch');
      return d.state==='pending'?reject(d,'input',fixed(raw)):no(d.primary?.code??'invalid_state');},
    diagnostic(slot:SyntheticDiagnosticSlot){const d=slots.get(slot);return d?ok(Object.freeze({state:d.state,primary:d.primary,
      cleanup:Object.freeze({http:d.http,worker:d.worker}),synthetic:true,evidence_issuance:'disabled' as const})):no('evidence_binding_mismatch');},
    inspectRun(run:SyntheticRunOwner){const r=runs.get(run);if(!r)return no('evidence_binding_mismatch');live(r);
      return ok(Object.freeze({state:r.state,run_claim:r.session.runClaim,source_claim:r.session.sourceClaim,synthetic:true,evidence_issuance:'disabled' as const}));},
    cancel(run:SyntheticRunOwner){const r=runs.get(run);return r?stop(r,'owner','cancelled'):no('evidence_binding_mismatch');},
    close(run:SyntheticRunOwner){const r=runs.get(run);if(!r)return no('evidence_binding_mismatch');const result=stop(r,'owner','closed');r.state='closed';r.slot.state='closed';return result;},
    revokeSession(session:SyntheticRunSession,raw:unknown){const s=sessions.get(session);if(!s)return no('evidence_binding_mismatch');
      if(s.run)return stop(s.run,'owner',fixed(raw));s.reason??=fixed(raw);s.live=false;return no(s.reason);},
  });
}
