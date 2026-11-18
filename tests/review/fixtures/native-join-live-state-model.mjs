import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {parse} from 'acorn';
import {generationParts} from './native-join-generation-model.mjs';
import {baseBegin,baseEnd,begin as pinBegin,end as pinEnd} from './native-join-runtime-pin-model.mjs';
import {begin as handlersBegin,end as handlersEnd} from './native-join-handlers-model.mjs';
import {begin as seedBegin,end as seedEnd} from './native-join-execution-seed-model.mjs';
import {begin as valuesBegin,end as valuesEnd} from './native-join-execution-values-model.mjs';
import {valueCases} from './native-join-execution-values-model.mjs';

export const begin='// JR-B-LIVE-BEGIN: same-shell posts and failure custody only; no execution.';
export const end='// JR-B-LIVE-END';
function between(js,a,b){assert.equal(js.split(a).length,2,a+' drift');assert.equal(js.split(b).length,2,b+' drift');return js.slice(js.indexOf(a)+a.length,js.indexOf(b));}
export function deriveLiveState(js,createNativeDiagnosticState){
  const p=generationParts(js),base=between(js,baseBegin,baseEnd),pin=between(js,pinBegin,pinEnd),handlers=between(js,handlersBegin,handlersEnd),seed=between(js,seedBegin,seedEnd),values=between(js,valuesBegin,valuesEnd),live=between(js,begin,end);
  // Scratch only: allow the independent table to pin synthetic references into the existing aliases.
  // Product declarations remain const null; no acquisition/event writer or fixture port is added to the product.
  let synthetic=seed;for(const role of ['run','cleanup']){const from='const '+role+'CapturedResolveExpected = null';assert.equal(seed.split(from).length,2);synthetic=synthetic.replace(from,'let '+role+'CapturedResolveExpected = null');}
  return runInNewContext(`(()=>{'use strict';const P=Promise,promiseThen=P.prototype.then;let operations=0;${base}
    return ()=>{let recovery;${p.allocation};recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);
      recovery.writer=recovery.state.owner.writers('release');${p.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${p.block}${pin}${handlers}${synthetic}${values}${live}
      const args=role=>{const slot=role==='run'?runGeneration:cleanupGeneration,s=slot.pending;return[s,s?.identity,s?.pin,slot];};
      return {prepare:role=>{if(role==='cleanup'){started=true;current={anchor:{binding}};}
          const ok=role==='run'?prepareRunShell(runGeneration,controlRoot,controlRun):prepareCleanupShell(cleanupGeneration,controlRoot,controlDuty,current,current.anchor);
          return ok&&prepareJoinHandlers(...args(role).slice(0,3),role);},args,
        post:(role,stage,...raw)=>joinLiveFieldPost(...(raw.length?raw:args(role)),role,stage),
        fixture:(role,value)=>{const [s,,,slot]=args(role);for(const [key,v]of Object.entries(value))if(Object.hasOwn(s,key))s[key]=v;
          slot.position=value.position;slot.phase=value.variant==='failed_retained'?'failed_retained':value.variant==='checked_unpublished'?'checked':'building';
          slot.fault=value.fault;slot.faultAt=value.faultAt;s.readiness=value.variant==='failed_retained'?'failed_retained':'handlers_ready';
          if(value.variant==='failed_retained'){primary=value.fault;revoked=true;}
          if(role==='run'){runCapturedResolveExpected=s.resolve;runCapturedRejectExpected=s.reject;runCandidateExpected=s.candidate;runRegistrationWorkExpected=s.registrationWork;runAckExpected=s.observerAckCandidate;}
          else{cleanupCapturedResolveExpected=s.resolve;cleanupCapturedRejectExpected=s.reject;cleanupCandidateExpected=s.candidate;cleanupRegistrationWorkExpected=s.registrationWork;cleanupAckExpected=s.observerAckCandidate;}},
        aliasDrift:(role,key='resolve')=>{if(role==='run'){
          if(key==='resolve')runCapturedResolveExpected={};if(key==='reject')runCapturedRejectExpected={};if(key==='candidate')runCandidateExpected={};
          if(key==='work')runRegistrationWorkExpected={};if(key==='ack')runAckExpected={};
        }else{if(key==='resolve')cleanupCapturedResolveExpected={};if(key==='reject')cleanupCapturedRejectExpected={};if(key==='candidate')cleanupCandidateExpected={};
          if(key==='work')cleanupRegistrationWorkExpected={};if(key==='ack')cleanupAckExpected={};}},
        record:(role,site,code)=>recordJoinExecutionFailure(role,site,code),retain:role=>holdJoinExecutionUnconfirmed(role),
        request:role=>requestJoinExecution(...args(role).slice(0,3),role),
        set:p=>{if('primary'in p)primary=p.primary;if('revoked'in p)revoked=p.revoked;if('sealed'in p)sealed=p.sealed;},
        closeOperations:()=>{const bad=()=>{operations++;throw Error('FORBIDDEN_OPERATION');};globalThis.Promise=new Proxy(P,{construct:bad});
          for(const name of ['queueMicrotask','setTimeout','setInterval','fetch','Response','ReadableStream','Worker'])globalThis[name]=bad;
          Date.now=bad;globalThis.performance={now:bad};},
        poisonWritable:()=>Object.defineProperty(Object.prototype,'writable',{get(){operations++;throw Error('DESCRIPTOR_WRITABLE');},configurable:true}),
        flags:()=>({primary,revoked,sealed}),counts:()=>({operations}),upper:()=>upper.snapshot()};};
  })()`,{createNativeDiagnosticState,types});
}
export function verifyLiveBoundaries(js,state){
  const create=deriveLiveState(js,state);let refusals=0;
  const bad=[
    ['constructorClaim',undefined],['constructorState','pending'],['executorEntryClaim',undefined],['executor','exited'],['candidateHeld',undefined],
    ['resolve',{}],['reject',{}],['reject',()=>{}],['candidate',{}],['candidateSafety','safe'],['work',{}],['observerClaim',undefined],['observerState','ready'],
    ['observerBusy',undefined],['registrationReached',undefined],['registrationWork',{}],['ackHeld',undefined],['ackState','confirmed'],
    ['observerAckCandidate',{}],['observerAck',{}],['callbackClaim',true],['callbackState','inside'],['callbackFault','early'],
    ['observed','fulfilled'],['terminal','fulfilled'],['ackTerminal','fulfilled'],['failureDrainClaim',true],['failureDrainState','inside'],['drainKind','fault'],
    ['upperRecordAttempted',true],['upperRecordState','returned'],['notifyAttempted',true],['notifyState','returned'],['copyAttempted',true],['copyHeld',true],
    ['runCopyState','verified'],['terminalCopy',{}],['rejectPayloadAttempted',true],['rejectPayloadState','held'],['rejectPayload',{}],['settleClaim',true],['settleState','returned'],
  ];
  for(const role of ['run','cleanup'])for(const [stage,v]of liveCases(role)){
    const a=create();assert(a.prepare(role));a.fixture(role,v);const [s,,,slot]=a.args(role);
    for(const [key,value]of bad){const old=s[key];s[key]=value;assert.equal(a.post(role,stage),false,role+'/'+stage+'/'+key);s[key]=old;refusals++;}
    // A changed expected alias is not re-pinned from the mutable holder.
    a.aliasDrift(role);assert.equal(a.post(role,stage),false,role+'/'+stage+' alias drift');refusals++;
    assert.equal(slot.pending,s);
  }return {refusals};
}
export function verifyLiveRelations(js,state){
  const create=deriveLiveState(js,state);let refusals=0;
  for(const role of ['run','cleanup']){
    const checked=liveCases(role).find(([s])=>s==='checked_unpublished')[1];
    for(const key of ['resolve','reject','candidate','work','ack']){const a=create();assert(a.prepare(role));a.fixture(role,checked);a.aliasDrift(role,key);
      assert.equal(a.post(role,'checked_unpublished'),false,role+' '+key+' expected alias');refusals++;}
    const pair=liveCases(role).find(([s])=>s==='resolve_prefix')[1],bad={...pair,reject:role==='run'?null:()=>{}};
    const a=create();assert(a.prepare(role));a.fixture(role,bad);assert.equal(a.post(role,'resolve_prefix'),false,role+' bad pair with matching aliases');refusals++;
  }return {refusals};
}
export function verifyLiveStageLabels(js,state){
  const stages=['unused','claimed_pre_call','calling_before_entry','executor_prefix','reject_prefix','resolve_prefix','captured_before_return','returned_candidate',
    'checked_unpublished','registering_before_reach','registering_reached','ack_held','ack_verified','failure_recorded','failed_retained'];
  const create=deriveLiveState(js,state);let accepted=0,refusals=0;
  for(const role of ['run','cleanup'])for(const [own,v]of liveCases(role)){const a=create();assert(a.prepare(role));a.fixture(role,v);
    for(const stage of stages){const expected=stage===own||own==='failed_retained'&&stage==='failure_recorded';assert.equal(a.post(role,stage),expected,own+' -> '+stage);
      if(expected)accepted++;else refusals++;}}
  return {accepted,refusals};
}
export function verifyLiveMetadata(js,state){
  const create=deriveLiveState(js,state);let cases=0,hooks=0;
  for(const role of ['run','cleanup'])for(const field of ['readiness','retention'])for(const fault of ['readonly','accessor','missing','frozen']){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),other=field==='readiness'?'retention':'readiness',old=s[field];
    assert.equal(a.retain(role),false);assert.equal(s.readiness,'handlers_ready');assert.equal(s.retention,'held');
    if(fault==='readonly')Object.defineProperty(s,field,{value:old,writable:false,enumerable:true,configurable:true});
    if(fault==='accessor')Object.defineProperty(s,field,{get(){hooks++;throw Error('GETTER');},set(){hooks++;throw Error('SETTER');},configurable:true});
    if(fault==='missing')delete s[field];if(fault==='frozen')Object.freeze(s);
    const desc=Object.getOwnPropertyDescriptor(s,field);assert.doesNotThrow(()=>{a.record(role,'executor_exit','internal_review_error');a.retain(role);});
    assert.equal(slot.phase,'failed_retained');assert.equal(slot.fault,'internal_review_error');assert.equal(slot.faultAt,'executor_exit');assert.equal(slot.pending,s);
    assert.equal(a.flags().revoked,true);assert.equal(a.flags().primary,'internal_review_error');assert.deepEqual(Object.getOwnPropertyDescriptor(s,field),desc);
    assert.equal(a.post(role,'failure_recorded'),true);
    if(fault!=='frozen')assert.equal(s[other],other==='retention'?'unconfirmed':'failed_retained');cases++;
  }
  for(const role of ['run','cleanup']){const a=create();assert.doesNotThrow(()=>{a.record(role,'constructor_pre','invalid_state');a.retain(role);});
    assert.equal(a.args(role)[3].pending,null);assert.equal(a.flags().revoked,true);cases++;}
  for(const role of ['run','cleanup'])for(const field of ['readiness','retention']){
    const a=deriveLiveState(js,state)();assert(a.prepare(role));const [s]=a.args(role);
    Object.defineProperty(s,field,{get(){hooks++;throw Error('FIELD');},set(){hooks++;throw Error('FIELD');},configurable:true});
    a.poisonWritable();a.record(role,'constructor_pre','invalid_state');assert.doesNotThrow(()=>a.retain(role));assert.equal(a.counts().operations,0);cases++;
  }
  assert.equal(hooks,0);return {cases,hooks};
}
export function verifyLiveIdentity(js,state){
  const create=deriveLiveState(js,state),proxy=new Proxy({}, {get(){throw Error('RAW_GET');},getPrototypeOf(){throw Error('RAW_PROTO');}}),dead=Proxy.revocable({},{});dead.revoke();let refusals=0;
  for(const role of ['run','cleanup']){const a=create(),b=create();assert(a.prepare(role));assert(b.prepare(role));const refs=a.args(role),other=b.args(role),before={...refs[0]},kept={...refs[3]};
    for(let i=0;i<4;i++)for(const value of [other[i],{...refs[i]},proxy,dead.proxy]){const raw=[...refs];raw[i]=value;
      assert.doesNotThrow(()=>assert.equal(a.post(role,'unused',...raw),false));refusals++;}
    assert.deepEqual({...refs[0]},before);assert.deepEqual({...refs[3]},kept);assert.equal(a.flags().revoked,false);
  }return {refusals};
}
export function verifyLiveClosedCalls(js,state){
  const create=deriveLiveState(js,state);let requests=0,closures=0;
  for(const role of ['run','cleanup'])for(const key of ['request','executorHandler','fulfilledHandler','rejectedHandler']){
    const a=create();assert(a.prepare(role));assert.equal(a.post(role,'unused'),true);const [s,,,slot]=a.args(role),upper=JSON.stringify(a.upper());a.closeOperations();
    if(key==='request'){assert.equal(a.request(role),false);assert.equal(slot.faultAt,'constructor_pre');requests++;}
    else{assert.equal(s[key](()=>{throw Error('SETTLER');},()=>{throw Error('SETTLER');}),undefined);assert.equal(s.handlersFault,'closed_call');assert.equal(slot.faultAt,'handlers');closures++;}
    assert.equal(s.constructorClaim,false);assert.equal(s.executorEntryClaim,false);assert.equal(s.candidate,null);assert.equal(slot.fault,'invalid_state');
    assert.equal(a.flags().revoked,true);assert.equal(a.counts().operations,0);assert.equal(JSON.stringify(a.upper()),upper);
  }return {requests,closures};
}
export function verifyLiveGuards(js,state){
  let refusals=0;for(const role of ['run','cleanup'])for(const key of ['phase','fault','faultAt','revoked','primary']){
    const a=deriveLiveState(js,state)();assert(a.prepare(role));a.record(role,'executor_entry','invalid_state');const [s,,,slot]=a.args(role);
    if(key==='phase')slot.phase='building';if(key==='fault')slot.fault=null;if(key==='faultAt')slot.faultAt=null;
    if(key==='revoked')a.set({revoked:false});if(key==='primary')a.set({primary:null});
    const before={...s};assert.equal(a.retain(role),false);assert.deepEqual({...s},before);refusals++;
  }return {refusals};
}
// Each guard is varied alone from a row the same post accepts, so every refusal is attributable to that guard.
const preparationBad=[['readiness','failed_retained'],['retention','unconfirmed'],['pinState','rejected'],['pinFault','pin'],['handlersClaim',false],
  ['handlersBusy',true],['handlersState','preparing'],['handlersDetail','tuple_frozen'],['handlersFault','closed_call']];
export function verifyLivePostGuards(js,state){
  const create=deriveLiveState(js,state);let refusals=0,accepted=0;
  const run=(role,row,stage,change,expected,label)=>{const a=create();assert(a.prepare(role));a.fixture(role,row);
    assert.equal(a.post(role,stage),true,role+'/'+stage+' base '+label);accepted++;
    if(!change)return;const [s,,,slot]=a.args(role);change(s,slot,a);assert.equal(a.post(role,stage),expected,role+'/'+stage+'/'+label);if(!expected)refusals++;};
  for(const role of ['run','cleanup'])for(const [stage,row]of liveCases(role)){
    if(stage!=='failed_retained'){
      for(const [key,value]of preparationBad)run(role,row,stage,s=>{s[key]=value;},false,key);
      for(const [key,value]of [['fault','invalid_state'],['faultAt','executor_exit'],['claimed',false]])run(role,row,stage,(_s,slot)=>{slot[key]=value;},false,'slot '+key);
      run(role,row,stage,(_s,slot)=>{slot.phase=stage==='checked_unpublished'?'building':'checked';},false,'slot phase');continue;
    }
    for(const failure of ['failure_recorded','failed_retained']){
      run(role,row,failure,(_s,_slot,a)=>a.set({revoked:false}),false,'revoked');run(role,row,failure,(_s,_slot,a)=>a.set({primary:null}),false,'primary');
      run(role,row,failure,(_s,slot)=>{slot.faultAt='arbitrary';},false,'site');run(role,row,failure,(_s,slot)=>{slot.phase='building';},false,'phase');
    }
    // Missing metadata keeps the primitive failure but never completes the retained post.
    for(const [key,value]of [['readiness','handlers_ready'],['retention','held']]){
      run(role,row,'failure_recorded',s=>{s[key]=value;},true,key+' recorded');run(role,row,'failed_retained',s=>{s[key]=value;},false,key+' retained');
    }
  }
  for(const role of ['run','cleanup'])for(const field of ['readiness','retention']){
    const a=create();assert(a.prepare(role));const [s]=a.args(role);Object.defineProperty(s,field,{value:s[field],writable:false,enumerable:true,configurable:true});
    a.record(role,'executor_exit','internal_review_error');a.retain(role);assert.equal(a.post(role,'failure_recorded'),true);accepted++;
    assert.equal(a.post(role,'failed_retained'),false,role+' unwritable '+field);refusals++;
  }
  for(const role of ['run','cleanup']){
    const rows=Object.fromEntries(liveCases(role).filter(([stage])=>stage!=='failed_retained')),failed=(row,faultAt)=>({...row,variant:'failed_retained',fault:'invalid_state',faultAt,retention:'unconfirmed'});
    const ack={},reach=failed(rows.registering_reached,'ack_hold'),captured=failed(rows.captured_before_return,'executor_exit'),calling=failed(rows.calling_before_entry,'constructor_call');
    // Each pair is accepted as written and refused after the single listed change.
    const pairs=[
      ['ack after reach',{...reach,ackHeld:true,ackState:'held',observerAckCandidate:ack},{registrationReached:false}],
      ['unsafe ack after return',{...reach,observerState:'returned',observerBusy:false,ackHeld:true,ackState:'unsafe_retained',observerAckCandidate:ack},{observerState:'registering',observerBusy:true}],
      ['settler pair at normal exit',{...captured,executor:'abnormal',resolve:null,reject:null,position:'executor'},{executor:'normal_exit'}],
      ['unsafe needs candidate',calling,{candidateSafety:'unsafe_retained'}],
    ];
    for(const [label,good,bad]of pairs){run(role,good,'failure_recorded',null,true,label);
      const a=create();assert(a.prepare(role));a.fixture(role,{...good,...bad});assert.equal(a.post(role,'failure_recorded'),false,role+' '+label);refusals++;}
    for(const key of role==='run'?['resolve','reject']:['resolve']){const a=create();assert(a.prepare(role));a.fixture(role,{...rows.resolve_prefix,[key]:{}});
      assert.equal(a.post(role,'resolve_prefix'),false,role+' non-function '+key);refusals++;}
  }
  return {accepted,refusals};
}
function walk(n,visit){visit(n);for(const v of Object.values(n)){if(Array.isArray(v)){for(const c of v)if(c?.type)walk(c,visit);}else if(v?.type)walk(v,visit);}}
export function auditLiveState(js){
  const block=between(js,begin,end),tree=parse('function root(){'+block+'}',{ecmaVersion:'latest'});let writes=0,primitiveCalls=0,coldCalls=0,metadataGuards=0;
  const calls=new Set(['joinExecutionOriginLeaf','joinLiveTailUnused','joinLiveAcquisitionPost','joinLiveObservationPost','joinValueFaultSite','jbGet','jbOwn']);
  walk(tree,n=>{
    assert(!['NewExpression','AwaitExpression','ImportExpression','ThrowStatement','ArrowFunctionExpression','ObjectExpression','ArrayExpression','UpdateExpression'].includes(n.type),'live capability/allocation');
    if(n.type==='CallExpression')assert(n.callee.type==='Identifier'&&calls.has(n.callee.name),'live invocation');
    if(n.type==='MemberExpression')assert(!(n.object.type==='Identifier'&&n.object.name.startsWith('raw')),'raw field read');
    if(n.type==='AssignmentExpression'){const target=n.left.type==='Identifier'?n.left.name:n.left.type==='MemberExpression'&&n.left.object.type==='Identifier'&&n.left.property.type==='Identifier'?n.left.object.name+'.'+n.left.property.name:'';
      assert(['own.faultAt','own.fault','primary','revoked','own.phase','subject.readiness','subject.retention'].includes(target),'live operational writer');writes++;}
    if(n.type==='FunctionDeclaration'&&n.id?.name==='recordJoinExecutionFailure')walk(n,c=>{if(c.type==='CallExpression')primitiveCalls++;});
    if(n.type==='FunctionDeclaration'&&n.id?.name==='holdJoinExecutionUnconfirmed')walk(n,c=>{if(c.type==='CallExpression')coldCalls++;});
    if(n.type==='IfStatement'&&n.consequent.type==='ExpressionStatement'&&n.consequent.expression.type==='AssignmentExpression'&&n.consequent.expression.left.object?.name==='subject'){
      const parts=[];const flatten=t=>{if(t.type==='LogicalExpression'&&t.operator==='&&'){flatten(t.left);flatten(t.right);}else parts.push(t);};flatten(n.test);
      assert.equal(parts.length,3,'metadata guard factors');assert.equal(parts[0].name,'meta');
      assert.equal(parts[1].callee?.name,'jbOwn');assert.equal(parts[1].arguments[0].name,'meta');assert.equal(parts[1].arguments[1].value,'value');
      assert.equal(parts[2].operator,'===');assert.equal(parts[2].left.object?.name,'meta');assert.equal(parts[2].left.property?.name,'writable');assert.equal(parts[2].right.value,true);metadataGuards++;
    }
  });assert.equal(writes,7);assert.equal(primitiveCalls,0);assert.equal(coldCalls,4);assert.equal(metadataGuards,2);
  const callers=[];function inspect(n,owner=''){
    if(n.type==='FunctionDeclaration')owner=n.id?.name??'';
    if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&['joinLiveFieldPost','recordJoinExecutionFailure','holdJoinExecutionUnconfirmed'].includes(n.callee.name))callers.push(n.callee.name+':'+owner);
    for(const v of Object.values(n)){if(Array.isArray(v)){for(const c of v)if(c?.type)inspect(c,owner);}else if(v?.type)inspect(v,owner);}
  }inspect(parse(js,{ecmaVersion:'latest',sourceType:'module'}));
  assert.deepEqual(callers,['recordJoinExecutionFailure:reflectJoinPrecallFailure','holdJoinExecutionUnconfirmed:reflectJoinPrecallFailure'],
    'only the disconnected pre-call refusal may reflect qualified failure');return {writes,primitiveCalls,coldCalls};
}
export const liveMutants=[
  ['origin','!joinExecutionOriginLeaf(rawShell, rawIdentity, rawPin, rawSlot, role)','false'],
  ['read actual slot','ownSlot.position !== heldPosition','false'],
  ['resolve alias','state.resolve !== resolveAlias','false'],['reject alias','state.reject !== rejectAlias','false'],
  ['candidate alias','state.candidate !== candidateAlias','false'],['work alias','state.work === workAlias','true'],
  ['ack alias','state.observerAckCandidate !== ackAlias','false'],['registration work','state.registrationWork !== state.work','false'],
  ['run reject before resolve',"role === 'run' && state.resolve !== null && state.reject === null",'false'],
  ['cleanup reject',"role === 'cleanup' && state.reject !== null",'false'],
  ['first site','own.faultAt ??= site','own.faultAt = site'],['first fault','own.fault ??= reason','own.fault = reason'],
  ['first primary','primary ??= reason','primary = reason'],['synchronous stop','revoked = true','void 0'],
  ['failed phase',"own.phase = 'failed_retained'",'void 0'],
  ['cold phase',"own.phase !== 'failed_retained' ||",''],['cold fault','own.fault === null ||',''],['cold site','own.faultAt === null ||',''],
  ['cold revoked','!revoked ||',''],['cold primary',' || primary === null',''],
  ['metadata writable',' && meta.writable === true','',2],['metadata data'," && jbOwn(meta, 'value')",'',2],
  ['readiness hold',"subject.readiness = 'failed_retained'",'void 0'],['retention hold',"subject.retention = 'unconfirmed'",'void 0'],
  ['tail dispatch','state.dispatchStarted === false','true'],['tail entry','state.entered === false','true'],
  ['tail callback','state.callbackClaim === false','true'],['tail drain','state.failureDrainClaim === false','true'],
  ['tail copy','state.copyAttempted === false','true'],['tail settle','state.settleClaim === false','true'],
  ['slot claimed','ownSlot.claimed !== true || ',''],['ready readiness',"state.readiness !== 'handlers_ready' || ",''],['held retention',"state.retention !== 'held' ||",''],
  ['ready pin',"state.pinState !== 'ready' || ",''],['pin fault','state.pinFault !== null || ',''],['handlers claim','state.handlersClaim !== true || ',''],
  ['handlers busy','state.handlersBusy !== false ||',''],['handlers state',"state.handlersState !== 'ready' || ",''],
  ['handlers detail',"state.handlersDetail !== 'complete' || ",''],['handlers fault',' || state.handlersFault !== null)',')'],
  ['slot fault','if (ownSlot.fault !== null || ','if ('],['slot site','ownSlot.faultAt !== null || ',''],['building phase',"if (ownSlot.phase !== 'building')",'if (false)'],
  ['failure revoked','revoked === true && primary !== null','primary !== null'],['failure primary','revoked === true && primary !== null','revoked === true'],
  ['failure site','joinValueFaultSite(ownSlot.faultAt) && ',''],['failure phase',"ownSlot.phase === 'failed_retained' &&",'true &&'],
  ['retained readiness',"state.readiness === 'failed_retained' && state.retention === 'unconfirmed'","state.retention === 'unconfirmed'"],
  ['retained retention',"state.readiness === 'failed_retained' && state.retention === 'unconfirmed'","state.readiness === 'failed_retained'"],
  ['resolve function',"(state.resolve !== null && typeof state.resolve !== 'function') || ",''],
  ['reject function',"(state.reject !== null && typeof state.reject !== 'function') ||",''],
  ['unsafe candidate',"state.candidateSafety === 'unsafe_retained' && state.candidateHeld === true","state.candidateSafety === 'unsafe_retained'"],
  ['ack reach','if (state.registrationReached !== true || (state.observerState','if ((state.observerState'],
  ['unsafe ack return',"return state.observerState === 'returned' && state.observerAck === null;",'return state.observerAck === null;'],
  ['normal exit pair',"if (state.executor === 'normal_exit' && (state.resolve === null || role === 'run' && state.reject === null))",'if (false)'],
];
function mutate(js,from,to,count=1){const b=between(js,begin,end);assert.equal(b.split(from).length-1,count,'live mutation drift '+from);
  const changed=js.replace(b,b.replaceAll(from,to));parse(changed,{ecmaVersion:'latest',sourceType:'module'});return changed;}
export function verifyLiveMutant(js,state,i){const [name,from,to,count]=liveMutants[i],changed=mutate(js,from,to,count);
  const behavior=()=>{verifyLivePostGuards(changed,state);verifyLiveUnused(changed,state);verifyLiveStages(changed,state);verifyLiveBoundaries(changed,state);verifyLiveRelations(changed,state);verifyLiveFailure(changed,state);verifyLiveMetadata(changed,state);verifyLiveGuards(changed,state);verifyLiveIdentity(changed,state);};
  // Strict-mode readonly writes are caught: omitting this guard is behaviorally equivalent here,
  // but violates the fixed skip-without-attempt contract. Do not count that as behavioral detection.
  if(name==='metadata writable'){assert.doesNotThrow(behavior);assert.throws(()=>auditLiveState(changed),assert.AssertionError);}
  else assert.throws(behavior,assert.AssertionError,name);
}
export function verifyLiveAuditNegatives(js){const anchor='void joinLiveFieldPost;';
  for(const action of ['new P(()=>{});','state.resolve();','state.constructorClaim=true;','state.candidate=null;','own.pending=null;','notifyStop();','rawShell.kind;']){
    const changed=mutate(js,anchor,action+anchor);assert.throws(()=>auditLiveState(changed),assert.AssertionError);
  }return 7;
}
function stageOf(v){return v.variant==='capturing'?v.position+'_prefix':v.variant;}
export function liveCases(role){
  const rows=valueCases(role).map(([v])=>[stageOf(v),v]),returned=rows.find(([stage])=>stage==='returned_candidate')[1],ack={};
  const registration={...returned,candidateSafety:'safe_same_work',work:returned.candidate,registrationWork:returned.candidate,observerClaim:true,observerState:'registering',observerBusy:true};
  rows.push(['registering_before_reach',registration],['registering_reached',{...registration,registrationReached:true}],
    ['ack_held',{...registration,registrationReached:true,ackHeld:true,ackState:'held',observerAckCandidate:ack}],
    ['ack_verified',{...registration,registrationReached:true,ackHeld:true,ackState:'verified',observerAckCandidate:ack,observerAck:ack}]);
  return rows;
}
export function verifyLiveStages(js,state){
  let valid=0,refusals=0;const create=deriveLiveState(js,state);
  for(const role of ['run','cleanup'])for(const [stage,v]of liveCases(role)){
    const a=create();assert(a.prepare(role));a.fixture(role,v);const [s,,,slot]=a.args(role),before={...s},kept={...slot},upper=JSON.stringify(a.upper());a.closeOperations();
    assert.equal(a.post(role,stage),true,role+'/'+stage+'/'+v.position);valid++;
    for(const [object,key,bad]of [[slot,'position','published'],[slot,'published',{}],[slot,'pending',{...s}],[s,'dispatchStarted',true],[s,'entered',true]]){
      const old=object[key];object[key]=bad;assert.equal(a.post(role,stage,...[s,s.identity,s.pin,slot]),false,role+'/'+stage+'/'+key);object[key]=old;refusals++;
    }
    assert.deepEqual({...s},before);assert.deepEqual({...slot},kept);assert.equal(JSON.stringify(a.upper()),upper);assert.equal(a.counts().operations,0);
  }return {valid,refusals};
}
export function verifyLiveFailure(js,state){
  const create=deriveLiveState(js,state);let cases=0;
  for(const role of ['run','cleanup'])for(const prior of [null,'authentication_failed','cancelled']){
    const a=create();assert(a.prepare(role));const row=liveCases(role).find(([stage])=>stage==='returned_candidate')[1];a.fixture(role,row);
    a.set({primary:prior,sealed:prior!==null});const [s,,,slot]=a.args(role),before={...s},upper=JSON.stringify(a.upper());a.closeOperations();
    assert.equal(a.record(role,'candidate_check','invalid_state'),false);assert.equal(slot.pending,s);assert.equal(slot.position,'candidate');
    assert.equal(slot.faultAt,'candidate_check');assert.equal(slot.fault,'invalid_state');assert.equal(slot.phase,'failed_retained');
    assert.equal(a.flags().primary,prior??'invalid_state');assert.equal(a.flags().revoked,true);assert.deepEqual({...s},before);
    assert.equal(a.post(role,'failure_recorded'),true);assert.equal(a.retain(role),false);assert.equal(a.post(role,'failed_retained'),true);
    assert.equal(s.readiness,'failed_retained');assert.equal(s.retention,'unconfirmed');
    assert.equal(a.record(role,'observer_call','internal_review_error'),false);assert.equal(a.retain(role),false);
    assert.equal(slot.faultAt,'candidate_check');assert.equal(slot.fault,'invalid_state');assert.equal(s.candidate,before.candidate);assert.equal(s.resolve,before.resolve);
    assert.equal(a.request(role),false);assert.equal(slot.faultAt,'candidate_check');assert.equal(slot.fault,'invalid_state');
    assert.equal(JSON.stringify(a.upper()),upper);assert.equal(a.counts().operations,0);cases++;
  }return {cases};
}
export function verifyLiveUnused(js,state){
  let refusals=0;const create=deriveLiveState(js,state);
  for(const role of ['run','cleanup']){const a=create();assert(a.prepare(role));const refs=a.args(role),s=refs[0],before={...s},slotBefore={...refs[3]};
    assert.equal(a.post(role,'unused'),true);assert.equal(a.post(role,'unused',{...s},...refs.slice(1)),false);refusals++;
    assert.deepEqual({...s},before);assert.deepEqual({...refs[3]},slotBefore);assert.equal(s.constructorClaim,false);}
  return {roles:2,refusals};
}
