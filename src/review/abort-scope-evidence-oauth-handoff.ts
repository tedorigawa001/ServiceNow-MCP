/** OH-02 package-excluded composition. Injected fixture Responses only; no fetch, token use or evidence issuer. */
import {claimFixtureHandoffLifecycle} from './abort-scope-evidence-fixture-lifecycle.js';
import {createFixtureOAuthWebStreamTransport} from './abort-scope-evidence-web-stream.js';
import {fixtureFixedGetRequest,type FixtureFixedGetRequest} from './abort-scope-evidence-fixed-web-source.js';
import type {FakePurposePermit} from './abort-scope-evidence-transport-state.js';
declare const brand:unique symbol;
export type FixtureOAuthHandoffTicket={readonly [brand]:'oauth_source_ticket'};
export type FixtureHandoffRequest=FixtureFixedGetRequest|Readonly<{method:'POST';path:'/oauth_token.do';grant_type:'client_credentials';ordinal:1|2;synthetic:true}>;
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:string}>;
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
  let ticket:FixtureOAuthHandoffTicket|undefined,consumed=false;
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
        if(value!==ticket||!ticket)return no('evidence_binding_mismatch');
        if(consumed)return no(primary??'invalid_state');
        consumed=true;if(state!=='offered')return fail(primary??'invalid_state');state='adopting';
        const checked=idle();if(!checked.ok)return checked;
        // Synchronous commit after final clock and lifecycle checks: no caller code between them and this write.
        if(state!=='adopting'||primary)return no(primary??'invalid_state');state='source_owned';return ok(sourceLane);
      },
      cancel(){return fail('cancelled');},
      close(){const result=fail('closed');state='closed';return result;},
    }),
    stats:()=>Object.freeze({...api.stats(),state,primary:primary??m.diagnostics().primary,diagnostic:m.diagnostics(),
      synthetic:true,evidence_issuance:'disabled' as const}),
  }));
}
