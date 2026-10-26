import {expect,it} from 'vitest';
import {createFixtureScopeWorkerEngine} from '../../src/review/abort-scope-evidence-worker-core.js';
import {createSyntheticScopeChannel} from '../../src/review/abort-scope-evidence-channel.js';
import {scopeResponseSchema} from '../../src/review/abort-scope-evidence-protocol.js';
import {sha256} from '../../src/review/update-xml.js';
const id='a'.repeat(32),xmlId='b'.repeat(32),assetId='c'.repeat(32),scope='d'.repeat(32);
const date=(ms:number)=>new Date(ms).toISOString();
const get=<T>(r:{ok:true;value:T}|{ok:false;diagnostic:unknown}):T=>{if(!r.ok)throw Error('rejected');return r.value;};
export function prepareBody(code='current.setAbortAction(true);',when='before',collection='incident',sysScope:string|null=scope){
  const payload=`<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${assetId}</sys_id><when>${when}</when><collection>${collection}</collection>${sysScope===null?'':`<sys_scope>${sysScope}</sys_scope>`}<script><![CDATA[${code}]]></script><filter_condition><item field="active"/></filter_condition></sys_script><sys_translated_text action="delete_multiple"/><sys_es_latest_script><x>ignored</x></sys_es_latest_script></record_update>`;
  return {target:{update_set_sys_id:id,update_xml_sys_id:xmlId,asset_sys_id:assetId},metadata:{name:`sys_script_${assetId}`,action:'INSERT_OR_UPDATE' as const,sys_updated_on:'2026-10-26',sys_mod_count:'1'},
    instance_binding:'e'.repeat(64),payload,retrieved_at:date(1),started_at:date(0),deadline_ms:60000};
}
export function observation(phase:'initial'|'final',sysScope:string|null=scope,mod='1'){
  return {source:'sys_db_object.current',visibility_scope:'caller_acl',phase,observed_at:date(phase==='initial'?2:3),state:'rows',
    rows:[{sys_id:'f'.repeat(32),name:'incident',sys_scope:sysScope,sys_updated_on:'2026-10-26',sys_mod_count:mod}]};
}
function setup(){
  const engine=createFixtureScopeWorkerEngine(),parent=createSyntheticScopeChannel({run_nonce:'1'.repeat(64),worker_generation:'2'.repeat(64)});
  const send=(kind:Parameters<typeof parent.begin>[0],job:number|null,body:unknown)=>{
    const wire=get(parent.begin(kind,job,body)),reply=engine.handle(wire);expect(typeof reply).toBe('string');get(parent.receive(parent.peer,reply));return scopeResponseSchema.parse(JSON.parse(reply!));
  };send('hello',null,{});return {engine,parent,send};
}
it('computes payload/code hashes and positions from the safe extractor without code in the plan',()=>{
  const x=setup(),code='/* PRIVATE_CODE */ current.setAbortAction(true);',body=prepareBody(code),r=x.send('prepare',1,body);
  expect(r.kind).toBe('prepare_ok');if(r.kind!=='prepare_ok')return;
  expect(r.body).toMatchObject({state:'needs_observation',payload_hash:sha256(body.payload),code_hash:sha256(code),collection:'incident',sites:[{site_id:1,start:{line:1,column:19}}]});
  expect(JSON.stringify(r)).not.toMatch(/PRIVATE_CODE|<!\[CDATA|sys_scope/);x.engine.close();
});
it.each([
  ['current.setAbortAction(false);','no_target_call'],['var x={setAbortAction:function(){}};x.setAbortAction(true);','no_target_call'],
  ['function f(current){current.setAbortAction(true);} ','receiver_unresolved'],['current.setAbortAction(gs.getProperty("flag"));','argument_unresolved'],
  ['current.setAbortAction(true);current.setAbortAction=function(){};','receiver_unresolved'],
])('distinguishes receiver and enabled argument (%s)',(code,reason)=>{
  const x=setup(),r=x.send('prepare',1,prepareBody(code));expect(r).toMatchObject({kind:'prepare_ok',body:{state:'not_needed',reason}});x.engine.close();
});
it('uses bounded aliases/constants rather than a same-name text match',()=>{
  const x=setup();expect(x.send('prepare',1,prepareBody('const enabled=true;var rec=current;rec.setAbortAction(enabled);'))).toMatchObject({kind:'prepare_ok',body:{state:'needs_observation'}});x.engine.close();
});
it.each([['after','incident','unsupported_when'],['before','global','declared_table_unknown'],['before','','declared_table_unknown']])('retains missing/unsupported context (%s/%s)',(when,collection,reason)=>{
  const x=setup();expect(x.send('prepare',1,prepareBody(undefined,when,collection))).toMatchObject({kind:'prepare_ok',body:{state:'not_needed',reason}});x.engine.close();
});
it.each([
  [scope,scope,'compared','same_reference'],[scope,'9'.repeat(32),'compared','different_reference'],
  ['global','global','compared','same_literal'],['global',scope,'insufficient','unknown'],[null,scope,'insufficient','unknown'],
])('compares actual extracted payload scope with both observations (%s/%s)',(payloadScope,tableScope,status,comparison)=>{
  const x=setup(),plan=x.send('prepare',1,prepareBody(undefined,undefined,undefined,payloadScope));if(plan.kind!=='prepare_ok')throw Error();
  const b={plan_id:1,payload_hash:plan.body.payload_hash,code_hash:plan.body.code_hash};x.send('observe_initial',1,{...b,observation:observation('initial',tableScope)});
  x.send('observe_final',1,{...b,observation:observation('final',tableScope)});
  expect(x.send('compare',1,{...b,compared_at:date(4)})).toMatchObject({kind:'compare_ok',body:{result:{status,comparison}}});x.engine.close();
});
it('withdraws comparison on final version changes and retains explicit final unavailability',()=>{
  for(const changed of [true,false]){
    const x=setup(),p=x.send('prepare',1,prepareBody());if(p.kind!=='prepare_ok')throw Error();const b={plan_id:1,payload_hash:p.body.payload_hash,code_hash:p.body.code_hash};
    x.send('observe_initial',1,{...b,observation:observation('initial')});
    x.send('observe_final',1,{...b,observation:changed?observation('final',scope,'2'):{source:'sys_db_object.current',visibility_scope:'caller_acl',phase:'final',observed_at:date(3),state:'unavailable',reason:'upstream_unavailable'}});
    expect(x.send('compare',1,{...b,compared_at:date(4)})).toMatchObject({kind:'compare_ok',body:{result:{status:changed?'changed':'insufficient',comparison:'unknown'}}});x.engine.close();
  }
});
it('keeps malformed payload rejection asset-local and never returns its text',()=>{
  const x=setup(),bad=prepareBody();bad.payload='PRIVATE_BROKEN_XML';const r=x.send('prepare',1,bad);
  expect(r).toMatchObject({kind:'error',body:{stage:'prepare',code:'invalid_xml'}});expect(JSON.stringify(r)).not.toContain('PRIVATE_BROKEN_XML');
  const next=prepareBody();next.target.update_xml_sys_id='7'.repeat(32);expect(x.send('prepare',2,next).kind).toBe('prepare_ok');x.engine.close();
});
it('does not hide a JavaScript parse failure behind unsupported_when',()=>{
  const x=setup();expect(x.send('prepare',1,prepareBody('PRIVATE_BROKEN(','after'))).toMatchObject({kind:'error',body:{stage:'prepare',code:'javascript_parse_failed'}});x.engine.close();
});
it('retains a comparison deadline rejection instead of generating a normal comparison',()=>{
  const x=setup(),p=x.send('prepare',1,prepareBody());if(p.kind!=='prepare_ok')throw Error();const b={plan_id:1,payload_hash:p.body.payload_hash,code_hash:p.body.code_hash};
  x.send('observe_initial',1,{...b,observation:observation('initial')});x.send('observe_final',1,{...b,observation:observation('final')});
  const wire=get(x.parent.begin('compare',1,{...b,compared_at:date(60000)})),reply=x.engine.handle(wire);
  expect(scopeResponseSchema.parse(JSON.parse(reply!))).toMatchObject({kind:'error',body:{stage:'compare',code:'comparison_deadline_exceeded'}});
  expect(x.engine.handle(wire)).toBeNull();
});
it('stops malformed/duplicate generations and does not reopen after close',()=>{
  const e=createFixtureScopeWorkerEngine();expect(e.handle('{PRIVATE_BAD_JSON')).toBeNull();expect(e.handle('{}')).toBeNull();
  const x=setup();const wire=get(x.parent.begin('prepare',1,prepareBody()));const json=JSON.parse(wire);json.worker_generation='9'.repeat(64);
  expect(JSON.stringify(x.engine.handle(JSON.stringify(json)))).not.toContain('PRIVATE');expect(x.engine.handle(wire)).toBeNull();
});
