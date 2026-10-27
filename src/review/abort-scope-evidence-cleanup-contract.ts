/** TC-01 pure fake realm. No real session, budget, transport, worker, timer or evidence authority. */
import {z} from 'zod';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type FakeCleanupPurpose=Handle<'cleanup_purpose'>;
export type FakeCleanupAttempt=Handle<'cleanup_attempt'>;
export type FakeHttpCleanupReport=Handle<'http_cleanup_report'>;
export type FakeCleanupWorker=Handle<'cleanup_worker'>;
export type FakeWorkerCleanupReport=Handle<'worker_cleanup_report'>;
type Code='invalid_input'|'invalid_state'|'evidence_binding_mismatch'|'cancelled'|'closed'|'deadline_exceeded'|'invalid_observation_time'|'internal_review_error'|'scope_evidence_limit'|'authentication_failed'|'access_denied'|'receive_budget_exceeded'|'payload_budget_exceeded';
type Stage='input'|'binding'|'cleanup'|'owner';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
type Reason='fetch_pending'|'read_pending'|'cancel_pending'|'cancel_rejected'|'closed_unconfirmed'|'closed_rejected'|'reader_owner_unknown'|'lock_release_failed'|'abort_failed'|'cleanup_deadline'|'cleanup_observation_invalid';
type Disposition='not_started'|'confirmed'|'unconfirmed';
type HttpTerminal=Readonly<{disposition:Disposition;kind:'eof'|'cancelled'|'no_response'|'no_body'|null;reason:Reason|null;ended_at:number|null;synthetic:true}>;
type WorkerTerminal=Readonly<{disposition:Disposition;kind:'terminated'|null;reason:'termination_pending'|'termination_rejected'|'listeners_attached'|'listeners_not_attached'|'stdout_open'|'stderr_open'|'cleanup_deadline'|'cleanup_observation_invalid'|null;ended_at:number|null;synthetic:true}>;
const workerSchema=z.strictObject({termination:z.enum(['not_started','pending','fulfilled','rejected']),listeners:z.enum(['not_attached','attached','detached']),stdout:z.enum(['not_created','open','closed']),stderr:z.enum(['not_created','open','closed'])});
const purposeSchema=z.strictObject({kind:z.enum(['oauth','parent_initial','release_rows','metadata_initial','payload','table_initial','parent_final','metadata_final','table_final']),ordinal:z.union([z.literal(1),z.literal(2)])});
const httpSchema=z.strictObject({fetch:z.enum(['not_started','pending','fulfilled','rejected']),body:z.enum(['none','unlocked','reader','unknown_lock']),
  pending_read:z.boolean(),eof:z.boolean(),closed:z.enum(['pending','fulfilled','rejected']).nullable(),
  cancel:z.enum(['not_requested','pending','fulfilled','rejected']),lock:z.enum(['not_owned','held','released','failed','unknown']),abort_failed:z.boolean()}).refine(o=>{
  if(o.fetch!=='fulfilled')return o.body==='none'&&!o.pending_read&&!o.eof&&o.closed===null&&o.lock==='not_owned'&&o.cancel==='not_requested';
  if(o.body==='reader')return o.closed!==null&&o.lock!=='not_owned'&&!(o.eof&&o.pending_read);
  return !o.pending_read&&!o.eof&&o.closed===null&&(o.body==='unknown_lock'?o.lock==='unknown':o.lock==='not_owned')&&(o.body!=='none'||o.cancel==='not_requested');
});
const configSchema=z.strictObject({deadline_ms:z.number().int().min(1).max(60000).default(60000),max_attempts:z.number().int().min(1).max(210).default(210)});
const codeSet=new Set<Code>(['invalid_input','invalid_state','evidence_binding_mismatch','cancelled','closed','deadline_exceeded','invalid_observation_time','internal_review_error','scope_evidence_limit','authentication_failed','access_denied','receive_budget_exceeded','payload_budget_exceeded']);
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});

export function createFakeCleanupContract(clock:{now():number},rawConfig:unknown={}){
  let config:z.infer<typeof configSchema>,start:number;
  try{config=configSchema.parse(structuredClone(rawConfig));start=clock.now();if(!Number.isFinite(start)||start<0)throw Error();}catch{throw Error('invalid_input');}
  const hard=start+config.deadline_ms;if(!Number.isFinite(hard)||hard<=start)throw Error('invalid_input');
  let last=start,state:'active'|'stopped'|'closed'='active';
  let primary:Readonly<{stage:Stage;code:Code}>|null=null;
  type Purpose={phase:object;descriptor:Readonly<z.infer<typeof purposeSchema>>;used:boolean};
  type Attempt={purpose:FakeCleanupPurpose;phase:object;state:'issued'|'started'|'settling'|'terminal';started:boolean;consumed:boolean};
  type Report={attempt:FakeCleanupAttempt;value:HttpTerminal;used:boolean};
  type WorkerState={state:'issued'|'started'|'settling'|'terminal';started:boolean;consumed:boolean};
  let phase=opaque<object>(),finalPhase=false,purposeCount=0,attemptCount=0,startedCount=0,consumedStarted=0,httpUnconfirmed=false;
  let current:FakeCleanupAttempt|undefined;
  let worker:FakeCleanupWorker|undefined,workerUnconfirmed=false,workerStarted=false,workerConsumed=false,finalizing=false;
  const purposes=new WeakMap<FakeCleanupPurpose,Purpose>(),attempts=new WeakMap<FakeCleanupAttempt,Attempt>(),reports=new WeakMap<FakeHttpCleanupReport,Report>();
  const workers=new WeakMap<FakeCleanupWorker,WorkerState>(),workerReports=new WeakMap<FakeWorkerCleanupReport,{worker:FakeCleanupWorker;value:WorkerTerminal;used:boolean}>();
  const no=(code:Code):Result<never>=>Object.freeze({ok:false,code:primary?.code??code});
  function stop(code:Code,stage:Stage='owner'){if(state==='closed')return no('closed');primary??=Object.freeze({stage,code});state='stopped';return no(code);}
  function time():number|null{
    let now:number;try{now=clock.now();}catch{stop('internal_review_error');return null;}
    if(!Number.isFinite(now)||now<last){stop('invalid_observation_time');return null;}last=now;
    if(now>=hard)stop('deadline_exceeded');return now;
  }
  const closed=()=>state==='closed';
  function active(){if(state!=='active'||finalizing)return false;const now=time();return now!==null&&now<hard&&state==='active'&&!finalizing;}
  function binding(){return stop('evidence_binding_mismatch','binding');}
  function classify(o:z.infer<typeof httpSchema>,started:boolean,now:number|null):HttpTerminal{
    const terminal=(disposition:Disposition,kind:HttpTerminal['kind'],reason:Reason|null):HttpTerminal=>Object.freeze({disposition,kind,reason,ended_at:now,synthetic:true});
    const unknown=(reason:Reason)=>terminal('unconfirmed',null,reason);
    if(!started)return o.fetch==='not_started'&&!o.abort_failed?terminal('not_started',null,null):unknown('cleanup_observation_invalid');
    if(now===null)return unknown('cleanup_observation_invalid');if(now>=hard)return unknown('cleanup_deadline');
    if(o.fetch==='not_started')return unknown('cleanup_observation_invalid');if(o.abort_failed)return unknown('abort_failed');
    if(o.fetch==='pending')return unknown('fetch_pending');if(o.fetch==='rejected')return terminal('confirmed','no_response',null);
    if(o.body==='unknown_lock')return unknown('reader_owner_unknown');if(o.pending_read)return unknown('read_pending');
    if(o.cancel==='rejected')return unknown('cancel_rejected');if(o.cancel==='pending')return unknown('cancel_pending');
    if(o.body==='reader'){
      if(o.closed==='rejected')return unknown('closed_rejected');if(o.closed!=='fulfilled')return unknown('closed_unconfirmed');
      if(o.lock!=='released')return unknown('lock_release_failed');
      if(o.cancel==='fulfilled')return terminal('confirmed','cancelled',null);
      if(o.eof)return terminal('confirmed','eof',null);return unknown('cleanup_observation_invalid');
    }
    if(o.body==='none')return terminal('confirmed','no_body',null);
    return o.cancel==='fulfilled'?terminal('confirmed','cancelled',null):unknown('cleanup_observation_invalid');
  }
  return Object.freeze({
    issueHttpPurpose(raw:unknown):Result<FakeCleanupPurpose>{
      if(!active())return no('closed');
      const issuedPhase=phase;let descriptor:z.infer<typeof purposeSchema>;
      try{const p=purposeSchema.safeParse(structuredClone(raw));if(!p.success)return stop('invalid_input','input');descriptor=p.data;if(descriptor.kind.endsWith('_final')!==finalPhase)return binding();}catch{return stop('invalid_input','input');}
      if(!active())return no('closed');if(phase!==issuedPhase)return binding();if(purposeCount>=config.max_attempts)return stop('scope_evidence_limit');purposeCount++;
      const h=opaque<FakeCleanupPurpose>();purposes.set(h,{phase,descriptor:Object.freeze(descriptor),used:false});return ok(h);
    },
    beginHttp(purpose:FakeCleanupPurpose):Result<FakeCleanupAttempt>{
      if(!active())return no('closed');const p=purposes.get(purpose);if(!p||p.phase!==phase)return binding();
      if(p.used||current)return stop('invalid_state','binding');p.used=true;
      if(attemptCount>=config.max_attempts)return stop('scope_evidence_limit');attemptCount++;
      const h=opaque<FakeCleanupAttempt>();attempts.set(h,{purpose,phase,state:'issued',started:false,consumed:false});current=h;return ok(h);
    },
    startHttp(attempt:FakeCleanupAttempt):Result<true>{
      if(!active())return no('closed');const a=attempts.get(attempt);if(!a||current!==attempt||a.phase!==phase)return binding();
      if(a.state!=='issued')return stop('invalid_state','binding');a.state='started';a.started=true;startedCount++;return ok(true);
    },
    finishHttp(attempt:FakeCleanupAttempt,raw:unknown):Result<FakeHttpCleanupReport>{
      if(state==='closed')return no('closed');const a=attempts.get(attempt);if(!a||current!==attempt)return binding();
      if(a.phase!==phase||purposes.get(a.purpose)?.phase!==a.phase)return binding();
      if(a.state!=='issued'&&a.state!=='started')return stop('invalid_state','binding');a.state='settling';
      let observation:z.infer<typeof httpSchema>|undefined;
      try{const p=httpSchema.safeParse(structuredClone(raw));if(p.success)observation=p.data;}catch{/* fixed result */}
      const now=time();if(closed())return no('closed');let value:HttpTerminal;
      if(observation)value=classify(observation,a.started,now);
      else{stop('invalid_input','cleanup');value=Object.freeze({disposition:'unconfirmed',kind:null,reason:'cleanup_observation_invalid',ended_at:now,synthetic:true});}
      if(value.disposition==='unconfirmed'){httpUnconfirmed=true;stop('internal_review_error','cleanup');}
      const h=opaque<FakeHttpCleanupReport>();reports.set(h,{attempt,value,used:false});a.state='terminal';return ok(h);
    },
    readHttpReport(report:FakeHttpCleanupReport):Result<HttpTerminal>{const r=reports.get(report);return r?ok(r.value):binding();},
    consumeHttp(attempt:FakeCleanupAttempt,report:FakeHttpCleanupReport):Result<true>{
      if(state==='closed')return no('closed');const a=attempts.get(attempt),r=reports.get(report);
      if(!a||!r||r.attempt!==attempt)return binding();if(r.used||a.consumed)return stop('invalid_state','binding');if(current!==attempt)return binding();
      r.used=true;a.consumed=true;if(a.started)consumedStarted++;current=undefined;return ok(true);
    },
    issueWorker():Result<FakeCleanupWorker>{
      if(!active())return no('closed');if(worker)return stop('invalid_state','binding');
      const h=opaque<FakeCleanupWorker>();workers.set(h,{state:'issued',started:false,consumed:false});worker=h;return ok(h);
    },
    startWorker(handle:FakeCleanupWorker):Result<true>{
      if(!active())return no('closed');const w=workers.get(handle);if(!w||handle!==worker)return binding();
      if(w.state!=='issued')return stop('invalid_state','binding');w.state='started';w.started=true;workerStarted=true;return ok(true);
    },
    finishWorker(handle:FakeCleanupWorker,raw:unknown):Result<FakeWorkerCleanupReport>{
      if(closed())return no('closed');const w=workers.get(handle);if(!w||handle!==worker)return binding();
      if(w.state!=='issued'&&w.state!=='started')return stop('invalid_state','binding');w.state='settling';
      let o:z.infer<typeof workerSchema>|undefined;
      try{const p=workerSchema.safeParse(structuredClone(raw));if(p.success)o=p.data;}catch{/* fixed result */}
      const now=time();if(closed())return no('closed');
      let disposition:Disposition='unconfirmed',reason:WorkerTerminal['reason']=null,kind:WorkerTerminal['kind']=null;
      if(!o){stop('invalid_input','cleanup');reason='cleanup_observation_invalid';}
      else if(!w.started){if(o.termination==='not_started'&&o.listeners==='not_attached'&&o.stdout==='not_created'&&o.stderr==='not_created')disposition='not_started';else reason='cleanup_observation_invalid';}
      else if(now===null)reason='cleanup_observation_invalid';else if(now>=hard)reason='cleanup_deadline';
      else if(o.termination==='pending')reason='termination_pending';else if(o.termination==='rejected')reason='termination_rejected';
      else if(o.termination!=='fulfilled')reason='cleanup_observation_invalid';else if(o.listeners==='attached')reason='listeners_attached';
      // A started worker whose listeners were never attached cannot show they were detached on termination.
      else if(o.listeners==='not_attached')reason='listeners_not_attached';
      else if(o.stdout!=='closed')reason='stdout_open';else if(o.stderr!=='closed')reason='stderr_open';else{disposition='confirmed';kind='terminated';}
      if(disposition==='unconfirmed'){workerUnconfirmed=true;stop('internal_review_error','cleanup');}
      const h=opaque<FakeWorkerCleanupReport>();workerReports.set(h,{worker:handle,value:Object.freeze({disposition,kind,reason,ended_at:now,synthetic:true}),used:false});w.state='terminal';return ok(h);
    },
    readWorkerReport(report:FakeWorkerCleanupReport):Result<WorkerTerminal>{const r=workerReports.get(report);return r?ok(r.value):binding();},
    consumeWorker(handle:FakeCleanupWorker,report:FakeWorkerCleanupReport):Result<true>{
      if(closed())return no('closed');const w=workers.get(handle),r=workerReports.get(report);
      if(!w||!r||r.worker!==handle||handle!==worker)return binding();if(w.consumed||r.used)return stop('invalid_state','binding');
      r.used=true;w.consumed=true;workerConsumed=true;return ok(true);
    },
    beginFinal():Result<true>{if(!active())return no('closed');if(finalPhase||current)return stop('invalid_state','binding');finalPhase=true;phase=opaque<object>();return ok(true);},
    stop(raw:unknown):Result<never>{return stop(typeof raw==='string'&&codeSet.has(raw as Code)?raw as Code:'internal_review_error');},
    finishRun():Result<true>{
      if(state==='closed')return no('closed');if(finalizing)return stop('invalid_state','cleanup');finalizing=true;time();
      if(current){if(attempts.get(current)?.started)httpUnconfirmed=true;stop('invalid_state','cleanup');}
      if(worker&&!workerConsumed){if(workerStarted)workerUnconfirmed=true;stop('invalid_state','cleanup');}
      state='closed';return primary?no(primary.code):ok(true);
    },
    diagnostic(){return Object.freeze({state,primary,cleanup:Object.freeze({http:httpUnconfirmed?'unconfirmed':startedCount===0?'not_started':state==='closed'&&consumedStarted===startedCount?'confirmed':'in_progress',
      worker:workerUnconfirmed?'unconfirmed':!workerStarted?'not_started':state==='closed'&&workerConsumed?'confirmed':'in_progress'}),
      model_counts:Object.freeze({purposes:purposeCount,attempts:attemptCount,started:startedCount}),synthetic:true,evidence_issuance:'disabled' as const});},
  });
}
