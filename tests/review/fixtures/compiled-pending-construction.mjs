/** Scratch ESM tests of isolated, unbound construction; no source/runtime is instantiated. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./pending-construction-fake.ts', import.meta.url), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'wfb-pending-construction-'));
async function compile(text, name) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const file = join(scratch, `${name}.mjs`); writeFileSync(file, js); return import(pathToFileURL(file).href);
}
try {
  const m = await compile(source, 'original');
  assert.deepEqual(Object.keys(m), ['createPendingConstructionFake']);
  const a = m.createPendingConstructionFake(); assert.equal(a.prepare().ok, true);
  assert.deepEqual(Object.keys(a), ['prepare', 'close', 'seal', 'inspect']);
  assert.equal(a.inspect().retainedSlots, 4); assert.equal(a.inspect().confirmedSlots, 4);
  const end = a.seal(); a.close(); a.prepare(); assert.equal(a.seal(), end);
  assert.deepEqual([end.claimsConsumed, end.payloadMoves, end.sourceDetaches, end.holderPublications], [0, 0, 0, 0]);
  assert.equal(end.source, 'not_created'); assert.equal(end.rootFinish, 'not_called');
  const roles = ['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'];
  for (let i = 0; i < roles.length; i++) for (const boundary of ['mint', 'attempt', 'capture']) {
    const f = m.createPendingConstructionFake(`${boundary}_${roles[i]}_failure`); f.prepare();
    assert.equal(f.inspect().retainedSlots, i + (boundary === 'capture' ? 1 : 0));
    assert.equal(f.inspect().confirmedSlots, i); assert.equal(f.inspect().generationStarts, 1);
  }
  const guards = [
    ['mix_pendingShell_copy', 'value === this.#cells[role].value'],
    ['mix_pendingShell_construction', 'value.construction === this.#construction'],
    ['mix_pendingShell_retention', 'value.retention === this.#origin'],
    ['mix_pendingShell_origin', 'value.origin === this.#origins[role]'],
    ['mix_pendingShell_role', 'value.role === role'],
    ['mix_pendingShell_state', "value.state === 'unbound'"],
    ['mix_pendingShell_brand', 'value[SLOT] === true'],
    ['mix_pendingShell_parent', 'value.parent === this.parent(role)'],
    ['mix_pendingShell_payload', 'value.payload === undefined'],
    ['claim_copy', 'claim !== this.#claim'],
    ['claim_construction', 'claim.construction !== this.#construction'],
    ['claim_retention', 'claim.retention !== this.#origin'],
    ['diagnostic_construction', 'this.#diagnostic.construction === this.#construction'],
    ['diagnostic_retention', 'this.#diagnostic.retention === this.#origin'],
    ['result_construction', 'this.#result.construction === this.#construction'],
    ['result_retention', 'this.#result.retention === this.#origin'],
  ];
  for (const [i, [selector, clause]] of guards.entries()) {
    assert.equal(source.split(clause).length, 2, `guard drift: ${selector}`);
    const mutant = await compile(source.replace(clause, clause.includes(' !== ') ? 'false' : 'true'), `guard-${i}`);
    const f = mutant.createPendingConstructionFake(selector);
    assert.equal(f.prepare().ok, true, `surviving guard: ${selector}`);
  }
  const controls = [
    ['generation replay', "if (!claim.begin()) return this.reject('duplicate_generation');", 'claim.begin();',
      f => { f.prepare(); return f.prepare().reason === 'duplicate_generation'; }, 'normal'],
    ['lost provisional reference', "if (this.scenario === `capture_${role}_failure`) return this.reject('capture_unconfirmed');",
      "if (this.scenario === `capture_${role}_failure`) { cell.value = undefined; return this.reject('capture_unconfirmed'); }",
      f => { f.prepare(); return f.inspect().retainedSlots === 1; }, 'capture_pendingShell_failure'],
    ['false confirmed capture', "if (this.scenario === `capture_${role}_failure`) return this.reject('capture_unconfirmed');",
      "if (this.scenario === `capture_${role}_failure`) { cell.stage = 'confirmed'; return this.reject('capture_unconfirmed'); }",
      f => { f.prepare(); return f.inspect().confirmedSlots === 0; }, 'capture_pendingShell_failure'],
    ['sealed prepare mutates', "if (this.#result.value) return this.reply('already_sealed');", '',
      f => { f.seal(); return f.prepare().reason === 'already_sealed'; }, 'normal'],
    ['sealed result replaced', 'if (this.#result.value) return this.#result.value;', '',
      f => { const first = f.seal(); return f.seal() === first; }, 'normal'],
    ['close hides first diagnosis', "return this.reply(this.#diagnostic.first === 'none' ? 'supply_closed' : this.#diagnostic.first);",
      "return this.reply('supply_closed');", f => { f.prepare(); f.prepare(); return f.close().reason === 'duplicate_generation'; }, 'normal'],
  ];
  for (const [i, [label, from, to, holds, selector]] of controls.entries()) {
    // prepare/close intentionally share the same sealed guard; mutate the first (prepare) site only.
    assert.equal(source.split(from).length, label === 'sealed prepare mutates' ? 3 : 2, `control drift: ${label}`);
    const mutant = await compile(source.replace(from, to), `control-${i}`);
    assert.equal(holds(mutant.createPendingConstructionFake(selector)), false, `surviving control: ${label}`);
  }
  console.log(JSON.stringify({ compiled: true, slotAndScopeMutations: guards.length, lifecycleMutations: controls.length,
    prefixes: 12, source: 'not_created', authority: 'none' }));
} finally { rmSync(scratch, { recursive: true, force: true }); }
