/** Offline synthetic issuer controls; no capture/clear/payload evidence/root finish. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const text = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'capture-admission-'));
const emit = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
async function load(source, name) { const f = join(dir, name + '.js'); writeFileSync(f, emit(source)); return import(pathToFileURL(f).href); }
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'source-map-values-core.js'), emit(readFileSync(new URL('./source-map-values-core.ts', import.meta.url), 'utf8')));
  const original = await load(text, 'snapshot-read-composition-fake');
  const thin = await load(readFileSync(new URL('./capture-admission-fake.ts', import.meta.url), 'utf8'), 'thin');
  assert.deepEqual(Object.keys(thin), ['createCaptureAdmissionFake']);
  assert.equal(thin.createCaptureAdmissionFake, original.createCaptureAdmissionFake);
  const clauses = [
    ['scope_owner', 's.owner === expected.owner', 'true'], ['scope_construction', 's.construction === expected.construction', 'true'],
    ['scope_retention', 's.retention === expected.retention', 'true'], ['scope_sourceSlot', 's.sourceSlot === expected.sourceSlot', 'true'],
    ['scope_claim', 's.claim === expected.claim', 'true'],
    ['ack_copy', 'a !== this.#issuedAck', 'false'], ['ack_epoch', 'a.epoch !== this.#epoch', 'false'],
    ['ack_origin', 'a.origin !== this.#ackOrigin', 'false'], ['ack_source', 'a.source === c.source', 'true'], ['ack_root', 'a.root === c.root', 'true'],
    ['ack_extra', 'Object.keys(a).length === 6', 'true'], ['ack_checkpoint', 'a.checkpoint === c.checkpoint', 'true'],
    ['pin_copy', 'p !== this.#issuedPin', 'false'], ['pin_control', 'p.control === c.control.origin', 'true'],
    ['pin_checkpoint', 'p.checkpoint === c.control.checkpoint', 'true'],
    ['admission_copy', 'a === this.#issuedAdmission', 'true'], ['admission_packet', 'a.packet === this.#packetOrigin', 'true'],
    ['admission_ack', 'a.ack === this.#ackOrigin', 'true'], ['admission_pin', 'a.pin === this.#pinOrigin', 'true'],
  ];
  for (const [i, [selector, from, to]] of clauses.entries()) {
    assert.equal(text.split(from).length, 2, 'anchor drift: ' + selector);
    const base = original.createCaptureAdmissionFake(selector); if (!selector.endsWith('checkpoint')) base.prepare();
    assert.equal(base.admit().ok, false);
    const metric = selector.startsWith('scope_') ? 'sealAttempts' : selector.startsWith('ack_') ? 'ackIssues'
      : selector.startsWith('pin_') ? 'pinIssues' : 'admissionIssues';
    assert.equal(base.inspect()[metric], 0);
    const mutant = await load(text.replace(from, to), 'binding-' + i);
    const a = mutant.createCaptureAdmissionFake(selector); if (!selector.endsWith('checkpoint')) a.prepare();
    a.admit(); assert.equal(a.inspect()[metric], 1, 'insensitive condition: ' + selector);
  }
  const gates = [
    ["if (a.#retirementSealed) return undefined;", '', 'context'],
    ['!a.#retirementSealed && a.#supplyState', 'a.#supplyState', 'open'],
  ];
  const rootStart = text.indexOf('class CStartAssembly {'), rootEnd = text.indexOf('export function createSnapshotReadStartFake');
  assert(rootStart > 0 && rootEnd > rootStart);
  const root = text.slice(rootStart, rootEnd), guard = "if (this.#retirementSealed) return this.reply('supply_closed');";
  assert.equal(root.split(guard).length, 4);
  for (let i = 0; i < 3; i++) {
    const parts = root.split(guard); const changed = parts.map((part, n) => part + (n < 3 && n !== i ? guard : '')).join('');
    gates.push([root, changed, ['check', 'begin', 'prepare'][i]]);
  }
  for (const [i, [from, to, gate]] of gates.entries()) {
    assert.equal(text.split(from).length, 2, 'root gate anchor: ' + gate);
    const mutant = await load(text.replace(from, to), 'gate-' + i);
    const a = mutant.createCaptureAdmissionFake('probe_gates'); a.prepare(); a.admit();
    assert.notEqual(a.inspect().rootGates[gate], gate === 'context' || gate === 'open' ? false : 'supply_closed', 'surviving gate: ' + gate);
  }
  const a = original.createCaptureAdmissionFake('normal'); a.prepare(); a.admit(); a.admit();
  assert.equal(a.inspect().admissionIssues, 1); assert.equal(a.inspect().fieldWrites, 0);
  assert.equal(a.inspect().capture, 'not_connected'); assert.equal(a.inspect().rootFinish, 'not_called');
  console.log(JSON.stringify({ compiled: true, bindingControls: clauses.length, rootGates: gates.length, capture: 'not_connected', authority: 'none' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
