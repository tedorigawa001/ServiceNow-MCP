import { afterEach, describe, expect, it, vi } from 'vitest';
import { Worker } from 'node:worker_threads';
import { ServiceNowClient } from '../../../src/servicenow/client.js';
import { installAdapterReviewScope } from './adapter-review-scope.js';
import { ReviewTestScope } from './review-test-scope.js';

const client = () => new ServiceNowClient({ instanceUrl: 'https://adapter-timeout.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-adapter-timeout', oauth: { clientId: '', clientSecret: '' } });
const input = { update_set_sys_id: 'a'.repeat(32) };
const denied: typeof fetch = async () => new Response(null, { status: 403 });

describe('adapter managed timeout reproduction', () => {
  const review = installAdapterReviewScope();
  let cancelled = false, settled = false, calls = 0;
  let cancelledAtHook = false;
  let pending: ReturnType<typeof review>;
  // Registered after the shared hook, so it runs first: cancellation must come from the framework signal.
  afterEach(() => { cancelledAtHook ||= cancelled; });
  it('preserves the original framework timeout while aborting and draining the review', async () => {
    // No timer, network or worker: parent fetch remains pending until owner cancellation.
    const fetcher: typeof fetch = (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => { cancelled = true; reject(Error('synthetic_cancel')); }, { once: true });
      });
    };
    pending = review(client(), input, { fetch: fetcher });
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await pending;
  }, 250);
  it('starts the next same-principal review after cleanup, not with review_busy', async () => {
    expect(cancelledAtHook).toBe(true); expect(cancelled).toBe(true); expect(settled).toBe(true); expect(calls).toBe(1);
    expect(await pending).toEqual({ isError: true, error: { stage: 'parent', code: 'cancelled' } });
    const fetcher = vi.fn<typeof fetch>(denied);
    expect(await review(client(), input, { fetch: fetcher })).toEqual({ isError: true,
      error: { stage: 'parent', code: 'access_denied' } });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(calls).toBe(1);
  });
});

describe('adapter worker drain reproduction', () => {
  const review = installAdapterReviewScope();
  const targets = { update_set_sys_id: 'a'.repeat(32), selection_mode: 'review_targets' };
  const fetcher: typeof fetch = async url => Response.json({ result: String(url).includes('/sys_update_set/')
    ? { sys_id: targets.update_set_sys_id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' }
    : String(url).includes('/sys_cluster_state') ? [{ build_name: 'Australia' }] : [{ sys_id: 'invalid' }] });
  let worker: Worker, terminations = 0, clockFakeAtSettle: boolean | undefined;
  let pending: ReturnType<typeof review>;
  it('keeps admission and the injected clock until delayed worker termination settles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    pending = review(client(), targets, { fetch: fetcher, workerFactory: (_url, options) => {
      worker = new Worker('setInterval(() => {}, 1000)', { ...options, eval: true });
      const terminate = worker.terminate.bind(worker);
      // The review cannot settle by itself here: only awaiting the owner can cover this window.
      worker.terminate = async () => { terminations++; await new Promise(resolve => setTimeout(resolve, 300)); return terminate(); };
      return worker;
    } });
    const record = () => { clockFakeAtSettle = vi.isFakeTimers(); };
    void pending.then(record, record);
    await pending;
  }, 250);
  it('admits the same principal only after the worker exited', async () => {
    expect(await review(client(), input, { fetch: denied })).toEqual({ isError: true, error: { stage: 'parent', code: 'access_denied' } });
    expect(worker.threadId).toBe(-1); expect(terminations).toBe(1); expect(clockFakeAtSettle).toBe(true);
    expect(await pending).toMatchObject({ isError: true, error: { code: 'cancelled' } });
  });
});

describe('adapter close failure reproduction', () => {
  installAdapterReviewScope();
  it('reports a failed owner close instead of swallowing it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.spyOn(ReviewTestScope.prototype, 'close').mockRejectedValueOnce(Error('synthetic_close_failure'));
  });
  it('still restores mocks and clocks after that failure', () => {
    expect(vi.isFakeTimers()).toBe(false);
    expect(vi.isMockFunction(ReviewTestScope.prototype.close)).toBe(false);
  });
});
