import { parentPort, workerData } from 'node:worker_threads';
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
