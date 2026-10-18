import { installR2FatalGuards } from '../../../src/review/r2-host-bootstrap.ts';
installR2FatalGuards();
const mode = process.argv[2];
if (mode === 'exception') setImmediate(() => { throw new Error('PRIVATE_FATAL_TOKEN'); });
else if (mode === 'rejection') setImmediate(() => { void Promise.reject(new Error('PRIVATE_FATAL_CODE')); });
else if (mode === 'poison') setImmediate(() => {
  const value = Object.create(null);
  for (const key of ['message', 'stack', 'cause', 'toString', 'toJSON'])
    Object.defineProperty(value, key, { get() { process.stdout.write('PRIVATE_GETTER'); throw 1; } });
  void Promise.reject(value);
});
else {
  const { startR2Host } = await import('../../../src/review/r2-host.ts');
  if (mode === 'slow-close' || mode === 'fail-close') {
    const { Server } = await import('node:http');
    const close = Server.prototype.close;
    Server.prototype.close = function(callback) {
      if (mode === 'fail-close') {
        // Native AbortSignal auto-close has no callback; fail the owned confirmation instead.
        if (callback) throw new Error('PRIVATE_OS_CLOSE');
        return close.call(this);
      }
      return close.call(this, () => { setTimeout(() => callback?.(), 10000); });
    };
  }
  await startR2Host(process.argv[3] ?? '/nonexistent/synthetic-manifest', {
    totalTimeoutMs: 4000, cleanupTimeoutMs: 500,
    fetch: async () => { throw new Error('PRIVATE_NETWORK_FORBIDDEN'); },
  });
}
