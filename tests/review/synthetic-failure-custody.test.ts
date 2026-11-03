import {expect,it} from 'vitest';
import {createSyntheticFailureCustody} from '../support/review/synthetic-failure-custody.js';
import type {FailureCreationTicket,FailureFact,FailureAbsence,FailureReport,FailureCommitReceipt} from '../support/review/synthetic-failure-custody.js';
const roles=['source','transport_group','old_generation','new_generation'] as const;
type Role=typeof roles[number];
function setup(upper:'connected'|'absent'|'reject'='connected'){
  let fn:(phase:string,operation:string)=>unknown=()=>undefined;
  const root=createSyntheticFailureCustody({kind:'synthetic_failure_custody_v1',upper},{guard:(p:string,o:string)=>fn(p,o)});
  return {...root,arm:(next:typeof fn)=>{fn=next;}};
}
function absent(root:ReturnType<typeof setup>,except?:Role){for(const r of roles)if(r!==except)root.local.observeAbsent(r,root.issuer.proveUncreated(r));}
function failed(root:ReturnType<typeof setup>){root.local.hard('deadline_exceeded','transfer');return root.local.seal();}
it('transfers unresolved cleanup custody once, keeping the immutable failed report through final discard',()=>{
  const root=createSyntheticFailureCustody({kind:'synthetic_failure_custody_v1',upper:'connected'},{guard:()=>undefined});
  for(const role of ['source','transport_group','old_generation'] as const)root.local.observeAbsent(role,root.issuer.proveUncreated(role));
  const worker=root.issuer.beginCreation('new_generation');
  root.local.observe('new_generation',worker,root.issuer.fact(worker,'created'));
  root.local.hard('deadline_exceeded','transfer');root.local.requestCleanup('new_generation',worker);
  root.local.observe('new_generation',worker,root.issuer.fact(worker,'cleanup_confirmed'));
  const report=root.local.seal(),snapshot=root.local.inspect().report;
  expect(snapshot).toMatchObject({outcome:'failed',release:'unconfirmed',unresolved:1,first_hard:{code:'deadline_exceeded',stage:'transfer'}});
  const receipt=root.local.commit(report);expect(Reflect.ownKeys(receipt)).toEqual([]);
  root.local.finalDiscard(receipt);
  expect(root.local.inspect()).toMatchObject({state:'discarded',custody:'upper',local_cleanup_refs:0,receipt_pending:false});
  expect(root.upper.inspect()).toMatchObject({accepted:true,custody:'upper',current:{release:'unconfirmed',unresolved:1}});
  root.upper.observe('new_generation',worker,root.issuer.fact(worker,'worker_terminated'));
  expect(root.upper.inspect()).toMatchObject({current:{release:'confirmed',unresolved:0}});
  expect(root.upper.inspect().report).toEqual(snapshot);expect(root.local.inspect().first_hard).toEqual(snapshot!.first_hard);
});
it('does not equate source closed alone with completed cleanup after a request',()=>{
  const root=setup();absent(root,'source');const t=root.issuer.beginCreation('source');root.local.observe('source',t,root.issuer.fact(t,'created'));
  root.local.hard('cancelled','cleanup');root.local.requestCleanup('source',t);root.local.observe('source',t,root.issuer.fact(t,'source_closed'));
  root.local.seal();expect(root.local.inspect().report).toMatchObject({release:'unconfirmed',unresolved:1});
});
it('requires same-origin absence evidence and never infers absence from empty maps',()=>{
  const root=setup();const h=failed(root);expect(root.local.inspect().report).toMatchObject({release:'unconfirmed',unresolved:4});
  const receipt=root.local.commit(h);root.local.finalDiscard(receipt);
  for(const role of roles)root.upper.observeAbsent(role,root.issuer.proveUncreated(role));
  expect(root.upper.inspect().current).toMatchObject({release:'confirmed',unresolved:0});expect(root.upper.inspect().report).toMatchObject({release:'unconfirmed',unresolved:4});
});
it('can report failed with all roles proven uncreated without creating a normal success route',()=>{
  const root=setup();absent(root);const receipt=root.local.commit(failed(root));root.local.finalDiscard(receipt);
  expect(root.upper.inspect().report).toMatchObject({outcome:'failed',release:'confirmed',unresolved:0});
  expect(root.local.inspect().permissions).toEqual({accepted_adoption:false,destination_seal:false,formal_issuance:false});
});
it.each(roles)('keeps %s release unconfirmed with cleanup alone and confirms only its matching terminal event',role=>{
  const root=setup();absent(root,role);const ticket=root.issuer.beginCreation(role);root.local.observe(role,ticket,root.issuer.fact(ticket,'created'));
  root.local.hard('cancelled','cleanup');root.local.requestCleanup(role,ticket);root.local.observe(role,ticket,root.issuer.fact(ticket,'cleanup_confirmed'));
  const receipt=root.local.commit(root.local.seal());root.local.finalDiscard(receipt);expect(root.upper.inspect().current?.unresolved).toBe(1);
  const event=role==='source'?'source_closed':role==='transport_group'?'transport_quiescent':'worker_terminated';
  root.upper.observe(role,ticket,root.issuer.fact(ticket,event));expect(root.upper.inspect().current).toMatchObject({release:'confirmed',unresolved:0});
});
it('keeps in-progress creation distinct from not-created and handles its late return only under upper custody',()=>{
  const root=setup();absent(root,'new_generation');const ticket=root.issuer.beginCreation('new_generation');root.local.hard('deadline_exceeded','transfer');
  root.local.requestCleanup('new_generation',ticket);root.local.observe('new_generation',ticket,root.issuer.fact(ticket,'cleanup_confirmed'));
  root.local.observe('new_generation',ticket,root.issuer.fact(ticket,'worker_terminated'));const receipt=root.local.commit(root.local.seal());root.local.finalDiscard(receipt);
  expect(root.upper.inspect().current).toMatchObject({unresolved:1,roles:{new_generation:{generation:'creating'}}});
  root.upper.observe('new_generation',ticket,root.issuer.fact(ticket,'created'));expect(root.upper.inspect().current?.release).toBe('confirmed');
  expect(()=>root.issuer.beginCreation('source')).toThrow();expect(root.upper.inspect().current?.release).toBe('confirmed');
});
it('retains unconfirmed cleanup as a terminal fact, without a later confirmed reissue',()=>{
  const root=setup();absent(root,'old_generation');const t=root.issuer.beginCreation('old_generation');root.local.observe('old_generation',t,root.issuer.fact(t,'created'));
  root.local.requestCleanup('old_generation',t);root.local.observe('old_generation',t,root.issuer.fact(t,'worker_terminated'));
  root.local.observe('old_generation',t,root.issuer.fact(t,'cleanup_unconfirmed'));const h=failed(root);expect(root.local.inspect().report?.unresolved).toBe(1);
  const c=root.local.commit(h);root.local.finalDiscard(c);expect(()=>root.issuer.fact(t,'cleanup_confirmed')).toThrow();expect(root.upper.inspect().current?.release).toBe('unconfirmed');
});
it.each(['absent','reject'] as const)('refuses final discard when the fixed upper owner is %s',mode=>{
  const root=setup(mode);absent(root);const report=failed(root);expect(()=>root.local.commit(report)).toThrow();
  expect(()=>root.local.finalDiscard({} as FailureCommitReceipt)).toThrow();expect(root.local.inspect()).toMatchObject({state:'sealed_waiting_ack',custody:'local',commits:0,discards:0});
  expect(root.upper.inspect()).toMatchObject({accepted:false,current:null});expect(()=>root.local.commit(report)).toThrow();
});
it.each(['report','copy','summary','receipt'] as const)('rejects a foreign or forged %s before transferring custody',kind=>{
  const a=setup(),b=setup();absent(a);absent(b);const ar=failed(a),br=failed(b),before=b.local.inspect();
  const bad=kind==='report'?br:kind==='copy'?{...ar}:kind==='summary'?a.local.inspect():{};
  expect(()=>a.local.commit(bad as FailureReport)).toThrow();expect(a.local.inspect()).toMatchObject({custody:'local',commits:0});expect(b.local.inspect()).toEqual(before);
  expect(a.upper.inspect().accepted).toBe(false);expect(()=>a.local.commit(ar)).toThrow();
});
it.each(['foreign','copy','report','summary','extra'] as const)('consumes final-discard claim once on %s receipt refusal without returning custody',kind=>{
  const a=setup(),b=setup();absent(a);absent(b);const ar=failed(a),br=failed(b),ac=a.local.commit(ar),bc=b.local.commit(br),before=b.upper.inspect();
  expect(()=>a.local.finalDiscard((kind==='foreign'?bc:kind==='copy'?{...ac}:kind==='report'?ar:kind==='summary'?a.local.inspect():ac) as FailureCommitReceipt,...(kind==='extra'?[{}]:[]))).toThrow();
  expect(a.local.inspect()).toMatchObject({state:'committed_to_upper',custody:'upper',local_cleanup_refs:0,receipt_pending:false,discards:0});
  expect(()=>a.local.finalDiscard(ac)).toThrow();expect(b.upper.inspect()).toEqual(before);
});
it('never rolls back an already committed transfer after an external display failure',()=>{
  const root=setup();const report=failed(root);try{root.local.commit(report);throw Error('SECRET DISPLAY');}catch{/* external display failed */}
  expect(root.local.inspect()).toMatchObject({state:'committed_to_upper',custody:'upper',first_hard:{code:'deadline_exceeded'}});
  expect(root.upper.inspect()).toMatchObject({accepted:true,current:{unresolved:4}});expect(JSON.stringify(root.local.inspect())).not.toContain('SECRET');
});
it('rejects duplicate seal/commit/discard while keeping first hard and upper diagnostic snapshots',()=>{
  const root=setup();absent(root);const report=failed(root);expect(()=>root.local.seal()).toThrow();
  const receipt=root.local.commit(report);expect(()=>root.local.commit(report)).toThrow();root.local.finalDiscard(receipt);expect(()=>root.local.finalDiscard(receipt)).toThrow();
  expect(root.upper.inspect().report?.first_hard).toEqual({code:'deadline_exceeded',stage:'transfer'});expect(root.local.inspect().discards).toBe(1);
});
it.each(['ticket','fact','copy','role','absence_as_fact'] as const)('rejects foreign/malformed %s evidence without changing its true owner',kind=>{
  const a=setup(),b=setup(),at=a.issuer.beginCreation('source'),bt=b.issuer.beginCreation('source'),af=a.issuer.fact(at,'created'),bf=b.issuer.fact(bt,'created');
  const absence=b.issuer.proveUncreated('old_generation');a.local.hard('cancelled','cleanup');b.local.hard('cancelled','cleanup');const before=b.local.inspect();
  expect(()=>a.local.observe(kind==='role'?'new_generation':'source',kind==='ticket'?bt:at,
    (kind==='fact'?bf:kind==='copy'?{...af}:kind==='absence_as_fact'?absence:af) as FailureFact)).toThrow();
  expect(b.local.inspect()).toEqual(before);b.local.observe('source',bt,bf);expect(a.local.inspect().first_hard?.code).toBe('cancelled');
});
it.each(['foreign','copy','fact','string'] as const)('rejects %s absence proofs without treating unknown as uncreated',kind=>{
  const a=setup(),b=setup(),proof=a.issuer.proveUncreated('source'),other=b.issuer.proveUncreated('source');
  const bad=kind==='foreign'?other:kind==='copy'?{...proof}:kind==='fact'?{}:'not_required';
  expect(()=>a.local.observeAbsent('source',bad as FailureAbsence)).toThrow();a.local.seal();
  expect(a.local.inspect().report).toMatchObject({unresolved:4,roles:{source:{generation:'unknown'}}});b.local.observeAbsent('source',other);
});
it('never starts creation after absence, hard, or source-owner discard',()=>{
  const a=setup();a.local.observeAbsent('source',a.issuer.proveUncreated('source'));expect(()=>a.issuer.beginCreation('source')).toThrow();
  const b=setup();failed(b);expect(()=>b.issuer.beginCreation('source')).toThrow();
  const c=setup();const receipt=c.local.commit(failed(c));c.local.finalDiscard(receipt);expect(()=>c.issuer.beginCreation('new_generation')).toThrow();
});
it.each(['created','terminal','cleanup','absence','request'] as const)('refuses a second %s issuance/request and a second fact consumption',kind=>{
  const r=setup();if(kind==='absence'){const h=r.issuer.proveUncreated('source');r.local.observeAbsent('source',h);expect(()=>r.issuer.proveUncreated('source')).toThrow();expect(()=>r.local.observeAbsent('source',h)).toThrow();return;}
  const t=r.issuer.beginCreation('source'),created=r.issuer.fact(t,'created');r.local.observe('source',t,created);
  if(kind==='created'){expect(()=>r.issuer.fact(t,'created')).toThrow();expect(()=>r.local.observe('source',t,created)).toThrow();}
  else if(kind==='terminal'){const h=r.issuer.fact(t,'source_closed');r.local.observe('source',t,h);expect(()=>r.issuer.fact(t,'source_closed')).toThrow();expect(()=>r.local.observe('source',t,h)).toThrow();}
  else{r.local.requestCleanup('source',t);if(kind==='request')expect(()=>r.local.requestCleanup('source',t)).toThrow();else{const h=r.issuer.fact(t,'cleanup_confirmed');r.local.observe('source',t,h);expect(()=>r.issuer.fact(t,'cleanup_unconfirmed')).toThrow();expect(()=>r.local.observe('source',t,h)).toThrow();}}
});
it('forbids unrequested cleanup and the wrong role-specific terminal kind',()=>{
  const a=setup(),t=a.issuer.beginCreation('source');expect(()=>a.local.observe('source',t,a.issuer.fact(t,'cleanup_confirmed'))).toThrow();
  const b=setup(),bt=b.issuer.beginCreation('new_generation');expect(()=>b.issuer.fact(bt,'source_closed')).toThrow();expect(()=>b.issuer.proveUncreated('new_generation')).toThrow();
});
it('revokes the old consumer without consuming an upper-owned late fact',()=>{
  const root=setup(),t=root.issuer.beginCreation('source');root.local.observe('source',t,root.issuer.fact(t,'created'));
  const receipt=root.local.commit(failed(root));root.local.finalDiscard(receipt);const h=root.issuer.fact(t,'source_closed'),before=root.upper.inspect();
  expect(()=>root.local.observe('source',t,h)).toThrow();expect(root.upper.inspect()).toEqual(before);root.upper.observe('source',t,h);
  root.upper.requestCleanup('source',t);root.upper.observe('source',t,root.issuer.fact(t,'cleanup_confirmed'));expect(root.upper.inspect().current?.roles.source.resolved).toBe(true);
  expect(root.upper.inspect().current?.unresolved).toBe(3);
});
it.each(['seal','commit','discard'] as const)('records stopped checkpoints but still permits cleanup-only %s with no grace timer',operation=>{
  const root=setup();absent(root);let report:FailureReport,receipt:FailureCommitReceipt;
  if(operation==='seal')root.arm(()=> 'deadline_exceeded');root.local.hard('cancelled','transfer');report=root.local.seal();
  if(operation==='commit')root.arm(()=> 'deadline_exceeded');receipt=root.local.commit(report);
  if(operation==='discard')root.arm(()=> 'deadline_exceeded');root.local.finalDiscard(receipt);
  expect(root.local.inspect()).toMatchObject({state:'discarded',observed_stop:'deadline_exceeded',first_hard:{code:'cancelled'},discards:1});
});
it.each(['seal','commit','discard'] as const)('keeps the unique custody owner on throws at both %s checkpoints',operation=>{
  for(const phase of ['pre','post']){
    const root=setup();absent(root);root.local.hard('deadline_exceeded','transfer');
    const report=operation!=='seal'?root.local.seal():undefined,receipt=operation==='discard'?root.local.commit(report!):undefined;
    root.arm((p,o)=>{if(p===phase&&o===operation)throw Error('SECRET');});
    expect(()=>operation==='seal'?root.local.seal():operation==='commit'?root.local.commit(report!):root.local.finalDiscard(receipt!)).toThrow();
    expect(root.local.inspect()).toMatchObject({custody:operation==='discard'?'upper':'local',first_hard:{code:'deadline_exceeded'},commits:operation==='discard'?1:0,discards:0});
    expect(root.upper.inspect().accepted).toBe(operation==='discard');expect(JSON.stringify(root.local.inspect())).not.toContain('SECRET');
  }
});
it.each(['seal','commit','discard'] as const)('rejects swallowed mutating reentry at each %s checkpoint without partial publication',operation=>{
  for(const phase of ['pre','post'])for(const reentry of ['hard','begin','absent','observe','request','seal','commit','discard'] as const){
    const root=setup();root.local.hard('deadline_exceeded','transfer');const report=operation!=='seal'?root.local.seal():undefined,receipt=operation==='discard'?root.local.commit(report!):undefined;
    root.arm((p,o)=>{if(p===phase&&o===operation)try{
      if(reentry==='hard')root.local.hard('cancelled','display');else if(reentry==='begin')root.issuer.beginCreation('source');else if(reentry==='absent')root.issuer.proveUncreated('source');
      else if(reentry==='observe')root.local.observe('source',{} as FailureCreationTicket,{} as FailureFact);else if(reentry==='request')root.upper.requestCleanup('source',{} as FailureCreationTicket);
      else if(reentry==='seal')root.local.seal();else if(reentry==='commit')root.local.commit({} as FailureReport);else root.local.finalDiscard({} as FailureCommitReceipt);
    }catch{/* swallowed */}});
    expect(()=>operation==='seal'?root.local.seal():operation==='commit'?root.local.commit(report!):root.local.finalDiscard(receipt!)).toThrow();
    expect(root.local.inspect()).toMatchObject({first_hard:{code:'deadline_exceeded'},custody:operation==='discard'?'upper':'local',discards:0});
    expect(root.upper.inspect().accepted).toBe(operation==='discard');
  }
});
it('still detects swallowed reentry when the public fault counter has saturated',()=>{
  const root=setup();root.local.hard('cancelled','transfer');for(let i=0;i<150;i++)expect(()=>root.local.observeAbsent('bad' as Role,{} as FailureAbsence)).toThrow();
  expect(root.local.inspect().protocol_faults).toBe(100);root.arm(()=>{try{root.local.hard('deadline_exceeded','display');}catch{/* swallowed */}});
  expect(()=>root.local.seal()).toThrow();expect(root.local.inspect()).toMatchObject({protocol_faults:100,report_pending:false,first_hard:{code:'cancelled'}});
});
it('rejects malformed config and Proxy/getter dependencies without invoking caller code',()=>{
  let calls=0;const touch=()=>{calls++;throw Error();},proxy=new Proxy({},{get:touch,ownKeys:touch,getPrototypeOf:touch});
  const deps={guard:()=>undefined},good={kind:'synthetic_failure_custody_v1',upper:'connected'};
  for(const raw of [proxy,{...good,upper:{}},{...good,kind:'wrong'},{...good,ack:true},Object.defineProperty({},'kind',{get:touch})])expect(()=>createSyntheticFailureCustody(raw,deps)).toThrow();
  for(const d of [proxy,Object.defineProperty({},'guard',{get:touch}),{guard:new Proxy(()=>undefined,{apply:touch})}])expect(()=>createSyntheticFailureCustody(good,d)).toThrow();
  expect(()=>createSyntheticFailureCustody(good,deps,{})).toThrow();expect(calls).toBe(0);
});
it('pins configuration and guards, exposes immutable scalar snapshots, and has no adoption or registration API',()=>{
  const config={kind:'synthetic_failure_custody_v1',upper:'connected'},deps={guard:()=>undefined},root=createSyntheticFailureCustody(config,deps);
  config.upper='absent';deps.guard=()=>{throw Error();};root.local.hard('cancelled','prepare');const report=root.local.seal(),snapshot=root.local.inspect().report!;
  expect(Object.isFrozen(snapshot)).toBe(true);expect(Object.isFrozen(snapshot.roles.source)).toBe(true);expect(Object.isFrozen(snapshot.first_hard)).toBe(true);
  root.local.finalDiscard(root.local.commit(report));for(const key of ['register','adopt','accepted','plan','body','bind','dispatch'])for(const facade of [root,root.local,root.upper,root.issuer])expect(facade).not.toHaveProperty(key);
});
it.each(['hard','stage','role','event','checkpoint'] as const)('rejects unknown %s without retaining caller text or replacing first hard',kind=>{
  const root=setup(),t=root.issuer.beginCreation('source');root.local.hard('deadline_exceeded','transfer');
  expect(()=>{
    if(kind==='hard')root.local.hard('SECRET' as never,'cleanup');else if(kind==='stage')root.local.hard('cancelled','SECRET' as never);
    else if(kind==='role')root.issuer.proveUncreated('SECRET' as never);else if(kind==='event')root.issuer.fact(t,'SECRET' as never);
    else{root.arm(()=> 'SECRET');root.local.seal();}
  }).toThrow();expect(root.local.inspect().first_hard).toEqual({code:'deadline_exceeded',stage:'transfer'});expect(JSON.stringify(root.local.inspect())).not.toContain('SECRET');
});
it.each(['creation','fact','absence','observe','absent','request','hard','seal','commit','discard'] as const)('rejects extra arguments on %s without duplicating authority',operation=>{
  const root=setup();const t=root.issuer.beginCreation('source'),fact=root.issuer.fact(t,'created'),proof=root.issuer.proveUncreated('old_generation');
  root.local.hard('cancelled','transfer');const report=operation==='commit'||operation==='discard'?root.local.seal():undefined,receipt=operation==='discard'?root.local.commit(report!):undefined;
  expect(()=>{
    if(operation==='creation')root.issuer.beginCreation('new_generation',{});else if(operation==='fact')root.issuer.fact(t,'source_closed',{});
    else if(operation==='absence')root.issuer.proveUncreated('new_generation',{});else if(operation==='observe')root.local.observe('source',t,fact,{});
    else if(operation==='absent')root.local.observeAbsent('old_generation',proof,{});else if(operation==='request')root.local.requestCleanup('source',t,{});
    else if(operation==='hard')root.local.hard('cancelled','cleanup',{});else if(operation==='seal')root.local.seal({});else if(operation==='commit')root.local.commit(report!,{});else root.local.finalDiscard(receipt!,{});
  }).toThrow();expect(root.local.inspect()).toMatchObject({custody:operation==='discard'?'upper':'local',discards:0,first_hard:{code:'cancelled'}});
});
it('refuses report or custody-only pseudo acknowledgements and leaves evidence with the actual owner',()=>{
  const root=setup(),t=root.issuer.beginCreation('source'),f=root.issuer.fact(t,'created');
  expect(()=>root.upper.observe('source',t,f)).toThrow();root.local.observe('source',t,f);const report=root.local.seal();
  expect(()=>root.local.finalDiscard(report as unknown as FailureCommitReceipt)).toThrow();
  expect(root.local.inspect()).toMatchObject({custody:'local',commits:0,discards:0});expect(root.upper.inspect().accepted).toBe(false);
});
it('keeps the commit receipt nominally distinct from OB-01 prepared DATA and exposes no old-owner registration',async()=>{
  const root=setup(),receipt=root.local.commit(failed(root));
  const {createSyntheticOwnedMixedSupply}=await import('../support/review/synthetic-recovery-kernel.js');
  const old=createSyntheticOwnedMixedSupply({},{guard:()=>undefined});
  // @ts-expect-error Failure terminal acknowledgement is not an OB-01 prepared supply.
  expect(()=>old.discardPrepared(receipt)).toThrow();
  for(const key of ['commit','finalDiscard','issuer','upper'])expect(old).not.toHaveProperty(key);root.local.finalDiscard(receipt);
});
// Independent release table: expected results are constants, not calculated from the owner's predicate.
const releaseCases=[
  ['unknown','unknown',false,'none',false],['creating','creating',false,'none',false],['late_created_pending','creating',true,'confirmed',false],
  ['created_only','created',false,'none',false],['cleanup_only','created',false,'confirmed',false],['termination_only','created',true,'none',false],
  ['both_confirmed','created',true,'confirmed',true],['cleanup_unconfirmed','created',true,'unconfirmed',false],['proven_absence','absent',false,'none',true],
] as const;
it.each(roles.flatMap(role=>releaseCases.map(row=>[role,...row] as const)))('matches the independent %s / %s release oracle',(role,_name,generation,terminated,cleanup,expected)=>{
  const root=setup();absent(root,role);
  if(generation==='absent')root.local.observeAbsent(role,root.issuer.proveUncreated(role));
  else if(generation!=='unknown'){
    const t=root.issuer.beginCreation(role);if(generation==='created')root.local.observe(role,t,root.issuer.fact(t,'created'));
    if(terminated)root.local.observe(role,t,root.issuer.fact(t,role==='source'?'source_closed':role==='transport_group'?'transport_quiescent':'worker_terminated'));
    if(cleanup!=='none'){root.local.requestCleanup(role,t);root.local.observe(role,t,root.issuer.fact(t,cleanup==='confirmed'?'cleanup_confirmed':'cleanup_unconfirmed'));}
  }
  failed(root);expect(root.local.inspect().report).toMatchObject({outcome:'failed',release:expected?'confirmed':'unconfirmed',unresolved:expected?0:1});
});
