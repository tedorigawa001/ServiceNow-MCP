import { afterEach, expect, it, vi } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { EventEmitter, getEventListeners } from 'node:events';
import { rmSync, writeFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { approveAndRunR2Plan } from '../../src/review/r2-approved-launch.js';
import { approvedPlanFixture } from './fixtures/r2-approved-plan.js';
// Every run spawns the real tsx plan checker (and some the real host), which can take several
// seconds under parallel suite load; see r2-launcher-run.test.ts.
vi.setConfig({ testTimeout: 30_000 });
const dirs: string[] = [];
function plan() { const f = approvedPlanFixture(); dirs.push(f.dir); return f; }
function tty(reply: string, beforeReply = () => {}) {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false });
  let text = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    text += String(chunk); done();
    if (String(chunk).includes('Type APPROVE')) setImmediate(() => { beforeReply(); input.write(reply); });
  } }), { isTTY: true });
  return { input, output, text: () => text };
}
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it.each(['NO\n', 'APPROVE\nAPPROVE\n'])('never starts a host after denial: %s', async reply => {
  const f = plan(), terminal = tty(reply), spawnHost = vi.fn();
  const before = process.listeners('SIGINT');
  expect(await approveAndRunR2Plan(f.path, { tty: terminal, supervisor: { spawnHost } })).toMatchObject({ stage: 'approval', ok: false, code: 'approval_denied' });
  expect(spawnHost).not.toHaveBeenCalled(); expect(process.listeners('SIGINT')).toEqual(before);
  expect(terminal.text()).not.toMatch(/PRIVATE|service-now|manifest\.json/);
  expect(terminal.text()).toContain('"max_records":10'); expect(terminal.text()).toContain('"pdi":"not_verified"');
});
it('does not prompt or start a host for an expired manifest', async () => {
  const f = plan(), terminal = tty('APPROVE\n'), spawnHost = vi.fn();
  f.document.approval.expires_at = new Date(Date.now() - 1).toISOString(); writeFileSync(f.path, JSON.stringify(f.document));
  expect(await approveAndRunR2Plan(f.path, { tty: terminal, supervisor: { spawnHost } })).toMatchObject({ stage: 'check', ok: false, code: 'approval_expired' });
  expect(terminal.text()).toBe(''); expect(spawnHost).not.toHaveBeenCalled();
});

it.each(['changed', 'expired'] as const)('stops if the plan becomes %s during confirmation, without authorizing a host run', async kind => {
  const f = plan(), terminal = tty('APPROVE\n', () => {
    if (kind === 'changed') f.document.review.max_records++;
    else f.document.approval.expires_at = new Date(Date.now() - 1).toISOString();
    writeFileSync(f.path, JSON.stringify(f.document));
  });
  const result = await approveAndRunR2Plan(f.path, { tty: terminal });
  expect(result).toMatchObject({ stage: 'execution', report: { process_termination: 'confirmed', token_issuance: 'unknown' } });
  if (result.stage === 'execution') {
    if (kind === 'changed') expect(result.report.terminal_reason).toBe('protocol_error');
    else expect(['protocol_error', 'host_failed']).toContain(result.report.terminal_reason);
    expect(result.report).not.toHaveProperty('runner_receipt');
  }
});
it('hands signal ownership to supervisor once and binds grant to the exact confirmed digest', async () => {
  const f = plan(), terminal = tty('APPROVE\n'), root = new AbortController();
  const before = process.listeners('SIGINT').length;
  const child = Object.assign(new EventEmitter(), { pid: 12345, connected: true, exitCode: null, signalCode: null,
    kill: vi.fn(() => true), unref: vi.fn(), disconnect: vi.fn(),
    send: vi.fn((value: {type: string; digest?: string}, callback: (error: null) => void) => {
      if (value.type === 'run_grant_v2') {
        expect(value.digest).toBe(f.digest);
        queueMicrotask(() => {
          child.emit('message', { type: 'stopping' });
          child.emit('message', { type: 'finished', receipt: { ok: false, code: 'authorization_denied', cleanup: 'complete',
            mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false } });
        });
      }
      callback(null);
      if (value.type === 'finished_ack') queueMicrotask(() => { child.emit('exit', 10, null); child.emit('close', 10, null); });
      return true;
    }) });
  const result = await approveAndRunR2Plan(f.path, { tty: terminal, signal: root.signal, supervisor: { spawnHost: (_command, args) => {
    // Launcher handlers are gone; supervisor registers its handlers after spawn, not twice.
    expect(process.listeners('SIGINT')).toHaveLength(before);
    expect(args.at(-1)).toBe('--approval-bound');
    queueMicrotask(() => { expect(process.listeners('SIGINT')).toHaveLength(before + 1); child.emit('message', { type: 'prepared_v2', digest: f.digest }); });
    return child as unknown as ChildProcess;
  } } });
  expect(result).toMatchObject({ stage: 'execution', report: { cleanup: 'complete', token_issuance: 'not_attempted', terminal_reason: 'review_failed' } });
  expect(process.listeners('SIGINT')).toHaveLength(before); expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|service-now/);
});

it.each(['ready', 'summary'] as const)('stops on %s display failure, without raw diagnostics or a retry', async phase => {
  const f = plan(), input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false });
  let text = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    const line = String(chunk);
    if (line.includes('Type APPROVE')) { text += line; done(); setImmediate(() => input.write('APPROVE\n')); }
    else done(Error('PRIVATE_DISPLAY_ERROR'));
  } }), { isTTY: true });
  const child = Object.assign(new EventEmitter(), { pid: 12345, connected: true, exitCode: null, signalCode: null,
    kill: vi.fn(() => true), unref: vi.fn(), disconnect: vi.fn(),
    send: vi.fn((value: {type: string}, callback: (error: null) => void) => {
      callback(null);
      if (value.type === 'run_grant_v2') queueMicrotask(() => {
        if (phase === 'ready') child.emit('message', { type: 'ready' });
        else finish('authorization_denied');
      });
      if (value.type === 'stop') queueMicrotask(() => finish('cancelled'));
      if (value.type === 'finished_ack') queueMicrotask(() => { child.emit('exit', phase === 'ready' ? 130 : 10, null); child.emit('close'); });
      return true;
    }) });
  const finish = (code: string) => {
    child.emit('message', { type: 'stopping' });
    child.emit('message', { type: 'finished', receipt: { ok: false, code, cleanup: 'complete', mcpListed: false,
      tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false } });
  };
  const spawnHost = vi.fn(() => { queueMicrotask(() => child.emit('message', { type: 'prepared_v2', digest: f.digest })); return child as unknown as ChildProcess; });
  const result = await approveAndRunR2Plan(f.path, { tty: { input, output }, supervisor: { spawnHost } });
  expect(result).toMatchObject({ stage: 'display', ok: false, code: 'display_failed', report: {
    process_termination: 'confirmed', cleanup: 'complete', terminal_reason: phase === 'ready' ? 'cancelled' : 'review_failed' } });
  expect(spawnHost).toHaveBeenCalledTimes(1);
  expect(child.send.mock.calls.filter(([v]) => v.type === 'stop')).toHaveLength(phase === 'ready' ? 1 : 0);
  expect(text).not.toMatch(/PRIVATE|exit-summary|content|script/);
});
