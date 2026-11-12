/** C-b scratch-only owning-entry/legacy-isolation controls. No worker, transport or body runner. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const sf = ts.createSourceFile('entry.ts', source, ts.ScriptTarget.ES2022, true);
const root = sf.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CanonicalGateDraftRoot');
const method = name => root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(sf) === name);
const replace = (s, from, to) => { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); };
const edit = (name, from, to) => replace(source, method(name).getText(sf), replace(method(name).getText(sf), from, to));
const dir = mkdtempSync(join(tmpdir(), 'pin-final-entry-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const file = join(dir, name + '.js'); writeFileSync(file, emit(s)); return import(pathToFileURL(file).href); }
const legacyFields = ['bodyPinConfirmationFixed', 'bodyPinConfirmationStagesFixed', 'bodyPinContractsFixed', 'bodyPinReferenceFixed',
  'bodyPinStorageFixed', 'bodyPinStartFixed', 'bodyPinBridgeFixed', 'bodyPinCallFixed', 'bodySourceFixed', 'bodyFieldsFixed',
  'bodySeedFixed', 'bodyLiveFixed', 'bodyBundleFixed', 'runFixedReply', 'exitFixed'];
const probe = s => replace(s, "return Object.freeze({ model: 'wfb-body-pin-confirmation-1',\n      contract:",
  'return Object.freeze({ cacheObject: this.#fixed, startStep: this.#bodyPinStartStep, legacyCaches: [' + legacyFields.map(f => 'this.#' + f).join(',')
  + "].filter(x => x !== undefined).length, model: 'wfb-body-pin-confirmation-1',\n      contract:");
const failed = (m, script = 'cb_normal') => { const a = m.createProbeBodyPinConfirmationFake(script);
  assert.throws(() => a.prepare(), e => e === 'private_final_delivery_unconfirmed'); return a; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(probe(source), 'base');
  for (const script of ['cb_normal', 'before_1', 'after_37', 'si_proxy', 'si_fault_BP00_fix_2_after', 'pc_close_checked', 'cs_close_confirmed']) {
    const a = base.createProbeBodyPinConfirmationFake(script), r = a.prepare(), s = a.inspect();
    assert.equal(Object.keys(r).length, 10); assert.equal(Object.isFrozen(r), true); assert.equal(r.ok, false);
    assert.equal(s.cacheObject, r); assert.equal(s.legacyCaches, 0); assert.equal(s.contract.phase, 'replayable');
    assert.equal(a.check(), r); assert.equal(a.close(), r); assert.equal(s.contract.finalPost, false);
  }
  // Frame=false alone is not return evidence, and an anomalous frame is never repaired.
  const active = await load(probe(edit('prepare', 'this.#frame = false;', 'this.#frame = this.bodyPinFinalEntry;')), 'active');
  const ac = failed(active); assert.equal(ac.inspect().frame, 'active'); assert.equal(ac.inspect().contract.phase, 'failed_cached');
  const copy = await load(probe(edit('finalEntryInvoke', 'return this.prepare();', 'return { ...this.prepare() };')), 'copy');
  const cp = failed(copy); assert.equal(cp.inspect().contract.phase, 'failed_cached'); assert.ok(cp.inspect().cacheObject);
  const bypassCopy = await load(probe(replace(edit('finalEntryInvoke', 'return this.prepare();', 'return { ...this.prepare() };'),
    '&& result === this.#fixed;', '&& true;')), 'bypass-copy');
  assert.equal(bypassCopy.createProbeBodyPinConfirmationFake().prepare().ok, false);
  const noBusy = await load(probe(edit('finalEntry', 'if (this.#finalPublicEntryBusy) return operation', 'if (false) return operation')), 'no-busy');
  failed(noBusy, 'cb_reenter_cached');
  const original = base.createProbeBodyPinConfirmationFake('cb_reenter_cached'); original.prepare();
  assert.equal(original.inspect().reentry, 'construction_in_progress'); assert.equal(original.inspect().contract.rootEntryExit, 'returned');
  const outer = failed(base, 'cb_root_finally_throw'); const cache = outer.inspect().cacheObject;
  assert.ok(cache); assert.equal(outer.inspect().contract.rootEntryExit, 'threw');
  for (const op of ['prepare', 'check', 'checkLegacy', 'close']) assert.throws(() => outer[op](), e => e === 'private_final_delivery_unconfirmed');
  assert.equal(outer.inspect().cacheObject, cache);
  // A later public read cannot replace the original exit facts.
  const badReplay = await load(probe(edit('finalEntry', "if (this.#finalReplyPhase === 'replayable') {",
    "if (this.#finalReplyPhase === 'replayable') { this.#finalRootEntryExit = 'threw';")), 'bad-replay');
  const br = badReplay.createProbeBodyPinConfirmationFake(); br.prepare();
  assert.throws(() => br.check(), e => e === 'private_final_delivery_unconfirmed');
  assert.equal(br.inspect().contract.phase, 'failed_cached');
  const traceSource = replace(source, "if (this.script === 'cs_close_' + point) this.close();",
    "if (this.script === 'cs_close_' + point) { this.close(); trace.push({ sealed: this.#finalTerminalSealed, cache: this.#fixed !== undefined, attempted: this.#finalReplyAttempted, result: this.#bodyPinCallResult, first: this.#failure.first }); }")
    + '\nexport const trace = [];\n';
  const traced = await load(traceSource, 'active-close'); const tc = traced.createProbeBodyPinConfirmationFake('cs_close_confirmed'); tc.prepare();
  assert.deepEqual(traced.trace, [{ sealed: false, cache: false, attempted: false, result: 'none', first: 'closed' }]);
  assert.equal(tc.inspect().contract.sealed, true); assert.equal(tc.inspect().pipeline.result, 'rejected_attempt');
  // C-b must branch before legacy allocation and must not continue from an uncached early failure.
  const legacyFail = await load(edit('fail', "if (this.bodyPinFinalEntry) { this.finalEntryRecord(reason); return BODY_PIN_FINAL_VIEWS.deferred_frame; }", ''), 'legacy-fail');
  failed(legacyFail, 'before_1');
  const noPrefixStop = await load(probe(edit('prepareBodyPinStart', " || this.bodyPinFinalEntry && this.#failure.first !== 'none'", '')), 'no-prefix-stop');
  const np = noPrefixStop.createProbeBodyPinConfirmationFake('si_proxy'); np.prepare();
  assert.notEqual(np.inspect().startStep, 'none');
  const goodPrefix = base.createProbeBodyPinConfirmationFake('si_proxy'); goodPrefix.prepare();
  assert.equal(goodPrefix.inspect().startStep, 'none');
  // Single-point controls: each publication/replay clause alone refuses one corrupted owning-entry fact.
  const guardControls = [];
  for (const [name, fault] of [['publish-busy', 'this.#finalPublicEntryBusy = false;'], ['publish-exit', "this.#finalRootEntryExit = 'not_observed';"],
    ['publish-phase', "this.#finalReplyPhase = 'materializing';"], ['publish-sealed', 'this.#finalTerminalSealed = false;'],
    ['publish-attempted', 'this.#finalReplyAttempted = false;']]) {
    const anchor = 'if (!this.finalEntryPublishMatches(result)) {';
    const m = await load(probe(edit('finalEntry', anchor, fault + ' ' + anchor)), name);
    const a = failed(m); assert.equal(a.inspect().contract.phase, 'failed_cached', name); assert.ok(a.inspect().cacheObject, name);
    guardControls.push(name);
  }
  for (const [name, fault] of [['replay-busy', 'this.#finalPublicEntryBusy = true;'], ['replay-frame', 'this.#frame = true;'],
    ['replay-sealed', 'this.#finalTerminalSealed = false;'], ['replay-attempted', 'this.#finalReplyAttempted = false;']]) {
    const anchor = 'if (this.finalEntryReplayMatches()) return this.#fixed!;';
    const m = await load(probe(edit('finalEntry', anchor, fault + ' ' + anchor)), name);
    const a = m.createProbeBodyPinConfirmationFake(); const r = a.prepare(); assert.equal(r.ok, false, name);
    assert.throws(() => a.check(), e => e === 'private_final_delivery_unconfirmed', name);
    assert.equal(a.inspect().contract.phase, 'failed_cached', name); assert.equal(a.inspect().contract.deliveryFirst, 'root_exit_unconfirmed', name);
    guardControls.push(name);
  }
  // Explicit writer audit: extension is method- and field-scoped, not a blanket C-a relaxation.
  const writes = []; function walk(n, owner = '') {
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(sf);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) writes.push({ field: n.left.getText(sf), owner, text: n.getText(sf) });
    ts.forEachChild(n, x => walk(x, owner));
  } walk(root);
  const allow = { '#finalPublicEntryBusy': ['finalEntry'], '#finalRootEntryExit': ['finalEntry'], '#finalCompletion': ['prepareBodyPinConfirmationCaller'],
    '#finalTerminalSealed': ['finalContractSeal', 'finalEntryTerminal'], '#finalTerminalDisposition': ['finalContractSeal', 'finalEntryTerminal'],
    '#finalReplyAttempted': ['finalContractMaterialize'], '#finalReplyPhase': ['finalContractMaterialize', 'finalEntry'], '#finalDeliveryFirst': ['finalDelivery'] };
  for (const [field, owners] of Object.entries(allow)) for (const w of writes.filter(w => w.field === 'this.' + field)) assert.ok(owners.includes(w.owner), w.owner + '/' + field);
  assert.equal(writes.filter(w => /^this\.#final(Point|FailurePoint)$/.test(w.field)).length, 0);
  const entry = method('finalEntry'); assert.ok(!entry.body.statements.some(n => ts.isTryStatement(n) && n.finallyBlock));
  const tail = entry.body.statements.slice(-3).map(n => n.getText(sf));
  assert.deepEqual(tail, ['this.#finalPublicEntryBusy = false;', "this.#finalReplyPhase = 'replayable';", 'return this.#fixed!;']);
  for (const [name, marker] of [['fail', 'this.finalEntryRecord(reason)'], ['reply', 'BODY_PIN_FINAL_VIEWS'],
    ['checkBodyBindFields', 'BODY_PIN_FINAL_VIEWS'], ['close', 'this.finalEntryStop()'], ['prepare', 'this.#frame']]) {
    const first = method(name).body.statements[0].getText(sf); assert.ok(first.startsWith('if (this.bodyPinFinalEntry)')); assert.ok(first.includes(marker));
  }
  const extra = `
declare const r: CanonicalGateDraftRoot;
r.finalEntryTerminal();
r.finalEntryPublishMatches({ ok: false, disposition: 'closed' });
r.finalEntryInvoke('prepare');
const invalidOperation: BodyPinFinalOperation = 'accepted';
const unseal = createProbeBodyPinConfirmationFake().inspect().cacheObject;
const capability = createProbeBodyPinConfirmationFake().prepare().source;
`;
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host);
  host.getSourceFile = (n, l, e, f) => n === file ? ts.createSourceFile(n, source + extra, l, true) : get(n, l, e, f);
  const ds = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(ds.every(d => d.file?.fileName === file && d.start >= source.length));
  assert.equal(new Set(ds.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 6);
  console.log(JSON.stringify({ compiled: true, terminalIsolation: 7, activeCloseUnsealed: true, fixedPublicationGroup: true,
    semanticRejections: 6, finalPostWriters: 0, bodyStarts: 0, guardControls }));
} finally { rmSync(dir, { recursive: true, force: true }); }
