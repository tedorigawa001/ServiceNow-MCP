import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyScanInitial,verifyScanIds,verifyScanSchema,verifyScanCounters,verifyScanControlCodes,verifyScanGuards,verifyScanNoHooks,
  auditScanValues,verifyScanAuditNegatives,fieldMutations,verifyScanFieldMutant,scanMutants,verifyScanMutant,verifyScanTotals,verifyScanInitialBoundaries} from './native-join-scan-values-model.mjs';

// Fixed dist, strict same-creator scratch. No product fixture registry, writer or scan entry is introduced.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyScanInitial(js,createNativeDiagnosticState),{cases:2,scalars:6});
assert.deepEqual(verifyScanInitialBoundaries(js,createNativeDiagnosticState),{refused:8});
assert.deepEqual(verifyScanIds(js,createNativeDiagnosticState),{valid:192,invalid:77,hooks:0});
assert.deepEqual(verifyScanSchema(js,createNativeDiagnosticState),{columns:133,fields:131,refusals:181});
assert.deepEqual(verifyScanTotals(js,createNativeDiagnosticState),{roles:2});
assert.deepEqual(verifyScanCounters(js,createNativeDiagnosticState),{accepted:16,refused:25});
assert.deepEqual(verifyScanControlCodes(js,createNativeDiagnosticState),{ids:192,fixed:9});
assert.deepEqual(verifyScanGuards(js,createNativeDiagnosticState),{accepted:6,refused:42,hooks:0});
assert.deepEqual(verifyScanNoHooks(js,createNativeDiagnosticState),{inputs:2,hooks:0});
assert.deepEqual(auditScanValues(js),{scalars:6,ids:192,internalCalls:3,operationalCallers:0});
assert.equal(verifyScanAuditNegatives(js),8);
for(let i=0;i<fieldMutations.length;i++)verifyScanFieldMutant(js,createNativeDiagnosticState,i);
for(let i=0;i<scanMutants.length;i++)verifyScanMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinScan','joinScan','runScanEffectAttempts','cleanupScanEffectAttempts'])assert(!declarations.includes(name),'private scan value contract leaked');
console.log('JR-B closed scan values: 192 IDs / 19 nodes / 131 keys / 6 initial scalars; '+fieldMutations.length+' key and '+scanMutants.length+
  ' valid control mutants; 8 capability/schema negatives; native operations/writers/scan/aliases/Promise/publication/dispatch 0 PASS');
