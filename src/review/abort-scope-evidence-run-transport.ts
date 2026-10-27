/** TC-02 development-only composition. Creates only fake sessions; cannot adopt a real session. */
import {z} from 'zod';
import {registerReviewEvidenceSession} from '../servicenow/review-evidence-lifecycle.js';
import type {ReadFailureCode} from '../servicenow/bounded-read.js';
import {createFakeCleanupContract,type FakeCleanupAttempt,type FakeCleanupWorker} from './abort-scope-evidence-cleanup-contract.js';

const configSchema=z.strictObject({
  lane:z.enum(['typed','legacy']).default('typed'),
  deadline_ms:z.number().int().min(1).max(60000).default(60000),
  requests:z.number().int().min(1).max(210).default(210),
  total_bytes:z.number().int().min(1).max(16*1024*1024).default(16*1024*1024),
  response_bytes:z.number().int().min(1).max(4*1024*1024).default(4*1024*1024),
  payload_bytes:z.number().int().min(1).max(2*1024*1024).default(2*1024*1024),
  total_payload_bytes:z.number().int().min(1).max(8*1024*1024).default(8*1024*1024),
});
const purposeSchema=z.strictObject({kind:z.enum(['oauth','parent_initial','release_rows','metadata_initial','payload','table_initial','parent_final','metadata_final','table_final']),ordinal:z.union([z.literal(1),z.literal(2)])});
export interface FakeRunIo {
  /** Synchronous fake boundary only. No URL, body or credential is supplied. */
  dispatch():void;
  abort():void;
  stopWorker():void;
}
type CleanupFailure=Extract<ReturnType<ReturnType<typeof createFakeCleanupContract>['startHttp']>,{ok:false}>['code'];
type Failure=ReadFailureCode|CleanupFailure;
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Failure}>;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const typedByteLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength')!.get!;

export function createFakeRunTransportSession(clock:{now():number},io:FakeRunIo,rawConfig:unknown={}){
  let config:z.infer<typeof configSchema>,origin:number;
  try{config=configSchema.parse(structuredClone(rawConfig));origin=clock.now();
    if(!Number.isFinite(origin)||origin<0||!Number.isFinite(origin+config.deadline_ms)||origin+config.deadline_ms<=origin)throw Error();
  }catch{throw Error('invalid_input');}
  const hard=origin+config.deadline_ms,snapshot=Object.freeze({}),session=Object.freeze({});
  let last=origin,requests=0,received=0,payload=0,closed=false,busy=false,claimed=false,notified=false,clockInvalid=false;
  const lease=Object.freeze({read:()=>Object.freeze({requests,received_bytes:received,payload_bytes:payload,remaining_ms:Math.max(0,hard-last)})});
  const owner=registerReviewEvidenceSession(session,snapshot,lease);
  // Initialization uses the SAME origin, not a second call to the injected clock.
  let initializing=true;
  const cleanup=createFakeCleanupContract({now:()=>{if(initializing)return origin;const n=observe();if(n===null)throw Error('invalid_observation_time');return n;}},{deadline_ms:config.deadline_ms,max_attempts:config.requests});
  initializing=false;
  const attempts=new WeakMap<FakeCleanupAttempt,{next:number;bytes:number;kind:string;payloadUsed:boolean}>();
  let current:FakeCleanupAttempt|undefined;
  let worker:FakeCleanupWorker|undefined;
  let pendingPayload:FakeCleanupAttempt|undefined;
  type HttpReason=Extract<ReturnType<typeof cleanup.readHttpReport>,{ok:true}>['value']['reason']|'terminal_not_consumed';
  type WorkerReason=Extract<ReturnType<typeof cleanup.readWorkerReport>,{ok:true}>['value']['reason']|'terminal_not_consumed';
  let httpReason:HttpReason=null,workerReason:WorkerReason=null;
  const no=(fallback:Failure='internal_review_error'):Result<never>=>Object.freeze({ok:false,code:owner.failure()??fallback});
  function stop(raw:unknown){
    if(closed)return no('closed');
    // Revoke all active authority before invoking the fake abort/worker boundary.
    owner.revoke(raw);cleanup.stop(owner.failure());
    if(!notified){notified=true;if(current)try{io.abort();}catch{/* fixed first diagnosis */}if(worker)try{io.stopWorker();}catch{/* fixed first diagnosis */}}
    return no();
  }
  function observe():number|null{
    if(clockInvalid)return null;
    let now:number;try{now=clock.now();}catch{clockInvalid=true;stop('internal_review_error');return null;}
    if(closed)return null;
    if(!Number.isFinite(now)||now<last){clockInvalid=true;stop('invalid_observation_time');return null;}
    last=now;if(now>=hard)stop('deadline_exceeded');return now;
  }
  function sync(){
    const p=cleanup.diagnostic().primary;
    if(p)stop(p.code==='invalid_state'?'internal_review_error':p.code==='scope_evidence_limit'?'request_budget_exceeded':p.code);
  }
  function active(){observe();return !closed&&!owner.failure();}
  function operation<T>(body:()=>Result<T>):Result<T>{
    if(closed)return no('closed');if(busy)return stop('internal_review_error');busy=true;
    try{if(!active())return no();const result=body();observe();sync();return owner.failure()?no():result;}
    catch{return stop('internal_review_error');}finally{busy=false;}
  }
  function finishHttp(attempt:FakeCleanupAttempt,raw:unknown):Result<true>{
    if(closed)return no('closed');if(busy)return stop('internal_review_error');busy=true;
    try{
      if(!attempts.has(attempt)||current!==attempt)return stop('evidence_binding_mismatch');
      const r=cleanup.finishHttp(attempt,raw);if(!r.ok){sync();return no(r.code);}
      const report=cleanup.readHttpReport(r.value);if(!report.ok)return no(report.code);
      httpReason??=report.value.reason;sync();
      const consumed=cleanup.consumeHttp(attempt,r.value);sync();if(!consumed.ok)return no(consumed.code);
      if(attempts.get(attempt)?.kind==='payload'&&report.value.disposition==='confirmed'&&report.value.kind==='eof')pendingPayload=attempt;
      current=undefined;return owner.failure()?no():ok(true);
    }finally{busy=false;}
  }
  const transport=Object.freeze({
    enterFinal():Result<true>{return operation(()=>pendingPayload?stop('internal_review_error'):cleanup.beginFinal());},
    startWorker():Result<true>{return operation(()=>{
      const w=cleanup.issueWorker();if(!w.ok)return w;worker=w.value;return cleanup.startWorker(w.value);
    });},
    finishWorker(raw:unknown):Result<true>{
      if(closed)return no('closed');if(busy)return stop('internal_review_error');busy=true;
      try{if(!worker)return stop('evidence_binding_mismatch');
        const r=cleanup.finishWorker(worker,raw);if(!r.ok){sync();return no(r.code);}
        const report=cleanup.readWorkerReport(r.value);if(!report.ok)return no(report.code);workerReason??=report.value.reason;sync();
        const consumed=cleanup.consumeWorker(worker,r.value);sync();return consumed.ok&&!owner.failure()?ok(true):no();
      }finally{busy=false;}
    },
    begin(raw:unknown):Result<FakeCleanupAttempt>{return operation(()=>{
      if(!claimed||config.lane!=='typed')return stop('evidence_binding_mismatch');
      if(current||pendingPayload)return stop('internal_review_error');
      if(requests>=config.requests)return stop('request_budget_exceeded');
      const descriptor=purposeSchema.safeParse(structuredClone(raw));if(!descriptor.success)return stop('invalid_input');
      const p=cleanup.issueHttpPurpose(descriptor.data);if(!p.ok)return p;
      const a=cleanup.beginHttp(p.value);if(!a.ok)return a;
      const started=cleanup.startHttp(a.value);if(!started.ok)return started;
      if(owner.failure())return no();
      attempts.set(a.value,{next:0,bytes:0,kind:descriptor.data.kind,payloadUsed:false});current=a.value;
      requests++; // Single C commit, immediately before the fake dispatch. No await/callback gap.
      try{io.dispatch();}catch{stop('upstream_unavailable');}
      return owner.failure()?no():ok(a.value);
    });},
    chunk(attempt:FakeCleanupAttempt,sequence:number,bytes:Uint8Array):Result<true>{return operation(()=>{
      const a=attempts.get(attempt);if(!a||current!==attempt)return stop('evidence_binding_mismatch');
      if(!Number.isSafeInteger(sequence)||sequence!==a.next||!(bytes instanceof Uint8Array))return stop('invalid_input');
      // Native internal-slot access: no caller getter between stop check and charge.
      const length=Reflect.apply(typedByteLength,bytes,[]) as number;if(owner.failure())return no();
      a.next++;a.bytes+=length;received+=length;
      if(received>config.total_bytes)return stop('receive_budget_exceeded');
      if(a.bytes>config.response_bytes)return stop('invalid_response');
      return ok(true);
    });},
    finishHttp,
    /** Models source acceptance only; no body/content provenance or payload receipt is certified. */
    chargePayload(attempt:FakeCleanupAttempt,text:string):Result<true>{return operation(()=>{
      const a=attempts.get(attempt);
      if(!a||pendingPayload!==attempt||a.payloadUsed)return stop('evidence_binding_mismatch');
      if(typeof text!=='string')return stop('invalid_input');a.payloadUsed=true;pendingPayload=undefined;
      const size=Buffer.byteLength(text,'utf8');payload+=size;
      if(payload>config.total_payload_bytes)return stop('payload_budget_exceeded');
      // The local limit rejects the modeled asset but never refunds the acceptance charge.
      return size>config.payload_bytes?Object.freeze({ok:false,code:'payload_limit'}):ok(true);
    });},
    discardPayload(attempt:FakeCleanupAttempt):Result<true>{return operation(()=>{
      const a=attempts.get(attempt);if(!a||pendingPayload!==attempt||a.payloadUsed)return stop('evidence_binding_mismatch');
      a.payloadUsed=true;pendingPayload=undefined;return ok(true);
    });},
    /** A failed begin never returns active authority; the fixed cleanup slot remains reachable. */
    finishActiveHttp(raw:unknown):Result<true>{return current?finishHttp(current,raw):stop('internal_review_error');},
  });
  return Object.freeze({
    claimTransport():Result<typeof transport>{
      // Consume the claim BEFORE any dependency may re-enter. Failure never restores it.
      if(claimed)return stop('internal_review_error');claimed=true;
      return operation(()=>config.lane==='typed'?ok(transport):stop('evidence_binding_mismatch'));
    },
    legacyDispatch():Result<true>{return operation(()=>{
      if(config.lane!=='legacy'||claimed)return stop('evidence_binding_mismatch');
      if(current)return stop('internal_review_error');if(requests>=config.requests)return stop('request_budget_exceeded');
      const p=cleanup.issueHttpPurpose({kind:'parent_initial',ordinal:1});if(!p.ok)return p;
      const a=cleanup.beginHttp(p.value);if(!a.ok)return a;const started=cleanup.startHttp(a.value);if(!started.ok)return started;
      current=a.value;requests++;
      try{io.dispatch();}catch{return stop('upstream_unavailable');}return owner.failure()?no():ok(true);
    });},
    cancel(){return stop('cancelled');},
    stop,
    finish():Result<true>{
      if(closed)return no('closed');if(busy)return stop('internal_review_error');busy=true;
      try{observe();if(pendingPayload)stop('internal_review_error');pendingPayload=undefined;cleanup.finishRun();sync();
        const terminal=cleanup.diagnostic();if(terminal.cleanup.http==='unconfirmed')httpReason??='terminal_not_consumed';
        if(terminal.cleanup.worker==='unconfirmed')workerReason??='terminal_not_consumed';closed=true;
        // A clean model finish is not a logical cancellation; no new primary is invented.
        if(owner.failure())owner.close(owner.failure());return owner.failure()?no():ok(true);
      }finally{busy=false;}
    },
    status(){
      const view=owner.inspect(snapshot,lease),terminal=cleanup.diagnostic();
      return Object.freeze({state:closed?'closed':view.state,primary:view.primary,budget:view.budget,
        cleanup:terminal.cleanup,cleanup_reasons:Object.freeze({http:httpReason,worker:workerReason}),lane:config.lane,transport_claim:claimed?'consumed':'unclaimed',synthetic:true,evidence_issuance:'disabled' as const});
    },
  });
}
