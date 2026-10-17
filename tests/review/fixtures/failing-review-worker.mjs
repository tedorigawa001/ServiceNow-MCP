import { parentPort, workerData } from 'node:worker_threads';
if (workerData.mode === 'boot_throw') throw new Error('SYNTHETIC_PRIVATE_BOOT_ERROR');
if (workerData.mode === 'boot_exit') process.exit(0);
parentPort.on('message', message => {
  if (workerData.mode === 'throw') {
    console.log('SYNTHETIC_PRIVATE_STDOUT');
    console.error('SYNTHETIC_PRIVATE_STDERR');
    throw new Error('SYNTHETIC_PRIVATE_WORKER_ERROR');
  }
  if (workerData.mode === 'exit') process.exit(0);
  if (workerData.mode === 'malformed') parentPort.postMessage({ id: message.id, ok: true, json: '{"payload":"SYNTHETIC_PRIVATE_BODY"}' });
  if (workerData.mode === 'late') {
    setTimeout(() => parentPort.postMessage({ id: message.id, ok: true, json: '{}' }), 100);
  }
});
parentPort.postMessage({ type: 'review_worker_ready' });
