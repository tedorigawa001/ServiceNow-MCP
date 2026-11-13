/** R-a values stay values; no returned writer or source can be issued by this entry. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pin-returned-preparation-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const p = join(dir, name + '.js'); writeFileSync(p, emit(s)); return import(pathToFileURL(p).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const m = await load(source + '\nexport const stateCheck = bodyPinReturnedStateMatches;\n', 'values');
  let states = 0;
  for (const phase of ['not_started', 'checking', 'accepted', 'blocked', 'failed', 'private_secret'])
    for (const postChecked of [false, true, 'false']) for (const point of ['none', 'identity', 'pre', 'post', 'blocked'])
      for (const failurePoint of ['none', 'identity', 'pre', 'post', 'blocked']) {
        const expected = phase === 'not_started' && postChecked === false && ['none', 'identity'].includes(point) && failurePoint === 'none'
          || phase === 'checking' && postChecked === false && ['pre', 'post'].includes(point) && failurePoint === 'none'
          || phase === 'accepted' && postChecked === true && ['post', 'blocked'].includes(point) && failurePoint === 'none'
          || phase === 'blocked' && postChecked === true && point === 'blocked' && failurePoint === 'none'
          || phase === 'failed' && postChecked === false && ['identity', 'pre', 'post'].includes(point) && failurePoint === point
          || phase === 'failed' && postChecked === true && point === 'blocked' && failurePoint === 'blocked';
        assert.equal(m.stateCheck({ phase, postChecked, point, failurePoint }), expected, JSON.stringify({ phase, postChecked, point, failurePoint })); states++;
      }
  const v = await load(source + '\nexport const preCheck = bodyPinReturnedPreValues;\nexport const postCheck = bodyPinReturnedPostValues;\n', 'checks');
  const pre = {
    state: { phase: 'checking', postChecked: false, point: 'pre', failurePoint: 'none' },
    source: { state: 'initializing', claim: 'unused', pinCallReached: true, bindCallReached: false, postConfirmed: false,
      stopRequested: false, phase: 'BP03', boundary: 'call', first: 'none', failurePhase: 'none', failureBoundary: 'none', refusal: 'none', deliveryFirst: 'none' },
    receiver: { attemptUsed: true, stage: 'confirmed', issued: true, current: true, rejected: false, issuedSame: true, currentSame: true,
      step: 'confirmed', failureStep: 'none', first: 'none', failurePhase: 'none', failurePrefix: 'none', failureBoundary: 'none', refusal: 'none' },
    root: { stopped: false, first: 'none', frameActive: true, ready: false, publicBusy: true, rootExit: 'not_observed',
      calls: 1, result: 'accepted', callPhase: 'returned', callActive: false, entryBusy: false,
      classification: 'completed_value_only', completion: 'completion_observed', routeAttempted: true, routeState: 'running',
      routePhase: 'BP03', routeStep: 'call', routeBoundary: 'after', failureRecorded: false, sourceReason: 'none', diagnosticRecorded: false,
      preparingConfirmed: false, pinPostChecked: false, terminalSealed: false, replyAttempted: false, replyPhase: 'empty', terminalDisposition: 'none',
      cacheRetained: false, finalFailurePoint: 'none', prepared: true, stagesChecked: true },
    callee: { boundary: 'after', hold: 'not_started', referencePost: true, checkedPost: true, confirmedPost: true, finalPost: true },
  };
  const post = structuredClone(pre); post.state.point = 'post'; post.source.boundary = 'after'; post.root.routeStep = 'returned'; post.root.routeBoundary = 'before';
  assert.equal(v.preCheck(pre), true); assert.equal(v.postCheck(post), true);
  assert.equal(v.preCheck(post), false); assert.equal(v.postCheck(pre), false);
  // A valid but later state (accepted after G_A) is never a checking-phase pre/post input.
  for (const [input, check, point] of [[pre, v.preCheck, 'post'], [post, v.postCheck, 'post'], [post, v.postCheck, 'blocked']]) {
    const x = structuredClone(input); x.state = { phase: 'accepted', postChecked: true, point, failurePoint: 'none' };
    assert.equal(m.stateCheck(x.state), true); assert.equal(check(x), false, 'accepted/' + point);
  }
  let fields = 0, shapes = 0, grid = 0;
  for (const [input, check] of [[pre, v.preCheck], [post, v.postCheck]]) {
    for (const group of ['state', 'source', 'receiver', 'root', 'callee']) {
      for (const key of Object.keys(input[group])) {
        const x = structuredClone(input), old = x[group][key]; x[group][key] = typeof old === 'boolean' ? !old : typeof old === 'number' ? 0 : 'private_secret';
        assert.equal(check(x), false, group + '.' + key); fields++;
      }
    }
    for (const group of [undefined, 'state', 'source', 'receiver', 'root', 'callee']) for (const fault of ['extra', 'missing', 'symbol', 'prototype', 'accessor']) {
      const x = structuredClone(input), o = group ? x[group] : x, key = Object.keys(o)[0]; let hooks = 0;
      if (fault === 'extra') o.private_secret = true;
      if (fault === 'missing') delete o[key];
      if (fault === 'symbol') o[Symbol('private_secret')] = true;
      if (fault === 'prototype') Object.setPrototypeOf(o, null);
      if (fault === 'accessor') Object.defineProperty(o, key, { get() { hooks++; throw 'private_secret'; } });
      assert.equal(check(x), false, group + '/' + fault); assert.equal(hooks, 0); shapes++;
    }
  }
  for (const point of ['pre', 'post', 'blocked']) for (const routeStep of ['call', 'returned', 'preflight'])
    for (const routeBoundary of ['before', 'after', 'none']) for (const boundary of ['call', 'after', 'checked']) {
      const x = structuredClone(pre); Object.assign(x.state, { point }); Object.assign(x.root, { routeStep, routeBoundary }); x.source.boundary = boundary;
      assert.equal(v.preCheck(x), point === 'pre' && routeStep === 'call' && routeBoundary === 'after' && boundary === 'call');
      assert.equal(v.postCheck(x), point === 'post' && routeStep === 'returned' && routeBoundary === 'before' && boundary === 'after'); grid++;
    }
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.ES2022, true);
  const root = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CanonicalGateDraftRoot');
  const method = name => root.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
  const prepare = method('returnedPreparationPrepare');
  function noAllocation(n) {
    assert.ok(!ts.isObjectLiteralExpression(n) && !ts.isArrayLiteralExpression(n) && !ts.isNewExpression(n) && !ts.isAwaitExpression(n) && !ts.isTemplateExpression(n));
    if (ts.isCallExpression(n)) assert.ok(['this.returnedPreparationInitialMatches', 'this.returnedPreparationResult'].includes(n.expression.getText(ast)), n.expression.getText(ast));
    ts.forEachChild(n, noAllocation);
  } noAllocation(prepare.body);
  for (const n of ['returnedPreparationInitialMatches', 'returnedPreparationResult', 'returnedPreparationReject', 'returnedPreparationClose']) noAllocation(method(n).body);
  const injectPrepare = code => source.replace('  returnedPreparationPrepare(): string {', '  returnedPreparationPrepare(): string {\n    ' + code);
  const ghost = await load(injectPrepare("this.#issuedCells = { body: { state: 'not_started' } } as never;"), 'ghost');
  assert.equal(ghost.createProbeBodyPinReturnedPreparationFake().prepare(), 'state_invalid');
  let initial = 1;
  for (const [field, literal] of [['bodyPinReturnedPhase', "'checking'"], ['bodyPinReturnedPostChecked', 'true'],
    ['bodyPinReturnedPoint', "'pre'"], ['bodyPinReturnedFailurePoint', "'pre'"], ['started', 'true'], ['frame', 'true'], ['ready', 'true'],
    ['bodyPinFixedCalls', '1'], ['bodyPinCallResult', "'accepted'"], ['bodyPinCallActive', 'true'], ['finalTerminalSealed', 'true'],
    ['finalReplyAttempted', 'true'], ['finalReplyPhase', "'private_cached'"], ['fixed', '{} as never'],
    // Each remaining absence clause of the initial owner check gets its own single-field control.
    ['issuedSeed', '{} as never'], ['issuedDraft', '{} as never'], ['probeOwner', '{} as never'], ['issuedFrameBinding', '{} as never'],
    ['issuedRunLink', '{} as never'], ['issuedRunDuty', '{} as never'], ['issuedRunSeal', '{} as never'], ['bodySeedShell', '{} as never'],
    ['bodySourceCreationAttempted', 'true'], ['bodySourceMetadataConfirmed', 'true'], ['bodySourceBuildStage', "'captured'"],
    ['bodyPinRouteAttempted', 'true'], ['bodySourceCurrent', '{} as never'], ['bodySourceRejected', '{} as never']]) {
    const x = await load(injectPrepare(`this.#${field} = ${literal};`), 'initial-' + field), a = x.createProbeBodyPinReturnedPreparationFake();
    assert.equal(a.prepare(), 'state_invalid', field); assert.equal(a.inspect().first, 'state_invalid'); initial++;
  }
  const hostile = await load(injectPrepare('this.#bodySourceIssued = new Proxy({}, { get() { hooks++; throw "private_secret"; }, ownKeys() { hooks++; throw "private_secret"; }, getPrototypeOf() { hooks++; throw "private_secret"; } }) as never;')
    + '\nexport let hooks = 0;\n', 'hostile');
  const h = hostile.createProbeBodyPinReturnedPreparationFake(); assert.equal(h.prepare(), 'state_invalid'); h.inspect(); assert.equal(hostile.hooks, 0);
  let projection = 0;
  for (const [field, value, key, expected] of [['bodyPinReturnedPhase', '"private_secret" as never', 'phase', 'unconfirmed'],
    ['bodyPinReturnedPoint', '"private_secret" as never', 'point', 'unconfirmed'],
    ['bodyPinReturnedFailurePoint', '"private_secret" as never', 'failurePoint', 'unconfirmed'],
    ['bodyPinReturnedPostChecked', '"private_secret" as never', 'postChecked', false],
    // Finite projections must follow the real slots, not fixed initial literals.
    ['bodyPinReturnedPhase', "'checking'", 'stateValid', false], ['bodyPinFixedCalls', '1', 'fixedCalls', -1],
    ['bodySourceIssued', '{} as never', 'sourceGenerations', 1], ['fixed', '{} as never', 'cacheRetained', true],
    ['finalTerminalSealed', 'true', 'sealed', true], ['finalReplyAttempted', 'true', 'attempts', 1],
    ['issuedCells', "{ body: { state: 'running' } } as never", 'bodyStarts', 1]]) {
    const s = source.replace('  inspectReturnedPreparation() {', `  inspectReturnedPreparation() {\n    this.#${field} = ${value};`);
    const a = (await load(s, 'projection-' + field)).createProbeBodyPinReturnedPreparationFake(), d = a.inspect();
    assert.equal(d[key], expected); assert.equal(JSON.stringify(d).includes('private_secret'), false); projection++;
  }
  const fields4 = { bodyPinReturnedPhase: "'not_started'", bodyPinReturnedPostChecked: 'false', bodyPinReturnedPoint: "'none'", bodyPinReturnedFailurePoint: "'none'" };
  for (const [name, literal] of Object.entries(fields4)) {
    const f = root.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === '#' + name);
    assert.equal(f.initializer.getText(ast), literal); assert.ok(f.end < root.members.find(ts.isConstructorDeclaration).getStart(ast));
  }
  let operationalWrites = 0;
  function writes(n, owner = '') {
    if (ts.isMethodDeclaration(n)) owner = n.name.getText(ast);
    if (ts.isBinaryExpression(n) && ts.isAssignmentOperator(n.operatorToken.kind)) {
      if (Object.keys(fields4).some(k => n.left.getText(ast) === 'this.#' + k)) operationalWrites++;
      if (/^(returnedPreparation|inspectReturnedPreparation)/.test(owner)) assert.ok(['this.#failure.first', 'this.#closed'].includes(n.left.getText(ast)), owner + '/' + n.left.getText(ast));
    }
    ts.forEachChild(n, c => writes(c, owner));
  } writes(ast); assert.equal(operationalWrites, 0);
  const factory = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'createProbeBodyPinReturnedPreparationFake');
  const ctor = factory.body.statements.find(ts.isVariableStatement).declarationList.declarations[0].initializer;
  assert.equal(ctor.arguments.length, 25); assert.ok(ctor.arguments.slice(2, -1).every(n => n.kind === ts.SyntaxKind.FalseKeyword));
  assert.equal(ctor.arguments.at(-1).kind, ts.SyntaxKind.TrueKeyword);
  const extra = `
declare const r: CanonicalGateDraftRoot;
r.returnedPreparationInitialMatches();
r.#bodyPinReturnedPostChecked = true;
const badState: BodyPinReturnedState = { phase: 'checking', postChecked: true, point: 'pre', failurePoint: 'none' };
const badPair: BodyPinReturnedState = { phase: 'failed', postChecked: false, point: 'pre', failurePoint: 'post' };
declare const s: BodyPinReturnedPreInput['source'];
const badSource: BodyPinReturnedPreInput['source'] = { ...s, boundary: 'after' };
declare const rootValues: BodyPinReturnedPreInput['root'];
const badRoot: BodyPinReturnedPreInput['root'] = { ...rootValues, callActive: true };
declare const callee: BodyPinReturnedPreInput['callee'];
const badCallee: BodyPinReturnedPreInput['callee'] = { ...callee, finalPost: false };
const proof = createProbeBodyPinReturnedPreparationFake().inspect().source;
const invalidPoint: BodyPinReturnedPoint = 'returned';
`;
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const opts = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(opts), get = host.getSourceFile.bind(host);
  host.getSourceFile = (n,l,e,f) => n === file ? ts.createSourceFile(n, source + extra, l, true) : get(n,l,e,f);
  const ds = ts.getPreEmitDiagnostics(ts.createProgram([file], opts, host));
  assert.ok(ds.every(d => d.file?.fileName === file && d.start >= source.length));
  assert.equal(new Set(ds.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 9);
  console.log(JSON.stringify({ compiled: true, states, fields, shapes, grid, laterStates: 3, initial, projection, operationalWrites,
    semanticRejections: 9, foreignHooks: 0, noAllocation: true, sourceFlagsClosed: 22, acceptance: 'not_connected' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
