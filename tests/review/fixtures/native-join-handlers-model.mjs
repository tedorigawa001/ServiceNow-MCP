import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {parse} from 'acorn';
import {generationParts} from './native-join-generation-model.mjs';
import {baseBegin,baseEnd,begin as pinBegin,end as pinEnd} from './native-join-runtime-pin-model.mjs';

export const begin='// JR-B-HANDLERS-BEGIN: preparation only; closures stay uncalled.';
export const end='// JR-B-HANDLERS-END';
function between(js,start,finish){assert.equal(js.split(start).length,2,start+' drift');assert.equal(js.split(finish).length,2,finish+' drift');return js.slice(js.indexOf(start)+start.length,js.indexOf(finish));}
export function deriveHandlers(js,createNativeDiagnosticState){
  const parts=generationParts(js),base=between(js,baseBegin,baseEnd),pin=between(js,pinBegin,pinEnd),block=between(js,begin,end);
  return runInNewContext(`(()=>{const P=Promise,promiseThen=P.prototype.then;let operations=0,hooks=0,busyLost=0;${base}
    const create=()=>{let recovery;${parts.allocation};
      recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);recovery.writer=recovery.state.owner.writers('release');
      ${parts.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${parts.block}${pin}${block}
      return {runSlot:runGeneration,cleanupSlot:cleanupGeneration,root:controlRoot,
        resource:()=>{started=true;current={anchor:{binding}};return current;},
        pin:role=>role==='run'?prepareRunShell(runGeneration,controlRoot,controlRun):prepareCleanupShell(cleanupGeneration,controlRoot,controlDuty,current,current?.anchor),
        prepare:(role,...args)=>{const s=(role==='run'?runGeneration:cleanupGeneration).pending;return prepareJoinHandlers(...(args.length?args:[s,s?.identity,s?.pin]),role);},
        check:(role,...args)=>{const s=(role==='run'?runGeneration:cleanupGeneration).pending;return preparedHandlersMatched(...(args.length?args:[s,s?.identity,s?.pin]),role);},
        pinCheck:role=>{const s=(role==='run'?runGeneration:cleanupGeneration).pending;return preparedShellMatched(s,s?.identity,s?.pin,role);},
        flags:()=>({primary,revoked,sealed}),set:p=>{if('primary'in p)primary=p.primary;if('revoked'in p)revoked=p.revoked;if('sealed'in p)sealed=p.sealed;},
        upper:()=>upper.snapshot()};};
    create.closeExecution=()=>{const bad=()=>{operations++;throw Error('PRIVATE_OPERATION');};
      globalThis.Promise=new Proxy(P,{construct:bad});for(const name of ['queueMicrotask','setTimeout','setInterval','fetch','Response','ReadableStream','Worker'])globalThis[name]=bad;
      Date.now=bad;globalThis.performance={now:bad};};
    create.mutate=()=>Object.defineProperty(P,Symbol.species,{get(){hooks++;throw Error('PRIVATE_GETTER');},configurable:true});
    create.counts=()=>({operations,hooks,busyLost});return create;
  })()`,{createNativeDiagnosticState,types});
}
const executionClosed={executor:'not_entered',candidate:null,work:null,resolve:null,reject:null,observerClaim:false,observerState:'unstarted',
  observerBusy:false,observed:'unobserved',callbackFault:null,observerAckCandidate:null,observerAck:null,settleClaim:false,
  settleState:'unattempted',terminal:'unobserved',notifyAttempted:false,copyAttempted:false,dispatchStarted:false,entered:false};
function closed(shell){for(const [key,value]of Object.entries(executionClosed))assert.equal(shell[key],value,key);}
export function verifyHandlers(js,createState){
  const create=deriveHandlers(js,createState);create.closeExecution();let roles=0;
  for(const role of ['run','cleanup']){
    const a=create();if(role==='cleanup'){a.resource();a.set({revoked:true,primary:'authentication_failed'});}
    assert.equal(a.pin(role),true);assert.equal(a.pinCheck(role),true);
    const slot=a[role+'Slot'],s=slot.pending,identity=s.identity,pin=s.pin,upper=JSON.stringify(a.upper());
    assert.equal(a.prepare(role),true);assert.equal(slot.pending,s);assert.equal(s.identity,identity);assert.equal(s.pin,pin);
    assert.equal(slot.position,'handlers');assert.equal(s.readiness,'handlers_ready');assert.equal(s.handlersClaim,true);
    assert.equal(s.handlersBusy,false);assert.equal(s.handlersState,'ready');assert.equal(s.handlersDetail,'complete');assert.equal(s.handlersFault,null);
    for(const key of ['executorHandler','fulfilledHandler','rejectedHandler'])assert.equal(typeof s[key],'function');
    assert.notEqual(s.fulfilledHandler,s.rejectedHandler);assert.notEqual(s.executorHandler,s.fulfilledHandler);assert.notEqual(s.executorHandler,s.rejectedHandler);
    assert(Object.isFrozen(s.observerArgs));assert.deepEqual(Reflect.ownKeys(s.observerArgs),['0','1','length']);
    assert.equal(s.observerArgs[0],s.fulfilledHandler);assert.equal(s.observerArgs[1],s.rejectedHandler);
    assert.equal(a.pinCheck(role),false);assert.equal(a.check(role),true);closed(s);assert.equal(slot.published,null);
    assert.equal(JSON.stringify(a.upper()),upper);if(role==='cleanup')assert.equal(a.flags().primary,'authentication_failed');roles++;
  }
  assert.equal(create.counts().operations,0);return {roles,functionsPerRole:3,tuplesPerRole:1,closureCalls:0,work:0,publication:0,dispatch:0};
}

export function auditHandlers(js){
  const block=between(js,begin,end),tree=parse('function closed(){'+block+'}',{ecmaVersion:'latest'}),stack=[tree];
  let closures=0;
  const calls=new Set(['failJoinHandlers','failPreparedJoin','handlerOriginMatched','shellPreparationLive','jbFrozen','jbKeys','jbGet','jbProxy','jbProto',
    'joinPromisePinLive','preparedShellMatched','handlerStageMatched','rejectClosedJoinHandler','jbFreeze','joinExecutionFieldsUnused']);
  while(stack.length){const n=stack.pop();assert(!['NewExpression','AwaitExpression','ImportExpression'].includes(n.type));
    if(n.type==='CallExpression')assert(n.callee.type==='Identifier'&&calls.has(n.callee.name),'closed call capability');
    if(n.type==='ArrowFunctionExpression'){
      const body=n.body.body;assert.equal(body.length,2);assert.equal(body[0].type,'ExpressionStatement');
      const call=body[0].expression;assert.equal(call.type,'CallExpression');assert.equal(call.callee.name,'rejectClosedJoinHandler');
      assert.deepEqual(call.arguments.map(x=>x.name),['s','identity','pin','slot','role']);
      assert.equal(body[1].type,'ReturnStatement');assert.equal(body[1].argument.name,'undefined');closures++;
    }
    for(const v of Object.values(n)){if(Array.isArray(v))stack.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')stack.push(v);}}
  assert.equal(closures,3);return {work:0,closureCalls:0,publication:0,dispatch:0};
}

export function verifyHandlerAuditNegatives(js){
  const actions=['executor(undefined,undefined);','s.executorHandler(undefined,undefined);','new P(()=>{});',
    'jbApply(executor,undefined,[]);','Promise.resolve();','notifyStop();'];
  for(const action of actions)assert.throws(()=>auditHandlers(injectHandler(js,"s.handlersDetail = 'executor_held';",action)),assert.AssertionError);
  return actions.length;
}

export function verifyHandlerIdentity(js,createState){
  let entries=0,posts=0,hooks=0;
  const trap=new Proxy({}, {get(){hooks++;throw Error('PRIVATE_HOOK');},getPrototypeOf(){hooks++;throw Error('PRIVATE_HOOK');}}),revoked=Proxy.revocable({},{});revoked.revoke();
  for(const role of ['run','cleanup'])for(const position of [0,1,2])for(const variant of ['foreign','copy','proxy','revoked']){
    const create=deriveHandlers(js,createState),a=create(),b=create();if(role==='cleanup'){a.resource();b.resource();}assert(a.pin(role));assert(b.pin(role));
    const s=a[role+'Slot'].pending,t=b[role+'Slot'].pending,own=[s,s.identity,s.pin],other=[t,t.identity,t.pin],
      foreignBefore={slot:{...b[role+'Slot']},shell:{...t},flags:b.flags(),upper:b.upper()};
    own[position]=variant==='foreign'?other[position]:variant==='copy'?{...own[position]}:variant==='proxy'?trap:revoked.proxy;
    assert.equal(a.prepare(role,...own),false);assert.equal(s.handlersClaim,false);assert.equal(s.handlersFault,'entry');
    assert.equal(a[role+'Slot'].fault,'evidence_binding_mismatch');assert.equal(a.flags().revoked,true);
    assert.deepEqual({slot:{...b[role+'Slot']},shell:{...t},flags:b.flags(),upper:b.upper()},foreignBefore);entries++;
  }
  for(const role of ['run','cleanup']){
    const create=deriveHandlers(js,createState),a=create(),b=create();if(role==='cleanup'){a.resource();b.resource();}assert(a.pin(role));assert(b.pin(role));
    assert(a.prepare(role));assert(b.prepare(role));const s=a[role+'Slot'].pending,t=b[role+'Slot'].pending,own=[s,s.identity,s.pin],other=[t,t.identity,t.pin];
    for(const position of [0,1,2])for(const value of [other[position],{...own[position]},trap,revoked.proxy]){
      const args=[...own];args[position]=value;assert.equal(a.check(role,...args),false);posts++;
    }
    for(const key of ['executorHandler','fulfilledHandler','rejectedHandler','observerArgs']){
      const saved=s[key];for(const value of [t[key],trap,revoked.proxy]){s[key]=value;assert.equal(a.check(role),false);posts++;}s[key]=saved;
    }
    assert(a.check(role));assert.equal(b.flags().revoked,false);
    const refs=[s.executorHandler,s.fulfilledHandler,s.rejectedHandler,s.observerArgs];
    assert.equal(a.prepare(role),false);assert.equal(s.handlersClaim,true);assert.equal(s.handlersState,'failed_retained');
    assert.equal(s.handlersFault,'entry');assert.equal(a[role+'Slot'].position,'handlers');assert.equal(a.flags().revoked,true);
    a.set({revoked:false,primary:null});assert.equal(a.prepare(role),false);assert.equal(s.handlersFault,'entry');
    for(const [i,key]of ['executorHandler','fulfilledHandler','rejectedHandler','observerArgs'].entries())assert.equal(s[key],refs[i]);
    assert.equal(a[role+'Slot'].pending,s);assert.equal(s.handlersBusy,false);closed(s);
  }
  assert.equal(hooks,0);return {entries,posts,reused:0,hooks};
}

// Expected prefixes come from the fixed hold schedule, not the observed output.
export const holdCases=[
  ['claimed','ownsBusy = true;','none','entry',0,false],
  ['executor_before',"at = 'executor_hold';",'none','executor_hold',0,false],
  ['executor_after',"s.handlersDetail = 'executor_held';",'executor_held','executor_hold',1,false],
  ['fulfilled_before',"at = 'fulfilled_hold';",'executor_held','fulfilled_hold',1,false],
  ['fulfilled_after',"s.handlersDetail = 'fulfilled_held';",'fulfilled_held','fulfilled_hold',2,false],
  ['rejected_before',"at = 'rejected_hold';",'fulfilled_held','rejected_hold',2,false],
  ['rejected_after',"s.handlersDetail = 'three_held';",'three_held','rejected_hold',3,false],
  ['tuple_before',"at = 'tuple_hold';",'three_held','tuple_hold',3,false],
  ['tuple_after',"s.handlersDetail = 'tuple_held';",'tuple_held','tuple_hold',4,false],
  ['freeze_before',"at = 'tuple_freeze';",'tuple_held','tuple_freeze',4,false],
  ['freeze_after',"s.handlersDetail = 'tuple_frozen';",'tuple_frozen','tuple_freeze',4,true],
  ['post',"at = 'handlers_post';",'tuple_frozen','handlers_post',4,true],
];
export function injectHandler(js,anchor,action){
  const block=between(js,begin,end);assert.equal(block.split(anchor).length,2,'handler fault drift: '+anchor);
  const result=js.replace(block,block.replace(anchor,anchor+action));parse(result,{ecmaVersion:'latest',sourceType:'module'});return result;
}
export function verifyHandlerPrefixes(js,createState){
  let prefixes=0;
  for(const role of ['run','cleanup'])for(const [label,anchor,detail,fault,held,frozen]of holdCases){
    const create=deriveHandlers(injectHandler(js,anchor,"throw 'PRIVATE_HOLD_FAULT';"),createState),a=create();create.closeExecution();if(role==='cleanup')a.resource();assert(a.pin(role));
    const slot=a[role+'Slot'],s=slot.pending,identity=s.identity,pin=s.pin;
    assert.equal(a.prepare(role),false,label);assert.equal(slot.phase,'failed_retained');assert.equal(slot.position,'pin');assert.equal(slot.faultAt,'handlers');
    assert.equal(slot.fault,'internal_review_error');assert.equal(s.handlersClaim,true);assert.equal(s.handlersBusy,false);assert.equal(s.handlersState,'failed_retained');
    assert.equal(s.handlersDetail,detail,label);assert.equal(s.handlersFault,fault,label);assert.equal(s.readiness,'failed_retained');
    assert.equal(s.identity,identity);assert.equal(s.pin,pin);assert.equal(s.pinState,'ready');assert.equal(s.pinFault,null);
    const refs=['executorHandler','fulfilledHandler','rejectedHandler','observerArgs'].map(key=>s[key]);
    for(let i=0;i<4;i++)assert.equal(refs[i]!==null,i<held,label);
    if(held===4)assert.equal(Object.isFrozen(s.observerArgs),frozen,label);
    closed(s);assert.equal(a.flags().revoked,true);assert.equal(a.flags().primary,'internal_review_error');
    a.set({revoked:false,primary:null});assert.equal(a.prepare(role),false);assert.equal(s.handlersFault,fault);assert.equal(slot.fault,'internal_review_error');
    for(const [i,key]of ['executorHandler','fulfilledHandler','rejectedHandler','observerArgs'].entries())assert.equal(s[key],refs[i]);
    assert.equal(create.counts().operations,0);prefixes++;
  }
  return {prefixes,regenerated:0,closureCalls:0};
}

export function verifyHandlerPosts(js,createState){
  let posts=0,entries=0,drifts=0;
  for(const role of ['run','cleanup']){
    const create=deriveHandlers(js,createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));
    const slot=a[role+'Slot'],s=slot.pending;
    for(const key of [...Object.keys(executionClosed),'handlersClaim','handlersBusy','handlersState','handlersDetail','handlersFault','readiness','pinState','pinFault']){
      const saved=s[key];s[key]=undefined;assert.equal(a.check(role),false,key);s[key]=saved;assert(a.check(role));posts++;
    }
    for(const [holder,key]of [[slot,'pending'],[s,'identity'],[s,'pin']]){
      const saved=holder[key];holder[key]={...saved};assert.equal(a.check(role),false,key);holder[key]=saved;assert(a.check(role));posts++;
    }
    const args=s.observerArgs;s.observerArgs=[...args];assert.equal(a.check(role),false);s.observerArgs=args;posts++;
    const position=slot.position;slot.position='pin';assert.equal(a.check(role),false,'position');slot.position=position;assert(a.check(role));posts++;
    for(const key of ['handlersClaim','handlersBusy','handlersState','handlersDetail','handlersFault']){
      const b=create();if(role==='cleanup')b.resource();assert(b.pin(role));const shell=b[role+'Slot'].pending;
      shell[key]=undefined;assert.equal(b.prepare(role),false,key);assert.equal(shell.handlersState,'failed_retained');
      assert.equal(b[role+'Slot'].fault,'invalid_state');entries++;
    }
  }
  for(const role of ['run','cleanup'])for(const change of ['sealed','stopped','record','species']){
    if(role==='run'&&change==='record')continue;
    const create=deriveHandlers(js,createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));
    if(change==='record')a.resource();else if(change==='species')create.mutate();else if(change==='sealed')a.set({sealed:true});else a.set({revoked:true,primary:'cancelled'});
    assert.equal(a.check(role),role==='cleanup'&&change==='stopped',role+change);assert.equal(create.counts().hooks,0);drifts++;
  }
  return {posts,entries,drifts,hooks:0};
}
export function verifyHandlerStops(js,createState){
  let stops=0,reentries=0;
  for(const role of ['run','cleanup'])for(const [label,anchor,detail,,held]of holdCases.filter(c=>['executor_after','fulfilled_after','rejected_after','tuple_after','freeze_after','post'].includes(c[0])))for(const mode of ['stop','seal']){
    const action=mode==='stop'?"revoked=true;primary??='cancelled';":"sealed=true;primary??='deadline_exceeded';";
    const a=deriveHandlers(injectHandler(js,anchor,action),createState)();if(role==='cleanup')a.resource();assert(a.pin(role));
    const result=a.prepare(role),expected=role==='cleanup'&&mode==='stop',s=a[role+'Slot'].pending;
    assert.equal(result,expected,role+mode+label);assert.equal(a.flags().primary,mode==='stop'?'cancelled':'deadline_exceeded');
    assert.equal(s.handlersDetail,expected?'complete':detail);assert.equal(s.handlersBusy,false);assert.equal(s.handlersClaim,true);
    if(!expected){assert.equal(a[role+'Slot'].position,'pin');assert.equal(s.handlersState,'failed_retained');
      for(const [i,key]of ['executorHandler','fulfilledHandler','rejectedHandler','observerArgs'].entries())assert.equal(s[key]!==null,i<held);}
    closed(s);stops++;
  }
  for(const role of ['run','cleanup']){
    const action="const nested=prepareJoinHandlers(s,identity,pin,role);if(nested!==false||s.handlersBusy!==true)busyLost++;";
    const create=deriveHandlers(injectHandler(js,"s.handlersDetail = 'executor_held';",action),createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));
    assert.equal(a.prepare(role),false);const s=a[role+'Slot'].pending;assert.equal(s.handlersBusy,false);assert.equal(s.handlersDetail,'executor_held');
    assert.equal(s.handlersFault,'entry');assert.equal(a[role+'Slot'].fault,'invalid_state');assert.equal(s.fulfilledHandler,null);assert.equal(create.counts().busyLost,0);reentries++;
  }
  return {stops,reentries,closureCalls:0};
}
export function verifyHandlerTuples(js,createState){
  let refusals=0;
  for(const role of ['run','cleanup'])for(const action of [
    "Object.defineProperty(args,'0',{get(){hooks++;throw Error('PRIVATE_TUPLE_GETTER');}});",
    'args.length=3;', 'args.extra=true;', 'delete args[1];', 'Object.setPrototypeOf(args,{});', 'args[0]=rejected;', 'args[1]=fulfilled;',
    "Object.defineProperty(args,'1',{get(){hooks++;throw Error('PRIVATE_TUPLE_GETTER');}});",
  ]){
    const create=deriveHandlers(injectHandler(js,"s.handlersDetail = 'tuple_held';",action),createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));
    assert.equal(a.prepare(role),false);const s=a[role+'Slot'].pending;
    assert.equal(s.handlersDetail,'tuple_held');assert.equal(s.handlersFault,'tuple_hold');assert.equal(a[role+'Slot'].position,'pin');
    assert.equal(s.handlersBusy,false);assert.equal(create.counts().hooks,0);closed(s);refusals++;
  }
  return {refusals,hooks:0};
}

export const handlerMutants=[
  ['handler claim','s.handlersClaim = true;','s.handlersClaim = false;'],
  ['busy custody',/if \(ownsBusy && shell\)(\s+)shell.handlersBusy = false;/g,'if (shell)$1shell.handlersBusy = false;'],
  ['first detail fault','shell.handlersFault ??= at;','shell.handlersFault = at;'],
  ['shell origin','rawShell === shell','true'],
  ['identity origin','rawIdentity === identity','true'],
  ['pin origin','rawPin === pin','true'],
  ['main executor alias','runExecutorExpected = executor;','void executor;'],
  ['tuple order','[fulfilled, rejected]','[rejected, fulfilled]'],
  ['tuple freeze','jbFreeze(args);','void args;'],
  ['fulfilled origin','shell.fulfilledHandler !== fulfilled','false'],
  ['tuple origin','shell.observerArgs !== args','false'],
  ['detail stage','shell.handlersDetail !== detail','false'],
  ['role liveness','!shellPreparationLive(shell)','false'],
  ['post pin','|| !joinPromisePinLive()','|| false'],
  ['tuple own size','jbKeys(args).length !== 3','false'],
  ['tuple first descriptor',"!first || !('value' in first) || first.value !== fulfilled",'false'],
  ['claim precheck','s.handlersClaim === false &&','true &&'],
  ['closed call body',/failJoinHandlers\(role, 'closed_call', [^;]+;/g,'void 0;'],
  ['closed call codes',"? 'invalid_state' : 'evidence_binding_mismatch'","? 'evidence_binding_mismatch' : 'invalid_state'"],
  ['closed call fault',"failJoinHandlers(role, 'closed_call',","failJoinHandlers(role, 'entry',"],
  ['tuple second descriptor',"!second || !('value' in second) || second.value !== rejected ||",''],
  ['complete position',"slot.position !== 'handlers'",'false'],
];
export function verifyHandlerMutant(js,createState,index){
  const [label,from,to]=handlerMutants[index];assert.equal(typeof from==='string'?js.split(from).length-1:[...js.matchAll(from)].length,1,'mutant drift: '+label);
  const changed=js.replace(from,to);parse(changed,{ecmaVersion:'latest',sourceType:'module'});
  assert.throws(()=>{verifyHandlers(changed,createState);verifyHandlerIdentity(changed,createState);verifyHandlerPrefixes(changed,createState);
    verifyHandlerPosts(changed,createState);verifyHandlerStops(changed,createState);verifyHandlerTuples(changed,createState);
    verifyHandlerClosedCalls(changed,createState);},assert.AssertionError,label);
}

// Direct calls of the retained closures: fixed refusal and primitive failure custody only.
const closureKeys=['executorHandler','fulfilledHandler','rejectedHandler'];
export function verifyHandlerClosedCalls(js,createState){
  let calls=0,mismatches=0,hooks=0,settlers=0;
  const trap=new Proxy({}, {get(){hooks++;throw Error('PRIVATE_HOOK');},getPrototypeOf(){hooks++;throw Error('PRIVATE_HOOK');}});
  const settler=()=>{settlers++;throw Error('PRIVATE_SETTLER');};
  for(const role of ['run','cleanup'])for(const [index,key]of closureKeys.entries()){
    const create=deriveHandlers(js,createState),a=create();create.closeExecution();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));
    const slot=a[role+'Slot'],s=slot.pending,refs=[...closureKeys,'observerArgs','identity','pin'].map(k=>s[k]),upper=JSON.stringify(a.upper());
    const args=index===0?[settler,settler]:[trap];let result='unset';
    assert.doesNotThrow(()=>{result=s[key](...args);});assert.equal(result,undefined);
    assert.equal(s.handlersFault,'closed_call',role+key);assert.equal(s.handlersState,'failed_retained');assert.equal(s.readiness,'failed_retained');
    assert.equal(slot.fault,'invalid_state',role+key);assert.equal(slot.faultAt,'handlers');assert.equal(slot.phase,'failed_retained');assert.equal(slot.position,'handlers');
    assert.equal(a.flags().revoked,true);assert.equal(a.flags().primary,'invalid_state');assert.equal(a.check(role),false);
    // A later call of another closure keeps the first fault and changes no retained reference.
    const other=closureKeys[(index+1)%3];assert.equal(s[other](...(other==='executorHandler'?[settler,settler]:[trap])),undefined);
    assert.equal(s.handlersFault,'closed_call');assert.equal(slot.fault,'invalid_state');
    [...closureKeys,'observerArgs','identity','pin'].forEach((k,i)=>assert.equal(s[k],refs[i],k));assert.equal(slot.pending,s);closed(s);
    assert.equal(JSON.stringify(a.upper()),upper);assert.equal(create.counts().operations,0);calls++;
  }
  for(const role of ['run','cleanup']){
    const create=deriveHandlers(js,createState),a=create();if(role==='cleanup')a.resource();assert(a.pin(role));assert(a.prepare(role));
    const slot=a[role+'Slot'],s=slot.pending;s.identity={...s.identity};
    assert.equal(s.fulfilledHandler(trap),undefined);assert.equal(s.handlersFault,'closed_call');assert.equal(slot.fault,'evidence_binding_mismatch',role);
    assert.equal(a.flags().revoked,true);mismatches++;
  }
  assert.equal(hooks,0);assert.equal(settlers,0);return {calls,mismatches,hooks,settlers};
}
