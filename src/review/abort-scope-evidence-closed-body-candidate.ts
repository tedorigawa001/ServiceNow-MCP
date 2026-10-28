/** Fake byte lane only. Candidates/terminals are NOT production receipts or source evidence. */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createSyntheticParentStabilityIssuer,type SyntheticParentDraft} from './abort-scope-evidence-parent-stability.js';
import type {ClosedAccountingCode,ClosedStateCode,ClosedAccountingResult,ClosedReadAttempt} from './abort-scope-evidence-closed-read-state.js';
declare const brand:unique symbol;
export type ClosedBodyCandidate={readonly [brand]:'closed_body_candidate'};
export type ClosedBodyTerminal={readonly [brand]:'closed_body_terminal'};
type Kind='oauth'|'parent_initial'|'release_rows'|'metadata_initial'|'payload'|'parent_final'|'metadata_final'|'table_initial'|'table_final';
type Cleanup=Readonly<{disposition:'confirmed'|'unconfirmed';kind:'eof'|'cancelled'|null;reason:'read_pending'|'cancel_pending'|'cancel_rejected'|'closed_unconfirmed'|'closed_rejected'|'lock_release_failed'|'observation_invalid'|'owner_stopped'|null;synthetic:true}>;
const observation=z.strictObject({outcome:z.enum(['success','unavailable','retryable']),eof:z.boolean(),pending_read:z.boolean(),
  cancel:z.enum(['not_requested','fulfilled','pending','rejected']),closed:z.enum(['fulfilled','pending','rejected']),lock:z.enum(['released','held','failed','unknown'])});
const sysId=z.string().regex(/^[a-f0-9]{32}$/),row=z.strictObject({sys_id:sysId});
const rows=z.strictObject({result:z.array(row).max(101)}),parent=z.strictObject({result:row});
const release=z.strictObject({result:z.array(z.strictObject({build_name:z.string().min(1).max(80)})).max(101)});
const payload=z.strictObject({result:z.strictObject({payload:z.string()})});
// Same strict fields as production bounded-source parentSchema; used when the fixed parent GET target is bound.
const targetParent=z.strictObject({result:z.strictObject({sys_id:sysId,state:z.string().max(100),application:z.string().max(32),sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)})});
const typed=Object.getPrototypeOf(Uint8Array.prototype),byteLength=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!,buffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!;
const arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!,set=Uint8Array.prototype.set;
const typedName=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag)!.get!;
const opaque=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):ClosedAccountingResult<T>=>Object.freeze({ok:true,value});
type BodyHooks={
  guard<T>(work:()=>ClosedAccountingResult<T>):ClosedAccountingResult<T>;
  checkpoint():ClosedAccountingResult<number>;
  stop(code:ClosedAccountingCode):ClosedAccountingResult<never>;
  chunk(a:ClosedReadAttempt,sequence:number,length:number):ClosedAccountingResult<true>;
  settle(a:ClosedReadAttempt,raw:unknown):ClosedAccountingResult<true>;
  payload(a:ClosedReadAttempt,length:number):ClosedAccountingResult<true>;
  discardPayload(a:ClosedReadAttempt):ClosedAccountingResult<true>;
  responseLimit:number;
};
type ParentProjection={issuer:ReturnType<typeof createSyntheticParentStabilityIssuer>;owner:Parameters<ReturnType<typeof createSyntheticParentStabilityIssuer>['beginInitial']>[0];session:Parameters<ReturnType<typeof createSyntheticParentStabilityIssuer>['close']>[0];target:string;stop(code:ClosedStateCode|'changed_during_review'):ClosedAccountingResult<never>};
export function createClosedBodyLane(hooks:BodyHooks){return createBodyLane(hooks);}
/** Fake-only fixed continuation: no caller projector, record getter, real session or formal authority. */
export function createSyntheticParentProjectionLane(hooks:BodyHooks&{stopProjection(code:ClosedStateCode):ClosedAccountingResult<never>},target:string){
  let failure:ClosedStateCode|undefined;
  const issuer=createSyntheticParentStabilityIssuer({now(){const cp=hooks.checkpoint();if(!cp.ok){failure=cp.code;throw Error();}return cp.value;}});
  const session=issuer.issueSession({update_set_sys_id:target});if(!session.ok)throw Error('invalid_input');
  const owner=issuer.claimOwner(session.value);if(!owner.ok)throw Error('invalid_input');
  return createBodyLane(hooks,{issuer,owner:owner.value,session:session.value,target,stop:code=>hooks.stopProjection(failure??(code==='changed_during_review'?'invalid_state':code))});
}
function createBodyLane(hooks:BodyHooks,projection?:ParentProjection){
  type Record={attempt:ClosedReadAttempt;kind:Kind;state:'open'|'pending'|'consuming'|'done'|'failed';chunks:Uint8Array[];size:number;appends:number;rejected:boolean;terminal?:ClosedBodyTerminal;cleanup?:Cleanup;deadline?:number};
  const attempts=new WeakMap<ClosedReadAttempt,Record>(),candidates=new WeakMap<ClosedBodyCandidate,Record>();
  let current:Record|undefined,last:Cleanup|null=null,consumes=0;
  function drop(r:Record){r.chunks=[];r.size=0;}
  function classify(o:z.infer<typeof observation>):Cleanup{
    const unconfirmed=(reason:Cleanup['reason']):Cleanup=>Object.freeze({disposition:'unconfirmed',kind:null,reason,synthetic:true});
    if(o.pending_read)return unconfirmed('read_pending');
    if(o.cancel==='pending')return unconfirmed('cancel_pending');if(o.cancel==='rejected')return unconfirmed('cancel_rejected');
    if(o.closed!=='fulfilled')return unconfirmed(o.closed==='pending'?'closed_unconfirmed':'closed_rejected');
    if(o.lock!=='released')return unconfirmed('lock_release_failed');
    if(o.cancel==='fulfilled')return Object.freeze({disposition:'confirmed',kind:'cancelled',reason:null,synthetic:true});
    return o.eof?Object.freeze({disposition:'confirmed',kind:'eof',reason:null,synthetic:true}):unconfirmed('observation_invalid');
  }
  const port=Object.freeze({
    append(a:ClosedReadAttempt,sequence:number,bytes:Uint8Array):ClosedAccountingResult<true>{return hooks.guard(()=>{
      const r=attempts.get(a);if(!r||r!==current)return hooks.stop('evidence_binding_mismatch');
      if(r.state!=='open')return hooks.stop('invalid_state');
      r.appends++;
      let length:number,copy:Uint8Array|undefined;
      try{
        // Native internal slots; no caller species/iterator/buffer getter. Shared memory is not a snapshot.
        // [[TypedArrayName]], not the prototype chain: a forged prototype must not convert elements into a fake snapshot.
        if(Reflect.apply(typedName,bytes,[])!=='Uint8Array')return hooks.stop('invalid_input');
        length=Reflect.apply(byteLength,bytes,[]) as number;Reflect.apply(arrayBufferLength,Reflect.apply(buffer,bytes,[]),[]);
        if(length<=hooks.responseLimit){copy=new Uint8Array(length);Reflect.apply(set,copy,[bytes]);}
      }catch{return hooks.stop('invalid_input');}
      const cp=hooks.checkpoint();if(!cp.ok)return cp;
      const charged=hooks.chunk(a,sequence,length);
      if(!charged.ok){r.rejected=true;drop(r);return charged;}
      if(r.rejected)return hooks.stop('invalid_state');
      if(length>0&&r.chunks.length>=4096){drop(r);return hooks.stop('body_limit');}
      if(length){r.chunks.push(copy!);r.size+=length;}return ok(true);
    });},
    finish(a:ClosedReadAttempt,raw:unknown):ClosedAccountingResult<Readonly<{terminal:ClosedBodyTerminal;candidate:ClosedBodyCandidate|null}>>{return hooks.guard<Readonly<{terminal:ClosedBodyTerminal;candidate:ClosedBodyCandidate|null}>>(()=>{
      const r=attempts.get(a);if(!r||r!==current)return hooks.stop('evidence_binding_mismatch');if(r.state!=='open')return hooks.stop('invalid_state');
      const parsed=observation.safeParse(structuredClone(raw));if(!parsed.success)return hooks.stop('invalid_input');
      const cp=hooks.checkpoint();if(!cp.ok)return cp;
      const report=classify(parsed.data);r.cleanup=report;last=report;r.terminal=opaque<ClosedBodyTerminal>();
      if(report.disposition!=='confirmed'){drop(r);return hooks.stop('cleanup_unconfirmed');}
      // A confirmed cancel (e.g. request timeout) is never a body, but stays retryable like production's upstream_unavailable.
      const outcome=r.rejected||report.kind!=='eof'&&parsed.data.outcome==='success'?'unavailable':parsed.data.outcome;
      const settled=hooks.settle(a,{outcome,cleanup:'confirmed'});if(!settled.ok)return settled;
      if(outcome!=='success'){r.state='done';drop(r);current=undefined;return ok(Object.freeze({terminal:r.terminal,candidate:null}));}
      // OAuth needs its dedicated authentication consumer, never this general fake JSON projection.
      if(r.kind==='oauth')return hooks.stop('invalid_state');
      const candidate=opaque<ClosedBodyCandidate>();r.state='pending';candidates.set(candidate,r);
      return ok(Object.freeze({terminal:r.terminal,candidate}));
    });},
    consume(candidate:ClosedBodyCandidate,expectedParentId?:string){
      let draft:SyntheticParentDraft|undefined,role:'initial'|'final'|undefined;
      const result=hooks.guard(()=>{
      const r=candidates.get(candidate);if(!r||r!==current)return hooks.stop('evidence_binding_mismatch');
      if(r.state!=='pending'||r.cleanup?.disposition!=='confirmed'||r.cleanup.kind!=='eof')return hooks.stop('invalid_state');
      r.state='consuming';consumes++; // claim before decode/schema work; failure never restores it.
      let summary:Readonly<{records:number;received_bytes:number;payload_bytes:number;sha256:string;synthetic:true;evidence_issuance:'disabled'}>;
      try{
        const bytes=new Uint8Array(r.size);let offset=0;for(const chunk of r.chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        const json:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));let count=0,payloadSize=0;
        if(r.kind==='payload')payloadSize=Buffer.byteLength(payload.parse(json).result.payload,'utf8');
        else if(r.kind==='parent_initial'||r.kind==='parent_final'){
          if(projection){
            if(expectedParentId!==undefined&&expectedParentId!==projection.target)throw Error();
            const record=targetParent.parse(json).result;if(record.sys_id!==projection.target)throw Error();
            role=r.kind==='parent_initial'?'initial':'final';
            const use=role==='initial'?projection.issuer.beginInitial(projection.owner):projection.issuer.beginFinal(projection.owner);
            if(!use.ok)return projection.stop(use.code);
            const prepared=projection.issuer.issueDraft(projection.owner,use.value,record);
            if(!prepared.ok)return projection.stop(prepared.code);
            draft=prepared.value;
          }else{const sys_id=expectedParentId===undefined?parent.parse(json).result.sys_id:targetParent.parse(json).result.sys_id;if(expectedParentId!==undefined&&sys_id!==expectedParentId)throw Error();}
          count=1;
        }
        else if(r.kind==='release_rows')count=release.parse(json).result.length;
        else count=rows.parse(json).result.length;
        summary=Object.freeze({records:count,received_bytes:bytes.byteLength,payload_bytes:payloadSize,sha256:createHash('sha256').update(bytes).digest('hex'),synthetic:true,evidence_issuance:'disabled'});
      }catch{drop(r);return hooks.stop('invalid_response');}
      const cp=hooks.checkpoint();if(!cp.ok)return cp;
      if(r.kind==='payload'){const charged=hooks.payload(r.attempt,summary.payload_bytes);if(!charged.ok){drop(r);r.state='done';current=undefined;return charged;}}
      drop(r);r.state='done';current=undefined;return ok(summary);
      });
      // The body guard has completed its post-check; only now may a private draft be accepted.
      if(!result.ok){if(current){drop(current);current.state='failed';current=undefined;}if(projection)projection.issuer.close(projection.session);return result;}
      if(projection&&draft){
        const accepted=role==='initial'?projection.issuer.acceptInitial(projection.owner,draft):projection.issuer.prepareComparison(projection.owner,draft);
        if(!accepted.ok){projection.issuer.close(projection.session);return projection.stop(accepted.code);}
      }
      return result;
    },
    discard(candidate:ClosedBodyCandidate):ClosedAccountingResult<true>{return hooks.guard(()=>{
      const r=candidates.get(candidate);if(!r||r!==current)return hooks.stop('evidence_binding_mismatch');if(r.state!=='pending')return hooks.stop('invalid_state');
      r.state='done';drop(r);current=undefined;return r.kind==='payload'?hooks.discardPayload(r.attempt):ok(true);
    });},
    diagnostic(){return Object.freeze({cleanup:last,retained_bytes:current?.size??0,pending:current?.state==='pending',consumes,synthetic:true,evidence_issuance:'disabled' as const,
      ...(projection?{parent:projection.issuer.status(projection.owner)}:{})});},
  });
  return Object.freeze({port,abandonUnopened(a:ClosedReadAttempt,outcome:'unavailable'|'retryable'):ClosedAccountingResult<true>{return hooks.guard(()=>{
    const r=attempts.get(a);if(!r||r!==current)return hooks.stop('evidence_binding_mismatch');
    if(r.state!=='open'||r.appends!==0||outcome!=='unavailable'&&outcome!=='retryable')return hooks.stop('invalid_state');
    const settled=hooks.settle(a,{outcome,cleanup:'confirmed'});if(!settled.ok)return settled;
    // No reader existed: do not manufacture EOF, a released lock, or a body terminal/candidate.
    last=Object.freeze({disposition:'confirmed',kind:null,reason:null,synthetic:true});drop(r);r.state='done';current=undefined;return ok(true);
  });},start(a:ClosedReadAttempt,kind:Kind,deadline?:number){const r:Record={attempt:a,kind,state:'open',chunks:[],size:0,appends:0,rejected:false,deadline};attempts.set(a,r);current=r;},deadline:()=>current?.deadline,
    pending:()=>current?.state==='pending'||current?.state==='consuming',revoke(){if(projection)projection.issuer.close(projection.session);if(current){if(current.state==='open'&&!current.cleanup)last=Object.freeze({disposition:'unconfirmed',kind:null,reason:'owner_stopped',synthetic:true});drop(current);current.state='failed';current=undefined;}}});
}
