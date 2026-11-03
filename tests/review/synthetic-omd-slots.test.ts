import {expect,it} from 'vitest';
import {createSyntheticMixedSlotAssembly} from '../support/review/synthetic-omd-slots.js';
import {aggregate} from './fixtures/bp5-results.js';
import type {MixedRow,MixedReceipt,MixedSlot,InitialMixedPrefix} from '../support/review/synthetic-omd-slots.js';

const id=(n:number)=>n.toString(16).padStart(32,'0');
function reviewed(n:number,count:number){
  const outcome=aggregate().assets[0];outcome.update_xml_sys_id=outcome.result.target.update_xml_sys_id=id(n);
  outcome.result.findings=Array.from({length:count},()=>structuredClone(outcome.result.findings[0]));
  return {producer:'analysis',outcome};
}
function fixture(){
  const rows=[reviewed(1,99),{producer:'metadata',outcome:{state:'not_applicable',update_xml_sys_id:id(2),asset_type:'other',reason:'asset_type_unsupported'}},
    reviewed(3,2),{producer:'analysis',outcome:{state:'result_omitted',update_xml_sys_id:id(4),reason:'response_limit'}},
    {producer:'retrieval',outcome:{state:'retrieval_failed',update_xml_sys_id:id(5),reason:'payload_unavailable'}},
    {producer:'analysis',outcome:{state:'rejected',update_xml_sys_id:id(6),reason:'invalid_xml'}},
    {producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id(7),reason:'deadline_exceeded'}}];
  return {kind:'synthetic_omd_slots_v1',model_id:'recovery-omission-v1',schema_version:'bp-mcp-review-0.2',
    selected:rows.map((_,i)=>id(i+1)),prefix:{limitations:[] as string[],errors:[] as unknown[]},rows};
}
it('consumes a strict mixed sequence in the same row/receipt order without adopting an accepted plan',()=>{
  const root=createSyntheticMixedSlotAssembly(fixture(),{guard:()=>undefined});let step=root.begin();
  for(const {row,receipt} of root.rows){
    if(step.stage==='complete')throw Error('early completion');
    const slot=root.generate(row,receipt,step.prefix);expect(Reflect.ownKeys(slot)).toEqual([]);
    step=root.consume(row,receipt,slot);
  }
  expect(step.stage).toBe('complete');
  expect(root.summary()).toMatchObject({authority:'none',state:'complete',generated:7,consumed:7,pending_slots:0,
    variants:{kept_reviewed:1,parent_omitted:1,original_worker_omitted:1,metadata:1,retrieval:1,analysis_rejected:1,retained:1},
    kept_findings:99,captures:2,warnings:2,errors:1,permissions:{accepted_adoption:false,comparison:false,candidate:false,formal_issuance:false}});
  for(const key of ['accepted','plan','compare','candidate','body','transfer','seal'])expect(root).not.toHaveProperty(key);
  root.discard();expect(root.summary()).toMatchObject({state:'discarded',retained_originals:0,pending_prefixes:0});
});
function setup(raw:unknown=fixture()){
  let fn:()=>unknown=()=>undefined;
  const root=createSyntheticMixedSlotAssembly(raw,{guard:()=>fn()});
  return {root,arm:(next:()=>unknown)=>{fn=next;}};
}
function firstSlot(f:ReturnType<typeof setup>){
  const p=f.root.begin();if(p.stage!=='initial')throw Error();const pair=f.root.rows[0];
  return {...pair,slot:f.root.generate(pair.row,pair.receipt,p.prefix),prefix:p.prefix};
}
it.each(['row','receipt','prefix','slot','copy','summary'] as const)('rejects mixed %s identity without modifying the other assembly',kind=>{
  const a=setup(),b=setup(),ap=a.root.begin(),bp=b.root.begin();if(ap.stage!=='initial'||bp.stage!=='initial')throw Error();
  const [ar,br]=[a.root.rows[0],b.root.rows[0]],before=b.root.summary();
  const bad=kind==='row'?br.row:kind==='receipt'?br.receipt:kind==='prefix'?bp.prefix:kind==='slot'?{}:kind==='copy'?{...ar.receipt}:a.root.summary();
  expect(()=>a.root.generate(kind==='row'?bad as MixedRow:ar.row,kind==='receipt'||kind==='copy'||kind==='summary'?bad as MixedReceipt:ar.receipt,
    kind==='prefix'||kind==='slot'?bad as InitialMixedPrefix:ap.prefix)).toThrow('internal_review_error');
  expect(a.root.summary()).toMatchObject({state:'failed',pending_slots:0,pending_prefixes:0,retained_originals:0});
  expect(b.root.summary()).toEqual(before);expect(()=>a.root.begin()).toThrow();
});
it.each(['row','receipt','slot','copy','prefix'] as const)('rejects consume with a foreign or copied %s',kind=>{
  const a=setup(),b=setup(),x=firstSlot(a),y=firstSlot(b),before=b.root.summary();
  expect(()=>a.root.consume(kind==='row'?y.row:x.row,kind==='receipt'?y.receipt:x.receipt,
    kind==='slot'?y.slot:kind==='copy'?{...x.slot}:kind==='prefix'?x.prefix as unknown as MixedSlot:x.slot)).toThrow();
  expect(a.root.summary()).toMatchObject({state:'failed',consumed:0,pending_slots:0});expect(b.root.summary()).toEqual(before);
});
it.each(['begin','generate','consume','order','premature'] as const)('consumes claims once and never resumes after %s refusal',kind=>{
  const f=setup(),x=firstSlot(f);const next=f.root.consume(x.row,x.receipt,x.slot);
  expect(()=>{
    if(kind==='begin')f.root.begin();
    else if(kind==='consume')f.root.consume(x.row,x.receipt,x.slot);
    else if(kind==='generate')f.root.generate(x.row,x.receipt,x.prefix);
    else if(kind==='order'){if(next.stage!=='parent')throw Error();f.root.generate(f.root.rows[2].row,f.root.rows[2].receipt,next.prefix);}
    else{if(next.stage!=='parent')throw Error();const pair=f.root.rows[1];f.root.generate(pair.row,pair.receipt,next.prefix);f.root.generate(pair.row,pair.receipt,next.prefix);}
  }).toThrow();
  expect(f.root.summary()).toMatchObject({state:'failed',consumed:1,pending_slots:0,pending_prefixes:0,retained_originals:0});
  expect(()=>f.root.consume(x.row,x.receipt,x.slot)).toThrow();
});
it.each(['cancelled','deadline_exceeded','throw','invalid'] as const)('retains %s at all six guards and clears pending values',reason=>{
  for(let point=1;point<=6;point++){
    const f=setup();let n=0;f.arm(()=>{if(++n===point){if(reason==='throw')throw Error('SECRET');return reason==='invalid'?'untrusted':reason;}});
    expect(()=>{const x=firstSlot(f);f.root.consume(x.row,x.receipt,x.slot);}).toThrow('internal_review_error');
    expect(f.root.summary()).toMatchObject({state:'failed',first_failure:reason==='throw'||reason==='invalid'?'internal':reason,pending_slots:0,pending_prefixes:0,retained_originals:0});
    f.arm(()=>undefined);const sink=f.root.beginCleanup();f.root.recordCleanup(sink,'confirmed');
    expect(f.root.summary().cleanup).toBe('confirmed');expect(JSON.stringify(f.root.summary())).not.toContain('SECRET');
    expect(()=>f.root.begin()).toThrow();
  }
});
it.each(['begin','generate','consume','close','cleanup','discard','stop','record'] as const)('rejects swallowed %s reentry at each guard',operation=>{
  for(let point=1;point<=6;point++){
    const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
      const pair=f.root.rows[0];
      if(operation==='begin')f.root.begin();else if(operation==='generate')f.root.generate(pair.row,pair.receipt,{} as InitialMixedPrefix);
      else if(operation==='consume')f.root.consume(pair.row,pair.receipt,{} as MixedSlot);else if(operation==='close')f.root.beginSourceClose();
      else if(operation==='cleanup')f.root.beginCleanup();else if(operation==='discard')f.root.discard();else if(operation==='stop')f.root.stop('cancelled');
      else f.root.recordCleanup({} as never,'confirmed');
    }catch{/* caller deliberately swallows; outer operation must still fail */}});
    expect(()=>{const x=firstSlot(f);f.root.consume(x.row,x.receipt,x.slot);}).toThrow();
    expect(f.root.summary()).toMatchObject({state:'failed',pending_slots:0,pending_prefixes:0,retained_originals:0});
  }
});
it.each(['source','cleanup','discard','cancelled','deadline_exceeded'] as const)('invalidates generated slots on %s',event=>{
  const f=setup(),x=firstSlot(f);
  if(event==='source')f.root.beginSourceClose();else if(event==='cleanup')f.root.beginCleanup();else if(event==='discard')f.root.discard();
  else expect(()=>f.root.stop(event)).toThrow();
  expect(f.root.summary()).toMatchObject({pending_slots:0,pending_prefixes:0,retained_originals:0});
  expect(()=>f.root.consume(x.row,x.receipt,x.slot)).toThrow();
});
it('keeps late cleanup owner-bound and one-shot after failure without replacing the first reason',()=>{
  const a=setup(),b=setup();expect(()=>a.root.stop('deadline_exceeded')).toThrow();const sink=a.root.beginCleanup(),other=b.root.beginCleanup();
  expect(()=>a.root.recordCleanup(other,'confirmed')).toThrow();a.root.recordCleanup(sink,'unconfirmed');expect(()=>a.root.recordCleanup(sink,'confirmed')).toThrow();
  expect(a.root.summary()).toMatchObject({first_failure:'deadline_exceeded',cleanup:'unconfirmed'});expect(b.root.summary().cleanup).toBe('pending');
});
it.each(['missing','extra','duplicate','reversed','retained_middle','producer','reason','parent_without_capture','unknown','empty','overflow'] as const)('rejects malformed mixed declarations: %s',kind=>{
  const f=fixture();
  if(kind==='missing')f.rows.pop();if(kind==='extra')f.rows.push(f.rows[0]);if(kind==='duplicate')f.selected[1]=f.selected[0];if(kind==='reversed')f.selected.reverse();
  if(kind==='retained_middle'){const retained=f.rows.pop()!;f.rows.splice(2,0,retained);}
  if(kind==='producer')(f.rows[1] as Record<string,unknown>).producer='analysis';
  if(kind==='reason')(f.rows[4].outcome as Record<string,unknown>).reason='invalid_xml';
  if(kind==='parent_without_capture')(f.rows[3] as Record<string,unknown>).producer='parent_omission';
  if(kind==='unknown')Object.assign(f,{claim:{}});if(kind==='empty'){f.selected=[];f.rows=[];}
  if(kind==='overflow'){f.selected=Array(101).fill(id(1));f.rows=Array(101).fill(f.rows[0]);}
  expect(()=>createSyntheticMixedSlotAssembly(f,{guard:()=>undefined})).toThrow('internal_review_error');
});
it('pins input data without freezing caller data and does not expose body, prefix text or identity',()=>{
  const f=fixture();f.prefix.limitations=['private warning'];const root=createSyntheticMixedSlotAssembly(f,{guard:()=>undefined});
  f.rows.reverse();f.prefix.limitations.push('later');let step=root.begin();
  for(const pair of root.rows){if(step.stage==='complete')throw Error();step=root.consume(pair.row,pair.receipt,root.generate(pair.row,pair.receipt,step.prefix));}
  expect(root.summary()).toMatchObject({consumed:7,warnings:3});expect(Object.isFrozen(f)).toBe(false);
  const text=JSON.stringify(root.summary());for(const marker of ['private warning','later',id(1),'code_hash','"findings":','"result":'])expect(text).not.toContain(marker);
});
it.each([
  [99,1,[],2,0,100,0,0], [99,2,[],1,1,99,2,1], [100,1,['response_truncated'],1,1,100,1,0],
  [100,1,['finding_budget_exceeded'],1,1,100,3,1],
] as const)('matches an independent keep/omit and prefix-count oracle %j',(a,b,prefix,kept,omitted,total,warnings,errors)=>{
  const f=fixture();f.rows=[reviewed(1,a),reviewed(2,b)];f.selected=[id(1),id(2)];f.prefix.limitations=[...prefix];
  const root=createSyntheticMixedSlotAssembly(f,{guard:()=>undefined});let progress=root.begin();
  for(const pair of root.rows){if(progress.stage==='complete')throw Error();progress=root.consume(pair.row,pair.receipt,root.generate(pair.row,pair.receipt,progress.prefix));}
  expect(root.summary()).toMatchObject({variants:{kept_reviewed:kept,parent_omitted:omitted,original_worker_omitted:0},kept_findings:total,warnings,errors,captures:2});
});
it.each([99,100])('preserves the pinned error prefix at %i entries without treating originals as parent omissions',count=>{
  const f=fixture();f.prefix.errors=Array.from({length:count},()=>({stage:'analysis',code:'internal_review_error'}));
  const root=createSyntheticMixedSlotAssembly(f,{guard:()=>undefined});let step=root.begin();
  for(const pair of root.rows){if(step.stage==='complete')throw Error();step=root.consume(pair.row,pair.receipt,root.generate(pair.row,pair.receipt,step.prefix));}
  expect(root.summary()).toMatchObject({errors:100,warnings:count===100?3:2,variants:{parent_omitted:1,original_worker_omitted:1}});
});
it('handles the exact 100-row bound with only a retained suffix and does not manufacture captures',()=>{
  const f=fixture();f.rows=Array.from({length:100},(_,i)=>({producer:'retained',outcome:{state:'not_processed',update_xml_sys_id:id(i+1),reason:'deadline_exceeded'}}));f.selected=f.rows.map((_,i)=>id(i+1));
  const root=createSyntheticMixedSlotAssembly(f,{guard:()=>undefined});let step=root.begin();
  for(const pair of root.rows){if(step.stage==='complete')throw Error();step=root.consume(pair.row,pair.receipt,root.generate(pair.row,pair.receipt,step.prefix));}
  expect(root.summary()).toMatchObject({state:'complete',consumed:100,captures:0,variants:{retained:100},pending_slots:0});
  // @ts-expect-error A completed prefix cannot be reused as an initial/parent prefix.
  if(step.stage==='complete')expect(()=>root.generate(root.rows[0].row,root.rows[0].receipt,step.prefix)).toThrow();
});
it.each(['binding','release','update_set'] as const)('rejects incompatible reviewed %s DATA before issuing rows',kind=>{
  const f=fixture(),second=f.rows[2] as ReturnType<typeof reviewed>;
  if(kind==='binding')second.outcome.result.instance_binding='b'.repeat(64);
  else if(kind==='update_set')second.outcome.result.target.update_set_id=id(99);
  else second.outcome.result.instance_release.family='yokohama';
  expect(()=>createSyntheticMixedSlotAssembly(f,{guard:()=>undefined})).toThrow('internal_review_error');
});
it('does not run getters or proxy traps in configuration, nested values or dependencies',()=>{
  let touches=0;const accessor=()=>{touches++;throw Error('SECRET');};
  const proxy=new Proxy({},{get:accessor,getPrototypeOf:accessor,ownKeys:accessor});
  for(const raw of [proxy,{...fixture(),prefix:proxy},{...fixture(),rows:[proxy]},Object.defineProperty(fixture(),'rows',{get:accessor})])
    expect(()=>createSyntheticMixedSlotAssembly(raw,{guard:()=>undefined})).toThrow();
  for(const dep of [proxy,Object.defineProperty({},'guard',{get:accessor,enumerable:true})])expect(()=>createSyntheticMixedSlotAssembly(fixture(),dep)).toThrow();
  expect(touches).toBe(0);
});
it.each(['begin','generate','consume','constructor'] as const)('rejects extra %s arguments and keeps the failure terminal',operation=>{
  if(operation==='constructor'){expect(()=>createSyntheticMixedSlotAssembly(fixture(),{guard:()=>undefined},{})).toThrow();return;}
  const f=setup();expect(()=>{
    if(operation==='begin')f.root.begin({});else{const p=f.root.begin();if(p.stage!=='initial')throw Error();const pair=f.root.rows[0];
      if(operation==='generate')f.root.generate(pair.row,pair.receipt,p.prefix,{});
      else f.root.consume(pair.row,pair.receipt,f.root.generate(pair.row,pair.receipt,p.prefix),{});}
  }).toThrow();expect(f.root.summary()).toMatchObject({state:'failed',pending_slots:0,pending_prefixes:0,retained_originals:0});
});
it.each(['generate','consume'] as const)('lets a post-guard stop outrank a %s binding mismatch',operation=>{
  const f=setup(),p=f.root.begin();if(p.stage!=='initial')throw Error();const pair=f.root.rows[0];
  const slot=operation==='consume'?f.root.generate(pair.row,pair.receipt,p.prefix):undefined;let n=0;f.arm(()=>++n===2?'deadline_exceeded':undefined);
  expect(()=>operation==='generate'?f.root.generate(pair.row,{} as MixedReceipt,p.prefix):f.root.consume(pair.row,{} as MixedReceipt,slot!)).toThrow();
  expect(f.root.summary()).toMatchObject({first_failure:'deadline_exceeded',pending_slots:0,pending_prefixes:0});
});
it('rejects arbitrary post-loop deltas and a raw prefix in place of the private stage handle',()=>{
  const f=fixture();expect(()=>createSyntheticMixedSlotAssembly({...f,delta:{limitations:['anything'],errors:[]}},{guard:()=>undefined})).toThrow();
  const root=createSyntheticMixedSlotAssembly(f,{guard:()=>undefined});root.begin();
  expect(()=>root.generate(root.rows[0].row,root.rows[0].receipt,f.prefix as unknown as InitialMixedPrefix)).toThrow();
});
it('keeps legacy capture and mixed-root surfaces unchanged and brands inaccessible to OD-A',async()=>{
  const {createSyntheticParentOmissionAssembly}=await import('../support/review/synthetic-recovery-capture.js');
  const raw=fixture(),a=raw.rows[0] as ReturnType<typeof reviewed>,r=a.outcome.result;
  const old=createSyntheticParentOmissionAssembly({kind:'synthetic_parent_omission_owner_v1',model_id:raw.model_id,schema_version:raw.schema_version,prefix:raw.prefix,
    contexts:[{update_xml_sys_id:a.outcome.update_xml_sys_id,applicable_rule_ids:a.outcome.applicable_rule_ids,reviewed_at:r.reviewed_at,target:r.target,instance_binding:r.instance_binding,instance_release:r.instance_release,requested_rule_ids:r.coverage.requested_rule_ids,release_limitations:r.limitations}]},{guard:()=>undefined});
  const capture=old.accept(old.deliver(old.inputs[0],{id:1,ok:true,json:JSON.stringify(a.outcome)})),before=old.summary(),fresh=setup(),p=fresh.root.begin();
  if(p.stage!=='initial')throw Error();
  // @ts-expect-error OM-C's reviewed capture is not an OD-A row identity.
  expect(()=>fresh.root.generate(capture,fresh.root.rows[0].receipt,p.prefix)).toThrow();
  expect(old.summary()).toEqual(before);for(const key of ['generate','consume','begin'])expect(old).not.toHaveProperty(key);
});
