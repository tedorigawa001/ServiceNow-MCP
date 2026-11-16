import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {derivePreparation,verifyPreparation,verifyPreparationMutants,verifyPartialPreparation} from './native-control-preparation-model.mjs';

// Fixed dist inputs only; no source/TypeScript fallback, runtime friend or native resource import.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyPreparation(derivePreparation(js,createNativeDiagnosticState)),{sameOwner:true,rejected:27,hooks:0,
  emptyJoins:2,activePromises:0,dispatches:0,resourceRecords:0,foreignUnchanged:true});
assert.equal(verifyPreparationMutants(js,createNativeDiagnosticState),9);
assert.equal(verifyPartialPreparation(js,createNativeDiagnosticState),6);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['RootControlLink','RunLink','ResourceDuty','EmptyJoinCell','sameControlOwner','controlPreparation'])assert(!declarations.includes(name),'private type escaped');
console.log('CF preparation compiled prefix: 27 refusals, 9 mutants, 6 retained prefixes; no active join/dispatch/resource and no private declaration export PASS');
