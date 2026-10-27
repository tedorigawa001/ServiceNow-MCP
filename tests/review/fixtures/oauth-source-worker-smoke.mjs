// Child-process output boundary smoke. Synthetic input only; no live endpoint, credentials or environment inheritance.
import assert from 'node:assert/strict';
import {FixtureAccountingSession} from '../../../src/review/abort-scope-evidence-accounting-fixture.ts';
import {createOAuthScopeRun} from './oauth-source-worker-run.ts';
const started=performance.now(),session=new FixtureAccountingSession({}, {oauthBootstrap:true}),id='1'.repeat(32),asset='a'.repeat(32);
const canaries=['PRIVATE_OAUTH_TOKEN','PRIVATE_REFRESH','PRIVATE_SOURCE','PRIVATE_EXTRA'];let c=0,g=0,e=0;
// started is conservatively before session construction in this smoke; source-level test binds the exact constructor observation.
const run=createOAuthScopeRun({session,started,input:{target:{update_set_sys_id:id,update_xml_sys_id:'2'.repeat(32),asset_sys_id:asset},
  metadata:{name:`sys_script_${asset}`,action:'INSERT_OR_UPDATE',sys_updated_on:'fixture',sys_mod_count:'1'},instance_binding:'3'.repeat(64),
  payload:`<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${asset}</sys_id><when>before</when><collection>incident</collection><sys_scope>${'c'.repeat(32)}</sys_scope><script><![CDATA[console.log('PRIVATE_SOURCE'); current.setAbortAction(true);]]></script></sys_script></record_update>`,
  started_at:new Date(0).toISOString(),retrieved_at:new Date(0).toISOString(),deadline_ms:60000},source(r){
    const body=JSON.stringify(r.method==='POST'?{access_token:canaries[0],refresh_token:canaries[1],expires_in:3600,token_type:'Bearer'}:
      {result:r.purpose.startsWith('parent')?[{sys_id:id,sys_updated_on:'fixture',sys_mod_count:'1'}]:r.purpose.startsWith('metadata')?
        [{sys_id:'2'.repeat(32),update_set:id,name:`sys_script_${asset}`,sys_updated_on:'fixture',sys_mod_count:'1'}]:
        [{sys_id:'4'.repeat(32),name:'incident',sys_scope:'d'.repeat(32),sys_updated_on:'fixture',sys_mod_count:'1',script:canaries[3]}]});
    c++;g+=Buffer.byteLength(body);if(r.method==='GET'&&r.purpose.startsWith('table'))e+=Buffer.byteLength(body);return new Response(body);
  }});
globalThis.fetch=()=>{throw Error('UNEXPECTED_FETCH');};
try{const result=await run.run(),wire=JSON.stringify(result),observed=run.observations(),stats=run.stats();
  assert.equal(c,7);assert.equal(stats.requests,c);assert.equal(stats.received_bytes,g);assert.equal(stats.evidence_bytes,e);assert.equal(stats.reserved,0);
  assert.equal(result.diagnostic,null);assert.equal(result.assets[0].scope_difference_candidate_count,1);assert.deepEqual(observed.threadIds,[-1]);
  assert.deepEqual(observed.workerLogs,[]);assert(!canaries.some(v=>wire.includes(v)));assert(!/setAbortAction|CDATA|run_nonce|worker_generation|payload_hash|code_hash/.test(wire));
  process.stdout.write(wire);
}finally{await run.close();}
