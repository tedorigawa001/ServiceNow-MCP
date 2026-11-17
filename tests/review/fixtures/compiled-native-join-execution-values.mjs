import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyUnusedValues,verifyValueStages,verifyValueBoundaries,verifyOriginLeaf,auditExecutionValues,verifyValueAuditNegatives,
  valueMutants,verifyValueMutant,verifyValuesHaveNoAuthority} from './native-join-execution-values-model.mjs';

// Fixed dist only. Scratch projections have no constructor, observer, settler or runtime writer.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyUnusedValues(js,createNativeDiagnosticState),{roles:2});
assert.deepEqual(verifyValueStages(js,createNativeDiagnosticState),{valid:44,refusals:938});
assert.deepEqual(verifyValueBoundaries(js,createNativeDiagnosticState),{valid:20,refusals:92});
assert.deepEqual(verifyOriginLeaf(js,createNativeDiagnosticState),{own:6,refusals:41,hooks:0});
assert.deepEqual(auditExecutionValues(js),{calls:2,originCalls:0,writes:0});assert.equal(verifyValueAuditNegatives(js),6);
assert.deepEqual(verifyValuesHaveNoAuthority(js,createNativeDiagnosticState),{requests:2,closures:6});
for(let i=0;i<valueMutants.length;i++)verifyValueMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinExecutionValue','JoinExecutionInspection','JoinExecutionAliases','joinExecutionOriginLeaf','joinExecutionValuePost'])assert(!declarations.includes(name),'private inspection escaped');
console.log('JR-B execution values: 8 variants / 64 valid values, 1030 value refusals, 41 origin refusals, 6 retained origins; '+
  '28 mutants / 6 capability negatives; request 2 and closure 6 fixed refusals; Promise/publication/dispatch 0 PASS');
