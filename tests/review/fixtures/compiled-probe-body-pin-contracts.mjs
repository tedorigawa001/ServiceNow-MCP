/** C-01: all later pin states below are value models, never receiver writes. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-contracts-')), used = new Set();
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, a, b) { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); }
function method(s, name, a, b, priv = true, owner = 'CanonicalGateDraftRoot') {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start, name);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
function func(s, name, a, b) {
  const start = s.indexOf('function ' + name), end = s.indexOf('\n}\n', start) + 3;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
const at = code => method(source, 'bodyPinContractsPoint', '    this.#bodyPinPreparationPhase = phase;',
  '    this.#bodyPinPreparationPhase = phase;\n    if (phase === "before") { ' + code + ' }');
async function load(s, name) {
  assert.ok(!used.has(name)); used.add(name); const p = join(dir, name + '.js');
  writeFileSync(p, emit(s + '\nexport const pinChecks = BODY_PIN_PHASE_CHECKS;\n')); return import(pathToFileURL(p).href);
}
const cases = [
  ['entry', 'initializing', 'BP01', 'after', false, 'empty', 'none'],
  ['callReady', 'initializing', 'BP02', 'checked', false, 'empty', 'none'],
  ['receiverEntry', 'initializing', 'BP03', 'call', true, 'empty', 'preflight'],
  ['attempting', 'initializing', 'BP03', 'call', true, 'attempting', 'attempt'],
  ['issued', 'initializing', 'BP03', 'call', true, 'issued', 'issued'],
  ['captured', 'initializing', 'BP03', 'call', true, 'captured', 'current'],
  ['checked', 'initializing', 'BP03', 'call', true, 'captured', 'checked'],
  ['confirmed', 'initializing', 'BP03', 'call', true, 'confirmed', 'confirmed'],
  ['returned', 'initializing', 'BP03', 'after', true, 'confirmed', 'confirmed'],
  ['pre', 'initializing', 'BP04', 'before', true, 'confirmed', 'confirmed'],
  ['commit', 'initializing', 'BP04', 'checked', true, 'confirmed', 'confirmed'],
  ['post', 'preparing', 'BP04', 'after', true, 'confirmed', 'confirmed'],
  ['held', 'preparing', 'BP04', 'held', true, 'confirmed', 'confirmed'],
];
function values([, state, phase, boundary, pinCallReached, stage, step]) {
  const issued = ['issued', 'captured', 'confirmed'].includes(stage), current = ['captured', 'confirmed'].includes(stage);
  return { source: { state, phase, boundary, pinCallReached, claim: 'unused', bindCallReached: false, postConfirmed: false,
    stopRequested: false, first: 'none', failurePhase: 'none', failureBoundary: 'none', refusal: 'none', deliveryFirst: 'none' },
  receiver: { attemptUsed: stage !== 'empty', stage, step, issued, current, rejected: false, issuedSame: issued, currentSame: current,
    failureStep: 'none', first: 'none', failurePhase: 'none', failurePrefix: 'none', failureBoundary: 'none', refusal: 'none' } };
}
const run = m => { const a = m.createProbeBodyPinContractsFake(); return { a, r: a.prepare(), s: a.inspect() }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'); assert.equal(run(base).r.disposition, 'pin_contracts_held');
  let mutations = 0;
  for (const c of cases) {
    const [name] = c; assert.equal(base.pinChecks[name](values(c)), true, name);
    for (const other of cases) assert.equal(base.pinChecks[name](values(other)), other[0] === name, name + '/' + other[0]);
    for (const part of ['source', 'receiver']) for (const key of Object.keys(values(c)[part])) {
      const v = values(c); v[part][key] = typeof v[part][key] === 'boolean' ? !v[part][key] : 'private_invalid';
      assert.equal(base.pinChecks[name](v), false, name + '/' + part + '/' + key); mutations++;
    }
    for (const part of ['source', 'receiver']) {
      const v = values(c); v[part].extra = true; assert.equal(base.pinChecks[name](v), false);
      const missing = values(c); delete missing[part][Object.keys(missing[part])[0]]; assert.equal(base.pinChecks[name](missing), false);
    }
  }
  const sf = ['state', 'phase', 'boundary', 'pinCallReached', 'claim', 'bindCallReached', 'postConfirmed', 'stopRequested',
    'first', 'failurePhase', 'failureBoundary', 'refusal', 'deliveryFirst'];
  const clauses = ['v.state === state', 'v.phase === phase', 'v.boundary === boundary', 'v.pinCallReached === call',
    "v.claim === 'unused'", 'v.bindCallReached === false', 'v.postConfirmed === false', 'v.stopRequested === false',
    "v.first === 'none'", "v.failurePhase === 'none'", "v.failureBoundary === 'none'", "v.refusal === 'none'", "v.deliveryFirst === 'none'"];
  for (let i = 0; i < sf.length; i++) {
    const v = values(cases[0]); v.source[sf[i]] = typeof v.source[sf[i]] === 'boolean' ? !v.source[sf[i]] : 'private_invalid';
    const m = await load(func(source, 'bodyPinSourceAt', clauses[i], 'true'), 'source-clause-' + i);
    assert.equal(m.pinChecks.entry(v), true, sf[i] + ' guard sensitivity');
  }
  const rf = ['stage', 'step', 'attemptUsed', 'issued', 'current', 'rejected', 'issuedSame', 'currentSame',
    'failureStep', 'first', 'failurePhase', 'failurePrefix', 'failureBoundary', 'refusal'];
  const rc = ['v.stage === stage', 'v.step === step', "v.attemptUsed === (stage !== 'empty')", 'v.issued === issued', 'v.current === current',
    'v.rejected === false', 'v.issuedSame === issued', 'v.currentSame === current', "v.failureStep === 'none'", "v.first === 'none'",
    "v.failurePhase === 'none'", "v.failurePrefix === 'none'", "v.failureBoundary === 'none'", "v.refusal === 'none'"];
  for (let i = 0; i < rf.length; i++) {
    const v = values(cases[0]); v.receiver[rf[i]] = typeof v.receiver[rf[i]] === 'boolean' ? !v.receiver[rf[i]] : 'private_invalid';
    assert.equal((await load(func(source, 'bodyPinReceiverAt', rc[i], 'true'), 'receiver-clause-' + i)).pinChecks.entry(v), true, rf[i]);
  }
  const provenance = [['brand', 'v[BODY_BIND_SOURCE] === true'], ['custodian', 'v.custodian === this'], ['construction', 'v.construction === shell'],
    ['binding', 'v.binding === b'], ['link', 'v.link === this.#issuedRunLink'], ['duty', 'v.duty === this.#issuedRunDuty'],
    ['control', 'v.control === this.#exitSlots[0].value'], ['start', 'v.start === b.target.start'], ['rootFailure', 'v.rootFailure === this.#failure']];
  for (const [key, clause] of provenance) {
    const k = key === 'brand' ? 'BODY_BIND_SOURCE' : JSON.stringify(key);
    const changed = at(`const ds = Object.getOwnPropertyDescriptors(this.#bodySourceIssued!); ds[${k}].value = ${key === 'brand' ? 'false' : '{}'}; const copy = Object.seal(Object.defineProperties({}, ds)); this.#bodySourceIssued = copy as BodyBindSourceShell; this.#bodySourceCurrent = copy as BodyBindSourceShell;`);
    const rejected = run(await load(changed, 'provenance-' + key));
    assert.equal(rejected.r.first, 'binding_mismatch'); assert.equal(rejected.s.failurePhase, 'before');
    assert.equal(run(await load(method(changed, 'bodyPinProvenanceMatches', clause, 'true'), 'provenance-mutant-' + key)).r.disposition, 'pin_contracts_held');
  }
  const origins = [
    ['attempt', 'this.#bodySourceCreationAttempted = false;', "this.#bodySourceCreationAttempted !== true"],
    ['fixed', 'this.#bodySourceMetadataFixedCount = 8;', 'this.#bodySourceMetadataFixedCount !== 9'],
    ['confirmed', 'this.#bodySourceMetadataConfirmed = false;', 'this.#bodySourceMetadataConfirmed !== true'],
    ['stage', "this.#bodySourceBuildStage = 'hardened';", "this.#bodySourceBuildStage !== 'confirmed'"],
    ['rejected', 'this.#bodySourceRejected = {} as never;', 'this.#bodySourceRejected !== undefined'],
    ['current', 'this.#bodySourceCurrent = new Proxy({}, {get:()=>{throw Error("private");}, ownKeys:()=>{throw Error("private");}}) as never;', 'v !== this.#bodySourceCurrent'],
  ];
  for (const [name, code, clause] of origins) {
    const changed = at(code), r = run(await load(changed, 'origin-' + name)); assert.equal(r.r.first, 'binding_mismatch');
    assert.equal(r.s.failurePhase, 'before');
    assert.equal(run(await load(method(changed, 'bodyPinProvenanceMatches', clause, 'false'), 'origin-mutant-' + name)).r.disposition, 'pin_contracts_held');
  }
  const attributes = [
    ['metadata-enum', "ds.custodian.enumerable = false;", 'd.enumerable === true && d.configurable === false && d.writable === false', 'd.configurable === false && d.writable === false'],
    ['metadata-write', 'ds.custodian.writable = true;', 'd.writable === false', 'true'],
    ['progress-enum', 'ds.claim.enumerable = false;', 'd.enumerable === true && d.configurable === false && d.writable === true', 'd.configurable === false && d.writable === true'],
    ['progress-write', 'ds.claim.writable = false;', 'd.writable === true', 'true'],
    ['sealed', '', ' || !Object.isSealed(v)', ''],
  ];
  for (const [name, code, a, b] of attributes) {
    const changed = at(`const ds = Object.getOwnPropertyDescriptors(this.#bodySourceIssued!); ${code} const copy = Object.defineProperties({}, ds); ${name === 'sealed' ? '' : 'Object.seal(copy);'} this.#bodySourceIssued = copy as BodyBindSourceShell; this.#bodySourceCurrent = copy as BodyBindSourceShell;`);
    assert.equal(run(await load(changed, 'attribute-' + name)).r.first, 'binding_mismatch');
    assert.equal(run(await load(method(changed, 'bodyPinProvenanceMatches', a, b), 'attribute-mutant-' + name)).r.disposition, 'pin_contracts_held');
  }
  const initial = [
    ['bodyPinRouteAttempted', 'true', 'false'], ['bodyPinRouteState', "'running'", "'not_started'"],
    ['bodyPinRoutePhase', "'BP02'", "'none'"], ['bodyPinRouteStep', "'preflight'", "'none'"], ['bodyPinRouteBoundary', "'before'", "'none'"],
    ['bodyPinFailureRecorded', 'true', 'false'], ['bodyPinFirst', "'closed'", "'none'"], ['bodyPinFailurePhase', "'BP02'", "'none'"],
    ['bodyPinFailureStep', "'call'", "'none'"], ['bodyPinFailureBoundary', "'after'", "'none'"],
    ['bodyPinPreparingConfirmed', 'true', 'false'], ['bodyPinPostChecked', 'true', 'false'], ['bodyPinRefusal', "'duplicate_pin'", "'none'"],
  ];
  for (const [field, bad, good] of initial) {
    const changed = at(`this.#${field} = ${bad};`), r = run(await load(changed, 'initial-' + field));
    assert.equal(`${r.r.first}/${r.s.failurePhase}`, 'binding_mismatch/before');
    assert.equal(run(await load(method(changed, 'bodyPinRouteInitial', `this.#${field} === ${good}`, 'true'), 'initial-mutant-' + field)).r.disposition, 'pin_contracts_held');
  }
  for (const [name, code, clause] of [
    ['base', "this.#issuedCells!.body.state = 'running';", 'this.bodySeedBaseMatches()'],
    ['storage', "this.#bodySeedShell!.slots![0]!.stage = 'confirmed';", 'this.bodySourceStorageMatches(shell)'],
    ['frame', 'this.#frame = false;', 'this.#frame === true'],
  ]) {
    const changed = at(code); assert.equal(run(await load(changed, 'stable-' + name)).r.first, 'binding_mismatch');
    assert.equal(run(await load(method(changed, 'bodyPinContractsMatch', clause, 'true'), 'stable-mutant-' + name)).r.disposition, 'pin_contracts_held');
  }
  // An earlier stop injection is already rejected by the checkpoint guard. Isolate the final match after it.
  const stop = method(source, 'bodyPinContractsMatch', '    const shell = this.#bodySeedShell, start = this.#issuedFrameBinding?.target.start;',
    '    if (this.#bodyPinPreparationPhase === "after") this.#bodySourceStopRequested = true;\n    const shell = this.#bodySeedShell, start = this.#issuedFrameBinding?.target.start;');
  assert.equal(run(await load(stop, 'stop-final')).s.failurePhase, 'after');
  assert.equal(run(await load(method(stop, 'bodyPinContractsMatch', 'this.#bodySourceStopRequested === false', 'true'), 'stop-final-mutant')).r.disposition, 'pin_contracts_held');
  const payload = ['bodyBundleIssued', 'bodyBundleCurrent', 'bodyRejectedBundle', 'bodyDraftIssued', 'bodyDraftCurrent', 'bodyRejectedDraft'];
  for (const field of payload) {
    const changed = replace(source, '  private bodyPinPayloadEmpty(): boolean {', `  private bodyPinPayloadEmpty(): boolean {\n    this.#${field} = {} as never;`);
    assert.equal(run(await load(changed, 'payload-' + field)).r.first, 'binding_mismatch');
    // The fault is in a private scratch receiver, not a borrow or pin operation.
    assert.equal(run(await load(method(changed, 'bodyPinPayloadEmpty', `this.#${field} === undefined`, 'true', true, 'RetirementStartAssembly'), 'payload-mutant-' + field)).r.disposition, 'pin_contracts_held');
  }
  const atPhase = (p, code) => method(source, 'bodyPinContractsPoint', '    this.#bodyPinPreparationPhase = phase;',
    `    this.#bodyPinPreparationPhase = phase;\n    if (phase === "${p}") { ${code} }`);
  const rxHead = '  private bodyPinValues(source: BodyBindSourceShell): Readonly<BodyPinReceiverValues> {';
  const rxAt = code => replace(source, rxHead, rxHead + '\n    ' + code);
  const entrySource = [['state', "'preparing'", "'initializing'"], ['phase', "'BP02'", "'BP01'"], ['boundary', "'checked'", "'after'"],
    ['pinCallReached', 'true', 'false'], ['claim', "'spent'", "'unused'"], ['bindCallReached', 'true', 'false'], ['postConfirmed', 'true', 'false'],
    ['stopRequested', 'true', 'false'], ['first', "'closed'", "'none'"], ['failurePhase', "'BP00'", "'none'"], ['failureBoundary', "'before'", "'none'"],
    ['refusal', "'duplicate_creation'", "'none'"], ['deliveryFirst', "'closed'", "'none'"]];
  for (const [key, bad, good] of entrySource) {
    const changed = at(`(this.#bodySourceIssued as any).${key} = ${bad};`), r = run(await load(changed, 'entry-source-' + key));
    assert.equal(`${r.r.first}/${r.s.failurePhase}`, 'binding_mismatch/before', 'entry source ' + key);
    assert.equal(run(await load(method(changed, 'bodyPinSourceValues', `${key}: v.${key}`, `${key}: ${good}`), 'entry-source-mutant-' + key)).r.disposition, 'pin_contracts_held', key);
  }
  const entryReceiver = [
    ['attemptUsed', 'this.#bodyPinAttemptUsed = true;', 'attemptUsed: this.#bodyPinAttemptUsed', 'false'],
    ['stage', "this.#bodyPinStage = 'attempting';", 'stage: this.#bodyPinStage', "'empty'"],
    ['issued', 'this.#bodyExpectedSourceIssued = {} as never;', 'issued: this.#bodyExpectedSourceIssued !== undefined', 'false'],
    ['current', 'this.#bodyExpectedSourceCurrent = {} as never;', 'current: this.#bodyExpectedSourceCurrent !== undefined', 'false'],
    ['rejected', 'this.#bodyExpectedSourceRejected = {} as never;', 'rejected: this.#bodyExpectedSourceRejected !== undefined', 'false'],
    ['step', "this.#bodyPinStep = 'preflight';", 'step: this.#bodyPinStep,', "'none',"],
    ['failureStep', "this.#bodyPinFailureStep = 'attempt';", 'failureStep: this.#bodyPinFailureStep', "'none'"],
    ['first', "this.#bodyBindFirst = 'state_invalid';", 'first: this.#bodyBindFirst', "'none'"],
    ['failurePhase', "this.#bodyBindFailurePhase = 'private_invalid' as never;", 'failurePhase: this.#bodyBindFailurePhase', "'none'"],
    ['failurePrefix', "this.#bodyBindFailurePrefix = 'private_invalid' as never;", 'failurePrefix: this.#bodyBindFailurePrefix', "'none'"],
    ['failureBoundary', "this.#bodyBindFailureBoundary = 'private_invalid' as never;", 'failureBoundary: this.#bodyBindFailureBoundary', "'none'"],
    ['refusal', "this.#bodyBindRefusal = 'private_invalid' as never;", 'refusal: this.#bodyBindRefusal', "'none'"],
  ];
  for (const [key, code, mapped, good] of entryReceiver) {
    const changed = rxAt(code), r = run(await load(changed, 'entry-receiver-' + key));
    assert.equal(`${r.r.first}/${r.s.failurePhase}`, 'binding_mismatch/before', 'entry receiver ' + key);
    assert.equal(run(await load(method(changed, 'bodyPinValues', mapped, `${key}: ${good}`, true, 'RetirementStartAssembly'), 'entry-receiver-mutant-' + key)).r.disposition, 'pin_contracts_held', key);
  }
  const checkedRecheck = [
    ['source', atPhase('checked', "(this.#bodySourceIssued as any).claim = 'spent';")],
    ['route', atPhase('checked', 'this.#bodyPinRouteAttempted = true;')],
    ['frame', atPhase('checked', 'this.#frame = false;')],
    ['receiver', rxAt("if (++(globalThis as any).__pinValueCalls === 2) this.#bodyPinStage = 'attempting';")],
  ];
  const noChecked = s => method(s, 'prepareBodyPinContracts', "    this.bodyPinContractsPoint('checked'); if (!this.bodyPinContractsMatch()) return this.fail('binding_mismatch');",
    "    this.bodyPinContractsPoint('checked');");
  for (const [name, changed] of checkedRecheck) {
    globalThis.__pinValueCalls = 0; const r = run(await load(changed, 'checked-' + name));
    assert.equal(`${r.r.first}/${r.s.failurePhase}`, 'binding_mismatch/checked', 'checked ' + name);
    globalThis.__pinValueCalls = 0; const moved = run(await load(noChecked(changed), 'checked-mutant-' + name));
    assert.equal(`${moved.r.first}/${moved.s.failurePhase}`, 'binding_mismatch/after', 'checked moved ' + name);
  }
  delete globalThis.__pinValueCalls;
  const payloadScalars = [['bodyOccupancy', "this.#bodyOccupancy === 'free'"], ['bodyBindingState', "this.#bodyBindingState === 'empty'"],
    ['bodyBindPrefix', "this.#bodyBindPrefix === 'none'"]];
  for (const [field, clause] of payloadScalars) {
    const changed = replace(source, '  private bodyPinPayloadEmpty(): boolean {', `  private bodyPinPayloadEmpty(): boolean {\n    this.#${field} = 'private_invalid' as never;`);
    const r = run(await load(changed, 'payload-scalar-' + field));
    assert.equal(`${r.r.first}/${r.s.failurePhase}`, 'binding_mismatch/before', field);
    assert.equal(run(await load(method(changed, 'bodyPinPayloadEmpty', clause, 'true', true, 'RetirementStartAssembly'), 'payload-scalar-mutant-' + field)).r.disposition, 'pin_contracts_held', field);
  }
  {
    const m = await load(rxAt("if ((globalThis as any).__pinInspect) { this.#bodyPinStep = 'private_enum' as never; this.#bodyPinFailureStep = 'private_enum' as never; }"), 'receiver-projection');
    const a = m.createProbeBodyPinContractsFake(); assert.equal(a.prepare().disposition, 'pin_contracts_held');
    globalThis.__pinInspect = true; let s;
    try { s = a.inspect(); } finally { delete globalThis.__pinInspect; }
    assert.deepEqual({ ...s.receiverPin }, { step: 'unconfirmed', failureStep: 'unconfirmed' });
  }
  const twice = at("this.fail('state_invalid'); this.#bodyPinPreparationPhase = 'after'; this.fail('closed');");
  const first = run(await load(twice, 'first-position')); assert.equal(first.s.failurePhase, 'before');
  assert.equal(run(await load(method(twice, 'failBodyPinContracts', "if (this.#bodyPinPreparationFirst === 'none')", 'if (true)'), 'first-position-mutant')).s.failurePhase, 'after');
  const projection = [
    ['bodyPinPreparationState', 'state'], ['bodyPinPreparationPhase', 'phase'], ['bodyPinPreparationFailurePhase', 'failurePhase'],
    ['bodyPinPreparationFirst', 'preparationFirst'], ['bodyPinPreparationReentry', 'reentry'],
    ['bodyPinRouteState', 'route.state'], ['bodyPinRoutePhase', 'route.phase'], ['bodyPinRouteStep', 'route.step'],
    ['bodyPinRouteBoundary', 'route.boundary'], ['bodyPinFirst', 'route.first'], ['bodyPinFailurePhase', 'route.failurePhase'],
    ['bodyPinFailureStep', 'route.failureStep'], ['bodyPinFailureBoundary', 'route.failureBoundary'], ['bodyPinRefusal', 'route.refusal'],
  ];
  const projected = (s, key) => key.split('.').reduce((v, k) => v[k], s);
  for (const [field, key] of projection) {
    const injected = method(source, 'inspectBodyPinContracts', '    const source = this.#bodySourceIssued, start = this.#issuedFrameBinding?.target.start;',
      `    this.#${field} = 'private_enum' as never;\n    const source = this.#bodySourceIssued, start = this.#issuedFrameBinding?.target.start;`, false);
    assert.equal(projected(run(await load(injected, 'projection-' + field)).s, key), key === 'preparationFirst' ? 'internal_unconfirmed' : 'unconfirmed');
  }
  for (const [field, key] of [['bodyPinRouteAttempted', 'route.attempted'], ['bodyPinFailureRecorded', 'route.failureRecorded'],
    ['bodyPinPreparingConfirmed', 'route.preparingConfirmed'], ['bodyPinPostChecked', 'route.postChecked'], ['bodyPinPreparationChecked', 'checked']]) {
    const injected = method(source, 'inspectBodyPinContracts', '    const source = this.#bodySourceIssued, start = this.#issuedFrameBinding?.target.start;',
      `    this.#${field} = 'private_boolean' as never;\n    const source = this.#bodySourceIssued, start = this.#issuedFrameBinding?.target.start;`, false);
    assert.equal(projected(run(await load(injected, 'boolean-' + field)).s, key), false);
  }
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
  const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'CanonicalGateDraftRoot');
  const startClass = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'RetirementStartAssembly');
  const scalarDefaults = Object.fromEntries(initial.map(([field,, good]) => [field, good]));
  Object.assign(scalarDefaults, { bodyPinPreparationState: "'not_started'", bodyPinPreparationPhase: "'none'", bodyPinPreparationFailurePhase: "'none'",
    bodyPinPreparationFirst: "'none'", bodyPinPreparationChecked: 'false', bodyPinPreparationReentry: "'none'" });
  for (const [field, value] of Object.entries(scalarDefaults)) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + field);
    assert.ok(f.end < root.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), value);
  }
  assert.equal(root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#bodyPinContractsFixed').initializer, undefined);
  for (const field of ['bodyPinStep', 'bodyPinFailureStep']) {
    const f = startClass.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + field);
    assert.ok(f.end < startClass.members.find(ts.isConstructorDeclaration).pos); assert.equal(f.initializer.getText(ast), "'none'");
  }
  const protectedFields = new Set([...initial.map(([f]) => '#' + f), ...payload.map(f => '#' + f),
    '#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyExpectedSourceRejected', '#bodyPinAttemptUsed', '#bodyPinStage',
    '#bodyPinStep', '#bodyPinFailureStep', '#bodyOccupancy', '#bodyBindingState', '#bodyBindPrefix',
    'pinCallReached', 'bindCallReached', 'postConfirmed', 'claim']);
  const callerWriters = new Map([
    ['admitBodyPinCaller', new Set(['#bodyPinRouteAttempted', '#bodyPinRouteState', '#bodyPinRoutePhase',
      '#bodyPinRouteStep', '#bodyPinRouteBoundary', '#bodyPinRefusal'])],
    ['bodyPinStartPoint', new Set(['#bodyPinRouteBoundary'])],
    ['failBodyPinStart', new Set(['#bodyPinFailureRecorded', '#bodyPinFirst', '#bodyPinFailurePhase',
      '#bodyPinFailureStep', '#bodyPinFailureBoundary', '#bodyPinRouteState'])],
    ['failBodyPinBridge', new Set(['#bodyPinFailureRecorded', '#bodyPinFirst', '#bodyPinFailurePhase',
      '#bodyPinFailureStep', '#bodyPinFailureBoundary', '#bodyPinRouteState'])],
    ['prepareBodyPinStart', new Set(['#bodyPinRefusal'])],
    ['dispatchBodyPin', new Set(['#bodyPinRoutePhase', '#bodyPinRouteStep', '#bodyPinRouteBoundary', 'pinCallReached'])],
    ['prepareBodyPinCall', new Set(['#bodyPinRouteBoundary'])],
    ['bodyPinCallRefuse', new Set(['#bodyPinRefusal'])],
  ]);
  const receiverWriters = new Map([
    ['bodyPinReceiverEntry', new Set(['#bodyPinStep', '#bodyPinAttemptUsed', '#bodyPinStage'])],
    ['failBodyPinReceiver', new Set(['#bodyPinFailureStep'])],
    ['failBodyPinStorageReceiver', new Set(['#bodyPinFailureStep'])],
    ['storeBodyPinReferences', new Set(['#bodyExpectedSourceIssued', '#bodyExpectedSourceCurrent', '#bodyPinStep', '#bodyPinStage'])],
    ['bodyPinReferenceFault', new Set(['#bodyExpectedSourceCurrent'])],
    ['retainBodyPinRejected', new Set(['#bodyExpectedSourceRejected', '#bodyPinFailureStep'])],
  ]);
  for (const name of callerWriters.keys()) assert.equal(root.members.filter(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name).length, 1);
  for (const name of receiverWriters.keys()) assert.equal(startClass.members.filter(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name).length, 1);
  let callerWriteSites = 0;
  function noOperationalWrites(n, owner = '', scope = '') {
    if (ts.isClassDeclaration(n)) scope = n.name?.text ?? '';
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) || ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) {
      const lhs = ts.isBinaryExpression(n) ? n.left : n.operand;
      if (ts.isPropertyAccessExpression(lhs) && protectedFields.has(lhs.name.getText(ast))) {
        assert.ok(scope === 'CanonicalGateDraftRoot' && callerWriters.get(owner)?.has(lhs.name.getText(ast))
          || scope === 'RetirementStartAssembly' && receiverWriters.get(owner)?.has(lhs.name.getText(ast)), 'forbidden operational write');
        callerWriteSites++;
      }
    }
    ts.forEachChild(n, child => noOperationalWrites(child, owner, scope));
  }
  noOperationalWrites(ast);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = '\ndeclare const cr: CanonicalGateDraftRoot;\ncr.bodyPinProvenanceMatches({});\ncr.bodyPinContractsMatch();\nconst badPhase: BodyPinRoutePhase = "BP01";\nconst badStep: BodyPinRouteStep = "issued";\nconst badRx: BodyPinReceiverStep = "occupied";\nconst badState: BodyPinRouteState = "ready";\nconst badRefusal: BodyPinRefusal = "duplicate_bind";\ndeclare const sv: BodyPinEntryValues["source"];\nconst badCall: BodyPinEntryValues["source"] = {...sv, pinCallReached: true};\nconst badSpent: BodyPinSourceContract = {...sv, claim: "spent"};\nconst badPreparing: BodyPinSourceContract = {...sv, state: "preparing"};\ndeclare const rv: BodyPinEntryValues["receiver"];\nconst badAttempt: BodyPinReceiverContract = {...rv, attemptUsed: true};\nconst badPair: BodyPinReceiverContract = {...rv, stage: "confirmed"};\n';
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (p, language, error, fresh) => p === file ? ts.createSourceFile(p, source + extra, language, true) : get(p, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'baseline semantic errors');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 12);
  console.log(JSON.stringify({ compiled: true, valueOnlyVariants: cases.length, fieldRejections: mutations,
    valueClauseControls: sf.length + rf.length, provenanceControls: provenance.length + origins.length, initialControls: initial.length,
    stableControls: 4, payloadControls: payload.length, attributeControls: attributes.length, firstPosition: true,
    projectionAllowlists: projection.length, strictBooleans: 5, priorRootScalars: Object.keys(scalarDefaults).length,
    priorReceiverScalars: 2, unauthorizedProtectedWrites: 0, c01AndReceiverProtected: true,
    scopedControlWriteSites: callerWriteSites, receiverControlMethods: receiverWriters.size, semanticRejections: 12,
    entrySourceControls: entrySource.length, entryReceiverControls: entryReceiver.length, checkedRecheckControls: checkedRecheck.length,
    payloadScalarControls: payloadScalars.length, receiverProjectionAllowlists: 2 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
