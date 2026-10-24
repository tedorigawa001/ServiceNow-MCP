import { afterEach, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { reviewBoundedUpdateSet } from '../../src/review/update-set-adapter.js';
import { aggregateReviewSchema } from '../../src/review/aggregate-schema.js';
import { Worker } from 'node:worker_threads';
import { getEventListeners } from 'node:events';
import { sourceWorkerFactory } from './fixtures/worker-factory.js';

const parent = 'a'.repeat(32);
const id = (n: number) => String(n).padStart(32, '0');
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const rows = [1, 2, 3].map(n => ({ sys_id: id(n), update_set: parent, name: `sys_script_${id(n)}`,
  type: 'Business Rule', action: 'INSERT_OR_UPDATE', ...version }));
const client = () => new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-soft-budget', oauth: { clientId: '', clientSecret: '' } });
function fixture(onPayload?: (n: number, init?: RequestInit) => Promise<Response> | undefined) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url)); calls.push(u.pathname + '?' + u.searchParams.toString());
    let result: unknown;
    if (u.pathname.includes('/sys_update_set/')) result = { sys_id: parent, state: 'in progress', application: 'global', ...version };
    else if (u.pathname.endsWith('/sys_cluster_state')) result = [{ build_name: 'Australia' }];
    else if (u.searchParams.get('sysparm_fields')?.includes('payload')) {
      const index = rows.findIndex(row => u.searchParams.get('sysparm_query')?.startsWith(`sys_id=${row.sys_id}^`));
      const response = onPayload?.(index + 1, init); if (response) return response;
      const row: Record<string, unknown> = { ...rows[index] }; delete row.type;
      result = [{ ...row, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${row.sys_id}</sys_id><when>after</when><script>current.update();</script></sys_script></record_update>` }];
    } else result = rows;
    return new Response(JSON.stringify({ result }));
  };
  return { fetcher, calls };
}
// Booting the real tsx review worker can take seconds under suite load. A test that outlives the
// default timeout keeps its bounded-read admission and fails the next ones with review_busy.
vi.setConfig({ testTimeout: 30_000 });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
// Run time advances only by the test's explicit jumps, never by how long the machine takes to
// start workers, so a budget like "1000 ms left" means exactly that whatever the suite load.
function frozenClock(spent: () => number) {
  const base = performance.now();
  vi.spyOn(performance, 'now').mockImplementation(() => base + spent());
}
it('preserves completed analysis and accounts for every remaining row at the internal acquisition deadline', async () => {
  let spent = 0; frozenClock(() => spent);
  const { fetcher, calls } = fixture(n => { if (n === 2) spent = 51000; return undefined; });
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: fetcher });
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error('Expected partial output');
  expect(outcome.result).toMatchObject({ status: 'partial', counts: { reviewed: 1, findings: 1, not_processed: 2 },
    coverage: { analysis_complete: false }, consistency: 'stable_observation' });
  expect(outcome.result.assets.slice(1)).toEqual([2, 3].map(n => ({ state: 'not_processed', update_xml_sys_id: id(n), reason: 'deadline_exceeded' })));
  expect(outcome.result.limitations).toContain('soft_deadline_reached');
  expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
  expect(calls.filter(url => new URL('https://example.com' + url).searchParams.get('sysparm_fields')?.includes('payload'))).toHaveLength(2);
});
it('terminates a blocked second analysis before starting finalization and retains only completed results', async () => {
  let spent = 0; frozenClock(() => spent);
  const { fetcher } = fixture(n => { if (n === 2) spent = 49000; return undefined; });
  const started = new SharedArrayBuffer(4), workers: Worker[] = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const task = reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: fetcher,
    workerFactory: (url, options) => {
      if (workers.length) expect(workers.every(w => w.threadId === -1)).toBe(true);
      const worker = workers.length ? sourceWorkerFactory(url, options)
        : new Worker(new URL('./fixtures/review-worker-bootstrap.mjs', import.meta.url),
          { ...options, workerData: { blockKind: 'analyze', blockAfter: 2, started } });
      workers.push(worker); return worker;
    } });
  while (!Atomics.load(new Int32Array(started), 0)) await new Promise(resolve => setImmediate(resolve)); // Now spinning.
  await vi.advanceTimersByTimeAsync(1000); // Exactly the remaining analysis phase.
  const outcome = await task;
  expect(Atomics.load(new Int32Array(started), 0)).toBe(1);
  expect(workers).toHaveLength(2);
  expect(workers.every(w => w.threadId === -1)).toBe(true);
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error('Expected retained result');
  expect(outcome.result).toMatchObject({ counts: { reviewed: 1, findings: 1, not_processed: 2 }, consistency: 'stable_observation' });
  expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
});
it.each(['fetch', 'body'] as const)('aborts a non-cooperative %s at the internal deadline and releases admission', async kind => {
  let requestSignal: AbortSignal | undefined, bodyCancelled = false;
  let lateResolve: ((value: Response) => void) | undefined, stuck!: () => void;
  const requested = new Promise<void>(resolve => { stuck = resolve; });
  frozenClock(() => 0); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { fetcher } = fixture((n, init) => {
    if (n !== 2) return undefined;
    requestSignal = init?.signal ?? undefined; stuck();
    return kind === 'fetch' ? new Promise<Response>(resolve => { lateResolve = resolve; }) : Promise.resolve(new Response(new ReadableStream({
      pull: () => new Promise(() => {}), cancel: () => { bodyCancelled = true; },
    })));
  });
  const task = reviewBoundedUpdateSet(client(), { update_set_sys_id: parent },
    { fetch: fetcher, limits: { deadlineMs: 3000 } });
  await requested; await vi.advanceTimersByTimeAsync(2500); // 3000 ms run minus its 500 ms reserve.
  const outcome = await task;
  expect(requestSignal?.aborted).toBe(true);
  expect(getEventListeners(requestSignal!, 'abort')).toHaveLength(0);
  if (kind === 'body') expect(bodyCancelled).toBe(true);
  else {
    lateResolve!(new Response(new ReadableStream({ cancel: () => { bodyCancelled = true; } })));
    await new Promise(resolve => setImmediate(resolve));
    expect(bodyCancelled).toBe(true);
  }
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error('Expected partial output');
  expect(outcome.result).toMatchObject({ counts: { reviewed: 1, not_processed: 2 }, coverage: { analysis_complete: false } });
  expect((await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: fixture().fetcher })).isError).toBe(false);
});
it('stops retry backoff at the phase boundary without retrying or poisoning final verification', async () => {
  let requests = 0;
  const session = client().createBoundedReadSession({ limits: { deadlineMs: 1000, retryDelayMs: 250 },
    fetch: async () => ++requests === 1 ? new Response('synthetic retry', { status: 429 })
      : new Response(JSON.stringify({ result: [] })) });
  const path = '/api/now/table/sys_update_set?sysparm_fields=sys_id';
  try {
    session.setPhaseReserve(900);
    await expect(session.get(path)).rejects.toMatchObject({ code: 'phase_deadline_exceeded' });
    expect(requests).toBe(1);
    expect(session.remainingMs()).toBeGreaterThan(0);
    session.setPhaseReserve(0);
    await expect(session.get(path, true)).resolves.toEqual({ result: [] });
    expect(requests).toBe(2);
  } finally { session.close(); }
});
it('never returns saved findings if aggregation fails after an early cutoff', async () => {
  let spent = 0; frozenClock(() => spent);
  const base = fixture(n => { if (n === 2) spent = 51000; return undefined; });
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: base.fetcher,
    workerFactory: (url, options) => {
      const worker = sourceWorkerFactory(url, options), post = worker.postMessage.bind(worker);
      worker.postMessage = message => {
        if (message.kind === 'finish') throw Error('SYNTHETIC_PRIVATE_FINALIZE');
        post(message);
      };
      return worker;
    } });
  expect(outcome).toEqual({ isError: true, error: { stage: 'output', code: 'internal_review_error' } });
});
it('does not invent a stable observation when final verification exceeds its own reserve', async () => {
  let spent = 0, parents = 0; frozenClock(() => spent);
  const base = fixture();
  const fetcher: typeof fetch = async (url, init) => {
    if (new URL(String(url)).pathname.includes('/sys_update_set/') && ++parents === 2) spent = 56000;
    return base.fetcher(url, init);
  };
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: fetcher });
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error('Expected provisional output');
  expect(outcome.result).toMatchObject({ counts: { reviewed: 3, findings: 3 }, consistency: 'unverified',
    coverage: { analysis_complete: false } });
  expect(outcome.result.limitations).toEqual(expect.arrayContaining(['soft_deadline_reached', 'consistency_unverified', 'provisional_results']));
  expect(outcome.result.errors).toContainEqual({ stage: 'consistency', code: 'deadline_exceeded' });
  expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
});
it.each(['hard', 'cancel', 'changed', 'denied'] as const)('handles %s during verification after soft cutoff without weakening the hard boundary', async mode => {
  let spent = 0, parents = 0; frozenClock(() => spent);
  const controller = new AbortController();
  const base = fixture(n => { if (n === 2) spent = 51000; return undefined; });
  const fetcher: typeof fetch = async (url, init) => {
    if (new URL(String(url)).pathname.includes('/sys_update_set/') && ++parents === 2) {
      if (mode === 'hard') spent = 61000;
      if (mode === 'cancel') controller.abort(new Error('SYNTHETIC_PRIVATE_CANCEL'));
      if (mode === 'denied') return new Response(null, { status: 403 });
      if (mode === 'changed') return new Response(JSON.stringify({ result: {
        sys_id: parent, state: 'in progress', application: 'global', ...version, sys_mod_count: '1' } }));
    }
    return base.fetcher(url, init);
  };
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: fetcher, signal: controller.signal });
  if (mode === 'hard' || mode === 'cancel') {
    expect(outcome).toEqual({ isError: true, error: { stage: 'consistency', code: mode === 'hard' ? 'deadline_exceeded' : 'cancelled' } });
  } else {
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected provisional output');
    expect(outcome.result).toMatchObject({ consistency: mode === 'changed' ? 'changed' : 'unverified', counts: { reviewed: 1, not_processed: 2 } });
    expect(outcome.result.limitations).toContain('provisional_results');
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
  }
  expect(JSON.stringify(outcome)).not.toContain('SYNTHETIC_PRIVATE_CANCEL');
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});
it('returns all known rows as unprocessed when the first payload hits the internal deadline', async () => {
  let spent = 0; frozenClock(() => spent);
  const base = fixture(n => { if (n === 1) spent = 51000; return undefined; });
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: base.fetcher });
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error('Expected accounted partial output');
  expect(outcome.result).toMatchObject({ collection: { status: 'complete', selected: 3 }, counts: { reviewed: 0, findings: 0, not_processed: 3 },
    coverage: { analysis_complete: false } });
  expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
});
it('does not fabricate an empty successful list when metadata is interrupted before becoming known', async () => {
  let spent = 0; frozenClock(() => spent);
  const base = fixture();
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/sys_update_xml')) spent = 51000;
    return base.fetcher(url, init);
  };
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent }, { fetch: fetcher });
  expect(outcome).toMatchObject({ isError: true, error: { stage: 'metadata', code: 'deadline_exceeded' },
    result: { status: 'failed', collection: { status: 'failed', metadata_seen: 0, selected: 0 }, assets: [],
      coverage: { analysis_complete: false } } });
  expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
});
