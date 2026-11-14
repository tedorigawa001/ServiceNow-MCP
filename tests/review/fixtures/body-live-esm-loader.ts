/** BL-B fixture-only session; no production entry, network, process or filesystem implementation. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createBodyLivePatchBoundary } from './body-live-migration.js';
import { legacyBodyLiveOracle } from './body-live-migration-oracle.js';

export interface BodyLiveLoadOps {
  now(): number;
  write(url: string, js: string): void;
  load(url: string): Promise<unknown>;
  emit(source: string): string;
}
type First = 'none' | 'clock' | 'deadline' | 'closed' | 'busy' | 'duplicate' | 'order' | 'source_mismatch'
  | 'drift' | 'io' | 'namespace' | 'observation' | 'incomplete' | 'isolation';
const issuedURLs = new Set<string>();
const namespaceOwners = new WeakMap<object, object>();
const factoryOwners = new WeakMap<object, object>();

/** Independent of fixture owners/claims. Only scratch URLs and public finite observations are retained. */
export function createBodyLiveLoadSession(source: string, script: string, mode: 'js' | 'reference', baseURL: string,
  deadline: number, ops: BodyLiveLoadOps) {
  if (mode !== 'js' && mode !== 'reference' || !Number.isFinite(deadline) || deadline <= 0 || deadline > 60_000
    || typeof baseURL !== 'string' || !baseURL.endsWith('/') || new URL(baseURL).protocol !== 'file:') throw Error('load_contract');
  const owner = Object.freeze({}), cases = legacyBodyLiveOracle(script);
  let phase: 'open' | 'failed' | 'sealed' = 'open', first: First = 'none', busy = false;
  let completed = 0, writes = 0, imports = 0, last = -Infinity, observations = 0, bytes = 0;
  let baselineJS: string | undefined, isolationUsed = false, isolationImports = 0, isolationConfirmed = false;
  const used = new Set<string>(), namespaces = new Map<object, string>(), factories = new Set<object>();
  const totalHash = createHash('sha256'), hashes = cases.map(() => createHash('sha256')), observed = cases.map(() => 0);
  function refuse(reason: Exclude<First, 'none'>): never {
    if (phase === 'sealed') throw Error('closed');
    if (first === 'none') first = reason;
    phase = 'failed'; throw Error(first);
  }
  function guard() {
    if (phase !== 'open') refuse(first === 'none' ? 'closed' : first);
    let now: number;
    try { now = ops.now(); } catch { return refuse('clock'); }
    if (phase !== 'open') refuse(first === 'none' ? 'closed' : first);
    if (!Number.isFinite(now) || now < 0 || now < last) refuse('clock');
    last = now;
    if (now >= deadline) refuse('deadline');
  }
  guard();
  const boundary = mode === 'js' ? createBodyLivePatchBoundary(source) : undefined;
  if (boundary && !boundary.ok) refuse('drift');
  guard();
  const inspect = () => Object.freeze({ phase, first, busy, completed, writes, imports, observations,
    isolationImports, isolationConfirmed, bodyTranspiles: mode === 'js' ? 1 : completed, normalRoute: 'unchanged', bodyStartup: 'closed' });
  function own(ns: unknown, id: string, recordable: boolean): object {
    if (!ns || typeof ns !== 'object' || types.isProxy(ns) || namespaceOwners.has(ns)) refuse('namespace');
    const d = Object.getOwnPropertyDescriptor(ns, 'createProbeBodyLiveFake');
    if (!d || !('value' in d) || typeof d.value !== 'function' || factories.has(d.value) || factoryOwners.has(d.value)) refuse('namespace');
    namespaceOwners.set(ns, owner); factoryOwners.set(d.value, owner); factories.add(d.value);
    if (recordable) namespaces.set(ns, id);
    return ns;
  }
  let summary: Readonly<{ modules: number; observations: number; digest: string; caseDigests: readonly string[] }> | undefined;
  return Object.freeze({
    async load(text: unknown, id: unknown): Promise<object> {
      guard();
      if (busy) refuse('busy');
      if (typeof id !== 'string' || !cases.some(c => c.id === id)) refuse('order');
      if (used.has(id)) refuse('duplicate');
      const c = cases[completed];
      if (!c || c.id !== id) refuse('order');
      let expected: string;
      try { expected = c.reference(source); } catch { return refuse('drift'); }
      if (typeof text !== 'string' || text !== expected) refuse('source_mismatch');
      const url = new URL(id + '.js', baseURL).href;
      if (issuedURLs.has(url)) refuse('duplicate');
      used.add(id); issuedURLs.add(url); busy = true;
      try {
        let js: string;
        if (mode === 'js') {
          const result = boundary?.ok ? boundary.patch(id) : undefined;
          if (!result?.ok) return refuse('drift');
          js = result.js;
        } else js = ops.emit(text);
        if (id === 'base') baselineJS = js;
        guard(); writes++; ops.write(url, js); guard();
        imports++; const ns = await ops.load(url); guard();
        const accepted = own(ns, id, true);
        guard(); completed++; return accepted;
      } catch { return refuse(first === 'none' ? 'io' : first); }
      finally { busy = false; }
    },
    record(ns: unknown, scenario: unknown, reply: unknown, snapshot: unknown) {
      guard();
      if (!ns || typeof ns !== 'object' || !namespaces.has(ns) || typeof scenario !== 'string' || scenario.length > 128) refuse('observation');
      const id = namespaces.get(ns)!, at = cases.findIndex(c => c.id === id);
      if (id !== 'base' && scenario !== cases[at].script) refuse('observation');
      let nodes = 0;
      function finite(v: unknown, depth: number): unknown {
        if (++nodes > 1000 || depth > 16) return refuse('observation');
        // JSON would fold -0 into 0, so it cannot enter the digest as a distinct value: refuse it instead.
        if (typeof v === 'string' && v.length <= 128 || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return v;
        if (!v || typeof v !== 'object' || types.isProxy(v)) return refuse('observation');
        const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
        if (proto !== (array ? Array.prototype : Object.prototype) || !Object.isFrozen(v)) return refuse('observation');
        const keys = Reflect.ownKeys(v);
        if (array && (v.length > 650 || keys.length !== v.length + 1)) return refuse('observation');
        const result: Record<string, unknown> = Object.create(null);
        for (const key of keys) {
          if (typeof key !== 'string' || key.length > 128) return refuse('observation');
          const d = Object.getOwnPropertyDescriptor(v, key)!;
          if (!('value' in d)) return refuse('observation');
          if (array && key === 'length') continue;
          if (!d.enumerable || array && !/^(0|[1-9][0-9]*)$/.test(key)) return refuse('observation');
          result[key] = finite(d.value, depth + 1);
        }
        return { kind: array ? 'array' : 'object', values: result };
      }
      const row = JSON.stringify([observations, id, scenario, finite(reply, 0), finite(snapshot, 0)]);
      bytes += Buffer.byteLength(row);
      if (observations >= 1024 || bytes > 4_194_304) refuse('observation');
      totalHash.update(row + '\n'); hashes[at].update(row + '\n'); observed[at]++; observations++;
    },
    async isolation() {
      guard();
      if (busy || completed !== 304 || isolationUsed || !baselineJS) return refuse('isolation');
      isolationUsed = true;
      // These two extra modules are controls only; no hooks are added to the 304 actual case modules.
      const file = ts.createSourceFile('control.js', baselineJS, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
      const root = file.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot') as ts.ClassDeclaration | undefined;
      const mint = root?.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(file) === 'bodyLiveMint');
      if (!mint || baselineJS.includes('__blbForeign')) return refuse('isolation');
      const once = (s: string, from: string, to: string) => {
        if (s.split(from).length !== 2) return refuse('isolation');
        return s.replace(from, to);
      };
      let body = once(mint.getText(file), 'cell.current = current;',
        'cell.current = n === 6 && __blbForeign !== undefined ? __blbForeign : current;');
      body = once(body, "this.bodySeedPoint(phase, 'confirmed');", "this.bodySeedPoint(phase, 'confirmed'); if (n === 6) __blbSeen = cell.current;");
      const code = 'let __blbForeign, __blbSeen;\n' + baselineJS.slice(0, mint.getStart(file)) + body + baselineJS.slice(mint.end)
        + '\nexport const __blbTest = Object.freeze({ capture: () => __blbSeen, offer: value => { __blbForeign = value; } });\n';
      interface Fake { prepare(): { disposition: string; first: string }; inspect(): Record<string, unknown>; close(): unknown }
      interface Control { createProbeBodyLiveFake(): Fake; __blbTest: { capture(): object; offer(value: unknown): void } }
      async function control(name: string): Promise<Control> {
        guard(); const url = new URL(name + '.js', baseURL).href;
        if (issuedURLs.has(url)) return refuse('duplicate');
        issuedURLs.add(url); ops.write(url, code); guard();
        isolationImports++; const ns = await ops.load(url); guard();
        return own(ns, name, false) as unknown as Control;
      }
      try {
        const aModule = await control('isolation-a'), bModule = await control('isolation-b');
        const a = aModule.createProbeBodyLiveFake(), b = bModule.createProbeBodyLiveFake();
        assert.equal(a.prepare().disposition, 'live_held'); assert.equal(b.prepare().disposition, 'live_held'); guard();
        const rawA = aModule.__blbTest.capture(), rawB = bModule.__blbTest.capture();
        assert.notEqual(rawA, rawB);
        assert.notEqual(Object.getOwnPropertySymbols(rawA)[0], Object.getOwnPropertySymbols(rawB)[0]);
        const bBefore = b.inspect(); a.close(); const aClosed = a.inspect();
        assert.deepEqual(b.inspect(), bBefore);
        const descriptorsA = Object.getOwnPropertyDescriptors(rawA), descriptorsB = Object.getOwnPropertyDescriptors(rawB);
        let hooks = 0;
        try {
          bModule.__blbTest.offer(rawA); assert.equal(bModule.createProbeBodyLiveFake().prepare().first, 'binding_mismatch');
          aModule.__blbTest.offer(rawB); assert.equal(aModule.createProbeBodyLiveFake().prepare().first, 'binding_mismatch');
          bModule.__blbTest.offer({ ...rawB }); assert.equal(bModule.createProbeBodyLiveFake().prepare().first, 'binding_mismatch');
          const bad = () => { hooks++; throw Error('control_hook'); };
          bModule.__blbTest.offer(new Proxy({}, { get: bad, ownKeys: bad, getPrototypeOf: bad, getOwnPropertyDescriptor: bad }));
          assert.equal(bModule.createProbeBodyLiveFake().prepare().first, 'binding_mismatch'); assert.equal(hooks, 0);
          assert.deepEqual(Object.getOwnPropertyDescriptors(rawA), descriptorsA);
          assert.deepEqual(Object.getOwnPropertyDescriptors(rawB), descriptorsB);
          assert.deepEqual(a.inspect(), aClosed); assert.deepEqual(b.inspect(), bBefore); guard();
        } finally { aModule.__blbTest.offer(undefined); bModule.__blbTest.offer(undefined); }
        const fresh = bModule.createProbeBodyLiveFake(); assert.equal(fresh.prepare().disposition, 'live_held');
        assert.equal(fresh.inspect().bodyStarts, 0); guard(); isolationConfirmed = true;
        return Object.freeze({ freshFactories: true, freshBrands: true, closeIndependent: true,
          foreignRefusals: 2, copyRefusals: 1, proxyRefusals: 1, hooks: 0 });
      } catch { return refuse(first === 'none' ? 'isolation' : first); }
    },
    finish() {
      if (summary) return summary;
      guard();
      if (busy || completed !== 304 || !isolationConfirmed || observed.some(n => n === 0)) refuse('incomplete');
      phase = 'sealed';
      summary = Object.freeze({ modules: completed, observations, digest: totalHash.digest('hex'),
        caseDigests: Object.freeze(hashes.map(h => h.digest('hex'))) });
      return summary;
    },
    stop() { if (phase === 'open') { first = 'closed'; phase = 'failed'; } },
    inspect,
  });
}
