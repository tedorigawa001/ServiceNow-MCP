import {expect,it} from 'vitest';
import {runInNewContext} from 'node:vm';
import {createFakeClosedAttemptSupervisor} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error?:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const j={deadline,wake};jobs.add(j);return ()=>{jobs.delete(j);};},
  advance(value:number){now=value;for(const j of [...jobs])if(j.deadline<=now){jobs.delete(j);j.wake();}},pending:()=>jobs.size,next:()=>Math.min(...[...jobs].map(j=>j.deadline))};}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function source(chunks:Uint8Array[]){const closed=deferred<void>();let index=0;const calls={read:0,cancel:0,abort:0,release:0};return {calls,io:{read(){calls.read++;const bytes=chunks[index++];if(bytes)return Promise.resolve({done:false,bytes});closed.resolve();return Promise.resolve({done:true});},cancel(){calls.cancel++;closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){calls.abort++;},release(){calls.release++;}}};}
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
it('captures the fake closed notification once before reading instead of re-reading its getter',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),closed=deferred<void>();let index=0,gets=0;
  const io={read(){if(index++===0)return Promise.resolve({done:false,bytes:new TextEncoder().encode('{"result":[]}')});closed.resolve();return Promise.resolve({done:true});},cancel:()=>Promise.resolve(),get closed(){if(++gets>1)throw Error('PRIVATE_GETTER');return closed.promise;},abort(){},release(){}};
  expect((await run.read(p,io)).ok).toBe(true);expect(gets).toBe(1);expect(c.pending()).toBe(0);
});
it('stops pending fake read at 9750ms, uses only its reserved cleanup window and confirms cancellation before 10000ms',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));
  const read=deferred<{done:boolean;bytes?:Uint8Array}>(),closed=deferred<void>(),calls={read:0,cancel:0,abort:0,release:0};
  const work=run.read(p,{read(){calls.read++;return read.promise;},cancel(){calls.cancel++;read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){calls.abort++;},release(){calls.release++;}});
  await flush();expect(calls.read).toBe(1);c.advance(9750);const result=await work;
  expect(result).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(calls).toEqual({read:1,cancel:1,abort:1,release:1});
  expect(run.status()).toMatchObject({requests:1,received_bytes:0,active:false,cleanup:{disposition:'confirmed',kind:'cancelled'},formal_issuance:'disabled'});expect(c.pending()).toBe(0);
});
it('keeps a cleanup-confirmed timeout retryable on the same purpose and budget without extending the run clock',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const first=run.read(p,{read:()=>read.promise,cancel(){read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();c.advance(9750);
  expect(await first).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(run.status().primary).toBeNull();get(await run.read(p,source([encode({result:[]})]).io));expect(run.status().requests).toBe(2);
});
it('never dispatches a third attempt after two cleanup-confirmed timeouts on the same logical purpose',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c,{policy:{timeout_ms:100}}),p=get(run.openPurpose({kind:'metadata_initial'}));
  for(const deadline of [75,150]){const read=deferred<{done:boolean}>(),closed=deferred<void>();const work=run.read(p,{read:()=>read.promise,cancel(){read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();c.advance(deadline);expect((await work).ok).toBe(false);}
  expect((await run.read(p,source([encode({result:[]})]).io)).ok).toBe(false);expect(run.status().requests).toBe(2);expect(c.pending()).toBe(0);
});
it('starts cleanup reservation at cancellation, not when the waiting continuation later resumes',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),pending=deferred<{done:boolean}>(),closed=deferred<void>();
  const work=run.read(p,{read:()=>pending.promise,cancel:()=>new Promise<void>(()=>{}),closed:closed.promise,abort(){},release(){}});await flush();
  let ended=false;void work.then(()=>{ended=true;});run.cancel();c.advance(250);await flush();
  try{expect(ended).toBe(true);expect(run.status()).toMatchObject({active:false,primary:{code:'cancelled'},cleanup:{disposition:'unconfirmed',reason:'read_pending'}});expect(c.pending()).toBe(0);}
  finally{c.advance(10000);await work;}
});
it('retains an unconfirmed cleanup diagnosis when a stopped run is called again',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const io={read:()=>read.promise,cancel:()=>Promise.resolve(),closed:closed.promise,abort(){},release(){}};
  const work=run.read(p,io);await flush();run.cancel();c.advance(250);await work;const before=run.status().cleanup;
  expect((await run.read(p,io)).ok).toBe(false);expect(run.status().cleanup).toEqual(before);expect(before.disposition).toBe('unconfirmed');
});
it('does not confirm cleanup using a pre-release timestamp when release crosses the cleanup deadline',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),closed=deferred<void>();let n=0;
  const result=await run.read(p,{read(){if(n++===0)return Promise.resolve({done:false,bytes:new TextEncoder().encode('{"result":[]}')});closed.resolve();return Promise.resolve({done:true});},closed:closed.promise,cancel:()=>Promise.resolve(),abort(){},release(){c.advance(250);}});
  expect(result).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(run.status().cleanup).toMatchObject({disposition:'unconfirmed',reason:'cleanup_deadline'});
});
it('consumes a successful EOF body on the same ReadState and removes all scheduler waits',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),io=source([encode({result:[]})]);
  expect(get(await run.read(p,io.io))).toMatchObject({records:0,received_bytes:13,synthetic:true,evidence_issuance:'disabled'});
  expect(run.status()).toMatchObject({requests:1,received_bytes:13,active:false,cleanup:{disposition:'confirmed',kind:'eof'},operations:{timers:0}});
  expect(io.calls).toEqual({read:2,cancel:0,abort:0,release:1});expect(c.pending()).toBe(0);
});
it('preserves the native-slot byte contract for a genuine Uint8Array from another realm',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),bytes=runInNewContext('new Uint8Array('+JSON.stringify([...encode({result:[]})])+')') as Uint8Array;
  expect(bytes instanceof Uint8Array).toBe(false);expect((await run.read(p,source([bytes]).io)).ok).toBe(true);expect(run.status().received_bytes).toBe(13);
});
it('retains the attempt deadline through the post-consume checkpoint after body references have been dropped',async()=>{
  const base=clock();let run:ReturnType<typeof createFakeClosedAttemptSupervisor>|undefined;
  const c={...base,now(){const body=run?.status().body;return body?.consumes===1&&body.retained_bytes===0?10000:0;}};
  run=createFakeClosedAttemptSupervisor(c);const p=get(run.openPurpose({kind:'metadata_initial'}));
  expect(await run.read(p,source([encode({result:[]})]).io)).toEqual({ok:false,code:'attempt_deadline_exceeded'});
  expect(run.status()).toMatchObject({primary:{code:'attempt_deadline_exceeded'},body:{retained_bytes:0},cleanup:{disposition:'confirmed',kind:'eof'}});
});
it.each([16,17])('counts %i empty completions across nonempty data without resetting the per-attempt quota',async empty=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),chunks=[];
  for(let i=0;i<empty;i++){chunks.push(new Uint8Array());if(i===7)chunks.push(encode({result:[]}));}
  const io=source(chunks),result=await run.read(p,io.io);expect(result.ok).toBe(empty===16);
  if(!result.ok)expect(result.code).toBe('invalid_response');expect(run.status().received_bytes).toBe(13);expect(c.pending()).toBe(0);expect(io.calls.release).toBe(1);
});
it('clamps the reserve to one quarter of a shortened attempt and rejects the cleanup equality boundary',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c,{policy:{timeout_ms:400}}),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const work=run.read(p,{read:()=>read.promise,cancel:()=>Promise.resolve(),closed:closed.promise,abort(){},release(){}});await flush();expect(c.next()).toBe(300);
  c.advance(300);await flush();expect(c.next()).toBe(400);c.advance(399);await flush();expect(run.status().active).toBe(true);c.advance(400);
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(run.status()).toMatchObject({attempt_failure:'attempt_deadline_exceeded',cleanup:{disposition:'unconfirmed',reason:'read_pending'}});expect(c.pending()).toBe(0);
});
it('clips a late-started attempt to the original normal-phase deadline, not a new 10 seconds',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c);c.advance(49900);const p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const work=run.read(p,{read:()=>read.promise,cancel(){read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();
  expect(c.next()).toBe(49975);c.advance(49975);expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(run.status().cleanup.disposition).toBe('confirmed');
});
it('does not restart the 60-second clock between successful logical reads',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c);c.advance(40000);const p=get(run.openPurpose({kind:'parent_initial'}));get(await run.read(p,source([encode({result:{sys_id:'a'.repeat(32)}})]).io));
  c.advance(49000);const q=get(run.openPurpose({kind:'metadata_initial'}));get(await run.read(q,source([encode({result:[]})]).io));
  c.advance(60000);expect(run.openPurpose({kind:'payload'})).toEqual({ok:false,code:'deadline_exceeded'});expect(run.status().requests).toBe(2);
});
it('clips final read supervision to the original 55-second cutoff while preserving its own retry reservation',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'parent_initial'}));get(await run.read(p,source([encode({result:{sys_id:'a'.repeat(32)}})]).io));get(run.enterFinal());
  // Slots remain opaque; use the fixed parent slot returned by a constructor-owned final-slot view.
  const final=run.finalSlots().parent,read=deferred<{done:boolean}>(),closed=deferred<void>();c.advance(54000);const f=get(run.openFinal(final));
  const work=run.read(f,{read:()=>read.promise,cancel(){read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();expect(c.next()).toBe(54750);c.advance(54750);expect((await work).ok).toBe(false);
  expect(run.status()).toMatchObject({requests:2,reserved:3,primary:null});get(await run.read(f,source([encode({result:{sys_id:'a'.repeat(32)}})]).io));get(run.skipFinal(run.finalSlots().metadata));expect(run.status().reserved).toBe(0);
});
it('does not charge a late read that settles during the cleanup reserve after I/O has been revoked',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean;bytes?:Uint8Array}>(),closed=deferred<void>();let releases=0;
  const work=run.read(p,{read:()=>read.promise,cancel:()=>Promise.resolve(),closed:closed.promise,abort(){},release(){releases++;}});await flush();c.advance(9750);await flush();
  c.advance(9800);read.resolve({done:false,bytes:encode({result:[]})});closed.resolve();expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});
  expect(run.status()).toMatchObject({received_bytes:0,cleanup:{disposition:'confirmed',kind:'cancelled'}});expect(releases).toBe(1);
});
it('retains the observed EOF cleanup kind when the run is cancelled after EOF without a reader-cancel call',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),closed=deferred<void>();let index=0,cancels=0;
  const work=run.read(p,{read(){return Promise.resolve(index++===0?{done:false,bytes:encode({result:[]})}:{done:true});},cancel(){cancels++;return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();run.cancel();closed.resolve();
  expect(await work).toEqual({ok:false,code:'cancelled'});expect(cancels).toBe(0);expect(run.status().cleanup).toMatchObject({disposition:'confirmed',kind:'eof'});
});
it('never repairs unconfirmed cleanup with post-deadline read/closed settlement but releases the late fake resource once',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean;bytes?:Uint8Array}>(),closed=deferred<void>();let releases=0;
  const work=run.read(p,{read:()=>read.promise,cancel:()=>Promise.resolve(),closed:closed.promise,abort(){},release(){releases++;}});await flush();c.advance(9750);await flush();c.advance(10000);await work;
  const before=run.status().cleanup;expect(before.disposition).toBe('unconfirmed');c.advance(10001);read.resolve({done:false,bytes:encode({result:[]})});closed.resolve();await flush();
  expect(run.status().cleanup).toEqual(before);expect(run.status().received_bytes).toBe(0);expect(releases).toBe(1);expect(c.pending()).toBe(0);
});
it.each(['read','cancel','closed','release','abort'] as const)('retains fixed diagnostics and one-shot cleanup for %s failure',async failure=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean;bytes?:Uint8Array}>(),closed=deferred<void>();const calls={cancel:0,abort:0,release:0};
  const io={read(){if(failure==='read')return Promise.reject(Error('PRIVATE_SECRET'));if(failure==='release'){closed.resolve();return Promise.resolve({done:true});}return read.promise;},
    cancel(){calls.cancel++;read.resolve({done:true});closed.resolve();return failure==='cancel'?Promise.reject(Error('PRIVATE_SECRET')):Promise.resolve();},closed:closed.promise,
    abort(){calls.abort++;if(failure==='abort')throw Error('PRIVATE_SECRET');},release(){calls.release++;if(failure==='release')throw Error('PRIVATE_SECRET');}};
  const work=run.read(p,io);await flush();if(failure==='closed')closed.reject(Error('PRIVATE_SECRET'));else if(failure!=='read'&&failure!=='release')run.cancel();
  const result=await work;expect(result.ok).toBe(false);expect(run.status().cleanup.disposition).toBe(failure==='read'?'confirmed':'unconfirmed');
  expect(calls.cancel).toBeLessThanOrEqual(1);expect(calls.abort).toBeLessThanOrEqual(1);expect(calls.release).toBeLessThanOrEqual(1);expect(JSON.stringify(run.status())).not.toContain('PRIVATE_SECRET');expect(c.pending()).toBe(0);
});
it.each(['throw','early','dispose'] as const)('stops on scheduler %s failure without leaving an owned wait',async failure=>{
  const base=clock(),c={...base,schedule(deadline:number,wake:()=>void){if(failure==='throw')throw Error('PRIVATE_SCHEDULER');if(failure==='early'){wake();return ()=>{};}const cancel=base.schedule(deadline,wake);return ()=>{cancel();throw Error('PRIVATE_SCHEDULER');};}};
  const run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const work=run.read(p,{read:()=>read.promise,cancel(){read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();if(failure==='dispose')run.cancel();
  expect((await work).ok).toBe(false);expect(run.status()).toMatchObject({cleanup:{disposition:'unconfirmed',reason:'scheduler_failed'},operations:{timers:0}});expect(base.pending()).toBe(0);expect(JSON.stringify(run.status())).not.toContain('PRIVATE_SCHEDULER');
});
it('ignores stale scheduled callbacks after success instead of cancelling a later operation',async()=>{
  const base=clock(),callbacks:Array<()=>void>=[],c={...base,schedule(deadline:number,wake:()=>void){callbacks.push(wake);return base.schedule(deadline,wake);}};
  const run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));get(await run.read(p,source([encode({result:[]})]).io));const before=run.status();
  for(const cb of callbacks)cb();expect(run.status()).toEqual(before);expect(base.pending()).toBe(0);
});
it('rejects concurrent read and close revokes before fake cancellation callbacks can reenter',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();let cancels=0;
  const io={read:()=>read.promise,cancel(){cancels++;run.close();read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}};
  const first=run.read(p,io);await flush();expect((await run.read(p,io)).ok).toBe(false);expect((await first).ok).toBe(false);expect(cancels).toBe(1);expect(run.status().primary?.code).toBe('invalid_state');expect(c.pending()).toBe(0);
});
it('continues ordered final skips after a cleanup-confirmed local table byte-limit failure without resetting G/E',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),table=get(run.admitTable('incident'));
  expect(await run.read(table.initial,source([new Uint8Array(16385)]).io)).toEqual({ok:false,code:'scope_evidence_limit'});
  expect(run.status()).toMatchObject({received_bytes:16385,evidence_bytes:16385,requests:1,primary:null});get(run.enterFinal());get(run.skipFinal(run.finalSlots().parent));get(run.skipFinal(run.finalSlots().metadata));get(run.skipFinal(table.final));expect(run.status().reserved).toBe(0);
});
it('retains the shared receive overshoot as a global failure despite confirmed cancellation cleanup',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c,{session:{accounting:{response_bytes:2}}}),p=get(run.openPurpose({kind:'metadata_initial'}));
  expect(await run.read(p,source([encode({result:[]})]).io)).toEqual({ok:false,code:'receive_budget_exceeded'});expect(run.status()).toMatchObject({requests:1,received_bytes:13,primary:{code:'receive_budget_exceeded'},cleanup:{disposition:'confirmed',kind:'cancelled'}});
});
it('prioritizes the original hard deadline when scheduler delivery is delayed past the whole run',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const work=run.read(p,{read:()=>read.promise,cancel:()=>Promise.resolve(),closed:closed.promise,abort(){},release(){}});await flush();c.advance(60000);
  expect(await work).toEqual({ok:false,code:'deadline_exceeded'});expect(run.status()).toMatchObject({active:false,received_bytes:0,primary:{code:'deadline_exceeded'},cleanup:{disposition:'unconfirmed'}});expect(c.pending()).toBe(0);
});
it('refuses dispatch at the original soft cutoff with C=0 and keeps final reservations usable',async()=>{
  const c=clock(),run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),io=source([encode({result:[]})]);c.advance(50000);
  expect(await run.read(p,io.io)).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(io.calls.read).toBe(0);expect(run.status()).toMatchObject({requests:0,reserved:4,primary:null});
  get(run.enterFinal());get(run.skipFinal(run.finalSlots().parent));get(run.skipFinal(run.finalSlots().metadata));expect(run.status().reserved).toBe(0);
});
it.each(['rewind','nonfinite','exception'] as const)('stops pending I/O on %s clock failure and cannot claim confirmed cleanup',async failure=>{
  const base=clock();let armed=false;const c={...base,now(){if(!armed)return base.now();if(failure==='exception')throw Error('PRIVATE_CLOCK');return failure==='rewind'?-1:NaN;}};
  const run=createFakeClosedAttemptSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),read=deferred<{done:boolean}>(),closed=deferred<void>();
  const work=run.read(p,{read:()=>read.promise,cancel(){read.resolve({done:true});closed.resolve();return Promise.resolve();},closed:closed.promise,abort(){},release(){}});await flush();armed=true;
  expect(run.openPurpose({kind:'payload'}).ok).toBe(false);expect((await work).ok).toBe(false);expect(run.status()).toMatchObject({requests:1,received_bytes:0,cleanup:{disposition:'unconfirmed',reason:'observation_invalid'}});expect(base.pending()).toBe(0);expect(JSON.stringify(run.status())).not.toContain('PRIVATE_CLOCK');
});
it.each([{timeout_ms:10001},{timeout_ms:0},{cleanup_reserve_ms:251},{max_empty_reads:17},{max_empty_reads:0}])('rejects raised/invalid synthetic policy %j before I/O',policy=>{
  expect(()=>createFakeClosedAttemptSupervisor(clock(),{policy})).toThrow('invalid_input');
});
it('rejects a second nested attempt policy instead of silently replacing its lower limits with defaults',()=>{
  expect(()=>createFakeClosedAttemptSupervisor(clock(),{session:{accounting:{body_mode:'bytes',attempt_policy:{timeout_ms:10,max_empty_reads:1}}}})).toThrow('invalid_input');
});
