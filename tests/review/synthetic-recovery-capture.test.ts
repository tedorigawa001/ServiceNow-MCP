import {expect,it} from 'vitest';
import {createSyntheticRecoveryCaptureAssembly,RecoveryCaptureError,type CaptureWire,type CaptureManifest,type CaptureInput} from '../support/review/synthetic-recovery-capture.js';
import {aggregate} from './fixtures/bp5-results.js';

function fixture(){
  const asset=aggregate().assets[0],r=asset.result;
  return {asset,context:{update_xml_sys_id:asset.update_xml_sys_id,applicable_rule_ids:asset.applicable_rule_ids,
    reviewed_at:r.reviewed_at,target:r.target,instance_binding:r.instance_binding,instance_release:r.instance_release,
    requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations}};
}
it('accepts only after both guards and transfers the private captures once without exposing bodies',()=>{
  const {asset,context}=fixture(),events:string[]=[];
  const root=createSyntheticRecoveryCaptureAssembly([context],{guard:p=>{events.push(p);}});
  const wire=root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(asset)});
  const capture=root.accept(wire);
  expect(events).toEqual(['pre','post']);expect(Reflect.ownKeys(capture)).toHaveLength(0);
  expect(root.summary()).toMatchObject({state:'active',captures:1,wires:0,authority:'none'});
  const manifest=root.transfer();expect(Reflect.ownKeys(manifest)).toHaveLength(0);
  expect(root.summary()).toMatchObject({state:'transferred',captures:0,manifests:1});
  root.discardManifest(manifest);expect(root.summary()).toMatchObject({state:'discarded',manifests:0});
});
it('pins the injected guard once instead of rereading a mutable dependency',()=>{
  const {asset,context}=fixture(),events:string[]=[],deps={guard:(p:'pre'|'post')=>{events.push(p);}};
  const root=createSyntheticRecoveryCaptureAssembly([context],deps);deps.guard=()=>{throw new Error('secret');};
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(asset)}));
  expect(events).toEqual(['pre','post']);
});
function second(){const f=fixture();f.context.update_xml_sys_id='4'.repeat(32);f.context.target.update_xml_sys_id=f.context.update_xml_sys_id;f.asset.update_xml_sys_id=f.context.update_xml_sys_id;return f;}
function rejection(fn:()=>unknown,reason:string){
  let e:unknown;try{fn();}catch(error){e=error;}expect(e).toBeInstanceOf(RecoveryCaptureError);
  expect(e).toMatchObject({reason,message:'internal_review_error',code:'internal_review_error'});
  expect(e).not.toHaveProperty('cause');expect(e).not.toHaveProperty('issues');
}
it('rejects out-of-order acceptance before a later receipt can change fixed manifest order',()=>{
  const a=fixture(),b=second(),root=createSyntheticRecoveryCaptureAssembly([a.context,b.context],{guard:()=>{}});
  const w=root.deliver(root.inputs[1],{id:2,ok:true,json:JSON.stringify(b.asset)});
  rejection(()=>root.accept(w),'state');expect(root.summary()).toMatchObject({state:'failed',captures:0});
});
it('keeps capture unpublished during post guard, retaining the original normalized value privately',()=>{
  const f=fixture();let root:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>;
  root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>{if(p==='post')expect(root.summary()).toMatchObject({captures:0,accepted:0,wires:0});}});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));
  expect(root.summary()).toMatchObject({captures:1,accepted:1});expect(JSON.stringify(root.summary())).not.toContain('findings');
});
it.each(['pre','post'] as const)('rejects cancellation at %s without exposing a capture',phase=>{
  const f=fixture(),events:string[]=[],root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>{events.push(p);if(p===phase)return 'cancelled';}});
  const wire=root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)});
  rejection(()=>root.accept(wire),'cancelled');expect(events).toEqual(phase==='pre'?['pre']:['pre','post']);
  expect(root.summary()).toMatchObject({first_failure:'cancelled',captures:0,wires:0,manifests:0});rejection(()=>root.accept(wire),'cancelled');
});
it.each(['pre','post'] as const)('rejects deadline at %s, preserving the first stop after discard',phase=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>p===phase?'deadline_exceeded':undefined});
  const wire=root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)});rejection(()=>root.accept(wire),'deadline_exceeded');root.discard();
  rejection(()=>root.transfer(),'deadline_exceeded');expect(root.summary()).toMatchObject({state:'failed',accepted:0});
});
it.each(['pre','post'] as const)('rejects unknown guard exception at %s without retaining its secret',phase=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>{if(p===phase)throw new Error('secret marker');}});
  rejection(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)})),'internal');
  expect(JSON.stringify(root.summary())).not.toContain('secret');
});
it.each(['pre','post'] as const)('retains reentry failure at %s even when the fake guard catches it',phase=>{
  const f=fixture();let root:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>;
  root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>{if(p===phase){try{root.transfer();}catch{ /* first hard must survive */ }}}});
  rejection(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)})),'reentrant');expect(root.summary().captures).toBe(0);
});
it('runs post guard on schema failure and gives its stop priority over local mismatch',()=>{
  const f=fixture(),events:string[]=[],root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>{events.push(p);if(p==='post')return 'cancelled';}});
  rejection(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:'{}'})),'cancelled');expect(events).toEqual(['pre','post']);
});
it.each(['wire','input','manifest','copy'] as const)('rejects %s from another owner or a copied handle',kind=>{
  const f=fixture(),a=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}}),b=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  const wa=a.deliver(a.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)});
  if(kind==='wire')rejection(()=>b.accept(wa),'binding');
  if(kind==='input')rejection(()=>b.deliver(a.inputs[0],{id:1,ok:true,json:'{}'}),'binding');
  if(kind==='copy')rejection(()=>a.accept({...wa} as CaptureWire),'binding');
  if(kind==='manifest'){a.accept(wa);const m=a.transfer();b.accept(b.deliver(b.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));b.transfer();rejection(()=>b.discardManifest(m),'binding');}
});
it.each(['deliver','accept','transfer','discardManifest'] as const)('rejects duplicate %s and clears pending authority',operation=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}}),e={id:1,ok:true,json:JSON.stringify(f.asset)},w=root.deliver(root.inputs[0],e);
  if(operation==='deliver')rejection(()=>root.deliver(root.inputs[0],e),'duplicate');
  if(operation==='accept'){root.accept(w);rejection(()=>root.accept(w),'binding');}
  if(operation==='transfer'){root.accept(w);root.transfer();rejection(()=>root.transfer(),'state');}
  if(operation==='discardManifest'){root.accept(w);const m=root.transfer();root.discardManifest(m);rejection(()=>root.discardManifest(m),'binding');}
  expect(root.summary()).toMatchObject({state:'failed',captures:0,wires:0,manifests:0});
});
it('does not reconstruct a manifest from a summary or a CG-A value',()=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  rejection(()=>root.accept(root.summary() as unknown as CaptureWire),'binding');
});
it.each(['target','reviewed_at','binding','release','rules','limitations','applicable'] as const)('rejects mismatched original %s context after post guard',field=>{
  const f=fixture(),events:string[]=[];
  if(field==='target')f.context.target.code_hash='f'.repeat(64);
  if(field==='reviewed_at')f.context.reviewed_at='2026-10-17T05:00:01Z';
  if(field==='binding')f.context.instance_binding='f'.repeat(64);
  if(field==='release')f.context.instance_release={...f.context.instance_release,config_version:'f'.repeat(64)};
  if(field==='rules')f.context.requested_rule_ids=['AU-BR-002'];
  if(field==='limitations')f.context.release_limitations=['missing_warning'];
  if(field==='applicable')f.context.applicable_rule_ids=['AU-BR-002'];
  // Freeze the independently received body before changing the synthetic expected context.
  const actual=fixture().asset,root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:p=>{events.push(p);}});
  rejection(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(actual)})),'context');expect(events).toEqual(['pre','post']);
});
it('owns the expected context copy without freezing or trusting caller aliases',()=>{
  const f=fixture(),json=JSON.stringify(f.asset),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  expect(Object.isFrozen(f.context.target)).toBe(false);f.context.target.code_hash='f'.repeat(64);f.context.release_limitations.push('late');
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json}));expect(root.summary().captures).toBe(1);
});
it.each([{}, {id:2,ok:true,json:'{}'},{id:1,ok:false,json:'{}'},{id:1,ok:true,json:'{}',extra:1}, {id:1,ok:true,json:new String('{}')}])('rejects a malformed/uncorrelated envelope without retry: %j',envelope=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  expect(()=>root.deliver(root.inputs[0],envelope)).toThrow(RecoveryCaptureError);expect(root.summary().state).toBe('failed');
});
it('never invokes accessor/Proxy envelope traps',()=>{
  for(const envelope of [Object.defineProperty({id:1,ok:true},'json',{enumerable:true,get(){throw new Error('getter invoked');}}),new Proxy({},{ownKeys(){throw new Error('trap invoked');}})]){
    const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});rejection(()=>root.deliver(root.inputs[0],envelope),'shape');
  }
});
it.each(['{}','{"state":"reviewed","state":"rejected"}','x'.repeat(262145)])('rejects invalid/full-wire input with no capture (%#)',json=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  expect(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json}))).toThrow(RecoveryCaptureError);expect(root.summary()).toMatchObject({state:'failed',captures:0,wires:0});
});
it('does not invent a reviewed body for an analyze result already omitted',()=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  rejection(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify({state:'result_omitted',update_xml_sys_id:f.asset.update_xml_sys_id,reason:'response_limit'})})),'context');
});
it.each([[],Array(101).fill({}),[{}]])('rejects unsupported synthetic context shape/count: %#',contexts=>{
  rejection(()=>createSyntheticRecoveryCaptureAssembly(contexts,{guard:()=>{}}),'shape');
});
it('rejects duplicate receipts at construction and does not execute context getters',()=>{
  const f=fixture();rejection(()=>createSyntheticRecoveryCaptureAssembly([f.context,f.context],{guard:()=>{}}),'shape');
  const context=Object.defineProperty({},'target',{enumerable:true,get(){throw new Error('secret');}});rejection(()=>createSyntheticRecoveryCaptureAssembly([context],{guard:()=>{}}),'shape');
});
it('accepts the maximum 100 fixed receipts in order and discards the single transferred manifest',()=>{
  const rows=Array.from({length:100},(_,i)=>{const f=fixture(),id=(i+1).toString(16).padStart(32,'0');f.context.update_xml_sys_id=id;f.context.target.update_xml_sys_id=id;f.asset.update_xml_sys_id=id;return f;});
  const root=createSyntheticRecoveryCaptureAssembly(rows.map(f=>f.context),{guard:()=>{}});
  rows.forEach((f,i)=>root.accept(root.deliver(root.inputs[i],{id:i+1,ok:true,json:JSON.stringify(f.asset)})));
  expect(root.summary().accepted).toBe(100);const m=root.transfer();root.discardManifest(m);expect(root.summary()).toMatchObject({captures:0,wires:0,manifests:0});
});
it('keeps normal discard separate from failure and refuses all later use',()=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});root.discard();expect(root.summary()).toMatchObject({state:'discarded',first_failure:null});rejection(()=>root.transfer(),'state');
});
it('revokes transferred captures synchronously on hard stop and never revives them',()=>{
  const f=fixture(),root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));const m=root.transfer();
  rejection(()=>root.stop('cancelled'),'cancelled');rejection(()=>root.discardManifest(m),'cancelled');expect(root.summary()).toMatchObject({manifests:0,captures:0,first_failure:'cancelled'});
});
it('rechecks cancellation before transferring already accepted captures',()=>{
  const f=fixture();let cancelled=false;
  const root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>cancelled?'cancelled':undefined});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));cancelled=true;
  rejection(()=>root.transfer(),'cancelled');expect(root.summary()).toMatchObject({manifests:0,captures:0});
});
it.each(['pre','post'] as const)('checks transfer %s before publishing the manifest',phase=>{
  const f=fixture();let root:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>;
  root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:(p,operation)=>{if(operation==='transfer'){expect(root.summary().manifests).toBe(0);if(p===phase)return 'deadline_exceeded';}}});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));rejection(()=>root.transfer(),'deadline_exceeded');expect(root.summary()).toMatchObject({captures:0,manifests:0});
});
it('retains a transfer reentry failure even if a later post guard returns normally',()=>{
  const f=fixture();let root:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>;
  root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:(_p,operation)=>{if(operation==='transfer')try{root.transfer();}catch{ /* must remain sticky */ }}});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));rejection(()=>root.transfer(),'reentrant');
});
it('rejects transfer before all fixed receipts have been accepted',()=>{
  const f=fixture(),b=second(),root=createSyntheticRecoveryCaptureAssembly([f.context,b.context],{guard:()=>{}});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));rejection(()=>root.transfer(),'state');expect(root.summary().captures).toBe(0);
});
it('rejects async guard substitution and never awaits unbounded work',()=>{
  const f=fixture(),deps={guard:()=>Promise.resolve()} as unknown as Parameters<typeof createSyntheticRecoveryCaptureAssembly>[1];
  const root=createSyntheticRecoveryCaptureAssembly([f.context],deps);rejection(()=>root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)})),'internal');
});
it('rejects getter/Proxy dependencies without invoking them',()=>{
  const f=fixture();
  for(const deps of [Object.defineProperty({},'guard',{get(){throw new Error('secret');}}),new Proxy({},{get(){throw new Error('secret');}})]){
    rejection(()=>createSyntheticRecoveryCaptureAssembly([f.context],deps as Parameters<typeof createSyntheticRecoveryCaptureAssembly>[1]),'shape');
  }
});
it('rejects contexts from different instance/release/update-set domains in one synthetic run',()=>{
  for(const field of ['binding','release','set'] as const){
    const a=fixture(),b=second();
    if(field==='binding')b.context.instance_binding='e'.repeat(64);
    if(field==='release')b.context.instance_release={...b.context.instance_release,config_version:'e'.repeat(64)};
    if(field==='set')b.context.target.update_set_id='e'.repeat(32);
    rejection(()=>createSyntheticRecoveryCaptureAssembly([a.context,b.context],{guard:()=>{}}),'shape');
  }
});
it('rejects a Proxy guard function before it can be invoked',()=>{
  const f=fixture(),guard=new Proxy(()=>{},{apply(){throw new Error('secret');}});
  rejection(()=>createSyntheticRecoveryCaptureAssembly([f.context],{guard}),'shape');
});
it.each(['target_id','applicable_duplicate','requested_duplicate'] as const)('rejects internally inconsistent context %s at construction, which CG-A alone would accept',kind=>{
  const f=fixture();
  if(kind==='target_id')f.context.target.update_xml_sys_id='9'.repeat(32);
  if(kind==='applicable_duplicate')f.context.applicable_rule_ids=['AU-BR-001','AU-BR-001'];
  if(kind==='requested_duplicate')f.context.requested_rule_ids=['AU-BR-001','AU-BR-001'];
  rejection(()=>createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}}),'shape');
});
function counting<T extends object>(target:T){
  const calls:string[]=[];
  const proxy=new Proxy(target,{ownKeys:t=>{calls.push('ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor:(t,k)=>{calls.push('descriptor');return Reflect.getOwnPropertyDescriptor(t,k);},
    getPrototypeOf:t=>{calls.push('prototype');return Reflect.getPrototypeOf(t);},get:(t,k,r)=>{calls.push('get');return Reflect.get(t,k,r);},has:(t,k)=>{calls.push('has');return Reflect.has(t,k);}});
  return {calls,proxy};
}
it.each(['envelope','dependencies','context'] as const)('rejects an otherwise valid transparent %s Proxy without invoking any trap',kind=>{
  const f=fixture();
  if(kind==='envelope'){
    const root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:()=>{}}),{calls,proxy}=counting({id:1,ok:true,json:JSON.stringify(f.asset)});
    rejection(()=>root.deliver(root.inputs[0],proxy),'shape');expect(calls).toEqual([]);
  }
  if(kind==='dependencies'){
    const {calls,proxy}=counting({guard:()=>{}});rejection(()=>createSyntheticRecoveryCaptureAssembly([f.context],proxy),'shape');expect(calls).toEqual([]);
  }
  if(kind==='context'){
    const {calls,proxy}=counting(f.context);rejection(()=>createSyntheticRecoveryCaptureAssembly([proxy],{guard:()=>{}}),'shape');expect(calls).toEqual([]);
  }
});
it.each(['accept','transfer'] as const)('refuses discard reentry from the %s guard and publishes neither capture nor manifest',operation=>{
  const f=fixture();let root:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>;
  root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:(p,op)=>{if(op===operation&&p==='pre')try{root.discard();}catch{ /* first hard must survive */ }}});
  const wire=root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)});
  if(operation==='accept')rejection(()=>root.accept(wire),'reentrant');
  else{root.accept(wire);rejection(()=>root.transfer(),'reentrant');}
  expect(root.summary()).toMatchObject({state:'failed',first_failure:'reentrant',captures:0,manifests:0});
});
it('reports discardManifest reentry from a transfer guard as reentrant, not as a binding miss',()=>{
  const f=fixture();let root:ReturnType<typeof createSyntheticRecoveryCaptureAssembly>;
  root=createSyntheticRecoveryCaptureAssembly([f.context],{guard:(p,op)=>{if(op==='transfer'&&p==='pre')try{root.discardManifest({} as CaptureManifest);}catch{ /* first hard must survive */ }}});
  root.accept(root.deliver(root.inputs[0],{id:1,ok:true,json:JSON.stringify(f.asset)}));
  rejection(()=>root.transfer(),'reentrant');expect(root.summary()).toMatchObject({first_failure:'reentrant',manifests:0});
});
it('maps an invalid explicit stop reason to internal instead of recording caller text',()=>{
  const root=createSyntheticRecoveryCaptureAssembly([fixture().context],{guard:()=>{}});
  rejection(()=>root.stop('caller_reason' as never),'internal');expect(root.summary().first_failure).toBe('internal');
});
// Compile-time brands do not let a descriptor/summary or a different resource become a wire/capture/manifest.
function staticBrands(input:CaptureInput,wire:CaptureWire,manifest:CaptureManifest){
  // @ts-expect-error A job/input is not a delivery.
  const wrong:CaptureWire=input;
  // @ts-expect-error A delivery is not a transferred manifest.
  const wrongManifest:CaptureManifest=wire;
  return [wrong,wrongManifest,manifest];
}
void staticBrands;
