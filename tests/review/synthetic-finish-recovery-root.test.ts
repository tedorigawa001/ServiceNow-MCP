import {expect,it} from 'vitest';
import {createSyntheticFinishRecoveryRoot} from '../support/review/synthetic-finish-recovery-root.js';
import {createSyntheticSoftRecoveryIssuer} from '../support/review/synthetic-soft-recovery.js';
import {createSyntheticFinishAssembly} from '../support/review/synthetic-finish-assembly.js';
import type {SyntheticFinishContextEvidence} from '../support/review/synthetic-finish-context-values.js';
const S='2026-11-02T00:00:00.000Z',O='2026-11-02T00:00:01.000Z',U='2026-11-02T00:00:02.000Z';
function fixture(){return {kind:'synthetic_finish_recovery_root_v1',time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},point:'analyze_timer'};}
function legacy(){const seed={run:{},session:{},source:{},key:{},origin:{},budget:{},release:{},started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},facts={kind:'phase_deadline',point:'phase_guard',phase:'metadata',worker_state:'none'} as const;const owner=createSyntheticSoftRecoveryIssuer(seed,facts);return {owner,binding:owner.bind(seed),facts};}
function write(raw:unknown,path:string,value:unknown){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;v[keys.at(-1)!]=value;}
function remove(raw:unknown,path:string){const keys=path.split('.');let v=raw as Record<string,unknown>;for(const k of keys.slice(0,-1))v=v[k] as Record<string,unknown>;delete v[keys.at(-1)!];}
function rejects(raw:unknown){let checks=0;const root=createSyntheticFinishRecoveryRoot(raw,()=>{checks++;return undefined;});expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect()).toMatchObject({state:'failed',route_bound:false,evidence_issues:0,diagnostics:{hard:{code:'internal_review_error',phase:'binding'}}});expect(()=>root.bind()).toThrow('internal_review_error');return checks;}
it('creates a fresh closed finish-recovery root through the shared recovery lifecycle',()=>{
  const root=createSyntheticFinishRecoveryRoot(fixture()),binding=root.bind(),observation=root.observe(binding),recovery=root.claimRecovery(binding,observation);
  expect(root.consumeRecovery(binding,recovery)).toMatchObject({authority:'none',kind:'worker_deadline',phase:'analysis',point:'analyze_timer'});
  expect(root.inspect()).toMatchObject({scope:'synthetic_finish_recovery_root',authority:'none',state:'consumed',route_bound:false,evidence_issues:0});
  expect(Object.keys(root)).toEqual(['bind','observe','claimRecovery','consumeRecovery','revoke','close','inspect']);
});
it('does not coerce an arbitrary point object while rejecting construction input',()=>{
  let calls=0;const raw=fixture();Object.defineProperty(raw,'point',{value:{[Symbol.toPrimitive](){calls++;throw Error('SECRET');}}});
  const root=createSyntheticFinishRecoveryRoot(raw);expect(()=>root.bind()).toThrow('internal_review_error');expect(calls).toBe(0);
});
it.each([
  ['request_check_unstarted','none'],['request_check_existing','ready'],['ready_timer','starting'],['ready_reply_check','starting'],['send_check','ready'],['analyze_timer','ready'],['analyze_reply_check','ready'],
])('constructs the fixed %s topology without caller worker references',(point,state)=>{
  const raw=fixture();raw.point=point;const root=createSyntheticFinishRecoveryRoot(raw),b=root.bind(),o=root.observe(b);
  expect(root.inspect().diagnostics.soft).toEqual({kind:'worker_deadline',point,phase:'analysis',worker_state:state});
  root.consumeRecovery(b,root.claimRecovery(b,o));expect(root.inspect().state).toBe('consumed');
});
it('uses only one pair of shared-kernel guards per operation, and inspect has no guard side effects',()=>{
  let guards=0;const root=createSyntheticFinishRecoveryRoot(fixture(),()=>{guards++;return undefined;});expect(guards).toBe(0);
  const b=root.bind();expect(guards).toBe(2);const o=root.observe(b);expect(guards).toBe(4);const r=root.claimRecovery(b,o);expect(guards).toBe(6);root.consumeRecovery(b,r);expect(guards).toBe(8);
  root.inspect();root.inspect();expect(guards).toBe(8);root.close(b);expect(guards).toBe(10);expect(root.inspect().state).toBe('closed');
});
it.each(['binding','observation','recovery'] as const)('rejects another root or copy at %s and leaves the other root unchanged',stage=>{
  for(const copy of [false,true]){
    const a=createSyntheticFinishRecoveryRoot(fixture()),b=createSyntheticFinishRecoveryRoot(fixture()),ab=a.bind(),bb=b.bind();
    let run:()=>unknown;
    if(stage==='binding')run=()=>a.observe(copy?{...ab}:bb);
    else{const ao=a.observe(ab),bo=b.observe(bb);
      if(stage==='observation')run=()=>a.claimRecovery(ab,copy?{...ao}:bo);
      else{const ar=a.claimRecovery(ab,ao),br=b.claimRecovery(bb,bo);run=()=>a.consumeRecovery(ab,copy?{...ar}:br);}
    }
    const before=b.inspect();expect(run).toThrow('internal_review_error');expect(a.inspect().state).toBe('failed');expect(b.inspect()).toEqual(before);
  }
});
it('rejects legacy binding without changing legacy state, and preserves the old legacy API',()=>{
  const old=legacy(),before=old.owner.inspect(),root=createSyntheticFinishRecoveryRoot(fixture());root.bind();expect(()=>root.observe(old.binding)).toThrow('internal_review_error');expect(old.owner.inspect()).toEqual(before);
  const o=old.owner.observe(old.binding,old.facts);expect(old.owner.consumeRecovery(old.binding,old.owner.claimRecovery(old.binding,o))).toMatchObject({authority:'none',kind:'phase_deadline'});
});
it('keeps new binding, legacy binding, data-only binding and FinishContextEvidence as separate static types',()=>{
  type RootBinding=ReturnType<ReturnType<typeof createSyntheticFinishRecoveryRoot>['bind']>;
  type LegacyBinding=ReturnType<ReturnType<typeof createSyntheticSoftRecoveryIssuer>['bind']>;
  type PinBinding=ReturnType<ReturnType<typeof createSyntheticFinishAssembly>['bind']>;
  const notLegacy:RootBinding extends LegacyBinding?true:false=false,notPins:RootBinding extends PinBinding?true:false=false,notEvidence:RootBinding extends SyntheticFinishContextEvidence?true:false=false;
  expect([notLegacy,notPins,notEvidence]).toEqual([false,false,false]);
});
it.each(['bind','observe','claim','consume'] as const)('rejects a second %s rather than resetting claims',stage=>{
  const root=createSyntheticFinishRecoveryRoot(fixture()),b=root.bind();let run:()=>unknown;
  if(stage==='bind')run=()=>root.bind();else{const o=root.observe(b);if(stage==='observe')run=()=>root.observe(b);else{const r=root.claimRecovery(b,o);if(stage==='claim')run=()=>root.claimRecovery(b,o);else{root.consumeRecovery(b,r);run=()=>root.consumeRecovery(b,r);}}}
  expect(run).toThrow('internal_review_error');expect(root.inspect().state).toBe('failed');expect(()=>root.bind()).toThrow('internal_review_error');
});
it.each(['kind','time','point','time.started_at','time.deadline_ms','time.observed_at','time.upper_utc'])('rejects missing construction field %s',path=>{const raw=fixture();remove(raw,path);rejects(raw);});
it.each(['owner','seed','facts','binding','source','receipt','frame','ready','handoff','mode','pin','issuer','summary'])('does not allow post-registration or mode selection through %s',key=>{const raw=fixture();write(raw,key,{});rejects(raw);});
it.each([
  ['kind','synthetic_finish_seed_v1'],['point','phase_guard'],['point',null],['point',{}],['point',()=>{}],['time.deadline_ms',0],['time.deadline_ms',60001],['time.deadline_ms',1.5],['time.started_at','SECRET'],['time.upper_utc',S],['time.observed_at','2026-11-02T00:00:03.000Z'],['time',{}],['time.owner',{}],
])('rejects invalid construction value %s',(path,value)=>{const raw=fixture();write(raw,path as string,value);rejects(raw);});
it('pins only the bounded descriptor values and never adopts later caller mutation',()=>{
  const raw=fixture(),root=createSyntheticFinishRecoveryRoot(raw);raw.point='SECRET';raw.time.started_at='SECRET';
  const b=root.bind(),o=root.observe(b);root.consumeRecovery(b,root.claimRecovery(b,o));expect(JSON.stringify(root.inspect())).not.toContain('SECRET');
});
it('keeps the existing equality boundary O=U valid without widening the deadline',()=>{
  const raw=fixture();raw.time.observed_at=U;const root=createSyntheticFinishRecoveryRoot(raw),b=root.bind();root.consumeRecovery(b,root.claimRecovery(b,root.observe(b)));expect(root.inspect().state).toBe('consumed');
});
it('does not invoke getters, symbol coercion or the external guard for structurally invalid input',()=>{
  let getters=0;const raw=fixture();Object.defineProperty(raw,'time',{get(){getters++;throw Error('SECRET');}});expect(rejects(raw)).toBe(0);expect(getters).toBe(0);
  const symbol=fixture();Object.defineProperty(symbol,Symbol('SECRET'),{value:{}});rejects(symbol);rejects(new Proxy(fixture(),{}));
});
it('rejects bind/observe extra arguments instead of accepting caller seed/facts',()=>{
  const a=createSyntheticFinishRecoveryRoot(fixture());expect(()=>a.bind({owner:{}})).toThrow('internal_review_error');
  const b=createSyntheticFinishRecoveryRoot(fixture()),bb=b.bind();expect(()=>b.observe(bb,{point:'SECRET'})).toThrow('internal_review_error');
});
it.each(Array.from({length:8},(_,i)=>i+1))('retains cancellation at guard %i and never resumes after it',at=>{
  let count=0;const root=createSyntheticFinishRecoveryRoot(fixture(),()=>++count===at?'cancelled':undefined);
  expect(()=>{const b=root.bind(),o=root.observe(b),r=root.claimRecovery(b,o);root.consumeRecovery(b,r);}).toThrow('cancelled');
  expect(root.inspect()).toMatchObject({state:'failed',diagnostics:{hard:{code:'cancelled'}},route_bound:false,evidence_issues:0});
  root.revoke('deadline_exceeded');expect(()=>root.bind()).toThrow('cancelled');
});
it('rejects swallowed reentrant bind in the shared guard without a second owner',()=>{
  let root:ReturnType<typeof createSyntheticFinishRecoveryRoot>,once=false;
  root=createSyntheticFinishRecoveryRoot(fixture(),()=>{if(!once){once=true;try{root.bind();}catch{/* no resurrection */}}return undefined;});
  expect(()=>root.bind()).toThrow('internal_review_error');expect(root.inspect().state).toBe('failed');expect(()=>root.bind()).toThrow('internal_review_error');
});
it('clears the root at normal close and refuses reopening or a finish route',()=>{
  const root=createSyntheticFinishRecoveryRoot(fixture()),b=root.bind();root.close(b);expect(root.inspect()).toMatchObject({state:'closed',route_bound:false,evidence_issues:0});expect(()=>root.bind()).toThrow('internal_review_error');
  for(const key of ['prepare','attach','acceptRoute','issueFinishContext','transferWorkerRecoveryPlan','seed','facts','pin','core'])expect(Object.hasOwn(root,key)).toBe(false);
});
it('does not expose UTC/identity/material through diagnostics or raw thrown details',()=>{
  const root=createSyntheticFinishRecoveryRoot(fixture(),()=>{throw Error('SECRET');});expect(()=>root.bind()).toThrow('internal_review_error');const visible=JSON.stringify(root.inspect());for(const text of ['SECRET',S,O,U,'started_at','upper_utc','receipt','generation'])expect(visible).not.toContain(text);
});
