import { describe, expect, it } from 'vitest';
import { calculateBridgeWorkBounds, inspectBridgeReservation } from './fixtures/bridge-work-core.js';
import { oraclePaths, oracleSlots, oracleStep } from './fixtures/bridge-work-oracle.js';
import { readFileSync } from 'node:fs';

describe('finite bridge work model, never a runtime profile or core permission', () => {
  it('accounts for nineteen slots and the full late-failure reservation, not only success', () => {
    expect(calculateBridgeWorkBounds()).toMatchObject({ kind: 'non_executable_bridge_work',
      slots: 19, reservations: { seed: 102, admit: 57, tail: 239, full: 398 },
      runtimeCoverage: 'unknown', coreInvocation: 'not_called', ready: false });
  });
  it('accepts the seed reservation at exact remaining capacity without mutating the counters', () => {
    const input = { max_parse_work: 112, parser_charged: 10, bridge_charged: 0 };
    expect(inspectBridgeReservation('seed', input)).toMatchObject({ ok: true, required: 102,
      value: { bridgeChargedAfter: 102, chargedAfter: 112, remaining: 0 }, ready: false, coreInvocation: 'not_called' });
    expect(input).toEqual({ max_parse_work: 112, parser_charged: 10, bridge_charged: 0 });
  });
  it('matches a separate semantic-event oracle for every recipe and every legal path', () => {
    const result = calculateBridgeWorkBounds();
    expect(result.slotNames).toEqual(oracleSlots); expect(new Set(result.slotNames).size).toBe(19);
    expect(Object.keys(result.steps)).toHaveLength(28); expect(result.paths).toHaveLength(29);
    for (const [id, step] of Object.entries(result.steps)) {
      const events = oracleStep(id);
      const units = { read: 0, check: 0, write: 0, arithmetic: 0, copy: 0, container: 0, freeze: 0, control: 0 };
      for (const event of events) units[event.kind]++;
      expect(step.units, id).toEqual(units); expect(step.total, id).toBe(events.length);
    }
    const expected = oraclePaths(); expect(result.paths.map(p => p.id)).toEqual(expected.map(p => p.id));
    for (const p of expected) {
      const events = p.steps.flatMap(oracleStep), actual = result.paths.find(x => x.id === p.id)!;
      expect(actual.total, p.id).toBe(events.length); expect(actual.phase).toBe(p.phase);
      expect(events.length).toBeLessThanOrEqual(result.reservations[p.phase]);
      // Every primitive interruption is covered, including partial cleanup and diagnostic failure.
      for (let prefix = 0; prefix <= events.length; prefix++) expect(BigInt(prefix)).toBeLessThanOrEqual(BigInt(result.reservations[p.phase]));
    }
    const success = result.paths.find(p => p.id === 'success')!, late = result.paths.find(p => p.id === 'return_refused/3')!;
    expect(success.total).toBe(219); expect(late.total).toBe(239);
    expect(late.total).toBeGreaterThan(success.total); expect(result.reservations.tail).toBe(late.total);
  });
  it('clears each modeled slot from exactly one phase and excludes existing parser/core charges', () => {
    const cleared = ['seed_clear', 'admit_clear', 'tail_clear'].flatMap(id => oracleStep(id).map(e => e.subject));
    expect(cleared.sort()).toEqual([...oracleSlots].sort()); expect(new Set(cleared).size).toBe(19);
    const result = calculateBridgeWorkBounds();
    expect(result.paths.flatMap(p => p.steps)).not.toContain('nodeCleanup');
    expect(result.paths.flatMap(p => p.steps)).not.toContain('byteCleanup');
    expect(result.steps.admission.units.arithmetic).toBe(3); // Existing parser owns the separate work-allocation sum.
    expect(result.paths.filter(p => p.phase !== 'seed').flatMap(p => p.steps)).not.toContain('tail_gate');
  });
  it.each(['seed', 'admit', 'tail'] as const)('checks %s equality, one-below and prior-charge overflow with BigInt', phase => {
    const required = { seed: 102n, admit: 57n, tail: 239n }[phase];
    for (const parser of [0n, 10n, 110n, 312n, 9007199254740000n]) for (const bridge of [0n, 1n, 102n]) {
      for (const offset of [-1n, 0n, 1n]) {
        const cap = parser + bridge + required + offset;
        const input = { max_parse_work: Number(cap), parser_charged: Number(parser), bridge_charged: Number(bridge) };
        const r = inspectBridgeReservation(phase, input);
        if (offset < 0n) expect(r).toMatchObject({ ok: false, reason: 'raw_work' });
        else expect(r).toMatchObject({ ok: true, required: Number(required), value: { bridgeChargedAfter: Number(bridge + required), chargedAfter: Number(parser + bridge + required), remaining: Number(offset) } });
      }
    }
    expect(inspectBridgeReservation(phase, { max_parse_work: Number.MAX_SAFE_INTEGER, parser_charged: Number.MAX_SAFE_INTEGER, bridge_charged: 1 })).toMatchObject({ ok: false, reason: 'raw_overflow' });
    expect(inspectBridgeReservation(phase, { max_parse_work: 1, parser_charged: 2, bridge_charged: 0 })).toMatchObject({ ok: false, reason: 'raw_work' });
  });
  it('never refunds prepaid-unused work or changes an actual budget: results are projections only', () => {
    let bridge = 0;
    for (const phase of ['seed', 'admit', 'tail'] as const) {
      const r = inspectBridgeReservation(phase, { max_parse_work: 508, parser_charged: 110, bridge_charged: bridge });
      if (!r.ok) throw Error('fixture'); bridge = r.value.bridgeChargedAfter;
      expect(r.ready).toBe(false); expect(r.runtimeCoverage).toBe('unknown'); expect(r.coreInvocation).toBe('not_called');
    }
    expect(bridge).toBe(398);
    const success = calculateBridgeWorkBounds().paths.find(p => p.id === 'success')!.total;
    const executed = 102 + 57 + success, unused = bridge - executed;
    expect(executed).toBe(378); expect(unused).toBe(20); expect(executed + unused).toBe(bridge);
    const early = calculateBridgeWorkBounds().paths.find(p => p.id === 'seed/0')!.total;
    expect(early).toBe(74); expect(102 - early).toBe(28); // Later reservations are not acquired by a parser refusal.
    // Repeating the arithmetic is permitted: no one-shot credit/owner is issued by a pure calculator.
    expect(inspectBridgeReservation('seed', { max_parse_work: 102, parser_charged: 0, bridge_charged: 0 }).ok).toBe(true);
  });
  it('rejects hooks, unknown fields/phase and unsafe counters without coercion or secret output', () => {
    let calls = 0;
    const input = { max_parse_work: 1000, parser_charged: 0, bridge_charged: 0 };
    const getter = { ...input }; Object.defineProperty(getter, 'parser_charged', { enumerable: true, get() { calls++; throw Error('PRIVATE'); } });
    const proxy = new Proxy(input, { ownKeys() { calls++; throw Error('PRIVATE'); }, getPrototypeOf() { calls++; throw Error('PRIVATE'); } });
    for (const bad of [null, [], getter, proxy, { ...input, extra: 'PRIVATE' }, { ...input, toJSON() { calls++; return 'PRIVATE'; } },
      { ...input, [Symbol('secret')]: 1 }, Object.setPrototypeOf({ ...input }, { secret: 'PRIVATE' }),
      { parser_charged: 0, max_parse_work: 1000, bridge_charged: 0 }, { max_parse_work: 1000, parser_charged: 0 }]) {
      const r = inspectBridgeReservation('tail', bad); expect(r).toMatchObject({ ok: false, reason: 'raw_limits' });
      expect(JSON.stringify(r)).not.toMatch(/PRIVATE|stack/); expect(r).not.toHaveProperty('value');
    }
    for (const bad of [0, -0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1000', {}]) {
      expect(inspectBridgeReservation('seed', { ...input, max_parse_work: bad })).toMatchObject({ ok: false, reason: 'raw_limits' });
    }
    for (const key of ['parser_charged', 'bridge_charged']) for (const bad of [-0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0']) {
      expect(inspectBridgeReservation('admit', { ...input, [key]: bad })).toMatchObject({ ok: false, reason: 'raw_limits' });
    }
    for (const phase of ['PRIVATE', null, {}, new Proxy({}, { get() { calls++; throw Error('PRIVATE'); } })]) {
      expect(inspectBridgeReservation(phase, input)).toMatchObject({ ok: false, reason: 'raw_limits' });
    }
    expect(calls).toBe(0); expect(inspectBridgeReservation('seed', Object.setPrototypeOf({ ...input }, null)).ok).toBe(true);
  });
  it('keeps every returned structure immutable and detects coefficient/omitted-path mutants in the oracle', () => {
    const result = calculateBridgeWorkBounds();
    const walk = (v: unknown) => { if (v && typeof v === 'object') { expect(Object.isFrozen(v)).toBe(true); for (const x of Object.values(v)) walk(x); } };
    walk(result); walk(inspectBridgeReservation('tail', { max_parse_work: 239, parser_charged: 0, bridge_charged: 0 }));
    for (const [id, step] of Object.entries(result.steps)) {
      const expected = BigInt(oracleStep(id).length);
      expect(BigInt(step.total) + 1n).not.toBe(expected); expect(BigInt(step.total) - 1n).not.toBe(expected);
    }
    expect(result.reservations.tail - 1).toBeLessThan(oraclePaths().find(p => p.id === 'return_refused/3')!.steps.flatMap(oracleStep).length);
    expect(result.paths.find(p => p.id === 'success')!.total).toBeLessThan(result.reservations.tail);
  });
  it('keeps the pure calculator and independent oracle outside runtime/raw/core/package roots', () => {
    const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
    const core = read('tests/review/fixtures/bridge-work-core.ts');
    expect(core.match(/^import .*$/gm)).toEqual(["import { types } from 'node:util';"]);
    expect(core).not.toMatch(/\b(?:fetch|inspectCheckpoint|parseCheckpoint|saveAttempt|persist|setTimeout|issueReceipt)\s*\(/);
    expect(read('tests/review/fixtures/bridge-work-oracle.ts')).not.toMatch(/^import /m);
    for (const name of ['raw-json-boundary', 'snapshot-value-core', 'value-admission-core']) expect(read('tests/review/fixtures/' + name + '.ts')).not.toContain('bridge-work');
    expect(JSON.parse(read('tsconfig.json')).exclude).toContain('tests'); expect(JSON.parse(read('package.json')).files).not.toContain('tests/');
  });
});
