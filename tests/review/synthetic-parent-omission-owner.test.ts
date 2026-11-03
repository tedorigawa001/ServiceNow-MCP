import {expect,it} from 'vitest';
import {createSyntheticParentOmissionAssembly,createSyntheticRecoveryCaptureAssembly,RecoveryCaptureError,type ParentReviewedCapture,type ParentOmissionCleanup} from '../support/review/synthetic-recovery-capture.js';
import {aggregate} from './fixtures/bp5-results.js';
const id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(counts=[99,2]){
  const assets=counts.map((count,i)=>{const a=aggregate().assets[0],r=a.result;a.update_xml_sys_id=r.target.update_xml_sys_id=id(i+1);r.findings=Array.from({length:count},()=>structuredClone(r.findings[0]));return a;});
  return {config:{kind:'synthetic_parent_omission_owner_v1',model_id:'recovery-omission-v1',schema_version:'bp-mcp-review-0.2',prefix:{limitations:[] as string[],errors:[] as unknown[]},
    contexts:assets.map(a=>({update_xml_sys_id:a.update_xml_sys_id,applicable_rule_ids:a.applicable_rule_ids,reviewed_at:a.result.reviewed_at,target:a.result.target,instance_binding:a.result.instance_binding,instance_release:a.result.instance_release,requested_rule_ids:a.result.coverage.requested_rule_ids,release_limitations:a.result.limitations}))},
    responses:assets.map((a,i)=>({id:i+1,ok:true,json:JSON.stringify(a)}))};
}
it('binds one parent decision to each same-owner capture and derives the prefix in order',()=>{
  const f=fixture(),root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined});
  const a=root.accept(root.deliver(root.inputs[0],f.responses[0])),d=root.decide(a);
  expect(Reflect.ownKeys(d)).toEqual([]);expect(root.summary()).toMatchObject({authority:'none',decided:1,kept_findings:99,kept:1,omitted:0});
  const b=root.accept(root.deliver(root.inputs[1],f.responses[1]));root.decide(b);
  expect(root.summary()).toMatchObject({decided:2,kept_findings:99,kept:1,omitted:1,pending_decisions:2,retained_captures:2});
});
it('consumes a decision once on the fixed terminal discard path and releases its original capture',()=>{
  const f=fixture([1]),root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined}),capture=root.accept(root.deliver(root.inputs[0],f.responses[0])),decision=root.decide(capture);
  root.discardDecision(decision);expect(root.summary()).toMatchObject({state:'discarded',pending_decisions:0,retained_captures:0,consumed_decisions:1});
  expect(()=>root.discardDecision(decision)).toThrow('internal_review_error');expect(()=>root.decide(capture)).toThrow('internal_review_error');
});
it('invalidates decisions synchronously at cleanup start and retains only diagnostic cleanup',()=>{
  const f=fixture([1]),root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined}),capture=root.accept(root.deliver(root.inputs[0],f.responses[0]));root.decide(capture);
  const sink=root.beginCleanup();expect(root.summary()).toMatchObject({state:'invalidated',pending_decisions:0,retained_captures:0,cleanup:'pending'});
  root.recordCleanup(sink,'confirmed');expect(()=>root.decide(capture)).toThrow('internal_review_error');expect(root.summary().cleanup).toBe('confirmed');
});
function setup(counts=[1]){
  const f=fixture(counts);let check:()=>string|undefined=()=>undefined;
  const root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>check() as 'cancelled'|'deadline_exceeded'|undefined});
  return {...f,root,arm:(fn:()=>string|undefined)=>{check=fn;}};
}
function captured(f:ReturnType<typeof setup>,i=0){return f.root.accept(f.root.deliver(f.root.inputs[i],f.responses[i]));}
it.each([
  [[99,1],[2,0,100]],[[100,0],[2,0,100]],[[99,2,1],[2,1,100]],[[50,51,50],[2,1,100]],[[100,1,1],[1,2,100]],
] as const)('matches the fixed same-capture finding oracle %j',(counts,expected)=>{
  const f=setup([...counts]);for(let i=0;i<counts.length;i++)f.root.decide(captured(f,i));
  expect([f.root.summary().kept,f.root.summary().omitted,f.root.summary().kept_findings]).toEqual(expected);
});
it('does not accept the next capture before deciding the previous one',()=>{
  const f=setup([1,1]),first=captured(f);expect(()=>captured(f,1)).toThrow('internal_review_error');
  expect(()=>f.root.decide(first)).toThrow('internal_review_error');expect(f.root.summary()).toMatchObject({state:'failed',decided:0,retained_captures:0});
});
it.each(['capture','copy','wire','input','decision','summary'] as const)('rejects foreign or non-capture %s without changing its owner',kind=>{
  const a=setup(),b=setup(),own=captured(a),wire=b.root.deliver(b.root.inputs[0],b.responses[0]),foreign=b.root.accept(wire),decision=b.root.decide(foreign),before=b.root.summary();
  const value=kind==='capture'?foreign:kind==='copy'?{...own}:kind==='wire'?wire:kind==='input'?a.root.inputs[0]:kind==='decision'?decision:a.root.summary();
  expect(()=>a.root.decide(value as ParentReviewedCapture)).toThrow('internal_review_error');expect(a.root.summary()).toMatchObject({state:'failed',pending_decisions:0,retained_captures:0});expect(b.root.summary()).toEqual(before);
});
it('does not upgrade captures from the legacy root and keeps both API surfaces separate',()=>{
  const f=fixture([1]),legacy=createSyntheticRecoveryCaptureAssembly(f.config.contexts,{guard:()=>undefined}),old=legacy.accept(legacy.deliver(legacy.inputs[0],f.responses[0]));
  const fresh=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined});
  // @ts-expect-error Legacy capture is not a parent-owner capture.
  expect(()=>fresh.decide(old)).toThrow('internal_review_error');
  expect(legacy.summary()).toMatchObject({state:'active',captures:1});expect(legacy).not.toHaveProperty('decide');expect(legacy.summary()).not.toHaveProperty('decided');
  expect(fresh).not.toHaveProperty('transfer');expect(fresh).not.toHaveProperty('discardManifest');expect(fresh).not.toHaveProperty('body');
});
it('consumes the same keep decision claim once and refuses a second start without revival',()=>{
  const f=setup(),c=captured(f),decision=f.root.decide(c);expect(()=>f.root.decide(c)).toThrow('internal_review_error');expect(f.root.summary()).toMatchObject({state:'failed',decided:1,pending_decisions:0,retained_captures:0});
  expect(()=>f.root.discardDecision(decision)).toThrow('internal_review_error');
});
it.each(['foreign','copy','capture','summary'] as const)('rejects a %s terminal consume',kind=>{
  const a=setup(),b=setup(),capture=captured(a),d=a.root.decide(capture),other=b.root.decide(captured(b)),before=b.root.summary();
  const value=kind==='foreign'?other:kind==='copy'?{...d}:kind==='capture'?capture:a.root.summary();
  expect(()=>a.root.discardDecision(value as typeof d)).toThrow('internal_review_error');expect(a.root.summary().pending_decisions).toBe(0);expect(b.root.summary()).toEqual(before);
});
it.each(['cancelled','deadline_exceeded'] as const)('preserves %s at each accept/decision guard and never publishes a partial decision',reason=>{
  for(const point of [1,2,3,4]){
    const f=setup();let n=0;f.arm(()=>++n===point?reason:undefined);
    expect(()=>f.root.decide(captured(f))).toThrow('internal_review_error');expect(n).toBeGreaterThanOrEqual(point);
    expect(f.root.summary()).toMatchObject({state:'failed',first_failure:reason,decided:0,pending_decisions:0,retained_captures:0});
    f.arm(()=>undefined);const sink=f.root.beginCleanup();f.root.recordCleanup(sink,'confirmed');expect(f.root.summary()).toMatchObject({first_failure:reason,cleanup:'confirmed'});
  }
});
it('gives the post-guard stop priority over a mismatched capture',()=>{
  const f=setup();let n=0;f.arm(()=>++n===2?'deadline_exceeded':undefined);
  expect(()=>f.root.decide({} as ParentReviewedCapture)).toThrow('internal_review_error');expect(f.root.summary().first_failure).toBe('deadline_exceeded');
});
it.each(['decide','discard','source','cleanup','record','stop'] as const)('rejects swallowed %s reentry at each guarded phase',operation=>{
  for(const point of [1,2,3,4]){
    const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
      if(operation==='decide')f.root.decide({} as ParentReviewedCapture);else if(operation==='discard')f.root.discard();else if(operation==='source')f.root.beginSourceClose();else if(operation==='cleanup')f.root.beginCleanup();else if(operation==='record')f.root.recordCleanup({} as ParentOmissionCleanup,'confirmed');else f.root.stop('cancelled');
    }catch{/* deliberately swallowed */}return undefined;});
    expect(()=>f.root.decide(captured(f))).toThrow('internal_review_error');expect(f.root.summary()).toMatchObject({state:'failed',decided:0,pending_decisions:0,retained_captures:0});
  }
});
it.each(['source','cleanup','discard','stop'] as const)('drops already issued decisions and the original bodies on %s',event=>{
  const f=setup([100,1]);f.root.decide(captured(f,0));const c=captured(f,1);f.root.decide(c);const before=f.root.summary();
  if(event==='source')f.root.beginSourceClose();else if(event==='cleanup')f.root.beginCleanup();else if(event==='discard')f.root.discard();else expect(()=>f.root.stop('cancelled')).toThrow('internal_review_error');
  const s=f.root.summary();expect(s).toMatchObject({decided:2,kept:1,omitted:1,retained_captures:0,pending_decisions:0,warnings:before.warnings,errors:before.errors});expect(()=>f.root.decide(c)).toThrow('internal_review_error');
});
it('keeps cleanup terminal-only, one-shot and owner-bound after failure',()=>{
  const a=setup(),b=setup();expect(()=>a.root.stop('deadline_exceeded')).toThrow();const sink=a.root.beginCleanup(),other=b.root.beginCleanup();
  expect(()=>a.root.recordCleanup(other,'confirmed')).toThrow();a.root.recordCleanup(sink,'unconfirmed');expect(()=>a.root.recordCleanup(sink,'confirmed')).toThrow();
  expect(a.root.summary()).toMatchObject({first_failure:'deadline_exceeded',cleanup:'unconfirmed',pending_decisions:0});expect(b.root.summary().cleanup).toBe('pending');
});
it.each([{warnings:[],expected:3},{warnings:['response_truncated'],expected:1}])('pins the initial warning prefix and preserves parent-specific suppression %j',({warnings,expected})=>{
  const f=fixture([100,1]);f.config.prefix.limitations=warnings;f.config.prefix.errors=Array(100).fill({stage:'analysis',code:'internal_review_error'});
  const root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined});f.config.prefix.limitations.push('caller mutation');
  for(let i=0;i<2;i++)root.decide(root.accept(root.deliver(root.inputs[i],f.responses[i])));
  expect(root.summary()).toMatchObject({omitted:1,warnings:expected,errors:100});
});
it.each(['extra','count','model','version','missing_context','reverse','duplicate','empty','prefix_over','nonreviewed','bad_json','context_mismatch'] as const)('rejects %s without upgrading caller data',kind=>{
  const f=fixture([1,1]);
  if(kind==='extra')Object.assign(f.config,{verified:true});if(kind==='count')Object.assign(f.config,{kept_findings:99});if(kind==='model')f.config.model_id='other';if(kind==='version')f.config.schema_version='other';
  if(kind==='missing_context')f.config.contexts.pop();if(kind==='reverse')f.config.contexts.reverse();if(kind==='duplicate')f.config.contexts[1]=f.config.contexts[0];if(kind==='empty')f.config.contexts=[];
  if(kind==='prefix_over')f.config.prefix.limitations=Array(101).fill('x');
  if(kind==='nonreviewed')f.responses[0].json=JSON.stringify({state:'result_omitted',update_xml_sys_id:id(1),reason:'response_limit'});if(kind==='bad_json')f.responses[0].json='{}';if(kind==='context_mismatch')f.config.contexts[0].instance_binding='e'.repeat(64);
  const run=()=>{const root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined});for(let i=0;i<2;i++)root.decide(root.accept(root.deliver(root.inputs[i],f.responses[i])));};
  expect(run).toThrow('internal_review_error');
});
it('does not invoke caller getters/proxies/extra dependencies or emit raw callback exceptions',()=>{
  let touches=0;const trap=()=>{touches++;throw Error('SECRET');};
  for(const raw of [new Proxy({}, {get:trap,ownKeys:trap}),Object.defineProperty(fixture().config,'prefix',{get:trap}),{...fixture().config,prefix:new Proxy({}, {get:trap})}])expect(()=>createSyntheticParentOmissionAssembly(raw,{guard:()=>undefined})).toThrow('internal_review_error');
  expect(()=>createSyntheticParentOmissionAssembly(fixture().config,{guard:()=>undefined,extra:true} as unknown as Parameters<typeof createSyntheticParentOmissionAssembly>[1])).toThrow('internal_review_error');expect(touches).toBe(0);
  const f=fixture([1]),root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>{throw Error('SECRET');}});try{root.accept(root.deliver(root.inputs[0],f.responses[0]));}catch(error){expect(error).toBeInstanceOf(RecoveryCaptureError);expect((error as Error).message).toBe('internal_review_error');expect(error).not.toHaveProperty('cause');expect(JSON.stringify(error)).not.toContain('SECRET');}
});
it('does not expose body/capture identities in summaries or allow old mutable caller aliases',()=>{
  const f=setup([99,2]),c=captured(f);f.responses[0].json='secret changed body';f.config.contexts[0].target.code_hash='e'.repeat(64);f.root.decide(c);f.root.decide(captured(f,1));
  const text=JSON.stringify(f.root.summary());for(const s of ['secret changed body','"findings"','recommendation','code_hash',id(1),id(2)])expect(text).not.toContain(s);
  expect(f.root.summary()).toMatchObject({kept_findings:99,omitted:1});expect(f.root.summary().unverified).toContain('manifest');
});
it('supports 0.3 and keeps decision/capture/cleanup handles nominally separate',()=>{
  const f=fixture([1]);f.config.schema_version='bp-mcp-review-0.3';const root=createSyntheticParentOmissionAssembly(f.config,{guard:()=>undefined}),c=root.accept(root.deliver(root.inputs[0],f.responses[0])),d=root.decide(c);
  // @ts-expect-error A decision is not a reviewed capture or cleanup terminal.
  const wrong:ParentReviewedCapture=d;void wrong;expect(Object.isFrozen(d)).toBe(true);expect(Reflect.ownKeys(d)).toEqual([]);root.discardDecision(d);
});
it.each(['extra','duplicate'])('consumes invalid %s decision attempts and gives the post stop priority',kind=>{
  const f=setup(),c=captured(f);if(kind==='duplicate')f.root.decide(c);let n=0;f.arm(()=>++n===2?'deadline_exceeded':undefined);
  expect(()=>f.root.decide(c,...(kind==='extra'?[{}]:[]))).toThrow('internal_review_error');expect(f.root.summary()).toMatchObject({state:'failed',first_failure:'deadline_exceeded',pending_decisions:0});
});
it.each(['accept','deliver'] as const)('refuses extra %s arguments without leaving a usable capture',operation=>{
  const f=setup(),wire=f.root.deliver(f.root.inputs[0],f.responses[0]);
  expect(()=>operation==='accept'?f.root.accept(wire,{}):f.root.deliver(f.root.inputs[0],f.responses[0],{})).toThrow('internal_review_error');expect(f.root.summary()).toMatchObject({state:'failed',retained_captures:0,pending_decisions:0});
});
it('pins the guard function and sanitizes unknown stops without emitting their text',()=>{
  let calls=0;const f=fixture([1]),deps={guard:()=>{calls++;return undefined;}},root=createSyntheticParentOmissionAssembly(f.config,deps);deps.guard=()=>{throw Error('replacement');};
  root.decide(root.accept(root.deliver(root.inputs[0],f.responses[0])));expect(calls).toBe(4);
  const a=setup();a.arm(()=>'secret unknown stop');expect(()=>a.root.decide(captured(a))).toThrow('internal_review_error');expect(a.root.summary().first_failure).toBe('internal');expect(JSON.stringify(a.root.summary())).not.toContain('secret');
});
it('rejects cleanup before start, unknown disposition and double starts, preserving the first hard',()=>{
  const f=setup();expect(()=>f.root.recordCleanup({} as ParentOmissionCleanup,'confirmed')).toThrow();const sink=f.root.beginCleanup();
  expect(()=>f.root.beginCleanup()).toThrow();expect(()=>f.root.recordCleanup(sink,'unknown' as 'confirmed')).toThrow();f.root.recordCleanup(sink,'confirmed');
  f.root.beginSourceClose();expect(()=>f.root.beginSourceClose()).toThrow();expect(f.root.summary()).toMatchObject({first_failure:'binding',cleanup:'confirmed',pending_decisions:0,retained_captures:0});
});
it('supports 100 ordered zero-finding captures with 100 one-shot decisions and refuses 101',()=>{
  const f=setup(Array(100).fill(0));for(let i=0;i<100;i++)f.root.decide(captured(f,i));expect(f.root.summary()).toMatchObject({accepted:100,decided:100,kept_findings:0,kept:100,omitted:0,pending_decisions:100});f.root.discard();expect(f.root.summary().retained_captures).toBe(0);
  const over=fixture(Array(101).fill(0));expect(()=>createSyntheticParentOmissionAssembly(over.config,{guard:()=>undefined})).toThrow('internal_review_error');
});
