/** Isolated canonical gate/draft controls. No frame or operation callbacks are run. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'canonical-gate-draft-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, name) { const f = join(dir, name + '.js'); writeFileSync(f, emit(s)); return import(pathToFileURL(f).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const n of ['source-map-values-core', 'supply-construction-kernel']) writeFileSync(join(dir, n + '.js'), emit(readFileSync(new URL('./' + n + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const run = (m, s) => { const a = m.createCanonicalGateDraftFake(s); a.prepare(); return a.inspect(); };
  const checks = [
    ['seed_copy', 'seed === this.#issuedSeed', 'true'], ['seed_brand', 'seed[CANONICAL_GATE_SEED] === true', 'true'],
    ['seed_extra', 'Reflect.ownKeys(seed).length === 3', 'true'], ['seed_gate', 'seed.gate === gate', 'true'], ['seed_origin', 'seed.origin === this.#seedOrigin', 'true'],
    ['pin_copy', 'p === this.#issued &&', 'true &&'], ['pin_brand', 'p[CANONICAL_GATE_PIN] === true', 'true'],
    ['pin_extra', 'Reflect.ownKeys(p).length === 9', 'true'], ['pin_gate', 'p.gate === this.origin', 'true'], ['pin_scope', 'p.scope === s', 'true'],
    ['pin_owner', 'p.owner === s.owner', 'true'], ['pin_construction', 'p.construction === s.construction', 'true'],
    ['pin_retention', 'p.retention === s.retention', 'true'], ['pin_sourceSlot', 'p.sourceSlot === s.sourceSlot', 'true'],
    ['pin_claim', 'p.claim === s.claim', 'true'], ['pin_epoch', 'p.epoch === this.#epoch', 'true'],
    ['draft_copy', 'd === this.#issuedDraft', 'true'], ['draft_brand', 'd[CANONICAL_FRAME_DRAFT] === true', 'true'],
    ['draft_extra', 'Reflect.ownKeys(d).length === 8', 'true'], ['draft_gate', 'd.gate === g.origin', 'true'], ['draft_pin', 'd.pin === pin', 'true'],
    ['draft_target', 'd.target === t', 'true'], ['draft_entry', 'd.entry === this.#entry', 'true'], ['draft_exit', 'd.exit === this.#exit', 'true'],
    ['draft_kind', "d.kind === 'probe_only'", 'true'], ['draft_executable', 'd.executable === false', 'true'],
    ['binding_seed_copy', 'bindingGateSeedMatches = (a, seed) => a.#gateSeed === seed;', 'bindingGateSeedMatches = () => true;'],
    ['start_seed_copy', 'a.#gateSeed === seed && bindingGateSeedMatches', 'true && bindingGateSeedMatches'],
    ['issuer_seed_copy', 'a.#gateSeed === seed && captureStartAccess.seedMatches', 'true && captureStartAccess.seedMatches'],
  ];
  for (const [i, [script, from, to]] of checks.entries()) {
    assert.equal(text.split(from).length, 2, 'anchor ' + script);
    assert.equal(run(base, script).ready, false);
    const result = run(await load(text.replace(from, to), 'mutant-' + i), script);
    assert.equal(result.ready, true, 'masked guard ' + script);
    assert.equal(result.frameExecutions, 0); assert.equal(result.grantIssues, 0); assert.equal(result.issuer.admissionIssues, 0);
  }
  const from = "if (!issuerConstructionAccess.matches(issuer, target)) return this.fail('binding_mismatch');";
  assert.equal(text.split(from).length, 2);
  const original = run(base, 'scope_owner'); assert.equal(original.phase, 34); assert.equal(original.gate.pinRetained, false);
  const late = run(await load(text.replace(from, ''), 'target-preflight-removed'), 'scope_owner');
  assert.equal(late.gate.pinRetained, true); assert.equal(late.phase, 37); assert.equal(late.ready, false); // Later guard must not mask preflight coverage.
  console.log(JSON.stringify({ compiled: true, identityControls: checks.length, targetPreflightControl: true,
    frameExecutions: 0, grantIssues: 0, journalSupply: 'not_connected' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
