import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {parse} from 'acorn';
import {generationParts} from './native-join-generation-model.mjs';
import {baseBegin,baseEnd,begin as pinBegin,end as pinEnd} from './native-join-runtime-pin-model.mjs';
import {begin as handlersBegin,end as handlersEnd} from './native-join-handlers-model.mjs';
import {begin as seedBegin,end as seedEnd} from './native-join-execution-seed-model.mjs';
import {begin as valuesBegin,end as valuesEnd} from './native-join-execution-values-model.mjs';
import {begin as liveBegin,end as liveEnd} from './native-join-live-state-model.mjs';

export const scalarBegin='// JR-B-PRECALL-SCALARS-BEGIN: prior primitive custody only.';
export const scalarEnd='// JR-B-PRECALL-SCALARS-END';
export const begin='// JR-B-PRECALL-BEGIN: admission refusal only; no field admission or execution.';
export const end='// JR-B-PRECALL-END';
function between(js,a,b){assert.equal(js.split(a).length,2,a+' drift');assert.equal(js.split(b).length,2,b+' drift');return js.slice(js.indexOf(a)+a.length,js.indexOf(b));}
export function derivePrecall(js,createNativeDiagnosticState){
  const p=generationParts(js),scalar=between(js,scalarBegin,scalarEnd),base=between(js,baseBegin,baseEnd),pin=between(js,pinBegin,pinEnd),
    handlers=between(js,handlersBegin,handlersEnd),seed=between(js,seedBegin,seedEnd),values=between(js,valuesBegin,valuesEnd),
    live=between(js,liveBegin,liveEnd),precall=between(js,begin,end);
  assert(p.preparation.includes(scalar),'prior scalar placement drift');
  const get='jbGet = Object.getOwnPropertyDescriptor';assert.equal(base.split(get).length,2,'reflection boundary drift');
  const measured=base.replace(get,'jbGet = (target,key)=>{if(probe)probe(target,key);return Object.getOwnPropertyDescriptor(target,key);}');
  return runInNewContext(`(()=>{'use strict';let probe=null,operations=0;const P=Promise,promiseThen=P.prototype.then;${measured}
    return ()=>{let recovery;${p.allocation};recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);
      recovery.writer=recovery.state.owner.writers('release');${p.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${p.block}${pin}${handlers}${seed}${values}${live}${precall}
      const args=role=>{const slot=role==='run'?runGeneration:cleanupGeneration,s=slot.pending;return[s,s?.identity,s?.pin,slot];};
      return {prepare:role=>{if(role==='cleanup'){started=true;current={anchor:{binding}};}
          return (role==='run'?prepareRunShell(runGeneration,controlRoot,controlRun):prepareCleanupShell(cleanupGeneration,controlRoot,controlDuty,current,current.anchor))&&
            prepareJoinHandlers(...args(role).slice(0,3),role);},args,
        request:(role,...raw)=>requestJoinPrecall(...(raw.length?raw:args(role)),role),
        inspectRequest:(role,inspect,...raw)=>{const prior=probe;probe=inspect;try{return requestJoinPrecall(...(raw.length?raw:args(role)),role);}finally{probe=prior;}},
        diagnostic:role=>role==='run'?{attempted:runPrecallAttempted,busy:runPrecallBusy,check:runPrecallRefusalCheck,code:runPrecallRefusalCode}:
          {attempted:cleanupPrecallAttempted,busy:cleanupPrecallBusy,check:cleanupPrecallRefusalCheck,code:cleanupPrecallRefusalCode},
        set:p=>{if('primary'in p)primary=p.primary;if('revoked'in p)revoked=p.revoked;if('sealed'in p)sealed=p.sealed;},
        dropShell:role=>{if(role==='run')runShellExpected=null;else cleanupShellExpected=null;},
        closeOperations:()=>{const bad=()=>{operations++;throw Error('FORBIDDEN_OPERATION');};globalThis.Promise=new Proxy(P,{construct:bad});
          for(const name of ['queueMicrotask','setTimeout','setInterval','fetch','Response','ReadableStream','Worker'])globalThis[name]=bad;
          Date.now=bad;globalThis.performance={now:bad};},
        poisonDescriptorPrototype:()=>{for(const key of ['value','writable']){const descriptor=Object.create(null);
          descriptor.get=()=>{operations++;throw Error('DESCRIPTOR_HOOK');};descriptor.configurable=true;Object.defineProperty(Object.prototype,key,descriptor);}},
        counts:()=>({operations}),flags:()=>({primary,revoked,sealed}),upper:()=>upper.snapshot()};};
  })()`,{createNativeDiagnosticState,types});
}
export function verifyPrecallOnce(js,state){
  const create=derivePrecall(js,state);let cases=0;
  for(const role of ['run','cleanup']){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),upper=JSON.stringify(a.upper());
    a.set({primary:'authentication_failed',revoked:true});a.closeOperations();let probes=0;
    assert.equal(a.inspectRequest(role,()=>probes++),false);assert.equal(probes,5);
    assert.equal(a.flags().primary,'authentication_failed');
    const before={...slot},shell={...s},diagnostic={...a.diagnostic(role)};
    a.set({primary:null,revoked:false});
    let retries=0;assert.equal(a.inspectRequest(role,()=>{retries++;throw Error('RETRY');}),false);assert.equal(retries,0);
    assert.deepEqual({...a.diagnostic(role)},diagnostic);assert.deepEqual({...slot},before);assert.deepEqual({...s},shell);
    assert.equal(a.flags().primary,'invalid_state');assert.equal(a.flags().revoked,true);
    const other=role==='run'?'cleanup':'run';assert.deepEqual({...a.diagnostic(other)},{attempted:false,busy:false,check:null,code:null});
    assert.equal(JSON.stringify(a.upper()),upper);assert.equal(a.counts().operations,0);cases++;
  }return {cases,descriptors:10};
}
export function verifyPrecallSlots(js,state){
  const create=derivePrecall(js,state);let cases=0,hooks=0;
  for(const role of ['run','cleanup'])for(const key of ['faultAt','fault','phase'])for(const mode of ['readonly','accessor','missing','invalid','frozen']){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),before={...s};a.closeOperations();
    if(mode==='readonly')Object.defineProperty(slot,key,{value:slot[key],writable:false,configurable:true,enumerable:true});
    if(mode==='accessor')Object.defineProperty(slot,key,{get(){hooks++;throw Error('SLOT_GET');},set(){hooks++;throw Error('SLOT_SET');},configurable:true});
    if(mode==='missing')delete slot[key];if(mode==='invalid')slot[key]='arbitrary';if(mode==='frozen')Object.freeze(slot);
    const desc=Object.getOwnPropertyDescriptors(slot);let probes=0;
    assert.doesNotThrow(()=>assert.equal(a.inspectRequest(role,()=>probes++),false));
    assert(probes>=1&&probes<=3);assert.deepEqual(Object.getOwnPropertyDescriptors(slot),desc);assert.deepEqual({...s},before);
    assert.deepEqual({...a.diagnostic(role)},{attempted:true,busy:false,check:'composition',code:'invalid_state'});
    assert.equal(a.flags().primary,'invalid_state');assert.equal(a.flags().revoked,true);assert.equal(a.counts().operations,0);cases++;
  }
  for(const role of ['run','cleanup'])for(const mode of ['throw1','throw2','throw3']){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),before={...slot},shell={...s};let probes=0;
    assert.doesNotThrow(()=>assert.equal(a.inspectRequest(role,()=>{if(++probes===Number(mode.at(-1)))throw Error('SECRET_REFLECTION_ERROR');}),false));
    assert.equal(probes,Number(mode.at(-1)));assert.deepEqual({...slot},before);assert.deepEqual({...s},shell);
    assert.equal(a.diagnostic(role).check,'composition');assert.equal(a.diagnostic(role).code,'invalid_state');
    assert.equal(a.flags().revoked,true);assert.equal(a.diagnostic(role).busy,false);cases++;
  }
  return {cases,hooks};
}
function walk(n,visit,owner=''){
  if(n.type==='FunctionDeclaration')owner=n.id?.name??'';visit(n,owner);
  for(const v of Object.values(n)){if(Array.isArray(v)){for(const c of v)if(c?.type)walk(c,visit,owner);}else if(v?.type)walk(v,visit,owner);}
}
export function auditPrecall(js){
  const scalar=between(js,scalarBegin,scalarEnd),block=between(js,begin,end),tree=parse('function closed(){'+block+'}',{ecmaVersion:'latest'});
  let scalars=0;walk(parse('function prior(){'+scalar+'}',{ecmaVersion:'latest'}),n=>{
    if(n.type==='VariableDeclarator'){assert(/^(run|cleanup)Precall(Attempted|Busy|RefusalCheck|RefusalCode)$/.test(n.id.name));
      assert(n.init.type==='Literal'&&(n.init.value===null||n.init.value===false));scalars++;}
    assert(!['CallExpression','NewExpression','ObjectExpression','ArrayExpression','MemberExpression'].includes(n.type));
  });assert.equal(scalars,8);
  const calls=new Set(['recordJoinPrecallRefusal','reflectJoinPrecallFailure','jbGet','jbOwn','jbProxy','joinValueFaultSite','recordJoinExecutionFailure','holdJoinExecutionUnconfirmed']);
  const forbidden=new Set(['P','Promise','enqueue','queueMicrotask','setTimeout','setInterval','Date','performance','Response','fetch','Worker',
    'readBudget','schedule','sample','bridge','observe','failExecutionSeed','notifyStop','joinLiveFieldPost','samePreparedControl']);
  let descriptors=0,writableGuards=0,dataGuards=0;
  walk(tree,(n,owner)=>{
    assert(!['NewExpression','AwaitExpression','ImportExpression','ThrowStatement','ArrowFunctionExpression','FunctionExpression','ObjectExpression','ArrayExpression','UpdateExpression'].includes(n.type),'precall capability/allocation');
    if(n.type==='Identifier')assert(!forbidden.has(n.name),'precall capability '+n.name);
    if(n.type==='CallExpression'){
      assert(n.callee.type==='Identifier'&&calls.has(n.callee.name),'precall invocation');
      if(n.callee.name==='jbGet'){assert.equal(owner,'reflectJoinPrecallFailure');assert.equal(n.arguments[0].name,'own');
        assert.equal(n.arguments[1].value,['faultAt','fault','phase'][descriptors++]);}
      if(n.callee.name==='jbOwn'&&n.arguments[0].name==='d'&&n.arguments[1].value==='value')dataGuards++;
    }
    if(n.type==='MemberExpression')assert(!n.object.name?.startsWith('raw'),'raw precall read');
    if(n.type==='AssignmentExpression')assert(n.left.type==='Identifier'&&(/^(run|cleanup)Precall(Attempted|Busy|RefusalCheck|RefusalCode)$/.test(n.left.name)||['primary','revoked','d'].includes(n.left.name)), 'precall writer');
    if(n.type==='BinaryExpression'&&n.operator==='!=='&&n.left.object?.name==='d'&&n.left.property?.name==='writable'&&n.right.value===true)writableGuards++;
    if(n.type==='ReturnStatement'&&n.argument?.type==='Literal')assert.equal(n.argument.value,false,'precall acceptance');
  });assert.equal(descriptors,3);assert.equal(writableGuards,3);assert.equal(dataGuards,3);
  const reflector=tree.body[0].body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='reflectJoinPrecallFailure');
  const primitiveCall=reflector.body.body.findIndex(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='recordJoinExecutionFailure');
  assert(primitiveCall>0);assert(reflector.body.body.slice(0,primitiveCall).some(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&
    n.expression.left.name==='d'&&n.expression.right.name==='undefined'),'descriptor not retired before cold hold');
  const request=tree.body[0].body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='requestJoinPrecall');
  const body=request.body.body;assert.equal(body[1].test.type,'ConditionalExpression');assert.equal(body[1].test.consequent.name,'runPrecallBusy');
  assert.equal(body[2].test.type,'ConditionalExpression');assert.equal(body[2].test.consequent.name,'runPrecallAttempted');
  const found=[];walk(parse(js,{ecmaVersion:'latest',sourceType:'module'}),(n,owner)=>{
    if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&['requestJoinPrecall','recordJoinPrecallRefusal','reflectJoinPrecallFailure'].includes(n.callee.name)){
      assert.equal(owner,'requestJoinPrecall','open precall caller');found.push(n.callee.name);
    }
  });assert.deepEqual(found,['recordJoinPrecallRefusal','recordJoinPrecallRefusal','recordJoinPrecallRefusal','recordJoinPrecallRefusal','reflectJoinPrecallFailure','recordJoinPrecallRefusal']);
  return {scalars,descriptors,writableGuards,entryCallers:0};
}
export const precallMutants=[
  ['attempt not retained','runPrecallAttempted = true; runPrecallBusy = true;','runPrecallAttempted = false; runPrecallBusy = true;'],
  ['cleanup attempt not retained','cleanupPrecallAttempted = true; cleanupPrecallBusy = true;','cleanupPrecallAttempted = false; cleanupPrecallBusy = true;'],
  ['first diagnostic overwritten','runPrecallRefusalCheck ??= check','runPrecallRefusalCheck = check'],
  ['first code overwritten','runPrecallRefusalCode ??= code','runPrecallRefusalCode = code'],
  ['cleanup first diagnostic overwritten','cleanupPrecallRefusalCheck ??= check','cleanupPrecallRefusalCheck = check'],
  ['primary overwritten','primary ??= runPrecallRefusalCode','primary = runPrecallRefusalCode'],
  ['revocation omitted','revoked = true;','void revoked;'],
  ['retry admitted',"if (role === 'run' ? runPrecallAttempted : cleanupPrecallAttempted)",'if (false)'],
  ['inner frame enters',"if (role === 'run' ? runPrecallBusy : cleanupPrecallBusy)",'if (false)'],
  ['no owner check','rawSlot !== own','false'],
  ['slot data tag omitted',"!jbOwn(d, 'value')",'false',3],
  ['slot writable guards omitted','d.writable !== true','false',3],
  ['invalid site accepted','d.value !== null && !joinValueFaultSite(d.value)','false'],
  ['invalid fault accepted',"d.value !== null && d.value !== 'invalid_state' &&\n            d.value !== 'evidence_binding_mismatch' && d.value !== 'internal_review_error'",'false'],
  ['invalid phase accepted',"d.value !== 'empty' && d.value !== 'claimed_unheld' &&\n            d.value !== 'building' && d.value !== 'checked' && d.value !== 'failed_retained'",'false'],
  ['wrong role reflection',"recordJoinExecutionFailure(role, 'constructor_pre', code)","recordJoinExecutionFailure('run', 'constructor_pre', code)"],
  ['skip primitive custody',"recordJoinExecutionFailure(role, 'constructor_pre', code)",'void code'],
  ['skip metadata custody','holdJoinExecutionUnconfirmed(role)','void role'],
  ['descriptor borrow not retired','d = undefined;','void d;'],
  ['busy not released','runPrecallBusy = false; else cleanupPrecallBusy = false','void runPrecallBusy; else cleanupPrecallBusy = false'],
  ['false acceptance','return reflectJoinPrecallFailure(role)','return true'],
  ['claimed phase refused',"d.value !== 'claimed_unheld' &&",''],['checked phase refused',"d.value !== 'checked' && ",''],
  ['failed phase refused'," && d.value !== 'failed_retained')",')'],['prior invalid fault refused',"d.value !== 'invalid_state' &&",''],
  ['prior mismatch fault refused',"d.value !== 'evidence_binding_mismatch' && ",''],['prior internal fault refused'," && d.value !== 'internal_review_error')",')'],
  ['null held shell accepted','!heldShell || rawShell','rawShell'],
];
export function verifyPrecallMutant(js,state,index){
  const [name,from,to,count=1]=precallMutants[index],block=between(js,begin,end);
  const pattern=new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+'),'g');
  assert.equal([...block.matchAll(pattern)].length,count,name+' drift');const changed=js.replace(block,block.replace(pattern,to));
  parse(changed,{ecmaVersion:'latest',sourceType:'module'});
  assert.throws(()=>{
    auditPrecall(changed);verifyPrecallInitial(changed,state);verifyPrecallOnce(changed,state);verifyPrecallSlots(changed,state);
    verifyPrecallOrigins(changed,state);verifyPrecallReentry(changed,state);verifyPrecallMetadata(changed,state);
    verifyPrecallSlotDomains(changed,state);verifyPrecallCustody(changed,state);
  },assert.AssertionError,name+' escaped');
}
export function verifyPrecallOrigins(js,state){
  const create=derivePrecall(js,state);let cases=0,hooks=0;
  const proxy=new Proxy({},{get(){hooks++;throw Error('RAW_GET');},getPrototypeOf(){hooks++;throw Error('RAW_PROTO');}}),dead=Proxy.revocable({},{});dead.revoke();
  for(const role of ['run','cleanup'])for(let i=0;i<4;i++)for(const mode of ['foreign','copy','proxy','revoked']){
    const a=create(),b=create();assert(a.prepare(role));assert(b.prepare(role));const raw=[...a.args(role)],other=b.args(role),bSlot={...other[3]},bShell={...other[0]};
    raw[i]=mode==='foreign'?other[i]:mode==='copy'?{...raw[i]}:mode==='proxy'?proxy:dead.proxy;
    assert.doesNotThrow(()=>assert.equal(a.request(role,...raw),false));
    assert.deepEqual({...a.diagnostic(role)},{attempted:true,busy:false,check:'owner',code:'evidence_binding_mismatch'});
    assert.equal(a.args(role)[3].fault,'evidence_binding_mismatch');assert.deepEqual({...other[3]},bSlot);assert.deepEqual({...other[0]},bShell);
    assert.equal(b.flags().primary,null);assert.equal(b.flags().revoked,false);cases++;
  }
  for(const role of ['run','cleanup']){const a=create();assert.equal(a.request(role),false);assert.equal(a.diagnostic(role).check,'owner');
    assert.equal(a.args(role)[3].pending,null);assert.equal(a.args(role)[3].fault,'evidence_binding_mismatch');cases++;}
  return {cases,hooks};
}
export function verifyPrecallReentry(js,state){
  const create=derivePrecall(js,state);let cases=0;
  for(const role of ['run','cleanup']){
    const a=create();assert(a.prepare(role));let probes=0,reentries=0;
    assert.equal(a.inspectRequest(role,()=>{
      probes++;const d={...a.diagnostic(role)};assert.equal(d.attempted,true);assert.equal(d.busy,true);assert.equal(a.flags().revoked,true);
      assert.equal(d.check,'composition');assert.equal(a.request(role),false);assert.deepEqual({...a.diagnostic(role)},d);reentries++;
    }),false);
    assert.equal(probes,5);assert.equal(reentries,5);assert.equal(a.diagnostic(role).busy,false);assert.equal(a.diagnostic(role).check,'composition');cases++;
  }return {cases,reentries:10};
}
export function verifyPrecallMetadata(js,state){
  const create=derivePrecall(js,state);let cases=0,hooks=0;
  for(const role of ['run','cleanup'])for(const key of ['readiness','retention'])for(const mode of ['readonly','accessor','missing','frozen']){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),other=key==='readiness'?'retention':'readiness';
    if(mode==='readonly')Object.defineProperty(s,key,{value:s[key],writable:false,configurable:true});
    if(mode==='accessor')Object.defineProperty(s,key,{get(){hooks++;throw Error('META_GET');},set(){hooks++;throw Error('META_SET');},configurable:true});
    if(mode==='missing')delete s[key];if(mode==='frozen')Object.freeze(s);const old=Object.getOwnPropertyDescriptor(s,key);
    assert.doesNotThrow(()=>assert.equal(a.request(role),false));assert.equal(slot.phase,'failed_retained');assert.equal(slot.fault,'invalid_state');
    assert.deepEqual(Object.getOwnPropertyDescriptor(s,key),old);if(mode!=='frozen')assert.equal(s[other],other==='readiness'?'failed_retained':'unconfirmed');cases++;
  }
  for(const role of ['run','cleanup']){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),raw=[...a.args(role)];a.dropShell(role);
    assert.equal(a.request(role,...raw),false);assert.equal(slot.pending,s);assert.equal(slot.fault,'evidence_binding_mismatch');assert.equal(s.readiness,'handlers_ready');cases++;
  }
  for(const role of ['run','cleanup']){
    const a=derivePrecall(js,state)();assert(a.prepare(role));a.poisonDescriptorPrototype();
    assert.doesNotThrow(()=>assert.equal(a.request(role),false));assert.equal(a.counts().operations,0);assert.equal(a.args(role)[3].fault,'invalid_state');cases++;
  }
  return {cases,hooks};
}
export function verifyPrecallCustody(js,state){
  const create=derivePrecall(js,state);let cases=0,hooks=0;
  for(const role of ['run','cleanup'])for(const sealed of [false,true]){
    const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role),upper=JSON.stringify(a.upper());
    slot.fault='internal_review_error';slot.faultAt='executor_exit';slot.phase='failed_retained';
    a.set({primary:'cancelled',revoked:true,sealed});assert.equal(a.request(role),false);
    assert.equal(slot.fault,'internal_review_error');assert.equal(slot.faultAt,'executor_exit');assert.equal(slot.pending,s);
    assert.equal(a.flags().primary,'cancelled');assert.equal(a.flags().sealed,sealed);assert.equal(JSON.stringify(a.upper()),upper);cases++;
  }
  // No whole-field qualification is connected: non-metadata fields are not read/adopted on this closed path.
  for(const role of ['run','cleanup']){
    const template=create();assert(template.prepare(role));const keys=Object.keys(template.args(role)[0]);assert.equal(keys.length,65);
    for(const key of keys){const a=create();assert(a.prepare(role));const raw=[...a.args(role)],s=raw[0];
      Object.defineProperty(s,key,{get(){hooks++;throw Error('UNCONNECTED_FIELD');},set(){hooks++;throw Error('UNCONNECTED_WRITE');},configurable:true});
      assert.doesNotThrow(()=>assert.equal(a.request(role,...raw),false));assert.equal(a.diagnostic(role).check,'composition');
      assert.equal(a.diagnostic(role).attempted,true);assert.equal(a.flags().revoked,true);cases++;
    }
  }
  const a=create(),before=JSON.stringify(a.flags());assert.equal(a.request('foreign'),false);assert.equal(JSON.stringify(a.flags()),before);
  assert.equal(a.diagnostic('run').attempted,false);assert.equal(a.diagnostic('cleanup').attempted,false);cases++;
  return {cases,hooks};
}
// Each accepted slot phase and prior fault must still reflect the refusal; a null held shell stays an owner mismatch.
export function verifyPrecallSlotDomains(js,state){
  const create=derivePrecall(js,state);let cases=0;
  for(const role of ['run','cleanup']){
    for(const phase of ['claimed_unheld','checked','failed_retained']){
      const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role);slot.phase=phase;assert.equal(a.request(role),false);
      assert.equal(slot.fault,'invalid_state',role+' '+phase);assert.equal(slot.faultAt,'constructor_pre');assert.equal(slot.phase,'failed_retained');
      assert.equal(slot.pending,s);assert.equal(s.retention,'unconfirmed');cases++;
    }
    for(const fault of ['invalid_state','evidence_binding_mismatch','internal_review_error']){
      const a=create();assert(a.prepare(role));const [s,,,slot]=a.args(role);slot.fault=fault;slot.faultAt='executor_exit';assert.equal(a.request(role),false);
      assert.equal(slot.fault,fault,role+' '+fault);assert.equal(slot.faultAt,'executor_exit');assert.equal(slot.phase,'failed_retained');
      assert.equal(s.readiness,'failed_retained');assert.equal(s.retention,'unconfirmed');cases++;
    }
    const a=create();assert(a.prepare(role));const [s,identity,pin,slot]=a.args(role);a.dropShell(role);
    assert.equal(a.request(role,null,identity,pin,slot),false);
    assert.deepEqual({...a.diagnostic(role)},{attempted:true,busy:false,check:'owner',code:'evidence_binding_mismatch'});
    assert.equal(slot.fault,'evidence_binding_mismatch');assert.equal(slot.pending,s);cases++;
  }return {cases};
}
export function verifyPrecallAuditNegatives(js){
  const block=between(js,begin,end);let rejected=0;
  for(const extra of ['const escaped={};','const escaped=[];','Promise.resolve();','sample();','queueMicrotask(()=>{});',
    'function leaked(){return requestJoinPrecall(null,null,null,null,"run");}']){
    const changed=js.replace(block,block+'\n'+extra);parse(changed,{ecmaVersion:'latest',sourceType:'module'});
    assert.throws(()=>auditPrecall(changed));rejected++;
  }return rejected;
}
export function verifyPrecallInitial(js,state){
  const create=derivePrecall(js,state);let roles=0;
  for(const role of ['run','cleanup']){
    const a=create();assert.deepEqual({...a.diagnostic(role)},{attempted:false,busy:false,check:null,code:null});
    assert(a.prepare(role));const [s,,,slot]=a.args(role),upper=JSON.stringify(a.upper());
    assert.equal(a.request(role),false);
    assert.deepEqual({...a.diagnostic(role)},{attempted:true,busy:false,check:'composition',code:'invalid_state'});
    assert.equal(slot.faultAt,'constructor_pre');assert.equal(slot.fault,'invalid_state');assert.equal(slot.phase,'failed_retained');
    assert.equal(slot.pending,s);assert.equal(s.readiness,'failed_retained');assert.equal(s.retention,'unconfirmed');
    assert.equal(s.constructorClaim,false);assert.equal(s.executorEntryClaim,false);assert.equal(s.candidate,null);
    assert.equal(a.flags().primary,'invalid_state');assert.equal(a.flags().revoked,true);assert.equal(JSON.stringify(a.upper()),upper);roles++;
  }return {roles};
}
