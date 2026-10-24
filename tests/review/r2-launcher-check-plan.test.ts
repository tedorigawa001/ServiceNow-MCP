import { afterEach, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import { rmSync } from 'node:fs';
import { approvedPlanFixture } from './fixtures/r2-approved-plan.js';
import { runR2CheckPlanEntry } from '../../src/review/r2-launcher-check-plan.js';
import { selectR2EntryExitCode } from '../../src/review/r2-entry-terminal.js';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function plan() { const f = approvedPlanFixture(); dirs.push(f.dir); return f; }
function terminal() {
  let text = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, callback) { text += String(chunk); callback(); } }), { isTTY: true });
  return { output, text: () => text };
}
it('defaults to offline verification and emits only the limited plan receipt', async () => {
  const f = plan(), tty = terminal();
  const result = await runR2CheckPlanEntry([f.path], { output: tty.output });
  expect(selectR2EntryExitCode(result)).toBe(0);
  expect(JSON.parse(tty.text())).toMatchObject({ mode: 'check-plan', status: 'offline_valid', pdi: 'not_verified' });
  expect(tty.text()).not.toMatch(/PRIVATE|service-now|expectedUser|clientId|update_set_sys_id/);
});
it('accepts the explicit check-plan spelling without treating it as a path', async () => {
  const f = plan(), tty = terminal();
  expect(selectR2EntryExitCode(await runR2CheckPlanEntry(['check-plan', f.path], { output: tty.output }))).toBe(0);
});
it.each([[], ['run', '/PRIVATE_PLAN'], ['--yes'], ['relative.json'], ['check-plan'], ['check-plan', '/PRIVATE_PLAN', '--yes'],
  ['/PRIVATE_PLAN', '/OTHER'], ['/tmp/../PRIVATE_PLAN'], ['/tmp/./PRIVATE_PLAN'], ['/tmp//PRIVATE_PLAN'], ['/PRIVATE\0PLAN'],
  ['/' + 'x'.repeat(4096)], ['--token=PRIVATE_TOKEN'], ['--digest=' + 'a'.repeat(64)]].map((args, id) => ({ args, id })))(
  'refuses unsupported arguments without echoing them: $id', async ({ args }) => {
    const tty = terminal();
    const spawn = vi.spyOn(cp, 'spawn').mockImplementation(() => { throw Error('PRIVATE_FORBIDDEN'); });
    syncBuiltinESMExports();
    expect(selectR2EntryExitCode(await runR2CheckPlanEntry(args, { output: tty.output }))).toBe(64);
    expect(spawn).not.toHaveBeenCalled();
    expect(tty.text()).toMatch(/^Usage:/);
    expect(tty.text()).not.toMatch(/PRIVATE|OTHER|aaaaa|xxxxx/);
  });
it('refuses a non-TTY sink before starting even the offline checker and never falls back', async () => {
  const tty = terminal(); tty.output.isTTY = false;
  const spawn = vi.spyOn(cp, 'spawn').mockImplementation(() => { throw Error('PRIVATE_FORBIDDEN_SPAWN'); });
  syncBuiltinESMExports();
  expect(selectR2EntryExitCode(await runR2CheckPlanEntry(['/PRIVATE_MISSING'], { output: tty.output }))).toBe(81);
  expect(spawn).not.toHaveBeenCalled(); expect(tty.text()).toBe('');
});
it('bounds a non-cooperative output without waiting forever or retrying', async () => {
  vi.useFakeTimers();
  const output = Object.assign(new Writable({ write() {} }), { isTTY: true });
  try {
    let settled = false;
    const task = runR2CheckPlanEntry([], { output, displayTimeoutMs: 20 });
    void task.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(21);
    expect(settled).toBe(true);
    expect(selectR2EntryExitCode(await task)).toBe(81);
  } finally { vi.useRealTimers(); }
});
it.each(['throw', 'callback', 'event', 'close', 'late'] as const)('stops on %s display failure and absorbs late native errors', async kind => {
  let lateFailed!: () => void; const late = new Promise<void>(resolve => { lateFailed = resolve; });
  const output = Object.assign(new Writable({ write(_chunk, _encoding, callback) {
    if (kind === 'throw') throw Error('PRIVATE_STREAM');
    if (kind === 'callback') { callback(Error('PRIVATE_STREAM')); return; }
    if (kind === 'event') { this.emit('error', Error('PRIVATE_STREAM')); return; }
    if (kind === 'close') { this.emit('close'); return; }
    setTimeout(() => { callback(Error('PRIVATE_LATE_STREAM')); lateFailed(); }, 40);
  } }), { isTTY: true });
  expect(selectR2EntryExitCode(await runR2CheckPlanEntry([], { output, displayTimeoutMs: 10 }))).toBe(81);
  // The error guard is released on the turn after the (possibly late) write callback; wait for
  // that event rather than a wall-clock margin that a stalled timer phase can overtake.
  if (kind === 'late') await late;
  await new Promise(resolve => setImmediate(resolve));
  if (['throw', 'callback', 'late'].includes(kind)) expect(output.listenerCount('error')).toBe(0);
});
it('rejects display budget expansion before file access/spawn and releases its signal subscriptions', async () => {
  const f = plan(), tty = terminal(), root = new AbortController();
  const int = process.listenerCount('SIGINT'), term = process.listenerCount('SIGTERM');
  const spawn = vi.spyOn(cp, 'spawn').mockImplementation(() => { throw Error('PRIVATE_SPAWN'); });
  syncBuiltinESMExports();
  for (const displayTimeoutMs of [0, 1001, NaN, 1.5])
    expect(selectR2EntryExitCode(await runR2CheckPlanEntry([f.path], { output: tty.output, signal: root.signal, displayTimeoutMs }))).toBe(81);
  expect(spawn).not.toHaveBeenCalled();
  expect(process.listenerCount('SIGINT')).toBe(int); expect(process.listenerCount('SIGTERM')).toBe(term);
});
it('does not adopt callback success if the native error arrives in its notification turn', async () => {
  const output = Object.assign(new Writable({ write() {} }), { isTTY: true });
  Object.defineProperty(output, 'write', { value: (_text: string, callback: () => void) => {
    callback(); queueMicrotask(() => { output.emit('error', Error('PRIVATE_POST_CALLBACK')); }); return true;
  } });
  expect(selectR2EntryExitCode(await runR2CheckPlanEntry([], { output }))).toBe(81);
});
it('reports pre-cancellation without spawning a checker and restores the single signal owner', async () => {
  const tty = terminal(), root = new AbortController(); root.abort();
  const spawn = vi.spyOn(cp, 'spawn').mockImplementation(() => { throw Error('PRIVATE_FORBIDDEN'); });
  syncBuiltinESMExports();
  const int = process.listenerCount('SIGINT'), term = process.listenerCount('SIGTERM');
  const result = await runR2CheckPlanEntry(['/PRIVATE_PLAN'], { output: tty.output, signal: root.signal });
  expect(selectR2EntryExitCode(result)).toBe(130); expect(spawn).not.toHaveBeenCalled();
  expect(JSON.parse(tty.text())).toMatchObject({ code: 'checker_cancelled' });
  expect(process.listenerCount('SIGINT')).toBe(int); expect(process.listenerCount('SIGTERM')).toBe(term);
});
it('notifies the bootstrap of unconfirmed termination before a failing notice can hide it', async () => {
  vi.useFakeTimers();
  const known = vi.fn();
  const output = Object.assign(new Writable({ write() { expect(known).toHaveBeenCalledTimes(1); } }), { isTTY: true });
  const child = Object.assign(new EventEmitter(), { connected: true, exitCode: null, signalCode: null,
    disconnect: vi.fn(), unref: vi.fn(), kill: vi.fn() });
  try {
    const task = runR2CheckPlanEntry(['/PRIVATE_PLAN'], { output, displayTimeoutMs: 20,
      checker: { timeoutMs: 1, observationMs: 1, spawnChecker: () => child as unknown as ChildProcess }, onTerminationUnconfirmed: known });
    await vi.advanceTimersByTimeAsync(3);
    expect(known).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21);
    expect(selectR2EntryExitCode(await task)).toBe(73);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
it('displays the same cancelled receipt it returns when cancellation lands right after a valid check', async () => {
  const f = plan(), tty = terminal(), root = new AbortController();
  const { checkR2PlanOffline } = await import('../../src/review/r2-plan-check.js');
  const receipt = await checkR2PlanOffline(f.path);
  expect(receipt.status).toBe('offline_valid');
  const child = Object.assign(new EventEmitter(), { connected: false, exitCode: null as number | null, signalCode: null,
    disconnect: vi.fn(), unref: vi.fn(), kill: vi.fn() });
  const result = await runR2CheckPlanEntry([f.path], { output: tty.output, signal: root.signal, checker: { spawnChecker: () => {
    queueMicrotask(() => {
      child.emit('message', receipt); child.exitCode = 0; child.emit('exit', 0, null); child.emit('close', 0, null);
      root.abort(); // Lands after the checker settled but before the entry renders its notice.
    });
    return child as unknown as ChildProcess;
  } } });
  expect(result).toMatchObject({ mode: 'check-plan', result: { status: 'rejected', code: 'checker_cancelled' } });
  expect(selectR2EntryExitCode(result)).toBe(130);
  expect(JSON.parse(tty.text())).toMatchObject({ status: 'rejected', code: 'checker_cancelled' });
  expect(tty.text()).not.toContain('offline_valid');
});
