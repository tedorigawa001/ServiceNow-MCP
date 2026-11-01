/** Development-only source lifecycle. Never registers or adopts a runtime session/source. */
import {types} from 'node:util';
import {parseSourceParent,projectSourceReleaseRows,SourceValueError} from '../../../../src/servicenow/review-kernel/source-values.js';
import {normalizeConstructionReason,type ConstructionPublicCode} from '../../../../src/servicenow/review-kernel/construction-state.js';
import {consumeSourceCleanupProof} from '../../../../src/review/abort-scope-evidence-status-cleanup.js';

type Context=Readonly<{run:object;snapshot:object;lease:object}>;
type Purpose='parent'|'release';
type State='new'|'preparing'|'prepared'|'readying'|'parent'|'release'|'issuing'|'consuming'|'done'|'failed'|'closed';
export class DevelopmentSourceError extends Error {
  constructor(readonly code:ConstructionPublicCode,readonly internal:string=code){super(code);}
}
/** Pin finite, JSON-like source values before any await; no accessors, proxies or live objects. */
export function pinDevelopmentSourceProfile(raw:unknown){
  let nodes=0,characters=0;
  function pin(value:unknown,depth=0):unknown{
    if(++nodes>512||depth>5)throw new DevelopmentSourceError('invalid_input');
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
    if(typeof value==='string'){characters+=value.length;if(characters>65536)throw new DevelopmentSourceError('invalid_input');return value;}
    if(!value||typeof value!=='object'||types.isProxy(value))throw new DevelopmentSourceError('invalid_input');
    const array=Array.isArray(value);
    if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new DevelopmentSourceError('invalid_input');
    const keys=Reflect.ownKeys(value);
    if(keys.length>64)throw new DevelopmentSourceError('invalid_input');
    if(array){
      // Resource bound only (key cap above); the 21-row release limit stays a value check -> invalid_response.
      if(keys.length!==value.length+1)throw new DevelopmentSourceError('invalid_input');
      return Object.freeze(Array.from({length:value.length},(_,i)=>{
        const d=Object.getOwnPropertyDescriptor(value,String(i));
        if(!d||!Object.hasOwn(d,'value'))throw new DevelopmentSourceError('invalid_input');return pin(d.value,depth+1);
      }));
    }
    const copy:Record<string,unknown>=Object.create(null);
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(value,key)!;
      if(typeof key!=='string'||!Object.hasOwn(d,'value'))throw new DevelopmentSourceError('invalid_input');
      characters+=key.length;if(characters>65536)throw new DevelopmentSourceError('invalid_input');
      copy[key]=pin(d.value,depth+1);
    }
    return Object.freeze(copy);
  }
  const value=pin(raw) as Record<string,unknown>;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||
    !['target','parent','release'].every(k=>Object.hasOwn(value,k))||typeof value.target!=='string'||!/^[a-f0-9]{32}$/.test(value.target))
    throw new DevelopmentSourceError('invalid_input');
  return Object.freeze({target:value.target,parent:value.parent,release:value.release});
}

/** Trusted development assembly creates contexts. Handles never cross the root's summary boundary. */
export function createDevelopmentSourceRealm(){
  const created=new WeakSet<object>();
  const sources=new WeakMap<object,{context:Context;arm():void;take():unknown;finishUnrequested():void}>();
  function create(context:Context,target:string,guard:()=>ConstructionPublicCode|null,nativeOwner?:object){
    if(created.has(context.run))throw new DevelopmentSourceError('internal_review_error','invalid_state');
    created.add(context.run); // Key the originating run, not its copyable context wrapper.
    let state:State='new',sealed=false,generation=0,parentCount=0,releaseCount=0,statusCount=0;
    let primary:Readonly<{code:string;public_code:ConstructionPublicCode}>|null=null;
    const acks=new Map<object,{purpose:Purpose;value:unknown}>();
    let observationArmed=false,observationAvailable=false,releaseObservation:unknown;
    const inactive=()=>sealed||state==='closed';
    const failure=()=>primary;
    function reject(raw:unknown):never{
      const internal=normalizeConstructionReason(raw);
      const code=internal==='invalid_state'||internal==='invalid_observation_time'||internal==='evidence_binding_mismatch'?'internal_review_error':internal;
      if(!sealed){primary??=Object.freeze({code:internal,public_code:code});if(state!=='closed')state='failed';acks.clear();releaseObservation=undefined;observationAvailable=false;} // Revocation is terminal.
      throw new DevelopmentSourceError(primary?.public_code??code,primary?.code??internal);
    }
    function check(){
      if(inactive())reject('closed');if(primary)reject(primary.code);
      let code:ConstructionPublicCode|null;try{code=guard();}catch{reject('internal_review_error');}
      if(code)reject(code);if(inactive())reject('closed');const after=failure();if(after)reject(after.code);
    }
    function enter(candidate:Context,expected:State,next:State){
      if(sealed||state==='closed')reject('closed');
      if(candidate!==context)reject('evidence_binding_mismatch');
      if(state!==expected)reject('invalid_state');
      state=next;check(); // Claim before callbacks: reentry cannot repeat the transition.
    }
    function inspect(){return Object.freeze({assembly:'ef03-development' as const,state,sealed,ready_generation:generation,
      parent_consumptions:parentCount,release_consumptions:releaseCount,status_consumptions:statusCount,primary,
      permissions:Object.freeze({formal_issuance:false,release_permit:false,fallback:false} as const)});}
    const source=Object.freeze({
      prepare(candidate:Context){enter(candidate,'new','preparing');check();state='prepared';},
      ready(candidate:Context){enter(candidate,'prepared','readying');check();generation=1;state='parent';},
      issue(purpose:Purpose,value:unknown){
        const expected=purpose==='parent'?'parent':'release';
        if(!['parent','release'].includes(purpose)||state!==expected||acks.size)reject('invalid_state');
        enter(context,expected,'issuing');
        let parsed:unknown;
        try{
          if(purpose==='parent')parsed=parseSourceParent(value,target);
          else{
            if(!value||typeof value!=='object'||!('result' in value)||!Array.isArray(value.result)||value.result.length>21)throw new SourceValueError();
            parsed=projectSourceReleaseRows(value.result);
          }
        }catch(error){reject(error instanceof SourceValueError?'invalid_response':'internal_review_error');}
        check();const ack=Object.freeze(Object.create(null));acks.set(ack,{purpose,value:parsed});state=expected;return ack;
      },
      consume(ack:object,purpose:Purpose,candidate:Context){
        const value=acks.get(ack);acks.delete(ack); // One-shot even if pre/post guard rejects.
        if(!value||value.purpose!==purpose)reject('evidence_binding_mismatch');
        enter(candidate,purpose==='parent'?'parent':'release','consuming');check();
        // Only an explicitly bound development owner retains the same consumed projection.
        if(purpose==='parent'){parentCount=1;state='release';}else{
          if(observationArmed){releaseObservation=value.value;observationAvailable=true;}
          releaseCount=1;state='done';
        }
      },
      consumeStatus(proof:object,window:object,candidate:Context){
        if(!nativeOwner)reject('evidence_binding_mismatch');
        // Spend the proof even when source pre-guard refuses, like deleting a body ack before enter().
        const prior=state;
        if(!inactive()&&state==='release')state='consuming';
        const consumed=consumeSourceCleanupProof(nativeOwner,proof,window);
        if(inactive())reject('closed');
        if(candidate!==context)reject('evidence_binding_mismatch');
        if(prior!=='release'||acks.size)reject('invalid_state');
        check();
        if(!consumed.ok)reject(consumed.code);
        check();statusCount=1;state='done';
      },
      revoke(){if(sealed)return;acks.clear();releaseObservation=undefined;observationAvailable=false;state='closed';},
      seal(){if(sealed)return;if(state!=='closed')reject('invalid_state');sealed=true;},
      inspect,
    });
    sources.set(source,{context,
      arm(){
        if(observationArmed||state!=='new')reject('invalid_state');
        observationArmed=true;check();check();
      },
      take(){
        const available=observationAvailable,value=releaseObservation;
        observationAvailable=false;releaseObservation=undefined; // Spend before callbacks, even on failure.
        if(!observationArmed||!available||state!=='done')reject('invalid_state');
        check();check();return value;
      },
      finishUnrequested(){
        if(!observationArmed||acks.size||parentCount!==1||releaseCount!==0)reject('invalid_state');
        enter(context,'release','consuming');check();state='done';
      },
    });return source;
  }
  function record(source:object,context:Context){
    const value=sources.get(source);
    if(!value||value.context!==context)throw new DevelopmentSourceError('internal_review_error','evidence_binding_mismatch');
    return value;
  }
  return Object.freeze({create,matches:(source:object,context:Context)=>sources.get(source)?.context===context,
    armReleaseObservation:(source:object,context:Context)=>record(source,context).arm(),
    takeReleaseObservation:(source:object,context:Context)=>record(source,context).take(),
    finishUnrequested:(source:object,context:Context)=>record(source,context).finishUnrequested(),
  });
}
