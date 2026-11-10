/** Prior body seed only. Mutations live in scratch; no body/bind/ready issuer. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-body-seed-'));
const emit = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
function method(s, name, from, to) {
  const start = s.indexOf('  private ' + name + '('), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(start >= 0 && end > start, name); return s.slice(0, start) + replace(s.slice(start, end), from, to) + s.slice(end);
}
function dataCase(s, n, from, to) {
  const first = s.indexOf('  private bodySeedDataMatches('), last = s.indexOf('\n  }\n', first) + 5;
  const body = s.slice(first, last), a = body.indexOf(n === 5 ? '    const v = value as FixedBodyRoutePin;' : n === 3 || n === 4 ? '    if (n === 3 || n === 4)' : `    if (n === ${n})`);
  const b = n === 1 ? body.indexOf('    if (n === 2)') : n === 2 ? body.indexOf('    if (n === 3 || n === 4)') : n < 5 ? body.indexOf('    const v = value as FixedBodyRoutePin;') : body.length;
  assert.ok(a >= 0 && b > a); const changed = body.slice(0, a) + replace(body.slice(a, b), from, to) + body.slice(b);
  return s.slice(0, first) + changed + s.slice(last);
}
async function load(s, name) { const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href); }
const run = (m, script = 's_normal') => { const a = m.createProbeBodySeedFake(script); const r = a.prepare(); return { a, r, s: a.inspect() }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(source, 'base'); assert.equal(run(base).r.disposition, 'seed_held');
  const original = run(base); assert.equal(original.a.prepare().disposition, 'duplicate_preparation'); assert.equal(original.a.inspect().first, 'none');
  const duplicate = run(await load(replace(source, "if (this.#started) return this.reply(false, 'duplicate_preparation');", ''), 'duplicate'));
  assert.equal(duplicate.a.prepare().first, 'construction_unconfirmed'); assert.equal(duplicate.a.inspect().state, 'failed');
  for (const [key, clause, code] of [['failure', 's.failure === this.#failure', 'Object.defineProperty(this.#bodySeedShell!, "failure", { value: { ...this.#failure } });'],
    ['state', "s.state === 'building'", 'this.#bodySeedShell!.state = "held";']]) {
    const late = method(source, 'bodySeedPoint', '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
      `    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\n    if (phase === 'BC00' && boundary === 'before') { ${code} }`);
    assert.equal(run(await load(late, 'late-shell-' + key)).r.first, 'binding_mismatch');
    assert.equal(run(await load(method(late, 'bodySeedCarriersMatch', clause, 'true'), 'late-shell-mutant-' + key)).r.disposition, 'seed_held');
  }
  const context = { seed: 'this.#issuedSeed === v.seed', binding: 'v.binding === b', cells: 'v.cells === c', link: 'v.link === this.#issuedRunLink',
    duty: 'v.duty === this.#issuedRunDuty', control: 'v.control === this.#exitSlots[0].value', start: 'v.start === b.target.start', bindingOwner: 'v.bindingOwner === b.owner',
    cellOwner: 'v.cellOwner === this.#probeOwner', scope: 'v.scope === b.scope', pin: 'v.pin === b.pin', epoch: 'v.epoch === b.epoch', packet: 'v.packet === b.packet',
    frame: 'v.frame === c.frame', entry: 'v.entry === b.entry', exit: 'v.exit === b.exit', runSeal: 'v.runSeal === this.#issuedRunSeal', exitBundle: 'v.exitBundle === this.#exitSlots[4].value' };
  const unified = method(source, 'prepareBodySeed', 'cellOwner: this.#probeOwner!,', 'cellOwner: b.owner,');
  assert.equal(run(await load(unified, 'unified-owners')).r.first, 'binding_mismatch');
  assert.equal(run(await load(dataCase(unified, 1, 'v.cellOwner === this.#probeOwner', 'true'), 'unified-owners-mutant')).r.disposition, 'seed_held');
  const rows = [Object.entries(context), [['context', 'v.context === ctx'], ['kind', "v.kind === 'fixed_probe_body'"]],
    ...[3, 4].map(() => [['context', 'v.context === ctx'], ['bodyOrigin', 'v.bodyOrigin === origin'], ['kind', "v.kind === (n === 3 ? 'throw' : 'cancel')"]]),
    [['context', 'v.context === ctx'], ['bodyOrigin', 'v.bodyOrigin === origin'], ['throwSentinel', 'v.throwSentinel === slots[2]!.current'],
      ['cancelSentinel', 'v.cancelSentinel === slots[3]!.current'], ['grantSlot', 'v.grantSlot === this.#issuedCells!.grant'], ['kind', "v.kind === 'fixed_body'"], ['executable', 'v.executable === false']]];
  let fields = 0;
  for (const [i, row] of rows.entries()) for (const [key, clause] of row) {
    const script = `s_mix_${i + 1}_${key}`; assert.equal(run(base, script).r.first, 'binding_mismatch');
    const m = await load(dataCase(source, i + 1, clause, 'true'), 'field-' + fields++);
    assert.equal(run(m, script).r.disposition, 'seed_held', 'masked field ' + script);
  }
  for (let n = 1; n <= 5; n++) {
    const copy = await load(method(source, 'bodySeedDataMatches', 'value !== cell.issued || ', ''), 'copy-' + n);
    assert.equal(run(copy, `s_mix_${n}_copy`).r.disposition, 'seed_held');
    const brand = ["v[BODY_CONTEXT] === true", "v[BODY_ORIGIN] === true", "v[BODY_SENTINEL] === true", "v[BODY_SENTINEL] === true", "v[BODY_ROUTE_PIN] === true"][n - 1];
    assert.equal(run(await load(dataCase(source, n, brand, 'true'), 'brand-' + n), `s_mix_${n}_brand`).r.disposition, 'seed_held');
    const extra = await load(replace(source, 'Reflect.ownKeys(value).length === keys.length', 'true'), 'extra-' + n);
    assert.equal(run(extra, `s_mix_${n}_extra`).r.disposition, 'seed_held');
    assert.equal(run(base, `s_mix_${n}_getter`).s.hookCalls, 0);
    const getter = await load(method(source, 'bodySeedDataMatches', '!bodySeedShape(value, [BODY_DATA_BRANDS[n - 1], ...BODY_DATA_FIELDS[n - 1]])', 'false'), 'getter-' + n);
    assert.equal(run(getter, `s_mix_${n}_getter`).s.hookCalls, 1);
  }
  // Retention comes before the first observable post-generation checkpoint.
  const lost = method(source, 'bodySeedBoot', 'const v = create(); retain(v);', 'const v = create();');
  assert.equal(run(base, 's_fault_BS00_retained').s.shellRetained, true);
  assert.equal(run(await load(lost, 'lost-shell'), 's_fault_BS00_retained').s.shellRetained, false);
  const lostIssued = method(source, 'bodySeedMint', "cell.issued = raw; cell.stage = 'issued';", "cell.stage = 'issued';");
  assert.equal(run(base, 's_fault_BC01_issued').s.slots[0].issuedRetained, true);
  assert.equal(run(await load(lostIssued, 'lost-issued'), 's_fault_BC01_issued').s.slots[0].issuedRetained, false);
  const injectBoot = code => method(source, 'bodySeedBoot', "    if (!this.bodySeedBootMatches(phase, v))", `    if (phase === 'BS02') { ${code} }\n    if (!this.bodySeedBootMatches(phase, v))`);
  const changed = injectBoot('this.#bodySeedShell!.slots![0] = { ...this.#bodySeedShell!.slots![0]! };');
  assert.equal(run(await load(changed, 'carrier-copy')).s.failurePhase, 'BS02');
  assert.equal(run(await load(method(changed, 'bodySeedBootMatches', 'shell.slots[index] === issued', 'true'), 'carrier-copy-mutant')).r.disposition, 'seed_held');
  const emptyChanged = method(source, 'prepareBodySeed', "    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches() || ![1, 2, 3, 4, 5].every", "    this.#bodySeedShell!.slots![12]!.attemptReserved = true;\n    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches() || ![1, 2, 3, 4, 5].every");
  assert.equal(run(await load(emptyChanged, 'unused-carrier')).r.first, 'binding_mismatch');
  assert.equal(run(await load(method(emptyChanged, 'bodySeedCarriersMatch', 'c.attemptReserved === false', 'true'), 'unused-carrier-mutant')).r.disposition, 'seed_held');
  const leaked = replace(source, "sameOwnerBindings: s?.slots?.[0]?.stage === 'confirmed' && this.bodySeedDataMatches(1)", 'sameOwnerBindings: s?.slots?.[0]?.current');
  assert.equal(typeof run(await load(leaked, 'leaked-context')).s.sameOwnerBindings, 'object');
  const premature = replace(source, 'if (this.bodySeed) return this.prepareBodySeed();', 'if (this.bodySeed) { this.#ready = true; return this.prepareBodySeed(); }');
  assert.equal(run(await load(premature, 'premature-ready')).s.rootReady, true); assert.equal(run(base).s.rootReady, false);
  // Each preflight/recheck must be the guard that first rejects a single injected fault. Guards overlap
  // (BC00 / every mint / final recheck), so a removed clause must move failurePhase or reach seed_held.
  const at = (phase, boundary, code) => method(source, 'bodySeedPoint', '    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;',
    `    this.#bodySeedPhase = phase; this.#bodySeedBoundary = boundary;\n    if (phase === '${phase}' && boundary === '${boundary}') { ${code} }`);
  const cellsAt = "this.#issuedCells!", slotAt = i => `this.#bodySeedShell!.slots![${i}]!`;
  const recheck = [
    ['base-use', 'BC00', 'before', `${cellsAt}.use.state = 'entering';`, 'bodySeedBaseMatches', "c.use.state === 'unused'", 'true'],
    ['base-grant', 'BC00', 'before', `${cellsAt}.grant.stage = 'provisional';`, 'bodySeedBaseMatches', "c.grant.stage === 'empty'", 'true'],
    ['base-body', 'BC00', 'before', `${cellsAt}.body.state = 'running';`, 'bodySeedBaseMatches', "c.body.state === 'not_started'", 'true'],
    ['base-exit', 'BC00', 'before', `${cellsAt}.exit.stage = 'unsealed';`, 'bodySeedBaseMatches', "c.exit.stage === 'empty'", 'true'],
    ['bc00-base', 'BC00', 'before', `${cellsAt}.use.state = 'entering';`, 'prepareBodySeed',
      "    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches()) return", '    if (!this.bodySeedCarriersMatch()) return'],
    ['mint-base', 'BC02', 'before', `${cellsAt}.use.state = 'entering';`, 'bodySeedMint', '!this.bodySeedBaseMatches() || cell.stage', 'cell.stage'],
    ['mint-carriers', 'BC02', 'before', "this.#bodySeedShell!.state = 'held';", 'bodySeedMint',
      '!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches()', '!this.bodySeedBaseMatches()'],
    ['mint-stage', 'BC02', 'before', `${slotAt(1)}.stage = 'attempting';`, 'bodySeedMint', "cell.stage !== 'not_started'", 'false'],
    ['mint-reserved', 'BC02', 'before', `${slotAt(1)}.attemptReserved = true;`, 'bodySeedMint', 'cell.attemptReserved || cell.callBoundaryReached', 'cell.callBoundaryReached'],
    ['mint-call', 'BC02', 'before', `${slotAt(1)}.callBoundaryReached = true;`, 'bodySeedMint', 'cell.attemptReserved || cell.callBoundaryReached', 'cell.attemptReserved'],
    ['mint-prior-stage', 'BC03', 'before', `${slotAt(1)}.stage = 'provisional';`, 'bodySeedMint', "this.#bodySeedShell!.slots![i - 1]!.stage === 'confirmed' && ", ''],
    ['mint-prior-data', 'BC03', 'before', `${slotAt(0)}.current = Object.freeze({ ...${slotAt(0)}.current });`, 'bodySeedMint', '&& this.bodySeedDataMatches(i))) {', ')) {'],
    ['boot-failure', 'BS02', 'retained', "Object.defineProperty(this.#bodySeedShell!, 'failure', { value: { ...this.#failure } });", 'bodySeedBootMatches', 'shell.failure !== this.#failure', 'false'],
    ['boot-state', 'BS02', 'retained', "this.#bodySeedShell!.state = 'held';", 'bodySeedBootMatches', "shell.state !== 'building'", 'false'],
    ['boot-shape', 'BS02', 'retained', '(this.#bodySeedShell! as any).extra = true;', 'bodySeedBootMatches',
      "!bodySeedShape(shell, ['failure', 'slots', 'state', 'ready', 'execution', 'bindAttemptUsed', 'bindStage'])", 'false'],
    ['boot-bs00-slots', 'BS00', 'retained', 'this.#bodySeedShell!.slots = [];', 'bodySeedBootMatches', 'shell === issued && shell.slots === undefined', 'shell === issued'],
    ['boot-bs01-holes', 'BS01', 'retained', 'this.#bodySeedShell!.slots![0] = undefined;', 'bodySeedBootMatches',
      ' && Array.from({ length: 13 }, (_, i) => i).every(i => !Object.hasOwn(shell.slots!, i))', ''],
    ['boot-prior-carrier', 'BS03', 'retained', `${slotAt(0)}.attemptReserved = true;`, 'bodySeedBootMatches', 'c.attemptReserved === false', 'true'],
    ['final-base', 'BC05', 'confirmed', `${cellsAt}.use.state = 'entering';`, 'prepareBodySeed',
      '    if (!this.bodySeedCarriersMatch() || !this.bodySeedBaseMatches() || ![1, 2, 3, 4, 5]', '    if (!this.bodySeedCarriersMatch() || ![1, 2, 3, 4, 5]'],
    ['final-data', 'BC05', 'confirmed', `${slotAt(0)}.current = Object.freeze({ ...${slotAt(0)}.current });`, 'prepareBodySeed',
      ' || ![1, 2, 3, 4, 5].every(n => this.bodySeedDataMatches(n))) return', ') return'],
  ];
  for (const [i, [name, phase, boundary, code, target, from, to]] of recheck.entries()) {
    const injected = at(phase, boundary, code), checked = run(await load(injected, 'recheck-' + i));
    assert.equal(checked.r.first, 'binding_mismatch', name);
    assert.equal(`${checked.s.failurePhase}/${checked.s.failureBoundary}`, `${phase}/${boundary}`, name);
    const masked = run(await load(method(injected, target, from, to), 'recheck-mutant-' + i));
    assert.ok(masked.r.disposition === 'seed_held' || `${masked.s.failurePhase}/${masked.s.failureBoundary}` !== `${phase}/${boundary}`, 'masked recheck ' + name);
  }
  // Freeze after issued: a late write to confirmed data throws instead of reaching the next relation check.
  const lateWrite = at('BC02', 'before', `(${slotAt(0)}.current as any).seed = Object.freeze({});`);
  assert.equal(run(await load(lateWrite, 'late-write')).r.first, 'construction_unconfirmed');
  assert.equal(run(await load(method(lateWrite, 'bodySeedMint', '    Object.freeze(raw);\n', ''), 'late-write-mutant')).r.first, 'binding_mismatch');
  // The first rejected candidate is the same captured current reference, not a replacement marker.
  const sameRejected = replace(source, 'rejectedRetained: c?.rejected !== undefined,', 'rejectedRetained: c?.rejected !== undefined, rejectedSame: c?.rejected !== undefined && c.rejected === c.current,');
  for (const script of ['s_mix_2_extra', 's_mix_5_copy']) assert.equal(run(await load(sameRejected, 'rejected-same'), script).s.slots[script === 's_mix_2_extra' ? 1 : 4].rejectedSame, true);
  const replacedRejected = method(sameRejected, 'bodySeedMint', 'if (!cell.rejected) cell.rejected = current;', 'if (!cell.rejected) cell.rejected = Object.freeze({});');
  assert.equal(run(await load(replacedRejected, 'rejected-replaced'), 's_mix_2_extra').s.slots[1].rejectedSame, false);
  // Stage projection allowlist: an out-of-allowlist live stage is unconfirmed, never echoed.
  const badStageSource = at('BC05', 'confirmed', `${slotAt(12)}.stage = 'ready' as never;`);
  assert.equal(run(await load(badStageSource, 'bad-stage')).s.slots[12].stage, 'unconfirmed');
  const echoed = replace(badStageSource, "stage: c ? runEnum(c.stage, ['not_started', 'attempting', 'issued', 'provisional', 'confirmed'], 'unconfirmed') : 'not_created'", "stage: c ? c.stage : 'not_created'");
  assert.equal(run(await load(echoed, 'bad-stage-echo')).s.slots[12].stage, 'ready');
  const trap = replace(source, '    this.#frame = true;\n    try { this.generationFrame(); }', "    throw Error('forbidden_body');\n    this.#frame = true;\n    try { this.generationFrame(); }");
  const trapped = run(await load(trap, 'body-trap')); trapped.a.check(); trapped.a.checkLegacy(); trapped.a.close(); assert.equal(trapped.s.bodyStarts, 0);
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const typedPin: FixedBodyRoutePin;
declare const typedOrigin: FixedBodyOrigin;
declare const typedShell: BodyPreparationShell;
declare const typedCell: BodyConstructionCell;
const badExecutable: FixedBodyRoutePin = { ...typedPin, executable: true };
const badKind: FixedBodyOrigin = { ...typedOrigin, kind: 'foreign' };
const badReady: BodyPreparationShell = { ...typedShell, ready: true };
const badBind: BodyPreparationShell = { ...typedShell, bindAttemptUsed: true };
const badStage: BodyConstructionCell = { ...typedCell, stage: 'ready' };
const badIndex: BodyConstructionCell = { ...typedCell, index: 14 };
const badBody: FixedBodyRoutePin = { ...typedPin, body: () => 1 };
typedPin.grantSlot = {};
const badSentinel: FixedBodySentinel<'throw'> = { [BODY_SENTINEL]: true, context: typedPin.context, bodyOrigin: typedOrigin, kind: 'cancel' };
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, source + extra, language, true) : getSource(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= source.length), 'unexpected baseline semantic diagnostic');
  assert.equal(new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 9);
  console.log(JSON.stringify({ compiled: true, fieldControls: fields, copyControls: 5, brandControls: 5, extraControls: 5, getterControls: 5,
    shellControls: 2, ownerDomains: true, duplicateRefusal: true, priorRetentionControls: 2, carrierIdentity: true, unusedCarrier: true, referenceLeak: true, rootReady: true, bodyTrap: true, typeRejections: 9,
    recheckControls: recheck.length, freezeControl: true, rejectedIdentity: true, stageAllowlist: true }));
} finally { rmSync(dir, { recursive: true, force: true }); }
