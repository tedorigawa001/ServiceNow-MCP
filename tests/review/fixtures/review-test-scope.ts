/** Test ownership only. Never resets admission or extends a production deadline. */
import type { Worker } from 'node:worker_threads';
import type { ServiceNowClient } from '../../../src/servicenow/client.js';
import { reviewBoundedUpdateSet, type ReviewAdapterOptions } from '../../../src/review/update-set-adapter.js';
import { sourceWorkerFactory } from './worker-factory.js';
import { OBSERVATION_LIMIT, ParentObservation, WorkerObservation } from './parent-observation.js';
// Captured at import: vi.useFakeTimers() also replaces process.hrtime, which would freeze or rewind case time.
const monotonic = process.hrtime.bigint.bind(process.hrtime);
interface WorkerLifecycle {
  created_ms: number; ready_ms: number | null; analyze_started_ms: number | null;
  finish_started_ms: number | null; last_reply_ms: number | null;
  terminate_ms: number | null; exit_ms: number | null; exited: boolean;
}

export class ReviewTestScope {
  private readonly root = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly workers = new Map<Worker, WorkerLifecycle>();
  private readonly lifecycles: WorkerLifecycle[] = [];
  private readonly started = monotonic();
  private readonly observation = new ParentObservation(() => this.elapsed());
  private readonly removeExternal: () => void;
  private closing?: Promise<void>;
  private elapsed() { return Math.max(0, Math.floor(Number(monotonic() - this.started) / 1e6)); }
  private observedField(value: unknown, name: string): unknown {
    try { return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, name)?.value : undefined; }
    catch { this.observation.incomplete('observer'); return undefined; }
  }
  /** Fixed numeric/boolean diagnostics only: no IDs, URLs, messages, input or code. */
  diagnostics() {
    return { aborted: this.root.signal.aborted, close_requested: !!this.closing, pending_reviews: this.pending.size,
      workers: this.lifecycles.map(value => ({ ...value })), observation: this.observation.snapshot() };
  }
  constructor(signal: AbortSignal) {
    const abort = () => this.root.abort(); // Do not retain a framework error/stack as an abort reason.
    signal.addEventListener('abort', abort, { once: true });
    this.removeExternal = () => signal.removeEventListener('abort', abort);
    if (signal.aborted) abort();
  }
  track<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closing || this.root.signal.aborted) return Promise.reject(Error('test_review_scope_closed'));
    let task: Promise<T>;
    try { task = work(this.root.signal); } catch (error) { task = Promise.reject(error); }
    this.pending.add(task);
    const remove = () => { this.pending.delete(task); };
    void task.then(remove, remove);
    return task;
  }
  review(client: ServiceNowClient, raw: unknown, options: ReviewAdapterOptions = {}) {
    const review = this.observation.ordinal('review');
    this.observation.record('review_start', review, 0, 0, 'review');
    const task = this.track(signal => reviewBoundedUpdateSet(client, raw, { ...options,
      signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
      workerFactory: (url, workerOptions) => {
        const ordinal = this.observation.ordinal('worker');
        this.observation.record('factory_start', review, ordinal, 0, 'ready');
        let worker: Worker;
        try { worker = (options.workerFactory ?? sourceWorkerFactory)(url, workerOptions); }
        catch (error) { this.observation.record('factory_throw', review, ordinal, 0, 'ready'); throw error; }
        this.observation.record('factory_return', review, ordinal, 0, 'ready');
        const trace = this.observation.active && ordinal ? new WorkerObservation(this.observation, review, ordinal) : undefined;
        const state: WorkerLifecycle = { created_ms: this.elapsed(), ready_ms: null, analyze_started_ms: null,
          finish_started_ms: null, last_reply_ms: null, terminate_ms: null, exit_ms: null, exited: false };
        this.workers.set(worker, state);
        if (this.lifecycles.length < OBSERVATION_LIMIT) this.lifecycles.push(state);
        else this.observation.incomplete('capacity');
        const message = (value: unknown) => {
          trace?.message(value);
          if (this.observedField(value, 'type') === 'review_worker_ready') state.ready_ms = this.elapsed();
          else state.last_reply_ms = this.elapsed();
        };
        worker.on('message', message);
        worker.once('exit', () => {
          trace?.exit(); state.exit_ms = this.elapsed(); state.exited = true;
          worker.off('message', message); this.workers.delete(worker);
        });
        const post = worker.postMessage.bind(worker), terminate = worker.terminate.bind(worker);
        worker.postMessage = (value, ...rest) => {
          const kind = this.observedField(value, 'kind');
          if (kind === 'analyze') state.analyze_started_ms ??= this.elapsed();
          if (kind === 'finish') state.finish_started_ms ??= this.elapsed();
          return trace ? trace.post(value, () => post(value, ...rest)) : post(value, ...rest);
        };
        worker.terminate = () => {
          state.terminate_ms ??= this.elapsed();
          this.observation.record('terminate_try', review, ordinal, 0, 'cleanup');
          let result: Promise<number>;
          try { result = terminate(); }
          catch (error) { this.observation.record('terminate_throw', review, ordinal, 0, 'cleanup'); throw error; }
          void result.then(() => this.observation.record('terminate_settle', review, ordinal, 0, 'cleanup', 'fulfilled'),
            () => this.observation.record('terminate_settle', review, ordinal, 0, 'cleanup', 'rejected'));
          return result;
        };
        return worker;
      } }));
    void task.then(value => this.observation.reviewEnd(review, value),
      () => this.observation.reviewEnd(review, undefined, true));
    return task;
  }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.observation.record('close_start', 0, 0, 0, 'cleanup');
      this.root.abort(); this.removeExternal();
      // Wait for the real adapter finally: worker exit first, then session/admission release.
      await Promise.allSettled([...this.pending]);
      if ([...this.workers.keys()].some(worker => worker.threadId !== -1)) {
        this.observation.record('close_end', 0, 0, 0, 'cleanup', 'rejected'); throw Error('test_review_cleanup_incomplete');
      }
      this.observation.record('close_end', 0, 0, 0, 'cleanup', 'fulfilled');
    })();
  }
}
