import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {parse} from 'acorn';
import {generationParts} from './native-join-generation-model.mjs';

export const baseBegin='// JR-B-BASE-BEGIN: module-private reflection baseline, no Promise construction.';
export const baseEnd='// JR-B-BASE-END';
export const begin='// JR-B-PREP-BEGIN: shell and pin only; no Promise, handlers, publication or dispatch.';
export const end='// JR-B-PREP-END';
function between(js,start,finish){assert.equal(js.split(start).length,2,start+' drift');assert.equal(js.split(finish).length,2,finish+' drift');return js.slice(js.indexOf(start)+start.length,js.indexOf(finish));}
export function faultRuntimePin(js,role,point){
  const wrap='function wrap(){',block=between(js,begin,end),ast=parse(wrap+block+'}',{ecmaVersion:'latest'}),
    name=role==='run'?'prepareRunShell':'prepareCleanupShell',fn=ast.body[0].body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  assert(fn,name+' drift');const from=fn.start-wrap.length,to=fn.end-wrap.length,body=block.slice(from,to);
  const action="throw 'PRIVATE_SHELL_FAULT';",prefix=role==='run'?'run':'cleanup';
  const anchors={runtime_before:[`const s = ${prefix}ShellExpected`,action+`const s = ${prefix}ShellExpected`],
    runtime_after:[`${prefix}Generation.phase = 'building';`,`${prefix}Generation.phase = 'building';`+action],
    identity_before:[`const identity = ${prefix}IdentityExpected`,action+`const identity = ${prefix}IdentityExpected`],
    identity_after:['jbFreeze(identity);',action+'jbFreeze(identity);'],
    pin_before:[`const pin = ${prefix}PinExpected`,action+`const pin = ${prefix}PinExpected`],
    pin_after:['if (!joinPromisePinLive())',action+'if (!joinPromisePinLive())'],
    context_before:['const context =','throw \'PRIVATE_SHELL_FAULT\'; const context ='],
    context_after:['jbFreeze(context);',action+'jbFreeze(context);'],
    stop_identity:['jbFreeze(identity);',"jbFreeze(identity); revoked = true; primary ??= 'cancelled';"]};
  const [anchor,replacement]=anchors[point];assert.equal(body.split(anchor).length,2,'fault drift: '+point);
  const modified=block.slice(0,from)+body.replace(anchor,replacement)+block.slice(to);
  return js.replace(block,modified);
}
export function deriveRuntimePin(js,createNativeDiagnosticState){
  const parts=generationParts(js),base=between(js,baseBegin,baseEnd),block=between(js,begin,end);
  // Fresh synthetic realm; mutations never touch the runner realm. No product export/friend/registration.
  return runInNewContext(`(()=>{const P=Promise,promiseThen=P.prototype.then;let hooks=0,operations=0;${base}
    const create=function(){let recovery;${parts.allocation};
      recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);recovery.writer=recovery.state.owner.writers('release');
      ${parts.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${parts.block}
      ${block}
      return {runSlot:runGeneration,cleanupSlot:cleanupGeneration,root:controlRoot,runSeed:controlRun,cleanupSeed:controlDuty,
        run:(...args)=>prepareRunShell(...(args.length?args:[runGeneration,controlRoot,controlRun])),
        cleanup:(...args)=>prepareCleanupShell(...(args.length?args:[cleanupGeneration,controlRoot,controlDuty,current,current?.anchor])),
        resource:()=>{started=true;current={anchor:{binding}};return current;},
        flags:()=>({started,primary,revoked,sealed}),
        check:(shell,identity,pin,role='run')=>preparedShellMatched(shell,identity,pin,role),
        set:p=>{if('primary'in p)primary=p.primary;if('revoked'in p)revoked=p.revoked;if('sealed'in p)sealed=p.sealed;},
        upper:()=>upper.snapshot()};
    };
    create.mutate=name=>{const bad=()=>{hooks++;throw Error('PRIVATE_GETTER');};
      if(name==='species_get')Object.defineProperty(P,Symbol.species,{get:bad,configurable:true});
      if(name==='species_data')Object.defineProperty(P,Symbol.species,{value:P,configurable:true});
      if(name==='species_flags')Object.defineProperty(P,Symbol.species,{...joinPromiseBasis.sd,enumerable:!joinPromiseBasis.sd.enumerable});
      if(name==='constructor_get')Object.defineProperty(P.prototype,'constructor',{get:bad,configurable:true});
      if(name==='constructor_value')Object.defineProperty(P.prototype,'constructor',{value:function Other(){},configurable:true});
      if(name==='constructor_writable')Object.defineProperty(P.prototype,'constructor',{...joinPromiseBasis.cd,writable:!joinPromiseBasis.cd.writable});
      if(name==='then_get')Object.defineProperty(P.prototype,'then',{get:bad,configurable:true});
      if(name==='then_value')Object.defineProperty(P.prototype,'then',{value:bad,configurable:true});
      if(name==='then_configurable')Object.defineProperty(P.prototype,'then',{...joinPromiseBasis.td,configurable:false});
      if(name==='species_setter')Object.defineProperty(P,Symbol.species,{...joinPromiseBasis.sd,set:bad});
      if(name==='species_missing')delete P[Symbol.species];
      if(name==='p_parent')Object.setPrototypeOf(P,{});
      if(name==='proto_parent')Object.setPrototypeOf(P.prototype,{});
      if(name==='frozen_get')Object.defineProperty(Object,'isFrozen',{get:bad,configurable:true});
      if(name==='global_object_get')Object.defineProperty(globalThis,'Object',{get:bad,configurable:true});
      if(name==='global_object_value')Object.defineProperty(globalThis,'Object',{value:{},configurable:true});
    };
    create.closeExecution=()=>{const bad=()=>{operations++;throw Error('PRIVATE_OPERATION');};
      globalThis.Promise=new Proxy(P,{construct:bad});for(const name of ['queueMicrotask','setTimeout','setInterval','fetch','Response','ReadableStream','Worker'])globalThis[name]=bad;
      Date.now=bad;globalThis.performance={now:bad};};
    create.counts=()=>({hooks,operations});return create;
  })()`,{createNativeDiagnosticState,types});
}

export function auditRuntimePreparation(js){
  const base=between(js,baseBegin,baseEnd),block=between(js,begin,end),tree=parse(base+'\nfunction closed(){'+block+'}',{ecmaVersion:'latest'}),stack=[tree];
  const forbidden=new Set(['enqueue','queueMicrotask','setTimeout','setInterval','Date','performance','readBudget','schedule','sample','bridge',
    'observe','notifyStop','failConstruction','fetch','Response','ReadableStream','Worker']);
  while(stack.length){const n=stack.pop();assert(!['NewExpression','AwaitExpression','ImportExpression'].includes(n.type));
    if(n.type==='Identifier')assert(!forbidden.has(n.name),'preparation capability: '+n.name);
    if(n.type==='CallExpression'&&n.callee.type==='Identifier')assert(!['P','promiseThen','jbApply','jbIsPromise'].includes(n.callee.name));
    for(const v of Object.values(n)){if(Array.isArray(v))stack.push(...v.filter(x=>x&&typeof x.type==='string'));
      else if(v&&typeof v==='object'&&typeof v.type==='string')stack.push(v);}}
  return {constructorCalls:0,observerCalls:0,dispatches:0};
}

export const runtimePinMutants=[
  ['species',"sameJoinDescriptor(jbGet(P, jbSpecies), joinPromiseBasis.sd)",'true',1],
  ['constructor',"sameJoinDescriptor(jbGet(joinPromiseBasis.proto, 'constructor'), joinPromiseBasis.cd)",'true',1],
  ['then',"sameJoinDescriptor(jbGet(joinPromiseBasis.proto, 'then'), joinPromiseBasis.td)",'true',1],
  ['constructor parent','jbProto(P) === joinPromiseBasis.pParent','true',1],
  ['prototype parent','jbProto(joinPromiseBasis.proto) === joinPromiseBasis.protoParent','true',1],
  ['first failure','slot.faultAt ??= at;','slot.faultAt = at;',1],
  ['main pending','runShellExpected = runGeneration.pending = allocateJoinShell','runShellExpected = allocateJoinShell',1],
  ['failure readiness',"shell.readiness = 'failed_retained';",'void 0;',1],
  ['shell identity','rawShell !== s','false',1],
  ['identity origin','rawIdentity !== identity','false',1],
  ['pin origin','rawPin !== pin','false',1],
  ['closed dispatch','s.dispatchStarted === false','true',1],
  ['closed observation','s.observerClaim === false','true',1],
  ['writable flags','a.writable === b.writable','true',1],
  ['enumerable flags','a.enumerable !== b.enumerable','false',1],
  ['configurable flags','a.configurable !== b.configurable','false',1],
  ['intermediate stops',/if \(!shellPreparationLive\(s\)\)\s+return failPreparedJoin\((?:run|cleanup)Generation, at, 'invalid_state'\);/g,'',5],
];
export function verifyRuntimeMutant(js,createState,index){
  const [label,from,to,count]=runtimePinMutants[index];assert.equal(typeof from==='string'?js.split(from).length-1:[...js.matchAll(from)].length,count,'mutant drift: '+label);
  const changed=typeof from==='string'?js.replaceAll(from,to):js.replace(from,to);parse(changed,{ecmaVersion:'latest',sourceType:'module'});
  assert.throws(()=>{verifyRuntimePins(changed,createState);verifyRuntimeIdentity(changed,createState);verifyRuntimePrefixes(changed,createState);verifyRuntimeDrifts(changed,createState);},assert.AssertionError,label);
}

const closedFields={executor:'not_entered',executorHandler:null,fulfilledHandler:null,rejectedHandler:null,observerArgs:null,
  candidate:null,work:null,resolve:null,reject:null,observerClaim:false,observerState:'unstarted',observerBusy:false,observed:'unobserved',
  callbackFault:null,observerAckCandidate:null,observerAck:null,settleClaim:false,settleState:'unattempted',terminal:'unobserved',
  notifyAttempted:false,copyAttempted:false,dispatchStarted:false,entered:false};
function closed(shell){for(const [key,value]of Object.entries(closedFields))assert.equal(shell[key],value,key);}
function call(a,role){let result;assert.doesNotThrow(()=>{result=a[role]();});return result;}
export function verifyRuntimePins(js,createState){
  const create=deriveRuntimePin(js,createState);create.closeExecution();
  for(const role of ['run','cleanup']){
    const a=create();if(role==='cleanup'){a.resource();a.set({revoked:true,primary:'authentication_failed'});}
    assert.equal(call(a,role),true);const slot=a[role+'Slot'],s=slot.pending;
    assert(s);assert.equal(slot.claimed,true);assert.equal(slot.phase,'building');assert.equal(slot.position,'pin');assert.equal(slot.faultAt,null);
    assert.equal(s.kind,role);assert.equal(s.root,a.root);assert.equal(s.seed,a[role+'Seed']);assert.equal(s.pin.runtime,s);
    assert.equal(s.pin.identity,s.identity);assert.equal(s.readiness,'pin_ready');assert.equal(s.pinState,'ready');
    assert(Object.isFrozen(s.identity));assert(Object.isFrozen(s.pin));assert(!Object.isFrozen(s));closed(s);
    if(role==='run')assert.equal(s.identity.context,null);else{assert.equal(s.identity.context,s.context);assert(Object.isFrozen(s.context));}
    assert(a.check(s,s.identity,s.pin,role));assert.equal(slot.published,null);
    for(const key of Object.keys(closedFields)){const before=s[key];s[key]=undefined;assert.equal(a.check(s,s.identity,s.pin,role),false,key);s[key]=before;}
    const pin=s.pin;assert.equal(call(a,role),false);assert.equal(slot.pending,s);assert.equal(s.pin,pin);
    assert.equal(s.readiness,'failed_retained');assert.equal(a.flags().revoked,true);assert.equal(slot.faultAt,'pin');
    if(role==='cleanup')assert.equal(a.flags().primary,'authentication_failed');
  }
  assert.equal(create.counts().operations,0);return {roles:2,closedFields:Object.keys(closedFields).length,work:0,observation:0,publication:0,dispatch:0};
}
export function verifyRuntimeIdentity(js,createState){
  const create=deriveRuntimePin(js,createState);let hooks=0,entries=0,post=0;
  const trap=new Proxy({}, {get(){hooks++;throw Error('PRIVATE_HOOK');},getPrototypeOf(){hooks++;throw Error('PRIVATE_HOOK');}}),revoked=Proxy.revocable({},{});revoked.revoke();
  for(const role of ['run','cleanup']){
    for(let index=0;index<(role==='run'?3:5);index++)for(const variant of ['foreign','copy','proxy','revoked']){
      const a=create(),b=create(),ar=role==='cleanup'?a.resource():null,br=role==='cleanup'?b.resource():null,
        own=role==='run'?[a.runSlot,a.root,a.runSeed]:[a.cleanupSlot,a.root,a.cleanupSeed,ar,ar.anchor],
        foreign=role==='run'?[b.runSlot,b.root,b.runSeed]:[b.cleanupSlot,b.root,b.cleanupSeed,br,br.anchor];
      const before=JSON.stringify(b[role+'Slot']);own[index]=variant==='foreign'?foreign[index]:variant==='copy'?{...own[index]}:variant==='proxy'?trap:revoked.proxy;
      let result;assert.doesNotThrow(()=>{result=a[role](...own);});assert.equal(result,false);assert.equal(a[role+'Slot'].claimed,false);
      assert.equal(a[role+'Slot'].fault,'evidence_binding_mismatch');assert.equal(a.flags().revoked,true);assert.equal(JSON.stringify(b[role+'Slot']),before);entries++;
    }
    const a=create(),b=create();if(role==='cleanup'){a.resource();b.resource();}assert(call(a,role));assert(call(b,role));
    const s=a[role+'Slot'].pending,t=b[role+'Slot'].pending,own=[s,s.identity,s.pin],foreign=[t,t.identity,t.pin];
    for(let index=0;index<3;index++)for(const value of [foreign[index],{...own[index]},trap,revoked.proxy]){
      const args=[...own];args[index]=value;let result;assert.doesNotThrow(()=>{result=a.check(...args,role);});assert.equal(result,false);post++;
    }
    for(const [holder,key]of [[a[role+'Slot'],'pending'],[s,'identity'],[s,'pin']]){
      const saved=holder[key];holder[key]={...saved};assert.equal(a.check(...own,role),false);holder[key]=saved;post++;
    }
    assert(a.check(...own,role));assert.equal(b[role+'Slot'].pending,t);assert.equal(b.flags().revoked,false);
  }
  assert.equal(hooks,0);return {entries,post,hooks};
}
export function verifyRuntimePrefixes(js,createState){
  let prefixes=0,stops=0;
  for(const role of ['run','cleanup'])for(const point of ['runtime_before','runtime_after',...(role==='cleanup'?['context_before','context_after']:[]),'identity_before','identity_after','pin_before','pin_after']){
    const a=deriveRuntimePin(faultRuntimePin(js,role,point),createState)();if(role==='cleanup')a.resource();
    assert.equal(call(a,role),false);const slot=a[role+'Slot'],s=slot.pending,kind=point.split('_')[0];
    assert.equal(slot.claimed,true);assert.equal(slot.phase,'failed_retained');assert.equal(slot.faultAt,kind);
    assert.equal(slot.fault,'internal_review_error');assert.equal(a.flags().revoked,true);assert.equal(a.flags().primary,'internal_review_error');
    const expected=point==='runtime_before'?'claimed':point==='runtime_after'||point==='context_before'?'runtime':
      point==='context_after'?'context':point==='identity_before'?(role==='run'?'runtime':'context'):point==='identity_after'||point==='pin_before'?'identity':'pin';
    assert.equal(slot.position,expected,role+point);
    if(point==='runtime_before')assert.equal(s,null);else{assert(s);assert.equal(s.readiness,'failed_retained');closed(s);
      assert.equal(s.identity!==null,['identity_after','pin_before','pin_after'].includes(point));assert.equal(s.pin!==null,point==='pin_after');}
    const original=s,firstAt=slot.faultAt;assert.equal(call(a,role),false);assert.equal(slot.pending,original);assert.equal(slot.faultAt,firstAt);
    const wrong=new Proxy({}, {get(){throw Error('PRIVATE_HOOK');}});assert.equal(a[role](wrong,a.root,a[role+'Seed']),false);
    assert.equal(slot.faultAt,firstAt);assert.equal(slot.fault,'internal_review_error');prefixes++;
  }
  for(const role of ['run','cleanup']){
    const a=deriveRuntimePin(faultRuntimePin(js,role,'stop_identity'),createState)();if(role==='cleanup')a.resource();
    const result=call(a,role);
    if(role==='run'){assert.equal(result,false);assert.equal(a.runSlot.position,'identity');assert.equal(a.runSlot.pending.pin,null);assert.equal(a.runSlot.faultAt,'identity');stops++;}
    else{assert.equal(result,true);assert.equal(a.cleanupSlot.pending.readiness,'pin_ready');stops++;}
    assert.equal(a.flags().primary,'cancelled');assert.equal(a.flags().revoked,true);
  }
  return {prefixes,stops};
}
export const pinDrifts=['species_get','species_data','species_flags','species_setter','species_missing','constructor_get','constructor_value','constructor_writable',
  'then_get','then_value','then_configurable','p_parent','proto_parent','frozen_get','global_object_get','global_object_value'];
export function verifyRuntimeDrifts(js,createState){
  let refusals=0;
  for(const name of pinDrifts){const create=deriveRuntimePin(js,createState),a=create();create.mutate(name);
    assert.equal(call(a,'run'),false,name);assert.equal(a.runSlot.fault,'internal_review_error');assert.equal(a.runSlot.faultAt,'pin');
    assert.equal(a.flags().revoked,true);assert.equal(a.runSlot.published,null);
    assert.equal(create.counts().hooks,0,name);if(a.runSlot.pending){closed(a.runSlot.pending);assert.equal(a.runSlot.pending.pinState,'rejected');}
    const first=a.runSlot.pending;assert.equal(call(a,'run'),false);assert.equal(a.runSlot.pending,first);refusals++;
  }
  return {refusals,hooks:0};
}
