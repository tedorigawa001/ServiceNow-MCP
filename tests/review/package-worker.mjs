// Standalone packaging test: npm run test:pack (separate from Vitest).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'bp5-package-'));
const run = (command, args, cwd = root) => execFileSync(command, args,
  { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
try {
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]));
  const files = new Set(packed.files.map(file => file.path));
  assert(files.has('dist/review/review-worker.js'), 'packed worker entry missing');
  assert(files.has('dist/tools/best-practice.js'), 'packed MCP review tool missing');
  for (const path of ['worker-supervisor', 'payload-review', 'update-xml', 'aggregate-finalize', 'aggregate-schema',
    'result-schema', 'result-schema-v2', 'catalog', 'follow-up-catalog', 'scope-analysis', 'constant-value', 'update-set-adapter', 'bounded-source', 'target-selection']) {
    assert(files.has(`dist/review/${path}.js`), `packed runtime module missing: ${path}`);
  }
  assert(![...files].some(path => /^(src|tests)\//.test(path) || path.includes('dev-worker-bootstrap')));
  assert(![...files].some(path => path.startsWith('dist/review/evaluation')),
    'evaluation harness must remain development-only');
  assert(![...files].some(path => path.startsWith('dist/review/search')),
    'search PoC must remain development-only');
  assert(![...files].some(path => path.startsWith('dist/review/r2-')),
    'unregistered R-2 identity PoC must remain development-only');
  run('tar', ['-xzf', join(temporary, packed.filename), '-C', temporary]);
  const installed = join(temporary, 'package');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  for (const dependency of ['acorn', 'saxes', 'zod']) {
    assert(manifest.dependencies[dependency], `${dependency} must be a production dependency`);
    assert(!manifest.devDependencies[dependency], `${dependency} must not be dev-only`);
  }
  // Use the committed lock only for reproducible installation; it is not shipped.
  copyFileSync(join(root, 'package-lock.json'), join(installed, 'package-lock.json'));
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], installed);
  const fixture = join(installed, 'tests/review/fixtures');
  mkdirSync(fixture, { recursive: true });
  copyFileSync(join(root, 'tests/review/fixtures/compiled-worker-smoke.mjs'), join(fixture, 'compiled-worker-smoke.mjs'));
  const output = execFileSync(process.execPath, [join(fixture, 'compiled-worker-smoke.mjs')],
    { cwd: installed, env: {}, encoding: 'utf8', timeout: 15000 });
  assert.equal(output.trim(), 'Compiled worker default entry: analysis + aggregation PASS');
  copyFileSync(join(root, 'tests/review/fixtures/compiled-review-mcp-smoke.mjs'), join(fixture, 'compiled-review-mcp-smoke.mjs'));
  const mcpOutput = execFileSync(process.execPath, [join(fixture, 'compiled-review-mcp-smoke.mjs')],
    { cwd: installed, env: {}, encoding: 'utf8', timeout: 15000 });
  assert.equal(mcpOutput.trim(), 'Packaged MCP review: registration + dispatch + worker PASS');
  for (const devDependency of ['tsx', 'typescript', 'vitest']) {
    assert.throws(() => readFileSync(join(installed, 'node_modules', devDependency, 'package.json')),
      { code: 'ENOENT' });
  }
  console.log(`Packed worker: production-only install + analysis + aggregation PASS (${packed.files.length} files)`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
