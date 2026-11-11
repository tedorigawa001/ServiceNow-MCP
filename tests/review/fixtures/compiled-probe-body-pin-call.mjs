/** Synthetic owning call path only; no reference capture, source claim, bind or body. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-call-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, owner = 'CanonicalGateDraftRoot', priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
const at = code => method(source, 'bodyPinCallPoint', '    this.#bodyPinCallPoint = point;',
  '    this.#bodyPinCallPoint = point;\n    if (point === "preflight_before") { ' + code + ' }');
async function load(s, name) {
  assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js');
  writeFileSync(p, emit('export let __witness: unknown;\n' + s)); return import(pathToFileURL(p).href);
}
const run = (m, script) => { const a = script ? m.createProbeBodyPinCallFake(script) : m.createProbeBodyPinCallFake();
  return { a, r: a.prepare(), s: a.inspect() }; };
const receiver = 'RetirementStartAssembly';
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'), normal = run(base);
  assert.equal(normal.r.disposition, 'pin_storage_not_connected');
  assert.equal(normal.s.fixedCalls, 1); assert.equal(normal.s.build.receiver.pinAttemptUsed, true);
  assert.equal(normal.s.build.receiver.pinStage, 'attempting');
  assert.ok(normal.s.build.receiver.references.every(v => !v.retained));

  // Observe actual call-window qualification on the owning path, not fabricated flag initializers.
  const live = await load(at('__witness = [this.bodyPinBridgeActive(source, start), this.#bodyPinCallActive, probeStartAccess.bodyPinEntryBusy(start), source.pinCallReached];'), 'live');
  run(live); assert.deepEqual(live.__witness, [true, true, true, true]);
  const inactive = at('this.#bodyPinCallActive = false;');
  const ix = run(await load(inactive, 'inactive-window'));
  assert.equal(ix.s.build.receiver.first, 'state_invalid'); assert.equal(ix.s.build.receiver.pinAttemptUsed, false);
  // These guards overlap: test the combined obligation, not a false single-clause sensitivity claim.
  const noActive = method(inactive, 'bodyPinBridgeActive', ' && this.#bodyPinCallActive === true', '');
  const intervalClause = "bodyPinIntervalMatches({ state: 'calling', callActive: this.#bodyPinCallActive, pinCallReached: values.pinCallReached,\n        entryBusy: probeStartAccess.bodyPinEntryBusy(start) })";
  const iy = run(await load(method(noActive, 'bodyPinBridgeActive', intervalClause, 'true'), 'inactive-control'));
  assert.equal(iy.s.build.receiver.pinAttemptUsed, true); assert.equal(iy.s.build.receiver.first, 'receiver_unconfirmed');
  for (const [owner, name, flag, key] of [
    ['CanonicalGateDraftRoot', 'dispatchBodyPin', '#bodyPinCallActive', 'callActive'],
    [receiver, 'bodyPinReceiverEntry', '#bodyPinEntryBusy', 'entryBusy'],
  ]) {
    const m = await load(method(source, name, `finally { this.${flag} = false; }`, 'finally { /* mutation: missing release */ }', owner), 'finally-' + key);
    assert.equal(run(m).s[key], true, key + ' removal must leave actual live state observable');
    for (const script of ['ec_normal', 'ec_fault_preflight_before', 'ec_close_preflight_after', 'ec_prior_attempt_after'])
      assert.equal(run(base, script).s[key], false, key + '/' + script);
  }
  const skip = await load(method(source, 'dispatchBodyPin', 'return probeStartAccess.bodyPinEnter(start, this, source);', "return 'rejected_attempt';"), 'skip-call');
  const skipped = run(skip); assert.equal(skipped.s.fixedCalls, 1);
  assert.equal(skipped.s.build.receiver.pinAttemptUsed, false); assert.equal(skipped.s.build.receiver.first, 'none');
  assert.notEqual(skipped.r.disposition, normal.r.disposition, 'a counter alone is not receiver-entry evidence');
  const forged = run(await load(method(source, 'dispatchBodyPin', 'return probeStartAccess.bodyPinEnter(start, this, source);', "return 'accepted';"), 'forged-acceptance'));
  assert.equal(forged.r.first, 'state_invalid'); assert.equal(forged.s.build.receiver.pinAttemptUsed, false);
  assert.ok(forged.s.build.receiver.references.every(v => !v.retained));

  // Foreign/copy/proxy rejection is checked before source fields or receiver writes, including on a live call.
  const bridge = 'bodyPinEnter: (a: RetirementStartAssembly, root: CanonicalGateDraftRoot, source: BodyBindSourceShell) => a.bodyPinReceiverEntry(root, source),';
  for (const kind of ['copy', 'proxy']) {
    const candidate = kind === 'copy' ? 'Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(source)))'
      : "new Proxy(source, { get() { throw Error('private_hook'); }, ownKeys() { throw Error('private_hook'); } })";
    const altered = replace(source, bridge, `bodyPinEnter: (a: RetirementStartAssembly, root: CanonicalGateDraftRoot, source: BodyBindSourceShell) => {
      const before = JSON.stringify(a.bodyFieldsInspect());
      const result = a.bodyPinReceiverEntry(root, ${candidate} as BodyBindSourceShell);
      __witness = [result, before === JSON.stringify(a.bodyFieldsInspect()), a.#bodyPinEntryBusy, a.#bodyPinAttemptUsed];
      return a.bodyPinReceiverEntry(root, source);
    },`);
    const m = await load(altered, 'foreign-' + kind); assert.equal(run(m).r.disposition, 'pin_storage_not_connected');
    assert.deepEqual(m.__witness, ['rejected_attempt', true, false, false]);
  }
  const stopped = at('this.close(); __witness = probeStartAccess.bodyPinEnter(start, this, source);');
  const sm = await load(stopped, 'stop-before-busy'); assert.equal(run(sm).r.first, 'closed'); assert.equal(sm.__witness, 'rejected_attempt');
  const noStop = method(stopped, 'bodyPinReceiverEntry', "    if (probeBodyPinRootAccess.stopped(root, source)) return 'rejected_attempt';\n", '', receiver);
  const ns = await load(noStop, 'stop-control'); run(ns); assert.equal(ns.__witness, 'refused_existing');
  const reentry = run(base, 'ec_reenter_preflight_before'); assert.equal(reentry.s.reentry, 'refused_existing');
  assert.equal(reentry.s.build.receiver.failurePrefix, 'none'); assert.equal(reentry.s.build.receiver.first, 'receiver_unconfirmed');

  // Phase checker integration: mutate one supplied field only after real entry, then bypass that checker.
  let phaseFields = 0;
  const sourceFields = { state: 'failed', claim: 'spent', pinCallReached: false, bindCallReached: true, postConfirmed: true,
    stopRequested: true, phase: 'BP02', boundary: 'checked', first: 'closed', failurePhase: 'BP03', failureBoundary: 'call',
    refusal: 'in_progress', deliveryFirst: 'delivery_unconfirmed' };
  const receiverFields = { attemptUsed: true, stage: 'issued', issued: true, current: true, rejected: true, issuedSame: true, currentSame: true,
    step: 'attempt', failureStep: 'preflight', first: 'closed', failurePhase: 'pin', failurePrefix: 'occupied', failureBoundary: 'before', refusal: 'in_progress' };
  const valueLine = '    const values = { source: this.bodyPinSourceValues(source), receiver: probeStartAccess.bodyPinValues(start, source) };';
  for (const [part, fields] of Object.entries({ source: sourceFields, receiver: receiverFields })) for (const [field, value] of Object.entries(fields)) {
    const changed = method(source, 'bodyPinReceiverMatches', valueLine,
      valueLine + `\n    if (!attempted) (values.${part} as any).${field} = ${JSON.stringify(value)};`);
    const x = run(await load(changed, 'phase-' + part + '-' + field));
    assert.equal(x.r.first, 'state_invalid'); assert.equal(x.s.build.receiver.first, 'state_invalid');
    assert.equal(x.s.build.receiver.pinAttemptUsed, false); assert.equal(x.s.receiverPin.failureStep, 'preflight');
    const bypass = method(changed, 'bodyPinReceiverMatches', 'BODY_PIN_PHASE_CHECKS.receiverEntry(values)', 'true');
    const y = run(await load(bypass, 'phase-control-' + part + '-' + field));
    assert.equal(y.s.build.receiver.pinAttemptUsed, true); assert.equal(y.s.build.receiver.first, 'receiver_unconfirmed'); phaseFields++;
  }
  const noAttemptCheck = method(source, 'bodyPinReceiverMatches', valueLine,
    valueLine + '\n    if (attempted) (values.receiver as any).step = "preflight";');
  const ax = run(await load(noAttemptCheck, 'attempt-check')); assert.equal(ax.s.build.receiver.first, 'state_invalid');
  const ay = run(await load(method(noAttemptCheck, 'bodyPinReceiverMatches', 'BODY_PIN_PHASE_CHECKS.attempting(values)', 'true'), 'attempt-control'));
  assert.equal(ay.s.build.receiver.first, 'receiver_unconfirmed'); assert.equal(ax.s.receiverPin.failureStep, 'attempt');

  // Single-point controls: each injection reaches one guard first, so removing that guard moves the first observable rejection.
  const flagged = replace(replace(source, 'bodyPinEntryBusy: (a: RetirementStartAssembly) => a.#bodyPinEntryBusy,',
    'bodyPinEntryBusy: (a: RetirementStartAssembly) => (globalThis as any).__ecBusy ?? a.#bodyPinEntryBusy,'),
  '  private bodyFieldsInitial(): boolean {\n    return ', '  private bodyFieldsInitial(): boolean {\n    return !(globalThis as any).__ecInit && ');
  const atPoint = (s, point, code) => method(s, 'bodyPinCallPoint', '    this.#bodyPinCallPoint = point;',
    `    this.#bodyPinCallPoint = point;\n    if (point === '${point}') { ${code} }`);
  const notCalled = { fixedCalls: 0, pinCallReached: false, attemptUsed: false };
  const enteredOnly = { fixedCalls: 1, pinCallReached: true, attemptUsed: false, receiverFirst: 'none', step: 'none' };
  const pointControls = [
    ['dispatch-preflight', atPoint(flagged, 'before_call', "this.#bodyPinRouteBoundary = 'before';"), { first: 'binding_mismatch', ...notCalled }],
    ['dispatch-busy', atPoint(flagged, 'before_call', '(globalThis as any).__ecBusy = true;'), { first: 'binding_mismatch', ...notCalled }],
    ['dispatch-counter', atPoint(flagged, 'before_call', 'this.#bodyPinFixedCalls = 1;'), { pinCallReached: false, attemptUsed: false }],
    ['stop-source-request', atPoint(flagged, 'before_call', 'source.stopRequested = true;'), { first: 'closed', ...notCalled }],
    ['stop-source-first', atPoint(flagged, 'before_call', "source.first = 'closed';"), { first: 'closed', ...notCalled }],
    ['receiver-active', replace(flagged, "this.#bodyPinRouteStep = 'call'; this.#bodyPinRouteBoundary = 'before';",
      "this.#bodyPinRouteStep = 'call'; this.#bodyPinRouteBoundary = 'after';"), enteredOnly],
    ['receiver-fields', atPoint(flagged, 'before_call', '(globalThis as any).__ecInit = true;'), enteredOnly],
    ['receiver-entry-before', atPoint(flagged, 'preflight_before', "source.boundary = 'before';"),
      { first: 'state_invalid', attemptUsed: false, receiverFirst: 'state_invalid', receiverBoundary: 'before', failurePoint: 'preflight_before' }],
    ['receiver-entry-after', atPoint(flagged, 'preflight_after', "source.boundary = 'before';"),
      { first: 'state_invalid', attemptUsed: false, receiverFirst: 'state_invalid', receiverBoundary: 'before', failurePoint: 'preflight_after' }],
  ];
  for (const [name, text, expected] of pointControls) {
    try {
      const x = run(await load(text, 'point-' + name)), rv = x.s.build.receiver;
      const actual = { first: x.r.first, fixedCalls: x.s.fixedCalls, pinCallReached: x.s.build.source.pinCallReached, attemptUsed: rv.pinAttemptUsed,
        receiverFirst: rv.first, step: x.s.receiverPin.step, receiverBoundary: rv.failureBoundary, failurePoint: x.s.failurePoint };
      for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, name + ' ' + key);
      assert.equal(x.s.callActive, false); assert.ok(rv.references.every(v => !v.retained));
    } finally { delete globalThis.__ecBusy; delete globalThis.__ecInit; }
  }

  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  const cls = name => ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === name);
  const member = (owner, name) => cls(owner).members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
  const dispatch = member('CanonicalGateDraftRoot', 'dispatchBodyPin');
  const interval = dispatch.body.statements.find(ts.isTryStatement);
  assert.ok(interval.finallyBlock.getText(ast).includes('this.#bodyPinCallActive = false;'));
  const direct = interval.tryBlock.statements;
  assert.equal(direct.length, 9); assert.ok(ts.isReturnStatement(direct[8]));
  assert.equal(direct[8].expression.getText(ast), 'probeStartAccess.bodyPinEnter(start, this, source)');
  for (const n of direct.slice(0, 8)) assert.ok(ts.isExpressionStatement(n) && ts.isBinaryExpression(n.expression)
    && n.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken, 'direct synchronous assignments only');
  assert.deepEqual(direct.slice(0, 8).map(n => n.expression.getText(ast)), [
    "this.#bodyPinCallPhase = 'calling'", "this.#bodyPinRoutePhase = 'BP03'", "this.#bodyPinRouteStep = 'call'", "this.#bodyPinRouteBoundary = 'before'",
    "source.phase = 'BP03'", "source.boundary = 'call'", 'source.pinCallReached = true', 'this.#bodyPinCallActive = true',
  ], 'fixed literals/order; no hidden RHS hook, allocation or callback');
  const entry = member(receiver, 'bodyPinReceiverEntry'), group = entry.getText(ast);
  assert.ok(group.includes("this.#bodyPinStep = 'attempt'; this.#bodyPinAttemptUsed = true; this.#bodyPinStage = 'attempting';"));
  assert.ok(group.indexOf('this.#bodyPinEntryBusy = true;') < group.indexOf('try {'));
  assert.ok(group.includes('finally { this.#bodyPinEntryBusy = false; }'));
  const unused = new Set(['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyExpectedSourceRejected', '#bodyBundleIssued', '#bodyBundleCurrent',
    '#bodyRejectedBundle', '#bodyDraftIssued', '#bodyDraftCurrent', '#bodyRejectedDraft', 'bindCallReached', 'postConfirmed', 'claim']);
  let callFlagWrites = 0, trialWrites = 0, accessWrites = 0;
  function scan(n, scope = '', owner = '') {
    if (ts.isClassDeclaration(n)) scope = n.name?.text ?? '';
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind)) {
      if (ts.isPropertyAccessExpression(n.left)) {
        const f = n.left.name.getText(ast); assert.ok(!unused.has(f)
          || scope === receiver && owner === 'storeBodyPinReferences' && ['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent'].includes(f)
          || scope === receiver && owner === 'bodyPinReferenceFault' && f === '#bodyExpectedSourceCurrent'
          || scope === receiver && owner === 'retainBodyPinRejected' && f === '#bodyExpectedSourceRejected', 'disconnected field write ' + f);
        if (f === 'pinCallReached') { callFlagWrites++; assert.equal(scope + '.' + owner, 'CanonicalGateDraftRoot.dispatchBodyPin'); assert.equal(n.right.getText(ast), 'true'); }
        if (f === '#bodyPinAttemptUsed') { trialWrites++; assert.equal(scope + '.' + owner, receiver + '.bodyPinReceiverEntry'); assert.equal(n.right.getText(ast), 'true'); }
      }
      if (ts.isIdentifier(n.left) && ['probeBodyPinRootAccess', 'probeStartAccess'].includes(n.left.text)) accessWrites++;
    }
    ts.forEachChild(n, c => scan(c, scope, owner));
  }
  scan(ast); assert.equal(callFlagWrites, 1); assert.equal(trialWrites, 1); assert.equal(accessWrites, 2);
  const defaults = { bodyPinCallPhase: "'none'", bodyPinCallFailurePhase: "'none'", bodyPinFixedCalls: '0', bodyPinCallResult: "'none'",
    bodyPinCallSourceReason: "'none'", bodyPinCallPoint: "'none'", bodyPinCallFailurePoint: "'none'", bodyPinCallReentry: "'none'" };
  for (const [field, literal] of Object.entries(defaults)) {
    const f = cls('CanonicalGateDraftRoot').members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + field);
    assert.ok(f.end <= cls('CanonicalGateDraftRoot').members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), literal);
  }
  const allowlists = ['bodyPinCallPhase', 'bodyPinCallFailurePhase', 'bodyPinCallResult', 'bodyPinCallSourceReason', 'bodyPinCallPoint', 'bodyPinCallFailurePoint', 'bodyPinCallReentry'];
  const keys = ['phase', 'failurePhase', 'result', 'sourceReason', 'point', 'failurePoint', 'reentry'];
  for (let i = 0; i < allowlists.length; i++) {
    const changed = method(source, 'inspectBodyPinCall', '    const c = this.inspectBodyPinBridge();',
      `    const c = this.inspectBodyPinBridge(); this.#${allowlists[i]} = 'private_secret';`, 'CanonicalGateDraftRoot', false);
    assert.equal(run(await load(changed, 'projection-' + i)).s[keys[i]], 'unconfirmed');
  }
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\ndeclare const start: RetirementStartAssembly;\nroot.dispatchBodyPin({}, start);\nstart.bodyPinReceiverEntry(root, {});\nroot.prepareBodyPinCall({}, start);\nroot.bodyPinReceiverMatches({}, start, false);\nroot.bodyPinCallRefuse({}, start, true);\nconst badPhase: BodyPinCallPhase = "issued";\nconst badPoint: BodyPinCallPoint = "between_flag_and_call";\nconst badResult: BodyPinAdmission = "stored";\n';
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 8);
  console.log(JSON.stringify({ compiled: true, owningWindow: true, activeWindowCombinedControl: true, finallyControls: 2, noCallControl: true, forgedAcceptanceRejected: true, foreignUnchanged: 2,
    stopBeforeReentry: true, phaseFields, attemptingControl: true, pointControls: pointControls.length, directAssignments: 8, priorScalars: Object.keys(defaults).length,
    callFlagWrites, trialWrites, accessWrites, storageAndClaimWrites: 0, projectionAllowlists: allowlists.length, semanticRejections: 8 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
