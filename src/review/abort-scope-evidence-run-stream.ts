/** TC-03 development-only Web Streams connection. No global fetch or evidence issuance. */
import {z} from 'zod';
import {createFakeRunTransportSession} from './abort-scope-evidence-run-transport.js';
import type {FakeCleanupAttempt} from './abort-scope-evidence-cleanup-contract.js';
import {pinReviewReleaseConfig} from '../servicenow/review-release-config.js';
import {releaseEvidenceStructure} from './result-schema-v2.js';
import {matchCatalogRelease} from './catalog.js';
export interface FakeStreamClock {now():number;schedule(deadline:number,wake:()=>void):()=>void;}
export type FakeStreamSource=(signal:AbortSignal)=>Response|Promise<Response>;
const optionsSchema=z.strictObject({session:z.unknown().default({}),request_timeout_ms:z.number().int().min(1).max(10000).default(10000),
  cleanup_reserve_ms:z.number().int().min(1).max(250).default(250),max_empty_reads:z.number().int().min(1).max(16).default(16)});
const typedLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength')!.get!;
type Observation={fetch:'not_started'|'pending'|'fulfilled'|'rejected';body:'none'|'unlocked'|'reader'|'unknown_lock';pending_read:boolean;eof:boolean;
  closed:'pending'|'fulfilled'|'rejected'|null;cancel:'not_requested'|'pending'|'fulfilled'|'rejected';lock:'not_owned'|'held'|'released'|'failed'|'unknown';abort_failed:boolean};
type CapturePolicy={cap:number;allowUnavailable?:boolean;accept(value:unknown,status:number):void};
type Resource={state:Observation;controller:AbortController;reader?:ReadableStreamDefaultReader<Uint8Array>;body?:ReadableStream<Uint8Array>|null;
  attempt?:FakeCleanupAttempt;deadline:number;ioDeadline:number;dispatched:boolean;ended:boolean;cancelled:boolean;released:boolean;
  aborted:boolean;local:boolean;finalized:boolean;sequence:number;empty:number;version:number;wake?:()=>void;policy?:CapturePolicy;status:number;scratch?:Uint8Array;size:number};
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
// Same status codes as bounded-read request(); redirect:'error' turns 3xx into a transport failure there.
const statusCode=(s:number)=>s===401?'authentication_failed':s===403?'access_denied':s===404?'not_found_or_not_visible':s===429||s>=500||s>=300&&s<400?'upstream_unavailable':'invalid_response';
export function createFakeRunStreamSession(clock:FakeStreamClock,source:FakeStreamSource,rawOptions:unknown={}){
  return createRunStreamCore(clock,source,rawOptions).api;
}
function createRunStreamCore(clock:FakeStreamClock,source:FakeStreamSource,rawOptions:unknown={}){
  let options:z.infer<typeof optionsSchema>;
  try{options=optionsSchema.parse(structuredClone(rawOptions));if(typeof source!=='function'||typeof clock.schedule!=='function')throw Error();}catch{throw Error('invalid_input');}
  let current:Resource|undefined,busy=false;
  const counts={reads:0,cancels:0,releases:0,timers:0,aborts:0,peak_retained_bytes:0};
  const responses=new WeakSet<Response>(),streams=new WeakSet<ReadableStream<Uint8Array>>();
  const root=createFakeRunTransportSession(clock,{dispatch(){
    const r=current!;r.dispatched=true;r.state.fetch='pending';
    try{void Promise.resolve(source(r.controller.signal)).then(response=>received(r,response),()=>{r.state.fetch='rejected';changed(r);});}
    catch{r.state.fetch='rejected';changed(r);}
  },abort(){const r=current;if(!r||r.aborted)return;r.aborted=true;counts.aborts++;
    try{r.controller.abort();}catch{r.state.abort_failed=true;}cancel(r);changed(r);
  },stopWorker(){}},options.session);
  const transport=get(root.claimTransport());
  function changed(r:Resource){r.version++;r.wake?.();if(r.ended)lateCleanup(r);}
  function cancel(r:Resource){
    if(r.cancelled||r.state.eof||!r.body||r.state.body==='unknown_lock')return;
    r.cancelled=true;r.state.cancel='pending';counts.cancels++;
    try{const work=r.reader?r.reader.cancel():r.body.cancel();
      void Promise.resolve(work).then(()=>{r.state.cancel='fulfilled';changed(r);},()=>{r.state.cancel='rejected';changed(r);});
    }catch{r.state.cancel='rejected';}changed(r);
  }
  function release(r:Resource){
    if(r.released||!r.reader||r.state.pending_read||r.state.closed==='pending')return;
    r.released=true;counts.releases++;
    try{r.reader.releaseLock();r.state.lock='released';}catch{r.state.lock='failed';}changed(r);
  }
  function lateCleanup(r:Resource){cancel(r);release(r);}
  // Release-only, like bounded-source: a request timeout ends only this observation; the fallback still needs confirmed cleanup.
  function localAbort(r:Resource){if(r.aborted)return;r.aborted=true;r.local=true;counts.aborts++;
    try{r.controller.abort();}catch{r.state.abort_failed=true;}cancel(r);changed(r);}
  function checkpoint(r:Resource){
    const v=root.observeTransportClock();if(v.now===null){r.state.abort_failed=true;return v;}
    if(!v.stopped&&v.now>=r.ioDeadline){if(r.policy?.allowUnavailable)localAbort(r);else root.stop('upstream_unavailable');}return v;
  }
  async function pump(r:Resource){
    while(!r.ended&&!r.aborted&&!r.cancelled){
      const before=checkpoint(r);if(before.now===null||root.status().primary)return;
      let item:ReadableStreamReadResult<Uint8Array>;
      try{r.state.pending_read=true;counts.reads++;changed(r);item=await r.reader!.read();}
      catch{r.state.pending_read=false;if(!r.ended&&!r.local)root.stop('invalid_response');changed(r);return;}
      r.state.pending_read=false;if(r.ended){changed(r);return;}
      const after=checkpoint(r);if(after.now===null||root.status().primary){changed(r);return;}
      if(r.local){if(item.done)r.state.eof=true;else if(item.value instanceof Uint8Array)transport.chunk(r.attempt!,r.sequence++,item.value);changed(r);return;}
      if(item.done){r.state.eof=true;changed(r);return;}
      if(!(item.value instanceof Uint8Array)){root.stop('invalid_response');changed(r);return;}
      if(Reflect.apply(typedLength,item.value,[])===0&&++r.empty>options.max_empty_reads){root.stop('invalid_response');changed(r);return;}
      let adopted=item.value,size=0;
      if(r.policy){size=Reflect.apply(typedLength,item.value,[]) as number;
        if(r.size+size>r.policy.cap){transport.chunk(r.attempt!,r.sequence++,item.value);root.stop('receive_budget_exceeded');changed(r);return;}
        if(size){r.scratch??=new Uint8Array(r.policy.cap);counts.peak_retained_bytes=Math.max(counts.peak_retained_bytes,r.scratch.byteLength);
          r.scratch.set(item.value,r.size);adopted=r.scratch.subarray(r.size,r.size+size);}}
      // Charge the SAME private bytes later decoded; an injected clock cannot rewrite the source chunk between the two.
      const charged=transport.chunk(r.attempt!,r.sequence++,adopted);changed(r);if(!charged.ok)return;if(r.policy)r.size+=size;
    }
  }
  function received(r:Resource,response:Response){
    try{
      r.state.fetch='fulfilled';if(!(response instanceof Response))throw Error();
      const body=response.body;r.body=body;r.status=response.status;
      // Release rows: every status except 401 is classified by releaseValue (fallback or observation_incomplete), as in bounded-source.
      const releaseLocal=r.policy?.allowUnavailable&&r.status!==401;
      if(responses.has(response)||body&&streams.has(body)){r.state.body='unknown_lock';r.state.lock='unknown';changed(r);return;}
      responses.add(response);if(body)streams.add(body);
      if(!body){r.state.body='none';
        if(!r.ended&&!releaseLocal)root.stop(r.status>=200&&r.status<300?'invalid_response':statusCode(r.status));changed(r);return;}
      if(body.locked){r.state.body='unknown_lock';r.state.lock='unknown';changed(r);return;}
      r.state.body='unlocked';if(r.ended||r.aborted){cancel(r);changed(r);return;}
      if(r.status<200||r.status>=300){
        if(!releaseLocal)root.stop(statusCode(r.status));cancel(r);changed(r);return;}
      r.reader=body.getReader();r.state.body='reader';r.state.lock='held';r.state.closed='pending';
      // Capture before read/cancel/release and immediately observe both settlement paths.
      void r.reader.closed.then(()=>{r.state.closed='fulfilled';changed(r);},()=>{r.state.closed='rejected';if(!r.ended&&!r.local)root.stop('invalid_response');changed(r);});
      changed(r);void pump(r).catch(()=>{if(!r.ended)root.stop('internal_review_error');r.state.pending_read=false;changed(r);});
    }catch{r.state.fetch='fulfilled';r.state.body='unknown_lock';r.state.lock='unknown';if(!r.ended)root.stop('invalid_response');changed(r);}
  }
  function wait(r:Resource,version:number,deadline:number){
    if(version!==r.version)return Promise.resolve();
    return new Promise<void>(resolve=>{
      let done=false,dispose:(()=>void)|undefined;counts.timers++;
      const wake=()=>{if(done)return;done=true;counts.timers--;if(r.wake===wake)r.wake=undefined;
        try{dispose?.();}catch{r.state.abort_failed=true;root.stop('internal_review_error');}resolve();};r.wake=wake;
      try{dispose=clock.schedule(deadline,wake);if(typeof dispose!=='function')throw Error();if(done)dispose();}
      catch{r.state.abort_failed=true;root.stop('internal_review_error');wake();}
    });
  }
  function settled(r:Resource){
    const s=r.state;if(s.fetch==='rejected'){if(!r.policy?.allowUnavailable)root.stop('upstream_unavailable');return true;}if(s.fetch!=='fulfilled')return false;
    if(s.body==='unknown_lock'){root.stop('invalid_response');return true;}if(s.body==='none')return true;
    if(r.aborted)cancel(r);if(s.body==='reader')release(r);
    if(s.cancel==='rejected'||s.lock==='failed'||s.closed==='rejected'||s.abort_failed)return true;
    if(s.pending_read||s.cancel==='pending')return false;
    if(s.body==='reader')return s.closed==='fulfilled'&&s.lock==='released'&&(s.eof||s.cancel==='fulfilled');return s.cancel==='fulfilled';
  }
    async function run(descriptor:unknown,policy?:CapturePolicy){
      if(busy){root.stop('internal_review_error');return {ok:false as const,code:'internal_review_error'};}busy=true;
      const r:Resource={state:{fetch:'not_started',body:'none',pending_read:false,eof:false,closed:null,cancel:'not_requested',lock:'not_owned',abort_failed:false},
        controller:new AbortController(),deadline:0,ioDeadline:Infinity,dispatched:false,ended:false,cancelled:false,released:false,aborted:false,local:false,finalized:false,sequence:0,empty:0,version:0,policy,status:0,size:0};current=r;
      try{
        const initial=root.observeTransportClock();if(initial.now===null||initial.stopped)return {ok:false as const,code:root.status().primary?.code??'closed'};
        const remaining=Math.min(options.request_timeout_ms,initial.hard_deadline-initial.now),reserve=Math.min(options.cleanup_reserve_ms,Math.floor(remaining/4));
        if(reserve<=0){root.stop('deadline_exceeded');return {ok:false as const,code:root.status().primary!.code};}
        const prepared=structuredClone(descriptor),begun=transport.begin(prepared,options.request_timeout_ms);if(!begun.ok)return begun;
        r.attempt=begun.value;r.deadline=get(transport.attemptDeadline(r.attempt));r.ioDeadline=r.deadline-reserve;
        for(;;){const v=checkpoint(r),version=r.version;if(settled(r)||r.state.abort_failed||v.now===null||v.now>=r.deadline)break;
          await wait(r,version,r.aborted?r.deadline:r.ioDeadline);}
        r.finalized=true;transport.finishHttp(r.attempt,{...r.state});
        if(policy&&!root.status().primary){
          const before=root.observeTransportClock();if(before.now===null||before.stopped||before.now>=r.deadline)root.stop('deadline_exceeded');
          else{try{let raw:unknown=null;const status=r.local?0:r.status;if(status>=200&&status<300){
                try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.scratch?.subarray(0,r.size)??new Uint8Array()));}
                catch{if(!policy.allowUnavailable)throw Error();}}
              policy.accept(raw,status);}catch{root.stop('invalid_response');}
            const after=root.observeTransportClock();if(after.now===null||after.stopped||after.now>=r.deadline)root.stop('deadline_exceeded');}
        }
        // No body capture/provenance is claimed; successful modeled payloads are discarded.
        if(!root.status().primary&&r.state.eof&&(prepared as {kind:string}).kind==='payload')transport.discardPayload(r.attempt);
        const failure=root.status().primary;return failure?{ok:false as const,code:failure.code}:{ok:true as const,value:Object.freeze({synthetic:true,evidence_issuance:'disabled' as const})};
      }catch{root.stop('internal_review_error');return {ok:false as const,code:root.status().primary?.code??'internal_review_error'};}
      finally{if(r.dispatched&&!r.finalized){r.finalized=true;if(r.attempt)transport.finishHttp(r.attempt,{...r.state});else transport.finishActiveHttp({...r.state});}
        r.ended=true;r.scratch=undefined;r.policy=undefined;lateCleanup(r);r.wake?.();if(current===r)current=undefined;busy=false;}
    }
  const api=Object.freeze({
    run:(descriptor:unknown)=>run(descriptor),
    cancel:root.cancel,finish(){return busy?root.stop('closed'):root.finish();},status:root.status,
    operations:()=>Object.freeze({...counts,active:busy,retained_bytes:current?.scratch?.byteLength??0}),
  });
  return Object.freeze({api,runProjected:run,markAuthenticated:root.markFakeAuthenticationReady,checkpoint:root.observeTransportClock,stop:root.stop,enterFinal:transport.enterFinal});
}

declare const sourcePermit:unique symbol;
export type FakeFixedReleasePermit={readonly [sourcePermit]:'TC04'};
type FixedPurpose='oauth'|'parent_initial'|'release_rows'|'metadata_initial'|'parent_final'|'metadata_final';
export type FakeFixedRequest=Readonly<{method:'GET'|'POST';path:string;purpose:FixedPurpose;ordinal:1;synthetic:true;grant_type?:'client_credentials'}>;
const sourceConfig=z.strictObject({update_set_sys_id:z.string().regex(/^[a-f0-9]{32}$/),max_records:z.number().int().min(1).max(100).default(20),
  instance_url:z.string().default('https://fake.invalid'),auth:z.enum(['per-user','service-account-cached','service-account-exchange']).default('per-user'),
  operator_config:z.unknown().optional(),stream:z.unknown().default({})});
const sysId=z.string().regex(/^[a-f0-9]{32}$/),version={sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)};
const parentRecord=z.object({sys_id:sysId,state:z.string().max(100),application:z.string().max(32),...version});
const metadataRecord=z.object({sys_id:sysId,update_set:sysId,name:z.string().min(1).max(200),type:z.string().max(200),action:z.string().max(40),...version});
type ReleaseSummary=Readonly<{release_match:'matched'|'mismatched'|'unknown';source:'observed'|'operator_config'|'none'|'conflict';family:string|null;
  limitations:readonly string[];permit:FakeFixedReleasePermit|null;synthetic:true;evidence_issuance:'disabled'}>;

/** Same-module fixed source. No transport/observer adoption API, raw body or production capability. */
export function createFakeRunFixedSource(clock:FakeStreamClock,source:(request:FakeFixedRequest,signal:AbortSignal)=>Response|Promise<Response>,rawConfig:unknown){
  let config:z.infer<typeof sourceConfig>;try{config=sourceConfig.parse(structuredClone(rawConfig));if(typeof source!=='function')throw Error();}catch{throw Error('invalid_input');}
  let request:FakeFixedRequest|undefined,busy=false,state='created',primary:string|null=null;
  const core=createRunStreamCore(clock,signal=>{if(!request)throw Error('invalid_state');return source(request,signal);},config.stream);
  const initial=core.checkpoint();if(initial.now===null||initial.stopped)throw Error('invalid_input');
  let policy:ReturnType<typeof pinReviewReleaseConfig>;
  try{policy=pinReviewReleaseConfig(config.operator_config,config.instance_url,new Date(Math.floor(initial.now)).toISOString(),Math.ceil(initial.hard_deadline)-Math.floor(initial.now));}catch{throw Error('config_invalid');}
  let parent:z.infer<typeof parentRecord>|undefined,metadata:z.infer<typeof metadataRecord>[]|undefined;
  let permit:FakeFixedReleasePermit|null=null,release:ReleaseSummary|undefined;
  const no=(code:string)=>Object.freeze({ok:false as const,code:primary??core.api.status().primary?.code??code});
  const ok=<T>(value:T)=>Object.freeze({ok:true as const,value});
  function fail(code:string){if(state==='closed')return no('closed');const stopped=core.stop(code);primary??=stopped.ok?'internal_review_error':stopped.code;state='failed';permit=null;parent=undefined;metadata=undefined;return no(code);}
  function live(){const v=core.checkpoint();return !v.closed&&!v.stopped&&v.now!==null;}
  function commit(expected:string){if(!live())return fail(core.api.status().primary?.code??'closed');return state===expected&&busy?undefined:fail('internal_review_error');}
  function descriptor(purpose:FixedPurpose):FakeFixedRequest{
    if(purpose==='oauth')return Object.freeze({method:'POST',path:'/oauth_token.do',purpose,ordinal:1,grant_type:'client_credentials',synthetic:true});
    const isParent=purpose.startsWith('parent_'),isRelease=purpose==='release_rows';
    const params=new URLSearchParams({sysparm_fields:isParent?'sys_id,state,application,sys_updated_on,sys_mod_count':isRelease?'build_name':'sys_id,update_set,name,type,action,sys_updated_on,sys_mod_count',
      sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});
    if(!isParent){params.set('sysparm_limit',isRelease?'21':String(config.max_records+1));if(!isRelease)params.set('sysparm_query',`update_set=${config.update_set_sys_id}^ORDERBYsys_id`);}
    return Object.freeze({method:'GET',path:`/api/now/table/${isParent?'sys_update_set/'+config.update_set_sys_id:isRelease?'sys_cluster_state':'sys_update_xml'}?${params}`,purpose,ordinal:1,synthetic:true});
  }
  async function read<T>(purpose:FixedPurpose,parse:(raw:unknown,status:number)=>T){
    request=descriptor(purpose);let value:T|undefined;
    try{const r=await core.runProjected({kind:purpose,ordinal:1},{cap:purpose==='metadata_initial'||purpose==='metadata_final'?1024*1024:16384,
      allowUnavailable:purpose==='release_rows',accept(raw,status){value=parse(raw,status);}});
      if(!r.ok)return fail(r.code);if(!live())return fail(core.api.status().primary?.code??'closed');return ok(value!);
    }finally{request=undefined;}
  }
  function parseParent(raw:unknown){const p=z.object({result:parentRecord}).parse(raw).result;if(p.sys_id!==config.update_set_sys_id)throw Error();return p;}
  function parseMetadata(raw:unknown){const rows=z.object({result:z.array(metadataRecord).max(config.max_records+1)}).parse(raw).result;
    if(rows.some((r,i)=>r.update_set!==config.update_set_sys_id||i>0&&r.sys_id<=rows[i-1].sys_id))throw Error();return rows;}
  function decide(family:string|null,source:ReleaseSummary['source'],limitations:string[]):ReleaseSummary{
    const match=matchCatalogRelease(family);
    permit=match==='matched'?Object.freeze(Object.create(null)) as FakeFixedReleasePermit:null;
    return Object.freeze({release_match:match,source,family,limitations:Object.freeze([...limitations,...(match==='matched'?[]:[match==='unknown'?'release_unknown':'release_mismatch'])]),permit,synthetic:true,evidence_issuance:'disabled'});
  }
  function releaseValue(raw:unknown,status:number):Readonly<{family:string|null;source:ReleaseSummary['source'];limitations:string[]}>{
    const unavailable=(reason:string)=>({family:null,source:'none' as const,limitations:[reason]});
    const fallback=()=>policy.issue?unavailable(policy.issue):policy.assertion?{family:policy.assertion.family,source:'operator_config' as const,
      limitations:['release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable']}:unavailable('observation_unavailable');
    if(status===0||status>=300&&status<400||status===403||status===404||status===429||status>=500)return fallback();
    const parsed=z.object({result:z.array(z.object({build_name:z.string().max(40).nullable().optional()})).max(21)}).safeParse(raw);
    if(!parsed.success)return unavailable('observation_incomplete');const rows=parsed.data.result;
    if(rows.length>20)return unavailable('observation_limit');if(!rows.length||rows.every(r=>!r.build_name?.trim()))return fallback();
    if(rows.some(r=>!r.build_name?.trim()))return unavailable('observation_incomplete');
    const known=releaseEvidenceStructure.options[1].shape.family.options,values=rows.map(r=>known.find(f=>f.toLowerCase()===r.build_name!.trim().toLowerCase()));
    if(values.some(v=>!v))return unavailable('observation_inconsistent');
    const families=[...new Set(values)];if(families.length!==1||policy.assertion&&policy.assertion.family!==families[0])return {family:null,source:'conflict',limitations:['release_evidence_conflict']};
    return {family:families[0]!,source:'observed',limitations:['release_visible_nodes_only',...(policy.issue?[policy.issue]:[])]};
  }
  return Object.freeze({
    async bootstrap(){
      if(!live())return fail(core.api.status().primary?.code??'closed');if(busy||state!=='created')return fail('internal_review_error');busy=true;state='authenticating';
      try{if(config.auth==='service-account-exchange'){
          const r=await read('oauth',raw=>{const token=z.object({access_token:z.string().min(1).max(4096),token_type:z.string(),expires_in:z.number().finite().positive()}).parse(raw);
            const v=core.checkpoint();if(token.token_type.toLowerCase()!=='bearer'||v.now===null||token.expires_in*1000<=v.hard_deadline-v.now)throw Error();return true;});if(!r.ok)return r;
        }
        const rejected=commit('authenticating');if(rejected)return rejected;
        const ready=core.markAuthenticated();if(!ready.ok)return fail(ready.code);state='authenticated';return ok(Object.freeze({auth_ready:true,synthetic:true,evidence_issuance:'disabled' as const}));
      }finally{busy=false;}
    },
    async readParent(){
      if(!live())return fail(core.api.status().primary?.code??'closed');if(busy||state!=='authenticated')return fail('internal_review_error');busy=true;state='parent_reading';
      try{const r=await read('parent_initial',parseParent);if(!r.ok)return r;const rejected=commit('parent_reading');if(rejected)return rejected;
        parent=r.value;state='parent_ready';return ok(Object.freeze({parent_ready:true,synthetic:true,evidence_issuance:'disabled' as const}));}finally{busy=false;}
    },
    async resolveRelease(){
      if(!live())return fail(core.api.status().primary?.code??'closed');if(busy||state!=='parent_ready')return fail('internal_review_error');busy=true;state='release_reading';
      try{if(policy.issue==='config_binding_mismatch')release=decide(null,'none',[policy.issue]);
        else{const r=await read('release_rows',releaseValue);if(!r.ok)return r;const rejected=commit('release_reading');if(rejected)return rejected;
          release=decide(r.value.family,r.value.source,r.value.limitations);}
        state=release.release_match==='matched'?'matched':'unmatched';return ok(release);
      }finally{busy=false;}
    },
    async listMetadata(value:FakeFixedReleasePermit){
      if(!live())return fail(core.api.status().primary?.code??'closed');if(!permit||release?.release_match!=='matched')return fail('release_not_admitted');
      if(value!==permit)return fail('evidence_binding_mismatch');if(busy||state!=='matched')return fail('internal_review_error');busy=true;state='metadata_reading';
      try{const r=await read('metadata_initial',parseMetadata);if(!r.ok)return r;const rejected=commit('metadata_reading');if(rejected)return rejected;metadata=r.value;state='metadata_ready';
        return ok(Object.freeze({metadata_seen:metadata.length,selected:Math.min(config.max_records,metadata.length),truncated:metadata.length>config.max_records,synthetic:true,evidence_issuance:'disabled' as const}));}finally{busy=false;}
    },
    async recheck(value:FakeFixedReleasePermit){
      if(!live())return fail(core.api.status().primary?.code??'closed');if(!permit||value!==permit)return fail('evidence_binding_mismatch');
      if(busy||state!=='metadata_ready'||!parent||!metadata)return fail('internal_review_error');busy=true;state='final_reading';
      const originalParent=parent,originalMetadata=metadata;
      try{const final=core.enterFinal();if(!final.ok)return fail(final.code);
        const p=await read('parent_final',parseParent);if(!p.ok)return p;let rejected=commit('final_reading');if(rejected)return rejected;
        const m=await read('metadata_final',parseMetadata);if(!m.ok)return m;rejected=commit('final_reading');if(rejected)return rejected;
        const stable=JSON.stringify(originalParent)===JSON.stringify(p.value)&&JSON.stringify(originalMetadata)===JSON.stringify(m.value);
        state='done';return ok(Object.freeze({consistency:stable?'stable_observation' as const:'changed' as const,synthetic:true,evidence_issuance:'disabled' as const}));
      }finally{busy=false;}
    },
    cancel(){return fail('cancelled');},
    finish(){if(busy){core.api.finish();return fail(core.api.status().primary?.code??'closed');}const r=core.api.finish();state='closed';permit=null;parent=undefined;metadata=undefined;return r;},
    status:()=>Object.freeze({...core.api.status(),source_state:state,evidence_issuance:'disabled' as const}),operations:core.api.operations,
  });
}
