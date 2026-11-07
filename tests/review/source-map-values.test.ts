import { describe, expect, it } from 'vitest';
import { inspectSourceDictionary, inspectSourceMapDraft } from './fixtures/source-map-values-core.js';

const file = (id = 'F01', path = 'synthetic/producer.ts', role = 'source') => ({ id, path, role,
  expectedSha256: 'a'.repeat(64), expectedBytes: 10 });

describe('source dictionary DATA only', () => {
  it('detaches and freezes a synthetic expected hash without reading a file', () => {
    const input = [file()], r = inspectSourceDictionary(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    input[0].expectedSha256 = 'b'.repeat(64);
    expect(r.value[0].expectedSha256).toBe('a'.repeat(64));
    expect(Object.isFrozen(r.value[0])).toBe(true);
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(r.hash).toBe('not_checked');
    expect(r.authority).toBe('none');
  });
  for (const path of ['', '/absolute.ts', '../outside.ts', 'a/../b.ts', './a.ts', 'a//b.ts', 'a/',
    'a\\b.ts', 'https://host/x', 'a%2fb.ts', 'a\0b.ts', '日本.ts', 'a'.repeat(257)]) {
    it(`rejects noncanonical path ${JSON.stringify(path)}`, () => expect(inspectSourceDictionary([file('F01', path)]).ok).toBe(false));
  }
  for (const [field, value] of Object.entries({ id: 'F00', role: 'runtime', expectedSha256: 'A'.repeat(64), expectedBytes: 0 })) {
    it(`rejects invalid file ${field}`, () => expect(inspectSourceDictionary([{ ...file(), [field]: value }]).ok).toBe(false));
  }
  it('rejects duplicated IDs, out of order, case aliases and ID-role confusion', () => {
    for (const files of [[file(), file()], [file('F02'), file('F01', 'b.ts')],
      [file(), file('F02', 'SYNTHETIC/producer.ts')], [file('T01')]]) expect(inspectSourceDictionary(files).ok).toBe(false);
  });
  it('accepts exact byte caps and rejects per-file or aggregate excess without truncation', () => {
    const files = Array.from({ length: 8 }, (_, i) => ({ ...file(`F0${i + 1}`, `file${i}.ts`), expectedBytes: 1_048_576 }));
    expect(inspectSourceDictionary(files).ok).toBe(true);
    expect(inspectSourceDictionary([...files, file('F09', 'extra.ts')]).ok).toBe(false);
    for (const expectedBytes of [-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 1_048_577])
      expect(inspectSourceDictionary([{ ...file(), expectedBytes }]).ok).toBe(false);
  });
  it('enforces 32 file entries and bounded ASCII path, preserving empty unimplemented drafts', () => {
    const files = Array.from({ length: 32 }, (_, i) => file(`F${String(i + 1).padStart(2, '0')}`, `f${i}.ts`));
    expect(inspectSourceDictionary(files).ok).toBe(true);
    expect(inspectSourceDictionary([...files, file('F33', 'extra.ts')]).ok).toBe(false);
    expect(inspectSourceDictionary([file('F01', 'a'.repeat(256))]).ok).toBe(true);
    expect(inspectSourceDictionary([]).ok).toBe(true);
  });
  it('agrees with independent BigInt byte/cardinality bounds', () => {
    for (const count of [0, 1, 8, 9, 32, 33]) for (const size of [0, 1, 524_288, 1_048_576, 1_048_577]) {
      const input = Array.from({ length: count }, (_, i) => ({ ...file(`F${String(i + 1).padStart(2, '0')}`, `s${i}.ts`), expectedBytes: size }));
      const expected = count <= 32 && (count === 0 || (size >= 1 && size <= 1_048_576))
        && BigInt(count) * BigInt(size) <= 8_388_608n;
      expect(inspectSourceDictionary(input).ok).toBe(expected);
    }
  });
});

const binding = (step = 'step01', fileId = 'F01') => ({ step, fileId, symbol: 'Synthetic.prepare',
  site: 'producer', role: 'implementation', phase: 'entry_prepare', costOwner: 'entry_prepare',
  costStep: `cost_${step}`, prefixes: ['normal', 'refused', 'partial'], tests: ['O01', 'T01'] });
const rows = () => Array.from({ length: 12 }, (_, i) => ({ id: `SC${String(i + 1).padStart(2, '0')}`,
  status: 'unimplemented', bindings: [] as unknown[], missing: ['not_implemented'] }));
const draft = () => ({ model: 'wfb-source-map-draft-values-1', files: [file(), file('F02', 'synthetic/helper.ts'),
  file('O01', 'synthetic/oracle.ts', 'oracle'), file('T01', 'synthetic/test.ts', 'test')], rows: rows(),
  ready: false, runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' });

describe('SourceMapDraft without source verification', () => {
  it('retains two source bindings and keeps unimplemented rows, hash and coverage unverified', () => {
    const input = draft();
    input.rows[0] = { id: 'SC01', status: 'mapped_unverified', bindings: [binding(),
      { ...binding('step02', 'F02'), symbol: 'Synthetic.helper', site: 'helper' }], missing: [] };
    const r = inspectSourceMapDraft(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows[0].bindings.map(b => b.fileId)).toEqual(['F01', 'F02']);
    expect(r.value.rows[5]).toMatchObject({ id: 'SC06', status: 'unimplemented', bindings: [], missing: ['not_implemented'] });
    expect(r).toMatchObject({ hash: 'not_checked', mapping: 'shape_only', implementation: 'unknown', ready: false });
    input.rows[0].bindings.length = 0;
    expect(r.value.rows[0].bindings).toHaveLength(2);
    expect(Object.isFrozen(r.value.rows[0].bindings[0].tests)).toBe(true);
  });
  it('keeps a shared helper as reference-only across multiple incomplete rows', () => {
    const input = draft();
    for (const i of [0, 1]) input.rows[i] = { id: `SC0${i + 1}`, status: 'partial_reference',
      bindings: [{ ...binding(), role: 'reference_only', costStep: null }], missing: ['actual_producer'] };
    expect(inspectSourceMapDraft(input).ok).toBe(true);
  });
  it('rejects repeated reference bindings even if step IDs differ', () => {
    const input = draft();
    input.rows[0] = { id: 'SC01', status: 'partial_reference', bindings: [
      { ...binding(), role: 'reference_only', costStep: null },
      { ...binding('step02'), role: 'reference_only', costStep: null }], missing: ['actual_producer'] };
    expect(inspectSourceMapDraft(input).ok).toBe(false);
  });
  const mapped = () => {
    const input = draft();
    input.rows[0] = { id: 'SC01', status: 'mapped_unverified', bindings: [binding()], missing: [] };
    return input;
  };
  it('agrees with an independently written twelve-row inventory', () => {
    const r = inspectSourceMapDraft({ ...draft(), files: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows.map(r => r.id)).toEqual(['SC01', 'SC02', 'SC03', 'SC04', 'SC05', 'SC06', 'SC07', 'SC08', 'SC09', 'SC10', 'SC11', 'SC12']);
    expect(r.value.rows.every(r => r.status === 'unimplemented')).toBe(true);
  });
  for (const [field, value] of Object.entries({ model: 'wfb-source-map-draft-values-2', ready: true,
    runtimeCoverage: 'complete', nativeCost: 'zero', entryRequirement: 5, seedRequirement: 75 })) {
    it(`rejects opening closed ${field}`, () => expect(inspectSourceMapDraft({ ...draft(), [field]: value }).ok).toBe(false));
  }
  for (const [field, value] of Object.entries({ step: '', fileId: 'F99', symbol: 'a/b', site: 'runtime',
    role: 'verified', phase: 'free', costOwner: 'none', costStep: null, prefixes: [], tests: [] })) {
    it(`rejects invalid binding ${field}`, () => {
      const input = mapped(); input.rows[0].bindings = [{ ...binding(), [field]: value }];
      expect(inspectSourceMapDraft(input).ok).toBe(false);
    });
  }
  it('rejects wrong file roles, unresolved tests, unordered/duplicate tests or prefixes', () => {
    for (const change of [{ fileId: 'T01' }, { fileId: 'O01' }, { tests: ['T99'] }, { tests: ['F01'] },
      { tests: ['T01', 'O01'] }, { tests: ['T01', 'T01'] }, { prefixes: ['normal', 'normal'] }, { prefixes: ['partial', 'normal'] }]) {
      const input = mapped(); input.rows[0].bindings = [{ ...binding(), ...change }];
      expect(inspectSourceMapDraft(input).ok).toBe(false);
    }
  });
  it('rejects fake completeness and retains partial missing points', () => {
    for (const row of [
      { id: 'SC01', status: 'unimplemented', bindings: [], missing: [] },
      { id: 'SC01', status: 'unimplemented', bindings: [binding()], missing: ['missing'] },
      { id: 'SC01', status: 'partial_reference', bindings: [], missing: ['missing'] },
      { id: 'SC01', status: 'partial_reference', bindings: [binding()], missing: [] },
      { id: 'SC01', status: 'mapped_unverified', bindings: [], missing: [] },
      { id: 'SC01', status: 'mapped_unverified', bindings: [{ ...binding(), role: 'reference_only', costStep: null }], missing: [] },
      { id: 'SC01', status: 'mapped_unverified', bindings: [binding()], missing: ['unknown'] },
      { id: 'SC01', status: 'complete', bindings: [binding()], missing: [] },
    ]) { const input = draft(); input.rows[0] = row; expect(inspectSourceMapDraft(input).ok).toBe(false); }
    const input = mapped(); input.rows[0].status = 'partial_reference'; input.rows[0].missing = ['not_reviewed'];
    expect(inspectSourceMapDraft(input)).toMatchObject({ ok: true, implementation: 'unknown' });
  });
  it('matches an independent status truth table without upgrading labels into evidence', () => {
    for (const status of ['unimplemented', 'partial_reference', 'mapped_unverified'])
      for (const hasBinding of [false, true]) for (const isImplementation of [false, true]) for (const hasMissing of [false, true]) {
        const input = draft();
        input.rows[0] = { id: 'SC01', status, bindings: hasBinding ? [{ ...binding(),
          role: isImplementation ? 'implementation' : 'reference_only', costStep: isImplementation ? 'cost' : null }] : [],
        missing: hasMissing ? ['missing'] : [] };
        const expected = status === 'unimplemented' ? !hasBinding && hasMissing
          : status === 'partial_reference' ? hasBinding && hasMissing : hasBinding && isImplementation && !hasMissing;
        expect(inspectSourceMapDraft(input).ok).toBe(expected);
      }
  });
  it('rejects duplicate, omitted, extra, unknown or reordered rows', () => {
    const original = rows();
    for (const bad of [original.slice(0, 11), [...original, original[0]], [...original].reverse(),
      original.map((r, i) => i === 11 ? original[0] : r), original.map((r, i) => i === 0 ? { ...r, id: 'SC13' } : r)])
      expect(inspectSourceMapDraft({ ...draft(), rows: bad }).ok).toBe(false);
  });
  it('rejects duplicate cost owners or duplicate implementation locations across rows', () => {
    for (const other of [binding('step02'), { ...binding('step02', 'F02'), costStep: 'cost_step01' }]) {
      const input = mapped();
      input.rows[1] = { id: 'SC02', status: 'mapped_unverified', bindings: [other], missing: [] };
      expect(inspectSourceMapDraft(input).ok).toBe(false);
    }
  });
  it('enforces binding and missing-point bounds, strict order and reference-only nonownership', () => {
    const input = mapped();
    input.rows[0].bindings = Array.from({ length: 32 }, (_, i) => ({ ...binding(`step${String(i).padStart(2, '0')}`),
      symbol: `Synthetic.point${i}`, costStep: `cost${i}` }));
    expect(inspectSourceMapDraft(input).ok).toBe(true);
    input.rows[0].bindings.push({ ...binding('step99'), symbol: 'Extra.point' });
    expect(inspectSourceMapDraft(input).ok).toBe(false);
    const unimplemented = draft();
    unimplemented.rows[0].missing = Array.from({ length: 32 }, (_, i) => `missing${String(i).padStart(2, '0')}`);
    expect(inspectSourceMapDraft(unimplemented).ok).toBe(true);
    unimplemented.rows[0].missing.push('too_many');
    expect(inspectSourceMapDraft(unimplemented).ok).toBe(false);
    for (const change of [{ role: 'reference_only' }, { step: 'step02' }]) {
      const bad = mapped(); bad.rows[0].bindings = [binding(), { ...binding(), ...change }];
      expect(inspectSourceMapDraft(bad).ok).toBe(false);
    }
  });
  it('enforces eight evidence references and symbol/identifier width without dropping entries', () => {
    const input = mapped();
    input.files = [file(), ...Array.from({ length: 9 }, (_, i) => file(`T0${i + 1}`, `t${i}.ts`, 'test'))];
    const tests = Array.from({ length: 8 }, (_, i) => `T0${i + 1}`);
    input.rows[0].bindings = [{ ...binding(), symbol: 'x'.repeat(128), step: 's'.repeat(64), tests }];
    expect(inspectSourceMapDraft(input).ok).toBe(true);
    for (const change of [{ tests: [...tests, 'T09'] }, { symbol: 'x'.repeat(129) }, { step: 's'.repeat(65) }]) {
      input.rows[0].bindings = [{ ...binding(), tests, ...change }];
      expect(inspectSourceMapDraft(input).ok).toBe(false);
    }
  });
  it('does not execute hooks in binding or test arrays and requires every strict field', () => {
    let hooks = 0;
    const hostile = Object.defineProperty(binding(), 'symbol', { get() { hooks++; throw Error('secret'); } });
    const proxy = new Proxy([], { get() { hooks++; throw Error('secret'); } });
    for (const bad of [hostile, { ...binding(), tests: proxy }, { ...binding(), unexpected: true },
      Object.fromEntries(Object.entries(binding()).slice(1)), Object.fromEntries(Object.entries(binding()).reverse())]) {
      const input = draft(); input.rows[0] = { id: 'SC01', status: 'mapped_unverified', bindings: [bad], missing: [] };
      expect(inspectSourceMapDraft(input).ok).toBe(false);
    }
    expect(hooks).toBe(0);
  });
  it('has bounded, detached, deeply frozen output and no secret-bearing error fields', () => {
    const input = mapped(), r = inspectSourceMapDraft(input);
    expect(r.ok).toBe(true);
    const walk = (v: unknown): void => {
      if (v && typeof v === 'object') { expect(Object.isFrozen(v)).toBe(true); Object.values(v).forEach(walk); }
    };
    walk(r);
    input.files[0].path = 'changed.ts'; input.rows[1].missing[0] = 'changed';
    if (r.ok) { expect(r.value.files[0].path).toBe('synthetic/producer.ts'); expect(r.value.rows[1].missing).toEqual(['not_implemented']); }
    expect(inspectSourceMapDraft({ ...input, secret: 'private' })).toEqual({ ok: false, reason: 'mapping_invalid',
      authority: 'none', ready: false, hash: 'not_checked', mapping: 'shape_only', implementation: 'unknown',
      runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown', coreInvocation: 'not_called' });
  });
  it('rejects proxy/accessor/custom prototype/symbol/nonenumerable/missing or reordered DATA without hooks', () => {
    let hooks = 0;
    const proxy = new Proxy({}, { ownKeys() { hooks++; throw Error('secret'); }, getPrototypeOf() { hooks++; throw Error('secret'); } });
    const getter = Object.defineProperty(file(), 'path', { get() { hooks++; throw Error('secret'); } });
    const sparse = rows(); delete (sparse as unknown[])[0];
    const badMaps = [proxy, { ...draft(), files: proxy }, { ...draft(), files: [getter] }, { ...draft(), rows: sparse },
      { ...draft(), rows: [proxy, ...rows().slice(1)] }, Object.assign(Object.create({}), draft()),
      { ...draft(), [Symbol('secret')]: 1 }, Object.defineProperty(draft(), 'hidden', { value: 1 }),
      Object.fromEntries(Object.entries(draft()).reverse())];
    for (const bad of badMaps) expect(inspectSourceMapDraft(bad).ok).toBe(false);
    expect(hooks).toBe(0);
    expect(inspectSourceMapDraft(Object.assign(Object.create(null), draft())).ok).toBe(true);
    const badArray = Object.assign([], { extra: 1 });
    expect(inspectSourceDictionary(badArray).ok).toBe(false);
  });
});
