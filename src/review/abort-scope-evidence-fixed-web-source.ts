/** Package-excluded fixture composition. No real session/ReleasePermit/worker authority or global fetch. */
import { createFixtureWebStreamTransport } from './abort-scope-evidence-web-stream.js';
import type { PreparedEvidenceOwner } from './abort-scope-evidence-fixture-lifecycle.js';
import type { FakeDispatchRequest, FakePurposePermit, FakeTransportSlot } from './abort-scope-evidence-transport-state.js';
import type { FixedSourceNormalized } from './abort-scope-evidence-fixed-source.js';
type Request=Readonly<{method:'GET';path:string;purpose:FakeDispatchRequest['purpose'];ordinal:1|2;synthetic:true}>;
type Result<T>={ok:true;value:T}|{ok:false;code:string};
type Table={slot:FakeTransportSlot;initial:FixedSourceNormalized|null;reason:string|null};
const good=<T>(value:T):Result<T>=>({ok:true,value});
export function createFixtureFixedWebSource(session:object,owner:PreparedEvidenceOwner,updateSet:string,
  source:(request:Request,signal:AbortSignal)=>Response|Promise<Response>){
  if(typeof updateSet!=='string'||!/^[a-f0-9]{32}$/.test(updateSet)||typeof source!=='function')return {ok:false as const,code:'invalid_input'};
  function descriptor(r:FakeDispatchRequest):Request{
    const table=r.purpose.startsWith('table_'),parent=r.purpose.startsWith('parent_');
    if(!table&&!parent&&!r.purpose.startsWith('metadata_'))throw Error('invalid_state');
    const params=new URLSearchParams({sysparm_query:table?`name=${r.target}^ORDERBYsys_id`:parent?`sys_id=${updateSet}^ORDERBYsys_id`:`update_set=${updateSet}^ORDERBYsys_id`,
      sysparm_fields:table?'sys_id,name,sys_scope,sys_updated_on,sys_mod_count':parent?'sys_id,sys_updated_on,sys_mod_count':'sys_id,update_set,name,sys_updated_on,sys_mod_count',
      sysparm_limit:table||parent?'2':'101',sysparm_offset:'0',sysparm_no_count:'true',sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});
    return Object.freeze({method:'GET',path:`/api/now/table/${table?'sys_db_object':parent?'sys_update_set':'sys_update_xml'}?${params}`,
      purpose:r.purpose,ordinal:r.ordinal,synthetic:true});
  }
  const made=createFixtureWebStreamTransport(session,owner,(r,signal)=>source(descriptor(r),signal));
  if(!made.ok)return made;
  const api=made.value,m=api.machine,tables=new Map<string,Table>();
  const deliveries=new Map<string,Readonly<{initial:FixedSourceNormalized;final:FixedSourceNormalized;synthetic:true;evidence_issuance:'disabled'}>>();
  let deliverable=false;
  type Projection=Extract<ReturnType<typeof m.consumeSourceBody>,{ok:true}>['value'];
  let state:'new'|'normal'|'final'|'done'|'failed'='new',busy=false,primary:string|null=null;
  let parent:Projection|null=null,metadata:Projection|null=null;
  const diagnostics:Readonly<{stage:string;reason:string}>[]=[];
  const reject=(code:string)=>({ok:false as const,code:primary??code});
  function fail(code:string){primary??=code;state='failed';parent=null;metadata=null;tables.clear();deliveries.clear();deliverable=false;m.stop('closed');return reject(code);}
  function permit(kind:FakeDispatchRequest['purpose'],target?:string,slot?:FakeTransportSlot){
    return m.purpose(kind,{source:m.source,phase:m.phase(),...(target?{target}:{}),...(slot?{slot}:{})});
  }
  async function read(p:FakePurposePermit):Promise<Result<{projection:Projection|null;reason:string|null;retry_not_started?:true}>>{
    for(let attempt=0;attempt<2;attempt++){
      const run=await api.run(p);if(!run.ok){
        if(m.stats().primary)return fail(run.code);
        // A cleaned-up first attempt already admitted this slot. Preserve it for final skip if
        // the retry cannot start in the remaining normal-phase budget.
        return attempt>0?good({projection:null,reason:run.code,retry_not_started:true}):reject(run.code);
      }
      const r=run.value,c=m.cleanupInfo(r.cleanup),stopped=m.stats().primary;
      if(!c.ok||c.value.disposition!=='confirmed')return fail(stopped??'internal_review_error');
      if(stopped)return fail(stopped);
      if(r.body){const projected=m.consumeSourceBody(r.body,p,updateSet);return projected.ok?good({projection:projected.value,reason:null}):fail(projected.code);}
      if(r.outcome==='upstream_unavailable'&&attempt===0)continue;
      return good({projection:null,reason:r.outcome});
    }
    return fail('internal_review_error');
  }
  async function baseline(kind:'parent_initial'|'metadata_initial'|'parent_final'|'metadata_final'){
    const slot=kind.endsWith('_final')?m.slot(kind.startsWith('parent')?'parent':'metadata'):null;
    if(slot&&!slot.ok)return fail(slot.code);
    const p=permit(kind,undefined,slot?.ok?slot.value:undefined);if(!p.ok)return fail(p.code);
    const r=await read(p.value);
    if(r.ok){const projection=r.value.projection,reason=r.value.reason??(projection?.kind==='baseline'?projection.reason:null);
      if(reason)diagnostics.push(Object.freeze({stage:kind,reason}));}
    return r;
  }
  function stable(a:Projection|null,b:Projection|null){
    return a?.kind==='baseline'&&b?.kind==='baseline'&&a.state==='rows'&&b.state==='rows'
      ?JSON.stringify(a.rows)===JSON.stringify(b.rows)?'stable':'changed':'unverified';
  }
  return {ok:true as const,value:Object.freeze({
    async prepare(){
      if(m.stats().primary)return fail(m.stats().primary!);
      if(busy||state!=='new')return fail('invalid_state');busy=true;
      try{
        const p=await baseline('parent_initial');if(!p.ok)return p;parent=p.value.projection;
        const md=await baseline('metadata_initial');if(!md.ok)return md;metadata=md.value.projection;
        state='normal';return good(Object.freeze({state:parent?.kind==='baseline'&&parent.state==='rows'&&metadata?.kind==='baseline'&&metadata.state==='rows'?'prepared':'unverified',synthetic:true}));
      }finally{busy=false;}
    },
    async initial(name:string){
      if(m.stats().primary)return fail(m.stats().primary!);
      if(busy||state!=='normal')return fail('invalid_state');
      if(typeof name!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(name)||name==='global')return fail('invalid_input');
      const cached=tables.get(name);if(cached)return good(Object.freeze({observation:cached.initial,reason:cached.reason,cached:true,synthetic:true}));
      if(tables.size>=8)return reject('scope_evidence_limit');
      busy=true;
      try{
        const s=m.slot('table',name);if(!s.ok)return fail(s.code);const p=permit('table_initial',name);if(!p.ok)return fail(p.code);
        const r=await read(p.value);if(!r.ok)return r;
        const observation=r.value.projection?.kind==='table'?r.value.projection.observation:null;
        tables.set(name,{slot:s.value,initial:observation,reason:r.value.reason});
        return good(Object.freeze({observation,reason:r.value.reason,cached:false,synthetic:true}));
      }finally{busy=false;}
    },
    async finalize(){
      if(m.stats().primary)return fail(m.stats().primary!);
      if(busy||state!=='normal')return fail('invalid_state');busy=true;state='final';
      try{
        const entered=m.enterFinal();if(!entered.ok)return fail(entered.code);
        const p=await baseline('parent_final');if(!p.ok)return p;
        const md=await baseline('metadata_final');if(!md.ok)return md;
        const parentState=stable(parent,p.value.projection),metadataState=stable(metadata,md.value.projection);
        const summaries:Readonly<{name:string;state:'stable'|'changed'|'unverified';reason:string|null}>[]=[];
        for(const [name,t] of tables){
          if(!t.initial||t.initial.state==='unavailable'){
            const skipped=m.skipFinal(t.slot,{source:m.source,phase:m.phase(),target:name});if(!skipped.ok)return fail(skipped.code);
            summaries.push(Object.freeze({name,state:'unverified',reason:t.initial?.state==='unavailable'?t.initial.reason:t.reason??skipped.value.reason}));continue;
          }
          const q=permit('table_final',name,t.slot);if(!q.ok)return fail(q.code);
          const r=await read(q.value);if(!r.ok){
            if(r.code!=='scope_evidence_limit')return fail(r.code);
            const skipped=m.skipFinal(t.slot,{source:m.source,phase:m.phase(),target:name});if(!skipped.ok)return fail(skipped.code);
            summaries.push(Object.freeze({name,state:'unverified',reason:skipped.value.reason}));continue;
          }
          const final=r.value.projection?.kind==='table'?r.value.projection.observation:null;
          if(r.value.retry_not_started){
            if(r.value.reason!=='scope_evidence_limit')return fail(r.value.reason??'invalid_state');
            const skipped=m.skipFinal(t.slot,{source:m.source,phase:m.phase(),target:name});if(!skipped.ok)return fail(skipped.code);
            summaries.push(Object.freeze({name,state:'unverified',reason:skipped.value.reason}));continue;
          }
          const value=final?.state==='rows'&&t.initial.rows[0].sys_scope!==null&&final.rows[0].sys_scope!==null
            ?JSON.stringify(t.initial.rows)===JSON.stringify(final.rows)?'stable':'changed':'unverified';
          if(final)deliveries.set(name,Object.freeze({initial:t.initial,final,synthetic:true,evidence_issuance:'disabled'}));
          summaries.push(Object.freeze({name,state:value,reason:final?.state==='unavailable'?final.reason:r.value.reason??(value==='unverified'?'scope_unknown':null)}));
        }
        const end=m.checkpoint();if(!end.ok)return fail(end.code);
        if(api.stats().reserved!==0||m.stats().primary)return fail(m.stats().primary??'invalid_state');
        const states=[parentState,metadataState,...summaries.map(s=>s.state)],result=states.includes('changed')?'changed':states.includes('unverified')?'unverified':'stable';
        deliverable=result==='stable';if(!deliverable)deliveries.clear();
        state='done';parent=null;metadata=null;tables.clear();
        return good(Object.freeze({state:result,parent:parentState,metadata:metadataState,tables:Object.freeze(summaries),diagnostics:Object.freeze([...diagnostics]),synthetic:true,evidence_issuance:'disabled',seal:null}));
      }finally{busy=false;}
    },
    /** One-shot normalized fixture data only, not a source receipt, worker job claim or production seal. */
    consumeObservations(name:string){
      const active=m.checkpoint();if(!active.ok)return fail(active.code);
      if(state!=='done'||busy||!deliverable)return fail('evidence_missing');
      const value=deliveries.get(name);if(!value)return fail('invalid_state');deliveries.delete(name);return good(value);
    },
    close(){return fail('closed');},
    stats:()=>Object.freeze({...api.stats(),state,primary:primary??m.stats().primary,evidence_issuance:'disabled' as const}),
  })};
}
