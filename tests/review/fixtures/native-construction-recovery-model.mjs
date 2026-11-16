import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {types} from 'node:util';

const secret='PRIVATE_RECOVERY_FAULT';
const preparation=['controlOrigin','controlRoot','controlRunJoin','controlRun','controlCleanupJoin','controlDuty'];
export const recoveryCases=['anchor','state','bind','writer','facade',...preparation,'normal','identity','reject','stop','seal','copy','reenter_stop','reenter_close'];
function substitute(text,from,to){assert.equal(text.split(from).length-1,1,'fault anchor drift: '+from);return text.replace(from,to);}
function inFailure(code,from,to){
  const tree=parse('('+code+')',{ecmaVersion:'latest'}),fn=tree.body[0].expression.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='failConstruction');
  assert(fn);return code.slice(0,fn.start-1)+substitute(code.slice(fn.start-1,fn.end-1),from,to)+code.slice(fn.end-1);
}
function inModuleFailure(js,from,to){
  const node=parse(js,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='allocateNativeDiagnosticConstruction');
  assert(node);return js.slice(0,node.start)+inFailure(js.slice(node.start,node.end),from,to)+js.slice(node.end);
}
export function deriveRecovery(js,createNativeDiagnosticState,BoundedReadError,permissions,fault=null){
  const ast=parse(js,{ecmaVersion:'latest',sourceType:'module'}),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='allocateNativeDiagnosticConstruction');
  const data=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='data');assert(node&&data,'construction boundary drift');
  let code=js.slice(node.start,node.end),held;
  // Observe only the private test copy. Product code gets no installer, fault argument or exported anchor.
  const tree=parse('('+code+')',{ecmaVersion:'latest'}),body=tree.body[0].expression.body.body;
  const block=body.find(n=>n.type==='TryStatement'&&n.block.body.some(s=>s.type==='ExpressionStatement'&&s.expression.type==='AssignmentExpression'&&s.expression.left.name==='recovery'));
  assert(block);const assignment=block.block.body.find(s=>s.type==='ExpressionStatement'&&s.expression.type==='AssignmentExpression'&&s.expression.left.name==='recovery');
  const end=assignment.end-1;code=code.slice(0,end)+'capture(recovery);'+code.slice(end);
  if(fault==='anchor')code=substitute(code,'recovery = {',`throw '${secret}'; recovery = {`);
  if(fault==='state')code=substitute(code,'recovery.state = createNativeDiagnosticState();',`throw '${secret}'; recovery.state = createNativeDiagnosticState();`);
  if(fault==='bind')code=substitute(code,'recovery.state.owner.bind(recovery.state.binding);',`throw '${secret}'; recovery.state.owner.bind(recovery.state.binding);`);
  if(fault==='writer')code=substitute(code,"recovery.writer = recovery.state.owner.writers('release');",`throw '${secret}'; recovery.writer = recovery.state.owner.writers('release');`);
  if(fault==='facade')code=substitute(code,'Object.freeze(facade);',`throw '${secret}'; Object.freeze(facade);`);
  if(preparation.includes(fault)||['reject','stop','seal','copy','reenter_stop','reenter_close'].includes(fault)){
    const at=preparation.includes(fault)?fault:'controlOrigin',action=fault==='reenter_stop'?'capture().facade.stop();':fault==='reenter_close'?'capture().facade.close().catch(()=>{});':`throw '${secret}';`;
    code=substitute(code,`Object.freeze(${at});`,action+`Object.freeze(${at});`);
  }
  if(fault==='normal')code=substitute(code,'Object.freeze(normal);',`throw '${secret}'; Object.freeze(normal);`);
  if(fault==='final_identity')code=substitute(code,'Object.freeze(normal);','capture().preparation.root={...capture().preparation.root};Object.freeze(normal);');
  if(fault==='identity')code=substitute(code,'const controlOwnerMatched = sameControlOwner(controlRoot, controlRun, controlDuty, controlRunJoin, controlCleanupJoin);','const controlOwnerMatched = false;');
  if(fault==='reject')code=inFailure(code,'upper.reject(primary, stage);',`throw '${secret}'; upper.reject(primary, stage);`);
  if(fault==='stop')code=inFailure(code,'upper.stop(primary, stage);',`throw '${secret}'; upper.stop(primary, stage);`);
  if(fault==='seal')code=inFailure(code,'upper.seal();',`upper.seal(); throw '${secret}';`);
  if(fault==='copy')code=substitute(code,"a.copy = Object.freeze({",`throw '${secret}'; a.copy = Object.freeze({`);
  let joins=0;
  const capture=value=>{if(value)held=value;return held;};
  class ForbiddenJoin {constructor(){joins++;throw Error('JOIN_MUST_STAY_DISCONNECTED');}}
  const allocate=Function('createNativeDiagnosticState','BoundedReadError','permissions','types','P','capture',js.slice(data.start,data.end)+';return ('+code+');')(
    createNativeDiagnosticState,BoundedReadError,permissions,types,ForbiddenJoin,capture);
  return {allocate,held:()=>held,joins:()=>joins};
}
export async function verifyRecovery(js,createState,ErrorType,permissions){
  let read=0,schedule=0,scenarios=0;
  const raw=()=>({fake_io:true,deadline_ms:60000,budget:{read(){read++;return {remaining_ms:60000};}},schedule(){schedule++;return ()=>{};}});
  for(const fault of recoveryCases){
    const model=deriveRecovery(js,createState,ErrorType,permissions,fault);let construction;
    if(['anchor','state','bind','writer','facade'].includes(fault)){
      assert.throws(()=>model.allocate(raw()),e=>e instanceof ErrorType&&e.code==='internal_review_error');
      const held=model.held();if(fault==='anchor')assert.equal(held,undefined);else{assert(held);assert.equal(held.status,'failed');assert.equal(held.runPending,null);assert.equal(held.cleanupPending,null);}
    }else{
      construction=model.allocate(raw());const before=model.held();assert.equal(before.facade,construction.owner);assert.equal(before.status,'building');
      construction.initialize();assert.equal(construction.ready(),false);assert.equal(model.held(),before);assert.equal(before.status,'failed');
      assert.equal(before.runPending,null);assert.equal(before.cleanupPending,null);
      assert.equal(before.initializeClaim,true);
      if(['stop','seal','copy'].includes(fault)){
        assert.equal(before.copyPhase,'failed');assert.throws(()=>construction.owner.diagnostics(),e=>e.code==='internal_review_error');
        await assert.rejects(construction.owner.close(),e=>e.code==='internal_review_error');await assert.rejects(construction.owner.execute(),e=>e.code==='internal_review_error');
        const retained=before.preparation;await assert.rejects(construction.owner.close());assert.equal(before.preparation,retained);assert.equal(before.copyPhase,'failed');
      }else{
        let copy;assert.doesNotThrow(()=>{copy=construction.owner.diagnostics();});
        const reason=fault==='identity'?'evidence_binding_mismatch':fault==='reenter_stop'?'cancelled':fault==='reenter_close'?'closed':'internal_review_error';
        assert.equal(copy.upper.primary.code,reason);assert.equal(copy.phase,'closed');assert(copy.upper.sealed&&copy.upper.stopped);
        assert.equal(copy.upper.slots.release.http,null);assert.equal(copy.upper.slots.release.cleanup.phase,'not_started');assert.equal(copy.upper.teardown,'not_started');
        assert.deepEqual(Object.values(copy.operations),[0,0,0,0,0]);assert.deepEqual(Object.values(copy.counts),[0,0,0]);assert.equal(copy.token_held,false);
        assert(Object.values(copy.permissions).every(v=>v===false));assert(!JSON.stringify(copy).includes('PRIVATE'));
        assert.equal(await construction.owner.close(),copy);assert.equal(await construction.owner.close(),copy);assert.equal(await construction.owner.execute(),copy);
        construction.stop('cancelled');construction.initialize();assert.equal(construction.owner.diagnostics(),copy);
        assert.equal(construction.failureCode(),reason==='evidence_binding_mismatch'?'internal_review_error':reason);
      }
      const prefix=preparation.includes(fault)?preparation.indexOf(fault):fault==='reenter_stop'||fault==='reenter_close'||['reject','stop','seal','copy'].includes(fault)?0:5;
      assert(before.preparation,'lost preparation custody');assert.deepEqual(Object.values(before.preparation).map(v=>v!==null),preparation.map((_,i)=>i<=prefix));
      assert.equal(before.checkpoint,preparation.includes(fault)?['origin','root','runJoin','run','cleanupJoin','duty'][prefix]:['reenter_stop','reenter_close','reject','stop','seal','copy'].includes(fault)?'origin':'normal');
    }
    assert.equal(model.joins(),0);scenarios++;
  }
  for(const extra of ['recovery','failureCopy','initialize','bridge','joinRuntime']){
    const model=deriveRecovery(js,createState,ErrorType,permissions),construction=model.allocate({...raw(),[extra]:{}});construction.initialize();
    assert.equal(construction.owner.diagnostics().upper.primary.code,'invalid_input');scenarios++;
  }
  const model=deriveRecovery(js,createState,ErrorType,permissions),normal=model.allocate(raw());normal.initialize();assert(normal.ready());
  assert.deepEqual(Object.keys(normal.owner),['execute','stop','close','diagnostics']);assert(Object.isFrozen(normal.owner));
  assert.equal((await normal.owner.close()).upper.primary.code,'closed');assert(normal.ready());
  const second=deriveRecovery(js,createState,ErrorType,permissions).allocate(raw());second.initialize();assert.notEqual(second.owner,normal.owner);await second.owner.close();
  let notices=0;const mixed=deriveRecovery(js,createState,ErrorType,permissions,'controlDuty');let target;
  target=mixed.allocate(raw(),undefined,{stop(){notices++;target.owner.stop();throw Error(secret);}});target.initialize();
  const fixed=target.owner.diagnostics();assert.equal(fixed.upper.primary.code,'internal_review_error');assert.equal(await target.owner.close(),fixed);
  assert.equal(notices,1);assert.equal(mixed.held().notified,true);assert.equal(mixed.joins(),0);assert.equal(model.joins(),0);
  const final=deriveRecovery(js,createState,ErrorType,permissions,'final_identity'),post=final.allocate(raw());post.initialize();
  assert.equal(post.ready(),false);assert.equal(post.owner.diagnostics().upper.primary.code,'evidence_binding_mismatch');assert.equal(final.joins(),0);await post.owner.close();
  assert.equal(read,0);assert.equal(schedule,0);
  return Object.freeze({scenarios,bootstrap:5,partial:6,read,schedule,activeJoins:0,dispatches:0});
}

export async function verifyRecoveryMutants(js,createState,ErrorType,permissions){
  const mutants=[
    substitute(js,"if (a.copyPhase !== 'unused')","if (false)"),
    inModuleFailure(js,'primary ??= code;', 'primary = code;'),
    substitute(js,'recovery.preparation = {','{'),
    substitute(js,'upper.seal();\n            a.sealRecorded = true;', 'a.sealRecorded = true;'),
    substitute(js,'if (!a.notified)','if (false)'),
  ];
  // A missing construction post must not allow later slots after a reentrant stop.
  const guard=/if \(recovery\.status !== 'building'\)\s+throw 'construction_stopped';/g;
  assert.equal([...js.matchAll(guard)].length,8,'construction-post drift');mutants.push(js.replace(guard,''));
  for(const mutant of mutants){parse(mutant,{ecmaVersion:'latest',sourceType:'module'});await assert.rejects(()=>verifyRecovery(mutant,createState,ErrorType,permissions),e=>e instanceof assert.AssertionError);}
  return mutants.length;
}
