import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {deriveGeneration,verifyGeneration,verifyGenerationIdentity,verifyGenerationPhases,verifyGenerationMutants} from './native-join-generation-model.mjs';

// Fixed dist only: no source fallback, product friend, native operation, runtime registration or Promise generation.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
const create=deriveGeneration(js,createNativeDiagnosticState);
assert.deepEqual(verifyGeneration(create),{refusals:27,slots:2,work:0,publication:0,dispatch:0});
assert.deepEqual(verifyGenerationIdentity(create),{refusals:32,hooks:0});
const phases=verifyGenerationPhases(create);assert.equal(phases,121);
assert.equal(verifyGenerationMutants(js,createNativeDiagnosticState),12);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const privateName of ['JoinRuntime','RoleGenerationSlot','JoinIdentity','beginRunGeneration','beginCleanupGeneration','joinRuntimePhaseValid'])
  assert(!declarations.includes(privateName),'private contract escaped');
console.log('JR-A compiled: 27 qualification refusals, 32 identity refusals, '+phases+' phase cases, 12 mutants; Promise/publication/dispatch 0 PASS');
