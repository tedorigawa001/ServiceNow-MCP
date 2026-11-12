/** C-a scratch-only structural, mutation and semantic controls. No runtime/network/native calls. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-final-contracts-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const sf = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.ES2022, true);
const root = sf.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CanonicalGateDraftRoot');
const method = name => root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(sf) === name);
const replace = (s, from, to) => { assert.equal(s.split(from).length, 2, 'unique anchor'); return s.replace(from, to); };
const edit = (name, from, to) => replace(source, method(name).getText(sf), replace(method(name).getText(sf), from, to));
async function load(s, name) {
  const p = join(dir, name + '.js'); writeFileSync(p, emit(s)); return import(pathToFileURL(p).href);
}
const viewInjection = s => replace(s, "return Object.freeze({ model: 'wfb-body-pin-final-contracts-1',", "return Object.freeze({ cacheObject: this.#fixed, model: 'wfb-body-pin-final-contracts-1',");
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel']) {
    writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  }
  const base = await load(viewInjection(source), 'base');
  const a = base.createProbeBodyPinFinalContractsFake(); a.close(); a.materialize();
  const cache = a.inspect().cacheObject;
  assert.deepEqual(Object.keys(cache), ['model', 'ok', 'disposition', 'first', 'authority', 'execution', 'formalIssuance',
    'wholeRunAdmission', 'implementation', 'investigations']);
  assert.equal(Object.isFrozen(cache), true); assert.equal(Object.getPrototypeOf(cache), Object.prototype);
  assert.equal(cache.first, 'none'); assert.equal(cache.disposition, 'closed'); assert.equal(cache.ok, false);
  for (let i = 0; i < 3; i++) {
    a.check('secret'); a.seal(); a.close(); a.materialize();
    assert.equal(a.publish(), 'publication_not_connected'); assert.equal(a.inspect().cacheObject, cache);
    assert.equal(a.inspect().first, 'none');
  }
  const other = base.createProbeBodyPinFinalContractsFake(); other.close(); other.materialize();
  assert.notEqual(other.inspect().cacheObject, cache); assert.deepEqual(other.inspect().cacheObject, cache);
  // Removing each guard changes an observable fact, not just a final fixed refusal.
  const noSeal = await load(viewInjection(edit('finalContractSeal', "if (this.#finalTerminalSealed) return 'already_sealed';", '')), 'no-seal');
  const ns = noSeal.createProbeBodyPinFinalContractsFake(); ns.close(); ns.materialize(); ns.seal();
  assert.notEqual(ns.inspect().first, 'none'); assert.equal(ns.inspect().cacheObject.first, 'none');
  const noClaim = await load(viewInjection(edit('finalContractMaterialize', 'if (this.#finalReplyAttempted) {', 'if (false) {')), 'no-claim');
  const nc = noClaim.createProbeBodyPinFinalContractsFake(); nc.seal(); nc.materialize(); const c1 = nc.inspect().cacheObject;
  nc.materialize(); assert.notEqual(nc.inspect().cacheObject, c1);
  const noPre = await load(edit('finalContractMaterialize', "if (!this.#finalTerminalSealed || this.#finalTerminalDisposition === 'none') return 'not_ready';", ''), 'no-pre');
  const np = noPre.createProbeBodyPinFinalContractsFake(); np.materialize(); assert.equal(np.inspect().cacheValid, false);
  const noDelivery = await load(edit('finalDelivery', "if (this.#finalDeliveryFirst === 'none') this.#finalDeliveryFirst = reason;", 'this.#finalDeliveryFirst = reason;'), 'no-delivery');
  const nd = noDelivery.createProbeBodyPinFinalContractsFake('ca_freeze_throw'); nd.seal(); nd.materialize(); nd.check('late');
  assert.equal(nd.inspect().deliveryFirst, 'input_refused');
  const after = base.createProbeBodyPinFinalContractsFake('ca_after_cache_throw'); after.seal(); after.materialize();
  const held = after.inspect().cacheObject; assert.ok(held); after.materialize(); after.close();
  assert.equal(after.inspect().cacheObject, held); assert.equal(after.inspect().phase, 'failed_cached');
  const drop = await load(viewInjection(edit('finalContractMaterialize', '} catch {', '} catch { this.#fixed = undefined;')), 'drop');
  const dropped = drop.createProbeBodyPinFinalContractsFake('ca_after_cache_throw'); dropped.seal(); dropped.materialize();
  assert.equal(dropped.inspect().cacheObject, undefined); assert.equal(dropped.inspect().phase, 'failed_empty');
  const freezeThrow = await load(edit('finalContractMaterialize', 'Object.freeze(candidate);', 'throw "injected_freeze_failure";'), 'freeze-throw');
  const ft = freezeThrow.createProbeBodyPinFinalContractsFake(); ft.seal(); ft.materialize();
  assert.equal(ft.inspect().phase, 'failed_empty'); assert.equal(ft.inspect().first, 'construction_unconfirmed');
  // Full finite state contract is value-only. No positive exit/publication writer is added.
  const values = await load(source + '\nexport const testCacheState = bodyPinFinalCacheMatches;\n', 'values');
  let valueControls = 0;
  for (const phase of ['empty', 'materializing', 'failed_empty', 'private_cached', 'replayable', 'failed_cached', 'unknown']) {
    for (const retained of [false, true]) for (const attempted of [false, true]) for (const sealed of [false, true]) {
      for (const busy of [false, true]) for (const exit of ['not_observed', 'returned', 'threw']) for (const frame of [false, true]) {
        const structural = phase === 'empty' ? !retained && !attempted
          : ['materializing', 'failed_empty'].includes(phase) ? sealed && attempted && !retained
          : ['private_cached', 'failed_cached', 'replayable'].includes(phase) && sealed && attempted && retained;
        const expected = structural && (phase !== 'replayable' || (!busy && exit === 'returned' && !frame));
        assert.equal(values.testCacheState({ phase, retained, attempted }, sealed, busy, exit, frame), expected);
        valueControls++;
      }
    }
  }
  for (const bad of [{ phase: 'empty', retained: 0, attempted: false }, { phase: 'empty', retained: false, attempted: false, extra: 1 }]) {
    assert.equal(values.testCacheState(bad, false, false, 'not_observed', false), false);
  }
  assert.equal(values.testCacheState({ phase: 'replayable', retained: true, attempted: true }, true, false, 'foreign_returned', false), false);
  // AST: the sole C cache writer and G_C adjacency; no replayable/exit/marker or legacy-routing write.
  const assignments = []; const visit = n => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) assignments.push(n);
    ts.forEachChild(n, visit);
  }; visit(method('finalContractMaterialize'));
  assert.equal(assignments.filter(n => n.left.getText(sf) === 'this.#fixed').length, 1);
  const statements = method('finalContractMaterialize').body.statements.find(ts.isTryStatement).tryBlock.statements;
  const i = statements.findIndex(n => n.getText(sf) === 'this.#fixed = candidate;');
  assert.ok(i > 0); assert.equal(statements[i - 1].getText(sf), 'Object.freeze(candidate);');
  assert.equal(statements[i + 1].getText(sf), "this.#finalReplyPhase = 'private_cached';");
  assert.equal(method('finalContractPublish').body.statements.length, 1);
  assert.equal(method('finalContractPublish').body.statements[0].getText(sf), "return 'publication_not_connected';");
  const ctor = root.members.find(ts.isConstructorDeclaration);
  for (const name of ['#finalTerminalSealed', '#finalTerminalDisposition', '#finalReplyPhase', '#finalReplyAttempted',
    '#finalPublicEntryBusy', '#finalRootEntryExit', '#finalDeliveryFirst', '#finalPoint', '#finalFailurePoint', '#finalCompletion']) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(sf) === name);
    assert.ok(f && f.end <= ctor.pos && f.initializer, 'prior scalar: ' + name);
  }
  const ca = root.members.filter(n => ts.isMethodDeclaration(n) && /^(finalContract|finalDelivery|inspectFinalContracts)/.test(n.name.getText(sf)));
  for (const n of ca) assert.doesNotMatch(n.getText(sf), /this\.(prepare|close|fail|reply|bodyPinConfirmationStagesReply)\(/);
  const wholeAssignments = []; const walk = n => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) wholeAssignments.push(n.getText(sf));
    ts.forEachChild(n, walk);
  }; walk(root);
  assert.equal(wholeAssignments.filter(x => /^this\.#final(PublicEntryBusy|RootEntryExit|Point|FailurePoint|Completion) =/.test(x)).length, 0);
  assert.equal(wholeAssignments.filter(x => x === "this.#finalReplyPhase = 'replayable'").length, 0);
  const factory = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'createProbeBodyPinFinalContractsFake');
  const news = []; const findNew = n => { if (ts.isNewExpression(n)) news.push(n); ts.forEachChild(n, findNew); }; findNew(factory);
  assert.equal(news.length, 1); assert.equal(news[0].expression.getText(sf), 'CanonicalGateDraftRoot');
  assert.ok(news[0].arguments.slice(2, -1).every(n => n.kind === ts.SyntaxKind.FalseKeyword));
  assert.equal(news[0].arguments.at(-1).kind, ts.SyntaxKind.TrueKeyword);
  assert.doesNotMatch(factory.getText(sf), /a\.(prepare|close|fail|reply|rejectInput)\(/);
  // Semantic compile-fail controls, each separate line, never emitted or executed.
  const extra = `
declare const r: CanonicalGateDraftRoot;
const invalidCache: BodyPinFinalCacheState = { phase: 'private_cached', retained: false, attempted: true };
const invalidAttempt: BodyPinFinalCacheState = { phase: 'empty', retained: false, attempted: true };
const invalidPhase: BodyPinFinalCacheState = { phase: 'published', retained: true, attempted: true };
const invalidPoint: BodyPinFinalPoint = 'post_returning';
const invalidCompletion: BodyPinFinalCompletion = 'accepted';
const invalidDelivery: BodyPinFinalDelivery = 'secret';
const invalidDisposition: BodyPinFinalDisposition = 'not_ready';
r.#fixed;
r.#finalTerminalSealed = false;
r.#finalReplyPhase = 'replayable';
const leak = createProbeBodyPinFinalContractsFake().inspect().cacheObject;
const capability = createProbeBodyPinFinalContractsFake().publish().source;
`;
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const opts = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(opts), original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lang, err, fresh) => name === file ? ts.createSourceFile(name, source + extra, lang, true) : original(name, lang, err, fresh);
  const ds = ts.getPreEmitDiagnostics(ts.createProgram([file], opts, host));
  assert.ok(ds.every(d => d.file?.fileName === file && d.start >= source.length), 'no baseline diagnostics');
  assert.equal(new Set(ds.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 12);
  // Public projection is a finite allowlist: corrupted private values never echo and booleans stay strict.
  const anchor = "    return Object.freeze({ model: 'wfb-body-pin-final-contracts-1',";
  const enumFields = [['#failure.first', 'first'], ['#finalTerminalDisposition', 'disposition'], ['#finalReplyPhase', 'phase'],
    ['#finalRootEntryExit', 'rootEntryExit'], ['#finalDeliveryFirst', 'deliveryFirst'], ['#finalPoint', 'currentPoint'],
    ['#finalFailurePoint', 'failurePoint'], ['#finalCompletion', 'completion']];
  const boolFields = [['#finalTerminalSealed', 'sealed'], ['#finalPublicEntryBusy', 'publicEntryBusy'], ['#closed', 'stopped']];
  let projectionControls = 0;
  for (const [field, key] of [...enumFields, ...boolFields]) {
    const bad = boolFields.some(([f]) => f === field) ? "'private_truthy'" : "'private_secret'";
    const m = await load(edit('inspectFinalContracts', anchor, `    this.${field} = ${bad} as never;\n` + anchor), 'projection-' + key);
    const view = m.createProbeBodyPinFinalContractsFake().inspect();
    assert.equal(view[key], boolFields.some(([f]) => f === field) ? false : 'unconfirmed', key);
    assert.ok(!JSON.stringify(view).includes('private_'), key + ' echo'); projectionControls++;
  }
  console.log(JSON.stringify({ compiled: true, projectionControls, mutationControls: 6, valueControls, typeRejections: 12,
    singleCache: true, publicationWriters: 0, finalPostWriters: 0, bodyStarts: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
