/** Closed source borrows: real-slot controls, no runtime source or reader. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-references-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, owner = 'RetirementStartAssembly', priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js');
  writeFileSync(p, emit(s)); return import(pathToFileURL(p).href);
}
const run = (m, script) => { const a = m.createProbeBodyPinReferenceStorageFake(...(script ? [script] : [])); return { a, r: a.prepare(), s: a.inspect() }; };
const fault = code => method(source, 'bodyPinReferenceFault', '    if (copy)', '    ' + code + '\n    if (copy)');
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const m = await load(source, 'base'), normal = run(m), rejected = run(m, 'rs_copy_current');
  assert.equal(normal.r.disposition, 'pin_confirmation_not_connected');
  assert.equal(normal.s.build.receiver.pinStage, 'captured'); assert.equal(normal.s.reference.hold, 'not_started');
  assert.equal(rejected.r.first, 'binding_mismatch'); assert.equal(rejected.s.reference.hold, 'confirmed');
  for (const factory of ['createProbeBodyPinCallFake', 'createProbeBodyPinStorageFake']) {
    const a = m[factory](); a.prepare(); assert.ok(a.inspect().build.receiver.references.every(v => !v.retained));
  }
  // Read actual private fields at the return boundary, not a public same-reference assertion.
  const observed = method(source, 'storeBodyPinReferences', "      this.failBodyPinStorageReceiver('receiver_unconfirmed');",
    "      if (this.#bodyExpectedSourceIssued !== source || this.#bodyExpectedSourceCurrent !== source || this.#bodyExpectedSourceRejected !== undefined) throw Error('bad_actual_pair');\n      this.failBodyPinStorageReceiver('receiver_unconfirmed');");
  assert.equal(run(await load(observed, 'actual-pair')).r.disposition, 'pin_confirmation_not_connected');
  let fieldCases = 0;
  for (const [code, first, hold, count] of [
    ['this.#bodyExpectedSourceIssued = {} as never;', 'binding_mismatch', 'not_started', 2],
    ['this.#bodyExpectedSourceCurrent = undefined;', 'state_invalid', 'not_started', 1],
    ['this.#bodyExpectedSourceRejected = {} as never;', 'state_invalid', 'not_started', 3],
    ["this.#bodyPinStage = 'issued';", 'state_invalid', 'not_started', 2],
    ["this.#bodyPinRejectedHold = 'confirmed';", 'state_invalid', 'confirmed', 2],
  ]) {
    const x = run(await load(fault(code), 'real-field-' + fieldCases++));
    assert.equal(x.r.first, first); assert.equal(x.s.reference.hold, hold);
    assert.equal(x.s.build.receiver.references.filter(v => v.retained).length, count);
  }
  // Forge a diagnostic view, then bypass only the actual-slot checker as the paired control.
  const getter = 'bodyPinReferenceMatches: (a: RetirementStartAssembly, source: BodyBindSourceShell, phase: BodyPinReferencePhase) => a.bodyPinReferenceMatches(source, phase),';
  const view = 'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => a.bodyPinValues(source),';
  let rawControls = 0;
  for (const [phase, code] of [['issued', 'a.#bodyExpectedSourceIssued = {} as never;'],
    ['before_current', 'a.#bodyExpectedSourceCurrent = source;'], ['captured', 'a.#bodyExpectedSourceCurrent = {} as never;']]) {
    let changed = replace(source, getter, `bodyPinReferenceMatches: (a: RetirementStartAssembly, source: BodyBindSourceShell, phase: BodyPinReferencePhase) => { if (phase === '${phase}') { ${code} } return a.bodyPinReferenceMatches(source, phase); },`);
    changed = replace(changed, view, 'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => { const v = a.bodyPinValues(source); return v.stage === "issued" ? { ...v, issuedSame: true, current: false, currentSame: false } : v.stage === "captured" ? { ...v, issuedSame: true, currentSame: true } : v; },');
    const x = run(await load(changed, 'raw-' + phase)); assert.equal(x.r.first, phase === 'issued' ? 'binding_mismatch' : 'state_invalid'); assert.equal(x.s.reference.failurePoint, phase);
    const control = replace(changed, 'return a.bodyPinReferenceMatches(source, phase); },', 'return true; },');
    const y = run(await load(control, 'raw-control-' + phase));
    assert.notEqual(y.s.reference.failurePoint, x.s.reference.failurePoint); rawControls++;
  }
  // Stop after the first retained candidate: neither later faults nor retries replace its diagnosis.
  for (const k of ['fault', 'close', 'prior']) {
    const x = run(m, 'rs_copy_' + k + '_rejected_after');
    assert.equal(x.s.reference.hold, 'retained_unconfirmed'); assert.equal(x.s.build.receiver.first, 'binding_mismatch');
    assert.equal(x.a.prepare(), x.r); assert.equal(x.a.close(), x.r);
  }
  const firstAnchor = "    if (this.#bodyBindFirst === 'none') {";
  const firstBroken = method(source, 'failBodyPinStorageReceiver', firstAnchor, '    {');
  assert.equal(run(await load(firstBroken, 'first-control'), 'rs_copy_fault_rejected_after').s.build.receiver.first, 'receiver_unconfirmed');
  const exitBroken = method(source, 'bodyPinReceiverEntry', 'finally { this.#bodyPinEntryBusy = false; }', 'finally { }');
  assert.equal(run(await load(exitBroken, 'exit-control')).s.entryBusy, true);
  const callerBroken = method(source, 'dispatchBodyPin', 'finally { this.#bodyPinCallActive = false; }', 'finally { }', 'CanonicalGateDraftRoot');
  assert.equal(run(await load(callerBroken, 'caller-control')).s.callActive, true);
  const forge = method(source, 'storeBodyPinReferences', "      this.failBodyPinStorageReceiver('receiver_unconfirmed');\n      return 'rejected_attempt';",
    "      return 'accepted';");
  assert.equal(run(await load(forge, 'accepted-control')).r.first, 'state_invalid');
  // A mismatch after custody commit cannot change which reference the rejected slot owns.
  const changedAfter = method(source, 'retainBodyPinRejected', "    probeBodyPinRootAccess.referenceEvent(root, source, this, 'rejected_after');",
    "    probeBodyPinRootAccess.referenceEvent(root, source, this, 'rejected_after');\n    this.#bodyExpectedSourceCurrent = source;");
  assert.equal(run(await load(changedAfter, 'post-mismatch'), 'rs_copy_current').s.reference.hold, 'retained_unconfirmed');
  const postBypass = replace(changedAfter, 'this.#bodyExpectedSourceCurrent === q && this.#bodyExpectedSourceRejected === q', 'this.#bodyExpectedSourceRejected === q');
  assert.equal(run(await load(postBypass, 'post-control'), 'rs_copy_current').s.reference.hold, 'confirmed');
  const classifyBypass = method(source, 'prepareBodyPinCall', '\n        && probeStartAccess.bodyPinReferencePostChecked(start) === true', '', 'CanonicalGateDraftRoot');
  assert.equal(run(m, 'rs_fault_captured').r.disposition, 'construction_unconfirmed');
  assert.equal(run(await load(classifyBypass, 'classification-control'), 'rs_fault_captured').r.disposition, 'pin_confirmation_not_connected');
  for (const bad of ['true', "'private_secret'"]) {
    const changed = replace(source, '#bodyPinReferencePostChecked = false;', '#bodyPinReferencePostChecked = ' + bad + ' as never;');
    const x = run(await load(changed, 'post-seed-' + used.size)); assert.equal(x.r.first, 'state_invalid');
    assert.ok(x.s.build.receiver.references.every(v => !v.retained)); assert.ok(!JSON.stringify(x.s).includes('private_secret'));
  }
  let projectionControls = 0;
  for (const [field, key] of [['bodyPinReferencePoint', 'point'], ['bodyPinReferenceFailurePoint', 'failurePoint'], ['bodyPinReferenceReentry', 'reentry']]) {
    const changed = method(source, 'inspectBodyPinReference', '    const c = this.inspectBodyPinCall(), start = this.#issuedFrameBinding?.target.start;',
      `    const c = this.inspectBodyPinCall(), start = this.#issuedFrameBinding?.target.start; this.#${field} = 'private_secret' as never;`, 'CanonicalGateDraftRoot', false);
    assert.equal(run(await load(changed, 'projection-' + key)).s.reference[key], 'unconfirmed'); projectionControls++;
  }
  const badHold = replace(source, "#bodyPinRejectedHold: BodyPinRejectedHold = 'not_started';", "#bodyPinRejectedHold: BodyPinRejectedHold = 'private_secret' as never;");
  const badHoldResult = run(await load(badHold, 'hold-projection'));
  assert.equal(badHoldResult.r.first, 'state_invalid'); assert.equal(badHoldResult.s.reference.hold, 'unconfirmed');

  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = name => ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === name);
  const start = cls('RetirementStartAssembly'), root = cls('CanonicalGateDraftRoot');
  const member = name => start.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
  const store = member('storeBodyPinReferences').body.statements.find(ts.isTryStatement).tryBlock.statements;
  function group(statements, field, expected) {
    const index = statements.findIndex(n => ts.isExpressionStatement(n) && ts.isBinaryExpression(n.expression)
      && n.expression.left.getText(ast) === 'this.#' + field);
    assert.ok(index >= 0);
    assert.deepEqual(Array.from(statements.slice(index, index + expected.length), n => n.getText(ast).trim()), expected);
  }
  group(store, 'bodyExpectedSourceIssued', ['this.#bodyExpectedSourceIssued = source;', "this.#bodyPinStep = 'issued';", "this.#bodyPinStage = 'issued';", "this.#bodyPinStorageBoundary = 'after';"]);
  group(store, 'bodyExpectedSourceCurrent', ['this.#bodyExpectedSourceCurrent = this.#bodyExpectedSourceIssued;', "this.#bodyPinStep = 'current';", "this.#bodyPinStage = 'captured';", "this.#bodyPinStorageBoundary = 'after';"]);
  group(member('retainBodyPinRejected').body.statements, 'bodyExpectedSourceRejected', [
    'this.#bodyExpectedSourceRejected = this.#bodyExpectedSourceCurrent;', "this.#bodyPinRejectedHold = 'retained_unconfirmed';", "this.#bodyPinStorageBoundary = 'after';",
    "this.#bodyBindFirst = 'binding_mismatch';", "this.#bodyBindFailurePhase = 'pin';", "this.#bodyBindFailurePrefix = 'none';", "this.#bodyPinFailureStep = 'current';", "this.#bodyBindFailureBoundary = 'after';"]);
  for (const [c, field, literal] of [[start, 'bodyPinRejectedHold', "'not_started'"], [start, 'bodyPinReferencePostChecked', 'false'], [root, 'bodyPinReferencePoint', "'none'"],
    [root, 'bodyPinReferenceFailurePoint', "'none'"], [root, 'bodyPinReferenceReentry', "'none'"]]) {
    const f = c.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + field);
    assert.ok(f.end < c.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), literal);
  }
  const writes = [], refs = new Set(['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyExpectedSourceRejected']);
  function scan(n, scope = '', owner = '') {
    if (ts.isClassDeclaration(n)) scope = n.name?.text ?? '';
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) && ts.isPropertyAccessExpression(n.left)) {
      const f = n.left.name.getText(ast);
      if (refs.has(f)) { assert.equal(scope, 'RetirementStartAssembly'); writes.push(owner + '/' + f); }
      if (['#bodyBundleIssued', '#bodyBundleCurrent', '#bodyRejectedBundle', '#bodyDraftIssued', '#bodyDraftCurrent', '#bodyRejectedDraft', 'bindCallReached', 'postConfirmed', 'claim'].includes(f)) assert.fail('forbidden write ' + f);
      if (f === '#bodyPinStage') assert.ok(["'attempting'", "'issued'", "'captured'"].includes(n.right.getText(ast)));
    }
    ts.forEachChild(n, c => scan(c, scope, owner));
  }
  scan(ast); assert.deepEqual(writes.sort(), ['bodyPinReferenceFault/#bodyExpectedSourceCurrent', 'bodyPinReferenceFault/#bodyExpectedSourceCurrent',
    'retainBodyPinRejected/#bodyExpectedSourceRejected', 'storeBodyPinReferences/#bodyExpectedSourceCurrent', 'storeBodyPinReferences/#bodyExpectedSourceIssued'].sort());
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\ndeclare const start: RetirementStartAssembly;\nroot.bodyPinReferenceMatches({}, start, "issued");\nroot.bodyPinReferencePoint("issued", {}, start);\nstart.storeBodyPinReferences(root, {});\nstart.retainBodyPinRejected(root, {});\nstart.bodyPinCapturedBase(root, {}, "after");\nconst badPhase: BodyPinReferencePhase = "confirmed";\nconst badHold: BodyPinRejectedHold = "released";\nconst badPoint: BodyPinReferencePoint = "between_assignments";\nconst leak = createProbeBodyPinReferenceStorageFake().inspect().source;\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 9);
  console.log(JSON.stringify({ compiled: true, actualPair: true, fieldCases, rawControls, fixedGroups: 3, referenceWrites: writes.length,
    priorScalars: 5, firstDiagnosticControl: true, finallyControls: 2, acceptedRejected: true, rejectedPostControl: true,
    classificationControl: true, invalidPostSeeds: 2, projectionControls: projectionControls + 1, semanticRejections: 9 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
