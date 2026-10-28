/** Closed synthetic supervisor with optional injected native Web Streams. No fetch, real session adoption or formal issuer. */
import {z} from 'zod';
import {types as nodeTypes} from 'node:util';
import {createFakeClosedBodyGate} from './abort-scope-evidence-closed-body-gate.js';
import {closedAccountingSchema,closedAttemptPolicySchema,type ClosedReadPurpose,type ClosedStateCode,type ClosedAccountingResult} from './abort-scope-evidence-closed-read-state.js';
export interface ClosedAttemptClock{now():number;schedule(deadline:number,wake:()=>void):()=>void;}
export interface FakeClosedAttemptIo{
  read():Promise<{done:boolean;bytes?:Uint8Array}>;cancel():Promise<void>;closed:Promise<void>;abort():void;release():void;
}
const options=z.strictObject({session:z.strictObject({deadline_ms:z.number().int().min(1).max(60000).optional(),accounting:closedAccountingSchema.optional()}).default({}),policy:closedAttemptPolicySchema.default({timeout_ms:10000,cleanup_reserve_ms:250,max_empty_reads:16})}).refine(x=>!x.session.accounting?.attempt_policy);
const typedName=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),Symbol.toStringTag)!.get!;
const event=z.strictObject({done:z.boolean(),bytes:z.custom<Uint8Array>(value=>{try{return Reflect.apply(typedName,value,[])==='Uint8Array';}catch{return false;}}).optional()}).refine(x=>x.done?x.bytes===undefined:x.bytes!==undefined);
type Cleanup=Readonly<{disposition:'not_started'|'in_progress'|'confirmed'|'unconfirmed';kind:'eof'|'cancelled'|null;reason:'read_pending'|'cancel_pending'|'cancel_rejected'|'closed_pending'|'closed_rejected'|'release_failed'|'abort_failed'|'cleanup_deadline'|'scheduler_failed'|'observation_invalid'|'dispatch_pending'|'response_cancel_pending'|'response_cancel_rejected'|'response_ownership_unknown'|null;synthetic:true}>;
const get=<T>(r:ClosedAccountingResult<T>)=>{if(!r.ok)throw Error(r.code);return r.value;};
type HttpFailure=Readonly<{status:number;classification:'rate_limited'|'server_error'|'unauthorized'|'forbidden'|'redirect'|'unsupported_success'|'client_error'|'invalid_status';code:'upstream_unavailable'|'authentication_failed'|'access_denied'|'invalid_response';synthetic:true}>;
function classifyHttp(status:number):HttpFailure|null{
  if(status===200)return null;
  const classification:HttpFailure['classification']=status===429?'rate_limited':status>=500&&status<=599?'server_error':status===401?'unauthorized':status===403?'forbidden':status>=300&&status<400?'redirect':status>=200&&status<300?'unsupported_success':status>=400&&status<500?'client_error':'invalid_status';
  const code:HttpFailure['code']=classification==='rate_limited'||classification==='server_error'?'upstream_unavailable':classification==='unauthorized'?'authentication_failed':classification==='forbidden'?'access_denied':'invalid_response';
  return Object.freeze({status,classification,code,synthetic:true});
}
export function createFakeClosedAttemptSupervisor(clock:ClosedAttemptClock,raw:unknown={}){
  return createClosedAttemptCore(clock,raw).api;
}
function createClosedAttemptCore(clock:ClosedAttemptClock,raw:unknown={}){
  let config:z.infer<typeof options>;try{config=options.parse(structuredClone(raw));if(typeof clock.schedule!=='function')throw Error();}catch{throw Error('invalid_input');}
  const gate=createFakeClosedBodyGate(clock),s=get(gate.construct({...config.session,accounting:{...config.session.accounting,body_mode:'bytes',attempt_policy:config.policy}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),body=port.body!;
  type Resource={io:FakeClosedAttemptIo;deadline:number;ioDeadline:number;reserve:number;cleanupDeadline?:number;failure?:ClosedStateCode;revoked:boolean;ended:boolean;
    readPending:boolean;closed:'pending'|'fulfilled'|'rejected';cancel:'not_requested'|'pending'|'fulfilled'|'rejected';eof:boolean;aborted:boolean;abortFailed:boolean;released:boolean;releaseFailed:boolean;schedulerFailed:boolean;clockFailed:boolean;sequence:number;version:number;wake?:()=>void;expectedParentId?:string};
  type ResponseResource={deadline:number;ioDeadline:number;reserve:number;cleanupDeadline?:number;failure?:ClosedStateCode;revoked:boolean;ended:boolean;
    controller:AbortController;started:boolean;pending:boolean;cancel:'not_requested'|'pending'|'fulfilled'|'rejected';unknown:boolean;
    aborted:boolean;abortFailed:boolean;schedulerFailed:boolean;clockFailed:boolean;version:number;wake?:()=>void;adopted?:Resource;httpRetryable:boolean};
  let current:Resource|ResponseResource|undefined,busy=false,closing=false,attemptFailure:ClosedStateCode|null=null;
  let cleanup:Cleanup=Object.freeze({disposition:'not_started',kind:null,reason:null,synthetic:true});
  let httpFailure:HttpFailure|null=null,lastHttpFailure:HttpFailure|null=null;
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
  function stop(code:ClosedStateCode){gate.stop(code);if(current){if('io' in current)fail(current,code);else failResponse(current,code);}}
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
  function wait(x:Resource|ResponseResource,version:number,deadline:number,onFailure:(code:ClosedStateCode)=>void=code=>fail(x as Resource,code)){
    if(version!==x.version)return Promise.resolve();
    return new Promise<void>(resolve=>{
      let done=false,dispose:(()=>void)|undefined;counts.timers++;
      const wake=()=>{if(done)return;done=true;counts.timers--;if(x.wake===wake)x.wake=undefined;
        try{dispose?.();}catch{x.schedulerFailed=true;onFailure('internal_review_error');}resolve();};x.wake=wake;
      try{dispose=clock.schedule(deadline,()=>{if(x.ended||done)return;const v=observe();if(v.now===null||v.now<deadline){x.schedulerFailed=true;onFailure('internal_review_error');}wake();});
        if(typeof dispose!=='function')throw Error();if(done)dispose();}
      catch{x.schedulerFailed=true;onFailure('internal_review_error');wake();}
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
  async function superviseBody(x:Resource,a:Parameters<typeof body.append>[0]){
    const owned=x;
    cleanup=Object.freeze({disposition:'in_progress',kind:null,reason:null,synthetic:true});
    void Promise.resolve(x.io.closed).then(()=>{owned.closed='fulfilled';changed(owned);},()=>{owned.closed='rejected';if(!owned.ended)fail(owned,'invalid_response');changed(owned);});
    void pump(x,a).catch(()=>{if(!owned.ended)fail(owned,'invalid_response');changed(owned);});
    for(;;){const v=check(x),version=x.version,report=terminal(x,v.now);if(report){cleanup=report;break;}
      await wait(x,version,x.cleanupDeadline??x.ioDeadline);}
    if(cleanup.disposition!=='confirmed'){gate.stop('cleanup_unconfirmed');revoke(x);return no('cleanup_unconfirmed');}
    if(gate.diagnostic().primary)return no(x.failure??'invalid_response');
    const finished=body.finish(a,{outcome:x.failure==='attempt_deadline_exceeded'?'retryable':x.failure?'unavailable':'success',eof:x.eof&&!x.revoked,pending_read:false,cancel:x.revoked?'fulfilled':'not_requested',closed:'fulfilled',lock:'released'});
    if(!finished.ok)return finished;if(x.failure)return no(x.failure);if(!finished.value.candidate)return no('invalid_response');
    return body.consume(finished.value.candidate,x.expectedParentId);
  }
  async function readUsing(purpose:ClosedReadPurpose,acquire:()=>ClosedAccountingResult<FakeClosedAttemptIo>){
    const existing=gate.diagnostic().primary;if(existing)return no(existing.code);
    if(busy){stop('invalid_state');return no('invalid_state');}if(closing)return no('closed');busy=true;let x:Resource|undefined;
    try{
      const a=port.dispatch(purpose);if(!a.ok)return a;cleanup=Object.freeze({disposition:'not_started',kind:null,reason:null,synthetic:true});const w=port.attemptWindow(a.value);if(!w.ok)return w;
      const acquired=acquire();if(!acquired.ok){gate.stop(acquired.code);return no(acquired.code);}const io=acquired.value;
      if(!io){gate.stop('invalid_input');return no('invalid_input');}
      const readFn=io.read,cancelFn=io.cancel,abortFn=io.abort,releaseFn=io.release,closedWork=io.closed;
      if(typeof readFn!=='function'||typeof cancelFn!=='function'||typeof abortFn!=='function'||typeof releaseFn!=='function'||!closedWork){gate.stop('invalid_input');return no('invalid_input');}
      const pinned:FakeClosedAttemptIo=Object.freeze({read:()=>Reflect.apply(readFn,io,[]),cancel:()=>Reflect.apply(cancelFn,io,[]),abort:()=>Reflect.apply(abortFn,io,[]),release:()=>Reflect.apply(releaseFn,io,[]),closed:closedWork});
      x={io:pinned,deadline:w.value.deadline,ioDeadline:w.value.io_deadline,reserve:w.value.deadline-w.value.io_deadline,revoked:false,ended:false,readPending:false,closed:'pending',cancel:'not_requested',eof:false,aborted:false,abortFailed:false,released:false,releaseFailed:false,schedulerFailed:false,clockFailed:false,sequence:0,version:0};current=x;
      return await superviseBody(x,a.value);
    }catch{gate.stop('internal_review_error');if(x){revoke(x);cleanup=Object.freeze({disposition:'unconfirmed',kind:null,reason:'observation_invalid',synthetic:true});}return no('internal_review_error');}
    finally{if(x){x.ended=true;x.wake?.();release(x);}current=undefined;busy=false;if(closing)gate.close();}
  }
  function responseChanged(x:ResponseResource){x.version++;x.wake?.();}
  function failResponse(x:ResponseResource,code:ClosedStateCode,global=true){
    x.failure??=code;if(global)gate.stop(code);else attemptFailure??=code;x.revoked=true;
    if(x.cleanupDeadline===undefined){const v=observe();if(v.now===null)x.clockFailed=true;x.cleanupDeadline=Math.min(x.deadline,(v.now??x.deadline)+x.reserve);}
    if(!x.aborted){x.aborted=true;counts.aborts++;try{x.controller.abort();}catch{x.abortFailed=true;}}
    responseChanged(x);
  }
  async function responseUsing(purpose:ClosedReadPurpose,start:(signal:AbortSignal)=>Response|Promise<Response>,expectedUrl:string,adoptBody:boolean,expectedParentId?:string){
    const existing=gate.diagnostic().primary;if(existing)return no(existing.code);
    if(busy){stop('invalid_state');return no('invalid_state');}if(closing)return no('closed');busy=true;let x:ResponseResource|undefined;
    try{
      const controller=new AbortController(),a=port.dispatch(purpose);if(!a.ok)return a;
      const w=port.attemptWindow(a.value);if(!w.ok)return w;
      x={controller,deadline:w.value.deadline,ioDeadline:w.value.io_deadline,reserve:w.value.deadline-w.value.io_deadline,
        revoked:false,ended:false,started:false,pending:false,cancel:'not_requested',unknown:false,aborted:false,abortFailed:false,schedulerFailed:false,clockFailed:false,version:0,httpRetryable:false};
      current=x;const owned=x;cleanup=Object.freeze({disposition:'in_progress',kind:null,reason:null,synthetic:true});
      const check=()=>{const v=observe();if(v.now===null){owned.clockFailed=true;failResponse(owned,'internal_review_error');}
        else if(v.primary&&!owned.revoked)failResponse(owned,v.primary);
        else if(owned.pending&&!owned.revoked&&v.now>=owned.ioDeadline)failResponse(owned,'attempt_deadline_exceeded',false);
        return v.now;};
      const disposeResponse=(raw:unknown)=>{
        const now=owned.ended?null:check();owned.pending=false;
        if(!adoptBody&&owned.cleanupDeadline===undefined)owned.cleanupDeadline=Math.min(owned.deadline,(now??owned.deadline)+owned.reserve);
        try{
          if(!raw||nodeTypes.isProxy(raw))throw Error();
          const status=Reflect.apply(responseStatus,raw,[]) as number,body=Reflect.apply(responseBody,raw,[]) as ReadableStream<Uint8Array>|null;
          const used=Reflect.apply(responseUsed,raw,[]) as boolean,url=Reflect.apply(responseUrl,raw,[]) as string;
          // Ownership first: a foreign, replayed or used Response must not become HTTP or auth evidence.
          if(claimedResponses.has(raw as Response)||used||body&&(Reflect.apply(nativeLocked,body,[])||claimedStreams.has(body))){owned.unknown=true;if(!owned.ended)failResponse(owned,'evidence_binding_mismatch');return;}
          claimedResponses.add(raw as Response);if(body)claimedStreams.add(body);
          if(!owned.revoked&&!owned.ended){
            if(url!==''&&url!==expectedUrl)failResponse(owned,'invalid_response');
            else if(adoptBody){const http=classifyHttp(status);if(http){httpFailure??=http;lastHttpFailure=http;owned.httpRetryable=http.code==='upstream_unavailable';failResponse(owned,http.code,!owned.httpRetryable);}else if(!body)failResponse(owned,'invalid_response');}
            else if(status!==200||!body)failResponse(owned,'invalid_response');
          }
          if(!body)return;
          if(adoptBody&&!owned.revoked&&!owned.ended){
            const reader=Reflect.apply(nativeGetReader,body,[]) as ReadableStreamDefaultReader<Uint8Array>;
            const closed=Reflect.apply(nativeClosed,reader,[]) as Promise<void>;
            const io:FakeClosedAttemptIo=Object.freeze({read:()=> (Reflect.apply(nativeRead,reader,[]) as Promise<ReadableStreamReadResult<Uint8Array>>).then(item=>item.done?{done:true}:{done:false,bytes:item.value}),
              cancel:()=>Reflect.apply(nativeCancel,reader,[]) as Promise<void>,closed,abort:()=>owned.controller.abort(),release(){Reflect.apply(nativeRelease,reader,[]);}});
            owned.adopted={io,deadline:owned.deadline,ioDeadline:owned.ioDeadline,reserve:owned.reserve,revoked:false,ended:false,readPending:false,closed:'pending',cancel:'not_requested',eof:false,
              aborted:false,abortFailed:false,released:false,releaseFailed:false,schedulerFailed:false,clockFailed:false,sequence:0,version:0,expectedParentId};current=owned.adopted;
            return;
          }
          if(owned.cleanupDeadline===undefined)owned.cleanupDeadline=Math.min(owned.deadline,(now??owned.deadline)+owned.reserve);
          owned.cancel='pending';counts.cancels++;
          try{void (Reflect.apply(nativeStreamCancel,body,[]) as Promise<void>).then(()=>{owned.cancel='fulfilled';responseChanged(owned);},()=>{owned.cancel='rejected';responseChanged(owned);});}
          catch{owned.cancel='rejected';}
        }catch{owned.unknown=true;if(!owned.ended)failResponse(owned,'invalid_response');}
        finally{responseChanged(owned);}
      };
      if(check()!==null&&!owned.revoked){owned.started=true;owned.pending=true;
        try{const work=start(controller.signal),rejected=()=>{owned.pending=false;if(!owned.ended&&!owned.revoked)failResponse(owned,'upstream_unavailable');responseChanged(owned);};
          if(nodeTypes.isPromise(work))void Reflect.apply(Promise.prototype.then,work,[disposeResponse,rejected]);else disposeResponse(work);}
        catch{owned.pending=false;failResponse(owned,'upstream_unavailable');}
      }
      for(;;){if(owned.adopted){
          const adopted=owned.adopted;adopted.schedulerFailed||=owned.schedulerFailed;adopted.clockFailed||=owned.clockFailed;adopted.abortFailed||=owned.abortFailed;adopted.aborted||=owned.aborted;
          if(owned.revoked){adopted.cleanupDeadline??=owned.cleanupDeadline;fail(adopted,owned.failure??'internal_review_error');}
          return await superviseBody(adopted,a.value);
        }
        const now=check(),version=owned.version;let reason:Cleanup['reason']=null;
        if(owned.schedulerFailed)reason='scheduler_failed';else if(owned.clockFailed)reason='observation_invalid';else if(owned.abortFailed)reason='abort_failed';
        else if(owned.unknown)reason='response_ownership_unknown';else if(owned.cancel==='rejected')reason='response_cancel_rejected';
        else if(now===null||now>=(owned.cleanupDeadline??owned.deadline))reason=owned.pending?'dispatch_pending':owned.cancel==='pending'?'response_cancel_pending':'cleanup_deadline';
        if(reason){cleanup=Object.freeze({disposition:'unconfirmed',kind:null,reason,synthetic:true});gate.stop('cleanup_unconfirmed');failResponse(owned,'cleanup_unconfirmed');return no('cleanup_unconfirmed');}
        if(!owned.pending&&owned.cancel!=='pending'){
          cleanup=Object.freeze({disposition:owned.started?'confirmed':'not_started',kind:owned.cancel==='fulfilled'?'cancelled':null,reason:null,synthetic:true});
          if(gate.diagnostic().primary)return no(owned.failure??'invalid_response');
          const settled=port.finishUnopened(a.value,owned.failure==='attempt_deadline_exceeded'||owned.httpRetryable?'retryable':'unavailable');if(!settled.ok)return settled;
          if(owned.failure)return no(owned.failure);
          return Object.freeze({ok:true as const,value:Object.freeze({response_wait_completed:true as const,body_adopted:false as const,synthetic:true as const,evidence_issuance:'disabled' as const})});
        }
        await wait(owned,version,owned.cleanupDeadline??owned.ioDeadline,code=>failResponse(owned,code));
      }
    }catch{gate.stop('internal_review_error');if(x){if(x.adopted)fail(x.adopted,'internal_review_error');else failResponse(x,'internal_review_error');}cleanup=Object.freeze({disposition:'unconfirmed',kind:null,reason:'observation_invalid',synthetic:true});return no('internal_review_error');}
    finally{if(x){x.ended=true;x.wake?.();if(x.adopted){x.adopted.ended=true;x.adopted.wake?.();release(x.adopted);}}current=undefined;busy=false;if(closing)gate.close();}
  }
  const delegate=<T>(work:()=>ClosedAccountingResult<T>)=>{const v=work();const p=gate.diagnostic().primary;if(p&&current)stop(p.code);return v;};
  const api=Object.freeze({read:(purpose:ClosedReadPurpose,io:FakeClosedAttemptIo)=>readUsing(purpose,()=>Object.freeze({ok:true,value:io})),openPurpose:(raw:unknown)=>delegate(()=>port.openPurpose(raw)),admitTable:(raw:unknown)=>delegate(()=>port.admitTable(raw)),
    finalSlots:()=>Object.freeze({parent:port.parentFinal,metadata:port.metadataFinal}),
    enterFinal:()=>delegate(()=>port.enterFinal()),openFinal:(slot:Parameters<typeof port.openFinal>[0])=>delegate(()=>port.openFinal(slot)),skipFinal:(slot:Parameters<typeof port.skipFinal>[0])=>delegate(()=>port.skipFinal(slot)),
    cancel(){stop('cancelled');},close(){closing=true;stop('closed');if(!busy)gate.close();},
    status(){return Object.freeze({...port.stats(),active:busy,cleanup,attempt_failure:attemptFailure,http_failure:httpFailure,last_http_failure:lastHttpFailure,operations:Object.freeze({...counts}),primary:gate.diagnostic().primary,formal_issuance:'disabled' as const});},
  });
  type BodySummary=Extract<ReturnType<typeof body.consume>,{ok:true}>['value'];
  type WaitSummary=Readonly<{response_wait_completed:true;body_adopted:false;synthetic:true;evidence_issuance:'disabled'}>;
  return Object.freeze({api,readUsing,
    waitResponseUsing:async(p:ClosedReadPurpose,start:(signal:AbortSignal)=>Response|Promise<Response>,url:string)=>await responseUsing(p,start,url,false) as ClosedAccountingResult<WaitSummary>,
    readResponseUsing:async(p:ClosedReadPurpose,start:(signal:AbortSignal)=>Response|Promise<Response>,url:string,parentId:string)=>await responseUsing(p,start,url,true,parentId) as ClosedAccountingResult<BodySummary>,
    reject:(code:ClosedStateCode)=>{stop(code);return no(code);}});
}

declare const parentRequestBrand:unique symbol;
export type FakeClosedParentRequest={readonly [parentRequestBrand]:'fake_closed_parent_request'};
export type FakeClosedParentGet=Readonly<{method:'GET';url:string;purpose:'parent_initial'|'parent_final';ordinal:1|2;synthetic:true}>;
const parentOptions=z.strictObject({update_set_sys_id:z.string().regex(/^[a-f0-9]{32}$/),session:options.shape.session.optional(),policy:closedAttemptPolicySchema.optional()});
function fixedParentUrl(id:string){const query=new URLSearchParams({sysparm_fields:'sys_id,state,application,sys_updated_on,sys_mod_count',sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});return `https://closed-dispatch.invalid/api/now/table/sys_update_set/${id}?${query}`;}
/** CD-01: fixture-only synchronous dispatcher; not a Response/fetch adoption interface. */
export function createFakeClosedParentDispatcher(clock:ClosedAttemptClock,
  dispatcher:(request:FakeClosedParentGet,signal:AbortSignal,authContext:object)=>FakeClosedAttemptIo,raw:unknown){
  const schema=parentOptions;
  let config:z.infer<typeof schema>;try{config=schema.parse(structuredClone(raw));if(typeof dispatcher!=='function')throw Error();}catch{throw Error('invalid_input');}
  // Same single-record parent read as production bounded-source fetchParent and TC-04; not the old fixture list query.
  const url=fixedParentUrl(config.update_set_sys_id);
  const core=createClosedAttemptCore(clock,{session:config.session,policy:config.policy});
  const authContext=Object.freeze(Object.create(null)) as object;
  type Request={purpose:ClosedReadPurpose;kind:FakeClosedParentGet['purpose'];state:'ready'|'running'|'done';attempts:number};
  const requests=new WeakMap<FakeClosedParentRequest,Request>();let dispatches=0;
  const make=(purpose:ClosedReadPurpose,kind:Request['kind'])=>{const h=Object.freeze(Object.create(null)) as FakeClosedParentRequest;requests.set(h,{purpose,kind,state:'ready',attempts:0});return Object.freeze({ok:true as const,value:h});};
  const reject=(code:ClosedStateCode)=>core.reject(code);
  return Object.freeze({
    initial(){const p=core.api.openPurpose({kind:'parent_initial'});return p.ok?make(p.value,'parent_initial'):p;},
    final(){const entered=core.api.enterFinal();if(!entered.ok)return entered;const p=core.api.openFinal(core.api.finalSlots().parent);return p.ok?make(p.value,'parent_final'):p;},
    async read(handle:FakeClosedParentRequest){
      const r=requests.get(handle);if(!r)return reject('evidence_binding_mismatch');if(r.state!=='ready')return reject('invalid_state');
      if(r.attempts>=2){r.state='done';return reject('invalid_state');}
      r.state='running';let controller:AbortController;
      try{controller=new AbortController();}catch{r.state='done';return reject('internal_review_error');}
      const request:FakeClosedParentGet=Object.freeze({method:'GET',url,purpose:r.kind,ordinal:(r.attempts+1) as 1|2,synthetic:true});
      const result=await core.readUsing(r.purpose,()=>{
        r.attempts++;
        dispatches++;let io:FakeClosedAttemptIo;
        try{io=dispatcher(request,controller.signal,authContext);}catch{return Object.freeze({ok:false,code:'upstream_unavailable'});}
        if(!io||nodeTypes.isProxy(io))return Object.freeze({ok:false,code:'invalid_input'});
        if(nodeTypes.isPromise(io)){void Reflect.apply(Promise.prototype.then,io,[()=>{},()=>{}]);return Object.freeze({ok:false,code:'invalid_input'});}
        const field=(key:keyof FakeClosedAttemptIo)=>{const d=Object.getOwnPropertyDescriptor(io,key);return d&&'value' in d?d.value:undefined;};
        const read=field('read'),cancel=field('cancel'),abort=field('abort'),release=field('release'),closed=field('closed');
        if(typeof read!=='function'||typeof cancel!=='function'||typeof abort!=='function'||typeof release!=='function'||!nodeTypes.isPromise(closed)){
          if(nodeTypes.isPromise(closed))void Reflect.apply(Promise.prototype.then,closed,[()=>{},()=>{}]);
          return Object.freeze({ok:false,code:'invalid_input'});
        }
        // Fulfillment payloads are validated by the existing pump; cleanup only observes promise settlement.
        return Object.freeze({ok:true,value:Object.freeze({read:()=>Reflect.apply(read,io,[]) as ReturnType<FakeClosedAttemptIo['read']>,cancel:()=>Reflect.apply(cancel,io,[]) as Promise<void>,closed:closed as Promise<void>,
          abort(){controller.abort();Reflect.apply(abort,io,[]);},release(){Reflect.apply(release,io,[]);}})});
      });
      if(!result.ok&&!controller.signal.aborted)controller.abort();
      const status=core.api.status();r.state=!result.ok&&result.code==='attempt_deadline_exceeded'&&!status.primary&&status.cleanup.disposition==='confirmed'?'ready':'done';return result;
    },
    cancel:()=>core.api.cancel(),close:()=>core.api.close(),status:()=>Object.freeze({...core.api.status(),dispatches}),
  });
}

/** CD-02: wait/discard only, never hands a Response or body to a caller/reader. */
export function createInjectedClosedParentResponseWait(clock:ClosedAttemptClock,
  dispatcher:(request:FakeClosedParentGet,signal:AbortSignal,authContext:object)=>Response|Promise<Response>,raw:unknown){
  let config:z.infer<typeof parentOptions>;try{config=parentOptions.parse(structuredClone(raw));if(typeof dispatcher!=='function')throw Error();}catch{throw Error('invalid_input');}
  const url=fixedParentUrl(config.update_set_sys_id),authContext=Object.freeze(Object.create(null)) as object;
  const core=createClosedAttemptCore(clock,{session:config.session,policy:config.policy});
  const requests=new WeakMap<FakeClosedParentRequest,{purpose:ClosedReadPurpose;attempts:number;state:'ready'|'running'|'done'}>();let dispatches=0;
  return Object.freeze({initial(){const p=core.api.openPurpose({kind:'parent_initial'});if(!p.ok)return p;
    const h=Object.freeze(Object.create(null)) as FakeClosedParentRequest;requests.set(h,{purpose:p.value,attempts:0,state:'ready'});return Object.freeze({ok:true as const,value:h});},
    async wait(handle:FakeClosedParentRequest){const r=requests.get(handle);if(!r)return core.reject('evidence_binding_mismatch');
      if(r.state!=='ready'||r.attempts>=2)return core.reject('invalid_state');r.state='running';
      const request:FakeClosedParentGet=Object.freeze({method:'GET',url,purpose:'parent_initial',ordinal:(r.attempts+1) as 1|2,synthetic:true});
      const result=await core.waitResponseUsing(r.purpose,signal=>{r.attempts++;dispatches++;return dispatcher(request,signal,authContext);},url);
      const status=core.api.status();r.state=!result.ok&&result.code==='attempt_deadline_exceeded'&&!status.primary&&status.cleanup.disposition==='confirmed'?'ready':'done';return result;
    },cancel:()=>core.api.cancel(),close:()=>core.api.close(),status:()=>Object.freeze({...core.api.status(),dispatches}),
  });
}

/** CD-03: same-attempt Response-to-reader adoption, synthetic parent summaries only. */
export function createInjectedClosedParentResponseReader(clock:ClosedAttemptClock,
  dispatcher:(request:FakeClosedParentGet,signal:AbortSignal,authContext:object)=>Response|Promise<Response>,raw:unknown){
  let config:z.infer<typeof parentOptions>;try{config=parentOptions.parse(structuredClone(raw));if(typeof dispatcher!=='function')throw Error();}catch{throw Error('invalid_input');}
  const url=fixedParentUrl(config.update_set_sys_id),authContext=Object.freeze(Object.create(null)) as object;
  const core=createClosedAttemptCore(clock,{session:config.session,policy:config.policy});
  const requests=new WeakMap<FakeClosedParentRequest,{purpose:ClosedReadPurpose;kind:FakeClosedParentGet['purpose'];attempts:number;state:'ready'|'running'|'done'}>();let dispatches=0;
  const make=(purpose:ClosedReadPurpose,kind:FakeClosedParentGet['purpose'])=>{const h=Object.freeze(Object.create(null)) as FakeClosedParentRequest;requests.set(h,{purpose,kind,attempts:0,state:'ready'});return Object.freeze({ok:true as const,value:h});};
  return Object.freeze({initial(){const p=core.api.openPurpose({kind:'parent_initial'});return p.ok?make(p.value,'parent_initial'):p;},
    final(){const entered=core.api.enterFinal();if(!entered.ok)return entered;const p=core.api.openFinal(core.api.finalSlots().parent);return p.ok?make(p.value,'parent_final'):p;},
    async read(handle:FakeClosedParentRequest){const r=requests.get(handle);if(!r)return core.reject('evidence_binding_mismatch');
      if(r.state!=='ready'||r.attempts>=2)return core.reject('invalid_state');r.state='running';
      const request:FakeClosedParentGet=Object.freeze({method:'GET',url,purpose:r.kind,ordinal:(r.attempts+1) as 1|2,synthetic:true});
      const result=await core.readResponseUsing(r.purpose,signal=>{r.attempts++;dispatches++;return dispatcher(request,signal,authContext);},url,config.update_set_sys_id);
      const status=core.api.status();r.state=!result.ok&&(result.code==='attempt_deadline_exceeded'||result.code==='upstream_unavailable')&&r.attempts<2&&!status.primary&&status.cleanup.disposition==='confirmed'?'ready':'done';return result;
    },cancel:()=>core.api.cancel(),close:()=>core.api.close(),status:()=>Object.freeze({...core.api.status(),dispatches}),
  });
}

// Fixture-only ownership registry; never shared with production session/transport claims.
const claimedStreams=new WeakSet<object>();
const claimedResponses=new WeakSet<Response>();
const responseStatus=Object.getOwnPropertyDescriptor(Response.prototype,'status')!.get!,responseBody=Object.getOwnPropertyDescriptor(Response.prototype,'body')!.get!;
const responseUsed=Object.getOwnPropertyDescriptor(Response.prototype,'bodyUsed')!.get!,responseUrl=Object.getOwnPropertyDescriptor(Response.prototype,'url')!.get!;
const nativeStreamCancel=ReadableStream.prototype.cancel;
const nativeLocked=Object.getOwnPropertyDescriptor(ReadableStream.prototype,'locked')!.get!,nativeGetReader=ReadableStream.prototype.getReader;
const nativeRead=ReadableStreamDefaultReader.prototype.read,nativeCancel=ReadableStreamDefaultReader.prototype.cancel,nativeRelease=ReadableStreamDefaultReader.prototype.releaseLock;
const nativeClosed=Object.getOwnPropertyDescriptor(ReadableStreamDefaultReader.prototype,'closed')!.get!;

/** Only injected streams are accepted. Acquisition happens in the same private post-dispatch continuation. */
export function createInjectedClosedStreamSupervisor(clock:ClosedAttemptClock,raw:unknown={}){
  const core=createClosedAttemptCore(clock,raw),counts={claims:0,reads:0,cancels:0,releases:0,closed_captures:0,aborts:0,active_readers:0};
  function acquire(stream:ReadableStream<Uint8Array>):ClosedAccountingResult<FakeClosedAttemptIo>{
    try{
      // Native brand/lock checks do not invoke caller getters or getReader overrides.
      if(nodeTypes.isProxy(stream))return Object.freeze({ok:false,code:'invalid_input'});
      const locked=Reflect.apply(nativeLocked,stream,[]) as boolean;
      if(locked||claimedStreams.has(stream))return Object.freeze({ok:false,code:'evidence_binding_mismatch'});
      claimedStreams.add(stream);
      const reader=Reflect.apply(nativeGetReader,stream,[]) as ReadableStreamDefaultReader<Uint8Array>;counts.claims++;counts.active_readers++;
      const closed=Reflect.apply(nativeClosed,reader,[]) as Promise<void>;counts.closed_captures++;
      return Object.freeze({ok:true,value:Object.freeze({
        read(){counts.reads++;return (Reflect.apply(nativeRead,reader,[]) as Promise<ReadableStreamReadResult<Uint8Array>>).then(item=>item.done?{done:true}:{done:false,bytes:item.value});},
        cancel(){counts.cancels++;return Reflect.apply(nativeCancel,reader,[]) as Promise<void>;},closed,
        // No fetch/signal is connected here: native reader.cancel is the only interruption; abort only records the request.
        abort(){counts.aborts++;},
        release(){counts.releases++;Reflect.apply(nativeRelease,reader,[]);counts.active_readers--;},
      })});
    }catch{return Object.freeze({ok:false,code:'invalid_input'});}
  }
  return Object.freeze({...core.api,read:(purpose:ClosedReadPurpose,stream:ReadableStream<Uint8Array>)=>core.readUsing(purpose,()=>acquire(stream)),
    status(){return Object.freeze({...core.api.status(),streams:Object.freeze({...counts})});},
  });
}
