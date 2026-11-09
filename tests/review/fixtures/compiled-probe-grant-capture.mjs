/** B-02 synthetic grant capture only. No body/active qualification or exit operation. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-grant-capture-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const file = join(dir, name + '.js'); writeFileSync(file, emit(s)); return import(pathToFileURL(file).href); }
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
function predicate(s, method, clause, to) {
  const head = '  private ' + method + '('; assert.equal(s.split(head).length, 2);
  const start = s.indexOf(head), end = s.indexOf('\n  }\n', start) + 5;
  return s.slice(0, start) + replace(s.slice(start, end), clause, to) + s.slice(end);
}
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const prepared = (m, script = 'normal') => { const a = m.createProbeGrantCaptureFake(script); a.prepare(); return a; };
  const run = (m, script) => { const a = prepared(m, script); const result = a.enter(); return { a, result, snapshot: a.inspect() }; };
  const fields = [['copy', 'g === this.#grantIssued'], ['issued_copy', 'g === link.cells.grant.issued'],
    ['extra', 'Reflect.ownKeys(g).length === 11'], ['brand', 'g[PROBE_GRANT] === true'],
    ['bindingOrigin', 'g.bindingOrigin === link.origin'], ['gate', 'g.gate === b.gate.origin'], ['owner', 'g.owner === b.owner'],
    ['pin', 'g.pin === b.pin'], ['epoch', 'g.epoch === b.epoch'], ['frame', 'g.frame === link.frame'],
    ['draft', 'g.draft === b.draft'], ['entry', 'g.entry === link.entry'], ['exit', 'g.exit === link.exit'], ['phase', "g.phase === 'probe_only'"]];
  for (const [i, [f, clause]] of fields.entries()) {
    assert.equal(run(base, 'grant_' + f).result.first, 'binding_mismatch');
    const mutant = await load(predicate(text, 'capturedGrantMatches', clause, 'true'), 'grant-' + i);
    const { result, snapshot } = run(mutant, 'grant_' + f);
    assert.equal(result.disposition, 'grant_captured_body_closed', 'masked grant guard ' + f);
    assert.equal(snapshot.grantIssues, 1); assert.equal(snapshot.bodyStarts, 0); assert.equal(snapshot.capture.sameDuty, true);
  }
  const reentry = await load(replace(text, "if (this.#captureInProgress) return this.captureReply(false, 'enter_in_progress');", ''), 'reentry');
  assert.equal(run(base, 'reenter_issue_before').snapshot.capture.reentry, 'enter_in_progress');
  const reentered = run(reentry, 'reenter_issue_before').snapshot;
  assert.equal(reentered.capture.reentry, 'none'); // Projection does not publish the unexpected internal reentry disposition.
  assert.equal(reentered.capture.refusal, 'duplicate_enter');
  const duplicate = await load(replace(text, "if (link?.cells.use.attemptUsed) { this.#captureRefusal = 'duplicate_enter'; return this.captureReply(false, 'duplicate_enter'); }", ''), 'duplicate');
  const d = prepared(duplicate); d.enter(); assert.equal(d.enter().first, 'binding_mismatch'); // Not a harmless duplicate refusal anymore.
  const issuer = await load(replace(text, 'this.#grantIssued = value; this.#grantIssues++;', 'this.#grantIssues++;'), 'issuer-retention');
  assert.equal(run(base, 'fault_issue_issued').snapshot.grant.issuedRetained, true);
  assert.equal(run(issuer, 'fault_issue_issued').snapshot.grant.issuedRetained, false);
  const refund = await load(replace(text, "  cells.grant.stage = 'empty'; cells.grant.unresolved = false;\n  return 'claimed_not_issued';", "  cells.grant.stage = 'empty'; cells.grant.unresolved = false; cells.use.attemptUsed = false;\n  return 'claimed_not_issued';"), 'refund');
  // Known prefixes must not collapse into unconfirmed: the duty stays owed for the later fixed exit.
  const collapse = await load(replace(text, "  if (issued !== undefined) {\n    if (cells.grant.current === undefined)", "  if (false) {\n    if (cells.grant.current === undefined)"), 'collapse');
  assert.equal(run(base, 'grant_pin').snapshot.duty.state, 'owed');
  assert.equal(run(collapse, 'grant_pin').snapshot.duty.state, 'unconfirmed');
  const unknown = await load(replace(text, "      this.#grantCallStarted = true; const issued", "      const issued"), 'unknown');
  assert.equal(run(base, 'issue_throw').snapshot.capture.prefix, 'grant_unknown');
  assert.equal(run(unknown, 'issue_throw').snapshot.capture.prefix, 'claimed_not_issued');
  assert.equal(run(base, 'fault_claim_after').snapshot.capture.obligationOwed, true);
  assert.equal(run(refund, 'fault_claim_after').snapshot.capture.obligationOwed, false);
  const lostDuty = await load(replace(text, 'const cells = this.#runLink?.cells, duty = this.#runDuty;', 'this.#runDuty = undefined; const cells = this.#runLink?.cells, duty = this.#runDuty;'), 'lost-duty');
  assert.equal(run(base, 'fault_issue_issued').snapshot.capture.sameDuty, true);
  assert.equal(run(lostDuty, 'fault_issue_issued').snapshot.capture.sameDuty, false);
  const stopped = await load(predicate(text, 'capturePoint', "if (this.#captureStop) { this.#captureFirst = this.#captureFirst === 'none' ? 'closed' : this.#captureFirst; throw Error('probe_capture_stopped'); }", ''), 'stop');
  assert.equal(run(base, 'stop_issue_before').result.first, 'closed');
  assert.equal(run(stopped, 'stop_issue_before').result.disposition, 'grant_captured_body_closed');
  const projections = [['currentRetained: grant?.current !== undefined', 'currentRetained: grant?.current', s => typeof s.grant.currentRetained === 'boolean'],
    ['issuedRetained: grant?.issued !== undefined', 'issuedRetained: grant?.issued', s => typeof s.grant.issuedRetained === 'boolean'],
    ["linkRetained: duty !== undefined }),", "linkRetained: duty?.link }),", s => typeof s.duty.linkRetained === 'boolean']];
  const safe = run(base, 'normal').snapshot;
  for (const [i, [clause, to, holds]] of projections.entries()) {
    assert.equal(holds(safe), true);
    assert.equal(holds(run(await load(replace(text, clause, to), 'projection-' + i), 'normal').snapshot), false);
  }
  // Trap before old body dispatch. Checks after enter may reach the wrapper, never that body.
  const trapped = await load(replace(text, '    this.#frame = true;\n    try { this.generationFrame(); }',
    "    throw Error('forbidden_body_entry');\n    this.#frame = true;\n    try { this.generationFrame(); }"), 'body-trap');
  const a = prepared(trapped); a.enter();
  assert.equal(a.check().disposition, 'blocked_frame_execution'); assert.equal(a.checkLegacy().disposition, 'blocked_frame_execution');
  assert.equal(a.inspect().start.generationBodyCalls, 0); assert.equal(a.inspect().start.frameExits, 0);
  assert.equal(a.inspect().duty.state, 'owed'); assert.equal(a.inspect().exit.exitAccepted, false);
  console.log(JSON.stringify({ compiled: true, grantIdentityControls: fields.length, reentryControl: true, duplicateControl: true,
    issuerRetentionControl: true, nonRefundControl: true, sameDutyRetentionControl: true, projectionControls: 3,
    stopControl: true, knownPrefixControl: true, unknownPrefixControl: true, bodyTrap: true, bodyStarts: 0, exitRecords: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
