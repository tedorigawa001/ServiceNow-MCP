// Independent control flags only. Never selected by a runtime entry.
import { parentPort, workerData } from 'node:worker_threads';
import { register } from 'tsx/esm/api';
const entered = new Int32Array(workerData.entered), gate = new Int32Array(workerData.gate);
const block = () => { Atomics.store(entered, 0, 1); Atomics.notify(entered, 0); Atomics.wait(gate, 0, 0); };
if (workerData.phase === 'ready') block();
register({ tsconfig: false });
if (workerData.phase === 'finish') {
  const on = parentPort.on;
  parentPort.on = function (event, listener) {
    return on.call(this, event, event === 'message' ? value => {
      if (value.kind === 'finish') block();
      listener(value);
    } : listener);
  };
}
await import('../../../src/review/review-worker.ts');
