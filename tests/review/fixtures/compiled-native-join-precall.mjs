import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeDiagnosticState} from '../../../dist/review/abort-scope-evidence-native-diagnostic-state.js';
import {verifyPrecallInitial,verifyPrecallOnce,verifyPrecallSlots,verifyPrecallOrigins,verifyPrecallReentry,verifyPrecallMetadata,
  verifyPrecallCustody,auditPrecall,verifyPrecallAuditNegatives,precallMutants,verifyPrecallMutant,verifyPrecallSlotDomains} from './native-join-precall-model.mjs';

// Only fixed dist text enters the strict synthetic realm; no product friend or registry is exposed.
const js=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.js',import.meta.url),'utf8');
assert.deepEqual(verifyPrecallInitial(js,createNativeDiagnosticState),{roles:2});
assert.deepEqual(verifyPrecallOnce(js,createNativeDiagnosticState),{cases:2,descriptors:10});
assert.deepEqual(verifyPrecallSlots(js,createNativeDiagnosticState),{cases:36,hooks:0});
assert.deepEqual(verifyPrecallOrigins(js,createNativeDiagnosticState),{cases:34,hooks:0});
assert.deepEqual(verifyPrecallReentry(js,createNativeDiagnosticState),{cases:2,reentries:10});
assert.deepEqual(verifyPrecallMetadata(js,createNativeDiagnosticState),{cases:20,hooks:0});
assert.deepEqual(verifyPrecallCustody(js,createNativeDiagnosticState),{cases:135,hooks:0});
assert.deepEqual(verifyPrecallSlotDomains(js,createNativeDiagnosticState),{cases:14});
assert.deepEqual(auditPrecall(js),{scalars:8,descriptors:3,writableGuards:3,entryCallers:0});
assert.equal(verifyPrecallAuditNegatives(js),6);
for(let i=0;i<precallMutants.length;i++)verifyPrecallMutant(js,createNativeDiagnosticState,i);
const declarations=readFileSync(new URL('../../../dist/review/abort-scope-evidence-native-diagnostic.d.ts',import.meta.url),'utf8');
for(const name of ['JoinPrecallCheck','requestJoinPrecall','recordJoinPrecallRefusal','reflectJoinPrecallFailure','PrecallAttempted'])
  assert(!declarations.includes(name),'private pre-call contract escaped');
console.log('JR-B pre-call refusal: 8 prior scalars; first refusal, 3+2 descriptor bound, same-owner custody; '+
  precallMutants.length+' valid mutants; 6 capability negatives; all-field admission/aliases/Promise/publication/dispatch 0 PASS');
