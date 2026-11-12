import { describe, expect, it } from 'vitest';
import { createProbeBodyPinFinalContractsFake } from './fixtures/snapshot-read-composition-fake.js';

describe('C-a closed final reply contracts, without final post or public delivery', () => {
  it('seals a diagnosis once and retains one private cache without publishing it', () => {
    const a = createProbeBodyPinFinalContractsFake();
    expect(a.check()).toBe('not_ready');
    expect(a.inspect()).toMatchObject({ sealed: false, phase: 'empty', attempts: 0, cacheRetained: false });
    expect(a.seal()).toBe('sealed');
    expect(a.materialize()).toBe('private_cached');
    expect(a.publish()).toBe('publication_not_connected');
    expect(a.inspect()).toMatchObject({ sealed: true, first: 'construction_unconfirmed',
      disposition: 'construction_unconfirmed', phase: 'private_cached', attempts: 1, cacheRetained: true,
      publicEntryBusy: false, rootEntryExit: 'not_observed', finalPost: false,
      acceptedReturns: 0, bodyStarts: 0, authority: 'none', execution: 'closed' });
  });
  it('locks sealed first none on preconstruction close, including later invalid input', () => {
    const a = createProbeBodyPinFinalContractsFake();
    expect(a.close()).toBe('sealed');
    expect(a.materialize()).toBe('private_cached');
    expect(a.seal()).toBe('already_sealed');
    expect(a.check('late_secret')).toBe('input_refused');
    a.close(); a.publish();
    expect(a.inspect()).toMatchObject({ first: 'none', disposition: 'closed', sealed: true,
      stopped: true, attempts: 1, deliveryFirst: 'input_refused', phase: 'private_cached' });
    expect(JSON.stringify(a.inspect())).not.toContain('late_secret');
  });
  it('keeps the first input diagnosis, not a later close or generation failure', () => {
    const a = createProbeBodyPinFinalContractsFake('ca_freeze_throw');
    expect(a.check({ secret: 'not_output' })).toBe('input_refused');
    a.close(); a.materialize(); a.seal(); a.close();
    expect(a.inspect()).toMatchObject({ first: 'input_rejected', disposition: 'input_rejected',
      sealed: true, attempts: 1, phase: 'failed_empty', deliveryFirst: 'view_unconfirmed' });
  });
  it.each([
    ['ca_materialize_throw', 'failed_empty', false, 'view_unconfirmed'],
    ['ca_freeze_throw', 'failed_empty', false, 'view_unconfirmed'],
    ['ca_after_cache_throw', 'failed_cached', true, 'root_exit_unconfirmed'],
  ] as const)('retains diagnosis and failed ownership after %s, with no regeneration', (script, phase, retained, delivery) => {
    const a = createProbeBodyPinFinalContractsFake(script); a.seal();
    expect(a.materialize()).toBe('materialization_failed');
    for (let n = 0; n < 3; n++) {
      expect(a.materialize()).toBe('attempt_refused'); expect(a.publish()).toBe('publication_not_connected');
      a.close(); a.check('later');
    }
    expect(a.inspect()).toMatchObject({ sealed: true, first: 'construction_unconfirmed',
      disposition: 'construction_unconfirmed', phase, attempts: 1, cacheRetained: retained, cacheValid: true,
      deliveryFirst: delivery, publicEntryBusy: false, rootEntryExit: 'not_observed' });
  });
  it('rejects materialization reentry without a second cache or an invented root exit', () => {
    const a = createProbeBodyPinFinalContractsFake('ca_reenter_materializing'); a.seal();
    expect(a.materialize()).toBe('private_cached');
    expect(a.materialize()).toBe('attempt_refused');
    expect(a.inspect()).toMatchObject({ phase: 'private_cached', attempts: 1, deliveryFirst: 'reentrant_reply',
      rootEntryExit: 'not_observed', publicEntryBusy: false, cacheValid: true });
  });
  it('does not inspect foreign objects, callbacks or public copies as inputs', () => {
    let hooks = 0;
    const foreign = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); },
      getPrototypeOf() { hooks++; throw Error('secret'); } });
    const original = createProbeBodyPinFinalContractsFake(); original.seal(); original.materialize();
    for (const v of [foreign, () => { hooks++; }, original, original.inspect(), { ...original.inspect() }, 'unknown', 1, true, null]) {
      const a = createProbeBodyPinFinalContractsFake(v); a.close(); a.materialize();
      expect(a.inspect()).toMatchObject({ first: 'input_rejected', disposition: 'input_rejected', cacheValid: true });
      expect(original.publish(v)).toBe('input_refused');
    }
    expect(hooks).toBe(0);
    expect(original.inspect()).toMatchObject({ first: 'construction_unconfirmed', attempts: 1, phase: 'private_cached' });
  });
  it('exposes frozen finite diagnostic data only, never the terminal cache or a publication capability', () => {
    const a = createProbeBodyPinFinalContractsFake();
    expect(Object.keys(a)).toEqual(['check', 'seal', 'materialize', 'publish', 'close', 'inspect']);
    for (const op of [() => a.check(), () => a.seal(), () => a.materialize(), () => a.publish(), () => a.close()]) {
      expect(typeof op()).toBe('string');
      const v = a.inspect();
      expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
      expect(Object.values(v).every(x => typeof x === 'string' || typeof x === 'boolean' || typeof x === 'number')).toBe(true);
      expect(v).toMatchObject({ finalPost: false, acceptedReturns: 0, bodyStarts: 0, sourceGenerations: 0,
        pc08: 'not_connected', c03: 'not_connected', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled',
        implementation: 'unknown', investigations: 'on_hold' });
    }
  });
  // Independent event oracle: no implementation builder/checker/schedule imports.
  const ops = ['seal', 'close', 'materialize', 'publish', 'invalid'] as const;
  it.each(ops.flatMap(x => ops.map(y => [x, y] as const)))('preserves finite ownership for prefix %s/%s', (x, y) => {
    const a = createProbeBodyPinFinalContractsFake();
    let sealed = false, first = 'none', disposition = 'none', cached = false, stopped = false, delivery = 'none';
    for (const op of [x, y, 'materialize', 'seal', 'publish'] as const) {
      if (op === 'invalid') {
        if (!sealed && first === 'none') first = 'input_rejected';
        if (sealed && delivery === 'none') delivery = 'input_refused';
        a.check('extra');
      } else {
        if (op === 'close') stopped = true;
        if (!sealed && (op === 'seal' || op === 'close')) {
          if (op === 'seal' && first === 'none') first = 'construction_unconfirmed';
          disposition = first === 'input_rejected' ? first : op === 'close' ? 'closed' : 'construction_unconfirmed'; sealed = true;
        }
        if (op === 'materialize' && sealed) cached = true;
        a[op]();
      }
      expect(a.inspect()).toMatchObject({ sealed, first, disposition, stopped, deliveryFirst: delivery,
        cacheRetained: cached, attempts: Number(cached), phase: cached ? 'private_cached' : 'empty', cacheValid: true });
    }
  });
});
