import { expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { ReviewTestScope } from './fixtures/review-test-scope.js';
import { ParentObservation, WorkerObservation, OBSERVATION_LIMIT } from './fixtures/parent-observation.js';
import { Worker } from 'node:worker_threads';

const client = () => new ServiceNowClient({ instanceUrl: 'https://observation.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'PRIVATE_OBSERVATION_TOKEN', oauth: { clientId: '', clientSecret: '' } });
const input = { update_set_sys_id: 'a'.repeat(32) };
const realSetTimeout = setTimeout;
const realDelay = (ms: number) => new Promise(resolve => realSetTimeout(resolve, ms));
it('correlates sequential reviews without retaining their inputs or changing outcomes', async ({ signal }) => {
  const scope = new ReviewTestScope(signal);
  try {
    for (let n = 0; n < 2; n++) expect(await scope.review(client(), input,
      { fetch: async () => new Response(null, { status: 403 }) }))
      .toEqual({ isError: true, error: { stage: 'parent', code: 'access_denied' } });
  } finally { await scope.close(); }
  const observed = scope.diagnostics().observation;
  expect(observed.measurement_incomplete).toBe(false);
  expect(observed.events.filter(e => e.event === 'review_start').map(e => e.review)).toEqual([1, 2]);
  expect(observed.events.filter(e => e.event === 'review_end').map(e => e.review)).toEqual([1, 2]);
  expect(observed.events.filter(e => e.event === 'review_end').map(e => [e.detail, e.code]))
    .toEqual([['fulfilled', 'access_denied'], ['fulfilled', 'access_denied']]);
  expect(observed.events.slice(-2).map(e => e.event)).toEqual(['close_start', 'close_end']);
  expect(JSON.stringify(observed)).not.toMatch(/PRIVATE|https|sys_id|error.*stack/);
});

it('bounds the shared log at exactly 4096 events and keeps operations running after overflow', () => {
  let time = 0, calls = 0;
  const log = new ParentObservation(() => time++), worker = new WorkerObservation(log, 1, 1);
  for (let n = 0; n < OBSERVATION_LIMIT + 10; n++)
    worker.post({ id: n + 10000, kind: 'analyze', input: 'PRIVATE' }, () => ++calls);
  const d = log.snapshot();
  expect(d).toMatchObject({ measurement_incomplete: true, reason: 'capacity', limit: 4096 });
  expect(d.events).toHaveLength(4096); expect(calls).toBe(OBSERVATION_LIMIT + 10);
  expect(time).toBe(4096);
  expect(d.events.map(e => e.seq)).toEqual(Array.from({ length: 4096 }, (_, i) => i + 1));
  expect(log.ordinal('review')).toBe(0); expect(JSON.stringify(d)).not.toContain('PRIVATE');
  d.events[0].seq = -1; expect(log.snapshot().events[0].seq).toBe(1);
});

it.each(['throw', 'backwards', 'nan'] as const)('keeps clock %s as incomplete measurement, not an operation failure', mode => {
  let calls = 0;
  const log = new ParentObservation(() => {
    if (++calls === 1) return 10;
    if (mode === 'throw') throw Error('PRIVATE_CLOCK');
    return mode === 'nan' ? NaN : 9;
  });
  log.record('review_start', 1);
  const trace = new WorkerObservation(log, 1, 1), marker = {};
  expect(trace.post({ id: 99, kind: 'analyze' }, () => marker)).toBe(marker);
  expect(log.snapshot()).toMatchObject({ measurement_incomplete: true, reason: 'clock', events: [{ event: 'review_start' }] });
  expect(log.snapshot().events).toHaveLength(1);
  expect(JSON.stringify(log.snapshot())).not.toContain('PRIVATE');
});

it('uses numeric ordinals per worker and request, not raw IDs or message bodies', () => {
  const log = new ParentObservation(() => 1), a = new WorkerObservation(log, 1, 1), b = new WorkerObservation(log, 2, 2);
  const payload = { id: 776655, kind: 'analyze', input: 'PRIVATE_INPUT' };
  const marker = {};
  expect(a.post(payload, () => marker)).toBe(marker);
  b.post(payload, () => {});
  b.message({ id: 776655, json: 'PRIVATE_RESULT' });
  a.message({ id: 776655, json: 'PRIVATE_RESULT' }); a.message({ id: 776655, json: 'PRIVATE_RESULT' });
  a.message({ id: 112233, json: 'PRIVATE_UNMATCHED' });
  const events = log.snapshot().events;
  expect(events.map(e => [e.event, e.review, e.worker, e.request, e.detail])).toEqual([
    ['post_try', 1, 1, 1, 'none'], ['post_return', 1, 1, 1, 'none'],
    ['post_try', 2, 2, 2, 'none'], ['post_return', 2, 2, 2, 'none'],
    ['reply_observed', 2, 2, 2, 'matched'], ['reply_observed', 1, 1, 1, 'matched'],
    ['reply_observed', 1, 1, 1, 'duplicate'], ['reply_observed', 1, 1, 0, 'unmatched'],
  ]);
  expect(JSON.stringify(events)).not.toMatch(/776655|112233|PRIVATE|json|input/);
  a.exit(); a.message({ id: 776655, json: 'PRIVATE_LATE' });
  expect(log.snapshot().events.at(-1)).toMatchObject({ event: 'reply_observed', request: 0, detail: 'unmatched' });
});

it('does not invoke message accessors and preserves a post throw by identity', () => {
  let getters = 0;
  const log = new ParentObservation(() => 0), trace = new WorkerObservation(log, 1, 1), marker = Error('PRIVATE_POST');
  trace.message({ get id() { getters++; throw Error('PRIVATE_GETTER'); }, get json() { getters++; return 'PRIVATE'; } });
  let caught: unknown;
  try { trace.post({ id: 9, kind: 'finish' }, () => { throw marker; }); } catch (error) { caught = error; }
  expect(caught).toBe(marker);
  expect(getters).toBe(0);
  expect(log.snapshot().events.map(e => [e.event, e.request, e.phase])).toEqual([
    ['reply_observed', 0, 'none'], ['post_try', 1, 'finish'], ['post_throw', 1, 'finish'],
  ]);
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw Error('PRIVATE_PROXY'); } });
  expect(() => trace.message(proxy)).not.toThrow();
  expect(log.snapshot()).toMatchObject({ measurement_incomplete: true, reason: 'observer' });
  expect(JSON.stringify(log.snapshot())).not.toMatch(/PRIVATE|stack/);
  const clean = new ParentObservation(() => 0);
  clean.reviewEnd(1, { isError: true, error: { code: 'PRIVATE_UNKNOWN_CODE' } });
  clean.reviewEnd(2, Error('PRIVATE_REJECT'), true);
  expect(clean.snapshot().events.map(e => e.code)).toEqual(['other_fixed_code', 'other_fixed_code']);
  expect(JSON.stringify(clean.snapshot())).not.toContain('PRIVATE');
});

// Wait joins the real review terminal and cancellation; it never assumes that a sleep reached a phase.
async function enteredOrEnded(flag: Int32Array, pending: Promise<unknown>, signal: AbortSignal) {
  let onAbort!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(Error('fixture_cancelled_before_entry'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    if (Atomics.load(flag, 0) === 0) {
      const wait = Atomics.waitAsync(flag, 0, 0);
      await Promise.race([Promise.resolve(wait.value), stopped,
        pending.then(() => { throw Error('fixture_review_ended_before_entry'); })]);
    }
    expect(Atomics.load(flag, 0)).toBe(1);
  } finally { signal.removeEventListener('abort', onAbort); }
}
function assetFetch(): typeof fetch {
  const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' }, id = 'b'.repeat(32);
  const row = { sys_id: id, update_set: input.update_set_sys_id, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
  return async raw => {
    const url = new URL(String(raw));
    return Response.json({ result: url.pathname.includes('/sys_update_set/')
      ? { sys_id: input.update_set_sys_id, state: 'in progress', application: 'global', ...version }
      : url.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
        : url.searchParams.get('sysparm_fields')?.includes('payload') ? [{ ...row,
          payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><when>after</when><script>current.update();</script></sys_script></record_update>` }]
          : [{ ...row, type: '' }] });
  };
}
it('preserves both result envelopes while correlating two real worker lifecycles in one case', async ({ signal }) => {
  const scope = new ReviewTestScope(signal);
  try {
    for (const mode of [undefined, 'review_targets']) {
      const result = await scope.review(client(), { ...input, ...(mode ? { selection_mode: mode } : {}) }, { fetch: assetFetch() });
      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ schema_version: mode ? 'bp-mcp-review-0.3' : 'bp-mcp-review-0.2', counts: { reviewed: 1 } });
    }
  } finally { await scope.close(); }
  const observed = scope.diagnostics().observation;
  expect(observed.measurement_incomplete).toBe(false);
  expect(observed.events.filter(e => e.event === 'factory_return').map(e => [e.review, e.worker])).toEqual([[1, 1], [2, 2]]);
  expect(observed.events.filter(e => e.event === 'post_return').map(e => [e.review, e.worker, e.request, e.phase])).toEqual([
    [1, 1, 1, 'analyze'], [1, 1, 2, 'finish'], [2, 2, 3, 'analyze'], [2, 2, 4, 'finish'],
  ]);
  expect(observed.events.filter(e => e.event === 'reply_observed').map(e => [e.request, e.detail]))
    .toEqual([[1, 'matched'], [2, 'matched'], [3, 'matched'], [4, 'matched']]);
  expect(scope.diagnostics()).toMatchObject({ pending_reviews: 0, workers: [{ exited: true }, { exited: true }] });
});

it('records a factory throw without exposing its message or changing adapter classification', async ({ signal }) => {
  const scope = new ReviewTestScope(signal);
  try {
    expect(await scope.review(client(), input, { fetch: assetFetch(), workerFactory: () => { throw Error('PRIVATE_FACTORY'); } }))
      .toEqual({ isError: true, error: { stage: 'analysis', code: 'worker_unavailable' } });
  } finally { await scope.close(); }
  const events = scope.diagnostics().observation.events;
  expect(events.filter(e => e.event.startsWith('factory')).map(e => [e.event, e.review, e.worker]))
    .toEqual([['factory_start', 1, 1], ['factory_throw', 1, 1]]);
  expect(JSON.stringify(events)).not.toContain('PRIVATE');
});
for (const phase of ['ready', 'finish'] as const) it(`independently reaches ${phase} wait before cancellation`, async ({ signal }) => {
  const scope = new ReviewTestScope(signal), cancel = new AbortController();
  const entered = new Int32Array(new SharedArrayBuffer(4)), gate = new Int32Array(new SharedArrayBuffer(4));
  const workers: Worker[] = [];
  const pending = scope.review(client(), input, { fetch: assetFetch(), signal: cancel.signal,
    workerFactory: (_url, options) => {
      const worker = new Worker(new URL('./fixtures/wf-a-controlled-worker.mjs', import.meta.url),
        { ...options, workerData: { phase, entered: entered.buffer, gate: gate.buffer } });
      workers.push(worker); return worker;
    } });
  try {
    await enteredOrEnded(entered, pending, signal);
    // This flag is set by the independent worker fixture, not by the observer under test.
    expect(workers).toHaveLength(1); expect(workers[0].threadId).not.toBe(-1);
    const before = scope.diagnostics().observation;
    expect(before.measurement_incomplete).toBe(false);
    const posts = before.events.filter(e => e.event === 'post_return');
    if (phase === 'ready') {
      expect(posts).toHaveLength(0);
      expect(before.events.some(e => e.event === 'ready_observed')).toBe(false);
    } else {
      expect(posts.map(e => [e.review, e.worker, e.request, e.phase])).toEqual([
        [1, 1, 1, 'analyze'], [1, 1, 2, 'finish'],
      ]);
      expect(before.events.filter(e => e.event === 'reply_observed').map(e => [e.request, e.phase, e.detail]))
        .toEqual([[1, 'analyze', 'matched']]);
    }
    cancel.abort(Error('PRIVATE_CANCEL_REASON'));
    expect(await pending).toMatchObject({ isError: true, error: { stage: phase === 'ready' ? 'analysis' : 'output', code: 'cancelled' } });
    expect(workers[0].threadId).toBe(-1);
    const recovered = await scope.review(client(), input, { fetch: async () => new Response(null, { status: 403 }) });
    expect(recovered).toEqual({ isError: true, error: { stage: 'parent', code: 'access_denied' } });
  } finally {
    cancel.abort(); Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
    Atomics.store(entered, 0, 1); Atomics.notify(entered, 0);
    await scope.close();
  }
  const { events, measurement_incomplete } = scope.diagnostics().observation;
  expect(measurement_incomplete).toBe(false);
  const index = (name: string) => {
    const found = events.findIndex(e => e.event === name && e.review === 1);
    expect(found, name).toBeGreaterThanOrEqual(0);
    return found;
  };
  expect(index('factory_start')).toBeLessThan(index('factory_return'));
  expect(index('terminate_try')).toBeLessThan(index('worker_exit'));
  expect(index('worker_exit')).toBeLessThan(index('review_end'));
  expect(index('terminate_settle')).toBeLessThan(index('review_end'));
  expect(events.filter(e => e.event === 'review_end').map(e => e.review)).toEqual([1, 2]);
  expect(scope.diagnostics()).toMatchObject({ pending_reviews: 0, workers: [{ exited: true }] });
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE|service-now|sys_id|current.update/);
});
it('keeps measuring real elapsed time while fake timers replace process.hrtime', async ({ signal }) => {
  const scope = new ReviewTestScope(signal), denied = async () => new Response(null, { status: 403 });
  try {
    await realDelay(20);
    await scope.review(client(), input, { fetch: denied });
    vi.useFakeTimers();
    await scope.review(client(), input, { fetch: denied });
    await realDelay(20);
    await scope.review(client(), input, { fetch: denied });
  } finally { vi.useRealTimers(); await scope.close(); }
  const { measurement_incomplete, reason, events } = scope.diagnostics().observation;
  expect([measurement_incomplete, reason]).toEqual([false, 'none']);
  const starts = events.filter(e => e.event === 'review_start').map(e => e.at_ms);
  expect(starts).toHaveLength(3);
  expect(starts[0]).toBeGreaterThanOrEqual(15);
  expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(15);
});

it.each(['throw', 'reject'] as const)('reports a worker that a terminate %s left running as incomplete cleanup', async mode => {
  const external = new AbortController(), scope = new ReviewTestScope(external.signal), cancel = new AbortController();
  let stop: (() => Promise<number>) | undefined, made!: () => void;
  const created = new Promise<void>(resolve => { made = resolve; });
  const pending = scope.review(client(), input, { fetch: assetFetch(), signal: cancel.signal,
    workerFactory: (_url, options) => {
      const worker = new Worker('setInterval(() => {}, 1000)', { ...options, eval: true });
      stop = worker.terminate.bind(worker);
      worker.terminate = () => {
        if (mode === 'throw') throw Error('PRIVATE_TERMINATE');
        return Promise.reject(Error('PRIVATE_TERMINATE'));
      };
      made();
      return worker;
    } });
  try {
    await created;
    cancel.abort();
    expect(await pending).toMatchObject({ isError: true });
    await expect(scope.close()).rejects.toThrow('test_review_cleanup_incomplete');
  } finally { await stop?.(); }
  const { events } = scope.diagnostics().observation;
  expect(events.filter(e => e.event === (mode === 'throw' ? 'terminate_throw' : 'terminate_settle')).map(e => e.detail))
    .toContain(mode === 'throw' ? 'none' : 'rejected');
  // The worker exits only when the test's own stop runs, after the owner already reported it.
  expect(events.filter(e => e.event === 'close_end').map(e => e.detail)).toEqual(['rejected']);
  expect(events.findIndex(e => e.event === 'close_end')).toBeLessThan(events.findIndex(e => e.event === 'worker_exit'));
  expect(JSON.stringify(events)).not.toContain('PRIVATE');
});

it('records a review rejected by a closed scope and survives a hostile outcome', async ({ signal }) => {
  const scope = new ReviewTestScope(signal);
  await scope.close();
  await expect(scope.review(client(), input)).rejects.toThrow('test_review_scope_closed');
  expect(scope.diagnostics().observation.events.at(-1)).toMatchObject({ event: 'review_end', review: 1, detail: 'rejected', code: 'other_fixed_code' });
  const log = new ParentObservation(() => 0);
  expect(() => log.reviewEnd(1, new Proxy({}, { getOwnPropertyDescriptor() { throw Error('PRIVATE_OUTCOME'); } }))).not.toThrow();
  expect(log.snapshot()).toMatchObject({ measurement_incomplete: true, reason: 'observer' });
  expect(JSON.stringify(log.snapshot())).not.toContain('PRIVATE');
});

it('keeps the first incomplete reason and bounds ordinal issuance', () => {
  const first = new ParentObservation(() => 0);
  first.incomplete('clock'); first.incomplete('observer'); first.incomplete('capacity');
  expect(first.snapshot().reason).toBe('clock');
  const log = new ParentObservation(() => 0);
  for (let n = 1; n <= OBSERVATION_LIMIT; n++) expect(log.ordinal('worker')).toBe(n);
  expect(log.snapshot().measurement_incomplete).toBe(false);
  expect(log.ordinal('worker')).toBe(0);
  expect(log.snapshot()).toMatchObject({ measurement_incomplete: true, reason: 'capacity' });
});

it('assigns request ordinals only to safe positive IDs and reuses one on repost', () => {
  const log = new ParentObservation(() => 0), trace = new WorkerObservation(log, 1, 1);
  for (const id of [1.5, 0, -1, Number.MAX_SAFE_INTEGER + 1, '7', undefined]) trace.post({ id, kind: 'analyze' }, () => undefined);
  trace.post({ id: 7, kind: 'analyze' }, () => undefined);
  trace.post({ id: 7, kind: 'analyze' }, () => undefined);
  trace.post({ id: 8, kind: 'finish' }, () => undefined);
  expect(log.snapshot().events.filter(e => e.event === 'post_try').map(e => [e.request, e.phase])).toEqual([
    [0, 'analyze'], [0, 'analyze'], [0, 'analyze'], [0, 'analyze'], [0, 'analyze'], [0, 'analyze'],
    [1, 'analyze'], [1, 'analyze'], [2, 'finish'],
  ]);
});
