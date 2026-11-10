/** B03-A scratch controls: no live exit, retirement or terminal-success constructor. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-exit-preparation-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const file = join(dir, name + '.js'); writeFileSync(file, emit(s)); return import(pathToFileURL(file).href); }
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
function method(s, name, from, to) {
  const start = s.indexOf('  ' + name + '('); assert.ok(start >= 0, name);
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(end > start);
  return s.slice(0, start) + replace(s.slice(start, end), from, to) + s.slice(end);
}
function slot(s, n, from, to) {
  const start = s.indexOf('  private exitPreparationSlotMatches('), end = s.indexOf('\n  }\n', start) + 5;
  const part = s.slice(start, end), begin = n === 5 ? part.indexOf('    const v = value as ProbeExitPreparationBundle;') : part.indexOf(`    if (n === ${n})`);
  const finish = n < 4 ? part.indexOf(`    if (n === ${n + 1})`) : n === 4 ? part.indexOf('    const v = value as ProbeExitPreparationBundle;') : part.length;
  assert.ok(begin >= 0 && finish > begin);
  return s.slice(0, start) + part.slice(0, begin) + replace(part.slice(begin, finish), from, to) + part.slice(finish) + s.slice(end);
}
function axis(s, from, to) {
  const start = s.indexOf('function probeExitAxesValid('), end = s.indexOf('\n}\n', start) + 3;
  assert.ok(start >= 0 && end > start);
  return s.slice(0, start) + replace(s.slice(start, end), from, to) + s.slice(end);
}
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const prepared = (m, script = 'normal') => { const a = m.createProbeExitPreparationFake(script); const result = a.prepare(); return { a, result, s: a.inspect() }; };
  const fields = [
    [['brand', 'v[PROBE_EXIT_CONTROL] === true'], ['extra', 'Reflect.ownKeys(v).length === 8'], ['link', 'v.link === link'], ['duty', 'v.duty === duty'],
      ['binding', 'v.binding === b'], ['cells', 'v.cells === this.#issuedCells'], ['start', 'v.start === b.target.start'], ['state', "v.state === 'idle'"], ['captureReturned', 'v.captureReturned === false']],
    [['extra', 'Reflect.ownKeys(v).length === 6'], ['duty', 'v.duty === duty'], ['control', 'v.control === control'], ['kind', "v.kind === 'not_attempted'"],
      ['used', 'v.used === false'], ['blocked', 'v.blocked === false'], ['target', 'v.target === undefined']],
    [['extra', 'Reflect.ownKeys(v).length === 5'], ['duty', 'v.duty === duty'], ['control', 'v.control === control'], ['kind', "v.kind === 'unobserved'"],
      ['started', 'v.started === false'], ['returned', 'v.returned === false']],
    [['extra', 'Reflect.ownKeys(v).length === 7'], ['duty', 'v.duty === duty'], ['control', 'v.control === control'], ['absence', 'v.absence === this.#exitSlots[2].value'],
      ['kind', "v.kind === 'none'"], ['candidate', 'v.candidate === undefined'], ['issued', 'v.issued === undefined'], ['accepted', 'v.accepted === undefined']],
    [['brand', 'v[PROBE_EXIT_BUNDLE] === true'], ['extra', 'Reflect.ownKeys(v).length === 8'], ['link', 'v.link === link'], ['duty', 'v.duty === duty'],
      ['start', 'v.start === b.target.start'], ['control', 'v.control === control'], ['retirement', 'v.retirement === this.#exitSlots[1].value'],
      ['absence', 'v.absence === this.#exitSlots[2].value'], ['terminal', 'v.terminal === this.#exitSlots[3].value']],
  ];
  let slotControls = 0;
  for (const [i, fs] of fields.entries()) {
    const n = i + 1;
    for (const [field, clause] of [['copy', 'value !== this.#exitIssued[n - 1]'], ...fs]) {
      const script = `exit_slot_${n}_${field}`, rejected = prepared(base, script);
      assert.equal(rejected.s.preparation.phase, n); assert.equal(rejected.s.preparation.boundary, 'check'); assert.equal(rejected.result.first, 'binding_mismatch');
      const changed = field === 'copy' ? replace(text, clause, `n !== ${n} && value !== this.#exitIssued[n - 1]`) : slot(text, n, clause, 'true');
      const m = await load(changed, `slot-${n}-${field}`), passed = prepared(m, script);
      if (n === 5 && ['link', 'duty', 'start'].includes(field)) {
        assert.equal(passed.s.preparation.boundary, 'bind'); assert.equal(passed.s.binding.receiverAttempted, true);
      } else assert.equal(passed.s.preparation.ready, true, `masked first slot guard ${n}/${field}`);
      assert.equal(passed.s.exitAttempts, 0); assert.equal(passed.s.bodyStarts, 0); slotControls++;
    }
  }
  const receiver = await load(method(text, 'private exitPreparationMatches', 'bundle === this.#exitBundle', 'true'), 'receiver');
  assert.equal(prepared(base, 'exit_receiver_copy').s.preparation.ready, false);
  assert.equal(prepared(receiver, 'exit_receiver_copy').s.preparation.ready, true);
  const duplicate = await load(replace(text, 'if (a.#exitBindStarted) return false;', ''), 'duplicate');
  assert.equal(prepared(base, 'exit_duplicate_binding').s.preparation.bindRefusal, 'duplicate_binding');
  assert.equal(prepared(duplicate, 'exit_duplicate_binding').s.preparation.bindRefusal, 'unconfirmed');
  const axisControls = [
    ['phase', "!['none', 'guard', 'history', 'retire', 'record', 'project'].includes(f.phase)", 'false'],
    ['boundary', "!['none', 'before', 'after'].includes(f.boundary)", 'false'],
    ['phase_pair', "(f.phase === 'none') !== (f.boundary === 'none')", 'false'], ['accepted', 'if (f.accepted) return false;', 'if (false) return false;'],
    ['knowledge', "!['not_called', 'known', 'unknown'].includes(f.knowledge)", 'false'],
    ['not_called_started', "f.callStarted !== (f.knowledge !== 'not_called')", 'false'], ['unknown_issuer', "f.issuer !== (f.knowledge === 'known')", 'false'],
    ['receiver_without_issuer', "f.knowledge !== 'known' && (f.receiver || f.canonical)", 'false'], ['canonical_without_receiver', 'f.canonical && !f.receiver', 'false'],
    ['retirement', "!['not_attempted', 'not_required', 'confirmed', 'unconfirmed'].includes(f.retirement)", 'false'],
    ['unused_retirement_used', '(f.retireUsed || f.blocked || f.target)', '(false || f.blocked || f.target)'],
    ['unused_retirement_blocked', '(f.retireUsed || f.blocked || f.target)', '(f.retireUsed || false || f.target)'],
    ['unused_retirement_target', '(f.retireUsed || f.blocked || f.target)', '(f.retireUsed || f.blocked || false)'],
    ['confirmed_unspent', '!f.retireUsed || !f.blocked', 'false || !f.blocked'],
    ['confirmed_unblocked', '!f.blocked || !f.target', 'false || !f.target'], ['confirmed_targetless', '!f.target || !f.canonical', 'false || !f.canonical'],
    ['confirmed_uncanonical', '!f.target || !f.canonical', '!f.target || false'],
    ['not_required_used', "(f.retireUsed || f.target || f.knowledge !== 'not_called')", "(false || f.target || f.knowledge !== 'not_called')"],
    ['not_required_target', "(f.retireUsed || f.target || f.knowledge !== 'not_called')", "(f.retireUsed || false || f.knowledge !== 'not_called')"],
    ['not_required_known', "(f.retireUsed || f.target || f.knowledge !== 'not_called')", '(f.retireUsed || f.target || false)'],
    ['body', "!['unobserved', 'not_started', 'completed', 'unconfirmed'].includes(f.body)", 'false'],
    ['outcome', "!['none', 'return', 'throw', 'cancel'].includes(f.outcome)", 'false'],
    ['unobserved_started', "(f.started || f.returned || f.outcome !== 'none')", "(false || f.returned || f.outcome !== 'none')"],
    ['unobserved_returned', "(f.started || f.returned || f.outcome !== 'none')", "(f.started || false || f.outcome !== 'none')"],
    ['unobserved_outcome', "(f.started || f.returned || f.outcome !== 'none')", '(f.started || f.returned || false)'],
    ['not_started_started', "(f.started || !f.returned || f.outcome !== 'none')", "(false || !f.returned || f.outcome !== 'none')"],
    ['not_started_unreturned', "(f.started || !f.returned || f.outcome !== 'none')", "(f.started || false || f.outcome !== 'none')"],
    ['not_started_outcome', "(f.started || !f.returned || f.outcome !== 'none')", '(f.started || !f.returned || false)'],
    ['completed_unstarted', "(!f.started || !f.returned || f.outcome === 'none')", "(false || !f.returned || f.outcome === 'none')"],
    ['completed_unreturned', "(!f.started || !f.returned || f.outcome === 'none')", "(!f.started || false || f.outcome === 'none')"],
    ['completed_none', "(!f.started || !f.returned || f.outcome === 'none')", '(!f.started || !f.returned || false)'],
    ['duty', "!['not_owed', 'owed', 'settling', 'settled_not_started', 'settled_unsealed', 'unconfirmed'].includes(f.duty)", 'false'],
    ['duty_unowed_spent', "['not_owed', 'owed'].includes(f.duty) && f.exitUsed", 'false'],
    ['duty_settling_unspent', "['settling', 'settled_not_started', 'settled_unsealed'].includes(f.duty) && !f.exitUsed", 'false'],
    ['settled_without_terminal', "!['settled_not_started', 'settled_unsealed'].includes(f.duty)", 'true'],
    ['unconfirmed_wrong_duty', "return f.duty === 'unconfirmed';", 'return true;'],
    ['held_wrong_body', "return f.body === 'not_started' && f.duty === 'settled_not_started'", "return true && f.duty === 'settled_not_started'"],
    ['held_wrong_duty', "f.body === 'not_started' && f.duty === 'settled_not_started'", "f.body === 'not_started' && true"],
    ['held_unretired', "['confirmed', 'not_required'].includes(f.retirement)", 'true'],
    ['held_body_unretired', "f.duty === 'settled_unsealed' && f.retirement === 'confirmed'", "f.duty === 'settled_unsealed' && true"],
    ['terminal', '  return false;\n}', '  return true;\n}'],
  ];
  for (const [i, [shape, from, to]] of axisControls.entries()) {
    assert.equal(base.createProbeExitPreparationFake('axis_' + shape).checkAxes().valid, false, shape);
    const m = await load(axis(text, from, to), 'axis-' + i);
    assert.equal(m.createProbeExitPreparationFake('axis_' + shape).checkAxes().valid, true, 'masked axis clause ' + shape);
  }
  const baseline = prepared(base).s;
  const projections = [['controlRetained: control !== undefined', 'controlRetained: control', s => typeof s.binding.controlRetained === 'boolean'],
    ['bundleRetained: this.#exitSlots[4]?.value !== undefined', 'bundleRetained: this.#exitSlots[4]?.value', s => typeof s.binding.bundleRetained === 'boolean'],
    ['linkRetained: Boolean(duty)', 'linkRetained: duty?.link', s => typeof s.duty.linkRetained === 'boolean']];
  // Out-of-allowlist values must project as unconfirmed, and the future settled_not_started duty must stay visible.
  const injectAt = '    const control = this.#exitSlots[0]?.value as ProbeExitControl | undefined;';
  for (const [i, [state, expected]] of [['settled_not_started', 'settled_not_started'], ['foreign', 'unconfirmed']].entries()) {
    const injected = await load(replace(text, injectAt, `    if (duty) (duty as unknown as { state: string }).state = '${state}';\n` + injectAt), 'duty-allowlist-' + i);
    const a = injected.createProbeExitPreparationFake(); a.prepare();
    assert.equal(a.inspect().duty.state, expected, 'duty projection for ' + state);
  }
  for (const [i, [from, to, safe]] of projections.entries()) {
    assert.equal(safe(baseline), true);
    const m = await load(method(text, 'inspectExitPreparation', from, to), 'projection-' + i);
    assert.equal(safe(prepared(m).s), false);
  }
  const trap = await load(replace(text, '    this.#frame = true;\n    try { this.generationFrame(); }',
    "    throw Error('forbidden_body_entry');\n    this.#frame = true;\n    try { this.generationFrame(); }"), 'body-trap');
  const a = prepared(trap).a; assert.equal(a.check().disposition, 'blocked_frame_execution'); assert.equal(a.checkLegacy().disposition, 'blocked_frame_execution');
  assert.equal(a.inspect().duty.attemptUsed, false); assert.equal(a.inspect().start.generationBodyCalls, 0);
  assert.equal(a.inspect().terminal.kind, 'none');
  const captureTrap = await load(replace(text, '  private captureProbeGrant(): Readonly<ProbeGrantCaptureReply> {',
    "  private captureProbeGrant(): Readonly<ProbeGrantCaptureReply> { throw Error('forbidden_capture');"), 'capture-trap');
  const c = prepared(captureTrap).a; c.check(); c.checkLegacy(); c.close(); assert.equal(c.inspect().grantIssues, 0);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const typedDuty: FixedExitDuty;
declare const typedControl: ProbeExitControl;
declare const typedTerminal: ProbeNotStartedTerminalSlot;
declare const typedRetirement: ProbeLocalRetirementSlot;
declare const typedAbsence: ProbeBodyAbsenceSlot;
const goodProgress: DutyExitProgress[] = [{ phase: 'none', boundary: 'none' }, { phase: 'guard', boundary: 'before' }, { phase: 'project', boundary: 'after' }];
const goodKnowledge: ProbeExitKnowledgeValue[] = [{ kind: 'not_called', callStarted: false, issuer: false, receiver: false, canonical: false }, { kind: 'known', callStarted: true, issuer: true, receiver: false, canonical: false }, { kind: 'known', callStarted: true, issuer: true, receiver: true, canonical: true }, { kind: 'unknown', callStarted: true, issuer: false, receiver: false, canonical: false }];
const goodRetirement: ProbeLocalRetirementValue[] = [{ kind: 'not_attempted', used: false, blocked: false, target: false }, { kind: 'not_required', used: false, blocked: false, target: false }, { kind: 'confirmed', used: true, blocked: true, target: true }, { kind: 'unconfirmed', used: true, blocked: true, target: false }];
const goodAbsence: ProbeBodyAbsenceValue[] = [{ kind: 'unobserved', started: false, returned: false, outcome: 'none' }, { kind: 'not_started', started: false, returned: true, outcome: 'none' }, { kind: 'completed', started: true, returned: true, outcome: 'return' }, { kind: 'unconfirmed', started: true, returned: false, outcome: 'none' }];
const goodTerminal: ProbeExitTerminalValue[] = [{ kind: 'none', accepted: false }, { kind: 'held_not_started', accepted: false, body: 'not_started', duty: 'settled_not_started', exitUsed: true }, { kind: 'held_unsealed', accepted: false, body: 'completed', duty: 'settled_unsealed', exitUsed: true }, { kind: 'exit_unconfirmed', accepted: false, duty: 'unconfirmed', exitUsed: false }];
const goodControl: ProbeExitControlValue[] = [{ state: 'idle', captureReturned: false }, { state: 'checking', captureReturned: true }, { state: 'settling', captureReturned: true }, { state: 'terminal', captureReturned: true }];
const badPhase: FixedExitDuty = { ...typedDuty, phase: 'foreign' };
const badBoundary: FixedExitDuty = { ...typedDuty, boundary: 'foreign' };
const badPhasePair: DutyExitProgress = { phase: 'guard', boundary: 'none' };
const badNotCalled: ProbeExitKnowledgeValue = { kind: 'not_called', callStarted: true, issuer: false, receiver: false, canonical: false };
const badUnknown: ProbeExitKnowledgeValue = { kind: 'unknown', callStarted: true, issuer: true, receiver: false, canonical: false };
const badCanonical: ProbeExitKnowledgeValue = { kind: 'known', callStarted: true, issuer: true, receiver: false, canonical: true };
const badConfirmed: ProbeLocalRetirementValue = { kind: 'confirmed', used: false, blocked: true, target: true };
const badBody: ProbeBodyAbsenceValue = { kind: 'not_started', started: true, returned: true, outcome: 'none' };
const badCompleted: ProbeBodyAbsenceValue = { kind: 'completed', started: true, returned: true, outcome: 'none' };
const badTerminalValue: ProbeExitTerminalValue = { kind: 'held_not_started', accepted: false, body: 'completed', duty: 'settled_not_started', exitUsed: true };
const badControl: ProbeExitControl = { ...typedControl, state: 'checking' };
const badTerminalSlot: ProbeNotStartedTerminalSlot = { ...typedTerminal, kind: 'held_not_started' };
const badLocal: ProbeLocalRetirementSlot = { ...typedRetirement, kind: 'confirmed' };
const badAbsenceSlot: ProbeBodyAbsenceSlot = { ...typedAbsence, kind: 'not_started' };
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, text + extra, language, true) : getSource(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= text.length + extra.indexOf('const badPhase:')), 'unexpected baseline/positive semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 14, 'each illegal type must be rejected');
  console.log(JSON.stringify({ compiled: true, slotControls, receiverControls: 1, duplicateControl: true, axisControls: axisControls.length,
    projectionControls: projections.length, allowlistControls: 2, bodyTrap: true, captureTrap: true, typeRejections: 14, exitAttempts: 0, retirementAttempts: 0, terminalCommits: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
