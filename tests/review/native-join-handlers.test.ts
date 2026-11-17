import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyHandlers,auditHandlers,verifyHandlerIdentity,verifyHandlerPrefixes,verifyHandlerPosts,verifyHandlerStops,verifyHandlerTuples,verifyHandlerClosedCalls,
  handlerMutants,verifyHandlerMutant,verifyHandlerAuditNegatives,end} from './fixtures/native-join-handlers-model.mjs';

const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
let js:string|undefined;
const emitted=()=>js??=ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
it('retains same-owner closures and one frozen tuple without calling closures or creating work',()=>{
  expect(verifyHandlers(emitted(),createNativeDiagnosticState)).toEqual({roles:2,functionsPerRole:3,tuplesPerRole:1,closureCalls:0,work:0,publication:0,dispatch:0});
  expect(auditHandlers(emitted())).toEqual({work:0,closureCalls:0,publication:0,dispatch:0});
});
it('rejects mixed identities and handler replacements without hooks and never regenerates after a duplicate attempt',()=>{
  expect(verifyHandlerIdentity(emitted(),createNativeDiagnosticState)).toEqual({entries:24,posts:48,reused:0,hooks:0});
});
it('retains all partial hold/freeze prefixes and the first failure without reacquiring handlers',()=>{
  expect(verifyHandlerPrefixes(emitted(),createNativeDiagnosticState)).toEqual({prefixes:24,regenerated:0,closureCalls:0});
});
it('uses distinct stage posts and rejects field, owner, stop, record and live-pin drift',()=>{
  expect(verifyHandlerPosts(emitted(),createNativeDiagnosticState)).toEqual({posts:64,entries:10,drifts:7,hooks:0});
});
it('stops at each retained prefix, keeps read-only cleanup and prevents a nested finally from stealing busy custody',()=>{
  expect(verifyHandlerStops(emitted(),createNativeDiagnosticState)).toEqual({stops:24,reentries:2,closureCalls:0});
});
it('rejects holes, extra keys, wrong order, prototype changes and accessors without invoking tuple hooks',()=>{
  expect(verifyHandlerTuples(emitted(),createNativeDiagnosticState)).toEqual({refusals:16,hooks:0});
});
it('refuses direct calls of every retained closure with a fixed primitive failure and keeps references and the first fault',()=>{
  expect(verifyHandlerClosedCalls(emitted(),createNativeDiagnosticState)).toEqual({calls:6,mismatches:2,hooks:0,settlers:0});
});
it.each(handlerMutants.map((m:unknown[],i:number)=>[m[0],i]))('rejects the syntactically valid handler %s mutation',(_name,index)=>{
  verifyHandlerMutant(emitted(),createNativeDiagnosticState,index as number);
});
it('keeps preparation uncalled by legacy callers and never calls a retained closure',()=>{
  const tree=ts.createSourceFile('root.ts',source(),ts.ScriptTarget.Latest,true),calls:string[][]=[];
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&['prepareJoinHandlers','preparedHandlersMatched'].includes(n.expression.text)){
    let parent:ts.Node|undefined=n.parent;while(parent&&!ts.isFunctionDeclaration(parent))parent=parent.parent;
    calls.push([n.expression.text,parent&&ts.isFunctionDeclaration(parent)?parent.name?.text??'':'']);
  }ts.forEachChild(n,visit);}visit(tree);
  expect(calls).toEqual([['preparedHandlersMatched','executionSeedUnused']]);
  expect(verifyHandlerAuditNegatives(emitted())).toBe(6);
});
it('keeps readonly tuple, finite stage/role and all future work/observation capabilities closed at the semantic boundary',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__join_handlers_types.ts',import.meta.url));
  const positive=`function positive(s:JoinRuntimeShell<'run'>){const executor:JoinExecutorHandler|null=s.executorHandler;const work:null=s.work;const off:false=s.observerClaim;void executor;void work;void off;}\n`;
  const bad=["function bad(s:JoinRuntimeShell<'cleanup'>){const r:JoinRuntimeShell<'run'>=s;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.handlersDetail='unknown';}",
    "function bad(s:JoinRuntimeShell<'run'>){s.handlersFault='unknown';}",
    "function bad(s:JoinRuntimeShell<'run'>){s.handlersState='published';}",
    "function bad(s:JoinRuntimeShell<'run'>){s.work=Promise.resolve();}",
    "function bad(s:JoinRuntimeShell<'run'>){s.executorHandler=()=>1;}",
    "function bad(args:JoinObserverArgs){args[0]=()=>undefined;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.observerClaim=true;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.dispatchStarted=true;}",
    "function bad(s:JoinRuntimeShell<'run'>){s.resolve=()=>undefined;}"];
  const extra=positive+bad.map(code=>'{'+code+'}').join('\n'),input=text.replace(end,extra+'\n'+end),
    options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
  const host=ts.createCompilerHost(options),get=host.getSourceFile;
  host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):get(file,language,...rest);
  const errors=ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));expect(errors).toHaveLength(bad.length);
  expect(errors.every(d=>d.file?.fileName===name&&[2322,2540].includes(d.code))).toBe(true);
  let start=text.indexOf(end)+positive.length;for(const code of bad){const finish=start+code.length+2;
    expect(errors.filter(d=>d.start!==undefined&&d.start>=start&&d.start<finish)).toHaveLength(1);start=finish+1;}
});
