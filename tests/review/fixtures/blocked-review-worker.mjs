// Deliberately non-cooperative synthetic CPU, never used by production code.
import { parentPort, workerData } from 'node:worker_threads';
parentPort.on('message', () => {
  Atomics.store(new Int32Array(workerData.started), 0, 1);
  for (;;) { /* CPU ignores all further messages and cancellation. */ }
});
parentPort.postMessage({ type: 'review_worker_ready' });
