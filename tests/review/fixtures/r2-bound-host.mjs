import { installR2FatalGuards } from '../../../src/review/r2-host-bootstrap.ts';
installR2FatalGuards();
import { Server } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
// This peer is exclusively for pre-bind rejection. A bind would change the expected receipt.
Server.prototype.listen = () => { throw Error('PRIVATE_BIND_FORBIDDEN'); };
syncBuiltinESMExports();
if (process.argv[3] === 'expire-after-prepared') process.prependListener('message', value => {
  if (value?.type === 'run_grant_v2') { const future = Date.now() + 7200000; Date.now = () => future; }
});
const { startR2Host } = await import('../../../src/review/r2-host.ts');
await startR2Host(process.argv[2], { requireApprovedDigest: true, totalTimeoutMs: 4000, cleanupTimeoutMs: 500,
  fetch: async () => { throw Error('PRIVATE_NETWORK_FORBIDDEN'); } });
