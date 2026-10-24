import { linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// R-2 binds the production-fixed loopback callback port, so two suite runs on one
// machine (e.g. parallel worktrees) cannot share it. Serialize them with an exclusive
// lock file published atomically by link(); a lock whose owner process is gone is reclaimed.
const LOCK = join(tmpdir(), 'servicenow-mcp-r2-loopback-18765.lock');
const owner = () => { try { return Number(readFileSync(LOCK, 'utf8')); } catch { return NaN; } };
const alive = (pid: number) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
};
export async function acquireFixedPortLock(timeoutMs: number): Promise<() => void> {
  const draft = `${LOCK}.${process.pid}`, until = performance.now() + timeoutMs;
  writeFileSync(draft, String(process.pid), { mode: 0o600 });
  try {
    for (;;) {
      try { linkSync(draft, LOCK); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const pid = owner();
      if (pid === process.pid) break;
      if (!alive(pid)) { rmSync(LOCK, { force: true }); continue; }
      if (performance.now() >= until) throw Error('TEST_FIXED_PORT_LOCK_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally { rmSync(draft, { force: true }); }
  return () => { if (owner() === process.pid) rmSync(LOCK, { force: true }); };
}
