import {expect,it,vi} from 'vitest';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {createInjectedClosedStreamSupervisor} from '../../src/review/abort-scope-evidence-closed-attempt-supervisor.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
function clock(){let now=0;const jobs=new Set<{deadline:number;wake:()=>void}>();return {now:()=>now,schedule(deadline:number,wake:()=>void){const job={deadline,wake};jobs.add(job);return ()=>{jobs.delete(job);};},advance(value:number){now=value;for(const job of [...jobs])if(job.deadline<=now){jobs.delete(job);job.wake();}},pending:()=>jobs.size};}
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
it('connects native read/closed/releaseLock to the same attempt, charges once and returns no body or formal receipt',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),bytes=encode({result:[]});
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes.subarray(0,5));controller.enqueue(bytes.subarray(5));controller.close();}});
  expect(get(await run.read(p,stream))).toMatchObject({records:0,received_bytes:bytes.length,synthetic:true,evidence_issuance:'disabled'});
  expect(run.status()).toMatchObject({requests:1,received_bytes:bytes.length,cleanup:{disposition:'confirmed',kind:'eof'},streams:{claims:1,reads:3,cancels:0,releases:1,closed_captures:1,active_readers:0}});
  expect(stream.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('cancels a native pending read at the I/O cutoff, captures closed before cancellation and releases once',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let cancels=0;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancels++;}}),work=run.read(p,stream);await flush();expect(stream.locked).toBe(true);c.advance(9750);
  expect(await work).toEqual({ok:false,code:'attempt_deadline_exceeded'});expect(cancels).toBe(1);expect(stream.locked).toBe(false);
  expect(run.status()).toMatchObject({requests:1,received_bytes:0,primary:null,cleanup:{disposition:'confirmed',kind:'cancelled'},streams:{claims:1,cancels:1,releases:1,closed_captures:1,active_readers:0}});expect(c.pending()).toBe(0);
});
it('keeps a timed-out prefix charged but retries on a fresh native stream without adopting old bytes',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),first=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('PRIVATE_PART'));}});
  const work=run.read(p,first);await flush();c.advance(9750);expect((await work).ok).toBe(false);
  const second=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encode({result:[]}));controller.close();}});expect(get(await run.read(p,second)).records).toBe(0);
  expect(run.status()).toMatchObject({requests:2,received_bytes:25,streams:{claims:2,releases:2,active_readers:0}});expect(first.locked||second.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('waits for the native cancel promise even when the pending read and captured closed promise already settled',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let finishCancel!:()=>void,cancels=0;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancels++;return new Promise<void>(resolve=>{finishCancel=resolve;});}}),work=run.read(p,stream);await flush();run.cancel();await flush();
  expect(run.status().active).toBe(true);expect(stream.locked).toBe(false);c.advance(250);expect(await work).toEqual({ok:false,code:'cancelled'});
  const before=run.status().cleanup;expect(before).toMatchObject({disposition:'unconfirmed',reason:'cancel_pending'});finishCancel();await flush();
  expect(run.status().cleanup).toEqual(before);expect(cancels).toBe(1);expect(run.status().streams.releases).toBe(1);expect(c.pending()).toBe(0);
});
it('keeps native cancel rejection unconfirmed and never exposes the underlying error message',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let cancels=0;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancels++;return Promise.reject(Error('PRIVATE_CANCEL_SECRET'));}}),work=run.read(p,stream);await flush();run.cancel();
  expect(await work).toEqual({ok:false,code:'cancelled'});await flush();expect(run.status()).toMatchObject({cleanup:{disposition:'unconfirmed',reason:'cancel_rejected'},streams:{cancels:1,releases:1,active_readers:0}});
  expect(cancels).toBe(1);expect(JSON.stringify(run.status())).not.toContain('PRIVATE_CANCEL_SECRET');expect(stream.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('observes native reader error rejection before release and preserves an unconfirmed fixed diagnostic',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({start(controller){controller.error(Error('PRIVATE_STREAM_SECRET'));}});
  // Native cancel also rejects on an errored stream; fixed cleanup priority reports cancel_rejected.
  expect((await run.read(p,stream)).ok).toBe(false);await flush();expect(run.status()).toMatchObject({primary:{code:'invalid_response'},cleanup:{disposition:'unconfirmed',reason:'cancel_rejected'},streams:{claims:1,releases:1,active_readers:0}});
  expect(JSON.stringify(run.status())).not.toContain('PRIVATE_STREAM_SECRET');expect(stream.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('rejects a stream locked by another reader without cancelling or releasing that foreign reader',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let cancels=0;
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encode({result:[]}));},cancel(){cancels++;}}),reader=stream.getReader();void reader.closed.catch(()=>{});
  try{expect(await run.read(p,stream)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(run.status().streams).toMatchObject({claims:0,cancels:0,releases:0});expect(stream.locked).toBe(true);expect((await reader.read()).value).toEqual(encode({result:[]}));expect(cancels).toBe(0);}
  finally{await reader.cancel();reader.releaseLock();}
});
it('rejects reuse across attempt supervisors even after native release, without changing the original owner',async()=>{
  const c=clock(),first=createInjectedClosedStreamSupervisor(c),p=get(first.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encode({result:[]}));controller.close();}});
  get(await first.read(p,stream));const before=first.status(),second=createInjectedClosedStreamSupervisor(c),q=get(second.openPurpose({kind:'metadata_initial'}));
  expect(await second.read(q,stream)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(second.status().streams.claims).toBe(0);expect(first.status()).toEqual(before);expect(stream.locked).toBe(false);
});
it('does not acquire a stream before the original soft-cutoff dispatch check',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>();c.advance(50000);
  expect(await run.read(p,stream)).toEqual({ok:false,code:'phase_deadline_exceeded'});expect(run.status()).toMatchObject({requests:0,streams:{claims:0,reads:0,active_readers:0}});expect(stream.locked).toBe(false);
});
it('ignores caller getReader/locked overrides and pins the intrinsic reader methods',async()=>{
  let getters=0;
  class HostileStream extends ReadableStream<Uint8Array>{get locked():boolean{getters++;throw Error('PRIVATE_LOCKED');}getReader():ReadableStreamDefaultReader<Uint8Array>{getters++;throw Error('PRIVATE_READER');}}
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new HostileStream({start(controller){controller.enqueue(encode({result:[]}));controller.close();}});
  expect((await run.read(p,stream)).ok).toBe(true);expect(getters).toBe(0);expect(run.status().streams).toMatchObject({closed_captures:1,releases:1,active_readers:0});
});
it.each(['proxy','forged','plain'] as const)('rejects a %s non-native stream without invoking its methods',async kind=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let calls=0;
  const raw=kind==='proxy'?new Proxy(new ReadableStream<Uint8Array>(),{}):kind==='forged'?Object.create(ReadableStream.prototype):{getReader(){calls++;throw Error('PRIVATE_METHOD');}};
  const work=run.read(p,raw as ReadableStream<Uint8Array>);await flush();if(run.status().active)c.advance(60000);
  expect(await work).toEqual({ok:false,code:'invalid_input'});expect(calls).toBe(0);expect(run.status().streams.claims).toBe(0);
});
it.each([16,17])('shares the total empty-read quota for %i native stream empty chunks',async empty=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({start(controller){for(let i=0;i<empty;i++){controller.enqueue(new Uint8Array());if(i===7)controller.enqueue(encode({result:[]}));}controller.close();}});
  const result=await run.read(p,stream);expect(result.ok).toBe(empty===16);expect(run.status().received_bytes).toBe(13);expect(stream.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('uses the default native reader for a byte stream without introducing a BYOB ownership path',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({type:'bytes',start(controller){controller.enqueue(encode({result:[]}));controller.close();}});
  expect(get(await run.read(p,stream)).records).toBe(0);expect(stream.locked).toBe(false);expect(run.status().streams.closed_captures).toBe(1);
});
it('preserves genuine cross-realm Uint8Array chunks and rejects prototype-forged values before charging',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),bytes=runInNewContext('new Uint8Array('+JSON.stringify([...encode({result:[]})])+')') as Uint8Array;
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}});expect((await run.read(p,stream)).ok).toBe(true);
  const other=createInjectedClosedStreamSupervisor(c),q=get(other.openPurpose({kind:'metadata_initial'})),forged=new Int16Array(4);Object.setPrototypeOf(forged,Uint8Array.prototype);
  const bad=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(forged as unknown as Uint8Array);}});expect((await other.read(q,bad)).ok).toBe(false);expect(other.status().received_bytes).toBe(0);expect(bad.locked).toBe(false);
});
it('has no default fetch path even when a native stream read succeeds',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
  try{const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encode({result:[]}));controller.close();}});get(await run.read(p,stream));expect(spy).not.toHaveBeenCalled();}
  finally{spy.mockRestore();}
});
it('does not touch a native reader owned by another active supervisor',async()=>{
  const c=clock(),first=createInjectedClosedStreamSupervisor(c),p=get(first.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>(),work=first.read(p,stream);await flush();
  const second=createInjectedClosedStreamSupervisor(c),q=get(second.openPurpose({kind:'metadata_initial'}));expect(await second.read(q,stream)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(first.status()).toMatchObject({active:true,primary:null,streams:{cancels:0,releases:0,active_readers:1}});first.cancel();expect(await work).toEqual({ok:false,code:'cancelled'});expect(stream.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('cannot retry an attempt whose native cancel never confirms before the reserved deadline',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({cancel(){return new Promise<void>(()=>{});}}),work=run.read(p,stream);await flush();c.advance(9750);await flush();c.advance(10000);
  expect(await work).toEqual({ok:false,code:'cleanup_unconfirmed'});expect(run.status()).toMatchObject({attempt_failure:'attempt_deadline_exceeded',cleanup:{disposition:'unconfirmed',reason:'cancel_pending'},streams:{active_readers:0,releases:1}});
  const unused=new ReadableStream<Uint8Array>();expect((await run.read(p,unused)).ok).toBe(false);expect(unused.locked).toBe(false);expect(run.status().requests).toBe(1);expect(c.pending()).toBe(0);
});
it('preserves the charged private snapshot when the injected native chunk is changed by a clock callback',async()=>{
  const bytes=encode({result:[]}),expected=createHash('sha256').update(bytes).digest('hex'),base=clock();let run:ReturnType<typeof createInjectedClosedStreamSupervisor>|undefined;
  const c={...base,now(){if((run?.status().received_bytes??0)>0)bytes.fill(0);return 0;}};run=createInjectedClosedStreamSupervisor(c);const p=get(run.openPurpose({kind:'metadata_initial'})),stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}});
  expect(get(await run.read(p,stream))).toMatchObject({records:0,sha256:expected,received_bytes:13});expect(bytes.every(b=>b===0)).toBe(true);expect(run.status().received_bytes).toBe(13);
});
it('derives payload accounting from the same native JSON bytes and returns no payload text',async()=>{
  const value='PRIVATE_日本語',bytes=encode({result:{payload:value}}),c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'payload'})),stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}});
  const summary=get(await run.read(p,stream));expect(run.status()).toMatchObject({requests:1,received_bytes:bytes.length,payload_bytes:Buffer.byteLength(value)});expect(summary.payload_bytes).toBe(Buffer.byteLength(value));expect(JSON.stringify(summary)).not.toContain('PRIVATE_');expect(stream.locked).toBe(false);
});
it('keeps native cancellation after a table byte limit local and preserves ordered reservation release',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),table=get(run.admitTable('incident')),stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(16385));}});
  expect(await run.read(table.initial,stream)).toEqual({ok:false,code:'scope_evidence_limit'});expect(run.status()).toMatchObject({requests:1,received_bytes:16385,evidence_bytes:16385,primary:null,streams:{cancels:1,releases:1,active_readers:0}});
  get(run.enterFinal());get(run.skipFinal(run.finalSlots().parent));get(run.skipFinal(run.finalSlots().metadata));get(run.skipFinal(table.final));expect(run.status().reserved).toBe(0);expect(stream.locked).toBe(false);
});
it('revokes before an underlying native cancel callback reenters close and never double-cancels/releases',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let cancels=0;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancels++;run.close();}}),work=run.read(p,stream);await flush();c.advance(9750);
  expect(await work).toEqual({ok:false,code:'closed'});expect(cancels).toBe(1);expect(run.status().streams).toMatchObject({cancels:1,releases:1,active_readers:0});expect(stream.locked).toBe(false);expect(c.pending()).toBe(0);
});
it('cannot enqueue late native chunks after timeout cancellation and never charges or decodes them',async()=>{
  const c=clock(),run=createInjectedClosedStreamSupervisor(c),p=get(run.openPurpose({kind:'metadata_initial'}));let controller!:ReadableStreamDefaultController<Uint8Array>;
  const stream=new ReadableStream<Uint8Array>({start(value){controller=value;}}),work=run.read(p,stream);await flush();c.advance(9750);expect((await work).ok).toBe(false);const before=run.status();
  expect(()=>controller.enqueue(encode({result:[]}))).toThrow();await flush();expect(run.status()).toEqual(before);expect(run.status().received_bytes).toBe(0);expect(stream.locked).toBe(false);
});
