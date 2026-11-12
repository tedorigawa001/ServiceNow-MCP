/** B only: same-owner intermediate posts; final-post and accepted return stay closed. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-confirm-stages-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, owner = 'RetirementStartAssembly', priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) { assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js'); writeFileSync(p, emit(s)); return import(pathToFileURL(p).href); }
const run = (m, script) => { const a = m.createProbeBodyPinConfirmationStagesFake(...(script ? [script] : [])); return { a, r: a.prepare(), s: a.inspect() }; };
const points = ['before_checked', 'checked', 'before_confirmed', 'confirmed', 'blocked'];
const event = p => `    probeBodyPinRootAccess.confirmationStageEvent(root, source, this, '${p}');`;
const at = (p, code) => method(source, 'advanceBodyPinConfirmationStages', event(p), event(p) + '\n    ' + code);
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'), normal = run(base);
  assert.equal(normal.r.disposition, 'pin_final_post_not_connected');
  assert.equal(normal.s.stages.completed, true); assert.equal(normal.s.confirmation.finalPostChecked, false);
  const actual = method(source, 'advanceBodyPinConfirmationStages', "    this.failBodyPinStorageReceiver('receiver_unconfirmed');",
    "    if (this.#bodyExpectedSourceIssued !== source || this.#bodyExpectedSourceCurrent !== source || this.#bodyExpectedSourceRejected !== undefined) throw Error('bad_actual_pair');\n    this.failBodyPinStorageReceiver('receiver_unconfirmed');");
  assert.equal(run(await load(actual, 'actual-pair')).r.disposition, 'pin_final_post_not_connected');
  let actualFieldCases = 0, guardControls = 0;
  for (const [i, point] of points.entries()) {
    const fields = [
      ['issued', 'this.#bodyExpectedSourceIssued = {} as never;', 'binding_mismatch'],
      ['current-copy', 'this.#bodyExpectedSourceCurrent = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(source))) as never;', 'binding_mismatch'],
      ['current-missing', 'this.#bodyExpectedSourceCurrent = undefined;', 'state_invalid'],
      ['rejected', 'this.#bodyExpectedSourceRejected = {} as never;', 'state_invalid'],
      ['stage', "this.#bodyPinStage = 'issued';", 'state_invalid'],
      ['step', "this.#bodyPinStep = 'none';", 'state_invalid'],
      ['busy', 'this.#bodyPinEntryBusy = false;', 'state_invalid'],
      ['final', 'this.#bodyPinFinalPostChecked = true;', 'state_invalid'],
      ['checked-post', `this.#bodyPinCheckedPostChecked = ${i < 2 ? 'true' : 'false'};`, 'state_invalid'],
      ['confirmed-post', `this.#bodyPinConfirmedPostChecked = ${i < 4 ? 'true' : 'false'};`, 'state_invalid'],
    ];
    for (const [name, code, first] of fields) {
      const x = run(await load(at(point, code), point + '-' + name));
      assert.equal(x.r.first, first, point + '/' + name); assert.equal(x.r.disposition, first);
      assert.equal(x.s.stages.failurePoint, point); assert.equal(x.s.stages.completed, false);
      assert.equal(x.s.build.source.claim, 'unused'); assert.equal(x.s.build.bodyStarts, 0);
      actualFieldCases++;
    }
    const malformed = at(point, "this.#bodyPinStep = 'none';");
    const bad = run(await load(malformed, point + '-guard-original'));
    const bypass = replace(malformed, `if (!probeBodyPinRootAccess.confirmationStageCheck(root, source, this, '${point}'))`, 'if (false)');
    const counter = run(await load(bypass, point + '-guard-bypass'));
    const prefix = x => JSON.stringify([x.r.first, x.s.stages.failurePoint, x.s.stages.checkedPostChecked, x.s.stages.completed]);
    assert.notEqual(prefix(counter), prefix(bad), 'meaningful guard control: ' + point); guardControls++;
  }
  // Fake a correct value projection while leaving the actual current borrow foreign.
  const view = 'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => a.bodyPinValues(source),';
  const forged = replace(at('confirmed', 'this.#bodyExpectedSourceCurrent = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(source))) as never;'), view,
    'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => { const v = a.bodyPinValues(source); return v.stage === "confirmed" ? { ...v, currentSame: true } : v; },');
  assert.equal(run(await load(forged, 'view-forgery')).r.first, 'binding_mismatch');
  const raw = 'a.#bodyExpectedSourceIssued === source && a.#bodyExpectedSourceCurrent === source && a.#bodyExpectedSourceRejected === undefined,';
  assert.equal(run(await load(replace(forged, raw, 'true,'), 'raw-check-bypass')).s.stages.completed, true);
  // Empty payload, original metadata, source stop and canonical activity remain mandatory.
  let stableCases = 0;
  for (const [name, text] of [
    ['payload', at('checked', 'this.#bodyBundleCurrent = {} as never;')],
    ['source-first', at('checked', "source.first = 'state_invalid';")],
    ['source-stop', at('before_confirmed', 'source.stopRequested = true;')],
    ['reference-post', at('confirmed', 'this.#bodyPinReferencePostChecked = false;')],
    ['hold', at('confirmed', "this.#bodyPinRejectedHold = 'confirmed';")],
    ['duty', at('checked', 'this.#runDuty = {} as never;')],
    ['metadata', method(source, 'bodyPinConfirmationStagePoint', '    this.#bodyPinConfirmationStagePoint = point;',
      '    this.#bodyPinConfirmationStagePoint = point; if (point === "checked") this.#bodySourceMetadataConfirmed = false;', 'CanonicalGateDraftRoot')],
    ['inactive', method(source, 'bodyPinConfirmationStagePoint', '    this.#bodyPinConfirmationStagePoint = point;',
      '    this.#bodyPinConfirmationStagePoint = point; if (point === "checked") this.#bodyPinCallActive = false;', 'CanonicalGateDraftRoot')],
  ]) {
    const x = run(await load(text, 'stable-' + name)); assert.notEqual(x.r.disposition, 'pin_final_post_not_connected');
    assert.equal(x.s.stages.completed, false); assert.equal(x.s.confirmation.finalPostChecked, false); stableCases++;
  }
  const accepted = method(source, 'advanceBodyPinConfirmationStages', "    return 'rejected_attempt';", "    return 'accepted';");
  const ax = run(await load(accepted, 'accepted')); assert.equal(ax.r.first, 'state_invalid'); assert.equal(ax.s.confirmation.finalPostChecked, false);
  const lost = method(source, 'dispatchBodyPin', '      return probeStartAccess.bodyPinEnter(start, this, source);',
    "      probeStartAccess.bodyPinEnter(start, this, source); throw Error('private_return_lost');", 'CanonicalGateDraftRoot');
  const lx = run(await load(lost, 'lost-return')); assert.equal(lx.s.result, 'none'); assert.equal(lx.s.confirmation.classification, 'unreturned');
  assert.equal(lx.s.route.failureBoundary, 'before'); assert.equal(lx.s.stages.completed, true); assert.equal(lx.s.entryBusy, false); assert.equal(lx.s.callActive, false);
  let projectionControls = 0;
  for (const field of ['bodyPinConfirmationStagePoint', 'bodyPinConfirmationStageFailurePoint', 'bodyPinConfirmationStageReentry']) {
    const text = method(source, 'inspectBodyPinConfirmationStages', '    const c = this.inspectBodyPinConfirmationPreparation(), start = this.#issuedFrameBinding?.target.start;',
      `    this.#${field} = 'private_secret' as never;\n    const c = this.inspectBodyPinConfirmationPreparation(), start = this.#issuedFrameBinding?.target.start;`, 'CanonicalGateDraftRoot', false);
    const x = run(await load(text, 'projection-' + field)); assert.ok(!JSON.stringify(x.s).includes('private_secret'));
    const key = field.endsWith('FailurePoint') ? 'failurePoint' : field.endsWith('Reentry') ? 'reentry' : 'point';
    assert.equal(x.s.stages[key], 'unconfirmed'); projectionControls++;
  }
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = name => ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === name);
  const start = cls('RetirementStartAssembly'), root = cls('CanonicalGateDraftRoot');
  const advance = start.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'advanceBodyPinConfirmationStages');
  const statements = advance.body.statements.map(n => n.getText(ast));
  for (const group of [["this.#bodyPinStep = 'checked';", "this.#bodyPinStorageBoundary = 'after';"],
    ["this.#bodyPinStage = 'confirmed';", "this.#bodyPinStep = 'confirmed';", "this.#bodyPinStorageBoundary = 'after';"]]) {
    const i = statements.indexOf(group[0]); assert.ok(i >= 0); assert.deepEqual(statements.slice(i, i + group.length), group);
  }
  assert.ok(!advance.getText(ast).includes('before_final_post')); assert.ok(!advance.getText(ast).includes("return 'accepted'"));
  let markerWrites = 0, postWrites = 0;
  function scan(n, owner = '') {
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) && ts.isPropertyAccessExpression(n.left)) {
      const f = n.left.name.getText(ast); if (f === '#bodyPinFinalPostChecked') markerWrites++;
      if (f === '#bodyPinCheckedPostChecked' || f === '#bodyPinConfirmedPostChecked') { assert.equal(owner, 'advanceBodyPinConfirmationStages'); assert.equal(n.right.getText(ast), 'true'); postWrites++; }
    }
    ts.forEachChild(n, c => scan(c, owner));
  }
  scan(ast); assert.equal(markerWrites, 0); assert.equal(postWrites, 2);
  for (const [c, fields] of [[start, ['bodyPinCheckedPostChecked', 'bodyPinConfirmedPostChecked']],
    [root, ['bodyPinConfirmationStagesChecked']]]) for (const name of fields) {
    const f = c.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.equal(f.initializer.getText(ast), 'false'); assert.ok(f.end < c.members.find(ts.isConstructorDeclaration).pos);
  }
  for (const name of ['bodyPinConfirmationStagePoint', 'bodyPinConfirmationStageFailurePoint', 'bodyPinConfirmationStageReentry']) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.equal(f.initializer.getText(ast), "'none'"); assert.ok(f.end < root.members.find(ts.isConstructorDeclaration).pos);
  }
  const cache = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinConfirmationStagesFixed');
  assert.equal(cache.initializer, undefined); assert.ok(cache.end <= root.members.find(ts.isConstructorDeclaration).pos);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\ndeclare const start: RetirementStartAssembly;\nroot.bodyPinConfirmationStageMatches({},start,"confirmed");\nroot.bodyPinConfirmationStagePoint("checked",{},start);\nstart.advanceBodyPinConfirmationStages(root,{});\nstart.rejectBodyPinConfirmationStage({});\nconst badPoint: BodyPinConfirmationStagePoint = "before_final_post";\ndeclare const source: BodyBindSourceShell;\nsource.custodian = root;\nconst leak = createProbeBodyPinConfirmationStagesFake().inspect().stages.source;\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 7);
  console.log(JSON.stringify({ compiled: true, actualFieldCases, guardControls, stableCases, projectionControls, rawViewControl: true,
    actualPair: true, fixedGroups: 2, markerWrites, postWrites, lostReturn: true, acceptedRejected: true, semanticRejections: 7 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
