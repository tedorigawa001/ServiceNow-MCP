import { expect,it,vi } from 'vitest';
import {createFakeTransportReceiptMachine,type FakeAttemptIo,type FakeIoObservation,type FakeTransportPurpose,type FakeBodyReceipt} from '../../src/review/abort-scope-evidence-transport-state.js';
function get<T>(r:{ok:true;value:T}|{ok:false;code:string}):T{if(!r.ok)throw Error(r.code);return r.value;}
const config=()=>({deadline_ms:60000,request_timeout_ms:10000,auth_mode:'per-user',auth_ready:true,parent_ready:true,release_match:'matched',selection_ready:true,plan_ready:true});
function resource(patch:Partial<FakeIoObservation>={},text='{"result":[]}'){
  const state:FakeIoObservation={fetch:'fulfilled',status:200,body:'reader',pending_read:false,eof:true,closed:'fulfilled',cancel:'not_requested',...patch};
  const calls={cancel:0,release:0,abort:0,body:0},hooks:{cancel?:()=>void;release?:()=>void;abort?:()=>void;body?:()=>void;snapshot?:()=>void}={};
  const io:FakeAttemptIo={snapshot(){hooks.snapshot?.();return {...state};},bodyText(){calls.body++;hooks.body?.();return text;},
    cancel(){calls.cancel++;state.cancel='fulfilled';state.pending_read=false;if(state.body==='reader')state.closed='fulfilled';hooks.cancel?.();},
    releaseLock(){calls.release++;hooks.release?.();},abort(){calls.abort++;hooks.abort?.();}};
  return {state,calls,hooks,io};
}
function setup(list=[resource()],override:Record<string,unknown>={}){
  let tick=0,n=0;const requests:unknown[]=[],clock={now:()=>tick},dispatch=vi.fn((request:unknown)=>{requests.push(request);return list[n++]?.io??resource().io;});
  const m=get(createFakeTransportReceiptMachine({...config(),...override},clock,{dispatch}));
  return {m,clock,dispatch,requests,setTime:(t:number)=>{tick=t;},resources:list};
}
function permit(x:ReturnType<typeof setup>,kind:FakeTransportPurpose='parent_initial',target?:string){
  let slot;
  if(kind.endsWith('_final')){get(x.m.enterFinal());slot=get(x.m.slot(kind==='parent_final'?'parent':kind==='metadata_final'?'metadata':'table',target));}
  return get(x.m.purpose(kind,{source:x.m.source,phase:x.m.phase(),target,slot}));
}
function settled(x:ReturnType<typeof setup>,attempt:Parameters<ReturnType<typeof setup>['m']['poll']>[0]){
  const r=get(x.m.poll(attempt));if(r.state!=='settled')throw Error('expected settled');return r;
}
it('issues opaque purpose/attempt/cleanup/body handles and exposes only a non-authoritative summary',()=>{
  const r=resource({},'{"SECRET":"private"}'),x=setup([r]),p=permit(x),a=get(x.m.begin(p)),done=settled(x,a);
  expect(done.outcome).toBe('body');expect(done.body).not.toBeNull();
  expect(get(x.m.cleanupInfo(done.cleanup))).toEqual({disposition:'confirmed',kind:'eof',reason:null,synthetic:true});
  const consumed=get(x.m.consumeBody(done.body!,p));expect(consumed).toMatchObject({state:'simulated_body',synthetic:true,evidence_issuance:'disabled'});
  expect(JSON.stringify(consumed)).not.toContain('private');expect(x.m.issueEvidence()).toEqual({ok:false,code:'invalid_state'});
  for(const h of [p,a,done.cleanup,done.body]){expect(Object.isFrozen(h)).toBe(true);expect(JSON.stringify(h)).toBe('{}');}
  expect(r.calls).toEqual({cancel:0,release:1,abort:1,body:1});expect(x.dispatch).toHaveBeenCalledTimes(1);
});
it.each(['parent_initial','release_rows','metadata_initial','payload','table_initial','parent_final','metadata_final','table_final'] as const)('binds fixed purpose %s without a URL/final boolean input',kind=>{
  const x=setup(),target=kind==='payload'?'a'.repeat(32):kind.startsWith('table_')?'incident':undefined,p=permit(x,kind,target),a=get(x.m.begin(p));
  expect(settled(x,a).outcome).toBe('body');expect(x.requests).toEqual([{purpose:kind,target,ordinal:1,synthetic:true}]);
});
it('keeps OAuth fake body private and never returns a general body receipt',()=>{
  const x=setup([resource({},'{"access_token":"SECRET","expires_in":3600}')],{auth_mode:'service-account',auth_ready:false}),p=permit(x,'oauth'),done=settled(x,get(x.m.begin(p)));
  expect(done).toMatchObject({outcome:'auth_only',body:null});expect(JSON.stringify(done)).not.toContain('SECRET');expect(x.m.issueEvidence().ok).toBe(false);
});
it.each([
  {kind:'oauth',facts:{},code:'authentication_failed'},
  {kind:'parent_initial',facts:{auth_ready:false},code:'authentication_failed'},
  {kind:'metadata_initial',facts:{release_match:'unknown'},code:'release_not_admitted'},
  {kind:'release_rows',facts:{parent_ready:false},code:'invalid_state'},
  {kind:'payload',facts:{selection_ready:false},code:'invalid_state'},
  {kind:'table_initial',facts:{plan_ready:false},code:'invalid_state'},
])('refuses missing prerequisites for $kind',({kind,facts,code})=>{
  const x=setup(undefined,facts);expect(x.m.purpose(kind as FakeTransportPurpose,{source:x.m.source,phase:x.m.phase(),target:kind==='payload'?'a'.repeat(32):kind==='table_initial'?'incident':undefined})).toEqual({ok:false,code});
  expect(x.dispatch).not.toHaveBeenCalled();
});
it.each(['source','phase','slot'] as const)('rejects cloned/foreign %s context',kind=>{
  const x=setup(),y=setup();let phase=x.m.phase(),source=x.m.source,slot;
  if(kind==='source')source=y.m.source;if(kind==='phase')phase=structuredClone(phase);
  if(kind==='slot'){phase=get(x.m.enterFinal());slot=get(y.m.slot('parent'));}
  expect(x.m.purpose(kind==='slot'?'parent_final':'parent_initial',{source,phase,slot})).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('does not borrow a metadata slot for a table final',()=>{
  const x=setup(),phase=get(x.m.enterFinal()),slot=get(x.m.slot('metadata'));
  expect(x.m.purpose('table_final',{source:x.m.source,phase,slot,target:'incident'})).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('bounds one logical permit to two attempts and waits for confirmed prior cleanup before retry',()=>{
  const r=resource({status:503}),x=setup([r,resource()]),p=permit(x);
  const first=settled(x,get(x.m.begin(p)));expect(first.outcome).toBe('upstream_unavailable');expect(get(x.m.cleanupInfo(first.cleanup)).disposition).toBe('confirmed');
  const next=settled(x,get(x.m.begin(p)));get(x.m.consumeBody(next.body!,p));
  expect(x.m.begin(p)).toEqual({ok:false,code:'invalid_state'});expect(x.requests.map(r=>(r as {ordinal:number}).ordinal)).toEqual([1,2]);
});
it('does not allocate a new logical permit for a failed purpose',()=>{
  const x=setup([resource({status:404})]),p=permit(x);settled(x,get(x.m.begin(p)));
  expect(x.m.purpose('parent_initial',{source:x.m.source,phase:x.m.phase()})).toEqual({ok:false,code:'invalid_state'});
});
it('pending read before I/O deadline is not cleanup confirmation',()=>{
  const r=resource({eof:false,pending_read:true,closed:'pending'}),x=setup([r]),a=get(x.m.begin(permit(x)));
  expect(get(x.m.poll(a))).toEqual({state:'pending'});expect(r.calls.cancel).toBe(0);expect(x.m.stats().body_pending).toBe(false);
  x.setTime(9750);const done=settled(x,a);expect(done).toMatchObject({outcome:'upstream_unavailable',body:null});
  expect(get(x.m.cleanupInfo(done.cleanup))).toMatchObject({disposition:'confirmed',kind:'cancelled'});expect(r.calls).toMatchObject({cancel:1,release:1,body:0});
});
it('EOF alone is not confirmed until closed and lock release are observed',()=>{
  const r=resource({closed:'pending'}),x=setup([r]),a=get(x.m.begin(permit(x)));
  expect(get(x.m.poll(a))).toEqual({state:'pending'});expect(r.calls.release).toBe(0);
  r.state.closed='fulfilled';expect(settled(x,a).body).not.toBeNull();expect(r.calls).toMatchObject({cancel:0,release:1});
});
it.each(['cancel_rejected','cancel_pending','pending_read','closed_rejected','release_failed','unknown_lock'] as const)('does not issue body on %s',kind=>{
  const r=resource(kind==='closed_rejected'?{closed:'rejected'}:kind==='unknown_lock'?{body:'unknown_lock',closed:null,eof:false}:{status:404,body:'unlocked',closed:null,eof:false});
  if(kind==='cancel_rejected')r.hooks.cancel=()=>{r.state.cancel='rejected';};
  if(kind==='cancel_pending')r.hooks.cancel=()=>{r.state.cancel='pending';};
  if(kind==='pending_read'){r.state.body='reader';r.state.closed='pending';r.state.pending_read=true;r.hooks.cancel=()=>{r.state.pending_read=true;};}
  if(kind==='release_failed'){r.state.status=200;r.state.body='reader';r.state.closed='fulfilled';r.state.eof=true;r.hooks.release=()=>{throw Error('SECRET');};}
  const x=setup([r]),a=get(x.m.begin(permit(x)));if(kind==='unknown_lock')x.setTime(9750);
  let out=get(x.m.poll(a));if(out.state==='pending'){x.setTime(10000);out=get(x.m.poll(a));}
  expect(out.state).toBe('settled');if(out.state==='settled'){expect(out.body).toBeNull();expect(get(x.m.cleanupInfo(out.cleanup)).disposition).toBe('unconfirmed');}
  expect(x.m.stats()).toMatchObject({cleanup_unconfirmed:true,body_pending:false});expect(JSON.stringify(out)).not.toContain('SECRET');expect(r.calls.cancel).toBeLessThanOrEqual(1);
});
it.each([401,403])('preserves authentication/ACL status %i despite cleanup uncertainty',status=>{
  const r=resource({status,body:'unlocked',closed:null,eof:false});r.hooks.cancel=()=>{r.state.cancel='rejected';};
  const x=setup([r]),done=settled(x,get(x.m.begin(permit(x))));expect(done.body).toBeNull();
  expect(x.m.stats().primary).toBe(status===401?'authentication_failed':'access_denied');expect(r.calls.body).toBe(0);
});
it('keeps only the fixed release_rows 403 local for later C-mode fallback',()=>{
  const x=setup([resource({status:403,body:'unlocked',closed:null,eof:false})]),done=settled(x,get(x.m.begin(permit(x,'release_rows'))));
  expect(done).toMatchObject({outcome:'access_denied',body:null});expect(x.m.stats().primary).toBeNull();
});
it('distinguishes no-body and synchronous dispatch failure without fabricating a successful body',()=>{
  const x=setup([resource({status:204,body:'none',closed:null,eof:false})]),done=settled(x,get(x.m.begin(permit(x))));
  expect(done).toMatchObject({outcome:'invalid_response',body:null});expect(get(x.m.cleanupInfo(done.cleanup)).kind).toBe('no_body');
  const y=setup();y.dispatch.mockImplementationOnce(()=>{throw Error('SECRET');});const out=settled(y,get(y.m.begin(permit(y))));
  expect(out).toMatchObject({outcome:'upstream_unavailable',body:null});expect(get(y.m.cleanupInfo(out.cleanup)).kind).toBe('no_response');expect(JSON.stringify(out)).not.toContain('SECRET');
});
it('retains cancellation primary and never issues a body after a late response',()=>{
  const r=resource({fetch:'pending',status:null,body:'none',closed:null,eof:false}),x=setup([r]),a=get(x.m.begin(permit(x)));
  expect(get(x.m.poll(a))).toEqual({state:'pending'});x.m.stop('cancelled');
  Object.assign(r.state,{fetch:'fulfilled',status:200,body:'unlocked'});const done=settled(x,a);
  expect(done.body).toBeNull();expect(done.outcome).toBe('stopped');expect(x.m.stats().primary).toBe('cancelled');expect(r.calls).toMatchObject({cancel:1,abort:1,body:0});
});
it('does not restart cleanup time when cancellation remains pending',()=>{
  const r=resource({status:404,body:'unlocked',closed:null,eof:false});r.hooks.cancel=()=>{r.state.cancel='pending';};
  const x=setup([r]),a=get(x.m.begin(permit(x)));x.setTime(9000);expect(get(x.m.poll(a))).toEqual({state:'pending'});
  x.setTime(10000);const done=settled(x,a);expect(get(x.m.cleanupInfo(done.cleanup))).toMatchObject({disposition:'unconfirmed',reason:'cleanup_deadline'});expect(r.calls.cancel).toBe(1);
});
it.each(['backward','throw','hard_deadline','release_deadline','body_deadline'] as const)('refuses receipt at clock boundary %s',kind=>{
  const r=resource(),x=setup([r]),p=permit(x);x.setTime(10);const a=get(x.m.begin(p));
  if(kind==='backward')x.setTime(9);if(kind==='throw')x.clock.now=()=>{throw Error('SECRET');};if(kind==='hard_deadline')x.setTime(60000);
  if(kind==='release_deadline')r.hooks.release=()=>{x.setTime(10010);};if(kind==='body_deadline')r.hooks.body=()=>{x.setTime(10010);};
  expect(settled(x,a).body).toBeNull();expect(x.m.stats().body_pending).toBe(false);expect(JSON.stringify(x.m.stats())).not.toContain('SECRET');
});
it('rejects a stale normal-phase permit after a one-way final transition',()=>{
  const x=setup(),p=permit(x);get(x.m.enterFinal());expect(x.m.begin(p)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(x.dispatch).not.toHaveBeenCalled();
});
it('requires the same permit for one-shot body consume/discard and blocks another I/O while held',()=>{
  const x=setup(),p=permit(x),done=settled(x,get(x.m.begin(p)));expect(get(x.m.consumeBody(done.body!,p,true)).state).toBe('discarded');
  expect(x.m.consumeBody(done.body!,p)).toEqual({ok:false,code:'invalid_state'});
  const y=setup(),a=permit(y),out=settled(y,get(y.m.begin(a))),b=permit(y,'metadata_initial');
  expect(y.m.begin(b)).toEqual({ok:false,code:'invalid_state'});expect(y.m.consumeBody(out.body!,a).ok).toBe(false);
});
it.each(['permit','attempt','cleanup','body'] as const)('rejects a cloned %s handle',kind=>{
  const x=setup(),p=permit(x),a=get(x.m.begin(p));
  if(kind==='permit'){x.m.stop('closed');const y=setup();expect(y.m.begin(structuredClone(p))).toEqual({ok:false,code:'evidence_binding_mismatch'});return;}
  if(kind==='attempt'){expect(x.m.poll(structuredClone(a))).toEqual({ok:false,code:'evidence_binding_mismatch'});return;}
  const done=settled(x,a);
  expect(kind==='cleanup'?x.m.cleanupInfo(structuredClone(done.cleanup)):x.m.consumeBody(structuredClone(done.body!),p)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it('cannot graft an already used I/O resource onto another attempt',()=>{
  const r=resource({status:503}),x=setup([r,r]),p=permit(x);settled(x,get(x.m.begin(p)));
  expect(x.m.begin(p)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each(['{SECRET','"'+'界'.repeat(6000)+'"'])('keeps malformed/oversized fake JSON out of body receipts',text=>{
  const x=setup([resource({},text)]),p=permit(x,'table_initial','incident'),done=settled(x,get(x.m.begin(p)));
  expect(done.body).toBeNull();expect(['invalid_response','scope_evidence_limit']).toContain(done.outcome);expect(JSON.stringify(done)).not.toContain('SECRET');
});
it('never accepts a raw body record or emits production evidence',()=>{
  const x=setup(),p=permit(x);expect(x.m.consumeBody({} as FakeBodyReceipt,p)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(x.m.issueEvidence().ok).toBe(false);
});
it('aborts an I/O resource returned after dispatch reentrantly stopped the machine',()=>{
  const r=resource(),x=setup([r]);x.dispatch.mockImplementationOnce(()=>{x.m.stop('cancelled');return r.io;});
  expect(x.m.begin(permit(x))).toEqual({ok:false,code:'cancelled'});expect(r.calls.abort).toBe(1);
});
it('does not issue a body when the final abort callback crosses the deadline',()=>{
  const r=resource(),x=setup([r]);r.hooks.abort=()=>{x.setTime(10000);};
  expect(settled(x,get(x.m.begin(permit(x)))).body).toBeNull();
});
it('a throwing abort cannot certify cleanup',()=>{
  const r=resource(),x=setup([r]);r.hooks.abort=()=>{throw Error('SECRET');};
  const done=settled(x,get(x.m.begin(permit(x))));expect(done.body).toBeNull();expect(get(x.m.cleanupInfo(done.cleanup)).disposition).toBe('unconfirmed');
});
it('does not call a returned but invalid resource a settled no-response dispatch',()=>{
  const x=setup(),invalid=new Proxy(resource().io,{get(target,key){if(key==='snapshot')throw Error('SECRET');return Reflect.get(target,key);}});
  x.dispatch.mockImplementationOnce(()=>invalid);
  expect(x.m.begin(permit(x))).toEqual({ok:false,code:'evidence_binding_mismatch'});
  expect(x.m.stats().cleanup_unconfirmed).toBe(true);
});
it('refuses a start at the normal cutoff without stopping, then reaches the final reservations',()=>{
  const x=setup(),p=get(x.m.purpose('payload',{source:x.m.source,phase:x.m.phase(),target:'a'.repeat(32)}));
  x.setTime(50000);expect(x.m.begin(p)).toEqual({ok:false,code:'phase_deadline_exceeded'});
  expect(x.dispatch).not.toHaveBeenCalled();expect(x.m.stats()).toMatchObject({primary:null,dispatches:0});
  const phase=get(x.m.enterFinal()),slot=get(x.m.slot('parent'));
  const a=get(x.m.begin(get(x.m.purpose('parent_final',{source:x.m.source,phase,slot}))));
  expect(settled(x,a).outcome).toBe('body');expect(x.m.stats()).toMatchObject({primary:null,phase:'final',dispatches:1});
});
it('still stops at the hard deadline instead of treating it as a phase refusal',()=>{
  const x=setup(),p=permit(x);x.setTime(60000);
  expect(x.m.begin(p)).toEqual({ok:false,code:'deadline_exceeded'});expect(x.m.enterFinal()).toEqual({ok:false,code:'deadline_exceeded'});
  expect(x.dispatch).not.toHaveBeenCalled();
});
