/** Synthetic issuer only. No actual session, ReleasePermit, transport, worker, clock or final seal. */
import { z } from 'zod';
declare const brand: unique symbol;
type Handle<K extends string> = { readonly [brand]: K };
export type FixedSourceSession = Handle<'session'>;
export type FixedSource = Handle<'source'>;
export type FixedSourceReleasePermit = Handle<'release'>;
export type FixedSourceIssuer = Handle<'issuer'>;
export type FixedSourceRead = Handle<'read'>;
export type FixedSourceObservation = Handle<'observation'>;
type Code = 'invalid_input' | 'issuer_claimed' | 'release_not_admitted' | 'evidence_binding_mismatch'
  | 'invalid_state' | 'evidence_invalid' | 'table_binding_mismatch' | 'invalid_observation_time'
  | 'internal_review_error' | 'authentication_failed' | 'access_denied' | 'closed' | 'scope_evidence_limit';
type Result<T> = Readonly<{ok:true;value:T}|{ok:false;code:Code}>;
const id=z.string().regex(/^[a-f0-9]{32}$/), hash=z.string().regex(/^[a-f0-9]{64}$/), date=z.iso.datetime();
const sessionSchema=z.strictObject({instance_binding:hash,started_at:date,deadline_ms:z.number().int().min(1).max(60000)});
const sourceSchema=z.strictObject({update_set_sys_id:id,parent_ready:z.boolean(),metadata_ready:z.boolean(),
  final_started:z.boolean(),release_match:z.enum(['matched','mismatched','unknown']),release_origin:z.enum(['observed','operator_config'])});
const frameSchema=z.strictObject({status:z.number().int().min(100).max(599),body_json:z.string().max(16384).nullable(),
  observed_at:date,cleanup:z.enum(['confirmed','unconfirmed','not_started'])});
const rowSchema=z.strictObject({sys_id:id,name:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  sys_scope:z.union([z.literal('global'),id]).nullable(),sys_updated_on:z.string().min(1).max(40),sys_mod_count:z.string().regex(/^\d{1,20}$/)});
type Row=Readonly<z.infer<typeof rowSchema>>;
type Unavailable='not_found_or_not_visible'|'invalid_observation'|'field_unavailable'|'ambiguous_table'|'upstream_unavailable'|'not_collected'
  |'evidence_limit';
export type FixedSourceNormalized = Readonly<{source:'sys_db_object.current';visibility_scope:'caller_acl';phase:'initial'|'final';observed_at:string} &
  ({state:'rows';rows:readonly Row[]}|{state:'unavailable';reason:Unavailable})>;
const handle=<T>()=>Object.freeze(Object.create(null)) as T;
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const no=(code:Code):Result<never>=>Object.freeze({ok:false,code});

export function createSyntheticFixedSourceIssuer() {
  type Session={data:z.infer<typeof sessionSchema>;active:boolean;claimed:boolean;failure?:Code};
  type Source={session:FixedSourceSession;data:z.infer<typeof sourceSchema>;permit:FixedSourceReleasePermit|null;active:boolean;claimed:boolean};
  type Table={initial?:FixedSourceNormalized;initialStarted:boolean;finalStarted:boolean;finalDone:boolean};
  type Issuer={session:FixedSourceSession;source:FixedSource;permit:FixedSourceReleasePermit;state:'active'|'finalizing'|'sealed'|'failed'|'closed';
    reason?:Code;tables:Map<string,Table>;pending?:FixedSourceRead;cursor:number};
  const sessions=new WeakMap<FixedSourceSession,Session>(),sources=new WeakMap<FixedSource,Source>(),issuers=new WeakMap<FixedSourceIssuer,Issuer>();
  const reads=new WeakMap<FixedSourceRead,{issuer:FixedSourceIssuer;name:string;phase:'initial'|'final';used:boolean}>();
  const observations=new WeakMap<FixedSourceObservation,{issuer:FixedSourceIssuer;value:FixedSourceNormalized}>();
  function fail(i:Issuer,code:Code):Result<never>{i.reason??=code;if(i.state!=='closed')i.state='failed';i.pending=undefined;return no(i.reason);}
  function check(i:Issuer):Result<true>{
    if(i.reason)return no(i.reason);
    const s=sources.get(i.source),session=sessions.get(i.session);
    if(!s?.active||!session?.active)return fail(i,'closed');
    if(s.session!==i.session||s.permit!==i.permit)return fail(i,'evidence_binding_mismatch');
    return ok(true);
  }
  // A fixture time inside the run interval and not before `notBefore`; no clock is read here.
  function runTime(i:Issuer,raw:unknown,notBefore?:string):string|null{
    const p=date.safeParse(raw);if(!p.success)return null;
    const s=sessions.get(i.session)!,at=Date.parse(p.data),start=Date.parse(s.data.started_at);
    return at<start||at>=start+s.data.deadline_ms||notBefore!==undefined&&at<Date.parse(notBefore)?null:p.data;
  }
  const notCollected=(phase:'initial'|'final',at:string):FixedSourceNormalized=>Object.freeze({source:'sys_db_object.current',
    visibility_scope:'caller_acl',phase,observed_at:at,state:'unavailable',reason:'not_collected'});
  function normalize(name:string,phase:'initial'|'final',at:string,body:string|null,status:number):FixedSourceNormalized|'binding_error'{
    const header={source:'sys_db_object.current' as const,visibility_scope:'caller_acl' as const,phase,observed_at:at};
    const unavailable=(reason:Unavailable):FixedSourceNormalized=>Object.freeze({...header,state:'unavailable',reason});
    if(status===404)return unavailable('not_found_or_not_visible');
    if(status===429||status>=500)return unavailable('upstream_unavailable');
    if(status<200||status>=300||body===null)return unavailable('invalid_observation');
    let raw:unknown;try{raw=JSON.parse(body);}catch{return unavailable('invalid_observation');}
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!('result'in raw)||!Array.isArray(raw.result)||raw.result.length>2)return unavailable('invalid_observation');
    if(!raw.result.length)return unavailable('not_found_or_not_visible');
    const rows:Row[]=[];
    for(const value of raw.result){
      if(!value||typeof value!=='object'||Array.isArray(value))return unavailable('invalid_observation');
      if(typeof value.name==='string'&&value.name!==name)return 'binding_error';
      if(['sys_id','name','sys_updated_on','sys_mod_count'].some(key=>!Object.hasOwn(value,key)))return unavailable('field_unavailable');
      const row=rowSchema.safeParse({sys_id:value.sys_id,name:value.name,sys_scope:Object.hasOwn(value,'sys_scope')?value.sys_scope:null,
        sys_updated_on:value.sys_updated_on,sys_mod_count:value.sys_mod_count});
      if(!row.success)return unavailable('invalid_observation');rows.push(Object.freeze(row.data));
    }
    return rows.length===2?unavailable('ambiguous_table'):Object.freeze({...header,state:'rows',rows:Object.freeze(rows)});
  }
  return Object.freeze({
    issueSession(raw:unknown):Result<FixedSourceSession>{
      try{const p=sessionSchema.safeParse(structuredClone(raw));if(!p.success)return no('invalid_input');
        const value=handle<FixedSourceSession>();sessions.set(value,{data:p.data,active:true,claimed:false});return ok(value);
      }catch{return no('invalid_input');}
    },
    issueSource(session:FixedSourceSession,raw:unknown){
      if(!sessions.get(session)?.active)return no('evidence_binding_mismatch');
      try{const p=sourceSchema.safeParse(structuredClone(raw));if(!p.success)return no('invalid_input');
        if(!sessions.get(session)?.active)return no('closed');
        const source=handle<FixedSource>(),permit=p.data.release_match==='matched'?handle<FixedSourceReleasePermit>():null;
        sources.set(source,{session,data:p.data,permit,active:true,claimed:false});
        return ok(Object.freeze({source,permit,decision:Object.freeze({release_match:p.data.release_match,release_origin:p.data.release_origin})}));
      }catch{return no('invalid_input');}
    },
    createIssuer(session:FixedSourceSession,source:FixedSource,permit:FixedSourceReleasePermit|null):Result<FixedSourceIssuer>{
      const s=sessions.get(session);if(!s?.active)return no('closed');
      if(s.claimed)return no(s.failure??'issuer_claimed');s.claimed=true;
      const rejected=(code:Code):Result<never>=>{s.failure??=code;return no(s.failure);};
      const x=sources.get(source);
      if(!x||x.session!==session)return rejected('evidence_binding_mismatch');
      if(x.claimed)return rejected('issuer_claimed');x.claimed=true;
      if(!x.active||x.data.final_started||!x.data.parent_ready||!x.data.metadata_ready)return rejected('invalid_state');
      if(x.data.release_match!=='matched'||!permit||permit!==x.permit)return rejected('release_not_admitted');
      const value=handle<FixedSourceIssuer>();issuers.set(value,{session,source,permit,state:'active',tables:new Map(),cursor:0});return ok(value);
    },
    begin(issuer:FixedSourceIssuer,name:unknown,phase:'initial'|'final'){
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      if(typeof name!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(name)||name==='global')return fail(i,'invalid_input');
      if(i.pending||!['initial','final'].includes(phase))return fail(i,'invalid_state');
      let t=i.tables.get(name);
      if(phase==='initial'){
        if(i.state!=='active'||t?.initialStarted)return fail(i,'invalid_state');
        if(i.tables.size>=8)return no('scope_evidence_limit');
        t={initialStarted:true,finalStarted:false,finalDone:false};i.tables.set(name,t);
      }else{
        // Only an available initial is re-read; an unavailable one ends through skipFinal without a GET.
        if(i.state!=='finalizing'||t?.initial?.state!=='rows'||t.finalStarted||Array.from(i.tables.keys())[i.cursor]!==name)return fail(i,'invalid_state');
        t.finalStarted=true;
      }
      const ticket=handle<FixedSourceRead>();reads.set(ticket,{issuer,name,phase,used:false});i.pending=ticket;
      const params=new URLSearchParams({sysparm_query:`name=${name}^ORDERBYsys_id`,sysparm_fields:'sys_id,name,sys_scope,sys_updated_on,sys_mod_count',
        sysparm_limit:'2',sysparm_offset:'0',sysparm_no_count:'true',sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});
      return ok(Object.freeze({ticket,request:Object.freeze({method:'GET' as const,path:`/api/now/table/sys_db_object?${params}`})}));
    },
    complete(issuer:FixedSourceIssuer,ticket:FixedSourceRead,raw:unknown):Result<FixedSourceObservation>{
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      const read=reads.get(ticket);if(!read||read.issuer!==issuer)return fail(i,'evidence_binding_mismatch');
      if(read.used||i.pending!==ticket)return fail(i,'invalid_state');read.used=true;i.pending=undefined;
      try{
        const f=frameSchema.safeParse(structuredClone(raw));if(!f.success)return fail(i,'evidence_invalid');
        const still=check(i);if(!still.ok)return still;
        if(f.data.status===401||f.data.status===403)return fail(i,f.data.status===401?'authentication_failed':'access_denied');
        if(f.data.cleanup==='unconfirmed')return fail(i,'internal_review_error');
        if(f.data.status>=200&&f.data.status<300&&f.data.cleanup!=='confirmed')return fail(i,'internal_review_error');
        if(f.data.body_json!==null&&Buffer.byteLength(f.data.body_json)>16384)return fail(i,'evidence_invalid');
        const s=sessions.get(i.session)!,t=i.tables.get(read.name)!,at=Date.parse(f.data.observed_at),start=Date.parse(s.data.started_at);
        if(at<start||at>=start+s.data.deadline_ms||read.phase==='final'&&at<Date.parse(t.initial!.observed_at))return fail(i,'invalid_observation_time');
        const value=normalize(read.name,read.phase,f.data.observed_at,f.data.body_json,f.data.status);
        if(value==='binding_error')return fail(i,'table_binding_mismatch');
        if(read.phase==='initial')t.initial=value;else{t.finalDone=true;i.cursor++;}
        const receipt=handle<FixedSourceObservation>();observations.set(receipt,{issuer,value});return ok(receipt);
      }catch{return fail(i,'evidence_invalid');}
    },
    /** Local stream failure without a fabricated HTTP success/status. Synthetic issuer only. */
    completeUnavailable(issuer:FixedSourceIssuer,ticket:FixedSourceRead,reason:Unavailable,at:unknown):Result<FixedSourceObservation>{
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      const read=reads.get(ticket);if(!read||read.issuer!==issuer)return fail(i,'evidence_binding_mismatch');
      if(read.used||i.pending!==ticket)return fail(i,'invalid_state');read.used=true;i.pending=undefined;
      if(!['not_found_or_not_visible','invalid_observation','field_unavailable','ambiguous_table','upstream_unavailable','not_collected','evidence_limit'].includes(reason))return fail(i,'evidence_invalid');
      const t=i.tables.get(read.name)!,time=runTime(i,at,read.phase==='final'?t.initial?.observed_at:undefined);
      if(!time)return fail(i,'invalid_observation_time');
      const value:FixedSourceNormalized=Object.freeze({...notCollected(read.phase,time),reason});
      if(read.phase==='initial')t.initial=value;else{t.finalDone=true;i.cursor++;}
      const receipt=handle<FixedSourceObservation>();observations.set(receipt,{issuer,value});return ok(receipt);
    },
    /** An initial GET still pending when the normal phase closes (e.g. aborted, so without an HTTP status) ends
     * as not_collected at the explicit phase-close time; omitting that time keeps the pending read an error. */
    enterFinal(issuer:FixedSourceIssuer,closedAt?:unknown):Result<true>{
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      if(i.state!=='active')return fail(i,'invalid_state');
      if(i.pending){
        if(closedAt===undefined)return fail(i,'invalid_state');
        const at=runTime(i,closedAt);if(!at)return fail(i,'invalid_observation_time');
        const read=reads.get(i.pending)!;read.used=true;i.pending=undefined;i.tables.get(read.name)!.initial=notCollected('initial',at);
      }
      i.state='finalizing';return ok(true);
    },
    /** Ends the next final in order without a GET when its initial is unavailable; never a stable observation. */
    skipFinal(issuer:FixedSourceIssuer,name:unknown,at:unknown):Result<FixedSourceObservation>{
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      const t=typeof name==='string'?i.tables.get(name):undefined;
      if(i.state!=='finalizing'||i.pending||!t||t.initial?.state!=='unavailable'||t.finalStarted
        ||Array.from(i.tables.keys())[i.cursor]!==name)return fail(i,'invalid_state');
      const time=runTime(i,at,t.initial.observed_at);if(!time)return fail(i,'invalid_observation_time');
      t.finalStarted=true;t.finalDone=true;i.cursor++;
      const receipt=handle<FixedSourceObservation>();observations.set(receipt,{issuer,value:notCollected('final',time)});return ok(receipt);
    },
    finish(issuer:FixedSourceIssuer):Result<true>{
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      if(i.state!=='finalizing'||i.pending||i.cursor!==i.tables.size||[...i.tables.values()].some(t=>!t.finalDone))return fail(i,'invalid_state');
      i.state='sealed';return ok(true);
    },
    view(issuer:FixedSourceIssuer,receipt:FixedSourceObservation):Result<FixedSourceNormalized>{
      const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');const live=check(i);if(!live.ok)return live;
      const value=observations.get(receipt);return value?.issuer===issuer?ok(value.value):fail(i,'evidence_binding_mismatch');
    },
    closeIssuer(issuer:FixedSourceIssuer){const i=issuers.get(issuer);if(i){check(i);i.reason??='closed';i.state='closed';i.pending=undefined;i.tables.clear();}},
    closeSession(session:FixedSourceSession){const s=sessions.get(session);if(s)s.active=false;},
    closeSource(source:FixedSource){const s=sources.get(source);if(s)s.active=false;},
    diagnostic(issuer:FixedSourceIssuer){const i=issuers.get(issuer);if(!i)return no('evidence_binding_mismatch');check(i);return Object.freeze({state:i.state,code:i.reason??null});},
  });
}
