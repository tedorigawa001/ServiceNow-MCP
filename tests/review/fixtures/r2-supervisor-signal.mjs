import { spawn } from 'node:child_process';
import { superviseR2Host } from '../../../src/review/r2-supervisor.ts';
process.once('SIGINT', () => { process.send({ stopped: true }); });
const report = await superviseR2Host('/nonexistent/synthetic-manifest', {
  totalTimeoutMs: 4000, cleanupTimeoutMs: 1000,
  spawnHost: (command, _args, options) => spawn(command, ['tests/review/fixtures/r2-supervised-host.mjs', 'block'], options),
  onReady: () => { process.send({ ready: true }); },
});
process.send({ done: true, report }, () => { process.disconnect(); });
