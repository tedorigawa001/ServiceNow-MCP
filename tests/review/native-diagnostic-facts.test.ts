import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {nativeCleanupReason} from '../../src/review/abort-scope-evidence-native-diagnostic-facts.js';
import * as kernel from '../../src/review/abort-scope-evidence-native-diagnostic-facts.js';
import {verifyNativeFacts,verifyOracleNegatives} from './fixtures/native-diagnostic-facts-oracle.mjs';
import {auditFactsJS,verifyFactsAuditNegatives} from './fixtures/native-diagnostic-facts-audit.mjs';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('keeps unknown reader ownership ahead of cancel rejection and the wait deadline',()=>{
  expect(nativeCleanupReason(true,{reader_owned:false,closed_captured:true,read_started:false,read_pending:false,
    cancel:'rejected',closed:'rejected'},'failed','cleanup_deadline')).toBe('reader_owner_unknown');
});

it('matches the independent finite reason and eligibility oracle',()=>{
  expect(verifyNativeFacts(nativeCleanupReason,kernel.nativeCleanupFactsEligible)).toEqual({reasonCases:5760,eligibilityCases:752});
});

it('rejects distinguishable priority and eligibility mutants while classifying the disjoint cancel exchange as equivalent',()=>{
  expect(verifyOracleNegatives(nativeCleanupReason,kernel.nativeCleanupFactsEligible)).toEqual({rejected:7,equivalent:1});
});

it('keeps confirmed no-body cleanup separate from body ownership and rejects a wait issue',()=>{
  const facts={reader_owned:true,closed_captured:true,read_started:false,read_pending:false,
    cancel:'not_applicable',closed:'not_applicable',release:'not_applicable'} as const;
  const cleanup={disposition:'confirmed',kind:'no_body',reason:null,wait_issue:null,facts} as const;
  const operations={get_reader:0,closed:0,cancel:0,release_lock:0,read:0};
  expect(kernel.nativeCleanupFactsEligible(false,cleanup,operations)).toBe(true);
  expect(kernel.nativeCleanupFactsEligible(false,{...cleanup,wait_issue:'cleanup_deadline'},operations)).toBe(false);
});

it('has only the type-only state dependency and rejects seeded runtime, timer, native and registry leaks',()=>{
  const text=readFileSync(new URL('../../src/review/abort-scope-evidence-native-diagnostic-facts.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('facts.ts',text,ts.ScriptTarget.Latest,true),imports=ast.statements.filter(ts.isImportDeclaration);
  expect(imports).toHaveLength(1);expect(imports[0].importClause?.isTypeOnly).toBe(true);
  expect((imports[0].moduleSpecifier as ts.StringLiteral).text).toBe('./abort-scope-evidence-native-diagnostic-state.js');
  const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  auditFactsJS(js);expect(verifyFactsAuditNegatives(js)).toBe(9);
});

it('runs the value kernel without clocks, native constructors, transport or mutable registries',async()=>{
  vi.resetModules();const forbidden=vi.fn(()=>{throw Error('PRIVATE_CAPABILITY');});
  vi.spyOn(Date,'now').mockImplementation(forbidden);vi.spyOn(performance,'now').mockImplementation(forbidden);
  for(const key of ['Response','ReadableStream','fetch','Worker'])vi.stubGlobal(key,forbidden);
  const fresh=await import('../../src/review/abort-scope-evidence-native-diagnostic-facts.js');
  expect(Object.keys(fresh).sort()).toEqual(['nativeCleanupFactsEligible','nativeCleanupReason']);
  expect(verifyNativeFacts(fresh.nativeCleanupReason,fresh.nativeCleanupFactsEligible)).toEqual({reasonCases:5760,eligibilityCases:752});
  expect(forbidden).not.toHaveBeenCalled();
});
