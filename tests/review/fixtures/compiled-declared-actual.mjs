/** Scratch-compiled synthetic proof and negative controls; no source hash or live I/O. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'wfb-composition-compiled-'));
async function compile(text, name = 'snapshot-read-composition-fake.js') {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const path = join(scratch, name);
  writeFileSync(path, js);
  return import(pathToFileURL(path).href);
}
try {
writeFileSync(join(scratch, 'package.json'), '{"type":"module"}');
await compile(readFileSync(new URL('./source-map-values-core.ts', import.meta.url), 'utf8'), 'source-map-values-core.js');
const original = await compile(source);
assert.deepEqual(Object.keys(original), ['createReadHashFake', 'createSnapshotReadStartFake']);
for (const name of ['shared-read-hash-kernel-fake', 'read-hash-fake', 'snapshot-read-start-fake']) {
  const facade = await compile(readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8'), `${name}.js`);
  const factory = name === 'snapshot-read-start-fake' ? 'createSnapshotReadStartFake' : 'createReadHashFake';
  assert.deepEqual(Object.keys(facade), [factory]);
  assert.equal(facade[factory], original[factory]);
}
const c = original.createSnapshotReadStartFake(); c.begin(); c.prepare();
assert.equal(c.inspect().readState, 'prepared');
assert.equal(c.inspect().readKernel, 'not_connected');
assert.deepEqual([c.inspect().counts.open, c.inspect().counts.read, c.inspect().counts.hash, c.inspect().counts.cleanup], [0, 0, 0, 0]);
c.finish();
const shrink = original.createReadHashFake('da_shrink_two').run();
assert.equal(shrink.firstReason, 'content_mismatch');
assert.equal(shrink.counts.received, 2);
assert.equal(shrink.counts.read, 2);
assert.equal(shrink.counts.close, 1);
assert.equal(original.createReadHashFake('da_grow_probe').run().counts.hashed, 3);
assert.equal(original.createReadHashFake('da_empty').run().counts.accepted, 1);
const probe = original.createReadHashFake('da_source_probe').inspect().sourceProbe;
assert.equal(probe.grid.length, 75);
for (const row of probe.grid) {
  let available = 0;
  for (let p = row.offset; p < row.actual && available < row.requested; p++) available++;
  assert.equal(row.n, available);
  assert.equal(row.kind, available ? 'bytes' : 'eof');
}
assert(probe.invalidEvents.every(Boolean));
const controls = [
  ['declaration normalized to actual', 'declaredBytes: scenario ===', "declaredBytes: scenario === 'da_shrink_two' ? 2 : scenario ===",
    m => m.createReadHashFake('da_shrink_two').run().counts.read === 2],
  ['actual length ignored', 'Math.min(requested, live.visible - offset, live.record.maxReturn)', 'Math.min(requested, live.record.maxReturn)',
    m => m.createReadHashFake('da_shrink_two').run().counts.received === 2],
  ['EOF boundary changed', 'offset >= live.visible', 'offset > live.visible',
    m => m.createReadHashFake('da_source_probe').inspect().sourceProbe.grid.every(r => r.kind === (r.offset >= r.actual ? 'eof' : 'bytes'))],
  ['probe bypassed', 'const result = this.#source.readOnce(scope.resource',
    "if (!remaining) { this.#phase = 'after'; return; } const result = this.#source.readOnce(scope.resource",
    m => m.createReadHashFake('da_grow_probe').run().counts.received === 4],
  ['excess byte hashed', "if (!remaining) { this.mismatch(); return; }", '/* faulty excess admission */',
    m => m.createReadHashFake('da_grow_probe').run().counts.hashed === 3],
  ['scratch tail hashed', 'this.#scratch.subarray(0, n)', 'this.#scratch',
    m => m.createReadHashFake('normal').run().counts.accepted === 3],
  ['after stamp unchecked', 'after.stamp !== this.#before!.stamp', 'false',
    m => m.createReadHashFake('after_changed').run().firstReason === 'source_changed'],
  ['event replayed on retry', '&& !(live.consumed & (1 << i))', '',
    m => m.createReadHashFake('da_interrupt_shrink').run().counts.received === 2],
];
for (const [i, [name, from, to, holds]] of controls.entries()) {
  assert.equal(source.split(from).length, 2, `mutation site drift: ${name}`);
  const mutant = await compile(source.replace(from, to), `mutant-${i}.js`);
  assert.equal(holds(mutant), false, `surviving negative control: ${name}`);
}
console.log(JSON.stringify({ compiled: true, sourceGrid: 75, rejectedMutations: controls.length,
  compatibilityFactories: 3, cExecution: 'not_connected', authority: 'none' }));
} finally { rmSync(scratch, { recursive: true, force: true }); }
