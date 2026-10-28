import {expect,it,vi} from 'vitest';
import {createSyntheticParentStabilityIssuer} from '../../src/review/abort-scope-evidence-parent-stability.js';
const get=<T>(r:{ok:true;value:T}|{ok:false;code:string}):T=>{if(!r.ok)throw Error(r.code);return r.value;};
const id='a'.repeat(32),row=()=>({sys_id:id,state:'in progress',application:'global',sys_updated_on:'2026-10-29 00:00:00',sys_mod_count:'3'});
function setup(){let now=0;const issuer=createSyntheticParentStabilityIssuer({now:()=>now}),session=get(issuer.issueSession({update_set_sys_id:id})),owner=get(issuer.claimOwner(session));return {issuer,session,owner,time:(n:number)=>{now=n;}};}
it('accepts an initial private draft and compares a distinct final observation without exposing either record',()=>{
  const {issuer,owner}=setup(),initial=get(issuer.beginInitial(owner)),draft=get(issuer.issueDraft(owner,initial,row()));
  expect(Object.keys(draft)).toEqual([]);get(issuer.acceptInitial(owner,draft));
  const final=get(issuer.beginFinal(owner)),end=get(issuer.issueDraft(owner,final,row())),comparison=get(issuer.prepareComparison(owner,end));
  expect(get(issuer.status(owner))).toMatchObject({state:'comparison_pending',retained_records:0,field_comparisons:5});
  expect(get(issuer.commitComparison(owner,comparison))).toEqual({consistency:'stable_observation',synthetic:true,evidence_issuance:'disabled'});
  const status=get(issuer.status(owner));expect(status).toMatchObject({state:'stable_observation',primary:null,retained_records:0,changed_fields:[],snapshots_accepted:1,comparisons_committed:1,formal_issuance:'disabled'});
  for(const value of [id,'in progress','global','2026-10-29'])expect(JSON.stringify(status)).not.toContain(value);
});
function initial(s:ReturnType<typeof setup>,value:unknown=row()){const use=get(s.issuer.beginInitial(s.owner)),draft=get(s.issuer.issueDraft(s.owner,use,value));get(s.issuer.acceptInitial(s.owner,draft));return draft;}
function comparison(s:ReturnType<typeof setup>,value:unknown=row()){const use=get(s.issuer.beginFinal(s.owner)),draft=get(s.issuer.issueDraft(s.owner,use,value));return get(s.issuer.prepareComparison(s.owner,draft));}
it.each(Array.from({length:15},(_,i)=>i+1))('detects changed field subset %i with an independent fixed-order oracle and stops without rebasing',mask=>{
  const s=setup();initial(s);const final=row(),keys=['state','application','sys_updated_on','sys_mod_count'] as const,values=['complete','different','2026-10-29 01:00:00','4'];const expected:string[]=[];
  for(let i=0;i<4;i++)if(mask&(1<<i)){final[keys[i]]=values[i];expected.push(keys[i]);}
  const h=comparison(s,final);expect(s.issuer.commitComparison(s.owner,h)).toEqual({ok:false,code:'changed_during_review'});
  expect(get(s.issuer.status(s.owner))).toMatchObject({state:'changed',live:false,primary:'changed_during_review',retained_records:0,changed_fields:expected,field_comparisons:5});
  s.issuer.close(s.session);expect(s.issuer.beginInitial(s.owner)).toEqual({ok:false,code:'changed_during_review'});expect(get(s.issuer.status(s.owner)).changed_fields).toEqual(expected);
});
it('rejects a second consumption of its own initial draft as invalid_state and drops the retained baseline',()=>{
  const s=setup(),draft=initial(s);expect(s.issuer.acceptInitial(s.owner,draft)).toEqual({ok:false,code:'invalid_state'});expect(get(s.issuer.status(s.owner))).toMatchObject({retained_records:0,primary:'invalid_state',snapshots_accepted:1});
});
it('claims only one owner per synthetic session and cannot regenerate it after failure',()=>{
  const s=setup();initial(s);expect(s.issuer.claimOwner(s.session)).toEqual({ok:false,code:'invalid_state'});expect(get(s.issuer.status(s.owner))).toMatchObject({primary:'invalid_state',retained_records:0});
  expect(s.issuer.claimOwner(s.session)).toEqual({ok:false,code:'invalid_state'});expect(s.issuer.beginFinal(s.owner)).toEqual({ok:false,code:'invalid_state'});
});
it.each(['initial','draft','final','comparison','commit'] as const)('rejects duplicate %s generation/consumption and never restores the claim',stage=>{
  const s=setup();
  if(stage==='initial'){get(s.issuer.beginInitial(s.owner));expect(s.issuer.beginInitial(s.owner)).toEqual({ok:false,code:'invalid_state'});}
  else if(stage==='draft'){const u=get(s.issuer.beginInitial(s.owner));get(s.issuer.issueDraft(s.owner,u,row()));expect(s.issuer.issueDraft(s.owner,u,row())).toEqual({ok:false,code:'invalid_state'});}
  else{initial(s);if(stage==='final'){get(s.issuer.beginFinal(s.owner));expect(s.issuer.beginFinal(s.owner)).toEqual({ok:false,code:'invalid_state'});}
    else{const u=get(s.issuer.beginFinal(s.owner)),d=get(s.issuer.issueDraft(s.owner,u,row())),c=get(s.issuer.prepareComparison(s.owner,d));
      if(stage==='comparison')expect(s.issuer.prepareComparison(s.owner,d)).toEqual({ok:false,code:'invalid_state'});
      else{get(s.issuer.commitComparison(s.owner,c));expect(s.issuer.commitComparison(s.owner,c)).toEqual({ok:false,code:'invalid_state'});}
    }}
  expect(get(s.issuer.status(s.owner))).toMatchObject({primary:'invalid_state',live:false,retained_records:0});expect(s.issuer.beginInitial(s.owner)).toEqual({ok:false,code:'invalid_state'});
});
it.each(['same_issuer','other_issuer','copied'] as const)('rejects %s draft mixing without changing the foreign owner',kind=>{
  const a=setup(),use=get(a.issuer.beginInitial(a.owner)),d=get(a.issuer.issueDraft(a.owner,use,row())),before=get(a.issuer.status(a.owner));
  const issuer=kind==='other_issuer'?createSyntheticParentStabilityIssuer({now:()=>0}):a.issuer,session=get(issuer.issueSession({update_set_sys_id:id})),owner=get(issuer.claimOwner(session));get(issuer.beginInitial(owner));
  expect(issuer.acceptInitial(owner,(kind==='copied'?{...d}:d) as typeof d)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(get(a.issuer.status(a.owner))).toEqual(before);expect(get(issuer.status(owner)).retained_records).toBe(0);
});
it('rejects another session use even if its target matches and leaves the issuing session untouched',()=>{
  const a=setup(),u=get(a.issuer.beginInitial(a.owner)),s=get(a.issuer.issueSession({update_set_sys_id:id})),o=get(a.issuer.claimOwner(s));get(a.issuer.beginInitial(o));const before=get(a.issuer.status(a.owner));
  expect(a.issuer.issueDraft(o,u,row())).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(get(a.issuer.status(a.owner))).toEqual(before);
});
it('does not accept an initial draft in the final role or a final draft as a new baseline',()=>{
  const a=setup(),u=get(a.issuer.beginInitial(a.owner)),d=get(a.issuer.issueDraft(a.owner,u,row()));expect(a.issuer.prepareComparison(a.owner,d)).toEqual({ok:false,code:'evidence_binding_mismatch'});
  const b=setup();initial(b);const final=get(b.issuer.beginFinal(b.owner)),end=get(b.issuer.issueDraft(b.owner,final,row()));expect(b.issuer.acceptInitial(b.owner,end)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(get(b.issuer.status(b.owner)).retained_records).toBe(0);
});
it('keeps comparison handles owner-bound and rejects copies without consuming the foreign comparison',()=>{
  const a=setup();initial(a);const c=comparison(a),before=get(a.issuer.status(a.owner)),session=get(a.issuer.issueSession({update_set_sys_id:id})),owner=get(a.issuer.claimOwner(session));
  expect(a.issuer.commitComparison(owner,c)).toEqual({ok:false,code:'evidence_binding_mismatch'});expect(get(a.issuer.status(a.owner))).toEqual(before);get(a.issuer.commitComparison(a.owner,c));
  const b=setup();initial(b);const own=comparison(b);expect(b.issuer.commitComparison(b.owner,{...own} as typeof own)).toEqual({ok:false,code:'evidence_binding_mismatch'});
});
it.each([
  {sys_id:'b'.repeat(32)}, {sys_id:id.toUpperCase()}, {sys_mod_count:3}, {sys_mod_count:'1'.repeat(21)}, {sys_mod_count:'-1'},
  {sys_updated_on:''}, {state:'s'.repeat(101)}, {application:'x'.repeat(33)}, {sys_updated_on:'x'.repeat(41)}, {unknown:'PRIVATE_SECRET'},
])('rejects malformed/foreign parent projection %j as not_verified, never changed',change=>{
  const s=setup(),use=get(s.issuer.beginInitial(s.owner));expect(s.issuer.issueDraft(s.owner,use,{...row(),...change})).toEqual({ok:false,code:'invalid_response'});expect(get(s.issuer.status(s.owner))).toMatchObject({state:'not_verified',retained_records:0,changed_fields:[],comparisons_committed:0});
});
it('rejects missing fields, wrapper JSON and forged/getter/proxy projections without calling their code',()=>{
  let calls=0;const getter={...row()};Object.defineProperty(getter,'state',{get(){calls++;throw Error('PRIVATE_GETTER');}});const missing={...row()} as Partial<ReturnType<typeof row>>;delete missing.application;
  const proxy=new Proxy(row(),{ownKeys(){calls++;throw Error('PRIVATE_PROXY');}});
  for(const raw of [missing,{result:row()},getter,proxy,JSON.stringify(row()),null,[],{...row(),[Symbol('extra')]:'PRIVATE'}]){
    const s=setup(),u=get(s.issuer.beginInitial(s.owner));expect(s.issuer.issueDraft(s.owner,u,raw)).toEqual({ok:false,code:'invalid_response'});
  }expect(calls).toBe(0);
});
it('uses private immutable projections rather than caller object identity, property order or later changes',()=>{
  const s=setup(),first=row(),u=get(s.issuer.beginInitial(s.owner)),d=get(s.issuer.issueDraft(s.owner,u,first));first.state='PRIVATE_CHANGED';get(s.issuer.acceptInitial(s.owner,d));
  const final=Object.fromEntries(Object.entries(row()).reverse());get(s.issuer.commitComparison(s.owner,comparison(s,final)));expect(get(s.issuer.status(s.owner)).state).toBe('stable_observation');
});
it.each([
  ['sys_mod_count','3','03'],['sys_mod_count','90071992547409920','90071992547409921'],['sys_updated_on','2026-10-29 00:00:00','2026-10-28 23:59:59'],
  ['application','','global'],['state','','in progress'],
] as const)('compares %s as exact strings instead of coercing values', (key,a,b)=>{
  const s=setup();initial(s,{...row(),[key]:a});expect(s.issuer.commitComparison(s.owner,comparison(s,{...row(),[key]:b}))).toEqual({ok:false,code:'changed_during_review'});expect(get(s.issuer.status(s.owner)).changed_fields).toEqual([key]);
});
it('accepts equal maximum-length primitive fields without a numeric or date interpretation',()=>{
  const s=setup(),value={sys_id:id,state:'あ'.repeat(100),application:'x'.repeat(32),sys_updated_on:'x'.repeat(40),sys_mod_count:'9'.repeat(20)};initial(s,value);get(s.issuer.commitComparison(s.owner,comparison(s,value)));expect(get(s.issuer.status(s.owner)).field_comparisons).toBe(5);
});
it('preserves the original cancellation state when a later owner generation is refused',()=>{
  const s=setup();initial(s);s.issuer.cancel(s.session);expect(s.issuer.claimOwner(s.session)).toEqual({ok:false,code:'cancelled'});
  expect(get(s.issuer.status(s.owner))).toMatchObject({state:'revoked',primary:'cancelled',retained_records:0});
});
it('classifies initial clock failure separately from malformed session input and never exposes its message',()=>{
  const issuer=createSyntheticParentStabilityIssuer({now(){throw Error('PRIVATE_CLOCK');}});expect(issuer.issueSession({update_set_sys_id:id})).toEqual({ok:false,code:'internal_review_error'});
});
function hooked(){let now=0,hook=()=>{};const issuer=createSyntheticParentStabilityIssuer({now(){hook();return now;}}),session=get(issuer.issueSession({update_set_sys_id:id})),owner=get(issuer.claimOwner(session));return {issuer,session,owner,time:(n:number)=>{now=n;},arm:(fn:()=>void)=>{hook=fn;}};}
it.each(['initial','comparison','commit'] as const)('does not publish %s after cancellation at the final guard',stage=>{
  const s=hooked();
  const use=get(s.issuer.beginInitial(s.owner)),d=get(s.issuer.issueDraft(s.owner,use,row()));let action:()=>{ok:boolean};
  if(stage==='initial')action=()=>s.issuer.acceptInitial(s.owner,d);
  else{get(s.issuer.acceptInitial(s.owner,d));const f=get(s.issuer.beginFinal(s.owner)),end=get(s.issuer.issueDraft(s.owner,f,{...row(),state:'complete'}));
    if(stage==='comparison')action=()=>s.issuer.prepareComparison(s.owner,end);else{const c=get(s.issuer.prepareComparison(s.owner,end));action=()=>s.issuer.commitComparison(s.owner,c);}}
  let calls=0,observed='';s.arm(()=>{if(++calls===2){observed=get(s.issuer.status(s.owner)).state;s.issuer.cancel(s.session);}});
  expect(action()).toEqual({ok:false,code:'cancelled'});expect(observed).toBe(stage==='initial'?'initial_pending':stage==='comparison'?'final_pending':'comparison_pending');
  expect(get(s.issuer.status(s.owner))).toMatchObject({state:'revoked',primary:'cancelled',retained_records:0,changed_fields:[],comparisons_committed:0,snapshots_accepted:stage==='initial'?0:1});
  expect(s.issuer.claimOwner(s.session)).toEqual({ok:false,code:'cancelled'});
});
it('rejects reentrant generation while the owner guard is running and keeps no uncommitted snapshot',()=>{
  const s=hooked(),u=get(s.issuer.beginInitial(s.owner)),d=get(s.issuer.issueDraft(s.owner,u,row()));let armed=true;
  s.arm(()=>{if(armed){armed=false;expect(s.issuer.beginFinal(s.owner)).toEqual({ok:false,code:'invalid_state'});}});
  expect(s.issuer.acceptInitial(s.owner,d)).toEqual({ok:false,code:'invalid_state'});expect(get(s.issuer.status(s.owner))).toMatchObject({retained_records:0,snapshots_accepted:0,primary:'invalid_state'});
});
it('consumes the session owner claim before invoking a reentrant clock',()=>{
  let trigger=false;let session:Parameters<ReturnType<typeof createSyntheticParentStabilityIssuer>['claimOwner']>[0];
  const issuer=createSyntheticParentStabilityIssuer({now(){if(trigger){trigger=false;expect(issuer.claimOwner(session)).toEqual({ok:false,code:'invalid_state'});}return 0;}});
  session=get(issuer.issueSession({update_set_sys_id:id}));trigger=true;expect(issuer.claimOwner(session)).toEqual({ok:false,code:'invalid_state'});expect(issuer.claimOwner(session)).toEqual({ok:false,code:'invalid_state'});
});
it.each([NaN,Infinity,-1,60000])('stops at invalid/expired synthetic time %s and drops all retained fields',time=>{
  const s=setup();initial(s);s.time(time);expect(s.issuer.beginFinal(s.owner)).toEqual({ok:false,code:time===60000?'deadline_exceeded':'invalid_observation_time'});expect(get(s.issuer.status(s.owner)).retained_records).toBe(0);
});
it('does not reset its synthetic session deadline when the owner or snapshots are generated later',()=>{
  let now=0;const issuer=createSyntheticParentStabilityIssuer({now:()=>now}),session=get(issuer.issueSession({update_set_sys_id:id,deadline_ms:1000}));now=500;const owner=get(issuer.claimOwner(session));now=999;
  const u=get(issuer.beginInitial(owner)),d=get(issuer.issueDraft(owner,u,row()));get(issuer.acceptInitial(owner,d));now=1000;expect(issuer.beginFinal(owner)).toEqual({ok:false,code:'deadline_exceeded'});expect(get(issuer.status(owner)).retained_records).toBe(0);
});
it('preserves private record retention at most two and consumes each accepted projection once',()=>{
  const s=setup(),u=get(s.issuer.beginInitial(s.owner)),d=get(s.issuer.issueDraft(s.owner,u,row()));expect(get(s.issuer.status(s.owner)).retained_records).toBe(1);get(s.issuer.acceptInitial(s.owner,d));expect(get(s.issuer.status(s.owner)).retained_records).toBe(1);
  const f=get(s.issuer.beginFinal(s.owner)),end=get(s.issuer.issueDraft(s.owner,f,row()));expect(get(s.issuer.status(s.owner)).retained_records).toBe(2);const c=get(s.issuer.prepareComparison(s.owner,end));expect(get(s.issuer.status(s.owner)).retained_records).toBe(0);get(s.issuer.commitComparison(s.owner,c));
  expect(get(s.issuer.status(s.owner))).toMatchObject({drafts_issued:2,drafts_consumed:2,snapshots_accepted:1,comparisons_prepared:1,comparisons_committed:1,field_comparisons:5});
});
it('cannot resurrect a closed owner or a rejected projection with corrected input',()=>{
  const a=setup(),u=get(a.issuer.beginInitial(a.owner));expect(a.issuer.issueDraft(a.owner,u,{...row(),sys_id:'b'.repeat(32)}).ok).toBe(false);expect(a.issuer.issueDraft(a.owner,u,row())).toEqual({ok:false,code:'invalid_response'});a.issuer.close(a.session);expect(get(a.issuer.status(a.owner))).toMatchObject({state:'not_verified',primary:'invalid_response',retained_records:0});
  const b=setup();initial(b);b.issuer.close(b.session);expect(b.issuer.beginFinal(b.owner)).toEqual({ok:false,code:'closed'});expect(b.issuer.claimOwner(b.session)).toEqual({ok:false,code:'closed'});
});
it('returns opaque handles and frozen field-name-only diagnostics, with no I/O or raw evidence getters',()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('NETWORK_FORBIDDEN');});
  try{const s=setup(),u=get(s.issuer.beginInitial(s.owner)),d=get(s.issuer.issueDraft(s.owner,u,row()));for(const h of [s.session,s.owner,u,d]){expect(Object.isFrozen(h)).toBe(true);expect(Object.getPrototypeOf(h)).toBeNull();expect(JSON.stringify(h)).toBe('{}');}
    get(s.issuer.acceptInitial(s.owner,d));const c=comparison(s,{...row(),application:'PRIVATE_SECRET'});s.issuer.commitComparison(s.owner,c);const status=get(s.issuer.status(s.owner));expect(Object.isFrozen(status.changed_fields)).toBe(true);expect(Reflect.set(status.changed_fields,'0','PRIVATE_LEAK')).toBe(false);expect(JSON.stringify(status)).not.toContain('PRIVATE_SECRET');expect(fetch).not.toHaveBeenCalled();
  }finally{fetch.mockRestore();}
});
it('drops the baseline on a later clock exception and preserves a fixed non-exposing reason',()=>{
  const s=hooked();initial(s);s.arm(()=>{throw Error('PRIVATE_RUNTIME_CLOCK');});expect(s.issuer.beginFinal(s.owner)).toEqual({ok:false,code:'internal_review_error'});expect(get(s.issuer.status(s.owner))).toMatchObject({retained_records:0,state:'not_verified',primary:'internal_review_error'});expect(JSON.stringify(get(s.issuer.status(s.owner)))).not.toContain('PRIVATE_RUNTIME_CLOCK');
});
it.each(['comparison','commit'] as const)('does not publish changed after deadline expiry at the %s post-guard',stage=>{
  const s=hooked();initial(s);const use=get(s.issuer.beginFinal(s.owner)),draft=get(s.issuer.issueDraft(s.owner,use,{...row(),state:'complete'}));
  const c=stage==='commit'?get(s.issuer.prepareComparison(s.owner,draft)):undefined;let ticks=0;s.arm(()=>{if(++ticks===2)s.time(60000);});
  expect(stage==='comparison'?s.issuer.prepareComparison(s.owner,draft):s.issuer.commitComparison(s.owner,c!)).toEqual({ok:false,code:'deadline_exceeded'});
  expect(get(s.issuer.status(s.owner))).toMatchObject({state:'not_verified',primary:'deadline_exceeded',retained_records:0,changed_fields:[],comparisons_committed:0,field_comparisons:5});
});
