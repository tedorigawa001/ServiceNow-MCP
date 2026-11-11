/** Later storage phases are value-only contracts, never populated receiver evidence. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-storage-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const cases = [
  ['entry', 'none', 'attempting', 'attempt'], ['attempted', 'after', 'attempting', 'attempt'], ['before_issued', 'before', 'attempting', 'attempt'],
  ['issued', 'after', 'issued', 'issued'], ['before_current', 'before', 'issued', 'issued'],
  ['captured', 'after', 'captured', 'current'], ['before_checked', 'before', 'captured', 'current'],
  ['checked', 'after', 'captured', 'checked'], ['before_confirmed', 'before', 'captured', 'checked'], ['confirmed', 'after', 'confirmed', 'confirmed'],
];
function values([phase, boundary, stage, step]) {
  const issued = stage !== 'attempting', current = stage === 'captured' || stage === 'confirmed';
  return { phase, boundary, source: { state: 'initializing', phase: 'BP03', boundary: 'call', pinCallReached: true, claim: 'unused',
    bindCallReached: false, postConfirmed: false, stopRequested: false, first: 'none', failurePhase: 'none', failureBoundary: 'none', refusal: 'none', deliveryFirst: 'none' },
  receiver: { attemptUsed: true, stage, step, issued, current, rejected: false, issuedSame: issued, currentSame: current,
    failureStep: 'none', first: 'none', failurePhase: 'none', failurePrefix: 'none', failureBoundary: 'none', refusal: 'none' } };
}
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, owner = 'CanonicalGateDraftRoot', priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js');
  writeFileSync(p, emit(s + '\nexport const storageState = bodyPinStorageState;\n')); return import(pathToFileURL(p).href);
}
const at = (point, code) => method(source, 'bodyPinStoragePoint', '    this.#bodyPinStoragePoint = point;',
  `    this.#bodyPinStoragePoint = point;\n    if (point === '${point}') { ${code} }`);
const run = m => { const a = m.createProbeBodyPinStorageFake(); return { a, r: a.prepare(), s: a.inspect() }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const m = await load(source, 'base'); let fieldRejections = 0, crossCases = 0;
  for (const c of cases) {
    assert.equal(m.storageState(values(c)), true, c[0]);
    for (const other of cases) { assert.equal(m.storageState({ ...values(other), phase: c[0] }), c === other); crossCases++; }
    for (const part of ['source', 'receiver']) for (const key of Object.keys(values(c)[part])) {
      const v = values(c); v[part][key] = typeof v[part][key] === 'boolean' ? !v[part][key] : 'private_invalid';
      assert.equal(m.storageState(v), false, c[0] + '/' + part + '/' + key); fieldRejections++;
      const missing = values(c); delete missing[part][key]; assert.equal(m.storageState(missing), false);
    }
    for (const part of ['source', 'receiver']) {
      const v = values(c); v[part].extra = true; assert.equal(m.storageState(v), false);
      assert.equal(m.storageState({ ...values(c), [part]: null }), false);
    }
    for (const key of ['phase', 'boundary', 'source', 'receiver']) {
      const v = values(c); delete v[key]; assert.equal(m.storageState(v), false);
    }
    for (const boundary of ['none', 'before', 'after', 'private_invalid', true, 0, null])
      assert.equal(m.storageState({ ...values(c), boundary }), boundary === c[1]);
    assert.equal(m.storageState({ ...values(c), extra: true }), false);
    assert.equal(m.storageState({ ...values(c), phase: 'private_invalid' }), false);
  }
  const normal = run(m); assert.equal(normal.r.disposition, 'pin_storage_not_connected');
  assert.equal(normal.s.storage.boundary, 'before'); assert.equal(normal.s.build.receiver.pinStage, 'attempting');
  assert.ok(normal.s.build.receiver.references.every(v => !v.retained));
  // A scalar corrupted before its first owning read must not be sanitized into admission.
  for (const bad of ["'private_secret'", "'after'", 'null', '0', 'true']) {
    const changed = replace(source, "#bodyPinStorageBoundary: BodyPinStorageBoundary = 'none';", `#bodyPinStorageBoundary: BodyPinStorageBoundary = ${bad} as never;`);
    const x = run(await load(changed, 'boundary-' + used.size)); assert.equal(x.r.first, 'state_invalid');
    assert.equal(x.s.storage.failurePoint, 'before'); assert.equal(x.s.build.receiver.pinStage, 'attempting');
    assert.ok(!JSON.stringify(x.s).includes('private_secret'));
  }
  const phaseLine = '    return bodyPinStorageState({ phase, boundary: probeStartAccess.bodyPinStorageBoundary(start),';
  const pointPhases = [['before', 'entry'], ['checked', 'attempted'], ['before_issued', 'before_issued'], ['blocked', 'before_issued']];
  for (const [point, phase] of pointPhases) {
    const getter = 'bodyPinStorageBoundary: (a: RetirementStartAssembly) => a.#bodyPinStorageBoundary,';
    const changed = replace(at(point, '(globalThis as any).__spBoundary = true;'), getter,
      "bodyPinStorageBoundary: (a: RetirementStartAssembly) => ((globalThis as any).__spBoundary ? 'private_invalid' as never : a.#bodyPinStorageBoundary),");
    try {
      const x = run(await load(changed, 'point-' + point)); assert.equal(x.r.first, 'state_invalid'); assert.equal(x.s.storage.failurePoint, point);
      const bypass = method(changed, 'bodyPinStorageMatches', phaseLine,
        `    if (phase === '${phase}') return true;\n` + phaseLine);
      delete globalThis.__spBoundary;
      const y = run(await load(bypass, 'point-control-' + point));
      assert.equal(y.s.storage.failurePoint, point === 'before' ? 'checked' : point === 'checked' ? 'before_issued' : 'blocked');
      assert.equal(y.r.first, point === 'before' || point === 'checked' ? 'state_invalid' : 'construction_unconfirmed');
    } finally { delete globalThis.__spBoundary; }
  }
  const guards = [
    ['mode', '(this as any).bodyPinStorage = false;', 'this.bodyPinStorage !== true || '],
    ['active', 'this.#bodyPinCallActive = false;', '!this.bodyPinBridgeActive(source, start) || '],
  ];
  for (const [name, code, guard] of guards) {
    const changed = at('before', code), x = run(await load(changed, 'guard-' + name)); assert.equal(x.r.first, 'state_invalid');
    const y = run(await load(method(changed, 'bodyPinStorageMatches', guard, ''), 'guard-control-' + name));
    assert.notEqual(y.r.first, x.r.first, name + ' sensitivity');
  }
  const busy = replace(at('before', '(globalThis as any).__spBusy = true;'),
    'bodyPinEntryBusy: (a: RetirementStartAssembly) => a.#bodyPinEntryBusy,',
    'bodyPinEntryBusy: (a: RetirementStartAssembly) => (globalThis as any).__spBusy ? false : a.#bodyPinEntryBusy,');
  try {
    const x = run(await load(busy, 'busy')); assert.equal(x.r.first, 'state_invalid');
    delete globalThis.__spBusy;
    const y = run(await load(method(busy, 'bodyPinStorageMatches', ' || probeStartAccess.bodyPinEntryBusy(start) !== true', ''), 'busy-control'));
    assert.equal(y.r.first, 'construction_unconfirmed');
    assert.equal(y.s.storage.failurePoint, 'blocked');
  } finally { delete globalThis.__spBusy; }
  let owningFieldControls = 0;
  for (const part of ['source', 'receiver']) for (const [field, value] of Object.entries(values(cases[0])[part])) {
    const bad = typeof value === 'boolean' ? !value : 'private_invalid';
    const old = part === 'source' ? 'source: this.bodyPinSourceValues(source)' : 'receiver: probeStartAccess.bodyPinValues(start, source)';
    const expr = part === 'source' ? 'this.bodyPinSourceValues(source)' : 'probeStartAccess.bodyPinValues(start, source)';
    const changed = method(source, 'bodyPinStorageMatches', old, `${part}: { ...${expr}, ${field}: ${JSON.stringify(bad)} as never }`);
    const x = run(await load(changed, 'owning-field-' + part + '-' + field));
    assert.equal(x.r.first, 'state_invalid'); assert.equal(x.s.storage.failurePoint, 'before');
    const y = run(await load(method(changed, 'bodyPinStorageMatches', 'return bodyPinStorageState({', 'return true || bodyPinStorageState({'), 'owning-field-control-' + part + '-' + field));
    assert.equal(y.r.first, 'construction_unconfirmed'); assert.equal(y.s.storage.failurePoint, 'blocked'); owningFieldControls++;
  }
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  const cls = name => ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === name);
  const start = cls('RetirementStartAssembly'), root = cls('CanonicalGateDraftRoot');
  const f = start.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinStorageBoundary');
  assert.ok(f.end < start.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), "'none'");
  const prior = { bodyPinStoragePoint: "'none'", bodyPinStorageFailurePoint: "'none'", bodyPinStorageReentry: "'none'" };
  for (const [name, literal] of Object.entries(prior)) {
    const n = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.ok(n.end <= root.members.find(ts.isConstructorDeclaration).pos); assert.equal(n.initializer.getText(ast), literal);
  }
  assert.equal(root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinStorageFixed').initializer, undefined);
  const forbidden = new Set(['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyExpectedSourceRejected', '#bodyBundleIssued',
    '#bodyBundleCurrent', '#bodyRejectedBundle', '#bodyDraftIssued', '#bodyDraftCurrent', '#bodyRejectedDraft', 'claim', 'bindCallReached', 'postConfirmed']);
  let boundaryWrites = 0;
  function scan(n, scope = '', owner = '') {
    if (ts.isClassDeclaration(n)) scope = n.name?.text ?? '';
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind)) {
      if (ts.isPropertyAccessExpression(n.left)) {
        const key = n.left.name.getText(ast); assert.ok(!forbidden.has(key), 'forbidden write ' + key);
        if (key === '#bodyPinStorageBoundary') {
          boundaryWrites++; assert.equal(scope + '.' + owner, 'RetirementStartAssembly.prepareBodyPinStorage');
          assert.ok(["'after'", "'before'"].includes(n.right.getText(ast)));
        }
        if (key === '#bodyPinStage') assert.equal(n.right.getText(ast), "'attempting'", 'no real later-stage positive');
      }
    }
    ts.forEachChild(n, c => scan(c, scope, owner));
  }
  scan(ast); assert.equal(boundaryWrites, 2);
  for (const [field, key] of [['bodyPinStoragePoint', 'point'], ['bodyPinStorageFailurePoint', 'failurePoint'], ['bodyPinStorageReentry', 'reentry']]) {
    const changed = method(source, 'inspectBodyPinStorage', '    const c = this.inspectBodyPinCall(), start = this.#issuedFrameBinding?.target.start;',
      `    const c = this.inspectBodyPinCall(), start = this.#issuedFrameBinding?.target.start; this.#${field} = 'private_secret';`, 'CanonicalGateDraftRoot', false);
    assert.equal(run(await load(changed, 'projection-' + key)).s.storage[key], 'unconfirmed');
  }
  const extra = '\ndeclare const root: CanonicalGateDraftRoot;\ndeclare const start: RetirementStartAssembly;\nroot.bodyPinStorageMatches({}, start, "entry");\nroot.bodyPinStoragePoint("before", {}, start);\nstart.prepareBodyPinStorage(root, {});\nstart.failBodyPinStorageReceiver("closed");\nconst badBoundary: BodyPinStorageBoundary = "held";\ndeclare const state: Extract<BodyPinStorageState, {phase:"entry"}>;\nconst badEntry: BodyPinStorageState = {...state, phase:"entry", boundary:"after"};\nconst badStage: BodyPinStorageState = {...state, phase:"issued", boundary:"after"};\nconst badClaim: BodyPinStorageState = {...state, source:{...state.source, claim:"spent"}};\nroot.bodyPinStorageMatches({}, start, "confirmed");\n';
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 9);
  console.log(JSON.stringify({ compiled: true, valueOnlyStates: cases.length, fieldRejections, crossCases, invalidBoundaryControls: 5,
    owningPhaseControls: pointPhases.length, owningFieldControls, activeModeBusyControls: guards.length + 1, priorRootScalars: 3, priorReceiverBoundary: true,
    boundaryWrites, referenceAndClaimWrites: 0, laterStageWrites: 0, projectionAllowlists: 3, semanticRejections: 9 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
