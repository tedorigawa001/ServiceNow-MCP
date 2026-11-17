import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyRuntimePins,verifyRuntimeIdentity,verifyRuntimePrefixes,verifyRuntimeDrifts,auditRuntimePreparation,runtimePinMutants,verifyRuntimeMutant} from './native-join-runtime-pin-model.mjs';

// Fixed dist only. Fresh synthetic realms; no source fallback, runtime friend, Promise generation or native resource operation.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyRuntimePins(js,createNativeDiagnosticState),{roles:2,closedFields:23,work:0,observation:0,publication:0,dispatch:0});
assert.deepEqual(verifyRuntimeIdentity(js,createNativeDiagnosticState),{entries:32,post:30,hooks:0});
assert.deepEqual(verifyRuntimePrefixes(js,createNativeDiagnosticState),{prefixes:14,stops:2});
assert.deepEqual(verifyRuntimeDrifts(js,createNativeDiagnosticState),{refusals:16,hooks:0});
assert.deepEqual(auditRuntimePreparation(js),{constructorCalls:0,observerCalls:0,dispatches:0});
for(let i=0;i<runtimePinMutants.length;i++)verifyRuntimeMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinRuntimeShell','OwnerPromisePin','joinPromiseBasis','prepareRunShell','prepareCleanupShell','preparedShellMatched'])assert(!declarations.includes(name),'private contract escaped');
console.log('JR-B preparation compiled: 32 entry + 30 post refusals; 14 retained prefixes, 2 stop controls, 16 pin drifts, '+runtimePinMutants.length+' valid mutants; Promise/observation/publication/dispatch 0 PASS');
