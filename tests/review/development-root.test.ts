import {afterEach,expect,it,vi} from 'vitest';
import {createDevelopmentRoot} from '../support/review/ef03/assembly.js';
import {BoundedReadSession} from '../../src/servicenow/bounded-read.js';

afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('constructs and closes a fresh development-only run without exporting live authority',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('PRIVATE_NETWORK');});
  const root=createDevelopmentRoot();const r=await root.run({principal:'synthetic'});
  expect(r).toMatchObject({assembly:'ef03-development',scope:'construction_only',ok:true,code:null,
    construction:{state:'closed',sealed:true,primary:null,core_bound:true,source_bound:false,teardown:'confirmed'},
    run_primary:null,permissions:{formal_issuance:false,dispatch:false,source_acceptance:false}});
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
  expect(r).not.toHaveProperty('session');expect(r).not.toHaveProperty('owner');expect(network).not.toHaveBeenCalled();
});

const snapshot=(principal:string)=>({instanceUrl:'https://synthetic.invalid',authMode:'per-user' as const,perUserBearerToken:principal,oauth:{}});
const realState=(s:BoundedReadSession)=>({construction:s.constructionStatus(),budget:s.stats(),primary:s.reviewRunStatus().primary});
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
it('keeps two real admission slots and their states unchanged while a same-principal development run opens and closes',async()=>{
  const first=new BoundedReadSession(snapshot('same')),second=new BoundedReadSession(snapshot('other'));
  const g=gate(),root=createDevelopmentRoot({wait:()=>g.promise});let pending:ReturnType<typeof root.run>|undefined;
  try{
    const before=[realState(first),realState(second)];pending=root.run({principal:'same'});
    expect(root.inspect()).toEqual({active:1,registered:1,principal_keys:1});
    expect((await root.run({principal:'same'})).code).toBe('review_busy');
    expect(()=>new BoundedReadSession(snapshot('third'))).toThrow('review_busy');
    expect([realState(first),realState(second)]).toEqual(before);
    g.release();expect((await pending).ok).toBe(true);expect(root.inspect().active).toBe(0);
    expect(()=>new BoundedReadSession(snapshot('third'))).toThrow('review_busy');
    expect([realState(first),realState(second)]).toEqual(before);
  }finally{g.release();await pending;first.close();second.close();}
});
it('allows the second real slot even when both development slots are held and never refunds a busy claimant',async()=>{
  const first=new BoundedReadSession(snapshot('same'));let second:BoundedReadSession|undefined;
  const g=gate(),root=createDevelopmentRoot({wait:()=>g.promise});const a=root.run({principal:'same'}),b=root.run({principal:'dev2'});
  try{
    expect(root.inspect().active).toBe(2);expect((await root.run({principal:'extra'})).code).toBe('review_busy');
    expect(root.inspect()).toEqual({active:2,registered:2,principal_keys:2});
    second=new BoundedReadSession(snapshot('other'));expect(()=>new BoundedReadSession(snapshot('third'))).toThrow('review_busy');
  }finally{g.release();await Promise.all([a,b]);first.close();second?.close();}
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
});
it('uses separate realms across development roots without sharing registration or admission',async()=>{
  const g=gate(),left=createDevelopmentRoot({wait:()=>g.promise}),right=createDevelopmentRoot({wait:()=>g.promise});
  const a=left.run({principal:'same'}),b=right.run({principal:'same'});
  try{
    expect(left.inspect().active).toBe(1);expect(right.inspect().active).toBe(1);
    const before=right.inspect();expect((await left.run({principal:'reject',fault:'foreign_registration'})).ok).toBe(false);
    expect(right.inspect()).toEqual(before);expect(left.inspect().active).toBe(1);
  }finally{g.release();await Promise.all([a,b]);}
  expect(left.inspect().registered).toBe(0);expect(right.inspect().registered).toBe(0);
});
it.each(['after_registration','duplicate_registration','foreign_registration','after_admission','after_controller','after_timer','after_listener','after_commit'] as const)('rolls back %s once and permits a distinct new identity',async fault=>{
  vi.useFakeTimers();const real=new BoundedReadSession(snapshot('same')),other=new BoundedReadSession(snapshot('other'));
  const before=[realState(real),realState(other)];const root=createDevelopmentRoot();
  try{const r=await root.run({principal:'same',fault});
  expect(r.ok).toBe(false);expect(r.code).toBe('internal_review_error');
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});expect(vi.getTimerCount()).toBe(2);
  for(const slot of Object.values(r.construction.resources))expect(slot.releases).toBeLessThanOrEqual(1);
  if(fault==='duplicate_registration')expect(r.construction.primary?.code).toBe('invalid_state');
  if(fault==='after_commit'){expect(r.construction.primary).toBeNull();expect(r.run_primary?.code).toBe('internal_review_error');}
  else expect(r.run_primary).toBeNull();
  expect((await root.run({principal:'same'})).ok).toBe(true);
  expect([realState(real),realState(other)]).toEqual(before);expect(()=>new BoundedReadSession(snapshot('third'))).toThrow('review_busy');
  }finally{real.close();other.close();}expect(vi.getTimerCount()).toBe(0);
});
it('revokes before abort and returns admission only after the fixed cleanup sequence',async()=>{
  vi.useFakeTimers();let duringAbort:unknown;
  const root=createDevelopmentRoot({wait:async signal=>{signal.addEventListener('abort',()=>{duringAbort={...root.inspect(),timers:vi.getTimerCount()};},{once:true});}});
  const r=await root.run({principal:'same'});
  expect(r.ok).toBe(true);expect(duringAbort).toEqual({active:1,registered:0,principal_keys:1,timers:0});
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
  expect(r.construction.resources.registered_owner.releases).toBe(1);expect(r.construction.resources.admission.releases).toBe(1);
});
it('rejects a foreign brand before starting registration and preserves a live owner in the same realm',async()=>{
  const g=gate(),root=createDevelopmentRoot({wait:()=>g.promise}),pending=root.run({principal:'held'});
  try{
    const before=root.inspect(),r=await root.run({principal:'foreign',fault:'foreign_registration'});
    expect(r.construction.primary?.code).toBe('evidence_binding_mismatch');
    expect(r.construction.resources.registered_owner).toEqual({state:'absent',release_claim:0,releases:0});
    expect(r.construction.teardown).toBe('confirmed');expect(root.inspect()).toEqual(before);
  }finally{g.release();await pending;}
});
it('continues all cleanup slots and records uncertainty after a timer disposer throws',async()=>{
  vi.useFakeTimers();const clear=globalThis.clearTimeout;
  vi.spyOn(globalThis,'clearTimeout').mockImplementationOnce((...args)=>{Reflect.apply(clear,globalThis,args);throw Error('PRIVATE_CLEAR');});
  const root=createDevelopmentRoot(),r=await root.run({principal:'same'});
  expect(r).toMatchObject({ok:false,code:'internal_review_error',construction:{primary:{stage:'close'},teardown:'unconfirmed'}});
  expect(r.construction.resources.deadline_timer).toEqual({state:'unconfirmed',release_claim:1,releases:1});
  expect(r.construction.resources.admission.state).toBe('released');expect(root.inspect().active).toBe(0);expect(vi.getTimerCount()).toBe(0);
  expect(JSON.stringify(r)).not.toContain('PRIVATE');expect((await root.run({principal:'same'})).ok).toBe(true);
});
it('captures partial listener registration and removes that exact external listener once',async()=>{
  vi.useFakeTimers();const external=new AbortController(),add=AbortSignal.prototype.addEventListener,remove=vi.spyOn(AbortSignal.prototype,'removeEventListener');
  vi.spyOn(AbortSignal.prototype,'addEventListener').mockImplementation(function(...args){Reflect.apply(add,this,args);if(this===external.signal)throw Error('PRIVATE_ADD');});
  const root=createDevelopmentRoot(),r=await root.run({principal:'same'},{signal:external.signal});
  expect(r.construction).toMatchObject({primary:{stage:'listener'},teardown:'confirmed'});
  expect(remove.mock.contexts.filter(x=>x===external.signal)).toHaveLength(1);expect(root.inspect().active).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it.each(['pre','pending'] as const)('keeps %s cancellation separate and leaves real run state unchanged',async when=>{
  vi.useFakeTimers();const real=new BoundedReadSession(snapshot('same')),before=realState(real),external=new AbortController(),g=gate();
  const root=createDevelopmentRoot({wait:()=>g.promise});if(when==='pre')external.abort('PRIVATE_REASON');
  const pending=root.run({principal:'same'},{signal:external.signal});
  try{
    if(when==='pending'){await Promise.resolve();external.abort('PRIVATE_REASON');}
    const r=await pending;expect(r.code).toBe('cancelled');
    if(when==='pre'){expect(r.construction.primary).toMatchObject({stage:'commit',code:'cancelled'});expect(r.run_primary).toBeNull();}
    else{expect(r.construction.primary).toBeNull();expect(r.run_primary?.code).toBe('cancelled');}
    expect(root.inspect().active).toBe(0);expect(realState(real)).toEqual(before);expect(()=>new BoundedReadSession(snapshot('same'))).toThrow('review_busy');
  }finally{g.release();await pending;real.close();}
  expect(vi.getTimerCount()).toBe(0);
});
it('uses the original lowered deadline and releases a non-cooperative pending wait',async()=>{
  vi.useFakeTimers();let elapsed=0;const root=createDevelopmentRoot({clock:()=>elapsed,wait:()=>new Promise(()=>{})});
  const pending=root.run({principal:'same',deadline_ms:10});await Promise.resolve();elapsed=10;await vi.advanceTimersByTimeAsync(10);
  expect(await pending).toMatchObject({code:'deadline_exceeded',construction:{primary:null},run_primary:{code:'deadline_exceeded'}});
  expect(root.inspect().active).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('does not read accessors, proxies, live sessions or foreign summaries as run input',async()=>{
  let calls=0;const root=createDevelopmentRoot(),real=new BoundedReadSession(snapshot('same')),before=realState(real);
  try{
    const fake={get principal(){calls++;throw Error('PRIVATE_GETTER');}},proxy=new Proxy({},{ownKeys(){calls++;throw Error('PRIVATE_PROXY');}});
    const previous=await root.run({principal:'old'});
    for(const input of [fake,proxy,real,previous,{principal:'same',owner:real},{principal:'same',session:real}]){
      const r=await root.run(input);expect(r.code).toBe('invalid_input');expect(JSON.stringify(r)).not.toContain('PRIVATE');
    }
    expect(calls).toBe(0);expect(realState(real)).toEqual(before);expect(root.inspect().registered).toBe(0);
    expect(()=>createDevelopmentRoot({owner:real} as never)).toThrow('invalid_input');
  }finally{real.close();}
});
it('returns only recursively frozen diagnostics after wait failure with no error text',async()=>{
  const root=createDevelopmentRoot({wait:async()=>{throw Error('PRIVATE_WAIT');}}),r=await root.run({principal:'same'});
  expect(r.code).toBe('internal_review_error');expect(r.construction.primary).toBeNull();expect(r.run_primary?.code).toBe('internal_review_error');
  const visit=(v:unknown)=>{if(v&&typeof v==='object'){expect(Object.isFrozen(v)).toBe(true);for(const x of Object.values(v))visit(x);}};visit(r);
  expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
});
it('rejects recursive construction from a clock callback without allocating a second registration',async()=>{
  let nested:ReturnType<ReturnType<typeof createDevelopmentRoot>['run']>|undefined,fired=false;
  const root=createDevelopmentRoot({clock:()=>{if(!fired){fired=true;nested=root.run({principal:'nested'});}return 0;}});
  expect((await root.run({principal:'outer'})).ok).toBe(true);
  const r=await nested!;expect(r.code).toBe('review_busy');expect(r.construction.resources.registered_owner.state).toBe('absent');
  expect(root.inspect()).toEqual({active:0,registered:0,principal_keys:0});
});
it.each([NaN,Infinity,-1])('stops invalid initial clock %s before registration',async value=>{
  const root=createDevelopmentRoot({clock:()=>value}),r=await root.run({principal:'same'});
  expect(r.construction.primary).toMatchObject({stage:'clock',code:'invalid_observation_time',public_code:'internal_review_error'});
  expect(r.construction.resources.registered_owner.state).toBe('absent');expect(root.inspect().active).toBe(0);
});
it('preserves a canonical invalid-clock reason rather than flattening construction diagnostics',async()=>{
  let calls=0;const root=createDevelopmentRoot({clock:()=>calls++===0?10:0}),r=await root.run({principal:'same'});
  expect(r.construction.primary).toMatchObject({stage:'core',code:'invalid_observation_time',public_code:'internal_review_error'});
  expect(root.inspect().registered).toBe(0);
});
it('does not resume or mutate a sealed result when a cancelled wait rejects late',async()=>{
  let reject!: (reason:Error)=>void;const started=gate(),external=new AbortController();
  const root=createDevelopmentRoot({wait:()=>{started.release();return new Promise<void>((_,r)=>{reject=r;});}});
  const pending=root.run({principal:'same'},{signal:external.signal});await started.promise;external.abort();
  const r=await pending,before=JSON.stringify(r);reject(Error('PRIVATE_LATE'));await Promise.resolve();
  expect(JSON.stringify(r)).toBe(before);expect(r.code).toBe('cancelled');expect(root.inspect().registered).toBe(0);
});
