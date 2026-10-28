/** Closed-gate fake ReadState with an optional private synthetic byte lane; no real session/transport/receipt issuer. */
import {z} from 'zod';
import {createClosedBodyLane} from './abort-scope-evidence-closed-body-candidate.js';
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
export type ClosedReadPurpose=Handle<'closed_read_purpose'>;
export type ClosedReadAttempt=Handle<'closed_read_attempt'>;
export type ClosedFinalSlot=Handle<'closed_final_slot'>;
export type ClosedAccountingCode='invalid_input'|'invalid_state'|'evidence_binding_mismatch'|'request_budget_exceeded'
  |'receive_budget_exceeded'|'payload_budget_exceeded'|'payload_limit'|'scope_evidence_limit'
  |'phase_deadline_exceeded'|'upstream_unavailable'|'cleanup_unconfirmed'|'invalid_response'|'body_limit'|'attempt_deadline_exceeded';
export type ClosedStateCode=ClosedAccountingCode|'invalid_observation_time'|'deadline_exceeded'|'cancelled'|'closed'|'internal_review_error'|'issuance_disabled';
export type ClosedAccountingResult<T>=Readonly<{ok:true;value:T}|{ok:false;code:ClosedStateCode}>;
export const closedAttemptPolicySchema=z.strictObject({timeout_ms:z.number().int().min(1).max(10000).default(10000),cleanup_reserve_ms:z.number().int().min(1).max(250).default(250),max_empty_reads:z.number().int().min(1).max(16).default(16)});
export const closedAccountingSchema=z.strictObject({
  body_mode:z.enum(['length','bytes']).default('length'),
  attempt_policy:closedAttemptPolicySchema.optional(),
  requests:z.number().int().min(4).max(210).default(210),
  total_bytes:z.number().int().min(1).max(16*1024*1024).default(16*1024*1024),
  response_bytes:z.number().int().min(1).max(4*1024*1024).default(4*1024*1024),
  payload_bytes:z.number().int().min(1).max(2*1024*1024).default(2*1024*1024),
  total_payload_bytes:z.number().int().min(1).max(8*1024*1024).default(8*1024*1024),
}).refine(x=>!x.attempt_policy||x.body_mode==='bytes');
type Config=z.infer<typeof closedAccountingSchema>;
type Kind='oauth'|'parent_initial'|'release_rows'|'metadata_initial'|'payload'|'parent_final'|'metadata_final'|'table_initial'|'table_final';
const purposeSchema=z.strictObject({kind:z.enum(['oauth','parent_initial','release_rows','metadata_initial','payload'])});
const settlementSchema=z.strictObject({outcome:z.enum(['success','unavailable','retryable']),cleanup:z.enum(['confirmed','unconfirmed'])});
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):ClosedAccountingResult<T>=>Object.freeze({ok:true,value});

/** Called only by the closed fake constructor; all operations re-enter its same stop/clock/binding guard. */
export function createClosedReadState(config:Config,hooks:{
  guard<T>(body:()=>ClosedAccountingResult<T>):ClosedAccountingResult<T>;
  checkpoint():ClosedAccountingResult<number>;
  stop(code:ClosedAccountingCode):ClosedAccountingResult<never>;
  refuse(code:ClosedStateCode):ClosedAccountingResult<never>;
  dispatch():void;
  normalDeadline:number;finalDeadline:number;
}){
  type Purpose={kind:Kind;attempts:number;state:'ready'|'inflight'|'done';slot?:Slot;table?:Slot};
  type Attempt={purpose:Purpose;bytes:number;sequence:number;settled:boolean;empty:number;limited?:boolean;window?:Readonly<{deadline:number;io_deadline:number;max_empty_reads:number}>};
  type Slot={handle:ClosedFinalSlot;kind:'parent'|'metadata'|'table';remaining:number;state:'idle'|'done'|'skipped'|'invalidated';initial?:'success'|'unavailable';skipReason?:'not_collected'|'initial_unavailable'|'evidence_disabled'};
  const purposes=new WeakMap<ClosedReadPurpose,Purpose>(),attempts=new WeakMap<ClosedReadAttempt,Attempt>();
  const slots:Slot[]=(['parent','metadata'] as const).map(kind=>({handle:opaque<ClosedFinalSlot>(),kind,remaining:2,state:'idle'}));
  let requests=0,received=0,payload=0,evidence=0,phase:'normal'|'final'|'stopped'='normal',cursor=0;
  const tableNames=new Set<string>();let evidenceClosed=false,ordinaryClosed=false,ordinaryReason:'request_budget_exceeded'|'phase_deadline_exceeded'='request_budget_exceeded';
  let current:Purpose|undefined,active:ClosedReadAttempt|undefined,pendingPayload:ClosedReadAttempt|undefined;
  const initial=new Map<string,'success'|'unavailable'>();
  const ordinarySeen=new Set<Kind>();let payloadPurposes=0;
  let bodies:ReturnType<typeof createClosedBodyLane>|undefined;
  function checkpoint():ClosedAccountingResult<number>{
    const cp=hooks.checkpoint();if(!cp.ok)return cp;
    if(phase==='final'&&cp.value>=hooks.finalDeadline||active&&phase==='normal'&&cp.value>=hooks.normalDeadline)return hooks.stop('phase_deadline_exceeded');
    const deadline=active?attempts.get(active)?.window?.deadline:bodies?.deadline();
    if(deadline!==undefined&&cp.value>=deadline)return hooks.stop('attempt_deadline_exceeded');
    if(phase==='normal'&&(pendingPayload||bodies?.pending())&&cp.value>=hooks.normalDeadline)return hooks.refuse(closeOrdinary().code);
    return cp;
  }
  function guard<T>(body:()=>ClosedAccountingResult<T>):ClosedAccountingResult<T>{return hooks.guard(()=>{
    const operationDeadline=active?attempts.get(active)?.window?.deadline:bodies?.deadline();
    const cp=checkpoint();if(!cp.ok)return cp;
    const result=body(),after=checkpoint();if(!after.ok)return after;
    if(operationDeadline!==undefined&&after.value>=operationDeadline)return hooks.stop('attempt_deadline_exceeded');
    if(phase==='normal'&&after.value>=hooks.normalDeadline)return hooks.refuse(closeOrdinary().code);
    return result.ok?result:hooks.refuse(result.code);
  });}
  function closeOrdinary(){ordinaryClosed=true;ordinaryReason='phase_deadline_exceeded';
    pendingPayload=undefined;
    bodies?.revoke();
    if(current){current.state='done';initial.set(current.kind,'unavailable');if(current.table)current.table.initial='unavailable';current=undefined;}
    return Object.freeze({ok:false as const,code:ordinaryReason});
  }
  const reserved=()=>slots.reduce((n,s)=>n+s.remaining,0);
  function make(kind:Kind,slot?:Slot,table?:Slot){const h=opaque<ClosedReadPurpose>();current={kind,slot,table,attempts:0,state:'ready'};purposes.set(h,current);return h;}
  function chunkCore(handle:ClosedReadAttempt,sequence:number,length:number):ClosedAccountingResult<true>{
    const a=attempts.get(handle);if(!a||active!==handle)return hooks.stop('evidence_binding_mismatch');
    if(a.limited)return Object.freeze({ok:false,code:'scope_evidence_limit'});
    if(!Number.isSafeInteger(sequence)||sequence!==a.sequence||!Number.isSafeInteger(length)||length<0||length>0xffffffff)return hooks.stop('invalid_input');
    const cp=checkpoint();if(!cp.ok)return cp;
    a.sequence++;a.bytes+=length;received+=length;if(a.purpose.table)evidence+=length;
    if(length===0&&a.window&&++a.empty>a.window.max_empty_reads)return hooks.stop('invalid_response');
    if(a.bytes>config.response_bytes||received>config.total_bytes)return hooks.stop('receive_budget_exceeded');
    if(a.purpose.table&&(a.bytes>16*1024||evidence>256*1024)){a.limited=true;evidenceClosed=true;return Object.freeze({ok:false,code:'scope_evidence_limit'});}
    return ok(true);
  }
  function settleCore(handle:ClosedReadAttempt,raw:unknown):ClosedAccountingResult<true>{
    const a=attempts.get(handle);if(!a||active!==handle)return hooks.stop('evidence_binding_mismatch');
    const p=settlementSchema.safeParse(structuredClone(raw));if(!p.success)return hooks.stop('invalid_input');
    const cp=checkpoint();if(!cp.ok)return cp;a.settled=true;active=undefined;
    if(p.data.cleanup!=='confirmed')return hooks.stop('cleanup_unconfirmed');
    if(!a.limited&&p.data.outcome==='retryable'&&a.purpose.attempts<2){a.purpose.state='ready';return ok(true);}
    a.purpose.state='done';initial.set(a.purpose.kind,p.data.outcome==='success'?'success':'unavailable');
    if(a.purpose.table&&a.purpose.kind==='table_initial')a.purpose.table.initial=!a.limited&&p.data.outcome==='success'?'success':'unavailable';
    if(a.purpose.slot){a.purpose.slot.remaining=0;a.purpose.slot.state='done';cursor++;}
    if(a.purpose.kind==='payload'&&p.data.outcome==='success')pendingPayload=handle;
    current=undefined;return ok(true);
  }
  function payloadCore(handle:ClosedReadAttempt,length:number):ClosedAccountingResult<true>{
    const a=attempts.get(handle);if(!a||pendingPayload!==handle||!a.settled)return hooks.stop('evidence_binding_mismatch');
    if(!Number.isSafeInteger(length)||length<0||length>0xffffffff)return hooks.stop('invalid_input');
    const cp=checkpoint();if(!cp.ok)return cp;pendingPayload=undefined;payload+=length;
    if(payload>config.total_payload_bytes)return hooks.stop('payload_budget_exceeded');
    return length>config.payload_bytes?Object.freeze({ok:false,code:'payload_limit'}):ok(true);
  }
  function discardPayloadCore(handle:ClosedReadAttempt):ClosedAccountingResult<true>{
    if(pendingPayload!==handle)return hooks.stop('evidence_binding_mismatch');pendingPayload=undefined;return ok(true);
  }
  if(config.body_mode==='bytes')bodies=createClosedBodyLane({guard,checkpoint,stop:hooks.stop,chunk:chunkCore,settle:settleCore,payload:payloadCore,discardPayload:discardPayloadCore,responseLimit:config.response_bytes});
  const port=Object.freeze({
    body:bodies?.port??null,
    parentFinal:slots[0]!.handle,metadataFinal:slots[1]!.handle,
    attemptWindow(handle:ClosedReadAttempt){return guard(()=>{
      const a=attempts.get(handle);if(!a||active!==handle)return hooks.stop('evidence_binding_mismatch');
      return a.window?ok(a.window):hooks.stop('invalid_state');
    });},
    admitTable(raw:unknown):ClosedAccountingResult<Readonly<{initial:ClosedReadPurpose;final:ClosedFinalSlot}>>{return guard(()=>{
      if(typeof raw!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(raw)||raw==='global')return hooks.stop('invalid_input');
      if(phase!=='normal'||current||pendingPayload||bodies?.pending()||tableNames.has(raw))return hooks.stop('invalid_state');
      const cp=checkpoint();if(!cp.ok)return cp;
      if(cp.value>=hooks.normalDeadline)return closeOrdinary();
      if(evidenceClosed||ordinaryClosed||tableNames.size>=8||requests+reserved()+4>config.requests){evidenceClosed=true;return Object.freeze({ok:false,code:'scope_evidence_limit'});}
      const slot:Slot={handle:opaque<ClosedFinalSlot>(),kind:'table',remaining:2,state:'idle'};slots.push(slot);tableNames.add(raw);
      return ok(Object.freeze({initial:make('table_initial',undefined,slot),final:slot.handle}));
    });},
    openPurpose(raw:unknown):ClosedAccountingResult<ClosedReadPurpose>{return guard(()=>{
      const p=purposeSchema.safeParse(structuredClone(raw));if(!p.success)return hooks.stop('invalid_input');
      if(current||pendingPayload||bodies?.pending()||phase!=='normal')return hooks.stop('invalid_state');
      const cp=checkpoint();if(!cp.ok)return cp;
      if(cp.value>=hooks.normalDeadline)return closeOrdinary();
      if(ordinaryClosed)return Object.freeze({ok:false,code:ordinaryReason});
      if(p.data.kind==='payload'){if(payloadPurposes>=100)return hooks.stop('request_budget_exceeded');payloadPurposes++;}
      else{if(ordinarySeen.has(p.data.kind))return hooks.stop('invalid_state');ordinarySeen.add(p.data.kind);}
      return ok(make(p.data.kind));
    });},
    dispatch(handle:ClosedReadPurpose):ClosedAccountingResult<ClosedReadAttempt>{return guard(()=>{
      const p=purposes.get(handle);if(!p||p!==current)return hooks.stop('evidence_binding_mismatch');
      if(active||p.state!=='ready')return hooks.stop('invalid_state');
      const cp=checkpoint();if(!cp.ok)return cp;
      if(!p.slot&&cp.value>=hooks.normalDeadline)return closeOrdinary();
      if(requests+1+(p.slot?reserved()-1:reserved())>config.requests){
        if(p.slot)return hooks.stop('request_budget_exceeded');
        ordinaryClosed=true;p.state='done';if(p.table)p.table.initial='unavailable';initial.set(p.kind,'unavailable');current=undefined;
        return Object.freeze({ok:false,code:'request_budget_exceeded'});
      }
      if(p.slot){if(phase!=='final'||p.slot!==slots[cursor]||p.slot.remaining<1)return hooks.stop('invalid_state');p.slot.remaining--;}
      else if(phase!=='normal')return hooks.stop('invalid_state');
      let window:Attempt['window'];if(config.attempt_policy){
        const deadline=Math.min(cp.value+config.attempt_policy.timeout_ms,p.slot?hooks.finalDeadline:hooks.normalDeadline);
        window=Object.freeze({deadline,io_deadline:deadline-Math.min(config.attempt_policy.cleanup_reserve_ms,(deadline-cp.value)/4),max_empty_reads:config.attempt_policy.max_empty_reads});
      }
      const a=opaque<ClosedReadAttempt>();attempts.set(a,{purpose:p,bytes:0,sequence:0,settled:false,empty:0,window});
      requests++;p.attempts++;p.state='inflight';active=a;
      bodies?.start(a,p.kind,window?.deadline);
      try{hooks.dispatch();}catch{return hooks.stop('upstream_unavailable');}return ok(a);
    });},
    chunk(handle:ClosedReadAttempt,sequence:number,length:number):ClosedAccountingResult<true>{return guard(()=>{
      return bodies?hooks.stop('invalid_state'):chunkCore(handle,sequence,length);
    });},
    settle(handle:ClosedReadAttempt,raw:unknown):ClosedAccountingResult<true>{return guard(()=>{
      return bodies?hooks.stop('invalid_state'):settleCore(handle,raw);
    });},
    /** Synthetic length event only. No body/provenance is accepted or certified by this port. */
    chargePayload(handle:ClosedReadAttempt,length:number):ClosedAccountingResult<true>{return guard(()=>{
      return bodies?hooks.stop('invalid_state'):payloadCore(handle,length);
    });},
    discardPayload(handle:ClosedReadAttempt):ClosedAccountingResult<true>{return guard(()=>{
      return bodies?hooks.stop('invalid_state'):discardPayloadCore(handle);
    });},
    enterFinal():ClosedAccountingResult<true>{return guard(()=>{
      if(phase!=='normal'||active||pendingPayload||bodies?.pending())return hooks.stop('invalid_state');
      const cp=checkpoint();if(!cp.ok)return cp;if(cp.value>=hooks.finalDeadline)return hooks.stop('phase_deadline_exceeded');
      if(current){current.state='done';initial.set(current.kind,'unavailable');if(current.table)current.table.initial='unavailable';current=undefined;}
      phase='final';return ok(true);
    });},
    openFinal(handle:ClosedFinalSlot):ClosedAccountingResult<ClosedReadPurpose>{return guard(()=>{
      const s=slots[cursor];if(!s||handle!==s.handle)return hooks.stop('evidence_binding_mismatch');
      if(phase!=='final'||current||bodies?.pending()||s.state!=='idle')return hooks.stop('invalid_state');
      if(s.kind==='table'&&evidenceClosed)return Object.freeze({ok:false,code:'scope_evidence_limit'});
      if((s.kind==='table'?s.initial:initial.get(s.kind+'_initial'))!=='success')return hooks.stop('invalid_state');
      return ok(make(s.kind==='parent'?'parent_final':s.kind==='metadata'?'metadata_final':'table_final',s,s.kind==='table'?s:undefined));
    });},
    skipFinal(handle:ClosedFinalSlot):ClosedAccountingResult<true>{return guard(()=>{
      const s=slots[cursor];if(!s||handle!==s.handle)return hooks.stop('evidence_binding_mismatch');
      if(phase!=='final'||current||bodies?.pending()||s.state!=='idle'||(s.kind==='table'?s.initial==='success'&&!evidenceClosed:initial.get(s.kind+'_initial')==='success'))return hooks.stop('invalid_state');
      const outcome=s.kind==='table'?s.initial:initial.get(s.kind+'_initial');
      s.skipReason=outcome==='success'?'evidence_disabled':outcome==='unavailable'?'initial_unavailable':'not_collected';
      s.remaining=0;s.state='skipped';cursor++;return ok(true);
    });},
    stats(){return Object.freeze({requests,received_bytes:received,payload_bytes:payload,evidence_bytes:evidence,tables:tableNames.size,evidence_closed:evidenceClosed,ordinary_closed:ordinaryClosed,reserved:reserved(),phase,
      body:bodies?.port.diagnostic()??null,
      slots:Object.freeze(slots.map(s=>Object.freeze({kind:s.kind,remaining:s.remaining,state:s.state,skip_reason:s.skipReason??null}))) });},
  });
  return Object.freeze({port,revoke(){bodies?.revoke();phase='stopped';current=undefined;active=undefined;pendingPayload=undefined;for(const s of slots){s.remaining=0;if(s.state==='idle')s.state='invalidated';}}});
}
