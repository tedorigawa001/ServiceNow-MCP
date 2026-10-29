/** RT-B02 constructor-bound fake I/O contract. No default fetch, real-session adoption or body authority. */
import {z} from 'zod';
import {types} from 'node:util';
import {releaseEvidenceStructure,releaseMatchForEvidence} from '../review/result-schema-v2.js';
import type {ReadFailureCode} from './bounded-read.js';
import type {ReviewRunBudgetLease,ReviewSourceReleasePort,ReviewSourceReleaseSnapshot} from './review-evidence-lifecycle.js';
type Code=ReadFailureCode|'invalid_state'|'evidence_binding_mismatch'|'invalid_observation_time';
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
export type BootstrapPurpose='authentication'|'parent'|'release';
export interface ReviewBootstrapDependencies{
  readonly fake_io:true;readonly lease:ReviewRunBudgetLease;readonly source:object;readonly target:string;
  readonly auth:'per-user'|'cached'|'exchange';
  readonly limits:{requests:number;total_bytes:number;response_bytes:number;deadline_ms:number};
  readonly accounting:{reserve():void;reserved():number;dispatch():void;chunk(length:number):void;release():void};
  dispatch(request:Readonly<{purpose:BootstrapPurpose;method:'POST'|'GET';synthetic:true}>,signal:AbortSignal):Promise<{status:number;bytes:Uint8Array}>;
  resolveRelease(response:Readonly<{status:number;value:unknown}>):{source:object;permit:object;port:ReviewSourceReleasePort}|null;
  schedule(delayMs:number,wake:()=>void):()=>void;
}
type Prepared=Readonly<ReviewSourceReleaseSnapshot&{state:'prepared_only';evidence_issuance:'disabled';dispatch:'unavailable'}>;
type Hooks<H>={lease:ReviewRunBudgetLease;sample():ReturnType<ReviewRunBudgetLease['read']>|null;check(handle:H,snapshot:object,lease:ReviewRunBudgetLease):Result<unknown>;
  ready():boolean;bind(source:object,permit:object,port:ReviewSourceReleasePort):boolean;
  prepared(handle:H,snapshot:object,lease:ReviewRunBudgetLease,source:object,permit:object,port:ReviewSourceReleasePort):Result<Prepared>;
  stop(code:Code):void;failure():Code|undefined;};
const limitsSchema=z.strictObject({requests:z.number().int().min(4).max(210),total_bytes:z.number().int().min(1).max(16777216),response_bytes:z.number().int().min(1).max(4194304),deadline_ms:z.number().int().min(1).max(60000)});
const parentSchema=z.strictObject({result:z.strictObject({sys_id:z.string().regex(/^[a-f0-9]{32}$/),state:z.string().max(100),application:z.string().max(32),sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)})});
const tokenSchema=z.object({access_token:z.string().min(1).refine(x=>!/[\r\n]/.test(x)),expires_in:z.number().finite().positive(),token_type:z.string().optional()});
class Failure extends Error{constructor(readonly code:Code){super(code);}}
const typed=Object.getPrototypeOf(Uint8Array.prototype),getBuffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!,getLength=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!,set=Uint8Array.prototype.set;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
export function createReviewBootstrapContract<H>(hooks:Hooks<H>,input:ReviewBootstrapDependencies){
  // Trusted constructor dependencies only. Pin operations, never re-read a mutable injection object in an await continuation.
  const deps={...input,accounting:{...input.accounting},limits:{...input.limits}};
  let state:'unstarted'|'running'|'prepared'|'ordinary_closed'|'failed'|'revoked'='unstarted',reason:Code|null=null;
  let controller:AbortController|undefined,reservationStarted=false,reservationReleased=false,activeFloor:number|undefined;
  let current:{handle:H;snapshot:object;lease:ReviewRunBudgetLease}|undefined;
  const no=(code:Code):Result<never>=>Object.freeze({ok:false,code:hooks.failure()??reason??code});
  function release(){if(!reservationStarted||reservationReleased)return;reservationReleased=true;try{deps.accounting.release();}catch{reason??='internal_review_error';hooks.stop('internal_review_error');}}
  function revoke(){reason??=hooks.failure()??'closed';if(state!=='failed'&&state!=='ordinary_closed')state='revoked';current=undefined;release();controller?.abort();}
  function observe(){
    if(!current)throw new Failure(hooks.failure()??reason??'invalid_state');
    const checked=hooks.check(current.handle,current.snapshot,current.lease);if(!checked.ok)throw new Failure(checked.code);
    const b=hooks.sample();if(hooks.failure())throw new Failure(hooks.failure()!);if(!b)throw new Failure('invalid_observation_time');
    if(!Number.isFinite(b.remaining_ms)||!Number.isSafeInteger(b.requests)||!Number.isSafeInteger(b.received_bytes)||!Number.isSafeInteger(b.payload_bytes))throw new Failure('invalid_observation_time');
    if(b.remaining_ms<=0)throw new Failure('deadline_exceeded');
    if(b.remaining_ms<=Math.min(10000,deps.limits.deadline_ms/6))throw new Failure('phase_deadline_exceeded');
    if(activeFloor!==undefined&&b.remaining_ms<=activeFloor)throw new Failure('upstream_unavailable');
    return b;
  }
  async function wait<T>(work:Promise<T>,delay:number):Promise<T>{
    let dispose:(()=>void)|undefined,abort:()=>void=()=>{};
    const stopped=new Promise<never>((_resolve,reject)=>{
      abort=()=>reject(new Failure(hooks.failure()??reason??'cancelled'));controller!.signal.addEventListener('abort',abort,{once:true});
      if(controller!.signal.aborted){abort();return;}
      dispose=deps.schedule(delay,()=>{try{observe();reject(new Failure('internal_review_error'));}catch(error){reject(error);}});
    });
    try{return await Promise.race([work,stopped]);}finally{controller!.signal.removeEventListener('abort',abort);dispose?.();}
  }
  async function request(purpose:BootstrapPurpose){
    for(let ordinal=1;ordinal<=2;ordinal++){
      const before=observe(),r=deps.accounting.reserved();
      if(!Number.isSafeInteger(r)||r!==4)throw new Failure('internal_review_error');
      if(before.requests+1+r>deps.limits.requests)throw new Failure('request_budget_exceeded');
      activeFloor=Math.max(Math.min(10000,deps.limits.deadline_ms/6),before.remaining_ms-10000);
      let settled=false,completed=false;
      try{
        deps.accounting.dispatch();const after=observe();
        if(after.requests!==before.requests+1||after.received_bytes!==before.received_bytes||after.payload_bytes!==before.payload_bytes)throw new Failure('internal_review_error');
        let work:Promise<{status:number;bytes:Uint8Array}>;
        try{work=deps.dispatch(Object.freeze({purpose,method:purpose==='authentication'?'POST':'GET',synthetic:true}),controller!.signal);}catch{settled=true;throw new Failure('upstream_unavailable');}
        const response=await wait(Promise.resolve(work).then(value=>{settled=true;return value;},()=>{settled=true;throw new Failure('upstream_unavailable');}),after.remaining_ms-activeFloor);
        observe();if(!response||!Number.isInteger(response.status)||response.status<100||response.status>599||!types.isUint8Array(response.bytes))throw new Failure('invalid_response');
        const n=Reflect.apply(getLength,response.bytes,[]) as number;Reflect.apply(bufferLength,Reflect.apply(getBuffer,response.bytes,[]),[]);
        const copy=n<=deps.limits.response_bytes?new Uint8Array(n):undefined;if(copy)Reflect.apply(set,copy,[response.bytes]);
        const prior=observe();deps.accounting.chunk(n);const charged=observe();
        if(charged.received_bytes!==prior.received_bytes+n||charged.requests!==prior.requests||charged.payload_bytes!==prior.payload_bytes)throw new Failure('internal_review_error');
        if(n>deps.limits.response_bytes||charged.received_bytes>deps.limits.total_bytes)throw new Failure('receive_budget_exceeded');
        if(response.status===401)throw new Failure('authentication_failed');
        if(response.status===403&&purpose!=='release')throw new Failure('access_denied');
        if(response.status===429||response.status>=500)throw new Failure('upstream_unavailable');
        if(response.status!==200&&!(response.status===403&&purpose==='release'))throw new Failure('invalid_response');
        let value:unknown=null;
        if(response.status===200){try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy));}catch{throw new Failure('invalid_response');}}
        observe();completed=true;return Object.freeze({status:response.status,value});
      }catch(error){
        const code=error instanceof Failure?error.code:'internal_review_error';
        if(code!=='upstream_unavailable'||!settled||ordinal===2||hooks.failure())throw new Failure(hooks.failure()??code);
      }finally{if(!completed)activeFloor=undefined;}
    }
    throw new Failure('upstream_unavailable');
  }
  return Object.freeze({
    async run(handle:H,snapshot:object,lease:ReviewRunBudgetLease):Promise<Result<Prepared>>{
      if(state!=='unstarted'){if(state==='running'){hooks.stop('invalid_state');revoke();}return no('invalid_state');}
      state='running';current={handle,snapshot,lease};
      try{
        if(deps.fake_io!==true||deps.lease!==hooks.lease||lease!==hooks.lease||!limitsSchema.safeParse(deps.limits).success||!/^[a-f0-9]{32}$/.test(deps.target)||!['per-user','cached','exchange'].includes(deps.auth))throw new Failure('evidence_binding_mismatch');
        controller=new AbortController();const b=observe();if(b.requests||b.received_bytes||b.payload_bytes)throw new Failure('invalid_state');
        reservationStarted=true;deps.accounting.reserve();observe();if(deps.accounting.reserved()!==4)throw new Failure('internal_review_error');
        if(deps.auth==='exchange'){
          const p=tokenSchema.safeParse((await request('authentication')).value);
          if(!p.success||p.data.expires_in*1000<=deps.limits.deadline_ms||p.data.token_type!==undefined&&p.data.token_type.toLowerCase()!=='bearer')throw new Failure('authentication_failed');
          observe();activeFloor=undefined;
        }
        observe();if(!hooks.ready())throw new Failure(hooks.failure()??'authentication_failed');observe();
        const parent=parentSchema.safeParse((await request('parent')).value);if(!parent.success||parent.data.result.sys_id!==deps.target)throw new Failure('invalid_response');observe();activeFloor=undefined;
        const response=await request('release');observe();const binding=deps.resolveRelease(response);observe();
        if(!binding)throw new Failure('release_not_admitted');
        if(binding.source!==deps.source)throw new Failure('evidence_binding_mismatch');
        const evidence=binding.port.copyRelease();if(!releaseEvidenceStructure.safeParse(evidence.instance_release).success||releaseMatchForEvidence(evidence.instance_release)!=='matched')throw new Failure('release_not_admitted');
        observe();if(!hooks.bind(deps.source,binding.permit,binding.port))throw new Failure(hooks.failure()??'evidence_binding_mismatch');
        observe();const prepared=hooks.prepared(handle,snapshot,lease,deps.source,binding.permit,binding.port);if(!prepared.ok)throw new Failure(prepared.code);
        observe();state='prepared';current=undefined;activeFloor=undefined;return Object.freeze({ok:true,value:prepared.value});
      }catch(error){
        reason??=hooks.failure()??(error instanceof Failure?error.code:'internal_review_error');
        if(reason==='phase_deadline_exceeded'||reason==='request_budget_exceeded'){state='ordinary_closed';current=undefined;release();controller?.abort();}
        else{state='failed';hooks.stop(reason);revoke();}
        return no(reason);
      }
    },
    revoke,
    diagnostic(){return Object.freeze({state,reason,started:reservationStarted,reservation_released:reservationReleased,formal_issuance:'disabled' as const,cleanup:'not_observed' as const,fake_io:true as const});},
  });
}
