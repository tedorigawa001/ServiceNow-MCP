import {expect,it} from 'vitest';
import {createSyntheticFailureBoundSupply} from '../support/review/synthetic-recovery-kernel.js';
import {createSyntheticOwnedMixedSupply} from '../support/review/synthetic-recovery-kernel.js';
import {aggregate} from './fixtures/bp5-results.js';

const id=(n:number)=>n.toString(16).padStart(32,'0');
function fixture(){
  const a=aggregate(),S='2026-10-17T04:59:00.000Z',O='2026-10-17T04:59:01.000Z',U='2026-10-17T04:59:03.000Z';
  const selected=[id(1),id(2),id(3)];
  return {kind:'synthetic_omd_bound_root_v1',recovery:{point:'request_check_unstarted',active_input_sys_id:id(3),accounting:{requests:0,received_bytes:0,payload_bytes:0},consistency:'unverified'},
    finish:{time:{started_at:S,deadline_ms:60000,observed_at:O,upper_utc:U},header:{schema_version:a.schema_version,target:a.target,versions:a.versions,started_at:S,
      instance_release:a.instance_release,release_match:a.release_match,principal:a.principal,collection:{...a.collection,metadata_seen:3,selected:3},coverage:{...a.coverage,analysis_complete:false},
      limits:a.limits,limitations:[...a.limitations],errors:[]},selected,inputs:selected.map(update_xml_sys_id=>({update_xml_sys_id,retrieved_at:U,state:'not_processed',expected_context:null}))},
    mixed:{model_id:'recovery-omission-v1',initial_prefix:{limitations:[...a.limitations],errors:[]},rows:selected.map(update_xml_sys_id=>({producer:'retained',outcome:{state:'not_processed',update_xml_sys_id,reason:'deadline_exceeded'}}))}};
}
function setup(raw:unknown=fixture()){
  let guard:(stage:string,n?:number)=>unknown=()=>undefined;
  const root=createSyntheticFailureBoundSupply(raw,{guard:(stage:string,n?:number)=>guard(stage,n)});
  return {root,arm:(next:typeof guard)=>{guard=next;}};
}

it('retains the early failure and upper slots for malformed DATA without inventing role evidence',()=>{
  const root=createSyntheticFailureBoundSupply({secret:'PRIVATE_BODY'},{guard:()=>undefined});
  expect(()=>root.prepare()).toThrow('internal_review_error');
  expect(root.failure()).toMatchObject({owner_allocated:true,upper_slot_allocated:true,notice_claimed:true,notices:1,
    current:{first_hard:{code:'internal_review_error',stage:'prepare'},release:'unconfirmed',unresolved:4}});
  expect(root.inspect()).toMatchObject({state:'failed',pending:false,retained_rows:0});
  for(const role of Object.values(root.failure().current!.roles))expect(role).toMatchObject({generation:'unknown',termination:'unknown',resolved:false});
  expect(JSON.stringify(root.failure())).not.toContain('PRIVATE_BODY');
});
it('prepares fresh DATA without a failure, kernel or public custody capability, then invalidates it on the first hard',()=>{
  const f=setup();expect(f.root.failure()).toMatchObject({notice_claimed:false,notices:0,current:null,upper_accepted:false});
  const h=f.root.prepare();expect(f.root.inspect()).toMatchObject({state:'prepared',pending:true,preparations:1,pins_created:1});
  expect(()=>f.root.stop('cancelled')).toThrow();expect(f.root.failure()).toMatchObject({notices:1,reason:'cancelled',current:{first_hard:{code:'cancelled',stage:'prepare'},unresolved:4}});
  f.root.beginCleanup();f.root.discard();expect(()=>f.root.discardPrepared(h)).toThrow();expect(()=>f.root.prepare()).toThrow();
  expect(()=>f.root.stop('deadline_exceeded')).toThrow();expect(f.root.failure()).toMatchObject({notices:1,reason:'cancelled',current:{first_hard:{code:'cancelled'}}});
  expect(f.root.inspect()).toMatchObject({pending:false,retained_rows:0});
  for(const name of ['issuer','local','upper','commit','seal','finalDiscard','bind','startWorkerGeneration','accepted','pins','body'])expect(f.root).not.toHaveProperty(name);
  expect(Object.isFrozen(f.root.failure().current!.roles.source)).toBe(true);
});
it.each(['cancelled','deadline_exceeded','unknown','throw'] as const)('retains a single %s failure at every prepare checkpoint and drains partial payload',kind=>{
  for(let point=1;point<=8;point++){
    const f=setup();let n=0;f.arm(()=>{if(++n===point){if(kind==='throw')throw Error('PRIVATE_EXCEPTION');return kind==='unknown'?'PRIVATE_STOP':kind;}});
    expect(()=>f.root.prepare()).toThrow('internal_review_error');
    expect(f.root.failure()).toMatchObject({notices:1,notice_claimed:true,reason:kind==='throw'||kind==='unknown'?'internal':kind,
      current:{first_hard:{code:kind==='cancelled'||kind==='deadline_exceeded'?kind:'internal_review_error'},unresolved:4}});
    expect(f.root.inspect()).toMatchObject({pending:false,retained_rows:0,preparations:0});
    f.arm(()=>undefined);f.root.beginCleanup();f.root.discard();expect(()=>f.root.prepare()).toThrow();
    expect(f.root.failure().notices).toBe(1);expect(JSON.stringify(f.root.failure())).not.toMatch(/PRIVATE_/);
  }
});
it.each(['prepare','discardPrepared','source','cleanup','discard','stop'] as const)('does not lose the first notice to swallowed %s reentry',operation=>{
  for(let point=1;point<=8;point++){
    const f=setup();let n=0;f.arm(()=>{if(++n===point)try{
      if(operation==='prepare')f.root.prepare();else if(operation==='discardPrepared')f.root.discardPrepared({} as never);
      else if(operation==='source')f.root.beginSourceClose();else if(operation==='cleanup')f.root.beginCleanup();else if(operation==='discard')f.root.discard();else f.root.stop('cancelled');
    }catch{/* Boundary deliberately swallows the inner rejection. */}});
    expect(()=>f.root.prepare()).toThrow();expect(f.root.failure()).toMatchObject({notices:1,reason:operation==='stop'?'cancelled':'reentrant'});
    f.arm(()=>undefined);f.root.beginCleanup();expect(f.root.inspect()).toMatchObject({pending:false,retained_rows:0});
  }
});
it.each(['pre','post'] as const)('keeps the discard %s guard reason over a deferred foreign binding mismatch',phase=>{
  const f=setup(),other=setup(),h=f.root.prepare(),foreign=other.root.prepare(),before=other.root.failure();
  f.arm(stage=>stage===`discard_${phase}`?'deadline_exceeded':undefined);
  expect(()=>f.root.discardPrepared(foreign)).toThrow();expect(f.root.failure()).toMatchObject({notices:1,reason:'deadline_exceeded',current:{first_hard:{code:'deadline_exceeded'}}});
  f.arm(()=>undefined);f.root.discard();expect(()=>f.root.discardPrepared(h)).toThrow();expect(other.root.failure()).toEqual(before);
});
it('keeps a post guard deadline over a failed pins projection without retaining rejected DATA',()=>{
  const raw=fixture();raw.finish.time.deadline_ms=60001;const f=setup(raw);f.arm(stage=>stage==='prepare_post'?'deadline_exceeded':undefined);
  expect(()=>f.root.prepare()).toThrow();expect(f.root.failure()).toMatchObject({notices:1,reason:'deadline_exceeded'});
  expect(f.root.inspect()).toMatchObject({pin_builds:1,pins_created:0,pending:false,retained_rows:0});
});
it.each(['repeat','foreign','copy','summary','extra'] as const)('spends one notification on %s rejection and never changes the other construction',kind=>{
  const a=setup(),b=setup(),h=a.root.prepare(),other=b.root.prepare(),before=b.root.inspect();
  expect(()=>{
    if(kind==='repeat')a.root.prepare();else a.root.discardPrepared((kind==='foreign'?other:kind==='copy'?{...h}:kind==='summary'?a.root.failure():h) as typeof h,...(kind==='extra'?[{}]:[]));
  }).toThrow();expect(a.root.failure()).toMatchObject({notices:1,current:{unresolved:4,release:'unconfirmed'}});
  expect(a.root.inspect()).toMatchObject({pending:false,retained_rows:0});expect(b.root.inspect()).toEqual(before);
});
it('rejects malformed dependencies and extra constructor capabilities without evaluating caller getters or proxy traps',()=>{
  let calls=0;const touch=()=>{calls++;throw Error('PRIVATE_ACCESS');},proxy=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  for(const deps of [null,proxy,{},Object.defineProperty({},'guard',{get:touch}),{guard:new Proxy(()=>undefined,{apply:touch})},{guard:()=>undefined,owner:{}}]){
    const root=createSyntheticFailureBoundSupply(fixture(),deps);expect(()=>root.prepare()).toThrow();expect(root.failure()).toMatchObject({notices:1,reason:'shape',upper_slot_allocated:true,current:{unresolved:4}});
  }
  for(const raw of [proxy,Object.defineProperty(fixture(),'finish',{get:touch})]){
    const root=createSyntheticFailureBoundSupply(raw,{guard:touch});expect(()=>root.prepare()).toThrow();expect(root.failure().notices).toBe(1);
  }
  const extra=createSyntheticFailureBoundSupply(fixture(),{guard:touch},{issuer:proxy});expect(()=>extra.prepare()).toThrow();expect(extra.failure().notices).toBe(1);expect(calls).toBe(0);
});
it('does not upgrade the standalone supply or failure owner, and rejects their handles without touching them',async()=>{
  const {createSyntheticFailureCustody}=await import('../support/review/synthetic-failure-custody.js');
  const old=createSyntheticOwnedMixedSupply(fixture(),{guard:()=>undefined}),oldHandle=old.prepare(),before=old.inspect();
  const root=setup().root;root.prepare();expect(()=>root.discardPrepared(oldHandle)).toThrow();expect(old.inspect()).toEqual(before);expect(old).not.toHaveProperty('failure');
  const c=createSyntheticFailureCustody({kind:'synthetic_failure_custody_v1',upper:'connected'},{guard:()=>undefined});c.local.hard('cancelled','prepare');
  const report=c.local.seal(),state=c.local.inspect(),next=setup().root;next.prepare();expect(()=>next.discardPrepared(report as never)).toThrow();expect(c.local.inspect()).toEqual(state);
  expect(Reflect.ownKeys(c)).toEqual(['issuer','local','upper']);
});
it.each(['source','cleanup','discard'] as const)('does not turn healthy %s invalidation into resource-release proof or recreate payload',event=>{
  const root=setup().root,h=root.prepare();
  if(event==='source')root.beginSourceClose();else if(event==='cleanup')root.beginCleanup();else root.discard();
  expect(root.inspect()).toMatchObject({pending:false,retained_rows:0});expect(root.failure()).toMatchObject({notices:0,current:null});
  expect(()=>root.discardPrepared(h)).toThrow();expect(root.failure()).toMatchObject({notices:1,reason:'state',current:{release:'unconfirmed',unresolved:4}});
  root.beginCleanup();root.discard();expect(root.failure().notices).toBe(1);
});
it('pins the guard once and never hands it a failure owner or payload capability',()=>{
  let calls=0;const deps={guard:(stage:string,n?:number)=>{calls++;expect(typeof stage).toBe('string');expect(n===undefined||Number.isInteger(n)).toBe(true);}};
  const root=createSyntheticFailureBoundSupply(fixture(),deps);expect(calls).toBe(0);
  deps.guard=()=>{throw Error('PRIVATE_REPLACEMENT');};root.prepare();expect(calls).toBe(8);
  expect(()=>root.prepare()).toThrow();expect(root.failure()).toMatchObject({notices:1,reason:'duplicate'});
  expect(JSON.stringify(root.failure())).not.toContain('PRIVATE_REPLACEMENT');
});
