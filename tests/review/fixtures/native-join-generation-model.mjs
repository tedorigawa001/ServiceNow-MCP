import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {preparationPrefix} from './native-control-preparation-model.mjs';

export const begin='// JR-A-BEGIN: closed lexical generation contracts; no Promise, publication or dispatch.';
export const end='// JR-A-END: pending/publication slots remain null; legacy work is unchanged.';
export function generationParts(js){
  const ast=parse(js,{ecmaVersion:'latest',sourceType:'module'}),nodes=[],stack=[ast];
  while(stack.length){const n=stack.pop();nodes.push(n);for(const v of Object.values(n)){
    if(Array.isArray(v))stack.push(...v.filter(x=>x&&typeof x.type==='string'));
    else if(v&&typeof v==='object'&&typeof v.type==='string')stack.push(v);
  }}
  const anchor=nodes.filter(n=>n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&n.left.name==='recovery');
  assert.equal(anchor.length,1,'recovery allocation drift');
  assert.equal(js.split(begin).length,2,'generation start drift');assert.equal(js.split(end).length,2,'generation end drift');
  const block=js.slice(js.indexOf(begin)+begin.length,js.indexOf(end));
  // Every runtime capability stays outside this extracted, lexical-only boundary.
  const tree=parse('function closed(){'+block+'}',{ecmaVersion:'latest'}),pending=[tree];
  const forbidden=new Set(['P','Promise','enqueue','queueMicrotask','setTimeout','setInterval','Date','performance','Response','fetch','Worker',
    'readBudget','schedule','sample','bridge','observe','failConstruction','notifyStop']);
  while(pending.length){const n=pending.pop();assert(!['NewExpression','AwaitExpression','ImportExpression'].includes(n.type));
    if(n.type==='Identifier')assert(!forbidden.has(n.name),'generation capability: '+n.name);
    for(const v of Object.values(n)){if(Array.isArray(v))pending.push(...v.filter(x=>x&&typeof x.type==='string'));
      else if(v&&typeof v==='object'&&typeof v.type==='string')pending.push(v);}}
  return {allocation:js.slice(anchor[0].start,anchor[0].end),preparation:preparationPrefix(js),block};
}
export function deriveGeneration(js,createNativeDiagnosticState){
  const {allocation,preparation,block}=generationParts(js);
  // Only the scratch copy exposes private references or fault setters. No product friend/export/registration is added.
  return Function('createNativeDiagnosticState',`return function(){
    let recovery;${allocation};
    recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);
    recovery.writer=recovery.state.owner.writers('release');
    ${preparation}
    recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
    ${block}
    return {root:controlRoot,runSeed:controlRun,cleanupSeed:controlDuty,runSlot:runGeneration,cleanupSlot:cleanupGeneration,
      run:(...args)=>beginRunGeneration(...(args.length?args:[runGeneration,controlRoot,controlRun])),
      cleanup:(...args)=>beginCleanupGeneration(...(args.length?args:[cleanupGeneration,controlRoot,controlDuty,current,current?.anchor])),
      phase:joinRuntimePhaseValid,
      flags:()=>({started,primary,revoked,sealed,status:recovery.status}),
      set:p=>{if('started'in p)started=p.started;if('primary'in p)primary=p.primary;if('revoked'in p)revoked=p.revoked;
        if('sealed'in p)sealed=p.sealed;if('status'in p)recovery.status=p.status;},
      resource:()=>{started=true;current={anchor:{binding}};return current;},
      failRun:code=>rejectJoinGeneration(runGeneration,code),
      held:()=>({run:recovery.runPending,cleanup:recovery.cleanupPending,runSlot:recovery.runGeneration,cleanupSlot:recovery.cleanupGeneration}),
      upper:()=>upper.snapshot()};
  }`)(createNativeDiagnosticState);
}
// Independent event expectations: no output copied from the implementation.
const empty=role=>({role,claimed:false,phase:'empty',position:'empty',fault:null,pending:null,published:null});
export function verifyGeneration(create){
  let refusals=0;
  const a=create();assert.deepEqual(a.runSlot,empty('run'));assert.deepEqual(a.cleanupSlot,empty('cleanup'));
  assert.equal(a.held().runSlot,a.runSlot);assert.equal(a.held().cleanupSlot,a.cleanupSlot);
  assert.equal(a.run(),true);assert.deepEqual(a.runSlot,{...empty('run'),claimed:true,position:'claimed',phase:'claimed_unheld'});
  assert.deepEqual(a.flags(),{started:true,primary:null,revoked:false,sealed:false,status:'ready'});
  assert.equal(a.run(),false);refusals++;assert.equal(a.runSlot.claimed,true);assert.equal(a.runSlot.position,'claimed');
  assert.equal(a.runSlot.phase,'failed_retained');assert.equal(a.runSlot.fault,'invalid_state');
  for(const flags of [{started:true},{revoked:true},{sealed:true},{primary:'authentication_failed'},{status:'building'},{status:'failed'}]){
    const x=create();x.set(flags);assert.equal(x.run(),false);assert.equal(x.runSlot.claimed,false);
    assert.equal(x.runSlot.fault,'invalid_state');assert.equal(x.flags().primary,flags.primary??'invalid_state');refusals++;
    x.set({started:false,revoked:false,sealed:false,status:'ready',primary:null});assert.equal(x.run(),false);refusals++;
  }
  // Each local slot corruption is independent and never grants an operational work.
  for(const patch of [{claimed:true},{position:'claimed'},{phase:'claimed_unheld'},{fault:'internal_review_error'},{pending:{}},{published:{}}]){
    const x=create();Object.assign(x.runSlot,patch);assert.equal(x.run(),false);refusals++;
  }
  const c=create();c.resource();c.set({revoked:true,primary:'authentication_failed'});
  assert.equal(c.cleanup(),true);assert.equal(c.flags().primary,'authentication_failed');assert.equal(c.cleanupSlot.claimed,true);
  assert.equal(c.cleanup(),false);assert.equal(c.flags().primary,'authentication_failed');assert.equal(c.cleanupSlot.position,'claimed');refusals++;
  for(const flags of [{sealed:true},{status:'building'},{status:'failed'},{started:false}]){
    const x=create();x.resource();x.set(flags);assert.equal(x.cleanup(),false);assert.equal(x.cleanupSlot.claimed,false);refusals++;
  }
  const missing=create();assert.equal(missing.cleanup(),false);refusals++;
  const wrongBinding=create();wrongBinding.resource().anchor.binding={};assert.equal(wrongBinding.cleanup(),false);refusals++;
  assert.equal(wrongBinding.cleanupSlot.fault,'evidence_binding_mismatch');
  const failed=create();assert(failed.run());failed.failRun('internal_review_error');failed.failRun('invalid_state');
  assert.equal(failed.runSlot.fault,'internal_review_error');assert.equal(failed.flags().primary,'internal_review_error');
  assert.equal(failed.runSlot.claimed,true);assert.equal(failed.runSlot.pending,null);assert.equal(failed.runSlot.published,null);
  assert.equal(failed.run(),false);refusals++;
  return {refusals,slots:2,work:0,publication:0,dispatch:0};
}
export function verifyGenerationIdentity(create){
  let refusals=0,hooks=0;
  const trap=new Proxy({}, {get(){hooks++;throw Error('PRIVATE_HOOK');},getPrototypeOf(){hooks++;throw Error('PRIVATE_HOOK');}});
  const revoked=Proxy.revocable({},{});revoked.revoke();
  for(const role of ['run','cleanup'])for(let position=0;position<(role==='run'?3:5);position++)for(const variant of ['foreign','copy','proxy','revoked']){
    const a=create(),b=create(),ar=a.resource(),br=b.resource();a.set({started:role==='cleanup'});
    const own=role==='run'?[a.runSlot,a.root,a.runSeed]:[a.cleanupSlot,a.root,a.cleanupSeed,ar,ar.anchor];
    const foreign=role==='run'?[b.runSlot,b.root,b.runSeed]:[b.cleanupSlot,b.root,b.cleanupSeed,br,br.anchor];
    const before=JSON.stringify({flags:b.flags(),slot:b[role+'Slot'],upper:b.upper()});
    own[position]=variant==='foreign'?foreign[position]:variant==='copy'?{...own[position]}:variant==='proxy'?trap:revoked.proxy;
    assert.equal(a[role](...own),false);assert.equal(a[role+'Slot'].fault,'evidence_binding_mismatch');
    assert.equal(a[role+'Slot'].claimed,false);assert.equal(JSON.stringify({flags:b.flags(),slot:b[role+'Slot'],upper:b.upper()}),before);refusals++;
  }
  assert.equal(hooks,0);return {refusals,hooks};
}
export function verifyGenerationPhases(create){
  const a=create(),resolve=()=>{},reject=()=>{},work={},ack={};let cases=0;
  for(const kind of ['run','cleanup']){
    const base={kind,dispatchStarted:false,entered:false,settleClaim:false,fault:null,candidate:null,work:null,resolve:null,reject:null,observerAck:null};
    const pair={resolve,reject:kind==='run'?reject:null};
    const legal=[{...base,phase:'building',prefix:'runtime',executor:'not_entered'},
      {...base,phase:'capturing',prefix:'executor',executor:'running'},
      {...base,...pair,phase:'captured',prefix:'resolve',executor:'normal_exit'},
      {...base,...pair,phase:'candidate_held',prefix:'candidate',executor:'normal_exit',candidate:work},
      ...['checked','published'].map(phase=>({...base,...pair,phase,prefix:phase,executor:'normal_exit',candidate:work,work,observerAck:ack})),
      {...base,phase:'failed_retained',prefix:'runtime',executor:'abnormal',fault:'internal_review_error'}];
    if(kind==='run')legal.push({...base,phase:'capturing',prefix:'reject',executor:'running',reject});
    for(const value of legal){assert.equal(a.phase(value),true);cases++;
      for(const patch of [{dispatchStarted:true},{entered:true},{phase:'unknown'},{executor:'unknown'}]){assert.equal(a.phase({...value,...patch}),false);cases++;}}
    for(const value of legal.filter(v=>v.phase!=='failed_retained')){assert.equal(a.phase({...value,fault:'invalid_state'}),false);cases++;}
    for(const value of legal.filter(v=>['captured','candidate_held','checked','published'].includes(v.phase))){
      assert.equal(a.phase({...value,resolve:null}),false);cases++;
      if(kind==='run'){assert.equal(a.phase({...value,reject:null}),false);cases++;}}
    const checked=legal.find(v=>v.phase==='checked');
    for(const patch of [{prefix:'published'},{candidate:{}},{observerAck:null},{work:null},{work:undefined,candidate:undefined},{observerAck:undefined}]){
      assert.equal(a.phase({...checked,...patch}),false);cases++;}
    if(kind==='cleanup')for(const value of legal){assert.equal(a.phase({...value,reject}),false);cases++;}
    assert.equal(a.phase({...base,phase:'failed_retained',prefix:'runtime',executor:'abnormal',fault:undefined}),false);cases++;
  }
  return cases;
}
export function verifyGenerationMutants(js,createState){
  const changes=[['same owner','if (!sameJoinGenerationOwner(slot, root, seed, \'run\'))','if (false)'],
    ['ready',"joinRecovery.status !== 'ready' || started",'false || started'],
    ['revoked','started || revoked || primary !== null','started || false || primary !== null'],
    ['primary','revoked || primary !== null || sealed','revoked || false || sealed'],
    ['claim','runGeneration.claimed = true;','runGeneration.claimed = false;'],
    ['started',/started = true;\s+runGeneration\.claimed/g,'started = false; runGeneration.claimed'],
    ['sticky','slot.fault ??= code;','slot.fault = code;'],
    ['cleanup identity','record !== current','false'],
    ['cleanup stop asymmetry',"if (current.anchor.binding !== binding)","if (revoked || current.anchor.binding !== binding)"],
    ['cleanup sealed',"joinRecovery.status !== 'ready' || !started || sealed","joinRecovery.status !== 'ready' || !started || false"],
    ['phase dispatch','v.dispatchStarted !== false','false']];
  for(const [label,from,to] of changes){assert.equal(typeof from==='string'?js.split(from).length-1:[...js.matchAll(from)].length,1,'mutation drift: '+label);
    const changed=js.replace(from,to);parse(changed,{ecmaVersion:'latest',sourceType:'module'});
    assert.throws(()=>{const create=deriveGeneration(changed,createState);verifyGeneration(create);verifyGenerationIdentity(create);verifyGenerationPhases(create);},assert.AssertionError,label);}
  return changes.length;
}
