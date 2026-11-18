import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';
import {derivePreparation,verifyPreparation,verifyPreparationMutants,verifyPartialPreparation} from './fixtures/native-control-preparation-model.mjs';
import {createInjectedNativeDiagnosticWorkflow as create} from '../../src/review/abort-scope-evidence-native-diagnostic.js';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function emitted(){return ts.transpileModule(readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;}

it('retains the same-owner empty control preparation before dependency inspection',()=>{
  const text=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
  // The first tracer fixes the closed preparation boundary, not a new operational entry.
  expect(text).toContain('// CF-PREP: empty control slots retained; dispatch remains disconnected.');
  const ast=ts.createSourceFile('root.ts',text,ts.ScriptTarget.Latest,true);
  expect(ast.parseDiagnostics).toHaveLength(0);
});

it('detects removal of each stable reference gate, mutable-holder trust, wrong kind and missing freeze',()=>{
  expect(verifyPreparationMutants(emitted(),createNativeDiagnosticState)).toBe(9);
});

it('retains all six partial-generation prefixes without representing them as product failure recovery',()=>{
  expect(verifyPartialPreparation(emitted(),createNativeDiagnosticState)).toBe(6);
});

it('does not create a Promise, timer, native operation or clock read in the extracted preparation',()=>{
  const js=emitted(),forbidden=vi.fn(()=>{throw Error('PRIVATE_OPERATION');});
  try {
    for(const key of ['Promise','queueMicrotask','setTimeout','Response','ReadableStream','fetch','Worker'])vi.stubGlobal(key,forbidden);
    vi.spyOn(Date,'now').mockImplementation(forbidden);vi.spyOn(performance,'now').mockImplementation(forbidden);
    expect(verifyPreparation(derivePreparation(js,createNativeDiagnosticState)).activePromises).toBe(0);
    expect(forbidden).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

it('keeps the actual legacy constructor and close free of dependency reads before execution',async()=>{
  const read=vi.fn(()=>({remaining_ms:60000})),schedule=vi.fn(()=>()=>{});
  const owner=create({fake_io:true,deadline_ms:60000,budget:{read},schedule});
  expect(Object.keys(owner)).toEqual(['execute','stop','close','diagnostics']);
  expect(owner.diagnostics().upper.binding).toBe('bound');expect(owner.diagnostics().operations).toEqual({get_reader:0,closed:0,cancel:0,release_lock:0,read:0});
  const closed=await owner.close();expect(closed.upper.primary?.code).toBe('closed');expect(closed.counts.issued).toBe(0);
  expect(read).not.toHaveBeenCalled();expect(schedule).not.toHaveBeenCalled();
});

it.each(['controlPreparation','rootControlLink','resourceDuty','joinCell'])('does not add a caller adoption input for %s',async key=>{
  const read=vi.fn(()=>({remaining_ms:60000})),schedule=vi.fn(()=>()=>{});
  const owner=create({fake_io:true,deadline_ms:60000,budget:{read},schedule,[key]:{}} as never);
  const result=await owner.execute(undefined,undefined);
  expect(result.upper.primary?.code).toBe('invalid_input');expect(result.counts.issued).toBe(0);
  expect(Object.values(result.operations)).toEqual([0,0,0,0,0]);expect(read).not.toHaveBeenCalled();expect(schedule).not.toHaveBeenCalled();
});

it('keeps run/cleanup kinds, null work and empty duty narrow and readonly at the semantic type boundary',()=>{
  const text=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('root.ts',text,ts.ScriptTarget.Latest,true);let fn!:ts.FunctionDeclaration;
  function find(n:ts.Node){if(ts.isFunctionDeclaration(n)&&n.name?.text==='initializeLegacyWorkflow')fn=n;ts.forEachChild(n,find);}find(ast);
  const prefix=text.slice(fn.body!.getStart(ast)+1,text.indexOf('// CF-PREP:'));
  // The prior primitive refusal slots refer to these private finite types; keep the extracted prefix's type context intact.
  const priorTypes=ast.statements.filter((n):n is ts.TypeAliasDeclaration=>ts.isTypeAliasDeclaration(n)&&['JoinPrecallCheck','JoinGenerationFault'].includes(n.name.text));
  expect(priorTypes).toHaveLength(2);
  const name=fileURLToPath(new URL('./__cf-private-types.ts',import.meta.url));
  const head="import {createNativeDiagnosticState,type Binding} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';\n"+
    priorTypes.map(n=>n.getText(ast)).join('\n')+'\nexport function prepare(){'+
    "const state=createNativeDiagnosticState();state.owner.bind(state.binding);const recovery:{state:typeof state;writer:ReturnType<typeof state.owner.writers>;preparation?:object;checkpoint?:string;status:'building'|'ready'|'failed'}={state,writer:state.owner.writers('release'),status:'building'};"+prefix;
  const compile=(extra:string)=>{
    const source=head+extra+'\nreturn controlOwnerMatched;}',options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true};
    const host=ts.createCompilerHost(options),get=host.getSourceFile;
    host.getSourceFile=(file,language,...rest)=>file===name?ts.createSourceFile(file,source,language,true):get(file,language,...rest);
    return ts.getPreEmitDiagnostics(ts.createProgram([name],options,host));
  };
  expect(compile('')).toHaveLength(0);
  const bad=["const badKind:EmptyJoinCell<'run'>=controlCleanupJoin;","const badWork:EmptyJoinCell<'run'>={...controlRunJoin,work:Promise.resolve()};",
    "const badFlag:EmptyJoinCell<'run'>={...controlRunJoin,dispatchStarted:true};","const badDuty:ResourceDuty={...controlDuty,record:{}};",
    'controlRunJoin.work=null;',"controlDuty.retention='empty';"].join('\n');
  const diagnostics=compile(bad);expect(diagnostics.map(d=>d.code)).toEqual([2719,2322,2322,2322,2540,2540]);
  const kindMessage=ts.flattenDiagnosticMessageText(diagnostics[0].messageText,' ');
  expect(kindMessage).toContain("Types of property 'kind' are incompatible");expect(kindMessage).toContain('"cleanup"');expect(kindMessage).toContain('"run"');
  expect(diagnostics.every(d=>d.file?.fileName===name&&d.start!==undefined&&d.start>=head.length)).toBe(true);
});

it('rejects copied, foreign and revoked-Proxy links before input hooks while keeping both joins empty',()=>{
  const source=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  expect(verifyPreparation(derivePreparation(js,createNativeDiagnosticState))).toEqual({sameOwner:true,rejected:27,hooks:0,
    emptyJoins:2,activePromises:0,dispatches:0,resourceRecords:0,foreignUnchanged:true});
});
