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
assert.deepEqual(Object.keys(original), ['createCanonicalSupplyTransferFake', 'createCanonicalSupplyViewFake', 'createReadHashFake', 'createSnapshotReadStartFake', 'createSupplyBoundaryFake']);
for (const name of ['shared-read-hash-kernel-fake', 'read-hash-fake', 'snapshot-read-start-fake', 'canonical-supply-view-fake', 'canonical-supply-transfer-fake', 'supply-boundary-fake']) {
  const facade = await compile(readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8'), `${name}.js`);
  const factory = name === 'snapshot-read-start-fake' ? 'createSnapshotReadStartFake'
    : name === 'canonical-supply-view-fake' ? 'createCanonicalSupplyViewFake'
      : name === 'canonical-supply-transfer-fake' ? 'createCanonicalSupplyTransferFake'
        : name === 'supply-boundary-fake' ? 'createSupplyBoundaryFake' : 'createReadHashFake';
  assert.deepEqual(Object.keys(facade), [factory]);
  assert.equal(facade[factory], original[factory]);
}
const c = original.createSnapshotReadStartFake(); c.begin(); c.prepare();
assert.equal(c.inspect().readState, 'prepared');
assert.equal(c.inspect().readKernel, 'not_connected');
assert.deepEqual([c.inspect().counts.open, c.inspect().counts.read, c.inspect().counts.hash, c.inspect().counts.cleanup], [0, 0, 0, 0]);
c.finish();
const supply = original.createCanonicalSupplyViewFake(); supply.begin(); supply.prepare();
assert.equal(supply.prepareSupply().ok, true);
assert.deepEqual(supply.inspect().fileSlots.map(f => f.id), ['F01', 'F02', 'O01', 'T01']);
assert.equal(supply.inspect().transferClaim, 'not_issued');
assert.equal(supply.prepareSupply().reason, 'duplicate_preparation');
assert.equal(supply.finish().retainedView, false);
const boundary = original.createSupplyBoundaryFake(); boundary.prepare(); boundary.close();
assert.equal(boundary.checkNormal().reason, 'supply_closed');
assert.equal(boundary.checkRelation().ok, true);
assert.equal(boundary.inspect().source.retainedTable, true);
assert.equal(boundary.inspect().source.counts.discardPasses, 0);
const boundaryControls = [
  ['source gate bypass', [["if (result.ok && this.#normalControl?.state === 'stopped') return this.reply('supply_closed');", '']], 'control_stop_only',
    a => a.inspect().sourceNormalAllowed === false],
  ['foreign control admitted', [['a.#normalControl === control && control.state', 'true && control.state']], 'control_copy',
    a => a.checkNormal().reason === 'binding_mismatch'],
  ['unissued payload wrapper', [['this.#payload === this.#issuedPayload', 'true']], 'payload_copy', a => a.checkRelation().ok === false],
  ['unissued anchor wrapper', [['this.#anchor === this.#issuedAnchor', 'true']], 'anchor_copy', a => a.checkRelation().ok === false],
  ['copied registry', [['p.registry !== anchor.registry', 'false']], 'registry_copy', a => a.checkRelation().ok === false],
  ['copied envelope', [['p.envelope !== anchor.envelope', 'false'], ['p.table.envelope !== p.envelope', 'false'],
    ['p.view.envelope !== p.envelope', 'false']], 'envelope_copy', a => a.checkRelation().ok === false],
  ['copied table', [['p.table !== anchor.table', 'false'], ['p.view.table !== p.table', 'false']], 'table_copy', a => a.checkRelation().ok === false],
  ['copied view', [['p.view !== anchor.view', 'false']], 'view_copy', a => a.checkRelation().ok === false],
  ['copied declarations', [['p.declarations !== anchor.declarations', 'false'], ['p.view.declarations !== p.declarations', 'false']],
    'declarations_copy', a => a.checkRelation().ok === false],
  ['live-context-dependent relation', [['function inspectPayloadRelation(anchor: SupplyIssuanceAnchor, p: PreparedSupplyPayload): boolean {',
    'function inspectPayloadRelation(anchor: SupplyIssuanceAnchor, p: PreparedSupplyPayload): boolean { if (!supplyTransferAccess.matches(anchor.sourceOwner, anchor)) return false;']],
    'close_before_relation', a => a.checkRelation().ok === true],
  ['close clears source', [["if (kind === 'close') a.#root.close();", "if (kind === 'close') a.close();"]], 'close_before_relation',
    a => a.inspect().source.retainedRegistry && a.inspect().source.counts.discardPasses === 0],
  ['failure clears source', [["else canonicalSupplyAccess.fail(a.#root, 'binding_mismatch');", "else a.fail('binding_mismatch');"]],
    'failure_before_relation', a => a.inspect().source.retainedView && a.inspect().source.counts.discardPasses === 0],
  ['stopping the untrusted copy', [["if (this.#issuedControl) boundaryStop(this.#source, this.#issuedControl, 'failure');",
    "if (this.#control) boundaryStop(this.#source, this.#control, 'failure');"]], 'control_copy',
    a => { a.checkNormal(); return a.inspect().sourceNormalAllowed === false; }],
  ['control stop omitted', [["control.stop(kind === 'close' ? 'supply_closed' : 'binding_mismatch');", '']], 'close_before_relation',
    a => a.inspect().controlState === 'stopped'],
];
for (const [i, [label, replacements, selector, holds]] of boundaryControls.entries()) {
  let text = source;
  for (const [from, to] of replacements) {
    assert.equal(text.split(from).length, 2, `boundary mutation drift: ${label}`); text = text.replace(from, to);
  }
  const m = await compile(text, `boundary-mutant-${i}.js`);
  const a = m.createSupplyBoundaryFake(selector); a.prepare();
  assert.equal(holds(a), false, `surviving boundary control: ${label}`);
}
const boundaryValueControls = [
  ['table_envelope', 'p.table.envelope !== p.envelope'], ['view_envelope', 'p.view.envelope !== p.envelope'],
  ['view_table', 'p.view.table !== p.table'], ['table_origin', 'p.table.origin !== p.tableOrigin'],
  ['view_declarations', 'p.view.declarations !== p.declarations'], ['registry_file', 'entry.file !== canonical'],
  ['registry_ordinal', 'entry.ordinal !== ordinal'], ['duplicate_origin', 'origins.has(entry.origin)'],
  ['record_origin', 'entry.source.origin !== entry.origin'], ['record_shape', '!validRecord(entry.source)'],
  ['record_size', 'entry.source.bytes.length > canonical.expectedBytes + 1'], ['link_file', 'link.file !== canonical'],
  ['link_ordinal', 'link.ordinal !== ordinal'], ['link_origin', 'link.origin !== entry.origin'],
  ['link_table_origin', 'link.tableOrigin !== p.tableOrigin'], ['link_source', 'link.source !== entry.source'],
  ['declaration_file', 'decl.file !== canonical'], ['declaration_ordinal', 'decl.ordinal !== ordinal'],
  ['declaration_binding', 'decl.binding !== link'],
];
const rebuilt = original.createSupplyBoundaryFake('value_rebuild_control'); rebuilt.prepare();
assert.equal(rebuilt.checkRelation().ok, true); assert.equal(rebuilt.inspect().valueOnlyProbe, true);
for (const [i, [field, clause]] of boundaryValueControls.entries()) {
  assert.equal(source.split(clause).length, 2, `boundary value mutation drift: ${field}`);
  const m = await compile(source.replace(clause, 'false'), `boundary-value-mutant-${i}.js`);
  const a = m.createSupplyBoundaryFake(`value_${field}`); a.prepare();
  assert.equal(a.checkRelation().ok, true, `surviving boundary value control: ${field}`);
  assert.equal(a.inspect().claimsConsumed, 0);
}
// Tail-truncated count controls: without the count clause the per-entry walk no longer rejects the
// shortened array cleanly (it either accepts or throws), so the original binding rejection must disappear.
const boundaryCountControls = [
  ['registry_count', 'p.registry.length !== files.length'], ['binding_count', 'p.table.bindings.length !== files.length'],
  ['declaration_count', 'p.declarations.length !== files.length'],
];
for (const [i, [field, clause]] of boundaryCountControls.entries()) {
  assert.equal(source.split(clause).length, 2, `boundary count mutation drift: ${field}`);
  const kept = original.createSupplyBoundaryFake(`value_${field}`); kept.prepare();
  assert.equal(kept.checkRelation().reason, 'binding_mismatch');
  const m = await compile(source.replace(clause, 'false'), `boundary-count-mutant-${i}.js`);
  const a = m.createSupplyBoundaryFake(`value_${field}`); a.prepare();
  let outcome; try { outcome = a.checkRelation().reason ?? 'accepted'; } catch { outcome = 'threw'; }
  assert.notEqual(outcome, 'binding_mismatch', `surviving boundary count control: ${field}`);
}
const transfer =original.createCanonicalSupplyTransferFake();
assert.equal(transfer.prepare().ok, true);
assert.equal(transfer.inspect().source.retainedView, true);
assert.equal(transfer.inspect().retainedAnchor, true);
assert.equal(transfer.inspect().counts.claimsConsumed, 0);
assert.equal(transfer.inspect().counts.sourceDetaches, 0);
assert.equal(transfer.inspect().counts.holderPublications, 0);
assert.equal(transfer.finish().retainedAnchor, false);
const transferControls = [
  ['anchor_copy', ['a !== this.#issuedAnchor']],
  ['anchor_owner', ['a.transferOwner !== this.#owner']],
  ['anchor_source', ['anchor.sourceOwner === a']],
  ['anchor_envelope', ['e === a.#envelope']],
  ['anchor_registry', ['anchor.registry === a.#registry']],
  ['anchor_table', ['anchor.table === a.#table', 'anchor.table === a.#issuedTable']],
  ['anchor_view', ['anchor.view === a.#view', 'anchor.view === a.#issuedView']],
  ['anchor_declarations', ['anchor.declarations === a.#issuedDeclarations']],
  ['anchor_origin', ['anchor.tableOrigin === a.#tableOrigin']],
  ['claim_copy', ['c !== this.#issuedClaim']],
  ['claim_owner', ['c.owner !== this.#owner']],
  ['claim_source', ['c.source !== this.#source']],
  ['claim_anchor', ['c.anchor !== a']],
  ['claim_receiver', ['c.receiver !== this.#receiver']],
  ['claim_brand', ['c[TRANSFER_BRAND] !== true']],
  ['claim_state', ["c.state !== 'unused'"]],
  ...['copy', 'role', 'owner', 'source', 'anchor', 'claim', 'receiver', 'payload'].map(field => [
    `pending_${field}`, [field === 'copy' ? 'shell !== this.#issuedShells[role]'
      : field === 'role' ? 'shell.role !== role' : field === 'owner' ? 'shell.owner !== this.#owner'
        : field === 'source' ? 'shell.source !== this.#source' : field === 'anchor' ? 'shell.anchor !== a'
          : field === 'claim' ? 'shell.claim !== c' : field === 'receiver' ? 'shell.receiver !== this.#receiver'
            : 'shell.payload !== undefined'],
  ]),
];
for (const [i, [selector, clauses]] of transferControls.entries()) {
  let text = source;
  for (const clause of clauses) {
    assert.equal(text.split(clause).length, 2, `transfer mutation drift: ${selector}`);
    text = text.replace(clause, clause.includes(' !== ') ? 'false' : 'true');
  }
  const m = await compile(text, `transfer-mutant-${i}.js`);
  const a = m.createCanonicalSupplyTransferFake(selector);
  assert.notEqual(a.prepare().reason, 'binding_mismatch', `surviving transfer control: ${selector}`);
  a.finish();
}
const transferRetirementControls = [
  ['this.#anchor = undefined; this.#issuedAnchor = undefined;', 'this.#issuedAnchor = undefined;'],
  ['this.#anchor = undefined; this.#issuedAnchor = undefined;', 'this.#anchor = undefined;'],
  ['this.#claim = undefined; this.#issuedClaim = undefined;', 'this.#issuedClaim = undefined;'],
  ['this.#claim = undefined; this.#issuedClaim = undefined;', 'this.#claim = undefined;'],
  ['this.#shells = {}; this.#issuedShells = {};', 'this.#issuedShells = {};'],
  ['this.#shells = {}; this.#issuedShells = {};', 'this.#shells = {};'],
  ['this.clearPreparatory(); this.#source.finish();', 'this.#source.finish(); this.clearPreparatory();'],
];
for (const [i, [from, to]] of transferRetirementControls.entries()) {
  assert.equal(source.split(from).length, 2, `transfer retirement site drift: ${i}`);
  const m = await compile(source.replace(from, to), `transfer-retirement-mutant-${i}.js`);
  const a = m.createCanonicalSupplyTransferFake(); a.prepare();
  const end = a.finish();
  assert.equal(!end.retainedAnchor && !end.retainedClaim && end.retainedShells === 0
    && end.anchorRetiredWithBorrowLive === true, false, `surviving transfer retirement control: ${i}`);
}
const supplyControls = [
  ['source binding unchecked', [['binding.source !== registry.source', 'false']], 'record_swap',
    s => s.prepareSupply().reason === 'binding_mismatch'],
  ['canonical reference replaced with ID equality', [['binding.file !== file', 'binding.file.id !== file.id'],
    ['declaration.file !== file', 'declaration.file.id !== file.id']], 'binding_file_copy',
    s => s.prepareSupply().reason === 'binding_mismatch'],
  ['unissued view accepted', [['v !== this.#issuedView', 'false']], 'view_copy',
    s => s.prepareSupply().reason === 'binding_mismatch'],
  ['preparation claim replayed', [["if (this.#state !== 'unused') return this.fail('duplicate_preparation');", '']], 'normal',
    s => { s.prepareSupply(); return s.prepareSupply().reason === 'duplicate_preparation' && s.inspect().counts.preparationClaims === 1; }],
  ['partial references retained', [['this.#buildingRegistry = undefined; this.#buildingBindings = undefined; this.#buildingDeclarations = undefined;', '']], 'registry_2_failure',
    s => { s.prepareSupply(); return s.inspect().retainedBuilding === false; }],
  ['actual length treated as binding', [['|| registry.source.bytes.length > file.expectedBytes + 1',
    '|| registry.source.initialLength !== file.expectedBytes || registry.source.bytes.length > file.expectedBytes + 1']], 'source_short',
    s => s.prepareSupply().ok === true],
];
for (const [i, [name, replacements, selector, holds]] of supplyControls.entries()) {
  let text = source;
  for (const [from, to] of replacements) { assert.equal(text.split(from).length, 2, `supply mutation drift: ${name}`); text = text.replace(from, to); }
  const m = await compile(text, `supply-mutant-${i}.js`);
  const s = m.createCanonicalSupplyViewFake(selector); s.begin(); s.prepare();
  assert.equal(holds(s), false, `surviving supply control: ${name}`); s.finish();
}
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
  supplyMutationControls: supplyControls.length, transferMutationControls: transferControls.length,
  transferRetirementControls: transferRetirementControls.length,
  boundaryMutationControls: boundaryControls.length,
  boundaryValueMutationControls: boundaryValueControls.length, boundaryCountMutationControls: boundaryCountControls.length,
  compatibilityFactories: 6, cExecution: 'not_connected', authority: 'none' }));
} finally { rmSync(scratch, { recursive: true, force: true }); }
