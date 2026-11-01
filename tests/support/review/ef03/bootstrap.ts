/** Development-only fixed-200 transcript. No fetch, native reader, runtime registry or credentials. */
import {types} from 'node:util';
import {CanonicalBudgetError,type createCanonicalReviewBudget} from '../../../../src/servicenow/review-canonical-budget.js';
import type {ConstructionPublicCode} from '../../../../src/servicenow/review-kernel/construction-state.js';
import {DevelopmentSourceError} from './source.js';
type Core=ReturnType<typeof createCanonicalReviewBudget>;
type Purpose='authentication'|'parent'|'release';
const maxima={requests:210,total_bytes:16777216,response_bytes:4194304};
const typed=Object.getPrototypeOf(Uint8Array.prototype),getLength=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!;
const getBuffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!,set=Uint8Array.prototype.set;
function invalid():never{throw new DevelopmentSourceError('invalid_input');}
function data(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalid();
  const out:Record<string,unknown>=Object.create(null);
  for(const key of Reflect.ownKeys(raw)){
    const d=Object.getOwnPropertyDescriptor(raw,key)!;
    if(typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(d,'value'))return invalid();out[key]=d.value;
  }
  return out;
}
export function pinDevelopmentTranscript(raw:unknown){
  const pinned=data(raw,['target','auth','responses','limits']);
  if(typeof pinned.target!=='string'||!/^[a-f0-9]{32}$/.test(pinned.target)||!['per-user','cached','exchange'].includes(pinned.auth as string))return invalid();
  const limits={...maxima},reduced=pinned.limits===undefined?{}:data(pinned.limits,Object.keys(maxima));
  for(const key of Object.keys(reduced) as (keyof typeof maxima)[]){
    const value=reduced[key];if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(key==='requests'?4:1)||value>maxima[key])return invalid();limits[key]=value;
  }
  const rows=pinned.responses;
  if(!Array.isArray(rows)||types.isProxy(rows)||rows.length<2||rows.length>3||Reflect.ownKeys(rows).length!==rows.length+1)return invalid();
  const records:{purpose:Purpose;bytes:Uint8Array;delay:number;outcome:'ok'|'throw'|'reject'}[]=[];
  try{
    for(let i=0;i<rows.length;i++){
      const d=Object.getOwnPropertyDescriptor(rows,String(i));if(!d||!Object.hasOwn(d,'value'))return invalid();
      const row=data(d.value,['purpose','bytes','delay_ms','outcome']);
      if(!['authentication','parent','release'].includes(row.purpose as string)||!types.isUint8Array(row.bytes)||types.isProxy(row.bytes))return invalid();
      if(row.delay_ms!==undefined&&(typeof row.delay_ms!=='number'||!Number.isSafeInteger(row.delay_ms)||row.delay_ms<0||row.delay_ms>10000))return invalid();
      if(row.outcome!==undefined&&!['ok','throw','reject'].includes(row.outcome as string))return invalid();
      const n=Reflect.apply(getLength,row.bytes,[]) as number;
      Reflect.apply(bufferLength,Reflect.apply(getBuffer,row.bytes,[]),[]); // Shared/detached storage is not adopted.
      if(n>maxima.response_bytes)return invalid();
      const bytes=new Uint8Array(n);Reflect.apply(set,bytes,[row.bytes]);
      records.push({purpose:row.purpose as Purpose,bytes,delay:row.delay_ms as number??0,outcome:row.outcome as 'ok'|'throw'|'reject'??'ok'});
    }
    if(records.map(r=>r.purpose).join(',')!==(pinned.auth==='exchange'?'authentication,parent,release':'parent,release'))return invalid();
  }catch{for(const row of records)row.bytes.fill(0);return invalid();}
  // Do not retain the caller's transcript/storage through the diagnostic closure.
  delete pinned.responses;delete pinned.limits;
  let started=false,disposed=false,claimed=false,reservedPeak=0,releaseAttempts=0,dispatches=0,reserved=0;
  const diagnostic=()=>Object.freeze({claimed,reserved_peak:reservedPeak,reserved,release_attempts:releaseAttempts,dispatches,
    auth:pinned.auth as 'per-user'|'cached'|'exchange',release_match:'not_evaluated' as const,formal_issuance:false as const});
  const dispose=()=>{if(disposed)return;disposed=true;for(const row of records)row.bytes.fill(0);records.length=0;};
  async function run(core:Core,signal:AbortSignal,deadline:number,hooks:Readonly<{
    check():void;stop(code:ConstructionPublicCode):void;ready():void;accept(purpose:'parent'|'release',value:unknown):void;
  }>){
    if(started||disposed)throw new DevelopmentSourceError('internal_review_error','invalid_state');
    started=true;let accounting:ReturnType<Core['construction']['takeBootstrapAccounting']>|undefined;
    const reserveMs=Math.min(10000,deadline/6);
    const failure=(code:ConstructionPublicCode):never=>{throw new DevelopmentSourceError(code);};
    const observe=(floor?:number)=>{
      hooks.check();if(signal.aborted)return failure('cancelled');
      const sample=core.view.lease.read();if(core.view.failure())return failure(core.view.failure()!);
      if(sample.remaining_ms<=reserveMs)return failure('phase_deadline_exceeded');
      if(floor!==undefined&&sample.remaining_ms<=floor)return failure('upstream_unavailable');return sample;
    };
    try{
      observe();accounting=core.construction.takeBootstrapAccounting();claimed=true;
      core.construction.connectStopOwner(accounting,()=>hooks.stop(core.view.failure()??'internal_review_error'));
      observe();accounting.reserve();reserved=accounting.reserved();reservedPeak=reserved;
      if(reserved!==4)failure('internal_review_error');
      if(pinned.auth!=='exchange')hooks.ready();
      for(const row of records){
        const before=observe(),floor=Math.max(reserveMs,before.remaining_ms-10000);
        accounting.dispatch(floor);dispatches++;
        const committed=observe(floor);
        if(committed.requests!==before.requests+1||committed.received_bytes!==before.received_bytes||committed.payload_bytes!==0)failure('internal_review_error');
        let responseTimer:ReturnType<typeof setTimeout>|undefined,cutoff:ReturnType<typeof setTimeout>|undefined,remove=()=>{};
        let bytes:Uint8Array;
        try{
          const cancelled=new Promise<never>((_,reject)=>{
            const abort=()=>reject(new DevelopmentSourceError(core.view.failure()??'cancelled'));
            signal.addEventListener('abort',abort,{once:true});remove=()=>signal.removeEventListener('abort',abort);
            if(signal.aborted){abort();return;}
            cutoff=setTimeout(()=>{try{observe(floor);reject(new DevelopmentSourceError('upstream_unavailable'));}catch(error){reject(error);}},committed.remaining_ms-floor);
          });
          // C has been committed before this synthetic dispatch can throw or reject.
          const deliver=()=>{
            if(row.outcome==='throw')throw new DevelopmentSourceError('upstream_unavailable');
            if(row.outcome==='reject')return Promise.reject(new DevelopmentSourceError('upstream_unavailable'));
            if(!row.delay)return Promise.resolve(row.bytes);
            return new Promise<Uint8Array>(resolve=>{responseTimer=setTimeout(()=>resolve(row.bytes),row.delay);});
          };
          let delivery:Promise<Uint8Array>;
          try{delivery=deliver();}catch(error){delivery=Promise.reject(error);}
          bytes=await Promise.race([delivery,cancelled]);
        }finally{remove();if(responseTimer!==undefined)clearTimeout(responseTimer);if(cutoff!==undefined)clearTimeout(cutoff);}
        const prior=observe(floor);accounting.chunk(bytes.byteLength);const charged=observe(floor);
        // Same delta check as the production bootstrap contract: G grows by exactly this chunk, C/P stay fixed.
        if(charged.received_bytes!==prior.received_bytes+bytes.byteLength||charged.requests!==prior.requests||charged.payload_bytes!==prior.payload_bytes)failure('internal_review_error');
        if(bytes.byteLength>limits.response_bytes)failure('receive_budget_exceeded');
        let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{failure('invalid_response');}
        observe(floor);
        if(row.purpose==='authentication'){
          const token=value as Record<string,unknown>;
          if(!token||typeof token!=='object'||Array.isArray(token)||typeof token.access_token!=='string'||!token.access_token||/[\r\n]/.test(token.access_token)||
            typeof token.expires_in!=='number'||!Number.isFinite(token.expires_in)||token.expires_in*1000<=deadline||
            token.token_type!==undefined&&(typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer'))failure('authentication_failed');
          value=undefined;hooks.ready();
        }else hooks.accept(row.purpose,value);
        value=undefined;observe(floor);
      }
    }catch(error){
      const code=core.view.failure()??(error instanceof DevelopmentSourceError||error instanceof CanonicalBudgetError?error.code:'internal_review_error');
      hooks.stop(code);throw new DevelopmentSourceError(code);
    }finally{
      if(accounting){releaseAttempts++;accounting.release();reserved=accounting.reserved();}
      dispose();
    }
  }
  return Object.freeze({target:pinned.target,limits:Object.freeze(limits),run,dispose,diagnostic});
}
