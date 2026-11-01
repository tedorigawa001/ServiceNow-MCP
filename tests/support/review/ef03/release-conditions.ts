/** Development-only conditions and fixed same-source comparison. No runtime registry or Permit. */
import {types} from 'node:util';
import {parseReleaseComparisonInput,compareRelease,type ReleaseComparisonInput,type ReleaseComparisonDraft} from '../../../../src/servicenow/review-kernel/release-comparison.js';
import {normalizeConstructionReason,type ConstructionPublicCode} from '../../../../src/servicenow/review-kernel/construction-state.js';
import {DevelopmentSourceError,type createDevelopmentSourceRealm} from './source.js';
type Sources=ReturnType<typeof createDevelopmentSourceRealm>;
type Source=ReturnType<Sources['create']>;
type Context=Readonly<{run:object;snapshot:object;lease:object}>;
type Phase='bound'|'claiming'|'claimed'|'comparing'|'compared'|'transferring'|'transferred'|'failed'|'closed';
function frozenCopy<T>(value:T):T{
  const copy=structuredClone(value);
  function freeze(item:unknown){if(item&&typeof item==='object'){Object.values(item).forEach(freeze);Object.freeze(item);}}
  freeze(copy);return copy;
}

export function createDevelopmentReleaseConditionsRealm(sources:Sources){
  const handles=new WeakMap<object,ReleaseComparisonInput>(),runs=new WeakSet<object>();
  function pin(raw:unknown,deadline:number):object{
    if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new DevelopmentSourceError('invalid_input');
    const keys=Reflect.ownKeys(raw),fields:Record<string,unknown>=Object.create(null);
    if(keys.length!==3)throw new DevelopmentSourceError('invalid_input');
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(raw,key)!;
      if(typeof key!=='string'||!['started_at','observed_at','policy'].includes(key)||!Object.hasOwn(d,'value')||!d.enumerable)throw new DevelopmentSourceError('invalid_input');
      fields[key]=d.value;
    }
    const parsed=parseReleaseComparisonInput({model_id:'release-comparison-v1',timing:{started_at:fields.started_at,observed_at:fields.observed_at,deadline_ms:deadline},
      policy:fields.policy,observation:{kind:'complete_200',rows:[]}});
    if(!parsed.ok||parsed.input.policy.issue==='config_binding_mismatch'||parsed.input.policy.assertion&&parsed.input.policy.assertion.instance_binding!==parsed.input.policy.instanceBinding)throw new DevelopmentSourceError('invalid_input');
    const handle=Object.freeze(Object.create(null));handles.set(handle,parsed.input);return handle;
  }
  function bind(handle:object,context:Context,source:Source,deadline:number,guard:()=>ConstructionPublicCode|null){
    const value=handles.get(handle);handles.delete(handle); // Spend before all checks/callbacks.
    if(!value)throw new DevelopmentSourceError('internal_review_error','evidence_binding_mismatch');
    if(!context||typeof context!=='object'||types.isProxy(context)||!Object.isFrozen(context)||![Object.prototype,null].includes(Object.getPrototypeOf(context)))throw new DevelopmentSourceError('internal_review_error','evidence_binding_mismatch');
    const keys=Reflect.ownKeys(context);
    if(keys.length!==3||keys.some(key=>typeof key!=='string'||!['run','snapshot','lease'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(context,key)!,'value')))throw new DevelopmentSourceError('internal_review_error','evidence_binding_mismatch');
    if([context.run,context.snapshot,context.lease].some(item=>!item||typeof item!=='object'||types.isProxy(item)))throw new DevelopmentSourceError('internal_review_error','evidence_binding_mismatch');
    if(runs.has(context.run))throw new DevelopmentSourceError('internal_review_error','invalid_state');
    runs.add(context.run);
    let state:Phase='bound',live:Readonly<{value:ReleaseComparisonInput;context:Context;source:Source}>|undefined={value,context,source};
    let primary:Readonly<{code:string;public_code:ConstructionPublicCode}>|null=null;
    let draft:ReleaseComparisonDraft|undefined;
    const reject=(raw:unknown):never=>{
      const code=normalizeConstructionReason(raw);
      const public_code:ConstructionPublicCode=code==='invalid_state'||code==='invalid_observation_time'||code==='evidence_binding_mismatch'?'internal_review_error':code;
      primary??=Object.freeze({code,public_code});if(state!=='closed')state='failed';live=undefined;draft=undefined;
      throw new DevelopmentSourceError(primary.public_code,primary.code);
    };
    const check=()=>{
      let code:ConstructionPublicCode|null;try{code=guard();}catch{return reject('internal_review_error');}
      if(code!==null)reject(code);if(primary)reject(primary.code);if(!live||state==='closed')reject('closed');
    };
    if(value.timing.deadline_ms!==deadline||!sources.matches(source,context))reject('evidence_binding_mismatch');
    check();if(source.inspect().state!=='new'||source.inspect().ready_generation!==0)reject('invalid_state');check();
    sources.armReleaseObservation(source,context);
    function requireBinding(candidate:Context,selected:Source){
      if(!live||candidate!==live.context||selected!==live.source||!sources.matches(selected,candidate))reject('evidence_binding_mismatch');
    }
    function requireCompleted(selected:Source){
      const facts=selected.inspect();
      if(facts.primary)reject(facts.primary.code);
      if(facts.sealed||facts.state==='closed')reject('closed');
      if(facts.ready_generation!==1||facts.state!=='done')reject('invalid_state');
    }
    return Object.freeze({
      claim(candidate:Context,selected:Source){
        if(primary)reject(primary.code);
        if(state!=='bound')reject(state==='closed'?'closed':'invalid_state');
        state='claiming';
        if(!live||candidate!==live.context||selected!==live.source||!sources.matches(selected,candidate))reject('evidence_binding_mismatch');
        check();const facts=selected.inspect();
        if(facts.ready_generation!==1||facts.state!=='parent')reject('invalid_state');
        check();state='claimed';
      },
      compare(candidate:Context,selected:Source){
        if(primary)reject(primary.code);
        if(state!=='claimed')reject(state==='closed'?'closed':'invalid_state');
        state='comparing';requireBinding(candidate,selected);check();
        requireCompleted(selected);
        let rows:unknown;
        try{rows=sources.takeReleaseObservation(selected,candidate);}catch(error){return reject(error instanceof DevelopmentSourceError?error.internal:'internal_review_error');}
        check(); // Acquisition guards may have synchronously revoked this owner.
        requireCompleted(selected);
        const result=compareRelease({...live!.value,observation:{kind:'complete_200',rows}});
        check(); // Stop wins even when the comparison itself returned invalid_input.
        requireCompleted(selected);
        if(!result.ok)return reject('internal_review_error');
        draft=result;state='compared';
      },
      takeForClose(candidate:Context,selected:Source):ReleaseComparisonDraft{
        if(primary)reject(primary.code);
        if(state!=='compared')reject(state==='closed'?'closed':'invalid_state');
        state='transferring';requireBinding(candidate,selected);check();
        requireCompleted(selected);if(!draft)reject('invalid_state');
        const copy=frozenCopy(draft!);check();requireCompleted(selected);draft=undefined;state='transferred';return copy;
      },
      revoke(){state='closed';live=undefined;draft=undefined;},
      inspect(){return Object.freeze({state,has_conditions:live!==undefined,primary});},
    });
  }
  return Object.freeze({pin,bind});
}
