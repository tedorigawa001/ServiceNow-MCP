import {afterEach,expect,it,vi} from 'vitest';
import {createFakeRunFixedSource} from '../../src/review/abort-scope-evidence-run-stream.js';
import {createReviewInstanceBinding} from '../../src/servicenow/review-release-config.js';
afterEach(()=>vi.useRealTimers());
const id='a'.repeat(32),rowId='b'.repeat(32);
function clock(){vi.useFakeTimers();return {now:()=>Date.now(),schedule(at:number,wake:()=>void){const t=setTimeout(wake,Math.max(0,at-Date.now()));return ()=>clearTimeout(t);}};}
const parent={result:{sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-28 00:00:00',sys_mod_count:'1'}};
const metadata={result:[{sys_id:rowId,update_set:id,name:`sys_script_${'c'.repeat(32)}`,type:'Business Rule',action:'INSERT_OR_UPDATE',sys_updated_on:'2026-10-28 00:00:00',sys_mod_count:'1'}]};
const release={result:[{build_name:'Australia'}]};
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
it('keeps parent, release and matched metadata on the same transport and exposes only fixed summaries',async()=>{
  const requests:unknown[]=[];const c=clock();
  const run=createFakeRunFixedSource(c,(request)=>{requests.push(request);return Response.json(request.purpose==='release_rows'?release:request.purpose==='metadata_initial'?metadata:parent);},{update_set_sys_id:id});
  get(await run.bootstrap());get(await run.readParent());const decision=get(await run.resolveRelease());
  expect(decision.release_match).toBe('matched');expect(get(await run.listMetadata(decision.permit!))).toMatchObject({metadata_seen:1});run.finish();
  expect(requests).toHaveLength(3);expect(run.status()).toMatchObject({budget:{requests:3},cleanup:{http:'confirmed',worker:'not_started'},evidence_issuance:'disabled'});
});
function assertion(){return {instance_id:'tc04',assertion:{family:'Australia',instance_binding:createReviewInstanceBinding('tc04','https://fake.invalid'),
  asserted_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+120000).toISOString()}};}
it('uses only a configured, bound, sufficiently current assertion after release-only 403 with confirmed no-body cleanup',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Response(null,{status:403}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());const decision=get(await run.resolveRelease());
  expect(decision).toMatchObject({release_match:'matched',source:'operator_config',limitations:expect.arrayContaining(['release_operator_asserted','release_config_may_be_stale'])});
  run.finish();expect(run.status()).toMatchObject({primary:null,budget:{requests:2},cleanup:{http:'confirmed'}});
});
it('does not mint a matched permit if cancellation arrives in the microtask gap before source commit',async()=>{
  const c=clock();let trigger=false,queued=false,run:ReturnType<typeof createFakeRunFixedSource>;
  run=createFakeRunFixedSource({...c,now(){if(trigger&&!queued&&run.status().source_state==='release_reading'&&!run.operations().active){queued=true;queueMicrotask(()=>run.cancel());}return c.now();}},
    r=>Response.json(r.purpose==='release_rows'?release:parent),{update_set_sys_id:id});
  get(await run.bootstrap());get(await run.readParent());trigger=true;expect((await run.resolveRelease()).ok).toBe(false);
  expect(queued).toBe(true);expect(run.status()).toMatchObject({primary:{code:'cancelled'},source_state:'failed'});run.finish();
});
it.each(['per-user','service-account-cached','service-account-exchange'] as const)('keeps %s bootstrap through final reread on one C/G/clock and never returns tokens',async auth=>{
  const c=clock(),requests:{purpose:string;method:string;path:string}[]=[],token={access_token:'PRIVATE_DUMMY_TOKEN',token_type:'bEaReR',expires_in:3600};
  const run=createFakeRunFixedSource(c,r=>{requests.push(r);return Response.json(r.purpose==='oauth'?token:r.purpose==='release_rows'?release:r.purpose.startsWith('metadata')?metadata:parent);},{update_set_sys_id:id,auth});
  const boot=get(await run.bootstrap());expect(run.status()).toMatchObject({auth_ready:true,ready_generation:1});get(await run.readParent());
  const decision=get(await run.resolveRelease());get(await run.listMetadata(decision.permit!));expect(get(await run.recheck(decision.permit!))).toMatchObject({consistency:'stable_observation'});
  run.finish();const expected=[...(auth==='service-account-exchange'?[token]:[]),parent,release,metadata,parent,metadata];
  expect(run.status()).toMatchObject({budget:{requests:expected.length,received_bytes:expected.reduce((n,v)=>n+Buffer.byteLength(JSON.stringify(v)),0),payload_bytes:0},ready_generation:1,auth_ready:false,cleanup:{http:'confirmed',worker:'not_started'}});
  expect(requests.map(r=>r.purpose)).toEqual([...(auth==='service-account-exchange'?['oauth']:[]),'parent_initial','release_rows','metadata_initial','parent_final','metadata_final']);
  for(const r of requests){expect(Object.isFrozen(r)).toBe(true);if(r.purpose==='oauth'){expect(r).toMatchObject({method:'POST',path:'/oauth_token.do',grant_type:'client_credentials'});continue;}
    expect(r.method).toBe('GET');expect(r.path.startsWith('/api/now/table/')).toBe(true);const url=new URL(r.path,'https://fake.invalid');
    expect(url.searchParams.get('sysparm_display_value')).toBe('false');if(r.purpose==='release_rows'){expect(url.pathname).toBe('/api/now/table/sys_cluster_state');expect(url.searchParams.get('sysparm_fields')).toBe('build_name');expect(url.searchParams.get('sysparm_limit')).toBe('21');}
    if(r.purpose.startsWith('metadata')){expect(url.searchParams.get('sysparm_query')).toBe(`update_set=${id}^ORDERBYsys_id`);expect(url.searchParams.get('sysparm_fields')).not.toMatch(/payload|script,/);}}
  expect(JSON.stringify({boot,decision,status:run.status()})).not.toContain('PRIVATE');expect(run.operations()).toMatchObject({timers:0,retained_bytes:0});
});
it.each([{access_token:'PRIVATE',token_type:'MAC',expires_in:3600},{access_token:'PRIVATE',token_type:'Bearer',expires_in:60},{access_token:'',token_type:'Bearer',expires_in:3600}])('refuses invalid modeled token before parent GET',async token=>{
  const c=clock(),seen:string[]=[],run=createFakeRunFixedSource(c,r=>{seen.push(r.purpose);return Response.json(token);},{update_set_sys_id:id,auth:'service-account-exchange'});
  expect((await run.bootstrap()).ok).toBe(false);expect((await run.readParent()).ok).toBe(false);run.finish();
  expect(seen).toEqual(['oauth']);expect(run.status()).toMatchObject({auth_ready:false,ready_generation:0,budget:{requests:1},cleanup:{http:'confirmed'}});expect(JSON.stringify(run.status())).not.toContain('PRIVATE');
});
it.each(['parent','release','metadata'] as const)('rejects out-of-order %s before dispatch',async kind=>{
  const c=clock();let calls=0;const run=createFakeRunFixedSource(c,()=>{calls++;return Response.json(parent);},{update_set_sys_id:id});
  const r=kind==='parent'?await run.readParent():kind==='release'?await run.resolveRelease():await run.listMetadata({} as never);
  expect(r.ok).toBe(false);expect(calls).toBe(0);run.finish();expect(run.status().budget?.requests).toBe(0);
});
it.each([{result:[{build_name:'Zurich'}]}, {result:[{build_name:'Australia'},{build_name:'Zurich'}]}, {result:[{build_name:'new-private-family'}]}, {result:Array.from({length:21},()=>({build_name:'Australia'}))}, {result:[{build_name:'Australia'},{}]}])('never fetches metadata for non-matched release %j',async raw=>{
  const c=clock(),seen:string[]=[],run=createFakeRunFixedSource(c,r=>{seen.push(r.purpose);return Response.json(r.purpose==='release_rows'?raw:parent);},{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());const decision=get(await run.resolveRelease());expect(decision.release_match).not.toBe('matched');expect(decision.permit).toBeNull();
  expect((await run.listMetadata({} as never)).ok).toBe(false);expect(seen).toEqual(['parent_initial','release_rows']);run.finish();
});
it.each(['expired','insufficient','binding'] as const)('does not use an operator assertion with %s validity',async kind=>{
  const c=clock(),config=assertion();if(kind==='expired')config.assertion.expires_at=new Date(Date.now()-1).toISOString();
  if(kind==='insufficient')config.assertion.expires_at=new Date(Date.now()+60000).toISOString();if(kind==='binding')config.assertion.instance_binding='f'.repeat(64);
  const seen:string[]=[],run=createFakeRunFixedSource(c,r=>{seen.push(r.purpose);return r.purpose==='release_rows'?new Response(null,{status:403}):Response.json(parent);},{update_set_sys_id:id,operator_config:config});
  get(await run.bootstrap());get(await run.readParent());const result=get(await run.resolveRelease());expect(result.release_match).toBe('unknown');expect(result.permit).toBeNull();
  expect(seen).toEqual(kind==='binding'?['parent_initial']:['parent_initial','release_rows']);run.finish();
});
it.each([401,403])('never uses release fallback for parent HTTP %i',async status=>{
  const c=clock(),run=createFakeRunFixedSource(c,()=>new Response(null,{status}),{update_set_sys_id:id,operator_config:assertion()});get(await run.bootstrap());
  expect((await run.readParent()).ok).toBe(false);expect((await run.resolveRelease()).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({primary:{code:status===401?'authentication_failed':'access_denied'},budget:{requests:1},cleanup:{http:'confirmed'}});
});
it('never uses fallback on release HTTP 401 even when an assertion exists',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Response(null,{status:401}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());expect((await run.resolveRelease()).ok).toBe(false);run.finish();expect(run.status()).toMatchObject({primary:{code:'authentication_failed'},budget:{requests:2}});
});
it('rejects a foreign or cloned source permit without altering the foreign run',async()=>{
  const c=clock(),make=()=>createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:parent),{update_set_sys_id:id}),a=make(),b=make();
  for(const r of [a,b]){get(await r.bootstrap());get(await r.readParent());}
  const pa=get(await a.resolveRelease()),pb=get(await b.resolveRelease()),before=b.status();
  expect((await a.listMetadata(pb.permit!)).ok).toBe(false);expect(b.status()).toEqual(before);expect((await b.listMetadata(structuredClone(pa.permit) as never)).ok).toBe(false);a.finish();b.finish();
});
it('ignores unexpected private fields while rejecting foreign metadata identity',async()=>{
  const c=clock(),seen:string[]=[],run=createFakeRunFixedSource(c,r=>{seen.push(r.purpose);return Response.json(r.purpose==='release_rows'?{result:[{build_name:'Australia',certificate:'PRIVATE_CERT',address:'PRIVATE_ADDR'}]}:
    r.purpose==='metadata_initial'?{result:[{...metadata.result[0],update_set:'d'.repeat(32),payload:'PRIVATE_CODE'}]}:{result:{...parent.result,secret:'PRIVATE_PARENT'}});},{update_set_sys_id:id});
  get(await run.bootstrap());get(await run.readParent());const decision=get(await run.resolveRelease());expect((await run.listMetadata(decision.permit!)).ok).toBe(false);run.finish();
  expect(seen).toHaveLength(3);expect(JSON.stringify({decision,status:run.status()})).not.toContain('PRIVATE');
});
it('keeps changed final metadata distinct from stable observation, never a scope seal',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:r.purpose.startsWith('metadata')?r.purpose==='metadata_final'?{result:[{...metadata.result[0],sys_mod_count:'2'}]}:metadata:parent),{update_set_sys_id:id});
  get(await run.bootstrap());get(await run.readParent());const p=get(await run.resolveRelease()).permit!;get(await run.listMetadata(p));const result=get(await run.recheck(p));
  expect(result).toMatchObject({consistency:'changed',evidence_issuance:'disabled'});run.finish();expect(run.status().budget?.requests).toBe(5);
});
it('does not expose payload/table execution or arbitrary transport adoption',()=>{
  const c=clock(),run=createFakeRunFixedSource(c,()=>Response.json(parent),{update_set_sys_id:id});
  for(const key of ['run','readPayload','readTable','adopt','transport','source','issueEvidence','worker'])expect(Reflect.has(run,key)).toBe(false);run.finish();
});
it('charges and parses the same private byte snapshot even if the injected clock mutates the original chunk after adoption',async()=>{
  const c=clock(),bytes=new Uint8Array(Buffer.from(JSON.stringify(parent)));let mutated=false,run:ReturnType<typeof createFakeRunFixedSource>|undefined;
  run=createFakeRunFixedSource({...c,now(){if(run&&!mutated&&run.status().budget?.received_bytes===bytes.length){mutated=true;bytes.fill(120);}return c.now();}},
    ()=>new Response(new ReadableStream({start(s){s.enqueue(bytes);s.close();}})),{update_set_sys_id:id});
  get(await run.bootstrap());expect((await run.readParent()).ok).toBe(true);expect(mutated).toBe(true);run.finish();
  expect(run.status()).toMatchObject({budget:{received_bytes:bytes.length},cleanup:{http:'confirmed'}});
});
it.each([403,404,429,503,0])('uses only release-local unavailable %i after confirmed cleanup, without a new transport claim',async status=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>{if(r.purpose!=='release_rows')return Response.json(parent);if(status===0)throw Error('PRIVATE_UPSTREAM');return new Response('PRIVATE_ERROR',{status});},{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());const result=get(await run.resolveRelease());expect(result).toMatchObject({release_match:'matched',source:'operator_config',evidence_issuance:'disabled'});run.finish();
  expect(run.status()).toMatchObject({primary:null,budget:{requests:2},transport_claim:'consumed',cleanup:{http:'confirmed'}});expect(JSON.stringify(run.status())).not.toContain('PRIVATE');
});
it('does not promote fallback when the release body cancel is unconfirmed',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Response(new ReadableStream({cancel(){throw Error('PRIVATE_CANCEL');}}),{status:403}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());expect((await run.resolveRelease()).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({cleanup:{http:'unconfirmed'},budget:{requests:2},auth_ready:false});
});
it.each([{result:[]},{result:[{build_name:'  '}]}])('preserves asserted-vs-observed distinction for empty observation %j',async value=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?value:parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());expect(get(await run.resolveRelease())).toMatchObject({source:'operator_config',release_match:'matched',limitations:expect.arrayContaining(['release_not_observed'])});run.finish();
});
it('does not fallback over a conflict with the configured family',async()=>{
  const c=clock(),config=assertion();config.assertion.family='Zurich';const run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:parent),{update_set_sys_id:id,operator_config:config});
  get(await run.bootstrap());get(await run.readParent());expect(get(await run.resolveRelease())).toMatchObject({source:'conflict',release_match:'unknown',permit:null});run.finish();
});
it('strips unexpected release/parent/metadata fields before retention and reread comparison',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?{result:[{build_name:' australia ',certificate:'PRIVATE_CERT'}]}:
    r.purpose.startsWith('metadata')?{result:metadata.result.map(x=>({...x,payload:'PRIVATE_CODE',extra:r.purpose}))}:{result:{...parent.result,extra:r.purpose}}),{update_set_sys_id:id});
  get(await run.bootstrap());get(await run.readParent());const decision=get(await run.resolveRelease());get(await run.listMetadata(decision.permit!));const final=get(await run.recheck(decision.permit!));
  expect(final.consistency).toBe('stable_observation');run.finish();expect(JSON.stringify({decision,final,status:run.status()})).not.toContain('PRIVATE');
});
it.each(['duplicate','unordered','sentinel_overflow'] as const)('rejects %s metadata before making it source-ready',async kind=>{
  const c=clock(),rows=kind==='duplicate'?[metadata.result[0],metadata.result[0]]:kind==='unordered'?[{...metadata.result[0],sys_id:'f'.repeat(32)},metadata.result[0]]:Array.from({length:4},(_,i)=>({...metadata.result[0],sys_id:String(i+1).repeat(32)}));
  const run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:r.purpose==='metadata_initial'?{result:rows}:parent),{update_set_sys_id:id,max_records:2});
  get(await run.bootstrap());get(await run.readParent());const p=get(await run.resolveRelease()).permit!;expect((await run.listMetadata(p)).ok).toBe(false);expect((await run.recheck(p)).ok).toBe(false);run.finish();expect(run.status().budget?.requests).toBe(3);
});
it('keeps the single sentinel row in consistency observation but selects at most max_records',async()=>{
  const c=clock(),rows=Array.from({length:3},(_,i)=>({...metadata.result[0],sys_id:String(i+1).repeat(32)})),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:r.purpose.startsWith('metadata')?{result:rows}:parent),{update_set_sys_id:id,max_records:2});
  get(await run.bootstrap());get(await run.readParent());const p=get(await run.resolveRelease()).permit!;expect(get(await run.listMetadata(p))).toMatchObject({metadata_seen:3,selected:2,truncated:true});get(await run.recheck(p));run.finish();
});
it.each(['bootstrap','parent','release'] as const)('rejects a duplicate %s claim without resetting counters or auth generation',async stage=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:parent),{update_set_sys_id:id});get(await run.bootstrap());
  if(stage!=='bootstrap')get(await run.readParent());if(stage==='release')get(await run.resolveRelease());
  const before=run.status().budget?.requests;expect((stage==='bootstrap'?await run.bootstrap():stage==='parent'?await run.readParent():await run.resolveRelease()).ok).toBe(false);run.finish();
  expect(run.status()).toMatchObject({ready_generation:1,budget:{requests:before}});
});
it('retains original clock through metadata and rejects work at the original hard deadline',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:r.purpose.startsWith('metadata')?metadata:parent),{update_set_sys_id:id});get(await run.bootstrap());get(await run.readParent());
  await vi.advanceTimersByTimeAsync(50000);const p=get(await run.resolveRelease()).permit!;get(await run.listMetadata(p));expect(run.status().budget?.remaining_ms).toBe(10000);
  await vi.advanceTimersByTimeAsync(10000);expect((await run.recheck(p)).ok).toBe(false);run.finish();expect(run.status()).toMatchObject({primary:{code:'deadline_exceeded'},budget:{requests:3}});
});
it('keeps the lowered shared request cap rather than allocating a new budget after release',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:parent),{update_set_sys_id:id,stream:{session:{requests:2}}});
  get(await run.bootstrap());get(await run.readParent());const p=get(await run.resolveRelease()).permit!;expect((await run.listMetadata(p)).ok).toBe(false);run.finish();expect(run.status()).toMatchObject({primary:{code:'request_budget_exceeded'},budget:{requests:2}});
});
it('does not parse oversized captured release input or use assertion to bypass its byte rejection',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Response('x'.repeat(16385)):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());expect((await run.resolveRelease()).ok).toBe(false);run.finish();expect(run.status()).toMatchObject({primary:{code:'receive_budget_exceeded'},cleanup:{http:'confirmed'}});expect(run.operations().retained_bytes).toBe(0);
});
it('keeps a closed source diagnostic immutable and refuses stale permit use without dispatch',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>Response.json(r.purpose==='release_rows'?release:parent),{update_set_sys_id:id});get(await run.bootstrap());get(await run.readParent());const p=get(await run.resolveRelease()).permit!;run.finish();const before=run.status();
  expect((await run.listMetadata(p)).ok).toBe(false);run.cancel();expect(run.status()).toEqual(before);
});
it.each(['schema','json'] as const)('keeps incomplete %s release unknown without assertion fallback or metadata dispatch',async kind=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?kind==='json'?new Response('PRIVATE_INVALID_JSON'):Response.json({result:[{build_name:42}]}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());const r=get(await run.resolveRelease());expect(r).toMatchObject({release_match:'unknown',source:'none',permit:null,limitations:expect.arrayContaining(['observation_incomplete'])});
  expect(run.status().primary).toBeNull();run.finish();expect(run.status().budget?.requests).toBe(2);
});
it.each(['fetch','body'] as const)('ends only the release observation at a %s request timeout and falls back after confirmed cleanup',async stage=>{
  const c=clock(),run=createFakeRunFixedSource(c,(r,signal)=>{if(r.purpose!=='release_rows')return Response.json(parent);
    if(stage==='fetch')return new Promise<Response>((_,reject)=>signal.addEventListener('abort',()=>reject(Error('PRIVATE_ABORT'))));
    return new Response(new ReadableStream({start(s){s.enqueue(new Uint8Array(Buffer.from('{"result":[')));}}));},{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());const pending=run.resolveRelease();await vi.advanceTimersByTimeAsync(10000);
  expect(get(await pending)).toMatchObject({release_match:'matched',source:'operator_config',limitations:expect.arrayContaining(['release_observation_unavailable'])});run.finish();
  expect(run.status()).toMatchObject({primary:null,budget:{requests:2},cleanup:{http:'confirmed'}});expect(run.operations()).toMatchObject({aborts:1,timers:0});
});
it('does not fall back when a timed-out release fetch never settles',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Promise<Response>(()=>{}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());const pending=run.resolveRelease();await vi.advanceTimersByTimeAsync(10000);
  expect((await pending).ok).toBe(false);run.finish();expect(run.status()).toMatchObject({cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'cleanup_deadline'}});
});
it.each([[400,'body'],[405,'body'],[204,null]] as const)('classifies release HTTP %i (%s) as observation_incomplete like bounded-source, without fallback or a run stop',async(status,body)=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Response(body,{status}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());
  expect(get(await run.resolveRelease())).toMatchObject({release_match:'unknown',source:'none',permit:null,limitations:['observation_incomplete','release_unknown']});
  run.finish();expect(run.status()).toMatchObject({primary:null,cleanup:{http:'confirmed'}});
});
it('treats a release redirect like the redirect:error transport failure and falls back',async()=>{
  const c=clock(),run=createFakeRunFixedSource(c,r=>r.purpose==='release_rows'?new Response(null,{status:302}):Response.json(parent),{update_set_sys_id:id,operator_config:assertion()});
  get(await run.bootstrap());get(await run.readParent());expect(get(await run.resolveRelease())).toMatchObject({release_match:'matched',source:'operator_config'});run.finish();
});
it.each([[404,'not_found_or_not_visible'],[400,'invalid_response'],[302,'upstream_unavailable'],[503,'upstream_unavailable']] as const)('stops a parent HTTP %i with the bounded-read code %s',async(status,code)=>{
  const c=clock(),run=createFakeRunFixedSource(c,()=>new Response(null,{status}),{update_set_sys_id:id});
  get(await run.bootstrap());expect(await run.readParent()).toMatchObject({ok:false,code});run.finish();
  expect(run.status()).toMatchObject({primary:{code},cleanup:{http:'confirmed'}});
});
