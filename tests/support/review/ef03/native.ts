/** EF-03-only Response delivery and cleanup. No runtime session, registry or friend import. */
import {types} from 'node:util';
import {createIsolatedStatusCleanupRealm} from '../../../../src/review/abort-scope-evidence-status-cleanup.js';
import {DevelopmentSourceError} from './source.js';
import {pinDevelopmentTranscript} from './bootstrap.js';
import type {ConstructionPublicCode} from '../../../../src/servicenow/review-kernel/construction-state.js';
const deliveries=new WeakMap<object,unknown>(),claimedResponses=new WeakSet<object>();
// Shared only among EF-03 development roots, separate from ST/ND fixture and production tables.
const cleanupRealm=createIsolatedStatusCleanupRealm();
export function createDevelopmentResponseDelivery(response:unknown){
  if(!response||typeof response!=='object'||types.isProxy(response)||Object.getPrototypeOf(response)!==Response.prototype||claimedResponses.has(response))
    throw new DevelopmentSourceError('invalid_input');
  claimedResponses.add(response);const token=Object.freeze(Object.create(null));deliveries.set(token,response);return token;
}
export function pinDevelopmentNative(raw:unknown){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new DevelopmentSourceError('invalid_input');
  const d:Record<string,unknown>=Object.create(null),keys=Reflect.ownKeys(raw);
  if(keys.length!==3)throw new DevelopmentSourceError('invalid_input');
  for(const key of keys){const v=Object.getOwnPropertyDescriptor(raw,key)!;
    if(typeof key!=='string'||!['target','parent_bytes','delivery'].includes(key)||!Object.hasOwn(v,'value'))throw new DevelopmentSourceError('invalid_input');d[key]=v.value;}
  if(!d.delivery||typeof d.delivery!=='object'||types.isProxy(d.delivery)||!deliveries.has(d.delivery))throw new DevelopmentSourceError('invalid_input');
  const response=deliveries.get(d.delivery);deliveries.delete(d.delivery); // Spent even on later input/parent failure.
  const transcript=pinDevelopmentTranscript({target:d.target,auth:'per-user',responses:[{purpose:'parent',bytes:d.parent_bytes},{purpose:'release',bytes:new Uint8Array()}]});
  let ownedResponse:unknown=response,owner:ReturnType<typeof cleanupRealm.create>|undefined,finished=false,closed=false;
  let copy:ReturnType<ReturnType<typeof cleanupRealm.create>['diagnostics']>|undefined;
  let runStop:ConstructionPublicCode|null=null;
  return Object.freeze({transcript,
    createOwner(input:Parameters<typeof cleanupRealm.create>[0]){
      if(owner)throw new DevelopmentSourceError('internal_review_error','invalid_state');owner=cleanupRealm.create(input);return owner;
    },
    async execute(window:Parameters<ReturnType<typeof cleanupRealm.create>['acquire']>[1],accept:(proof:object,window:object)=>void){
      if(finished||!owner)throw new DevelopmentSourceError('internal_review_error','invalid_state');finished=true;
      try{
        const acquired=await owner.acquire(ownedResponse,window);ownedResponse=undefined;
        if(!acquired.ok)throw new DevelopmentSourceError(acquired.code==='invalid_state'||acquired.code==='evidence_binding_mismatch'||acquired.code==='invalid_observation_time'?'internal_review_error':acquired.code,acquired.code);
        const proof=await owner.finishSource(acquired.value.handle);
        if(!proof.ok)throw new DevelopmentSourceError(proof.code==='invalid_state'||proof.code==='evidence_binding_mismatch'||proof.code==='invalid_observation_time'?'internal_review_error':proof.code,proof.code);
        accept(proof.value,window as object);
      }finally{copy=owner.diagnostics();await owner.close();closed=true;}
    },
    stop(code:ConstructionPublicCode){runStop??=code;owner?.stop('cancelled');},
    async close(){ownedResponse=undefined;if(owner){copy??=owner.diagnostics();await owner.close();}closed=true;transcript.dispose();},
    diagnostic(){const value=copy??owner?.diagnostics();return value?Object.freeze({...value,revoked:closed||value.revoked,closed,run_stop:runStop}):null;},
  });
}
