/** Offline synthetic frame/claim boundary; no field clear or root termination. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'retirement-start-'));
const emit = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(source, name) { const f = join(dir, name + '.js'); writeFileSync(f, emit(source)); return import(pathToFileURL(f).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'source-map-values-core.js'), emit(readFileSync(new URL('./source-map-values-core.ts', import.meta.url), 'utf8')));
  writeFileSync(join(dir, 'supply-construction-kernel.js'), emit(readFileSync(new URL('./supply-construction-kernel.ts', import.meta.url), 'utf8')));
  const m = await load(text, 'snapshot-read-composition-fake');
  const thin = await load(readFileSync(new URL('./retirement-start-fake.ts', import.meta.url), 'utf8'), 'thin');
  assert.deepEqual(Object.keys(thin), ['createRetirementStartFake']);
  assert.equal(thin.createRetirementStartFake, m.createRetirementStartFake);
  const controls = [
    ['defer', 'if (this.#frame) {', 'if (false) {', 'request_in_frame', a => { a.prepare(); return a.inspect().deferred?.starts === 0; }],
    ['frame exit', 'else this.#frame = false;', 'else { /* retained lease */ }', 'request_in_frame', a => { a.prepare(); return a.inspect().starts === 1; }],
    ['drain', 'if (this.#requested) this.request();', '', 'request_in_frame', a => { a.prepare(); return a.inspect().starts === 1; }],
    ['ownership', 'this.#pin !== this.#issuedPin', 'false', 'pin_copy', a => { a.prepare(); return a.request().disposition === 'binding_rejected'; }],
    ...[['pin_construction', 'pin.construction === own.construction'], ['pin_retention', 'pin.retention === own.retention'],
      ['pin_source_slot', 'pin.sourceSlot === s.origin']].map(([script, clause]) => [`pin field ${script}`, clause, 'true', script,
      a => { a.prepare(); return a.request().disposition === 'binding_rejected'; }]),
    ['first reason', "if (this.#first === 'none' && first !== 'none') this.#first = first;", "this.#first = first;", 'normal',
      a => { a.prepare('invalid'); a.close(); return a.inspect().firstReason === 'binding_mismatch'; }],
    ['frame unknown', "if (this.#frameUnconfirmed) { this.request(); return this.reply(false, 'frame_unconfirmed'); }\n    if (this.#requested) this.request();",
      'if (this.#requested) this.request();', 'frame_exit_failure',
      a => a.prepare().disposition === 'frame_unconfirmed'],
  ];
  for (const [i, [label, from, to, script, holds]] of controls.entries()) {
    assert.equal(text.split(from).length, 2, 'anchor drift: ' + label);
    assert.equal(holds(m.createRetirementStartFake(script)), true);
    const mutant = await load(text.replace(from, to), 'mutation-' + i);
    assert.equal(holds(mutant.createRetirementStartFake(script)), false, 'surviving mutation: ' + label);
  }
  const a = m.createRetirementStartFake('throw_in_frame'); a.prepare(); a.request();
  assert.equal(a.inspect().starts, 1); assert.equal(a.inspect().fieldWrites, 0);
  assert.equal(a.inspect().rootFinish, 'not_called'); assert.equal(a.inspect().proofIssuance, 'closed');
  console.log(JSON.stringify({ compiled: true, frameClaimControls: controls.length, fieldClear: 'not_connected', authority: 'none' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
