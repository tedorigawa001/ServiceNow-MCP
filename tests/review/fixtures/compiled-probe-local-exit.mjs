/** B03-C scratch-only controls. No runtime registration, body or formal exit issuer. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-local-exit-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
function method(s, name, from, to) {
  const start = s.indexOf('  private ' + name + '('), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), from, to) + s.slice(end);
}
const inject = (s, phase, code) => method(s, 'localPoint', "    const suffix = this.#localScript.replace", `    if (phase === '${phase}' && boundary === 'before') { ${code} }\n    const suffix = this.#localScript.replace`);
async function load(s, name) { const file = join(dir, name + '.js'); writeFileSync(file, emit(s)); return import(pathToFileURL(file).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const run = (m, script = 'c_normal') => { const a = m.createProbeLocalExitFake(script); a.prepare(); const r = a.run(); return { a, r, s: a.inspect() }; };
  const base = await load(text, 'base'); assert.equal(run(base).s.terminal.committed, true);
  const duplicate = method(text, 'prepareLocalState', "    this.localConstructionPoint(4, 'post'); return true;", "    if (probeStartAccess.bindLocal(this.#issuedFrameBinding!.target.start, p, this.script)) throw Error('duplicate_not_refused');\n    this.localConstructionPoint(4, 'post'); return true;");
  assert.equal(run(await load(duplicate, 'duplicate-binding')).s.terminalCommits, 1);
  assert.equal(run(await load(replace(duplicate, 'if (a.#localBindStarted) return false;', ''), 'duplicate-binding-mutant')).s.terminalCommits, 0);
  // Injection occurs only after B's capture and stable guard: C's own checks must reject it.
  const identity = [
    ['current', 'p === this.#localState', 'this.#localState = { ...p };'],
    ['issued', 'p === this.#localIssued', 'this.#localIssued = { ...p };'],
    ['brand', 'p[PROBE_LOCAL_EXIT] === true', 'Object.defineProperty(p, PROBE_LOCAL_EXIT, { value: false });'],
    ['guard', 'p.guard === g', "Object.defineProperty(p, 'guard', { value: { ...p.guard } });"],
    ['bundle', 'p.bundle === g.bundle', "Object.defineProperty(p, 'bundle', { value: { ...p.bundle } });"],
    ['duty', 'p.duty === this.#runIssuedDuty', "const cp = { ...p.duty }; for (const x of [p, p.retirement, p.terminal]) Object.defineProperty(x, 'duty', { value: cp });"],
    ['control', 'p.control === g.control', "const cp = { ...p.control }; for (const x of [p, p.retirement, p.absence]) Object.defineProperty(x, 'control', { value: cp });"],
    ['retirement-duty', 'p.retirement.duty === p.duty', "Object.defineProperty(p.retirement, 'duty', { value: { ...p.duty } });"],
    ['retirement-control', 'p.retirement.control === p.control', "Object.defineProperty(p.retirement, 'control', { value: { ...p.control } });"],
    ['absence-guard', 'p.absence.guard === g', "Object.defineProperty(p.absence, 'guard', { value: { ...p.guard } });"],
    ['absence-control', 'p.absence.control === p.control', "Object.defineProperty(p.absence, 'control', { value: { ...p.control } });"],
    ['terminal-duty', 'p.terminal.duty === p.duty', "Object.defineProperty(p.terminal, 'duty', { value: { ...p.duty } });"],
    ['terminal-guard', 'p.terminal.guard === g', "Object.defineProperty(p.terminal, 'guard', { value: { ...p.guard } });"],
    ['terminal-absence', 'p.terminal.absence === p.absence', "Object.defineProperty(p.terminal, 'absence', { value: { ...p.absence } });"],
    ['terminal-retirement', 'p.terminal.retirement === p.retirement', "Object.defineProperty(p.terminal, 'retirement', { value: { ...p.retirement } });"],
    ['terminal-anchor', 'p.terminal.anchor === g.bundle.terminal', "Object.defineProperty(p.terminal, 'anchor', { value: { ...p.terminal.anchor } });"],
  ];
  for (const [i, [name, clause, code]] of identity.entries()) {
    const source = inject(text, 'prepare', code);
    assert.equal(run(await load(source, 'context-' + i)).s.retirementAttempts, 0, name);
    const mutant = await load(method(source, 'localContextMatches', clause, 'true'), 'context-mutant-' + i);
    assert.equal(run(mutant).s.terminalCommits, 1, 'masked context ' + name);
  }
  const post = [
    ['used', 'r.used', 'p.retirement.used = false;'],
    ['blocked', 'r.blocked && r.target', 'p.retirement.blocked = false;'],
    ['blocked-target', 'r.blockedTarget === r.target', 'p.retirement.blockedTarget = Object.freeze({ ...p.retirement.target! });'],
    ['stage', "c.grant.stage === 'revoked'", "this.#probeCells!.grant.stage = 'provisional';"],
    ['unresolved', '!c.grant.unresolved', 'this.#probeCells!.grant.unresolved = true;'],
    ['rejected', 'c.grant.rejected === undefined', 'this.#probeCells!.grant.rejected = this.#grantIssued;'],
  ];
  for (const [i, [name, clause, code]] of post.entries()) {
    let source = inject(text, 'confirm', code);
    // blocked/blockedTarget also close localTargetOpen. Isolate that second defence here.
    if (name === 'blocked' || name === 'blocked-target') source = method(source, 'localTargetOpen', "return target === this.#grantIssued && !(r?.blocked === true && r.blockedTarget === target);", 'return r?.used === true ? false : target === this.#grantIssued;');
    assert.equal(run(await load(source, 'retirement-' + i)).s.retirement.confirmed, false, name);
    const mutant = await load(method(source, 'localRetirementPost', clause, name === 'blocked' ? 'r.target' : 'true'), 'retirement-mutant-' + i);
    assert.equal(run(mutant).s.terminalCommits, 1, 'masked retirement post ' + name);
  }
  // A latch reporting open must be rejected even when every stored boolean says confirmed.
  const open = method(text, 'localTargetOpen', "return target === this.#grantIssued && !(r?.blocked === true && r.blockedTarget === target);", 'return true;');
  assert.equal(run(await load(open, 'open-target')).s.retirement.confirmed, false);
  assert.equal(run(await load(method(open, 'localRetirementPost', '!this.localTargetOpen(r.target)', 'true'), 'open-target-mutant')).s.terminalCommits, 1);
  const allPost = [
    ['absence-kind', "p.absence.kind !== 'not_started'", "p.absence.kind = 'unobserved';"],
    ['absence-return', '!p.absence.returned', 'p.absence.returned = false;'],
    ['absence-route', '!p.absence.routeClosed', 'p.absence.routeClosed = false;'],
    ['prepared', '!p.terminal.prepared', 'p.terminal.prepared = false;'],
    ['terminal-kind', "p.terminal.kind !== 'none'", "p.terminal.kind = 'exit_unconfirmed';"],
    ['candidate', 'p.terminal.candidate !== undefined', "Object.defineProperty(p.terminal, 'candidate', { value: p.duty });"],
    ['issued', 'p.terminal.issued !== undefined', "Object.defineProperty(p.terminal, 'issued', { value: p.duty });"],
    ['accepted', 'p.terminal.accepted !== undefined', "Object.defineProperty(p.terminal, 'accepted', { value: p.duty });"],
    ['confirmed', "r.kind === 'confirmed' && r.confirmed", 'p.retirement.confirmed = false;'],
    ['confirmed-target', 'r.confirmedTarget === this.#grantIssued', 'p.retirement.confirmedTarget = Object.freeze({ ...p.retirement.target! });'],
  ];
  for (const [i, [name, clause, code]] of allPost.entries()) {
    const source = inject(text, 'post', code);
    assert.equal(run(await load(source, 'post-' + i)).s.terminalCommits, 0, name);
    const mutant = await load(method(source, 'localAllPost', clause, name === 'confirmed' ? "r.kind === 'confirmed'" : clause.startsWith('!') || clause.includes('!==') ? 'false' : 'true'), 'post-mutant-' + i);
    assert.equal(run(mutant).s.terminalCommits, 1, 'masked all-post ' + name);
  }
  const lateBoundary = [
    ['returned', 'localRouteAbsent', 'g.returned', 'p.guard.returned = false;'],
    ['route', 'localRouteAbsent', 'g.routeUsed', 'p.guard.routeUsed = false;'],
    ['progress', 'localRouteAbsent', 'g.inProgress', 'p.guard.inProgress = false;'],
    ['capture', 'localRouteAbsent', '!this.#captureInProgress', 'this.#captureInProgress = true;'],
    ['body', 'localRouteAbsent', "c.body.state === 'not_started'", "this.#probeCells!.body.state = 'running';"],
    ['outcome', 'localRouteAbsent', "c.body.outcome === 'none'", "this.#probeCells!.body.outcome = 'throw';"],
    ['recovery', 'localRouteAbsent', '!this.#claim.spent', 'this.#claim.begin();'],
    ['guard-state', 'localUnsealedReady', "g.state === 'settling'", "p.guard.state = 'failed';"],
    ['exit-mirror', 'localUnsealedReady', 'g.exitUsed', 'p.guard.exitUsed = false;'],
    ['duty-state', 'localUnsealedReady', "d.state === 'settling'", "this.#runIssuedDuty!.state = 'owed';"],
    ['duty-used', 'localUnsealedReady', 'd.attemptUsed', 'this.#runIssuedDuty!.attemptUsed = false;'],
    ['use-state', 'localUnsealedReady', "c.use.state === 'exiting'", "this.#probeCells!.use.state = 'entering';"],
    ['use-used', 'localUnsealedReady', 'c.use.attemptUsed', 'this.#probeCells!.use.attemptUsed = false;'],
    ['exit-stage', 'localUnsealedReady', "c.exit.stage === 'empty'", "this.#probeCells!.exit.stage = 'unsealed';"],
    ['exit-candidate', 'localUnsealedReady', 'c.exit.candidate === undefined', 'this.#probeCells!.exit.candidate = p.duty as never;'],
    ['exit-issued', 'localUnsealedReady', 'c.exit.issued === undefined', 'this.#probeCells!.exit.issued = p.duty as never;'],
    ['exit-accepted', 'localUnsealedReady', 'c.exit.accepted === undefined', 'this.#probeCells!.exit.accepted = p.duty as never;'],
    ['exit-revoked', 'localUnsealedReady', '!c.exit.revoked', 'this.#probeCells!.exit.revoked = true;'],
  ];
  for (const [i, [name, target, clause, code]] of lateBoundary.entries()) {
    let source = inject(text, 'post', code);
    // Same constructionMatches also rejects a spent recovery claim. Isolate C's body boundary,
    // leaving all other local context relations in place; do not claim standalone reachability.
    if (name === 'recovery') source = method(source, 'localContextMatches', 'this.guardIdentityMatches(g)', 'true');
    assert.notEqual(run(await load(source, 'late-boundary-' + i)).s.duty.state, 'settled_not_started', name);
    assert.equal(run(await load(method(source, target, clause, 'true'), 'late-boundary-mutant-' + i)).s.duty.state, 'settled_not_started', 'masked boundary ' + name);
  }
  const lateGrant = inject(text, 'confirm', 'const cp = Object.freeze({ ...this.#grantIssued! }); this.#probeCells!.grant.current = cp; this.#probeCells!.grant.issued = cp;');
  assert.equal(run(await load(lateGrant, 'late-grant')).s.terminalCommits, 0);
  assert.equal(run(await load(method(lateGrant, 'localRetirementPost', 'this.capturedGrantMatches(this.#runIssuedLink!)', 'true'), 'late-grant-mutant')).s.terminalCommits, 1);
  // Each per-phase recheck must be the one that stops the run. Rechecks overlap, so a missing one would
  // otherwise be masked by a later phase; failurePhase pins the first rejecting phase.
  const owed = "this.#runIssuedDuty!.state = 'owed';", rejected = 'this.#probeCells!.grant.rejected = this.#grantIssued;';
  const attemptLine = "        if (!this.localUnsealedReady(p, g) || !this.localHistoryMatches(g) || r.used || !this.localTargetOpen(this.#grantIssued!)) {";
  const emptyLine = "        if (!this.localUnsealedReady(p, g) || !this.localHistoryMatches(g)) { this.localFailure(p, g, 'state_invalid'); return; }\n        r.kind = 'not_required';";
  const phaseRecheck = [
    ['history-known', 'c_normal', 'history', rejected, "      if (!this.localHistoryMatches(g)) { this.localFailure(p, g, 'state_invalid'); return; }\n      this.localPoint(p, 'history', 'after');", "      this.localPoint(p, 'history', 'after');"],
    ['history-empty', 'c_not_called', 'history', 'this.#probeCells!.grant.unresolved = true;', "      if (!this.localHistoryMatches(g)) { this.localFailure(p, g, 'state_invalid'); return; }\n      this.localPoint(p, 'history', 'after');", "      this.localPoint(p, 'history', 'after');"],
    ['attempt-ready', 'c_normal', 'attempt', owed, attemptLine, attemptLine.replace('!this.localUnsealedReady(p, g) || ', '')],
    ['attempt-history', 'c_normal', 'attempt', rejected, attemptLine, attemptLine.replace(' || !this.localHistoryMatches(g)', '')],
    ['attempt-used', 'c_normal', 'attempt', 'p.retirement.used = true;', attemptLine, attemptLine.replace(' || r.used', '')],
    ['attempt-open', 'c_normal', 'attempt', 'p.retirement.blocked = true; p.retirement.blockedTarget = this.#grantIssued;', attemptLine, attemptLine.replace(' || !this.localTargetOpen(this.#grantIssued!)', '')],
    ['block-context', 'c_normal', 'block', "Object.defineProperty(p, 'guard', { value: { ...p.guard } });", '!this.localContextMatches(p, g) || r.target', 'r.target'],
    ['confirm-ready', 'c_normal', 'confirm', owed, '!this.localUnsealedReady(p, g) || !this.localRetirementPost(p)', '!this.localRetirementPost(p)'],
    ['empty-ready', 'c_not_called', 'not_required', owed, emptyLine, emptyLine.replace('!this.localUnsealedReady(p, g) || ', '')],
    ['empty-history', 'c_not_called', 'not_required', 'this.#probeCells!.grant.unresolved = true;', emptyLine, emptyLine.replace(' || !this.localHistoryMatches(g)', '')],
    ['absence-ready', 'c_normal', 'absence', owed, "      if (!this.localUnsealedReady(p, g)) { this.localFailure(p, g, 'state_invalid'); return; }\n      p.absence.kind", '      p.absence.kind'],
    ['commit-all-post', 'c_normal', 'commit', 'p.absence.routeClosed = false;', "      this.localPoint(p, 'commit', 'before');\n      if (!this.localAllPost(p, g)) { this.localFailure(p, g, 'state_invalid'); return; }", "      this.localPoint(p, 'commit', 'before');"],
  ];
  for (const [i, [name, script, phase, code, from, to]] of phaseRecheck.entries()) {
    const source = inject(text, phase, code), checked = run(await load(source, 'phase-recheck-' + i), script).s;
    assert.equal(checked.local.failurePhase, phase, name); assert.equal(checked.terminalCommits, 0, name);
    const masked = run(await load(method(source, 'localFinish', from, to), 'phase-recheck-mutant-' + i), script).s;
    assert.notEqual(masked.local.failurePhase, phase, 'masked recheck ' + name);
    if (phase === 'commit') assert.equal(masked.terminalCommits, 1, 'masked recheck ' + name);
  }
  // Compare before/after the direct linearization point, not just final error text.
  assert.equal(run(base, 'c_fault_commit_before').s.terminal.committed, false);
  const committed = run(base, 'c_fault_project_after');
  assert.equal(committed.s.duty.state, 'settled_not_started'); assert.equal(committed.s.local.deliveryUnconfirmed, true);
  const rollback = method(text, 'localFailure', 'if (p.terminal.committed) { p.deliveryUnconfirmed = true; return; }', 'if (p.terminal.committed) { p.deliveryUnconfirmed = true; }');
  assert.equal(run(await load(rollback, 'rollback'), 'c_fault_project_after').s.duty.state, 'unconfirmed');
  const refund = replace(text, "duty.state = 'settled_not_started'; cells.use.state = 'exiting';", "duty.state = 'settling'; cells.use.state = 'exiting';");
  assert.equal(run(await load(refund, 'wrong-duty')).s.duty.state, 'settling');
  const lost = method(text, 'localFailure', "p.state = 'failed'; p.terminal.kind = 'exit_unconfirmed';", "p.retirement.confirmed = false; p.retirement.blockedTarget = undefined; p.state = 'failed'; p.terminal.kind = 'exit_unconfirmed';");
  assert.equal(run(base, 'c_fault_record_before').s.retirement.confirmed, true);
  assert.equal(run(await load(lost, 'lost-fact'), 'c_fault_record_before').s.retirement.confirmed, false);
  const second = committed.a.run(); assert.equal(second, committed.r); assert.equal(committed.a.close(), second);
  // Two independent projections: neither alone may leak a private reference or turn it into true.
  const projection = [
    ['sameDuty: p.duty === this.#runIssuedDuty && t.duty === this.#runIssuedDuty', 'sameDuty: p.duty', 'local', 'sameDuty'],
    ['blockedTargetRetained: r.blockedTarget !== undefined', 'blockedTargetRetained: r.blockedTarget', 'retirement', 'blockedTargetRetained'],
    ['sameAbsence: t.absence === a', 'sameAbsence: t.absence', 'terminal', 'sameAbsence'],
  ];
  for (const [i, [from, to, axis, key]] of projection.entries()) {
    const source = method(text, 'localSnapshot', from, to), checked = run(await load(source, 'projection-' + i)).s;
    assert.equal(checked[axis][key], false);
    const prefix = axis === 'local' ? 'p?.' : `p?.${axis}.`;
    const leak = replace(source, `${key}: ${prefix}${key} === true`, `${key}: ${prefix}${key}`);
    assert.equal(typeof run(await load(leak, 'leak-' + i)).s[axis][key], 'object');
  }
  const badStage = method(text, 'localConstructionPoint', '    this.#localPhase = n; this.#localBoundary = boundary;', "    this.#localPhase = n; this.#localBoundary = boundary;\n    if (n === 4 && boundary === 'post') this.#localSlots[3].stage = Object.freeze({}) as never;");
  assert.equal(run(await load(badStage, 'bad-stage')).s.construction.stages[3], 'unconfirmed');
  const stageLeak = replace(badStage, "this.#localSlots.map(s => runEnum(s.stage, ['not_started', 'attempting', 'provisional', 'confirmed'], 'unconfirmed'))", 'this.#localSlots.map(s => s.stage)');
  assert.equal(typeof run(await load(stageLeak, 'stage-leak')).s.construction.stages[3], 'object');
  const trap = replace(text, '    this.#frame = true;\n    try { this.generationFrame(); }', "    throw Error('forbidden_body_entry');\n    this.#frame = true;\n    try { this.generationFrame(); }");
  const trapped = run(await load(trap, 'body-trap')); trapped.a.check(); trapped.a.checkLegacy(); trapped.a.close();
  assert.equal(trapped.s.terminalCommits, 1); assert.equal(trapped.s.start.generationBodyCalls, 0); assert.equal(trapped.s.start.retirementStarts, 0);
  // Only C's live terminal can hold not_started. A/B and formal accepted types remain closed.
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const localTerminal: LocalTerminalStorage;
declare const localState: ProbeLocalExitState;
declare const localReply: ProbeLocalExitReply;
const badAccepted: LocalTerminalStorage = { ...localTerminal, accepted: {} };
const badIssued: LocalTerminalStorage = { ...localTerminal, issued: {} };
const badBody: LocalTerminalStorage = { ...localTerminal, kind: 'held_unsealed' };
const badPhase: ProbeLocalExitState = { ...localState, phase: 'body' };
const badSuccess: ProbeLocalExitReply = { ...localReply, ok: true };
const badActive: ProbeLocalExitState = { ...localState, state: 'active' };
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, text + extra, language, true) : getSource(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= text.length), 'unexpected baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 6);
  console.log(JSON.stringify({ compiled: true, oneShotBinding: true, contextControls: identity.length, retirementPostControls: post.length,
    targetLatchControl: true, allPostControls: allPost.length, lateBoundaryControls: lateBoundary.length, lateGrantRecheck: true, phaseRecheckControls: phaseRecheck.length,
    commitBoundary: true, noRollback: true, sameDutyCommit: true,
    confirmedRetention: true, noRepeat: true, defensiveProjectionControls: projection.length, stageAllowlist: true, bodyTrap: true, typeRejections: 6 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
