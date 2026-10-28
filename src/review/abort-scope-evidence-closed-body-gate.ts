/** Closed body boundary, fake constructor only. Optional synthetic accounting, never a real registry/I/O/receipt issuer. */
import {z} from 'zod';
import {closedAccountingSchema,createClosedReadState} from './abort-scope-evidence-closed-read-state.js';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type FakeClosedSession=Handle<'closed_session'>;
export type FakeClosedRun=Handle<'closed_run'>;
export type FakeClosedTransport=Handle<'closed_transport_identity'>;
type Claim='unclaimed'|'consuming'|'claimed'|'failed';
type State='empty'|'constructing'|'created'|'run_bound'|'transport_bound'|'stopped'|'closed';
type Stage='input'|'construct'|'run_claim'|'transport_claim'|'binding'|'gate'|'owner'|'accounting';
const codeSchema=z.enum(['invalid_input','invalid_state','evidence_binding_mismatch','invalid_observation_time','deadline_exceeded','cancelled','closed','internal_review_error','issuance_disabled','request_budget_exceeded','receive_budget_exceeded','payload_budget_exceeded','payload_limit','scope_evidence_limit','phase_deadline_exceeded','upstream_unavailable','cleanup_unconfirmed']);
type Code=z.infer<typeof codeSchema>;
type Diagnostic=Readonly<{stage:Stage;code:Code}>;
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
type ClosedGate=Readonly<{body_gate:'closed';evidence_issuance:'disabled';synthetic:true}>;
const configSchema=z.strictObject({lane:z.enum(['typed','legacy']).default('typed'),deadline_ms:z.number().int().min(1).max(60000).default(60000),accounting:closedAccountingSchema.optional()});
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const closedGate:ClosedGate=Object.freeze({body_gate:'closed',evidence_issuance:'disabled',synthetic:true});

/** One finite fake session per harness. Constructor continuations are never returned or caller supplied. */
export function createFakeClosedBodyGate(clock:{now():number},fakeIo:{dispatch():void}={dispatch(){}}){
  type Identities={snapshot:object;auth:object;budget:object;generation:object};
  type Session={key:FakeClosedSession;identities:Identities;lane:'typed'|'legacy';start:number;last:number;hard:number;continueRun:()=>FakeClosedRun;
    readState?:ReturnType<typeof createClosedReadState>;accountingRun?:FakeClosedRun;accountingTransport?:FakeClosedTransport};
  type Run={session:Session;identities:Identities;continueTransport:()=>FakeClosedTransport};
  type Transport={run:Run;session:Session;identities:Identities};
  const sessions=new WeakMap<FakeClosedSession,Session>(),runs=new WeakMap<FakeClosedRun,Run>(),transports=new WeakMap<FakeClosedTransport,Transport>();
  let context:Session|undefined,state:State='empty',primary:Diagnostic|null=null,refusal:Diagnostic|null=null,busy=false;
  const claims:{constructor:Claim;run:Claim;transport:Claim;accounting:Claim}={constructor:'unclaimed',run:'unclaimed',transport:'unclaimed',accounting:'unclaimed'};
  const no=(code:Code):Result<never>=>Object.freeze({ok:false,code:primary?.code??code});
  const closed=()=>state==='closed';
  function reject(stage:Stage,code:Code){if(!closed())refusal??=Object.freeze({stage,code});return no(code);}
  function stop(stage:Stage,code:Code){
    if(closed())return no('closed');primary??=Object.freeze({stage,code});state='stopped';
    context?.readState?.revoke();
    for(const k of ['constructor','run','transport','accounting'] as const)if(claims[k]==='consuming')claims[k]='failed';
    return no(code);
  }
  function now(stage:Stage):Result<number>{
    let n:number;try{n=clock.now();}catch{return stop(stage,'internal_review_error');}
    if(primary||closed())return no('closed');
    if(!Number.isFinite(n)||n<0||context&&n<context.last)return stop(stage,'invalid_observation_time');
    if(context){context.last=n;if(n>=context.hard)return stop(stage,'deadline_exceeded');}return ok(n);
  }
  function use<T>(stage:Stage,work:()=>Result<T>):Result<T>{
    if(primary||closed())return no('closed');if(busy)return stop(stage,'invalid_state');busy=true;
    try{return work();}catch{return stop(stage,'internal_review_error');}finally{busy=false;}
  }
  function same(a:Identities,b:Identities){return a===b&&a.snapshot===b.snapshot&&a.auth===b.auth&&a.budget===b.budget&&a.generation===b.generation;}
  function privateConstructor(config:z.infer<typeof configSchema>,start:number):FakeClosedSession{
    const key=opaque<FakeClosedSession>(),identities=Object.freeze({snapshot:opaque<object>(),auth:opaque<object>(),budget:opaque<object>(),generation:opaque<object>()});
    const s:Session={key,identities,lane:config.lane,start,last:start,hard:start+config.deadline_ms,continueRun(){
      const handle=opaque<FakeClosedRun>();
      const run:Run={session:s,identities,continueTransport(){const t=opaque<FakeClosedTransport>();transports.set(t,{run,session:s,identities});return t;}};
      runs.set(handle,run);return handle;
    }};
    if(config.accounting)s.readState=createClosedReadState(config.accounting,{
      guard:body=>use('accounting',()=>{
        const b=binding(key,s.accountingRun!,s.accountingTransport!);if(!b.ok)return b;
        const result=body();return primary||closed()?no('closed'):result;
      }),checkpoint:()=>now('accounting'),stop:code=>stop('accounting',code),refuse:code=>reject('accounting',code),dispatch:()=>fakeIo.dispatch(),
      normalDeadline:s.hard-Math.min(10000,config.deadline_ms/6),finalDeadline:s.hard-Math.min(10000,config.deadline_ms/6)/2,
    });
    context=s;sessions.set(key,s);return key;
  }
  function binding(session:FakeClosedSession,run:FakeClosedRun,transport:FakeClosedTransport):Result<true>{
    const s=sessions.get(session);if(!s)return reject('binding','evidence_binding_mismatch');
    // Same order as TC-01 active()/bounded-read check(): an expired own owner reports the deadline before any mixed handle.
    const cp=now('binding');if(!cp.ok)return cp;
    const r=runs.get(run),t=transports.get(transport);
    if(s!==context||!r||!t||r.session!==s||t.run!==r||t.session!==s||!same(s.identities,r.identities)||!same(s.identities,t.identities))return stop('binding','evidence_binding_mismatch');
    return claims.run==='claimed'&&claims.transport==='claimed'?ok(true):stop('binding','invalid_state');
  }
  return Object.freeze({
    construct(raw:unknown={}):Result<FakeClosedSession>{
      if(claims.constructor==='claimed')return reject('construct','invalid_state');
      if(claims.constructor==='consuming')return stop('construct','invalid_state');
      return use('construct',()=>{
        if(claims.constructor!=='unclaimed')return no('invalid_state');claims.constructor='consuming';state='constructing';
        let config:z.infer<typeof configSchema>;
        try{config=configSchema.parse(structuredClone(raw));}catch{return stop('input','invalid_input');}
        if(primary)return no('closed');const n=now('construct');if(!n.ok)return n;
        if(!Number.isFinite(n.value+config.deadline_ms)||n.value+config.deadline_ms<=n.value)return stop('construct','invalid_observation_time');
        const key=privateConstructor(config,n.value);claims.constructor='claimed';state='created';return ok(key);
      });
    },
    claimRun(session:FakeClosedSession):Result<FakeClosedRun>{
      const s=sessions.get(session);if(!s)return reject('run_claim','evidence_binding_mismatch');
      if(claims.run==='claimed')return reject('run_claim','invalid_state');
      if(claims.run==='consuming')return stop('run_claim','invalid_state');
      return use('run_claim',()=>{
        if(claims.run!=='unclaimed')return no('invalid_state');claims.run='consuming';
        const cp=now('run_claim');if(!cp.ok)return cp;if(s!==context)return stop('run_claim','evidence_binding_mismatch');
        const run=s.continueRun();claims.run='claimed';state='run_bound';return ok(run);
      });
    },
    claimTransport(session:FakeClosedSession,run:FakeClosedRun):Result<FakeClosedTransport>{
      const s=sessions.get(session);if(!s)return reject('transport_claim','evidence_binding_mismatch');
      const r=runs.get(run);if(!r||r.session!==s){const cp=use('transport_claim',()=>now('transport_claim'));return cp.ok?stop('transport_claim','evidence_binding_mismatch'):cp;}
      if(claims.transport==='claimed')return reject('transport_claim','invalid_state');
      if(claims.transport==='consuming')return stop('transport_claim','invalid_state');
      return use('transport_claim',()=>{
        if(claims.transport!=='unclaimed')return no('invalid_state');claims.transport='consuming';
        const cp=now('transport_claim');if(!cp.ok)return cp;
        if(s!==context||s.lane!=='typed'||!same(s.identities,r.identities))return stop('transport_claim','evidence_binding_mismatch');
        const t=r.continueTransport();claims.transport='claimed';state='transport_bound';return ok(t);
      });
    },
    checkBinding(session:FakeClosedSession,run:FakeClosedRun,transport:FakeClosedTransport){return use('binding',()=>{
      const b=binding(session,run,transport);return b.ok?ok(Object.freeze({...closedGate,state:'identity_only' as const})):b;
    });},
    claimAccounting(session:FakeClosedSession,run:FakeClosedRun,transport:FakeClosedTransport){
      if(claims.accounting==='claimed')return reject('accounting','invalid_state');
      if(claims.accounting==='consuming')return stop('accounting','invalid_state');
      return use('accounting',()=>{
        claims.accounting='consuming';const b=binding(session,run,transport);if(!b.ok)return stop('accounting',b.code);
        const s=sessions.get(session)!;if(!s.readState)return stop('accounting','invalid_state');
        s.accountingRun=run;s.accountingTransport=transport;claims.accounting='claimed';return ok(s.readState.port);
      });
    },
    refuseBody(session:FakeClosedSession,run:FakeClosedRun,transport:FakeClosedTransport):Result<never>{return use('gate',()=>{
      const b=binding(session,run,transport);return b.ok?reject('gate','issuance_disabled'):b;
    });},
    stop(raw:unknown){const p=codeSchema.safeParse(raw);return stop('owner',p.success&&p.data!=='issuance_disabled'?p.data:'internal_review_error');},
    close(){if(!closed()){if(!primary)stop('owner','closed');state='closed';}return no('closed');},
    diagnostic(){return Object.freeze({...closedGate,state,primary,refusal,claims:Object.freeze({...claims}),
      receipts_issued:0 as const,budget_authority:context?.readState?'fake_single_state' as const:'identity_only' as const,
      accounting:context?.readState?.port.stats()??null,auth_ready:false as const,source_binding:'not_connected' as const,
      cleanup:Object.freeze({http:'not_started' as const,worker:'not_started' as const})});},
  });
}
