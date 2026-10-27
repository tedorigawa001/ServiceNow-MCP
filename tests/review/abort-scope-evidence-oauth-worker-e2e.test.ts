import {afterEach,expect,it,vi} from 'vitest';
import {Worker} from 'node:worker_threads';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {FixtureAccountingSession} from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import {fixtureScopeReviewSchema} from '../../src/review/abort-scope-evidence-worker-review.js';
import {createOAuthScopeRun} from './fixtures/oauth-source-worker-run.js';
import type {FixtureHandoffRequest} from '../../src/review/abort-scope-evidence-oauth-handoff.js';
const id='1'.repeat(32),asset='a'.repeat(32),scope='c'.repeat(32),secrets=['PRIVATE_OAUTH_TOKEN','PRIVATE_REFRESH','PRIVATE_SOURCE','PRIVATE_EXTRA'];
const input=()=>({target:{update_set_sys_id:id,update_xml_sys_id:'2'.repeat(32),asset_sys_id:asset},
  metadata:{name:`sys_script_${asset}`,action:'INSERT_OR_UPDATE' as const,sys_updated_on:'fixture',sys_mod_count:'1'},instance_binding:'3'.repeat(64),
  payload:`<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${asset}</sys_id><when>before</when><collection>incident</collection><sys_scope>${scope}</sys_scope><script><![CDATA[console.log('PRIVATE_SOURCE'); current.setAbortAction(true);]]></script></sys_script></record_update>`,
  started_at:new Date(0).toISOString(),retrieved_at:new Date(0).toISOString(),deadline_ms:60000});
function session(){let started=0;const now=performance.now.bind(performance),spy=vi.spyOn(performance,'now').mockImplementationOnce(()=>{started=now();return started;});
  const session=new FixtureAccountingSession({}, {oauthBootstrap:true});spy.mockRestore();return {session,started};}
function text(r:FixtureHandoffRequest){return JSON.stringify(r.method==='POST'?{access_token:secrets[0],refresh_token:secrets[1],expires_in:3600,token_type:'Bearer'}:
  {result:r.purpose.startsWith('parent')?[{sys_id:id,sys_updated_on:'fixture',sys_mod_count:'1'}]:r.purpose.startsWith('metadata')?
    [{sys_id:'2'.repeat(32),update_set:id,name:`sys_script_${asset}`,sys_updated_on:'fixture',sys_mod_count:'1'}]:
    [{sys_id:'4'.repeat(32),name:'incident',sys_scope:'d'.repeat(32),sys_updated_on:'fixture',sys_mod_count:'1'}]});}
function privateOutputAbsent(value:unknown){const out=JSON.stringify(value);return !secrets.some(v=>out.includes(v))&&!/<!\[CDATA|setAbortAction|run_nonce|worker_generation|payload_hash|code_hash/.test(out);}
async function waitForBoundary(ready:Promise<void>,pending:ReturnType<ReturnType<typeof createOAuthScopeRun>['run']>){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{const state=await Promise.race([ready.then(()=>'ready' as const),pending.then(r=>r.diagnostic?.code??'runner_finished_before_boundary',()=>'runner_failed_before_boundary'),
    new Promise<string>(resolve=>{timer=setTimeout(()=>resolve('boundary_timeout'),5000);})]);
    if(state!=='ready')throw Error(state);
  }finally{if(timer)clearTimeout(timer);}
}
afterEach(()=>vi.restoreAllMocks());
it('runs OAuth→same source→native worker→strict upper result with continuous C/G/E/R and no code/secrets',async()=>{
  const s=session();let c=0,g=0,e=0;const calls:string[]=[],run=createOAuthScopeRun({...s,input:input(),source(r){
    const text=JSON.stringify(r.method==='POST'?{access_token:secrets[0],refresh_token:secrets[1],token_type:'Bearer',expires_in:3600}:
      {result:r.purpose.startsWith('parent')?[{sys_id:id,sys_updated_on:'fixture',sys_mod_count:'1'}]:r.purpose.startsWith('metadata')?
        [{sys_id:'2'.repeat(32),update_set:id,name:`sys_script_${asset}`,sys_updated_on:'fixture',sys_mod_count:'1'}]:
        [{sys_id:'4'.repeat(32),name:'incident',sys_scope:'d'.repeat(32),sys_updated_on:'fixture',sys_mod_count:'1',script:secrets[3]}]});
    c++;g+=Buffer.byteLength(text);if(r.method==='GET'&&r.purpose.startsWith('table'))e+=Buffer.byteLength(text);calls.push(r.method==='POST'?'oauth':r.purpose);return new Response(text);
  }});
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('UNEXPECTED_FETCH');});
  try{const result=await run.run();expect(fixtureScopeReviewSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({diagnostic:null,review_status:'partial',analysis_complete:false,evidence_issuance:'disabled',code_return_mode:'none',
      assets:[{state:'comparison_only',scope_difference_candidate_count:1,comparison:{status:'compared',comparison:'different_reference'}}]});
    expect(calls).toEqual(['oauth','parent_initial','metadata_initial','table_initial','parent_final','metadata_final','table_final']);
    expect(c).toBe(7);expect(run.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,payload_bytes:0,reserved:0});
    const observed=run.observations();for(const stats of [observed.beforeFinish,observed.afterFinish])expect(stats).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,reserved:0});
    expect(observed.budgets.every((n,i,all)=>n>0&&n<=60000&&(!i||n<=all[i-1]))).toBe(true);expect(observed.threadIds).toEqual([-1]);
    expect(observed.workerLogs).toEqual([]);expect(secrets.some(s=>JSON.stringify(result).includes(s))).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/<!\[CDATA|setAbortAction|run_nonce|worker_generation|payload_hash|code_hash/);expect(fetch).not.toHaveBeenCalled();
  }finally{await run.close();}
},15000);
it.each([429,503])('keeps OAuth retry %s charged through source/worker/upper output with C=8/R=0',async status=>{
  let c=0,g=0,e=0;const run=createOAuthScopeRun({...session(),input:input(),source(r){const first=c++===0,body=first?'PRIVATE_EXTRA':text(r);
    g+=Buffer.byteLength(body);if(r.method==='GET'&&r.purpose.startsWith('table'))e+=Buffer.byteLength(body);return new Response(body,{status:first?status:200});}});
  try{const result=await run.run();expect(result).toMatchObject({diagnostic:null,assets:[{state:'comparison_only',scope_difference_candidate_count:1}]});
    expect(c).toBe(8);expect(run.stats()).toMatchObject({requests:c,received_bytes:g,evidence_bytes:e,reserved:0});
    expect(run.observations().threadIds).toEqual([-1]);expect(privateOutputAbsent(result)).toBe(true);
  }finally{await run.close();}
},15000);
it('stops before OAuth/worker start when the single outer owner was already cancelled',async()=>{
  const source=vi.fn((r:FixtureHandoffRequest)=>new Response(text(r))),run=createOAuthScopeRun({...session(),input:input(),source});
  try{run.cancel();const result=await run.run();expect(result).toMatchObject({diagnostic:{stage:'owner',code:'cancelled',cleanup:'not_started'},assets:[]});
    expect(source).not.toHaveBeenCalled();expect(run.stats().requests).toBe(0);expect(run.observations().threadIds).toEqual([]);
  }finally{await run.close();}
});
it('stops a pending OAuth exchange without starting source or worker and without leaking the rejection',async()=>{
  let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),calls:string[]=[];
  const run=createOAuthScopeRun({...session(),input:input(),source(r,signal){calls.push(r.method);entered();return new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(Error('PRIVATE_OAUTH_TOKEN')),{once:true});});}});
  const pending=run.run();try{await waitForBoundary(ready,pending);run.cancel();const result=await pending;
    expect(result).toMatchObject({diagnostic:{code:'cancelled',cleanup:'not_started'}});expect(calls).toEqual(['POST']);
    expect(run.stats()).toMatchObject({requests:1,received_bytes:0,active:false,timers:0,retained_bytes:0});expect(privateOutputAbsent(result)).toBe(true);
  }finally{run.cancel();await pending.catch(()=>{});await run.close();}
},15000);
it('cancels a pending table read, stops the native worker and does not start final reads',async()=>{
  let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),cancel=vi.fn(),calls:string[]=[];
  const run=createOAuthScopeRun({...session(),input:input(),source(r){calls.push(r.method==='POST'?'oauth':r.purpose);
    if(r.method==='GET'&&r.purpose==='table_initial'){entered();return new Response(new ReadableStream({pull(){},cancel}));}return new Response(text(r));}});
  const pending=run.run();try{await waitForBoundary(ready,pending);run.cancel();const result=await pending;
    expect(result).toMatchObject({diagnostic:{code:'cancelled',cleanup:'confirmed'},assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
    expect(calls).toEqual(['oauth','parent_initial','metadata_initial','table_initial']);expect(cancel).toHaveBeenCalledTimes(1);
    expect(run.stats()).toMatchObject({requests:4,active:false,timers:0,retained_bytes:0,primary:'cancelled'});
    expect(run.observations().threadIds).toEqual([-1]);expect(privateOutputAbsent(result)).toBe(true);
  }finally{run.cancel();await pending.catch(()=>{});await run.close();}
},15000);
it('cancels a native worker awaiting readiness and reports confirmed termination without table reads',async()=>{
  let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});
  const run=createOAuthScopeRun({...session(),input:input(),source:r=>new Response(text(r)),workerFactory(_url,options){
    const native=new Worker('setInterval(()=>{},1000)',{...options,eval:true});entered();return native;}});
  const pending=run.run();try{await waitForBoundary(ready,pending);run.cancel();const result=await pending;
    expect(result).toMatchObject({diagnostic:{code:'cancelled',cleanup:'confirmed'},assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
    expect(run.stats()).toMatchObject({requests:3,retained_bytes:0,timers:0});expect(run.observations().threadIds).toEqual([-1]);
  }finally{run.cancel();await pending.catch(()=>{});await run.close();}
},15000);
it('withdraws the provisional comparison if cancelled after compare but before the final upper result',async()=>{
  const run=createOAuthScopeRun({...session(),input:input(),source:r=>new Response(text(r)),afterCompare:()=>run.cancel()});
  try{const result=await run.run();expect(result).toMatchObject({diagnostic:{code:'cancelled',cleanup:'confirmed'},
    assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
    expect(run.stats()).toMatchObject({requests:7,reserved:0,primary:'cancelled'});expect(privateOutputAbsent(result)).toBe(true);
  }finally{await run.close();}
},15000);
it.each(['changed','unavailable'] as const)('does not promote %s final evidence into a worker comparison',async kind=>{
  const calls:string[]=[],run=createOAuthScopeRun({...session(),input:input(),source(r){calls.push(r.method==='POST'?'oauth':r.purpose);
    if(r.method==='GET'&&r.purpose===(kind==='changed'?'table_final':'table_initial'))return kind==='changed'?
      new Response(JSON.stringify({result:[{sys_id:'4'.repeat(32),name:'incident',sys_scope:'d'.repeat(32),sys_updated_on:'changed',sys_mod_count:'2'}]})):
      new Response(null,{status:404});return new Response(text(r));}});
  try{const result=await run.run();expect(result).toMatchObject({diagnostic:{stage:'final',code:'evidence_missing',cleanup:'confirmed'},
    assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
    expect(run.stats()).toMatchObject({requests:kind==='changed'?7:6,reserved:0});expect(calls.includes('table_final')).toBe(kind==='changed');
    expect(run.observations().threadIds).toEqual([-1]);
  }finally{await run.close();}
},15000);
it.each([401,403])('keeps terminal table HTTP %s at the upper result without final reads',async status=>{
  const run=createOAuthScopeRun({...session(),input:input(),source:r=>r.method==='GET'&&r.purpose==='table_initial'?new Response(null,{status}):new Response(text(r))});
  try{const result=await run.run();expect(result).toMatchObject({diagnostic:{stage:'initial',code:status===401?'authentication_failed':'access_denied',cleanup:'confirmed'},
    assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
    expect(run.stats().requests).toBe(4);expect(privateOutputAbsent(result)).toBe(true);
  }finally{await run.close();}
},15000);
it('does not start a worker when OAuth is rejected and retains only the fixed authentication diagnosis',async()=>{
  const run=createOAuthScopeRun({...session(),input:input(),source:()=>new Response('PRIVATE_OAUTH_TOKEN',{status:401})});
  try{const result=await run.run();expect(result).toMatchObject({diagnostic:{stage:'owner',code:'authentication_failed',cleanup:'not_started'},assets:[]});
    expect(run.stats()).toMatchObject({requests:1,received_bytes:0});expect(run.observations().threadIds).toEqual([]);expect(privateOutputAbsent(result)).toBe(true);
  }finally{await run.close();}
});
it('reports worker startup failure without serializing a factory exception or dispatching table reads',async()=>{
  const run=createOAuthScopeRun({...session(),input:input(),source:r=>new Response(text(r)),workerFactory(){throw Error('PRIVATE_SOURCE');}});
  try{const result=await run.run();expect(result).toMatchObject({diagnostic:{code:'worker_unavailable',cleanup:'not_started'},assets:[{state:'not_completed'}]});
    expect(run.stats().requests).toBe(3);expect(privateOutputAbsent(result)).toBe(true);
  }finally{await run.close();}
});
it('never resets the original session clock when worker startup follows a delayed OAuth response',async()=>{
  const s=session();let oauthEnded=0;const run=createOAuthScopeRun({...s,input:input(),async source(r){
    if(r.method==='POST'){await new Promise(resolve=>setTimeout(resolve,25));oauthEnded=performance.now()-s.started;}return new Response(text(r));}});
  try{const result=await run.run();expect(result.diagnostic).toBeNull();const budgets=run.observations().budgets;
    expect(oauthEnded).toBeGreaterThanOrEqual(20);expect(budgets[0]).toBeLessThanOrEqual(60000-oauthEnded);
    expect(budgets.at(-1)).toBeLessThan(budgets[0]);expect(run.stats()).toMatchObject({requests:7,reserved:0});
  }finally{await run.close();}
},15000);
it('captures child stdout/stderr and emits only a strict fixture upper result without credentials/code/protocol state',async()=>{
  const {stdout,stderr}=await promisify(execFile)(process.execPath,['--import','tsx',fileURLToPath(new URL('./fixtures/oauth-source-worker-smoke.mjs',import.meta.url))],
    {env:{},cwd:process.cwd(),timeout:15000,maxBuffer:1048576});
  expect(stderr).toBe('');expect(privateOutputAbsent(stdout)).toBe(true);const result=JSON.parse(stdout);
  expect(fixtureScopeReviewSchema.safeParse(result).success).toBe(true);expect(result).toMatchObject({diagnostic:null,evidence_issuance:'disabled',code_return_mode:'none',
    assets:[{scope_difference_candidate_count:1}]});
},15000);
it('reports an early runner terminal reason instead of hanging on an unreachable observation boundary',async()=>{
  const run=createOAuthScopeRun({...session(),input:input(),source:()=>new Response(null,{status:401})}),pending=run.run();
  try{await expect(waitForBoundary(new Promise(()=>{}),pending)).rejects.toThrow('authentication_failed');
    expect((await pending).diagnostic).toMatchObject({code:'authentication_failed',cleanup:'not_started'});
  }finally{run.cancel();await pending.catch(()=>{});await run.close();}
});
