// Development-only TypeScript worker entry; production uses compiled review-worker.js.
import { register } from 'tsx/esm/api';
import { parentPort, workerData } from 'node:worker_threads';
register();
if (workerData?.blockKind) {
  let matched = 0;
  const on = parentPort.on;
  parentPort.on = function (event, listener) {
    return on.call(this, event, event === 'message' ? message => {
      if (message.kind === workerData.blockKind && ++matched >= (workerData.blockAfter ?? 1)) {
        Atomics.store(new Int32Array(workerData.started), 0, 1);
        for (;;) { /* Non-cooperative synthetic analysis/finalization. */ }
      }
      listener(message);
    } : listener);
  };
}
await import('../../../src/review/review-worker.ts');
