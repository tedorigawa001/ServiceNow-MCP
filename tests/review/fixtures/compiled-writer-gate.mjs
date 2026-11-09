/** Pure gate controls; scratch modules import no real frame/writer/runtime. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./writer-gate-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pure-writer-gate-'));
async function load(source, name) {
  const file = join(dir, name + '.mjs'); writeFileSync(file, ts.transpileModule(source,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  return import(pathToFileURL(file).href);
}
try {
  assert(!/^import /m.test(text));
  const original = await load(text, 'base'); assert.deepEqual(Object.keys(original), ['createWriterGateFake']);
  const checks = [
    ['pin_copy', 'p === this.#issuedPin'], ['pin_extra', 'Reflect.ownKeys(p).length === 9'], ['pin_brand', 'p[PIN] === true'],
    ['pin_gate', 'p.gate === this.#gate'], ['pin_scope', 'p.scope === s'], ['pin_owner', 'p.owner === s.owner'],
    ['pin_construction', 'p.construction === s.construction'], ['pin_retention', 'p.retention === s.retention'],
    ['pin_sourceSlot', 'p.sourceSlot === s.sourceSlot'], ['pin_claim', 'p.claim === s.claim'], ['pin_epoch', 'p.epoch === s.epoch'],
    ['grant_copy', 'g === this.#issuedGrant'], ['grant_extra', 'Reflect.ownKeys(g).length === 7'], ['grant_brand', 'g[GRANT] === true'],
    ['grant_gate', 'g.gate === this.#gate'], ['grant_owner', 'g.owner === this.#scope.owner'], ['grant_pin', 'g.pin === this.#issuedPin'],
    ['grant_epoch', 'g.epoch === this.#scope.epoch'], ['grant_frame', 'g.frame === this.#frameOrigin'], ['grant_phase', "g.phase === 'generation'"],
  ];
  for (const [i, [script, from]] of checks.entries()) {
    assert.equal(text.split(from).length, 2, 'anchor ' + script);
    const a = original.createWriterGateFake(script); const bind = a.bind(); const rejected = script.startsWith('pin_') ? bind : a.enter();
    assert.equal(rejected.first, 'binding_mismatch');
    const m = await load(text.replace(from, 'true'), 'mutation-' + i), b = m.createWriterGateFake(script);
    const allowed = b.bind(); if (script.startsWith('pin_')) assert.equal(allowed.ok, true, 'masked pin ' + script);
    else assert.equal(b.enter().ok, true, 'masked grant ' + script);
    assert.equal(b.inspect().realWriterCalls, 0);
  }
  const a = original.createWriterGateFake('grant_mint'); a.bind(); a.enter();
  const before = a.inspect(); a.enter(); a.closeGate(); assert.deepEqual(a.inspect(), before);
  assert.equal(before.generationUsed, true); assert.equal(before.grantRetained, false); assert.equal(before.grantStage, 'attempting');
  console.log(JSON.stringify({ compiled: true, identityControls: checks.length, failureRetention: true,
    realFrame: 'not_connected', realWriterCalls: 0, closedEvidence: 'not_issued' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
