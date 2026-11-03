/** CG-B fresh synthetic assembly only. Not a runtime issuer or content gate. */
import {types} from 'node:util';
import {z} from 'zod';
import {reviewResultV2Structure,bp5RuleIdsSchema,releaseEvidenceStructure} from '../../../src/review/result-schema-v2.js';
import {validateRecoveryAnalysisJson,measureRecoveryFullJson} from './synthetic-recovery-full-json.js';

type Reason='binding'|'duplicate'|'state'|'shape'|'context'|'internal'|'cancelled'|'deadline_exceeded'|'reentrant';
export class RecoveryCaptureError extends Error{readonly code='internal_review_error';constructor(readonly reason:Reason){super('internal_review_error');}}
declare const inputBrand:unique symbol,wireBrand:unique symbol,captureBrand:unique symbol,manifestBrand:unique symbol;
export type CaptureInput=Readonly<{[inputBrand]:'synthetic_capture_input'}>;
export type CaptureWire=Readonly<{[wireBrand]:'synthetic_capture_wire'}>;
export type ReviewedCapture=Readonly<{[captureBrand]:'synthetic_reviewed_capture'}>;
export type CaptureManifest=Readonly<{[manifestBrand]:'synthetic_capture_manifest'}>;
type Asset=ReturnType<typeof validateRecoveryAnalysisJson>['value'];
type Reviewed=Extract<Asset,{state:'reviewed'}>;
const contextSchema=z.strictObject({update_xml_sys_id:z.string().regex(/^[a-f0-9]{32}$/),applicable_rule_ids:bp5RuleIdsSchema,
  reviewed_at:z.iso.datetime(),target:reviewResultV2Structure.shape.target,instance_binding:reviewResultV2Structure.shape.instance_binding,
  instance_release:releaseEvidenceStructure,requested_rule_ids:bp5RuleIdsSchema,release_limitations:z.array(z.string().min(1).max(200)).max(100)});
type Context=z.infer<typeof contextSchema>;
function data(raw:unknown){
  let nodes=0,characters=0;
  function copy(v:unknown,d:number):unknown{
    if(++nodes>10000||d>8)throw new RecoveryCaptureError('shape');
    if(typeof v==='string'){characters+=v.length*3;if(characters>262144)throw new RecoveryCaptureError('shape');return v;}
    if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;
    if(!v||typeof v!=='object'||types.isProxy(v))throw new RecoveryCaptureError('shape');
    if(Array.isArray(v)){
      if(v.length>100||Object.getPrototypeOf(v)!==Array.prototype||Reflect.ownKeys(v).length!==v.length+1)throw new RecoveryCaptureError('shape');
      return Array.from({length:v.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(v,String(i));if(!p||!Object.hasOwn(p,'value'))throw new RecoveryCaptureError('shape');return copy(p.value,d+1);});
    }
    if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new RecoveryCaptureError('shape');
    const keys=Reflect.ownKeys(v);if(keys.length>30)throw new RecoveryCaptureError('shape');const out:Record<string,unknown>=Object.create(null);
    for(const k of keys){if(typeof k!=='string')throw new RecoveryCaptureError('shape');copy(k,d+1);const p=Object.getOwnPropertyDescriptor(v,k);if(!p||!Object.hasOwn(p,'value'))throw new RecoveryCaptureError('shape');out[k]=copy(p.value,d+1);}return out;
  }return copy(raw,0);
}
function same(a:unknown,b:unknown):boolean{
  if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const x=Object.keys(a).sort(),y=Object.keys(b).sort();return x.length===y.length&&x.every((k,i)=>k===y[i]&&same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
}
const handle=<T>():T=>Object.freeze(Object.create(null)) as T;
type GuardStop='cancelled'|'deadline_exceeded';
/** Bounded DATA projection only, never a receipt/capture registration or body getter. */
export function projectSyntheticRecoveryCaptureContexts(raw:unknown){
  let contexts:Context[];
  try{
    if(!Array.isArray(raw)||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length<1||raw.length>100||Reflect.ownKeys(raw).length!==raw.length+1)throw 0;
    contexts=Array.from({length:raw.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(raw,String(i));if(!p||!Object.hasOwn(p,'value'))throw 0;return contextSchema.parse(data(p.value));});
    if(new Set(contexts.map(c=>c.update_xml_sys_id)).size!==contexts.length)throw 0;
    for(const c of contexts)if(c.target.update_xml_sys_id!==c.update_xml_sys_id||new Set(c.applicable_rule_ids).size!==c.applicable_rule_ids.length||new Set(c.requested_rule_ids).size!==c.requested_rule_ids.length
      ||c.instance_binding!==contexts[0].instance_binding||c.target.update_set_id!==contexts[0].target.update_set_id||!same(c.instance_release,contexts[0].instance_release))throw 0;
  }catch{throw new RecoveryCaptureError('shape');}
  function freeze(v:unknown){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}}
  freeze(contexts);return Object.freeze(contexts);
}
export function createSyntheticRecoveryCaptureAssembly(raw:unknown,dependencies:Readonly<{guard:(phase:'pre'|'post',operation:'accept'|'transfer')=>GuardStop|void}>){
  if(!dependencies||typeof dependencies!=='object'||types.isProxy(dependencies))throw new RecoveryCaptureError('shape');
  const guardDescriptor=Object.getOwnPropertyDescriptor(dependencies,'guard');
  if(!guardDescriptor||!Object.hasOwn(guardDescriptor,'value')||typeof guardDescriptor.value!=='function'||types.isProxy(guardDescriptor.value))throw new RecoveryCaptureError('shape');
  const fixedGuard=guardDescriptor.value as typeof dependencies.guard,contexts=projectSyntheticRecoveryCaptureContexts(raw);
  // Only these fresh handles represent synthetic run/session/source/auth/budget/release/window/frame/job/receipt identity.
  // No caller-supplied identity, runtime registry, or existing root can be adopted.
  type Slot={context:Context;id:number;started:boolean;accepted:boolean};
  const inputs=new Map<CaptureInput,Slot>(),wires=new Map<CaptureWire,{slot:Slot;json:string}>(),captures=new Map<ReviewedCapture,{slot:Slot;value:Reviewed}>();
  let manifest:CaptureManifest|undefined,held:typeof captures|undefined,state:'active'|'transferred'|'failed'|'discarded'='active',first:Reason|undefined,busy=false,accepted=0;
  const fail:(reason:Reason)=>never=(reason)=>{first??=reason;state='failed';wires.clear();captures.clear();held?.clear();held=undefined;manifest=undefined;inputs.clear();throw new RecoveryCaptureError(first);};
  function active(){if(first)throw new RecoveryCaptureError(first);if(busy)fail('reentrant');if(state!=='active')fail('state');}
  function guard(phase:'pre'|'post',operation:'accept'|'transfer'){
    let stop:unknown;try{stop=fixedGuard(phase,operation);}catch{fail('internal');}
    if(first)throw new RecoveryCaptureError(first);
    if(stop!==undefined){if(stop==='cancelled'||stop==='deadline_exceeded')fail(stop);fail('internal');}
  }
  for(const [i,context] of contexts.entries())inputs.set(handle<CaptureInput>(),{context,id:i+1,started:false,accepted:false});
  function deliver(input:CaptureInput,envelope:unknown):CaptureWire{
    active();const slot=inputs.get(input);if(!slot)fail('binding');if(slot.started)fail('duplicate');slot.started=true;
    try{
      // Never read accessors or accept a Proxy as the same delivery. No data copy can register an origin.
      if(!envelope||typeof envelope!=='object'||types.isProxy(envelope)||![Object.prototype,null].includes(Object.getPrototypeOf(envelope)))fail('shape');
      const keys=Reflect.ownKeys(envelope);if(keys.length!==3||!['id','ok','json'].every(k=>keys.includes(k)))fail('shape');
      const own=(k:string)=>{const p=Object.getOwnPropertyDescriptor(envelope,k);if(!p||!Object.hasOwn(p,'value'))fail('shape');return p.value;};
      const id=own('id'),ok=own('ok'),json=own('json');if(id!==slot.id||ok!==true||typeof json!=='string')fail('binding');measureRecoveryFullJson(json);
      const wire=handle<CaptureWire>();wires.set(wire,{slot,json});return wire;
    }catch{if(first)throw new RecoveryCaptureError(first);return fail('shape');}
  }
  function accept(wire:CaptureWire):ReviewedCapture{
    active();const pending=wires.get(wire);if(!pending)fail('binding');wires.delete(wire);if(pending.slot.id!==accepted+1)fail('state');busy=true;
    try{
      guard('pre','accept');let value:Asset|undefined,mismatch:Reason|undefined;
      try{
        value=validateRecoveryAnalysisJson(pending.json).value;const c=pending.slot.context;
        if(value.state!=='reviewed'||value.update_xml_sys_id!==c.update_xml_sys_id||!same(value.applicable_rule_ids,c.applicable_rule_ids))mismatch='context';
        else{const r=value.result;if(!same(r.target,c.target)||r.reviewed_at!==c.reviewed_at||r.instance_binding!==c.instance_binding||!same(r.instance_release,c.instance_release)||!same(r.coverage.requested_rule_ids,c.requested_rule_ids)||c.release_limitations.some(x=>!r.limitations.includes(x)))mismatch='context';}
      }catch{mismatch='shape';}
      guard('post','accept');if(mismatch)fail(mismatch);
      if(!value||value.state!=='reviewed'||pending.slot.accepted||!pending.slot.started)fail('state');
      pending.slot.accepted=true;accepted++;const capture=handle<ReviewedCapture>();captures.set(capture,{slot:pending.slot,value});return capture;
    }catch{if(first)throw new RecoveryCaptureError(first);return fail('internal');}finally{busy=false;}
  }
  function transfer():CaptureManifest{
    active();if(wires.size||captures.size!==inputs.size)fail('state');
    busy=true;
    try{
      guard('pre','transfer');
      // Move the same immutable values, never serialize/clone or reconstruct them from a summary.
      const moving=new Map(captures);guard('post','transfer');
      held=moving;captures.clear();manifest=handle<CaptureManifest>();state='transferred';return manifest;
    }catch{if(first)throw new RecoveryCaptureError(first);return fail('internal');}finally{busy=false;}
  }
  function discardManifest(value:CaptureManifest){
    if(first)throw new RecoveryCaptureError(first);if(busy)fail('reentrant');if(state!=='transferred'||value!==manifest)fail('binding');
    held?.clear();held=undefined;manifest=undefined;state='discarded';inputs.clear();
  }
  function discard(){if(busy)fail('reentrant');wires.clear();captures.clear();held?.clear();held=undefined;manifest=undefined;inputs.clear();if(!first)state='discarded';}
  return Object.freeze({inputs:Object.freeze([...inputs.keys()]),deliver,accept,transfer,discardManifest,discard,
    stop:(reason:GuardStop)=>{if(reason!=='cancelled'&&reason!=='deadline_exceeded')fail('internal');return fail(reason);},
    summary:()=>Object.freeze({scope:'synthetic_recovery_capture_only' as const,authority:'none' as const,state,first_failure:first??null,accepted,
      wires:wires.size,captures:captures.size,manifests:manifest?1:0,unverified:Object.freeze(['runtime_origin','finish_job','omission','content_gate','whole_run_budget'] as const)})});
}
