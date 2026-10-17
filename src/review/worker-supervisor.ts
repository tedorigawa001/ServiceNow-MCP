import { Worker, type WorkerOptions } from 'node:worker_threads';
import type { AggregateReview } from './aggregate-schema.js';

export type ReviewWorkerFactory = (url: URL, options: WorkerOptions) => Worker;
type Failure = 'deadline_exceeded' | 'cancelled' | 'internal_review_error' | 'worker_unavailable';
export class ReviewWorkerError extends Error {
  constructor(readonly code: Failure) { super(code); }
}
interface Options { remainingMs: () => number; signal?: AbortSignal; factory?: ReviewWorkerFactory }
export class ReviewWorker {
  private worker?: Worker;
  private closed?: Promise<void>;
  private sequence = 0;
  private busy = false;
  private failed = false;
  private interrupt?: () => void;
  private readonly onFailure = () => { this.failed = true; };
  constructor(private readonly options: Options) {}
  private check() {
    if (this.options.remainingMs() <= 0) throw new ReviewWorkerError('deadline_exceeded');
    if (this.options.signal?.aborted) throw new ReviewWorkerError('cancelled');
    if (this.closed || this.failed) throw new ReviewWorkerError('internal_review_error');
  }
  private startWorker(): Worker {
    // Select by this module's execution format, never by a missing .js file,
    // NODE_ENV or caller input. Production must not fall back to source/tsx.
    const entry = new URL(import.meta.url).pathname.endsWith('.ts')
      ? './dev-worker-bootstrap.mjs' : './review-worker.js';
    let worker: Worker;
    try {
      worker = (this.options.factory ?? ((url, options) => new Worker(url, options)))(
        new URL(entry, import.meta.url), { env: {}, argv: [], execArgv: [], stdout: true, stderr: true,
          resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
    } catch { throw new ReviewWorkerError('worker_unavailable'); }
    worker.on('error', this.onFailure); worker.on('exit', this.onFailure);
    worker.stdout.resume(); worker.stderr.resume();
    return worker;
  }
  private exchange<T>(worker: Worker, kind: 'ready' | 'analyze' | 'finish', input?: unknown): Promise<T> {
    const id = ++this.sequence;
    const failure = kind === 'ready' ? 'worker_unavailable' : 'internal_review_error';
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => done(new ReviewWorkerError('deadline_exceeded')), Math.max(0, Math.ceil(this.options.remainingMs())));
      const abort = () => done(new ReviewWorkerError('cancelled'));
      const exit = () => done(new ReviewWorkerError(failure));
      const message = (value: unknown) => {
        try {
          this.check();
          if (kind === 'ready') {
            if (!value || typeof value !== 'object' || Array.isArray(value)
              || !('type' in value) || value.type !== 'review_worker_ready' || Object.keys(value).length !== 1) {
              throw new ReviewWorkerError('worker_unavailable');
            }
            done(undefined, true as T); return;
          }
          const r = value as { id?: unknown; ok?: unknown; json?: unknown } | null;
          if (!r || r.id !== id || r.ok !== true || typeof r.json !== 'string' || Buffer.byteLength(r.json) > 262144) {
            throw new ReviewWorkerError('internal_review_error');
          }
          const result = JSON.parse(r.json);
          // Only the trusted worker performs full contract validation. Reject non-result
          // protocol messages here; bounded JSON decoding stays on the parent thread.
          if (!result || typeof result !== 'object' || Array.isArray(result)
            || (kind === 'finish' ? result.schema_version !== 'bp-mcp-review-0.2'
              || result.poc_only !== true || result.code_return_mode !== 'none'
              : !['reviewed', 'rejected', 'result_omitted'].includes(result.state))) {
            throw new ReviewWorkerError('internal_review_error');
          }
          done(undefined, result as T);
        } catch (error) { done(error instanceof ReviewWorkerError ? error : new ReviewWorkerError('internal_review_error')); }
      };
      const done = (error?: ReviewWorkerError, result?: T) => {
        if (settled) return;
        settled = true; this.interrupt = undefined;
        clearTimeout(timer);
        this.options.signal?.removeEventListener('abort', abort);
        worker.off('message', message); worker.off('messageerror', exit);
        worker.off('error', exit); worker.off('exit', exit);
        if (error) reject(error); else resolve(result!);
      };
      this.interrupt = () => done(new ReviewWorkerError('internal_review_error'));
      worker.on('message', message); worker.once('messageerror', exit);
      worker.once('error', exit); worker.once('exit', exit);
      this.options.signal?.addEventListener('abort', abort, { once: true });
      try { this.check(); if (kind !== 'ready') worker.postMessage({ id, kind, input }); }
      catch (error) { done(error instanceof ReviewWorkerError ? error : new ReviewWorkerError('internal_review_error')); }
    });
  }
  private async request<T>(kind: 'analyze' | 'finish', input: unknown): Promise<T> {
    if (this.busy) throw new ReviewWorkerError('internal_review_error');
    this.busy = true;
    try {
      this.check();
      if (!this.worker) {
        this.worker = this.startWorker();
        // Includes module/loader startup in the original remaining-time budget.
        await this.exchange<boolean>(this.worker, 'ready');
      }
      return await this.exchange<T>(this.worker, kind, input);
    } catch (error) {
      const fixed = error instanceof ReviewWorkerError ? error : new ReviewWorkerError('internal_review_error');
      await this.close();
      throw fixed;
    } finally { this.busy = false; }
  }
  analyze(input: unknown) { return this.request<AggregateReview['assets'][number]>('analyze', input); }
  finish(input: unknown) { return this.request<AggregateReview>('finish', input); }
  close(): Promise<void> {
    if (!this.closed) {
      const worker = this.worker;
      this.closed = worker ? worker.terminate().then(() => {
        worker.off('error', this.onFailure); worker.off('exit', this.onFailure);
        worker.stdout.destroy(); worker.stderr.destroy(); this.worker = undefined;
      }) : Promise.resolve();
      this.interrupt?.();
    }
    return this.closed;
  }
}
