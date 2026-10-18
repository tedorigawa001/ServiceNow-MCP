import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedPlanFixture } from './fixtures/r2-approved-plan.js';

let dir: string, entry: string;
beforeAll(() => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  dir = mkdtempSync(join(realpathSync(tmpdir()), 'r2-compiled-entry-'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}', { mode: 0o600 });
  symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'), 'dir');
  execFileSync(process.execPath, [join(repo, 'node_modules/typescript/bin/tsc'), '-p', join(repo, 'tsconfig.json'),
    '--outDir', join(dir, 'dist')], { timeout: 30000, stdio: 'pipe' });
  entry = join(dir, 'dist/review/r2-launcher-entry.js');
}, 35000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
async function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
}
it('uses the real compiled entry and fails closed on a non-TTY without printing a path or exception', async () => {
  expect(await run([entry, '/PRIVATE_MISSING'])).toEqual({ code: 81, stdout: '', stderr: '' });
});
const fixture = fileURLToPath(new URL('./fixtures/r2-launcher-offline.mjs', import.meta.url));
it('checks a synthetic manifest through compiled entry and checker with forbidden OS effects trapped in both processes', async () => {
  const f = approvedPlanFixture();
  try {
    for (const args of [[f.path], ['check-plan', f.path]]) {
      const result = await run([fixture, entry, 'offline', ...args]);
      expect(result).toMatchObject({ code: 0, stdout: '' });
      expect(JSON.parse(result.stderr)).toMatchObject({ status: 'offline_valid', pdi: 'not_verified' });
      expect(result.stderr).not.toMatch(/PRIVATE|service-now|clientId|expectedUser|manifest\.json/);
    }
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
it.each([['offline', 10, ['/PRIVATE_MISSING']], ['usage', 64, ['run', '/PRIVATE_MISSING', '--yes']],
  ['non-tty', 81, ['/PRIVATE_MISSING']], ['throw', 81, ['/PRIVATE_MISSING']], ['blocked', 81, ['/PRIVATE_MISSING']],
  ['fatal', 70, ['/PRIVATE_MISSING']], ['guard-73', 73, []], ['guard-71', 71, []], ['guard-unknown', 70, []],
  ['guard-throw', 70, []], ['guard-priority', 73, []]] as const)(
  'exits safely for %s in an owned compiled process', async (mode, code, args) => {
    const result = await run([fixture, entry, mode, ...args]);
    expect(result.code).toBe(code); expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/PRIVATE|Error|stack|service-now/);
    if (['throw', 'blocked', 'fatal', 'guard-73', 'guard-71', 'guard-unknown', 'guard-throw', 'guard-priority', 'non-tty'].includes(mode)) expect(result.stderr).toBe('');
  });
it('rejects inherited environment and Node flags without a diagnostic containing their values', async () => {
  expect(await run([entry, '/PRIVATE_MISSING'], { PRIVATE_TOKEN: 'PRIVATE_ENV' })).toEqual({ code: 64, stdout: '', stderr: '' });
  expect(await run(['--trace-warnings', entry, '/PRIVATE_MISSING'])).toEqual({ code: 64, stdout: '', stderr: '' });
});
it('returns a fixed fatal exit if its fixed body cannot be imported, without printing loader diagnostics', async () => {
  const missing = join(dir, 'missing-body'); mkdirSync(missing);
  for (const name of ['r2-launcher-entry.js', 'r2-launcher-bootstrap.js'])
    copyFileSync(join(dir, 'dist/review', name), join(missing, name));
  expect(await run([join(missing, 'r2-launcher-entry.js'), '/PRIVATE_MISSING'])).toEqual({ code: 70, stdout: '', stderr: '' });
});
it('dispatches run through checker and synthetic cooked TTY denial without a host or network (compiled entry)', async () => {
  const f = approvedPlanFixture();
  try {
    const result = await run([fileURLToPath(new URL('./fixtures/r2-launcher-run.mjs', import.meta.url)), entry, 'deny', f.path]);
    expect(result).toMatchObject({ code: 82, stdout: '' });
    expect(result.stderr).toContain('approval_denied'); expect(result.stderr).toContain('Type APPROVE');
    expect(result.stderr).not.toMatch(/PRIVATE|service-now|manifest\.json/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
it.each(['approve', 'changed', 'expire-before', 'expire-after', 'bad-digest', 'raw'] as const)(
  'enforces approval + bound grant and fail-closed transitions for %s (compiled entry/OS peer)', async mode => {
    const f = approvedPlanFixture();
    try {
      const result = await run([fileURLToPath(new URL('./fixtures/r2-launcher-run.mjs', import.meta.url)), entry, mode, f.path]);
      expect(result).toMatchObject({ code: 10, stdout: '' });
      expect(result.stderr).not.toMatch(/PRIVATE|service-now|manifest\.json|content|script/);
      if (['expire-before', 'raw'].includes(mode)) expect(result.stderr).not.toContain('Type APPROVE');
      if (mode === 'approve') {
        expect(result.stderr.match(/bp5-r2-exit-summary-0.1/g)).toHaveLength(1);
        expect(result.stderr.match(/http:\/\/127\.0\.0\.1:18765\/bp5\/start/g)).toHaveLength(1);
        expect(result.stderr).toContain('"token_issuance":"not_attempted"');
      } else expect(result.stderr).not.toContain('http://127.0.0.1:18765/bp5/start');
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });
