/** Isolated SS03 controls; does not prepare the actual issuer/start or use I/O. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'canonical-supply-construction-'));
const emit = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(s, n) { const path = join(dir, n + '.js'); writeFileSync(path, emit(s)); return import(pathToFileURL(path).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  for (const name of ['source-map-values-core', 'supply-construction-kernel'])
    writeFileSync(join(dir, name + '.js'), emit(readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8')));
  const base = await load(text, 'base');
  const run = (m, s) => { const a = m.createCanonicalSupplyConstructionFake(s); a.prepare(); return a.inspect(); };
  const clauses = [
    ['target_copy', '&& t === issued &&', '&& true &&'], ['target_extra', 'Reflect.ownKeys(t).length === 5', 'true'],
    ['target_brand', 't[CONSTRUCTION_TARGET_BRAND] === true', 'true'],
    ['claim_brand', 'claim[CONSTRUCTION_CLAIM_BRAND] === true', 'true'], ['claim_target', 'claim.target === issued', 'true'],
    ['claim_state', "claim.state === 'unused'", 'true'], ['start_copy', 't.start === a.#start', 'true'],
    ['epoch', 't.epoch === a.#epoch', 'true'], ['packet', 't.packet === a.#packetOrigin', 'true'],
  ];
  for (const [i, [s, from, to]] of clauses.entries()) {
    assert.equal(text.split(from).length, 2, 'anchor drift ' + s);
    assert.equal(run(base, s).bound, false);
    const result = run(await load(text.replace(from, to), 'mutant-' + i), s);
    assert.equal(result.bound, true, 'masked check ' + s);
    assert.equal(result.issuer.admissionIssues, 0); assert.equal(result.issuer.sealAttempts, 0);
  }
  const failed = run(base, 'attempt_32'); assert.equal(failed.retained, 31); assert.equal(failed.stages[31], 'attempting');
  const normal = run(base, 'normal'); assert.equal(normal.bound, true); assert.equal(normal.issuer.controlState, 'not_created');
  assert.equal(normal.issuer.firstReason, 'none'); assert.equal(normal.journalSupply, 'not_connected');
  console.log(JSON.stringify({ compiled: true, bindingControls: clauses.length, actualIssuerUnused: true, sourcePreparations: 0, writerStop: 'not_connected' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
