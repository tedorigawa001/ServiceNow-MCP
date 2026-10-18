/** Test ownership only. Never resets admission or extends a production deadline. */
import type { Worker } from 'node:worker_threads';
import type { ServiceNowClient } from '../../../src/servicenow/client.js';
import { reviewBoundedUpdateSet, type ReviewAdapterOptions } from '../../../src/review/update-set-adapter.js';
import { sourceWorkerFactory } from './worker-factory.js';
interface WorkerLifecycle {
  created_ms: number; ready_ms: number | null; analyze_started_ms: number | null;
  finish_started_ms: number | null; last_reply_ms: number | null;
  terminate_ms: number | null; exit_ms: number | null; exited: boolean;
}

export class ReviewTestScope {
  private readonly root = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly workers = new Map<Worker, WorkerLifecycle>();
  private readonly started = process.hrtime.bigint();
  private readonly removeExternal: () => void;
  private closing?: Promise<void>;
  private elapsed() { return Math.max(0, Math.floor(Number(process.hrtime.bigint() - this.started) / 1e6)); }
  /** Fixed numeric/boolean diagnostics only: no IDs, URLs, messages, input or code. */
  diagnostics() {
    return { aborted: this.root.signal.aborted, close_requested: !!this.closing, pending_reviews: this.pending.size,
      workers: [...this.workers.values()].map(value => ({ ...value })) };
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
    return this.track(signal => reviewBoundedUpdateSet(client, raw, { ...options,
      signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
      workerFactory: (url, workerOptions) => {
        const worker = (options.workerFactory ?? sourceWorkerFactory)(url, workerOptions);
        const state: WorkerLifecycle = { created_ms: this.elapsed(), ready_ms: null, analyze_started_ms: null,
          finish_started_ms: null, last_reply_ms: null, terminate_ms: null, exit_ms: null, exited: false };
        this.workers.set(worker, state);
        const message = (value: unknown) => {
          if (value && typeof value === 'object' && 'type' in value && value.type === 'review_worker_ready') state.ready_ms = this.elapsed();
          else state.last_reply_ms = this.elapsed();
        };
        worker.on('message', message);
        worker.once('exit', () => { state.exit_ms = this.elapsed(); state.exited = true; worker.off('message', message); });
        const post = worker.postMessage.bind(worker), terminate = worker.terminate.bind(worker);
        worker.postMessage = (value, ...rest) => {
          if (value?.kind === 'analyze') state.analyze_started_ms ??= this.elapsed();
          if (value?.kind === 'finish') state.finish_started_ms ??= this.elapsed();
          return post(value, ...rest);
        };
        worker.terminate = () => { state.terminate_ms ??= this.elapsed(); return terminate(); };
        return worker;
      } }));
  }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.root.abort(); this.removeExternal();
      // Wait for the real adapter finally: worker exit first, then session/admission release.
      await Promise.allSettled([...this.pending]);
      if ([...this.workers.keys()].some(worker => worker.threadId !== -1)) throw Error('test_review_cleanup_incomplete');
    })();
  }
}
