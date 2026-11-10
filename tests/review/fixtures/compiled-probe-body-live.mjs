/** BC06..11 only. Every mutant is emitted into disposable scratch, never runtime. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-body-live-'));
const emitted = new Set();
const emit = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b) {
  const start = s.indexOf('  private ' + name + '('), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
function relation(s, n, a, b) {
  const start = s.indexOf('  private bodyLiveDataMatches('), end = s.indexOf('\n  }\n', start) + 5, body = s.slice(start, end);
  const lo = body.indexOf(n === 11 ? '    const v = value as BodyUnwindInitial;' : `    if (n === ${n})`);
  const hi = n === 11 ? body.length : body.indexOf(n === 10 ? '    const v = value as BodyUnwindInitial;' : `    if (n === ${n + 1})`);
  assert.ok(lo >= 0 && hi > lo);
  return s.slice(0, start) + body.slice(0, lo) + replace(body.slice(lo, hi), a, b) + body.slice(hi) + s.slice(end);
}
async function load(text, name) {
  assert.ok(!emitted.has(name), 'unique module URL: ' + name); emitted.add(name);
  const f = join(dir, name + '.js'); writeFileSync(f, emit(text)); return import(pathToFileURL(f).href);
}
const run = (m, script = 's_normal') => { const a = m.createProbeBodyLiveFake(script), r = a.prepare(); return { a, r, s: a.inspect() }; };
const inject = (phase, boundary, code) => method(source, 'bodySeedPoint', '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
  `    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\n    if (phase === '${phase}' && boundary === '${boundary}') { ${code} }`);
const slot = i => `this.#bodySeedShell!.slots![${i - 1}]!`;
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'); assert.equal(run(base).r.disposition, 'live_held');
  const rows = [
    [['pin', 'v.pin === pin'], ['bodyCell', 'v.bodyCell === ctx.cells.body'], ['activationConfirmed', 'v.activationConfirmed === false'],
      ['callReserved', 'v.callReserved === false'], ['entryObserved', 'v.entryObserved === false'], ['returnCaptured', 'v.returnCaptured === false'],
      ['callPhase', "v.callPhase === 'body_not_called'"], ['outcome', "v.outcome === 'none'"]],
    [['pin', 'v.pin === pin'], ['progress', 'v.progress === slots[5]!.current'], ['bodyEntryClosed', 'v.bodyEntryClosed === false'],
      ['controlReturned', 'v.controlReturned === false'], ['continuationState', "v.continuationState === 'unobserved'"]],
    [['context', 'v.context === ctx'], ['rootFailure', 'v.rootFailure === this.#failure'], ['cellDiagnostic', 'v.cellDiagnostic === ctx.cells.diagnostic'],
      ...['probeFirst', 'exitFirst', 'deliveryFirst', 'failurePhase', 'failureBoundary', 'refusal'].map(k => [k, `v.${k} === 'none'`])],
    [['pin', 'v.pin === pin'], ['duty', 'v.duty === ctx.duty'], ['control', 'v.control === ctx.control'], ['kind', "v.kind === 'not_attempted'"],
      ...['used', 'blocked', 'confirmed'].map(k => [k, `v.${k} === false`]), ...['target', 'blockedTarget', 'confirmedTarget'].map(k => [k, `v.${k} === undefined`])],
    [['pin', 'v.pin === pin'], ['duty', 'v.duty === ctx.duty'], ['progress', 'v.progress === slots[5]!.current'],
      ['retirement', 'v.retirement === slots[8]!.current'], ['terminalAnchor', 'v.terminalAnchor === ctx.exitBundle.terminal'],
      ['kind', "v.kind === 'none'"], ['prepared', 'v.prepared === false'], ['committed', 'v.committed === false'],
      ...['candidate', 'issued', 'accepted'].map(k => [k, `v.${k} === undefined`])],
    [['context', 'v.context === ctx'], ['pin', 'v.pin === pin'], ['progress', 'v.progress === slots[5]!.current'],
      ['closure', 'v.closure === slots[6]!.current'], ['diagnostic', 'v.diagnostic === slots[7]!.current'],
      ['retirement', 'v.retirement === slots[8]!.current'], ['terminal', 'v.terminal === slots[9]!.current'],
      ['state', "v.state === 'idle'"], ['routeUsed', 'v.routeUsed === false'], ['inProgress', 'v.inProgress === false'],
      ['phase', "v.phase === 'none'"], ['boundary', "v.boundary === 'none'"], ['fixedReply', 'v.fixedReply === undefined']],
  ];
  let fields = 0;
  for (const [i, row] of rows.entries()) for (const [key, clause] of row) {
    const script = `s_live_mix_${i + 6}_${key}`, checked = run(base, script);
    assert.equal(checked.s.failurePhase, `BC${String(i + 6).padStart(2, '0')}`); assert.equal(checked.r.first, 'binding_mismatch');
    assert.equal(run(await load(relation(source, i + 6, clause, 'true'), 'field-' + fields++), script).r.disposition, 'live_held', script);
  }
  const brands = ['BODY_PROGRESS', 'BODY_CLOSURE', 'BODY_DIAGNOSTIC', 'BODY_RETIREMENT', 'BODY_TERMINAL', 'BODY_UNWIND'];
  for (let n = 6; n <= 11; n++) {
    const copy = method(source, 'bodyLiveDataMatches', 'value !== cell.issued || ', '');
    assert.equal(run(base, `s_live_mix_${n}_copy`).r.first, 'binding_mismatch');
    assert.equal(run(await load(copy, 'copy-' + n), `s_live_mix_${n}_copy`).r.disposition, 'live_held');
    const brand = relation(source, n, `v[${brands[n - 6]}] === true`, 'true');
    assert.equal(run(await load(brand, 'brand-' + n), `s_live_mix_${n}_brand`).r.disposition, 'live_held');
    const noFixed = method(source, 'bodyLiveDataMatches', '!this.bodyLiveDescriptors(value, n, true) || ', '');
    assert.equal(run(base, `s_live_mix_${n}_mutable_ref`).r.first, 'binding_mismatch');
    assert.equal(run(await load(noFixed, 'fixed-' + n), `s_live_mix_${n}_mutable_ref`).r.disposition, 'live_held');
    const noWritable = method(source, 'bodyLiveDataMatches', ' || !this.bodyLiveDescriptors(value, n, false)', '');
    assert.equal(run(base, `s_live_mix_${n}_freeze`).r.first, 'binding_mismatch');
    assert.equal(run(await load(noWritable, 'writable-' + n), `s_live_mix_${n}_freeze`).r.disposition, 'live_held');
    assert.equal(run(base, `s_live_mix_${n}_getter`).s.hookCalls, 0);
  }
  // Every prior position, not only declared direct dependencies, is rechecked before each producer.
  let prefix = 0;
  for (let n = 6; n <= 11; n++) for (let prior = 1; prior < n; prior++) {
    const phase = `BC${String(n).padStart(2, '0')}`;
    const bad = inject(phase, 'before', `${slot(prior)}.stage = 'provisional';`);
    const checked = run(await load(bad, 'prior-stage-' + prefix)); assert.equal(checked.s.failurePhase, phase); assert.equal(checked.s.failureBoundary, 'before');
    const bypass = method(bad, 'bodyLivePrefixMatches', "c.stage === 'confirmed' && ", '');
    assert.equal(run(await load(bypass, 'prior-stage-mutant-' + prefix)).r.disposition, 'live_held');
    const copied = inject(phase, 'before', `${slot(prior)}.current = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(${slot(prior)}.current!)));`);
    const rejected = run(await load(copied, 'prior-copy-' + prefix)); assert.equal(rejected.s.failurePhase, phase); assert.equal(rejected.s.failureBoundary, 'before');
    const without = method(copied, 'bodyLivePrefixMatches', '(i < 5 ? this.bodySeedDataMatches(i + 1) : this.bodyLiveDataMatches(i + 1))', 'true');
    const bypassed = run(await load(without, 'prior-copy-mutant-' + prefix++));
    // Later direct-child checks can still reject context/pin copies. They must not mask
    // the loss of the pre-producer check: its first rejecting position has to change.
    assert.ok(bypassed.r.disposition === 'live_held' || bypassed.s.failurePhase !== phase || bypassed.s.failureBoundary !== 'before');
  }
  // Base, target emptiness and suffix are checked at the first rejecting phase, not hidden by final rejection.
  const preflights = [
    ['base', 6, 'before', "this.#issuedCells!.body.state = 'running';", 'bodyLiveMint', '!this.bodySeedBaseMatches() || ', ''],
    ['target-stage', 8, 'before', `${slot(8)}.stage = 'attempting';`, 'bodyLivePrefixMatches', "c.stage === 'not_started' && ", ''],
    ['target-reserved', 8, 'before', `${slot(8)}.attemptReserved = true;`, 'bodyLivePrefixMatches', 'c.attemptReserved === false && ', ''],
    ['target-call', 8, 'before', `${slot(8)}.callBoundaryReached = true;`, 'bodyLivePrefixMatches', 'c.callBoundaryReached === false', 'true'],
    ['suffix', 10, 'before', `${slot(13)}.attemptReserved = true;`, 'bodyLivePrefixMatches', 'c.attemptReserved === false && ', ''],
    ['final-base', 11, 'confirmed', "this.#issuedCells!.body.state = 'running';", 'prepareBodyLive', '!this.bodySeedBaseMatches() || ', ''],
    ['final-prefix', 11, 'confirmed', `${slot(6)}.current!.callReserved = true;`, 'prepareBodyLive', ' || !this.bodyLivePrefixMatches(11)', ''],
  ];
  for (const [name, n, boundary, code, target, a, b] of preflights) {
    const phase = `BC${String(n).padStart(2, '0')}`, bad = inject(phase, boundary, code), checked = run(await load(bad, 'preflight-' + name));
    assert.equal(checked.r.first, 'binding_mismatch', name); assert.equal(checked.s.failurePhase, phase, name); assert.equal(checked.s.failureBoundary, boundary, name);
    const changed = run(await load(method(bad, target, a, b), name + '-mutant'));
    assert.ok(changed.r.disposition === 'live_held' || changed.s.failurePhase !== phase || changed.s.failureBoundary !== boundary, name);
  }
  const missingIssued = method(source, 'bodyLiveMint', "cell.issued = raw; cell.stage = 'issued';", "cell.stage = 'issued';");
  assert.equal(run(base, 's_fault_BC06_issued').s.slots[5].issuedRetained, true);
  assert.equal(run(await load(missingIssued, 'missing-issued'), 's_fault_BC06_issued').s.slots[5].issuedRetained, false);
  const writes = inject('BC07', 'before', `(${slot(6)}.current as any).pin = {};`);
  assert.equal(run(await load(writes, 'readonly-ref')).r.first, 'construction_unconfirmed');
  // Confirmed live state stays writable but cannot escape its Initial relation unnoticed.
  const liveWrite = inject('BC07', 'before', `(${slot(6)}.current as any).callReserved = true;`);
  const liveRejected = run(await load(liveWrite, 'live-write')); assert.equal(liveRejected.r.first, 'binding_mismatch'); assert.equal(liveRejected.s.failurePhase, 'BC07');
  const sameRejected = replace(source, 'rejectedRetained: c?.rejected !== undefined,', 'rejectedRetained: c?.rejected !== undefined, rejectedSame: c?.rejected !== undefined && c.rejected === c.current,');
  assert.equal(run(await load(sameRejected, 'rejected'), 's_live_mix_10_copy').s.slots[9].rejectedSame, true);
  const diag = inject('BC09', 'before', "this.fail('state_invalid'); throw Error('after_diagnostic');");
  const diagOut = run(await load(diag, 'diag-first')); assert.equal(diagOut.r.first, 'state_invalid'); assert.equal(diagOut.a.close(), diagOut.r);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const p: BodyProgressInitial;
declare const c: BodyRouteClosureInitial;
declare const d: BodyDiagnosticInitial;
declare const r: BodyRetirementInitial;
declare const t: BodyTerminalInitial;
declare const u: BodyUnwindInitial;
const badP: BodyProgressInitial = { ...p, activationConfirmed: true };
const badCall: BodyProgressInitial = { ...p, callPhase: 'not_called' };
const badOutcome: BodyProgressInitial = { ...p, outcome: 'return' };
const badC: BodyRouteClosureInitial = { ...c, continuationState: 'closed' };
const badD: BodyDiagnosticInitial = { ...d, probeFirst: 'probe_throw' };
const badR: BodyRetirementInitial = { ...r, kind: 'confirmed' };
const badT: BodyTerminalInitial = { ...t, accepted: {} };
const badCommit: BodyTerminalInitial = { ...t, committed: true };
const badU: BodyUnwindInitial = { ...u, state: 'terminal' };
const badRoute: BodyUnwindInitial = { ...u, routeUsed: true };
const badReply: BodyUnwindInitial = { ...u, fixedReply: {} };
const badPin: BodyProgressInitial = { ...p, pin: u.context.pin };
const badFn: BodyProgressInitial = { ...p, body: () => 1 };
p.pin = p.pin;
c.progress = p;
d.rootFailure = d.rootFailure;
r.duty = r.duty;
t.candidate = undefined;
u.terminal = t;
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, source + extra, language, true) : get(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 19);
  console.log(JSON.stringify({ compiled: true, fields, brands: 6, copies: 6, fixedReferenceControls: 6, writableControls: 6,
    priorStageControls: prefix, priorIdentityControls: prefix, preflightControls: preflights.length, issuedRetention: true,
    readonlyRuntime: true, liveInitialRecheck: true, rejectedIdentity: true, priorDiagnosis: true, typeRejections: 19 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
