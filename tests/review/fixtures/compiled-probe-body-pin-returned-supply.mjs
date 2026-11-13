/** Scratch-only private read boundary; never installs a returned writer or admission. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-returned-supply-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const anchor = '    this.recordBodyPinConfirmationFailure(reason, sourceReason, trusted ? source : undefined);\n    this.#finalTerminalDisposition';
const replace = (s, a, b) => { assert.equal(s.split(a).length, 2, a); return s.replace(a, b); };
async function load(code, name) {
  const p = join(dir, name + '.js'); writeFileSync(p, emit(code)); return import(pathToFileURL(p).href);
}
const instrument = code => replace(source, anchor, code + '\n' + anchor)
  + '\nexport let captured: unknown;\nexport let hooks = 0;\n';
const run = m => { const a = m.createProbeBodyPinFinalPostFake(); const r = a.prepare(); return { a, r, v: m.captured }; };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const normal = run(await load(instrument('    captured = this.bodyPinReturnedInput(this, source, start);'), 'normal'));
  assert.ok(normal.v, 'private supply must read the canonical live returned prefix');
  assert.deepEqual(normal.v.state, { phase: 'not_started', point: 'none', postChecked: false, failurePoint: 'none' });
  assert.equal(normal.v.root.result, 'accepted'); assert.equal(normal.v.root.routeStep, 'call');
  assert.equal(normal.v.root.routeBoundary, 'after'); assert.equal(normal.v.source.boundary, 'call');
  assert.equal(normal.v.receiver.issuedSame, true); assert.equal(normal.v.receiver.currentSame, true);
  assert.equal(normal.v.callee.finalPost, true); assert.equal(normal.v.root.frameActive, true);
  assert.equal(normal.v.root.callActive, false); assert.equal(normal.v.root.entryBusy, false);
  assert.equal(normal.r.disposition, 'pin_return_not_connected');
  assert.equal(normal.a.inspect().pipeline.build.source.claim, 'unused');
  const expected = {
    state: { phase: 'not_started', postChecked: false, point: 'none', failurePoint: 'none' },
    source: { state: 'initializing', claim: 'unused', pinCallReached: true, bindCallReached: false, postConfirmed: false,
      stopRequested: false, phase: 'BP03', boundary: 'call', first: 'none', failurePhase: 'none', failureBoundary: 'none', refusal: 'none', deliveryFirst: 'none' },
    receiver: { attemptUsed: true, stage: 'confirmed', issued: true, current: true, rejected: false, issuedSame: true, currentSame: true,
      step: 'confirmed', failureStep: 'none', first: 'none', failurePhase: 'none', failurePrefix: 'none', failureBoundary: 'none', refusal: 'none' },
    root: { stopped: false, first: 'none', frameActive: true, ready: false, publicBusy: true, rootExit: 'not_observed', calls: 1,
      result: 'accepted', callPhase: 'returned', callActive: false, entryBusy: false, classification: 'completed_value_only', completion: 'completion_observed',
      routeAttempted: true, routeState: 'running', routePhase: 'BP03', routeStep: 'call', routeBoundary: 'after', failureRecorded: false,
      sourceReason: 'none', diagnosticRecorded: false, preparingConfirmed: false, pinPostChecked: false, terminalSealed: false,
      replyAttempted: false, replyPhase: 'empty', terminalDisposition: 'none', cacheRetained: false, finalFailurePoint: 'none', prepared: true, stagesChecked: true },
    callee: { boundary: 'after', hold: 'not_started', referencePost: true, checkedPost: true, confirmedPost: true, finalPost: true },
  };
  assert.deepEqual(normal.v, expected); // Independent literal oracle, never imported from the implementation tables.
  const roots = [
    ['bodyPinReturnedPhase', "'checking'"], ['bodyPinReturnedPostChecked', 'true'], ['bodyPinReturnedPoint', "'pre'"], ['bodyPinReturnedFailurePoint', "'pre'"],
    ['closed', 'true'], ['bodySourceStopRequested', 'true'], ['frame', 'false'], ['ready', 'true'], ['finalPublicEntryBusy', 'false'],
    ['finalRootEntryExit', "'returned'"], ['bodyPinFixedCalls', '2'], ['bodyPinCallResult', "'none'"], ['bodyPinCallPhase', "'calling'"],
    ['bodyPinCallActive', 'true'], ['bodyPinConfirmationClassification', "'unreturned'"], ['finalCompletion', "'inconsistent'"],
    ['bodyPinRouteAttempted', 'false'], ['bodyPinRouteState', "'failed'"], ['bodyPinRoutePhase', "'BP04'"], ['bodyPinRouteStep', "'returned'"],
    ['bodyPinRouteBoundary', "'before'"], ['bodyPinFailureRecorded', 'true'], ['bodyPinCallSourceReason', "'closed'"],
    ['bodyPinConfirmationDiagnosticRecorded', 'true'], ['bodyPinPreparingConfirmed', 'true'], ['bodyPinPostChecked', 'true'],
    ['finalTerminalSealed', 'true'], ['finalReplyAttempted', 'true'], ['finalReplyPhase', "'materializing'"],
    ['finalTerminalDisposition', "'closed'"], ['fixed', '{} as never'], ['finalFailurePoint', "'final_post_before'"],
    ['bodyPinConfirmationPrepared', 'false'], ['bodyPinConfirmationStagesChecked', 'false'],
    ['bodySourceBuildPhase', "'BP00'"], ['bodySourceBuildStep', "'checked'"], ['bodySourceBuildBoundary', "'before'"],
    ['bodySourceMetadataConfirmed', 'false'], ['bodySourceMetadataFixedCount', '8'], ['bodySourceBuildStage', "'captured'"],
  ];
  const supply = 'this.bodyPinReturnedInput(this, source, start)';
  const rootCode = roots.map(([field, value]) => `case '${field}': { const old = this.#${field}; this.#${field} = ${value};
    try { captured = ${supply}; } finally { this.#${field} = old; } break; }`).join('\n');
  const rootModule = await load(instrument(`    switch (fault) { ${rootCode} }`)
    + '\nexport let fault = ""; export function select(v: string) { fault = v; captured = undefined; }\n', 'root-fields');
  for (const [field] of roots) {
    rootModule.select(field); const x = run(rootModule);
    assert.ok(x.v === undefined || JSON.stringify(x.v) !== JSON.stringify(expected), 'real field lost: ' + field);
    assert.deepEqual(x.r, normal.r); // Temporary scratch fault restored; the owning caller has not been changed.
  }
  const sourceCode = Object.entries(expected.source).map(([key, old]) => {
    const value = typeof old === 'boolean' ? !old : 'private_secret';
    return `case '${key}': { const old = source.${key}; source.${key} = ${JSON.stringify(value)} as never;
      try { captured = ${supply}; } finally { source.${key} = old; } break; }`;
  }).join('\n');
  const sm = await load(instrument(`    switch (fault) { ${sourceCode} }`)
    + '\nexport let fault = ""; export function select(v: string) { fault = v; captured = undefined; }\n', 'source-fields');
  for (const key of Object.keys(expected.source)) {
    sm.select(key); const x = run(sm);
    if (['first', 'stopRequested'].includes(key)) assert.equal(x.v, undefined, key);
    else { assert.ok(x.v); assert.notDeepEqual(x.v.source[key], expected.source[key], key); }
    assert.deepEqual(x.r, normal.r);
  }
  const receiverFields = ['bodyPinAttemptUsed', 'bodyPinStage', 'bodyExpectedSourceIssued', 'bodyExpectedSourceCurrent', 'bodyExpectedSourceRejected',
    'bodyPinStep', 'bodyPinFailureStep', 'bodyBindFirst', 'bodyBindFailurePhase', 'bodyBindFailurePrefix', 'bodyBindFailureBoundary', 'bodyBindRefusal',
    'bodyPinEntryBusy', 'bodyPinStorageBoundary', 'bodyPinRejectedHold', 'bodyPinReferencePostChecked', 'bodyPinCheckedPostChecked',
    'bodyPinConfirmedPostChecked', 'bodyPinFinalPostChecked', 'bodyBundleCurrent'];
  const tc = receiverFields.map(field => `case '${field}': if (restore) a.#${field} = old; else { old = a.#${field};
    a.#${field} = typeof old === 'boolean' ? !old : typeof old === 'string' ? 'private_secret' as never : {} as never; } break;`).join('\n');
  const accessor = '      bodyPinValues: (a: RetirementStartAssembly, source: BodyBindSourceShell) => a.bodyPinValues(source),';
  const tm = await load(replace(instrument(`    probeStartAccess.scratchFault(start, false);
    try { captured = ${supply}; } finally { probeStartAccess.scratchFault(start, true); }`), accessor,
    accessor + `\n      scratchFault: (a: RetirementStartAssembly, restore: boolean) => { switch (fault) { ${tc} } },`)
    + '\nlet old: unknown; export let fault = ""; export function select(v: string) { fault = v; captured = undefined; }\n', 'receiver-fields');
  // Identity, receiver-first and payload slots are qualification gates; a changed view is not enough there.
  const receiverGated = ['bodyExpectedSourceIssued', 'bodyExpectedSourceCurrent', 'bodyExpectedSourceRejected', 'bodyBindFirst', 'bodyBundleCurrent'];
  for (const field of receiverFields) {
    tm.select(field); const x = run(tm);
    if (receiverGated.includes(field)) assert.equal(x.v, undefined, 'receiver gate ' + field);
    else { assert.ok(x.v, field); assert.notEqual(JSON.stringify(x.v), JSON.stringify(expected), field); }
    assert.deepEqual(x.r, normal.r);
  }
  // Start-side bridge relations are read only by the bridge identity check; break each one alone.
  const bridgeFields = ['probeIssuedBinding', 'probeBinding', 'probeCells', 'runIssuedLink', 'runLink', 'runIssuedDuty', 'runDuty'];
  const bc = bridgeFields.map(field => `case '${field}': if (restore) a.#${field} = old as never; else { old = a.#${field}; a.#${field} = {} as never; } break;`).join('\n');
  const bm = await load(replace(instrument(`    probeStartAccess.scratchFault(start, false);
    try { captured = ${supply}; } finally { probeStartAccess.scratchFault(start, true); }`), accessor,
    accessor + `\n      scratchFault: (a: RetirementStartAssembly, restore: boolean) => { switch (fault) { ${bc} } },`)
    + '\nlet old: unknown; export let fault = ""; export function select(v: string) { fault = v; captured = undefined; }\n', 'bridge-fields');
  for (const field of bridgeFields) {
    bm.select(field); const x = run(bm);
    assert.equal(x.v, undefined, 'bridge ' + field); assert.deepEqual(x.r, normal.r);
  }
  const hostile = 'new Proxy({}, { get() { hooks++; throw "private_secret"; }, ownKeys() { hooks++; throw "private_secret"; }, getPrototypeOf() { hooks++; throw "private_secret"; } })';
  const foreignCode = [
    `captured = this.bodyPinReturnedInput(${hostile} as never, source, start);`,
    `captured = this.bodyPinReturnedInput(this, ${hostile} as never, start);`,
    `captured = this.bodyPinReturnedInput(this, source, ${hostile} as never);`,
    'captured = this.bodyPinReturnedInput(this, { ...source }, start);',
    `const old = this.#bodySourceCurrent; this.#bodySourceCurrent = ${hostile} as never;
      try { captured = ${supply}; } finally { this.#bodySourceCurrent = old; }`,
  ];
  const fm = await load(instrument(`    switch (fault) { ${foreignCode.map((s,i) => `case '${i}': { ${s} break; }`).join('\n')} }`)
    + '\nexport let fault = ""; export function select(v: string) { fault = v; captured = undefined; }\n', 'foreign');
  for (let i = 0; i < foreignCode.length; i++) {
    fm.select(String(i)); const x = run(fm); assert.equal(x.v, undefined, 'foreign ' + i); assert.deepEqual(x.r, normal.r);
  }
  assert.equal(fm.hooks, 0);
  // Public-looking value forgery cannot replace the actual I/C pair.
  const forged = replace(source, accessor, accessor.replace('a.bodyPinValues(source)', '(forging ? { ...a.bodyPinValues(source), issuedSame: true, currentSame: true } : a.bodyPinValues(source))'));
  const forgedModule = await load(replace(forged, anchor, `    const old = probeStartAccess.scratchSwap(start);
    forging = true; try { captured = ${supply}; } finally { forging = false; probeStartAccess.scratchRestore(start, old); }\n` + anchor)
    .replace(accessor.replace('a.bodyPinValues(source)', '(forging ? { ...a.bodyPinValues(source), issuedSame: true, currentSame: true } : a.bodyPinValues(source))'),
      accessor.replace('a.bodyPinValues(source)', '(forging ? { ...a.bodyPinValues(source), issuedSame: true, currentSame: true } : a.bodyPinValues(source))')
      + '\n      scratchSwap: (a: RetirementStartAssembly) => { const old = a.#bodyExpectedSourceCurrent; a.#bodyExpectedSourceCurrent = {} as never; return old; },'
      + '\n      scratchRestore: (a: RetirementStartAssembly, old: BodyBindSourceShell) => { a.#bodyExpectedSourceCurrent = old; },')
      + '\nexport let captured: unknown;\nlet forging = false;\n', 'forged');
  // The forged view exists only inside the supply call; the legacy caller must still reach the capture point.
  const forgedRun = run(forgedModule);
  assert.equal(forgedRun.v, undefined); assert.deepEqual(forgedRun.r, normal.r);
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
  const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CanonicalGateDraftRoot');
  const methods = ['bodyPinStableStorageMatches', 'bodyPinReturnedSupplyMatches', 'bodyPinReturnedInput'];
  for (const name of methods) {
    const m = root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name); assert.ok(m);
    function readonly(n) {
      assert.ok(!(ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind)), name + '/write');
      assert.ok(!ts.isAwaitExpression(n) && !ts.isNewExpression(n) && !ts.isThrowStatement(n), name);
      ts.forEachChild(n, readonly);
    } readonly(m.body);
  }
  let inputCalls = 0, returnedWrites = 0;
  function walk(n) {
    if (ts.isCallExpression(n) && n.expression.getText(ast).endsWith('.bodyPinReturnedInput')) inputCalls++;
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind)
      && /^this\.#bodyPinReturned(?:Phase|PostChecked|Point|FailurePoint)$/.test(n.left.getText(ast))) returnedWrites++;
    ts.forEachChild(n, walk);
  } walk(ast); assert.equal(inputCalls, 0); assert.equal(returnedWrites, 0);
  const extra = '\ndeclare const r: CanonicalGateDraftRoot; declare const s: BodyBindSourceShell; declare const t: RetirementStartAssembly; declare const shell: BodyPreparationShell;\nr.bodyPinReturnedInput(r, s, t);\nr.bodyPinReturnedSupplyMatches(r, s, t);\nr.bodyPinStableStorageMatches(shell, t);\n';
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const opts = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(opts), get = host.getSourceFile.bind(host);
  host.getSourceFile = (n,l,e,f) => n === file ? ts.createSourceFile(n, source + extra, l, true) : get(n,l,e,f);
  const ds = ts.getPreEmitDiagnostics(ts.createProgram([file], opts, host));
  assert.ok(ds.every(d => d.file?.fileName === file && d.start >= source.length));
  assert.ok(ds.every(d => d.code === 2341), JSON.stringify(ds.map(d => ({ code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') }))));
  assert.equal(new Set(ds.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 3);
  console.log(JSON.stringify({ canonicalFields: 68, rootControls: roots.length, sourceControls: 13, receiverControls: receiverFields.length, receiverGated: receiverGated.length, bridgeControls: bridgeFields.length,
    foreignControls: foreignCode.length, foreignHooks: fm.hooks, forgedViewRejected: true, forgedReached: true, privateRejections: 3, inputCalls, returnedWrites }));
} finally { rmSync(dir, { recursive: true, force: true }); }
