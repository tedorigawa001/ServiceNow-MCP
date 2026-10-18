import { describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { ReviewTestScope } from './fixtures/review-test-scope.js';
import { BOUNDED_LIMITS } from '../../src/servicenow/bounded-read.js';

async function reproduce(pattern: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bp5-timeout-repro-')), output = join(dir, 'results.json');
  const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config',
    'tests/review/fixtures/selection-timeout.config.ts', '--testNamePattern', pattern, '--outputFile', output],
  { env: {}, stdio: ['ignore', 'ignore', 'ignore'] });
  const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
  try {
    const code = await new Promise(resolve => child.once('close', resolve));
    return { code, report: JSON.parse(readFileSync(output, 'utf8')),
      unhandled: JSON.parse(readFileSync(output + '.lifecycle.json', 'utf8')).unhandled_errors };
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); }
}
describe('selection timeout lifecycle reproduction', () => {
  it('reproduces an actual Vitest timeout followed by review_busy without blaming the product deadline', async () => {
    const { code, report, unhandled } = await reproduce('unmanaged timeout reproduction');
    expect(code).toBe(1); expect(report.numFailedTests).toBe(1);
    const results = report.testResults.flatMap((f: {assertionResults: unknown[]}) => f.assertionResults);
    expect(results[0]).toMatchObject({ status: 'failed' });
    expect(results[0].failureMessages.join(' ')).toContain('Test timed out in 250ms');
    expect(results[1]).toMatchObject({ status: 'passed' });
    expect(unhandled).toBe(0);
  }, 30000);
  it('contains a real test timeout with signal forwarding and teardown while preserving the original failure', async () => {
    const { code, report, unhandled } = await reproduce('\\bmanaged timeout reproduction\\b');
    expect(code).toBe(1); expect(report.numFailedTests).toBe(1);
    const results = report.testResults.flatMap((f: {assertionResults: Array<{status: string}>}) => f.assertionResults)
      .filter((r: {status: string}) => !['pending', 'skipped'].includes(r.status));
    expect(results).toHaveLength(2); expect(results[0].status).toBe('failed');
    expect(results[0].failureMessages.join(' ')).toContain('Test timed out in 250ms');
    expect(results[1].status).toBe('passed');
    expect(unhandled).toBe(0);
    const lifecycle = results[0].meta.bp5_review_lifecycle;
    expect(lifecycle).toMatchObject({ aborted: true, pending_reviews: 0, workers: [{ ready_ms: null, exited: true }] });
    expect(lifecycle.workers[0].terminate_ms).toBeTypeOf('number');
    expect(lifecycle.workers[0].exit_ms).toBeTypeOf('number');
  }, 30000);
  it('holds admission during OS termination and releases it only after the original review settles', async ({ signal }) => {
    const scope = new ReviewTestScope(signal);
    const client = () => new ServiceNowClient({ instanceUrl: 'https://cleanup-fixture.service-now.com', authMode: 'per-user',
      perUserBearerToken: 'synthetic-cleanup-only', oauth: { clientId: '', clientSecret: '' } });
    let made!: () => void, requested!: () => void, release!: () => void;
    const created = new Promise<void>(r => { made = r; }), terminating = new Promise<void>(r => { requested = r; });
    const gate = new Promise<void>(r => { release = r; });
    let worker: Worker | undefined;
    const fetcher: typeof fetch = async url => Response.json({ result: String(url).includes('/sys_update_set/')
      ? { sys_id: 'a'.repeat(32), state: 'in progress', application: 'global', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' }
      : String(url).includes('/sys_cluster_state') ? [{ build_name: 'Australia' }] : [{ sys_id: 'invalid' }] });
    signal.addEventListener('abort', release, { once: true });
    const pending = scope.review(client(), { update_set_sys_id: 'a'.repeat(32), selection_mode: 'review_targets' },
      { fetch: fetcher, workerFactory: (_url, options) => {
        worker = new Worker('setInterval(() => {}, 1000)', { ...options, eval: true });
        const terminate = worker.terminate.bind(worker);
        vi.spyOn(worker, 'terminate').mockImplementation(async () => { requested(); await gate; return terminate(); });
        made(); return worker;
      } });
    try {
      await created; const closing = scope.close(); await terminating;
      expect(() => { const probe = client().createBoundedReadSession(); probe.close(); }).toThrowError('review_busy');
      expect(worker?.threadId).not.toBe(-1);
      release(); await closing;
      expect(await pending).toMatchObject({ isError: true, error: { code: 'cancelled' } });
      expect(worker?.threadId).toBe(-1);
      expect(scope.diagnostics()).toMatchObject({ pending_reviews: 0, workers: [{ exited: true }] });
      expect(JSON.stringify(scope.diagnostics())).not.toMatch(/synthetic-cleanup|script|https/);
      const probe = client().createBoundedReadSession(); probe.close();
      expect(BOUNDED_LIMITS).toMatchObject({ deadlineMs: 60000, requestTimeoutMs: 10000 });
    } finally { release(); await scope.close(); signal.removeEventListener('abort', release); vi.restoreAllMocks(); }
  });
});
