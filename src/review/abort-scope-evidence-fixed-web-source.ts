/** Package-excluded fixture composition. No real session/ReleasePermit/worker authority or global fetch. */
import { createFixtureWebStreamTransport,createFixtureOAuthWebStreamTransport } from './abort-scope-evidence-web-stream.js';
import { claimFixtureHandoffLifecycle,type PreparedEvidenceOwner } from './abort-scope-evidence-fixture-lifecycle.js';
import type { FakeDispatchRequest, FakePurposePermit, FakeTransportSlot } from './abort-scope-evidence-transport-state.js';
import type { FixedSourceNormalized } from './abort-scope-evidence-fixed-source.js';
export type FixtureFixedGetRequest=Readonly<{method:'GET';path:string;purpose:FakeDispatchRequest['purpose'];ordinal:1|2;synthetic:true}>;
type Result<T>={ok:true;value:T}|{ok:false;code:string};
type Table={slot:FakeTransportSlot;initial:FixedSourceNormalized|null;reason:string|null};
const good=<T>(value:T):Result<T>=>({ok:true,value});
/** One fixed descriptor builder shared by the independent source and the OH-02 dispatcher. */
export function fixtureFixedGetRequest(updateSet:string,r:FakeDispatchRequest):FixtureFixedGetRequest{
  if(!/^[a-f0-9]{32}$/.test(updateSet)||!['parent_initial','parent_final','metadata_initial','metadata_final','table_initial','table_final'].includes(r.purpose)
    ||![1,2].includes(r.ordinal))throw Error('invalid_state');
  const table=r.purpose.startsWith('table_'),parent=r.purpose.startsWith('parent_');
  if(table?typeof r.target!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(r.target)||r.target==='global':r.target!==undefined)throw Error('invalid_state');
  const params=new URLSearchParams({sysparm_query:table?`name=${r.target}^ORDERBYsys_id`:parent?`sys_id=${updateSet}^ORDERBYsys_id`:`update_set=${updateSet}^ORDERBYsys_id`,
    sysparm_fields:table?'sys_id,name,sys_scope,sys_updated_on,sys_mod_count':parent?'sys_id,sys_updated_on,sys_mod_count':'sys_id,update_set,name,sys_updated_on,sys_mod_count',
    sysparm_limit:table||parent?'2':'101',sysparm_offset:'0',sysparm_no_count:'true',sysparm_display_value:'false',sysparm_exclude_reference_link:'true'});
  return Object.freeze({method:'GET',path:`/api/now/table/${table?'sys_db_object':parent?'sys_update_set':'sys_update_xml'}?${params}`,
    purpose:r.purpose,ordinal:r.ordinal,synthetic:true});
}
export function createFixtureFixedWebSource(session:object,owner:PreparedEvidenceOwner,updateSet:string,
  source:(request:FixtureFixedGetRequest,signal:AbortSignal)=>Response|Promise<Response>){
  if(typeof updateSet!=='string'||!/^[a-f0-9]{32}$/.test(updateSet)||typeof source!=='function')return {ok:false as const,code:'invalid_input'};
  const made=createFixtureWebStreamTransport(session,owner,(r,signal)=>source(fixtureFixedGetRequest(updateSet,r),signal));
  if(!made.ok)return made;
  return fixedSourceOnTransport(made.value,updateSet);
}
type FixtureAdapter=Extract<ReturnType<typeof createFixtureWebStreamTransport>,{ok:true}>["value"];
// Private: only locally constructed adapters reach this core. Never an arbitrary adapter registration port.
function fixedSourceOnTransport(api:FixtureAdapter,updateSet:string,authority?:{check:()=>Result<true>;failed:(code:string)=>Result<never>;
  registerDiscard:(discard:(code:string)=>void)=>void}){
  const m=api.machine,tables=new Map<string,Table>();
  const deliveries=new Map<string,Readonly<{initial:FixedSourceNormalized;final:FixedSourceNormalized;synthetic:true;evidence_issuance:'disabled'}>>();
  let deliverable=false;
  type Projection=Extract<ReturnType<typeof m.consumeSourceBody>,{ok:true}>['value'];
  let state:'new'|'normal'|'final'|'done'|'failed'='new',busy=false,primary:string|null=null;
  let parent:Projection|null=null,metadata:Projection|null=null;
  const diagnostics:Readonly<{stage:string;reason:string}>[]=[];
  const reject=(code:string)=>({ok:false as const,code:primary??code});
  let discarded=false;
  function discard(code:string){primary??=code;state='failed';if(discarded)return;discarded=true;
    parent=null;metadata=null;tables.clear();deliveries.clear();deliverable=false;}
  authority?.registerDiscard(discard);
  function fail(code:string){discard(code);if(authority)authority.failed(primary!);else m.stop('closed');return reject(code);}
  function gate():Result<true>{
    const bound=authority?.check();if(bound&&!bound.ok)return fail(bound.code);
    return m.stats().primary?fail(m.stats().primary!):good(true);
  }
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
      const bound=gate();if(!bound.ok)return bound;
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
      const active=gate();if(!active.ok)return active;
      if(busy||state!=='new')return fail('invalid_state');busy=true;
      try{
        const p=await baseline('parent_initial');if(!p.ok)return p;parent=p.value.projection;
        const md=await baseline('metadata_initial');if(!md.ok)return md;metadata=md.value.projection;
        state='normal';return good(Object.freeze({state:parent?.kind==='baseline'&&parent.state==='rows'&&metadata?.kind==='baseline'&&metadata.state==='rows'?'prepared':'unverified',synthetic:true}));
      }finally{busy=false;}
    },
    async initial(name:string){
      const active=gate();if(!active.ok)return active;
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
      const active=gate();if(!active.ok)return active;
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
      const bound=gate();if(!bound.ok)return bound;
      const active=m.checkpoint();if(!active.ok)return fail(active.code);
      if(state!=='done'||busy||!deliverable)return fail('evidence_missing');
      const value=deliveries.get(name);if(!value)return fail('invalid_state');deliveries.delete(name);return good(value);
    },
    close(){return fail('closed');},
    stats:()=>{if(authority)gate();return Object.freeze({...api.stats(),state,primary:primary??m.stats().primary,evidence_issuance:'disabled' as const});},
  })};
}

// OH-02/03 same-module owner: no exported adapter adoption constructor.
declare const brand:unique symbol;
export type FixtureOAuthHandoffTicket={readonly [brand]:'oauth_source_ticket'};
export type FixtureHandoffRequest=FixtureFixedGetRequest|Readonly<{method:'POST';path:'/oauth_token.do';grant_type:'client_credentials';ordinal:1|2;synthetic:true}>;
type State='bootstrap_owned'|'auth_ready'|'offered'|'adopting'|'source_owned'|'failed'|'closed';
const ok=<T>(value:T):Result<T>=>Object.freeze({ok:true,value});
const no=(code:string):Result<never>=>Object.freeze({ok:false,code});

export function createFixtureOAuthSourceTransport(session:object,updateSet:string,
  source:(request:FixtureHandoffRequest,signal:AbortSignal)=>Response|Promise<Response>){
  const claimed=claimFixtureHandoffLifecycle(session);if(!claimed.ok)return claimed;
  const lifecycle=claimed.value;
  if(typeof updateSet!=='string'||!/^[a-f0-9]{32}$/.test(updateSet)||typeof source!=='function'){
    lifecycle.fail('invalid_input');return no('invalid_input');
  }
  let state:State='bootstrap_owned',primary:string|null=null,started=false,parentStarted=false;
  let ticket:FixtureOAuthHandoffTicket|undefined,consumed=false,discardSource:((code:string)=>void)|undefined;
  // This closure and the injected I/O reference are never replaced, including during adoption.
  const made=createFixtureOAuthWebStreamTransport(session,(r,signal)=>{
    if(state==='bootstrap_owned'&&r.purpose==='oauth')return source(Object.freeze({method:'POST',path:'/oauth_token.do',
      grant_type:'client_credentials',ordinal:r.ordinal,synthetic:true}),signal);
    if(state==='source_owned'&&r.purpose!=='oauth')return source(fixtureFixedGetRequest(updateSet,r),signal);
    throw Error('invalid_state');
  });
  if(!made.ok){lifecycle.fail('invalid_state');return made;}
  const api=made.value,m=api.machine;
  function fail(reason:string):Result<never>{
    primary??=m.diagnostics().primary??reason;if(state!=='closed')state='failed';
    discardSource?.(primary);
    // The machine owns the single abort/cleanup path and retains its earlier primary.
    m.stop(reason==='cancelled'?'cancelled':reason==='deadline_exceeded'?'deadline_exceeded':'closed');
    return no(primary);
  }
  function live(ready=false):Result<true>{
    if(primary)return no(primary);
    const checked=ready?lifecycle.checkReady():lifecycle.check();if(!checked.ok)return fail(checked.code);
    const cp=m.checkpoint();return cp.ok?ok(true):fail(cp.code);
  }
  function idle():Result<true>{
    const checked=live(true);if(!checked.ok)return checked;
    const checkpoint=api.handoffCheckpoint();if(!checkpoint.ok)return fail(checkpoint.code);
    const bound=lifecycle.checkReady();return bound.ok?ok(true):fail(bound.code);
  }
  function claimTicket(value:FixtureOAuthHandoffTicket):Result<true>{
    if(value!==ticket||!ticket)return no('evidence_binding_mismatch');
    if(consumed)return no(primary??'invalid_state');
    consumed=true;if(state!=='offered')return fail(primary??'invalid_state');state='adopting';return ok(true);
  }
  function commit():Result<true>{
    const checked=idle();if(!checked.ok)return checked;
    if(state!=='adopting'||primary)return no(primary??'invalid_state');state='source_owned';return ok(true);
  }
  async function run(p:FakePurposePermit){
    for(let attempt=0;attempt<2;attempt++){
      const r=await api.run(p);if(!r.ok)return fail(r.code);
      const c=m.cleanupInfo(r.value.cleanup),active=live();
      if(!active.ok)return active;
      if(!c.ok||c.value.disposition!=='confirmed')return fail(m.diagnostics().primary??'internal_review_error');
      if(r.value.outcome==='upstream_unavailable'&&attempt===0)continue;
      return ok(r.value);
    }
    return fail('internal_review_error');
  }
  const sourceLane=Object.freeze({
    /** OH-02 fixed parent probe only. Consumes/discards a normalized projection, never returns rows/body/receipt. */
    async probeParent(){
      const checked=live(true);if(!checked.ok)return checked;
      if(state!=='source_owned'||parentStarted)return no('invalid_state');parentStarted=true;
      const p=m.purpose('parent_initial',{source:m.source,phase:m.phase()});if(!p.ok)return fail(p.code);
      const r=await run(p.value);if(!r.ok)return r;
      if(r.value.body){const projected=m.consumeSourceBody(r.value.body,p.value,updateSet);if(!projected.ok)return fail(projected.code);}
      const end=live(true);return end.ok?ok(Object.freeze({outcome:r.value.outcome,synthetic:true,evidence_issuance:'disabled' as const})):end;
    },
    close(){if(state!=='source_owned')return no(primary??'invalid_state');return fail('closed');},
  });
  return ok(Object.freeze({
    bootstrap:Object.freeze({
      async run(){
        if(state!=='bootstrap_owned'||started)return no(primary??'invalid_state');started=true;
        const checked=live();if(!checked.ok)return checked;
        const p=m.purpose('oauth',{source:m.source,phase:m.phase()});if(!p.ok)return fail(p.code);
        const r=await run(p.value);if(!r.ok)return r;
        if(r.value.outcome!=='auth_only'){
          if(r.value.outcome==='upstream_unavailable')m.finishOAuthFailure(p.value);
          return fail(m.diagnostics().primary??r.value.outcome);
        }
        // api.run's finally has completed. Never promote the returned scalar auth_ready summary.
        const pin=lifecycle.pinReady();if(!pin.ok)return fail(pin.code);
        const ready=idle();if(!ready.ok)return ready;
        state='auth_ready';return ok(Object.freeze({state:'auth_ready' as const,synthetic:true,evidence_issuance:'disabled' as const}));
      },
      close(){if(state!=='bootstrap_owned')return no(primary??'invalid_state');return fail('closed');},
      cancel(){if(state!=='bootstrap_owned')return no(primary??'invalid_state');return fail('cancelled');},
    }),
    root:Object.freeze({
      offer():Result<FixtureOAuthHandoffTicket>{
        if(state!=='auth_ready')return no(primary??'invalid_state');
        const checked=idle();if(!checked.ok)return checked;
        ticket=Object.freeze(Object.create(null)) as FixtureOAuthHandoffTicket;state='offered';return ok(ticket);
      },
      adopt(value:FixtureOAuthHandoffTicket){
        // Foreign/cloned/stale handles cannot stop an existing source lease or another run.
        const claimed=claimTicket(value);if(!claimed.ok)return claimed;
        const committed=commit();return committed.ok?ok(sourceLane):committed;
      },
      adoptSource(value:FixtureOAuthHandoffTicket){
        const claimed=claimTicket(value);if(!claimed.ok)return claimed;
        // This is the only handoff-to-core path: same pinned updateSet and locally held adapter.
        // No adapter/owner/URL/callback may be supplied by the caller.
        const adopted=fixedSourceOnTransport(api,updateSet,Object.freeze({
          check:()=>{const checked=live(true);return checked.ok&&state!=='source_owned'?no('invalid_state'):checked;},
          failed:fail,
          registerDiscard:(discard:(code:string)=>void)=>{discardSource=discard;},
        }));
        const committed=commit();return committed.ok?adopted:committed;
      },
      cancel(){return fail('cancelled');},
      close(){const result=fail('closed');state='closed';return result;},
    }),
    stats:()=>Object.freeze({...api.stats(),state,primary:primary??m.diagnostics().primary,diagnostic:m.diagnostics(),
      synthetic:true,evidence_issuance:'disabled' as const}),
  }));
}
