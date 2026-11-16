import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {createInjectedNativeDiagnosticWorkflow} from '../../src/review/abort-scope-evidence-native-diagnostic.js';
import {deriveGeneration,verifyGeneration,verifyGenerationIdentity,verifyGenerationPhases,verifyGenerationMutants,generationParts,end} from './fixtures/native-join-generation-model.mjs';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const source=()=>readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
const emitted=()=>ts.transpileModule(source(),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;

it('keeps field-first role slots, one-shot claims, stopped run refusal and stopped cleanup qualification separate',()=>{
  expect(verifyGeneration(deriveGeneration(emitted(),createNativeDiagnosticState))).toEqual({refusals:27,slots:2,work:0,publication:0,dispatch:0});
});
it('rejects every foreign/copy/hooked/revoked-Proxy reference before supplied field reads without foreign writes',()=>{
  expect(verifyGenerationIdentity(deriveGeneration(emitted(),createNativeDiagnosticState))).toEqual({refusals:32,hooks:0});
});
it('checks role-specific half captures and every phase while rejecting impossible variants without authority',()=>{
  expect(verifyGenerationPhases(deriveGeneration(emitted(),createNativeDiagnosticState))).toBe(121);
});
it('detects syntactically valid owner/qualification/claim/diagnosis/phase mutations with the independent oracle',()=>{
  expect(verifyGenerationMutants(emitted(),createNativeDiagnosticState)).toBe(11);
});
it('does not construct a Promise, dispatch, read a budget/clock, allocate a resource or invoke an injected operation',()=>{
  const js=emitted(),forbidden=vi.fn(()=>{throw Error('PRIVATE_GENERATION_CAPABILITY');});
  try {
    for(const key of ['Promise','queueMicrotask','setTimeout','Response','ReadableStream','fetch','Worker'])vi.stubGlobal(key,forbidden);
    vi.spyOn(Date,'now').mockImplementation(forbidden);vi.spyOn(performance,'now').mockImplementation(forbidden);
    const create=deriveGeneration(js,createNativeDiagnosticState);verifyGeneration(create);verifyGenerationIdentity(create);verifyGenerationPhases(create);
    expect(forbidden).not.toHaveBeenCalled();
  } finally {vi.restoreAllMocks();vi.unstubAllGlobals();}
});
it('retains claims and generation position through a partial failure, close flags and repeated refusal',()=>{
  const a=deriveGeneration(emitted(),createNativeDiagnosticState)();expect(a.run()).toBe(true);
  a.failRun('internal_review_error');a.set({revoked:true,sealed:true,primary:'authentication_failed'});
  const before={...a.runSlot};expect(a.run()).toBe(false);expect(a.runSlot).toEqual(before);
  expect(a.flags().primary).toBe('authentication_failed');expect(a.held().run).toBeNull();expect(a.held().cleanup).toBeNull();
  expect(a.upper().slots.release.http).toBeNull();expect(a.upper().slots.release.cleanup.phase).toBe('not_started');
});
it.each(['runGeneration','cleanupGeneration','joinRuntime','generationSlot'])('adds no caller adoption field %s',async key=>{
  const read=vi.fn(()=>({remaining_ms:60000})),schedule=vi.fn(()=>()=>{});
  const owner=createInjectedNativeDiagnosticWorkflow({fake_io:true,deadline_ms:60000,budget:{read},schedule,[key]:{}} as never);
  const result=await owner.execute(null,null);expect(result.upper.primary?.code).toBe('invalid_input');
  expect(Object.values(result.operations)).toEqual([0,0,0,0,0]);expect(read).not.toHaveBeenCalled();expect(schedule).not.toHaveBeenCalled();
});
it('keeps the private continuations uncalled in the product and the legacy four-method surface unchanged',async()=>{
  generationParts(emitted());
  const ast=ts.createSourceFile('root.ts',source(),ts.ScriptTarget.Latest,true),calls:string[]=[];
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression))calls.push(n.expression.text);ts.forEachChild(n,visit);}visit(ast);
  for(const name of ['beginRunGeneration','beginCleanupGeneration','joinRuntimePhaseValid'])expect(calls).not.toContain(name);
  const read=vi.fn(()=>({remaining_ms:60000})),schedule=vi.fn(()=>()=>{});
  const owner=createInjectedNativeDiagnosticWorkflow({fake_io:true,deadline_ms:60000,budget:{read},schedule});
  expect(Object.keys(owner)).toEqual(['execute','stop','close','diagnostics']);expect((await owner.close()).counts.issued).toBe(0);
  expect(read).not.toHaveBeenCalled();expect(schedule).not.toHaveBeenCalled();
});
it('keeps strict roles, contexts, half-pairs, phase prefixes and null publication at the semantic boundary',()=>{
  const text=source(),name=fileURLToPath(new URL('../../src/review/__jr_private_types.ts',import.meta.url));
  const compile=(extra:string)=>{
    const input=text.replace(end,extra+'\n'+end),options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
      moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
    const host=ts.createCompilerHost(options),original=host.getSourceFile;
    host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,input,language,true):original(file,language,...rest);
    return ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));
  };
  const positive=`const identity=null! as JoinIdentity<'run'>;
    const base={identity,kind:'run' as const,dispatchStarted:false as const,entered:false as const,settleClaim:false,fault:null,
      candidate:null,work:null,resolve:null,reject:null,observerAck:null};
    const building:JoinRuntime<'run'>={...base,phase:'building',prefix:'runtime',executor:'not_entered'};
    const half:JoinRuntime<'run'>={...base,phase:'capturing',prefix:'reject',executor:'running',reject:()=>{}};
    void building;void half;`;
  const bad=["const x:RoleGenerationSlot<'run'>=cleanupGeneration;",
    "const x:JoinIdentity<'run'>={recovery:joinRecovery,root:controlRoot,seed:controlRun,kind:'run',context:{record:current!,anchor:current!.anchor}};",
    "runGeneration.published={};",'runGeneration.role="cleanup";',
    "const x:JoinRuntime<'cleanup'>={identity:null!,kind:'cleanup',phase:'capturing',prefix:'reject',executor:'running',candidate:null,work:null,resolve:null,reject:()=>{},observerAck:null,dispatchStarted:false,entered:false,settleClaim:false,fault:null};",
    "const x:JoinRuntime<'run'>={identity:null!,kind:'run',phase:'checked',prefix:'published',executor:'normal_exit',candidate:null!,work:null!,resolve:()=>{},reject:()=>{},observerAck:null!,dispatchStarted:false,entered:false,settleClaim:false,fault:null};",
    "const x:JoinRuntime<'run'>={identity:null!,kind:'run',phase:'captured',prefix:'resolve',executor:'normal_exit',candidate:null,work:null,resolve:()=>{},reject:null,observerAck:null,dispatchStarted:false,entered:false,settleClaim:false,fault:null};",
    "const x:RoleGenerationSlot<'run'>={role:'run',claimed:true,phase:'empty',position:'empty',fault:null,pending:null,published:null};"];
  // One semantic program checks both positives and all separately scoped negatives; no repeated transpile/import loop.
  const extra=positive+'\n'+bad.map(code=>'{'+code+'}').join('\n'),diagnostics=compile(extra);
  expect(diagnostics).toHaveLength(bad.length);
  expect(diagnostics.every(d=>d.file?.fileName===name&&d.start!==undefined&&d.start>=text.indexOf(end))).toBe(true);
  expect(diagnostics.every(d=>[2322,2540].includes(d.code))).toBe(true);
  let start=text.indexOf(end)+positive.length+1;
  for(const code of bad){const finish=start+code.length+2;
    expect(diagnostics.filter(d=>d.start!>=start&&d.start!<finish)).toHaveLength(1);start=finish+1;}
});
