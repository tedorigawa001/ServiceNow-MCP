/** No credentials or token exchange: injected fixture Responses only. Never calls fetch. */
import { createFixtureOAuthWebStreamTransport } from './abort-scope-evidence-web-stream.js';
type FixedRequest=Readonly<{method:'POST';path:'/oauth_token.do';grant_type:'client_credentials';ordinal:1|2;synthetic:true}>;
export function createFixtureOAuthBootstrap(session:object,source:(request:FixedRequest,signal:AbortSignal)=>Response|Promise<Response>){
  if(typeof source!=='function')return {ok:false as const,code:'invalid_input'};
  const made=createFixtureOAuthWebStreamTransport(session,(r,signal)=>{
    if(r.purpose!=='oauth')throw Error('invalid_state');
    return source(Object.freeze({method:'POST',path:'/oauth_token.do',grant_type:'client_credentials',ordinal:r.ordinal,synthetic:true}),signal);
  });
  if(!made.ok)return made;const api=made.value,m=api.machine;
  let started=false;
  return {ok:true as const,value:Object.freeze({
    async bootstrap(){
      if(started){m.stop('closed');return {ok:false as const,code:'invalid_state',diagnostic:m.diagnostics()};}started=true;
      const purpose=m.purpose('oauth',{source:m.source,phase:m.phase()});
      if(!purpose.ok)return {ok:false as const,code:purpose.code,diagnostic:m.diagnostics()};
      for(let n=0;n<2;n++){
        const run=await api.run(purpose.value);
        if(!run.ok){if(!m.diagnostics().primary)m.finishOAuthFailure(purpose.value);return {ok:false as const,code:run.code,diagnostic:m.diagnostics()};}
        const cleanup=m.cleanupInfo(run.value.cleanup),diagnostic=m.diagnostics();
        if(diagnostic.primary||!cleanup.ok||cleanup.value.disposition!=='confirmed')return {ok:false as const,code:diagnostic.primary??'internal_review_error',diagnostic};
        if(run.value.outcome==='auth_only')return {ok:true as const,value:Object.freeze({state:'auth_ready' as const,synthetic:true,evidence_issuance:'disabled' as const})};
        if(run.value.outcome==='upstream_unavailable'&&n===0)continue;
        if(run.value.outcome==='upstream_unavailable'){const failure=m.finishOAuthFailure(purpose.value);return {ok:false as const,code:failure.ok?'internal_review_error':failure.code,diagnostic:m.diagnostics()};}
        m.stop('closed');return {ok:false as const,code:run.value.outcome,diagnostic:m.diagnostics()};
      }
      m.stop('closed');return {ok:false as const,code:'internal_review_error',diagnostic:m.diagnostics()};
    },
    close(){m.stop('closed');},cancel(){m.stop('cancelled');},
    stats:()=>Object.freeze({...api.stats(),diagnostic:m.diagnostics()}),
  })};
}
