/** BC12/13 immutable aggregates only; mutations stay in disposable scratch. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-body-bundle-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, priv = true) {
  const start = s.indexOf(`  ${priv ? 'private ' : ''}${name}(`), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name), 'unique module URL'); used.add(name);
  const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href);
}
const run = (m, script = 's_normal') => { const a = m.createProbeBodyBundleFake(script), r = a.prepare(); return { a, r, s: a.inspect() }; };
const slot = n => `this.#bodySeedShell!.slots![${n - 1}]!`;
const at = (phase, boundary, code) => method(source, 'bodySeedPoint', '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
  `    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\n    if (phase === '${phase}' && boundary === '${boundary}') { ${code} }`);
const dataClause = '(i >= 11 ? this.bodyBundleDataMatches(i + 1) : (i < 5 ? this.bodySeedDataMatches(i + 1) : this.bodyLiveDataMatches(i + 1)))';
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'baseline'); const normal = run(base); assert.equal(normal.r.disposition, 'bundle_held');
  assert.equal(normal.s.live.every(c => c.progressWritable && c.initial), true);
  const fields = [
    [['context', 'v.context === slots[0]!.current'], ['pin', 'v.pin === slots[4]!.current'], ['progress', 'v.progress === slots[5]!.current'],
      ['closure', 'v.closure === slots[6]!.current'], ['diagnostic', 'v.diagnostic === slots[7]!.current'], ['retirement', 'v.retirement === slots[8]!.current'],
      ['terminal', 'v.terminal === slots[9]!.current'], ['unwind', 'v.unwind === slots[10]!.current']],
    [['bundle', 'v.bundle === slots[11]!.current'], ['runSeal', 'v.runSeal === (slots[0]!.current as BodyConstructionContext).runSeal'],
      ['kind', "v.kind === 'body_unwind_prepared'"], ['executable', 'v.executable === false']],
  ];
  let fieldControls = 0, childCopyControls = 0;
  for (const [i, row] of fields.entries()) for (const [key, clause] of row) {
    const n = i + 12, script = `s_bundle_mix_${n}_${key}`;
    assert.equal(run(base, script).s.failurePhase, `BC${n}`);
    const m = await load(method(source, 'bodyBundleDataMatches', clause, 'true'), 'field-' + fieldControls++);
    assert.equal(run(m, script).r.disposition, 'bundle_held', key);
    if (n === 12 || ['bundle', 'runSeal'].includes(key)) {
      const copied = `s_bundle_mix_${n}_child_copy_${key}`;
      assert.equal(run(base, copied).r.first, 'binding_mismatch'); assert.equal(run(m, copied).r.disposition, 'bundle_held'); childCopyControls++;
    }
  }
  for (const n of [12, 13]) {
    const i = n - 12;
    const copy = method(source, 'bodyBundleDataMatches', 'value !== cell.issued || ', '');
    assert.equal(run(await load(copy, 'copy-' + n), `s_bundle_mix_${n}_copy`).r.disposition, 'bundle_held');
    const brand = method(source, 'bodyBundleDataMatches', `v[${i === 0 ? 'BODY_PREPARATION_BUNDLE' : 'BODY_PREPARATION_DRAFT'}] === true`, 'true');
    assert.equal(run(await load(brand, 'brand-' + n), `s_bundle_mix_${n}_brand`).r.disposition, 'bundle_held');
    const frozen = method(source, 'bodyBundleDataMatches', ' || !Object.isFrozen(value)', '');
    assert.equal(run(base, `s_bundle_mix_${n}_unfrozen`).r.first, 'binding_mismatch');
    assert.equal(run(await load(frozen, 'frozen-' + n), `s_bundle_mix_${n}_unfrozen`).r.disposition, 'bundle_held');
    const enumerable = method(source, 'bodyBundleDataMatches', 'Object.getOwnPropertyDescriptor(value, k)?.enumerable === true', 'true');
    assert.equal(run(await load(enumerable, 'enumerable-' + n), `s_bundle_mix_${n}_non_enumerable`).r.disposition, 'bundle_held');
    const extraKeys = replace(source, 'Reflect.ownKeys(value).length === keys.length', 'true');
    assert.equal(run(await load(extraKeys, 'extra-keys-' + n), `s_bundle_mix_${n}_extra`).r.disposition, 'bundle_held');
    assert.equal(run(base, `s_bundle_mix_${n}_getter`).s.hookCalls, 0);
  }
  // Every predecessor must be checked before the next constructor, not just its direct dependencies.
  let priorControls = 0;
  for (const n of [12, 13]) for (let prior = 1; prior < n; prior++) {
    const phase = `BC${n}`, badStage = at(phase, 'before', `${slot(prior)}.stage = 'provisional';`);
    const checked = run(await load(badStage, 'prior-stage-' + priorControls));
    assert.equal(checked.s.failurePhase, phase); assert.equal(checked.s.failureBoundary, 'before'); assert.equal(checked.s.slots[n - 1].callBoundaryReached, false);
    const noStage = method(badStage, 'bodyLivePrefixMatches', "c.stage === 'confirmed' && ", '');
    assert.equal(run(await load(noStage, 'prior-stage-mutant-' + priorControls)).r.disposition, 'bundle_held');
    const badRef = at(phase, 'before', `${slot(prior)}.current = Object.freeze(Object.defineProperties({}, Object.getOwnPropertyDescriptors(${slot(prior)}.current!)));`);
    const rejected = run(await load(badRef, 'prior-ref-' + priorControls));
    assert.equal(rejected.s.failurePhase, phase); assert.equal(rejected.s.failureBoundary, 'before'); assert.equal(rejected.s.slots[n - 1].callBoundaryReached, false);
    const noData = method(badRef, 'bodyLivePrefixMatches', dataClause, 'true');
    const missed = run(await load(noData, 'prior-ref-mutant-' + priorControls++));
    assert.ok(missed.r.disposition === 'bundle_held' || missed.s.failurePhase !== phase || missed.s.failureBoundary !== 'before');
  }
  // Each live slot can drift after BC12; BC13 must refuse before calling its producer.
  const progressKeys = ['callReserved', 'controlReturned', 'probeFirst', 'used', 'prepared', 'routeUsed'];
  for (const [i, key] of progressKeys.entries()) {
    const injected = at('BC12', 'confirmed', `(${slot(i + 6)}.current as any).${key} = true;`);
    const checked = run(await load(injected, 'between-' + i)); assert.equal(checked.s.failurePhase, 'BC13'); assert.equal(checked.s.failureBoundary, 'before');
    assert.equal(checked.s.slots[12].callBoundaryReached, false);
    const removed = method(injected, 'bodyLivePrefixMatches', dataClause, 'true');
    assert.equal(run(await load(removed, 'between-mutant-' + i)).r.disposition, 'bundle_held');
  }
  // All thirteen positions are rechecked at the final post; confirmed must not be treated as a certificate.
  for (let n = 1; n <= 13; n++) {
    for (const [kind, code] of [['stage', `${slot(n)}.stage = 'provisional';`],
      ['identity', `${slot(n)}.current = Object.freeze(Object.defineProperties({}, Object.getOwnPropertyDescriptors(${slot(n)}.current!)));`]]) {
      const injected = at('BC13', 'post_before', code), checked = run(await load(injected, `post-${kind}-${n}`));
      assert.equal(checked.r.first, 'binding_mismatch'); assert.equal(checked.s.failurePhase, 'BC13'); assert.equal(checked.s.failureBoundary, 'post_before');
      assert.equal(checked.s.slots.every(c => c.issuedRetained && c.currentRetained), true);
      const removed = method(injected, 'prepareBodyBundle', ' || !this.bodyLivePrefixMatches(13)', '');
      assert.equal(run(await load(removed, `post-${kind}-mutant-${n}`)).r.disposition, 'bundle_held');
    }
  }
  const badBase = at('BC13', 'post_before', "this.#issuedCells!.body.state = 'running';");
  assert.equal(run(await load(badBase, 'post-base')).s.failureBoundary, 'post_before');
  assert.equal(run(await load(method(badBase, 'prepareBodyBundle', '!this.bodySeedBaseMatches() || ', ''), 'post-base-mutant')).r.disposition, 'bundle_held');
  // The per-mint base preflight rejects before the BC12/13 producer; the final post must not be the first to notice.
  for (const n of [12, 13]) {
    const phase = `BC${n}`, mintBase = at(phase, 'before', "this.#issuedCells!.body.state = 'running';");
    const checked = run(await load(mintBase, 'mint-base-' + n));
    assert.equal(`${checked.r.first}/${checked.s.failurePhase}/${checked.s.failureBoundary}`, `binding_mismatch/${phase}/before`);
    assert.equal(checked.s.slots[n - 1].callBoundaryReached, false);
    const late = run(await load(method(mintBase, 'bodyBundleMint', '!this.bodySeedBaseMatches() || ', ''), 'mint-base-mutant-' + n));
    assert.ok(late.r.disposition === 'bundle_held' || late.s.failurePhase !== phase || late.s.failureBoundary !== 'before', 'masked mint base ' + n);
    assert.equal(late.s.slots[n - 1].callBoundaryReached, true);
  }
  // A recursive freeze would corrupt the live Initial storage and is refused at the next guard.
  const deep = method(source, 'bodyBundleMint', 'else Object.freeze(raw);',
    'else { Object.freeze(raw); for (let i = 5; i < 11; i++) Object.freeze(this.#bodySeedShell!.slots![i]!.current); }');
  const deepRejected = run(await load(deep, 'deep-freeze')); assert.equal(deepRejected.r.first, 'binding_mismatch');
  assert.equal(deepRejected.s.failurePhase, 'BC13'); assert.equal(deepRejected.s.failureBoundary, 'before');
  const issued = method(source, 'bodyBundleMint', "cell.issued = raw; cell.stage = 'issued';", "cell.stage = 'issued';");
  assert.equal(run(base, 's_fault_BC12_issued').s.slots[11].issuedRetained, true);
  assert.equal(run(await load(issued, 'issued-lost'), 's_fault_BC12_issued').s.slots[11].issuedRetained, false);
  const same = replace(source, 'rejectedRetained: c?.rejected !== undefined,', 'rejectedRetained: c?.rejected !== undefined, rejectedSame: c?.rejected !== undefined && c.rejected === c.current,');
  assert.equal(run(await load(same, 'rejected-same'), 's_bundle_mix_13_copy').s.slots[12].rejectedSame, true);
  const first = at('BC13', 'before', "this.fail('state_invalid'); throw Error('later_failure');");
  const firstOut = run(await load(first, 'first')); assert.equal(firstOut.r.first, 'state_invalid'); assert.equal(firstOut.a.close(), firstOut.r);
  const projections = [['phase', '#bodySeedPhase', 'BODY_BUNDLE_PHASES'], ['boundary', '#bodySeedBoundary', 'BODY_BUNDLE_BOUNDARIES'],
    ['failurePhase', '#bodySeedFailurePhase', 'BODY_BUNDLE_PHASES'], ['failureBoundary', '#bodySeedFailureBoundary', 'BODY_BUNDLE_BOUNDARIES']];
  for (const [key, field, allowed] of projections) {
    const failed = key.startsWith('failure');
    const injected = at('BC13', 'post_after', `${failed ? "this.fail('state_invalid'); " : ''}this.${field} = 'private_phase';${failed ? " throw Error('private');" : ''}`);
    assert.equal(run(await load(injected, 'projection-' + key)).s[key], 'unconfirmed');
    const echo = method(injected, 'inspectBodyBundle', `runEnum(this.${field}, ${allowed}, 'unconfirmed')`, `this.${field}`, false);
    assert.equal(run(await load(echo, 'projection-echo-' + key)).s[key], 'private_phase');
  }
  const leak = method(source, 'inspectBodyBundle', 'valid: !!v && this.bodyBundleDataMatches(n)', 'valid: v', false);
  assert.equal(typeof run(await load(leak, 'reference-leak')).s.aggregates[0].valid, 'object');
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const b: BodyPreparationBundle;
declare const d: BodyPreparationDraft;
const badKind: BodyPreparationDraft = { ...d, kind: 'ready' };
const badExec: BodyPreparationDraft = { ...d, executable: true };
const badSeal: BodyPreparationDraft = { ...d, runSeal: b.pin };
const badBundle: BodyPreparationDraft = { ...d, bundle: b.unwind };
const badContext: BodyPreparationBundle = { ...b, context: b.pin };
const badPin: BodyPreparationBundle = { ...b, pin: b.context.pin };
const badProgress: BodyPreparationBundle = { ...b, progress: b.closure };
const badFunction: BodyPreparationBundle = { ...b, body: () => 1 };
b.context = b.context;
b.progress = b.progress;
d.bundle = b;
d.executable = false;
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, source + extra, language, true) : get(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 12);
  console.log(JSON.stringify({ compiled: true, fieldControls, childCopyControls, aggregateCopies: 2, brands: 2, frozenControls: 2,
    enumerableControls: 2, priorStageControls: priorControls, priorIdentityControls: priorControls, betweenLiveControls: 6,
    finalPostStageControls: 13, finalPostIdentityControls: 13, finalBase: true, shallowFreeze: true, issuedRetention: true,
    rejectedIdentity: true, firstDiagnosis: true, extraKeyControls: 2, projectionAllowlists: projections.length, referenceLeak: true, typeRejections: 12, mintBaseControls: 2 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
