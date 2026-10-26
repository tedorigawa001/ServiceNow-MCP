import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {FixtureScopeWorkerReview} from '../../../dist/review/abort-scope-evidence-worker-review.js';
const a='a'.repeat(32),start=performance.now();let worker;
const api=new FixtureScopeWorkerReview({remainingMs:()=>60000-(performance.now()-start),factory(url,options){
  assert(url.pathname.endsWith('/abort-scope-evidence-worker-entry.js'));assert.deepEqual(options.execArgv,[]);assert.deepEqual(options.env,{});
  worker=new Worker(url,options);return worker;
}});
const date=n=>new Date(n).toISOString();
try{
  const p=await api.prepare({target:{update_set_sys_id:'1'.repeat(32),update_xml_sys_id:'2'.repeat(32),asset_sys_id:a},metadata:{name:`sys_script_${a}`,action:'INSERT_OR_UPDATE',sys_updated_on:'fixture',sys_mod_count:'1'},
    instance_binding:'3'.repeat(64),started_at:date(0),retrieved_at:date(1),deadline_ms:60000,
    payload:`<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${a}</sys_id><when>before</when><collection>incident</collection><sys_scope>${'4'.repeat(32)}</sys_scope><script><![CDATA[current.setAbortAction(true);]]></script></sys_script></record_update>`});
  assert.equal(p.state,'needs_observation');
  for(const phase of ['initial','final'])await api.observe(p.job_id,phase,{source:'sys_db_object.current',visibility_scope:'caller_acl',phase,observed_at:date(phase==='initial'?2:3),state:'rows',
    rows:[{sys_id:'5'.repeat(32),name:'incident',sys_scope:'6'.repeat(32),sys_updated_on:'fixture',sys_mod_count:'1'}]});
  await api.compare(p.job_id,date(4));const result=await api.finish();
  assert.equal(result.assets[0].scope_difference_candidate_count,1);assert.equal(result.diagnostic,null);assert.equal(result.evidence_issuance,'disabled');assert.equal(worker.threadId,-1);
  assert(!JSON.stringify(result).includes('payload_hash'));assert(!JSON.stringify(result).includes('setAbortAction'));
  console.log('Compiled fixture scope worker: fixed JS + IPC + upper result + termination PASS');
}finally{await api.close();}
