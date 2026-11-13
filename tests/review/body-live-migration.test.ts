import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { bodyLiveMigrationCases, createBodyLivePatchBoundary } from './fixtures/body-live-migration.js';
import { legacyBodyLiveOracle } from './fixtures/body-live-migration-oracle.js';

const source = readFileSync(new URL('./fixtures/snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const legacyScript = readFileSync(new URL('./fixtures/compiled-probe-body-live.mjs', import.meta.url), 'utf8');
const oracle = legacyBodyLiveOracle(legacyScript);
const boundary = createBodyLivePatchBoundary(source);
function methods(text: string) {
  const file = ts.createSourceFile('check.ts', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const owner = file.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot') as ts.ClassDeclaration;
  return { file, members: new Map(owner.members.filter(ts.isMethodDeclaration).map(n => [n.name.getText(file), n])) };
}
function shape(n: ts.Node): unknown {
  if (ts.isParenthesizedExpression(n)) return shape(n.expression);
  const children: unknown[] = [];
  ts.forEachChild(n, child => { children.push(shape(child)); });
  // Prefix/postfix operators are node properties, not children: compare them explicitly.
  return [n.kind, 'text' in n ? n.text : undefined, 'operator' in n ? n.operator : undefined, children];
}
const baseline = boundary.ok ? boundary.patch('base') : boundary;
const baselineMethods = baseline.ok ? methods(baseline.js) : undefined;
function legacyMember(text: string, name: string): string {
  const privateStart = text.indexOf('\n  private ' + name + '(');
  const start = privateStart >= 0 ? privateStart + 3 : text.indexOf('\n  ' + name + '(') + 3;
  const end = text.indexOf('\n  }\n', start) + 5;
  if (start < 3 || end <= start) throw Error('oracle_member_drift');
  return text.slice(start, end);
}

describe('BL-A migration ledger without switching the legacy runner', () => {
  it('retains the ordered 304 legacy module identities, not just a summary count', () => {
    const cases = bodyLiveMigrationCases();
    expect(cases).toHaveLength(304);
    expect(cases[0].id).toBe('base');
    expect(cases.at(-1)?.id).toBe('rogue-phase-echo');
    expect(new Set(cases.map(c => c.id)).size).toBe(304);
    expect(cases.filter(c => c.group === 'field')).toHaveLength(56);
    expect(cases.filter(c => c.group === 'prior')).toHaveLength(180);
    expect(Object.isFrozen(cases)).toBe(true);
  });
  it('prepares an isolated JS value from one baseline without importing or starting the body', () => {
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) return;
    const base = boundary.patch('base'), changed = boundary.patch('field-0');
    expect(base.ok && changed.ok).toBe(true);
    if (!base.ok || !changed.ok) return;
    expect(changed.js).not.toBe(base.js);
    expect(changed.members).toEqual(['bodyLiveDataMatches']);
    expect(boundary.patch('base')).toEqual(base);
    expect(boundary.patch('field-0')).toEqual(changed);
    expect(boundary.patch('unknown')).toEqual({ ok: false, reason: 'transform_drift', point: 'case' });
  });
  it('matches IDs, order, script and changed-member ownership to the pinned old script oracle', () => {
    expect(bodyLiveMigrationCases().map(c => [c.id, c.script, [...new Set(c.patches.map(p => p.member))]]))
      .toEqual(oracle.map(c => [c.id, c.script, c.members]));
  });
  it('rejects unknown inputs without invoking input or ID hooks', () => {
    let hooks = 0;
    const hostile = new Proxy({}, { get() { hooks++; throw Error('input'); }, ownKeys() { hooks++; throw Error('input'); } });
    for (const input of [hostile, [], null, 0, () => hooks++, '', 'x'.repeat(1_048_577)]) {
      expect(createBodyLivePatchBoundary(input)).toEqual({ ok: false, reason: 'transform_drift', point: 'input' });
    }
    expect(boundary.ok).toBe(true);
    if (boundary.ok) expect(boundary.patch(hostile)).toEqual({ ok: false, reason: 'transform_drift', point: 'case' });
    expect(hooks).toBe(0);
  });
  it('keeps parser exhaustion a fixed refusal without leaking a native parser exception', () => {
    const nested = 'const x = ' + '('.repeat(10_000) + '0' + ')'.repeat(10_000) + ';';
    expect(createBodyLivePatchBoundary(nested)).toEqual({ ok: false, reason: 'transform_drift', point: 'syntax' });
  });
  it.each([
    ['syntax', (s: string) => s + '\nconst broken = ;', 'syntax'],
    ['owner missing', (s: string) => s.replace('class CanonicalGateDraftRoot {', 'class DifferentRoot {'), 'class'],
    ['owner repeated', (s: string) => s + '\nclass CanonicalGateDraftRoot {}', 'class'],
    ['member missing', (s: string) => s.replace('private bodyLiveMint(', 'private lostBodyLiveMint('), 'member'],
    ['member repeated', (s: string) => s.replace('private bodyLiveMint(', 'private bodyLiveMint() {}\n  private bodyLiveMint('), 'member'],
    ['branch missing', (s: string) => s.replace('if (n === 6) { const v = value as BodyProgressInitial;', 'if (n === 99) { const v = value as BodyProgressInitial;'), 'branch'],
    ['anchor missing', (s: string) => s.replace('v.activationConfirmed === false', 'v.activationConfirmed !== true'), 'anchor'],
    ['anchor repeated', (s: string) => s.replace('v.activationConfirmed === false', '(v.activationConfirmed === false && v.activationConfirmed === false)'), 'anchor'],
    ['branch repeated', (s: string) => s.replace('if (n === 6) { const v = value as BodyProgressInitial;',
      'if (n === 6) { void 0; }\n    if (n === 6) { const v = value as BodyProgressInitial;'), 'branch'],
    ['final branch binding renamed', (s: string) => s.replace('    const v = value as BodyUnwindInitial;\n    return n === 11 && v[BODY_UNWIND]',
      '    const v = value as BodyUnwindInitial; const w = v;\n    return n === 11 && v[BODY_UNWIND]'), 'branch'],
    ['final branch guard moved', (s: string) => s.replace('    return n === 11 && v[BODY_UNWIND]', '    return v[BODY_UNWIND] === true && n === 11 && v[BODY_UNWIND]'), 'branch'],
  ] as const)('refuses %s drift before even exposing the baseline', (_, change, point) => {
    expect(createBodyLivePatchBoundary(change(source))).toMatchObject({ ok: false, reason: 'transform_drift', point });
    if (boundary.ok) expect(boundary.patch('base').ok).toBe(true);
  });
  it('does not let comments, strings or harmless formatting become patch targets', () => {
    const annotated = source.replace('v.activationConfirmed === false',
      '(/* v.activationConfirmed === false */ v.activationConfirmed === false)');
    const b = createBodyLivePatchBoundary(annotated);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.patch('field-2').ok).toBe(true);
  });
  it('rejects a missing expression even if the same spelling survives inside a regexp literal', () => {
    const changed = source.replace('v.activationConfirmed === false', 'true')
      .replace('if (n === 6) { const v = value as BodyProgressInitial;',
        'if (n === 6) { const v = value as BodyProgressInitial; const marker = /v.activationConfirmed === false/; void marker;');
    expect(createBodyLivePatchBoundary(changed)).toMatchObject({ ok: false, reason: 'transform_drift', point: 'anchor', id: 'field-2' });
  });
  it('requires the TS anchor itself, not only the type-erased JS spelling', () => {
    // Without the non-null assertion the JS emit is identical, but the pinned TS recipe no longer exists.
    const changed = source.replace('v.progress === slots[5]!.current', 'v.progress === slots[5].current');
    expect(createBodyLivePatchBoundary(changed)).toMatchObject({ ok: false, reason: 'transform_drift', point: 'anchor', id: 'field-9' });
  });
  it('accepts exactly the input limit as input and refuses one more unit', () => {
    expect(createBodyLivePatchBoundary('x'.repeat(1_048_576))).toEqual({ ok: false, reason: 'transform_drift', point: 'class' });
    expect(createBodyLivePatchBoundary('x'.repeat(1_048_577))).toEqual({ ok: false, reason: 'transform_drift', point: 'input' });
  });
  it('keeps the shape comparator sensitive to unary operators', () => {
    const one = (t: string) => shape(ts.createSourceFile('u.js', t, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS).statements[0]);
    expect(one('!a;')).not.toEqual(one('-a;'));
    expect(one('a++;')).not.toEqual(one('a--;'));
    expect(one('(!a);')).toEqual(one('!a;'));
  });
  it('retains the canonical recipes when a caller tries to change the ledger', () => {
    const cases = bodyLiveMigrationCases(), p = cases[1].patches[0];
    expect(Reflect.set(p, 'to', 'false')).toBe(false);
    expect(Reflect.set(cases[1], 'id', 'foreign')).toBe(false);
    expect(Reflect.set(cases[1].patches, '0', {})).toBe(false);
    expect(p.to).toBe('true');
    expect(() => legacyBodyLiveOracle(legacyScript + '\n')).toThrow('legacy_script_drift');
  });
  it.each(oracle)('preserves the legacy TS mutation at the local JS boundary: $id', c => {
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) return;
    const actual = boundary.patch(c.id);
    expect(actual.ok && baseline.ok).toBe(true);
    if (!actual.ok || !baseline.ok || !baselineMethods) return;
    const before = baselineMethods, after = methods(actual.js), reference = c.reference(source);
    // The reference emits only the changed members, not another copy of the full fixture.
    const text = `class CanonicalGateDraftRoot {\n${c.members.map(k => legacyMember(reference, k)).join('\n')}\n}`;
    const expected = methods(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
    for (const k of c.members) expect(shape(after.members.get(k)!)).toEqual(shape(expected.members.get(k)!));
    function outside(s: string, m: ReturnType<typeof methods>) {
      const spans = c.members.map(k => m.members.get(k)!).sort((a, b) => b.pos - a.pos);
      for (const n of spans) s = s.slice(0, n.pos) + '<checked-member>' + s.slice(n.end);
      return s;
    }
    expect(outside(actual.js, after)).toBe(outside(baseline.js, before));
    expect(actual.members).toEqual(c.members);
  });
});
