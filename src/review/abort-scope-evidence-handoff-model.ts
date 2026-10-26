/** OH-01 synthetic issuer ONLY. No actual session, transport, source, token, I/O or activation API. */
import {z} from 'zod';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type SyntheticHandoffSession=Handle<'session'>;
export type SyntheticHandoffRoot=Handle<'root'>;
export type SyntheticSourceDestination=Handle<'destination'>;
export type SyntheticTransportHandoff=Handle<'handoff'>;
export type SyntheticSourceLease=Handle<'lease'>;
type Code='invalid_input'|'invalid_state'|'evidence_binding_mismatch'|'authentication_failed'|'internal_review_error'
  |'cancelled'|'closed'|'deadline_exceeded'|'phase_deadline_exceeded'|'invalid_observation_time'|'upstream_unavailable';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
type State='bootstrap_owned'|'auth_ready'|'offered'|'adopting'|'source_owned'|'failed'|'closed';
const sessionSchema=z.strictObject({auth_mode:z.enum(['service-account','per-user']),deadline_ms:z.number().int().min(1).max(60000)});
const rootSchema=z.strictObject({update_set_sys_id:z.string().regex(/^[a-f0-9]{32}$/)});
const authSchema=z.strictObject({outcome:z.enum(['auth_only','authentication_failed','upstream_unavailable']),cleanup:z.enum(['confirmed','unconfirmed'])});
const settledSchema=z.strictObject({oauth_permit_done:z.boolean(),phase:z.enum(['normal','final']),active_io:z.boolean(),pending_body:z.boolean(),
  attempt_timers:z.number().int().min(0).max(1),retained_bytes:z.number().int().min(0).max(4194304),other_purposes:z.number().int().min(0).max(209),
  cleanup_unconfirmed:z.boolean()});
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const no=(code:Code):Result<never>=>Object.freeze({ok:false,code});
type IdentityKind='auth'|'adapter'|'budget'|'dispatcher'|'ready';

export function createSyntheticOAuthHandoffIssuer(clock:{now():number}){
  type Session={mode:'service-account'|'per-user';deadline:number;started:number;last:number;auth:object;ready?:object;live:boolean;
    runClaimed:boolean;transportClaimed:boolean;handoff:'none'|'offered'|'consuming'|'adopted'|'failed';reason?:Code;root?:Root};
  type Root={session:Session;state:State;reason?:Code;destination:SyntheticSourceDestination;updateSet:string;auth:object;ready?:object;
    adapter:object;budget:object;dispatcher:object;observed:{auth:object;adapter:object;budget:object;dispatcher:object};
    authStarted:boolean;settledStarted:boolean;settled?:z.infer<typeof settledSchema>;ticket?:SyntheticTransportHandoff;lease?:SyntheticSourceLease};
  type Ticket={root:Root;destination:SyntheticSourceDestination;ready:object;used:boolean};
  type Lease={root:Root;destination:SyntheticSourceDestination;ready:object};
  const sessions=new WeakMap<SyntheticHandoffSession,Session>(),roots=new WeakMap<SyntheticHandoffRoot,Root>();
  const tickets=new WeakMap<SyntheticTransportHandoff,Ticket>(),leases=new WeakMap<SyntheticSourceLease,Lease>();
  const destinations=new WeakMap<SyntheticSourceDestination,Root>();
  function fail(r:Root,reason:Code):Result<never>{
    r.reason??=r.session.reason??reason;r.session.reason??=r.reason;if(r.state!=='closed')r.state='failed';r.session.live=false;r.session.handoff='failed';
    r.session.ready=undefined;r.ready=undefined;r.settled=undefined;return no(r.reason);
  }
  function live(r:Root):Result<true>{
    if(r.reason)return no(r.reason);if(!r.session.live)return fail(r,r.session.reason??'closed');
    let now:number;try{now=clock.now();}catch{return fail(r,'internal_review_error');}
    // The fake clock may reenter cancellation; always check state after invoking it.
    if(r.reason||!r.session.live)return no(r.reason??r.session.reason??'closed');
    if(!Number.isFinite(now)||now<r.session.last)return fail(r,'invalid_observation_time');r.session.last=now;
    if(now-r.session.started>=r.session.deadline)return fail(r,'deadline_exceeded');
    return ok(true);
  }
  function binding(r:Root):Result<true>{
    const s=r.session;
    return s.root===r&&s.transportClaimed&&r.auth===s.auth&&r.auth===r.observed.auth
      &&r.adapter===r.observed.adapter&&r.budget===r.observed.budget&&r.dispatcher===r.observed.dispatcher
      &&r.ready!==undefined&&r.ready===s.ready?ok(true):fail(r,'evidence_binding_mismatch');
  }
  function idle(r:Root):Result<true>{
    const f=r.settled;if(!f||!f.oauth_permit_done||f.phase!=='normal'||f.active_io||f.pending_body||f.attempt_timers||f.retained_bytes||f.other_purposes||f.cleanup_unconfirmed)return fail(r,'invalid_state');
    if(r.session.last-r.session.started>=r.session.deadline*5/6)return fail(r,'phase_deadline_exceeded');return ok(true);
  }
  return Object.freeze({
    issueSession(raw:unknown):Result<SyntheticHandoffSession>{
      try{const p=sessionSchema.safeParse(structuredClone(raw));if(!p.success)return no('invalid_input');const now=clock.now();
        if(!Number.isFinite(now)||now<0)return no('invalid_observation_time');const h=opaque<SyntheticHandoffSession>();
        sessions.set(h,{mode:p.data.auth_mode,deadline:p.data.deadline_ms,started:now,last:now,auth:opaque<object>(),live:true,runClaimed:false,transportClaimed:false,handoff:'none'});return ok(h);
      }catch{return no('invalid_input');}
    },
    createRun(session:SyntheticHandoffSession,raw:unknown):Result<Readonly<{root:SyntheticHandoffRoot;destination:SyntheticSourceDestination}>>{
      const s=sessions.get(session);if(!s)return no('evidence_binding_mismatch');if(!s.live)return no(s.reason??'closed');if(s.runClaimed)return no('invalid_state');s.runClaimed=true;
      try{
        const p=rootSchema.safeParse(structuredClone(raw));if(!p.success){s.reason='invalid_input';s.live=false;s.handoff='failed';return no(s.reason);}
        if(s.mode!=='service-account'){s.reason='authentication_failed';s.live=false;s.handoff='failed';return no(s.reason);}
        const destination=opaque<SyntheticSourceDestination>(),auth=s.auth,adapter=opaque<object>(),budget=opaque<object>(),dispatcher=opaque<object>();
        const r:Root={session:s,state:'bootstrap_owned',destination,updateSet:p.data.update_set_sys_id,auth,adapter,budget,dispatcher,
          observed:{auth,adapter,budget,dispatcher},authStarted:false,settledStarted:false};
        s.root=r;s.transportClaimed=true;const h=opaque<SyntheticHandoffRoot>();roots.set(h,r);destinations.set(destination,r);
        const checked=live(r);return checked.ok?ok(Object.freeze({root:h,destination})):checked;
      }catch{s.reason??='internal_review_error';s.live=false;s.handoff='failed';return no(s.reason);}
    },
    /** Synthetic OAuth outcome only; cannot accept a Response, token or summary from a real run. */
    completeOAuth(root:SyntheticHandoffRoot,raw:unknown):Result<true>{
      const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');const active=live(r);if(!active.ok)return active;
      if(r.state!=='bootstrap_owned')return no('invalid_state');if(r.authStarted)return fail(r,'invalid_state');r.authStarted=true;
      try{
        const p=authSchema.safeParse(structuredClone(raw));if(!p.success)return fail(r,'invalid_input');
        const checked=live(r);if(!checked.ok)return checked;
        if(p.data.outcome!=='auth_only')return fail(r,p.data.outcome);
        if(p.data.cleanup!=='confirmed')return fail(r,'internal_review_error');
        r.session.ready=opaque<object>();r.ready=r.session.ready;r.state='auth_ready';return ok(true);
      }catch{return fail(r,'internal_review_error');}
    },
    /** Distinct from auth-ready: models the adapter's finally completion, once. */
    settleBootstrap(root:SyntheticHandoffRoot,raw:unknown):Result<true>{
      const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');const active=live(r);if(!active.ok)return active;
      if(['offered','adopting','source_owned'].includes(r.state))return no('invalid_state');
      if(r.state!=='auth_ready'||r.settledStarted)return fail(r,'invalid_state');r.settledStarted=true;
      try{const p=settledSchema.safeParse(structuredClone(raw));if(!p.success)return fail(r,'invalid_input');
        const checked=live(r);if(!checked.ok)return checked;r.settled=Object.freeze(p.data);return ok(true);
      }catch{return fail(r,'internal_review_error');}
    },
    offer(root:SyntheticHandoffRoot):Result<SyntheticTransportHandoff>{
      const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');const active=live(r);if(!active.ok)return active;
      // Duplicate/stale phase calls cannot poison a successfully transferred lease.
      if(r.state==='source_owned'||r.state==='offered')return no('invalid_state');
      if(r.state!=='auth_ready'||r.session.handoff!=='none')return fail(r,'invalid_state');
      const bound=binding(r);if(!bound.ok)return bound;const settled=idle(r);if(!settled.ok)return settled;
      r.session.handoff='offered';const checked=live(r);if(!checked.ok)return checked;
      const finalBinding=binding(r);if(!finalBinding.ok)return finalBinding;const finalIdle=idle(r);if(!finalIdle.ok)return finalIdle;
      const h=opaque<SyntheticTransportHandoff>();tickets.set(h,{root:r,destination:r.destination,ready:r.ready!,used:false});r.ticket=h;r.state='offered';return ok(h);
    },
    adopt(root:SyntheticHandoffRoot,ticket:SyntheticTransportHandoff,destination:SyntheticSourceDestination):Result<SyntheticSourceLease>{
      const r=roots.get(root),t=tickets.get(ticket);if(!r||!t||t.root!==r)return no('evidence_binding_mismatch');
      if(r.reason)return no(r.reason);
      if(t.used||r.state==='source_owned')return no('invalid_state');
      const active=live(r);if(!active.ok)return active;
      if(r.state!=='offered'||r.session.handoff!=='offered'||r.ticket!==ticket)return fail(r,'invalid_state');
      t.used=true;r.session.handoff='consuming';r.state='adopting';
      if(destination!==t.destination||destinations.get(destination)!==r||t.ready!==r.ready)return fail(r,'evidence_binding_mismatch');
      const bound=binding(r);if(!bound.ok)return bound;const settled=idle(r);if(!settled.ok)return settled;
      const checked=live(r);if(!checked.ok)return checked;const again=idle(r);if(!again.ok)return again;
      const finalBinding=binding(r);if(!finalBinding.ok)return finalBinding;
      const h=opaque<SyntheticSourceLease>();leases.set(h,{root:r,destination,ready:r.ready!});r.lease=h;r.state='source_owned';r.session.handoff='adopted';return ok(h);
    },
    checkLease(root:SyntheticHandoffRoot,lease:SyntheticSourceLease):Result<true>{
      const r=roots.get(root),l=leases.get(lease);if(!r||!l||l.root!==r)return no('evidence_binding_mismatch');const active=live(r);if(!active.ok)return active;
      const bound=binding(r);if(!bound.ok)return bound;
      return r.state==='source_owned'&&r.session.handoff==='adopted'&&r.lease===lease&&l.ready===r.ready&&l.destination===r.destination?ok(true):fail(r,'evidence_binding_mismatch');
    },
    closeBootstrap(root:SyntheticHandoffRoot):Result<true>{
      const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');if(r.state!=='bootstrap_owned')return no(r.reason??'invalid_state');return fail(r,'closed');
    },
    cancel(root:SyntheticHandoffRoot){const r=roots.get(root);return r?fail(r,'cancelled'):no('evidence_binding_mismatch');},
    close(root:SyntheticHandoffRoot){const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');const result=fail(r,'closed');r.state='closed';return result;},
    revokeSession(session:SyntheticHandoffSession,reason:'closed'|'cancelled'|'authentication_failed'|'upstream_unavailable'){
      const s=sessions.get(session);if(!s)return no('evidence_binding_mismatch');
      const fixed:Code=['closed','cancelled','authentication_failed','upstream_unavailable'].includes(reason)?reason:'internal_review_error';
      if(s.root)return fail(s.root,fixed);s.reason??=fixed;s.live=false;s.handoff='failed';return no(s.reason);
    },
    /** Adversarial fixture input only. Not connected to any actual identity or live-session registry. */
    simulateIdentityChange(root:SyntheticHandoffRoot,kind:IdentityKind):Result<true>{
      const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');if(!['auth','adapter','budget','dispatcher','ready'].includes(kind))return fail(r,'invalid_input');
      const active=live(r);if(!active.ok)return active;
      if(kind==='ready')r.session.ready=opaque<object>();else r.observed[kind]=opaque<object>();return ok(true);
    },
    status(root:SyntheticHandoffRoot){
      const r=roots.get(root);if(!r)return no('evidence_binding_mismatch');live(r);
      return ok(Object.freeze({state:r.state,primary:r.reason??null,session_handoff:r.session.handoff,transport_claimed:r.session.transportClaimed,
        synthetic:true,evidence_issuance:'disabled' as const}));
    },
  });
}
