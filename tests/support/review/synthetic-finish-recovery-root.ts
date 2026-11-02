/** RB-A: fixed synthetic construction descriptors, no existing-root adoption or finish route. */
import {types} from 'node:util';
import {z} from 'zod';
import {createSyntheticRecoveryKernel,type SyntheticRecoverySeed,type SyntheticSoftFacts} from './synthetic-recovery-kernel.js';
declare const ownerBrand:unique symbol,observationBrand:unique symbol,recoveryBrand:unique symbol;
type Binding=Readonly<{[ownerBrand]:'synthetic_finish_recovery_binding'}>;
type Observation=Readonly<{[observationBrand]:'synthetic_finish_recovery_observation'}>;
type Recovery=Readonly<{[recoveryBrand]:'synthetic_finish_recovery_claim'}>;
const opaque=()=>Object.freeze(Object.create(null)) as object;
const utc=z.string().length(24).pipe(z.iso.datetime({precision:3}));
const point=z.enum(['request_check_unstarted','request_check_existing','ready_timer','ready_reply_check','send_check','analyze_timer','analyze_reply_check']);
const timeSchema=z.strictObject({started_at:utc,deadline_ms:z.number().int().min(1).max(60000),observed_at:utc,upper_utc:utc});
function record(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)throw Error();
  const copy:Record<string,unknown>=Object.create(null);
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))throw Error();copy[k]=d.value;}return copy;
}
function construct(raw:unknown){
  const d=record(raw,['kind','time','point']);if(d.kind!=='synthetic_finish_recovery_root_v1')throw Error();
  const time=Object.freeze(timeSchema.parse(record(d.time,['started_at','deadline_ms','observed_at','upper_utc']))),p=point.parse(d.point);
  const seed:SyntheticRecoverySeed=Object.freeze({run:opaque(),session:opaque(),source:opaque(),key:opaque(),origin:opaque(),budget:opaque(),release:opaque(),...time});
  const base={kind:'worker_deadline' as const,phase:'analysis' as const,supervisor:opaque(),request:opaque(),input:opaque()};
  let facts:SyntheticSoftFacts;
  if(p==='request_check_unstarted')facts=Object.freeze({...base,point:p,worker_state:'none'});
  else{
    const refs={worker:opaque(),generation:opaque()};
    if(p==='ready_timer'||p==='ready_reply_check')facts=Object.freeze({...base,...refs,point:p,worker_state:'starting'});
    else if(p==='send_check')facts=Object.freeze({...base,...refs,point:p,worker_state:'ready',allocation:opaque(),id:1});
    else if(p==='analyze_timer'||p==='analyze_reply_check')facts=Object.freeze({...base,...refs,point:p,worker_state:'ready',job:opaque(),id:1});
    else facts=Object.freeze({...base,...refs,point:p,worker_state:'ready'});
  }
  return Object.freeze({seed,facts});
}
export function createSyntheticFinishRecoveryRoot(raw:unknown,check:()=>string|undefined=()=>undefined){
  let material:ReturnType<typeof construct>|undefined;
  try{material=construct(raw);}catch{/* fixed binding failure in the kernel; never exposes raw input/errors */}
  const invalid=!material;
  const core=createSyntheticRecoveryKernel(material?.seed as SyntheticRecoverySeed,material?.facts as SyntheticSoftFacts,()=>invalid?'internal_review_error':check());
  function invoke<T>(work:()=>T):T{try{return work();}finally{const s=core.inspect().state;if(s==='failed'||s==='closed')material=undefined;}}
  return Object.freeze({
    bind(...extra:unknown[]):Binding{return invoke(()=>core.bind(extra.length?Object.freeze({}) as SyntheticRecoverySeed:material?.seed as SyntheticRecoverySeed)) as unknown as Binding;},
    observe(binding:object,...extra:unknown[]):Observation{return invoke(()=>core.observe(binding,extra.length?Object.freeze({}):material?.facts)) as unknown as Observation;},
    claimRecovery(binding:object,observation:object):Recovery{return invoke(()=>core.claimRecovery(binding,observation)) as unknown as Recovery;},
    consumeRecovery(binding:object,recovery:object){return invoke(()=>core.consumeRecovery(binding,recovery));},
    revoke(reason:unknown){return invoke(()=>core.revoke(reason));},
    close(binding:object){return invoke(()=>core.close(binding));},
    inspect(){const s=core.inspect();return Object.freeze({scope:'synthetic_finish_recovery_root' as const,authority:'none' as const,state:s.state,claims:s.claims,diagnostics:s.diagnostics,route_bound:false as const,evidence_issues:0 as const,permissions:s.permissions});},
  });
}
