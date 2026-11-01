/** Development-only B-01 root. Never imports runtime session, registration or source modules. */
import {types} from 'node:util';
import {createConstructionState,type ConstructionResource,type ConstructionStage,type ConstructionPublicCode} from '../../../../src/servicenow/review-kernel/construction-state.js';
import {createCanonicalReviewBudget,CanonicalBudgetError} from '../../../../src/servicenow/review-canonical-budget.js';

const faults=['after_admission','after_registration','duplicate_registration','foreign_registration','after_controller','after_timer','after_listener','after_commit'] as const;
type Fault=typeof faults[number];
class Rejection extends Error {
  constructor(readonly code:ConstructionPublicCode,readonly internal:string=code){super(code);}
}
class DevelopmentIdentity {
  readonly #realm:object;
  constructor(realm:object){this.#realm=realm;}
  static matches(value:unknown,realm:object){return !!value&&typeof value==='object'&&!types.isProxy(value)&&#realm in value&&value.#realm===realm;}
}
function data(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new Rejection('invalid_input');
  const result:Record<string,unknown>={};
  for(const key of Reflect.ownKeys(raw)){
    const d=Object.getOwnPropertyDescriptor(raw,key)!;
    if(typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(d,'value'))throw new Rejection('invalid_input');
    result[key]=d.value;
  }
  return result;
}
const permissions=Object.freeze({formal_issuance:false,dispatch:false,source_acceptance:false} as const);

/** Each factory call owns a different realm and its own weak registration/admission tables.
 * Only synthetic time/wait boundaries can be injected, never a session, owner, token or cleanup stack. */
export function createDevelopmentRoot(dependencies:Readonly<{clock?:()=>number;wait?:(signal:AbortSignal)=>Promise<void>}>={}){
  const d=data(dependencies,['clock','wait']);
  for(const value of Object.values(d))if(value!==undefined&&(typeof value!=='function'||types.isProxy(value)))throw new Rejection('invalid_input');
  const clock=d.clock as (()=>number)|undefined??(()=>performance.now());
  const wait=d.wait as ((signal:AbortSignal)=>Promise<void>)|undefined??(async()=>{});
  const realm=Object.freeze({}),registered=new WeakSet<object>(),live=new Set<object>(),principals=new Set<string>();
  let active=0,starting=false;
  const inspect=()=>Object.freeze({active,registered:live.size,principal_keys:principals.size});
  function requireUnregistered(identity:object){
    if(!DevelopmentIdentity.matches(identity,realm))throw new Rejection('internal_review_error','evidence_binding_mismatch');
    if(registered.has(identity))throw new Rejection('internal_review_error','invalid_state');
  }
  function register(identity:object){
    requireUnregistered(identity);
    registered.add(identity);live.add(identity);
  }
  async function run(raw:unknown,options:Readonly<{signal?:AbortSignal}>={}){
    const construction=createConstructionState();
    const identity=new DevelopmentIdentity(realm);
    let stage:ConstructionStage='input',constructing=true,closed=false,admitted=false,registeredHere=false,ownsStart=false;
    let principal='',fault:Fault|undefined,deadline=60000;
    let core:ReturnType<typeof createCanonicalReviewBudget>|undefined,controller:AbortController|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined,removeExternal:(()=>void)|undefined;
    let runPrimary:Readonly<{code:ConstructionPublicCode}>|null=null,stopped:ConstructionPublicCode|null=null;
    const stop=(code:ConstructionPublicCode)=>{
      if(closed)return;
      stopped??=code;
      if(constructing)construction.fail(stage,code);else runPrimary??=Object.freeze({code});
      core?.writer.stop(code);controller?.abort();
    };
    const guard=()=>{
      if(stopped)throw new Rejection(stopped);
      const sample=core?.view.lease.read();const failure=core?.view.failure();
      if(failure){stop(failure);throw new Rejection(failure);}
      if(sample&&sample.remaining_ms===0){stop('deadline_exceeded');throw new Rejection('deadline_exceeded');}
    };
    const inject=(at:Fault)=>{guard();if(fault===at)throw new Rejection('internal_review_error');};
    try{
      if(starting)throw new Rejection('review_busy');
      starting=true;ownsStart=true;
      const p=data(raw,['principal','deadline_ms','fault']),o=data(options,['signal']);
      if(typeof p.principal!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.principal))throw new Rejection('invalid_input');
      if(p.deadline_ms!==undefined&&(!Number.isInteger(p.deadline_ms)||Number(p.deadline_ms)<1||Number(p.deadline_ms)>60000))throw new Rejection('invalid_input');
      if(p.fault!==undefined&&!faults.includes(p.fault as Fault))throw new Rejection('invalid_input');
      principal=p.principal;fault=p.fault as Fault|undefined;deadline=p.deadline_ms as number??60000;
      construction.attempt('snapshot');construction.held('snapshot');
      const signal=o.signal as AbortSignal|undefined;
      if(signal!==undefined){
        if(types.isProxy(signal)||Object.getPrototypeOf(signal)!==AbortSignal.prototype||['aborted','addEventListener','removeEventListener'].some(k=>Object.hasOwn(signal,k)))throw new Rejection('invalid_input');
        Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,signal,[]);
      }
      stage='clock';const start=clock();
      if(!Number.isFinite(start)||start<0)throw new Rejection('internal_review_error','invalid_observation_time');
      // Same order as the production root: busy pre-check, then core -> admission -> registered owner.
      stage='admission';
      if(active>=2||principals.has(principal))throw new Rejection('review_busy');
      stage='core';construction.attempt('core');
      core=createCanonicalReviewBudget({clock:{remainingMs:()=>Math.max(0,deadline-(clock()-start))},limits:{deadlineMs:deadline}});
      construction.held('core');guard();
      stage='admission';construction.attempt('admission');active++;admitted=true;principals.add(principal);construction.held('admission');inject('after_admission');
      stage='owner';const candidate=fault==='foreign_registration'?new DevelopmentIdentity(Object.freeze({})):identity;
      requireUnregistered(candidate);construction.attempt('registered_owner');register(candidate);
      registeredHere=true;construction.held('registered_owner');
      if(fault==='duplicate_registration')register(identity);
      inject('after_registration');
      construction.recordBinding('core');
      stage='controllers';construction.attempt('controller');controller=new AbortController();construction.held('controller');inject('after_controller');
      stage='timer';construction.attempt('deadline_timer');timer=setTimeout(()=>stop('deadline_exceeded'),Math.max(0,deadline-(clock()-start)));
      if(timer===undefined||timer===null)throw new Rejection('internal_review_error');
      construction.held('deadline_timer');inject('after_timer');
      if(signal){
        const onAbort=()=>stop('cancelled'),add=signal.addEventListener,remove=signal.removeEventListener;
        removeExternal=()=>Reflect.apply(remove,signal,['abort',onAbort]);
        stage='listener';construction.attempt('abort_listener');Reflect.apply(add,signal,['abort',onAbort,{once:true}]);construction.held('abort_listener');
      }
      inject('after_listener');stage='commit';guard();
      if(!construction.commit())throw new Rejection('internal_review_error');
      if(signal?.aborted){stop('cancelled');guard();}
      constructing=false;starting=false;ownsStart=false;inject('after_commit');
      let removeWait=()=>{};
      try{
        const signal=controller.signal;
        const abort=new Promise<never>((_,reject)=>{const cancelled=()=>reject(new Rejection(stopped??'cancelled'));signal.addEventListener('abort',cancelled,{once:true});removeWait=()=>signal.removeEventListener('abort',cancelled);});
        guard();await Promise.race([Promise.resolve().then(()=>{guard();return wait(signal);}),abort]);guard();
      }finally{removeWait();}
    }catch(error){
      const code=stopped??(error instanceof Rejection||error instanceof CanonicalBudgetError?error.code:'internal_review_error');
      if(constructing)construction.fail(stage,error instanceof Rejection?error.internal:error instanceof CanonicalBudgetError?core?.view.diagnostic().primary?.internal??code:code);
      else runPrimary??=Object.freeze({code});
      stopped??=code;
    }finally{
      closed=true;
      const release=(slot:ConstructionResource,operation:(()=>void)|undefined)=>{
        if(!construction.needed(slot))return;
        let confirmed=false;try{if(operation){operation();confirmed=true;}}catch{/* fixed diagnostic only */}
        construction.release(slot,confirmed,operation!==undefined);
        if(!confirmed){construction.fail('close','internal_review_error');stopped??='internal_review_error';}
      };
      release('registered_owner',registeredHere?()=>{live.delete(identity);registeredHere=false;}:undefined);
      release('core',core?()=>core!.writer.close():undefined);
      release('abort_listener',removeExternal);removeExternal=undefined;
      release('deadline_timer',timer!==undefined?()=>clearTimeout(timer):undefined);timer=undefined;
      release('controller',controller?()=>controller!.abort():undefined);controller=undefined;
      release('admission',admitted?()=>{admitted=false;active--;principals.delete(principal);}:undefined);
      release('snapshot',()=>{principal='';});construction.seal();
      if(ownsStart){starting=false;ownsStart=false;}
    }
    const diagnostic=construction.copy(),code=stopped??diagnostic.primary?.public_code??null;
    const budget=Object.freeze(core?.view.stats()??{requests:0,received_bytes:0,payload_bytes:0});core=undefined;
    return Object.freeze({assembly:'ef03-development' as const,scope:'construction_only' as const,ok:code===null,code,construction:diagnostic,run_primary:runPrimary,budget,permissions});
  }
  return Object.freeze({run,inspect});
}
