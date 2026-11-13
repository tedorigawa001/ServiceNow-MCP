import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBodyLiveLoadSession } from './fixtures/body-live-esm-loader.js';
import type { BodyLiveLoadOps } from './fixtures/body-live-esm-loader.js';
import { legacyBodyLiveOracle } from './fixtures/body-live-migration-oracle.js';
import { buildBodyLiveDriver } from './fixtures/body-live-driver.js';
import ts from 'typescript';

const source = readFileSync(new URL('./fixtures/snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('./fixtures/compiled-probe-body-live.mjs', import.meta.url), 'utf8');
const oracle = legacyBodyLiveOracle(legacy);
let serial = 0;
const namespace = () => Object.freeze({ createProbeBodyLiveFake: () => undefined });
function session(overrides: Partial<BodyLiveLoadOps> = {}) {
  const writes: string[] = [];
  const a = createBodyLiveLoadSession(source, legacy, 'reference', `file:///synthetic/blb-${++serial}/`, 60_000, {
    now: () => 0, write: url => { writes.push(url); }, load: async () => namespace(), emit: () => 'export {};', ...overrides,
  });
  return { a, writes };
}
describe('BL-B synthetic-only sequential ESM load session', () => {
  it('binds the first TS input to base and reserves a unique URL before publishing a namespace', async () => {
    const written: string[] = [], imported: string[] = [];
    const ns = Object.freeze({ createProbeBodyLiveFake: () => undefined });
    const a = createBodyLiveLoadSession(source, legacy, 'js', 'file:///synthetic/blb/', 60_000, {
      now: () => 0, write: (url, _text) => { written.push(url); }, load: async url => { imported.push(url); return ns; },
      emit: () => { throw Error('reference emit must not run'); },
    });
    expect(await a.load(source, 'base')).toBe(ns);
    expect(written).toEqual(['file:///synthetic/blb/base.js']);
    expect(imported).toEqual(written);
    expect(a.inspect()).toMatchObject({ completed: 1, writes: 1, imports: 1, first: 'none' });
    await expect(a.load(source, 'base')).rejects.toThrow('duplicate');
    expect(written).toHaveLength(1);
  });
  it.each(['field-0', 'unknown', undefined])('rejects unordered or unknown %s without I/O', async id => {
    const { a, writes } = session();
    await expect(a.load(source, id)).rejects.toThrow('order');
    await expect(a.load(source, 'base')).rejects.toThrow('order');
    expect(writes).toHaveLength(0);
  });
  it('refuses a foreign TS text before writing or importing and never retries the failed owner', async () => {
    const { a, writes } = session();
    await expect(a.load(source + '\n', 'base')).rejects.toThrow('source_mismatch');
    await expect(a.load(source, 'base')).rejects.toThrow('source_mismatch');
    expect(writes).toHaveLength(0);
  });
  it('rejects foreign namespaces and copied namespace wrappers sharing a factory', async () => {
    const ns = namespace(), first = session({ load: async () => ns });
    await first.a.load(source, 'base');
    for (const value of [ns, Object.freeze({ ...ns })]) {
      const { a } = session({ load: async () => value });
      await expect(a.load(source, 'base')).rejects.toThrow('namespace');
      expect(a.inspect()).toMatchObject({ completed: 0, imports: 1, first: 'namespace' });
    }
  });
  it('rejects a cached namespace when a second case is given a fresh URL', async () => {
    const ns = namespace(), { a, writes } = session({ load: async () => ns });
    await a.load(source, 'base');
    await expect(a.load(oracle[1].reference(source), oracle[1].id)).rejects.toThrow('namespace');
    expect(new Set(writes).size).toBe(2);
  });
  it('retains a busy refusal and rejects both sides of an overlapping import', async () => {
    let resolve!: (v: unknown) => void;
    const { a } = session({ load: () => new Promise(r => { resolve = r; }) });
    const first = a.load(source, 'base');
    await expect(a.load(source, 'base')).rejects.toThrow('busy');
    resolve(namespace()); await expect(first).rejects.toThrow('busy');
    expect(a.inspect()).toMatchObject({ completed: 0, busy: false, writes: 1, imports: 1, first: 'busy' });
  });
  it('does not publish a namespace after cancellation during import', async () => {
    let resolve!: (v: unknown) => void;
    const { a } = session({ load: () => new Promise(r => { resolve = r; }) });
    const work = a.load(source, 'base'); a.stop(); resolve(namespace());
    await expect(work).rejects.toThrow('closed');
    expect(a.inspect()).toMatchObject({ completed: 0, first: 'closed', busy: false });
  });
  it('refuses a synchronous stop inside the final clock observation before publication', async () => {
    let remaining = 0;
    const { a } = session({ now: () => { if (remaining > 0 && --remaining === 0) a.stop(); return 0; },
      load: async () => { remaining = 2; return namespace(); } });
    await expect(a.load(source, 'base')).rejects.toThrow('closed');
    expect(a.inspect()).toMatchObject({ completed: 0, first: 'closed', busy: false });
  });
  it('never reuses an issued URL even after its first owner stops', async () => {
    const url = `file:///synthetic/cache-${++serial}/`, ops = { now: () => 0, write: () => undefined, load: async () => namespace(), emit: () => '' };
    const a = createBodyLiveLoadSession(source, legacy, 'reference', url, 60_000, ops);
    await a.load(source, 'base'); a.stop();
    const b = createBodyLiveLoadSession(source, legacy, 'reference', url, 60_000, ops);
    await expect(b.load(source, 'base')).rejects.toThrow('duplicate');
    expect(b.inspect()).toMatchObject({ writes: 0, imports: 0 });
  });
  it.each(['getter', 'hole', 'function'] as const)('refuses %s output without coercion or hook execution', async kind => {
    let hooks = 0;
    const { a } = session(), ns = await a.load(source, 'base');
    const value = kind === 'getter' ? Object.freeze({ get x() { hooks++; return 0; } })
      : kind === 'hole' ? Object.freeze(Array(1)) : Object.freeze({ toJSON: () => { hooks++; return 0; } });
    expect(() => a.record(ns, 's_normal', Object.freeze({}), value)).toThrow('observation');
    expect(hooks).toBe(0);
  });
  it.each(['write', 'import', 'before'] as const)('uses the original absolute deadline at %s', async at => {
    let time = 0;
    const { a } = session({ now: () => time, write: () => { if (at === 'write') time = 60_000; },
      load: async () => { if (at === 'import') time = 60_000; return namespace(); } });
    if (at === 'before') time = 60_000;
    await expect(a.load(source, 'base')).rejects.toThrow('deadline');
    expect(a.inspect()).toMatchObject({ completed: 0, first: 'deadline', imports: at === 'import' ? 1 : 0 });
  });
  it.each(['throw', 'reverse', 'nan'] as const)('retains a fixed %s clock refusal', async kind => {
    let bad = false;
    const { a } = session({ now: () => { if (!bad) return 10; if (kind === 'throw') throw Error('secret'); return kind === 'reverse' ? 9 : NaN; } });
    bad = true;
    await expect(a.load(source, 'base')).rejects.toThrow('clock');
    expect(a.inspect().first).toBe('clock');
  });
  it.each(['write', 'import'] as const)('keeps the reservation and fixed reason after %s failure', async at => {
    const { a } = session(at === 'write' ? { write: () => { throw Error('secret'); } } : { load: async () => { throw Error('secret'); } });
    await expect(a.load(source, 'base')).rejects.toThrow(/^io$/);
    await expect(a.load(source, 'base')).rejects.toThrow(/^io$/);
    expect(a.inspect()).toMatchObject({ completed: 0, writes: 1, busy: false, first: 'io' });
  });
  it('rejects hostile namespaces and observations without running hooks', async () => {
    let hooks = 0, promiseProbes = 0;
    const bad = () => { hooks++; throw Error('hook'); }, proxy = new Proxy({}, {
      get(_target, key) { if (key === 'then') { promiseProbes++; return undefined; } return bad(); },
      ownKeys: bad, getOwnPropertyDescriptor: bad,
    });
    const first = session({ load: async () => proxy });
    await expect(first.a.load(source, 'base')).rejects.toThrow('namespace');
    const second = session(), ns = await second.a.load(source, 'base');
    expect(() => second.a.record(ns, 's_normal', proxy, Object.freeze({}))).toThrow('observation');
    expect(hooks).toBe(0);
    expect(promiseProbes).toBe(1); // Promise resolution precedes the namespace admission boundary.
  });
  it('classifies a failing Promise then probe as I/O, not as namespace inspection', async () => {
    let probes = 0;
    const proxy = new Proxy({}, { get() { probes++; throw Error('secret'); } });
    const { a } = session({ load: async () => proxy });
    await expect(a.load(source, 'base')).rejects.toThrow(/^io$/);
    expect(probes).toBe(1); expect(a.inspect().first).toBe('io');
  });
  it('never seals incomplete case or observation sets', () => {
    const { a } = session();
    expect(() => a.finish()).toThrow('incomplete');
    expect(a.inspect()).toMatchObject({ first: 'incomplete', completed: 0 });
  });
  it('derives both modes without changing any old assertion or the 19-line diagnostic block', () => {
    function protectedParts(code: string) {
      const file = ts.createSourceFile('oracle.mjs', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      const assertions: string[] = [], semantic: string[] = [];
      function walk(n: ts.Node) {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
          && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'assert') assertions.push(n.getText(file));
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && ['extra', 'options'].includes(n.name.text)) semantic.push(n.initializer!.getText(file));
        ts.forEachChild(n, walk);
      }
      walk(file); return { assertions, semantic };
    }
    for (const mode of ['js', 'reference'] as const) {
      const text = buildBodyLiveDriver(legacy, 'file:///original/legacy.mjs', 'file:///scratch/loader.js', '/scratch', mode);
      const ast = ts.createSourceFile('derived.mjs', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      let embedded = '';
      function walk(n: ts.Node) {
        if (ts.isCallExpression(n) && n.expression.getText(ast) === 'createBodyLiveLoadSession') embedded = (n.arguments[1] as ts.StringLiteral).text;
        ts.forEachChild(n, walk);
      }
      walk(ast); expect(embedded).toBe(legacy);
      expect(protectedParts(text)).toEqual(protectedParts(legacy));
      expect(text).toContain("size, 19);");
      expect(text).toContain("rmSync(dir, { recursive: true, force: true });");
    }
    expect(() => buildBodyLiveDriver(legacy + '\n', 'file:///original', 'file:///scratch', '/scratch', 'js')).toThrow('legacy_script_drift');
  });
});
