import { describe, expect, it } from 'vitest';
import { createProbeBodyPinReturnedPreparationFake } from './fixtures/snapshot-read-composition-fake.js';

describe('R-a returned contracts with all execution boundaries closed', () => {
  it('checks initial preparation and refuses without starting a source or accepting returned', () => {
    const a = createProbeBodyPinReturnedPreparationFake();
    expect(a.check()).toBe('not_ready');
    expect(a.prepare()).toBe('returned_not_connected');
    expect(a.inspect()).toMatchObject({ first: 'construction_unconfirmed', phase: 'not_started', point: 'none',
      failurePoint: 'none', postChecked: false, stateValid: true, sourceGenerations: 0, fixedCalls: 0,
      cacheRetained: false, sealed: false, attempts: 0, gr: 'not_connected', ga: 'not_connected',
      acceptance: 'not_connected', c03: 'not_connected', bodyStarts: 0, authority: 'none', execution: 'closed' });
    expect(a.prepare()).toBe('returned_not_connected');
    expect(a.inspect().postChecked).toBe(false);
  });
  it('retains first none for a preconstruction close, including later invalid input', () => {
    const a = createProbeBodyPinReturnedPreparationFake();
    expect(a.close()).toBe('closed'); expect(a.prepare()).toBe('closed');
    expect(a.check('private_secret')).toBe('input_refused');
    expect(a.inspect()).toMatchObject({ first: 'none', stopped: true, phase: 'not_started', postChecked: false,
      sourceGenerations: 0, cacheRetained: false, sealed: false, attempts: 0 });
    expect(JSON.stringify(a.inspect())).not.toContain('private_secret');
  });
  it('does not execute input hooks or replace an earlier diagnosis', () => {
    let hooks = 0;
    const hostile = new Proxy({}, { get() { hooks++; throw 'private_secret'; }, ownKeys() { hooks++; throw 'private_secret'; },
      getPrototypeOf() { hooks++; throw 'private_secret'; } });
    for (const v of [hostile, () => hooks++, {}, true, 'rp_normal', createProbeBodyPinReturnedPreparationFake().inspect()]) {
      const a = createProbeBodyPinReturnedPreparationFake(v); expect(a.prepare()).toBe('input_rejected');
      a.close(); expect(a.inspect().first).toBe('input_rejected'); expect(a.inspect().sourceGenerations).toBe(0);
    }
    const a = createProbeBodyPinReturnedPreparationFake(); a.prepare();
    for (const op of ['prepare', 'check', 'close', 'inspect'] as const) a[op](hostile);
    expect(a.inspect()).toMatchObject({ first: 'construction_unconfirmed', stopped: false, phase: 'not_started', postChecked: false });
    expect(hooks).toBe(0); expect(JSON.stringify(a.inspect())).not.toContain('private_secret');
  });
  it('publishes frozen finite diagnostics only, never a receipt or an executable continuation', () => {
    const a = createProbeBodyPinReturnedPreparationFake();
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'close', 'inspect']);
    for (const op of [() => a.check(), () => a.prepare(), () => a.close()]) {
      expect(typeof op()).toBe('string'); const v = a.inspect();
      expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
      expect(Object.values(v).every(x => ['boolean', 'number', 'string'].includes(typeof x))).toBe(true);
      expect(v).toMatchObject({ acceptance: 'not_connected', gr: 'not_connected', ga: 'not_connected', c03: 'not_connected',
        formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold' });
    }
  });
  const ops = ['prepare', 'check', 'close', 'invalid'] as const;
  it.each(ops.flatMap(x => ops.flatMap(y => ops.map(z => [x, y, z] as const))))(
    'preserves the independent diagnosis prefix %s/%s/%s', (x, y, z) => {
      const a = createProbeBodyPinReturnedPreparationFake(); let first = 'none', closed = false;
      for (const op of [x, y, z]) {
        if (op === 'close') { closed = true; a.close(); }
        else if (op === 'invalid') { if (!closed && first === 'none') first = 'input_rejected'; a.check('private_secret'); }
        else {
          if (op === 'prepare' && !closed && first === 'none') first = 'construction_unconfirmed';
          expect(a[op]()).toBe(closed ? 'closed' : first === 'none' ? 'not_ready'
            : first === 'construction_unconfirmed' ? 'returned_not_connected' : first);
        }
        expect(a.inspect()).toMatchObject({ first, stopped: closed, phase: 'not_started', postChecked: false,
          sourceGenerations: 0, fixedCalls: 0, cacheRetained: false, sealed: false, attempts: 0, bodyStarts: 0 });
      }
    });
});
