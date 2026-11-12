/** A-only contracts: no final-post writer, accepted return or runtime authority. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-confirm-prep-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, owner = 'CanonicalGateDraftRoot', priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js');
  writeFileSync(p, emit(s + '\nexport const confirmState = bodyPinConfirmationState;\nexport const callerClass = bodyPinCallerClassification;\n'));
  return import(pathToFileURL(p).href);
}
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'), a = base.createProbeBodyPinConfirmationPreparationFake();
  assert.equal(a.prepare().disposition, 'pin_confirmation_not_connected');
  assert.equal(a.inspect().confirmation.finalPostChecked, false);
  const changed = replace(source, 'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => a.bodyPinValues(source),',
    "bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => { if ((globalThis as any).__confirmNoView && a.#bodyPinStage === 'captured' && a.#bodyPinEntryBusy === false) throw Error('forbidden_return_view'); return a.bodyPinValues(source); },");
  const m = await load(changed, 'no-return-view'), b = m.createProbeBodyPinConfirmationPreparationFake();
  try { globalThis.__confirmNoView = true; b.prepare(); }
  finally { delete globalThis.__confirmNoView; }
  assert.equal(b.inspect().confirmation.diagnosticRecorded, true, 'diagnosis must precede allocating receiver views');
  const mixed = method(source, 'prepareBodyPinConfirmationCaller', "    const returned = this.#bodyPinCallResult !== 'none';",
    "    this.#bodySourceIssued = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(source))) as never; this.#bodySourceCurrent = this.#bodySourceIssued; (globalThis as any).__confirmMixed = this.#bodySourceIssued;\n    const returned = this.#bodyPinCallResult !== 'none';");
  try {
    const x = (await load(mixed, 'mixed')).createProbeBodyPinConfirmationPreparationFake(); x.prepare();
    assert.equal(globalThis.__confirmMixed.first, 'none', 'foreign source must not receive diagnostic writes');
  } finally { delete globalThis.__confirmMixed; }
  const position = method(source, 'prepareBodyPinConfirmationCaller', "    const returned = this.#bodyPinCallResult !== 'none';",
    "    this.#bodyPinRoutePhase = 'BP03'; this.#bodyPinRouteStep = 'preflight';\n    const returned = this.#bodyPinCallResult !== 'none';");
  const p = (await load(position, 'invalid-position')).createProbeBodyPinConfirmationPreparationFake(); p.prepare();
  assert.equal(p.inspect().route.failurePhase, 'none', 'invalid diagnostic pair must not manufacture a known location');
  const cases = [['captured_ready', 'after', 'captured', 'current', false], ['before_checked', 'before', 'captured', 'current', false],
    ['checked', 'after', 'captured', 'checked', false], ['before_confirmed', 'before', 'captured', 'checked', false],
    ['confirmed', 'after', 'confirmed', 'confirmed', false], ['before_final_post', 'before', 'confirmed', 'confirmed', false],
    ['post_returning', 'after', 'confirmed', 'confirmed', true]];
  function values([phase, boundary, stage, step, pinFinalPostChecked]) {
    return { phase, boundary, referencePostChecked: true, hold: 'not_started', pinFinalPostChecked,
      source: { state: 'initializing', phase: 'BP03', boundary: 'call', pinCallReached: true, claim: 'unused', bindCallReached: false,
        postConfirmed: false, stopRequested: false, first: 'none', failurePhase: 'none', failureBoundary: 'none', refusal: 'none', deliveryFirst: 'none' },
      receiver: { attemptUsed: true, stage, step, issued: true, current: true, rejected: false, issuedSame: true, currentSame: true,
        failureStep: 'none', first: 'none', failurePhase: 'none', failurePrefix: 'none', failureBoundary: 'none', refusal: 'none' } };
  }
  let valueFields = 0, crossCases = 0;
  for (const c of cases) {
    assert.equal(base.confirmState(values(c)), true);
    for (const other of cases) { assert.equal(base.confirmState({ ...values(other), phase: c[0] }), c === other); crossCases++; }
    for (const part of ['source', 'receiver']) for (const [key, value] of Object.entries(values(c)[part])) {
      const v = values(c); v[part][key] = typeof value === 'boolean' ? !value : 'private_invalid';
      assert.equal(base.confirmState(v), false); valueFields++;
      const missing = values(c); delete missing[part][key]; assert.equal(base.confirmState(missing), false);
    }
    for (const key of Object.keys(values(c))) { const v = values(c); delete v[key]; assert.equal(base.confirmState(v), false); }
    for (const part of ['source', 'receiver']) {
      assert.equal(base.confirmState({ ...values(c), [part]: null }), false);
      const v = values(c); v[part].extra = true; assert.equal(base.confirmState(v), false);
    }
    for (const [key, bad] of [['phase', 'unknown'], ['boundary', 'none'], ['referencePostChecked', false], ['hold', 'confirmed'], ['pinFinalPostChecked', !c[4]]])
      assert.equal(base.confirmState({ ...values(c), [key]: bad }), false);
    assert.equal(base.confirmState({ ...values(c), extra: true }), false);
  }
  const firsts = ['none', 'binding_mismatch', 'state_invalid', 'closed', 'receiver_unconfirmed'];
  const rejected = ['receiver_unconfirmed', 'binding_mismatch', 'state_invalid', 'closed', 'receiver_unconfirmed'];
  let callerCases = 0;
  for (const result of ['none', 'accepted', 'rejected_attempt', 'refused_existing']) for (const calls of [0, 1])
    for (const marker of [false, true]) for (let i = 0; i < firsts.length; i++) {
      const expected = result === 'none' ? 'unreturned' : result === 'refused_existing' ? 'refused_existing'
        : calls === 0 ? 'binding_mismatch' : result === 'accepted' ? marker && i === 0 ? 'completed_value_only' : 'state_invalid'
          : marker ? 'state_invalid' : rejected[i];
      assert.equal(base.callerClass(result, calls, marker, firsts[i]), expected); callerCases++;
    }
  for (const args of [['unknown', 1, false, 'none'], ['accepted', 2, true, 'none'], ['accepted', -1, true, 'none'],
    ['accepted', 0.5, true, 'none'], ['accepted', NaN, true, 'none'], ['accepted', 1, 'true', 'none'], ['accepted', 1, true, 'private_invalid']])
    assert.equal(base.callerClass(...args), 'state_invalid');
  for (const bad of ['true', "'private_secret'", 'null']) {
    const text = replace(source, '#bodyPinFinalPostChecked = false;', '#bodyPinFinalPostChecked = ' + bad + ' as never;');
    const x = (await load(text, 'marker-' + used.size)).createProbeBodyPinConfirmationPreparationFake();
    assert.equal(x.prepare().first, 'state_invalid'); assert.equal(x.inspect().confirmation.prepared, false);
    assert.ok(!JSON.stringify(x.inspect()).includes('private_secret'));
  }
  const accepted = method(source, 'prepareBodyPinConfirmationCaller', "    const returned = this.#bodyPinCallResult !== 'none';",
    "    this.#bodyPinCallResult = 'accepted';\n    const returned = this.#bodyPinCallResult !== 'none';");
  const fakeAccepted = (await load(accepted, 'accepted')).createProbeBodyPinConfirmationPreparationFake();
  assert.equal(fakeAccepted.prepare().first, 'state_invalid'); assert.equal(fakeAccepted.inspect().confirmation.finalPostChecked, false);
  const prior = (await load(source, 'prior')).createProbeBodyPinConfirmationPreparationFake('cp_later_reason');
  assert.equal(prior.prepare().first, 'construction_unconfirmed'); assert.equal(prior.inspect().sourceReason, 'receiver_unconfirmed');
  const firstBypass = method(source, 'recordBodyPinConfirmationFailure', "if (this.#failure.first === 'none') this.#failure.first = reason;", 'this.#failure.first = reason;');
  const lost = (await load(firstBypass, 'first-bypass')).createProbeBodyPinConfirmationPreparationFake('cp_later_reason');
  assert.equal(lost.prepare().first, 'state_invalid');
  const reasonBypass = method(source, 'recordBodyPinConfirmationFailure', "if (this.#bodyPinCallSourceReason === 'none') this.#bodyPinCallSourceReason = sourceReason;", 'this.#bodyPinCallSourceReason = sourceReason;');
  const lostReason = (await load(reasonBypass, 'reason-bypass')).createProbeBodyPinConfirmationPreparationFake('cp_later_reason');
  lostReason.prepare(); assert.equal(lostReason.inspect().sourceReason, 'state_invalid');
  const unsafe = method(source, 'prepareBodyPinConfirmationCaller', "    const returned = this.#bodyPinCallResult !== 'none';",
    "    this.#bodySourceMetadataConfirmed = false; const unsafe = new Proxy(source, { get() { (globalThis as any).__confirmUnsafeReads++; throw Error('private_source_read'); } }); this.#bodySourceIssued = unsafe; this.#bodySourceCurrent = unsafe;\n    const returned = this.#bodyPinCallResult !== 'none';");
  globalThis.__confirmUnsafeReads = 0;
  try {
    const x = (await load(unsafe, 'unsafe')).createProbeBodyPinConfirmationPreparationFake(); x.prepare();
    assert.equal(globalThis.__confirmUnsafeReads, 0); assert.equal(x.inspect().confirmation.diagnosticRecorded, true);
  } finally { delete globalThis.__confirmUnsafeReads; }
  // Single faults right before the owning prepared check, and a lost primitive return.
  const beforePrepared = code => method(source, 'storeBodyPinReferences', '      this.#bodyPinReferencePostChecked = true;',
    '      this.#bodyPinReferencePostChecked = true; ' + code, 'RetirementStartAssembly');
  const inactive = replace(beforePrepared('(globalThis as any).__cpInactive = true;'),
    '  private bodyPinBridgeActive(source: BodyBindSourceShell, start: RetirementStartAssembly): boolean {\n',
    '  private bodyPinBridgeActive(source: BodyBindSourceShell, start: RetirementStartAssembly): boolean {\n    if ((globalThis as any).__cpInactive) return false;\n');
  let preparedControls = 0;
  for (const [name, text] of [['busy', beforePrepared('this.#bodyPinEntryBusy = false;')], ['inactive', inactive],
    ['rejected-slot', beforePrepared('this.#bodyExpectedSourceRejected = {} as never;')]]) {
    try {
      const m = await load(text, 'prepared-' + name), x = m.createProbeBodyPinConfirmationPreparationFake(), r = x.prepare(), s = x.inspect();
      assert.equal(r.first, 'state_invalid', name); assert.equal(r.disposition, 'state_invalid', name);
      assert.equal(s.route.first, 'state_invalid', name); assert.equal(s.build.receiver.first, 'state_invalid', name);
      assert.equal(s.confirmation.prepared, false, name); assert.equal(s.confirmation.classification, 'state_invalid', name);
      preparedControls++;
    } finally { delete globalThis.__cpInactive; }
  }
  const lostReturn = method(source, 'dispatchBodyPin', '      return probeStartAccess.bodyPinEnter(start, this, source);',
    "      probeStartAccess.bodyPinEnter(start, this, source); throw Error('private_return_lost');");
  const lx = (await load(lostReturn, 'lost-return')).createProbeBodyPinConfirmationPreparationFake(); lx.prepare();
  const ls = lx.inspect();
  assert.equal(ls.fixedCalls, 1); assert.equal(ls.result, 'none'); assert.equal(ls.phase, 'calling');
  assert.equal(ls.route.failureBoundary, 'before'); assert.equal(ls.confirmation.classification, 'unreturned');

  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = name => ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === name);
  const root = cls('CanonicalGateDraftRoot'), start = cls('RetirementStartAssembly');
  const writer = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'recordBodyPinConfirmationFailure');
  function noAllocation(n) {
    assert.ok(!ts.isCallExpression(n) && !ts.isNewExpression(n) && !ts.isObjectLiteralExpression(n)
      && !ts.isArrayLiteralExpression(n) && !ts.isAwaitExpression(n) && !ts.isTemplateExpression(n), 'allocating diagnostic writer');
    ts.forEachChild(n, noAllocation);
  }
  noAllocation(writer.body);
  const classifier = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'bodyPinCallerClassification');
  noAllocation(classifier.body);
  const caller = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'prepareBodyPinConfirmationCaller');
  const diagnosticIndex = caller.body.statements.findIndex(n => n.getText(ast).startsWith('this.recordBodyPinConfirmationFailure('));
  assert.ok(diagnosticIndex > 0);
  const primitiveCalls = new Set(['probeStartAccess.bodyPinReceiverFirst', 'probeStartAccess.bodyPinFinalPostChecked', 'bodyPinCallerClassification']);
  function primitivePrefix(n) {
    if (ts.isCallExpression(n)) assert.ok(primitiveCalls.has(n.expression.getText(ast)), 'unexpected call before diagnosis');
    assert.ok(!ts.isNewExpression(n) && !ts.isObjectLiteralExpression(n) && !ts.isArrayLiteralExpression(n)
      && !ts.isAwaitExpression(n) && !ts.isTemplateExpression(n), 'allocation before diagnosis');
    ts.forEachChild(n, primitivePrefix);
  }
  assert.equal(caller.body.statements[0].getText(ast), 'if (this.bodyPinFinalPost) return this.prepareBodyPinFinalCaller(source, start);');
  caller.body.statements.slice(1, diagnosticIndex).forEach(primitivePrefix);
  // Legacy modes still have no marker writer; the sole C-c helper is audited by its own compiled control.
  let markerWrites = 0;
  function scan(n, owner = '') {
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) && ts.isPropertyAccessExpression(n.left)
      && n.left.name.getText(ast) === '#bodyPinFinalPostChecked') {
      if (owner === 'completeBodyPinFinalPost') assert.equal(n.right.getText(ast), 'true');
      else markerWrites++;
    }
    ts.forEachChild(n, c => scan(c, owner));
  }
  scan(ast); assert.equal(markerWrites, 0);
  const field = start.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinFinalPostChecked');
  assert.ok(field.end < start.members.find(ts.isConstructorDeclaration).pos); assert.equal(field.initializer.getText(ast), 'false');
  const owning = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'bodyPinConfirmationPreparedMatches');
  assert.ok(owning.getText(ast).includes("phase: 'captured_ready'"));
  const prep = start.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'prepareBodyPinConfirmationContracts');
  assert.ok(prep.getText(ast).includes("return 'rejected_attempt';")); assert.ok(!prep.getText(ast).includes("return 'accepted'"));
  for (const [name, literal] of [['bodyPinConfirmationPrepared', 'false'], ['bodyPinConfirmationDiagnosticRecorded', 'false'],
    ['bodyPinConfirmationClassification', "'none'"], ['bodyPinConfirmationReplyAttempted', 'false']]) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.ok(f.end < root.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), literal);
  }
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\ndeclare const start: RetirementStartAssembly;\nroot.bodyPinConfirmationPreparedMatches({}, start);\nroot.prepareBodyPinConfirmationCaller({}, start);\nroot.recordBodyPinConfirmationFailure("closed", "closed", undefined);\nstart.prepareBodyPinConfirmationContracts(root, {});\ndeclare const value: Extract<BodyPinConfirmationState,{phase:"captured_ready"}>;\nconst badBoundary: BodyPinConfirmationState = {...value, boundary:"before"};\nconst badMarker: BodyPinConfirmationState = {...value, pinFinalPostChecked:true};\nconst badStep: BodyPinConfirmationState = {...value, phase:"checked"};\nconst badPhase: BodyPinConfirmationState["phase"] = "returned";\nconst badClass: BodyPinCallerClassification = "authorized";\nconst leak = createProbeBodyPinConfirmationPreparationFake().inspect().source;\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 10);
  console.log(JSON.stringify({ compiled: true, preparedControls, lostReturnControl: true, valueStates: cases.length, valueFields, crossCases, callerCases, invalidCallerCases: 7,
    markerWrites, finalMarkerFalse: true, noReturnView: true, noAllocation: true, primitiveCallerPrefix: true, foreignSourceUntouched: true, untrustedSourceReads: 0,
    firstAndReasonControls: 2, invalidPositionRejected: true, acceptedRejected: true, semanticRejections: 10 }));
} finally { delete globalThis.__confirmNoView; delete globalThis.__confirmMixed; rmSync(dir, { recursive: true, force: true }); }
