/** WJ-A synthetic issuer only. No runtime authority, worker or shared registry. */
import {types} from 'node:util';
import {z} from 'zod';
export type SyntheticJobBinding = Readonly<{
  run:object;session:object;source:object;key:object;origin:object;budget:object;
  update_set_sys_id:string;started_at:string;deadline_ms:number;observed_at:string;
}>;
type Code='cancelled'|'deadline_exceeded'|'worker_unavailable'|'internal_review_error';
type Phase='binding'|'generation_start'|'generation_ready'|'generation_close'|'generation_closed'|'input'|'analyze'|'finish'|'consume'|'source_close'|'close'|'revoke';
type Generation={handle:object;supervisor:object;worker:object;state:'starting'|'ready'|'closing';lastId:number};
type Input={origin:object;target:string;time:string;consumed:boolean};
type Job={handle:object;generation:Generation;input?:Input;kind:'analyze'|'finish';id:number};
type ReplyContext=Readonly<{generation:object;supervisor:object;worker:object;id:number;kind:'analyze'|'finish';update_xml_sys_id?:string}>;
const keys=['run','session','source','key','origin','budget','update_set_sys_id','started_at','deadline_ms','observed_at'] as const;
const utc=z.iso.datetime({precision:3}),idPattern=/^[a-f0-9]{32}$/;
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length===32&&idPattern.test(value);
const validUtc=(value:unknown):value is string=>typeof value==='string'&&value.length===24&&utc.safeParse(value).success;
const opaque=():object=>Object.freeze(Object.create(null));
function pin(seed:SyntheticJobBinding):SyntheticJobBinding|undefined{
  try{
    if(!seed||typeof seed!=='object'||types.isProxy(seed)||![null,Object.prototype].includes(Object.getPrototypeOf(seed)))return;
    const descriptors=Object.getOwnPropertyDescriptors(seed),copy:Record<string,unknown>=Object.create(null);
    if(Reflect.ownKeys(descriptors).length!==keys.length)return;
    for(const key of keys){const d=descriptors[key];if(!d||!Object.hasOwn(d,'value'))return;copy[key]=d.value;}
    return Object.freeze(copy) as SyntheticJobBinding;
  }catch{return;}
}
function failureCode(raw:unknown):Code{
  try{
    const value=typeof raw==='string'?raw:raw&&typeof raw==='object'&&!types.isProxy(raw)?Object.getOwnPropertyDescriptor(raw,'code')?.value:undefined;
    return value==='cancelled'||value==='deadline_exceeded'||value==='worker_unavailable'?value:'internal_review_error';
  }catch{return 'internal_review_error';}
}
function pinReply(value:ReplyContext):ReplyContext|undefined{
  try{
    if(!value||typeof value!=='object'||types.isProxy(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))return;
    const ds=Object.getOwnPropertyDescriptors(value),copy:Record<string,unknown>=Object.create(null),names=Reflect.ownKeys(ds);
    if(names.length<5||names.length>6)return;
    for(const key of names){if(typeof key!=='string'||!['generation','supervisor','worker','id','kind','update_xml_sys_id'].includes(key))return;const d=ds[key];if(!Object.hasOwn(d,'value'))return;copy[key]=d.value;}
    for(const key of ['generation','supervisor','worker','id','kind'])if(!Object.hasOwn(copy,key))return;
    return Object.freeze(copy) as ReplyContext;
  }catch{return;}
}
/** Arbitrary fake identities are accepted as values, never as proof of a live session. */
export function createSyntheticWorkerJobIssuer(seed:SyntheticJobBinding,check:()=>string|undefined=()=>undefined){
  let seedRef:SyntheticJobBinding|undefined=seed,pinned=pin(seed),state:'fresh'|'binding'|'active'|'failed'|'closed'='fresh',busy=false;
  let binding:object|undefined,generation:Generation|undefined,pending:Job|undefined;
  const inputs=new Map<object,Input>();
  const origins=new Set<object>(),targets=new Set<string>();let workers=new WeakSet<object>();
  let diagnostic:Readonly<{code:Code;phase:Phase}>|null=null;
  let generations=0,jobsIssued=0,jobsConsumed=0;
  let finishClaimed=false,sourceClosed=false;
  let lastGenerationStatus:'closed'|null=null;
  const clear=()=>{seedRef=pinned=undefined;binding=undefined;generation=undefined;pending=undefined;inputs.clear();origins.clear();targets.clear();workers=new WeakSet<object>();lastGenerationStatus=null;};
  const fail=(phase:Phase,raw?:unknown):never=>{
    if(state==='closed')throw Object.assign(Error('internal_review_error'),{code:'internal_review_error'});
    diagnostic??=Object.freeze({code:failureCode(raw),phase});state='failed';clear();throw Object.assign(Error(diagnostic.code),{code:diagnostic.code});
  };
  const guard=(phase:Phase)=>{
    const stop=check();if(stop!==undefined)fail(phase,stop);
    if(state!=='binding'&&state!=='active')fail(phase);
    const current=seedRef?pin(seedRef):undefined;
    if(!current||!pinned)fail(phase);
    for(const key of keys)if(current![key]!==pinned![key])fail(phase);
  };
  const active=(phase:Phase,value:object)=>{if(busy||state!=='active'||value!==binding)fail(phase);};
  function act<T>(phase:Phase,value:object,claim:()=>void,work:()=>T,commit:()=>void=()=>{}):T{
    active(phase,value);busy=true;
    try{claim();guard(phase);const result=work();guard(phase);commit();return result;}
    catch(error){return fail(phase,error);}finally{busy=false;}
  }
  return Object.freeze({
    bind(value:SyntheticJobBinding):object{
      if(busy||state!=='fresh')return fail('binding');state='binding';busy=true;
      try{
        if(value!==seedRef)fail('binding');guard('binding');
        const p=pinned!;
        for(const key of keys.slice(0,6)){const ref=p[key];if(!ref||typeof ref!=='object'||types.isProxy(ref))fail('binding');}
        if(!validId(p.update_set_sys_id)||!validUtc(p.started_at)||!validUtc(p.observed_at)||
          !Number.isSafeInteger(p.deadline_ms)||p.deadline_ms<1||p.deadline_ms>60000||Date.parse(p.observed_at)<Date.parse(p.started_at)||Date.parse(p.observed_at)>Date.parse(p.started_at)+p.deadline_ms)fail('binding');
        guard('binding');const handle=opaque();binding=handle;state='active';return handle;
      }catch(error){return fail('binding',error);}finally{busy=false;}
    },
    startGeneration(value:object,supervisor:object,worker:object):object{
      const handle=opaque();
      return act('generation_start',value,()=>{if(sourceClosed||finishClaimed||generation||generations>=2||workers.has(worker))fail('generation_start');workers.add(worker);},()=>{
        if(!supervisor||typeof supervisor!=='object'||types.isProxy(supervisor)||!worker||typeof worker!=='object'||types.isProxy(worker))fail('generation_start');
        return handle;
      },()=>{generation={handle,supervisor,worker,state:'starting',lastId:0};lastGenerationStatus=null;generations++;});
    },
    ready(value:object,handle:object){
      act('generation_ready',value,()=>{if(sourceClosed||!generation||generation.handle!==handle||generation.state!=='starting')fail('generation_ready');},()=>{},()=>{generation!.state='ready';});
    },
    closeGeneration(value:object,handle:object){
      act('generation_close',value,()=>{if(!generation||generation.handle!==handle||generation.state==='closing'||pending)fail('generation_close');generation!.state='closing';},()=>{});
    },
    confirmClosed(value:object,handle:object){
      act('generation_closed',value,()=>{if(!generation||generation.handle!==handle||generation.state!=='closing')fail('generation_closed');},()=>{},()=>{generation=undefined;lastGenerationStatus='closed';});
    },
    closeSource(value:object){act('source_close',value,()=>{if(sourceClosed)fail('source_close');sourceClosed=true;},()=>{});},
    close(value:object){act('close',value,()=>{if(pending||generation)fail('close');},()=>{},()=>{clear();state='closed';});},
    revoke(reason:unknown){if(state==='closed')return;diagnostic??=Object.freeze({code:failureCode(reason),phase:'revoke'});state='failed';clear();},
    input(value:object,origin:object,target:string,time:string):object{
      const handle=opaque();return act('input',value,()=>{
        if(sourceClosed||finishClaimed||inputs.size>=100||origins.has(origin)||targets.has(target))fail('input');origins.add(origin);targets.add(target);
      },()=>{
        if(!origin||typeof origin!=='object'||types.isProxy(origin)||!validId(target)||!validUtc(time)||
          Date.parse(time)<Date.parse(pinned!.observed_at)||Date.parse(time)>Date.parse(pinned!.started_at)+pinned!.deadline_ms)fail('input');
        return handle;
      },()=>{inputs.set(handle,{origin,target,time,consumed:false});});
    },
    analyze(value:object,gen:object,input:object,id:number):object{
      let record:Input|undefined;const handle=opaque();return act('analyze',value,()=>{
        record=inputs.get(input);if(!record||record.consumed)fail('analyze');record!.consumed=true;
        if(sourceClosed||finishClaimed||!generation||generation.handle!==gen||generation.state!=='ready'||pending||!Number.isSafeInteger(id)||id<=generation.lastId)fail('analyze');
        generation!.lastId=id;pending={handle,generation:generation!,input:record!,kind:'analyze',id};
      },()=>handle,()=>{jobsIssued++;});
    },
    finish(value:object,gen:object,id:number):object{
      const handle=opaque();return act('finish',value,()=>{
        if(sourceClosed||finishClaimed)fail('finish');finishClaimed=true;
        if(!generation||generation.handle!==gen||generation.state!=='ready'||pending||!Number.isSafeInteger(id)||id<=generation.lastId)fail('finish');
        generation!.lastId=id;pending={handle,generation:generation!,kind:'finish',id};
      },()=>handle,()=>{jobsIssued++;});
    },
    consume(value:object,job:object,context:ReplyContext){
      let expected:Job|undefined;return act('consume',value,()=>{expected=pending;pending=undefined;if(!expected||expected.handle!==job)fail('consume');},()=>{
        const e=expected!,c=pinReply(context);
        if(!c||c.generation!==e.generation.handle||c.supervisor!==e.generation.supervisor||c.worker!==e.generation.worker||c.kind!==e.kind||c.id!==e.id||c.update_xml_sys_id!==e.input?.target)fail('consume');
        return Object.freeze({scope:'synthetic_job_consumption' as const,kind:e.kind,authority:'none' as const});
      },()=>{jobsConsumed++;});
    },
    inspect(){return Object.freeze({scope:'synthetic_worker_job_only' as const,state,generation_status:generation?.state??lastGenerationStatus,generations_started:generations,jobs_issued:jobsIssued,jobs_consumed:jobsConsumed,pending:!!pending,inputs_retained:inputs.size,source_closed:sourceClosed,
      held_time:pinned?Object.freeze({started_at:pinned.started_at,deadline_ms:pinned.deadline_ms,observed_at:pinned.observed_at}):null,diagnostic,
      permissions:Object.freeze({formal_issuance:false,dispatch:false,source_acceptance:false})});},
  });
}
