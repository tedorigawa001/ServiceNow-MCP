/** RA-02 preparation only: fresh synthetic owner and private pins, no evidence issuer. */
import {createSyntheticFinishPins,type SyntheticFinishPins as Pins} from './synthetic-finish-pins.js';
declare const bindingBrand:unique symbol;
type Binding=Readonly<{[bindingBrand]:'synthetic_finish_assembly_binding'}>;
type Code='internal_review_error'|'cancelled'|'deadline_exceeded';
type Stage='binding'|'preparation'|'revoke'|'close';
type State='fresh'|'binding'|'bound'|'preparing'|'prepared'|'failed'|'closed';
const opaque=()=>Object.freeze(Object.create(null)) as object;
export function createSyntheticFinishAssembly(raw:unknown,check:()=>unknown=()=>undefined){
  let state:State='fresh',busy=false,bindStarted=false,prepareStarted=false;
  let source:unknown=raw,owner:Binding|undefined,pins:Pins|undefined;
  let hard:Readonly<{code:Code;stage:Stage}>|null=null;
  function clear(){source=undefined;owner=undefined;pins=undefined;}
  function fail(stage:Stage,reason?:unknown):never{
    const code:Code=reason==='cancelled'||reason==='deadline_exceeded'?reason:'internal_review_error';
    hard??=Object.freeze({code,stage});if(state!=='closed')state='failed';clear();throw Object.assign(Error(hard.code),{code:hard.code});
  }
  function guard(stage:Stage){if(hard)fail(stage);const reason=check();if(reason!==undefined)fail(stage,reason);if(hard)fail(stage);}
  function act<T>(stage:Stage,binding:object|undefined,work:()=>T,commit:(value:T)=>void=()=>{}):T{
    if(busy||hard||state==='closed'||stage!=='binding'&&binding!==owner||stage!=='binding'&&!owner)return fail(stage);
    busy=true;try{guard(stage);const value=work();guard(stage);commit(value);return value;}catch(error){return fail(stage,error==='cancelled'||error==='deadline_exceeded'?error:undefined);}finally{busy=false;}
  }
  return Object.freeze({
    bind(){const used=bindStarted;bindStarted=true;return act('binding',undefined,()=>{
      if(used||state!=='fresh')return fail('binding');state='binding';
      const own=opaque() as Binding;const prepared=createSyntheticFinishPins(source);owner=own;pins=prepared;source=undefined;return own;
    },()=>{state='bound';});},
    prepare(binding:object){const used=prepareStarted;prepareStarted=true;return act('preparation',binding,()=>{
      if(used||state!=='bound'||!pins)return fail('preparation');state='preparing';
    },()=>{state='prepared';});},
    revoke(binding:object,reason:'cancelled'|'deadline_exceeded'='cancelled'):never{return act('revoke',binding,()=>fail('revoke',reason));},
    close(binding:object){return act('close',binding,()=>{clear();state='closed';});},
    inspect(){return Object.freeze({scope:'synthetic_finish_assembly' as const,authority:'none' as const,state,bind_started:bindStarted,prepare_started:prepareStarted,pins:pins?Object.freeze({selected:pins.seed.selected.length,inputs:pins.receipts.length,accepted:pins.accepted}):null,hard,evidence_issues:0 as const,route_bound:false as const});},
  });
}
