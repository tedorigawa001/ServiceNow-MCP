import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewWorker } from '../../src/review/worker-supervisor.js';
import { sourceWorkerFactory } from './fixtures/worker-factory.js';
import { aggregate } from './fixtures/bp5-results.js';
import { Worker } from 'node:worker_threads';
import { getEventListeners } from 'node:events';

describe('BP-5 supervised CPU worker', () => {
  afterEach(() => vi.restoreAllMocks());
  it('starts the default development worker directly from source without a test factory', async () => {
    const cpu = new ReviewWorker({ remainingMs: () => 5000 });
    const input = aggregate();
    input.started_at = new Date(Date.now() - 1000).toISOString();
    input.assets[0].result.reviewed_at = new Date(Date.now() - 500).toISOString();
    try {
      const result = await cpu.finish(input);
      expect(result.counts.findings).toBe(1);
      expect(result.code_return_mode).toBe('none');
    } finally { await cpu.close(); }
  });
  it('closes an in-flight request explicitly and waits for termination', async () => {
    let worker: Worker | undefined;
    const cpu = new ReviewWorker({ remainingMs: () => 1000, factory: (_url, options) => {
      worker = new Worker(new URL('./fixtures/blocked-review-worker.mjs', import.meta.url),
        { ...options, workerData: { started: new SharedArrayBuffer(4) } });
      return worker;
    } });
    const job = cpu.finish(aggregate());
    const assertion = expect(job).rejects.toMatchObject({ code: 'internal_review_error' });
    await cpu.close(); await assertion;
    expect(worker?.threadId).toBe(-1);
    expect(worker?.listenerCount('message')).toBe(0);
  });
  it.each(['expired', 'cancelled'] as const)('does not create a worker for %s jobs', async kind => {
    const factory = vi.fn(sourceWorkerFactory);
    const controller = new AbortController();
    if (kind === 'cancelled') controller.abort(new Error('SYNTHETIC_PRIVATE_ABORT_REASON'));
    const cpu = new ReviewWorker({ remainingMs: () => kind === 'expired' ? 0 : 1000, signal: controller.signal, factory });
    await expect(cpu.finish(aggregate())).rejects.toMatchObject({ code: kind === 'expired' ? 'deadline_exceeded' : 'cancelled' });
    await cpu.close(); await cpu.close();
    expect(factory).not.toHaveBeenCalled();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
  it('sanitizes worker startup failure without creating a fallback execution path', async () => {
    const factory = vi.fn(() => { throw new Error('SYNTHETIC_PRIVATE_STARTUP_ERROR'); });
    const cpu = new ReviewWorker({ remainingMs: () => 1000, factory });
    await expect(cpu.finish(aggregate())).rejects.toMatchObject({ code: 'worker_unavailable', message: 'worker_unavailable' });
    await cpu.close();
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it.each(['missing_entry', 'boot_throw', 'boot_exit'] as const)('returns worker_unavailable for %s before readiness and releases resources', async mode => {
    let worker: Worker | undefined;
    const controller = new AbortController();
    const cpu = new ReviewWorker({ remainingMs: () => 1000, signal: controller.signal, factory: (_url, options) => {
      worker = new Worker(new URL(mode === 'missing_entry' ? './fixtures/no-such-worker.mjs' : './fixtures/failing-review-worker.mjs', import.meta.url),
        { ...options, workerData: { mode } });
      return worker;
    } });
    try {
      await expect(cpu.finish(aggregate())).rejects.toMatchObject({ code: 'worker_unavailable', message: 'worker_unavailable' });
      expect(worker?.threadId).toBe(-1);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    } finally { await cpu.close(); }
  });
  it('reuses one worker for successive jobs and removes per-job abort listeners', async () => {
    const factory = vi.fn(sourceWorkerFactory);
    const controller = new AbortController();
    const cpu = new ReviewWorker({ remainingMs: () => 5000, signal: controller.signal, factory });
    const input = aggregate();
    input.started_at = new Date(Date.now() - 1000).toISOString();
    input.assets[0].result.reviewed_at = new Date(Date.now() - 500).toISOString();
    try {
      for (let n = 0; n < 3; n++) {
        expect((await cpu.finish(input)).counts.findings).toBe(1);
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      }
      expect(factory).toHaveBeenCalledTimes(1);
    } finally { await cpu.close(); }
  });
  it('suppresses a late worker reply after cancellation and closes idempotently', async () => {
    const controller = new AbortController();
    let worker: Worker | undefined;
    const cpu = new ReviewWorker({ remainingMs: () => 1000, signal: controller.signal, factory: (_url, options) => {
      worker = new Worker(new URL('./fixtures/failing-review-worker.mjs', import.meta.url), { ...options, workerData: { mode: 'late' } });
      return worker;
    } });
    const job = cpu.finish(aggregate());
    const assertion = expect(job).rejects.toMatchObject({ code: 'cancelled' });
    controller.abort(new Error('SYNTHETIC_PRIVATE_ABORT_REASON'));
    await assertion;
    await cpu.close(); await cpu.close();
    expect(worker?.threadId).toBe(-1);
    expect(worker?.listenerCount('message')).toBe(0);
  });
  it.each(['throw', 'exit', 'malformed'] as const)('fails closed for worker %s without forwarding diagnostics', async mode => {
    let worker: Worker | undefined;
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    const controller = new AbortController();
    const cpu = new ReviewWorker({ remainingMs: () => 1000, signal: controller.signal, factory: (_url, options) => {
      expect(options.env).toEqual({}); expect(options.execArgv).toEqual([]);
      worker = new Worker(new URL('./fixtures/failing-review-worker.mjs', import.meta.url), { ...options, workerData: { mode } });
      return worker;
    } });
    try {
      await expect(cpu.finish(aggregate())).rejects.toMatchObject({ code: 'internal_review_error', message: 'internal_review_error' });
      expect(worker?.threadId).toBe(-1);
      expect(worker?.listenerCount('error')).toBe(0);
      expect(worker?.listenerCount('exit')).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
    } finally { await cpu.close(); }
  });
  it.each(['deadline', 'cancel'] as const)('terminates non-cooperative CPU before settling on %s', async kind => {
    const started = new SharedArrayBuffer(4);
    const controller = new AbortController();
    const end = performance.now() + 500;
    let worker: Worker | undefined;
    const cpu = new ReviewWorker({ remainingMs: () => end - performance.now(), signal: controller.signal,
      factory: (_url, options) => {
        worker = new Worker(new URL('./fixtures/blocked-review-worker.mjs', import.meta.url), { ...options, workerData: { started } });
        return worker;
      } });
    try {
      const job = cpu.finish(aggregate());
      const assertion = expect(job).rejects.toMatchObject({ code: kind === 'deadline' ? 'deadline_exceeded' : 'cancelled' });
      if (kind === 'cancel') {
        while (!Atomics.load(new Int32Array(started), 0) && performance.now() < end) await new Promise(r => setTimeout(r, 5));
        controller.abort(new Error('SYNTHETIC_PRIVATE_ABORT_REASON'));
      }
      await assertion;
      expect(Atomics.load(new Int32Array(started), 0)).toBe(1);
      expect(worker?.threadId).toBe(-1);
      expect(worker?.listenerCount('message')).toBe(0);
      expect(controller.signal.onabort).toBe(null);
    } finally { await cpu.close(); }
  });
  it('finalizes and validates aggregation in a real worker, then awaits its exit', async () => {
    let worker: ReturnType<typeof sourceWorkerFactory> | undefined;
    const cpu = new ReviewWorker({ remainingMs: () => 5000, factory: (url, options) => {
      worker = sourceWorkerFactory(url, options); return worker;
    } });
    try {
      const input = aggregate();
      input.started_at = new Date(Date.now() - 1000).toISOString();
      input.assets[0].result.reviewed_at = new Date(Date.now() - 500).toISOString();
      const result = await cpu.finish(input);
      expect(result.counts.findings).toBe(1);
      expect(result.schema_version).toBe('bp-mcp-review-0.2');
      expect(worker?.threadId).toBeGreaterThan(0);
    } finally { await cpu.close(); }
    expect(worker?.threadId).toBe(-1);
    expect(worker?.listenerCount('message')).toBe(0);
  });
});
