/** In-memory compiled synthetic proof and negative controls; no source hash, files written or live I/O. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./shared-read-hash-kernel-fake.ts', import.meta.url), 'utf8');
async function compile(text) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const original = await compile(source);
assert.deepEqual(Object.keys(original), ['createReadHashFake']);
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
for (const [name, from, to, holds] of controls) {
  assert.equal(source.split(from).length, 2, `mutation site drift: ${name}`);
  const mutant = await compile(source.replace(from, to));
  assert.equal(holds(mutant), false, `surviving negative control: ${name}`);
}
console.log(JSON.stringify({ compiled: true, sourceGrid: 75, rejectedMutations: controls.length, authority: 'none' }));
