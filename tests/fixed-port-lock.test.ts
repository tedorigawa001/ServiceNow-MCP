import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acquireFixedPortLock } from './helpers/fixed-port-lock.js';

// Private lock path: these tests must never touch the real lock that r2-loopback holds.
let dir: string, lock: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fixed-port-lock-')); lock = join(dir, 'port.lock'); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid!;
// A live process that is not this one; the vitest runner itself is the parent.
const otherLivePid = () => process.ppid;
const owner = (path: string) => Number(readFileSync(path, 'utf8'));

it('acquires a free lock and releases only its own', async () => {
  const release = await acquireFixedPortLock(1000, lock);
  expect(owner(lock)).toBe(process.pid);
  release();
  expect(existsSync(lock)).toBe(false);
});

it('reclaims a lock whose owner process has exited', async () => {
  writeFileSync(lock, String(deadPid()));
  const release = await acquireFixedPortLock(1000, lock);
  expect(owner(lock)).toBe(process.pid);
  expect(existsSync(`${lock}.reclaim`)).toBe(false);
  release();
});

it('never deletes a stale lock while another live process holds the reclaim lock', async () => {
  const stale = deadPid();
  writeFileSync(lock, String(stale));
  writeFileSync(`${lock}.reclaim`, String(otherLivePid()));
  await expect(acquireFixedPortLock(300, lock)).rejects.toThrow('TEST_FIXED_PORT_LOCK_TIMEOUT');
  // The other reclaimer owns the decision; the stale lock is left for it.
  expect(owner(lock)).toBe(stale);
  expect(owner(`${lock}.reclaim`)).toBe(otherLivePid());
});

it('never deletes a lock held by a live process and leaves no reclaim lock behind', async () => {
  writeFileSync(lock, String(otherLivePid()));
  await expect(acquireFixedPortLock(300, lock)).rejects.toThrow('TEST_FIXED_PORT_LOCK_TIMEOUT');
  expect(owner(lock)).toBe(otherLivePid());
  expect(existsSync(`${lock}.reclaim`)).toBe(false);
});

it('recovers from a reclaimer that died while holding the reclaim lock', async () => {
  writeFileSync(lock, String(deadPid()));
  writeFileSync(`${lock}.reclaim`, String(deadPid()));
  const release = await acquireFixedPortLock(1000, lock);
  expect(owner(lock)).toBe(process.pid);
  expect(existsSync(`${lock}.reclaim`)).toBe(false);
  release();
});
