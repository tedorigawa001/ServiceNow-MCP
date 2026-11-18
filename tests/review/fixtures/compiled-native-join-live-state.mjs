import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyLiveUnused,verifyLiveStages,verifyLiveFailure,verifyLiveBoundaries,verifyLiveMetadata,verifyLiveIdentity,verifyLiveClosedCalls,verifyLiveGuards,
  auditLiveState,verifyLiveAuditNegatives,liveMutants,verifyLiveMutant,verifyLiveRelations,verifyLiveStageLabels} from './native-join-live-state-model.mjs';

// Fixed dist only, strict scratch realm. Synthetic alias pinning is fixture-local, never a product issuer.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyLiveUnused(js,createNativeDiagnosticState),{roles:2,refusals:2});
assert.deepEqual(verifyLiveStages(js,createNativeDiagnosticState),{valid:52,refusals:260});
assert.deepEqual(verifyLiveFailure(js,createNativeDiagnosticState),{cases:6});
assert.deepEqual(verifyLiveBoundaries(js,createNativeDiagnosticState),{refusals:2236});
assert.deepEqual(verifyLiveMetadata(js,createNativeDiagnosticState),{cases:22,hooks:0});
assert.deepEqual(verifyLiveIdentity(js,createNativeDiagnosticState),{refusals:32});
assert.deepEqual(verifyLiveClosedCalls(js,createNativeDiagnosticState),{requests:2,closures:6});
assert.deepEqual(verifyLiveGuards(js,createNativeDiagnosticState),{refusals:10});
assert.deepEqual(verifyLiveRelations(js,createNativeDiagnosticState),{refusals:12});
assert.deepEqual(verifyLiveStageLabels(js,createNativeDiagnosticState),{accepted:79,refusals:701});
assert.deepEqual(auditLiveState(js),{writes:7,primitiveCalls:0,coldCalls:4});assert.equal(verifyLiveAuditNegatives(js),7);
for(let i=0;i<liveMutants.length;i++)verifyLiveMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinOperationalShell','JoinLivePostStage','joinLiveFieldPost','recordJoinExecutionFailure','holdJoinExecutionUnconfirmed'])assert(!declarations.includes(name),'private live contract escaped');
console.log('JR-B same-shell live posts: 52 prefixes / 15 stages; primitive failure 6, metadata 22, origin refusals 32; '+
  '30 valid mutants (29 behavioral / 1 writable-guard structural), 7 capability negatives; existing requests/closures closed; Promise/publication/dispatch 0 PASS');
