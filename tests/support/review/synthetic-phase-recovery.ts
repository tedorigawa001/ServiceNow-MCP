/** SR-B private synthetic phase model. No transport, worker or runtime authority. */
import {types} from 'node:util';
import {z} from 'zod';
import {assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import type {SyntheticRecoverySeed,SyntheticSoftFacts} from './synthetic-soft-recovery.js';
type PhaseFacts=Extract<SyntheticSoftFacts,{kind:'phase_deadline'}>;
type Row=Readonly<{state:string;update_xml_sys_id:string;reason?:string;asset_type?:string}>;
type Retained=Readonly<{update_xml_sys_id:string;retrieved_at:string;state:'completed'|'not_processed'}>;
type WorkerRefs=Readonly<{supervisor:object;worker:object;generation:object}>;
const TOTAL=16777216,RESPONSE=4194304,PAYLOAD=8388608;
export class SyntheticPhaseError extends Error{constructor(readonly code:string){super(code);}}
const bad=():never=>{throw new SyntheticPhaseError('internal_review_error');};
function record(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return bad();
  const names=Reflect.ownKeys(raw);if(names.length!==keys.length)return bad();const out:Record<string,unknown>=Object.create(null);
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))return bad();out[k]=d.value;}return Object.freeze(out);
}
function ref(v:unknown):object{if(!v||typeof v!=='object'||types.isProxy(v))return bad();return v;}
function list(raw:unknown){if(!Array.isArray(raw)||types.isProxy(raw)||raw.length>100||Reflect.ownKeys(raw).length!==raw.length+1)return bad();return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return bad();return d.value as unknown;});}
function number(v:unknown,max:number){if(!Number.isSafeInteger(v)||(v as number)<0||(v as number)>max)return bad();return v as number;}
const id=(raw:unknown)=>z.string().regex(/^[a-f0-9]{32}$/).parse(raw);
function worker(raw:unknown):WorkerRefs{const v=record(raw,['supervisor','worker','generation']);return Object.freeze({supervisor:ref(v.supervisor),worker:ref(v.worker),generation:ref(v.generation)});}
function rows(raw:unknown):readonly Row[]{return Object.freeze(list(raw).map(value=>{
  if(!value||typeof value!=='object'||types.isProxy(value))return bad();const state=Object.getOwnPropertyDescriptor(value,'state')?.value;
  if(state==='reviewed'){const v=record(value,['state','update_xml_sys_id']);return Object.freeze({state,update_xml_sys_id:id(v.update_xml_sys_id)});}
  const v=record(value,state==='not_applicable'?['state','update_xml_sys_id','reason','asset_type']:['state','update_xml_sys_id','reason']);
  return Object.freeze(assetOutcomeStructure.parse(v)) as Row;
}));}
export function createSyntheticPhaseModel(seed:SyntheticRecoverySeed,facts:PhaseFacts,input:unknown){
  const p=record(input,['source','budget','release','origin','window','verify','accounting','rows','completed','inputs','collection_status','consistency','initial_worker']);
  for(const k of ['source','budget','release','origin'] as const)if(p[k]!==seed[k])bad();ref(p.window);if(p.verify!==null)ref(p.verify);
  const collection=z.enum(['complete','failed']).parse(p.collection_status),initialConsistency=z.enum(['stable_observation','changed','unverified']).parse(p.consistency);
  const a=record(p.accounting,['requests','received_bytes','payload_bytes']);
  const accounting={requests:number(a.requests,210),received_bytes:number(a.received_bytes,TOTAL),payload_bytes:number(a.payload_bytes,PAYLOAD)};
  const selected=list(p.rows).map(id),selectedSet=new Set(selected);if(selectedSet.size!==selected.length)bad();
  const done=rows(p.completed),doneMap=new Map(done.map(x=>[x.update_xml_sys_id,x]));if(doneMap.size!==done.length||done.some(x=>!selectedSet.has(x.update_xml_sys_id)))bad();
  const inputIds=new Set<string>(),receipts=new Set<object>();let upper=Date.parse(seed.observed_at);
  let inputs:readonly Retained[]=Object.freeze(list(p.inputs).map(value=>{
    const v=record(value,['receipt','update_xml_sys_id','retrieved_at','state']),rid=id(v.update_xml_sys_id),receipt=ref(v.receipt),state=z.enum(['completed','retained']).parse(v.state);
    if(typeof v.retrieved_at!=='string'||v.retrieved_at.length!==24||!z.iso.datetime({precision:3}).safeParse(v.retrieved_at).success)bad();const time=Date.parse(v.retrieved_at as string);
    if(!selectedSet.has(rid)||inputIds.has(rid)||receipts.has(receipt)||time<upper||time>Date.parse(seed.upper_utc)||(state==='completed')!==doneMap.has(rid))bad();
    inputIds.add(rid);receipts.add(receipt);upper=time;return Object.freeze({update_xml_sys_id:rid,retrieved_at:v.retrieved_at as string,state:state==='completed'?'completed' as const:'not_processed' as const});
  }));
  if(upper!==Date.parse(seed.upper_utc)||done.some(x=>(x.state==='reviewed'||x.state==='result_omitted')&&!inputIds.has(x.update_xml_sys_id)))bad();
  let assets:readonly Row[]=Object.freeze(selected.map(rid=>doneMap.get(rid)??Object.freeze({state:'not_processed',update_xml_sys_id:rid,reason:'deadline_exceeded'})));
  const selectedCount=assets.length,unfinished=assets.filter(x=>x.state==='not_processed').length;
  let expectedWorker:WorkerRefs|undefined=facts.worker_state==='ready'?worker({supervisor:facts.supervisor,worker:facts.worker,generation:facts.generation}):worker(p.initial_worker);
  if(facts.worker_state==='ready'&&p.initial_worker!==null)bad();
  const mode=facts.worker_state==='ready'?'reuse_generation' as const:'initial_start' as const;
  const verifyRequired=facts.phase!=='consistency'&&p.verify!==null;
  const collectionStatus=facts.phase==='metadata'?'failed' as const:collection,originalPhase=facts.phase;
  let disposed=false,stage:'parent'|'metadata'|'retry_wait'|'pending'|'settling'|'verified'|'waiting_ready'|'ready_check'|'worker_ready'|'plan_consumed'|'disposed'=verifyRequired?'parent':'verified';
  let verifyCalls=0,attempts=0,retryWaits=0,consistency=initialConsistency,verifyError:string|null=null,changed=false;
  let workerStarts=0,readyEvents=0,workerHandle:object|undefined;
  const used={parent:0,metadata:0};let retryRole:'parent'|'metadata'|undefined;
  type Attempt={handle:object;role:'parent'|'metadata';bytes:number;chunks:WeakSet<object>};let pending:Attempt|undefined,settling:Attempt|undefined;
  function available(){if(disposed)bad();}
  function resolveError(reason:string){verifyError=reason;consistency='unverified';stage='verified';}
  return Object.freeze({
    dispatch(role:unknown):object|null{
      available();if(!verifyRequired||(stage!=='parent'&&stage!=='metadata')||role!==stage||pending||used[stage]>=2)bad();const current=stage as 'parent'|'metadata';
      if(!verifyCalls)verifyCalls=1;
      if(accounting.requests>=210){resolveError('request_budget_exceeded');return null;}
      if(accounting.received_bytes>=TOTAL)throw new SyntheticPhaseError('receive_budget_exceeded');
      accounting.requests++;attempts++;used[current]++;const handle=Object.freeze(Object.create(null)) as object;pending={handle,role:current,bytes:0,chunks:new WeakSet<object>()};stage='pending';return handle;
    },
    chunk(handle:object,identity:object,size:unknown){
      available();if(stage!=='pending'||!pending||pending.handle!==handle)bad();ref(identity);if(pending!.chunks.has(identity))bad();pending!.chunks.add(identity);
      const n=number(size,TOTAL+1);accounting.received_bytes+=n;pending!.bytes+=n;
      if(accounting.received_bytes>TOTAL||pending!.bytes>RESPONSE)throw new SyntheticPhaseError('receive_budget_exceeded');
    },
    take(handle:object){available();const a=pending;pending=undefined;if(stage!=='pending'||!a||a.handle!==handle)bad();settling=a;stage='settling';return a!;},
    settle(a:Attempt,raw:unknown){
      available();if(stage!=='settling'||a!==settling)bad();settling=undefined;
      if(!raw||typeof raw!=='object'||types.isProxy(raw))bad();const kind=Object.getOwnPropertyDescriptor(raw,'kind')?.value;
      if(kind==='success'){
        const v=record(raw,['kind','changed']);if(typeof v.changed!=='boolean')bad();changed=changed||v.changed as boolean;
        if(a.role==='parent')stage='metadata';else{stage='verified';consistency=changed?'changed':'stable_observation';}return;
      }
      const v=record(raw,['kind','type','code']);if(v.kind!=='failure'||v.type!=='bounded'||typeof v.code!=='string')bad();
      const errors={phase_deadline_exceeded:'deadline_exceeded',invalid_response:'metadata_unavailable',not_found_or_not_visible:'not_found_or_not_visible',authentication_failed:'authentication_failed',access_denied:'access_denied',upstream_unavailable:'upstream_unavailable',request_budget_exceeded:'request_budget_exceeded',payload_budget_exceeded:'payload_budget_exceeded',candidate_filter_violation:'candidate_filter_violation'} as const;
      if(v.code==='upstream_unavailable'&&used[a.role]===1){retryRole=a.role;stage='retry_wait';return;}
      if(v.code==='receive_budget_exceeded'||v.code==='cancelled'||v.code==='deadline_exceeded')throw new SyntheticPhaseError(v.code);
      if(!Object.hasOwn(errors,v.code as string))bad();resolveError(errors[v.code as keyof typeof errors]);
    },
    retry(){available();if(stage!=='retry_wait'||!retryRole)bad();retryWaits++;stage=retryRole!;retryRole=undefined;},
    selectWorker(){available();if(stage!=='verified'||!expectedWorker)bad();const handle=Object.freeze(Object.create(null)) as object;
      if(mode==='reuse_generation')stage='worker_ready';else{workerStarts++;stage='waiting_ready';workerHandle=handle;}return handle;},
    takeWorker(handle:object){available();const own=workerHandle;workerHandle=undefined;if(stage!=='waiting_ready'||!own||own!==handle)bad();stage='ready_check';},
    ready(raw:unknown){available();if(stage!=='ready_check'||!expectedWorker)bad();const actual=worker(raw);if(actual.supervisor!==expectedWorker!.supervisor||actual.worker!==expectedWorker!.worker||actual.generation!==expectedWorker!.generation)bad();readyEvents++;stage='worker_ready';},
    readyFailure(raw:unknown):never{available();if(stage!=='ready_check')bad();if(raw!=='worker_unavailable'&&raw!=='cancelled'&&raw!=='deadline_exceeded')bad();throw new SyntheticPhaseError(raw as string);},
    consume(){
      available();if(stage!=='worker_ready')bad();stage='plan_consumed';
      const limitations=['soft_deadline_reached','deadline_exceeded'];
      if(consistency!=='stable_observation')limitations.push('provisional_results',consistency==='changed'?'changed_during_review':'consistency_unverified');
      const errors=[{stage:originalPhase as string,code:'deadline_exceeded'}];if(verifyError)errors.push({stage:'consistency',code:verifyError});if(consistency==='changed')errors.push({stage:'consistency',code:'changed_during_review'});
      return Object.freeze({scope:'synthetic_phase_recovery_plan' as const,mode,authority:'none' as const,assets,inputs,collection_status:collectionStatus,run_status:collectionStatus==='failed'?'failed' as const:'partial' as const,
        consistency,limitations:Object.freeze(limitations),errors:Object.freeze(errors.map(x=>Object.freeze(x))),accounting:Object.freeze({...accounting})});
    },
    inFlight:()=>stage==='pending'||stage==='settling'||stage==='retry_wait'||stage==='waiting_ready'||stage==='ready_check',
    inspect:()=>Object.freeze({mode,selected:selectedCount,not_processed:unfinished,verify_required:verifyRequired,verify_calls:verifyCalls,attempts,retry_waits:retryWaits,attempt_pending:!!pending,stage,verify_error:verifyError,
      worker_starts:workerStarts,ready_events:readyEvents,collection_status:collectionStatus,consistency,accounting:Object.freeze({...accounting}),disposed}),
    dispose(){assets=[];inputs=[];expectedWorker=undefined;pending=settling=undefined;workerHandle=undefined;retryRole=undefined;stage='disposed';disposed=true;},
  });
}
