/** Fixed internal checker entry. No host import, listener, browser, network or public CLI. */
import { installR2FatalGuards } from './r2-host-bootstrap.js';
installR2FatalGuards();
void import('./r2-plan-check.js').then(async ({ checkR2PlanOffline }) => {
  if (process.argv.length !== 3 || !process.send || !process.connected) process.exit(10);
  const result = await checkR2PlanOffline(process.argv[2]);
  process.send!(result, error => {
    if (error) process.exit(10);
    process.exitCode = result.status === 'offline_valid' ? 0 : 10;
    process.disconnect();
  });
}).catch(() => { process.exit(70); });
