/** Primitive receiver storage and type-only source contract; all mutations are disposable. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-body-bind-fields-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b) {
  const start = s.indexOf(`  private ${name}(`), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
async function load(s, name) {
  assert.ok(!used.has(name), 'unique module URL'); used.add(name);
  const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href);
}
const run = m => { const a = m.createProbeBodyBindFieldsFake(); return { a, r: a.prepare(), s: a.inspect() }; };
const at = code => method(source, 'bodyFieldsPoint', '    this.#bodyFieldsPhase = phase;',
  `    this.#bodyFieldsPhase = phase;\n    if (phase === 'before') { ${code} }`);
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'baseline'); assert.equal(run(base).r.disposition, 'bind_fields_held');
  const refs = ['bodyExpectedSourceIssued', 'bodyExpectedSourceCurrent', 'bodyExpectedSourceRejected', 'bodyBundleIssued',
    'bodyBundleCurrent', 'bodyRejectedBundle', 'bodyDraftIssued', 'bodyDraftCurrent', 'bodyRejectedDraft'];
  const scalars = [['bodyPinAttemptUsed', 'false', 'true'], ['bodyPinStage', "'empty'", "'confirmed'"],
    ['bodyOccupancy', "'free'", "'used'"], ['bodyBindingState', "'empty'", "'confirmed'"], ['bodyBindPrefix', "'none'", "'checked'"],
    ['bodyBindFirst', "'none'", "'state_invalid'"], ['bodyBindFailurePhase', "'none'", "'post'"],
    ['bodyBindFailurePrefix', "'none'", "'checked'"], ['bodyBindFailureBoundary', "'none'", "'after'"], ['bodyBindRefusal', "'none'", "'duplicate_bind'"]];
  const parsed = ts.createSourceFile('composition.ts', source, ts.ScriptTarget.ES2022, true);
  const receiver = parsed.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'RetirementStartAssembly');
  for (const field of refs) {
    const declaration = receiver.members.find(m => ts.isPropertyDeclaration(m) && m.name.getText(parsed) === '#' + field);
    assert.ok(declaration); assert.equal(declaration.initializer, undefined, 'no initializer allocation: ' + field);
  }
  for (const [field, initial] of scalars) {
    const declaration = receiver.members.find(m => ts.isPropertyDeclaration(m) && m.name.getText(parsed) === '#' + field);
    assert.ok(declaration); assert.equal(declaration.initializer.getText(parsed), initial, 'literal-only: ' + field);
  }
  let controls = 0;
  for (const [field, expected, bad] of [...refs.map(f => [f, 'undefined', '{} as never']), ...scalars]) {
    const clause = `this.#${field} === ${expected}`;
    const injected = method(source, 'bodyFieldsInitial', '    return this.#bodyExpectedSourceIssued',
      `    this.#${field} = ${bad};\n    return this.#bodyExpectedSourceIssued`);
    const rejected = run(await load(injected, 'receiver-' + controls));
    assert.equal(rejected.r.first, 'binding_mismatch'); assert.equal(rejected.s.failurePhase, 'before');
    assert.equal(rejected.s.bodyStarts + rejected.s.grantAttempts + rejected.s.dataCreated, 0);
    if (refs.includes(field)) assert.equal(rejected.s.receiver.references.find(r => r.field === field).retained, true);
    const omitted = method(injected, 'bodyFieldsInitial', clause, 'true');
    assert.equal(run(await load(omitted, 'receiver-mutant-' + controls++)).r.disposition, 'bind_fields_held', field);
  }
  // Unissued sources are never dereferenced, even for projection or rejection.
  for (const field of ['bodySourceIssued', 'bodySourceCurrent', 'bodySourceRejected', 'bodySourceMetadataConfirmed']) {
    const bad = field.endsWith('Confirmed') ? 'true' : "new Proxy({}, { get() { throw Error('must_not_read'); }, ownKeys() { throw Error('must_not_enumerate'); } }) as never";
    const injected = at(`this.#${field} = ${bad};`), rejected = run(await load(injected, field));
    assert.equal(rejected.r.first, 'binding_mismatch'); assert.equal(rejected.s.source.state, 'unconfirmed');
    assert.equal(rejected.s.source.claim, 'unconfirmed');
    const clause = `this.#${field} === ${field.endsWith('Confirmed') ? 'false' : 'undefined'}`;
    assert.equal(run(await load(method(injected, 'bodyFieldsIntact', clause, 'true'), field + '-mutant')).r.disposition, 'bind_fields_held');
  }
  // Post checks must reject drift that happens after the initial check.
  for (const phase of ['checked', 'after']) {
    const drift = method(source, 'bodyFieldsPoint', '    this.#bodyFieldsPhase = phase;',
      `    this.#bodyFieldsPhase = phase;\n    if (phase === '${phase}') this.#bodySourceMetadataConfirmed = true;`);
    const s = run(await load(drift, 'late-' + phase)); assert.equal(s.r.first, 'binding_mismatch'); assert.equal(s.s.failurePhase, phase);
  }
  // Refusal paths cannot invoke the old frame wrapper, even if ready is incorrectly changed.
  const ready = at('this.#ready = true;'); const denied = run(await load(ready, 'ready-not-authority'));
  assert.equal(denied.a.check().disposition, 'blocked_frame_execution'); assert.equal(denied.a.checkLegacy().disposition, 'not_ready');
  const sourceFree = method(source, 'prepareBodyBindFields', "    this.#bodyFieldsState = 'held';",
    "    if (this.#bodySourceIssued || this.#bodySourceCurrent || this.#bodySourceRejected || this.#bodySourceMetadataConfirmed || this.#bodySeedShell) throw Error('unexpected_generation');\n    this.#bodyFieldsState = 'held';");
  assert.equal(run(await load(sourceFree, 'no-generated-data')).r.disposition, 'bind_fields_held');
  // Public finite enums never echo an unexpected private scalar.
  const projections = ['bodyPinStage', 'bodyOccupancy', 'bodyBindingState', 'bodyBindPrefix', 'bodyBindFirst',
    'bodyBindFailurePhase', 'bodyBindFailurePrefix', 'bodyBindFailureBoundary', 'bodyBindRefusal'];
  const keys = ['pinStage', 'occupancy', 'bindingState', 'prefix', 'first', 'failurePhase', 'failurePrefix', 'failureBoundary', 'refusal'];
  for (const [i, field] of projections.entries()) {
    const corrupt = method(source, 'bodyFieldsInitial', '    return this.#bodyExpectedSourceIssued',
      `    this.#${field} = 'private_secret' as never;\n    return this.#bodyExpectedSourceIssued`);
    assert.equal(run(await load(corrupt, 'allowlist-' + i)).s.receiver[keys[i]], 'unconfirmed');
  }
  // Root-side intact clauses: each rejects a single injected fault on its own; removing it lets the run hold.
  const rootIntact = [
    ['base', "this.#issuedCells!.body.state = 'running';", 'this.bodySeedBaseMatches() && ', ''],
    ['seed-shell', 'this.#bodySeedShell = {} as never;', ' && this.#bodySeedShell === undefined', ''],
  ];
  for (const [name, code, a, b] of rootIntact) {
    const injected = at(code), rejected = run(await load(injected, 'root-intact-' + name));
    assert.equal(`${rejected.r.first}/${rejected.s.failurePhase}`, 'binding_mismatch/before', name);
    assert.equal(run(await load(method(injected, 'bodyFieldsIntact', a, b), 'root-intact-mutant-' + name)).r.disposition, 'bind_fields_held', name);
  }
  // bodyStarts is derived from the real body cell; a fixed 0 would misreport a started body.
  const started = run(await load(at("this.#issuedCells!.body.state = 'running';"), 'body-started'));
  assert.equal(started.s.bodyStarts, 1);
  const fixedZero = replace(at("this.#issuedCells!.body.state = 'running';"), "bodyStarts: this.#issuedCells?.body.state === 'running' ? 1 : 0,", 'bodyStarts: 0,');
  assert.equal(run(await load(fixedZero, 'body-started-fixed-zero')).s.bodyStarts, 0);
  // Root-side projection allowlists never echo an unexpected private scalar.
  const atPhase = (p, code) => method(source, 'bodyFieldsPoint', '    this.#bodyFieldsPhase = phase;',
    `    this.#bodyFieldsPhase = phase;\n    if (phase === '${p}') { ${code} }`);
  const rootProjection = [
    ['state', replace(source, "    this.#bodyFieldsState = 'held';\n    return this.reply(false, 'bind_fields_held');",
      "    this.#bodyFieldsState = 'private_state' as never;\n    return this.reply(false, 'bind_fields_held');"),
      "state: runEnum(this.#bodyFieldsState, ['not_started', 'checking', 'held', 'failed'], 'unconfirmed')", 'state: this.#bodyFieldsState', 'private_state'],
    ['phase', atPhase('after', "this.#bodyFieldsPhase = 'private_phase';"),
      "      phase: runEnum(this.#bodyFieldsPhase, ['none', 'before', 'checked', 'after'], 'unconfirmed'),", '      phase: this.#bodyFieldsPhase,', 'private_phase'],
    ['failurePhase', atPhase('before', "this.#bodyFieldsPhase = 'private_phase'; throw Error('private_fault');"),
      "      failurePhase: runEnum(this.#bodyFieldsFailurePhase, ['none', 'before', 'checked', 'after'], 'unconfirmed'),", '      failurePhase: this.#bodyFieldsFailurePhase,', 'private_phase'],
    ['reentry', atPhase('before', "this.#bodyFieldsReentry = 'private_reentry';"),
      "      reentry: runEnum(this.#bodyFieldsReentry, ['none', 'construction_in_progress'], 'unconfirmed'),", '      reentry: this.#bodyFieldsReentry,', 'private_reentry'],
  ];
  for (const [key, injected, a, b, secret] of rootProjection) {
    assert.equal(run(await load(injected, 'root-projection-' + key)).s[key], 'unconfirmed', key);
    assert.equal(run(await load(replace(injected, a, b), 'root-projection-echo-' + key)).s[key], secret, key);
  }
  const prior = base.createProbeBodyBindFieldsFake('bf_prior_diagnostic'), first = prior.prepare();
  assert.equal(first.first, 'state_invalid'); assert.equal(prior.check({}), first); assert.equal(prior.inspect().receiver.first, 'state_invalid');
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const sourceInitial: BodyBindSourceInitial;
declare const sourceShell: BodyBindSourceShell;
const badInitialClaim: BodyBindSourceInitial = { ...sourceInitial, claim: 'spent' };
const badInitialPin: BodyBindSourceInitial = { ...sourceInitial, pinCallReached: true };
const badInitialPost: BodyBindSourceInitial = { ...sourceInitial, postConfirmed: true };
const badHistory: BodyBindSourceShell = { ...sourceInitial, state: 'held_unready' };
const badPreparing: BodyBindSourceShell = { ...sourceInitial, state: 'preparing' };
const badFailed: BodyBindSourceShell = { ...sourceInitial, state: 'failed', bindCallReached: true };
const badFirst: BodySourceFirst = 'private_error';
const badRefusal: BodyBindRefusal = 'allow';
const badPin: BodyPinStage = 'ready';
const badOccupancy: BodyOccupancy = 'refunded';
const badState: BodyBindingState = 'ready';
const badPrefix: BodyBindPrefix = 'activated';
const badReceiverFirst: BodyReceiverFirst = 'post_unconfirmed';
const badPhase: BodyReceiverFailurePhase = 'body';
const badBoundary: BodyReceiverFailureBoundary = 'call';
sourceShell.start = sourceInitial.start;
sourceShell.custodian = sourceInitial.custodian;
const badBundle: BodyPreparationBundle = sourceInitial;
const badDraft: BodyPreparationDraft = sourceInitial;
const badSource: BodyBindSourceInitial = { ...sourceInitial, start: sourceInitial.custodian };
const badCallback: BodyBindSourceInitial = { ...sourceInitial, execute: () => 1 };
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, source + extra, language, true) : get(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 21);
  console.log(JSON.stringify({ compiled: true, receiverFieldControls: controls, primitiveOnlyFields: 19, sourceAbsentControls: 4, lateDrift: 2,
    refusalDespiteReady: true, noSourceOrBCGeneration: true, receiverAllowlists: 9, firstDiagnosis: true, semanticRejections: 21,
    rootIntactControls: rootIntact.length, bodyStartsProjection: true, rootAllowlists: rootProjection.length }));
} finally { rmSync(dir, { recursive: true, force: true }); }
