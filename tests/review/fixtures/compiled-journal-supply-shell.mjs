/** Scratch-only construction controls, no existing issuer or native I/O dependency. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./journal-supply-shell-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'journal-shell-'));
async function load(text, name) {
  const file = join(dir, name + '.mjs');
  writeFileSync(file, ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  return import(pathToFileURL(file).href);
}
try {
  assert(!/^import /m.test(source), 'construction must not adopt issuer/runtime dependencies');
  const base = await load(source, 'base');
  assert.deepEqual(Object.keys(base), ['createJournalSupplyShellFake']);
  const clauses = [
    ['descriptor_copy', 'd !== issued', 'false'], ['descriptor_extra', 'Reflect.ownKeys(d).length !== 6', 'false'],
    ['descriptor_variant', "d.kind !== 'synthetic_target'", 'false'], ['foreign_start', 'd.start !== start', 'false'],
    ['scope_copy', 'd.scope !== start.scope', 'false'], ['epoch', 'd.epoch !== start.epoch', 'false'], ['packet', 'd.packet !== start.packet', 'false'],
    ['descriptor_brand', 'd[TARGET_BRAND] !== true', 'false'], ['claim_brand', 'claim[CLAIM_BRAND] !== true', 'false'],
    ['claim_target', 'claim.target !== issued', 'false'], ['claim_state', "claim.state !== 'unused'", 'false'],
  ];
  for (const [i, [script, from, to]] of clauses.entries()) {
    assert.equal(source.split(from).length, 2, 'anchor drift ' + script);
    const original = base.createJournalSupplyShellFake(script); original.prepare(); assert.equal(original.inspect().bindings, 0);
    const m = await load(source.replace(from, to), 'mutant-' + i);
    const a = m.createJournalSupplyShellFake(script); a.prepare();
    assert.equal(a.inspect().bindings, 1, 'condition masked ' + script);
    assert.equal(a.inspect().supplyConsumptions, 0); assert.equal(a.inspect().packetObjects, 0);
  }
  const a = base.createJournalSupplyShellFake(); a.prepare(); const first = a.prepare();
  assert.equal(first.first, 'duplicate_preparation'); assert.equal(a.close(), first); assert.equal(a.check(), first);
  const failed = base.createJournalSupplyShellFake('attempt_31'); failed.prepare();
  assert.equal(failed.inspect().retained, 30); assert.equal(failed.inspect().stages[30], 'attempting');
  console.log(JSON.stringify({ compiled: true, bindingControls: clauses.length, partialStart: true, repeatedPreparation: true,
    issuerConnection: 'closed', supplyConsumptions: 0, packetObjects: 0 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
