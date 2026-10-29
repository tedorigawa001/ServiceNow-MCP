import {expect,it,vi} from 'vitest';
import {createInjectedClosedParentResponseReader} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
import {createFakeClosedBodyGate} from '../../src/review/abort-scope-evidence-closed-body-gate.js';
const id='a'.repeat(32),row=()=>({sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-29 00:00:00',sys_mod_count:'3'});
const bytes=(value=row())=>new TextEncoder().encode(JSON.stringify({result:value}));
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const j={deadline,wake};jobs.add(j);return ()=>{jobs.delete(j);};},advance(n:number){now=n;for(const j of [...jobs])if(j.deadline<=now){jobs.delete(j);j.wake();}},pending:()=>jobs.size};}
it('binds the CD-03 private parent owner to initial acceptance and the reserved final slot',async()=>{
  const c=clock(),run=createInjectedClosedParentResponseReader(c,()=>new Response(bytes()),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));
  expect(run.status().body).toMatchObject({parent:{ok:true,value:{state:'initial_observed',snapshots_accepted:1,retained_records:1}}});
  const final=get(run.final());get(await run.read(final));
  expect(run.status()).toMatchObject({requests:2,reserved:2,primary:null,body:{parent:{ok:true,value:{state:'stable_observation',retained_records:0,comparisons_committed:1}}},slots:[{kind:'parent',state:'done',remaining:0},{kind:'metadata',state:'idle',remaining:2}]});
  expect(c.pending()).toBe(0);
});
function manual(){const c=clock(),gate=createFakeClosedBodyGate(c,{dispatch(){}},id),s=get(gate.construct({accounting:{body_mode:'bytes',attempt_policy:{}}})),r=get(gate.claimRun(s)),t=get(gate.claimTransport(s,r)),port=get(gate.claimAccounting(s,r,t)),body=port.body!;
  let attempt:Parameters<typeof port.acknowledgeParent>[0];
  const capture=(p:Parameters<typeof port.dispatch>[0])=>{const a=get(port.dispatch(p));attempt=a;get(body.append(a,0,bytes()));return get(body.finish(a,{outcome:'success',eof:true,pending_read:false,cancel:'not_requested',closed:'fulfilled',lock:'released'})).candidate!;};
  return {c,gate,port,body,capture,attempt:()=>attempt};}
it('keeps an accepted baseline alive across ordinary-close refusal and uses the original final reservation',()=>{
  const s=manual();get(s.body.consume(s.capture(get(s.port.openPurpose({kind:'parent_initial'})))));s.c.advance(50000);
  expect(s.port.openPurpose({kind:'release_rows'})).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(s.gate.diagnostic().primary).toBeNull();
  expect(s.body.diagnostic()).toMatchObject({parent:{ok:true,value:{state:'initial_observed',live:true,retained_records:1}}});
  get(s.port.enterFinal());get(s.body.consume(s.capture(get(s.port.openFinal(s.port.parentFinal)))));
  expect(s.body.diagnostic()).toMatchObject({parent:{ok:true,value:{state:'stable_observation',retained_records:0}}});expect(s.port.stats()).toMatchObject({requests:2,reserved:2,ordinary_closed:true});
});
it('requires an accepted private snapshot, not just transport success, before opening the final parent slot',()=>{
  const s=manual(),candidate=s.capture(get(s.port.openPurpose({kind:'parent_initial'})));get(s.body.discard(candidate));get(s.port.enterFinal());
  expect(s.port.openFinal(s.port.parentFinal)).toEqual({ok:false,code:'invalid_state'});expect(s.port.stats().requests).toBe(1);
});
it('stops and clears the baseline after final HTTP retries are exhausted without spending a third attempt',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>++calls===1?new Response(bytes()):new Response(null,{status:503}),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));const final=get(run.final());expect(await run.read(final)).toEqual({ok:false,code:'upstream_unavailable'});
  expect(await run.read(final)).toEqual({ok:false,code:'upstream_unavailable'});
  expect(run.status()).toMatchObject({requests:3,primary:{code:'upstream_unavailable'},body:{parent:{ok:true,value:{retained_records:0,live:false,comparisons_committed:0}}}});
  expect(await run.read(final)).toEqual({ok:false,code:'upstream_unavailable'});expect(calls).toBe(3);
});
it.each(Array.from({length:15},(_,i)=>i+1))('keeps changed_during_review for changed-field mask %i and does not rebase or re-read',async mask=>{
  const initial=row(),final=row(),fields=['state','application','sys_updated_on','sys_mod_count'] as const,values=['complete','different','2026-10-30 00:00:00','4'],expected:string[]=[];
  for(let i=0;i<fields.length;i++)if(mask&(1<<i)){final[fields[i]]=values[i];expected.push(fields[i]);}
  const c=clock();let calls=0;const run=createInjectedClosedParentResponseReader(c,()=>new Response(bytes(++calls===1?initial:final)),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));const h=get(run.final());expect(await run.read(h)).toEqual({ok:false,code:'changed_during_review'});
  expect(run.status()).toMatchObject({primary:{code:'changed_during_review'},requests:2,reserved:0,phase:'stopped',cleanup:{disposition:'confirmed',kind:'eof'},body:{parent:{ok:true,value:{state:'changed',changed_fields:expected,retained_records:0,field_comparisons:5,comparisons_committed:1}}}});
  run.close();expect(await run.read(h)).toEqual({ok:false,code:'changed_during_review'});expect(run.status().body?.parent).toMatchObject({value:{state:'changed',changed_fields:expected}});expect(calls).toBe(2);expect(c.pending()).toBe(0);
});
it('compares semantic fields rather than byte hashes, JSON formatting or key order',async()=>{
  const value=row(),responses=[JSON.stringify({result:value}),JSON.stringify({result:Object.fromEntries(Object.entries(value).reverse())},null,2)];
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>new Response(responses[calls++]),{update_set_sys_id:id});
  const a=get(await run.read(get(run.initial()))),b=get(await run.read(get(run.final())));expect(a.sha256).not.toBe(b.sha256);
  expect(run.status().body?.parent).toMatchObject({value:{state:'stable_observation',field_comparisons:5}});
});
it('retains the same baseline through a CD-04 retry and consumes only the existing final slot',async()=>{
  const c=clock(),seen:{purpose:string;ordinal:number;auth:object;url:string}[]=[];
  const run=createInjectedClosedParentResponseReader(c,(r,_s,auth)=>{seen.push({...r,auth});return seen.length===2?new Response(null,{status:429}):new Response(bytes());},{update_set_sys_id:id});
  get(await run.read(get(run.initial())));const f=get(run.final());expect(await run.read(f)).toEqual({ok:false,code:'upstream_unavailable'});
  expect(run.status()).toMatchObject({requests:2,reserved:3,primary:null,body:{parent:{value:{state:'initial_observed',snapshots_accepted:1,retained_records:1,comparisons_prepared:0}}}});
  get(await run.read(f));expect(run.status()).toMatchObject({requests:3,reserved:2,body:{parent:{value:{state:'stable_observation',snapshots_accepted:1,drafts_issued:2,comparisons_committed:1,retained_records:0}}}});
  expect(seen.map(x=>[x.purpose,x.ordinal])).toEqual([['parent_initial',1],['parent_final',1],['parent_final',2]]);expect(seen.every(x=>x.auth===seen[0].auth&&x.url===seen[0].url)).toBe(true);expect(c.pending()).toBe(0);
});
it.each(['cancel','close'] as const)('synchronously revokes the baseline on %s between initial and final with no extra dispatch',async method=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return new Response(bytes());},{update_set_sys_id:id});get(await run.read(get(run.initial())));
  run[method]();expect(run.status()).toMatchObject({primary:{code:method==='cancel'?'cancelled':'closed'},reserved:0,body:{parent:{value:{live:false,retained_records:0}}}});
  expect(run.final()).toEqual({ok:false,code:method==='cancel'?'cancelled':'closed'});expect(calls).toBe(1);
});
it('uses the original 55-second final-phase cutoff, not a new owner or comparison deadline',async()=>{
  const c=clock();let calls=0;const run=createInjectedClosedParentResponseReader(c,()=>{calls++;return new Response(bytes());},{update_set_sys_id:id});get(await run.read(get(run.initial())));c.advance(55000);
  expect(run.final()).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(run.status()).toMatchObject({requests:1,primary:{code:'phase_deadline_exceeded'},body:{parent:{value:{retained_records:0,comparisons_committed:0}}}});expect(calls).toBe(1);
});
it('does not publish the initial snapshot when parse crosses its captured attempt cutoff',async()=>{
  const c=clock();let run:ReturnType<typeof createInjectedClosedParentResponseReader>|undefined,armed=false;
  run=createInjectedClosedParentResponseReader({...c,now(){if(armed&&run?.status().body?.parent?.ok&&run.status().body?.parent?.value.drafts_issued===1)c.advance(50000);return c.now();}},()=>new Response(bytes()),{update_set_sys_id:id});
  const h=get(run.initial());c.advance(49990);armed=true;expect(await run.read(h)).toEqual({ok:false,code:'attempt_deadline_exceeded'});
  expect(run.status()).toMatchObject({primary:{code:'attempt_deadline_exceeded'},requests:1,cleanup:{disposition:'confirmed',kind:'eof'},body:{parent:{value:{snapshots_accepted:0,retained_records:0}}}});expect(c.pending()).toBe(0);
});
it.each(['cancel','deadline'] as const)('does not commit stable/changed after %s at the final comparison post-guard',async mode=>{
  const c=clock();let run:ReturnType<typeof createInjectedClosedParentResponseReader>|undefined,observations=0,calls=0;
  run=createInjectedClosedParentResponseReader({...c,now(){const p=run?.status().body?.parent;if(p?.ok&&p.value.comparisons_prepared===1&&++observations===2){if(mode==='cancel')run!.cancel();else c.advance(55000);}return c.now();}},()=>new Response(bytes({...row(),state:++calls===1?'in progress':'different'})),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));expect(await run.read(get(run.final()))).toEqual({ok:false,code:mode==='cancel'?'cancelled':'phase_deadline_exceeded'});
  expect(run.status()).toMatchObject({body:{parent:{value:{retained_records:0,comparisons_prepared:1,comparisons_committed:0,changed_fields:[]}}}});expect(c.pending()).toBe(0);
});
it('rejects a foreign final request before dispatch and leaves the issuing owner untouched',async()=>{
  const a=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes()),{update_set_sys_id:id}),b=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes()),{update_set_sys_id:id});
  get(await a.read(get(a.initial())));get(await b.read(get(b.initial())));const f=get(a.final()),before=a.status();
  expect(await b.read(f)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(b.status()).toMatchObject({requests:1,body:{parent:{value:{retained_records:0}}}});expect(a.status()).toEqual(before);get(await a.read(f));
});
it('can skip a discarded parent body but cannot promote it from transport success to a private snapshot',()=>{
  const s=manual(),candidate=s.capture(get(s.port.openPurpose({kind:'parent_initial'})));get(s.body.discard(candidate));get(s.port.enterFinal());get(s.port.skipFinal(s.port.parentFinal));
  expect(s.port.stats()).toMatchObject({requests:1,reserved:2,slots:[{kind:'parent',state:'skipped',skip_reason:'initial_unavailable'},{kind:'metadata',state:'idle'}]});expect(s.body.diagnostic().parent).toMatchObject({value:{snapshots_accepted:0}});
});
it('keeps private values out of public summaries and diagnostics without calling global fetch',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
  try{const value={...row(),state:'PRIVATE_STATE_SENTINEL'},run=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes(value)),{update_set_sys_id:id});const a=get(await run.read(get(run.initial()))),b=get(await run.read(get(run.final())));
    const serialized=JSON.stringify({a,b,status:run.status()});for(const text of Object.values(value))expect(serialized).not.toContain(JSON.stringify(text));expect(serialized).not.toContain('closed-dispatch.invalid');expect(fetch).not.toHaveBeenCalled();
  }finally{fetch.mockRestore();}
});
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
it('revokes the baseline on unconfirmed final cleanup and never repairs the observation from late cancellation',async()=>{
  const c=clock();let calls=0,finish!:()=>void;
  const run=createInjectedClosedParentResponseReader(c,()=>++calls===1?new Response(bytes()):new Response(new ReadableStream({cancel:()=>new Promise<void>(resolve=>{finish=resolve;})})),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));const f=get(run.final()),work=run.read(f);await flush();c.advance(9750);await flush();c.advance(10000);
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});const before=run.status();expect(before).toMatchObject({primary:{code:'cleanup_unconfirmed'},cleanup:{disposition:'unconfirmed'},body:{parent:{value:{retained_records:0,comparisons_committed:0}}}});
  finish();await flush();expect(run.status()).toEqual(before);expect(await run.read(f)).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(calls).toBe(2);expect(c.pending()).toBe(0);
});
it.each([401,403])('clears the baseline and retains final HTTP %i as the first stop cause',async status=>{
  const c=clock();let calls=0;const run=createInjectedClosedParentResponseReader(c,()=>++calls===1?new Response(bytes()):new Response('PRIVATE_ERROR',{status}),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));const f=get(run.final()),code=status===401?'authentication_failed':'access_denied';expect(await run.read(f)).toEqual({ok:false,code});
  expect(run.status()).toMatchObject({primary:{code},body:{parent:{value:{retained_records:0,changed_fields:[],comparisons_committed:0}}}});expect(calls).toBe(2);expect(c.pending()).toBe(0);
});
it('treats final target-ID mismatch as invalid_response rather than changed',async()=>{
  let calls=0;const run=createInjectedClosedParentResponseReader(clock(),()=>new Response(bytes({...row(),sys_id:++calls===1?id:'b'.repeat(32)})),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));expect(await run.read(get(run.final()))).toEqual({ok:false,code:'invalid_response'});expect(run.status().body?.parent).toMatchObject({value:{retained_records:0,changed_fields:[],comparisons_committed:0}});
});
it('refuses final before initial and duplicate final-slot creation before any extra dispatch',async()=>{
  let calls=0;const a=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return new Response(bytes());},{update_set_sys_id:id});expect(a.final()).toEqual({ok:false,code:'invalid_state'});expect(calls).toBe(0);
  const b=createInjectedClosedParentResponseReader(clock(),()=>{calls++;return new Response(bytes());},{update_set_sys_id:id});get(await b.read(get(b.initial())));get(b.final());expect(b.final()).toEqual({ok:false,code:'invalid_state'});expect(calls).toBe(1);expect(b.status().body?.parent).toMatchObject({value:{retained_records:0}});
});
it('does not return a successful read after cancellation in the async acknowledgement handoff',async()=>{
  const c=clock();let run:ReturnType<typeof createInjectedClosedParentResponseReader>|undefined,queued=false;
  run=createInjectedClosedParentResponseReader({...c,now(){const p=run?.status().body?.parent;if(p?.ok&&p.value.drafts_consumed===1&&!queued){queued=true;queueMicrotask(()=>run!.cancel());}return c.now();}},()=>new Response(bytes()),{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'cancelled'});expect(run.status()).toMatchObject({primary:{code:'cancelled'},body:{parent:{value:{live:false,retained_records:0}}}});
});
it('retains the same attempt cutoff through the async acknowledgement handoff',async()=>{
  const c=clock();let run:ReturnType<typeof createInjectedClosedParentResponseReader>|undefined,queued=false;
  run=createInjectedClosedParentResponseReader({...c,now(){const p=run?.status().body?.parent;if(p?.ok&&p.value.drafts_consumed===1&&!queued){queued=true;queueMicrotask(()=>c.advance(10000));}return c.now();}},()=>new Response(bytes()),{update_set_sys_id:id});
  expect(await run.read(get(run.initial()))).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(run.status()).toMatchObject({primary:{code:'attempt_deadline_exceeded'},body:{parent:{value:{live:false,retained_records:0}}}});expect(c.pending()).toBe(0);
});
it.each(['cancel','deadline'] as const)('retains final observation history but refuses success on %s during final acknowledgement',async mode=>{
  const c=clock();let run:ReturnType<typeof createInjectedClosedParentResponseReader>|undefined,queued=false;
  run=createInjectedClosedParentResponseReader({...c,now(){const p=run?.status().body?.parent;if(p?.ok&&p.value.comparisons_prepared===1&&!queued){queued=true;queueMicrotask(()=>{if(mode==='cancel')run!.cancel();else c.advance(10000);});}return c.now();}},()=>new Response(bytes()),{update_set_sys_id:id});
  get(await run.read(get(run.initial())));expect(await run.read(get(run.final()))).toEqual({ok:false,code:mode==='cancel'?'cancelled':'attempt_deadline_exceeded'});
  expect(run.status()).toMatchObject({body:{parent:{value:{state:'stable_observation',live:false,retained_records:0,comparisons_committed:1}}}});expect(c.pending()).toBe(0);
});
it('consumes parent acknowledgement once and rejects a foreign attempt without changing the issuer',()=>{
  const a=manual();get(a.body.consume(a.capture(get(a.port.openPurpose({kind:'parent_initial'})))));get(a.port.acknowledgeParent(a.attempt()));const before=a.body.diagnostic();
  const b=manual();expect(b.port.acknowledgeParent(a.attempt())).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(a.body.diagnostic()).toEqual(before);
  expect(a.port.acknowledgeParent(a.attempt())).toEqual({ok:false,code:'invalid_state'});expect(a.body.diagnostic().parent).toMatchObject({value:{retained_records:0}});
});
