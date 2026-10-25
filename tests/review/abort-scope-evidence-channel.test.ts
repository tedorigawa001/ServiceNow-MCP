import { expect, it, vi } from 'vitest';
import { createSyntheticScopeChannel } from '../../src/review/abort-scope-evidence-channel.js';
import { SCOPE_PROTOCOL, scopeRequestSchema, scopeResponseSchema } from '../../src/review/abort-scope-evidence-protocol.js';
import { SCOPE_EVIDENCE_LIMITATIONS } from '../../src/review/abort-scope-evidence.js';
const config={run_nonce:'a'.repeat(64),worker_generation:'b'.repeat(64)},hash='c'.repeat(64);
const target={update_set_sys_id:'1'.repeat(32),update_xml_sys_id:'2'.repeat(32),asset_sys_id:'3'.repeat(32)};
const binding={plan_id:1,payload_hash:hash,code_hash:hash};
const prepareBody=()=>({target:{...target},metadata:{name:`sys_script_${target.asset_sys_id}`,action:'INSERT_OR_UPDATE',sys_updated_on:'now',sys_mod_count:'0'},
  instance_binding:hash,payload:'<record_update/>',started_at:'2026-10-25T00:00:00Z',retrieved_at:'2026-10-25T00:00:01Z',deadline_ms:60000});
const plan=()=>({target:{...target},payload_hash:hash,code_hash:hash,state:'needs_observation',plan_id:1,collection:'incident',
  sites:[{site_id:1,start:{line:1,column:0},end:{line:1,column:10}}]});
const observation=(phase:'initial'|'final')=>({...binding,observation:{source:'sys_db_object.current',visibility_scope:'caller_acl',phase,
  observed_at:phase==='initial'?'2026-10-25T00:00:02Z':'2026-10-25T00:00:03Z',state:'rows',rows:[{
    sys_id:'4'.repeat(32),name:'incident',sys_scope:'global',sys_updated_on:'now',sys_mod_count:'0'}]}});
const compareBody=()=>({...binding,compared_at:'2026-10-25T00:00:04Z'});
const comparison=()=>({...binding,result:{status:'compared',comparison:'same_literal',temporal_relation:'payload_vs_current_declared_table',
  reason:null,evidence_phase:null,unavailable_reason:null,limitations:[...SCOPE_EVIDENCE_LIMITATIONS]}});
type Channel=ReturnType<typeof createSyntheticScopeChannel>;
function get<T>(r:{ok:true;value:T}|{ok:false;diagnostic:unknown}):T{if(!r.ok)throw Error('test_failed');return r.value;}
function response(wire:string,kind:string,body:unknown){return JSON.stringify({...JSON.parse(wire),kind,body});}
function reply(c:Channel,wire:string,kind:string,body:unknown){return c.receive(c.peer,response(wire,kind,body));}
function hello(c:Channel){const q=get(c.begin('hello',null,{}));get(reply(c,q,'hello_ok',{accepted:true}));return q;}
function prepared(c:Channel){hello(c);const q=get(c.begin('prepare',1,prepareBody()));get(reply(c,q,'prepare_ok',plan()));return q;}
function finalReady(){const c=createSyntheticScopeChannel(config);prepared(c);
  let q=get(c.begin('observe_initial',1,observation('initial')));get(reply(c,q,'observe_initial_ok',{plan_id:1,phase:'initial',accepted:true}));
  q=get(c.begin('observe_final',1,observation('final')));get(reply(c,q,'observe_final_ok',{plan_id:1,phase:'final',accepted:true}));return c;
}
it('runs all five correlated requests with increasing sequence and no terminal diagnosis',()=>{
  const c=finalReady(),q=get(c.begin('compare',1,compareBody()));expect(JSON.parse(q).request_id).toBe(5);
  get(reply(c,q,'compare_ok',comparison()));expect(c.diagnostic()).toBe(null);
});
it.each(['protocol','run_nonce','worker_generation','request_id','job_id','kind','extra'] as const)('stops on response envelope mismatch: %s',field=>{
  const c=createSyntheticScopeChannel(config),q=get(c.begin('hello',null,{}));
  const r=JSON.parse(response(q,'hello_ok',{accepted:true}));
  r[field]=field==='request_id'?2:field==='job_id'?1:field==='extra'?true:'unexpected';
  expect(c.receive(c.peer,JSON.stringify(r))).toMatchObject({ok:false,diagnostic:{stage:'protocol',code:'protocol_invalid'}});
  expect(c.receive(c.peer,response(q,'hello_ok',{accepted:true}))).toMatchObject({ok:false});
});
it.each(['clone','other'] as const)('requires the exact synthetic peer even with identical scalar config: %s',kind=>{
  const c=createSyntheticScopeChannel(config),q=get(c.begin('hello',null,{}));
  expect(c.receive(kind==='clone'?structuredClone(c.peer):createSyntheticScopeChannel(config).peer,
    response(q,'hello_ok',{accepted:true}))).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
});
it('rejects duplicate response while idle and preserves it against later failure',()=>{
  const c=createSyntheticScopeChannel(config),q=hello(c),r=response(q,'hello_ok',{accepted:true});
  const first=c.receive(c.peer,r);expect(first).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
  expect(c.invalidate({stage:'output',code:'internal_review_error'})).toEqual(first);
});
it('rejects a stale response while another request is outstanding',()=>{
  const c=createSyntheticScopeChannel(config),q=hello(c);get(c.begin('prepare',1,prepareBody()));
  expect(reply(c,q,'hello_ok',{accepted:true})).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
});
it('rejects double start without queueing or resuming the first request',()=>{
  const c=createSyntheticScopeChannel(config),q=get(c.begin('hello',null,{}));
  expect(c.begin('hello',null,{})).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
  expect(reply(c,q,'hello_ok',{accepted:true})).toMatchObject({ok:false});
});
it.each(['hello_twice','before_hello','skip_initial','skip_final','compare_twice'] as const)('rejects phase/order reuse: %s',kind=>{
  const c=kind==='compare_twice'?finalReady():createSyntheticScopeChannel(config);
  if(kind==='hello_twice')hello(c);
  if(kind==='skip_initial'||kind==='skip_final')prepared(c);
  if(kind==='skip_final'){const q=get(c.begin('observe_initial',1,observation('initial')));get(reply(c,q,'observe_initial_ok',{plan_id:1,phase:'initial',accepted:true}));}
  if(kind==='compare_twice'){const q=get(c.begin('compare',1,compareBody()));get(reply(c,q,'compare_ok',comparison()));}
  const r=kind==='hello_twice'?c.begin('hello',null,{}):kind==='before_hello'?c.begin('prepare',1,prepareBody()):
    kind==='skip_initial'?c.begin('observe_final',1,observation('final')):c.begin('compare',1,compareBody());
  expect(r.ok).toBe(false);expect(c.begin('hello',null,{}).ok).toBe(false);
});
it.each(['hash','phase','name'] as const)('checks observation correlation: %s',kind=>{
  const c=createSyntheticScopeChannel(config);prepared(c);const b=observation('initial');
  if(kind==='hash')b.payload_hash='e'.repeat(64);if(kind==='phase')b.observation.phase='final';if(kind==='name')b.observation.rows[0].name='task';
  expect(c.begin('observe_initial',1,b).ok).toBe(false);
});
it('rejects prepare target mismatch and compare hash mismatch',()=>{
  const c=createSyntheticScopeChannel(config);hello(c);const q=get(c.begin('prepare',1,prepareBody())),p=plan();p.target.asset_sys_id='f'.repeat(32);
  expect(reply(c,q,'prepare_ok',p)).toMatchObject({ok:false,diagnostic:{stage:'prepare',code:'evidence_binding_mismatch'}});
  const d=finalReady(),r=get(d.begin('compare',1,compareBody())),b=comparison();b.code_hash='e'.repeat(64);
  expect(reply(d,r,'compare_ok',b)).toMatchObject({ok:false,diagnostic:{stage:'compare',code:'evidence_binding_mismatch'}});
});
it.each(['invalid_json','object','oversize','bad_body'] as const)('rejects malformed bounded wire: %s',kind=>{
  const c=createSyntheticScopeChannel(config),q=get(c.begin('hello',null,{}));
  const wire=kind==='invalid_json'?'PRIVATE_SECRET':kind==='object'?{}:kind==='oversize'?' '.repeat(65537):response(q,'hello_ok',{accepted:true,secret:'PRIVATE_SECRET'});
  expect(c.receive(c.peer,wire)).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
  expect(JSON.stringify(c.diagnostic())).not.toContain('PRIVATE_SECRET');
});
it.each(['cancelled','deadline_exceeded','worker_exited','access_denied'] as const)('holds primary %s through late messages and cleanup',code=>{
  const c=createSyntheticScopeChannel(config),q=get(c.begin('hello',null,{}));
  c.invalidate({stage:'owner',code});const snapshot=c.diagnostic();expect(Object.isFrozen(snapshot)).toBe(true);
  expect(reply(c,q,'hello_ok',{accepted:true})).toMatchObject({ok:false,diagnostic:{code}});
  c.finishCleanup('unconfirmed');c.finishCleanup('confirmed');c.invalidate({stage:'protocol',code:'protocol_invalid'});
  expect(c.diagnostic()).toEqual({state:'stopped',stage:'owner',code,cleanup:'unconfirmed'});
  expect(snapshot).toEqual({state:'stopped',stage:'owner',code,cleanup:'not_started'});
});
it('keeps typed worker rejection and cleanup without raw errors',()=>{
  const c=createSyntheticScopeChannel(config);prepared(c);const q=get(c.begin('observe_initial',1,observation('initial')));
  expect(reply(c,q,'error',{stage:'initial',code:'evidence_invalid'})).toMatchObject({ok:false,diagnostic:{stage:'initial',code:'evidence_invalid'}});
  c.finishCleanup('confirmed');expect(c.diagnostic()).toMatchObject({code:'evidence_invalid',cleanup:'confirmed'});
});
it('retains asset-local parse rejection without converting it to a run failure',()=>{
  const c=createSyntheticScopeChannel(config);hello(c);const q=get(c.begin('prepare',1,prepareBody()));
  get(reply(c,q,'error',{stage:'prepare',code:'invalid_xml'}));expect(c.diagnostic()).toBe(null);
  expect(c.assetDiagnostic(1)).toEqual({stage:'prepare',code:'invalid_xml'});
  expect(Object.isFrozen(c.assetDiagnostic(1))).toBe(true);
  c.invalidate({stage:'owner',code:'cancelled'});expect(c.assetDiagnostic(1)).toEqual({stage:'prepare',code:'invalid_xml'});
});
it('retains not-needed without permitting observation or re-prepare',()=>{
  const c=createSyntheticScopeChannel(config);hello(c);const q=get(c.begin('prepare',1,prepareBody()));
  get(reply(c,q,'prepare_ok',{target,payload_hash:hash,code_hash:hash,state:'not_needed',reason:'no_target_call'}));
  expect(c.begin('observe_initial',1,observation('initial')).ok).toBe(false);
});
it.each(['instance','update_set','start','deadline'] as const)('binds new jobs to the first synthetic run values: %s',part=>{
  const c=createSyntheticScopeChannel(config);prepared(c);const b=prepareBody();b.target.update_xml_sys_id='5'.repeat(32);
  if(part==='instance')b.instance_binding='d'.repeat(64);if(part==='update_set')b.target.update_set_sys_id='6'.repeat(32);
  if(part==='start')b.started_at='2026-10-25T00:00:00.001Z';if(part==='deadline')b.deadline_ms=59000;
  expect(c.begin('prepare',2,b)).toMatchObject({ok:false,diagnostic:{code:'evidence_binding_mismatch'}});
});
it('applies the cumulative 100-site cap across prepared jobs',()=>{
  const c=createSyntheticScopeChannel(config);hello(c);let q=get(c.begin('prepare',1,prepareBody()));const p=plan();
  p.sites=Array.from({length:100},(_,n)=>({...p.sites[0],site_id:n+1}));get(reply(c,q,'prepare_ok',p));
  const b=prepareBody();b.target.update_xml_sys_id='5'.repeat(32);q=get(c.begin('prepare',2,b));
  expect(reply(c,q,'prepare_ok',{...plan(),target:b.target})).toMatchObject({ok:false,diagnostic:{code:'scope_evidence_limit'}});
});
it('does not lose unconfirmed cleanup when cleanup is called before a stop',()=>{
  const c=createSyntheticScopeChannel(config);c.finishCleanup('unconfirmed');c.finishCleanup('confirmed');
  expect(c.diagnostic()).toEqual({state:'stopped',stage:'output',code:'invalid_state',cleanup:'unconfirmed'});
});
it.each([{stage:'initial',code:'invalid_xml'},{stage:'prepare',code:'evidence_invalid'},
  {stage:'initial',code:'access_denied'},{stage:'initial',code:'PRIVATE_SECRET'}])('rejects forbidden worker error/stage combinations: %j',body=>{
  const c=createSyntheticScopeChannel(config);prepared(c);const q=get(c.begin('observe_initial',1,observation('initial')));
  expect(reply(c,q,'error',body)).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
});
it('does not expose getter exceptions or invalid config values',()=>{
  expect(()=>createSyntheticScopeChannel({run_nonce:'PRIVATE_SECRET'})).toThrow('invalid_input');
  const c=createSyntheticScopeChannel(config);hello(c);
  expect(c.begin('prepare',1,{get target(){throw Error('PRIVATE_SECRET');}})).toMatchObject({ok:false,diagnostic:{code:'protocol_invalid'}});
  expect(JSON.stringify(c.diagnostic())).not.toContain('PRIVATE_SECRET');
});
it('does not emit a request after reentrant invalidation during body validation',()=>{
  const c=createSyntheticScopeChannel(config);hello(c);const b=prepareBody();
  Object.defineProperty(b,'target',{enumerable:true,get(){c.invalidate({stage:'owner',code:'cancelled'});return target;}});
  expect(c.begin('prepare',1,b)).toMatchObject({ok:false,diagnostic:{code:'cancelled'}});
  expect(c.diagnostic()).toMatchObject({stage:'owner',code:'cancelled'});
});
it('does not call network, clock, timer or logs for a full synthetic exchange',()=>{
  const f=vi.fn(()=>{throw Error('forbidden');});vi.stubGlobal('fetch',f);
  const clock=vi.spyOn(Date,'now').mockImplementation(f),timer=vi.spyOn(globalThis,'setTimeout').mockImplementation(f),log=vi.spyOn(console,'log').mockImplementation(f);
  try{const c=finalReady(),q=get(c.begin('compare',1,compareBody()));get(reply(c,q,'compare_ok',comparison()));expect(f).not.toHaveBeenCalled();}
  finally{clock.mockRestore();timer.mockRestore();log.mockRestore();vi.unstubAllGlobals();}
});

const base={protocol:SCOPE_PROTOCOL,...config,request_id:1,job_id:1};
const requests=()=>[
  {...base,job_id:null,kind:'hello',body:{}}, {...base,kind:'prepare',body:prepareBody()},
  {...base,kind:'observe_initial',body:observation('initial')}, {...base,kind:'observe_final',body:observation('final')},
  {...base,kind:'compare',body:compareBody()},
];
const responses=()=>[
  {...base,job_id:null,kind:'hello_ok',body:{accepted:true}}, {...base,kind:'prepare_ok',body:plan()},
  {...base,kind:'observe_initial_ok',body:{plan_id:1,phase:'initial',accepted:true}},
  {...base,kind:'observe_final_ok',body:{plan_id:1,phase:'final',accepted:true}},
  {...base,kind:'compare_ok',body:comparison()}, {...base,kind:'error',body:{stage:'compare',code:'evidence_missing'}},
];
it('validates every request/response kind and rejects added envelope/body keys',()=>{
  for(const [schema,values] of [[scopeRequestSchema,requests()],[scopeResponseSchema,responses()]] as const)for(const v of values){
    expect(schema.safeParse(v).success).toBe(true);expect(schema.safeParse({...v,extra:true}).success).toBe(false);
    expect(schema.safeParse({...v,body:{...v.body,extra:true}}).success).toBe(false);
    const missing={...v} as Record<string,unknown>;delete missing.request_id;expect(schema.safeParse(missing).success).toBe(false);
  }
});
it('rejects every required object field when removed, recursively',()=>{
  function variants(value:unknown):unknown[]{
    if(Array.isArray(value))return value.flatMap((v,i)=>variants(v).map(x=>value.map((item,n)=>n===i?x:item)));
    if(!value||typeof value!=='object')return [];
    const row=value as Record<string,unknown>;return Object.keys(row).flatMap(key=>{
      const removed={...row};delete removed[key];return [removed,...variants(row[key]).map(x=>({...row,[key]:x}))];
    });
  }
  for(const v of requests())for(const missing of variants(v))expect(scopeRequestSchema.safeParse(missing).success).toBe(false);
  for(const v of responses())for(const missing of variants(v))expect(scopeResponseSchema.safeParse(missing).success).toBe(false);
});
it.each(['target','metadata','row','site','position','comparison'] as const)('rejects nested additions: %s',part=>{
  const q=part==='target'||part==='metadata'?requests()[1]:part==='row'?requests()[2]:part==='comparison'?responses()[4]:responses()[1];
  const r=JSON.parse(JSON.stringify(q));
  if(part==='target')r.body.target.extra=true;if(part==='metadata')r.body.metadata.extra=true;
  if(part==='row')r.body.observation.rows[0].extra=true;if(part==='site')r.body.sites[0].extra=true;
  if(part==='position')r.body.sites[0].start.extra=true;if(part==='comparison')r.body.result.extra=true;
  expect((part==='site'||part==='position'||part==='comparison'?scopeResponseSchema:scopeRequestSchema).safeParse(r).success).toBe(false);
});
it('rejects invalid site positions, duplicate sites, global collection, oversized rows and scope objects',()=>{
  for(const mode of ['position','duplicate','global']){const p=plan();if(mode==='position')p.sites[0].end.column=-1;
    if(mode==='duplicate')p.sites.push(p.sites[0]);if(mode==='global')p.collection='global';
    expect(scopeResponseSchema.safeParse({...base,kind:'prepare_ok',body:p}).success).toBe(false);}
  const b=observation('initial');b.observation.rows.push(b.observation.rows[0],b.observation.rows[0]);
  expect(scopeRequestSchema.safeParse({...base,kind:'observe_initial',body:b}).success).toBe(false);
  expect(scopeRequestSchema.safeParse({...base,kind:'observe_initial',body:{...observation('initial'),observation:{
    ...observation('initial').observation,rows:[{...observation('initial').observation.rows[0],sys_scope:{value:'global'}}]}}}).success).toBe(false);
});
it('requires complete cross-field comparison semantics and fixed limitations',()=>{
  for(const change of [{comparison:'unknown'},{reason:'table_changed'},{status:'changed'},{evidence_phase:'initial'},
    {unavailable_reason:'not_collected'},{limitations:SCOPE_EVIDENCE_LIMITATIONS.slice(1)},
    {limitations:Array(8).fill(SCOPE_EVIDENCE_LIMITATIONS[0])}]){
    const b=comparison();expect(scopeResponseSchema.safeParse({...base,kind:'compare_ok',body:{...b,result:{...b.result,...change}}}).success).toBe(false);
  }
  const b=comparison();expect(scopeResponseSchema.safeParse({...base,kind:'compare_ok',body:{...b,result:{...b.result,
    status:'insufficient',comparison:'unknown',reason:'final_evidence_unavailable',evidence_phase:'final',unavailable_reason:'final_recheck_unavailable'}}}).success).toBe(true);
});
it('enforces payload UTF-8 bound and safe integer/job bounds without coercion',()=>{
  const q={...base,kind:'prepare',body:{...prepareBody(),payload:'😀'.repeat(524289)}};
  expect(scopeRequestSchema.safeParse(q).success).toBe(false);
  for(const changes of [{request_id:Number.MAX_SAFE_INTEGER+1},{request_id:0},{request_id:'1'},{job_id:101},{job_id:0}])
    expect(scopeRequestSchema.safeParse({...base,kind:'compare',body:compareBody(),...changes}).success).toBe(false);
});
