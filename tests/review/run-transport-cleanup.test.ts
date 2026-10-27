import {expect,it} from 'vitest';
import {createFakeRunTransportSession} from '../../src/review/abort-scope-evidence-run-transport.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const eof={fetch:'fulfilled',body:'reader',pending_read:false,eof:true,closed:'fulfilled',cancel:'not_requested',lock:'released',abort_failed:false};
function setup(config:unknown={}){
  let now=0;const events:string[]=[];
  const session=createFakeRunTransportSession({now:()=>now},{dispatch(){events.push('dispatch');},abort(){events.push('abort');},stopWorker(){events.push('worker_stop');}},config);
  return {session,events,time:(n:number)=>{now=n;}};
}
it('uses one fake budget for dispatch, chunk adoption and the common owner readonly view',()=>{
  const {session,events}=setup(),transport=get(session.claimTransport());
  const a=get(transport.begin({kind:'parent_initial',ordinal:1}));get(transport.chunk(a,0,new Uint8Array(3)));
  get(transport.finishHttp(a,eof));get(session.finish());
  expect(events).toEqual(['dispatch']);
  expect(session.status()).toMatchObject({state:'closed',primary:null,budget:{requests:1,received_bytes:3,payload_bytes:0},cleanup:{http:'confirmed',worker:'not_started'},evidence_issuance:'disabled'});
});
it('retains the dispatch charge on synchronous failure and still permits typed cleanup through the pinned current slot',()=>{
  const session=createFakeRunTransportSession({now:()=>0},{dispatch(){throw Error('PRIVATE_IO');},abort(){},stopWorker(){}});
  const t=get(session.claimTransport());expect(t.begin({kind:'parent_initial',ordinal:1})).toEqual({ok:false,code:'upstream_unavailable'});
  t.finishActiveHttp({...eof,fetch:'rejected',body:'none',eof:false,closed:null,lock:'not_owned'});session.finish();
  expect(session.status()).toMatchObject({primary:{code:'upstream_unavailable'},budget:{requests:1},cleanup:{http:'confirmed',worker:'not_started'}});
  expect(JSON.stringify(session.status())).not.toContain('PRIVATE');
});
it('checks the original deadline after fake dispatch and keeps C without issuing active authority',()=>{
  let now=0;
  const s=createFakeRunTransportSession({now:()=>now},{dispatch(){now=60000;},abort(){},stopWorker(){}}),t=get(s.claimTransport());
  expect(t.begin({kind:'parent_initial',ordinal:1})).toEqual({ok:false,code:'deadline_exceeded'});
  t.finishActiveHttp(eof);s.finish();
  expect(s.status()).toMatchObject({primary:{code:'deadline_exceeded'},budget:{requests:1,remaining_ms:0},cleanup:{http:'unconfirmed'}});
});
it('revokes the owner before fake abort observes it and preserves first cancellation independently of both cleanup axes',()=>{
  let observed:unknown;let s:ReturnType<typeof createFakeRunTransportSession>;
  s=createFakeRunTransportSession({now:()=>0},{dispatch(){},abort(){observed=s.status();},stopWorker(){}});
  const t=get(s.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));get(t.startWorker());s.cancel();
  expect(observed).toMatchObject({state:'stopped',primary:{code:'cancelled'}});
  t.finishHttp(a,eof);t.finishWorker({termination:'pending',listeners:'attached',stdout:'open',stderr:'open'});s.finish();
  expect(s.status()).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'confirmed',worker:'unconfirmed'},budget:{requests:1}});
  expect(t.begin({kind:'release_rows',ordinal:1}).ok).toBe(false);
});
it('charges a confirmed fake payload once at its consumption boundary, not during transport chunk adoption',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'payload',ordinal:1}));
  get(t.chunk(a,0,new Uint8Array(4)));get(t.finishHttp(a,eof));
  expect(session.status().budget).toMatchObject({received_bytes:4,payload_bytes:0});
  get(t.chargePayload(a,'あa'));expect(session.status().budget).toMatchObject({received_bytes:4,payload_bytes:4});
  expect(t.chargePayload(a,'あa').ok).toBe(false);expect(session.status().budget?.payload_bytes).toBe(4);
});
it('rejects model finalization with a pending payload acceptance, even when HTTP cleanup is confirmed',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'payload',ordinal:1}));get(t.finishHttp(a,eof));
  expect(session.finish()).toEqual({ok:false,code:'internal_review_error'});
  expect(session.status()).toMatchObject({cleanup:{http:'confirmed'},budget:{payload_bytes:0}});
});
it('consumes the transport claim once and never re-prepares a stopped owner',()=>{
  const {session,events}=setup(),t=get(session.claimTransport());
  expect(session.claimTransport().ok).toBe(false);expect(t.begin({kind:'parent_initial',ordinal:1}).ok).toBe(false);
  expect(session.claimTransport().ok).toBe(false);expect(events.filter(e=>e==='dispatch')).toHaveLength(0);
  expect(session.status()).toMatchObject({transport_claim:'consumed',primary:{code:'internal_review_error'}});
});
it.each(['typed','legacy'] as const)('fixes the %s lane at construction and refuses mixing',lane=>{
  const {session,events}=setup({lane});
  if(lane==='typed'){get(session.claimTransport());expect(session.legacyDispatch().ok).toBe(false);}
  else expect(session.claimTransport().ok).toBe(false);
  expect(events.filter(e=>e==='dispatch')).toHaveLength(0);
  expect(session.status()).toMatchObject({primary:{code:'evidence_binding_mismatch'},budget:{requests:0}});
});
it.each([3,4])('charges the overshoot chunk exactly once against a lowered G=%i cap',total=>{
  const {session}=setup({total_bytes:total}),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));
  const first=t.chunk(a,0,new Uint8Array(4));expect(first.ok).toBe(total===4);
  if(first.ok)expect(t.chunk(a,1,new Uint8Array(1))).toEqual({ok:false,code:'receive_budget_exceeded'});
  expect(session.status().budget?.received_bytes).toBe(total===4?5:4);
  const before=session.status().budget;t.chunk(a,1,new Uint8Array(99));expect(session.status().budget).toEqual(before);
  t.finishHttp(a,eof);session.finish();expect(session.status().primary?.code).toBe('receive_budget_exceeded');
});
it('resets only S on the next fake attempt and preserves cumulative G and C',()=>{
  const {session}=setup({response_bytes:3,total_bytes:8}),t=get(session.claimTransport());
  for(const kind of ['parent_initial','release_rows'] as const){const a=get(t.begin({kind,ordinal:1}));get(t.chunk(a,0,new Uint8Array(3)));get(t.finishHttp(a,eof));}
  expect(session.status().budget).toMatchObject({requests:2,received_bytes:6});
  const a=get(t.begin({kind:'metadata_initial',ordinal:1}));expect(t.chunk(a,0,new Uint8Array(4)).ok).toBe(false);
  expect(session.status()).toMatchObject({budget:{requests:3,received_bytes:10},primary:{code:'receive_budget_exceeded'}});
});
it('retains S overshoot in G but never dispatches again after response rejection',()=>{
  const {session,events}=setup({response_bytes:2}),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));
  expect(t.chunk(a,0,new Uint8Array(3))).toEqual({ok:false,code:'receive_budget_exceeded'});
  expect(session.status().primary?.code).toBe('receive_budget_exceeded');
  t.begin({kind:'release_rows',ordinal:1});expect(events.filter(x=>x==='dispatch')).toHaveLength(1);
  expect(session.status().budget?.received_bytes).toBe(3);
});
it('refuses a replayed chunk event before recharging and keeps the already adopted bytes',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1})),bytes=new Uint8Array(2);
  get(t.chunk(a,0,bytes));expect(t.chunk(a,0,bytes)).toEqual({ok:false,code:'invalid_input'});
  expect(session.status().budget?.received_bytes).toBe(2);
});
it('accepts a reused byte object at a NEW event sequence, without treating object identity as read provenance',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1})),bytes=new Uint8Array(2);
  get(t.chunk(a,0,bytes));get(t.chunk(a,1,bytes));expect(session.status().budget?.received_bytes).toBe(4);
});
it('rejects foreign attempt handles and leaves the foreign budget and owner unchanged',()=>{
  const x=setup(),y=setup(),tx=get(x.session.claimTransport()),ty=get(y.session.claimTransport()),a=get(ty.begin({kind:'parent_initial',ordinal:1}));
  const before=y.session.status();expect(tx.chunk(a,0,new Uint8Array(8))).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(y.session.status()).toEqual(before);expect(x.session.status().budget?.received_bytes).toBe(0);
});
it('rejects another dispatch while a prior attempt is live without double charging',()=>{
  const {session,events}=setup(),t=get(session.claimTransport());get(t.begin({kind:'parent_initial',ordinal:1}));
  expect(t.begin({kind:'release_rows',ordinal:1}).ok).toBe(false);expect(session.status().budget?.requests).toBe(1);expect(events.filter(x=>x==='dispatch')).toHaveLength(1);
});
it('enforces the lowered C ceiling before fake I/O',()=>{
  const {session,events}=setup({requests:1}),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));get(t.finishHttp(a,eof));
  expect(t.begin({kind:'release_rows',ordinal:1})).toEqual({ok:false,code:'request_budget_exceeded'});
  expect(events.filter(x=>x==='dispatch')).toHaveLength(1);expect(session.status().budget?.requests).toBe(1);
});
it('charges a local P rejection without stopping the owner and stops at the cumulative P ceiling',()=>{
  const {session}=setup({payload_bytes:2,total_payload_bytes:5}),t=get(session.claimTransport());
  const a=get(t.begin({kind:'payload',ordinal:1}));get(t.finishHttp(a,eof));expect(t.chargePayload(a,'abc')).toEqual({ok:false,code:'payload_limit'});
  expect(session.status()).toMatchObject({primary:null,budget:{payload_bytes:3}});
  const b=get(t.begin({kind:'payload',ordinal:2}));get(t.finishHttp(b,eof));expect(t.chargePayload(b,'abc')).toEqual({ok:false,code:'payload_budget_exceeded'});
  expect(session.status().budget?.payload_bytes).toBe(6);
});
it('allows explicit fake payload discard but not a later charge or silent reuse',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'payload',ordinal:1}));get(t.finishHttp(a,eof));get(t.discardPayload(a));
  expect(t.chargePayload(a,'PRIVATE_CODE').ok).toBe(false);expect(session.status().budget?.payload_bytes).toBe(0);
});
it.each(['authentication_failed','access_denied','cancelled'] as const)('retains %s even when both axes have confirmed termination',code=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));get(t.startWorker());session.stop(code);
  t.finishHttp(a,eof);t.finishWorker({termination:'fulfilled',listeners:'detached',stdout:'closed',stderr:'closed'});session.finish();
  expect(session.status()).toMatchObject({primary:{code},cleanup:{http:'confirmed',worker:'confirmed'}});
});
it.each([9,10,11])('uses the lowered hard deadline for the same owner and cleanup at %i',n=>{
  const {session,time}=setup({deadline_ms:10}),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));time(n);t.finishHttp(a,eof);session.finish();
  expect(session.status()).toMatchObject({primary:n<10?null:{code:'deadline_exceeded'},cleanup:{http:n<10?'confirmed':'unconfirmed'}});
});
it.each([NaN,-1])('fails closed on invalid fake-clock value %s without dispatch or new authority',n=>{
  const {session,time,events}=setup(),t=get(session.claimTransport());time(n);expect(t.begin({kind:'parent_initial',ordinal:1}).ok).toBe(false);
  expect(session.status()).toMatchObject({primary:{code:'invalid_observation_time'},budget:{requests:0}});expect(events.filter(x=>x==='dispatch')).toHaveLength(0);
});
it('freezes the closed diagnostic against late stop, chunks, cleanup and claim calls',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));get(t.finishHttp(a,eof));get(session.finish());const before=session.status();
  session.cancel();t.chunk(a,0,new Uint8Array(9));t.finishHttp(a,eof);session.claimTransport();expect(session.status()).toEqual(before);
});
it('keeps diagnostics and exported surface free of raw reasons, credentials and real-session adoption hooks',()=>{
  const {session}=setup();session.stop(Error('PRIVATE_TOKEN'));session.finish();const view=session.status();
  expect(view.primary?.code).toBe('internal_review_error');expect(JSON.stringify(view)).not.toContain('PRIVATE');
  for(const k of ['register','adopt','session','lease','snapshot','activate','issueEvidence','source','fetch'])expect(Reflect.has(session,k)).toBe(false);
  expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view.budget)).toBe(true);expect(Object.isFrozen(view.cleanup)).toBe(true);
});
it.each([{requests:211},{deadline_ms:60001},{total_bytes:16777217},{response_bytes:4194305},{payload_bytes:2097153},{total_payload_bytes:8388609},{lane:'transport'},{secret:'PRIVATE'}])('rejects raised or unknown config %j',config=>{
  expect(()=>setup(config)).toThrow('invalid_input');
});
it('enters final without a second clock origin, budget or transport claim',()=>{
  const {session,time}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));get(t.chunk(a,0,new Uint8Array(2)));get(t.finishHttp(a,eof));
  time(50000);get(t.enterFinal());const b=get(t.begin({kind:'parent_final',ordinal:1}));get(t.chunk(b,0,new Uint8Array(3)));get(t.finishHttp(b,eof));
  expect(session.status().budget).toMatchObject({requests:2,received_bytes:5,remaining_ms:10000});time(60000);
  expect(t.begin({kind:'metadata_final',ordinal:1})).toEqual({ok:false,code:'deadline_exceeded'});expect(session.status().budget?.requests).toBe(2);
});
it.each(['rewind','exception','nonfinite'] as const)('does not certify cleanup using a stale time after %s',kind=>{
  let now=1,throwClock=false;
  const session=createFakeRunTransportSession({now:()=>{if(throwClock)throw Error('PRIVATE_CLOCK');return now;}},{dispatch(){},abort(){},stopWorker(){}});
  const t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));
  if(kind==='rewind')now=0;if(kind==='exception')throwClock=true;if(kind==='nonfinite')now=NaN;
  t.finishHttp(a,eof);session.finish();
  expect(session.status()).toMatchObject({primary:{code:kind==='exception'?'internal_review_error':'invalid_observation_time'},cleanup:{http:'unconfirmed'}});
  expect(JSON.stringify(session.status())).not.toContain('PRIVATE');
});
it('retains fixed HTTP and worker cleanup reasons alongside the primary instead of replacing either axis',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));get(t.startWorker());session.cancel();
  t.finishHttp(a,{...eof,closed:'rejected'});t.finishWorker({termination:'rejected',listeners:'attached',stdout:'open',stderr:'open'});session.finish();
  expect(session.status()).toMatchObject({primary:{code:'cancelled'},cleanup:{http:'unconfirmed',worker:'unconfirmed'},cleanup_reasons:{http:'closed_rejected',worker:'termination_rejected'}});
});
it('matches an independent event oracle across normal attempts, payload acceptance and final cleanup',()=>{
  const {session,events}=setup(),t=get(session.claimTransport());
  // Independent event ledger: four dispatches; adopted chunks 1+2+3+4; one UTF-8 payload of 4 bytes.
  for(const [kind,bytes] of [['parent_initial',[1,2]],['payload',[3]],['metadata_initial',[4]]] as const){
    const a=get(t.begin({kind,ordinal:1}));bytes.forEach((n,i)=>get(t.chunk(a,i,new Uint8Array(n))));get(t.finishHttp(a,eof));
    if(kind==='payload')get(t.chargePayload(a,'あa'));
  }
  get(t.enterFinal());const a=get(t.begin({kind:'parent_final',ordinal:1}));get(t.finishHttp(a,eof));get(session.finish());
  expect(events).toEqual(['dispatch','dispatch','dispatch','dispatch']);
  expect(session.status()).toMatchObject({primary:null,budget:{requests:4,received_bytes:10,payload_bytes:4},cleanup:{http:'confirmed',worker:'not_started'}});
});
it('stops reentrant claim during the clock check before dispatch and never restores the claim',()=>{
  let hook:(()=>void)|undefined;let s:ReturnType<typeof createFakeRunTransportSession>;let dispatched=0;
  s=createFakeRunTransportSession({now:()=>{const h=hook;hook=undefined;h?.();return 0;}},{dispatch(){dispatched++;},abort(){},stopWorker(){}});
  hook=()=>{s.claimTransport();};expect(s.claimTransport().ok).toBe(false);expect(dispatched).toBe(0);
  expect(s.status()).toMatchObject({primary:{code:'internal_review_error'},transport_claim:'consumed'});expect(s.claimTransport().ok).toBe(false);
});
it('keeps cancellation from the fake dispatch callback, stops siblings once, and still cleans up the retained current slot',()=>{
  let s:ReturnType<typeof createFakeRunTransportSession>;let aborts=0,workers=0;
  s=createFakeRunTransportSession({now:()=>0},{dispatch(){s.cancel();},abort(){aborts++;throw Error('PRIVATE_ABORT');},stopWorker(){workers++;throw Error('PRIVATE_WORKER');}});
  const t=get(s.claimTransport());get(t.startWorker());expect(t.begin({kind:'parent_initial',ordinal:1})).toEqual({ok:false,code:'cancelled'});
  s.cancel();t.finishActiveHttp(eof);t.finishWorker({termination:'fulfilled',listeners:'detached',stdout:'closed',stderr:'closed'});s.finish();
  expect([aborts,workers]).toEqual([1,1]);expect(s.status()).toMatchObject({primary:{code:'cancelled'},budget:{requests:1},cleanup:{http:'confirmed',worker:'confirmed'}});
  expect(JSON.stringify(s.status())).not.toContain('PRIVATE');
});
it('does not reopen cleanup time after a broken clock later returns a plausible value',()=>{
  const {session,time}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));
  time(NaN);t.chunk(a,0,new Uint8Array(2));time(1);t.finishHttp(a,eof);session.finish();
  expect(session.status()).toMatchObject({primary:{code:'invalid_observation_time'},budget:{received_bytes:0},cleanup:{http:'unconfirmed'}});
});
it('does not mistake a fake legacy dispatch without a typed terminal for confirmed cleanup',()=>{
  const {session}=setup({lane:'legacy'});get(session.legacyDispatch());expect(session.finish().ok).toBe(false);
  expect(session.status()).toMatchObject({budget:{requests:1},cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'terminal_not_consumed'}});
});
it('does not infer HTTP confirmation from a completed worker or worker confirmation from no worker',()=>{
  const {session}=setup(),t=get(session.claimTransport());get(t.begin({kind:'parent_initial',ordinal:1}));get(t.startWorker());
  get(t.finishWorker({termination:'fulfilled',listeners:'detached',stdout:'closed',stderr:'closed'}));session.finish();
  expect(session.status()).toMatchObject({cleanup:{http:'unconfirmed',worker:'confirmed'},cleanup_reasons:{http:'terminal_not_consumed',worker:null}});
});
it('rejects fake scalar confirmation and retains the fixed HTTP reason',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));t.finishHttp(a,{...eof,confirmed:true});session.finish();
  expect(session.status()).toMatchObject({primary:{code:'invalid_input'},cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'cleanup_observation_invalid'}});
});
it('uses the actual typed-array extent rather than a caller-controlled byteLength getter during atomic adoption',()=>{
  const {session}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1}));let reads=0;
  const bytes=new Uint8Array(2);Object.defineProperty(bytes,'byteLength',{get(){reads++;session.cancel();return 999;}});
  get(t.chunk(a,0,bytes));expect(reads).toBe(0);expect(session.status()).toMatchObject({primary:null,budget:{received_bytes:2}});
});
it('binds a lowered attempt deadline to the same clock and refuses late cleanup even before the run hard limit',()=>{
  const {session,time}=setup(),t=get(session.claimTransport()),a=get(t.begin({kind:'parent_initial',ordinal:1},100));
  expect(get(t.attemptDeadline(a))).toBe(100);time(100);t.finishHttp(a,eof);session.finish();
  expect(session.status()).toMatchObject({cleanup:{http:'unconfirmed'},cleanup_reasons:{http:'cleanup_deadline'},budget:{requests:1}});
});
it('does not recurse into the clock or release the outer busy guard during a nested cleanup-clock observation',()=>{
  let calls=0,hook:(()=>void)|undefined,nested:unknown;let session:ReturnType<typeof createFakeRunTransportSession>;
  session=createFakeRunTransportSession({now:()=>{calls++;const h=hook;hook=undefined;h?.();return 0;}},{dispatch(){},abort(){},stopWorker(){}});
  hook=()=>{nested=session.observeTransportClock();};expect(session.claimTransport().ok).toBe(false);
  expect(calls).toBe(2);expect(nested).toMatchObject({now:null,stopped:true});
});
