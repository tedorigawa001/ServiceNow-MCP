import {expect,it,vi} from 'vitest';
import {Worker} from 'node:worker_threads';
import {FixtureScopeWorkerReview,fixtureScopeReviewSchema} from '../../src/review/abort-scope-evidence-worker-review.js';
import {FixtureAccountingSession} from '../../src/review/abort-scope-evidence-accounting-fixture.js';
import {createFakeSessionOwnerIssuer} from '../../src/review/abort-scope-evidence-session-fixture.js';
import {createFixtureFixedWebSource} from '../../src/review/abort-scope-evidence-fixed-web-source.js';
const date=(n:number)=>new Date(n).toISOString(),asset='a'.repeat(32),scope='c'.repeat(32);
function body(code='current.setAbortAction(true);'){
  return {target:{update_set_sys_id:'1'.repeat(32),update_xml_sys_id:'2'.repeat(32),asset_sys_id:asset},
    metadata:{name:`sys_script_${asset}`,action:'INSERT_OR_UPDATE' as const,sys_updated_on:'2026-10-26',sys_mod_count:'1'},instance_binding:'3'.repeat(64),
    payload:`<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${asset}</sys_id><when>before</when><collection>incident</collection><sys_scope>${scope}</sys_scope><script><![CDATA[${code}]]></script></sys_script></record_update>`,
    started_at:date(0),retrieved_at:date(1),deadline_ms:60000};
}
function obs(phase:'initial'|'final',mod='1'){
  return {source:'sys_db_object.current',visibility_scope:'caller_acl',phase,observed_at:date(phase==='initial'?2:3),state:'rows',
    rows:[{sys_id:'4'.repeat(32),name:'incident',sys_scope:'d'.repeat(32),sys_updated_on:'2026-10-26',sys_mod_count:mod}]};
}
function setup(){const start=performance.now();return new FixtureScopeWorkerReview({remainingMs:()=>60000-(performance.now()-start)});}
it('runs real worker IPC prepare/observations/compare and returns only the strict fixture result',async()=>{
  const x=setup();try{
    const p=await x.prepare(body('/* PRIVATE_SOURCE */ current.setAbortAction(true);'));expect(p).toMatchObject({job_id:1,state:'needs_observation',collection:'incident'});
    await x.observe(1,'initial',obs('initial'));await x.observe(1,'final',obs('final'));await x.compare(1,date(4));
    const result=await x.finish();expect(fixtureScopeReviewSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({synthetic:true,evidence_issuance:'disabled',review_status:'partial',analysis_complete:false,diagnostic:null,
      assets:[{state:'comparison_only',scope_difference_candidate_count:1,comparison:{status:'compared',comparison:'different_reference'}}]});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SOURCE|<!\[CDATA|run_nonce|worker_generation|payload_hash|code_hash|setAbortAction/);
    expect(fixtureScopeReviewSchema.safeParse({...result,analysis_complete:true}).success).toBe(false);
    expect(fixtureScopeReviewSchema.safeParse({...result,assets:[{...result.assets[0],scope_difference_candidate_count:0}]}).success).toBe(false);
    expect(fixtureScopeReviewSchema.safeParse({...result,diagnostic:{state:'stopped',stage:'owner',code:'authentication_failed',cleanup:'confirmed'}}).success).toBe(false);
    await expect(x.finish()).rejects.toThrow('invalid_state');
  }finally{await x.close();}
},15000);
it('returns not-needed and local malformed-XML rejection without evaluating source text',async()=>{
  const x=setup();try{
    await x.prepare(body('/* PRIVATE */ var x={setAbortAction:function(){throw 1;}}; x.setAbortAction(true);'));
    const b=body();b.target.update_xml_sys_id='5'.repeat(32);b.payload='PRIVATE_XML';await x.prepare(b);
    const result=await x.finish();expect(result.assets.map(a=>a.state)).toEqual(['not_needed','rejected']);expect(result.diagnostic).toBeNull();expect(JSON.stringify(result)).not.toContain('PRIVATE');
  }finally{await x.close();}
},15000);
it('keeps final changes unconfirmed and withdraws previous candidates when a later run stop occurs',async()=>{
  const x=setup();try{
    await x.prepare(body());await x.observe(1,'initial',obs('initial'));await x.observe(1,'final',obs('final','2'));await x.compare(1,date(4));
    x.stop('owner','authentication_failed');const result=await x.finish();
    expect(result).toMatchObject({diagnostic:{code:'authentication_failed',cleanup:'confirmed'},assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
  }finally{await x.close();}
},15000);
it('retains correlation failures and confirms worker termination before producing the stopped summary',async()=>{
  const x=setup();try{
    await x.prepare(body());await expect(x.observe(1,'final',obs('final'))).rejects.toThrow('evidence_binding_mismatch');
    const result=await x.finish();expect(result.diagnostic).toMatchObject({code:'evidence_binding_mismatch',cleanup:'confirmed'});expect(result.assets[0].state).toBe('not_completed');
  }finally{await x.close();}
},15000);
it('does not spawn a worker after cancellation and emits only a fixed diagnostic',async()=>{
  const controller=new AbortController();controller.abort();const x=new FixtureScopeWorkerReview({remainingMs:()=>60000,signal:controller.signal});
  try{await expect(x.prepare(body())).rejects.toThrow('cancelled');expect((await x.finish()).diagnostic).toMatchObject({code:'cancelled',cleanup:'not_started'});}finally{await x.close();}
});
it('classifies startup failure without leaking a factory exception',async()=>{
  const x=new FixtureScopeWorkerReview({remainingMs:()=>60000,factory(){throw Error('PRIVATE_STARTUP');}});
  try{await expect(x.prepare(body())).rejects.toThrow('worker_unavailable');expect(JSON.stringify(await x.finish())).not.toContain('PRIVATE_STARTUP');}finally{await x.close();}
});
it('interrupts a pending native worker and retains cancellation after termination',async()=>{
  const controller=new AbortController();let worker:Worker|undefined;
  const x=new FixtureScopeWorkerReview({remainingMs:()=>60000,signal:controller.signal,factory(_url,options){worker=new Worker('setInterval(()=>{},1000)',{...options,eval:true});return worker;}});
  try{const pending=x.prepare(body());controller.abort();await expect(pending).rejects.toThrow('cancelled');expect((await x.finish()).diagnostic).toMatchObject({code:'cancelled',cleanup:'confirmed'});expect(worker?.threadId).toBe(-1);}finally{await x.close();}
},15000);
it('rejects concurrent prepares without queuing another worker or reusing the pending job',async()=>{
  const x=setup();try{
    const first=x.prepare(body()),next=body();next.target.update_xml_sys_id='6'.repeat(32);
    const second=x.prepare(next);await expect(second).rejects.toThrow('invalid_state');await expect(first).rejects.toThrow('invalid_state');
    const result=await x.finish();expect(result.assets).toHaveLength(1);expect(result.diagnostic).toMatchObject({code:'invalid_state',cleanup:'confirmed'});
  }finally{await x.close();}
},15000);
it('normalizes a remaining-budget callback failure without exposing its exception',async()=>{
  const x=new FixtureScopeWorkerReview({remainingMs(){throw Error('PRIVATE_CLOCK');}});
  try{await expect(x.prepare(body())).rejects.toThrow('internal_review_error');expect(JSON.stringify(await x.finish())).not.toContain('PRIVATE_CLOCK');}finally{await x.close();}
});
it('connects fixed source reads and one-shot observation delivery to the native worker and upper result',async()=>{
  const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
  const session=new FixtureAccountingSession(),x=setup();await session.baseline('{}',()=>{});
  const issuer=createFakeSessionOwnerIssuer(),s=get(issuer.source(session,{parent_ready:true,final_started:false,release_match:'matched'})),owner=get(issuer.claim(session,s.source,s.permit));
  let c=1,g=2;const input=body(),source=get(createFixtureFixedWebSource(session,owner,input.target.update_set_sys_id,r=>{
    c++;const text=JSON.stringify({result:r.purpose.startsWith('parent')?[{sys_id:input.target.update_set_sys_id,sys_updated_on:'2026-10-26',sys_mod_count:'1'}]:r.purpose.startsWith('metadata')?[]:
      [{sys_id:'4'.repeat(32),name:'incident',sys_scope:'d'.repeat(32),sys_updated_on:'2026-10-26',sys_mod_count:'1',script:'PRIVATE_UNUSED'}]});g+=Buffer.byteLength(text);return new Response(text);
  }));
  try{
    get(await source.prepare());const plan=await x.prepare(input);expect(plan.collection).toBe('incident');
    get(await source.initial(plan.collection!));expect(get(await source.finalize()).state).toBe('stable');
    const pair=get(source.consumeObservations(plan.collection!));
    await x.observe(plan.job_id,'initial',pair.initial);await x.observe(plan.job_id,'final',pair.final);
    await x.compare(plan.job_id,new Date(Date.parse(pair.final.observed_at)+1).toISOString());
    const result=await x.finish();expect(result.assets[0].scope_difference_candidate_count).toBe(1);expect(result.evidence_issuance).toBe('disabled');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_UNUSED');expect(source.stats()).toMatchObject({requests:c,received_bytes:g,reserved:0});
    expect(source.consumeObservations(plan.collection!).ok).toBe(false);
  }finally{source.close();session.close();await x.close();}
},15000);
it.each([null,'authentication_failed'] as const)('keeps cleanup uncertainty and withdraws candidates with primary %s',async primary=>{
  let left=60000,native:Worker|undefined,terminate:(()=>Promise<number>)|undefined,mock:ReturnType<typeof vi.spyOn>|undefined;
  const x=new FixtureScopeWorkerReview({remainingMs:()=>left,factory(url,options){native=new Worker(url,options);terminate=native.terminate.bind(native);return native;}});
  try{
    await x.prepare(body());await x.observe(1,'initial',obs('initial'));await x.observe(1,'final',obs('final'));await x.compare(1,date(4));
    mock=vi.spyOn(native!,'terminate').mockImplementation(()=>new Promise<number>(()=>{}));left=20;
    if(primary)x.stop('owner',primary);const result=await x.finish();
    expect(result).toMatchObject({diagnostic:{code:primary??'internal_review_error',cleanup:'unconfirmed'},assets:[{state:'not_completed',comparison:null,scope_difference_candidate_count:0}]});
    expect(mock).toHaveBeenCalledTimes(1);
  }finally{mock?.mockRestore();await terminate?.();await x.close();}
},15000);
