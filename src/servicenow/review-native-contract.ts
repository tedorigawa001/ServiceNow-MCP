/** NA-01 internal contract in isolated synthetic domains. No native operations or real-session adoption. */
import {z} from 'zod';
type Code='invalid_input'|'invalid_state'|'evidence_binding_mismatch'|'invalid_observation_time'|'deadline_exceeded'|'attempt_deadline_exceeded'|'cancelled'|'closed'|'internal_review_error';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
declare const brand:unique symbol;
type Handle<K extends string>={readonly [brand]:K};
type Identity=Handle<'synthetic_native_identity'>;
type Attempt=Handle<'native_attempt'>;
type Window=Handle<'native_window'>;
type ResponseDelivery=Handle<'response_delivery'>;
type Resource=Handle<'native_resource'>;
type PreRelease=Handle<'pre_release'>;
type EndEvidence=Handle<'native_end_evidence'>;
type CleanupReason='read_pending'|'cancel_pending'|'cancel_rejected'|'closed_pending'|'closed_rejected'|'reader_owner_unknown'|'lock_release_failed'|'cleanup_deadline'|'observation_invalid';
type Cleanup=Readonly<{disposition:'confirmed'|'unconfirmed';kind:'eof'|'cancelled'|'no_body'|null;reason:CleanupReason|null;synthetic:true}>;
type Budget={read():Readonly<{remaining_ms:number}>};
type IdentityKind='run'|'signal'|'response'|'stream'|'reader';
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const attemptSchema=z.strictObject({purpose:z.enum(['authentication','parent','release']),ordinal:z.union([z.literal(1),z.literal(2)]),io_floor_ms:z.number().finite().nonnegative(),cleanup_floor_ms:z.number().finite().nonnegative()});
const preSchema=z.strictObject({pending_read:z.boolean(),eof:z.boolean(),cancel:z.enum(['not_requested','pending','fulfilled','rejected']),closed:z.enum(['pending','fulfilled','rejected']),closed_captured:z.boolean()});
const endSchema=z.strictObject({release:z.enum(['succeeded','failed'])});

/** Fresh synthetic identities only; this factory cannot register a raw Response, stream, reader or session. */
export function createSyntheticNativeContractDomain(){
  const identities=new WeakMap<Identity,IdentityKind>(),registered=new WeakSet<object>();
  const responseClaims=new WeakMap<Identity,object>(),streamClaims=new WeakMap<Identity,object>(),readerClaims=new WeakMap<Identity,object>();
  return Object.freeze({
    identity(kind:IdentityKind):Identity{if(!['run','signal','response','stream','reader'].includes(kind))throw Error('invalid_input');const h=opaque<Identity>();identities.set(h,kind);return h;},
    createOwner(binding:{run:object;budget:Budget;signal:object;deadline_ms:number}){
      let originalRun:object,budget:Budget,signal:object,deadline:number,read:Budget['read'];
      try{
        originalRun=binding?.run;budget=binding?.budget;signal=binding?.signal;deadline=binding?.deadline_ms;
        if(!originalRun||typeof originalRun!=='object'||!signal||typeof signal!=='object'||!budget||!Number.isInteger(deadline)||deadline<1||deadline>60000)return Object.freeze({ok:false as const,code:'invalid_input' as const});
        if(identities.get(originalRun as Identity)!=='run'||identities.get(signal as Identity)!=='signal')return Object.freeze({ok:false as const,code:'evidence_binding_mismatch' as const});
        if(registered.has(originalRun))return Object.freeze({ok:false as const,code:'invalid_state' as const});registered.add(originalRun);
        const method=budget.read;if(typeof method!=='function')return Object.freeze({ok:false as const,code:'invalid_input' as const});read=Function.prototype.bind.call(method,budget) as Budget['read'];
      }catch{return Object.freeze({ok:false as const,code:'internal_review_error' as const});}
      const run=opaque<object>(),context=Object.freeze({run:originalRun,budget,signal});
      type A={window:Window;descriptor:z.infer<typeof attemptSchema>;context:typeof context;deliveryIssued:boolean};
      type D={attempt:Attempt;window:Window;response:Identity;stream:Identity|null;used:boolean};
      type R={attempt:Attempt;window:Window;state:'owned'|'reader'|'pre'|'ended'|'consumed';stream:Identity|null;reader?:Identity;pre?:PreRelease;end?:EndEvidence;cleanup?:Cleanup};
      type P={resource:Resource;value:Readonly<z.infer<typeof preSchema>>;time:'valid'|'expired'|'invalid';used:boolean};
      const attempts=new WeakMap<Attempt,A>(),deliveries=new WeakMap<ResponseDelivery,D>(),resources=new WeakMap<Resource,R>(),pres=new WeakMap<PreRelease,P>(),ends=new WeakMap<EndEvidence,{resource:Resource;used:boolean}>();
      let state:'active'|'stopped'|'closed'='active',primary:Code|null=null,last:number|undefined,count=0,resourceCount=0,consumed=0,cleanup:Cleanup|null=null,current:Resource|undefined,busy=false,postFloor:number|undefined;
      const no=(code:Code):Result<never>=>Object.freeze({ok:false,code:primary??code});
      function stop(code:Code){primary??=code;if(state!=='closed')state='stopped';return no(code);}
      function sample(){try{const n=read().remaining_ms;if(!Number.isFinite(n)||n>deadline||last!==undefined&&n>last){stop('invalid_observation_time');return null;}last=n;if(n<=0)stop('deadline_exceeded');return n;}catch{stop('internal_review_error');return null;}}
      function live(){if(state!=='active')return false;sample();return primary===null;}
      function bound(a:Attempt,w:Window){const found=attempts.get(a);if(!found||found.context!==context||found.window!==w){stop('evidence_binding_mismatch');return undefined;}return found;}
      function windowLive(a:A,phase:'io'|'cleanup'){postFloor=phase==='io'?a.descriptor.io_floor_ms:a.descriptor.cleanup_floor_ms;if(!live())return false;if(last!<=postFloor){stop('attempt_deadline_exceeded');return false;}return true;}
      function claimIdentity(map:WeakMap<Identity,object>,id:Identity,kind:'response'|'stream'|'reader'){if(identities.get(id)!==kind||map.has(id)){stop('evidence_binding_mismatch');return false;}map.set(id,run);return true;}
      function report(r:R,value:Cleanup){r.cleanup=cleanup=Object.freeze(value);}
      function unknown(r:R,reason:CleanupReason){report(r,{disposition:'unconfirmed',kind:null,reason,synthetic:true});}
      function use<T>(work:()=>Result<T>,cleanupOnly=false):Result<T>{if(busy)return stop('invalid_state');busy=true;postFloor=undefined;try{const result=work();if(!cleanupOnly&&result.ok){if(!live())return no('closed');if(postFloor!==undefined&&last!<=postFloor)return stop('attempt_deadline_exceeded');}return result;}catch{return stop('internal_review_error');}finally{busy=false;postFloor=undefined;}}
      const owner=Object.freeze({
        claim(a:Attempt,w:Window,d:ResponseDelivery):Result<Resource>{return use(()=>{
          if(primary)return no('closed');const delivery=deliveries.get(d),attempt=bound(a,w);if(!attempt||!delivery||delivery.attempt!==a||delivery.window!==w)return stop('evidence_binding_mismatch');if(delivery.used||current)return stop('invalid_state');delivery.used=true;if(!windowLive(attempt,'io'))return no('closed');
          if(!claimIdentity(responseClaims,delivery.response,'response'))return no('evidence_binding_mismatch');if(delivery.stream&&!claimIdentity(streamClaims,delivery.stream,'stream'))return no('evidence_binding_mismatch');
          const h=opaque<Resource>();resources.set(h,{attempt:a,window:w,state:'owned',stream:delivery.stream});current=h;resourceCount++;return ok(h);
        });},
        consume(a:Attempt,w:Window,resource:Resource,e:EndEvidence){return use(()=>{
          const attempt=bound(a,w);if(!attempt)return no('evidence_binding_mismatch');const r=resources.get(resource),proof=ends.get(e);if(!r||r.attempt!==a||r.window!==w||!proof||proof.resource!==resource)return stop('evidence_binding_mismatch');if(proof.used||r.state!=='ended')return stop('invalid_state');proof.used=true;r.state='consumed';current=undefined;consumed++;if(!windowLive(attempt,'cleanup'))return no('closed');
          return ok(Object.freeze({state:'end_verified_only' as const,cleanup:r.cleanup!,native_operations:'unavailable' as const,evidence_issuance:'disabled' as const,body_eligible:false as const}));
        });},
        stop(code:'cancelled'|'closed'){return stop(code==='cancelled'||code==='closed'?code:'invalid_input');},
        close(){stop('closed');state='closed';},
        status(){return Object.freeze({state,primary,resources:resourceCount,attempts:count,consumed,cleanup,native_operations:'unavailable' as const,evidence_issuance:'disabled' as const});},
      });
      const issuer=Object.freeze({
        attempt(raw:unknown){return use(()=>{if(!live())return no('closed');const p=attemptSchema.safeParse(raw);if(!p.success)return stop('invalid_input');const d=p.data,span=last!-d.cleanup_floor_ms,reserve=d.io_floor_ms-d.cleanup_floor_ms;if(span<=0||span>10000||d.cleanup_floor_ms<Math.min(10000,deadline/6)||reserve<=0||reserve>Math.min(250,span/4))return stop('invalid_input');if(count>=210)return stop('invalid_state');postFloor=d.io_floor_ms;const a=opaque<Attempt>(),w=opaque<Window>();attempts.set(a,{window:w,descriptor:Object.freeze(d),context,deliveryIssued:false});count++;return ok(Object.freeze({attempt:a,window:w}));});},
        delivery(a:Attempt,w:Window,input:{response:Identity;stream:Identity|null}){return use(()=>{if(!live())return no('closed');const attempt=bound(a,w);if(!attempt||identities.get(input.response)!=='response'||input.stream!==null&&identities.get(input.stream)!=='stream')return stop('evidence_binding_mismatch');if(attempt.deliveryIssued)return stop('invalid_state');attempt.deliveryIssued=true;if(!windowLive(attempt,'io'))return no('closed');const h=opaque<ResponseDelivery>();deliveries.set(h,{attempt:a,window:w,response:input.response,stream:input.stream,used:false});return ok(h);});},
        reader(resource:Resource,id:Identity){return use(()=>{if(!live())return no('closed');const r=resources.get(resource);if(!r)return stop('evidence_binding_mismatch');if(r.state!=='owned'||r.stream===null)return stop('invalid_state');if(!windowLive(attempts.get(r.attempt)!,'io'))return no('closed');if(!claimIdentity(readerClaims,id,'reader'))return no('evidence_binding_mismatch');r.reader=id;r.state='reader';return ok(true as const);});},
        preRelease(resource:Resource,raw:unknown){return use(()=>{const r=resources.get(resource);if(!r)return stop('evidence_binding_mismatch');if(r.state!=='reader')return stop('invalid_state');r.state='pre';const parsed=preSchema.safeParse(raw);if(!parsed.success){unknown(r,'observation_invalid');return stop('invalid_input');}const n=sample(),a=attempts.get(r.attempt)!;const h=opaque<PreRelease>();pres.set(h,{resource,value:Object.freeze(parsed.data),time:n===null?'invalid':n>a.descriptor.cleanup_floor_ms?'valid':'expired',used:false});r.pre=h;return ok(h);},true);},
        end(resource:Resource,p:PreRelease,raw:unknown){return use(()=>{const r=resources.get(resource),before=pres.get(p);if(!r||!before||before.resource!==resource)return stop('evidence_binding_mismatch');if(r.state!=='pre'||before.used)return stop('invalid_state');before.used=true;r.state='ended';const result=endSchema.safeParse(raw);if(!result.success){unknown(r,'observation_invalid');return stop('invalid_input');}const n=sample(),a=attempts.get(r.attempt)!,o=before.value;
          const reason:CleanupReason|null=before.time==='invalid'||n===null?'observation_invalid':before.time==='expired'||n<=a.descriptor.cleanup_floor_ms?'cleanup_deadline':!o.closed_captured?'reader_owner_unknown':o.pending_read?'read_pending':o.cancel==='pending'?'cancel_pending':o.cancel==='rejected'?'cancel_rejected':o.closed!=='fulfilled'?o.closed==='pending'?'closed_pending':'closed_rejected':result.data.release!=='succeeded'?'lock_release_failed':!o.eof&&o.cancel!=='fulfilled'?'observation_invalid':null;
          report(r,{disposition:reason?'unconfirmed':'confirmed',kind:reason?null:o.cancel==='fulfilled'?'cancelled':'eof',reason,synthetic:true});if(reason)stop(reason==='cleanup_deadline'?'attempt_deadline_exceeded':'internal_review_error');const e=opaque<EndEvidence>();ends.set(e,{resource,used:false});r.end=e;return ok(e);
        },true);},
        endNoBody(resource:Resource){return use(()=>{const r=resources.get(resource);if(!r)return stop('evidence_binding_mismatch');if(r.state!=='owned'||r.stream!==null)return stop('invalid_state');r.state='ended';const n=sample(),a=attempts.get(r.attempt)!,reason=n===null?'observation_invalid' as const:n<=a.descriptor.cleanup_floor_ms?'cleanup_deadline' as const:null;report(r,{disposition:reason?'unconfirmed':'confirmed',kind:reason?null:'no_body',reason,synthetic:true});if(reason)stop(reason==='cleanup_deadline'?'attempt_deadline_exceeded':'internal_review_error');const e=opaque<EndEvidence>();ends.set(e,{resource,used:false});r.end=e;return ok(e);},true);},
      });
      return ok(Object.freeze({owner,issuer}));
    },
  });
}
