import assert from 'node:assert/strict';
import * as module from '../../../dist/review/abort-scope-evidence-construction-shell.js';
assert.deepEqual(Object.keys(module), ['runConstructionShellFixture']);
const run = module.runConstructionShellFixture;
for (const scenario of ['empty', 'source_bound', 'unknown_resource', 'wrong_release_owner', 'foreign_core', 'foreign_source', 'sealed_late', 'first_reason']) {
    const r = run({ scenario }); assert.equal(r.ok, true);
    assert.equal(r.foreign_unchanged, true); assert.equal(r.diagnostic.counts.shells, 1);
    assert(Object.values(r.permissions).every(v => v === false)); assert(!JSON.stringify(r).includes('PRIVATE'));
    assert.equal(run(r).ok, false);
}
const bound = run({ scenario: 'source_bound' }).diagnostic;
assert.deepEqual(bound.counts, { shells: 1, core_bindings: 1, source_bindings: 1, commits: 1 });
assert.equal(bound.resources.core.owner, 'session');
const late = run({ scenario: 'sealed_late' });
assert.deepEqual(late.late_results, Array(7).fill('late_ignored')); assert.deepEqual(late.diagnostic, late.at_seal);
assert.equal(run({ scenario: 'unknown_resource' }).diagnostic.teardown, 'unconfirmed');
console.log('EF-01 compiled pure construction shell: one-shot binding/resource metadata; no registration or authority PASS');
