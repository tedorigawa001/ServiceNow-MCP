/** C-c scratch-only final-post, primitive-return and closed-cache controls. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-final-post-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const replace = (s, a, b) => { assert.equal(s.split(a).length, 2, 'unique anchor: ' + a); return s.replace(a, b); };
function edit(s, name, a, b, owner = 'CanonicalGateDraftRoot', priv = true) {
  const start = s.indexOf('  ' + (priv ? 'private ' : '') + name + '(', s.indexOf('class ' + owner));
  const end = s.indexOf('\n  }\n', start) + 5; assert.ok(start >= 0 && end > start);
  return s.slice(0, start) + replace(s.slice(start, end), a, b) + s.slice(end);
}
const event = '    probeBodyPinRootAccess.confirmationFinalEvent(root, source, this);';
const at = code => edit(source, 'completeBodyPinFinalPost', event, event + '\n    ' + code, 'RetirementStartAssembly');
const rootAt = code => edit(source, 'bodyPinFinalPostPoint', "    this.#finalPoint = 'final_post_before';", "    this.#finalPoint = 'final_post_before';\n    " + code);
async function load(s, name) { const p = join(dir, name + '.js'); writeFileSync(p, emit(s)); return import(pathToFileURL(p).href); }
const run = (m, script) => { const a = m.createProbeBodyPinFinalPostFake(...(script ? [script] : [])); let r, thrown;
  try { r = a.prepare(); } catch (e) { thrown = e; } return { a, r, s: a.inspect(), thrown }; };
const publicProbe = s => replace(s, "return Object.freeze({ model: 'wfb-body-pin-confirmation-1',\n      contract:",
  "return Object.freeze({ cacheObject: this.#fixed, sourceRetained: this.#bodySourceIssued !== undefined, model: 'wfb-body-pin-confirmation-1',\n      contract:");
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(publicProbe(source), 'base'), normal = run(base);
  assert.equal(normal.r.disposition, 'pin_return_not_connected'); assert.equal(normal.s.contract.finalPost, true);
  assert.equal(normal.s.contract.acceptedReturns, 1); assert.equal(normal.s.pipeline.build.receiver.first, 'none');
  assert.equal(normal.s.cacheObject, normal.r); assert.equal(Object.isFrozen(normal.r), true); assert.equal(Object.keys(normal.r).length, 10);
  assert.equal(normal.a.close(), normal.r); assert.equal(normal.a.inspect().pipeline.build.receiver.first, 'none');
  let fieldCases = 0;
  const fields = [
    ['issued', 'this.#bodyExpectedSourceIssued = {} as never;', 'binding_mismatch'],
    ['current', 'this.#bodyExpectedSourceCurrent = { ...source };', 'binding_mismatch'],
    ['missing', 'this.#bodyExpectedSourceCurrent = undefined;', 'state_invalid'],
    ['rejected', 'this.#bodyExpectedSourceRejected = {} as never;', 'state_invalid'],
    ['stage', "this.#bodyPinStage = 'captured';", 'state_invalid'], ['step', "this.#bodyPinStep = 'checked';", 'state_invalid'],
    ['busy', 'this.#bodyPinEntryBusy = false;', 'state_invalid'], ['marker', 'this.#bodyPinFinalPostChecked = true;', 'state_invalid'],
    ['checked-post', 'this.#bodyPinCheckedPostChecked = false;', 'state_invalid'],
    ['confirmed-post', 'this.#bodyPinConfirmedPostChecked = false;', 'state_invalid'],
    ['reference-post', 'this.#bodyPinReferencePostChecked = false;', 'state_invalid'],
    ['hold', "this.#bodyPinRejectedHold = 'confirmed';", 'state_invalid'],
    ['payload', 'this.#bodyBundleCurrent = {} as never;', 'state_invalid'],
    ['first', "this.#bodyBindFirst = 'state_invalid';", 'state_invalid'],
    ['duty', 'this.#runDuty = {} as never;', 'state_invalid'],
  ];
  for (const [name, code, first] of fields) {
    const x = run(await load(at(code), 'field-' + name));
    assert.equal(x.r?.first, first, name); assert.equal(x.s.contract.acceptedReturns, 0, name);
    assert.equal(x.s.contract.finalPost, name === 'marker', 'no marker repair: ' + name);
    assert.equal(x.s.pipeline.build.source.claim, 'unused'); assert.equal(x.s.contract.bodyStarts, 0); fieldCases++;
  }
  // Root history belongs to this exact invocation; valid-looking stage values are insufficient.
  const rootFields = [
    ['prepared', 'this.#bodyPinConfirmationPrepared = false;'], ['stages', 'this.#bodyPinConfirmationStagesChecked = false;'],
    ['source-reason', "this.#bodyPinCallSourceReason = 'state_invalid';"], ['recorded', 'this.#bodyPinConfirmationDiagnosticRecorded = true;'],
    ['classification', "this.#bodyPinConfirmationClassification = 'unreturned';"], ['failure-point', "this.#finalFailurePoint = 'final_post_before';"],
    ['disposition', "this.#finalTerminalDisposition = 'closed';"], ['phase', "this.#finalReplyPhase = 'materializing';"],
  ];
  for (const [name, code] of rootFields) {
    const x = run(await load(rootAt(code), 'root-' + name)); assert.equal(x.s.contract.finalPost, false, name); fieldCases++;
  }
  const malformed = at("this.#bodyPinStep = 'none';");
  const bad = run(await load(malformed, 'guard-original'));
  const bypass = run(await load(replace(malformed, 'if (!probeBodyPinRootAccess.confirmationFinalCheck(root, source, this))', 'if (false)'), 'guard-bypass'));
  assert.equal(bad.s.contract.finalPost, false); assert.equal(bypass.r.disposition, 'pin_return_not_connected');
  assert.equal(bypass.s.contract.finalPost, true); assert.equal(bypass.s.pipeline.build.receiver.first, 'none');
  // A forged value view cannot substitute for the actual issued/current pair.
  const view = 'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => a.bodyPinValues(source),';
  const forged = replace(at('this.#bodyExpectedSourceCurrent = { ...source };'), view,
    'bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => { const v = a.bodyPinValues(source); return v.stage === "confirmed" ? { ...v, currentSame: true } : v; },');
  assert.equal(run(await load(forged, 'forged-view')).r.first, 'binding_mismatch');
  const rawBypass = edit(forged, 'bodyPinFinalPostMatches', '&& probeStartAccess.bodyPinConfirmationReferences(start, source)', '&& true');
  assert.equal(run(await load(rawBypass, 'raw-bypass')).r.disposition, 'pin_return_not_connected');
  // Unknown current is never reflected/read, even on the later diagnostic/projection path.
  const hostile = rootAt('this.#bodySourceCurrent = new Proxy(source, { get() { hooks++; throw "secret"; }, ownKeys() { hooks++; throw "secret"; }, getPrototypeOf() { hooks++; throw "secret"; } });')
    + '\nexport let hooks = 0;\n';
  const hm = await load(hostile, 'hostile'), hx = run(hm); assert.equal(hx.r.first, 'binding_mismatch'); assert.equal(hm.hooks, 0);
  // marker=true never fills in a missing primitive or repairs an unfinished receiver finally.
  const lost = edit(source, 'dispatchBodyPin', '      return probeStartAccess.bodyPinEnter(start, this, source);',
    '      probeStartAccess.bodyPinEnter(start, this, source); throw "private_return_lost";');
  const lx = run(await load(lost, 'lost')); assert.equal(lx.r.disposition, 'construction_unconfirmed');
  assert.equal(lx.s.contract.finalPost, true); assert.equal(lx.s.contract.acceptedReturns, 0); assert.equal(lx.s.contract.completion, 'unreturned');
  assert.equal(lx.s.contract.failurePoint, 'none'); assert.equal(lx.s.pipeline.route.failureBoundary, 'before');
  const stuck = edit(source, 'bodyPinReceiverEntry', 'this.#bodyPinEntryBusy = false;', 'throw "private_receiver_finally";', 'RetirementStartAssembly');
  const sx = run(await load(stuck, 'stuck')); assert.equal(sx.s.contract.finalPost, true); assert.equal(sx.s.pipeline.entryBusy, true);
  assert.equal(sx.s.contract.completion, 'unreturned'); assert.equal(sx.s.pipeline.result, 'none');
  const noMarker = edit(source, 'completeBodyPinFinalPost', 'this.#bodyPinFinalPostChecked = true;', '', 'RetirementStartAssembly');
  const nm = run(await load(noMarker, 'no-marker')); assert.equal(nm.r.first, 'state_invalid'); assert.equal(nm.s.contract.acceptedReturns, 1);
  // A literal accepted without the real marker is not an observed completion.
  assert.equal(nm.s.contract.completion, 'inconsistent'); assert.equal(nm.s.contract.finalPost, false);
  const twice = edit(source, 'prepareBodyPinFinalCaller', '    const sameStart =', '    this.#bodyPinFixedCalls = 2;\n    const sameStart =');
  const tx = run(await load(twice, 'twice')); assert.equal(tx.r.first, 'state_invalid'); assert.equal(tx.s.contract.failurePoint, 'none');
  // The marker stays a fact, but an accepted return is counted only for the single real call.
  assert.equal(tx.s.contract.finalPost, true); assert.equal(tx.s.contract.acceptedReturns, 0); assert.equal(tx.s.contract.completion, 'inconsistent');
  // A root close flag alone, observed only after the callee completed, still owns the caller's first reason.
  const closedOnly = edit(source, 'prepareBodyPinFinalCaller', '    const sameStart =', '    this.#closed = true;\n    const sameStart =');
  const co = run(await load(closedOnly, 'closed-only')); assert.equal(co.r.first, 'closed'); assert.equal(co.r.disposition, 'closed');
  assert.equal(co.s.contract.finalPost, true); assert.equal(co.s.contract.acceptedReturns, 1); assert.equal(co.s.contract.completion, 'completion_observed');
  const outer = run(base, 'cb_root_finally_throw'); assert.equal(outer.thrown, 'private_final_delivery_unconfirmed');
  assert.equal(outer.s.contract.phase, 'failed_cached'); assert.equal(outer.s.contract.finalPost, true); assert.equal(outer.s.contract.acceptedReturns, 1);
  assert.ok(outer.s.cacheObject); assert.equal(outer.s.cacheObject.disposition, 'pin_return_not_connected');
  for (const op of ['prepare', 'check', 'checkLegacy', 'close']) assert.throws(() => outer.a[op](), e => e === 'private_final_delivery_unconfirmed');
  assert.equal(outer.a.inspect().cacheObject, outer.s.cacheObject); assert.equal(outer.a.inspect().sourceRetained, true);
  // Close inside final-post observation records before, but does not seal or allocate the terminal early.
  const closeTrace = edit(source, 'bodyPinFinalPostPoint', "if (this.script === 'cc_close_final_post_before') this.close();",
    "if (this.script === 'cc_close_final_post_before') { this.close(); trace.push([this.#finalTerminalSealed, this.#finalReplyAttempted, this.#fixed !== undefined, this.#bodyPinCallResult, this.#bodyPinFailureBoundary]); }") + '\nexport const trace = [];\n';
  const cm = await load(closeTrace, 'close-trace'); run(cm, 'cc_close_final_post_before');
  assert.deepEqual(cm.trace, [[false, false, false, 'none', 'before']]);
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
  const cls = name => ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === name);
  const method = (owner, name) => cls(owner).members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
  const complete = method('RetirementStartAssembly', 'completeBodyPinFinalPost');
  assert.deepEqual(complete.body.statements.slice(-3).map(n => n.getText(ast)), ["this.#bodyPinStorageBoundary = 'after';", 'this.#bodyPinFinalPostChecked = true;', "return 'accepted';"]);
  assert.ok(method('RetirementStartAssembly', 'advanceBodyPinConfirmationStages').body.statements.some(n =>
    n.getText(ast) === 'if (probeBodyPinRootAccess.confirmationFinalMode(root, source, this)) return this.completeBodyPinFinalPost(root, source);'));
  assert.ok(source.includes('root.bodyPinFinalPost === true && root.bodyPinFinalEntry === true && root.bodyPinBridgeIdentity(source, start)'));
  const recordBranch = method('CanonicalGateDraftRoot', 'finalEntryRecord').body.statements[1];
  assert.equal(recordBranch.expression.getText(ast), "this.bodyPinFinalPost && this.#finalPoint === 'final_post_before' && this.#bodyPinCallActive === true");
  for (const [owner, name, assignment] of [['RetirementStartAssembly', 'bodyPinReceiverEntry', 'this.#bodyPinEntryBusy = false;'],
    ['CanonicalGateDraftRoot', 'dispatchBodyPin', 'this.#bodyPinCallActive = false;']]) {
    const f = method(owner, name).body.statements.find(ts.isTryStatement).finallyBlock;
    assert.deepEqual(f.statements.map(n => n.getText(ast)), [assignment]);
  }
  const caller = method('CanonicalGateDraftRoot', 'prepareBodyPinFinalCaller');
  const permitted = new Set(['probeStartAccess.bodyPinReceiverFirst', 'probeStartAccess.bodyPinFinalPostChecked', 'bodyPinCallerClassification', 'this.recordBodyPinConfirmationFailure']);
  function primitive(n) {
    assert.ok(!ts.isNewExpression(n) && !ts.isObjectLiteralExpression(n) && !ts.isArrayLiteralExpression(n) && !ts.isAwaitExpression(n) && !ts.isTemplateExpression(n));
    if (ts.isCallExpression(n)) assert.ok(permitted.has(n.expression.getText(ast)), n.expression.getText(ast));
    ts.forEachChild(n, primitive);
  } primitive(caller.body);
  assert.deepEqual(caller.body.statements.slice(-2).map(n => n.getText(ast)), ['this.#finalTerminalSealed = true;', 'return BODY_PIN_FINAL_VIEWS.deferred_frame;']);
  let markerWrites = 0; function writes(n, owner = '') {
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) && ts.isPropertyAccessExpression(n.left)
      && n.left.name.getText(ast) === '#bodyPinFinalPostChecked') { assert.equal(owner, 'completeBodyPinFinalPost'); assert.equal(n.right.getText(ast), 'true'); markerWrites++; }
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind) && ts.isPropertyAccessExpression(n.left)) {
      const f = n.left.name.getText(ast);
      if (f === '#finalPoint') assert.equal(owner, 'bodyPinFinalPostPoint');
      if (f === '#finalFailurePoint') assert.ok(['finalEntryRecord', 'prepareBodyPinFinalCaller'].includes(owner));
      if (f === '#finalPoint' || f === '#finalFailurePoint') assert.equal(n.right.getText(ast), "'final_post_before'");
    }
    ts.forEachChild(n, c => writes(c, owner));
  } writes(ast); assert.equal(markerWrites, 1);
  const extra = `
declare const r: CanonicalGateDraftRoot;
declare const t: RetirementStartAssembly;
r.bodyPinFinalPostMatches({},t);
r.bodyPinFinalPostPoint({},t);
r.prepareBodyPinFinalCaller({},t);
t.completeBodyPinFinalPost(r,{});
t.#bodyPinFinalPostChecked = true;
const invalidPoint: BodyPinFinalPoint = 'post_returning';
const proof = createProbeBodyPinFinalPostFake().inspect().source;
const badOperation: BodyPinFinalOperation = 'accepted';
`;
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const opts = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(opts), get = host.getSourceFile.bind(host);
  host.getSourceFile = (n,l,e,f) => n === file ? ts.createSourceFile(n, source + extra, l, true) : get(n,l,e,f);
  const ds = ts.getPreEmitDiagnostics(ts.createProgram([file],opts,host)); assert.ok(ds.every(d => d.file?.fileName === file && d.start >= source.length));
  assert.equal(new Set(ds.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 8);
  console.log(JSON.stringify({ compiled: true, fieldCases, markerWrites, fixedPrimitiveGroup: true, semanticRejections: 8, callerControls: 3,
    lostReturn: true, stuckReceiver: true, rawReferenceControl: true, singleCache: true, bodyStarts: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
