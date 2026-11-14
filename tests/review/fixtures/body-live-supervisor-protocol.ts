/** Strict legacy two-summary protocol, value-only and bounded before JSON parsing. */
import { isDeepStrictEqual } from 'node:util';

export type BodyLiveMode = 'reference' | 'js';
export const STREAM_BYTES = 65_536;
const legacy = {
  compiled: true, fields: 56, brands: 6, copies: 6, fixedReferenceControls: 6, writableControls: 6,
  priorStageControls: 45, priorIdentityControls: 45, preflightControls: 7, issuedRetention: true,
  readonlyRuntime: true, liveInitialRecheck: true, rejectedIdentity: true, priorDiagnosis: true,
  typeRejections: 19, livePrefixControls: 9, enumerableControl: true, sealedControl: true, phaseAllowlist: true,
};
const isolation = { freshFactories: true, freshBrands: true, closeIndependent: true, foreignRefusals: 2,
  copyRefusals: 1, proxyRefusals: 1, hooks: 0 };
function record(x: unknown): x is Record<string, unknown> { return !!x && typeof x === 'object' && !Array.isArray(x); }
function keys(x: Record<string, unknown>, names: string[]) {
  return isDeepStrictEqual(Object.keys(x).sort(), names.sort());
}
const hash = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);

// Recognize a syntactically extendible unfinished object, not arbitrary malformed text. Bounded by
// the same 64-KiB input and depth 16 (well above the fixed protocol's depth). Never creates values.
function unfinishedObject(text: string) {
  const partial = Symbol(), invalid = Symbol(); let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[i] ?? 'x')) i++; };
  function char(expected: string) { ws(); if (i === text.length) throw partial; if (text[i++] !== expected) throw invalid; }
  function string() {
    char('"');
    while (true) {
      if (i === text.length) throw partial;
      const c = text[i++];
      if (c === '"') return;
      if (c.charCodeAt(0) < 32) throw invalid;
      if (c !== '\\') continue;
      if (i === text.length) throw partial;
      const escape = text[i++];
      if (escape === 'u') {
        for (let n = 0; n < 4; n++) {
          if (i === text.length) throw partial;
          if (!/[0-9a-f]/i.test(text[i++])) throw invalid;
        }
      } else if (!'"\\/bfnrt'.includes(escape)) throw invalid;
    }
  }
  function value(depth: number) {
    if (depth > 16) throw invalid;
    ws(); if (i === text.length) throw partial;
    const c = text[i];
    if (c === '"') { string(); return; }
    if (c === '{' || c === '[') {
      const object = c === '{', end = object ? '}' : ']'; i++; ws();
      if (text[i] === end) { i++; return; }
      while (true) {
        if (object) { string(); char(':'); }
        value(depth + 1); ws();
        if (i === text.length) throw partial;
        if (text[i] === end) { i++; return; }
        char(',');
      }
    }
    for (const literal of ['true', 'false', 'null']) {
      if (c !== literal[0]) continue;
      for (const x of literal) { if (i === text.length) throw partial; if (text[i++] !== x) throw invalid; }
      return;
    }
    if (c === '-') { i++; if (i === text.length) throw partial; }
    if (text[i] === '0') i++;
    else {
      if (!/[1-9]/.test(text[i] ?? 'x')) throw invalid;
      while (/[0-9]/.test(text[i] ?? 'x')) i++;
    }
    if (text[i] === '.') {
      i++; if (i === text.length) throw partial;
      if (!/[0-9]/.test(text[i])) throw invalid;
      while (/[0-9]/.test(text[i] ?? 'x')) i++;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++; if (text[i] === '+' || text[i] === '-') i++;
      if (i === text.length) throw partial;
      if (!/[0-9]/.test(text[i])) throw invalid;
      while (/[0-9]/.test(text[i] ?? 'x')) i++;
    }
  }
  if (!text.trimStart().startsWith('{')) return false;
  try { value(0); ws(); return false; } catch (e) { return e === partial; }
}

export function isIncompleteBodyLiveControl(bytes: Uint8Array) {
  if (bytes.byteLength > STREAM_BYTES) return false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), lines = text.trim().split('\n');
    if (!text.trim()) return true;
    if (lines.length > 2) return false;
    let first: unknown;
    try { first = JSON.parse(lines[0]); }
    catch { return lines.length === 1 && !text.endsWith('\n') && unfinishedObject(lines[0]); }
    if (!isDeepStrictEqual(first, legacy)) return false;
    return lines.length === 1 || (!text.endsWith('\n') && unfinishedObject(lines[1]));
  } catch { return false; }
}

export function inspectBodyLiveProtocol(bytes: Uint8Array, mode: BodyLiveMode):
  { ok: false } | { ok: true; fingerprint: string } {
  if (bytes.byteLength > STREAM_BYTES) return { ok: false };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const lines = text.trim().split('\n');
    if (lines.length !== 2) return { ok: false };
    const old: unknown = JSON.parse(lines[0]), value: unknown = JSON.parse(lines[1]);
    if (!isDeepStrictEqual(old, legacy) || !record(value)
      || !keys(value, ['blb', 'mode', 'payloadEmits', 'execution', 'isolation', 'loader'])
      || value.blb !== true || value.mode !== mode || value.payloadEmits !== (mode === 'js' ? 2 : 306)
      || !isDeepStrictEqual(value.isolation, isolation)) return { ok: false };
    const e = value.execution;
    if (!record(e) || !keys(e, ['modules', 'observations', 'digest', 'caseDigests'])
      || e.modules !== 304 || e.observations !== 385 || !hash(e.digest)
      || !Array.isArray(e.caseDigests) || e.caseDigests.length !== 304 || !e.caseDigests.every(hash)) return { ok: false };
    if (!isDeepStrictEqual(value.loader, { phase: 'sealed', first: 'none', busy: false, completed: 304,
      writes: 304, imports: 304, observations: 385, isolationImports: 2, isolationConfirmed: true,
      bodyTranspiles: mode === 'js' ? 1 : 304, normalRoute: 'unchanged', bodyStartup: 'closed' })) return { ok: false };
    // Explicit field order, independent of incoming JSON object-key order. Case order is not sorted.
    return { ok: true, fingerprint: JSON.stringify([e.modules, e.observations, e.digest, e.caseDigests]) };
  } catch { return { ok: false }; }
}
