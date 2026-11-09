/** Scratch-only negative controls. Never adds a registration/issuance path to distributed code. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'absence-journal-'));
const emit = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(text, name) { const f = join(dir, name + '.js'); writeFileSync(f, emit(text)); return import(pathToFileURL(f).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'source-map-values-core.js'), emit(readFileSync(new URL('./source-map-values-core.ts', import.meta.url), 'utf8')));
  writeFileSync(join(dir, 'supply-construction-kernel.js'), emit(readFileSync(new URL('./supply-construction-kernel.ts', import.meta.url), 'utf8')));
  const original = await load(source, 'original');
  const run = (m, script) => { const a = m.createAbsenceJournalFake(script); a.prepare(); a.seal(); return a.inspect(); };
  const normal = run(original, 'normal');
  assert.equal(normal.generationBound, true); assert.equal(normal.source.preparationCommits, 3);
  const mutations = [
    ['owner_copy', 'value.owner === this.#owner', 'true'],
    ['capture_epoch_copy', 'value.captureEpoch === this.#captureEpoch', 'true'],
    ['binding_scope_copy', 'value.bindingScope === b.scope', 'true', 'scope'],
    ['source_identity_copy', 'value.source.identity === sourceIdentity(source)', 'true'],
    ['source_scope_copy', 'value.source.scope === sourceJournalAccess(source).scope', 'true', 'scope'],
    ['source_missing', ': value.source === undefined)', ': true)', 'local'],
  ];
  // These controls bypass each *whole* relevant check, including the independent journal scope check where required.
  for (const [i, [script, from, to, extra]] of mutations.entries()) {
    assert.equal(source.split(from).length, 2, 'anchor drift: ' + script);
    let text = source.replace(from, to);
    if (extra === 'scope') text = text.replace('return scope === this.scope && this.#sealed', 'return true && this.#sealed')
      .replace('c.fact.scope === scope', 'true');
    if (extra === 'local') {
      // Distinct source-backed-to-local mutation: dropping the required source branch must be detected.
      text = source.replace('&& (source ? !!value.source', '&& (source && value.source ? !!value.source').replace(from, to);
    }
    assert.equal(run(original, script).generationBound, false);
    assert.equal(run(await load(text, 'binding-' + i), script).generationBound, true, 'surviving mutation: ' + script);
  }
  const noCommit = 'this.#state = \'prepared\'; this.#journal.commitPreparation(); return this.reply();';
  assert.equal(source.split(noCommit).length, 2);
  const missing = run(await load(source.replace(noCommit, "this.#state = 'prepared'; return this.reply();"), 'no-commit'), 'normal');
  assert.equal(missing.generationBound, false); assert.equal(missing.source.preparationCommits, 0);
  const release = 'this.#journal.release(6, () => { this.#buildingDeclarations = undefined; });';
  assert.equal(source.split(release).length, 2);
  const early = run(await load(source.replace(release, release + ' this.#journal.commitPreparation();'), 'early-commit'), 'view_failure');
  assert.equal(run(original, 'view_failure').source.preparationCommits, 0);
  assert.equal(early.source.preparationCommits, 3, 'premature success publication must be visible');
  const fields = ['registry', 'table', 'view', 'buildingRegistry', 'buildingBindings', 'buildingDeclarations',
    'envelope', 'issuedTable', 'issuedView', 'issuedDeclarations', 'tableOrigin'];
  const clearStart = source.indexOf('  private clear(): void {', source.indexOf('class CanonicalSupplyAssembly'));
  const clearEnd = source.indexOf('  private fail(', clearStart), clear = source.slice(clearStart, clearEnd);
  for (const [i, field] of fields.entries()) {
    const assignment = `this.#${field} = undefined;`; assert.equal(clear.split(assignment).length, 2);
    const changed = source.slice(0, clearStart) + clear.replace(assignment, '') + source.slice(clearEnd);
    const script = i === 3 ? 'registry_0_failure' : i === 4 ? 'bindings_0_failure' : i === 5 ? 'declarations_0_failure' : 'legacy_clear';
    const rejected = run(await load(changed, 'clear-' + i), script);
    assert.equal(rejected.generationBound, false, 'missing field clear: ' + field);
    assert.equal(rejected.source.firstField, i + 1, 'wrong clear rejection field: ' + field);
    assert.equal(rejected.source.cells[i].fact, 'none');
  }
  // Internal-only direct controls exercise finite stamps and fact invalidation, without changing public exports.
  const internal = await load(source + `
    export function boundedHistoryControl() {
      const j = new AbsenceJournal('binding');
      for (let i = 0; i < 65; i++) j.write(17, () => {});
      j.seal(); return j.inspect();
    }
    export function invalidateCandidateControl() {
      const j = new AbsenceJournal('source');
      for (const i of [4,5,6]) { j.write(i, () => {}); j.release(i, () => {}); }
      j.commitPreparation(); j.begin(4); j.seal(); return j.inspect();
    }
  `, 'internal');
  const bounded = internal.boundedHistoryControl();
  assert.equal(bounded.first, 'journal_unconfirmed'); assert.equal(bounded.firstField, 17);
  assert.equal(bounded.cells.find(c => c.field === 17).stamp, 64);
  assert.equal(bounded.cells.find(c => c.field === 17).fact, 'none');
  const invalidated = internal.invalidateCandidateControl();
  assert.equal(invalidated.firstField, 4); assert.equal(invalidated.firstBoundary, 'seal');
  assert.equal(invalidated.cells.find(c => c.field === 4).fact, 'none');
  assert.equal(normal.admissionConsumption, 'closed'); assert.equal(normal.packetGeneration, 'closed');
  console.log(JSON.stringify({ compiled: true, bindingMutations: mutations.length, missingCommit: true, earlyCommit: true, legacyClearControls: fields.length,
    stampOverflow: true, staleFactInvalidation: true, admissionConsumption: 'closed', packetGeneration: 'closed' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
