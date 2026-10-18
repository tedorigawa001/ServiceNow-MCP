/** Repository-only dedicated entry; fixed .js import after fatal guards. No public CLI. */
import { installR2FatalGuards } from './r2-host-bootstrap.js';
installR2FatalGuards();
void import('./r2-host.js').then(async ({ startR2Host }) => {
  if (process.argv.length !== 3 && !(process.argv.length === 4 && process.argv[3] === '--approval-bound')) process.exit(10);
  await startR2Host(process.argv[2], { requireApprovedDigest: process.argv.length === 4 });
}).catch(() => { process.exit(70); });
