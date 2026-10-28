/** Closed fake attempt supervisor. No real transport, session adoption or formal issuer. */
import {z} from 'zod';
import {createFakeClosedBodyGate} from './abort-scope-evidence-closed-body-gate.js';
import {closedAccountingSchema,closedAttemptPolicySchema,type ClosedReadPurpose,type ClosedStateCode,type ClosedAccountingResult} from './abort-scope-evidence-closed-read-state.js';
export interface ClosedAttemptClock{now():number;schedule(deadline:number,wake:()=>void):()=>void;}
export interface FakeClosedAttemptIo{
  read():Promise<{done:boolean;bytes?:Uint8Array}>;cancel():Promise<void>;closed:Promise<void>;abort():void;release():void;
}
const options=z.strictObject({session:z.strictObject({deadline_ms:z.number().int().min(1).max(60000).optional(),accounting:closedAccountingSchema.optional()}).default({}),policy:closedAttemptPolicySchema.default({timeout_ms:10000,cleanup_reserve_ms:250,max_empty_reads:16})}).refine(x=>!x.session.accounting?.attempt_policy);
const typedName=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),Symbol.toStringTag)!.get!;
const event=z.strictObject({done:z.boolean(),bytes:z.custom<Uint8Array>(value=>{try{return Reflect.apply(typedName,value,[])==='Uint8Array';}catch{return false;}}).optional()}).refine(x=>x.done?x.bytes===undefined:x.bytes!==undefined);
type Cleanup=Readonly<{disposition:'not_started'|'in_progress'|'confirmed'|'unconfirmed';kind:'eof'|'cancelled'|null;reason:'read_pending'|'cancel_pending'|'cancel_rejected'|'closed_pending'|'closed_rejected'|'release_failed'|'abort_failed'|'cleanup_deadline'|'scheduler_failed'|'observation_invalid'|null;synthetic:true}>;
const get=<T>(r:ClosedAccountingResult<T>)=>{if(!r.ok)throw Error(r.code);return r.value;};
export function createFakeClosedAttemptSupervisor(clock:ClosedAttemptClock,raw:unknown={}){

  let config:z.infer<typeof options>;try{config=options.parse(structuredClone(raw));if(typeof clock.schedule!=='function')throw Error();}catch{throw Error('invalid_input');}
  const gate=createFakeClosedBodyGate(clock),s=get(gate.construct({...config.session,accounting:{...config.session.accounting,body_mode:'bytes',attempt_policy:config.policy}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),body=port.body!;
  type Resource={io:FakeClosedAttemptIo;deadline:number;ioDeadline:number;reserve:number;cleanupDeadline?:number;failure?:ClosedStateCode;revoked:boolean;ended:boolean;
    readPending:boolean;closed:'pending'|'fulfilled'|'rejected';cancel:'not_requested'|'pending'|'fulfilled'|'rejected';eof:boolean;aborted:boolean;abortFailed:boolean;released:boolean;releaseFailed:boolean;schedulerFailed:boolean;clockFailed:boolean;sequence:number;version:number;wake?:()=>void};
  let current:Resource|undefined,busy=false,closing=false,attemptFailure:ClosedStateCode|null=null;
  let cleanup:Cleanup=Object.freeze({disposition:'not_started',kind:null,reason:null,synthetic:true});
  const counts={reads:0,cancels:0,aborts:0,releases:0,timers:0};
  const no=(fallback:ClosedStateCode):ClosedAccountingResult<never>=>Object.freeze({ok:false,code:gate.diagnostic().primary?.code??fallback});
  const observe=()=>gate.observeCleanupClock();
  function changed(x:Resource){x.version++;x.wake?.();if(x.ended)release(x);}
  function release(x:Resource){if(x.released||x.readPending||x.closed==='pending')return;x.released=true;counts.releases++;try{x.io.release();}catch{x.releaseFailed=true;}}
  function revoke(x:Resource){
    x.revoked=true; // revoke first; fake callbacks may reenter/cancel or settle promises.
    if(x.cleanupDeadline===undefined){x.cleanupDeadline=x.deadline;const v=observe();if(v.now===null)x.clockFailed=true;else x.cleanupDeadline=Math.min(x.deadline,v.now+x.reserve);}
    if(!x.aborted){x.aborted=true;counts.aborts++;try{x.io.abort();}catch{x.abortFailed=true;}}
    if(!x.eof&&x.cancel==='not_requested'){x.cancel='pending';counts.cancels++;
      try{void Promise.resolve(x.io.cancel()).then(()=>{x.cancel='fulfilled';changed(x);},()=>{x.cancel='rejected';changed(x);});}catch{x.cancel='rejected';}}
    changed(x);
  }
  function fail(x:Resource,code:ClosedStateCode,global=true){if(!x.failure)x.failure=code;if(global)gate.stop(code);else attemptFailure??=code;revoke(x);}
  function stop(code:ClosedStateCode){gate.stop(code);if(current)fail(current,code);}
  function check(x:Resource){const v=observe();if(v.primary&&!x.revoked)fail(x,v.primary);
    if(v.now===null){if(!x.revoked)fail(x,'internal_review_error');return v;}
    if(!x.revoked&&!x.eof&&v.now>=x.ioDeadline)fail(x,'attempt_deadline_exceeded',false);
    if((x.revoked||x.eof)&&x.cleanupDeadline===undefined)x.cleanupDeadline=Math.min(x.deadline,v.now+x.reserve);
    return v;
  }
  async function pump(x:Resource,a:Parameters<typeof body.append>[0]){
    while(!x.revoked&&!x.ended&&!x.eof){
      const before=check(x);if(before.now===null||x.revoked)return;
      x.readPending=true;counts.reads++;changed(x);let value:unknown;
      try{value=await x.io.read();}catch{x.readPending=false;if(!x.ended&&!x.revoked)fail(x,'upstream_unavailable');changed(x);return;}
      x.readPending=false;if(x.ended||x.revoked){changed(x);return;}
      const after=check(x);if(after.now===null||x.revoked){changed(x);return;}
      const parsed=event.safeParse(value);if(!parsed.success){fail(x,'invalid_response');return;}
      if(parsed.data.done){x.eof=true;x.cleanupDeadline=Math.min(x.deadline,after.now+x.reserve);changed(x);return;}
      // ReadState counts total empty completions per attempt; nonempty data never resets that quota.
      const bytes=parsed.data.bytes!;
      const adopted=body.append(a,x.sequence++,bytes);if(!adopted.ok){fail(x,adopted.code,adopted.code!=='scope_evidence_limit');return;}changed(x);
    }
  }
  function wait(x:Resource,version:number,deadline:number){
    if(version!==x.version)return Promise.resolve();
    return new Promise<void>(resolve=>{
      let done=false,dispose:(()=>void)|undefined;counts.timers++;
      const wake=()=>{if(done)return;done=true;counts.timers--;if(x.wake===wake)x.wake=undefined;
        try{dispose?.();}catch{x.schedulerFailed=true;fail(x,'internal_review_error');}resolve();};x.wake=wake;
      try{dispose=clock.schedule(deadline,()=>{if(x.ended||done)return;const v=observe();if(v.now===null||v.now<deadline){x.schedulerFailed=true;fail(x,'internal_review_error');}wake();});
        if(typeof dispose!=='function')throw Error();if(done)dispose();}
      catch{x.schedulerFailed=true;fail(x,'internal_review_error');wake();}
    });
  }
  function terminal(x:Resource,now:number|null):Cleanup|null{
    release(x);const after=observe();now=after.now;if(after.primary&&!x.revoked)fail(x,after.primary);
    const result=(disposition:Cleanup['disposition'],kind:Cleanup['kind'],reason:Cleanup['reason']):Cleanup=>Object.freeze({disposition,kind,reason,synthetic:true});
    if(x.schedulerFailed)return result('unconfirmed',null,'scheduler_failed');
    if(x.clockFailed)return result('unconfirmed',null,'observation_invalid');
    if(x.abortFailed)return result('unconfirmed',null,'abort_failed');if(x.cancel==='rejected')return result('unconfirmed',null,'cancel_rejected');
    if(x.closed==='rejected')return result('unconfirmed',null,'closed_rejected');if(x.releaseFailed)return result('unconfirmed',null,'release_failed');
    if(now===null||now>=(x.cleanupDeadline??x.deadline))return result('unconfirmed',null,x.readPending?'read_pending':x.cancel==='pending'?'cancel_pending':x.closed==='pending'?'closed_pending':'cleanup_deadline');
    if(x.readPending||x.cancel==='pending'||x.closed==='pending')return null;
    if(x.released&&(x.eof||x.cancel==='fulfilled'))return result('confirmed',x.cancel==='fulfilled'?'cancelled':'eof',null);
    return null;
  }
  async function read(purpose:ClosedReadPurpose,io:FakeClosedAttemptIo){
    const existing=gate.diagnostic().primary;if(existing)return no(existing.code);
    if(busy){stop('invalid_state');return no('invalid_state');}if(closing)return no('closed');busy=true;let x:Resource|undefined;
    try{
      const a=port.dispatch(purpose);if(!a.ok)return a;cleanup=Object.freeze({disposition:'not_started',kind:null,reason:null,synthetic:true});const w=port.attemptWindow(a.value);if(!w.ok)return w;
      if(!io){gate.stop('invalid_input');return no('invalid_input');}
      const readFn=io.read,cancelFn=io.cancel,abortFn=io.abort,releaseFn=io.release,closedWork=io.closed;
      if(typeof readFn!=='function'||typeof cancelFn!=='function'||typeof abortFn!=='function'||typeof releaseFn!=='function'||!closedWork){gate.stop('invalid_input');return no('invalid_input');}
      const pinned:FakeClosedAttemptIo=Object.freeze({read:()=>Reflect.apply(readFn,io,[]),cancel:()=>Reflect.apply(cancelFn,io,[]),abort:()=>Reflect.apply(abortFn,io,[]),release:()=>Reflect.apply(releaseFn,io,[]),closed:closedWork});
      x={io:pinned,deadline:w.value.deadline,ioDeadline:w.value.io_deadline,reserve:w.value.deadline-w.value.io_deadline,revoked:false,ended:false,readPending:false,closed:'pending',cancel:'not_requested',eof:false,aborted:false,abortFailed:false,released:false,releaseFailed:false,schedulerFailed:false,clockFailed:false,sequence:0,version:0};current=x;const owned=x;
      cleanup=Object.freeze({disposition:'in_progress',kind:null,reason:null,synthetic:true});
      void Promise.resolve(closedWork).then(()=>{owned.closed='fulfilled';changed(owned);},()=>{owned.closed='rejected';if(!owned.ended)fail(owned,'invalid_response');changed(owned);});
      void pump(x,a.value).catch(()=>{if(!owned.ended)fail(owned,'invalid_response');changed(owned);});
      for(;;){const v=check(x),version=x.version,report=terminal(x,v.now);if(report){cleanup=report;break;}
        await wait(x,version,x.cleanupDeadline??x.ioDeadline);}
      if(cleanup.disposition!=='confirmed'){gate.stop('cleanup_unconfirmed');revoke(x);return no('cleanup_unconfirmed');}
      if(gate.diagnostic().primary)return no(x.failure??'invalid_response');
      const finished=body.finish(a.value,{outcome:x.failure==='attempt_deadline_exceeded'?'retryable':x.failure?'unavailable':'success',eof:x.eof&&!x.revoked,pending_read:false,cancel:x.revoked?'fulfilled':'not_requested',closed:'fulfilled',lock:'released'});
      if(!finished.ok)return finished;if(x.failure)return no(x.failure);if(!finished.value.candidate)return no('invalid_response');
      return body.consume(finished.value.candidate);
    }catch{gate.stop('internal_review_error');if(x){revoke(x);cleanup=Object.freeze({disposition:'unconfirmed',kind:null,reason:'observation_invalid',synthetic:true});}return no('internal_review_error');}
    finally{if(x){x.ended=true;x.wake?.();release(x);}current=undefined;busy=false;if(closing)gate.close();}
  }
  const delegate=<T>(work:()=>ClosedAccountingResult<T>)=>{const v=work();const p=gate.diagnostic().primary;if(p&&current)fail(current,p.code);return v;};
  return Object.freeze({read,openPurpose:(raw:unknown)=>delegate(()=>port.openPurpose(raw)),admitTable:(raw:unknown)=>delegate(()=>port.admitTable(raw)),
    finalSlots:()=>Object.freeze({parent:port.parentFinal,metadata:port.metadataFinal}),
    enterFinal:()=>delegate(()=>port.enterFinal()),openFinal:(slot:Parameters<typeof port.openFinal>[0])=>delegate(()=>port.openFinal(slot)),skipFinal:(slot:Parameters<typeof port.skipFinal>[0])=>delegate(()=>port.skipFinal(slot)),
    cancel(){stop('cancelled');},close(){closing=true;stop('closed');if(!busy)gate.close();},
    status(){return Object.freeze({...port.stats(),active:busy,cleanup,attempt_failure:attemptFailure,operations:Object.freeze({...counts}),primary:gate.diagnostic().primary,formal_issuance:'disabled' as const});},
  });
}
