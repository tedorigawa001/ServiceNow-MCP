/** C-02 front: scratch-only fault and private-boundary controls; no fixed receiver call. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-start-')), names = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class CanonicalGateDraftRoot'));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
const at = (step, boundary, code) => method(source, 'bodyPinStartPoint', '    this.#bodyPinStartStep = step; this.#bodyPinStartBoundary = boundary;',
  `    this.#bodyPinStartStep = step; this.#bodyPinStartBoundary = boundary;\n    if (step === '${step}' && boundary === '${boundary}') { ${code} }`);
async function load(s, name) {
  assert.ok(!names.has(name)); names.add(name); const p = join(dir, name + '.js'); writeFileSync(p, emit(s)); return import(pathToFileURL(p).href);
}
const run = m => { const a = m.createProbeBodyPinStartFake(); return { a, r: a.prepare(), s: a.inspect() }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'); assert.equal(run(base).r.disposition, 'pin_call_not_connected');
  const late = run(await load(at('blocked', 'before', "this.#bodySourceIssued!.boundary = 'before';"), 'late-source'));
  assert.equal(late.r.first, 'binding_mismatch', 'final call-ready values must be rechecked after the last checkpoint');
  assert.equal(late.s.callBlocked, false); assert.equal(late.s.failureStep, 'blocked');
  const witness = code => 'export let __witness: unknown;\n' + code;
  const peer = `const other = new CanonicalGateDraftRoot('pc_normal', true,
    true, true, false, true, false, false, false, false, false, false, true, true); other.prepare();`;
  const actual = ['this', 'this.#bodySourceIssued!', 'this.#issuedFrameBinding!.target.start'];
  const foreign = ['other', 'other.#bodySourceIssued!', 'other.#issuedFrameBinding!.target.start'];
  for (let i = 0; i < 3; i++) {
    const args = actual.map((v, j) => i === j ? foreign[j] : v).join(', ');
    const code = at('identity', 'before', `${peer}
      const before = JSON.stringify(this.inspectBodyPinStart()), beforePeer = JSON.stringify(other.inspectBodyPinContracts());
      __witness = this.admitBodyPinCaller(${args});
      if (before !== JSON.stringify(this.inspectBodyPinStart()) || beforePeer !== JSON.stringify(other.inspectBodyPinContracts())) throw Error('foreign_write');`);
    const m = await load(witness(code), 'actual-foreign-' + i), x = run(m);
    assert.equal(m.__witness, 'rejected_attempt'); assert.equal(x.r.disposition, 'pin_call_not_connected');
    const a = i === 0 ? 'root !== this' : i === 1 ? 'source !== this.#bodySourceIssued || source !== this.#bodySourceCurrent'
      : 'start !== this.#issuedFrameBinding?.target.start';
    const mutant = method(witness(code), 'bodyPinCallerMatches', a, 'false');
    const mm = await load(mutant, 'foreign-control-' + i); run(mm);
    assert.notEqual(mm.__witness, 'rejected_attempt', 'identity guard sensitivity ' + i);
  }
  const priority = ['this.#closed = true;', 'this.#bodySourceStopRequested = true;', "this.#failure.first = 'state_invalid';",
    'this.#bodySourceIssued!.stopRequested = true;', "this.#bodySourceIssued!.first = 'state_invalid';"];
  const stopGuard = "if (this.#closed || this.#bodySourceStopRequested || this.#failure.first !== 'none' || source.stopRequested || source.first !== 'none') return 'rejected_attempt';";
  for (let i = 0; i < priority.length; i++) {
    const code = witness(at('preflight', 'before', priority[i] + ` __witness = this.admitBodyPinCaller(${actual.join(', ')});`));
    const m = await load(code, 'stop-priority-' + i), x = run(m); assert.equal(m.__witness, 'rejected_attempt');
    if (i === 4) assert.equal(x.s.build.source.first, 'state_invalid', 'source first survives outer binding failure');
    const mm = await load(method(code, 'admitBodyPinCaller', stopGuard, ''), 'stop-control-' + i); run(mm);
    assert.equal(mm.__witness, 'refused_existing', 'stop must precede duplicate refusal ' + i);
  }
  const sourceFields = [['state', "'preparing'"], ['claim', "'spent'"], ['pinCallReached', 'true'], ['bindCallReached', 'true'],
    ['postConfirmed', 'true'], ['stopRequested', 'true'], ['phase', "'BP04'"], ['boundary', "'held'"],
    ['first', "'state_invalid'"], ['failurePhase', "'BP03'"], ['failureBoundary', "'call'"], ['refusal', "'duplicate_pin'"], ['deliveryFirst', "'state_invalid'"]];
  let phaseRejections = 0;
  for (const [step, boundary] of [['entry', 'after'], ['preflight', 'before'], ['preflight', 'after'], ['blocked', 'before']]) {
    for (const [field, value] of sourceFields) {
      const x = run(await load(at(step, boundary, `this.#bodySourceIssued!.${field} = ${value};`), 'phase-' + phaseRejections++));
      assert.equal(x.r.first, step === 'entry' ? 'state_invalid' : 'binding_mismatch', step + '/' + field);
      assert.equal(x.s.failureStep, step); assert.equal(x.s.callBlocked, false);
      assert.equal(x.s.route.attempted, step !== 'entry');
    }
  }
  const contexts = ['this.#frame = false;', 'this.#ready = true;', "this.#bodyPinPreparationState = 'failed';",
    "this.#bodyPinPreparationPhase = 'checking';", 'this.#bodyPinPreparationChecked = false;',
    "this.#bodyPinPreparationFirst = 'state_invalid';", "this.#bodyPinPreparationFailurePhase = 'checked';",
    'this.#bodyPinCallerConfirmed = false;'];
  for (let i = 0; i < contexts.length; i++) {
    const x = run(await load(at('entry', 'after', contexts[i]), 'context-' + i));
    assert.equal(x.r.first, 'state_invalid'); assert.equal(x.s.route.attempted, false); assert.equal(x.s.failureStep, 'entry');
    assert.equal(x.s.route.refusal, 'none', 'internal rejection is not a foreign refusal ' + i);
  }
  // Removing each actual phase-check call must let its otherwise isolated bad value pass that boundary.
  const rechecks = [
    ['entry', 'before', 'if (!this.bodyPinStartInitialMatches())', "this.#bodySourceIssued!.boundary = 'before';", 'admitBodyPinCaller', false],
    ['entry', 'after', 'if (!this.bodyPinStartInitialMatches())', "this.#bodySourceIssued!.boundary = 'before';", 'admitBodyPinCaller', true],
    ['preflight', 'before', 'if (!this.bodyPinStartPreflightMatches(false))', "this.#bodySourceIssued!.boundary = 'checked';", 'prepareBodyPinStart', false],
    ['preflight', 'after', 'if (!this.bodyPinStartPreflightMatches(true))', "this.#bodySourceIssued!.boundary = 'before';", 'prepareBodyPinStart', false],
    ['blocked', 'before', 'if (!this.bodyPinStartPreflightMatches(true))', "this.#bodySourceIssued!.boundary = 'before';", 'prepareBodyPinStart', true],
  ];
  for (let i = 0; i < rechecks.length; i++) {
    const [step, boundary, check, bad, name, last] = rechecks[i];
    const original = at(step, boundary, bad), start = original.indexOf('  private ' + name + '('), end = original.indexOf('\n  }\n', start) + 5;
    const chunk = original.slice(start, end), atCheck = last ? chunk.lastIndexOf(check) : chunk.indexOf(check);
    assert.ok(atCheck >= 0);
    const changed = original.slice(0, start) + chunk.slice(0, atCheck) + chunk.slice(atCheck).replace(check, 'if (false)') + original.slice(end);
    const before = run(await load(original, 'recheck-original-' + i)), after = run(await load(changed, 'recheck-control-' + i));
    assert.equal(before.s.failureStep, step); assert.equal(before.s.boundary, boundary);
    assert.ok(after.s.failureStep !== step || after.s.boundary !== boundary || after.s.callBlocked, 'recheck sensitivity ' + i);
  }
  const syncLine = "    if (this.#bodyPinRouteAttempted && step !== 'blocked') this.#bodyPinRouteBoundary = boundary;";
  const atIn = (s, step, boundary, code) => method(s, 'bodyPinStartPoint', syncLine,
    `${syncLine}\n    if (step === '${step}' && boundary === '${boundary}') { ${code} }`);
  const where = x => `${x.r.first}/${x.s.step}/${x.s.boundary}`;
  const routeFields = ['bodyPinRouteAttempted', 'bodyPinRouteState', 'bodyPinRoutePhase', 'bodyPinRouteStep', 'bodyPinRouteBoundary',
    'bodyPinFailureRecorded', 'bodyPinFirst', 'bodyPinFailurePhase', 'bodyPinFailureStep', 'bodyPinFailureBoundary',
    'bodyPinPreparingConfirmed', 'bodyPinPostChecked', 'bodyPinRefusal'];
  const unusedBad = ['true', "'running'", "'BP02'", "'preflight'", "'before'", 'true', "'closed'", "'BP02'", "'call'", "'after'", 'true', 'true', "'duplicate_pin'"];
  const unusedClauses = ['this.#bodyPinRouteAttempted === false', "this.#bodyPinRouteState === 'not_started'", "this.#bodyPinRoutePhase === 'none'",
    "this.#bodyPinRouteStep === 'none'", "this.#bodyPinRouteBoundary === 'none'", 'this.#bodyPinFailureRecorded === false', "this.#bodyPinFirst === 'none'",
    "this.#bodyPinFailurePhase === 'none'", "this.#bodyPinFailureStep === 'none'", "this.#bodyPinFailureBoundary === 'none'",
    'this.#bodyPinPreparingConfirmed === false', 'this.#bodyPinPostChecked === false',
    "(this.#bodyPinRefusal === 'none' || this.#bodyPinRefusal === 'in_progress')"];
  for (let i = 0; i < routeFields.length; i++) {
    const changed = atIn(source, 'entry', 'before', `this.#${routeFields[i]} = ${unusedBad[i]};`);
    assert.equal(where(run(await load(changed, 'unused-' + i))), 'state_invalid/entry/before', 'route unused ' + routeFields[i]);
    const moved = run(await load(method(changed, 'bodyPinStartRouteUnused', unusedClauses[i], 'true'), 'unused-control-' + i));
    assert.notEqual(where(moved), 'state_invalid/entry/before', 'route unused sensitivity ' + routeFields[i]);
  }
  const preflightBad = ['false', "'held'", "'BP03'", "'call'", "'after'", 'true', "'closed'", "'BP02'", "'call'", "'after'", 'true', 'true', "'foreign_source'"];
  const preflightClauses = ['this.#bodyPinRouteAttempted !== true', "this.#bodyPinRouteState !== 'running'", "this.#bodyPinRoutePhase !== 'BP02'",
    "this.#bodyPinRouteStep !== 'preflight'", "this.#bodyPinRouteBoundary !== (checked ? 'after' : 'before')", 'this.#bodyPinFailureRecorded !== false',
    "this.#bodyPinFirst !== 'none'", "this.#bodyPinFailurePhase !== 'none'", "this.#bodyPinFailureStep !== 'none'",
    "this.#bodyPinFailureBoundary !== 'none'", 'this.#bodyPinPreparingConfirmed !== false', 'this.#bodyPinPostChecked !== false',
    "!['none', 'in_progress', 'duplicate_pin'].includes(this.#bodyPinRefusal)"];
  for (let i = 0; i < routeFields.length; i++) {
    const changed = atIn(source, 'preflight', 'before', `this.#${routeFields[i]} = ${preflightBad[i]};`);
    assert.equal(where(run(await load(changed, 'preflight-route-' + i))), 'binding_mismatch/preflight/before', 'preflight route ' + routeFields[i]);
    const moved = run(await load(method(changed, 'bodyPinStartPreflightMatches', preflightClauses[i], 'false'), 'preflight-route-control-' + i));
    assert.notEqual(where(moved), 'binding_mismatch/preflight/before', 'preflight route sensitivity ' + routeFields[i]);
  }
  const payloadHead = '  private bodyPinPayloadEmpty(): boolean {';
  const contextCalls = [
    ['base', 'entry', 'after', "this.#issuedCells!.body.state = 'running';", s => s, 'this.bodySeedBaseMatches() && '],
    ['storage', 'entry', 'after', "this.#bodySeedShell!.slots![0]!.stage = 'confirmed';", s => s, 'this.bodySourceStorageMatches(shell) && '],
    ['payload', 'entry', 'after', '(globalThis as any).__pinPayload = true;',
      s => replace(s, payloadHead, payloadHead + '\n    if ((globalThis as any).__pinPayload) this.#bodyBundleIssued = {} as never;'),
      ' && probeStartAccess.bodyPinPayloadEmpty(start)'],
    ['provenance', 'entry', 'before', 'const ds = Object.getOwnPropertyDescriptors(this.#bodySourceIssued!); ds.custodian.value = {}; const copy = Object.seal(Object.defineProperties({}, ds)); this.#bodySourceIssued = copy as BodyBindSourceShell; this.#bodySourceCurrent = copy as BodyBindSourceShell;',
      s => s, ' && this.bodyPinProvenanceMatches(shell)'],
  ];
  for (const [name, step, boundary, code, prep, clause] of contextCalls) {
    const changed = prep(at(step, boundary, code));
    try {
      assert.equal(where(run(await load(changed, 'context-call-' + name))), `state_invalid/${step}/${boundary}`, 'context ' + name);
      delete globalThis.__pinPayload;
      const owner = name === 'provenance' ? 'bodyPinStartContextMatches' : 'bodyPinStableStorageMatches';
      const moved = run(await load(method(changed, owner, clause, ''), 'context-call-control-' + name));
      assert.notEqual(where(moved), `state_invalid/${step}/${boundary}`, 'context sensitivity ' + name);
    } finally { delete globalThis.__pinPayload; }
  }
  const sameValueCopy = at('entry', 'after', 'const copy = Object.seal(Object.defineProperties({}, Object.getOwnPropertyDescriptors(this.#bodySourceIssued!))); this.#bodySourceIssued = copy as BodyBindSourceShell; this.#bodySourceCurrent = copy as BodyBindSourceShell;');
  assert.equal(where(run(await load(sameValueCopy, 'caller-recheck'))), 'binding_mismatch/entry/after', 'caller identity recheck');
  const noCallerRecheck = method(sameValueCopy, 'admitBodyPinCaller',
    "      if (!this.bodyPinCallerMatches(root, source, start)) { this.fail('binding_mismatch'); return 'rejected_attempt'; }\n", '');
  assert.notEqual(where(run(await load(noCallerRecheck, 'caller-recheck-control'))), 'binding_mismatch/entry/after', 'caller recheck sensitivity');
  const reenter = 'this.#bodyPinStartReentry = this.admitBodyPinCaller(this, this.#bodySourceIssued!, this.#issuedFrameBinding!.target.start);';
  const twiceRefused = atIn(atIn(source, 'started', 'after', reenter), 'preflight', 'before', reenter);
  const kept = run(await load(twiceRefused, 'refusal-first'));
  assert.equal(kept.s.route.refusal, 'in_progress'); assert.equal(kept.s.reentry, 'refused_existing');
  const overwritten = run(await load(method(twiceRefused, 'admitBodyPinCaller', "if (this.#bodyPinRefusal === 'none') this.#bodyPinRefusal", 'this.#bodyPinRefusal'), 'refusal-first-control'));
  assert.equal(overwritten.s.route.refusal, 'duplicate_pin');
  const first = run(await load(at('entry', 'before', `this.fail('state_invalid'); this.#bodyPinStartStep = 'blocked';
    this.#bodyPinStartBoundary = 'after'; this.fail('closed');`), 'first-position'));
  assert.equal(first.r.first, 'state_invalid'); assert.equal(first.s.failureStep, 'entry');
  assert.equal(first.s.route.failureBoundary, 'before'); assert.equal(first.s.failureSourceBoundary, 'before');
  first.a.close(); assert.equal(first.a.inspect().failureStep, 'entry');
  const unconfirmedCode = witness(method(at('entry', 'before', `this.#bodySourceMetadataConfirmed = false; throw Error('private_unconfirmed');`),
    'failBodyPinStart', "if (this.#bodySourceStorageConfirmed && this.#bodySeedShell) this.#bodySeedShell.state = 'failed';",
    "if (this.#bodySourceStorageConfirmed && this.#bodySeedShell) this.#bodySeedShell.state = 'failed';\n    __witness = this.#bodySourceIssued!.first;"));
  const unconfirmedModule = await load(unconfirmedCode, 'unconfirmed-source'), unconfirmed = run(unconfirmedModule);
  assert.equal(unconfirmed.s.route.first, 'construction_unconfirmed'); assert.equal(unconfirmed.s.build.source.first, 'unconfirmed');
  assert.equal(unconfirmedModule.__witness, 'none');
  const untrustedWriter = await load(method(unconfirmedCode, 'failBodyPinStart',
    'this.#bodySourceMetadataConfirmed && this.#bodySourceIssued', 'this.#bodySourceIssued'), 'unconfirmed-control');
  run(untrustedWriter); assert.equal(untrustedWriter.__witness, 'construction_unconfirmed');
  const projection = [
    ['bodyPinStartStep', 'step', 'BODY_PIN_START_STEPS'],
    ['bodyPinStartBoundary', 'boundary', "['none', 'before', 'after']"],
    ['bodyPinStartFailureStep', 'failureStep', 'BODY_PIN_START_STEPS'],
    ['bodyPinStartFailureSourceBoundary', 'failureSourceBoundary', "['none', 'before', 'checked']"],
    ['bodyPinAdmissionResult', 'admission', "['not_started', 'pending', 'accepted', 'refused_existing', 'rejected_attempt']"],
    ['bodyPinStartReentry', 'reentry', "['none', 'accepted', 'refused_existing', 'rejected_attempt']"],
  ];
  for (const [field, key, values] of projection) {
    const code = method(source, 'inspectBodyPinStart', 'const c = this.inspectBodyPinContracts();',
      `const c = this.inspectBodyPinContracts(); this.#${field} = 'private_secret';`, false);
    assert.equal(run(await load(code, 'projection-' + key)).s[key], 'unconfirmed');
    const mutant = method(code, 'inspectBodyPinStart', `runEnum(this.#${field}, ${values}, 'unconfirmed')`, `this.#${field}`, false);
    assert.equal(run(await load(mutant, 'projection-control-' + key)).s[key], 'private_secret');
  }
  const booleans = [['bodyPinCallerConfirmed', 'callerConfirmed'], ['bodyPinAdmissionBusy', 'busy'],
    ['bodyPinStartHookObserved', 'hookObserved'], ['bodyPinCallBlocked', 'callBlocked']];
  for (const [field, key] of booleans) {
    const code = method(source, 'inspectBodyPinStart', 'const c = this.inspectBodyPinContracts();',
      `const c = this.inspectBodyPinContracts(); this.#${field} = 'private_truthy';`, false);
    assert.equal(run(await load(code, 'boolean-' + key)).s[key], false);
    const mutant = method(code, 'inspectBodyPinStart', `this.#${field} === true`, `!!this.#${field}`, false);
    assert.equal(run(await load(mutant, 'boolean-control-' + key)).s[key], true);
  }
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CanonicalGateDraftRoot');
  const defaults = { bodyPinStartStep: "'none'", bodyPinStartBoundary: "'none'", bodyPinStartFailureStep: "'none'",
    bodyPinStartFailureSourceBoundary: "'none'", bodyPinCallerConfirmed: 'false', bodyPinAdmissionBusy: 'false',
    bodyPinAdmissionResult: "'not_started'", bodyPinStartReentry: "'none'", bodyPinStartHookObserved: 'false', bodyPinCallBlocked: 'false' };
  for (const [name, value] of Object.entries(defaults)) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.ok(f.end < root.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), value);
  }
  assert.equal(root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinStartFixed').initializer, undefined);
  let reservations = 0;
  const neverWrite = new Set(['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyExpectedSourceRejected',
    '#bodyBundleIssued', '#bodyBundleCurrent', '#bodyRejectedBundle', '#bodyDraftIssued', '#bodyDraftCurrent', '#bodyRejectedDraft',
    '#bodyPinAttemptUsed', '#bodyPinStage', '#bodyPinStep', '#bodyPinFailureStep', '#bodyOccupancy', '#bodyBindingState', '#bodyBindPrefix',
    'pinCallReached', 'bindCallReached', 'postConfirmed', 'claim']);
  function scan(n, owner = '', scope = '') {
    if (ts.isClassDeclaration(n)) scope = n.name?.text ?? '';
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) || ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) {
      const lhs = ts.isBinaryExpression(n) ? n.left : n.operand;
      if (ts.isPropertyAccessExpression(lhs)) {
        const field = lhs.name.getText(ast);
        assert.ok(!neverWrite.has(field) || field === '#bodyPinFailureStep' && scope === 'CanonicalGateDraftRoot'
          && ['failBodyPinStart', 'failBodyPinBridge', 'recordBodyPinConfirmationFailure'].includes(owner)
          || scope === 'CanonicalGateDraftRoot' && owner === 'dispatchBodyPin' && field === 'pinCallReached'
          || scope === 'RetirementStartAssembly' && owner === 'bodyPinReceiverEntry' && ['#bodyPinStep', '#bodyPinAttemptUsed', '#bodyPinStage'].includes(field)
          || scope === 'RetirementStartAssembly' && owner === 'advanceBodyPinConfirmationStages' && ['#bodyPinStep', '#bodyPinStage'].includes(field)
          || scope === 'RetirementStartAssembly' && ['failBodyPinReceiver', 'failBodyPinStorageReceiver'].includes(owner) && field === '#bodyPinFailureStep'
          || scope === 'RetirementStartAssembly' && owner === 'storeBodyPinReferences'
            && ['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyPinStep', '#bodyPinStage'].includes(field)
          || scope === 'RetirementStartAssembly' && owner === 'bodyPinReferenceFault' && field === '#bodyExpectedSourceCurrent'
          || scope === 'RetirementStartAssembly' && owner === 'retainBodyPinRejected' && ['#bodyExpectedSourceRejected', '#bodyPinFailureStep'].includes(field),
          'forbidden receiver/claim write ' + field);
        if (field === '#bodyPinRouteAttempted') {
          reservations++; assert.equal(owner, 'admitBodyPinCaller'); assert.equal(n.right.getText(ast), 'true');
        }
      }
    }
    ts.forEachChild(n, child => scan(child, owner, scope));
  }
  scan(ast); assert.equal(reservations, 1);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\nroot.admitBodyPinCaller(root, {}, {});\nroot.bodyPinCallerMatches(root, {}, {});\nroot.prepareBodyPinStart();\nconst badAdmission: BodyPinAdmission = "held";\nconst badStep: BodyPinStartStep = "call";\nconst badGeneration: BodySourceBuildPhase = "BP02";\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 6);
  console.log(JSON.stringify({ compiled: true, actualForeignControls: 3, stopPriorityControls: priority.length, phaseRejections,
    contextRejections: contexts.length, recheckControls: rechecks.length, firstPosition: true, priorScalars: Object.keys(defaults).length,
    reservationSites: reservations, unauthorizedReceiverAndClaimWrites: 0, entryControlWritersAllowed: true, semanticRejections: 6,
    projectionAllowlists: projection.length, strictBooleans: booleans.length, finalCallReadyRecheck: true,
    routeUnusedControls: routeFields.length, preflightRouteControls: routeFields.length, contextCallControls: contextCalls.length,
    callerRecheckControl: true, refusalFirstControl: true, internalRefusalNone: contexts.length }));
} finally { rmSync(dir, { recursive: true, force: true }); }
