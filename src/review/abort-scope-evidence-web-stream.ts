/** Development-only real Web Streams operations over an injected source. Never calls global fetch. */
import { createSessionBoundFakeTransport,createBootstrapBoundFakeTransport } from './abort-scope-evidence-transport-budget.js';
import type { PreparedEvidenceOwner } from './abort-scope-evidence-fixture-lifecycle.js';
import type { FakeAttemptClaim,FakeAttemptIo,FakeIoObservation,FakePurposePermit,FakeDispatchRequest,FakeAttemptTiming,FakeTransportIo } from './abort-scope-evidence-transport-state.js';
export type FixtureStreamSource=(request:FakeDispatchRequest,signal:AbortSignal)=>Response|Promise<Response>;
type Machine=Extract<ReturnType<typeof createSessionBoundFakeTransport>,{ok:true}>['value']['machine'];
type Resource={state:FakeIoObservation;timing:FakeAttemptTiming;controller:AbortController;body?:ReadableStream<Uint8Array>|null;
  reader?:ReadableStreamDefaultReader<Uint8Array>;claim?:FakeAttemptClaim;version:number;wake?:()=>void;ended:boolean;
  cancelled:boolean;released:boolean;aborted:boolean;scratch?:Uint8Array;size:number;sequence:number;text?:string;decodeFailed:boolean;cap:number;capture:boolean};
export function createFixtureWebStreamTransport(session:object,owner:PreparedEvidenceOwner,source:FixtureStreamSource){
  return createWebStreamTransport(source,io=>createSessionBoundFakeTransport(session,owner,io));
}
export function createFixtureOAuthWebStreamTransport(session:object,source:FixtureStreamSource){
  return createWebStreamTransport(source,io=>createBootstrapBoundFakeTransport(session,io));
}
function createWebStreamTransport(source:FixtureStreamSource,bind:(io:FakeTransportIo)=>ReturnType<typeof createSessionBoundFakeTransport>){
  if(typeof source!=='function')return {ok:false as const,code:'invalid_input'};
  let machine!:Machine,current:Resource|undefined,busy=false;
  const responses=new WeakSet<Response>(),streams=new WeakSet<ReadableStream>();
  const counts={reads:0,cancels:0,releases:0,aborts:0,timers:0,peak_retained_bytes:0};let unconfirmed=false;
  function changed(r:Resource){r.version++;r.wake?.();if(r.ended)lateCleanup(r);}
  function release(r:Resource){
    if(r.released)return;if(!r.reader||r.state.pending_read)throw Error('release_unavailable');
    r.released=true;counts.releases++;r.reader.releaseLock();
  }
  function cancel(r:Resource){
    if(r.cancelled)return;r.cancelled=true;counts.cancels++;r.state.cancel='pending';
    try{
      const work=r.reader?r.reader.cancel():r.body?.cancel();
      if(!work)throw Error('cancel_unavailable');
      void Promise.resolve(work).then(()=>{r.state.cancel='fulfilled';changed(r);},()=>{r.state.cancel='rejected';changed(r);});
    }catch{r.state.cancel='rejected';}
    changed(r);
  }
  function lateCleanup(r:Resource){
    // Best effort after an unconfirmed terminal result; never changes that result or grants a receipt.
    if(r.body&&!r.state.eof&&!r.released&&!r.cancelled&&r.state.body!=='unknown_lock')cancel(r);
    if(r.reader&&!r.released&&!r.state.pending_read&&r.state.closed!=='pending')try{release(r);}catch{/* sticky uncertainty */}
  }
  async function pump(r:Resource){
    const reader=r.reader!;
    while(!r.ended&&!r.cancelled&&!r.controller.signal.aborted){
      let item:ReadableStreamReadResult<Uint8Array>;
      try{r.state.pending_read=true;counts.reads++;changed(r);item=await reader.read();}
      catch{r.state.pending_read=false;r.state.read_failed=true;changed(r);return;}
      r.state.pending_read=false;
      if(r.ended){changed(r);return;}
      if(item.done){
        r.state.eof=true;
        if(r.capture)try{r.text=new TextDecoder('utf-8',{fatal:true}).decode(r.scratch?.subarray(0,r.size)??new Uint8Array());}catch{r.decodeFailed=true;}
        changed(r);return;
      }
      const charged=machine.chunk(r.claim!,r.sequence++,item.value);changed(r);
      if(!charged.ok)return;
      if(r.capture){
        try{
          r.scratch??=new Uint8Array(r.cap);counts.peak_retained_bytes=Math.max(counts.peak_retained_bytes,r.scratch.byteLength);
          r.scratch.set(item.value,r.size);r.size+=item.value.byteLength;
        }catch{r.state.read_failed=true;changed(r);return;}
      }
    }
  }
  function received(r:Resource,response:Response){
    const status=response.status;r.state.fetch='fulfilled';r.state.status=status;r.capture=status>=200&&status<300;
    const body=response.body;r.body=body;
    if(responses.has(response)||body&&streams.has(body)){r.state.body='unknown_lock';changed(r);return;}
    responses.add(response);if(body)streams.add(body);
    if(!body){r.state.body='none';changed(r);return;}
    if(body.locked){r.state.body='unknown_lock';changed(r);return;}
    r.state.body='unlocked';
    if(r.ended||r.controller.signal.aborted){changed(r);return;}
    const terminal=status<200||status>=300&&status!==429&&status<500;
    if(terminal){changed(r);return;}
    try{
      r.reader=body.getReader();r.state.body='reader';r.state.closed='pending';
      // Capture before releaseLock, and observe both settlement paths immediately.
      void r.reader.closed.then(()=>{r.state.closed='fulfilled';changed(r);},()=>{r.state.closed='rejected';changed(r);});
      changed(r);void pump(r).catch(()=>{r.state.pending_read=false;r.state.read_failed=true;machine.stop('closed');changed(r);});
    }catch{r.state.body='unknown_lock';changed(r);}
  }
  const bound=bind({dispatch(request,timing):FakeAttemptIo{
    const r:Resource={state:{fetch:'pending',status:null,body:'none',pending_read:false,eof:false,closed:null,cancel:'not_requested'},
      timing,controller:new AbortController(),version:0,ended:false,cancelled:false,released:false,aborted:false,size:0,sequence:0,
      decodeFailed:false,cap:timing.response_cap,capture:true};current=r;
    try{void Promise.resolve(source(request,r.controller.signal)).then(response=>{
      try{if(!(response instanceof Response))throw Error('invalid_response');received(r,response);}
      catch{r.state.body='unknown_lock';r.state.fetch='fulfilled';changed(r);}
    },()=>{r.state.fetch='rejected';changed(r);});}catch{r.state.fetch='rejected';changed(r);}
    return Object.freeze({snapshot:()=>({...r.state}),
      bodyText:()=>{if(r.decodeFailed||r.text===undefined)throw Error('invalid_response');return r.text;},
      cancel:()=>cancel(r),releaseLock:()=>release(r),abort:()=>{
        if(r.aborted)return;r.aborted=true;counts.aborts++;r.controller.abort();changed(r);
      }});
  }});
  if(!bound.ok)return bound;machine=bound.value.machine;
  function wait(r:Resource,version:number){
    if(r.version!==version)return Promise.resolve();
    return new Promise<void>(resolve=>{
      const now=r.timing.now(),end=now<r.timing.io_deadline?r.timing.io_deadline:r.timing.deadline;
      let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);counts.timers--;if(r.wake===finish)r.wake=undefined;resolve();};
      const timer=setTimeout(finish,Math.max(0,Math.ceil(end-now)));counts.timers++;r.wake=finish;
    });
  }
  return {ok:true as const,value:Object.freeze({machine,chargePayload:bound.value.chargePayload,stats:()=>Object.freeze({...counts,active:busy,
    retained_bytes:current?.scratch?.byteLength??0,cleanup_unconfirmed:unconfirmed,...bound.value.stats()}),
    handoffCheckpoint(){
      const checked=machine.handoffCheckpoint();if(!checked.ok)return checked;
      // Recheck actual adapter state after the clock callback; auth-ready alone is not finally completion.
      return !busy&&!current&&!unconfirmed&&counts.timers===0?{ok:true as const,value:true as const}:{ok:false as const,code:'invalid_state' as const};
    },
    async run(permit:FakePurposePermit){
      if(busy)return {ok:false as const,code:'invalid_state'};busy=true;let r:Resource|undefined;
      try{
        const started=machine.begin(permit);r=current;
        if(!started.ok){if(r){unconfirmed=true;r.ended=true;lateCleanup(r);}return started;}
        r!.claim=started.value;
        for(;;){const version=r!.version,result=machine.poll(started.value);
          if(!result.ok)return result;
          if(result.value.state==='settled'){
            const c=machine.cleanupInfo(result.value.cleanup);if(!c.ok||c.value.disposition==='unconfirmed')unconfirmed=true;
            return {ok:true as const,value:result.value};
          }
          await wait(r!,version);
        }
      }catch{
        unconfirmed=true;machine.stop('closed');return {ok:false as const,code:'internal_review_error'};
      }finally{
        busy=false;if(r){r.ended=true;r.scratch=undefined;r.text=undefined;lateCleanup(r);if(current===r)current=undefined;}
      }
    },
  })};
}
