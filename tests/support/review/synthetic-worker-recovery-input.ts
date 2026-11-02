/** SC2-A pure, package-excluded data checks; no recovery or runtime authority. */
import {types} from 'node:util';
import {z} from 'zod';
import {assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import type {SyntheticRecoverySeed,SyntheticSoftFacts} from './synthetic-soft-recovery.js';
type WorkerFacts=Extract<SyntheticSoftFacts,{kind:'worker_deadline'}>;
type Asset=Readonly<{state:string;update_xml_sys_id:string;reason?:string;asset_type?:string}>;
const bad=():never=>{throw Error('internal_review_error');};
function record(raw:unknown,keys:readonly string[]){
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return bad();
  if(Reflect.ownKeys(raw).length!==keys.length)return bad();const out:Record<string,unknown>=Object.create(null);
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(raw,k);if(!d||!Object.hasOwn(d,'value'))return bad();out[k]=d.value;}return Object.freeze(out);
}
function ref(raw:unknown):object{if(!raw||typeof raw!=='object'||types.isProxy(raw))return bad();return raw;}
function list(raw:unknown){if(!Array.isArray(raw)||types.isProxy(raw)||raw.length>100||Reflect.ownKeys(raw).length!==raw.length+1)return bad();return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return bad();return d.value as unknown;});}
const id=(raw:unknown)=>z.string().regex(/^[a-f0-9]{32}$/).parse(raw);
function count(raw:unknown,max:number){if(!Number.isSafeInteger(raw)||(raw as number)<0||(raw as number)>max)return bad();return raw as number;}
function asset(raw:unknown):Asset{
  if(!raw||typeof raw!=='object'||types.isProxy(raw))return bad();const state=Object.getOwnPropertyDescriptor(raw,'state')?.value;
  if(state==='reviewed'){const v=record(raw,['state','update_xml_sys_id']);return Object.freeze({state,update_xml_sys_id:id(v.update_xml_sys_id)});}
  const v=record(raw,state==='not_applicable'?['state','update_xml_sys_id','reason','asset_type']:['state','update_xml_sys_id','reason']);return Object.freeze(assetOutcomeStructure.parse(v)) as Asset;
}
export function prepareSyntheticWorkerRecoveryInputs(seed:SyntheticRecoverySeed,facts:WorkerFacts,raw:unknown){
  const v=record(raw,['source','budget','release','origin','window','verify','accounting','rows','completed','inputs','collection_status','consistency']);
  for(const k of ['source','budget','release','origin'] as const)if(v[k]!==seed[k])bad();
  const context=Object.freeze({source:seed.source,budget:seed.budget,release:seed.release,origin:seed.origin,window:ref(v.window),verify:v.verify===null?null:ref(v.verify)});
  const a=record(v.accounting,['requests','received_bytes','payload_bytes']),accounting=Object.freeze({requests:count(a.requests,210),received_bytes:count(a.received_bytes,16777216),payload_bytes:count(a.payload_bytes,8388608)});
  const rows=Object.freeze(list(v.rows).map(id)),selected=new Set(rows);if(selected.size!==rows.length)bad();
  const completed=Object.freeze(list(v.completed).map(asset)),done=new Map(completed.map(x=>[x.update_xml_sys_id,x]));if(done.size!==completed.length||completed.some(x=>!selected.has(x.update_xml_sys_id)))bad();
  const receipts=new Set<object>(),ids=new Set<string>();let upper=Date.parse(seed.observed_at),active=0;
  const inputs=Object.freeze(list(v.inputs).map(raw=>{
    const p=record(raw,['receipt','update_xml_sys_id','retrieved_at','state']),receipt=ref(p.receipt),rid=id(p.update_xml_sys_id),state=z.enum(['completed','retained']).parse(p.state);
    if(typeof p.retrieved_at!=='string'||p.retrieved_at.length!==24||!z.iso.datetime({precision:3}).safeParse(p.retrieved_at).success)bad();const time=Date.parse(p.retrieved_at as string);
    if(!selected.has(rid)||ids.has(rid)||receipts.has(receipt)||time<upper||time>Date.parse(seed.upper_utc)||(state==='completed')!==done.has(rid))bad();
    if(receipt===facts.input){if(state!=='retained')bad();active++;}ids.add(rid);receipts.add(receipt);upper=time;
    return Object.freeze({receipt,update_xml_sys_id:rid,retrieved_at:p.retrieved_at as string,state:state==='completed'?'completed' as const:'not_processed' as const});
  }));
  if(active!==1||upper!==Date.parse(seed.upper_utc)||completed.some(x=>(x.state==='reviewed'||x.state==='result_omitted')&&!ids.has(x.update_xml_sys_id)))bad();
  const assets:readonly Asset[]=Object.freeze(rows.map(rid=>done.get(rid)??Object.freeze({state:'not_processed',update_xml_sys_id:rid,reason:'deadline_exceeded'})));
  return Object.freeze({context,rows,completed,assets,inputs,accounting,collection_status:z.enum(['complete','failed']).parse(v.collection_status),consistency:z.enum(['stable_observation','changed','unverified']).parse(v.consistency)});
}
