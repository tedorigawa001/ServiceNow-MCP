/** Fixed repository-only entry. No public bin, output file, token input or browser launch. */
import { installR2FatalGuards } from './r2-host-bootstrap.js';
installR2FatalGuards();
void import('./r2-supervisor.js').then(async ({ superviseR2Host }) => {
  if (process.argv.length !== 3) process.exit(10);
  const report = await superviseR2Host(process.argv[2]);
  process.exitCode = report.terminal_reason === 'completed' ? 0
    : report.terminal_reason === 'termination_unconfirmed' ? 73
    : report.terminal_reason === 'deadline_exceeded' ? 124
    : report.terminal_reason === 'cancelled' ? 130
    : report.terminal_reason === 'forced_stop' ? 72
    : report.terminal_reason === 'cleanup_incomplete' ? 71
    : report.terminal_reason === 'fatal' ? 70 : 10;
}).catch(() => { process.exit(70); });
