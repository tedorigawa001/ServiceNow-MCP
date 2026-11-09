/** Offline scratch compilation; only fixed synthetic sources are constructed. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'wfb-pending-binding-'));
const emit = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(source, name) {
  const file = join(scratch, `${name}.js`); writeFileSync(file, emit(source)); return import(pathToFileURL(file).href);
}
try {
  writeFileSync(join(scratch, 'package.json'), '{"type":"module"}');
  writeFileSync(join(scratch, 'source-map-values-core.js'), emit(readFileSync(new URL('./source-map-values-core.ts', import.meta.url), 'utf8')));
  const m = await load(text, 'snapshot-read-composition-fake');
  const thin = await load(readFileSync(new URL('./pending-binding-fake.ts', import.meta.url), 'utf8'), 'thin');
  assert.deepEqual(Object.keys(thin), ['createPendingBindingFake']);
  assert.equal(thin.createPendingBindingFake, m.createPendingBindingFake);
  const normal = m.createPendingBindingFake(); assert.equal(normal.prepare().ok, true);
  assert.deepEqual(Object.keys(normal), ['prepare', 'check', 'close', 'inspect']);
  assert.equal(normal.inspect().claimsConsumed, 0); assert.equal(normal.inspect().rootFinish, 'not_called');
  const guards = [
    ['receipt_copy', 'r !== this.#issuedReceipt'],
    ['receipt_construction', 'r.construction !== scope.construction'],
    ['receipt_retention', 'r.retention !== scope.retention'],
    ['receipt_source_slot', 'r.sourceSlot !== slot'],
    ['receipt_control', 'r.control !== control'],
    ['receipt_core', 'r.core !== control.identity'],
    ['receipt_slots', 'r.slots !== scope.slots'],
    ['core_extra_payload', 'Object.keys(core).length !== 5'],
  ];
  for (const [i, [script, clause]] of guards.entries()) {
    assert.equal(text.split(clause).length, 2, `guard drift: ${script}`);
    const a = m.createPendingBindingFake(script); assert.equal(a.prepare().ok, false);
    const mutant = await load(text.replace(clause, 'false'), `guard-${i}`);
    assert.equal(mutant.createPendingBindingFake(script).prepare().ok, true, `guard sensitivity: ${script}`);
  }
  const controls = [
    ['retired-default-deny', "if (result.ok && this.#normalControl && this.#normalControl.state !== 'unused') return this.reply('supply_closed');",
      "if (result.ok && this.#normalControl && this.#normalControl.state === 'stopped') return this.reply('supply_closed');", 'retire_binding_root_live',
      a => { a.prepare(); return a.inspect().retiredSourceAllowed === false; }],
    ['duplicate', "if (this.#attempts) return this.fail('duplicate_binding');", '', 'normal',
      a => { a.prepare(); return a.prepare().reason === 'duplicate_binding' && a.inspect().retentionTable.R1 === 3; }],
    ['cell-retirement', 'this.#live = undefined; return true;', 'return true;', 'retire_binding',
      a => { a.prepare(); return a.inspect().retentionTable.R7.sourceControl === false; }],
    ['source-stop', "else { canonicalSupplyAccess.fail(a.#root, 'binding_mismatch'); }", 'else { /* omitted */ }', 'before_bind_failure',
      a => { a.prepare(); return a.inspect().source.root.lifecycleFirst === 'binding_mismatch'; }],
    ['source-retention', 'normal: [a.#registry, a.#table, a.#view, a.#buildingRegistry, a.#buildingBindings, a.#buildingDeclarations]',
      'normal: [a.#registry, a.#table, a.#buildingRegistry, a.#buildingBindings, a.#buildingDeclarations]', 'normal',
      a => { a.prepare(); return a.inspect().retentionTable.R1 === 3; }],
  ];
  for (const [i, [label, from, to, script, holds]] of controls.entries()) {
    assert.equal(text.split(from).length, 2, `control drift: ${label}`);
    assert.equal(holds(m.createPendingBindingFake(script)), true);
    const mutant = await load(text.replace(from, to), `control-${i}`);
    assert.equal(holds(mutant.createPendingBindingFake(script)), false, `control sensitivity: ${label}`);
  }
  console.log(JSON.stringify({ compiled: true, bindingMutations: guards.length, lifecycleRetentionMutations: controls.length,
    source: 'synthetic_only', claimsConsumed: 0, finish: 'not_called', authority: 'none' }));
} finally { rmSync(scratch, { recursive: true, force: true }); }
