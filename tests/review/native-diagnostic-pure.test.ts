import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {cases,checkCase} from './fixtures/native-diagnostic-pure-oracle.mjs';
import {runSyntheticNativeDiagnosticFixture as run} from '../../src/review/abort-scope-evidence-native-diagnostic-pure-fixture.js';
import {createNativeDiagnosticState} from '../../src/review/abort-scope-evidence-native-diagnostic-state.js';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.doUnmock('../../src/servicenow/bounded-read.js');});

it.each(cases)('checks the independent $scenario oracle without a runtime friend',expected=>{checkCase(run,expected);});

it('keeps the oracle sensitive to reason, ordinal, acceptance and public-shape drift',()=>{
  expect(cases).toHaveLength(43);expect(new Set(cases.map(x=>x.scenario)).size).toBe(43);
  for(const changed of [
    {scenario:'hard_cleanup',status:401,classification:'hard',cleanup:'unconfirmed',reason:'cancel_rejected',primary:'cancelled',primaryStage:'stop'},
    {scenario:'ordinal_limit',status:503,classification:'other',later:208,refusal:'invalid_state',refusalStage:'header'},
    {scenario:'release_403',status:403,accepted:false},
  ])expect(()=>checkCase(run,changed)).toThrow();
  expect(()=>checkCase(raw=>({...run(raw),window:{}}),cases[0])).toThrow();
});

it('imports and runs with runtime registration, clocks, native constructors and transport unavailable',async()=>{
  vi.resetModules();
  vi.doMock('../../src/servicenow/bounded-read.js',()=>{throw Error('RUNTIME_IMPORT_FORBIDDEN');});
  const forbidden=vi.fn(()=>{throw Error('PRIVATE_SIDE_EFFECT');});
  vi.spyOn(performance,'now').mockImplementation(forbidden);vi.spyOn(Date,'now').mockImplementation(forbidden);
  vi.spyOn(Date.prototype,'toISOString').mockImplementation(forbidden);
  for(const name of ['Response','ReadableStream','AbortController','fetch','Worker'])vi.stubGlobal(name,forbidden);
  const pure=await import('../../src/review/abort-scope-evidence-native-diagnostic-pure-fixture.js');
  expect(Object.keys(pure)).toEqual(['runSyntheticNativeDiagnosticFixture']);
  for(const row of cases)checkCase(pure.runSyntheticNativeDiagnosticFixture,row);
  expect(forbidden).not.toHaveBeenCalled();
});

it('rejects external identities, accessors and proxies without invoking supplied hooks',()=>{
  let reads=0;const proxy=Proxy.revocable({},{});proxy.revoke();
  const bad=[null,undefined,[],'unobserved',{}, {scenario:'unknown'}, {scenario:'unobserved',owner:{}},
    {scenario:'unobserved',callback(){reads++;}}, {scenario:'unobserved',[Symbol()]:true},Object.create({scenario:'unobserved'}),
    {get scenario(){reads++;throw Error('PRIVATE_GETTER');}},new Proxy({},{ownKeys(){reads++;throw Error('PRIVATE_PROXY');}}),proxy.proxy];
  for(const raw of bad)expect(run(raw)).toMatchObject({ok:false,code:'invalid_input'});
  expect(reads).toBe(0);
});

it('creates only fresh local state, refuses foreign bindings once and keeps sealed copies stable',()=>{
  const first=createNativeDiagnosticState(),second=createNativeDiagnosticState();
  expect(first.binding).not.toBe(second.binding);expect(first.binding.session).not.toBe(second.binding.session);
  expect(first.owner.bind(second.binding)).toBe('rejected');expect(first.owner.bind(first.binding)).toBe('rejected');
  first.owner.seal();const sealed=first.owner.snapshot();
  expect(sealed.refusal?.code).toBe('evidence_binding_mismatch');expect(first.owner.stop('cancelled','stop')).toBe('late_ignored');
  expect(first.owner.snapshot()).toBe(sealed);expect(second.owner.bind(second.binding)).toBe('bound');
  second.owner.seal();expect(second.owner.snapshot().refusal).toBeNull();
});

it('keeps the old four-export wrapper on the same pure implementation',async()=>{
  const pure=await import('../../src/review/abort-scope-evidence-native-diagnostic-pure-fixture.js');
  const legacy=await import('../../src/review/abort-scope-evidence-native-diagnostic.js');
  expect(Object.keys(legacy)).toEqual(['createInjectedNativeDiagnosticWorkflow','probeNativeStatusComposition','runNativeDiagnosticFaultFixture','runSyntheticNativeDiagnosticFixture']);
  expect(legacy.runSyntheticNativeDiagnosticFixture).toBe(pure.runSyntheticNativeDiagnosticFixture);
});

function audit(text:string,allowed:readonly string[]){
  const ast=ts.createSourceFile('pure.ts',text,ts.ScriptTarget.Latest,true),denied=new Set(['globalThis','process','require','Date','performance','fetch','Response','ReadableStream','Worker','AbortController','setTimeout','setInterval','setImmediate','queueMicrotask','eval','Function']);
  const visit=(n:ts.Node)=>{
    if(ts.isImportDeclaration(n))expect(allowed).toContain((n.moduleSpecifier as ts.StringLiteral).text);
    if(ts.isExportDeclaration(n))expect(n.moduleSpecifier).toBeUndefined();
    if(ts.isCallExpression(n))expect(n.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
    if(ts.isIdentifier(n))expect(denied.has(n.text)).toBe(false);
    ts.forEachChild(n,visit);
  };visit(ast);
}

it('keeps the fixed pure dependency closure and detects seeded import or capability leaks',()=>{
  const state=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic-state.ts',import.meta.url),'utf8');
  const fixture=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic-pure-fixture.ts',import.meta.url),'utf8');
  const allowed=['node:util','./abort-scope-evidence-native-diagnostic-state.js'];audit(state,[]);audit(fixture,allowed);
  for(const leak of ["import '../servicenow/bounded-read.js';","export * from '../servicenow/bounded-read.js';","import('node:fs');",'globalThis.fetch("x");','Date.now();','new Response();','setTimeout(()=>{},0);'])
    expect(()=>audit(fixture+'\n'+leak,allowed)).toThrow();
});

it('does not add the pure layers to packaged runtime roots or remove the existing package exclusion',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  expect(pkg.files).toContain('!dist/review/abort-scope-evidence*');
  for(const file of ['../../src/servicenow/bounded-read.ts','../../src/review/bounded-source.ts','../../src/review/update-set-adapter.ts']){
    const text=readFileSync(new URL(file,import.meta.url),'utf8');
    expect(text).not.toContain('abort-scope-evidence-native-diagnostic-state');expect(text).not.toContain('abort-scope-evidence-native-diagnostic-pure-fixture');
  }
});
