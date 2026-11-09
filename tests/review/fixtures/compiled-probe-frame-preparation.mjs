/** Stage A only: isolated compilation, closed wrapper and private binding controls. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'probe-frame-preparation-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href); }
function replace(s, from, to) { assert.equal(s.split(from).length, 2, 'unique anchor: ' + from); return s.replace(from, to); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const run = (m, s) => { const a = m.createProbeFramePreparationFake(s); a.prepare(); return a.inspect(); };
  const cellChecks = [
    ['copy', 'c === this.#issuedCells'], ['brand', 'c[PROBE_CELLS] === true'], ['extra', 'Reflect.ownKeys(c).length === 8'],
    ['owner', 'c.owner === this.#probeOwner'], ['use', 'c.use === s[0].value'], ['frame', 'c.frame === s[1].value'],
    ['grant', 'c.grant === s[2].value'], ['body', 'c.body === s[3].value'], ['exit', 'c.exit === s[4].value'], ['diagnostic', 'c.diagnostic === s[5].value'],
  ];
  for (const [i, [f, clause]] of cellChecks.entries()) {
    assert.equal(run(base, 'cells_' + f).retained, 30);
    const r = run(await load(replace(text, clause, 'true'), 'cell-' + i), 'cells_' + f);
    assert.equal(r.ready, true, 'masked cell ' + f); assert.equal(r.probe.start.generationBodyCalls, 0);
  }
  const frameChecks = [['copy', 'b === this.#issuedFrameBinding'], ['brand', 'b[PROBE_BINDING] === true'], ['extra', 'Reflect.ownKeys(b).length === 13'],
    ['seed', 'b.seed === seed'], ['target', 'b.target === target'], ['gate', 'b.gate === seed.gate'], ['pin', 'b.pin === pin'],
    ['scope', 'b.scope === target.scope'], ['owner', 'b.owner === target.scope.owner'], ['epoch', 'b.epoch === target.epoch'],
    ['packet', 'b.packet === target.packet'], ['draft', 'b.draft === draft'], ['entry', 'b.entry === this.#entry'],
    ['exit', 'b.exit === this.#exit'], ['cells', 'b.cells === this.#issuedCells']];
  for (const [i, [f, clause]] of frameChecks.entries()) {
    assert.equal(run(base, 'frame_' + f).probe.start.bindingAttempted, false);
    const r = run(await load(replace(text, clause, 'true'), 'frame-' + i), 'frame_' + f);
    // Some receiver guards also reject. Assert first private binding reach, not merely final failure/success.
    assert.equal(r.probe.start.bindingAttempted, true, 'masked frame preflight ' + f);
    assert.equal(r.probe.start.generationBodyCalls, 0);
  }
  assert.equal(run(base, 'start_cells_copy').ready, false);
  const receiver = await load(replace(text, 'b.cells === this.#probeCells', 'true'), 'receiver');
  assert.equal(run(receiver, 'start_cells_copy').ready, true);
  const duplicate = await load(replace(text, 'if (a.#probeBindStarted) return false;', 'if (false) return false;'), 'duplicate');
  assert.equal(run(duplicate, 'duplicate_frame_binding').probe.bindRefusal, 'not_refused');
  // Trap before frame activation: the seed guard mutation is detected without starting any body at all.
  const trapped = replace(text, '    this.#frame = true;\n    try { this.generationFrame(); }',
    "    throw Error('forbidden_body_entry');\n    this.#frame = true;\n    try { this.generationFrame(); }");
  const guarded = await load(trapped, 'trapped'); const safe = guarded.createProbeFramePreparationFake(); safe.prepare();
  assert.equal(safe.check().disposition, 'blocked_frame_execution'); assert.equal(safe.checkLegacy().disposition, 'blocked_frame_execution');
  assert.equal(safe.inspect().probe.start.wrapperCalls, 2); assert.equal(safe.inspect().probe.start.frameExits, 0);
  const unguarded = await load(replace(trapped, "if (this.#gateSeed || route === 'probe_closed')", "if (route === 'probe_closed')"), 'unguarded');
  const bypass = unguarded.createProbeFramePreparationFake(); bypass.prepare();
  assert.throws(() => bypass.checkLegacy(), /forbidden_body_entry/);
  assert.equal(bypass.inspect().probe.start.generationBodyCalls, 0); assert.equal(bypass.inspect().probe.start.frame, 'inactive');
  console.log(JSON.stringify({ compiled: true, cellControls: 10, framePreflightControls: 15, receiverControl: true,
    oneShotBindingControl: true, seededWrapperTrap: true, bodyStarts: 0, grantIssues: 0, exitRecords: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
