import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {parse} from 'acorn';
import {generationParts} from './native-join-generation-model.mjs';
import {baseBegin,baseEnd,begin as pinBegin,end as pinEnd} from './native-join-runtime-pin-model.mjs';
import {begin as handlersBegin,end as handlersEnd} from './native-join-handlers-model.mjs';
import {begin as seedBegin,end as seedEnd} from './native-join-execution-seed-model.mjs';

export const begin='// JR-B-VALUES-BEGIN: inspections only; no execution authority or writer.';
export const end='// JR-B-VALUES-END';
function between(js,a,b){assert.equal(js.split(a).length,2,a+' drift');assert.equal(js.split(b).length,2,b+' drift');return js.slice(js.indexOf(a)+a.length,js.indexOf(b));}
export function deriveExecutionValues(js,createNativeDiagnosticState){
  const p=generationParts(js),blocks=[[baseBegin,baseEnd],[pinBegin,pinEnd],[handlersBegin,handlersEnd],[seedBegin,seedEnd],[begin,end]].map(([a,b])=>between(js,a,b));
  return runInNewContext(`(()=>{const P=Promise,promiseThen=P.prototype.then;${blocks[0]}
    return ()=>{let recovery;${p.allocation};recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);
      recovery.writer=recovery.state.owner.writers('release');${p.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${p.block}${blocks.slice(1).join('\n')}
      const args=role=>{const slot=role==='run'?runGeneration:cleanupGeneration,s=slot.pending;return[s,s?.identity,s?.pin,slot];};
      return {prepare:role=>{if(role==='cleanup'){started=true;current={anchor:{binding}};}
          const ok=role==='run'?prepareRunShell(runGeneration,controlRoot,controlRun):prepareCleanupShell(cleanupGeneration,controlRoot,controlDuty,current,current.anchor);
          return ok&&prepareJoinHandlers(...args(role).slice(0,3),role);},
        args,origin:(role,...raw)=>joinExecutionOriginLeaf(...(raw.length?raw:args(role)),role),
        request:role=>requestJoinExecution(...args(role).slice(0,3),role),
        post:(v,e)=>joinExecutionValuePost(v,e),stop:()=>{primary='cancelled';revoked=true;sealed=true;current={anchor:{binding}};},
        flags:()=>({primary,revoked,sealed}),upper:()=>upper.snapshot()};};
  })()`,{createNativeDiagnosticState,types});
}
export function unused(role){return {variant:'unused',kind:role,position:'handlers',constructorClaim:false,constructorState:'not_called',
  executorEntryClaim:false,executor:'not_entered',resolve:null,reject:null,candidateHeld:false,candidate:null,candidateSafety:'unchecked',
  work:null,observerClaim:false,observerState:'unstarted',observerBusy:false,registrationWork:null,registrationReached:false,
  ackHeld:false,ackState:'empty',observerAckCandidate:null,observerAck:null,fault:null,faultAt:null,retention:'held',dispatchStarted:false,entered:false};}
export function aliases(){return {resolve:null,reject:null,candidate:null,work:null,ack:null};}
export function verifyUnusedValues(js,state){
  const create=deriveExecutionValues(js,state);
  for(const role of ['run','cleanup']){const a=create(),v=unused(role),e=aliases();assert.equal(a.post(v,e),true);
    assert.equal(a.post({...v,constructorClaim:true},e),false);assert.equal(v.constructorClaim,false);}
  return {roles:2};
}
// Independent table of the specified stable acquisition prefixes; these never touch a live shell.
export function valueCases(role){
  const resolve=()=>{throw Error('SETTLER_CALLED');},reject=role==='run'?()=>{throw Error('SETTLER_CALLED');}:null;
  const candidate=Object.freeze({}),ack=Object.freeze({});
  const a=unused(role),claimed={...a,variant:'claimed_pre_call',constructorClaim:true},calling={...claimed,variant:'calling_before_entry',constructorState:'calling'};
  const entry={...calling,variant:'capturing',executorEntryClaim:true,executor:'running',position:'executor'};
  const half={...entry,position:'reject',reject},pair={...entry,position:'resolve',resolve,reject};
  const captured={...pair,variant:'captured_before_return',executor:'normal_exit'},returned={...captured,variant:'returned_candidate',constructorState:'returned',candidateHeld:true,candidate,position:'candidate'};
  const checked={...returned,variant:'checked_unpublished',candidateSafety:'safe_same_work',work:candidate,position:'checked',observerClaim:true,
    observerState:'returned',registrationWork:candidate,registrationReached:true,ackHeld:true,ackState:'verified',observerAckCandidate:ack,observerAck:ack};
  const rows=[a,claimed,calling,entry,...(role==='run'?[half]:[]),pair,captured,returned,checked];
  const failed=rows.map(v=>({...v,variant:'failed_retained',fault:'invalid_state',faultAt:'constructor_pre',retention:'unconfirmed'}));
  failed.push({...failed[2],constructorState:'threw'}, {...failed[3],constructorState:'threw',executor:'abnormal'},
    {...failed.at(-2),executor:'abnormal'}, {...failed.at(-2),candidate:null}, {...failed.at(-2),candidate:undefined});
  return [...rows,...failed].map(v=>[v,{resolve:v.resolve,reject:v.reject,candidate:v.candidate,work:v.work,ack:v.observerAckCandidate}]);
}
const stableVariants=['unused','claimed_pre_call','calling_before_entry','capturing','captured_before_return','returned_candidate','checked_unpublished'];
export function verifyValueStages(js,state){
  const api=deriveExecutionValues(js,state)();let valid=0,refusals=0;
  for(const role of ['run','cleanup'])for(const [v,e]of valueCases(role)){
    const before={...v},aliasesBefore={...e};assert.equal(api.post(v,e),true,role+'/'+v.variant+'/'+v.position);valid++;
    for(const [key,bad]of [['kind','foreign'],['variant','issued'],['position','published'],['constructorClaim',undefined],['executorEntryClaim',undefined],
      ['candidateHeld',undefined],['constructorState','pending'],['executor','exited'],['dispatchStarted',true],['entered',true],['candidateSafety','safe'],
      ['observerState','ready'],['ackState','confirmed'],['retention','released']]){
      assert.equal(api.post({...v,[key]:bad},e),false,role+'/'+v.variant+'/'+key);refusals++;
    }
    for(const key of ['resolve','reject','candidate','work','ack']){
      assert.equal(api.post(v,{...e,[key]:{}}),false,'alias '+role+'/'+v.variant+'/'+key);refusals++;
    }
    // A stable row is valid for exactly one non-failure label; relabelling it must not borrow another stage.
    if(v.variant!=='failed_retained')for(const label of stableVariants)if(label!==v.variant){
      assert.equal(api.post({...v,variant:label},e),false,'relabel '+role+'/'+v.variant+'->'+label);refusals++;
    }
    assert.deepEqual(v,before);assert.deepEqual(e,aliasesBefore);
  }
  return {valid,refusals};
}
export function verifyOriginLeaf(js,state){
  const create=deriveExecutionValues(js,state);let own=0,refusals=0,hooks=0;
  const proxy=new Proxy({}, {get(){hooks++;throw Error('RAW_READ');},getPrototypeOf(){hooks++;throw Error('RAW_PROTO');}}),dead=Proxy.revocable({},{});dead.revoke();
  for(const role of ['run','cleanup']){
    const a=create(),b=create();assert(a.prepare(role));assert(b.prepare(role));assert.equal(a.origin(role),true);own++;
    const refs=a.args(role),other=b.args(role),shell=refs[0],before={...shell},upper=JSON.stringify(a.upper());
    for(let i=0;i<4;i++)for(const foreign of [other[i],{...refs[i]},proxy,dead.proxy]){
      const raw=[...refs];raw[i]=foreign;assert.equal(a.origin(role,...raw),false);refusals++;
    }
    // Writable retained fields and the anchor's slot links are part of the same origin, not caller-supplied data.
    const tamper=(obj,key,value)=>{const old=obj[key];obj[key]=value;assert.equal(a.origin(role),false,'tamper '+role+'/'+key);refusals++;obj[key]=old;assert.equal(a.origin(role),true);};
    tamper(shell,'executorHandler',()=>undefined);tamper(shell,'observerArgs',Object.freeze([...shell.observerArgs]));
    tamper(shell.recovery,'runGeneration',{...shell.recovery.runGeneration});
    if(role==='cleanup')tamper(shell,'contextRecord',{});
    a.stop();assert.equal(a.origin(role),true);own++;
    // Origin survives failed custody, but does not recover admission or change a diagnostic.
    refs[3].phase='failed_retained';refs[3].fault='invalid_state';shell.readiness='failed_retained';
    assert.equal(a.origin(role),true);own++;
    assert.equal(JSON.stringify(a.upper()),upper);assert.equal(shell.constructorClaim,false);
    shell.readiness=before.readiness;refs[3].pending=null;assert.equal(a.origin(role,...refs),false);refusals++;
  }
  assert.equal(hooks,0);return {own,refusals,hooks};
}
export function verifyValueBoundaries(js,state){
  const api=deriveExecutionValues(js,state)();let valid=0,refusals=0;
  for(const role of ['run','cleanup']){
    const rows=valueCases(role),claimed=rows.find(([v])=>v.variant==='claimed_pre_call')[0],ack=Object.freeze({}),returned=rows.find(([v])=>v.variant==='returned_candidate')[0],checked=rows.find(([v])=>v.variant==='checked_unpublished')[0];
    const expected=v=>({resolve:v.resolve,reject:v.reject,candidate:v.candidate,work:v.work,ack:v.observerAckCandidate});
    const failed={...returned,variant:'failed_retained',fault:'internal_review_error',faultAt:'observer_call',retention:'unconfirmed',candidateSafety:'safe_same_work',work:returned.candidate,
      observerClaim:true,observerState:'threw',registrationWork:returned.candidate,registrationReached:true};
    for(const v of [
      {...failed,observerState:'registering',observerBusy:true},
      {...failed,observerState:'registering',observerBusy:true,registrationReached:false}, {...failed,observerState:'threw',registrationReached:false},
      {...failed,observerState:'threw',ackState:'return_lost'},
      {...failed,observerState:'refused',registrationReached:false},
      {...failed,observerState:'returned',ackHeld:true,ackState:'held',observerAckCandidate:undefined},
      {...failed,observerState:'returned',ackHeld:true,ackState:'unsafe_retained',observerAckCandidate:null},
      {...returned,candidate:null}, {...returned,candidate:undefined}, {...returned,candidate:0},
    ]){assert.equal(api.post(v,expected(v)),true,role+' retained observation/candidate');valid++;}
    const bad=[
      {...returned,candidateHeld:false}, {...returned,constructorState:'threw'}, {...returned,executor:'abnormal'},
      {...returned,executorEntryClaim:false}, {...returned,position:'resolve'}, {...returned,resolve:null},
      {...returned,resolve:{}}, {...returned,reject:role==='run'?null:()=>{}},
      {...returned,variant:'capturing',constructorState:'calling',executor:'running',candidateHeld:false,candidate:null,position:'resolve',reject:role==='run'?null:()=>{}},
      {...returned,variant:'captured_before_return'}, {...returned,variant:'unused'}, {...returned,constructorClaim:false},
      {...returned,fault:'invalid_state'}, {...returned,faultAt:'constructor_call'},
      {...failed,observerState:'registering',observerBusy:false},
      {...failed,observerState:'refused',registrationReached:true}, {...failed,observerState:'refused',registrationReached:false,ackState:'return_lost'},
      {...failed,observerState:'threw',registrationReached:false,ackState:'return_lost'}, {...failed,observerState:'returned',registrationReached:false},
      {...claimed,variant:'failed_retained',fault:'invalid_state',faultAt:'constructor_pre',retention:'unconfirmed',executorEntryClaim:true,executor:'running',position:'executor'},
      {...claimed,variant:'failed_retained',fault:'invalid_state',faultAt:'constructor_pre',retention:'unconfirmed',constructorClaim:false,candidateSafety:'unsafe_retained'},
      {...failed,candidate:0,work:0,registrationWork:0}, {...failed,observerState:'returned',ackHeld:true,ackState:'held',observerAckCandidate:ack,observerAck:ack},
      {...returned,registrationWork:returned.candidate},
      {...failed,observerState:'returned',ackHeld:true,ackState:'empty'}, {...failed,observerState:'returned',ackHeld:false,ackState:'held'},
      {...failed,observerClaim:false}, {...failed,candidateSafety:'unchecked',work:null},
      {...failed,observerState:'threw',ackHeld:true,ackState:'held'},
      {...failed,fault:null}, {...failed,fault:'cancelled'}, {...failed,faultAt:null}, {...failed,faultAt:'foreign'}, {...failed,retention:'held'},
      {...failed,constructorClaim:false}, {...failed,candidate:undefined},
      {...checked,work:{}}, {...checked,registrationWork:{}}, {...checked,observerAck:{}},
      {...checked,observerAck:0,observerAckCandidate:0}, {...checked,ackHeld:false}, {...checked,registrationReached:false},
      {...checked,observerBusy:true}, {...checked,observerClaim:false}, {...checked,position:'candidate'},
      {...checked,candidateSafety:'unsafe_retained',work:null},
    ];
    for(const v of bad){assert.equal(api.post(v,expected(v)),false,role+' bad boundary '+refusals);refusals++;}
  }
  return {valid,refusals};
}
function walk(node,visit){visit(node);for(const value of Object.values(node)){
  if(Array.isArray(value))for(const n of value)if(n?.type)walk(n,visit);else void 0;
  else if(value?.type)walk(value,visit);
}}
export function auditExecutionValues(js){
  const block=between(js,begin,end),tree=parse('function inspection(){'+block+'}',{ecmaVersion:'latest'});
  let calls=0,originCalls=0;
  walk(tree,n=>{
    assert(!['AssignmentExpression','UpdateExpression','NewExpression','AwaitExpression','ImportExpression','ThrowStatement','ArrowFunctionExpression'].includes(n.type),'value inspection capability');
    if(n.type==='CallExpression'){assert(n.callee.type==='Identifier'&&['joinValueFaultSite','joinValueObservationPost'].includes(n.callee.name),'value inspection call');calls++;}
    if(n.type==='MemberExpression')assert(!(n.object.type==='Identifier'&&n.object.name.startsWith('raw')),'raw origin dereference');
    if(n.type==='FunctionDeclaration'&&n.id?.name==='joinExecutionOriginLeaf')walk(n,b=>{if(b.type==='CallExpression')originCalls++;});
  });
  assert.equal(calls,2);assert.equal(originCalls,0);return {calls,originCalls,writes:0};
}
export const valueMutants=[
  ['raw slot identity',' || rawSlot !== slot',''],
  ['retained pending','slot.pending === shell','true'],
  ['role reject boundary',"v.kind === 'cleanup' && v.reject !== null",'false'],
  ['run reject first',"v.kind === 'run' && v.resolve !== null && v.reject === null",'false'],
  ['settler alias','v.resolve !== expected.resolve','false'],
  ['candidate alias','v.candidate !== expected.candidate','false'],
  ['work alias','v.work !== expected.work','false'],
  ['registration alias','v.registrationWork !== v.work','false'],
  ['ack alias','v.observerAckCandidate !== expected.ack','false'],
  ['ack identity','v.observerAck === v.observerAckCandidate','true'],
  ['position','v.position !== position','false'],
  ['fault site','joinValueFaultSite(v.faultAt)','true'],
  ['failure retention',"v.retention === 'unconfirmed'",'true'],
  ['unused claim',"case 'unused': return v.constructorClaim === false", "case 'unused': return true"],
  ['refused unreached',"v.observerState === 'refused' && v.registrationReached !== false ||",''],
  ['returned reached',"v.observerState === 'returned' && v.registrationReached !== true",'false'],
  ['lost after reach',"v.ackState === 'return_lost' && v.registrationReached === true","v.ackState === 'return_lost'"],
  ['calling before entry',"v.constructorState === 'calling' && v.executorEntryClaim === false && v.position === 'handlers'","v.constructorState === 'calling'"],
  ['capturing running',"v.executorEntryClaim === true && v.executor === 'running';",'true;'],
  ['uncalled no entry',"v.executorEntryClaim !== false || v.candidateHeld !== false",'false'],
  ['unsafe held candidate',"v.candidateSafety === 'unsafe_retained' && !v.candidateHeld ||",''],
  ['work object',"(typeof v.work !== 'object' && typeof v.work !== 'function') ||",''],
  ['held ack unverified','return v.observerAck === null;','return true;'],
  ['unclaimed registration',"v.registrationWork === null && v.ackHeld === false","v.ackHeld === false"],
  ['executor origin','shell.executorHandler === executor &&',''],
  ['tuple origin','shell.observerArgs === args;','true;'],
  ['cleanup record origin','shell.context.record === shell.contextRecord &&',''],
  ['recovery run slot','joinRecovery.runGeneration === runGeneration &&',''],
];
export function mutateValue(js,from,to){const b=between(js,begin,end);assert.equal(b.split(from).length,2,'value mutation drift '+from);
  const changed=js.replace(b,b.replace(from,to));parse(changed,{ecmaVersion:'latest',sourceType:'module'});return changed;}
export function verifyValueMutant(js,state,i){const [,from,to]=valueMutants[i];
  const changed=mutateValue(js,from,to);
  assert.throws(()=>{verifyUnusedValues(changed,state);verifyValueStages(changed,state);verifyValueBoundaries(changed,state);verifyOriginLeaf(changed,state);},assert.AssertionError);}
export function verifyValueAuditNegatives(js){
  const anchor='void joinExecutionOriginLeaf;';
  for(const bad of ['new P(()=>{});','v.resolve();','v.constructorClaim=true;','jbGet(v,"kind");','rawShell.kind;','notifyStop();']){
    const changed=mutateValue(js,anchor,bad+anchor);assert.throws(()=>auditExecutionValues(changed),assert.AssertionError);
  }return 6;
}
export function verifyValuesHaveNoAuthority(js,state){
  const create=deriveExecutionValues(js,state);let requests=0,closures=0;
  for(const role of ['run','cleanup'])for(const operation of ['request','executorHandler','fulfilledHandler','rejectedHandler']){
    const api=create();assert(api.prepare(role));const [shell,,,slot]=api.args(role),before={...shell},upper=JSON.stringify(api.upper());
    const [v,e]=valueCases(role).find(([row])=>row.variant==='checked_unpublished');assert.equal(api.post(v,e),true);
    assert.deepEqual({...shell},before);assert.equal(api.origin(role),true);
    if(operation==='request'){assert.equal(api.request(role),false);assert.equal(slot.faultAt,'constructor_pre');requests++;}
    else {assert.equal(shell[operation](()=>{throw Error('SETTER');},()=>{throw Error('SETTER');}),undefined);assert.equal(shell.handlersFault,'closed_call');assert.equal(slot.faultAt,'handlers');closures++;}
    assert.equal(shell.constructorClaim,false);assert.equal(shell.executorEntryClaim,false);assert.equal(shell.candidate,null);
    assert.equal(slot.fault,'invalid_state');assert.equal(api.flags().revoked,true);assert.equal(JSON.stringify(api.upper()),upper);
  }return {requests,closures};
}
