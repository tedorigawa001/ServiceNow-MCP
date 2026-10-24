import { linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// R-2 binds the production-fixed loopback callback port, so two suite runs on one
// machine (e.g. parallel worktrees) cannot share it. Serialize them with an exclusive
// lock file published atomically by link(); a lock whose owner process is gone is reclaimed.
const LOCK = join(tmpdir(), 'servicenow-mcp-r2-loopback-18765.lock');
const ownerOf = (path: string) => { try { return Number(readFileSync(path, 'utf8')); } catch { return NaN; } };
const alive = (pid: number) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
};
const publish = (draft: string, path: string) => {
  try { linkSync(draft, path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; return false; }
};
// Only the holder of the separate reclaim lock may delete a stale lock, and it re-reads the
// owner while holding it. Without this, a contender that saw the dead owner could delete a
// lock another contender had just acquired, and both would bind the port.
function reclaimStale(draft: string, lock: string): boolean {
  const reclaim = `${lock}.reclaim`;
  if (!publish(draft, reclaim)) {
    // A reclaimer that died mid-reclaim is the only remaining (much narrower) unguarded case.
    if (!alive(ownerOf(reclaim))) rmSync(reclaim, { force: true });
    return false;
  }
  try {
    if (alive(ownerOf(lock))) return false;
    rmSync(lock, { force: true });
    return true;
  } finally { if (ownerOf(reclaim) === process.pid) rmSync(reclaim, { force: true }); }
}
export async function acquireFixedPortLock(timeoutMs: number, lock = LOCK): Promise<() => void> {
  const draft = `${lock}.${process.pid}`, until = performance.now() + timeoutMs;
  writeFileSync(draft, String(process.pid), { mode: 0o600 });
  try {
    for (;;) {
      if (publish(draft, lock)) break;
      const pid = ownerOf(lock);
      if (pid === process.pid) break;
      if (!alive(pid) && reclaimStale(draft, lock)) continue;
      if (performance.now() >= until) throw Error('TEST_FIXED_PORT_LOCK_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally { rmSync(draft, { force: true }); }
  return () => { if (ownerOf(lock) === process.pid) rmSync(lock, { force: true }); };
}
