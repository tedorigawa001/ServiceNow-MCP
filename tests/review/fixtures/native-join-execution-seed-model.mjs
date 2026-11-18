import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {parse} from 'acorn';
import {generationParts} from './native-join-generation-model.mjs';
import {baseBegin,baseEnd,begin as pinBegin,end as pinEnd} from './native-join-runtime-pin-model.mjs';
import {begin as handlersBegin,end as handlersEnd} from './native-join-handlers-model.mjs';

export const begin='// JR-B-SEED-BEGIN: unused fields and refusal only; no execution.';
export const end='// JR-B-SEED-END';
function between(js,start,finish){assert.equal(js.split(start).length,2,start+' drift');assert.equal(js.split(finish).length,2,finish+' drift');return js.slice(js.indexOf(start)+start.length,js.indexOf(finish));}
export function deriveExecutionSeed(js,createNativeDiagnosticState){
  const parts=generationParts(js),base=between(js,baseBegin,baseEnd),pin=between(js,pinBegin,pinEnd),handlers=between(js,handlersBegin,handlersEnd),seed=between(js,begin,end);
  // The product is an ES module, so the derived realm runs in strict mode: read-only/accessor writes must not be silently ignored.
  return runInNewContext(`(()=>{'use strict';const P=Promise,promiseThen=P.prototype.then;let operations=0,hooks=0;${base}
    const create=()=>{let recovery;${parts.allocation};
      recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);recovery.writer=recovery.state.owner.writers('release');
      ${parts.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${parts.block}${pin}${handlers}${seed}
      const args=role=>{const s=(role==='run'?runGeneration:cleanupGeneration).pending;return[s,s?.identity,s?.pin];};
      return {runSlot:runGeneration,cleanupSlot:cleanupGeneration,
        resource:()=>{started=true;current={anchor:{binding}};return current;},
        pin:role=>role==='run'?prepareRunShell(runGeneration,controlRoot,controlRun):prepareCleanupShell(cleanupGeneration,controlRoot,controlDuty,current,current?.anchor),
        prepare:role=>prepareJoinHandlers(...args(role),role),
        pinCheck:role=>preparedShellMatched(...args(role),role),handlerCheck:role=>preparedHandlersMatched(...args(role),role),
        check:(role,...raw)=>executionSeedUnused(...(raw.length?raw:args(role)),role),
        request:(role,...raw)=>requestJoinExecution(...(raw.length?raw:args(role)),role),
        flags:()=>({primary,revoked,sealed}),set:p=>{if('primary'in p)primary=p.primary;if('revoked'in p)revoked=p.revoked;if('sealed'in p)sealed=p.sealed;},
        upper:()=>upper.snapshot()};};
    create.closeExecution=()=>{const bad=()=>{operations++;throw Error('PRIVATE_OPERATION');};globalThis.Promise=new Proxy(P,{construct:bad});
      for(const name of ['queueMicrotask','setTimeout','setInterval','fetch','Response','ReadableStream','Worker'])globalThis[name]=bad;
      Date.now=bad;globalThis.performance={now:bad};};
    create.mutate=()=>Object.defineProperty(P,Symbol.species,{get(){hooks++;throw Error('PRIVATE_GETTER');},configurable:true});
    create.poisonDescriptorPrototype=()=>Object.defineProperty(Object.prototype,'value',{get(){hooks++;throw Error('PRIVATE_DESCRIPTOR_GETTER');},configurable:true});
    create.poisonDescriptorWritable=()=>Object.defineProperty(Object.prototype,'writable',{get(){hooks++;throw Error('PRIVATE_DESCRIPTOR_GETTER');},configurable:true});
    create.counts=()=>({operations,hooks});return create;
  })()`,{createNativeDiagnosticState,types});
}
// Literal expectations are independent of the allocator/checker implementation.
export const seedFields={constructorClaim:false,constructorState:'not_called',executorEntryClaim:false,candidateHeld:false,candidateSafety:'unchecked',
  registrationWork:null,registrationReached:false,ackHeld:false,ackState:'empty',callbackClaim:false,callbackState:'not_entered',
  failureDrainClaim:false,failureDrainState:'unstarted',drainKind:'none',upperRecordAttempted:false,upperRecordState:'unattempted',notifyState:'unattempted',
  copyHeld:false,runCopyState:'unattempted',terminalCopy:null,rejectPayloadAttempted:false,rejectPayloadState:'unattempted',rejectPayload:null,ackTerminal:'unobserved',retention:'held'};
export const closedFields={executor:'not_entered',candidate:null,work:null,resolve:null,reject:null,observerClaim:false,observerState:'unstarted',observerBusy:false,
  observed:'unobserved',callbackFault:null,observerAckCandidate:null,observerAck:null,settleClaim:false,settleState:'unattempted',terminal:'unobserved',
  notifyAttempted:false,copyAttempted:false,dispatchStarted:false,entered:false};
export function verifyExecutionSeed(js,createState){
  const create=deriveExecutionSeed(js,createState);create.closeExecution();
  for(const role of ['run','cleanup']){
    const a=create();if(role==='cleanup'){a.resource();a.set({primary:'authentication_failed',revoked:true});}assert(a.pin(role));
    const s=a[role+'Slot'].pending,initial=Object.getOwnPropertyDescriptors(s);
    for(const [key,value]of Object.entries(seedFields)){assert.equal(s[key],value,key);assert.equal(initial[key].writable,true);assert('value'in initial[key]);}
    assert(a.prepare(role));assert.equal(a.check(role),true);assert.equal(a.check(role),true);
    const slot=a[role+'Slot'],before={...s},upper=JSON.stringify(a.upper());assert.equal(slot.position,'handlers');
    assert.equal(a.request(role),false);assert.equal(slot.pending,s);assert.equal(slot.position,'handlers');assert.equal(slot.faultAt,'constructor_pre');
    assert.equal(slot.fault,'invalid_state');assert.equal(s.readiness,'failed_retained');assert.equal(s.retention,'unconfirmed');
    assert.equal(s.handlersState,'ready');assert.equal(s.handlersFault,null);assert.equal(a.flags().revoked,true);
    assert.equal(a.flags().primary,role==='run'?'invalid_state':'authentication_failed');assert.equal(JSON.stringify(a.upper()),upper);
    for(const key of Object.keys(before).filter(k=>!['readiness','retention'].includes(k)))assert.equal(s[key],before[key],key);
    for(const [key,value]of Object.entries(closedFields))assert.equal(s[key],value,key);
    a.set({primary:null,revoked:false,sealed:false});assert.equal(a.check(role),false);
    assert.equal(a.request(role),false);assert.equal(slot.faultAt,'constructor_pre');assert.equal(slot.fault,'invalid_state');assert.equal(s.constructorClaim,false);
  }
  assert.equal(create.counts().operations,0);return {roles:2,fields:Object.keys(seedFields).length,constructorCalls:0,closureCalls:0,dispatch:0};
}

export function verifySeedField(js,createState,key){
  assert(Object.hasOwn(seedFields,key));let refusals=0,hooks=0;
  const create=deriveExecutionSeed(js,createState);create.closeExecution();
  for(const role of ['run','cleanup']){
    const a=create();if(role==='cleanup')a.resource();assert(a.pin(role));const s=a[role+'Slot'].pending,d=Object.getOwnPropertyDescriptor(s,key);
    for(const stage of ['pin','handlers']){
      if(stage==='handlers')assert(a.prepare(role));
      for(const change of ['value','getter','writable','enumerable','missing']){
        if(change==='value')s[key]=undefined;
        if(change==='getter')Object.defineProperty(s,key,{get(){hooks++;throw Error('PRIVATE_SEED_GETTER');},configurable:true});
        if(change==='writable')Object.defineProperty(s,key,{...d,writable:false});
        if(change==='enumerable')Object.defineProperty(s,key,{...d,enumerable:false});
        if(change==='missing')delete s[key];
        assert.equal(stage==='pin'?a.pinCheck(role):a.handlerCheck(role),false,key+stage+change);
        if(stage==='handlers')assert.equal(a.check(role),false,key+change);
        Object.defineProperty(s,key,d);assert.equal(stage==='pin'?a.pinCheck(role):a.handlerCheck(role),true);refusals++;
      }
    }
    const b=create();if(role==='cleanup')b.resource();assert(b.pin(role));assert(b.prepare(role));const held=b[role+'Slot'].pending;
    Object.defineProperty(held,key,{get(){hooks++;throw Error('PRIVATE_SEED_GETTER');},configurable:true});
    assert.equal(b.request(role),false);assert.equal(b[role+'Slot'].fault,'invalid_state');assert.equal(b.flags().revoked,true);
    assert.equal(b[role+'Slot'].pending,held);if(key!=='constructorClaim')assert.equal(held.constructorClaim,false);
    else assert.equal(typeof Object.getOwnPropertyDescriptor(held,key).get,'function');refusals++;
    const c=create();if(role==='cleanup')c.resource();assert(c.pin(role));assert(c.prepare(role));const fixed=c[role+'Slot'].pending;
    Object.defineProperty(fixed,key,{configurable:false});assert.equal(c.check(role),false,key+' nonconfigurable');refusals++;
  }
  assert.equal(hooks,0);assert.equal(create.counts().operations,0);return {refusals,hooks};
}

export function verifySeedIdentity(js,createState){
  let refusals=0,hooks=0;
  const proxy=new Proxy({}, {get(){hooks++;throw Error('PRIVATE_HOOK');},getPrototypeOf(){hooks++;throw Error('PRIVATE_HOOK');}}),revoked=Proxy.revocable({},{});revoked.revoke();
  const create=deriveExecutionSeed(js,createState);
  for(const role of ['run','cleanup'])for(const position of [0,1,2])for(const variant of ['foreign','copy','proxy','revoked']){
    const a=create(),b=create();if(role==='cleanup'){a.resource();b.resource();}assert(a.pin(role));assert(b.pin(role));assert(a.prepare(role));assert(b.prepare(role));
    const s=a[role+'Slot'].pending,t=b[role+'Slot'].pending,own=[s,s.identity,s.pin],other=[t,t.identity,t.pin],before={...t},slotBefore={...b[role+'Slot']};
    own[position]=variant==='foreign'?other[position]:variant==='copy'?{...own[position]}:variant==='proxy'?proxy:revoked.proxy;
    assert.equal(a.check(role,...own),false);assert.equal(a.request(role,...own),false);assert.equal(a[role+'Slot'].fault,'evidence_binding_mismatch');
    assert.equal(a[role+'Slot'].pending,s);assert.equal(s.constructorClaim,false);assert.equal(s.handlersState,'ready');assert.equal(s.handlersFault,null);
    assert.deepEqual({...t},before);assert.deepEqual({...b[role+'Slot']},slotBefore);assert.equal(b.flags().revoked,false);refusals++;
  }
  assert.equal(hooks,0);return {refusals,hooks};
}

export function verifySeedStop(js,createState){
  let cases=0;
  for(const role of ['run','cleanup'])for(const change of ['stopped','sealed','record','species','role']){
    if(role==='run'&&change==='record')continue;
    const create=deriveExecutionSeed(js,createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));const s=a[role+'Slot'].pending;
    if(change==='stopped')a.set({primary:'cancelled',revoked:true});if(change==='sealed')a.set({sealed:true});if(change==='record')a.resource();
    if(change==='species')create.mutate();if(change==='role')a[role+'Slot'].role=role==='run'?'cleanup':'run';
    assert.equal(a.check(role),role==='cleanup'&&change==='stopped');assert.equal(a.request(role),false);assert.equal(s.retention,'unconfirmed');
    assert.equal(a[role+'Slot'].pending,s);assert.equal(s.constructorClaim,false);assert.equal(s.handlersFault,null);assert.equal(create.counts().hooks,0);cases++;
  }
  // A seed refusal cannot erase a fault raised earlier in handler preparation.
  for(const role of ['run','cleanup']){
    const a=deriveExecutionSeed(js,createState)();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));assert.equal(a.prepare(role),false);
    const slot=a[role+'Slot'],s=slot.pending,at=slot.faultAt,fault=slot.fault,detail=s.handlersFault;
    assert.equal(a.request(role),false);assert.equal(slot.faultAt,at);assert.equal(slot.fault,fault);assert.equal(s.handlersFault,detail);cases++;
  }
  return {cases,constructorCalls:0,hooks:0};
}

export function verifySeedDescriptorPrototype(js,createState){
  let cases=0,fieldHooks=0;
  for(const role of ['run','cleanup']){
    const create=deriveExecutionSeed(js,createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));
    const s=a[role+'Slot'].pending;Object.defineProperty(s,'constructorClaim',{get(){fieldHooks++;throw Error('PRIVATE_SEED_GETTER');},configurable:true});
    create.poisonDescriptorPrototype();let result;assert.doesNotThrow(()=>{result=a.check(role);});assert.equal(result,false);
    assert.equal(a.request(role),false);assert.equal(a[role+'Slot'].fault,'invalid_state');assert.equal(fieldHooks,0);assert.equal(create.counts().hooks,0);cases++;
  }
  return {cases,hooks:0};
}

// Failure writers must skip read-only/accessor fields without hooks, so the fixed refusal still records the slot fault and revocation.
export const failureWriterCases=[['readiness','readonly'],['retention','readonly'],['retention','accessor'],['retention','inherited']];
export function verifySeedFailureWriters(js,createState){
  let cases=0,fieldHooks=0;const written={readiness:'failed_retained',retention:'unconfirmed'};
  for(const role of ['run','cleanup'])for(const [field,change] of failureWriterCases){
    const create=deriveExecutionSeed(js,createState);create.closeExecution();const a=create();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));
    const slot=a[role+'Slot'],s=slot.pending,other=field==='readiness'?'retention':'readiness';
    if(change==='readonly')Object.defineProperty(s,field,{value:s[field],writable:false,enumerable:true,configurable:true});
    else Object.defineProperty(s,field,{get(){fieldHooks++;throw Error('PRIVATE_SEED_GETTER');},set(){fieldHooks++;throw Error('PRIVATE_SEED_SETTER');},configurable:true});
    const kept=Object.getOwnPropertyDescriptor(s,field);if(change==='inherited')create.poisonDescriptorWritable();
    let result;assert.doesNotThrow(()=>{result=a.request(role);},role+' '+field+' '+change);assert.equal(result,false);
    assert.equal(slot.fault,'invalid_state');assert.equal(slot.faultAt,'constructor_pre');assert.equal(slot.phase,'failed_retained');assert.equal(slot.pending,s);
    assert.equal(a.flags().revoked,true);assert.equal(a.flags().primary,'invalid_state');
    const now=Object.getOwnPropertyDescriptor(s,field);assert.equal(now.value,kept.value);assert.equal(now.get,kept.get);assert.equal(now.set,kept.set);assert.equal(now.writable,kept.writable);
    assert.equal(s[other],written[other]);assert.equal(s.constructorClaim,false);assert.equal(s.handlersState,'ready');assert.equal(create.counts().hooks,0);cases++;
  }
  assert.equal(fieldHooks,0);return {cases,hooks:0};
}

export function auditExecutionSeed(js){
  const block=between(js,begin,end),tree=parse('function closed(){'+block+'}',{ecmaVersion:'latest'}),stack=[tree];
  const allowed=new Set(['handlerOriginMatched','preparedHandlersMatched','executionSeedUnused','failExecutionSeed','rejectJoinGeneration','jbGet','jbOwn']);
  let aliases=0;
  while(stack.length){const n=stack.pop();assert(!['NewExpression','AwaitExpression','ImportExpression','ArrowFunctionExpression'].includes(n.type));
    if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.id.name.endsWith('Expected')){assert.equal(n.init.value,null);aliases++;}
    if(n.type==='CallExpression')assert(n.callee.type==='Identifier'&&allowed.has(n.callee.name),'closed seed capability');
    if(n.type==='MemberExpression'&&n.object.type==='Identifier')assert(!['rawShell','rawIdentity','rawPin'].includes(n.object.name),'raw seed field read');
    if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'){
      const target=block.slice(n.left.start-'function closed(){'.length,n.left.end-'function closed(){'.length);
      assert(['slot.faultAt','held.readiness','held.retention'].includes(target),'operational seed writer');
    }
    for(const v of Object.values(n)){if(Array.isArray(v))stack.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')stack.push(v);}}
  assert.equal(aliases,14);return {aliases,constructorCalls:0,closureCalls:0,dispatch:0};
}

export function mutateSeed(js,from,to,count=1){
  const block=between(js,begin,end);assert.equal(typeof from==='string'?block.split(from).length-1:[...block.matchAll(from)].length,count,'seed mutation drift');
  const changed=js.replace(block,typeof from==='string'?block.replaceAll(from,to):block.replace(from,to));parse(changed,{ecmaVersion:'latest',sourceType:'module'});return changed;
}
export const seedMutants=[
  ['fixed refusal',"return failExecutionSeed(role, 'invalid_state');",'return true;',2],
  ['binding diagnosis',"return failExecutionSeed(role, 'evidence_binding_mismatch');","return failExecutionSeed(role, 'invalid_state');",1],
  ['first fault',"slot.faultAt ??= 'constructor_pre';","slot.faultAt = 'constructor_pre';",1],
  ['failure readiness',"held.readiness = 'failed_retained';",'void held;',1],
  ['retention',"held.retention = 'unconfirmed';",'void held;',1],
  ['root stop','return rejectJoinGeneration(slot, code);','return false;',1],
  ['captured alias','runCapturedResolveExpected = null','runCapturedResolveExpected = {}',1],
  ['readiness writer guard',"if (r && jbOwn(r, 'value') && r.writable === true)",'if (true)',1],
  ['readiness writable guard',"jbOwn(r, 'value') && r.writable === true)","jbOwn(r, 'value'))",1],
  ['retention writer guard',"if (d && jbOwn(d, 'value') && d.writable === true)",'if (true)',1],
  ['retention writable guard',"jbOwn(d, 'value') && d.writable === true)","jbOwn(d, 'value'))",1],
  ['retention data tag',"d && jbOwn(d, 'value') && d.writable","d && d.writable",1],
];
export function verifySeedMutant(js,createState,index){
  const [,from,to,count]=seedMutants[index],changed=mutateSeed(js,from,to,count);
  assert.throws(()=>{verifyExecutionSeed(changed,createState);verifySeedIdentity(changed,createState);verifySeedStop(changed,createState);verifySeedFailureWriters(changed,createState);auditExecutionSeed(changed);},assert.AssertionError);
}
export function verifySeedFieldMutant(js,createState,key){
  const pattern=new RegExp("joinSeedData\\(shell, '"+key+"', (?:false|null|'[^']*')\\)",'g');
  assert.equal([...js.matchAll(pattern)].length,1,key+' field mutation drift');const changed=js.replace(pattern,'true');parse(changed,{ecmaVersion:'latest',sourceType:'module'});
  assert.throws(()=>verifySeedField(changed,createState,key),assert.AssertionError,key);
}
export const seedBoundaryMutants=[
  ['pin seed check',' && joinExecutionFieldsUnused(s)',''],
  ['handler seed check','|| !joinExecutionFieldsUnused(shell)',''],
  ['data tag',"jbOwn(d, 'value')",'true'],
  ['writable',' && d.writable === true',''],
  ['enumerable',' && d.enumerable === true',''],
  ['configurable',' && d.configurable === true',''],
];
export function verifySeedBoundaryMutant(js,createState,index){
  const [label,from,to]=seedBoundaryMutants[index],pin=label==='handler seed check'?between(js,handlersBegin,handlersEnd):between(js,pinBegin,pinEnd);assert.equal(pin.split(from).length,2,label+' drift');
  const changed=js.replace(pin,pin.replace(from,to));parse(changed,{ecmaVersion:'latest',sourceType:'module'});
  assert.throws(()=>{verifySeedField(changed,createState,'constructorClaim');verifySeedDescriptorPrototype(changed,createState);},assert.AssertionError,label);
}
export function verifySeedAuditNegatives(js){
  const anchor='// A ready seed never authorizes a constructor or a retained closure in this slice.';
  const actions=['new P(()=>{});','rawShell.executorHandler();','jbApply(rawShell,undefined,[]);','notifyStop();','snapshot();','rawShell.constructorClaim=true;','rawShell.constructor;'];
  for(const action of actions)assert.throws(()=>auditExecutionSeed(mutateSeed(js,anchor,action+anchor)),assert.AssertionError);return actions.length;
}
