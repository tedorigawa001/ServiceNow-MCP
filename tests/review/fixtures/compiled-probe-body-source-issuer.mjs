/** BP00/01 only; every mutation, observer and emitted module is scratch-local. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'body-source-issuer-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class CanonicalGateDraftRoot'));
  const end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name), 'unique module URL'); used.add(name);
  const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href);
}
const run = (m, script = 'si_normal') => { const a = m.createProbeBodySourceIssuerFake(script); return { a, r: a.prepare(), s: a.inspect() }; };
const at = (phase, step, boundary, code) => method(source, 'bodySourcePoint',
  '    this.#bodySourceBuildPhase = phase; this.#bodySourceBuildStep = step; this.#bodySourceBuildBoundary = boundary;',
  `    this.#bodySourceBuildPhase = phase; this.#bodySourceBuildStep = step; this.#bodySourceBuildBoundary = boundary;\n    if (phase === '${phase}' && step === '${step}' && boundary === '${boundary}') { ${code} }`);
try {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
  const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot');
  assert.ok(root, 'canonical class');
  const scalars = {
    bodySourceCreationAttempted: 'false', bodySourceBuildStage: "'not_started'", bodySourceBuildPhase: "'none'",
    bodySourceBuildStep: "'none'", bodySourceBuildBoundary: "'none'", bodySourceMetadataFixedCount: '0',
    bodySourceFailureRecorded: 'false', bodySourceFailurePhase: "'none'", bodySourceFailureStep: "'none'",
    bodySourceFailureBoundary: "'none'", bodySourceStopRequested: 'false', bodySourceStopFirst: "'none'",
    bodySourceDeliveryFirst: "'none'", bodySourceStorageConfirmed: 'false', bodySourceState: "'not_started'",
    bodySourceReentry: "'none'", bodySourceHookCalls: '0', bodySourceIssueRefusal: "'none'",
  };
  const constructor = root.members.find(ts.isConstructorDeclaration);
  for (const [name, literal] of Object.entries(scalars)) {
    const field = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.ok(field && field.end < constructor.pos, name + ' is prior');
    assert.equal(field.initializer?.getText(ast), literal, name + ' has no allocating initializer');
  }
  assert.equal(root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodySourceFixed').initializer, undefined);
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'baseline'); assert.equal(run(base).r.disposition, 'source_held_unpinned');
  const badCount = run(await load(at('BP01', 'before', 'before', "this.#bodySourceMetadataFixedCount = 'private_counter' as never;"), 'bad-count'));
  assert.equal(badCount.s.fixedCount, -1, 'fixed numeric projection must not echo an unexpected private scalar');
  const late = run(await load(at('BP01', 'after', 'after', "this.#bodySourceCurrent = new Proxy({}, { get: () => { this.#bodySourceHookCalls++; throw Error('late_private'); }, set: () => { this.#bodySourceHookCalls++; throw Error('late_private'); }, ownKeys: () => { this.#bodySourceHookCalls++; throw Error('late_private'); } }) as BodyBindSourceShell;"), 'late-proxy'));
  assert.equal(late.r.first, 'binding_mismatch'); assert.equal(late.s.metadataConfirmed, true);
  assert.equal(late.s.source.rejectedRetained, true, 'post-confirmation rejection must retain the first candidate');
  assert.equal(late.a.close(), late.r); assert.equal(late.a.inspect().hookCalls, 0); assert.equal(late.a.inspect().source.stopMirrored, true);
  const fields = [
    ['brand', 'v[BODY_BIND_SOURCE] === true'], ['custodian', 'v.custodian === this'], ['construction', 'v.construction === shell'],
    ['binding', 'v.binding === b'], ['link', 'v.link === this.#issuedRunLink'], ['duty', 'v.duty === this.#issuedRunDuty'],
    ['control', 'v.control === this.#exitSlots[0].value'], ['start', 'v.start === b.target.start'], ['rootFailure', 'v.rootFailure === this.#failure'],
    ['state', "v.state === 'initializing'"], ['claim', "v.claim === 'unused'"], ['pinCallReached', 'v.pinCallReached === false'],
    ['bindCallReached', 'v.bindCallReached === false'], ['stopRequested', 'v.stopRequested === false'], ['postConfirmed', 'v.postConfirmed === false'],
    ['first', "v.first === 'none'"], ['failurePhase', "v.failurePhase === 'none'"], ['failureBoundary', "v.failureBoundary === 'none'"],
    ['refusal', "v.refusal === 'none'"], ['deliveryFirst', "v.deliveryFirst === 'none'"],
    ['phase', "v.phase === (confirmed ? 'BP01' : 'none')"], ['boundary', "v.boundary === (confirmed ? 'after' : 'none')"],
  ];
  for (const [key, clause] of fields) {
    assert.equal(run(base, 'si_mix_' + key).r.first, 'binding_mismatch');
    assert.equal(run(await load(method(source, 'bodySourceDataMatches', clause, 'true'), 'field-' + key), 'si_mix_' + key).r.disposition, 'source_held_unpinned');
  }
  for (const script of ['si_copy', 'si_proxy']) {
    const out = run(await load(method(source, 'bodySourceDataMatches', 'v !== this.#bodySourceCurrent || ', ''), 'identity-' + script), script);
    assert.equal(out.r.disposition, 'source_held_unpinned'); assert.equal(out.s.source.sameReference, false);
  }
  const shapeRemoved = method(source, 'bodySourceDataMatches', '!bodySeedShape(v, [...BODY_SOURCE_METADATA, ...BODY_SOURCE_PROGRESS])', 'false');
  for (const script of ['si_mix_extra', 'si_mix_prototype'])
    assert.equal(run(await load(shapeRemoved, 'shape-' + script), script).r.disposition, 'source_held_unpinned');
  assert.equal(run(await load(shapeRemoved, 'getter-shape'), 'si_getter_first').s.hookCalls, 0, 'writable-descriptor check independently rejects accessors');
  const getterUnprotected = method(shapeRemoved, 'bodySourceDataMatches', ' && d.writable === true', '');
  assert.ok(run(await load(getterUnprotected, 'getter-joint-mutant'), 'si_getter_first').s.hookCalls > 0);
  // Sealed shape and readonly/writable descriptors each have an isolated witness.
  const sealWitness = at('BP01', 'before', 'before', "for (const key of BODY_SOURCE_PROGRESS) Object.defineProperty(this.#bodySourceIssued!, key, { configurable: false });");
  assert.equal(run(await load(sealWitness, 'seal-witness'), 'si_unsealed').r.first, 'binding_mismatch');
  assert.equal(run(await load(method(sealWitness, 'bodySourceDataMatches', ' || !Object.isSealed(v)', ''), 'seal-mutant'), 'si_unsealed').r.disposition, 'source_held_unpinned');
  for (let i = 0; i < 9; i++) {
    const writable = method(source, 'issueBodySource', '      Object.defineProperty(raw, BODY_SOURCE_METADATA[i],',
      '      if (i !== ' + i + ') Object.defineProperty(raw, BODY_SOURCE_METADATA[i],');
    assert.equal(run(await load(writable, 'metadata-writable-' + i)).r.first, 'binding_mismatch');
    assert.equal(run(await load(method(writable, 'bodySourceDataMatches', ' && d.writable === false', ''), 'metadata-writable-mutant-' + i)).r.disposition, 'source_held_unpinned');
  }
  const progress = ['state', 'claim', 'pinCallReached', 'bindCallReached', 'stopRequested', 'postConfirmed', 'phase', 'boundary',
    'first', 'failurePhase', 'failureBoundary', 'refusal', 'deliveryFirst'];
  for (const key of progress) {
    const fixed = at('BP00', 'sealed', 'before', "Object.defineProperty(this.#bodySourceIssued!, '" + key + "', { writable: false });");
    assert.equal(run(await load(fixed, 'progress-fixed-' + key)).r.first, 'binding_mismatch');
    const m = await load(method(fixed, 'bodySourceDataMatches', ' && d.writable === true', ''), 'progress-fixed-mutant-' + key);
    // A removed mutation guard may accept, fail later, or reach a forbidden readonly write.
    try { assert.notEqual(run(m).r.first, 'binding_mismatch'); } catch (e) { assert.ok(e instanceof TypeError); }
  }
  for (let i = 0; i < 13; i++) {
    const drift = at('BP00', 'before', 'before', "this.#bodySeedShell!.slots![" + i + "]!.stage = 'confirmed';");
    const out = run(await load(drift, 'carrier-' + i)); assert.equal(out.r.first, 'binding_mismatch'); assert.equal(out.s.creationAttempted, false);
    assert.equal(run(await load(method(drift, 'bodySourceStorageMatches', "c.stage === 'not_started'", 'true'), 'carrier-mutant-' + i)).r.disposition, 'source_held_unpinned');
  }
  const badBase = at('BP00', 'before', 'before', "this.#issuedCells!.body.state = 'running';");
  assert.equal(run(await load(badBase, 'base')).s.creationAttempted, false);
  assert.equal(run(await load(method(badBase, 'bodySourceStableMatches', 'this.bodySeedBaseMatches() && ', ''), 'base-mutant')).r.disposition, 'source_held_unpinned');
  const copyShell = method(source, 'prepareBodySourceIssuer', 'const shell = this.prepareBodyStorage();', 'const shell = { ...this.prepareBodyStorage() };');
  assert.equal(run(await load(copyShell, 'shell-copy')).r.first, 'binding_mismatch');
  assert.equal(run(await load(method(copyShell, 'bodySourceStorageMatches', 'shell === this.#bodySeedShell && ', ''), 'shell-copy-mutant')).r.disposition, 'source_held_unpinned');
  const receiver = replace(source, '  private bodyFieldsInitial(): boolean {\n    return this.#bodyExpectedSourceIssued',
    '  private bodyFieldsInitial(): boolean {\n    this.#bodyPinAttemptUsed = true;\n    return this.#bodyExpectedSourceIssued');
  assert.equal(run(await load(receiver, 'receiver')).s.creationAttempted, false);
  assert.equal(run(await load(method(receiver, 'bodySourceStableMatches', 'probeStartAccess.bodyFieldsInitial(this.#issuedFrameBinding!.target.start)', 'true'), 'receiver-mutant')).r.disposition, 'source_held_unpinned');
  const lostIssued = method(source, 'issueBodySource', "this.#bodySourceIssued = raw; this.#bodySourceBuildStage = 'issued';", "this.#bodySourceBuildStage = 'issued';");
  assert.equal(run(base, 'si_fault_BP00_issued_after').s.source.issuedRetained, true);
  assert.equal(run(await load(lostIssued, 'lost-issued'), 'si_fault_BP00_issued_after').s.source.issuedRetained, false);
  const earlyReturn = method(source, 'close', '    if (this.bodySourceIssuer) this.stopBodySource();\n    if (this.#fixed) return this.#fixed;',
    '    if (this.#fixed) return this.#fixed;\n    if (this.bodySourceIssuer) this.stopBodySource();', false);
  const closed = run(await load(earlyReturn, 'close-skipped'), 'si_fault_BP00_issued_after'); closed.a.close(); assert.equal(closed.a.inspect().stopRequested, false);
  const noMirror = method(source, 'stopBodySource', 'this.#bodySourceIssued.stopRequested = true; ', '');
  const mirror = run(await load(noMirror, 'mirror-skipped')); mirror.a.close(); assert.equal(mirror.a.inspect().source.stopMirrored, false);
  const rawWrite = method(source, 'bodySourceTrustedFailure', '!this.#bodySourceMetadataConfirmed || ', '');
  const raw = (await load(rawWrite, 'untrusted-write')).createProbeBodySourceIssuerFake('si_getter_first');
  assert.throws(() => raw.prepare()); assert.ok(raw.inspect().hookCalls > 0);
  const noFirst = method(source, 'bodySourceTrustedFailure', "if (v.first === 'none')", 'if (true)');
  const prior = run(await load(noFirst, 'first-overwritten'), 'si_fault_BP01_after_after'); prior.a.close(); assert.equal(prior.a.inspect().source.first, 'closed');
  const noDuplicate = method(source, 'issueBodySource', "    if (this.#bodySourceCreationAttempted) { this.#bodySourceIssueRefusal = 'duplicate_creation'; return false; }\n", '');
  const duplicate = run(await load(noDuplicate, 'duplicate-skipped'), 'si_duplicate_after');
  assert.equal(duplicate.r.first, 'binding_mismatch'); assert.equal(duplicate.s.issueRefusal, 'none');
  assert.equal(duplicate.s.source.state, 'failed', 'removing the refusal gate damages the original source instead of preserving it');
  // Explicit root allowlists; value-only inspectors must not echo private enum strings.
  const projections = [
    ['bodySourceState', 'state'], ['bodySourceBuildStage', 'stage'], ['bodySourceBuildPhase', 'phase'], ['bodySourceBuildStep', 'step'],
    ['bodySourceBuildBoundary', 'boundary'], ['bodySourceFailurePhase', 'failurePhase'], ['bodySourceFailureStep', 'failureStep'],
    ['bodySourceFailureBoundary', 'failureBoundary'], ['bodySourceStopFirst', 'stopFirst'], ['bodySourceDeliveryFirst', 'deliveryFirst'],
    ['bodySourceReentry', 'reentry'], ['bodySourceIssueRefusal', 'issueRefusal'],
  ];
  for (const [field, key] of projections) {
    const injected = method(source, 'inspectBodySourceIssuer', '    const v = this.#bodySourceMetadataConfirmed',
      "    this.#" + field + " = 'private_enum' as never;\n    const v = this.#bodySourceMetadataConfirmed", false);
    assert.equal(run(await load(injected, 'projection-' + key)).s[key], 'unconfirmed');
  }
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const sourceRoot: CanonicalGateDraftRoot;\nsourceRoot.issueBodySource({});\nsourceRoot.stopBodySource();\nconst badBuildPhase: BodySourceBuildPhase = "BD00";\nconst badBuildStep: BodySourceBuildStep = "fix_9";\nconst badBuildBoundary: BodySourceBuildBoundary = "call";\nconst badBuildStage: BodySourceBuildStage = "failed";\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, source + extra, language, true) : get(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 6);
  console.log(JSON.stringify({ compiled: true, rootPriorScalars: Object.keys(scalars).length, boundedCount: true, lateCandidateRetention: true, fieldControls: fields.length,
    candidateIdentity: 2, shapeControls: 3, sealedControl: true, metadataWritableControls: 9, progressWritableControls: 13,
    emptyCarrierControls: 13, stableBase: true, shellIdentity: true, receiverInitial: true, issuedRetention: true,
    failureCloseStop: true, stopMirror: true, untrustedWriteRefusal: true, firstRetention: true, duplicateRefusal: true,
    rootAllowlists: projections.length, semanticRejections: 6 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
