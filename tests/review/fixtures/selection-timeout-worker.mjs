// Synthetic startup stall at the OS worker boundary. No network or private code.
import { workerData } from 'node:worker_threads';
Atomics.wait(new Int32Array(workerData.gate), 0, 0);
const { register } = await import('tsx/esm/api');
register({ tsconfig: false });
await import('../../../src/review/review-worker.ts');
