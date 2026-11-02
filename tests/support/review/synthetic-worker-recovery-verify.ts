/** SC2-B fake event ledger. No transport, clock, reservation writer or worker. */
import {types} from 'node:util';
type Prefix=Readonly<{requests:number;received_bytes:number;payload_bytes:number}>;
type Role='parent'|'metadata';
type Attempt={handle:object;role:Role;bytes:number;chunks:WeakSet<object>};
const bad=():never=>{throw Error('internal_review_error');};
const stop=(code:string):never=>{throw Object.assign(Error(code),{code});};
function record(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)return bad();
  const out:Record<string,unknown>=Object.create(null);for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d||!Object.hasOwn(d,'value'))return bad();out[key]=d.value;}return out;
}
export function createSyntheticWorkerVerify(prefix:Prefix,required:boolean,initial:'unverified'|'changed'|'stable_observation'){
  const accounting={...prefix};let attempts=0,verifyCalls=0;
  let stage:string=required?'parent':'verified',consistency=initial,changed=false;
  let retryWaits=0,retryRole:Role|undefined,verifyError:string|null=null;
  const used={parent:0,metadata:0};
  let pending:Attempt|undefined,settling:Attempt|undefined;
  function resolveError(code:string){verifyError=code;consistency='unverified';stage='verified';}
  return Object.freeze({
    dispatch(role:unknown){if(role!==stage||(stage!=='parent'&&stage!=='metadata')||used[stage]>=2)bad();verifyCalls=1;
      if(accounting.requests>=210){resolveError('request_budget_exceeded');return null;}
      if(accounting.received_bytes>=16777216)stop('receive_budget_exceeded');
      accounting.requests++;attempts++;used[role as Role]++;stage='pending';const handle=Object.freeze(Object.create(null)) as object;pending={handle,role:role as Role,bytes:0,chunks:new WeakSet()};return handle;},
    chunk(handle:object,identity:object,size:unknown){
      if(stage!=='pending'||!pending||handle!==pending.handle||!identity||typeof identity!=='object'||types.isProxy(identity)||pending.chunks.has(identity)||!Number.isSafeInteger(size)||(size as number)<0||(size as number)>16777217)bad();
      pending!.chunks.add(identity);pending!.bytes+=size as number;accounting.received_bytes+=size as number;
      if(pending!.bytes>4194304||accounting.received_bytes>16777216)stop('receive_budget_exceeded');
    },
    take(handle:object){const a=pending;pending=undefined;if(stage!=='pending'||!a||a.handle!==handle)bad();settling=a;stage='settling';return a!;},
    settle(a:Attempt,raw:unknown){if(stage!=='settling'||a!==settling)bad();settling=undefined;
      if(!raw||typeof raw!=='object'||types.isProxy(raw))bad();
      if(Object.getOwnPropertyDescriptor(raw,'kind')?.value==='success'){
        const v=record(raw,['kind','changed']);if(typeof v.changed!=='boolean')bad();changed=changed||v.changed as boolean;
        if(a.role==='parent')stage='metadata';else{stage='verified';consistency=changed?'changed':'stable_observation';}return;
      }
      const v=record(raw,['kind','type','code']);if(v.kind!=='failure'||v.type!=='bounded'||typeof v.code!=='string')bad();
      if(v.code==='upstream_unavailable'&&used[a.role]===1){retryRole=a.role;stage='retry_wait';return;}
      if(v.code==='receive_budget_exceeded'||v.code==='cancelled'||v.code==='deadline_exceeded')stop(v.code);
      const errors={phase_deadline_exceeded:'deadline_exceeded',invalid_response:'metadata_unavailable',not_found_or_not_visible:'not_found_or_not_visible',authentication_failed:'authentication_failed',access_denied:'access_denied',upstream_unavailable:'upstream_unavailable',request_budget_exceeded:'request_budget_exceeded',payload_budget_exceeded:'payload_budget_exceeded',candidate_filter_violation:'candidate_filter_violation'} as const;
      if(!Object.hasOwn(errors,v.code as string))bad();resolveError(errors[v.code as keyof typeof errors]);
    },
    retry(){if(stage!=='retry_wait'||!retryRole)bad();retryWaits++;stage=retryRole!;retryRole=undefined;},
    inFlight:()=>stage==='pending'||stage==='settling'||stage==='retry_wait',
    inspect:()=>Object.freeze({verify_required:required,verify_calls:verifyCalls,attempts,retry_waits:retryWaits,stage,consistency,verify_error:verifyError,errors:Object.freeze([...(verifyError?[verifyError]:[]),...(consistency==='changed'?['changed_during_review']:[])]),limitations:Object.freeze(consistency==='stable_observation'?[]:['provisional_results',consistency==='changed'?'changed_during_review':'consistency_unverified']),accounting:Object.freeze({...accounting})}),
    dispose(){pending=settling=undefined;retryRole=undefined;stage='disposed';},
  });
}
