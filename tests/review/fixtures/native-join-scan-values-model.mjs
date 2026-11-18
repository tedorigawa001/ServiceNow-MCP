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
import {begin as precallBegin,end as precallEnd} from './native-join-precall-model.mjs';

export const scalarBegin='// JR-B-SCAN-SCALARS-BEGIN: closed values only; no scan owner claim.';
export const scalarEnd='// JR-B-SCAN-SCALARS-END';
export const begin='// JR-B-SCAN-VALUES-BEGIN: finite schema and guards only; no scan.';
export const end='// JR-B-SCAN-VALUES-END';
function between(js,a,b){assert.equal(js.split(a).length,2,a+' drift');assert.equal(js.split(b).length,2,b+' drift');return js.slice(js.indexOf(a)+a.length,js.indexOf(b));}
export function deriveScanValues(js,createNativeDiagnosticState){
  const p=generationParts(js),base=between(js,baseBegin,baseEnd),pin=between(js,pinBegin,pinEnd),handlers=between(js,handlersBegin,handlersEnd),
    seed=between(js,seedBegin,seedEnd),values=between(js,valuesBegin,valuesEnd),live=between(js,liveBegin,liveEnd),precall=between(js,precallBegin,precallEnd),
    scan=between(js,begin,end),scalar=between(js,scalarBegin,scalarEnd);
  assert(p.preparation.includes(scalar),'prior scan scalar placement');
  return runInNewContext(`(()=>{'use strict';const P=Promise,promiseThen=P.prototype.then;${base}
    return ()=>{let recovery;${p.allocation};recovery.state=createNativeDiagnosticState();recovery.state.owner.bind(recovery.state.binding);
      recovery.writer=recovery.state.owner.writers('release');${p.preparation}
      recovery.status='ready';let started=false,primary=null,revoked=false,sealed=false,current;
      ${p.block}${pin}${handlers}${seed}${values}${live}${precall}${scan}
      return {root:controlRoot,initial:(root=controlRoot)=>joinScanInitialPost(root),id:joinScanFailureIdValue,
        schema:joinScanSchemaValue,field:joinScanFieldKey,
        counter:joinScanCounterValue,controlCode:joinScanControlCodeValue,
        entry:()=>[started,primary,revoked,sealed,current],
        dropRecovery:()=>{recovery={};},
        guard:(role,entry=[started,primary,revoked,sealed,current],root=controlRoot)=>joinScanGuardPost(root,role,...entry),
        active:role=>{joinScanOwner=role;if(role==='run'){runPrecallAttempted=true;runPrecallBusy=true;runPrecallRefusalCheck=null;runPrecallRefusalCode=null;}
          else{cleanupPrecallAttempted=true;cleanupPrecallBusy=true;cleanupPrecallRefusalCheck=null;cleanupPrecallRefusalCode=null;}},
        fixture:(role,key,value)=>{if(key==='owner')joinScanOwner=value;if(key==='interrupted')joinScanInterrupted=value;
          if(role==='run'){if(key==='effects')runScanEffectAttempts=value;if(key==='completed')runScanLastCompleted=value;if(key==='attempted')runPrecallAttempted=value;
            if(key==='busy')runPrecallBusy=value;if(key==='check')runPrecallRefusalCheck=value;if(key==='code')runPrecallRefusalCode=value;}
          else{if(key==='effects')cleanupScanEffectAttempts=value;if(key==='completed')cleanupScanLastCompleted=value;if(key==='attempted')cleanupPrecallAttempted=value;
            if(key==='busy')cleanupPrecallBusy=value;if(key==='check')cleanupPrecallRefusalCheck=value;if(key==='code')cleanupPrecallRefusalCode=value;}
          if(key==='started')started=value;if(key==='primary')primary=value;if(key==='revoked')revoked=value;if(key==='sealed')sealed=value;if(key==='current')current=value;},
        state:()=>({owner:joinScanOwner,interrupted:joinScanInterrupted,runEffects:runScanEffectAttempts,runCompleted:runScanLastCompleted,
          cleanupEffects:cleanupScanEffectAttempts,cleanupCompleted:cleanupScanLastCompleted}),
        request:role=>{const slot=role==='run'?runGeneration:cleanupGeneration;return requestJoinPrecall(null,null,null,slot,role);},
        flags:()=>({started,primary,revoked,sealed}),upper:()=>upper.snapshot()};};
  })()`,{createNativeDiagnosticState,types});
}
const counts=[65,8,5,6,4,6,7,7,7,5,3,2,2,1,3,0,0,0,0];
const node=i=>'N'+String(i+1).padStart(2,'0');
export const expectedScanIds=[...['busy','attempted','owner','composition','control'],
  ...counts.flatMap((n,i)=>Array.from({length:n},(_,j)=>node(i)+'.D'+String(j+1).padStart(2,'0'))),
  ...counts.map((_,i)=>node(i)+'.proxy'),
  ...[1,2,4,5,6,7,8,9,10,11,12,15,16].map(n=>node(n-1)+'.keys'),
  ...[5,6,7,8,9,10,11,12,14,15,16].map(n=>node(n-1)+'.frozen'),
  'N15.proto','N16.proto',...Array.from({length:7},(_,i)=>'A'+String(i+1).padStart(2,'0')),
  'scan_interrupted','scan_state','scan_counter','scan_context'];
export function verifyScanIds(js,state){
  const a=deriveScanValues(js,state)();assert.equal(expectedScanIds.length,192);assert.equal(new Set(expectedScanIds).size,192);
  for(const id of expectedScanIds)assert.equal(a.id(id),true,id);
  let invalid=0,hooks=0;
  for(let i=0;i<19;i++)for(const ordinal of [0,counts[i]+1,66]){const id=node(i)+'.D'+String(ordinal).padStart(2,'0');assert.equal(a.id(id),false,id);invalid++;}
  for(const id of [null,undefined,false,1,NaN,{},[],Symbol('N01.D01'),'N1.D01','N01.D1','N01.D001','N20.proxy','N03.keys','N17.frozen','N14.proto','A00','A08','accepted',
    new String('busy'),new Proxy({},{get(){hooks++;throw Error('RAW_HOOK');}})]){assert.equal(a.id(id),false);invalid++;}
  return {valid:192,invalid,hooks};
}
// Independent fixed dictionary. Do not derive it from product selectors or emitted switch cases.
export const schemaFields=[
  'recovery root seed kind contextRecord contextAnchor context identity pin pinState pinFault handlersClaim handlersBusy handlersState handlersDetail handlersFault executorHandler fulfilledHandler rejectedHandler observerArgs readiness retention constructorClaim constructorState executorEntryClaim executor resolve reject candidateHeld candidateSafety candidate work registrationWork registrationReached observerClaim observerState observerBusy ackHeld ackState observerAckCandidate observerAck callbackClaim callbackState callbackFault observed terminal failureDrainClaim failureDrainState drainKind upperRecordAttempted upperRecordState notifyAttempted notifyState copyAttempted copyHeld runCopyState terminalCopy rejectPayloadAttempted rejectPayloadState rejectPayload settleClaim settleState ackTerminal dispatchStarted entered',
  'role claimed phase position fault pending published faultAt','notified status runGeneration cleanupGeneration preparation',
  'origin root run duty runJoin cleanupJoin','origin binding upper writer','root join window attempt record startClaimed',
  'root run join anchor record readerIdentity retention','root kind work resolver dispatchStarted entered settled','root kind work resolver dispatchStarted entered settled',
  'recovery root seed kind context','runtime identity basis','record anchor','anchor cleanupWork','binding','0 1 length','','','',''
].map(s=>s?s.split(' '):[]);
const order=[16,3,4,5,6,7,8,9,10,11,12,13,14,17,18,19,15,2,1];
export function verifyScanSchema(js,state){
  const a=deriveScanValues(js,state)();let columns=0,fields=0,refusals=0;
  const before=JSON.stringify(a.state());
  for(let i=0;i<19;i++){
    const id=node(i),expected={field_count:schemaFields[i].length,key_count:[3,13,14,17,18,19].includes(i+1)?-1:schemaFields[i].length,
      frozen:[5,6,7,8,9,10,11,12,14,15,16].includes(i+1),prototype:i===14?'array':i===15?'null':'none',
      role:[12,13,14].includes(i+1)?'cleanup':'both',kind:i>=16?'function':'object',order:order.indexOf(i+1)+1};
    for(const [key,value]of Object.entries(expected)){assert.equal(a.schema(id,key),value,id+'/'+key);columns++;}
    for(let p=1;p<=schemaFields[i].length;p++){assert.equal(a.field(id,p),schemaFields[i][p-1]);fields++;}
    for(const p of [0,-1,0.5,Infinity,NaN,undefined,'1',schemaFields[i].length+1]){assert.equal(a.field(id,p),null,id+'/'+String(p));refusals++;}
    assert.equal(a.schema(id,'unknown'),null);refusals++;
  }
  for(const id of ['N00','N20','n01',{},null]){assert.equal(a.schema(id,'field_count'),null);assert.equal(a.field(id,1),null);refusals+=2;}
  assert.equal(JSON.stringify(a.state()),before);return {columns,fields,refusals};
}
export function verifyScanCounters(js,state){
  const a=deriveScanValues(js,state)();let accepted=0,refused=0;
  for(const role of ['run','cleanup']){const limit=role==='run'?291:307;
    for(const effects of [0,1,limit-1,limit])for(const completed of [0,effects]){assert.equal(a.counter(role,effects,completed),true);accepted++;}
    for(const [effects,completed]of [[limit+1,0],[-1,0],[0,1],[1,-1],[1,2],[0.5,0],[1,0.5],[NaN,0],[Infinity,0],['1',0],[1,'0'],[{},0]]){
      assert.equal(a.counter(role,effects,completed),false);refused++;}
  }assert.equal(a.counter('foreign',0,0),false);refused++;return {accepted,refused};
}
export function verifyScanTotals(js,state){
  const a=deriveScanValues(js,state)(),result=[];
  for(const role of ['run','cleanup']){let objects=0,descriptors=0,exact=0,frozen=0,proto=0,keys=0,pairs=0,membership=0;
    for(let i=0;i<19;i++){const id=node(i);if(role==='run'&&a.schema(id,'role')==='cleanup')continue;
      objects++;descriptors+=a.schema(id,'field_count');const k=a.schema(id,'key_count');
      if(k>=0){exact++;keys+=k;pairs+=k*(k-1)/2;membership+=k*k;}if(a.schema(id,'frozen'))frozen++;if(a.schema(id,'prototype')!=='none')proto++;
    }
    const effects=descriptors*2+objects+exact+frozen+proto;result.push([descriptors,keys,pairs+membership,effects,effects+12]);
  }
  assert.deepEqual(result,[[126,121,6790,291,303],[131,123,6795,307,319]]);return {roles:2};
}
export function verifyScanControlCodes(js,state){
  const a=deriveScanValues(js,state)(),fixed={busy:'invalid_state',attempted:'invalid_state',composition:'invalid_state',scan_interrupted:'invalid_state',
    owner:'evidence_binding_mismatch',scan_context:'evidence_binding_mismatch',control:'internal_review_error',scan_state:'internal_review_error',scan_counter:'internal_review_error'};
  for(const id of expectedScanIds)assert.equal(a.controlCode(id),fixed[id]??null,id);
  assert.equal(a.controlCode({}),null);return {ids:192,fixed:9};
}
export function verifyScanGuards(js,state){
  const create=deriveScanValues(js,state);let accepted=0,refused=0,hooks=0;
  const proxy=new Proxy({},{get(){hooks++;throw Error('FOREIGN_HOOK');}});
  for(const role of ['run','cleanup']){
    const a=create(),entry=a.entry();assert.equal(a.guard(role,entry),false);refused++;a.active(role);assert.equal(a.guard(role,entry),true);accepted++;
    for(const root of [create().root,{...a.root},proxy]){assert.equal(a.guard(role,entry,root),false);refused++;}
    const bad=[['owner','none'],['owner',role==='run'?'cleanup':'run'],['interrupted',true],['attempted',false],['busy',false],['check','composition'],['code','invalid_state'],
      ['effects',role==='run'?292:308],['completed',1],['effects',NaN],['completed',0.5],['started',true],['primary','cancelled'],['revoked',true],['sealed',true],['current',{}]];
    for(const [key,value]of bad){const b=create(),prior=b.entry();b.active(role);b.fixture(role,key,value);const before={...b.state()};
      assert.equal(b.guard(role,prior),false,role+'/'+key);assert.deepEqual({...b.state()},before);refused++;}
    a.fixture(role,'effects',role==='run'?291:307);a.fixture(role,'completed',role==='run'?291:307);assert.equal(a.guard(role,entry),true);accepted++;
    // Unchanged stopped cleanup facts are an inspection input, not a new stop-event proof or run permit.
    const c=create();c.fixture(role,'primary','authentication_failed');c.fixture(role,'revoked',true);const same=c.entry();c.active(role);assert.equal(c.guard(role,same),true);accepted++;
    const d=create(),prior=d.entry();d.active(role);d.dropRecovery();assert.equal(d.guard(role,prior),false);refused++;
  }return {accepted,refused,hooks};
}
export function verifyScanInitial(js,state){
  const create=deriveScanValues(js,state);let cases=0;
  for(const role of ['run','cleanup']){const a=create(),b=create();assert.equal(a.initial(),true);
    assert.deepEqual({...a.state()},{owner:'none',interrupted:false,runEffects:0,runCompleted:0,cleanupEffects:0,cleanupCompleted:0});
    assert.equal(a.initial(b.root),false);const before={...a.state()};assert.equal(a.request(role),false);
    assert.equal(a.initial(),true);assert.deepEqual({...a.state()},before);assert.equal(b.flags().primary,null);cases++;
  }return {cases,scalars:6};
}
export function verifyScanInitialBoundaries(js,state){
  const create=deriveScanValues(js,state);let refused=0;
  for(const [role,key,value]of [['run','owner','run'],['run','interrupted',true],['run','effects',1],['run','completed',1],['cleanup','effects',1],['cleanup','completed',1]]){
    const a=create();a.fixture(role,key,value);const before={...a.state()};assert.equal(a.initial(),false,key);assert.deepEqual({...a.state()},before);refused++;}
  const missing=create();missing.dropRecovery();assert.equal(missing.initial(),false);refused++;
  const a=create();assert.equal(a.initial({...a.root}),false);refused++;return {refused};
}
function walk(n,visit,owner=''){
  if(n.type==='FunctionDeclaration')owner=n.id?.name??'';visit(n,owner);
  for(const v of Object.values(n)){if(Array.isArray(v)){for(const c of v)if(c?.type)walk(c,visit,owner);}else if(v?.type)walk(v,visit,owner);}
}
export function auditScanValues(js){
  const scalar=between(js,scalarBegin,scalarEnd),block=between(js,begin,end),declarations=[];
  walk(parse('function prior(){'+scalar+'}',{ecmaVersion:'latest'}),n=>{
    if(n.type==='VariableDeclarator'){assert.equal(n.id.type,'Identifier');assert.equal(n.init.type,'Literal');declarations.push([n.id.name,n.init.value]);}
    assert(!['CallExpression','NewExpression','ObjectExpression','ArrayExpression','MemberExpression','AssignmentExpression','UpdateExpression'].includes(n.type));
  });assert.deepEqual(declarations,[['joinScanOwner','none'],['joinScanInterrupted',false],['runScanEffectAttempts',0],['runScanLastCompleted',0],['cleanupScanEffectAttempts',0],['cleanupScanLastCompleted',0]]);
  const tree=parse('function closed(){'+block+'}',{ecmaVersion:'latest'}),calls=[];
  walk(tree,(n,owner)=>{
    assert(!['NewExpression','AwaitExpression','ImportExpression','ThrowStatement','ArrowFunctionExpression','FunctionExpression','ObjectExpression','ArrayExpression',
      'AssignmentExpression','UpdateExpression','MemberExpression','ForStatement','WhileStatement','DoWhileStatement','ForOfStatement','ForInStatement','TryStatement'].includes(n.type),'scan value capability');
    if(n.type==='CallExpression'){assert(n.callee.type==='Identifier'&&['joinScanNodeValue','joinScanCounterValue'].includes(n.callee.name),'scan value call');calls.push(n.callee.name+':'+owner);}
  });assert.deepEqual(calls,['joinScanNodeValue:joinScanSchemaValue','joinScanCounterValue:joinScanGuardPost','joinScanCounterValue:joinScanGuardPost']);
  const all=parse(js,{ecmaVersion:'latest',sourceType:'module'}),found=[],sourceNodes=[];
  walk(all,(n,owner)=>{
    sourceNodes.push([n,owner]);
    if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name.startsWith('joinScan'))found.push(n.callee.name+':'+owner);
    if(n.type==='AssignmentExpression'||n.type==='UpdateExpression')assert(!declarations.some(([name])=>n.left?.name===name||n.argument?.name===name),'scan scalar writer connected');
  });assert.deepEqual(found,calls,'operational scan caller');
  const propertyNames=obj=>obj.properties.map(p=>p.key.name??String(p.key.value));
  const sameKeys=(obj,expected)=>{const names=propertyNames(obj);assert.equal(names.length,expected.length);assert.equal(new Set(names).size,names.length);
    assert(names.every(k=>expected.includes(k)),'allocated schema drift');};
  const allocator=sourceNodes.find(([n])=>n.type==='FunctionDeclaration'&&n.id?.name==='allocateJoinShell')[0];
  sameKeys(allocator.body.body.find(n=>n.type==='ReturnStatement').argument,schemaFields[0]);
  const assignments={controlPreparation:3,controlRoot:4,controlRun:5,controlDuty:6,controlRunJoin:7,controlCleanupJoin:8};
  for(const [name,index]of Object.entries(assignments)){const entry=sourceNodes.find(([n])=>n.type==='VariableDeclarator'&&n.id.name===name)[0];
    let value=entry.init;while(value.type==='AssignmentExpression')value=value.right;assert.equal(value.type,'ObjectExpression');sameKeys(value,schemaFields[index]);}
  for(const [name,index,owners]of [['identity',9,['prepareRunShell','prepareCleanupShell']],['pin',10,['prepareRunShell','prepareCleanupShell']],['context',11,['prepareCleanupShell']]]){
    for(const owner of owners){const entry=sourceNodes.find(([n,o])=>o===owner&&n.type==='VariableDeclarator'&&n.id.name===name)[0];
      let value=entry.init;while(value.type==='AssignmentExpression')value=value.right;sameKeys(value,schemaFields[index]);}
  }
  const classifier=tree.body[0].body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='joinScanFailureIdValue'),ids=[];
  walk(classifier,n=>{if(n.type==='SwitchCase'&&n.test)ids.push(n.test.value);});
  assert.deepEqual(ids,expectedScanIds,'failure union drift');
  return {scalars:6,ids:192,internalCalls:3,operationalCallers:0};
}
export function verifyScanAuditNegatives(js){
  const block=between(js,begin,end);let rejected=0;
  for(const extra of ['const bad={};','const bad=[];','Promise.resolve();','jbGet({},"x");','for(;;){}','function open(){joinScanInitialPost(null);}',
    'runScanEffectAttempts=1;']){const changed=js.replace(block,block+'\n'+extra);parse(changed,{ecmaVersion:'latest',sourceType:'module'});assert.throws(()=>auditScanValues(changed),assert.AssertionError);rejected++;}
  const drift=changeFunction(js,'allocateJoinShell',original=>{assert.equal(original.split('recovery: joinRecovery,').length,2);return original.replace('recovery: joinRecovery,','');});
  assert.throws(()=>auditScanValues(drift),assert.AssertionError);return rejected+1;
}
export function verifyScanNoHooks(js,state){
  const a=deriveScanValues(js,state)();let hooks=0;
  const raw=new Proxy({},{get(){hooks++;throw Error('RAW_GET');},getPrototypeOf(){hooks++;throw Error('RAW_PROTO');}}),
    numeric={[Symbol.toPrimitive](){hooks++;throw Error('COERCION');}};
  for(const value of [raw,numeric])assert.doesNotThrow(()=>{assert.equal(a.id(value),false);assert.equal(a.schema(value,'field_count'),null);assert.equal(a.schema('N01',value),null);
    assert.equal(a.field(value,1),null);assert.equal(a.field('N01',value),null);assert.equal(a.counter('run',value,0),false);assert.equal(a.counter('cleanup',1,value),false);
    assert.equal(a.initial(value),false);assert.equal(a.guard('run',a.entry(),value),false);assert.equal(a.controlCode(value),null);});
  assert.equal(hooks,0);return {inputs:2,hooks};
}
function changeFunction(js,name,alter){
  const ast=parse(js,{ecmaVersion:'latest',sourceType:'module'});let fn;walk(ast,n=>{if(n.type==='FunctionDeclaration'&&n.id?.name===name){assert(!fn,'function ambiguity');fn=n;}});
  assert(fn,'function drift');const original=js.slice(fn.start,fn.end),replacement=alter(original,fn);assert.notEqual(replacement,original,'empty mutation');
  const changed=js.slice(0,fn.start)+replacement+js.slice(fn.end);parse(changed,{ecmaVersion:'latest',sourceType:'module'});return changed;
}
export const fieldMutations=schemaFields.flatMap((keys,i)=>keys.map((key,j)=>[node(i),j+1,key]));
export function verifyScanFieldMutant(js,state,index){
  const [id,pos]=fieldMutations[index];
  const changed=changeFunction(js,'joinScanFieldKey',original=>{
    const ast=parse(original,{ecmaVersion:'latest'}),outer=ast.body[0].body.body.find(n=>n.type==='SwitchStatement'),branch=outer.cases.find(n=>n.test?.value===id),
      target=branch.consequent.find(n=>n.type==='SwitchStatement').cases.find(n=>n.test?.value===pos).consequent[0].argument;
    return original.slice(0,target.start)+"'field_drift'"+original.slice(target.end);
  });assert.throws(()=>verifyScanSchema(changed,state),assert.AssertionError,id+'/'+pos+' escaped');
}
export const scanMutants=[
  ...['rawRoot === controlRoot','recovery === joinRecovery','joinScanOwner === none','joinScanInterrupted === false','runScanEffectAttempts === 0',
    'runScanLastCompleted === 0','cleanupScanEffectAttempts === 0','cleanupScanLastCompleted === 0'].map(from=>['initial '+from,'joinScanInitialPost',from,'true']),
  ['guard origin','joinScanGuardPost','rawRoot !== controlRoot','false'],
  ['guard recovery','joinScanGuardPost','recovery === joinRecovery','true'],
  ['owner','joinScanGuardPost','joinScanOwner === role','true'],
  ['interruption','joinScanGuardPost','joinScanInterrupted === false','true'],
  ...['run','cleanup'].flatMap(role=>[
    [role+' attempted','joinScanGuardPost',role+'PrecallAttempted === true','true'],[role+' busy','joinScanGuardPost',role+'PrecallBusy === true','true'],
    [role+' check','joinScanGuardPost',role+'PrecallRefusalCheck === null','true'],[role+' code','joinScanGuardPost',role+'PrecallRefusalCode === null','true']]),
  ...['started','primary','revoked','sealed','current'].map(k=>[k+' baseline','joinScanGuardPost',k+' === entry'+k[0].toUpperCase()+k.slice(1),'true']),
  ['run cap','joinScanCounterValue','? 291 : 307','? 292 : 307'],['cleanup cap','joinScanCounterValue','? 291 : 307','? 291 : 308'],
  ['prefix cap','joinScanCounterValue','completed <= effects','true'],
  ['effects type','joinScanCounterValue',"typeof effects === 'number'",'true'],
  ['completed type','joinScanCounterValue',"typeof completed === 'number'",'true'],
  ['field ordinal type','joinScanFieldKey',"typeof position !== 'number'",'false'],
  ...['busy','N01.D65','N19.proxy','N12.keys','N14.frozen','N16.proto','A07','scan_counter'].map(id=>[id+' omitted','joinScanFailureIdValue',"case '"+id+"':",'']),
];
export function verifyScanMutant(js,state,index){
  const [name,fn,from,to]=scanMutants[index],changed=changeFunction(js,fn,original=>{
    assert.equal(original.split(from).length-1,1,name+' drift');return original.replace(from,to);
  });
  assert.throws(()=>{auditScanValues(changed);verifyScanInitial(changed,state);verifyScanInitialBoundaries(changed,state);verifyScanIds(changed,state);verifyScanSchema(changed,state);
    verifyScanCounters(changed,state);verifyScanControlCodes(changed,state);verifyScanGuards(changed,state);verifyScanNoHooks(changed,state);},assert.AssertionError,name+' escaped');
}
