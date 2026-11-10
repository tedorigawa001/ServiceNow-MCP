/** B03-B scratch-only controls. No retirement operation, terminal success or body execution. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-exit-guard-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
function method(s, name, from, to) {
  const start = s.indexOf('  private ' + name + '('), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), from, to) + s.slice(end);
}
async function load(s, name) { const file = join(dir, name + '.js'); writeFileSync(file, emit(s)); return import(pathToFileURL(file).href); }
const inject = (s, code) => method(s, 'guardMix', "    const f = this.#guardScript.startsWith('g_mix_')", code + "\n    const f = this.#guardScript.startsWith('g_mix_')");
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const run = (m, script = 'g_normal') => { const a = m.createProbeExitGuardFake(script); a.prepare(); const r = a.run(); return { a, r, s: a.inspect() }; };
  const identity = [['bundle', 's.bundle === bundle'], ['control', 's.control === bundle.control'], ['link', 's.link === link'],
    ['duty', 's.duty === duty'], ['binding', 's.binding === b'], ['cells', 's.cells === this.#probeCells'], ['gate', 's.gate === b.gate'],
    ['scope', 's.scope === b.scope'], ['owner', 's.owner === this.#owner'], ['pin', 's.pin === b.pin'], ['epoch', 's.epoch === b.epoch'],
    ['packet', 's.packet === b.packet'], ['frame', 's.frame === link.frame'], ['entry', 's.entry === link.entry'], ['exit', 's.exit === link.exit'],
    ['copy', 's === this.#guardState'], ['brand', 's[PROBE_EXIT_GUARD] === true']];
  for (const [i, [field, clause]] of identity.entries()) {
    const script = 'g_mix_' + field; assert.equal(run(base, script).s.exitAttempts, 0);
    const m = await load(method(text, 'guardIdentityMatches', clause, 'true'), 'identity-' + i);
    const { s } = run(m, script); assert.equal(s.exitAttempts, 1, 'masked identity ' + field); assert.equal(s.progress.state, 'settling');
  }
  // Each malformed grant is injected after capture returns, so capture's earlier guard cannot mask the exit guard.
  const grants = [['copy', 'g === this.#grantIssued'], ['issued_copy', 'g === link.cells.grant.issued'],
    ['extra', 'Reflect.ownKeys(g).length === 11'], ['brand', 'g[PROBE_GRANT] === true'], ['bindingOrigin', 'g.bindingOrigin === link.origin'],
    ['gate', 'g.gate === b.gate.origin'], ['owner', 'g.owner === b.owner'], ['pin', 'g.pin === b.pin'], ['epoch', 'g.epoch === b.epoch'],
    ['frame', 'g.frame === link.frame'], ['draft', 'g.draft === b.draft'], ['entry', 'g.entry === link.entry'], ['exit', 'g.exit === link.exit'], ['phase', "g.phase === 'probe_only'"]];
  for (const [i, [field, clause]] of grants.entries()) {
    let code;
    if (field === 'copy') code = 'const cp = Object.freeze({ ...this.#grantIssued! }); this.#probeCells!.grant.current = cp; this.#probeCells!.grant.issued = cp;';
    else if (field === 'issued_copy') code = 'this.#probeCells!.grant.issued = Object.freeze({ ...this.#grantIssued! });';
    else {
      const change = field === 'extra' ? 'extra: true' : field === 'brand' ? '[PROBE_GRANT]: false' : field === 'phase' ? "phase: 'foreign'" : field + ': Object.freeze({})';
      code = `const cp = Object.freeze({ ...this.#grantIssued!, ${change} }) as unknown as CanonicalProbeGrant; this.#grantIssued = cp; this.#probeCells!.grant.current = cp; this.#probeCells!.grant.issued = cp;`;
    }
    const injected = inject(text, '    ' + code), checked = run(await load(injected, 'late-grant-' + i));
    assert.equal(checked.s.progress.branch, 'invalid'); assert.equal(checked.s.progress.knowledge, 'known');
    assert.equal(checked.s.progress.captureFirst, 'none'); assert.equal(checked.s.progress.rejectedRetained, false);
    const mutant = await load(method(injected, 'capturedGrantMatches', clause, 'true'), 'late-grant-mutant-' + i);
    assert.equal(run(mutant).s.progress.branch, 'known', 'masked late grant clause ' + field);
  }
  const boundary = [
    ['returned', 's.returned', 'g_history_unreturned', undefined],
    ['body', "c.body.state === 'not_started'", 'g_mix_body', undefined],
    ['outcome', "c.body.outcome === 'none'", 'g_normal', "Object.defineProperty(this.#probeCells!.body, 'outcome', { value: 'throw' });"],
    ['capture', '!this.#captureInProgress', 'g_normal', 'this.#captureInProgress = true;'],
    ['spent', '!d.attemptUsed', 'g_normal', 'this.#runIssuedDuty!.attemptUsed = true;'],
    ['phase', "d.phase === 'none'", 'g_normal', "Object.defineProperty(this.#runIssuedDuty!, 'phase', { value: 'history' });"],
    ['boundary', "d.boundary === 'none'", 'g_normal', "Object.defineProperty(this.#runIssuedDuty!, 'boundary', { value: 'before' });"],
    ['use-phase', "c.use.state === 'entering'", 'g_normal', "Object.defineProperty(this.#probeCells!.use, 'state', { value: 'active' });"],
    ['accepted', 'c.exit.accepted === undefined', 'g_normal', "Object.defineProperty(this.#probeCells!.exit, 'accepted', { value: this.#runIssuedLink });"],
  ];
  for (const [i, [name, clause, script, code]] of boundary.entries()) {
    const source = code ? inject(text, '    ' + code) : text;
    const checked = run(await load(source, 'boundary-' + i), script); assert.equal(checked.s.exitAttempts, 0, name);
    const mutant = await load(method(source, 'guardHistoryBoundary', clause, 'true'), 'boundary-mutant-' + i);
    assert.equal(run(mutant, script).s.exitAttempts, 1, 'masked history boundary ' + name);
  }
  const callBoundary = await load(method(text, 'guardHistory', 'if (!this.#grantCallStarted)', 'if (this.#grantAttempts === 0)'), 'call-boundary');
  assert.equal(run(base, 'g_reserved_not_called').s.progress.branch, 'not_called');
  assert.equal(run(callBoundary, 'g_reserved_not_called').s.progress.branch, 'invalid');
  const unknown = await load(replace(text, 's.branch = this.guardHistory();', "s.branch = 'known';"), 'unknown-promotion');
  assert.equal(run(base, 'g_unknown').s.progress.state, 'failed'); assert.equal(run(unknown, 'g_unknown').s.progress.state, 'settling');
  const skipped = await load(replace(text, 'const captured = this.captureProbeGrant(); s.captureFirst = captured.first;',
    "const captured = this.captureProbeGrant(); if (captured.first !== 'none') return captured as unknown as ProbeExitGuardReply; s.captureFirst = captured.first;"), 'first-short-circuit');
  assert.equal(run(base, 'g_known_issuer').s.exitAttempts, 1); assert.equal(run(skipped, 'g_known_issuer').s.exitAttempts, 0);
  const reentry = await load(replace(text, "if (s.inProgress) return this.guardReply(s, 'run_in_progress');", ''), 'reentry');
  assert.equal(run(base, 'g_reenter_history_before').s.progress.reentry, 'run_in_progress');
  assert.equal(run(reentry, 'g_reenter_history_before').s.progress.reentry, 'unconfirmed');
  const refund = await load(replace(text, "duty.state = 'settling'; duty.attemptUsed = true;", "duty.state = 'settling'; duty.attemptUsed = false;"), 'refund');
  assert.equal(run(base).s.anchor.duty.attemptUsed, true); assert.equal(run(refund).s.anchor.duty.attemptUsed, false);
  const metric = await load(replace(text, "cells.use.state = 'exiting'; s.exitUsed = true;", "cells.use.state = 'exiting'; s.exitUsed = false;"), 'claim-metric');
  assert.equal(run(metric).s.exitAttempts, 0); assert.equal(run(metric).s.anchor.duty.attemptUsed, true);
  const retained = await load(replace(text, 's.captureReply = captured;', 's.captureReply = undefined;'), 'lost-capture');
  assert.equal(run(base, 'g_known_issuer').s.progress.captureReplyRetained, true); assert.equal(run(retained, 'g_known_issuer').s.progress.captureReplyRetained, false);
  const baseSnapshot = run(base).s;
  const projection = [['sameDuty: s.duty === this.#runIssuedDuty && s.control.duty === this.#runIssuedDuty', 'sameDuty: s.duty', s => typeof s.progress.sameDuty === 'boolean'],
    ['captureReplyRetained: s.captureReply !== undefined', 'captureReplyRetained: s.captureReply', s => typeof s.progress.captureReplyRetained === 'boolean']];
  for (const [i, [from, to, safe]] of projection.entries()) {
    assert.equal(safe(baseSnapshot), true);
    // Snapshot is projected a second time: a raw object must not become a positive boolean.
    const source = method(text, 'guardSnapshot', from, to);
    const m = await load(source, 'projection-' + i);
    assert.equal(safe(run(m).s), true); assert.equal(run(m).s.progress[i === 0 ? 'sameDuty' : 'captureReplyRetained'], false);
    const property = i === 0 ? 'sameDuty' : 'captureReplyRetained';
    const leaked = await load(replace(source, `${property}: s?.${property} === true`, `${property}: s?.${property}`), 'outer-leak-' + i);
    assert.equal(safe(run(leaked).s), false);
  }
  const bodyTrap = await load(replace(text, '    this.#frame = true;\n    try { this.generationFrame(); }',
    "    throw Error('forbidden_body_entry');\n    this.#frame = true;\n    try { this.generationFrame(); }"), 'body-trap');
  const a = run(bodyTrap).a; a.check(); a.checkLegacy(); a.close();
  assert.equal(a.inspect().anchor.start.generationBodyCalls, 0); assert.equal(a.inspect().anchor.start.retirementStarts, 0);
  assert.equal(a.inspect().retirementAttempts, 0); assert.equal(a.inspect().terminalCommits, 0);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const typedGuard: ProbeExitGuardState;
const badSettled: ProbeExitGuardState = { ...typedGuard, state: 'settled_not_started' };
const badHeld: ProbeExitGuardState = { ...typedGuard, state: 'held_unsealed' };
const badPhase: ProbeExitGuardState = { ...typedGuard, phase: 'foreign' };
const badBranch: ProbeExitGuardState = { ...typedGuard, branch: 'retired' };
const badOk: ProbeExitGuardReply = { ...PROBE_GUARD_CLOSED, first: 'none', captureFirst: 'none', disposition: 'settling_held', ok: true };
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, text + extra, language, true) : getSource(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= text.length), 'unexpected baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 5);
  console.log(JSON.stringify({ compiled: true, identityControls: identity.length, lateGrantControls: grants.length, historyBoundaryControls: boundary.length,
    callBoundary: true, unknownControl: true, firstPreservation: true, reentryControl: true, nonRefundControls: 2,
    captureRetention: true, defensiveProjectionControls: projection.length, bodyTrap: true, typeRejections: 5 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
