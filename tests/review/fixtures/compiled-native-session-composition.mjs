import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { probeNativeStatusComposition } from '../../../dist/review/abort-scope-evidence-native-diagnostic.js';
import { BoundedReadSession, takeNativeStatusCompositionProbe } from '../../../dist/servicenow/bounded-read.js';
const id = 'a'.repeat(32), bytes = new TextEncoder().encode(JSON.stringify({ result: { sys_id: id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-31', sys_mod_count: '0' } }));
const snapshot = () => ({ instanceUrl: 'https://synthetic.invalid', authMode: 'per-user', perUserBearerToken: 'PRIVATE_TOKEN', oauth: {} });
for (const status of [403, 404]) for (const body of [false, true]) {
    const stream = body ? new ReadableStream() : null;
    const r = await probeNativeStatusComposition(snapshot(), { update_set_sys_id: id }, { parent_bytes: bytes, response: new Response(stream, { status }) });
    assert.equal(r.ok, true); assert.equal(r.draft.release_permit, 'unavailable');
    assert.deepEqual(r.budget, { requests: 2, received_bytes: bytes.length, payload_bytes: 0 });
    assert.deepEqual(r.binding, { same_core: true, same_source: true });
    assert.equal(r.consumptions, 1); assert.equal(r.native.counts.consumed, 1); assert.equal(r.native.upper.sealed, true);
    assert(Object.values(r.draft.permissions).every(v => v === false)); assert(!JSON.stringify(r).includes('PRIVATE'));
    if (stream) assert.equal(stream.locked, false);
}
const r = await probeNativeStatusComposition(snapshot(), { update_set_sys_id: id }, { parent_bytes: bytes,
    response: new Response(new ReadableStream({ cancel() { throw Error('PRIVATE_CANCEL'); } }), { status: 401 }) });
assert.equal(r.code, 'authentication_failed'); assert.equal(r.native.upper.slots.release.cleanup.phase, 'unconfirmed');
assert.equal(r.native.counts.issued, 0); assert.equal(r.draft, null); assert(!JSON.stringify(r).includes('PRIVATE'));
assert.equal(Object.hasOwn(BoundedReadSession, 'probeNativeStatusComposition'), false);
assert.throws(() => takeNativeStatusCompositionProbe(), /internal_review_error/);
console.log('ND-03 compiled real session/source + injected resource + close/diagnostic retention PASS');
