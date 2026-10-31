import assert from 'node:assert/strict';
import * as module from '../../../dist/review/abort-scope-evidence-native-diagnostic.js';
assert.deepEqual(Object.keys(module), ['createInjectedNativeDiagnosticWorkflow', 'probeNativeStatusComposition', 'runNativeDiagnosticFaultFixture', 'runSyntheticNativeDiagnosticFixture']);
const run = module.runSyntheticNativeDiagnosticFixture;
for (const scenario of ['unobserved', 'release_403', 'no_body', 'hard_cleanup', 'pending_late_success', 'sealed_writes', 'later_attempts', 'foreign_attempt']) {
    const r = run({ scenario });
    assert.equal(r.ok, true); assert.equal(r.diagnostic.sealed, true);
    assert.deepEqual(Object.keys(r.diagnostic.slots), ['authentication', 'parent', 'release']);
    assert(Object.values(r.permissions).every(v => v === false));
    assert.equal(r.foreign_unchanged, true);
    assert.equal(run(r).ok, false);
    assert(!JSON.stringify(r).includes('PRIVATE'));
}
const hard = run({ scenario: 'hard_cleanup' }).diagnostic;
assert.equal(hard.primary.code, 'authentication_failed');
assert.equal(hard.slots.release.http.status, 401);
assert.equal(hard.slots.release.cleanup.phase, 'unconfirmed');
const late = run({ scenario: 'sealed_writes' });
assert.deepEqual(late.late_results, Array(7).fill('late_ignored'));
assert.deepEqual(late.diagnostic, late.at_seal);
console.log('ND-01 compiled pure diagnostic owner PASS');
