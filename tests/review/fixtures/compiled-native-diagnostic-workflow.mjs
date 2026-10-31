import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { createInjectedNativeDiagnosticWorkflow as create, runNativeDiagnosticFaultFixture } from '../../../dist/review/abort-scope-evidence-native-diagnostic.js';
const input = () => ({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, schedule: () => () => {} });
const window = { purpose: 'release', ordinal: 1, window_origin_ms: 60000, cleanup_floor_ms: 50000 };
for (const status of [403, 404]) for (const body of [true, false]) {
    const stream = body ? new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('PRIVATE_BODY')); } }) : null;
    const owner = create(input()); assert.equal(owner.diagnostics().upper.binding, 'bound');
    const r = await owner.execute(new Response(stream, { status }), window);
    assert.deepEqual(r.counts, { issued: 1, consume_attempts: 1, consumed: 1 });
    assert.equal(r.operations.read, 0); assert.equal(r.upper.sealed, true); assert.equal(r.token_held, false);
    assert.equal(r.upper.slots.release.cleanup.native.kind, body ? 'cancelled' : 'no_body');
    if (stream) assert.equal(stream.locked, false);
    assert(!JSON.stringify(r).includes('PRIVATE')); assert(Object.values(r.permissions).every(v => v === false));
    assert.equal((await owner.execute(new Response(null, { status }), window)).request_rejected, 'invalid_state');
}
for (const scenario of ['copy_terminal', 'foreign_terminal', 'copy_cleanup', 'foreign_anchor']) {
    const r = await runNativeDiagnosticFaultFixture({ scenario });
    assert.equal(r.ok, true); assert.equal(r.diagnostic.counts.consumed, 0);
    assert.equal(r.diagnostic.upper.refusal.code, 'evidence_binding_mismatch'); assert.equal(r.diagnostic.foreign_unchanged, true);
}
const failed = await create(input()).execute(new Response(new ReadableStream({ cancel() { throw Error('PRIVATE_CANCEL'); } }), { status: 401 }), window);
assert.equal(failed.upper.primary.code, 'authentication_failed');
assert.equal(failed.upper.slots.release.cleanup.phase, 'unconfirmed'); assert.equal(failed.counts.issued, 0);
assert(!JSON.stringify(failed).includes('PRIVATE'));
console.log('ND-02 compiled injected native issuer -> sole consumer -> sealed upper diagnostics PASS');
