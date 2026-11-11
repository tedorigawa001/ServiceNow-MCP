import { describe, expect, it } from 'vitest';
import { createProbeBodySourceIssuerFake } from './fixtures/snapshot-read-composition-fake.js';

// Independent semantic prefix oracle, not imported from the implementation schedule.
const points = [
  ...['before', 'after'].map(b => ['BP00', 'before', b]), ['BP00', 'attempt', 'before'], ['BP00', 'issued', 'after'],
  ...Array.from({ length: 9 }, (_, i) => i).flatMap(i => ['before', 'after'].map(b => ['BP00', 'fix_' + i, b])),
  ...['sealed', 'captured'].flatMap(p => ['before', 'after'].map(b => ['BP00', p, b])),
  ...['before', 'checked', 'after'].flatMap(p => ['before', 'after'].map(b => ['BP01', p, b])),
];
function prefix(phase: string, step: string, boundary: string) {
  const attempted = phase === 'BP01' || !['before', 'attempt'].includes(step);
  const confirmed = phase === 'BP01' && step === 'after' && boundary === 'after';
  const captured = phase === 'BP01' || step === 'captured' && boundary === 'after';
  const hardened = captured || step === 'captured' || step === 'sealed' && boundary === 'after';
  const count = phase === 'BP01' || ['sealed', 'captured'].includes(step) ? 9
    : step.startsWith('fix_') ? Number(step.slice(4)) + Number(boundary === 'after') : 0;
  return { attempted, confirmed, captured, count, stage: confirmed ? 'confirmed' : captured ? 'captured' : hardened ? 'hardened' : attempted ? 'issued' : 'not_started' };
}
function finite(value: unknown) {
  const q = [value]; let size = 0;
  while (q.length) {
    const v = q.pop(); expect(++size).toBeLessThan(300);
    if (v === null || typeof v !== 'object') { expect(['number', 'boolean', 'string']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}

describe('BP00/01 synthetic source issuer with synchronous stop', () => {
  it('confirms the same root source without issuing a pin, consuming a claim or creating BC data', () => {
    const a = createProbeBodySourceIssuerFake();
    expect(a.inspect().source.state).toBe('not_created');
    expect(a.prepare()).toMatchObject({ model: 'wfb-body-source-issuer-1', disposition: 'source_held_unpinned', first: 'none', ok: false });
    const s = a.inspect();
    expect(s).toMatchObject({ state: 'held', stage: 'confirmed', phase: 'BP01', step: 'after', boundary: 'after',
      creationAttempted: true, fixedCount: 9, metadataConfirmed: true, rootReady: false, stopRequested: false,
      failureRecorded: false, failurePhase: 'none', first: 'none', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold',
      source: { state: 'initializing', claim: 'unused', phase: 'BP01', boundary: 'after', first: 'none', stopRequested: false,
        pinCallReached: false, bindCallReached: false, postConfirmed: false, issuedRetained: true, currentRetained: true,
        rejectedRetained: false, sameReference: true },
      storage: { retained: true, confirmed: true, state: 'building', carrierCount: 13, dataCreated: 0 },
      receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free', bindingState: 'empty' },
      pin: 'not_connected', claimConsumption: 'not_connected', binding: 'not_connected', constructionReady: 'not_connected',
      bodyStarts: 0, grantAttempts: 0, dutyUsed: false });
    expect(s.receiver.references.every(r => !r.retained)).toBe(true);
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('not_ready');
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
  });
  it('retains an unconfirmed source and cached first failure while a later close still records root stop', () => {
    const a = createProbeBodySourceIssuerFake('si_fault_BP00_issued_after'), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed');
    expect(a.inspect()).toMatchObject({ stage: 'issued', fixedCount: 0, creationAttempted: true, metadataConfirmed: false,
      failureRecorded: true, failurePhase: 'BP00', failureStep: 'issued', failureBoundary: 'after', stopRequested: false,
      source: { state: 'unconfirmed', claim: 'unconfirmed', issuedRetained: true, currentRetained: false, stopMirrored: false } });
    expect(a.close()).toBe(r);
    expect(a.inspect()).toMatchObject({ first: 'construction_unconfirmed', stopRequested: true, stopFirst: 'closed',
      failurePhase: 'BP00', failureStep: 'issued', source: { state: 'unconfirmed', stopMirrored: false }, hookCalls: 0 });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it('preserves a confirmed source failure while close synchronously updates stop without replacing the reply', () => {
    const a = createProbeBodySourceIssuerFake('si_fault_BP01_after_after'), r = a.prepare();
    expect(a.inspect()).toMatchObject({ metadataConfirmed: true, first: 'construction_unconfirmed',
      source: { state: 'failed', first: 'construction_unconfirmed', failurePhase: 'BP01', failureBoundary: 'after', stopRequested: false } });
    expect(a.close()).toBe(r);
    expect(a.inspect()).toMatchObject({ stopRequested: true, source: { state: 'failed', first: 'construction_unconfirmed',
      failurePhase: 'BP01', failureBoundary: 'after', stopRequested: true, stopMirrored: true, claim: 'unused' } });
    expect(a.close()).toBe(r); finite(a.inspect());
  });
  it.each(points)('preserves the first prefix at %s/%s/%s without raw reads', (phase, step, boundary) => {
    const a = createProbeBodySourceIssuerFake('si_fault_' + [phase, step, boundary].join('_')), r = a.prepare(), p = prefix(phase, step, boundary);
    expect(r.first).toBe('construction_unconfirmed'); expect(a.inspect()).toMatchObject({ state: 'failed', stage: p.stage,
      creationAttempted: p.attempted, fixedCount: p.count, metadataConfirmed: p.confirmed,
      failurePhase: phase, failureStep: step, failureBoundary: boundary, hookCalls: 0,
      source: { issuedRetained: p.attempted, currentRetained: p.captured, rejectedRetained: false,
        state: p.confirmed ? 'failed' : p.attempted ? 'unconfirmed' : 'not_created' },
      rootReady: false, bodyStarts: 0, grantAttempts: 0, dutyUsed: false });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().source.stopMirrored).toBe(p.confirmed); finite(a.inspect());
  });
  it.each(points)('stops at %s/%s/%s without confirming an unknown source', (phase, step, boundary) => {
    const a = createProbeBodySourceIssuerFake('si_close_' + [phase, step, boundary].join('_')), r = a.prepare(), p = prefix(phase, step, boundary);
    expect(r.first).toBe('closed'); expect(a.inspect()).toMatchObject({ stopRequested: true, fixedCount: p.count,
      stage: p.stage, metadataConfirmed: p.confirmed, source: { stopMirrored: p.confirmed }, rootReady: false });
    expect(a.prepare()).toBe(r); finite(a.inspect());
  });
  it.each(points)('rejects reentry at %s/%s/%s without a second construction', (phase, step, boundary) => {
    const a = createProbeBodySourceIssuerFake('si_reenter_' + [phase, step, boundary].join('_'));
    expect(a.prepare().disposition).toBe('source_held_unpinned');
    expect(a.inspect()).toMatchObject({ reentry: 'construction_in_progress', fixedCount: 9, creationAttempted: true,
      first: 'none', rootReady: false, source: { claim: 'unused' } }); finite(a.inspect());
  });
  it('keeps a producer throw as attempted but unobserved and never retries it', () => {
    const a = createProbeBodySourceIssuerFake('si_producer_throw'), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed'); expect(a.inspect()).toMatchObject({ creationAttempted: true,
      stage: 'attempting', fixedCount: 0, metadataConfirmed: false, source: { state: 'not_created', issuedRetained: false, currentRetained: false } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().stopRequested).toBe(true);
  });
  it('rejects foreign metadata without promoting or touching the unconfirmed source during close', () => {
    const a = createProbeBodySourceIssuerFake('si_mix_custodian'), r = a.prepare();
    expect(r.first).toBe('binding_mismatch'); expect(a.inspect()).toMatchObject({ metadataConfirmed: false,
      source: { state: 'unconfirmed', issuedRetained: true, currentRetained: true, rejectedRetained: true } });
    expect(a.close()).toBe(r); expect(a.inspect()).toMatchObject({ hookCalls: 0, stopRequested: true, source: { stopMirrored: false } });
  });
  it.each(['brand', 'custodian', 'construction', 'binding', 'link', 'duty', 'control', 'start', 'rootFailure',
    'state', 'claim', 'pinCallReached', 'bindCallReached', 'stopRequested', 'postConfirmed', 'phase', 'boundary', 'first',
    'failurePhase', 'failureBoundary', 'refusal', 'deliveryFirst', 'extra', 'prototype'])('rejects malformed source field %s', field => {
    const a = createProbeBodySourceIssuerFake('si_mix_' + field), r = a.prepare();
    expect(r.first).toBe('binding_mismatch'); expect(a.inspect()).toMatchObject({ fixedCount: 9, metadataConfirmed: false,
      stage: 'captured', failurePhase: 'BP01', failureStep: 'before', failureBoundary: 'before',
      source: { state: 'unconfirmed', claim: 'unconfirmed', issuedRetained: true, currentRetained: true, rejectedRetained: true } });
    expect(a.close()).toBe(r); expect(a.inspect()).toMatchObject({ hookCalls: 0, source: { stopMirrored: false } }); finite(a.inspect());
  });
  it.each(['copy', 'proxy', 'missing_claim', 'getter_first', 'unsealed', 'frozen'])('rejects %s with unconfirmed custody and no hooks', script => {
    const a = createProbeBodySourceIssuerFake('si_' + script), r = a.prepare();
    expect(r.first).toBe('binding_mismatch'); expect(a.inspect().source.rejectedRetained).toBe(true);
    expect(a.inspect().source.sameReference).toBe(!['copy', 'proxy'].includes(script));
    expect(a.close()).toBe(r); expect(a.check()).toBe(r); expect(a.inspect()).toMatchObject({ stopRequested: true, hookCalls: 0,
      metadataConfirmed: false, source: { state: 'unconfirmed', stopMirrored: false } }); finite(a.inspect());
  });
  it('refuses a second private issue without replacing the normal source or consuming a claim', () => {
    const a = createProbeBodySourceIssuerFake('si_duplicate_after');
    expect(a.prepare().disposition).toBe('source_held_unpinned'); expect(a.inspect()).toMatchObject({ first: 'none', issueRefusal: 'duplicate_creation',
      creationAttempted: true, fixedCount: 9, source: { state: 'initializing', sameReference: true, claim: 'unused' } });
  });
  it('does not retry after a retained failure even though the source claim was never consumed', () => {
    const a = createProbeBodySourceIssuerFake('si_retry_after_failure'), r = a.prepare();
    expect(r.first).toBe('state_invalid'); expect(a.inspect()).toMatchObject({ stage: 'issued', issueRefusal: 'duplicate_creation', fixedCount: 0,
      source: { state: 'unconfirmed', issuedRetained: true, currentRetained: false } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it.each(Array.from({ length: 15 }, (_, i) => ['BS' + String(i).padStart(2, '0'), i] as const)
    .flatMap(([phase, i]) => ['before', 'attempt', 'retained', 'done'].map((boundary, b) => [phase, i, boundary, b] as const)))(
    'keeps source uncalled across storage %s/%i/%s', (phase, i, boundary, b) => {
      for (const mode of ['fault', 'close', 'reenter']) {
        const a = createProbeBodySourceIssuerFake('s_' + mode + '_' + phase + '_' + boundary), r = a.prepare();
        if (mode === 'reenter') {
          expect(r.disposition).toBe('source_held_unpinned'); expect(a.inspect().storage.reentry).toBe('construction_in_progress');
        } else {
          expect(r.first).toBe(mode === 'close' ? 'closed' : 'construction_unconfirmed');
          expect(a.inspect()).toMatchObject({ stage: 'not_started', creationAttempted: false, metadataConfirmed: false,
            storage: { phase, boundary, retained: i > 0 || b >= 2, confirmed: false },
            source: { state: 'not_created', issuedRetained: false, currentRetained: false } });
          expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
        }
        finite(a.inspect());
      }
    });
  it('keeps pre-start close unissued and normal close synchronously failed without issuing authority', () => {
    const before = createProbeBodySourceIssuerFake(); expect(before.close().first).toBe('none');
    expect(before.prepare().disposition).toBe('closed'); expect(before.inspect()).toMatchObject({ creationAttempted: false, stopRequested: true,
      source: { state: 'not_created', stopMirrored: false } });
    const after = createProbeBodySourceIssuerFake(); after.prepare(); const r = after.close();
    expect(r.first).toBe('closed'); expect(after.inspect()).toMatchObject({ stopRequested: true, state: 'failed',
      source: { state: 'failed', first: 'closed', stopRequested: true, stopMirrored: true, claim: 'unused' },
      storage: { state: 'failed', dataCreated: 0 }, receiver: { pinAttemptUsed: false, occupancy: 'free' } });
    expect(after.close()).toBe(r);
  });
  it('does not evaluate supplied objects, summaries or callbacks as issuers', () => {
    let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    const good = createProbeBodySourceIssuerFake(); good.prepare();
    for (const xs of [[p], [() => calls++], ['unknown'], [good], [good.inspect()], ['si_normal', p]]) {
      const a = createProbeBodySourceIssuerFake(...xs); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ creationAttempted: false, metadataConfirmed: false }); finite(a.inspect());
    }
    expect(calls).toBe(0); expect(good.inspect().first).toBe('none');
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('rejects arguments to %s without replacing prior custody', op => {
    const a = createProbeBodySourceIssuerFake(); a.prepare(); a[op]({});
    expect(a.check().first).toBe('input_rejected'); expect(a.inspect()).toMatchObject({ metadataConfirmed: true,
      source: { state: 'failed', first: 'state_invalid', issuedRetained: true, currentRetained: true, claim: 'unused' } }); finite(a.inspect());
  });
});
