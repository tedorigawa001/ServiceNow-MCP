import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { ServiceNowClient } from '../../../src/servicenow/client.js';
import { reviewBoundedUpdateSet } from '../../../src/review/update-set-adapter.js';
import { sourceWorkerFactory } from './worker-factory.js';
import { ReviewTestScope } from './review-test-scope.js';

const client = () => new ServiceNowClient({ instanceUrl: 'https://timeout-fixture.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-timeout-only', oauth: { clientId: '', clientSecret: '' } });
const input = { update_set_sys_id: 'a'.repeat(32), selection_mode: 'review_targets' };
const fetcher: typeof fetch = async url => Response.json({ result: String(url).includes('/sys_update_set/')
  ? { sys_id: input.update_set_sys_id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' }
  : String(url).includes('/sys_cluster_state') ? [{ build_name: 'Australia' }] : [{ sys_id: 'invalid-metadata' }] });

describe('unmanaged timeout reproduction', () => {
  const root = new AbortController(), gate = new Int32Array(new SharedArrayBuffer(4));
  let pending: ReturnType<typeof reviewBoundedUpdateSet>, worker: Worker;
  let contextAborted = false;
  it('origin times out without cancelling the owned review', async ({ signal }) => {
    signal.addEventListener('abort', () => { contextAborted = true; }, { once: true });
    pending = reviewBoundedUpdateSet(client(), input, { fetch: fetcher, signal: root.signal,
      workerFactory: (_url, options) => worker = new Worker(new URL('./selection-timeout-worker.mjs', import.meta.url),
        { ...options, workerData: { gate: gate.buffer } }) });
    await pending;
  }, 250);
  it('follower observes review_busy until the original worker and review settle', async () => {
    try {
      expect(contextAborted).toBe(true); expect(root.signal.aborted).toBe(false); expect(worker.threadId).not.toBe(-1);
      const blocked = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, workerFactory: sourceWorkerFactory });
      expect(blocked).toMatchObject({ isError: true, error: { code: 'review_busy' } });
    } finally {
      root.abort(); Atomics.store(gate, 0, 1); Atomics.notify(gate, 0); await pending;
    }
    expect(worker.threadId).toBe(-1);
    const recovered = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, workerFactory: sourceWorkerFactory });
    expect(recovered).toMatchObject({ isError: true, error: { code: 'metadata_unavailable' }, result: { assets: [] } });
  });
});

describe('managed timeout reproduction', () => {
  let scope: ReviewTestScope, worker: Worker;
  const gate = new Int32Array(new SharedArrayBuffer(4));
  beforeEach(context => {
    const owned = new ReviewTestScope(context.signal); scope = owned;
    context.onTestFinished(() => { Object.assign(context.task.meta, { bp5_review_lifecycle: owned.diagnostics() }); });
  });
  afterEach(async () => { await scope.close(); });
  it('origin still fails its test deadline while cancellation drains its review', async () => {
    await scope.review(client(), input, { fetch: fetcher,
      workerFactory: (_url, options) => worker = new Worker(new URL('./selection-timeout-worker.mjs', import.meta.url),
        { ...options, workerData: { gate: gate.buffer } }) });
  }, 250);
  it('follower starts after worker exit and sees metadata_unavailable rather than review_busy', async () => {
    expect(worker.threadId).toBe(-1);
    const result = await scope.review(client(), input, { fetch: fetcher });
    expect(result).toMatchObject({ isError: true, error: { code: 'metadata_unavailable' }, result: { assets: [] } });
  });
});
