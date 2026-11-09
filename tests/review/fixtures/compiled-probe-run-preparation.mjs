/** B-01 scratch-only controls. No grant issuer or body runner exists. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-run-preparation-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const file = join(dir, name + '.js'); writeFileSync(file, emit(s)); return import(pathToFileURL(file).href); }
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
function predicate(s, method, clause, to) {
  const head = '  private ' + method + '('; assert.equal(s.split(head).length, 2, 'method anchor');
  const start = s.indexOf(head), end = s.indexOf('\n  }\n', start) + 5;
  assert.ok(end > start); return s.slice(0, start) + replace(s.slice(start, end), clause, to) + s.slice(end);
}
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const run = (m, script) => { const a = m.createProbeRunPreparationFake(script); a.prepare(); return a.inspect(); };
  const links = [['copy', 'link === this.#issuedRunLink'], ['brand', 'link[PROBE_RUN_LINK] === true'], ['extra', 'Reflect.ownKeys(link).length === 7'],
    ['origin', 'link.origin === this.#runSlots[0].value'], ['binding', 'link.binding === b'], ['cells', 'link.cells === cells'],
    ['frame', 'link.frame === cells.frame'], ['entry', 'link.entry === b.entry'], ['exit', 'link.exit === b.exit']];
  for (const [i, [f, clause]] of links.entries()) {
    assert.equal(run(base, 'link_' + f).construction.phase, 2);
    const s = run(await load(predicate(text, 'runLinkMatches', clause, 'true'), 'link-' + i), 'link_' + f);
    assert.equal(s.construction.dutyRetained, true, 'first link guard masked: ' + f);
  }
  const duties = [['copy', 'duty === this.#issuedRunDuty'], ['brand', 'duty[PROBE_DUTY] === true'], ['extra', 'Reflect.ownKeys(duty).length === 6'],
    ['link', 'duty.link === this.#issuedRunLink'], ['state', "duty.state === 'not_owed'"], ['attempt', 'duty.attemptUsed === false'],
    ['phase', "duty.phase === 'none'"], ['boundary', "duty.boundary === 'none'"]];
  for (const [i, [f, clause]] of duties.entries()) {
    assert.equal(run(base, 'duty_' + f).construction.phase, 3);
    const s = run(await load(predicate(text, 'runDutyMatches', clause, 'true'), 'duty-' + i), 'duty_' + f);
    assert.equal(s.construction.phase, 4, 'first duty guard masked: ' + f); assert.equal(s.construction.retained, 4);
  }
  const seals = [['copy', 'seal === this.#issuedRunSeal'], ['extra', 'Reflect.ownKeys(seal).length === 3'],
    ['link', 'seal.link === this.#issuedRunLink'], ['duty', 'seal.duty === this.#issuedRunDuty'], ['executable', 'seal.executable === false']];
  for (const [i, [f, clause]] of seals.entries()) {
    assert.equal(run(base, 'seal_' + f).construction.ready, false);
    assert.equal(run(await load(replace(text, clause, 'true'), 'seal-' + i), 'seal_' + f).construction.ready, true);
  }
  for (const [i, [script, clause]] of [['start_run_link_copy', 'link === this.#runLink'], ['start_run_duty_copy', 'duty === this.#runDuty']].entries()) {
    assert.equal(run(base, script).construction.ready, false);
    assert.equal(run(await load(replace(text, clause, 'true'), 'receiver-' + i), script).construction.ready, true);
  }
  const duplicate = await load(replace(text, 'if (a.#runBindStarted) return false;', 'if (false) return false;'), 'duplicate');
  assert.equal(run(base, 'duplicate_run_binding').construction.bindRefusal, 'duplicate_binding');
  assert.equal(run(duplicate, 'duplicate_run_binding').construction.bindRefusal, 'none');
  const shapeControls = [['shape_unused_spent', "f.attempt !== (f.use !== 'unused')", 'false'],
    ['shape_accepted', '|| f.accepted) return false;', '|| false) return false;'],
    ['shape_exiting_empty', "(f.body === 'not_started' || ['active', 'revoked'].includes(f.grant))", 'true']];
  for (const [i, [script, clause, to]] of shapeControls.entries()) {
    assert.equal(base.createProbeRunPreparationFake(script).checkState().valid, false);
    const m = await load(replace(text, clause, to), 'shape-' + i);
    assert.equal(m.createProbeRunPreparationFake(script).checkState().valid, true);
  }
  // Existing private frame identity is an inert sentinel, not a minted/branded grant. Scratch only, no fixture registration API.
  const injected = replace(text, '    const cells = this.#issuedCells;', `    const cells = this.#issuedCells;
    if (cells) {
      (cells.grant as unknown as { current: object }).current = cells.frame;
      (cells.exit as unknown as { candidate: object }).candidate = cells.frame;
      Object.defineProperty(cells.grant, 'private_hook', { enumerable: true, configurable: true, get() { throw Error('private_hook_executed'); } });
    }`);
  const safe = run(await load(injected, 'sentinel'), 'normal');
  assert.equal(safe.grant.currentRetained, true); assert.equal(safe.exit.candidateRetained, true); assert.equal(safe.duty.linkRetained, true);
  assert.deepEqual(Object.keys(safe.grant), ['stage', 'currentRetained', 'issuedRetained', 'rejectedRetained', 'unknownObligation', 'localRevocationConfirmed']);
  const projections = [['currentRetained: grant?.current !== undefined', 'currentRetained: grant?.current', s => typeof s.grant.currentRetained === 'boolean'],
    ['candidateRetained: exit?.candidate !== undefined', 'candidateRetained: exit?.candidate', s => typeof s.exit.candidateRetained === 'boolean'],
    ["linkRetained: duty !== undefined }),", "linkRetained: duty?.link }),", s => typeof s.duty.linkRetained === 'boolean']];
  for (const [i, [clause, to, holds]] of projections.entries()) {
    assert.equal(holds(safe), true);
    assert.equal(holds(run(await load(replace(injected, clause, to), 'projection-' + i), 'normal')), false);
  }
  const spread = await load(replace(injected, 'grant: Object.freeze({ stage: runEnum(grant?.stage,', 'grant: Object.freeze({ ...grant, stage: runEnum(grant?.stage,'), 'spread');
  assert.throws(() => run(spread, 'normal'), /private_hook_executed/);
  const a = base.createProbeRunPreparationFake(); a.prepare(); a.check(); a.checkLegacy();
  assert.equal(a.inspect().start.wrapperCalls, 2); assert.equal(a.inspect().start.generationBodyCalls, 0);
  assert.equal(a.inspect().grantIssues, 0); assert.equal(a.inspect().duty.state, 'not_owed');
  // Semantic compile-fail controls are appended in memory only, never emitted/imported or executed.
  const file = fileURLToPath(new URL('./snapshot-read-composition-fake.ts', import.meta.url));
  const extra = `
declare const typeOnlyLink: ProbeRunLink;
const badUse: ProbeUseCell = { state: 'unused', attemptUsed: true };
const badFinished: ProbeUseCell = { state: 'finished', attemptUsed: true };
const badBody: ProbeBodyCell = { state: 'returned', outcome: 'none' };
const badGrant: ProbeGrantCell = { stage: 'active', current: undefined, issued: undefined, rejected: undefined, unresolved: false };
const badAccepted: ProbeExitCell = { stage: 'empty', candidate: undefined, issued: undefined, accepted: {}, revoked: false };
const badDuty: FixedExitDuty = { [PROBE_DUTY]: true, link: typeOnlyLink, state: 'not_owed', attemptUsed: true, phase: 'none', boundary: 'none' };
`;
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, text + extra, language, true)
    : getSource(name, language, error, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.ok(diagnostics.every(d => d.file?.fileName === file && d.start >= text.length), 'unexpected baseline semantic diagnostic');
  const lines = new Set(diagnostics.map(d => d.file.getLineAndCharacterOfPosition(d.start).line));
  assert.equal(lines.size, 6, 'each illegal internal type must be rejected');
  console.log(JSON.stringify({ compiled: true, linkPreflightControls: 9, dutyPreflightControls: 8, sealControls: 5,
    receiverControls: 2, oneShotControl: true, shapeControls: 3, projectionControls: 3, spreadHookControl: true,
    typeRejections: 6, grantIssues: 0, bodyStarts: 0, exitRecords: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
