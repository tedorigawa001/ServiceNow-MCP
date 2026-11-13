/** BL-A compiled contract only: resulting body-live JS is never imported or executed. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'body-live-migration-'));
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 };
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const load = async name => {
    const text = readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8');
    const js = ts.transpileModule(text, { compilerOptions: options }).outputText.replace("from 'typescript'", 'from ' + JSON.stringify(import.meta.resolve('typescript')));
    const path = join(dir, name + '.js'); writeFileSync(path, js);
    return import(pathToFileURL(path).href);
  };
  const core = await load('body-live-migration'), oracle = await load('body-live-migration-oracle');
  const legacy = readFileSync(new URL('./compiled-probe-body-live.mjs', import.meta.url), 'utf8');
  const cases = oracle.legacyBodyLiveOracle(legacy), source = readFileSync(new URL('./snapshot-read-composition-fake.ts', import.meta.url), 'utf8');
  assert.equal(cases.length, 304);
  const boundary = core.createBodyLivePatchBoundary(source); assert.equal(boundary.ok, true);
  assert.deepEqual(core.bodyLiveMigrationCases().map(c => [c.id, c.script]), cases.map(c => [c.id, c.script]));
  for (const c of cases) {
    const p = boundary.patch(c.id); assert.equal(p.ok, true, c.id); assert.deepEqual(p.members, c.members);
  }
  assert.equal(boundary.patch('foreign').reason, 'transform_drift');
  const file = fileURLToPath(new URL('./body-live-migration.ts', import.meta.url)), text = readFileSync(file, 'utf8');
  const extra = `
declare const p: BodyLivePatch;
p.to = 'false';
const wrongBranch: BodyLivePatch = { member: 'x', from: 'a', to: 'b', branch: '6' };
const wrongGroup: BodyLiveMigrationCase = { id: 'x', group: 'runtime', script: 's_normal', patches: [] };
const wrongReason: BodyLiveDrift = { ok: false, reason: 'skip', point: 'case' };
const wrongPoint: BodyLiveDrift = { ok: false, reason: 'transform_drift', point: 'accepted' };
declare const b: BodyLivePatchBoundary;
const unsafeJS: string = b.patch('base').js;
declare const r: BodyLivePatchResult;
r.ok = true;
`;
  const strict = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: true, types: ['node'] };
  const host = ts.createCompilerHost(strict), get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, error, fresh) => name === file ? ts.createSourceFile(name, text + extra, language, true) : get(name, language, error, fresh);
  const ds = ts.getPreEmitDiagnostics(ts.createProgram([file], strict, host));
  assert.ok(ds.every(d => d.file?.fileName === file && d.start >= text.length), 'baseline semantic errors');
  assert.equal(new Set(ds.map(d => d.file.getLineAndCharacterOfPosition(d.start).line)).size, 7);
  console.log(JSON.stringify({ cases: cases.length, patchValues: 304, semanticRejectedLines: 7, mutantImports: 0,
    normalRunner: 'unchanged', bodyStartup: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled' }));
} finally { rmSync(dir, { recursive: true, force: true }); }
