import assert from 'node:assert/strict';
import {parse} from 'acorn';

export const marker='// CF-PREP: empty control slots retained; dispatch remains disconnected.';
const names=['controlRoot','controlRun','controlDuty','controlRunJoin','controlCleanupJoin'];
export function preparationPrefix(js){
  const ast=parse(js,{ecmaVersion:'latest',sourceType:'module'});
  const creator=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='constructInjectedNativeDiagnosticWorkflow');
  assert(creator,'creator drift');assert.equal(js.split(marker).length-1,1,'boundary drift');
  const end=js.indexOf(marker);assert(end>creator.body.start&&end<creator.body.end);
  const prefix=js.slice(creator.body.start+1,end);
  // A closed prefix may allocate only local data, not a Promise, resource, scheduler or runtime port.
  const tree=parse('function prepare(){'+prefix+'}',{ecmaVersion:'latest',sourceType:'module'}),stack=[tree];
  const forbidden=new Set(['P','Promise','Date','performance','Response','ReadableStream','fetch','Worker','queueMicrotask','setTimeout','setInterval','WeakMap','WeakSet','takeNativeStatusCompositionProbe']);
  while(stack.length){const n=stack.pop();assert(!['ImportDeclaration','ImportExpression','ExportAllDeclaration','NewExpression','AwaitExpression'].includes(n.type),'open preparation prefix');
    if(n.type==='Identifier')assert(!forbidden.has(n.name),'preparation capability');
    for(const v of Object.values(n)){if(Array.isArray(v))stack.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')stack.push(v);}}
  return prefix;
}
export function derivePreparation(js,createNativeDiagnosticState){
  const prefix=preparationPrefix(js);
  // Test-only lexical probe: no product export or runtime registration is added.
  return Function('createNativeDiagnosticState',`return function prepare(){${prefix}
    return {parts:[${names.join(',')}],holder:controlPreparation,origin:controlOrigin,
      check:sameControlOwner,matched:controlOwnerMatched,upper};
  }`)(createNativeDiagnosticState);
}
export function verifyPreparation(create){
  const a=create(),b=create(),copyBefore=JSON.stringify(b.upper.snapshot());
  assert.equal(a.matched,true);assert.equal(b.matched,true);assert.equal(a.check(...a.parts),true);
  assert.notEqual(a.origin,b.origin);assert.notEqual(a.parts[0].binding,b.parts[0].binding);
  assert.deepEqual(Object.keys(a.holder),['origin','root','runJoin','run','cleanupJoin','duty']);
  assert.deepEqual(Object.keys(a.parts[0]),['origin','binding','upper','writer']);
  assert.deepEqual(Object.keys(a.parts[1]),['root','join','window','attempt','record','startClaimed']);
  assert.deepEqual(Object.keys(a.parts[2]),['root','run','join','anchor','record','readerIdentity','retention']);
  assert.deepEqual(Object.keys(a.parts[3]),['root','kind','work','resolver','dispatchStarted','entered','settled']);
  assert.deepEqual(Object.keys(a.parts[4]),Object.keys(a.parts[3]));
  for(const part of [a.origin,...a.parts])assert(Object.isFrozen(part));
  const [root,run,duty,runJoin,cleanupJoin]=a.parts;
  assert.equal(root.origin,a.origin);assert.equal(root.upper,a.upper);assert.equal(run.root,root);assert.equal(run.join,runJoin);
  assert.equal(duty.root,root);assert.equal(duty.run,run);assert.equal(duty.join,cleanupJoin);
  assert.deepEqual([run.window,run.attempt,run.record,run.startClaimed],[null,null,null,false]);
  assert.deepEqual([duty.anchor,duty.record,duty.readerIdentity,duty.retention],[null,null,undefined,'empty']);
  for(const [cell,kind] of [[runJoin,'run'],[cleanupJoin,'cleanup']]){
    assert.equal(cell.root,root);assert.equal(cell.kind,kind);
    assert.deepEqual([cell.work,cell.resolver,cell.dispatchStarted,cell.entered,cell.settled],[null,null,false,false,false]);
  }
  let rejected=0,hooks=0;
  for(let i=0;i<5;i++)for(const value of [b.parts[i],{...a.parts[i]},new Proxy({},{get(){hooks++;throw Error('PRIVATE_HOOK');},ownKeys(){hooks++;throw Error('PRIVATE_HOOK');}})]){
    const args=[...a.parts];args[i]=value;assert.equal(a.check(...args),false);rejected++;
  }
  const revoked=Proxy.revocable({},{});revoked.revoke();
  for(let i=0;i<5;i++){const args=[...a.parts];args[i]=revoked.proxy;assert.equal(a.check(...args),false);rejected++;}
  for(const key of Object.keys(a.holder)){
    const own=a.holder[key];a.holder[key]=b.holder[key];assert.equal(a.check(...a.parts),false);a.holder[key]=own;
    assert.equal(a.check(...a.parts),true);rejected++;
  }
  Object.assign(a.holder,b.holder);assert.equal(a.check(...b.parts),false);rejected++;
  assert.equal(hooks,0);assert.equal(JSON.stringify(b.upper.snapshot()),copyBefore);
  assert.equal(a.upper.snapshot().primary,null);assert.equal(b.upper.snapshot().primary,null);
  return Object.freeze({sameOwner:true,rejected,hooks,emptyJoins:2,activePromises:0,dispatches:0,resourceRecords:0,foreignUnchanged:true});
}

export function verifyPreparationMutants(js,createState){
  const prefix=preparationPrefix(js),tree=parse('function prepare(){'+prefix+'}',{ecmaVersion:'latest',sourceType:'module'});
  const checker=tree.body[0].body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='sameControlOwner');
  assert(checker);const from=checker.body.start-'function prepare(){'.length,to=checker.body.end-'function prepare(){'.length;
  const normalCheck=prefix.slice(from,to),anchors=[
    ['always_true',normalCheck,'{return true;}'],
    ['holder_as_identity',normalCheck,'{return root===controlPreparation.root&&run===controlPreparation.run&&duty===controlPreparation.duty&&runJoin===controlPreparation.runJoin&&cleanupJoin===controlPreparation.cleanupJoin;}'],
    ['not_frozen','Object.freeze(controlDuty);',''],
    ['wrong_kind',"kind: 'run'","kind: 'cleanup'"],
  ];
  const mutants=anchors.map(([label,anchor,replacement])=>{
    assert.equal(prefix.split(anchor).length-1,1,label+' drift');const start=prefix.indexOf(anchor);
    return [label,start,start+anchor.length,replacement];
  });
  for(const name of names){
    const arg=({controlRoot:'root',controlRun:'run',controlDuty:'duty',controlRunJoin:'runJoin',controlCleanupJoin:'cleanupJoin'})[name],found=[],stack=[checker.body];
    while(stack.length){const n=stack.pop();if(n.type==='BinaryExpression'&&n.operator==='!=='&&n.left.type==='Identifier'&&n.left.name===arg&&n.right.type==='Identifier'&&n.right.name===name)found.push(n);
      for(const v of Object.values(n)){if(Array.isArray(v))stack.push(...v.filter(x=>x&&typeof x.type==='string'));else if(v&&typeof v==='object'&&typeof v.type==='string')stack.push(v);}}
    assert.equal(found.length,1,'reference AST drift');mutants.push(['reference_'+name,found[0].start-'function prepare(){'.length,found[0].end-'function prepare(){'.length,'false']);
  }
  for(const [label,start,end,replacement] of mutants){
    const changed=js.replace(prefix,prefix.slice(0,start)+replacement+prefix.slice(end));
    assert.throws(()=>verifyPreparation(derivePreparation(changed,createState)),assert.AssertionError,label);
  }
  return mutants.length;
}

export function verifyPartialPreparation(js,createState){
  const prefix=preparationPrefix(js),wrap='function prepare(){',tree=parse(wrap+prefix+'}',{ecmaVersion:'latest',sourceType:'module'});
  const statements=tree.body[0].body.body;
  const holder=statements.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='controlPreparation'));
  const freezes=statements.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.type==='MemberExpression'&&n.expression.callee.object.name==='Object'&&n.expression.callee.property.name==='freeze');
  assert(holder);assert.equal(freezes.length,6);const before=prefix.slice(0,holder.end-wrap.length),start=holder.end-wrap.length;
  const keys=['origin','root','runJoin','run','cleanupJoin','duty'];
  for(let i=0;i<6;i++){
    const body=prefix.slice(start,freezes[i].start-wrap.length);
    // Only the scratch consumer catches this fixed interruption. Product recovery is still disconnected.
    const run=Function('createNativeDiagnosticState',`return function(){${before}
      try {${body}throw 'PRIVATE_FIXED_INTERRUPTION';}catch{
        return {held:Object.keys(controlPreparation).map(k=>controlPreparation[k]!==null),
          frozen:Object.keys(controlPreparation).map(k=>controlPreparation[k]!==null&&Object.isFrozen(controlPreparation[k])),
          native:upper.snapshot().slots.release.http};
      }
    }`)(createState);
    const r=run();assert.deepEqual(r.held,keys.map((_,n)=>n<=i));assert.deepEqual(r.frozen,keys.map((_,n)=>n<i));assert.equal(r.native,null);
  }
  return freezes.length;
}
