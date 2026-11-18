import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyExecutionSeed,seedFields,verifySeedField,verifySeedIdentity,verifySeedStop,auditExecutionSeed,seedMutants,verifySeedMutant,
  verifySeedFieldMutant,seedBoundaryMutants,verifySeedBoundaryMutant,verifySeedAuditNegatives,verifySeedDescriptorPrototype,verifySeedFailureWriters} from './native-join-execution-seed-model.mjs';

// Fixed dist only; no source/TS fallback, retained closure call, or injected runtime port.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyExecutionSeed(js,createNativeDiagnosticState),{roles:2,fields:25,constructorCalls:0,closureCalls:0,dispatch:0});
for(const key of Object.keys(seedFields)){
  assert.deepEqual(verifySeedField(js,createNativeDiagnosticState,key),{refusals:24,hooks:0});verifySeedFieldMutant(js,createNativeDiagnosticState,key);
}
assert.deepEqual(verifySeedIdentity(js,createNativeDiagnosticState),{refusals:24,hooks:0});
assert.deepEqual(verifySeedStop(js,createNativeDiagnosticState),{cases:11,constructorCalls:0,hooks:0});
assert.deepEqual(verifySeedDescriptorPrototype(js,createNativeDiagnosticState),{cases:2,hooks:0});
assert.deepEqual(verifySeedFailureWriters(js,createNativeDiagnosticState),{cases:8,hooks:0});
assert.deepEqual(auditExecutionSeed(js),{aliases:14,constructorCalls:0,closureCalls:0,dispatch:0});assert.equal(verifySeedAuditNegatives(js),7);
for(let i=0;i<seedMutants.length;i++)verifySeedMutant(js,createNativeDiagnosticState,i);
for(let i=0;i<seedBoundaryMutants.length;i++)verifySeedBoundaryMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinExecutionSeed','JoinFaultSite','executionSeedUnused','requestJoinExecution','joinExecutionFieldsUnused'])assert(!declarations.includes(name),'private seed contract escaped');
console.log('JR-B unused seed compiled: 25 fields / 600 refusals, 24 origins, 11 stop/prior controls, 2 descriptor-prototype controls, 8 strict failure-writer controls, 14 null aliases; '+(Object.keys(seedFields).length+seedMutants.length+seedBoundaryMutants.length)+' valid mutants; constructor/closure/observation/terminal/publication/dispatch 0 PASS');
