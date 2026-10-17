import { Worker } from 'node:worker_threads';
import type { ReviewWorkerFactory } from '../../../src/review/worker-supervisor.js';

export const sourceWorkerFactory: ReviewWorkerFactory = (_url, options) =>
  new Worker(new URL('./review-worker-bootstrap.mjs', import.meta.url), options);
