/** TC-03 development-only Web Streams connection. No global fetch or evidence issuance. */
import {z} from 'zod';
import {createFakeRunTransportSession} from './abort-scope-evidence-run-transport.js';
import type {FakeCleanupAttempt} from './abort-scope-evidence-cleanup-contract.js';
export interface FakeStreamClock {now():number;schedule(deadline:number,wake:()=>void):()=>void;}
export type FakeStreamSource=(signal:AbortSignal)=>Response|Promise<Response>;
const optionsSchema=z.strictObject({session:z.unknown().default({}),request_timeout_ms:z.number().int().min(1).max(10000).default(10000),
  cleanup_reserve_ms:z.number().int().min(1).max(250).default(250),max_empty_reads:z.number().int().min(1).max(16).default(16)});
const typedLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength')!.get!;
type Observation={fetch:'not_started'|'pending'|'fulfilled'|'rejected';body:'none'|'unlocked'|'reader'|'unknown_lock';pending_read:boolean;eof:boolean;
  closed:'pending'|'fulfilled'|'rejected'|null;cancel:'not_requested'|'pending'|'fulfilled'|'rejected';lock:'not_owned'|'held'|'released'|'failed'|'unknown';abort_failed:boolean};
type Resource={state:Observation;controller:AbortController;reader?:ReadableStreamDefaultReader<Uint8Array>;body?:ReadableStream<Uint8Array>|null;
  attempt?:FakeCleanupAttempt;deadline:number;ioDeadline:number;dispatched:boolean;ended:boolean;cancelled:boolean;released:boolean;
  aborted:boolean;finalized:boolean;sequence:number;empty:number;version:number;wake?:()=>void};
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
export function createFakeRunStreamSession(clock:FakeStreamClock,source:FakeStreamSource,rawOptions:unknown={}){
  let options:z.infer<typeof optionsSchema>;
  try{options=optionsSchema.parse(structuredClone(rawOptions));if(typeof source!=='function'||typeof clock.schedule!=='function')throw Error();}catch{throw Error('invalid_input');}
  let current:Resource|undefined,busy=false;
  const counts={reads:0,cancels:0,releases:0,timers:0,aborts:0};
  const responses=new WeakSet<Response>(),streams=new WeakSet<ReadableStream<Uint8Array>>();
  const root=createFakeRunTransportSession(clock,{dispatch(){
    const r=current!;r.dispatched=true;r.state.fetch='pending';
    try{void Promise.resolve(source(r.controller.signal)).then(response=>received(r,response),()=>{r.state.fetch='rejected';changed(r);});}
    catch{r.state.fetch='rejected';changed(r);}
  },abort(){const r=current;if(!r||r.aborted)return;r.aborted=true;counts.aborts++;
    try{r.controller.abort();}catch{r.state.abort_failed=true;}cancel(r);changed(r);
  },stopWorker(){}},options.session);
  const transport=get(root.claimTransport());
  function changed(r:Resource){r.version++;r.wake?.();if(r.ended)lateCleanup(r);}
  function cancel(r:Resource){
    if(r.cancelled||r.state.eof||!r.body||r.state.body==='unknown_lock')return;
    r.cancelled=true;r.state.cancel='pending';counts.cancels++;
    try{const work=r.reader?r.reader.cancel():r.body.cancel();
      void Promise.resolve(work).then(()=>{r.state.cancel='fulfilled';changed(r);},()=>{r.state.cancel='rejected';changed(r);});
    }catch{r.state.cancel='rejected';}changed(r);
  }
  function release(r:Resource){
    if(r.released||!r.reader||r.state.pending_read||r.state.closed==='pending')return;
    r.released=true;counts.releases++;
    try{r.reader.releaseLock();r.state.lock='released';}catch{r.state.lock='failed';}changed(r);
  }
  function lateCleanup(r:Resource){cancel(r);release(r);}
  function checkpoint(r:Resource){
    const v=root.observeTransportClock();if(v.now===null){r.state.abort_failed=true;return v;}
    if(!v.stopped&&v.now>=r.ioDeadline)root.stop('upstream_unavailable');return v;
  }
  async function pump(r:Resource){
    while(!r.ended&&!r.aborted&&!r.cancelled){
      const before=checkpoint(r);if(before.now===null||root.status().primary)return;
      let item:ReadableStreamReadResult<Uint8Array>;
      try{r.state.pending_read=true;counts.reads++;changed(r);item=await r.reader!.read();}
      catch{r.state.pending_read=false;if(!r.ended)root.stop('invalid_response');changed(r);return;}
      r.state.pending_read=false;if(r.ended){changed(r);return;}
      const after=checkpoint(r);if(after.now===null||root.status().primary){changed(r);return;}
      if(item.done){r.state.eof=true;changed(r);return;}
      if(!(item.value instanceof Uint8Array)){root.stop('invalid_response');changed(r);return;}
      if(Reflect.apply(typedLength,item.value,[])===0&&++r.empty>options.max_empty_reads){root.stop('invalid_response');changed(r);return;}
      const charged=transport.chunk(r.attempt!,r.sequence++,item.value);changed(r);if(!charged.ok)return;
    }
  }
  function received(r:Resource,response:Response){
    try{
      r.state.fetch='fulfilled';if(!(response instanceof Response))throw Error();
      const body=response.body;r.body=body;
      if(responses.has(response)||body&&streams.has(body)){r.state.body='unknown_lock';r.state.lock='unknown';changed(r);return;}
      responses.add(response);if(body)streams.add(body);
      if(!body){r.state.body='none';if(!r.ended)root.stop('invalid_response');changed(r);return;}
      if(body.locked){r.state.body='unknown_lock';r.state.lock='unknown';changed(r);return;}
      r.state.body='unlocked';if(r.ended||r.aborted){cancel(r);changed(r);return;}
      if(response.status<200||response.status>=300){root.stop(response.status===401?'authentication_failed':response.status===403?'access_denied':'upstream_unavailable');cancel(r);changed(r);return;}
      r.reader=body.getReader();r.state.body='reader';r.state.lock='held';r.state.closed='pending';
      // Capture before read/cancel/release and immediately observe both settlement paths.
      void r.reader.closed.then(()=>{r.state.closed='fulfilled';changed(r);},()=>{r.state.closed='rejected';if(!r.ended)root.stop('invalid_response');changed(r);});
      changed(r);void pump(r).catch(()=>{if(!r.ended)root.stop('internal_review_error');r.state.pending_read=false;changed(r);});
    }catch{r.state.fetch='fulfilled';r.state.body='unknown_lock';r.state.lock='unknown';if(!r.ended)root.stop('invalid_response');changed(r);}
  }
  function wait(r:Resource,version:number,deadline:number){
    if(version!==r.version)return Promise.resolve();
    return new Promise<void>(resolve=>{
      let done=false,dispose:(()=>void)|undefined;counts.timers++;
      const wake=()=>{if(done)return;done=true;counts.timers--;if(r.wake===wake)r.wake=undefined;
        try{dispose?.();}catch{r.state.abort_failed=true;root.stop('internal_review_error');}resolve();};r.wake=wake;
      try{dispose=clock.schedule(deadline,wake);if(typeof dispose!=='function')throw Error();if(done)dispose();}
      catch{r.state.abort_failed=true;root.stop('internal_review_error');wake();}
    });
  }
  function settled(r:Resource){
    const s=r.state;if(s.fetch==='rejected'){root.stop('upstream_unavailable');return true;}if(s.fetch!=='fulfilled')return false;
    if(s.body==='unknown_lock'){root.stop('invalid_response');return true;}if(s.body==='none')return true;
    if(r.aborted)cancel(r);if(s.body==='reader')release(r);
    if(s.cancel==='rejected'||s.lock==='failed'||s.closed==='rejected'||s.abort_failed)return true;
    if(s.pending_read||s.cancel==='pending')return false;
    if(s.body==='reader')return s.closed==='fulfilled'&&s.lock==='released'&&(s.eof||s.cancel==='fulfilled');return s.cancel==='fulfilled';
  }
  return Object.freeze({
    async run(descriptor:unknown){
      if(busy){root.stop('internal_review_error');return {ok:false as const,code:'internal_review_error'};}busy=true;
      const r:Resource={state:{fetch:'not_started',body:'none',pending_read:false,eof:false,closed:null,cancel:'not_requested',lock:'not_owned',abort_failed:false},
        controller:new AbortController(),deadline:0,ioDeadline:Infinity,dispatched:false,ended:false,cancelled:false,released:false,aborted:false,finalized:false,sequence:0,empty:0,version:0};current=r;
      try{
        const initial=root.observeTransportClock();if(initial.now===null||initial.stopped)return {ok:false as const,code:root.status().primary?.code??'closed'};
        const remaining=Math.min(options.request_timeout_ms,initial.hard_deadline-initial.now),reserve=Math.min(options.cleanup_reserve_ms,Math.floor(remaining/4));
        if(reserve<=0){root.stop('deadline_exceeded');return {ok:false as const,code:root.status().primary!.code};}
        const prepared=structuredClone(descriptor),begun=transport.begin(prepared,options.request_timeout_ms);if(!begun.ok)return begun;
        r.attempt=begun.value;r.deadline=get(transport.attemptDeadline(r.attempt));r.ioDeadline=r.deadline-reserve;
        for(;;){const v=checkpoint(r),version=r.version;if(settled(r)||r.state.abort_failed||v.now===null||v.now>=r.deadline)break;
          await wait(r,version,r.aborted?r.deadline:r.ioDeadline);}
        r.finalized=true;transport.finishHttp(r.attempt,{...r.state});
        // No body capture/provenance is claimed; successful modeled payloads are discarded.
        if(!root.status().primary&&r.state.eof&&(prepared as {kind:string}).kind==='payload')transport.discardPayload(r.attempt);
        const failure=root.status().primary;return failure?{ok:false as const,code:failure.code}:{ok:true as const,value:Object.freeze({synthetic:true,evidence_issuance:'disabled' as const})};
      }catch{root.stop('internal_review_error');return {ok:false as const,code:root.status().primary?.code??'internal_review_error'};}
      finally{if(r.dispatched&&!r.finalized){r.finalized=true;if(r.attempt)transport.finishHttp(r.attempt,{...r.state});else transport.finishActiveHttp({...r.state});}
        r.ended=true;lateCleanup(r);r.wake?.();if(current===r)current=undefined;busy=false;}
    },
    cancel:root.cancel,finish(){return busy?root.stop('closed'):root.finish();},status:root.status,
    operations:()=>Object.freeze({...counts,active:busy}),
  });
}
