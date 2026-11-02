/** WJ-B/C test-only owner; no live worker or runtime authority. */
import {types} from 'node:util';
import {z} from 'zod';
import {bp5RuleIdsSchema,releaseEvidenceStructure,checkReleaseEvidence} from '../../../src/review/result-schema-v2.js';
import {assetOutcomeStructure} from '../../../src/review/aggregate-schema.js';
import {createSyntheticWorkerJobIssuer,type SyntheticJobBinding} from './synthetic-worker-job.js';
import {sameFinishRuleSet,sameFinishReleaseEncoding,finishEndOutsideBounds} from './synthetic-finish-scalars.js';
type Reply=Parameters<ReturnType<typeof createSyntheticWorkerJobIssuer>['consume']>[2];
type Expected=Readonly<{record_updated_at:string;instance_binding:string;instance_release:unknown;requested_rule_ids:readonly string[];release_limitations:readonly string[]}>;
type Receipt={target:string;time:string;expected?:Expected};
type Diagnostic=Readonly<{code:string;phase:string}>;
type FinishHeader=Readonly<{schema:string;binding:string;release:ReturnType<typeof releaseEvidenceStructure.parse>;rules:readonly string[];limitations:readonly string[]}>;
type Completed={receipt:Receipt;state:'reviewed'|'rejected'|'result_omitted';reason?:string};
type FinishAsset=Readonly<{id:string;state:string;data?:unknown;receipt?:Receipt}>;
// Local retained projection bound, not a new runtime wire/config date policy.
const MAX_PROJECTION=262144;
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||types.isProxy(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw Error();
  return value as Record<string,unknown>;
}
function field(value:unknown,key:string):unknown{
  const d=Object.getOwnPropertyDescriptor(object(value),key);if(!d||!Object.hasOwn(d,'value'))throw Error();return d.value;
}
function copy(value:unknown):unknown{
  let bytes=0,nodes=0;
  function visit(v:unknown,depth:number):unknown{
    if(++nodes>10000||depth>8)throw Error();
    if(v===null||typeof v==='boolean'||typeof v==='number')return v;
    if(typeof v==='string'){bytes+=v.length*3;if(bytes>MAX_PROJECTION)throw Error();return v;}
    if(!v||typeof v!=='object'||types.isProxy(v))throw Error();
    if(Array.isArray(v)){
      if(v.length>100||Reflect.ownKeys(v).length!==v.length+1)throw Error();
      return Object.freeze(Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error();return visit(d.value,depth+1);}));
    }
    object(v);const keys=Reflect.ownKeys(v);if(keys.length>30)throw Error();const out:Record<string,unknown>=Object.create(null);
    for(const key of keys){if(typeof key!=='string')throw Error();bytes+=key.length*3;if(bytes>MAX_PROJECTION)throw Error();out[key]=visit(field(v,key),depth+1);}return Object.freeze(out);
  }
  return visit(value,0);
}
const rules=(value:unknown)=>{const r=bp5RuleIdsSchema.parse(copy(value));if(new Set(r).size!==r.length)throw Error();return Object.freeze(r);};
const warnings=(value:unknown)=>Object.freeze(z.array(z.string().max(200)).max(100).parse(copy(value)));
function pinExpected(value:Expected):Expected{
  return Object.freeze({record_updated_at:z.iso.datetime().parse(field(value,'record_updated_at')),
    instance_binding:z.string().regex(/^[a-f0-9]{64}$/).parse(field(value,'instance_binding')),
    instance_release:Object.freeze(releaseEvidenceStructure.parse(copy(field(value,'instance_release')))),
    requested_rule_ids:rules(field(value,'requested_rule_ids')),release_limitations:warnings(field(value,'release_limitations'))});
}
function compare(receipt:Receipt,updateSet:string,outcome:unknown):'reviewed'|'rejected'|'result_omitted'{
  if(field(outcome,'update_xml_sys_id')!==receipt.target)throw Error();
  const state=field(outcome,'state');
  if(state==='rejected'||state==='result_omitted'){
    assetOutcomeStructure.parse({state,update_xml_sys_id:receipt.target,reason:field(outcome,'reason')});return state;
  }
  if(state!=='reviewed'||!receipt.expected)throw Error();
  const e=receipt.expected,r=field(outcome,'result'),t=field(r,'target');
  if(field(r,'reviewed_at')!==receipt.time||field(t,'retrieved_at')!==receipt.time||field(t,'update_set_id')!==updateSet||
    field(t,'update_xml_sys_id')!==receipt.target||field(t,'target_version')!=='update_set_payload'||field(t,'record_updated_at')!==e.record_updated_at||
    field(r,'instance_binding')!==e.instance_binding||!sameFinishRuleSet(rules(field(outcome,'applicable_rule_ids')),e.requested_rule_ids)||
    !sameFinishRuleSet(rules(field(field(r,'coverage'),'requested_rule_ids')),e.requested_rule_ids))throw Error();
  const release=releaseEvidenceStructure.parse(copy(field(r,'instance_release')));
  if(!sameFinishReleaseEncoding(JSON.stringify(release),JSON.stringify(e.instance_release)))throw Error();
  const limits=warnings(field(r,'limitations'));if(!e.release_limitations.every(x=>limits.includes(x)))throw Error();return 'reviewed';
}
function header(value:unknown,updateSet:string,start:string):FinishHeader{
  const target=field(value,'target'),schema=z.enum(['bp-mcp-review-0.2','bp-mcp-review-0.3']).parse(field(value,'schema_version'));
  if(field(target,'update_set_sys_id')!==updateSet||field(target,'target_version')!=='update_set_payload'||field(value,'started_at')!==start||field(field(value,'limits'),'deadline_ms')!==60000)throw Error();
  return Object.freeze({schema,binding:z.string().regex(/^[a-f0-9]{64}$/).parse(field(target,'instance_binding')),
    release:releaseEvidenceStructure.parse(copy(field(value,'instance_release'))),rules:rules(field(field(value,'coverage'),'requested_rule_ids')),limitations:warnings(field(value,'limitations'))});
}
function finishTime(value:unknown,expected:FinishHeader,updateSet:string,time:NonNullable<ReturnType<ReturnType<typeof createSyntheticWorkerJobIssuer>['inspect']>['held_time']>,upper:string){
  const h=header(value,updateSet,time.started_at),end=z.iso.datetime({precision:3}).parse(field(value,'ended_at'));
  if(h.schema!==expected.schema||h.binding!==expected.binding||!sameFinishReleaseEncoding(JSON.stringify(h.release),JSON.stringify(expected.release))||!sameFinishRuleSet(h.rules,expected.rules)||!expected.limitations.every(x=>h.limitations.includes(x))||
    finishEndOutsideBounds(Date.parse(end),Date.parse(upper),Date.parse(time.started_at),time.deadline_ms)||
    checkReleaseEvidence(h.release,h.release.source==='operator_config'?time.started_at:end,h.binding,[...h.limitations]).length||
    h.release.source==='operator_config'&&Date.parse(h.release.expires_at)<=Date.parse(time.started_at)+60000)throw Error();
  return end;
}
function list(value:unknown):readonly unknown[]{
  if(!Array.isArray(value)||types.isProxy(value)||value.length>100||Reflect.ownKeys(value).length!==value.length+1)throw Error();
  return Object.freeze(Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error();return d.value;}));
}
function manifest(value:unknown,h:FinishHeader,updateSet:string,completed:ReadonlyMap<string,Completed>):ReadonlyMap<string,FinishAsset>{
  const out=new Map<string,FinishAsset>();
  for(const raw of list(field(value,'assets'))){
    const id=z.string().regex(/^[a-f0-9]{32}$/).parse(field(raw,'update_xml_sys_id')),state=field(raw,'state'),c=completed.get(id);
    if(out.has(id))throw Error();
    if(c){
      const e=c.receipt.expected!;
      if(e.instance_binding!==h.binding||!sameFinishReleaseEncoding(JSON.stringify(e.instance_release),JSON.stringify(h.release))||!e.requested_rule_ids.every(x=>h.rules.includes(x))||!e.release_limitations.every(x=>h.limitations.includes(x)))throw Error();
      if(state!==c.state&&!(c.state==='reviewed'&&state==='result_omitted'))throw Error();
    }
    if(state==='reviewed'){
      if(!c||c.state!=='reviewed')throw Error();compare(c.receipt,updateSet,raw);out.set(id,Object.freeze({id,state,receipt:c.receipt}));
    }else{
      const data=assetOutcomeStructure.parse(copy(raw));if(c&&c.state!=='reviewed'&&field(data,'reason')!==c.reason)throw Error();
      out.set(id,Object.freeze({id,state:data.state,data}));
    }
  }
  for(const id of completed.keys())if(!out.has(id))throw Error();return out;
}
function compareAssets(value:unknown,expected:ReadonlyMap<string,FinishAsset>,updateSet:string,end:string){
  const rows=list(field(value,'assets'));if(rows.length!==expected.size)throw Error();const seen=new Set<string>();
  for(const raw of rows){
    const id=field(raw,'update_xml_sys_id');if(typeof id!=='string'||seen.has(id))throw Error();seen.add(id);
    const e=expected.get(id);if(!e)throw Error();const state=field(raw,'state');
    if(e.state==='reviewed'){
      if(state==='reviewed'){compare(e.receipt!,updateSet,raw);if(Date.parse(e.receipt!.time)>Date.parse(end))throw Error();}
      else{
        const data=assetOutcomeStructure.parse(copy(raw));if(data.state!=='result_omitted'||!warnings(field(value,'limitations')).includes('response_truncated'))throw Error();
      }
    }else if(JSON.stringify(assetOutcomeStructure.parse(copy(raw)))!==JSON.stringify(e.data))throw Error();
  }
}
/** Owns only synthetic identities; finish candidates never confer production authority. */
export function createSyntheticWorkerTimeIssuer(seed:SyntheticJobBinding,check:()=>string|undefined=()=>undefined){
  const jobs=createSyntheticWorkerJobIssuer(seed,check);
  const seedKeys=['run','session','source','key','origin','budget','update_set_sys_id','started_at','deadline_ms','observed_at'];
  let seedRef:SyntheticJobBinding|undefined=seed,pinnedSeed:readonly unknown[]|undefined;
  try{if(Reflect.ownKeys(object(seed)).length===seedKeys.length)pinnedSeed=seedKeys.map(k=>field(seed,k));}catch{/* bind refuses malformed input */}
  let upper:string|null=null,held:Readonly<{started_at:string;deadline_ms:number;observed_at:string}>|null=null;
  let binding:object|undefined,updateSet='',generation:object|undefined,starting=false,busy=false,accepted=0;
  let diagnostic:Diagnostic|null=null,pending:{handle:object;receipt:Receipt}|undefined;
  let finishPending:{handle:object;header:FinishHeader;assets:ReadonlyMap<string,FinishAsset>}|undefined,candidate:Readonly<{handle:object;end:string;assets:number}>|undefined,terminalConsumed=false;
  const receipts=new Map<object,Receipt>();
  const completed=new Map<string,Completed>();
  function stop(phase:string,raw?:unknown):never{
    if(jobs.inspect().state==='closed')throw Error('internal_review_error');
    const d=raw&&typeof raw==='object'&&!types.isProxy(raw)?Object.getOwnPropertyDescriptor(raw,'code')?.value:raw;
    const code=d==='cancelled'||d==='deadline_exceeded'||d==='worker_unavailable'?d:'internal_review_error';
    diagnostic??=Object.freeze({code,phase});jobs.revoke(diagnostic.code);binding=generation=seedRef=undefined;pinnedSeed=undefined;starting=false;pending=finishPending=candidate=undefined;receipts.clear();completed.clear();updateSet='';
    throw Object.assign(Error(diagnostic.code),{code:diagnostic.code});
  }
  function guard(){
    const reason=check();if(reason!==undefined)stop('guard',reason);if(diagnostic)stop(diagnostic.phase,diagnostic.code);
    if(!seedRef||!pinnedSeed||Reflect.ownKeys(object(seedRef)).length!==seedKeys.length||seedKeys.some((k,i)=>field(seedRef,k)!==pinnedSeed![i]))stop('binding');
  }
  function act<T>(phase:string,value:object|undefined,fn:()=>T,commit:(result:T)=>void=()=>{},claim:()=>void=()=>{}):T{
    if(busy||diagnostic||(phase!=='binding'&&value!==binding))return stop(phase,diagnostic?.code);busy=true;
    try{claim();guard();const result=fn();guard();commit(result);return result;}catch(error){return stop(phase,error);}finally{busy=false;}
  }
  return Object.freeze({
    bind(value:SyntheticJobBinding){return act('binding',undefined,()=>{
      const b=jobs.bind(value);guard();return b;
    },b=>{binding=b;held=jobs.inspect().held_time;upper=held!.observed_at;updateSet=field(value,'update_set_sys_id') as string;});},
    input(value:object,origin:object,target:string,time:string,expected?:Expected){return act('input',value,()=>{
      if(upper===null||typeof time!=='string'||Date.parse(time)<Date.parse(upper))stop('input');
      const e=expected===undefined?undefined:pinExpected(expected),h=jobs.input(value,origin,target,time);guard();
      receipts.set(h,{target,time,expected:e});return h;
    },()=>{upper=time;});},
    startGeneration(value:object,supervisor:object,worker:object){return act('generation_start',value,()=>{
      const g=jobs.startGeneration(value,supervisor,worker);guard();generation=g;starting=true;return g;
    });},
    ready(value:object,g:object){return act('generation_ready',value,()=>{jobs.ready(value,g);starting=false;});},
    analyze(value:object,g:object,input:object,id:number){return act('analyze',value,()=>{
      const receipt=receipts.get(input);receipts.delete(input);if(!receipt?.expected)stop('analyze');
      const h=jobs.analyze(value,g,input,id);pending={handle:h,receipt:receipt!};return h;
    });},
    consumeAnalyze(value:object,job:object,context:Reply,outcome:unknown){let p:typeof pending,record:Completed|undefined;return act('consume',value,()=>{
      jobs.consume(value,job,context);guard();
      // Comparison errors do not hide a subsequent cancellation/deadline.
      let state:'reviewed'|'rejected'|'result_omitted'|undefined;
      try{state=compare(p!.receipt,updateSet,outcome);record={receipt:p!.receipt,state,...(state==='reviewed'?{}:{reason:field(outcome,'reason') as string})};}catch{state=undefined;/* fixed error after post-guard */}
      guard();if(!state)stop('compare');
      return Object.freeze({scope:'synthetic_analyze_candidate' as const,state,authority:'none' as const});
    },()=>{accepted++;completed.set(p!.receipt.target,record!);},()=>{p=pending;pending=undefined;if(!p||p.handle!==job)stop('consume');});},
    startupFailure(value:object,g:object,reason:unknown){return act('startup_failure',value,()=>{if(g!==generation||!starting)stop('startup_failure');return stop('startup_failure',reason);});},
    finish(value:object,g:object,id:number,expected:unknown):object{return act('finish',value,()=>{
      if(receipts.size)stop('finish');const h=header(expected,updateSet,held!.started_at),assets=manifest(expected,h,updateSet,completed),job=jobs.finish(value,g,id);finishPending={handle:job,header:h,assets};return job;
    });},
    consumeFinish(value:object,job:object,context:Reply,outcome:unknown):object{let p:typeof finishPending,end:string|undefined;return act('finish_consume',value,()=>{
      jobs.consume(value,job,context);guard();
      try{end=finishTime(outcome,p!.header,updateSet,held!,upper!);compareAssets(outcome,p!.assets,updateSet,end);}catch{end=undefined;/* post-guard has priority */}
      guard();if(!end)stop('finish_compare');return Object.freeze(Object.create(null)) as object;
    },handle=>{candidate=Object.freeze({handle,end:end!,assets:p!.assets.size});},()=>{p=finishPending;finishPending=undefined;if(!p||p.handle!==job)stop('finish_consume');});},
    consumeTerminal(value:object,handle:object){let c:typeof candidate;return act('terminal_consume',value,()=>{
      const state=jobs.inspect();if(!state.source_closed||generation||state.generation_status!=='closed')stop('terminal_consume');
      return Object.freeze({scope:'synthetic_finish_terminal' as const,ended_at:c!.end,assets:c!.assets,authority:'none' as const});
    },()=>{jobs.close(value);upper=held=null;binding=generation=seedRef=undefined;pinnedSeed=undefined;pending=finishPending=undefined;receipts.clear();completed.clear();updateSet='';terminalConsumed=true;},
    ()=>{c=candidate;candidate=undefined;if(!c||c.handle!==handle)stop('terminal_consume');});},
    sendFailure(value:object,job:object,reason:unknown){return act('send_failure',value,()=>{const p=pending??finishPending;pending=finishPending=undefined;if(!p||p.handle!==job)stop('send_failure');return stop('send_failure',reason);});},
    closeSource(value:object){return act('source_close',value,()=>jobs.closeSource(value));},
    closeGeneration(value:object,g:object){return act('generation_close',value,()=>jobs.closeGeneration(value,g));},
    confirmClosed(value:object,g:object){return act('generation_closed',value,()=>{jobs.confirmClosed(value,g);generation=undefined;starting=false;});},
    close(value:object){return act('close',value,()=>{},()=>{jobs.close(value);upper=held=null;binding=generation=seedRef=undefined;pinnedSeed=undefined;pending=finishPending=candidate=undefined;receipts.clear();completed.clear();updateSet='';});},
    revoke(reason:unknown){if(jobs.inspect().state==='closed')return;try{stop('revoke',reason);}catch{/* synchronous invalidation; no raw exception */}},
    discardTerminalTime(){if(busy||!diagnostic||held===null)return stop('discard');upper=held=null;},
    inspect(){return Object.freeze({scope:'synthetic_worker_time_only' as const,state:jobs.inspect().state,upper_utc:upper,held_time:held,diagnostic,pending:!!pending||!!finishPending,
      inputs_retained:receipts.size,analyze_accepted:accepted,candidate_retained:!!candidate,terminal_consumed:terminalConsumed,permissions:Object.freeze({formal_issuance:false,dispatch:false,source_acceptance:false})});},
  });
}
