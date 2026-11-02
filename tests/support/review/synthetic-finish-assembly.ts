/** RA-02 preparation only: fresh synthetic owner and private pins, no evidence issuer. */
import {types} from 'node:util';
import {projectSyntheticFinishValues} from './synthetic-finish-context-values.js';
declare const bindingBrand:unique symbol;
type Binding=Readonly<{[bindingBrand]:'synthetic_finish_assembly_binding'}>;
type Code='internal_review_error'|'cancelled'|'deadline_exceeded';
type Stage='binding'|'preparation'|'revoke'|'close';
type State='fresh'|'binding'|'bound'|'preparing'|'prepared'|'failed'|'closed';
type Values=ReturnType<typeof projectSyntheticFinishValues>['value'];
type Pins=Readonly<{seed:Readonly<Pick<Values,'header'|'selected'|'run_context'>>;receipts:Values['inputs'];outcomes:Values['outcomes'];accepted:number}>;
const opaque=()=>Object.freeze(Object.create(null)) as object;
const reject=():never=>{throw Error('internal_review_error');};
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))return reject();
  const names=Reflect.ownKeys(value);if(names.length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return reject();
  const out:Record<string,unknown>=Object.create(null);
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value'))return reject();out[k]=d.value;}return out;
}
/** Copies fixture DATA, not opaque caller references; no getters, capabilities or lifecycle imports. */
function copySeed(raw:unknown):unknown{
  let nodes=0,characters=0;const ancestors=new Set<object>();
  function string(v:string){characters+=v.length*3;if(characters>262144)reject();}
  function visit(v:unknown,depth:number):unknown{
    if(++nodes>10000||depth>8)reject();
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='string'){string(v);return v;}
    if(typeof v==='number'){if(!Number.isSafeInteger(v))reject();return v;}
    if(!v||typeof v!=='object'||types.isProxy(v)||ancestors.has(v)||![null,Object.prototype,Array.prototype].includes(Object.getPrototypeOf(v)))return reject();
    const keys=Reflect.ownKeys(v);ancestors.add(v);
    try{
      if(Array.isArray(v)){
        if(v.length>100||keys.length!==v.length+1)reject();
        return Object.freeze(Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))reject();return visit(d!.value,depth+1);}));
      }
      if(Object.getPrototypeOf(v)===Array.prototype||keys.length>30)reject();
      const out:Record<string,unknown>=Object.create(null);
      for(const k of keys){if(typeof k!=='string')reject();string(k as string);const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))reject();out[k as string]=visit(d!.value,depth+1);}return Object.freeze(out);
    }finally{ancestors.delete(v);}
  }
  return visit(raw,0);
}
function pin(raw:unknown,owner:object):Pins{
  const s=object(copySeed(raw),['kind','time','header','selected','inputs','outcomes']);
  if(s.kind!=='synthetic_finish_seed_v1'||!Array.isArray(s.inputs)||!Array.isArray(s.outcomes))return reject();
  const time=object(s.time,['started_at','deadline_ms','observed_at','upper_utc']);
  const run_context={run:opaque(),session:opaque(),source:opaque(),key:opaque(),origin:opaque(),budget:opaque(),release:opaque(),window:opaque(),...time};
  const ledger=new Map<string,{receipt:object;accepted:object|null}>();let accepted=0;
  const inputs=s.inputs.map(rawInput=>{
    const i=object(rawInput,['update_xml_sys_id','retrieved_at','state','expected_context','accepted']);
    if(typeof i.update_xml_sys_id!=='string'||ledger.has(i.update_xml_sys_id))return reject();
    let outcome:object|null=null;
    if(i.accepted!==null){
      const a=object(i.accepted,['kind','update_xml_sys_id','retrieved_at']);
      if(a.kind!=='synthetic_reviewed_pin'||a.update_xml_sys_id!==i.update_xml_sys_id||a.retrieved_at!==i.retrieved_at||i.state!=='completed'||i.expected_context===null)return reject();
      // Created inside this fixture construction; not promoted from a caller result/summary.
      outcome=Object.freeze({kind:'synthetic_original_outcome_pin',update_xml_sys_id:i.update_xml_sys_id,retrieved_at:i.retrieved_at,expected_context:i.expected_context});accepted++;
    }
    const receipt=opaque();ledger.set(i.update_xml_sys_id,{receipt,accepted:outcome});
    return {receipt,update_xml_sys_id:i.update_xml_sys_id,retrieved_at:i.retrieved_at,state:i.state,expected_context:i.expected_context};
  });
  const outcomes=s.outcomes.map(rawOutcome=>{
    if(!rawOutcome||typeof rawOutcome!=='object')return reject();
    const state=Object.getOwnPropertyDescriptor(rawOutcome,'state')?.value;
    if(state!=='reviewed'&&state!=='result_omitted')return rawOutcome;
    const row=object(rawOutcome,state==='reviewed'?['state','update_xml_sys_id']:['state','update_xml_sys_id','reason']);
    const original=ledger.get(row.update_xml_sys_id as string);
    if(!original||state==='reviewed'&&!original.accepted)return reject();
    return state==='reviewed'?{...row,receipt:original.receipt,accepted_outcome:original.accepted}:{...row,reviewed_origin:original.accepted?{receipt:original.receipt,accepted_outcome:original.accepted}:null};
  });
  // RA-01 route/plan placeholders are local validation scaffolding, NEVER live route slots.
  const lifecycle=opaque(),frame={supervisor:opaque(),worker:opaque(),generation:opaque()};
  const p=projectSyntheticFinishValues({kind:'synthetic_finish_context_v1',owner,plan:opaque(),source_lifecycle:lifecycle,run_context,header:s.header,selected:s.selected,inputs,outcomes,
    route:{owner,frame,ready_origin:opaque(),cleanup_origin:{lifecycle:opaque(),frame,sink:opaque(),start_serial:0},source_origin:{source:run_context.source,lifecycle}}}).value;
  // Drop all route/plan scaffolding. No handle, ready proof or lifecycle evidence survives.
  return Object.freeze({seed:Object.freeze({header:p.header,selected:p.selected,run_context:p.run_context}),receipts:p.inputs,outcomes:p.outcomes,accepted});
}
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
  function act<T>(stage:Stage,binding:object|undefined,work:()=>T):T{
    if(busy||hard||state==='closed'||stage!=='binding'&&binding!==owner||stage!=='binding'&&!owner)return fail(stage);
    busy=true;try{guard(stage);const value=work();guard(stage);return value;}catch(error){return fail(stage,error==='cancelled'||error==='deadline_exceeded'?error:undefined);}finally{busy=false;}
  }
  return Object.freeze({
    bind(){const used=bindStarted;bindStarted=true;return act('binding',undefined,()=>{
      if(used||state!=='fresh')return fail('binding');state='binding';
      const own=opaque() as Binding;const prepared=pin(source,own);owner=own;pins=prepared;source=undefined;state='bound';return own;
    });},
    prepare(binding:object){const used=prepareStarted;prepareStarted=true;return act('preparation',binding,()=>{
      if(used||state!=='bound'||!pins)return fail('preparation');state='preparing';state='prepared';
    });},
    revoke(binding:object,reason:'cancelled'|'deadline_exceeded'='cancelled'):never{return act('revoke',binding,()=>fail('revoke',reason));},
    close(binding:object){return act('close',binding,()=>{clear();state='closed';});},
    inspect(){return Object.freeze({scope:'synthetic_finish_assembly' as const,authority:'none' as const,state,bind_started:bindStarted,prepare_started:prepareStarted,pins:pins?Object.freeze({selected:pins.seed.selected.length,inputs:pins.receipts.length,accepted:pins.accepted}):null,hard,evidence_issues:0 as const,route_bound:false as const});},
  });
}
