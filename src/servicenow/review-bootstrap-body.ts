/** RT-B03 private fake-byte lane. Never a BoundedBodyReceipt or production issuer. */
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {z} from 'zod';
import type {ReadFailureCode} from './bounded-read.js';
export type BootstrapBodyCode=ReadFailureCode|'invalid_state'|'evidence_binding_mismatch'|'invalid_observation_time';
export class BootstrapBodyFailure extends Error{constructor(readonly code:BootstrapBodyCode){super(code);}}
declare const brand:unique symbol;
type Candidate={readonly [brand]:'bootstrap_candidate'};
type Draft={readonly [brand]:'bootstrap_draft'};
export interface BootstrapBodyResource{read():Promise<{done:boolean;value?:Uint8Array}>;cancel():Promise<void>;readonly closed:Promise<void>;release():void;}
type CleanupReason='observation_invalid'|'read_pending'|'cancel_pending'|'cancel_rejected'|'closed_pending'|'closed_rejected'|'lock_release_failed'|'reader_owner_unknown'|'fetch_pending'|'cleanup_deadline';
type Cleanup=Readonly<{disposition:'not_started'|'confirmed'|'unconfirmed';kind:'eof'|'cancelled'|'no_response'|null;reason:CleanupReason|null;synthetic:true}>;
const terminalSchema=z.strictObject({eof:z.boolean(),pending_read:z.boolean(),cancel:z.enum(['not_requested','fulfilled','pending','rejected']),closed:z.enum(['fulfilled','pending','rejected']),lock:z.enum(['released','held','failed']),cleanup_issue:z.enum(['cleanup_deadline','observation_invalid']).optional()});
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const typed=Object.getPrototypeOf(Uint8Array.prototype),lengthOf=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!,bufferOf=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!,set=Uint8Array.prototype.set;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
export function createBootstrapBodyLane(hooks:{check():void;charge(n:number):void;stop(code:BootstrapBodyCode):void;responseLimit:number}){
  type Record={attempt:object;status:number;state:'open'|'candidate'|'draft'|'done'|'revoked';chunks:Uint8Array[];size:number;empty:number;candidate?:Candidate;draft?:Draft;value?:unknown;sha?:string;terminal?:Cleanup};
  const attempts=new WeakMap<object,Record>(),candidates=new WeakMap<Candidate,Record>(),drafts=new WeakMap<Draft,Record>();
  const resources=new WeakSet<object>();
  let current:Record|undefined,last:Cleanup|null=null,consumes=0,acks=0,stopped:unknown;
  function drop(r:Record){r.chunks=[];r.size=0;r.value=undefined;r.sha=undefined;}
  function check(){try{hooks.check();if(stopped)throw stopped;}catch(error){stopped??=error;if(current){drop(current);current.state='revoked';}throw stopped;}}
  function fail(code:BootstrapBodyCode):never{stopped??=new BootstrapBodyFailure(code);hooks.stop(code);if(current){drop(current);current.state='revoked';}throw stopped;}
  function record(attempt:object){const r=attempts.get(attempt);if(!r||r!==current)return fail('evidence_binding_mismatch');return r;}
  const port=Object.freeze({
    open(attempt:object,status:number){check();if(current&&current.state!=='done'||attempts.has(attempt))return fail('invalid_state');if(!Number.isInteger(status)||status<100||status>599)return fail('invalid_response');const r:Record={attempt,status,state:'open',chunks:[],size:0,empty:0};attempts.set(attempt,r);current=r;check();},
    append(attempt:object,bytes:Uint8Array){check();const r=record(attempt);if(r.state!=='open')return fail('invalid_state');if(!types.isUint8Array(bytes))return fail('invalid_response');
      let n:number,copy:Uint8Array|undefined;try{n=Reflect.apply(lengthOf,bytes,[]) as number;Reflect.apply(bufferLength,Reflect.apply(bufferOf,bytes,[]),[]);if(n<=hooks.responseLimit){copy=new Uint8Array(n);Reflect.apply(set,copy,[bytes]);}}catch{return fail('invalid_response');}
      try{hooks.charge(n);}catch(error){stopped??=error;drop(r);r.state='revoked';throw error;}check();if(r.size+n>hooks.responseLimit)return fail('receive_budget_exceeded');if(n===0){if(++r.empty>16)return fail('invalid_response');}else{if(r.chunks.length>=4096)return fail('invalid_response');r.chunks.push(copy!);r.size+=n;}},
    finish(attempt:object,raw:unknown){const r=record(attempt);if(r.terminal)return fail('invalid_state');const p=terminalSchema.safeParse(raw);
      const reason:CleanupReason|null=!p.success?'observation_invalid':p.data.pending_read?'read_pending':p.data.cancel==='pending'?'cancel_pending':p.data.cancel==='rejected'?'cancel_rejected':p.data.closed!=='fulfilled'?p.data.closed==='pending'?'closed_pending':'closed_rejected':p.data.lock!=='released'?'lock_release_failed':p.data.cleanup_issue??(!p.data.eof&&p.data.cancel!=='fulfilled'?'observation_invalid':null);
      const kind=reason?null:p.success&&p.data.cancel==='fulfilled'?'cancelled':'eof';last=r.terminal=Object.freeze({disposition:reason?'unconfirmed':'confirmed',kind,reason,synthetic:true});
      if(reason)return fail('internal_review_error');check();if(r.state!=='open')return fail('invalid_state');if(kind!=='eof'){drop(r);r.state='done';return null;}
      const c=opaque<Candidate>();r.state='candidate';r.candidate=c;candidates.set(c,r);check();return c;
    },
    consume(attempt:object,c:Candidate){check();const r=record(attempt);if(candidates.get(c)!==r)return fail('evidence_binding_mismatch');if(r.state!=='candidate')return fail('invalid_state');r.state='draft';consumes++;
      const bytes=new Uint8Array(r.size);let offset=0;for(const part of r.chunks){bytes.set(part,offset);offset+=part.length;}
      try{r.value=r.status===200?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)):null;r.sha=createHash('sha256').update(bytes).digest('hex');}catch{return fail('invalid_response');}
      r.chunks=[];const d=opaque<Draft>();r.draft=d;drafts.set(d,r);check();return d;
    },
    acknowledge(attempt:object,d:Draft){check();const r=record(attempt);if(drafts.get(d)!==r)return fail('evidence_binding_mismatch');if(r.state!=='draft')return fail('invalid_state');r.state='done';const value=Object.freeze({status:r.status,value:r.value,sha256:r.sha!,received_bytes:r.size});check();acks++;drop(r);return value;},
    revoke(){if(current){drop(current);current.state='revoked';}},
    unopened(outcome:'not_started'|'no_response'|'fetch_pending'|'unadopted_response'){last=Object.freeze({disposition:outcome==='no_response'?'confirmed':outcome==='not_started'?'not_started':'unconfirmed',kind:outcome==='no_response'?'no_response':null,reason:outcome==='fetch_pending'?'fetch_pending':outcome==='unadopted_response'?'reader_owner_unknown':null,synthetic:true});},
    discardLate(resource:BootstrapBodyResource){if(!resource||typeof resource!=='object'||resources.has(resource))return;resources.add(resource);try{Promise.resolve(resource.closed).catch(()=>{});Promise.resolve(resource.cancel()).catch(()=>{});}catch{/* Best effort only: never changes the frozen terminal. */}try{resource.release();}catch{/* No cleanup upgrade. */}},
    diagnostic(){return Object.freeze({cleanup:last,retained_bytes:current?.size??0,consumes,acknowledgements:acks,evidence_issuance:'disabled' as const});},
  });
  return Object.freeze({...port,
    async read(attempt:object,resource:BootstrapBodyResource,wait:<T>(op:()=>Promise<T>)=>Promise<T>,cleanupWait:<T>(p:Promise<T>)=>Promise<T>){
      const r=record(attempt);if(!resource||typeof resource!=='object'||resources.has(resource)){last=r.terminal=Object.freeze({disposition:'unconfirmed',kind:null,reason:'reader_owner_unknown',synthetic:true});return fail('invalid_response');}resources.add(resource);
      let read:BootstrapBodyResource['read'],cancel:BootstrapBodyResource['cancel'],release:BootstrapBodyResource['release'],closedInput:Promise<void>;
      try{read=resource.read.bind(resource);cancel=resource.cancel.bind(resource);release=resource.release.bind(resource);closedInput=resource.closed;if(!types.isPromise(closedInput))throw Error();}catch{last=r.terminal=Object.freeze({disposition:'unconfirmed',kind:null,reason:'reader_owner_unknown',synthetic:true});return fail('invalid_response');}
      let closedState:'pending'|'fulfilled'|'rejected'='pending',cancelState:'not_requested'|'pending'|'fulfilled'|'rejected'='not_requested',pendingRead=false,eof=false,lock:'released'|'held'|'failed'='held',failure:unknown;
      const closed=Promise.resolve(closedInput).then(()=>{closedState='fulfilled';},()=>{closedState='rejected';});let reading:Promise<unknown>=Promise.resolve();
      try{for(;;){check();const next=await wait(()=>{pendingRead=true;const p=Promise.resolve().then(read).then(value=>{pendingRead=false;return value;},()=>{pendingRead=false;throw new BootstrapBodyFailure('invalid_response');});reading=p.then(()=>{},()=>{});return p;});check();if(!next||typeof next.done!=='boolean')throw new BootstrapBodyFailure('invalid_response');if(next.done){if(next.value!==undefined)throw new BootstrapBodyFailure('invalid_response');eof=true;break;}port.append(attempt,next.value!);}}
      catch(error){failure=error;}
      let cancelling=Promise.resolve();if(!eof){cancelState='pending';cancelling=Promise.resolve().then(()=>{const p=cancel();if(!types.isPromise(p))throw Error();return p;}).then(()=>{cancelState='fulfilled';},()=>{cancelState='rejected';});}
      let cleanupIssue:'cleanup_deadline'|'observation_invalid'|undefined;
      const issue=(error:unknown)=>error instanceof BootstrapBodyFailure&&error.code==='upstream_unavailable'?'cleanup_deadline' as const:'observation_invalid' as const;
      try{await cleanupWait(Promise.all([reading,cancelling,closed]));}catch(error){cleanupIssue=issue(error);}
      try{release();lock='released';}catch{lock='failed';}
      try{await cleanupWait(Promise.resolve());}catch(error){cleanupIssue??=issue(error);}
      if(failure)hooks.stop(failure instanceof BootstrapBodyFailure?failure.code:'invalid_response');
      try{const candidate=port.finish(attempt,{eof,pending_read:pendingRead,cancel:cancelState,closed:closedState,lock,...(cleanupIssue?{cleanup_issue:cleanupIssue}:{})});if(failure)throw failure;return candidate;}catch(error){throw failure??error;}
    },
  });
}
