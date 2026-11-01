import {expect,it} from 'vitest';
import {createSyntheticWorkerJobIssuer,type SyntheticJobBinding} from '../support/review/synthetic-worker-job.js';
const S='2026-11-01T00:00:00.000Z',O='2026-11-01T00:00:01.000Z',T='2026-11-01T00:00:02.000Z',id='a'.repeat(32),asset='b'.repeat(32);
const seed=():SyntheticJobBinding=>Object.freeze({run:{},session:{},source:{},key:{},origin:{},budget:{},update_set_sys_id:id,started_at:S,deadline_ms:60000,observed_at:O});
it('binds one synthetic run to a generation and marks that generation ready',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),g=issuer.startGeneration(b,{},{});issuer.ready(b,g);
  expect(issuer.inspect()).toMatchObject({state:'active',generation_status:'ready'});
});
it('spends the run binding once and refuses a foreign or copied binding',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s);issuer.bind(s);
  expect(()=>issuer.bind(s)).toThrow('internal_review_error');expect(issuer.inspect().state).toBe('failed');
  const other=createSyntheticWorkerJobIssuer(s);expect(()=>other.bind({...s})).toThrow('internal_review_error');
});
it('retains a pre-ready input claim and consumes an analyze job in the same synthetic generation',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),input=issuer.input(b,{},asset,T),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);
  issuer.ready(b,g);const job=issuer.analyze(b,g,input,2);
  expect(issuer.consume(b,job,{generation:g,supervisor,worker,id:2,kind:'analyze',update_xml_sys_id:asset})).toMatchObject({scope:'synthetic_job_consumption',kind:'analyze',authority:'none'});
  expect(issuer.inspect()).toMatchObject({jobs_issued:1,jobs_consumed:1,pending:false,inputs_retained:1});
});
it('claims an input origin only once, even when the caller supplies a new target or UTC',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),origin={};issuer.input(b,origin,asset,T);
  expect(()=>issuer.input(b,origin,'c'.repeat(32),'2026-11-01T00:00:03.000Z')).toThrow('internal_review_error');
  expect(issuer.inspect()).toMatchObject({state:'failed',inputs_retained:0,pending:false});
});
it('issues one finish job for zero inputs and never reuses that finish claim',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);
  const job=issuer.finish(b,g,2);
  expect(issuer.consume(b,job,{generation:g,supervisor,worker,id:2,kind:'finish'})).toMatchObject({scope:'synthetic_job_consumption',kind:'finish',authority:'none'});
  expect(()=>issuer.finish(b,g,3)).toThrow('internal_review_error');
});
it('requires generation close confirmation before a fresh synthetic generation can start',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),g=issuer.startGeneration(b,{},{});issuer.ready(b,g);
  issuer.closeGeneration(b,g);expect(issuer.inspect().generation_status).toBe('closing');issuer.confirmClosed(b,g);
  expect(issuer.inspect().generation_status).toBe('closed');const next=issuer.startGeneration(b,{},{});issuer.ready(b,next);
  expect(issuer.inspect()).toMatchObject({generation_status:'ready',generations_started:2});
});
it('synchronously revokes every claim, keeps the first diagnostic and cannot restart',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),input=issuer.input(b,{},asset,T),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);const job=issuer.analyze(b,g,input,2);
  issuer.revoke('cancelled');expect(issuer.inspect()).toMatchObject({state:'failed',pending:false,inputs_retained:0,diagnostic:{code:'cancelled'}});
  issuer.revoke('deadline_exceeded');expect(()=>issuer.consume(b,job,{generation:g,supervisor,worker,id:2,kind:'analyze',update_xml_sys_id:asset})).toThrow('cancelled');
});
it('allows only an already-issued reply after source close, then releases all identities at terminal close',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);const job=issuer.finish(b,g,2);
  issuer.closeSource(b);expect(issuer.inspect()).toMatchObject({source_closed:true,pending:true});
  issuer.consume(b,job,{generation:g,supervisor,worker,id:2,kind:'finish'});issuer.closeGeneration(b,g);issuer.confirmClosed(b,g);issuer.close(b);
  expect(issuer.inspect()).toMatchObject({state:'closed',pending:false,inputs_retained:0,held_time:null,diagnostic:null});
  expect(()=>issuer.bind(s)).toThrow('internal_review_error');issuer.revoke('cancelled');expect(issuer.inspect()).toMatchObject({state:'closed',diagnostic:null});
});
it('claims the pending slot before an injected guard and removes it before response guards',()=>{
  const s=seed();let armed=false;const seen:boolean[]=[];
  const issuer=createSyntheticWorkerJobIssuer(s,()=>{if(armed)seen.push(issuer.inspect().pending);return undefined;}),b=issuer.bind(s),input=issuer.input(b,{},asset,T),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);
  armed=true;const job=issuer.analyze(b,g,input,2);expect(seen).toEqual([true,true]);seen.length=0;
  issuer.consume(b,job,{generation:g,supervisor,worker,id:2,kind:'analyze',update_xml_sys_id:asset});expect(seen).toEqual([false,false]);
});
it('rejects reply accessors without executing them',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);const job=issuer.finish(b,g,2);let calls=0;
  const reply={get generation(){calls++;return g;},supervisor,worker,id:2,kind:'finish' as const};
  expect(()=>issuer.consume(b,job,reply)).toThrow('internal_review_error');expect(calls).toBe(0);
});
function fixture(){
  const s={...seed()};let action:()=>string|undefined=()=>undefined;
  const issuer=createSyntheticWorkerJobIssuer(s,()=>action()),b=issuer.bind(s),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);
  const input=issuer.input(b,{},asset,T);
  const reply=(jobId=2)=>({generation:g,supervisor,worker,id:jobId,kind:'analyze' as const,update_xml_sys_id:asset});
  return {s,issuer,b,supervisor,worker,g,input,reply,arm:(fn:()=>string|undefined)=>{action=fn;},job:()=>issuer.analyze(b,g,input,2)};
}
function pipeline(check:(issuer:ReturnType<typeof createSyntheticWorkerJobIssuer>)=>string|undefined){
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s,()=>check(issuer));
  return {s,issuer,run:()=>{
    const b=issuer.bind(s),input=issuer.input(b,{},asset,T),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);
    const a=issuer.analyze(b,g,input,2);issuer.consume(b,a,{generation:g,supervisor,worker,id:2,kind:'analyze',update_xml_sys_id:asset});
    const f=issuer.finish(b,g,3);issuer.closeSource(b);issuer.consume(b,f,{generation:g,supervisor,worker,id:3,kind:'finish'});
    issuer.closeGeneration(b,g);issuer.confirmClosed(b,g);issuer.close(b);
  }};
}
it.each(Array.from({length:24},(_,i)=>i+1))('keeps the first stop at lifecycle guard %i and invalidates all handles',at=>{
  let n=0;const code=['cancelled','deadline_exceeded','worker_unavailable'][at%3],p=pipeline(()=>++n===at?code:undefined);
  expect(p.run).toThrow(code);expect(p.issuer.inspect()).toMatchObject({state:'failed',pending:false,inputs_retained:0,held_time:null,diagnostic:{code}});
  expect(()=>p.issuer.bind(p.s)).toThrow(code);
});
it.each(Array.from({length:24},(_,i)=>i+1))('rejects caught reentry at lifecycle guard %i',at=>{
  let n=0;const p=pipeline(issuer=>{if(++n===at){try{issuer.bind(seed());}catch{}}return undefined;});
  expect(p.run).toThrow('internal_review_error');expect(p.issuer.inspect()).toMatchObject({state:'failed',pending:false,held_time:null});
});
it.each(Array.from({length:24},(_,i)=>i+1))('observes synchronous revoke at lifecycle guard %i even if the guard returns',at=>{
  let n=0;const p=pipeline(issuer=>{if(++n===at)issuer.revoke('cancelled');return undefined;});
  expect(p.run).toThrow('cancelled');expect(p.issuer.inspect()).toMatchObject({state:'failed',diagnostic:{code:'cancelled'},pending:false});
});
it.each(['generation','supervisor','worker','id','kind','update_xml_sys_id'] as const)('refuses a foreign reply %s and leaves another issuer untouched',field=>{
  const f=fixture(),other=fixture(),job=f.job(),otherJob=other.job(),reply={...f.reply(),[field]:field==='id'?3:field==='kind'?'finish':field==='update_xml_sys_id'?'c'.repeat(32):{}};
  expect(()=>f.issuer.consume(f.b,job,reply)).toThrow('internal_review_error');
  other.issuer.consume(other.b,otherJob,other.reply());expect(other.issuer.inspect().state).toBe('active');
});
it.each(['binding','generation','input','job'] as const)('rejects cloned %s claims without trusting their data shape',field=>{
  const f=fixture();
  if(field==='binding')expect(()=>f.issuer.input(structuredClone(f.b),{},'c'.repeat(32),T)).toThrow('internal_review_error');
  if(field==='generation')expect(()=>f.issuer.analyze(f.b,structuredClone(f.g),f.input,2)).toThrow('internal_review_error');
  if(field==='input')expect(()=>f.issuer.analyze(f.b,f.g,structuredClone(f.input),2)).toThrow('internal_review_error');
  if(field==='job'){const job=f.job();expect(()=>f.issuer.consume(f.b,structuredClone(job),f.reply())).toThrow('internal_review_error');}
  expect(f.issuer.inspect()).toMatchObject({state:'failed',inputs_retained:0,pending:false});
});
it.each(['input','job','generation'] as const)('rejects another issuer\'s %s claim without consuming it there',field=>{
  const f=fixture(),g=fixture();
  if(field==='input')expect(()=>f.issuer.analyze(f.b,f.g,g.input,2)).toThrow('internal_review_error');
  if(field==='generation')expect(()=>f.issuer.analyze(f.b,g.g,f.input,2)).toThrow('internal_review_error');
  if(field==='job'){f.job();const job=g.job();expect(()=>f.issuer.consume(f.b,job,f.reply())).toThrow('internal_review_error');g.issuer.consume(g.b,job,g.reply());}
  else g.issuer.consume(g.b,g.job(),g.reply());
  expect(g.issuer.inspect()).toMatchObject({state:'active',jobs_consumed:1});
});
it.each([0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('refuses invalid job id %s before publishing a claim',value=>{
  const f=fixture();expect(()=>f.issuer.analyze(f.b,f.g,f.input,value)).toThrow('internal_review_error');expect(f.issuer.inspect()).toMatchObject({jobs_issued:0,pending:false});
});
it('refuses id reuse and cannot wrap after the largest safe integer',()=>{
  const f=fixture(),job=f.issuer.analyze(f.b,f.g,f.input,Number.MAX_SAFE_INTEGER);f.issuer.consume(f.b,job,f.reply(Number.MAX_SAFE_INTEGER));
  expect(()=>f.issuer.finish(f.b,f.g,Number.MAX_SAFE_INTEGER+1)).toThrow('internal_review_error');
  const g=fixture();g.issuer.consume(g.b,g.job(),g.reply());expect(()=>g.issuer.finish(g.b,g.g,2)).toThrow('internal_review_error');
});
it('does not confuse the same numeric id in a fresh generation with an old reply',()=>{
  const f=fixture();f.issuer.consume(f.b,f.job(),f.reply());f.issuer.closeGeneration(f.b,f.g);f.issuer.confirmClosed(f.b,f.g);
  const supervisor={},worker={},next=f.issuer.startGeneration(f.b,supervisor,worker);f.issuer.ready(f.b,next);const job=f.issuer.finish(f.b,next,2);
  expect(()=>f.issuer.consume(f.b,job,{generation:f.g,supervisor:f.supervisor,worker:f.worker,id:2,kind:'finish'})).toThrow('internal_review_error');
});
it.each(['ready','input','consume','closeGeneration','confirmClosed'] as const)('refuses duplicate %s or invalid order',method=>{
  const f=fixture();
  if(method==='ready')expect(()=>f.issuer.ready(f.b,f.g)).toThrow('internal_review_error');
  if(method==='input'){const job=f.job();f.issuer.consume(f.b,job,f.reply());expect(()=>f.issuer.analyze(f.b,f.g,f.input,3)).toThrow('internal_review_error');}
  if(method==='consume'){const job=f.job();f.issuer.consume(f.b,job,f.reply());expect(()=>f.issuer.consume(f.b,job,f.reply())).toThrow('internal_review_error');}
  if(method==='closeGeneration'){f.issuer.closeGeneration(f.b,f.g);expect(()=>f.issuer.closeGeneration(f.b,f.g)).toThrow('internal_review_error');}
  if(method==='confirmClosed')expect(()=>f.issuer.confirmClosed(f.b,f.g)).toThrow('internal_review_error');
});
it.each(['run','session','source','key','origin','budget','update_set_sys_id','started_at','deadline_ms','observed_at'] as const)('pins %s and rejects a changed original binding',field=>{
  const f=fixture();Object.assign(f.s,{[field]:field==='deadline_ms'?15000:field==='update_set_sys_id'?'c'.repeat(32):field==='started_at'||field==='observed_at'?T:{}});
  expect(f.job).toThrow('internal_review_error');expect(f.issuer.inspect()).toMatchObject({state:'failed',held_time:null});
});
it.each(['input','analyze','finish','generation','ready'] as const)('does not start %s after ordinary source release',operation=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s);
  if(operation==='input'){issuer.closeSource(b);expect(()=>issuer.input(b,{},asset,T)).toThrow('internal_review_error');}
  else if(operation==='generation'){issuer.closeSource(b);expect(()=>issuer.startGeneration(b,{},{})).toThrow('internal_review_error');}
  else{const g=issuer.startGeneration(b,{},{});if(operation!=='ready')issuer.ready(b,g);const input=issuer.input(b,{},asset,T);issuer.closeSource(b);
    if(operation==='ready')expect(()=>issuer.ready(b,g)).toThrow('internal_review_error');
    if(operation==='analyze')expect(()=>issuer.analyze(b,g,input,2)).toThrow('internal_review_error');
    if(operation==='finish')expect(()=>issuer.finish(b,g,2)).toThrow('internal_review_error');
  }
  expect(issuer.inspect()).toMatchObject({state:'failed',inputs_retained:0,pending:false});
});
it.each(['start','confirm','close_run'])('does not infer generation termination from %s',operation=>{
  const f=fixture();f.issuer.closeGeneration(f.b,f.g);
  if(operation==='start')expect(()=>f.issuer.startGeneration(f.b,{},{})).toThrow('internal_review_error');
  if(operation==='confirm'){f.issuer.confirmClosed(f.b,f.g);expect(()=>f.issuer.confirmClosed(f.b,f.g)).toThrow('internal_review_error');}
  if(operation==='close_run')expect(()=>f.issuer.close(f.b)).toThrow('internal_review_error');
});
it('does not close a generation with a pending job, or issue overlapping jobs',()=>{
  const f=fixture();f.job();expect(()=>f.issuer.closeGeneration(f.b,f.g)).toThrow('internal_review_error');
  const g=fixture();g.job();expect(()=>g.issuer.finish(g.b,g.g,3)).toThrow('internal_review_error');
});
it('does not reuse a closed worker identity or exceed two synthetic generation slots',()=>{
  const f=fixture();f.issuer.closeGeneration(f.b,f.g);f.issuer.confirmClosed(f.b,f.g);
  expect(()=>f.issuer.startGeneration(f.b,{},f.worker)).toThrow('internal_review_error');
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s);
  for(let i=0;i<2;i++){const g=issuer.startGeneration(b,{},{});issuer.ready(b,g);issuer.closeGeneration(b,g);issuer.confirmClosed(b,g);}
  expect(()=>issuer.startGeneration(b,{},{})).toThrow('internal_review_error');
});
it('uses bounded synthetic input/job slots against an independent event count',()=>{
  const s=seed();let guards=0;const issuer=createSyntheticWorkerJobIssuer(s,()=>{guards++;return undefined;}),b=issuer.bind(s),supervisor={},worker={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);
  let issued=0,consumed=0;
  for(let i=0;i<100;i++){
    const target=i.toString(16).padStart(32,'0'),input=issuer.input(b,{},target,T),job=issuer.analyze(b,g,input,i+2);issued++;
    issuer.consume(b,job,{generation:g,supervisor,worker,id:i+2,kind:'analyze',update_xml_sys_id:target});consumed++;
  }
  const finish=issuer.finish(b,g,102);issued++;issuer.consume(b,finish,{generation:g,supervisor,worker,id:102,kind:'finish'});consumed++;
  expect(issuer.inspect()).toMatchObject({inputs_retained:100,jobs_issued:issued,jobs_consumed:consumed,pending:false});expect(issued).toBe(101);
  // bind/start/ready = 3 operations, 300 input/analyze/consume, finish/consume = 2; pre + post each.
  expect(guards).toBe((3+300+2)*2);
});
it('refuses the 101st input before publishing it and releases the retained slots',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s);
  for(let i=0;i<100;i++)issuer.input(b,{},i.toString(16).padStart(32,'0'),T);
  expect(()=>issuer.input(b,{},'f'.repeat(32),T)).toThrow('internal_review_error');expect(issuer.inspect()).toMatchObject({inputs_retained:0,state:'failed'});
});
it.each(['2026-11-01T00:00:00.999Z','2026-11-01T00:01:00.001Z','2026-02-30T00:00:00.000Z','PRIVATE_BAD_UTC'])('refuses input UTC outside fixed O/S/L bounds: %s',time=>{
  const f=fixture();expect(()=>f.issuer.input(f.b,{},'c'.repeat(32),time)).toThrow('internal_review_error');expect(f.issuer.inspect().held_time).toBeNull();
});
it.each([O,'2026-11-01T00:01:00.000Z'])('accepts fixed UTC equality %s without a new clock or U claim',time=>{
  const f=fixture();f.issuer.input(f.b,{},'c'.repeat(32),time);expect(f.issuer.inspect().held_time).toEqual({started_at:S,deadline_ms:60000,observed_at:O});
});
it.each([0,-1,NaN,Infinity,60001,1.5])('rejects invalid full L %s',deadline_ms=>{
  const s={...seed(),deadline_ms},issuer=createSyntheticWorkerJobIssuer(s);expect(()=>issuer.bind(s)).toThrow('internal_review_error');
});
it.each(['observed_before','observed_after','bad_start','bad_target','primitive_identity','accessor','proxy'] as const)('rejects malformed binding %s without executing accessors',fault=>{
  const s={...seed()};let calls=0;
  if(fault==='observed_before')s.observed_at='2026-10-31T23:59:59.999Z';
  if(fault==='observed_after')s.observed_at='2026-11-01T00:01:00.001Z';
  if(fault==='bad_start')s.started_at='PRIVATE_BAD_START';
  if(fault==='bad_target')s.update_set_sys_id='PRIVATE_BAD_ID';
  if(fault==='primitive_identity')Object.assign(s,{budget:1});
  if(fault==='accessor')Object.defineProperty(s,'origin',{get(){calls++;return {};}});
  const raw=fault==='proxy'?new Proxy(s,{ownKeys(){calls++;return Reflect.ownKeys(s);}}):s,issuer=createSyntheticWorkerJobIssuer(raw);
  expect(()=>issuer.bind(raw)).toThrow('internal_review_error');expect(calls).toBe(0);
});
it.each(['throw','proxy_error','unknown_code'] as const)('normalizes guard %s without raw exception diagnostics',fault=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s,()=>{
    if(fault==='throw')throw Error('PRIVATE_ERROR');
    if(fault==='proxy_error')throw new Proxy({}, {getOwnPropertyDescriptor(){throw Error('PRIVATE_TRAP');}});
    return 'PRIVATE_UNKNOWN_CODE';
  });
  expect(()=>issuer.bind(s)).toThrow('internal_review_error');expect(JSON.stringify(issuer.inspect())).not.toContain('PRIVATE');
});
it('does not invoke worker operations or elevate its frozen data summary into claims',()=>{
  const s=seed(),issuer=createSyntheticWorkerJobIssuer(s),b=issuer.bind(s);let calls=0;const worker={get terminate(){calls++;return ()=>{};}},supervisor={},g=issuer.startGeneration(b,supervisor,worker);issuer.ready(b,g);
  const job=issuer.finish(b,g,2),data=issuer.consume(b,job,{generation:g,supervisor,worker,id:2,kind:'finish'});expect(Object.isFrozen(data)).toBe(true);expect(Object.keys(job)).toEqual([]);
  issuer.closeGeneration(b,g);issuer.confirmClosed(b,g);issuer.close(b);expect(calls).toBe(0);
  expect(()=>issuer.consume(b,data,{generation:g,supervisor,worker,id:2,kind:'finish'})).toThrow('internal_review_error');expect(issuer.inspect()).toMatchObject({state:'closed',diagnostic:null,permissions:{formal_issuance:false,dispatch:false,source_acceptance:false}});
});
