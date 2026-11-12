/** Closed preparation only: no owner is placed into a synthetic active-call positive state. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-bridge-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class CanonicalGateDraftRoot'));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
const at = (phase, code) => method(source, 'bodyPinBridgePoint', '    this.#bodyPinBridgePhase = phase;',
  `    this.#bodyPinBridgePhase = phase;\n    if (phase === '${phase}') { ${code} }`);
async function load(s, name) {
  assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js');
  writeFileSync(p, emit(s + '\nexport const interval = bodyPinIntervalMatches; export const position = bodyPinFailurePosition;\n'));
  return import(pathToFileURL(p).href);
}
const run = m => { const a = m.createProbeBodyPinBridgeFake(); return { a, r: a.prepare(), s: a.inspect() }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'); assert.equal(run(base).r.disposition, 'pin_bridge_not_connected');
  const busy = run(await load(replace(source, '  #bodyPinEntryBusy = false;', "  #bodyPinEntryBusy = 'private_truthy' as never;"), 'busy-type'));
  assert.equal(busy.r.first, 'state_invalid', 'an internal non-boolean busy field must not be sanitized into admission');
  for (const value of ['0', "''", 'null']) {
    const x = run(await load(replace(source, '  #bodyPinEntryBusy = false;', `  #bodyPinEntryBusy = ${value} as never;`), 'busy-' + used.size));
    assert.equal(x.r.first, 'state_invalid');
  }
  let intervalCases = 0, positionCases = 0, validPositions = 0;
  for (const state of ['before', 'calling', 'returned', 'invalid']) for (const callActive of [false, true])
    for (const pinCallReached of [false, true]) for (const entryBusy of [false, true]) {
      const expected = state === 'before' ? !callActive && !pinCallReached && !entryBusy
        : state === 'calling' ? callActive && pinCallReached : state === 'returned' ? !callActive && pinCallReached && !entryBusy : false;
      assert.equal(base.interval({ state, callActive, pinCallReached, entryBusy }), expected); intervalCases++;
    }
  for (const phase of ['BP02', 'BP03', 'BP01', 'invalid']) for (const step of ['preflight', 'call', 'returned', 'none'])
    for (const rootBoundary of ['before', 'after', 'none']) for (const sourceBoundary of ['before', 'checked', 'call', 'after', 'none']) {
      const expected = phase === 'BP02' && step === 'preflight' && ['before', 'after'].includes(rootBoundary) && ['before', 'checked'].includes(sourceBoundary)
        || phase === 'BP03' && step === 'call' && ['before', 'after'].includes(rootBoundary) && sourceBoundary === 'call'
        || phase === 'BP03' && step === 'returned' && rootBoundary === 'after' && sourceBoundary === 'after';
      const input = { phase, step, rootBoundary, sourceBoundary }, p = base.position(input);
      if (expected) { assert.deepEqual(p, input); assert.ok(Object.isFrozen(p)); validPositions++; } else assert.equal(p, undefined);
      positionCases++;
    }
  for (const [fn, value] of [[base.interval, { state: 'before', callActive: false, pinCallReached: false, entryBusy: false }],
    [base.position, { phase: 'BP03', step: 'call', rootBoundary: 'before', sourceBoundary: 'call' }]]) {
    assert.ok(fn(value)); assert.ok(!fn({ ...value, secret: true }));
    for (const key of Object.keys(value)) {
      const missing = { ...value }; delete missing[key]; assert.ok(!fn(missing));
      assert.ok(!fn({ ...value, [key]: 'private_invalid' }));
    }
  }
  const relations = [['probeIssuedBinding', 'b'], ['probeBinding', 'b'], ['probeCells', 'b.cells'],
    ['runIssuedLink', 'link'], ['runLink', 'link'], ['runIssuedDuty', 'duty'], ['runDuty', 'duty'],
    ['exitIssuedBundle', 'exit'], ['exitBundle', 'exit']];
  for (const [field, expected] of relations) {
    const clause = `a.#${field} === ${expected}`;
    const changed = replace(source, clause, `(a.#${field} = {...${expected}}, ${clause})`);
    const x = run(await load(changed, 'relation-' + field));
    assert.equal(x.r.first, 'binding_mismatch'); assert.equal(x.s.failurePhase, 'before');
    const control = replace(changed, `(a.#${field} = {...${expected}}, ${clause})`, `(a.#${field} = {...${expected}}, true)`);
    const y = run(await load(control, 'relation-control-' + field));
    assert.ok(y.r.first !== x.r.first || y.s.failurePhase !== x.s.failurePhase, 'relation sensitivity ' + field);
  }
  const late = run(await load(at('blocked', "this.#bodySourceIssued!.boundary = 'before';"), 'late-source'));
  assert.equal(late.r.first, 'binding_mismatch'); assert.equal(late.s.failurePhase, 'blocked');
  const callInit = run(await load(replace(source, '  #bodyPinCallActive = false;', "  #bodyPinCallActive = 'private_truthy' as never;"), 'call-type'));
  assert.equal(callInit.r.first, 'state_invalid'); assert.equal(callInit.s.failurePhase, 'before');
  const flagged = replace(replace(source, 'bodyPinEntryBusy: (a: RetirementStartAssembly) => a.#bodyPinEntryBusy,',
    'bodyPinEntryBusy: (a: RetirementStartAssembly) => (globalThis as any).__pbBusy ?? a.#bodyPinEntryBusy,'),
  '        a.#probeIssuedBinding === b && a.#probeBinding === b', '        !(globalThis as any).__pbRelation && a.#probeIssuedBinding === b && a.#probeBinding === b');
  const flaggedAt = (phase, code) => method(flagged, 'bodyPinBridgePoint', '    this.#bodyPinBridgePhase = phase;',
    `    this.#bodyPinBridgePhase = phase;\n    if (phase === '${phase}') { ${code} }`);
  // Each injection lands on one guard; removing that guard must move the first rejection (reason or bridge position).
  const pointControls = [
    ['before', 'this.#bodyPinCallActive = true;', 'state_invalid', 'before'],
    ['blocked', 'this.#bodyPinCallActive = true;', 'binding_mismatch', 'blocked'],
    ['before', '(globalThis as any).__pbBusy = true;', 'state_invalid', 'before'],
    ['blocked', '(globalThis as any).__pbBusy = true;', 'binding_mismatch', 'blocked'],
    ['checked', '(globalThis as any).__pbRelation = true;', 'binding_mismatch', 'checked'],
    ['blocked', '(globalThis as any).__pbRelation = true;', 'binding_mismatch', 'blocked'],
    ['before', "this.#bodyPinRouteBoundary = 'before';", 'state_invalid', 'before'],
    ['checked', "this.#bodyPinRouteBoundary = 'before';", 'binding_mismatch', 'checked'],
    ['before', 'this.#bodySourceMetadataFixedCount = 8;', 'binding_mismatch', 'before'],
  ];
  for (const [phase, code, reason, position] of pointControls) {
    try {
      const x = run(await load(flaggedAt(phase, code), 'point-' + used.size));
      assert.equal(x.r.first, reason, phase + ' ' + code); assert.equal(x.s.failurePhase, position, phase + ' ' + code);
      assert.equal(x.s.build.receiver.pinAttemptUsed, false); assert.equal(x.s.build.source.pinCallReached, false);
    } finally { delete globalThis.__pbBusy; delete globalThis.__pbRelation; }
  }
  const falseActive = run(await load(method(source, 'bodyPinBridgeActive',
    'if (!this.bodyPinBridgeIdentity(source, start)) return false;', 'return true;\n    if (!this.bodyPinBridgeIdentity(source, start)) return false;'), 'active-bypass'));
  assert.equal(falseActive.r.first, 'state_invalid'); assert.equal(falseActive.s.failurePhase, 'checked');
  const first = run(await load(at('checked', `this.fail('state_invalid'); this.#bodyPinBridgePhase = 'blocked'; this.fail('closed');`), 'first'));
  assert.equal(first.r.first, 'state_invalid'); assert.equal(first.s.failurePhase, 'checked');
  assert.equal(first.s.route.failurePhase, 'BP02'); assert.equal(first.s.route.failureBoundary, 'after');
  assert.equal(first.s.build.source.failureBoundary, 'checked'); first.a.close(); assert.equal(first.a.inspect().failurePhase, 'checked');
  const witness = 'export let __witness: unknown;\n';
  const end = "if (this.#bodySourceStorageConfirmed && this.#bodySeedShell) this.#bodySeedShell.state = 'failed';";
  const unconfirmed = witness + method(at('before', `this.#bodySourceMetadataConfirmed = false; throw Error('private_unconfirmed');`),
    'failBodyPinBridge', end, end + '\n    __witness = this.#bodySourceIssued!.first;');
  const um = await load(unconfirmed, 'unconfirmed'), u = run(um);
  assert.equal(um.__witness, 'none'); assert.equal(u.s.route.failurePhase, 'BP02');
  assert.equal(u.s.route.failureBoundary, 'after'); assert.equal(u.s.build.source.first, 'unconfirmed');
  const mc = await load(method(unconfirmed, 'failBodyPinBridge',
    'this.#bodySourceMetadataConfirmed ? this.#bodySourceIssued : undefined', 'this.#bodySourceIssued'), 'unconfirmed-control');
  run(mc); assert.equal(mc.__witness, 'construction_unconfirmed');
  const projections = [['bodyPinBridgePhase', 'phase'], ['bodyPinBridgeFailurePhase', 'failurePhase'], ['bodyPinBridgeReentry', 'reentry']];
  for (const [field, key] of projections) {
    const m = method(source, 'inspectBodyPinBridge', 'const c = this.inspectBodyPinStart(), start = this.#issuedFrameBinding?.target.start;',
      `const c = this.inspectBodyPinStart(), start = this.#issuedFrameBinding?.target.start; this.#${field} = 'private_secret';`, false);
    assert.equal(run(await load(m, 'projection-' + key)).s[key], 'unconfirmed');
  }
  const booleans = [['bodyPinCallActive', 'callActive'], ['bodyPinBridgeIdentityConfirmed', 'identityConfirmed'],
    ['bodyPinBridgeChecked', 'checked'], ['bodyPinBridgeActiveQualification', 'activeQualification'], ['bodyPinStartHookObserved', 'hookObserved']];
  for (const [field, key] of booleans) {
    const m = method(source, 'inspectBodyPinBridge', 'const c = this.inspectBodyPinStart(), start = this.#issuedFrameBinding?.target.start;',
      `const c = this.inspectBodyPinStart(), start = this.#issuedFrameBinding?.target.start; this.#${field} = 'private_truthy';`, false);
    assert.equal(run(await load(m, 'boolean-' + key)).s[key], false);
  }
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CanonicalGateDraftRoot');
  const start = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'RetirementStartAssembly');
  const defaults = { bodyPinCallActive: 'false', bodyPinBridgePhase: "'none'", bodyPinBridgeFailurePhase: "'none'",
    bodyPinBridgeIdentityConfirmed: 'false', bodyPinBridgeChecked: 'false', bodyPinBridgeActiveQualification: 'false', bodyPinBridgeReentry: "'none'" };
  for (const [field, literal] of Object.entries(defaults)) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + field);
    assert.ok(f.end < root.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), literal);
  }
  const busyField = start.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinEntryBusy');
  assert.ok(busyField.end < start.members.find(ts.isConstructorDeclaration).pos); assert.equal(busyField.initializer.getText(ast), 'false');
  const forbidden = new Set(['#bodyPinCallActive', '#bodyPinEntryBusy', '#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyExpectedSourceRejected',
    '#bodyBundleIssued', '#bodyBundleCurrent', '#bodyRejectedBundle', '#bodyDraftIssued', '#bodyDraftCurrent', '#bodyRejectedDraft',
    '#bodyPinAttemptUsed', '#bodyPinStage', '#bodyPinStep', 'pinCallReached', 'bindCallReached', 'postConfirmed', 'claim']);
  let rootAccessWrites = 0;
  const entryWrites = new Map([
    ['RetirementStartAssembly.advanceBodyPinConfirmationStages', new Set(['#bodyPinStep', '#bodyPinStage'])],
    ['CanonicalGateDraftRoot.dispatchBodyPin', new Set(['#bodyPinCallActive', 'pinCallReached'])],
    ['RetirementStartAssembly.bodyPinReceiverEntry', new Set(['#bodyPinEntryBusy', '#bodyPinAttemptUsed', '#bodyPinStage', '#bodyPinStep'])],
    ['RetirementStartAssembly.storeBodyPinReferences', new Set(['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyPinStep', '#bodyPinStage'])],
    ['RetirementStartAssembly.bodyPinReferenceFault', new Set(['#bodyExpectedSourceCurrent'])],
    ['RetirementStartAssembly.retainBodyPinRejected', new Set(['#bodyExpectedSourceRejected'])],
  ]);
  function scan(n, scope = '', owner = '') {
    if (ts.isClassDeclaration(n)) scope = n.name?.text ?? '';
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) || ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) {
      const lhs = ts.isBinaryExpression(n) ? n.left : n.operand;
      if (ts.isPropertyAccessExpression(lhs)) assert.ok(!forbidden.has(lhs.name.getText(ast))
        || entryWrites.get(scope + '.' + owner)?.has(lhs.name.getText(ast)), 'forbidden write');
      if (ts.isIdentifier(lhs) && lhs.text === 'probeBodyPinRootAccess') rootAccessWrites++;
    }
    ts.forEachChild(n, child => scan(child, scope, owner));
  }
  scan(ast); assert.equal(rootAccessWrites, 1);
  assert.equal(start.members.filter(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'bodyPinReceiverEntry').length, 1);
  assert.ok(source.includes('bodyPinEnter: (a: RetirementStartAssembly, root: CanonicalGateDraftRoot, source: BodyBindSourceShell) => a.bodyPinReceiverEntry(root, source)'));
  const writer = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'failBodyPinBridge').getText(ast);
  for (const clause of ["this.#bodyPinFailurePhase = p?.phase ?? 'none'", "this.#bodyPinFailureStep = p?.step ?? 'none'",
    "this.#bodyPinFailureBoundary = p?.rootBoundary ?? 'none'"]) assert.ok(writer.includes(clause));
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\nroot.bodyPinBridgeIdentity({}, {});\nroot.bodyPinBridgeActive({}, {});\nroot.failBodyPinBridge("closed");\nconst wrongInterval: BodyPinInterval = { state:"calling", callActive:false, pinCallReached:true, entryBusy:false };\nconst wrongRootBoundary: BodyPinFailurePosition = { phase:"BP03", step:"call", rootBoundary:"checked", sourceBoundary:"call" };\nconst wrongSourceBoundary: BodyPinFailurePosition = { phase:"BP03", step:"call", rootBoundary:"after", sourceBoundary:"after" };\nconst wrongReturn: BodyPinFailurePosition = { phase:"BP03", step:"returned", rootBoundary:"before", sourceBoundary:"after" };\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 7);
  console.log(JSON.stringify({ compiled: true, busyStrict: true, intervalCases, positionCases, validPositions,
    receiverRelations: relations.length, callActiveLiteral: true, pointControls: pointControls.length, lateRecheck: true, inactiveGuard: true, firstPosition: true, unconfirmedSource: true,
    projectionAllowlists: projections.length, strictBooleans: booleans.length, priorRootScalars: Object.keys(defaults).length,
    receiverBusyLiteral: true, forbiddenWrites: 0, rootAccessWrites, semanticRejections: 7 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
