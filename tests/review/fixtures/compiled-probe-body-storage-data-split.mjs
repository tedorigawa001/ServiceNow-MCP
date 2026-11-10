/** A-only extraction contract. No runtime source issuer, pin or new public entry. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('composition.ts', source, ts.ScriptTarget.ES2022, true);
const root = parsed.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'CanonicalGateDraftRoot');
function method(name) {
  const m = root.members.find(m => ts.isMethodDeclaration(m) && m.name.getText(parsed) === name);
  assert.ok(m, 'missing private extraction boundary: ' + name);
  assert.ok(m.modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword));
  return m;
}
const storage = method('prepareBodyStorage'), data = method('prepareBodyData'), wrapper = method('prepareBodySeed');
assert.equal(storage.parameters.length, 0); assert.equal(data.parameters.length, 1); assert.equal(wrapper.parameters.length, 0);
assert.equal(wrapper.body.statements.length, 2, 'fixed synchronous storage-to-data wrapper');
function calls(node) {
  const out = []; const visit = n => { if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) out.push(n.expression.name.text);
    ts.forEachChild(n, visit); }; visit(node); return out;
}
assert.deepEqual(calls(wrapper.body), ['prepareBodyStorage', 'prepareBodyData']);
assert.ok(!calls(storage.body).some(n => ['bodySeedMint', 'prepareBodyData', 'prepareBodyLive', 'prepareBodyBundle'].includes(n)));
assert.ok(!calls(data.body).includes('bodySeedBoot'));
assert.ok(!storage.body.getText(parsed).includes("'BC00'"));

const dir = mkdtempSync(join(tmpdir(), 'probe-body-split-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function change(s, name, a, b) {
  const start = s.indexOf('  private ' + name + '('), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name), 'unique module URL'); used.add(name);
  const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href);
}
// Bounded scratch-only observations: the distributed fixture receives no new field or API.
let observed = replace(source, 'class CanonicalGateDraftRoot {', 'class CanonicalGateDraftRoot {\n  #splitTrace: string[] = [];');
observed = change(observed, 'bodySeedPoint', '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
  "    if (this.#splitTrace.length >= 256) throw Error('bounded_split_trace');\n    this.#splitTrace.push(phase + '/' + boundary);\n    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;");
observed = replace(observed, '  private prepareBodyStorage(): BodyPreparationShell {',
  "  private prepareBodyStorage(): BodyPreparationShell {\n    this.#splitTrace.push('storage_frame_' + this.#frame);");
observed = change(observed, 'prepareBodySeed', '    const shell = this.prepareBodyStorage();',
  "    const shell = this.prepareBodyStorage();\n    this.#splitTrace.push('handoff_' + (shell === this.#bodySeedShell && this.#frame));");
observed = replace(observed, '  private prepareBodyData(shell: BodyPreparationShell): Readonly<{ ok: boolean; disposition: string }> {',
  "  private prepareBodyData(shell: BodyPreparationShell): Readonly<{ ok: boolean; disposition: string }> {\n    this.#splitTrace.push('data_same_frame_' + (shell === this.#bodySeedShell && this.#frame));");
observed = replace(observed, "    return Object.freeze({ model: 'wfb-body-slot-seed-1', authority:",
  "    return Object.freeze({ splitTrace: Object.freeze([...this.#splitTrace]), splitSourceAbsent: this.#bodySourceIssued === undefined && this.#bodySourceCurrent === undefined && this.#bodySourceRejected === undefined && this.#bodySourceMetadataConfirmed === false, splitReceiverInitial: !!start && probeStartAccess.bodyFieldsInitial(start), model: 'wfb-body-slot-seed-1', authority:");
const bs = Array.from({ length: 15 }, (_, i) => 'BS' + String(i).padStart(2, '0'))
  .flatMap(p => ['before', 'attempt', 'retained', 'done'].map(b => p + '/' + b));
const seed = ['BC00/before', 'BC00/after', ...Array.from({ length: 5 }, (_, i) => 'BC0' + (i + 1))
  .flatMap(p => ['before', 'attempt', 'issued', 'captured', 'checked', 'confirmed'].map(b => p + '/' + b))];
// Independent fixed-reference counts, including each brand, from the live-slot contract.
const live = [3, 3, 4, 4, 9, 8].flatMap((fixed, i) => {
  const p = 'BC' + String(i + 6).padStart(2, '0'); return ['before', 'attempt', 'issued',
    ...Array.from({ length: fixed }, (_, n) => 'fix_' + n), 'sealed', 'captured', 'checked', 'confirmed'].map(b => p + '/' + b);
});
const bundle = [12, 13].flatMap(n => ['before', 'attempt', 'issued', 'frozen', 'captured', 'checked', 'confirmed'].map(b => 'BC' + n + '/' + b));
bundle.push('BC13/post_before', 'BC13/post_after');
const families = ['createProbeBodySeedFake', 'createProbeBodyLiveFake', 'createProbeBodyBundleFake'];
const expected = [seed, [...seed, ...live], [...seed, ...live, ...bundle]].map(xs => ['storage_frame_true', ...bs, 'handoff_true', 'data_same_frame_true', ...xs]);
const run = (m, family = 0) => { const a = m[families[family]](); return { a, r: a.prepare(), s: a.inspect() }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  const base = await load(observed, 'baseline');
  for (let i = 0; i < 3; i++) {
    const s = run(base, i).s; assert.deepEqual(s.splitTrace, expected[i]); assert.equal(s.splitSourceAbsent, true); assert.equal(s.splitReceiverInitial, true);
    assert.equal(s.rootReady, false); assert.equal(s.bodyStarts + s.grantAttempts + Number(s.dutyUsed), 0);
  }
  const onlyStorage = change(observed, 'prepareBodySeed', '    return this.prepareBodyData(shell);', "    throw Error('fixed_storage_boundary');");
  const stoppedStorage = await load(onlyStorage, 'storage-only');
  const dataBefore = change(observed, 'bodySeedPoint', '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
    "    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\n    if (phase === 'BC00' && boundary === 'before') throw Error('fixed_data_boundary');");
  const stoppedData = await load(dataBefore, 'data-before');
  for (let i = 0; i < 3; i++) for (const [m, phase, boundary, trace] of [
    [stoppedStorage, 'BS14', 'done', ['storage_frame_true', ...bs, 'handoff_true']],
    [stoppedData, 'BC00', 'before', ['storage_frame_true', ...bs, 'handoff_true', 'data_same_frame_true', 'BC00/before']],
  ]) {
    const { a, r, s } = run(m, i); assert.equal(r.first, 'construction_unconfirmed');
    assert.equal(s.failurePhase, phase); assert.equal(s.failureBoundary, boundary); assert.deepEqual(s.splitTrace, trace);
    assert.equal(s.slots.length, 13); assert.ok(s.slots.every(c => c.carrierRetained && c.stage === 'not_started' && !c.attemptReserved
      && !c.callBoundaryReached && !c.issuedRetained && !c.currentRetained && !c.rejectedRetained));
    assert.equal(s.splitSourceAbsent, true); assert.equal(s.splitReceiverInitial, true); assert.equal(a.prepare(), r); assert.equal(a.close(), r);
  }
  const mutants = [
    ['no-storage', change(observed, 'prepareBodySeed', 'this.prepareBodyStorage()', 'this.#bodySeedShell!')],
    ['no-data', change(observed, 'prepareBodySeed', 'return this.prepareBodyData(shell);', "return this.reply(false, 'seed_held');")],
    ['double-storage', change(observed, 'prepareBodySeed', 'const shell = this.prepareBodyStorage();', 'const shell = this.prepareBodyStorage(); this.prepareBodyStorage();')],
    ['double-data', change(observed, 'prepareBodySeed', 'return this.prepareBodyData(shell);', 'this.prepareBodyData(shell); return this.prepareBodyData(shell);')],
    ['copy-return', change(observed, 'prepareBodyStorage', '    return shell;', '    return { ...shell };')],
    ['copy-input', change(observed, 'prepareBodySeed', 'return this.prepareBodyData(shell);', 'return this.prepareBodyData({ ...shell });')],
    ['early-BC', change(observed, 'prepareBodyStorage', '    return shell;', "    this.bodySeedPoint('BC00', 'before'); return shell;")],
  ];
  for (const [name, mutant] of mutants) {
    const out = run(await load(mutant, name));
    assert.notDeepEqual(out.s.splitTrace, expected[0], 'missed split mutation: ' + name);
  }
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const splitRoot: CanonicalGateDraftRoot;\nsplitRoot.prepareBodyStorage();\nsplitRoot.prepareBodyData({});\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, source + extra, language, true) : get(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 2);
  console.log(JSON.stringify({ compiled: true, privateBoundaries: 3, fullEventWords: 3, boundaryStops: 6,
    sameShellAndFrame: true, sourceAndReceiverUnchanged: true, splitMutations: mutants.length, privateTypeRejections: 2, publicEntryAdded: false }));
} finally { rmSync(dir, { recursive: true, force: true }); }
