import { afterEach, describe, expect, it, vi } from 'vitest';
import { Worker } from 'node:worker_threads';
import { getEventListeners } from 'node:events';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { reviewBoundedUpdateSet, type ReviewAdapterOptions } from '../../src/review/update-set-adapter.js';
import { sourceWorkerFactory } from './fixtures/worker-factory.js';

const parent = 'a'.repeat(32), id = '1'.repeat(32);
const input = { update_set_sys_id: parent };
const client = (token = 'synthetic-worker-user') => new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: token, oauth: { clientId: '', clientSecret: '' } });
function fixture() {
  const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
  const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
  return vi.fn<typeof fetch>(async url => {
    const u = new URL(String(url));
    const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
      : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
        : u.searchParams.get('sysparm_fields')?.includes('payload') ? [{ ...row,
          payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><when>after</when><script><![CDATA[/* SYNTHETIC_PRIVATE_BODY */ current.update();]]></script></sys_script></record_update>` }]
          : [{ ...row, type: 'Business Rule' }];
    return new Response(JSON.stringify({ result }));
  });
}
describe('BP-5 worker and acquisition lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());
  it('returns worker_unavailable through the adapter and releases admission after startup failure', async () => {
    const factory = vi.fn(() => { throw new Error('SYNTHETIC_PRIVATE_STARTUP_ERROR'); });
    expect(await reviewBoundedUpdateSet(client(), input, { fetch: fixture(), workerFactory: factory }))
      .toEqual({ isError: true, error: { stage: 'analysis', code: 'worker_unavailable' } });
    expect(factory).toHaveBeenCalledTimes(1);
    expect((await reviewBoundedUpdateSet(client(), input, { fetch: fixture() })).isError).toBe(false);
  });
  it('preserves input rejection before admission even when the caller already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = fixture();
    expect(await reviewBoundedUpdateSet(client(), { ...input, max_records: 101 }, { fetch: fetcher, signal: controller.signal }))
      .toEqual({ isError: true, error: { stage: 'input', code: 'invalid_input' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('holds both process-wide admission slots until their workers exit, then allows a new principal', async () => {
    const controls = [new AbortController(), new AbortController()];
    const flags = [new SharedArrayBuffer(4), new SharedArrayBuffer(4)];
    const workers: Worker[] = [];
    const jobs = controls.map((controller, i) => reviewBoundedUpdateSet(client(`principal-${i}`), input,
      { fetch: fixture(), signal: controller.signal, limits: { deadlineMs: 3000 }, workerFactory: (_url, options) => {
        const worker = new Worker(new URL('./fixtures/review-worker-bootstrap.mjs', import.meta.url),
          { ...options, workerData: { blockKind: 'analyze', started: flags[i] } });
        workers.push(worker); return worker;
      } }));
    try {
      const until = performance.now() + 2500;
      while (flags.some(flag => !Atomics.load(new Int32Array(flag), 0)) && performance.now() < until) await new Promise(r => setTimeout(r, 5));
      expect(flags.map(flag => Atomics.load(new Int32Array(flag), 0))).toEqual([1, 1]);
      expect(await reviewBoundedUpdateSet(client('third'), input, { fetch: fixture(), workerFactory: sourceWorkerFactory }))
        .toEqual({ isError: true, error: { stage: 'input', code: 'review_busy' } });
    } finally {
      controls.forEach(controller => controller.abort());
      await Promise.all(jobs);
    }
    expect(workers.every(worker => worker.threadId === -1)).toBe(true);
    expect((await reviewBoundedUpdateSet(client('third'), input, { fetch: fixture(), workerFactory: sourceWorkerFactory })).isError).toBe(false);
  });
  it('never sends credentials or connection URLs to the CPU worker', async () => {
    const sent: unknown[] = [];
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fixture(), workerFactory: (url, options) => {
      expect(options.env).toEqual({}); expect(options.workerData).toBeUndefined();
      const worker = sourceWorkerFactory(url, options);
      const post = worker.postMessage.bind(worker);
      worker.postMessage = value => { sent.push(value); post(value); };
      return worker;
    } });
    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(2);
    expect(JSON.stringify(sent)).not.toMatch(/synthetic-worker-user|https:\/\/example.service-now.com/);
    expect(JSON.stringify(outcome)).not.toContain('SYNTHETIC_PRIVATE_BODY');
  });
  it.each(['release', 'finish'] as const)('propagates the original budget through %s and cleanup', async boundary => {
    const started = new SharedArrayBuffer(4);
    const controller = new AbortController();
    const base = fixture();
    const realNow = performance.now.bind(performance);
    let consumed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => realNow() + consumed);
    const workers: Worker[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      // Release cannot consume the finalization reserve. A blocked finalizer
      // must still stop at the original hard deadline, never a fresh budget.
      if (new URL(String(url)).pathname.endsWith('/sys_cluster_state')) consumed = boundary === 'release' ? 2700 : 2000;
      return base(url, init);
    };
    const before = realNow();
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, signal: controller.signal,
      limits: { deadlineMs: 3000 }, workerFactory: (_url, workerOptions) => {
        const worker = new Worker(new URL('./fixtures/review-worker-bootstrap.mjs', import.meta.url),
          { ...workerOptions, workerData: { started, blockKind: 'finish' } });
        workers.push(worker); return worker;
      } });
    expect(outcome).toEqual({ isError: true, error: {
      stage: boundary === 'release' ? 'release' : 'output', code: 'deadline_exceeded' } });
    expect(realNow() - before).toBeLessThan(1500);
    expect(workers.every(worker => worker.threadId === -1)).toBe(true);
    if (boundary === 'release') expect(workers).toHaveLength(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    vi.restoreAllMocks();
    expect((await reviewBoundedUpdateSet(client(), input, { fetch: fixture(), workerFactory: sourceWorkerFactory })).isError).toBe(false);
  });
  it.each(['analyze', 'finish'] as const)('cancels non-cooperative %s and releases worker/admission before return', async blockKind => {
    const started = new SharedArrayBuffer(4);
    const controller = new AbortController();
    const fetcher = fixture();
    const workers: Worker[] = [];
    const options: ReviewAdapterOptions = { fetch: fetcher, signal: controller.signal, limits: { deadlineMs: 3000 },
      workerFactory: (_url, workerOptions) => {
        const worker = new Worker(new URL('./fixtures/review-worker-bootstrap.mjs', import.meta.url),
          { ...workerOptions, workerData: { started, blockKind } });
        workers.push(worker); return worker;
      } };
    const pending = reviewBoundedUpdateSet(client(), input, options);
    const until = performance.now() + 2500;
    while (!Atomics.load(new Int32Array(started), 0) && performance.now() < until) await new Promise(r => setTimeout(r, 5));
    expect(Atomics.load(new Int32Array(started), 0)).toBe(1);
    // The same principal must remain busy while the old worker is still executing.
    const busy = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, workerFactory: sourceWorkerFactory });
    expect(busy).toEqual({ isError: true, error: { stage: 'input', code: 'review_busy' } });
    controller.abort(new Error('SYNTHETIC_PRIVATE_ABORT_REASON'));
    const outcome = await pending;
    expect(outcome).toEqual({ isError: true, error: { stage: blockKind === 'analyze' ? 'analysis' : 'output', code: 'cancelled' } });
    expect(workers).toHaveLength(1);
    expect(workers[0].threadId).toBe(-1);
    expect(workers[0].listenerCount('message')).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    const next = await reviewBoundedUpdateSet(client(), input, { fetch: fixture(), workerFactory: sourceWorkerFactory });
    expect(next.isError).toBe(false);
  });
});
