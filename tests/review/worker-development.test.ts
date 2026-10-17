import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { aggregate } from './fixtures/bp5-results.js';

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
describe('worker execution format boundaries', () => {
  it('uses only the fixed .js entry for a compiled module, even when source/bootstrap files exist', async () => {
    const path = mkdtempSync(join(tmpdir(), 'bp5-compiled-worker-')); temporary.push(path);
    const source = readFileSync(new URL('../../src/review/worker-supervisor.ts', import.meta.url), 'utf8');
    const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
    const entry = join(path, 'worker-supervisor.mjs');
    writeFileSync(entry, compiled);
    const trap = "import { writeFileSync } from 'node:fs'; writeFileSync(new URL('./unexpected-fallback', import.meta.url), 'called');";
    writeFileSync(join(path, 'dev-worker-bootstrap.mjs'), trap);
    writeFileSync(join(path, 'review-worker.ts'), trap);
    const { ReviewWorker } = await import(pathToFileURL(entry).href);
    const cpu = new ReviewWorker({ remainingMs: () => 1000 });
    try {
      await expect(cpu.finish(aggregate())).rejects.toMatchObject({ code: 'worker_unavailable', message: 'worker_unavailable' });
      expect(existsSync(join(path, 'unexpected-fallback'))).toBe(false);
    } finally { await cpu.close(); }
  });
  it('runs the source adapter under the same tsx execution format as dev, without a worker factory', () => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/development-worker-smoke.mjs'],
      { cwd: process.cwd(), encoding: 'utf8', env: {}, timeout: 10000 });
    expect(output.trim()).toBe('Development worker default entry: analysis + aggregation PASS');
  });
});
