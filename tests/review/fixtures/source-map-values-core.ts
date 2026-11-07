/** Synthetic DATA only: no file I/O, hash computation, issuer, budget or runtime linkage. */
import { types } from 'node:util';

type FileRole = 'source' | 'test' | 'oracle';
interface SourceFile { readonly id: string; readonly path: string; readonly role: FileRole;
  readonly expectedSha256: string; readonly expectedBytes: number }
const closed = { authority: 'none', ready: false, hash: 'not_checked', mapping: 'shape_only',
  implementation: 'unknown', runtimeCoverage: 'unknown', nativeCost: 'unknown',
  entryRequirement: 'unknown', seedRequirement: 'unknown', coreInvocation: 'not_called' } as const;
type Result<T> = ({ readonly ok: true; readonly value: T } |
  { readonly ok: false; readonly reason: 'mapping_invalid' }) & typeof closed;
function invalid(): never { throw new Error('mapping_invalid'); }
function inspect<T>(decode: () => T): Result<T> {
  try { return Object.freeze({ ok: true, value: decode(), ...closed }); }
  catch { return Object.freeze({ ok: false, reason: 'mapping_invalid', ...closed }); }
}
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || types.isProxy(input)) invalid();
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) invalid();
  const names = Reflect.ownKeys(input);
  if (names.length !== keys.length) invalid();
  const out = Object.create(null) as Record<string, unknown>;
  keys.forEach((key, i) => {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (names[i] !== key || !d || !d.enumerable || !('value' in d)) invalid();
    out[key] = d.value;
  });
  return out;
}
function list(input: unknown, max: number): unknown[] {
  if (!input || typeof input !== 'object' || types.isProxy(input) || !Array.isArray(input)
    || Object.getPrototypeOf(input) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
  if (typeof length !== 'number' || length > max || Reflect.ownKeys(input).length !== length + 1) invalid();
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !d.enumerable || !('value' in d)) invalid();
    out.push(d.value);
  }
  return out;
}
function text(input: unknown, max: number, pattern: RegExp): string {
  if (typeof input !== 'string' || input.length > max || !pattern.test(input)) invalid();
  return input;
}
function choice<T extends string>(input: unknown, values: readonly T[]): T {
  if (typeof input !== 'string' || !values.includes(input as T)) invalid();
  return input as T;
}
function number(input: unknown, max: number): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1 || input > max) invalid();
  return input;
}
function dictionary(input: unknown): readonly SourceFile[] {
  let previous = '', total = 0;
  const paths = new Set<string>();
  const files = list(input, 32).map(raw => {
    const v = record(raw, ['id', 'path', 'role', 'expectedSha256', 'expectedBytes']);
    const id = text(v.id, 3, /^[FTO](?:0[1-9]|[1-9][0-9])$/);
    if (id <= previous) invalid();
    previous = id;
    const role = choice(v.role, ['source', 'test', 'oracle']);
    if (id[0] !== ({ source: 'F', test: 'T', oracle: 'O' } as const)[role]) invalid();
    const path = text(v.path, 256, /^[A-Za-z0-9_./-]+$/);
    if (path.split('/').some(part => !part || part === '.' || part === '..') || paths.has(path.toLowerCase())) invalid();
    paths.add(path.toLowerCase());
    const expectedSha256 = text(v.expectedSha256, 64, /^[0-9a-f]{64}$/);
    const expectedBytes = number(v.expectedBytes, 1_048_576);
    total += expectedBytes;
    if (total > 8_388_608) invalid();
    return Object.freeze({ id, path, role, expectedSha256, expectedBytes });
  });
  return Object.freeze(files);
}
export function inspectSourceDictionary(input: unknown): Result<readonly SourceFile[]> { return inspect(() => dictionary(input)); }

type Phase = 'before_entry' | 'entry_prepare' | 'entry_terminal' | 'seed' | 'handoff';
type CostOwner = 'base_unknown' | 'k0_excluded' | 'entry_prepare' | 'entry_terminal' | 'seed' | 'split_unknown';
type Prefix = 'normal' | 'refused' | 'partial';
interface Binding { readonly step: string; readonly fileId: string; readonly symbol: string;
  readonly site: 'producer' | 'callsite' | 'helper' | 'module_init'; readonly role: 'reference_only' | 'implementation';
  readonly phase: Phase; readonly costOwner: CostOwner; readonly costStep: string | null;
  readonly prefixes: readonly Prefix[]; readonly tests: readonly string[] }
type Row = { readonly id: string; readonly bindings: readonly Binding[]; readonly missing: readonly string[] } &
  ({ readonly status: 'unimplemented' } | { readonly status: 'partial_reference' } | { readonly status: 'mapped_unverified' });
interface SourceMapDraft { readonly model: 'wfb-source-map-draft-values-1'; readonly files: readonly SourceFile[];
  readonly rows: readonly Row[]; readonly ready: false; readonly runtimeCoverage: 'unknown';
  readonly nativeCost: 'unknown'; readonly entryRequirement: 'unknown'; readonly seedRequirement: 'unknown' }
const identifier = (v: unknown) => text(v, 64, /^[A-Za-z_][A-Za-z0-9_]*$/);
function ordered<T extends string>(input: unknown, max: number, decode: (raw: unknown) => T): readonly T[] {
  let previous = '';
  return Object.freeze(list(input, max).map(raw => {
    const v = decode(raw);
    if (v <= previous) invalid();
    previous = v;
    return v;
  }));
}
export function inspectSourceMapDraft(input: unknown): Result<SourceMapDraft> {
  return inspect(() => {
    const v = record(input, ['model', 'files', 'rows', 'ready', 'runtimeCoverage', 'nativeCost', 'entryRequirement', 'seedRequirement']);
    if (v.model !== 'wfb-source-map-draft-values-1' || v.ready !== false || v.runtimeCoverage !== 'unknown'
      || v.nativeCost !== 'unknown' || v.entryRequirement !== 'unknown' || v.seedRequirement !== 'unknown') invalid();
    const files = dictionary(v.files), byId = new Map(files.map(f => [f.id, f]));
    const rawRows = list(v.rows, 12);
    if (rawRows.length !== 12) invalid();
    const owners = new Set<string>(), locations = new Set<string>();
    const rows = rawRows.map((raw, index): Row => {
      const r = record(raw, ['id', 'status', 'bindings', 'missing']);
      if (r.id !== `SC${String(index + 1).padStart(2, '0')}`) invalid();
      const status = choice(r.status, ['unimplemented', 'partial_reference', 'mapped_unverified']);
      const missing = ordered(r.missing, 32, identifier);
      let previous = '';
      const rowLocations = new Set<string>();
      const bindings = list(r.bindings, 32).map((rawBinding): Binding => {
        const b = record(rawBinding, ['step', 'fileId', 'symbol', 'site', 'role', 'phase', 'costOwner', 'costStep', 'prefixes', 'tests']);
        const step = identifier(b.step);
        if (step <= previous) invalid();
        previous = step;
        const fileId = text(b.fileId, 3, /^F(?:0[1-9]|[1-9][0-9])$/);
        if (byId.get(fileId)?.role !== 'source') invalid();
        const symbol = text(b.symbol, 128, /^[A-Za-z_][A-Za-z0-9_.:]*$/);
        const site = choice(b.site, ['producer', 'callsite', 'helper', 'module_init']);
        const role = choice(b.role, ['reference_only', 'implementation']);
        const rowLocation = `${fileId}/${symbol}/${site}/${role}`;
        if (rowLocations.has(rowLocation)) invalid();
        rowLocations.add(rowLocation);
        const phase = choice(b.phase, ['before_entry', 'entry_prepare', 'entry_terminal', 'seed', 'handoff']);
        const costOwner = choice(b.costOwner, ['base_unknown', 'k0_excluded', 'entry_prepare', 'entry_terminal', 'seed', 'split_unknown']);
        const prefixes = list(b.prefixes, 3).map(p => choice<Prefix>(p, ['normal', 'refused', 'partial']));
        if (!prefixes.length || prefixes.some((p, i) => i > 0 && ['normal', 'refused', 'partial'].indexOf(p)
          <= ['normal', 'refused', 'partial'].indexOf(prefixes[i - 1]))) invalid();
        const tests = ordered(b.tests, 8, raw => {
          const id = text(raw, 3, /^[TO](?:0[1-9]|[1-9][0-9])$/);
          if (!byId.has(id)) invalid();
          return id;
        });
        const costStep = role === 'implementation' ? identifier(b.costStep) : null;
        if (role === 'reference_only' && b.costStep !== null) invalid();
        if (role === 'implementation') {
          const location = `${fileId}/${symbol}/${site}`;
          if (!tests.length || owners.has(costStep!) || locations.has(location)) invalid();
          owners.add(costStep!); locations.add(location);
        }
        return Object.freeze({ step, fileId, symbol, site, role, phase, costOwner, costStep,
          prefixes: Object.freeze(prefixes), tests });
      });
      if (status === 'unimplemented' && (bindings.length || !missing.length)) invalid();
      if (status === 'partial_reference' && (!bindings.length || !missing.length)) invalid();
      if (status === 'mapped_unverified' && (missing.length || !bindings.some(b => b.role === 'implementation'))) invalid();
      return Object.freeze({ id: r.id as string, status, bindings: Object.freeze(bindings), missing });
    });
    return Object.freeze({ model: 'wfb-source-map-draft-values-1', files, rows: Object.freeze(rows), ready: false,
      runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' });
  });
}
