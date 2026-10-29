import {expect,it,vi} from 'vitest';
import {registerReviewEvidenceSession,type ReviewSourceReleaseSnapshot} from '../../src/servicenow/review-evidence-lifecycle.js';
import type {BootstrapPurpose} from '../../src/servicenow/review-bootstrap-contract.js';
const id='a'.repeat(32),encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const parent={sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-29',sys_mod_count:'0'};
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function setup(mode:'per-user'|'cached'|'exchange'='per-user',limits:Partial<{requests:number;total_bytes:number;response_bytes:number;deadline_ms:number}>={}){
  let now=0,reserved=0,releaseCount=0;const counters={requests:0,received_bytes:0,payload_bytes:0},events:{purpose:string;bytes?:number}[]=[],jobs=new Set<{at:number;wake:()=>void}>();
  const lease={read:()=>({...counters,remaining_ms:(limits.deadline_ms??60000)-now})},source={},permit={};
  const release:ReviewSourceReleaseSnapshot={instance_release:{source:'sys_cluster_state.build_name',resolution_status:'resolved',family:'Australia',raw_buildname:'Australia',observed_at:'2026-10-29T00:00:00Z',visibility_scope:'caller_acl'},limitations:['release_visible_nodes_only']};
  const sourcePort={matches:()=>true,copyRelease:()=>release};
  type Response={status:number;bytes:Uint8Array};let respond:(purpose:BootstrapPurpose,signal:AbortSignal)=>Promise<Response>=async purpose=>({status:200,bytes:encode(purpose==='authentication'?{access_token:'PRIVATE_TOKEN',expires_in:3600,token_type:'Bearer'}:purpose==='parent'?{result:parent}:{result:[{build_name:'Australia'}]})});
  let resolve=(_response:unknown):{source:object;permit:object;port:typeof sourcePort}|null=>({source,permit,port:sourcePort}),onCharge=(_n:number)=>{},onDispatch=()=>{};
  const deps={fake_io:true as const,lease,source,target:id,auth:mode,limits:{requests:210,total_bytes:16777216,response_bytes:4194304,deadline_ms:60000,...limits},
    accounting:{reserve(){reserved=4;},reserved:()=>reserved,dispatch(){counters.requests++;onDispatch();},chunk(n:number){counters.received_bytes+=n;onCharge(n);},release(){reserved=0;releaseCount++;}},
    async dispatch(request:{purpose:BootstrapPurpose},signal:AbortSignal){events.push({purpose:request.purpose});const response=await respond(request.purpose,signal);events[events.length-1].bytes=response.bytes.length;return response;},
    resolveRelease:(response:unknown)=>resolve(response),
    schedule(delay:number,wake:()=>void){const j={at:now+delay,wake};jobs.add(j);return ()=>{jobs.delete(j);};},
  };
  const snapshot={},owner=registerReviewEvidenceSession({},snapshot,lease,deps),handle=get(owner.transportConstructor.claim(snapshot,lease));
  return {owner,handle,snapshot,lease,deps,counters,events,source,permit,sourcePort,release,now:(n:number)=>{now=n;for(const j of [...jobs])if(j.at<=now){jobs.delete(j);j.wake();}},reserved:()=>reserved,releaseCount:()=>releaseCount,pending:()=>jobs.size,
    respond:(fn:typeof respond)=>{respond=fn;},resolve:(fn:typeof resolve)=>{resolve=fn;},onCharge:(fn:typeof onCharge)=>{onCharge=fn;},onDispatch:(fn:typeof onDispatch)=>{onDispatch=fn;},run:()=>owner.transportConstructor.bootstrap(handle,snapshot,lease)};
}
it('uses one canonical budget and owner for authentication, parent, release and prepared binding',async()=>{
  const s=setup('exchange'),result=get(await s.owner.transportConstructor.bootstrap(s.handle,s.snapshot,s.lease));
  expect(result).toMatchObject({state:'prepared_only',instance_release:{family:'Australia'},evidence_issuance:'disabled'});
  expect(s.events.map(e=>e.purpose)).toEqual(['authentication','parent','release']);
  expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({ready_generation:1,source_claim:'claimed',transport_claim:'claimed',budget:{...s.counters,requests:3}});
  expect(s.counters.payload_bytes).toBe(0);expect(s.reserved()).toBe(4);expect(s.pending()).toBe(0);expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN');
  s.owner.close('closed');expect(s.reserved()).toBe(0);expect(s.releaseCount()).toBe(1);
});
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
it('does not retry a still-pending I/O operation when its original attempt window expires',async()=>{
  const s=setup();s.respond((_purpose,_signal)=>new Promise(()=>{}));const work=s.run();await flush();expect(s.events).toHaveLength(1);s.now(10000);
  try{await flush();expect(s.events).toHaveLength(1);expect(await work).toEqual({ok:false,code:'upstream_unavailable'});expect(s.counters.requests).toBe(1);expect(s.reserved()).toBe(0);expect(s.pending()).toBe(0);}
  finally{s.owner.revoke('cancelled');await work;}
});
it.each(['per-user','cached'] as const)('skips OAuth I/O for %s while keeping the same canonical budget and ready generation',async mode=>{
  const s=setup(mode);get(await s.run());expect(s.events.map(e=>e.purpose)).toEqual(['parent','release']);expect(s.counters.requests).toBe(2);
  expect(s.counters.received_bytes).toBe(s.events.reduce((n,e)=>n+(e.bytes??0),0));expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({ready_generation:1,source_claim:'claimed',budget:s.counters});s.owner.close('closed');
});
it('retries a settled synthetic 503 once without resetting C/G, source claim or the final reservations',async()=>{
  const s=setup();let call=0;s.respond(async purpose=>++call===1?{status:503,bytes:encode({error:'DUMMY'})}:{status:200,bytes:encode(purpose==='parent'?{result:parent}:{result:[{build_name:'Australia'}]})});
  get(await s.run());expect(s.events.map(e=>e.purpose)).toEqual(['parent','parent','release']);expect(s.counters).toEqual({requests:3,received_bytes:s.events.reduce((n,e)=>n+(e.bytes??0),0),payload_bytes:0});expect(s.reserved()).toBe(4);s.owner.close('closed');expect(s.releaseCount()).toBe(1);
});
it('retries a settled 200 whose local processing crosses its attempt window, charging both attempts',async()=>{
  const s=setup();let first=true;s.onCharge(()=>{if(first){first=false;s.now(10000);}});
  get(await s.run());expect(s.events.map(e=>e.purpose)).toEqual(['parent','parent','release']);expect(s.counters).toEqual({requests:3,received_bytes:s.events.reduce((n,e)=>n+(e.bytes??0),0),payload_bytes:0});expect(s.pending()).toBe(0);s.owner.close('closed');
});
it.each(['authentication','parent','release'] as const)('exhausts at most two settled retries for %s and never continues to metadata',async failing=>{
  const s=setup(failing==='authentication'?'exchange':'per-user');s.respond(async purpose=>purpose===failing?{status:503,bytes:new Uint8Array()}:{status:200,bytes:encode({result:parent})});
  expect(await s.run()).toEqual({ok:false,code:'upstream_unavailable'});expect(s.events.filter(e=>e.purpose===failing)).toHaveLength(2);expect(s.events.some(e=>e.purpose==='metadata')).toBe(false);expect(s.reserved()).toBe(0);expect(s.releaseCount()).toBe(1);expect(s.pending()).toBe(0);
});
it.each([401,403])('stops parent HTTP %i with its original reason and no source claim',async status=>{
  const s=setup();s.respond(async()=>({status,bytes:encode({error:'PRIVATE_ERROR'})}));const code=status===401?'authentication_failed':'access_denied';
  expect(await s.run()).toEqual({ok:false,code});expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({auth_ready:false,source_claim:'unclaimed',primary:{code}});expect(s.events).toHaveLength(1);expect(s.reserved()).toBe(0);expect(JSON.stringify(s.owner.transportConstructor.diagnostic())).not.toContain('PRIVATE_ERROR');
});
it('does not bind unknown release premises or dispatch metadata',async()=>{
  const s=setup();s.resolve(()=>null);expect(await s.run()).toEqual({ok:false,code:'release_not_admitted'});expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({source_claim:'unclaimed',primary:{code:'release_not_admitted'}});expect(s.events.map(e=>e.purpose)).toEqual(['parent','release']);expect(s.reserved()).toBe(0);
});
it('rejects a resolved binding from another source before claiming the prepared source',async()=>{
  const s=setup();s.resolve(()=>({source:{},permit:s.permit,port:s.sourcePort}));expect(await s.run()).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(s.owner.inspect(s.snapshot,s.lease).source_claim).toBe('unclaimed');expect(s.reserved()).toBe(0);
});
it('keeps constructor-supplied asserted release limitations on the designated cluster-403 fallback only',async()=>{
  const s=setup();s.respond(async purpose=>purpose==='parent'?{status:200,bytes:encode({result:parent})}:{status:403,bytes:new Uint8Array()});
  s.release.instance_release={source:'operator_config',resolution_status:'asserted',family:'Australia',visibility_scope:'operator_configured',instance_binding:'a'.repeat(64),config_version:'b'.repeat(64),asserted_at:'2026-10-29T00:00:00Z',expires_at:'2026-10-29T01:00:00Z'};
  (s.release.limitations as string[]).splice(0,1,'release_operator_asserted','release_not_observed','release_config_may_be_stale','release_observation_unavailable');
  const result=get(await s.run());expect(result.instance_release).toMatchObject({resolution_status:'asserted',source:'operator_config'});expect(result.limitations).toEqual(s.release.limitations);expect(result.evidence_issuance).toBe('disabled');s.owner.close('closed');
});
it.each([4,5])('does not spend reserved final capacity when request limit is %i',async requests=>{
  const s=setup('per-user',{requests});expect(await s.run()).toEqual({ok:false,code:'request_budget_exceeded'});expect(s.counters.requests).toBe(requests===4?0:1);expect(s.owner.inspect(s.snapshot,s.lease).primary).toBeNull();
  expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({state:'ordinary_closed',reservation_released:true});expect(s.reserved()).toBe(0);expect(s.releaseCount()).toBe(1);expect((await s.run()).code).toBe('request_budget_exceeded');s.owner.close('closed');expect(s.releaseCount()).toBe(1);
});
it.each(['response','total'] as const)('charges the rejected chunk once at the %s cap and never parses or binds it',async cap=>{
  const s=setup('per-user',cap==='response'?{response_bytes:4}:{total_bytes:4});s.respond(async()=>({status:200,bytes:new Uint8Array(5)}));expect(await s.run()).toEqual({ok:false,code:'receive_budget_exceeded'});
  expect(s.counters).toEqual({requests:1,received_bytes:5,payload_bytes:0});expect(s.owner.inspect(s.snapshot,s.lease).source_claim).toBe('unclaimed');expect(s.reserved()).toBe(0);
});
it.each(['C','G','P'] as const)('rejects drift in the constructor %s accounting port instead of creating a replacement counter',async kind=>{
  const s=setup();if(kind==='C')s.onDispatch(()=>{s.counters.requests++;});else s.onCharge(()=>{if(kind==='G')s.counters.received_bytes++;else s.counters.payload_bytes++;});
  expect(await s.run()).toEqual({ok:false,code:'internal_review_error'});expect(s.owner.inspect(s.snapshot,s.lease).primary?.code).toBe('internal_review_error');expect(s.reserved()).toBe(0);expect(s.events.length).toBe(kind==='C'?0:1);
});
it('does not dispatch after the extra lease sample extends the observed remaining time',async()=>{
  const s=setup();s.onDispatch(()=>{let sample=0;s.lease.read=()=>({...s.counters,remaining_ms:++sample===3?60000:59999});});
  expect(await s.run()).toEqual({ok:false,code:'invalid_observation_time'});expect(s.events).toHaveLength(0);expect(s.reserved()).toBe(0);
});
it('adopts one private byte copy for parsing even if the canonical charge callback changes the I/O buffer',async()=>{
  const s=setup(),raw=encode({result:parent});s.respond(async purpose=>({status:200,bytes:purpose==='parent'?raw:encode({result:[{build_name:'Australia'}]})}));s.onCharge(()=>raw.fill(0));get(await s.run());expect(s.counters.received_bytes).toBe(s.events.reduce((n,e)=>n+(e.bytes??0),0));s.owner.close('closed');
});
it.each(['bad_parent','wrong_target','bad_json','bad_utf8'] as const)('rejects %s without exposing raw data or producing a prepared binding',async kind=>{
  const s=setup();s.respond(async()=>({status:200,bytes:kind==='bad_json'?encode('PRIVATE_JSON'):kind==='bad_utf8'?new Uint8Array([0xc3,0x28]):encode({result:kind==='bad_parent'?{sys_id:id}:{...parent,sys_id:'b'.repeat(32)}})}));
  expect(await s.run()).toEqual({ok:false,code:'invalid_response'});expect(s.events).toHaveLength(1);expect(s.owner.inspect(s.snapshot,s.lease).source_claim).toBe('unclaimed');expect(JSON.stringify(s.owner.transportConstructor.diagnostic())).not.toContain('PRIVATE_JSON');
});
it.each([{expires_in:0},{token_type:'Mac'},{access_token:''}])('rejects malformed fake OAuth %j before ready or parent dispatch',async change=>{
  const s=setup('exchange');s.respond(async()=>({status:200,bytes:encode({access_token:'PRIVATE_TOKEN',expires_in:3600,token_type:'Bearer',...change})}));expect(await s.run()).toEqual({ok:false,code:'authentication_failed'});
  expect(s.events.map(e=>e.purpose)).toEqual(['authentication']);expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({ready_generation:0,auth_ready:false});expect(s.reserved()).toBe(0);
});
it.each(['claim','lease'] as const)('rejects a foreign %s before any dispatch while leaving the foreign owner intact',async kind=>{
  const a=setup(),b=setup(),before=b.owner.transportConstructor.diagnostic();const result=await a.owner.transportConstructor.bootstrap(kind==='claim'?b.handle:a.handle,a.snapshot,kind==='lease'?b.lease:a.lease);
  expect(result).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(a.events).toHaveLength(0);expect(b.owner.transportConstructor.diagnostic()).toEqual(before);expect(b.events).toHaveLength(0);a.owner.close('closed');b.owner.close('closed');
});
it('retains synchronous revocation before abort listeners and rejects late successful I/O without charging it',async()=>{
  const s=setup();let finish!:(r:{status:number;bytes:Uint8Array})=>void,during:unknown;
  s.respond((_purpose,signal)=>{signal.addEventListener('abort',()=>{during=s.owner.inspect(s.snapshot,s.lease);});return new Promise(resolve=>{finish=resolve;});});
  const work=s.run();await flush();s.owner.revoke('cancelled');expect(during).toMatchObject({state:'stopped',auth_ready:false,transport_state:'revoked',primary:{code:'cancelled'}});
  expect(await work).toEqual({ok:false,code:'cancelled'});const status=s.owner.transportConstructor.diagnostic();finish({status:200,bytes:encode({result:parent})});await flush();expect(s.owner.transportConstructor.diagnostic()).toEqual(status);expect(s.counters.received_bytes).toBe(0);expect(s.pending()).toBe(0);expect(s.reserved()).toBe(0);
});
it.each([50000,60000])('distinguishes the original soft/hard cutoff at %i without starting a new budget',async at=>{
  const s=setup();s.respond(()=>new Promise(()=>{}));const work=s.run();await flush();s.now(at);expect(await work).toEqual({ok:false,code:at===50000?'phase_deadline_exceeded':'deadline_exceeded'});
  expect(s.owner.inspect(s.snapshot,s.lease).primary?.code??null).toBe(at===50000?null:'deadline_exceeded');expect(s.events).toHaveLength(1);expect(s.reserved()).toBe(0);expect(s.pending()).toBe(0);
});
it('rejects concurrent duplicate bootstrap and cannot resume either claim after the shared stop',async()=>{
  const s=setup();s.respond(()=>new Promise(()=>{}));const work=s.run();await flush();expect(await s.run()).toEqual({ok:false,code:'invalid_state'});expect(await work).toEqual({ok:false,code:'invalid_state'});expect(await s.run()).toEqual({ok:false,code:'invalid_state'});expect(s.events).toHaveLength(1);expect(s.releaseCount()).toBe(1);expect(s.pending()).toBe(0);
});
it('refuses duplicate successful bootstrap without replacing the prepared binding or spending another C',async()=>{
  const s=setup();const first=get(await s.run());expect(await s.run()).toEqual({ok:false,code:'invalid_state'});expect(s.owner.inspect(s.snapshot,s.lease)).toMatchObject({primary:null,source_claim:'claimed',budget:{requests:2}});expect(first.evidence_issuance).toBe('disabled');s.owner.close('closed');
});
it('does not call global fetch or expose fake tokens, parent values or private authority',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});try{const s=setup('exchange'),result=get(await s.run());expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify({result,status:s.owner.transportConstructor.diagnostic()})).not.toContain('PRIVATE_TOKEN');expect(result).not.toHaveProperty('permit');expect(result).not.toHaveProperty('source');s.owner.close('closed');}finally{fetch.mockRestore();}
});
